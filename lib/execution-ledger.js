'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');
// Namespaced (not destructured) so tests can jest.spyOn(ownership, '_queryProcessStartTimeSync')
// — a destructured reference would capture the original function at require
// time and bypass any later spy on the module's own export.
const ownership = require('./task-executor/ownership');

// ── Internal I/O helpers (stubs — implemented by INFRA-TASK-BE-03) ──────────

function _readLedger(ledgerPath) {
  let raw;
  try {
    raw = fs.readFileSync(ledgerPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { entries: [] };
    }
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (parseErr) {
    if (raw.length > 0) {
      _backupCorruptFile(ledgerPath);
      const err = new Error(
        'corrupt ledger at ' + ledgerPath + ': ' + parseErr.message +
        ' — original preserved unchanged, corrupt content backed up to sidecar'
      );
      err.code = 'CORRUPT_LEDGER';
      err.ledgerPath = ledgerPath;
      throw err;
    }
    throw parseErr;
  }
  if (!Array.isArray(parsed)) throw new Error('Invalid ledger: expected JSON array');
  return { entries: parsed };
}

function _writeLedger(ledgerPath, entries) {
  const dir = path.dirname(ledgerPath);
  const tmpName = '.' + path.basename(ledgerPath) + '.tmp-' + process.pid + '-' + Date.now();
  const tmpPath = path.join(dir, tmpName);
  const jsonStr = JSON.stringify(entries, null, 2);

  let fd;
  try {
    fd = fs.openSync(tmpPath, 'w');
    fs.writeSync(fd, jsonStr);
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

  // Never unlink ledgerPath before/instead of the rename as a recovery step:
  // fs.renameSync already atomically replaces an existing destination on every
  // platform this runs on (POSIX rename(2); Windows via MoveFileEx with
  // REPLACE_EXISTING). An EEXIST/EPERM-triggered unlink-then-rename "fallback"
  // used to live here — if the process died in the window between that unlink
  // succeeding and the rename completing (or if the rename then failed for an
  // unrelated reason), the ledger file was simply gone, and _readLedger's
  // ENOENT handling (above) treats a missing file as "empty, no error" — real,
  // silent data loss, worse than the corrupt-ledger path this same module
  // guards carefully via _backupCorruptFile.
  //
  // The EPERM/EEXIST this used to react to is real and transient, though
  // (confirmed against a genuine, unmocked failure under parallel Windows test
  // load, same "known environmental characteristic" docs/task-executor-
  // bootstrap.md already documents for store.js's own rename) — something
  // else briefly holds a handle on ledgerPath (antivirus, indexing, a
  // concurrent reader). Retrying the SAME rename a bounded number of times
  // with a short backoff gives that window a chance to close WITHOUT ever
  // creating a moment where ledgerPath doesn't exist, unlike the old
  // unlink-first approach.
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.renameSync(tmpPath, ledgerPath);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (err.code !== 'EPERM' && err.code !== 'EEXIST') break;
      _sleepSync(20);
    }
  }
  if (lastErr) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    throw lastErr;
  }
  _fsyncDirSync(dir);
}

// Best-effort directory fsync after a rename — identical to, and genuinely
// mirroring this time, lib/task-executor/store.js's own _fsyncDirSync.
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

function _backupCorruptFile(ledgerPath) {
  const dir = path.dirname(ledgerPath);
  const base = path.basename(ledgerPath);
  const sidecarName = base + '.backup-corrupt-' + Date.now();
  const sidecarPath = path.join(dir, sidecarName);
  const content = fs.readFileSync(ledgerPath);
  fs.writeFileSync(sidecarPath, content);
}

// ── Internal lock helpers ────────────────────────────────────────────────────

function _sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy-wait for synchronous cross-process backoff */ }
}

