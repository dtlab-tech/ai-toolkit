'use strict';

// Ownership/lease module (FTR-018).
//
// Repo-wide execution lease protocol (US-02-TASK-BE-01): acquireLease,
// releaseLease, readLease. owner.json is the single exclusive-coordinator
// marker for an execution root (<absolute-common-git-dir>/ai-toolkit/
// execution/owner.json, per FTR-018-Tech-Spec.md section 5). Unlike
// runs/<runId>/state.json, this file is not keyed by runId: at most one
// lease may exist for the whole repo at any time, regardless of which
// feature/run is trying to acquire it.
//
// Stale lock detection via process liveness (checkOwnerLiveness) is
// US-02-TASK-BE-02 — implemented below. It reuses the E-02 evidence-spike
// technique verified in
// internal_docs/features/FTR-018-deterministic-task-execution-checkpoints-and-resume/evidence/E-02-process-supervision/:
// worker identity is `host:pid:startTime` (never bare pid — a pid can be
// recycled by the OS for an unrelated process, so start-time is the
// anti-reuse guard), and Windows liveness is confirmed via a
// `Get-CimInstance Win32_Process` query matching pid AND exact start time.
// checkOwnerLiveness only ever reports positive evidence: 'alive: false'
// requires a confirmed-dead process query result, never age/staleness
// alone; anything inconclusive (host mismatch, non-Windows, unreadable
// start time, failed OS query) is reported as 'alive: unknown' and must
// never be treated as a reclaim signal.
//
// The atomic compare-and-swap ownership guard used by actual reclaim
// (createOwnershipGuard, US-02-TASK-BE-03) is implemented below. It guards a
// multi-step transition (read lease -> check liveness -> reclaim) with an
// exclusive `mkdir` on <executionRoot>/ownership-guard (per
// FTR-018-Tech-Spec.md section 5), the same atomicity spirit as the 'wx'
// exclusive-create pattern used for the lease file itself, but for a
// transition rather than a single file write. reclaimLease only ever
// recovers a lease that checkOwnerLiveness has positively confirmed dead
// (alive === false) — 'unknown' and true are both refused, per the Gate-1
// binding constraint carried into this Work Breakdown ("no implicit
// cross-platform guarantee", "never invent missing values"). Full stale
// recovery (cross-checking all registered workers per
// FTR-018-Tech-Spec.md section 5) is out of scope here; that belongs to the
// worker-registration tasks in US-03.

const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

function _err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function _requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw _err('LEASE_VALIDATION_ERROR', label + ' must be a non-empty string');
  }
}

function _leaseFilePath(executionRoot) {
  return path.join(executionRoot, 'owner.json');
}

const GUARD_DIR_NAME = 'ownership-guard';

function _guardDirPath(executionRoot) {
  return path.join(executionRoot, GUARD_DIR_NAME);
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
    // (notably Windows). Best-effort only.
  } finally {
    if (dfd !== undefined) {
      try { fs.closeSync(dfd); } catch (_) {}
    }
  }
}

