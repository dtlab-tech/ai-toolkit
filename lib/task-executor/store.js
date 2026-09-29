'use strict';

// Executor state protocol (FTR-018, INFRA-TASK-BE-01).
//
// This module owns the versioned on-disk state protocol for the deterministic
// task executor: a `State` class (schema validation + pure, immutable mutation
// methods) and the atomic write / readback / recovery primitives for the
// per-run state document, plus immutable receipt and intent files.
//
// Layout under an execution root (<absolute-common-git-dir>/ai-toolkit/execution/,
// resolved by the caller — this module does not discover Git directories):
//   runs/<runId>/state.json           — current validated generation
//   runs/<runId>/state.previous.json  — last validated prior generation
//   runs/<runId>/receipts/<id>.json   — immutable activity result/usage receipts
//   runs/<runId>/intents/<id>.json    — immutable checkpoint/integration descriptors
//
// No LLM, scheduling, or Git logic lives here — see lib/task-executor/plan.js,
// ownership.js and git.js for those responsibilities.

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ── Schema vocabulary ────────────────────────────────────────────────────────

const PROTOCOL_VERSION = 1;

const RUN_STATUSES = ['running', 'stopping', 'paused', 'blocked', 'completed', 'superseded'];

const TASK_STATUSES = ['pending', 'active', 'checkpointed', 'integrated', 'skipped', 'blocked'];

const ATTEMPT_STAGES = [
  'prepared', 'dispatching', 'running', 'implementation-recorded',
  'verified', 'reviewed', 'checkpoint-prepared', 'committed', 'integrated',
  'failed', 'interrupted',
];

// Excludes ':' deliberately: it is a reserved character in Windows filenames
// (and in NTFS alternate data stream syntax), so it cannot appear in an id
// that is used verbatim as a filename. Ledger agent keys such as
// "executor:<runId>:<taskId>:<kind>" are not valid store.js ids as-is —
// callers must substitute a filesystem-safe separator (e.g. "-").
const SAFE_ID_PATTERN = /^[A-Za-z0-9_.-]+$/;

// ── Internal helpers ─────────────────────────────────────────────────────────

function _err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function _validateSafeId(id, label) {
  if (typeof id !== 'string' || id.length === 0 || !SAFE_ID_PATTERN.test(id)) {
    throw _err(
      'STATE_VALIDATION_ERROR',
      label + ': id must be a non-empty string matching ' + SAFE_ID_PATTERN + ', got ' + JSON.stringify(id)
    );
  }
}

function _sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map(_sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    Object.keys(value).sort().forEach(function (key) {
      sorted[key] = _sortKeysDeep(value[key]);
    });
    return sorted;
  }
  return value;
}

function _stableStringify(value) {
  return JSON.stringify(_sortKeysDeep(value));
}

function _sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function _ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function _fsyncDirSync(dir) {
  let dfd;
  try {
    dfd = fs.openSync(dir, 'r');
    fs.fsyncSync(dfd);
  } catch (_) {
    // Directory-handle fsync is not supported on every platform/filesystem
    // (notably Windows). Best-effort only — file fsync + rename already
    // happened before this call.
  } finally {
    if (dfd !== undefined) {
      try { fs.closeSync(dfd); } catch (_) {}
    }
  }
}

// Same-directory exclusive temp file, complete write, flush, close, rename,
// directory flush where supported. Mirrors the atomic-write protocol used by
// lib/execution-ledger.js.
function _atomicWriteFileSync(filePath, contents) {
  const dir = path.dirname(filePath);
  _ensureDirSync(dir);
  const tmpName = '.' + path.basename(filePath) + '.tmp-' + process.pid + '-' +
    Date.now() + '-' + crypto.randomBytes(4).toString('hex');
  const tmpPath = path.join(dir, tmpName);

  let fd;
  try {
    fd = fs.openSync(tmpPath, 'w');
    fs.writeSync(fd, contents);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
  } catch (err) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (_) {}
    }
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    throw err;
  }

  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    throw err;
  }

  _fsyncDirSync(dir);
}

function _executionPaths(executionRoot, runId) {
  _validateSafeId(runId, '_executionPaths');
  const runDir = path.join(executionRoot, 'runs', runId);
  return {
    runDir:            runDir,
    stateFile:         path.join(runDir, 'state.json'),
    previousStateFile: path.join(runDir, 'state.previous.json'),
    receiptsDir:       path.join(runDir, 'receipts'),
    intentsDir:        path.join(runDir, 'intents'),
  };
}

function _listJsonIds(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter(function (name) { return name.endsWith('.json') && !name.startsWith('.'); })
    .map(function (name) { return name.slice(0, -'.json'.length); })
    .sort();
}

// ── State schema and pure mutation methods ──────────────────────────────────

class State {
  constructor(fields) {
    fields = fields || {};
    this.protocolVersion     = fields.protocolVersion != null ? fields.protocolVersion : PROTOCOL_VERSION;
    this.runId               = fields.runId;
    this.featureId           = fields.featureId;
    this.repo                = fields.repo;
    this.commonDir           = fields.commonDir;
    this.featureRef          = fields.featureRef;
    this.baseSha             = fields.baseSha;
    this.expectedHead        = fields.expectedHead !== undefined ? fields.expectedHead : null;
    this.planDigest          = fields.planDigest;
    this.contextHashes       = fields.contextHashes || {};
    this.config              = fields.config || {};
    this.generation          = fields.generation != null ? fields.generation : 0;
    this.previousDigest      = fields.previousDigest !== undefined ? fields.previousDigest : null;
    this.runStatus           = fields.runStatus || 'running';
    this.tasks               = fields.tasks || {};
    this.dispatchSequence    = fields.dispatchSequence || [];
    this.integrationSequence = fields.integrationSequence || [];
    this.receiptRefs         = fields.receiptRefs || [];

    const result = State.validate(this.toJSON());
    if (!result.valid) {
      throw _err('STATE_VALIDATION_ERROR', 'State: schema validation failed — ' + result.errors.join('; '));
    }
  }