// This process's own OS-level start time, probed via ownership.js's
// host:pid:startTime technique exactly ONCE per process lifetime (not once
// per lock acquisition) and cached forever after — a process's own start
// time never changes. Recording this in every lock token we write is what
// later lets a CONTENDED acquisition attempt tell "the recorded owner is
// still running" apart from "a recycled pid now belongs to someone else"
// (see _confirmSameOwnerProcess). `undefined` means not yet probed;
// `null` means the probe was inconclusive (non-Windows, or it failed) —
// callers must treat that the same as "no evidence either way", never as
// proof of death.
let _selfProcessStartTime;
function _getSelfProcessStartTime() {
  if (_selfProcessStartTime === undefined) {
    const probe = ownership._queryProcessStartTimeSync(process.pid);
    _selfProcessStartTime = (probe && probe.found) ? probe.startTime : null;
  }
  return _selfProcessStartTime;
}

// Per-nonce verdict cache for the PID-reuse check below. A lock's nonce is
// unique per acquisition (crypto.randomBytes at write time), so a verdict
// for a given nonce never goes stale: either the recorded owner is
// confirmed still the same OS process (forever, until it exits), or it was
// already confirmed to be a different process that reused the pid
// (forever — that fact doesn't change either). Caching here is what keeps
// the expensive OS probe to once per contended lock episode instead of once
// per ~100ms poll in _acquireLock's retry loop. Bounded defensively; a
// single process is not expected to ever accumulate more than a handful of
// distinct contended nonces in practice.
const _ownerProcessVerdictCache = new Map();

// Resolves whether `token.pid` is still the SAME OS process that wrote this
// lock, using the host:pid:startTime identity technique (same one
// ownership.js already uses for task leases) — `process.kill(pid, 0)` alone
// cannot tell a still-alive original owner apart from an unrelated process
// that reused a recycled pid after the owner crashed.
//
// Returns:
//   true  — confirmed same process (startTime probes match)
//   false — confirmed a DIFFERENT process now holds this pid (mismatch)
//   null  — inconclusive (non-Windows, probe failed, or token predates this
//           field) — caller must fall back to trusting process.kill() alone,
//           exactly like before this check existed; never treated as death.
function _confirmSameOwnerProcess(token) {
  if (typeof token.processStartTime !== 'string' || !token.nonce) return null;

  const cached = _ownerProcessVerdictCache.get(token.nonce);
  if (cached !== undefined) return cached;

  const probe = ownership._queryProcessStartTimeSync(token.pid);
  // Inconclusive probe (non-Windows, or the query failed) or the OS
  // confirms no such pid despite process.kill() saying alive (a narrow
  // race): do not cache — there is nothing stable to remember, and a
  // later retry might get a conclusive answer.
  if (!probe) return null;
  if (!probe.found) return null;

  const verdict = probe.startTime === token.processStartTime;
  if (_ownerProcessVerdictCache.size > 500) _ownerProcessVerdictCache.clear();
  _ownerProcessVerdictCache.set(token.nonce, verdict);
  return verdict;
}

// Test-only reset: both caches are intentionally process-lifetime-scoped in
// production (see their own comments for why), which would otherwise leak
// a mocked _queryProcessStartTimeSync's behavior across unrelated test cases
// sharing the same Jest worker process.
function _resetOwnerProcessCaches() {
  _selfProcessStartTime = undefined;
  _ownerProcessVerdictCache.clear();
}

