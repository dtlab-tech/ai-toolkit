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
// US-02-TASK-BE-02; the atomic compare-and-swap ownership guard used by
// reclaim (createOwnershipGuard) is US-02-TASK-BE-03. Neither exists yet,
// so acquireLease fails closed on any existing lease instead of attempting
// recovery, and reclaimLease/checkWorkerLiveness below remain
// NOT_IMPLEMENTED placeholders — do not add real reclaim/liveness logic
// here.

const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const crypto = require('crypto');

function _err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function _notImplemented(fnName, task) {
  const err = new Error(
    'ownership.' + fnName + ' is NOT_IMPLEMENTED — see Work Breakdown task ' + task
  );
  err.code = 'NOT_IMPLEMENTED';
  err.task = task;
  throw err;
}

function _requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw _err('LEASE_VALIDATION_ERROR', label + ' must be a non-empty string');
  }
}

function _leaseFilePath(executionRoot) {
  return path.join(executionRoot, 'owner.json');
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
 *   generation:number, acquiredAt:string}}
 */
function acquireLease(executionRoot, runId, opts) {
  _requireNonEmptyString(executionRoot, 'acquireLease: executionRoot');
  _requireNonEmptyString(runId, 'acquireLease: runId');
  opts = opts || {};

  _ensureDirSync(executionRoot);
  const filePath = _leaseFilePath(executionRoot);

  const lease = {
    nonce:      crypto.randomBytes(16).toString('hex'),
    host:       opts.host || os.hostname(),
    pid:        opts.pid != null ? opts.pid : process.pid,
    runId:      runId,
    generation: 0,
    acquiredAt: new Date().toISOString(),
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

function reclaimLease() {
  _notImplemented('reclaimLease', 'US-02-TASK-BE-02');
}

function checkWorkerLiveness() {
  _notImplemented('checkWorkerLiveness', 'US-02-TASK-BE-02');
}

module.exports = {
  acquireLease,
  releaseLease,
  readLease,
  reclaimLease,
  checkWorkerLiveness,
};