// Exclusive create: fails with EEXIST if the file already exists. This is
// the atomic primitive that prevents two concurrent acquireLease() calls
// from both succeeding — unlike store.js's temp-file-then-rename pattern
// (which makes *replacing* a file atomic), a lock needs the *first create*
// itself to be exclusive, which is exactly what the 'wx' flag guarantees.
function _createExclusiveSync(filePath, contents) {
  const fd = fs.openSync(filePath, 'wx');
  try {
    fs.writeSync(fd, contents);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

// Same-directory exclusive temp file, complete write, flush, close, rename,
// directory flush where supported. Mirrors the atomic-write protocol used by
// store.js's _atomicWriteFileSync — used here to atomically *replace* an
// existing lease file (reclaim), as opposed to _createExclusiveSync above
// which atomically creates a lease file that must not already exist.
function _atomicReplaceFileSync(filePath, contents) {
  const dir = path.dirname(filePath);
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

function _isWindows() {
  return process.platform === 'win32';
}

// Queries the OS for the current creation time of `pid`, using the same
// technique verified in the E-02 evidence spike (Windows-qualified only —
// see harness-treekill-dedup.js / harness-registration-window.js):
// `Get-CimInstance Win32_Process` filtered by ProcessId, reading
// CreationDate as a file-time-UTC integer so two captures of the same
// still-running process compare exactly equal.
//
// Returns:
//   - { found: true, startTime: '<fileTimeUtc digits>' }  — pid exists, start time read
//   - { found: false }                                     — OS confirms no such pid (positive dead evidence)
//   - null                                                 — query is not trustworthy (non-Windows, pid not a
//     safe integer, powershell unavailable/failed, or unexpected output) — callers MUST treat this as
//     inconclusive, never as evidence of death.
function _queryProcessStartTimeSync(pid) {
  if (!_isWindows()) return null;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return null;

  let result;
  try {
    result = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$p = Get-CimInstance Win32_Process -Filter "ProcessId=' + pid + '" -ErrorAction SilentlyContinue; ' +
          'if ($p) { $p.CreationDate.ToFileTimeUtc() } else { "NOTFOUND" }',
      ],
      { encoding: 'utf8', windowsHide: true }
    );
  } catch (_) {
    return null;
  }

  if (!result || result.error || result.status !== 0 || typeof result.stdout !== 'string') {
    return null;
  }

  const out = result.stdout.trim();
  if (out === 'NOTFOUND') return { found: false };
  if (/^-?\d+$/.test(out)) return { found: true, startTime: out };
  return null; // unexpected output shape — cannot be trusted either way
}

function _readLeaseFileSync(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw _err('LEASE_CORRUPTED', 'lease file at ' + filePath + ' is corrupted: ' + err.message);
  }
}

/**
 * Acquires the single repo-wide execution lease for `executionRoot`.
 *
 * Fails closed with LEASE_HELD if a lease already exists — this task does
 * not implement stale-lease recovery (see US-02-TASK-BE-02/03); a second
 * coordinator must stop with a structured diagnosis rather than duplicate
 * work (AC-08).
 *
 * @param {string} executionRoot - Absolute path to
 *   <common-git-dir>/ai-toolkit/execution.
 * @param {string} runId - UUID of the run requesting ownership.
 * @param {object} [opts]
 * @param {string} [opts.host] - Override for host identity (defaults to
 *   os.hostname()); exposed for tests, real callers should omit it.
 * @param {number} [opts.pid] - Override for process identity (defaults to
 *   process.pid); exposed for tests, real callers should omit it.
 * @returns {{nonce:string, host:string, pid:number, runId:string,
 *   generation:number, acquiredAt:string, startTime:?string}}
 *
 * NOTE (US-02-TASK-BE-02 schema extension): `startTime` is captured here so
 * checkOwnerLiveness can later confirm this exact process (not a
 * pid-recycled impostor) is still the lease holder — see the E-02 evidence
 * spike technique referenced at the top of this file. It is a Windows
 * file-time-UTC string on Windows, or `null` when start time could not be
 * captured (non-Windows platform, or the OS query failed) — a `null`
 * startTime makes checkOwnerLiveness return 'unknown' rather than 'alive',
 * never 'dead'. This field is new and pre-implementation-only (no released
 * lease files exist yet to be backward-compatible with).
 */
function acquireLease(executionRoot, runId, opts) {
  _requireNonEmptyString(executionRoot, 'acquireLease: executionRoot');
  _requireNonEmptyString(runId, 'acquireLease: runId');
  opts = opts || {};

  _ensureDirSync(executionRoot);
  const filePath = _leaseFilePath(executionRoot);

  const leasePid = opts.pid != null ? opts.pid : process.pid;
  const startTimeProbe = _queryProcessStartTimeSync(leasePid);

  const lease = {
    nonce:      crypto.randomBytes(16).toString('hex'),
    host:       opts.host || os.hostname(),
    pid:        leasePid,
    runId:      runId,
    generation: 0,
    acquiredAt: new Date().toISOString(),
    startTime:  startTimeProbe && startTimeProbe.found ? startTimeProbe.startTime : null,
  };

  try {
    _createExclusiveSync(filePath, JSON.stringify(lease, null, 2));
  } catch (err) {
    if (err.code === 'EEXIST') {
      const existing = _readLeaseFileSync(filePath);
      const e = _err(
        'LEASE_HELD',
        'acquireLease: a repo-wide execution lease is already held' +
          (existing
            ? ' by runId "' + existing.runId + '" (host ' + existing.host + ', pid ' + existing.pid + ')'
            : ' but the existing lease file could not be read')
      );
      e.existingLease = existing;
      throw e;
    }
    throw err;
  }

  _fsyncDirSync(executionRoot);

  const readBack = _readLeaseFileSync(filePath);
  if (!readBack || readBack.nonce !== lease.nonce) {
    throw _err(
      'LEASE_READBACK_MISMATCH',
      'acquireLease: readback verification failed for runId "' + runId + '"'
    );
  }
  return readBack;
}

