'use strict';

// Ownership/lease module skeleton (FTR-018, INFRA-TASK-BE-03).
//
// Real implementation: repo-wide execution lease acquire/release
// (US-02-TASK-BE-01), stale lock detection via process liveness checks
// (US-02-TASK-BE-02), and the atomic ownership-guard primitive that all
// lease transitions go through (US-02-TASK-BE-03). See
// FTR-018-Tech-Spec.md section 5.
//
// This file is a placeholder so lib/task-executor/index.js can require() a
// stable module surface before those tasks land. Every export throws
// NOT_IMPLEMENTED — do not add real lease logic here.

function _notImplemented(fnName, task) {
  const err = new Error(
    'ownership.' + fnName + ' is NOT_IMPLEMENTED — see Work Breakdown task ' + task
  );
  err.code = 'NOT_IMPLEMENTED';
  err.task = task;
  throw err;
}

function acquireLease() {
  _notImplemented('acquireLease', 'US-02-TASK-BE-01');
}

function releaseLease() {
  _notImplemented('releaseLease', 'US-02-TASK-BE-01');
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
  reclaimLease,
  checkWorkerLiveness,
};
