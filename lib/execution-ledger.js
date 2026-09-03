'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');

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
  return { entries: Array.isArray(parsed) ? parsed : [] };
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

  try {
    fs.renameSync(tmpPath, ledgerPath);
  } catch (err) {
    if (err.code === 'EEXIST' || err.code === 'EPERM') {
      try { fs.unlinkSync(ledgerPath); } catch (_) {}
      fs.renameSync(tmpPath, ledgerPath);
    } else {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      throw err;
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
      const ownerToken = { pid: process.pid, startedAt, nonce };
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

    if (ownerAlive) {
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

// ── Public API (stubs — implemented by INFRA-TASK-BE-02 and US-0x tasks) ────

function computeOperationId(prefix, agent, attempt) {
  const input = JSON.stringify([prefix, agent, attempt]);
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 32);
}

function open(dir, prefix, agent, phase, model, attempt) {
  if (attempt == null) attempt = 1;

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
      // Resume: idempotently preserve original started_at and any positive
      // phase_delta_tokens — only reset status to running.
      entries[existingIndex] = Object.assign({}, entries[existingIndex], { status: 'running' });
    } else {
      entries.push({
        operation_id:       operation_id,
        agent:              agent,
        phase:              phase,
        model:              model,
        status:             'running',
        started_at:         started_at,
        completed_at:       null,
        phase_delta_tokens: null,
      });
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

    const existing     = entries[idx];
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

    const existing     = entries[idx];
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
    const existing     = entries[idx];
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

module.exports = {
  open,
  close,
  fail,
  skip,
  computeOperationId,
  _readLedger,
  _writeLedger,
  _backupCorruptFile,
  _acquireLock,
  _releaseLock,
  _isLockStale,
};