/**
 * Releases the repo-wide execution lease, but only if the caller's identity
 * (runId + nonce, both as returned by acquireLease) matches the lease
 * currently on disk. Never removes a lease belonging to a different holder
 * — normal entrants must not unlink another owner's lease.
 *
 * @param {string} executionRoot
 * @param {string} runId
 * @param {string} nonce
 * @returns {true}
 */
function releaseLease(executionRoot, runId, nonce) {
  _requireNonEmptyString(executionRoot, 'releaseLease: executionRoot');
  _requireNonEmptyString(runId, 'releaseLease: runId');
  _requireNonEmptyString(nonce, 'releaseLease: nonce');

  const filePath = _leaseFilePath(executionRoot);
  const existing = _readLeaseFileSync(filePath);

  if (!existing) {
    throw _err('LEASE_NOT_FOUND', 'releaseLease: no lease found at ' + filePath);
  }
  if (existing.runId !== runId || existing.nonce !== nonce) {
    throw _err(
      'LEASE_NOT_OWNER',
      'releaseLease: caller (runId "' + runId + '") does not hold the current lease ' +
        '(held by runId "' + existing.runId + '")'
    );
  }

  fs.unlinkSync(filePath);
  _fsyncDirSync(executionRoot);
  return true;
}

/**
 * Read-only accessor: returns the current lease contents, or null if no
 * lease is held. Never mutates state.
 *
 * @param {string} executionRoot
 * @returns {?object}
 */
function readLease(executionRoot) {
  _requireNonEmptyString(executionRoot, 'readLease: executionRoot');
  return _readLeaseFileSync(_leaseFilePath(executionRoot));
}

/**
 * Creates an ownership guard bound to `executionRoot`: a handle providing an
 * exclusive, atomic "transition" primitive over the SAME executionRoot the
 * lease lives in (<executionRoot>/ownership-guard, per
 * FTR-018-Tech-Spec.md section 5). Any multi-step ownership transition
 * (read lease -> check liveness -> reclaim) must run inside guard.transition()
 * so no two transitions can interleave.
 *
 * The exclusivity primitive is `fs.mkdirSync` with no `{recursive: true}` on
 * the guard directory: mkdir on an already-existing path throws EEXIST
 * atomically (same spirit as this module's 'wx' exclusive-create pattern for
 * the lease file, but guarding a transition rather than a single write).
 *
 * @param {string} executionRoot
 * @returns {{transition: function(function(): *): *}}
 */
function createOwnershipGuard(executionRoot) {
  _requireNonEmptyString(executionRoot, 'createOwnershipGuard: executionRoot');
  const guardDir = _guardDirPath(executionRoot);

  return {
    /**
     * Runs `fn` under the guard's exclusive lock. Fails closed with
     * GUARD_HELD (without calling `fn`) if another transition already holds
     * the guard — this failure is never swallowed. The guard directory is
     * always released (best-effort rmdir) in a `finally`, including when
     * `fn` throws, so a crash mid-transition never leaves the lock behind
     * forever; the rmdir itself is wrapped so a cleanup failure can never
     * mask fn's own result/error.
     *
     * @param {function(): *} fn
     * @returns {*} fn's return value
     */
    transition(fn) {
      _ensureDirSync(executionRoot);
      try {
        fs.mkdirSync(guardDir);
      } catch (err) {
        if (err.code === 'EEXIST') {
          throw _err(
            'GUARD_HELD',
            'createOwnershipGuard: another ownership transition is already in progress at ' + guardDir
          );
        }
        throw err;
      }

      try {
        return fn();
      } finally {
        try {
          fs.rmdirSync(guardDir);
        } catch (_) {
          // Best-effort cleanup only, mirroring _fsyncDirSync's discipline
          // elsewhere in this file: a cleanup failure here must never mask
          // fn's own return value or thrown error.
        }
      }
    },
  };
}