function _acquireLock(lockPath, opts) {
  const deadlineMs = (opts && opts.deadlineMs != null) ? opts.deadlineMs : 5000;
  const retryIntervalMs = (opts && opts.retryIntervalMs != null) ? opts.retryIntervalMs : 100;
  const deadline = Date.now() + deadlineMs;

  for (;;) {
    let fd;
    try {
      fd = fs.openSync(lockPath, 'wx');
      const nonce = crypto.randomBytes(16).toString('hex');
      const startedAt = new Date().toISOString();
      // processStartTime: this process's own OS start time (cached once per
      // process lifetime, see _getSelfProcessStartTime) — null on non-Windows
      // or when the probe is unavailable, matching ownership.js's own
      // null-means-inconclusive convention. Lets a later contended acquirer
      // tell "still us" apart from "a recycled pid, now someone else".
      const ownerToken = { pid: process.pid, startedAt, nonce, processStartTime: _getSelfProcessStartTime() };
      fs.writeSync(fd, JSON.stringify(ownerToken));
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      return { nonce, lockPath, pid: process.pid, startedAt };
    } catch (err) {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch (_) {}
        if (err.code !== 'EEXIST') {
          try { fs.unlinkSync(lockPath); } catch (_) {}
        }
      }
      if (err.code !== 'EEXIST') {
        throw err;
      }

      // ABA-guarded staleness check + reclaim (US-10 / AC-08 / AC-26)
      try {
        let content1, stat1;
        try {
          content1 = fs.readFileSync(lockPath, 'utf8');
          stat1    = fs.statSync(lockPath);
        } catch (readErr) {
          if (readErr.code === 'ENOENT') {
            continue; // lock vanished between EEXIST and our read — retry O_EXCL immediately
          }
          throw readErr;
        }

        const state = _isLockStale(content1, stat1);

        if (state === 'reclaimable') {
          // ABA guard: re-read and re-stat before unlinking to ensure no other
          // writer replaced or refreshed the lock between classify and reclaim.
          let content2, stat2;
          try {
            content2 = fs.readFileSync(lockPath, 'utf8');
            stat2    = fs.statSync(lockPath);
          } catch (abaErr) {
            if (abaErr.code === 'ENOENT') {
              continue; // lock vanished during ABA check — retry O_EXCL immediately
            }
            throw abaErr;
          }

          if (content2 === content1 && stat2.mtimeMs === stat1.mtimeMs) {
            // Content and mtime are identical — safe to unlink and reclaim
            try {
              fs.unlinkSync(lockPath);
            } catch (unlinkErr) {
              if (unlinkErr.code !== 'ENOENT') throw unlinkErr;
              // ENOENT: another process reclaimed it first — still retry O_EXCL
            }
            continue; // retry O_EXCL create immediately, no sleep
          }
          // ABA check failed: content or mtime changed — another writer refreshed
          // the lock between classify and reclaim; treat as 'wait' this iteration
        }
        // 'live', 'wait', or ABA-failed 'reclaimable': fall through to deadline + sleep
      } catch (checkErr) {
        if (checkErr.code === 'ENOENT') {
          continue; // lock vanished during stale check — retry O_EXCL immediately
        }
        // Any other unexpected error during the staleness check: absorb and fall
        // through to the normal wait/sleep path so acquisition is never aborted
        // by a transient read error.
      }

      // Existing behavior for live / wait / ABA-failed locks
      if (Date.now() >= deadline) {
        throw new Error(
          'Failed to acquire lock ' + lockPath + ': deadline of ' + deadlineMs + 'ms exceeded'
        );
      }
      const remaining = deadline - Date.now();
      if (remaining > 0) {
        _sleepSync(Math.min(retryIntervalMs, remaining));
      }
    }
  }
}

function _releaseLock(lockPath, handle) {
  let content;
  try {
    content = fs.readFileSync(lockPath, 'utf8');
  } catch (_) {
    return;
  }
  let ownerToken;
  try {
    ownerToken = JSON.parse(content);
  } catch (_) {
    return;
  }
  if (!ownerToken || ownerToken.nonce !== handle.nonce) {
    return;
  }
  try {
    fs.unlinkSync(lockPath);
  } catch (_) {}
}

const LOCK_STALE_THRESHOLD_MS  = 30000;
const LOCK_ORPHAN_THRESHOLD_MS = 30000;