  toJSON() {
    return {
      protocolVersion:     this.protocolVersion,
      runId:               this.runId,
      featureId:           this.featureId,
      repo:                this.repo,
      commonDir:           this.commonDir,
      featureRef:          this.featureRef,
      baseSha:             this.baseSha,
      expectedHead:        this.expectedHead,
      planDigest:          this.planDigest,
      contextHashes:       this.contextHashes,
      config:              this.config,
      generation:          this.generation,
      previousDigest:      this.previousDigest,
      runStatus:           this.runStatus,
      tasks:               this.tasks,
      dispatchSequence:    this.dispatchSequence,
      integrationSequence: this.integrationSequence,
      receiptRefs:         this.receiptRefs,
    };
  }

  computeChecksum() {
    return _sha256Hex(_stableStringify(this.toJSON()));
  }

  // Returns a new State with the given field overrides, generation incremented
  // and previousDigest bound to this instance's checksum. `this` is untouched —
  // every mutation method is pure so callers cannot lose track of a prior
  // in-memory generation by accident.
  _clone(overrides) {
    const merged = Object.assign({}, this.toJSON(), overrides, {
      generation:     this.generation + 1,
      previousDigest: this.computeChecksum(),
    });
    return new State(merged);
  }

  addTask(taskId, options) {
    _validateSafeId(taskId, 'addTask');
    if (Object.prototype.hasOwnProperty.call(this.tasks, taskId)) {
      throw _err('STATE_TASK_EXISTS', 'addTask: task "' + taskId + '" already exists');
    }
    options = options || {};
    const dependencies = Array.isArray(options.dependencies) ? options.dependencies.slice() : [];
    const task = { taskId: taskId, dependencies: dependencies, status: 'pending', attempts: [] };
    const tasks = Object.assign({}, this.tasks, {});
    tasks[taskId] = task;
    return this._clone({ tasks: tasks });
  }

  _requireTask(taskId, caller) {
    const task = this.tasks[taskId];
    if (!task) {
      throw _err('STATE_TASK_NOT_FOUND', caller + ': task "' + taskId + '" not found');
    }
    return task;
  }

  setTaskStatus(taskId, status) {
    const task = this._requireTask(taskId, 'setTaskStatus');
    if (TASK_STATUSES.indexOf(status) === -1) {
      throw _err('STATE_VALIDATION_ERROR', 'setTaskStatus: invalid status "' + status + '"; allowed: ' + TASK_STATUSES.join(', '));
    }
    const tasks = Object.assign({}, this.tasks);
    tasks[taskId] = Object.assign({}, task, { status: status });
    return this._clone({ tasks: tasks });
  }

  addAttempt(taskId, attemptFields) {
    const task = this._requireTask(taskId, 'addAttempt');
    attemptFields = attemptFields || {};
    const number = task.attempts.length + 1;
    const stage = attemptFields.stage || 'prepared';
    if (ATTEMPT_STAGES.indexOf(stage) === -1) {
      throw _err('STATE_VALIDATION_ERROR', 'addAttempt: invalid stage "' + stage + '"; allowed: ' + ATTEMPT_STAGES.join(', '));
    }
    const attempt = Object.assign({
      number:           number,
      id:               taskId + '#' + number,
      baseSha:          null,
      worktreeRef:      null,
      processIdentity:  null,
      verificationRefs: [],
      reviewRefs:       [],
      intentIds:        [],
      originalSha:      null,
      integratedSha:    null,
      terminalReason:   null,
    }, attemptFields, { number: number, stage: stage });

    const tasks = Object.assign({}, this.tasks);
    tasks[taskId] = Object.assign({}, task, { attempts: task.attempts.concat([attempt]) });
    return this._clone({ tasks: tasks });
  }

  updateAttempt(taskId, attemptNumber, patch) {
    const task = this._requireTask(taskId, 'updateAttempt');
    const idx = task.attempts.findIndex(function (a) { return a.number === attemptNumber; });
    if (idx === -1) {
      throw _err('STATE_ATTEMPT_NOT_FOUND', 'updateAttempt: attempt ' + attemptNumber + ' not found for task "' + taskId + '"');
    }
    patch = patch || {};
    if (patch.stage !== undefined && ATTEMPT_STAGES.indexOf(patch.stage) === -1) {
      throw _err('STATE_VALIDATION_ERROR', 'updateAttempt: invalid stage "' + patch.stage + '"; allowed: ' + ATTEMPT_STAGES.join(', '));
    }
    const attempts = task.attempts.slice();
    attempts[idx] = Object.assign({}, attempts[idx], patch, { number: attemptNumber });

    const tasks = Object.assign({}, this.tasks);
    tasks[taskId] = Object.assign({}, task, { attempts: attempts });
    return this._clone({ tasks: tasks });
  }

  recordDispatch(taskId, attemptNumber) {
    this._requireTask(taskId, 'recordDispatch');
    const seq = this.dispatchSequence.length + 1;
    const entry = { seq: seq, taskId: taskId, attemptNumber: attemptNumber, at: new Date().toISOString() };
    return this._clone({ dispatchSequence: this.dispatchSequence.concat([entry]) });
  }

  recordIntegration(taskId, attemptNumber) {
    this._requireTask(taskId, 'recordIntegration');
    const seq = this.integrationSequence.length + 1;
    const entry = { seq: seq, taskId: taskId, attemptNumber: attemptNumber, at: new Date().toISOString() };
    return this._clone({ integrationSequence: this.integrationSequence.concat([entry]) });
  }

  setRunStatus(status) {
    if (RUN_STATUSES.indexOf(status) === -1) {
      throw _err('STATE_VALIDATION_ERROR', 'setRunStatus: invalid status "' + status + '"; allowed: ' + RUN_STATUSES.join(', '));
    }
    return this._clone({ runStatus: status });
  }

