'use strict';

// Plan parser/scheduler module skeleton (FTR-018, INFRA-TASK-BE-03).
//
// Real implementation: lossless MD task-detail parsing (US-01-TASK-BE-01),
// CSV parsing and phase-task mapping (US-01-TASK-BE-02), DAG validation and
// cycle detection (US-01-TASK-BE-03), content digest and immutable plan
// snapshot (US-01-TASK-BE-04), and the stable Kahn topological scheduler
// (US-01-TASK-BE-05). See FTR-018-Tech-Spec.md section 4.
//
// This file is a placeholder so lib/task-executor/index.js can require() a
// stable module surface before those tasks land. Every export throws
// NOT_IMPLEMENTED — do not add real parsing/scheduling logic here.

function _notImplemented(fnName, task) {
  const err = new Error(
    'plan.' + fnName + ' is NOT_IMPLEMENTED — see Work Breakdown task ' + task
  );
  err.code = 'NOT_IMPLEMENTED';
  err.task = task;
  throw err;
}

function parsePlan() {
  _notImplemented('parsePlan', 'US-01-TASK-BE-01');
}

function computeDigest() {
  _notImplemented('computeDigest', 'US-01-TASK-BE-04');
}

function buildReadyQueue() {
  _notImplemented('buildReadyQueue', 'US-01-TASK-BE-05');
}

module.exports = {
  parsePlan,
  computeDigest,
  buildReadyQueue,
};