function _isLockStale(content, stat) {
  let token = null;
  try {
    const parsed = JSON.parse(content);
    if (parsed !== null && typeof parsed === 'object' && typeof parsed.pid === 'number') {
      token = parsed;
    }
  } catch (_) {}

  const now = Date.now();

  if (token !== null) {
    let ownerAlive = false;
    try {
      process.kill(token.pid, 0);
      ownerAlive = true;
    } catch (err) {
      if (err.code === 'EPERM') {
        ownerAlive = true;
      }
    }

    // process.kill(pid, 0) alone cannot tell a still-alive original owner
    // apart from an unrelated process that reused a recycled pid after the
    // owner crashed. _confirmSameOwnerProcess returns false only when it has
    // positive OS evidence that today's occupant of this pid started at a
    // different time than the token recorded — a confirmed PID reuse, not a
    // guess. true or null (inconclusive) both fall through to the original
    // "trust process.kill()" behavior, so nothing regresses on non-Windows
    // or for locks written before this field existed.
    if (ownerAlive && _confirmSameOwnerProcess(token) !== false) {
      return 'live';
    }

    let age;
    const startedAtMs = token.startedAt ? Date.parse(token.startedAt) : NaN;
    if (!isNaN(startedAtMs)) {
      age = now - startedAtMs;
    } else {
      age = now - stat.mtimeMs;
    }

    return age > LOCK_STALE_THRESHOLD_MS ? 'reclaimable' : 'wait';
  }

  const mtimeAge = now - stat.mtimeMs;
  return mtimeAge > LOCK_ORPHAN_THRESHOLD_MS ? 'reclaimable' : 'wait';
}

// ── Metadata whitelist and reserved-field protection (INFRA-TASK-BE-03) ─────

const METADATA_WHITELIST = new Set([
  'agentId',
  'nativeAgentName',
  'platform',
  'toolkitVersion',
  'resolutionScope',
  'definitionHash',
]);

const RESERVED_FIELDS = new Set([
  'operation_id',
  'agent',
  'phase',
  'model',
  'status',
  'started_at',
  'completed_at',
  'phase_delta_tokens',
  'error',
]);

function _validateMetadata(metadata) {
  for (const key of Object.keys(metadata)) {
    if (RESERVED_FIELDS.has(key)) {
      const err = new Error(
        'open: metadata key "' + key + '" is a reserved field and cannot be set via metadata'
      );
      err.code = 'METADATA_RESERVED_FIELD';
      err.key = key;
      throw err;
    }
    if (!METADATA_WHITELIST.has(key)) {
      const err = new Error(
        'open: metadata key "' + key + '" is not in the whitelist; ' +
        'allowed keys: ' + Array.from(METADATA_WHITELIST).join(', ')
      );
      err.code = 'METADATA_UNKNOWN_KEY';
      err.key = key;
      throw err;
    }
  }
}

function _extractStoredMetadata(entry) {
  const result = {};
  for (const key of METADATA_WHITELIST) {
    if (Object.prototype.hasOwnProperty.call(entry, key)) {
      result[key] = entry[key];
    }
  }
  return result;
}

function _metadataEqual(storedEntry, newMetadata) {
  const stored    = _extractStoredMetadata(storedEntry);
  const storedKeys = Object.keys(stored).sort();
  const newKeys    = Object.keys(newMetadata).sort();

  if (storedKeys.length !== newKeys.length) return false;
  for (var i = 0; i < newKeys.length; i++) {
    if (stored[newKeys[i]] !== newMetadata[newKeys[i]]) return false;
  }
  return true;
}

// ── Public API (stubs — implemented by INFRA-TASK-BE-02 and US-0x tasks) ────

function computeOperationId(prefix, agent, attempt) {
  const input = JSON.stringify([prefix, agent, attempt]);
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 32);
}