  // Persists a stop request (US-07-TASK-BE-02): moves runStatus to
  // 'stopping' (already part of RUN_STATUSES for exactly this purpose — no
  // new status is invented) and durably records the requested mode inside
  // `config`, the existing free-form state field also used for maxConcurrency/
  // claudePath/taskTimeoutMs/agentBudgetUsd. A dedicated top-level field was
  // considered and rejected: `config` already carries exactly this kind of
  // "caller-supplied, not itself schema-critical" run-level setting, and
  // reusing it avoids widening State.validate/State's constructor signature
  // for one narrow addition. Both the status transition and the config
  // update happen in this ONE _clone call (one generation bump, one caller
  // writeState) — mirrors every other single-purpose mutation method on this
  // class (setTaskStatus, addReceiptRef, ...).
  requestStop(mode) {
    if (mode !== 'graceful' && mode !== 'immediate') {
      throw _err('STATE_VALIDATION_ERROR', 'requestStop: mode must be "graceful" or "immediate", got ' + JSON.stringify(mode));
    }
    return this._clone({
      runStatus: 'stopping',
      config: Object.assign({}, this.config, {
        stopRequest: { mode: mode, requestedAt: new Date().toISOString() },
      }),
    });
  }

  addReceiptRef(receiptId) {
    if (this.receiptRefs.indexOf(receiptId) !== -1) {
      return this; // idempotent no-op — no generation bump for a repeated reference
    }
    return this._clone({ receiptRefs: this.receiptRefs.concat([receiptId]) });
  }

  static validate(obj) {
    const errors = [];
    if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
      return { valid: false, errors: ['state must be a plain object'] };
    }

    function req(field, type) {
      const value = obj[field];
      if (value === undefined) { errors.push('missing required field "' + field + '"'); return; }
      if (type === 'string' && typeof value !== 'string') errors.push('field "' + field + '" must be a string');
      if (type === 'number' && typeof value !== 'number') errors.push('field "' + field + '" must be a number');
      if (type === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) errors.push('field "' + field + '" must be an object');
      if (type === 'array' && !Array.isArray(value)) errors.push('field "' + field + '" must be an array');
    }

    req('protocolVersion', 'number');
    req('runId', 'string');
    req('featureId', 'string');
    req('repo', 'string');
    req('commonDir', 'string');
    req('featureRef', 'string');
    req('baseSha', 'string');
    req('planDigest', 'string');
    req('contextHashes', 'object');
    req('config', 'object');
    req('generation', 'number');
    req('runStatus', 'string');
    req('tasks', 'object');
    req('dispatchSequence', 'array');
    req('integrationSequence', 'array');
    req('receiptRefs', 'array');

    if (obj.expectedHead !== undefined && obj.expectedHead !== null && typeof obj.expectedHead !== 'string') {
      errors.push('field "expectedHead" must be a string or null');
    }
    if (obj.previousDigest !== undefined && obj.previousDigest !== null && typeof obj.previousDigest !== 'string') {
      errors.push('field "previousDigest" must be a string or null');
    }
    if (typeof obj.generation === 'number' && (!Number.isInteger(obj.generation) || obj.generation < 0)) {
      errors.push('field "generation" must be a non-negative integer');
    }
    if (typeof obj.runStatus === 'string' && RUN_STATUSES.indexOf(obj.runStatus) === -1) {
      errors.push('field "runStatus" has invalid value "' + obj.runStatus + '"; allowed: ' + RUN_STATUSES.join(', '));
    }

    if (obj.tasks && typeof obj.tasks === 'object' && !Array.isArray(obj.tasks)) {
      Object.keys(obj.tasks).forEach(function (taskId) {
        const task = obj.tasks[taskId];
        const prefix = 'task "' + taskId + '": ';
        if (task == null || typeof task !== 'object') { errors.push(prefix + 'must be an object'); return; }
        if (task.taskId !== taskId) errors.push(prefix + 'taskId field must equal its map key');
        if (!Array.isArray(task.dependencies)) errors.push(prefix + 'dependencies must be an array');
        if (TASK_STATUSES.indexOf(task.status) === -1) errors.push(prefix + 'invalid status "' + task.status + '"');
        if (!Array.isArray(task.attempts)) { errors.push(prefix + 'attempts must be an array'); return; }
        task.attempts.forEach(function (attempt, i) {
          const aprefix = prefix + 'attempt[' + i + ']: ';
          if (attempt == null || typeof attempt !== 'object') { errors.push(aprefix + 'must be an object'); return; }
          if (typeof attempt.number !== 'number' || !Number.isInteger(attempt.number) || attempt.number < 1) {
            errors.push(aprefix + 'number must be a positive integer');
          }
          if (typeof attempt.id !== 'string' || attempt.id.length === 0) {
            errors.push(aprefix + 'id must be a non-empty string');
          }
          if (ATTEMPT_STAGES.indexOf(attempt.stage) === -1) {
            errors.push(aprefix + 'invalid stage "' + attempt.stage + '"');
          }
        });
      });
    }

    return { valid: errors.length === 0, errors: errors };
  }

  static create(fields) {
    return new State(fields);
  }

  static fromJSON(obj) {
    return new State(obj);
  }
}

// ── State file: atomic write, readback, recovery ────────────────────────────

function _loadStateFile(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { ok: false, reason: 'missing', error: err };
    return { ok: false, reason: 'read-error', error: err };
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    return { ok: false, reason: 'corrupt-json', error: err };
  }

  if (payload == null || typeof payload !== 'object' || typeof payload.checksum !== 'string' || payload.state == null) {
    return { ok: false, reason: 'malformed-envelope', error: new Error('state envelope missing "checksum"/"state"') };
  }

  const recomputed = _sha256Hex(_stableStringify(payload.state));
  if (recomputed !== payload.checksum) {
    return {
      ok: false,
      reason: 'checksum-mismatch',
      error: new Error('checksum mismatch: recorded ' + payload.checksum + ', recomputed ' + recomputed),
    };
  }

  const validation = State.validate(payload.state);
  if (!validation.valid) {
    return { ok: false, reason: 'schema-invalid', error: new Error('schema validation failed: ' + validation.errors.join('; ')) };
  }

  let state;
  try {
    state = new State(payload.state);
  } catch (err) {
    return { ok: false, reason: 'construction-failed', error: err };
  }

  return { ok: true, state: state };
}

