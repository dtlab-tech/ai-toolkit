'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');

// ── Internal I/O helpers (stubs — implemented by INFRA-TASK-BE-03) ──────────

function _readLedger(ledgerPath) {
  throw new Error('not implemented');
}

function _writeLedger(ledgerPath, entries) {
  throw new Error('not implemented');
}

function _backupCorruptFile(ledgerPath) {
  throw new Error('not implemented');
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
  throw new Error('not implemented');
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