function open(dir, prefix, agent, phase, model, attempt, metadata) {
  if (attempt == null) attempt = 1;

  // Validate metadata keys BEFORE any lock or I/O (fail-closed).
  if (metadata != null) {
    _validateMetadata(metadata);
  }

  const ledgerPath = path.join(dir, prefix + '-token-ledger.json');
  const lockPath   = ledgerPath + '.lock';

  const lockHandle = _acquireLock(lockPath);
  try {
    const { entries }  = _readLedger(ledgerPath);
    const operation_id = computeOperationId(prefix, agent, attempt);
    const started_at   = new Date().toISOString();

    const existingIndex = entries.findIndex(function (e) {
      return e.operation_id === operation_id;
    });

    if (existingIndex !== -1) {
      _assertUnowned(entries[existingIndex]);
      // Idempotent re-open: check metadata conflict BEFORE writing anything.
      if (metadata != null) {
        if (!_metadataEqual(entries[existingIndex], metadata)) {
          const err = new Error(
            'open: metadata conflict for operation_id ' + operation_id +
            ' — supplied metadata differs from stored metadata; re-open rejected (fail-closed)'
          );
          err.code = 'METADATA_CONFLICT';
          err.operation_id = operation_id;
          throw err;
        }
      }
      // Resume: idempotently preserve original started_at and any positive
      // phase_delta_tokens — only reset status to running.
      entries[existingIndex] = Object.assign({}, entries[existingIndex], { status: 'running' });
    } else {
      // First open: store standard fields, then spread validated metadata fields.
      const newEntry = {
        operation_id:       operation_id,
        agent:              agent,
        phase:              phase,
        model:              model,
        status:             'running',
        started_at:         started_at,
        completed_at:       null,
        phase_delta_tokens: null,
      };
      if (metadata != null) {
        Object.assign(newEntry, metadata);
      }
      entries.push(newEntry);
    }

    _writeLedger(ledgerPath, entries);

    const resultEntry = existingIndex !== -1
      ? entries[existingIndex]
      : entries[entries.length - 1];

    return { status: 'ok', operation_id: operation_id, entry: resultEntry };
  } finally {
    _releaseLock(lockPath, lockHandle);
  }
}

function close(dir, prefix, agent, tokens, attempt) {
  if (attempt == null) attempt = 1;

  const ledgerPath = path.join(dir, prefix + '-token-ledger.json');
  const lockPath   = ledgerPath + '.lock';

  const lockHandle = _acquireLock(lockPath);
  try {
    const { entries }  = _readLedger(ledgerPath);
    const operation_id = computeOperationId(prefix, agent, attempt);

    // Primary lookup: by operation_id (deterministic, unambiguous)
    let idx = entries.findIndex(function (e) {
      return e.operation_id === operation_id;
    });

    // Fallback: by agent name — only when exactly one entry matches (AC-12)
    if (idx === -1) {
      const agentIndexes = [];
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].agent === agent) agentIndexes.push(i);
      }
      if (agentIndexes.length === 0) {
        throw new Error(
          'close: no entry found for operation_id ' + operation_id +
          ' and agent "' + agent + '" in ' + ledgerPath
        );
      }
      if (agentIndexes.length > 1) {
        throw new Error(
          'close: ambiguous agent fallback — ' + agentIndexes.length +
          ' entries match agent "' + agent + '" in ' + ledgerPath
        );
      }
      idx = agentIndexes[0];
    }

    const existing = entries[idx];
    _assertUnowned(existing);
    const completed_at = new Date().toISOString();

    // Token preservation (AC-10):
    // - positive integer supplied → record it
    // - null/undefined supplied  → preserve whatever positive value is already stored;
    //   null must never clobber an existing positive phase_delta_tokens
    var phase_delta_tokens = existing.phase_delta_tokens;
    if (tokens !== null && tokens !== undefined) {
      phase_delta_tokens = tokens;
    }
    // When tokens is null/undefined, phase_delta_tokens keeps its existing value
    // (positive preserved; null/non-positive also left unchanged for this task)

    // Merge update: Object.assign preserves any unknown/legacy fields verbatim (AC-12)
    entries[idx] = Object.assign({}, existing, {
      status:             'done',
      completed_at:       completed_at,
      phase_delta_tokens: phase_delta_tokens,
    });

    _writeLedger(ledgerPath, entries);

    // Return same shape as open() — operation_id comes from the entry when present,
    // otherwise from the computed value (legacy entry without one, per AC-12)
    const returnedOpId = existing.operation_id != null ? existing.operation_id : operation_id;
    return { status: 'ok', operation_id: returnedOpId, entry: entries[idx] };
  } finally {
    _releaseLock(lockPath, lockHandle);
  }
}