// Persists `state` as the current generation for `runId`. Before writing, the
// previously-current file (if any and if parseable) is promoted to
// state.previous.json so a validated prior generation always survives a crash
// mid-write. The new file is then written atomically and read back; a
// checksum/schema mismatch on readback throws rather than silently trusting
// the write.
function writeState(executionRoot, runId, state) {
  if (!(state instanceof State)) {
    throw _err('STATE_VALIDATION_ERROR', 'writeState: state must be a State instance');
  }
  const paths = _executionPaths(executionRoot, runId);
  _ensureDirSync(paths.runDir);

  if (fs.existsSync(paths.stateFile)) {
    try {
      const currentRaw = fs.readFileSync(paths.stateFile, 'utf8');
      JSON.parse(currentRaw); // only promote a well-formed prior generation
      _atomicWriteFileSync(paths.previousStateFile, currentRaw);
    } catch (_) {
      // Rotation of a corrupted current file is best-effort; do not block the
      // new write on it, and never overwrite an existing valid previous file
      // with unparseable content (the write above only runs when parse succeeds).
    }
  }

  const checksum = state.computeChecksum();
  const contents = JSON.stringify({ checksum: checksum, state: state.toJSON() }, null, 2);
  _atomicWriteFileSync(paths.stateFile, contents);

  const readBack = _loadStateFile(paths.stateFile);
  if (!readBack.ok || readBack.state.computeChecksum() !== checksum) {
    throw _err('STATE_READBACK_MISMATCH', 'writeState: readback verification failed for run "' + runId + '"');
  }
  return readBack.state;
}

// Reads the current generation for `runId`. When the current file is
// missing, throws STATE_NOT_FOUND (nothing to recover). When it is corrupted
// or fails schema/checksum validation: if allowRecovery is true (default),
// falls back to the last validated previous generation; otherwise throws
// STATE_CORRUPTED immediately. Never fabricates an empty run.
function readState(executionRoot, runId, opts) {
  opts = opts || {};
  const allowRecovery = opts.allowRecovery !== false;
  const paths = _executionPaths(executionRoot, runId);

  const current = _loadStateFile(paths.stateFile);
  if (current.ok) {
    return current.state;
  }

  if (current.reason === 'missing') {
    throw _err('STATE_NOT_FOUND', 'readState: no state found for run "' + runId + '" at ' + paths.stateFile);
  }

  if (!allowRecovery) {
    const e = _err(
      'STATE_CORRUPTED',
      'readState: state at ' + paths.stateFile + ' is unreadable (' + current.reason + '): ' + current.error.message
    );
    e.reason = current.reason;
    throw e;
  }

  const previous = _loadStateFile(paths.previousStateFile);
  if (previous.ok) {
    return previous.state;
  }

  const e = _err(
    'STATE_CORRUPTED',
    'readState: current state is unreadable (' + current.reason + ') and no valid previous generation ' +
    'is available for run "' + runId + '" — stopping non-destructively; no data deleted'
  );
  e.currentReason = current.reason;
  e.previousReason = previous.reason;
  throw e;
}

// Read-only diagnostic: reports which generation (current/previous) is valid
// for `runId` without mutating anything on disk. Throws STATE_UNRECOVERABLE
// if neither generation is valid.
function recoverState(executionRoot, runId) {
  const paths = _executionPaths(executionRoot, runId);

  const current = _loadStateFile(paths.stateFile);
  if (current.ok) {
    return { recovered: false, source: 'current', state: current.state };
  }

  const previous = _loadStateFile(paths.previousStateFile);
  if (previous.ok) {
    return { recovered: true, source: 'previous', state: previous.state, currentReason: current.reason };
  }

  const e = _err(
    'STATE_UNRECOVERABLE',
    'recoverState: neither current nor previous generation is valid for run "' + runId + '" ' +
    '(current: ' + current.reason + ', previous: ' + previous.reason + ') — no automatic recovery possible'
  );
  e.currentReason = current.reason;
  e.previousReason = previous.reason;
  throw e;
}

// ── Receipts and intents: immutable, content-addressed-by-id files ─────────

function _writeImmutableRecord(dir, id, data, conflictCode, label) {
  _validateSafeId(id, label);
  _ensureDirSync(dir);
  const filePath = path.join(dir, id + '.json');
  const contents = JSON.stringify(data, null, 2);

  if (fs.existsSync(filePath)) {
    let existing;
    try {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      throw _err(conflictCode, label + ': existing record "' + id + '" is corrupted and cannot be compared: ' + err.message);
    }
    if (_stableStringify(existing) === _stableStringify(data)) {
      return existing; // idempotent replay of an identical record
    }
    throw _err(conflictCode, label + ': record "' + id + '" already exists with different content — records are immutable');
  }

  _atomicWriteFileSync(filePath, contents);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function _readRecord(dir, id, notFoundCode, corruptCode, label) {
  _validateSafeId(id, label);
  const filePath = path.join(dir, id + '.json');
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw _err(notFoundCode, label + ': no record found for id "' + id + '" at ' + filePath);
    }
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw _err(corruptCode, label + ': record "' + id + '" is corrupted: ' + err.message);
  }
}

function writeReceipt(executionRoot, runId, activityId, receiptData) {
  const paths = _executionPaths(executionRoot, runId);
  return _writeImmutableRecord(paths.receiptsDir, activityId, receiptData, 'RECEIPT_CONFLICT', 'writeReceipt');
}

