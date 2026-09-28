'use strict';

// Claude subprocess adapter module skeleton (FTR-018, INFRA-TASK-BE-03).
//
// Real implementation: asynchronous Claude CLI subprocess adapter with
// qualified executable resolution (US-03-TASK-BE-01), agent provenance
// verification per the FTR-017 contract (US-03-TASK-BE-02), task dispatch
// orchestration with ownership coordination (US-03-TASK-BE-03), and result
// capture/immediate telemetry persistence (US-03-TASK-BE-04). See
// FTR-018-Tech-Spec.md sections 3 and 7.
//
// This file is a placeholder so lib/task-executor/index.js can require() a
// stable module surface before those tasks land. Every export throws
// NOT_IMPLEMENTED — do not add real subprocess logic here.

function _notImplemented(fnName, task) {
  const err = new Error(
    'claude-process.' + fnName + ' is NOT_IMPLEMENTED — see Work Breakdown task ' + task
  );
  err.code = 'NOT_IMPLEMENTED';
  err.task = task;
  throw err;
}

function dispatchTask() {
  _notImplemented('dispatchTask', 'US-03-TASK-BE-03');
}

function verifyAgentProvenance() {
  _notImplemented('verifyAgentProvenance', 'US-03-TASK-BE-02');
}

module.exports = {
  dispatchTask,
  verifyAgentProvenance,
};