/**
 * Reclaims the repo-wide execution lease for `newRunId`, but only when the
 * current holder (if any) is positively confirmed dead by
 * checkOwnerLiveness. The whole read -> check -> write sequence runs inside
 * a single createOwnershipGuard(executionRoot).transition() call so no other
 * reclaim/acquire/release attempt can interleave with it.
 *
 * Behavior:
 *   1. No lease currently held: this degenerates into a normal first
 *      acquisition — delegates to acquireLease(executionRoot, newRunId,
 *      opts), still performed inside the guard's exclusive lock.
 *   2. A lease exists: checkOwnerLiveness(existingLease) is consulted.
 *      - alive === false (confirmed dead): proceed to reclaim (step 3).
 *      - alive === true: throw LEASE_STILL_LIVE — never reclaim a live
 *        owner.
 *      - alive === 'unknown': throw LEASE_LIVENESS_UNKNOWN — never reclaim
 *        on an inconclusive check (host mismatch, non-Windows, missing
 *        startTime, failed OS query); age alone is never sufficient
 *        evidence.
 *   3. Confirmed dead: atomically replaces the lease file with a new lease
 *      for `newRunId`. generation is the old lease's generation + 1 (0 if
 *      the existing lease had no valid non-negative-integer generation —
 *      the simplest rule that still always increases monotonically from
 *      whatever was last recorded).
 *   4. Reads the new lease back and verifies its nonce matches what was
 *      just written (same discipline as acquireLease), throwing
 *      LEASE_READBACK_MISMATCH if it does not.
 *
 * @param {string} executionRoot
 * @param {string} newRunId - UUID of the run requesting reclaim.
 * @param {object} [opts]
 * @param {string} [opts.host] - Override for host identity (tests only).
 * @param {number} [opts.pid] - Override for process identity (tests only).
 * @returns {object} the new lease, as read back from disk.
 */
function reclaimLease(executionRoot, newRunId, opts) {
  _requireNonEmptyString(executionRoot, 'reclaimLease: executionRoot');
  _requireNonEmptyString(newRunId, 'reclaimLease: newRunId');
  opts = opts || {};

  const guard = createOwnershipGuard(executionRoot);

  return guard.transition(function () {
    const filePath = _leaseFilePath(executionRoot);
    const existing = _readLeaseFileSync(filePath);

    if (!existing) {
      return acquireLease(executionRoot, newRunId, opts);
    }

    const liveness = checkOwnerLiveness(existing, opts);
    if (liveness.alive !== false) {
      const code = liveness.alive === true ? 'LEASE_STILL_LIVE' : 'LEASE_LIVENESS_UNKNOWN';
      throw _err(
        code,
        'reclaimLease: refusing to reclaim lease held by runId "' + existing.runId + '" ' +
          '(host ' + existing.host + ', pid ' + existing.pid + ') — ' + liveness.reason
      );
    }

    const nextGeneration = Number.isInteger(existing.generation) && existing.generation >= 0
      ? existing.generation + 1
      : 0;

    const newPid = opts.pid != null ? opts.pid : process.pid;
    const startTimeProbe = _queryProcessStartTimeSync(newPid);

    const newLease = {
      nonce:      crypto.randomBytes(16).toString('hex'),
      host:       opts.host || os.hostname(),
      pid:        newPid,
      runId:      newRunId,
      generation: nextGeneration,
      acquiredAt: new Date().toISOString(),
      startTime:  startTimeProbe && startTimeProbe.found ? startTimeProbe.startTime : null,
    };

    _atomicReplaceFileSync(filePath, JSON.stringify(newLease, null, 2));
    _fsyncDirSync(executionRoot);

    const readBack = _readLeaseFileSync(filePath);
    if (!readBack || readBack.nonce !== newLease.nonce) {
      throw _err(
        'LEASE_READBACK_MISMATCH',
        'reclaimLease: readback verification failed for runId "' + newRunId + '"'
      );
    }
    return readBack;
  });
}