function readReceipt(executionRoot, runId, activityId) {
  const paths = _executionPaths(executionRoot, runId);
  return _readRecord(paths.receiptsDir, activityId, 'RECEIPT_NOT_FOUND', 'RECEIPT_CORRUPTED', 'readReceipt');
}

function listReceipts(executionRoot, runId) {
  const paths = _executionPaths(executionRoot, runId);
  return _listJsonIds(paths.receiptsDir);
}

// ── Combined verification+review outcome persistence (US-04-TASK-BE-03) ─────
//
// BR-09 ("verification persisted before review; review persisted before
// checkpoint") is enforced here: this is the single durable-record primitive
// that closes out US-04 for one task attempt, called only after index.js's
// runVerifications and (when applicable) runReview have both already
// returned. It does not dispatch, spawn, or re-run anything — it is pure
// persistence over already-computed results.

function _mergeUniqueIds(existing, additions) {
  const base = Array.isArray(existing) ? existing.slice() : [];
  additions.forEach(function (id) {
    if (base.indexOf(id) === -1) base.push(id);
  });
  return base;
}

// `verification` is runVerifications' own return shape: { passed, results }
// (results: array of { command, exitCode, ... , passed }, in run order —
// only the fields this function needs are read; extra fields are ignored).
// `review` is runReview's own return shape ({ reviewPassed, criticalFindings,
// ... }) when a review was actually dispatched, or null/undefined when it was
// not — the real flow never dispatches review after a failed verification,
// so `review` is legitimately absent in that case.
//
// Stage-transition rules (ATTEMPT_STAGES is the single source of truth; no
// new stage name is introduced):
//   - verification.passed !== true  -> attempt moves straight to 'failed'
//     (terminalReason 'verification-failed'), REGARDLESS of what `review`
//     contains. This is the defensive rule the outcome calls for: a caller
//     that mistakenly supplies a passing review alongside a failed
//     verification can never buy its way to 'reviewed'.
//   - verification.passed === true -> the attempt is first moved to
//     'verified' (a real, separately-written transition — mirrors
//     dispatchTaskAttempt's own prepared-then-dispatching two-step). A
//     review outcome is then required (null/undefined `review` here is
//     caller misuse, not a valid "not reviewed yet" state, since this
//     function is only ever called after both upstream calls have
//     returned) and decides the terminal step on top of 'verified':
//       - review.reviewPassed === true  -> 'reviewed' (terminalReason null)
//       - anything else (false OR null, i.e. the ambiguous/ unparsed verdict
//         _extractReviewVerdict can return) -> 'failed'
//         (terminalReason 'review-failed')
//
// Durable records written (both are immutable store.writeReceipt records —
// re-calling with identical inputs is an idempotent no-op; re-calling with
// different inputs for the same attempt throws RECEIPT_CONFLICT, same as any
// other receipt):
//   - `<taskId>-attempt<attemptNumber>-review` (only when `review` is given):
//     the raw review verdict, independent of whether verification passing
//     made it authoritative for the final stage.
//   - `<taskId>-attempt<attemptNumber>-outcome`: the full combined record —
//     verification summary (referencing, not duplicating, the per-command
//     receipts runVerifications already wrote), review summary, final stage
//     and terminal reason.
// The attempt's own `verificationRefs`/`reviewRefs` evidence arrays (already
// part of the addAttempt schema; unused by any writer before this task) are
// updated to reference these receipt ids, merged with whatever was already
// recorded rather than overwritten, so a repeated call cannot drop evidence.
function persistVerificationReviewOutcome(executionRoot, runId, taskId, attemptNumber, verification, review) {
  _validateSafeId(taskId, 'persistVerificationReviewOutcome');
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw _err(
      'STATE_VALIDATION_ERROR',
      'persistVerificationReviewOutcome: attemptNumber must be a positive integer, got ' + JSON.stringify(attemptNumber)
    );
  }
  if (verification == null || typeof verification !== 'object' ||
      typeof verification.passed !== 'boolean' || !Array.isArray(verification.results)) {
    throw _err(
      'STATE_VALIDATION_ERROR',
      'persistVerificationReviewOutcome: verification must be an object with a boolean "passed" and an array "results"'
    );
  }
  if (review !== null && review !== undefined &&
      (typeof review !== 'object' || !Array.isArray(review.criticalFindings))) {
    throw _err(
      'STATE_VALIDATION_ERROR',
      'persistVerificationReviewOutcome: review must be null/undefined or an object with an array "criticalFindings"'
    );
  }

  const verificationPassed = verification.passed;

  if (verificationPassed !== true && review == null) {
    // Common real-flow case: verification failed, review was never dispatched.
  } else if (verificationPassed === true && review == null) {
    throw _err(
      'STATE_VALIDATION_ERROR',
      'persistVerificationReviewOutcome: a review outcome is required once verification has passed ' +
        '(this function is only callable after both runVerifications and runReview have returned)'
    );
  }

  let finalStage;
  let terminalReason;
  if (verificationPassed !== true) {
    finalStage = 'failed';
    terminalReason = 'verification-failed';
  } else if (review.reviewPassed === true) {
    finalStage = 'reviewed';
    terminalReason = null;
  } else {
    finalStage = 'failed';
    terminalReason = 'review-failed';
  }

  const verificationSummary = verification.results.map(function (result, index) {
    return {
      index: index,
      receiptId: taskId + '-attempt' + attemptNumber + '-verification-' + index,
      command: result && result.command,
      exitCode: result && result.exitCode !== undefined ? result.exitCode : null,
      passed: !!(result && result.passed),
    };
  });
  const verificationReceiptIds = verificationSummary.map(function (v) { return v.receiptId; });

  let reviewReceiptId = null;
  if (review != null) {
    reviewReceiptId = taskId + '-attempt' + attemptNumber + '-review';
    writeReceipt(executionRoot, runId, reviewReceiptId, {
      taskId: taskId,
      attemptNumber: attemptNumber,
      reviewPassed: review.reviewPassed === undefined ? null : review.reviewPassed,
      criticalFindings: review.criticalFindings,
      authoritative: verificationPassed === true,
    });
  }

  const outcomeReceiptId = taskId + '-attempt' + attemptNumber + '-outcome';
  writeReceipt(executionRoot, runId, outcomeReceiptId, {
    taskId: taskId,
    attemptNumber: attemptNumber,
    verificationPassed: verificationPassed,
    verification: verificationSummary,
    review: review == null ? null : {
      receiptId: reviewReceiptId,
      reviewPassed: review.reviewPassed === undefined ? null : review.reviewPassed,
      criticalFindings: review.criticalFindings,
    },
    stage: finalStage,
    terminalReason: terminalReason,
  });

  let state = readState(executionRoot, runId);
  const task = state.tasks[taskId];
  if (!task) {
    throw _err('STATE_TASK_NOT_FOUND', 'persistVerificationReviewOutcome: task "' + taskId + '" not found');
  }
  const existingAttempt = task.attempts.find(function (a) { return a.number === attemptNumber; });
  if (!existingAttempt) {
    throw _err(
      'STATE_ATTEMPT_NOT_FOUND',
      'persistVerificationReviewOutcome: attempt ' + attemptNumber + ' not found for task "' + taskId + '"'
    );
  }

  const mergedVerificationRefs = _mergeUniqueIds(existingAttempt.verificationRefs, verificationReceiptIds);
  const mergedReviewRefs = _mergeUniqueIds(existingAttempt.reviewRefs, reviewReceiptId ? [reviewReceiptId] : []);

  if (verificationPassed === true) {
    // Real, separately-written intermediate transition — 'verified' always
    // lands on disk before the terminal 'reviewed'/'failed' step, mirroring
    // dispatchTaskAttempt's own prepared-then-dispatching two-step write.
    state = state.updateAttempt(taskId, attemptNumber, {
      stage: 'verified',
      verificationRefs: mergedVerificationRefs,
    });
    state = writeState(executionRoot, runId, state);

    state = state.updateAttempt(taskId, attemptNumber, {
      stage: finalStage,
      reviewRefs: mergedReviewRefs,
      terminalReason: terminalReason,
    });
    state = writeState(executionRoot, runId, state);
  } else {
    state = state.updateAttempt(taskId, attemptNumber, {
      stage: finalStage,
      verificationRefs: mergedVerificationRefs,
      reviewRefs: mergedReviewRefs,
      terminalReason: terminalReason,
    });
    state = writeState(executionRoot, runId, state);
  }

  const allNewReceiptIds = verificationReceiptIds.concat(reviewReceiptId ? [reviewReceiptId] : [], [outcomeReceiptId]);
  allNewReceiptIds.forEach(function (id) {
    state = state.addReceiptRef(id);
  });
  state = writeState(executionRoot, runId, state);

  return {
    taskId: taskId,
    attemptNumber: attemptNumber,
    stage: finalStage,
    terminalReason: terminalReason,
    verificationReceiptIds: verificationReceiptIds,
    reviewReceiptId: reviewReceiptId,
    outcomeReceiptId: outcomeReceiptId,
  };
}