function _sanitizeError(err) {
  return String(err).replace(/[\r\n\t]+/g, ' ').slice(0, 500);
}

function fail(dir, prefix, agent, error, attempt) {
  if (attempt == null) attempt = 1;

  const ledgerPath = path.join(dir, prefix + '-token-ledger.json');
  const lockPath   = ledgerPath + '.lock';

  const lockHandle = _acquireLock(lockPath);
  try {
    const { entries }  = _readLedger(ledgerPath);
    const operation_id = computeOperationId(prefix, agent, attempt);

    // Primary lookup: by operation_id (deterministic, unambiguous)
    let idx = entries.findIndex(function (e) {
      return e.operation_id === operation_id;
    });

    // Fallback: by agent name — only when exactly one entry matches
    if (idx === -1) {
      const agentIndexes = [];
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].agent === agent) agentIndexes.push(i);
      }
      if (agentIndexes.length === 0) {
        throw new Error(
          'fail: no entry found for operation_id ' + operation_id +
          ' and agent "' + agent + '" in ' + ledgerPath +
          ' — operation was never opened'
        );
      }
      if (agentIndexes.length > 1) {
        throw new Error(
          'fail: ambiguous agent fallback — ' + agentIndexes.length +
          ' entries match agent "' + agent + '" in ' + ledgerPath
        );
      }
      idx = agentIndexes[0];
    }

    const existing = entries[idx];
    _assertUnowned(existing);
    const completed_at = new Date().toISOString();

    const update = {
      status:       'failed',
      completed_at: completed_at,
    };
    if (error) {
      update.error = _sanitizeError(error);
    }

    entries[idx] = Object.assign({}, existing, update);

    _writeLedger(ledgerPath, entries);

    const returnedOpId = existing.operation_id != null ? existing.operation_id : operation_id;
    return { status: 'ok', operation_id: returnedOpId, entry: entries[idx] };
  } finally {
    _releaseLock(lockPath, lockHandle);
  }
}

function skip(dir, prefix, agent, phase, model, attempt) {
  if (attempt == null) attempt = 1;

  const ledgerPath = path.join(dir, prefix + '-token-ledger.json');
  const lockPath   = ledgerPath + '.lock';

  const lockHandle = _acquireLock(lockPath);
  try {
    const { entries }  = _readLedger(ledgerPath);
    const operation_id = computeOperationId(prefix, agent, attempt);

    // Primary lookup: by operation_id (deterministic, unambiguous)
    let idx = entries.findIndex(function (e) {
      return e.operation_id === operation_id;
    });

    // Fallback: by agent name — only when no exact operation_id match
    if (idx === -1) {
      const agentIndexes = [];
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].agent === agent) agentIndexes.push(i);
      }
      if (agentIndexes.length > 1) {
        throw new Error(
          'skip: ambiguous agent fallback — ' + agentIndexes.length +
          ' entries match agent "' + agent + '" in ' + ledgerPath
        );
      }
      if (agentIndexes.length === 1) {
        idx = agentIndexes[0];
      }
    }

    if (idx === -1) {
      // Case 1: NO existing match — atomically create a new terminal skipped entry.
      // started_at and completed_at are set to the same timestamp (AC-23).
      const ts = new Date().toISOString();
      entries.push({
        operation_id:       operation_id,
        agent:              agent,
        phase:              phase,
        model:              model,
        status:             'skipped',
        started_at:         ts,
        completed_at:       ts,
        phase_delta_tokens: null,
      });

      _writeLedger(ledgerPath, entries);

      return { status: 'ok', operation_id: operation_id, entry: entries[entries.length - 1] };
    }

    // Case 2: EXACTLY ONE match — update in place, preserving started_at and all other fields.
    const existing = entries[idx];
    _assertUnowned(existing);
    const completed_at = new Date().toISOString();

    entries[idx] = Object.assign({}, existing, {
      status:       'skipped',
      completed_at: completed_at,
    });

    _writeLedger(ledgerPath, entries);

    const returnedOpId = existing.operation_id != null ? existing.operation_id : operation_id;
    return { status: 'ok', operation_id: returnedOpId, entry: entries[idx] };
  } finally {
    _releaseLock(lockPath, lockHandle);
  }
}