/**
 * Determines whether the process that recorded `lease` (as returned by
 * acquireLease/readLease) is still the same live process, using the
 * host:pid:startTime identity technique proven in the E-02 evidence spike
 * (see the file-level comment above and
 * internal_docs/features/FTR-018-deterministic-task-execution-checkpoints-and-resume/evidence/E-02-process-supervision/).
 *
 * This function NEVER infers death from age/staleness — only from a
 * positive OS process-query result. Any condition that prevents a
 * conclusive check (remote host, unsupported platform, missing startTime,
 * a failed/untrusted OS query) yields `alive: 'unknown'`, which callers
 * (reclaimLease, US-02-TASK-BE-03) must treat as "do not recover" — the
 * same as `alive: true`. Only `alive: false` may ever justify recovery.
 *
 * Windows-only real check (per the Gate-1 E-02 qualification): on any
 * other `process.platform`, this always returns `alive: 'unknown'` with an
 * explanatory reason instead of attempting an unproven POSIX check.
 *
 * @param {{host:string, pid:number, startTime:?string}} lease - Lease
 *   object as returned by acquireLease/readLease.
 * @param {object} [opts]
 * @param {string} [opts.host] - Override for the current host identity
 *   (defaults to os.hostname()); exposed for tests.
 * @returns {{alive: true|false|'unknown', reason: string}}
 */
function checkOwnerLiveness(lease, opts) {
  opts = opts || {};

  if (!lease || typeof lease !== 'object') {
    throw _err('LEASE_VALIDATION_ERROR', 'checkOwnerLiveness: lease must be a non-empty object');
  }

  const currentHost = opts.host || os.hostname();

  if (lease.host !== currentHost) {
    return {
      alive: 'unknown',
      reason:
        'lease host "' + lease.host + '" does not match current host "' + currentHost +
        '"; a remote host\'s processes cannot be queried locally',
    };
  }

  if (!_isWindows()) {
    return {
      alive: 'unknown',
      reason:
        'process liveness checking is only qualified on Windows (E-02 evidence spike); ' +
        'this platform ("' + process.platform + '") has no qualified liveness mechanism yet',
    };
  }

  if (typeof lease.pid !== 'number' || !Number.isInteger(lease.pid) || lease.pid <= 0) {
    return { alive: 'unknown', reason: 'lease.pid is missing or not a valid process id; cannot query process identity' };
  }

  if (typeof lease.startTime !== 'string' || lease.startTime.length === 0) {
    return {
      alive: 'unknown',
      reason:
        'lease has no recorded startTime (captured before this identity check existed, or capture ' +
        'failed at acquireLease time); a bare pid is not a safe identity check because pids can be ' +
        'recycled by the OS, so liveness cannot be conclusively determined',
    };
  }

  const probe = _queryProcessStartTimeSync(lease.pid);

  if (probe === null) {
    return {
      alive: 'unknown',
      reason: 'the OS process query failed or returned an untrusted result; liveness cannot be conclusively determined',
    };
  }

  if (probe.found === false) {
    return {
      alive: false,
      reason: 'no process with pid ' + lease.pid + ' exists on host "' + currentHost + '" (confirmed via OS process query)',
    };
  }

  if (probe.startTime === lease.startTime) {
    return {
      alive: true,
      reason:
        'pid ' + lease.pid + ' is running on host "' + currentHost + '" with a start time matching the ' +
        'recorded lease (host:pid:startTime identity confirmed)',
    };
  }

  return {
    alive: false,
    reason:
      'pid ' + lease.pid + ' exists but its current start time (' + probe.startTime + ') differs from the ' +
      'recorded lease start time (' + lease.startTime + '); this is a different process reusing a recycled ' +
      'pid, confirmed via OS process query',
  };
}

module.exports = {
  acquireLease,
  releaseLease,
  readLease,
  reclaimLease,
  checkOwnerLiveness,
  createOwnershipGuard,
};