// ── registerCommitSHA (US-05-TASK-BE-04) ────────────────────────────────────
//
// Persists the real, git-confirmed commit SHA that createTaskCommit
// (US-05-TASK-BE-03, lib/task-executor/git.js) already produced and
// re-inspected, into executor state OUTSIDE the tracked worktree. This
// function runs no git commands itself — it is pure state persistence,
// called only after the caller already holds a real commit SHA. Registering
// the SHA as a separate step (rather than writing it from inside the commit
// call) is deliberate: a commit object can never embed its own SHA without a
// second, recursive commit, so registration necessarily happens after the
// commit exists, in state, not in Git.
//
// originalSha vs integratedSha (Tech-Spec section 8, N=1 vs N>1 branch
// model): "N=1: task commit is on feature branch and integratedSha=
// originalSha after verification." / "N>1: each attempt has unique branch
// ai-toolkit/<runId>/<taskId>/<attempt> ... Commit remains on technical ref
// until integration." For N>1, integratedSha is only known once a later,
// separate cherry-pick/integration step has run — that is US-08-TASK-BE-04
// ("tracks originalSha ... and integratedSha ... separately; updates
// integration attempt record"), not yet implemented and explicitly out of
// scope here.
//
// This function therefore ALWAYS sets originalSha (the one thing it is
// unconditionally responsible for), and only ALSO sets integratedSha in the
// same call when the caller explicitly passes opts.sequential === true — the
// caller-known signal that this run is N=1 (the task commit lands directly
// on the feature branch, so no separate integration step is ever coming for
// this attempt). Default is false/absent, so N>1 callers (and any caller
// that has not been updated to pass the flag) can never accidentally
// populate integratedSha here; it stays null until US-08-TASK-BE-04's own
// integration step writes it.
//
// Stage transition: advances the attempt to 'committed'. Allowed only from
// 'checkpoint-prepared' (the stage persistCheckpointIntent, US-05-TASK-BE-01,
// leaves it at) or, idempotently, from 'committed' itself — but ONLY when
// the SHA (and, for a sequential registration, integratedSha) being
// registered is identical to what is already recorded (a safe replay of the
// exact same call; no generation bump). Registering a DIFFERENT SHA against
// an attempt that already has one recorded is rejected (fail closed,
// SHA_REGISTRATION_CONFLICT) — a commit, once registered, is immutable; this
// function never silently swaps it for another.
//
// This function does not decide whether the task/run is "done" — ledger
// finalization is a separate, later concern (US-05-TASK-BE-05).
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function _shaRegistrationFail(field, reason) {
  throw _err('SHA_REGISTRATION_VALIDATION_ERROR', 'registerCommitSHA: ' + field + ' ' + reason);
}

