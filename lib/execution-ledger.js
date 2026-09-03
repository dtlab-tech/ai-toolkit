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
  const parsed = JSON.parse(raw);
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
  const sidecarName = base + '.corrupt-' + Date.now();
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
  throw new Error('not implemented');
}

function close(dir, prefix, agent, tokens, attempt) {
  throw new Error('not implemented');
}

function fail(dir, prefix, agent, error, attempt) {
  throw new Error('not implemented');
}

function skip(dir, prefix, agent, phase, model, attempt) {
  throw new Error('not implemented');
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
