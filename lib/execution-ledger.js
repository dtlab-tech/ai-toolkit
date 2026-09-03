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

// ── Internal lock helpers (stubs — implemented by INFRA-TASK-BE-04/05) ──────

function _acquireLock(lockPath, opts) {
  throw new Error('not implemented');
}

function _releaseLock(lockPath, handle) {
  throw new Error('not implemented');
}

function _isLockStale(content, stat) {
  throw new Error('not implemented');
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