/**
 * @param {string} executionRoot
 * @param {string} runId
 * @param {string} taskId
 * @param {number} attemptNumber
 * @param {string} commitSha - the real, already-confirmed 40-character hex
 *   commit SHA (e.g. createTaskCommit's returned commitSha).
 * @param {{sequential?: boolean}} [opts] - sequential: true also sets
 *   integratedSha = commitSha in this same call (N=1 only — see file comment
 *   above). Omit/false for N>1 attempts, whose integratedSha is set later by
 *   US-08-TASK-BE-04's integration step.
 * @returns {{taskId: string, attemptNumber: number, stage: string,
 *   originalSha: string, integratedSha: string|null}}
 * @throws {Error} SHA_REGISTRATION_VALIDATION_ERROR for malformed input;
 *   STATE_TASK_NOT_FOUND / STATE_ATTEMPT_NOT_FOUND when the target does not
 *   exist; SHA_REGISTRATION_STAGE_ERROR when the attempt is not at
 *   'checkpoint-prepared' (and not an identical replay of an already-
 *   'committed' attempt); SHA_REGISTRATION_CONFLICT when a different SHA is
 *   already registered for this attempt.
 */
function registerCommitSHA(executionRoot, runId, taskId, attemptNumber, commitSha, opts) {
  opts = opts || {};
  const sequential = opts.sequential === true;

  _validateSafeId(taskId, 'registerCommitSHA');
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    _shaRegistrationFail('attemptNumber', 'must be a positive integer');
  }
  if (typeof commitSha !== 'string' || !SHA_PATTERN.test(commitSha)) {
    _shaRegistrationFail('commitSha', 'must be a 40-character hex SHA-1 string');
  }

  let state = readState(executionRoot, runId);
  const task = state.tasks[taskId];
  if (!task) {
    throw _err('STATE_TASK_NOT_FOUND', 'registerCommitSHA: task "' + taskId + '" not found');
  }
  const attempt = task.attempts.find(function (a) { return a.number === attemptNumber; });
  if (!attempt) {
    throw _err(
      'STATE_ATTEMPT_NOT_FOUND',
      'registerCommitSHA: attempt ' + attemptNumber + ' not found for task "' + taskId + '"'
    );
  }

  if (attempt.stage === 'committed') {
    const sameOriginal = attempt.originalSha === commitSha;
    const sameIntegrated = sequential ? attempt.integratedSha === commitSha : true;
    if (sameOriginal && sameIntegrated) {
      return {
        taskId: taskId,
        attemptNumber: attemptNumber,
        stage: attempt.stage,
        originalSha: attempt.originalSha,
        integratedSha: attempt.integratedSha,
      }; // idempotent no-op — no generation bump for a repeated identical registration
    }
    throw _err(
      'SHA_REGISTRATION_CONFLICT',
      'registerCommitSHA: attempt ' + attemptNumber + ' of task "' + taskId + '" already has a commit SHA ' +
        'registered (originalSha ' + attempt.originalSha + ', integratedSha ' + attempt.integratedSha + ') that ' +
        'does not match this registration (commitSha ' + commitSha + ', sequential ' + sequential + ') — a ' +
        'registered commit is immutable; nothing overwritten'
    );
  }

  if (attempt.stage !== 'checkpoint-prepared') {
    throw _err(
      'SHA_REGISTRATION_STAGE_ERROR',
      'registerCommitSHA: attempt ' + attemptNumber + ' of task "' + taskId + '" is at stage "' + attempt.stage +
        '"; a commit SHA may only be registered once the checkpoint intent has been persisted (expected stage ' +
        '"checkpoint-prepared", or "committed" for an idempotent replay of the identical SHA)'
    );
  }

  const patch = { stage: 'committed', originalSha: commitSha };
  if (sequential) {
    patch.integratedSha = commitSha;
  }

  state = state.updateAttempt(taskId, attemptNumber, patch);
  state = writeState(executionRoot, runId, state);

  const updatedAttempt = state.tasks[taskId].attempts.find(function (a) { return a.number === attemptNumber; });
  return {
    taskId: taskId,
    attemptNumber: attemptNumber,
    stage: updatedAttempt.stage,
    originalSha: updatedAttempt.originalSha,
    integratedSha: updatedAttempt.integratedSha,
  };
}

// ── registerIntegratedSHA (US-08-TASK-BE-04) ────────────────────────────────
//
// Persists the real, git-confirmed integration commit SHA that integrateAttempt
// (US-08-TASK-BE-03, lib/task-executor/git.js) already produced and
// re-inspected (tree/parent/trailer verification, CAS ref-advance), into
// executor state. This is the N>1 counterpart to registerCommitSHA's own
// `opts.sequential` shortcut: for N>1 (Tech-Spec section 8), originalSha (the
// technical-branch commit) and integratedSha (the feature-branch commit
// produced by cherry-pick) are genuinely different SHAs, and integratedSha is
// only known once integrateAttempt has actually run — a separate, later step
// than the original commit's own registration. This function runs no git
// commands itself and does not verify cherry-pick correctness or reachability
// — that already happened, unconditionally, inside integrateAttempt before it
// returned. It only persists the already-integrated result.
//
// Stage transition: advances the attempt to 'integrated' (an existing
// ATTEMPT_STAGES value — no new stage is introduced). Allowed only from
// 'committed' with a valid, already-registered originalSha (registerCommitSHA's
// own postcondition) — or, idempotently, from 'integrated' itself, but ONLY
// when the integratedSha being registered is identical to what is already
// recorded (a safe replay of the exact same call; no generation bump).
// Registering a DIFFERENT integratedSha against an attempt that already has
// one recorded is rejected (fail closed, INTEGRATION_SHA_CONFLICT) — an
// integrated commit, once registered, is immutable; this function never
// silently swaps it for another.
//
// originalSha is never touched here — it remains exactly what
// registerCommitSHA already set; this function only ever writes
// attempt.integratedSha and attempt.stage.
//
// SCOPE BOUNDARY: this function does NOT set task.status. Setting the task's
// overall status is a later, index.js-layer "finalize" concern — the same
// division of labor registerCommitSHA itself already follows (it never
// touches task.status either; only finalizeTaskCheckpoint, at the index.js
// layer, calls state.setTaskStatus(taskId, 'checkpointed') once the commit
// is verified reachable on disk). No analogous "finalize integration" step
// exists yet at the index.js layer for N>1 runs (this task is scoped to
// store.js only), so setting task.status = 'integrated' here would be scope
// creep ahead of that future caller — left out deliberately, matching
// precedent, and documented here so the future caller knows where that
// responsibility belongs.
function _integrationShaRegistrationFail(field, reason) {
  throw _err('INTEGRATION_SHA_VALIDATION_ERROR', 'registerIntegratedSHA: ' + field + ' ' + reason);
}