// ── finalizeActivity (INFRA-TASK-BE-02) ──────────────────────────────────────
//
// Additive terminal-state API used by the executor. Unlike close()/fail()/skip(),
// it requires an exact operation_id match (no name-only agent fallback), can
// record tokens on ANY terminal status (including 'failed'), accepts an optional
// usage_reason (additive ledger field, NOT an open() metadata whitelist key),
// and is replay-safe: finalizing an already-terminal entry with identical data
// is a no-op that returns the existing entry unchanged, while conflicting data
// fails closed without writing. It does not introduce a second ledger file or
// a duplicate token counter — it reuses phase_delta_tokens like close()/fail().

const FINALIZE_STATUSES = new Set(['done', 'failed', 'skipped']);
const TERMINAL_STATUSES = new Set(['done', 'failed', 'skipped']);

function finalizeActivity(dir, prefix, agent, attempt, options) {
  if (attempt == null) attempt = 1;
  options = options || {};

  const status        = options.status;
  const tokens         = (options.tokens === undefined) ? null : options.tokens;
  const reason         = options.reason;
  const completedAtArg = options.completedAt;

  if (!FINALIZE_STATUSES.has(status)) {
    const err = new Error(
      'finalizeActivity: status must be one of "done", "failed", "skipped"; got ' +
      JSON.stringify(status)
    );
    err.code = 'INVALID_STATUS';
    throw err;
  }

  const ledgerPath = path.join(dir, prefix + '-token-ledger.json');
  const lockPath   = ledgerPath + '.lock';

  const lockHandle = _acquireLock(lockPath);
  try {
    const { entries }  = _readLedger(ledgerPath);
    const operation_id = computeOperationId(prefix, agent, attempt);

    // Exact-ID lookup only — no name-only agent fallback (unlike close/fail/skip).
    const idx = entries.findIndex(function (e) {
      return e.operation_id === operation_id;
    });

    if (idx === -1) {
      const err = new Error(
        'finalizeActivity: no entry found for operation_id ' + operation_id +
        ' in ' + ledgerPath + ' — exact operation_id match required, ' +
        'no name-only fallback; operation was never opened'
      );
      err.code = 'ACTIVITY_NOT_FOUND';
      err.operation_id = operation_id;
      throw err;
    }

    const existing = entries[idx];
    _assertUnowned(existing);

    const suppliedTokens = (tokens === undefined) ? null : tokens;
    const suppliedReason = (reason === undefined) ? null : reason;

    if (TERMINAL_STATUSES.has(existing.status)) {
      // Already finalized: this is either an idempotent replay of identical
      // data (return unchanged, no write) or conflicting data (fail closed).
      const existingTokens = (existing.phase_delta_tokens === undefined)
        ? null : existing.phase_delta_tokens;
      const existingReason = (existing.usage_reason === undefined)
        ? null : existing.usage_reason;
      const effectiveCompletedAt = (completedAtArg != null)
        ? completedAtArg : existing.completed_at;

      const isIdentical =
        existing.status === status &&
        existingTokens === suppliedTokens &&
        existingReason === suppliedReason &&
        existing.completed_at === effectiveCompletedAt;

      if (isIdentical) {
        return { status: 'ok', operation_id: operation_id, entry: existing, replay: true };
      }

      const err = new Error(
        'finalizeActivity: conflicting terminal data for operation_id ' + operation_id +
        ' in ' + ledgerPath + ' — existing terminal entry differs from the supplied ' +
        'status/tokens/reason/completedAt; refusing to overwrite (fail-closed)'
      );
      err.code = 'TERMINAL_CONFLICT';
      err.operation_id = operation_id;
      throw err;
    }

    // Not yet terminal: finalize it. Tokens are recorded even when status is
    // 'failed' — first finalization records known tokens, or null plus an
    // optional usage_reason explaining why usage is unavailable. Matching the
    // close() token-preservation invariant: a null/undefined supplied value
    // never clobbers an already-stored positive phase_delta_tokens.
    const completed_at = (completedAtArg != null) ? completedAtArg : new Date().toISOString();

    let phase_delta_tokens = existing.phase_delta_tokens;
    if (suppliedTokens !== null) {
      phase_delta_tokens = suppliedTokens;
    }

    const update = {
      status:             status,
      completed_at:       completed_at,
      phase_delta_tokens: phase_delta_tokens,
    };
    if (reason !== undefined) {
      update.usage_reason = reason;
    }

    // Merge update: Object.assign preserves unknown/legacy fields and metadata verbatim.
    entries[idx] = Object.assign({}, existing, update);

    _writeLedger(ledgerPath, entries);

    return { status: 'ok', operation_id: operation_id, entry: entries[idx] };
  } finally {
    _releaseLock(lockPath, lockHandle);
  }
}

