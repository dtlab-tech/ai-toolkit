'use strict';

// Git checkpoint/integration module skeleton (FTR-018, INFRA-TASK-BE-03).
//
// Real implementation: checkpoint intent persistence (US-05-TASK-BE-01),
// controlled staging with path enumeration (US-05-TASK-BE-02), commit
// creation with task trailers (US-05-TASK-BE-03), SHA registration outside
// the tracked worktree (US-05-TASK-BE-04), commit/ledger reconciliation and
// task completion (US-05-TASK-BE-05), and serialized parallel integration
// (US-08-TASK-BE-03). See FTR-018-Tech-Spec.md section 8.
//
// This file is a placeholder so lib/task-executor/index.js can require() a
// stable module surface before those tasks land. Every export throws
// NOT_IMPLEMENTED — do not add real Git logic here.

function _notImplemented(fnName, task) {
  const err = new Error(
    'git.' + fnName + ' is NOT_IMPLEMENTED — see Work Breakdown task ' + task
  );
  err.code = 'NOT_IMPLEMENTED';
  err.task = task;
  throw err;
}

function checkpoint() {
  _notImplemented('checkpoint', 'US-05-TASK-BE-01');
}

function integrate() {
  _notImplemented('integrate', 'US-08-TASK-BE-03');
}

module.exports = {
  checkpoint,
  integrate,
};