/**
 * @param {string} executionRoot
 * @param {string} runId
 * @param {string} taskId
 * @param {number} attemptNumber
 * @param {string} integratedSha - the real, already-confirmed 40-character
 *   hex integration commit SHA (e.g. integrateAttempt's returned
 *   integratedSha).
 * @returns {{taskId: string, attemptNumber: number, stage: string,
 *   originalSha: string, integratedSha: string}}
 * @throws {Error} INTEGRATION_SHA_VALIDATION_ERROR for malformed input;
 *   STATE_TASK_NOT_FOUND / STATE_ATTEMPT_NOT_FOUND when the target does not
 *   exist; INTEGRATION_SHA_STAGE_ERROR when the attempt is not at
 *   'committed' with a valid originalSha already registered (and not an
 *   identical replay of an already-'integrated' attempt);
 *   INTEGRATION_SHA_CONFLICT when a different integratedSha is already
 *   registered for this attempt.
 */
function registerIntegratedSHA(executionRoot, runId, taskId, attemptNumber, integratedSha) {
  _validateSafeId(taskId, 'registerIntegratedSHA');
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    _integrationShaRegistrationFail('attemptNumber', 'must be a positive integer');
  }
  if (typeof integratedSha !== 'string' || !SHA_PATTERN.test(integratedSha)) {
    _integrationShaRegistrationFail('integratedSha', 'must be a 40-character hex SHA-1 string');
  }

  let state = readState(executionRoot, runId);
  const task = state.tasks[taskId];
  if (!task) {
    throw _err('STATE_TASK_NOT_FOUND', 'registerIntegratedSHA: task "' + taskId + '" not found');
  }
  const attempt = task.attempts.find(function (a) { return a.number === attemptNumber; });
  if (!attempt) {
    throw _err(
      'STATE_ATTEMPT_NOT_FOUND',
      'registerIntegratedSHA: attempt ' + attemptNumber + ' not found for task "' + taskId + '"'
    );
  }

  if (attempt.stage === 'integrated') {
    if (attempt.integratedSha === integratedSha) {
      return {
        taskId: taskId,
        attemptNumber: attemptNumber,
        stage: attempt.stage,
        originalSha: attempt.originalSha,
        integratedSha: attempt.integratedSha,
      }; // idempotent no-op — no generation bump for a repeated identical registration
    }
    throw _err(
      'INTEGRATION_SHA_CONFLICT',
      'registerIntegratedSHA: attempt ' + attemptNumber + ' of task "' + taskId + '" already has an integratedSha ' +
        'registered (' + attempt.integratedSha + ') that does not match this registration (' + integratedSha + ') ' +
        '— an integrated commit is immutable; nothing overwritten'
    );
  }

  if (attempt.stage !== 'committed' || typeof attempt.originalSha !== 'string' || !SHA_PATTERN.test(attempt.originalSha)) {
    throw _err(
      'INTEGRATION_SHA_STAGE_ERROR',
      'registerIntegratedSHA: attempt ' + attemptNumber + ' of task "' + taskId + '" is at stage "' + attempt.stage +
        '"; an integratedSha may only be registered once the original commit SHA has been registered (expected ' +
        'stage "committed" with a valid originalSha, or "integrated" for an idempotent replay of the identical SHA)'
    );
  }

  state = state.updateAttempt(taskId, attemptNumber, { stage: 'integrated', integratedSha: integratedSha });
  state = writeState(executionRoot, runId, state);

  const updatedAttempt = state.tasks[taskId].attempts.find(function (a) { return a.number === attemptNumber; });
  return {
    taskId: taskId,
    attemptNumber: attemptNumber,
    stage: updatedAttempt.stage,
    originalSha: updatedAttempt.originalSha,
    integratedSha: updatedAttempt.integratedSha,
  };
}

function writeIntent(executionRoot, runId, intentId, intentData) {
  const paths = _executionPaths(executionRoot, runId);
  return _writeImmutableRecord(paths.intentsDir, intentId, intentData, 'INTENT_CONFLICT', 'writeIntent');
}

function readIntent(executionRoot, runId, intentId) {
  const paths = _executionPaths(executionRoot, runId);
  return _readRecord(paths.intentsDir, intentId, 'INTENT_NOT_FOUND', 'INTENT_CORRUPTED', 'readIntent');
}

function listIntents(executionRoot, runId) {
  const paths = _executionPaths(executionRoot, runId);
  return _listJsonIds(paths.intentsDir);
}

module.exports = {
  PROTOCOL_VERSION,
  RUN_STATUSES,
  TASK_STATUSES,
  ATTEMPT_STAGES,
  State,
  writeState,
  readState,
  recoverState,
  writeReceipt,
  readReceipt,
  listReceipts,
  persistVerificationReviewOutcome,
  registerCommitSHA,
  registerIntegratedSHA,
  writeIntent,
  readIntent,
  listIntents,
  _executionPaths,
  _loadStateFile,
  _atomicWriteFileSync,
  _stableStringify,
  _sha256Hex,
};