// Workflow-owned entries cannot be finalized by worker/legacy CLI calls.
function _assertUnowned(entry) {
  if (entry && entry.workflow_owner) {
    const error = new Error('Workflow entry requires its owner capability');
    error.code = 'LEDGER_OWNER_REQUIRED';
    throw error;
  }
}

function openOwned(dir, prefix, agent, phase, model, owner, metadata) {
  if (typeof owner !== 'string' || !owner) throw new Error('Workflow owner required');
  if (metadata) _validateMetadata(metadata);
  const ledgerPath = path.join(dir, prefix + '-token-ledger.json');
  const lockPath = ledgerPath + '.lock';
  const handle = _acquireLock(lockPath);
  try {
    const { entries } = _readLedger(ledgerPath);
    const operation_id = computeOperationId(prefix, agent, 1);
    if (entries.some(e => e.operation_id === operation_id)) throw new Error('Owned operation already opened');
    const entry = { operation_id, agent, phase, model, workflow_owner: owner,
      status: 'running', started_at: new Date().toISOString(), completed_at: null, phase_delta_tokens: null };
    if (metadata) Object.assign(entry, metadata);
    entries.push(entry);
    _writeLedger(ledgerPath, entries);
    return entry;
  } finally { _releaseLock(lockPath, handle); }
}

function finalizeOwned(dir, prefix, agent, owner, status, error, tokens) {
  if (!['done', 'failed', 'skipped'].includes(status)) throw new Error('Invalid owned terminal status');
  const ledgerPath = path.join(dir, prefix + '-token-ledger.json');
  const lockPath = ledgerPath + '.lock';
  const handle = _acquireLock(lockPath);
  try {
    const { entries } = _readLedger(ledgerPath);
    const id = computeOperationId(prefix, agent, 1);
    const entry = entries.find(e => e.operation_id === id);
    if (!entry || !owner || entry.workflow_owner !== owner) throw new Error('Ledger ownership mismatch');
    if (entry.status !== 'running') throw new Error('Owned terminal transition conflict');
    if (tokens != null && (!Number.isInteger(tokens) || tokens <= 0)) throw new Error('Invalid owned token measurement');
    if (tokens != null) entry.phase_delta_tokens = tokens;
    entry.status = status;
    entry.completed_at = new Date().toISOString();
    if (error) entry.error = _sanitizeError(error);
    _writeLedger(ledgerPath, entries);
    return entry;
  } finally { _releaseLock(lockPath, handle); }
}


module.exports = {
  openOwned,
  finalizeOwned,
  open,
  close,
  fail,
  skip,
  finalizeActivity,
  computeOperationId,
  _readLedger,
  _writeLedger,
  _backupCorruptFile,
  _acquireLock,
  _releaseLock,
  _isLockStale,
  _confirmSameOwnerProcess,
  _getSelfProcessStartTime,
  _resetOwnerProcessCaches,
  _validateMetadata,
  _extractStoredMetadata,
  _metadataEqual,
  METADATA_WHITELIST,
  RESERVED_FIELDS,
};
