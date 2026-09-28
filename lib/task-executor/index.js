'use strict';

// Task-executor module skeleton (FTR-018, INFRA-TASK-BE-03).
//
// Public interface for the deterministic task executor: the seven commands
// from the CLI contract (FTR-018-Tech-Spec.md section 10) — execute
// (backing the `start` CLI command), status, diagnose, stop, reconcile,
// resume, replan.
//
// This module wires the real state/ledger modules (store.js,
// INFRA-TASK-BE-01; execution-ledger.js finalizeActivity, INFRA-TASK-BE-02)
// together with placeholder modules for the pieces that later Work
// Breakdown tasks implement (ownership.js, plan.js, claude-process.js,
// git.js — each documented with the task that will replace its stub body).
// Every public function below currently throws NOT_IMPLEMENTED pointing at
// the task that implements its real body: this task (INFRA-TASK-BE-03)
// only establishes the module skeleton and public interface, per its
// Work Breakdown outcome.

const store        = require('./store');
const ownership    = require('./ownership');
const plan         = require('./plan');
const claudeProcess = require('./claude-process');
const git          = require('./git');
const ledger       = require('../execution-ledger');

function _notImplemented(fnName, task) {
  const err = new Error(
    fnName + ' is NOT_IMPLEMENTED — see Work Breakdown task ' + task
  );
  err.code = 'NOT_IMPLEMENTED';
  err.task = task;
  throw err;
}

/**
 * `start` command. Validate gates/config/profile, acquire the repo-wide
 * execution lease, create an immutable run (manifest + initial state) from
 * the approved plan, and drive dispatch/verification/review/checkpoint/
 * integration to completion, pause, or block.
 *
 * Real implementation: US-07-TASK-BE-01 (sequential main loop with
 * ready-queue dispatch, maxConcurrency=1); extended to N-way concurrency by
 * US-08-TASK-BE-02/03.
 *
 * @param {object} args
 * @param {string} args.project - Absolute or project-relative path used to
 *   resolve the repo root and common Git directory.
 * @param {string} args.feature - Path to the feature's feature.md, used to
 *   derive PREFIX and locate Requirements/Tech-Spec/Approvals/Work-Breakdown.
 * @param {number} [args.maxConcurrency=1] - Requested task slot count N.
 *   Must be a positive safe integer; no implicit downgrade if unsupported.
 * @param {string} [args.claudePath] - Explicit path to the qualified Claude
 *   CLI executable.
 * @param {number} args.taskTimeoutMs - Per-task timeout budget, required
 *   for real model invocations.
 * @param {number} args.agentBudgetUsd - Per-run agent spend budget,
 *   required for real model invocations.
 * @returns {Promise<object>} Versioned result object:
 *   { protocolVersion, runId, runStatus, tasks: [{ taskId, status }] }.
 */
async function execute(args) {
  return _notImplemented('execute', 'US-07-TASK-BE-01');
}

/**
 * `status` command. Read-only summary of a run: counts of tasks per
 * status, current run status, and total cost as reported by the ledger
 * (the sole cost source). Never mutates state.
 *
 * Real implementation: US-06-TASK-BE-01 (loads persisted state/evidence and
 * classifies task status per the edge-cases table this summary is built
 * from).
 *
 * @param {object} args
 * @param {string} args.project - Absolute or project-relative repo path.
 * @param {string} args.runId - UUID of the run to inspect.
 * @returns {Promise<object>} Versioned result object:
 *   { protocolVersion, runId, runStatus,
 *     taskCounts: { pending, active, checkpointed, integrated, skipped, blocked },
 *     totalTokens, totalCostUsd }.
 */
async function status(args) {
  return _notImplemented('status', 'US-06-TASK-BE-01');
}

/**
 * `diagnose` command. Read-only detailed evidence dump for a run:
 * per-task/attempt evidence (checkpoint, commit, review, diff, worker
 * liveness), ownership/lease state, and repair suggestions. Never mutates
 * state.
 *
 * Real implementation: US-06-TASK-BE-02 (evidence evaluation per the
 * edge-cases table: no-reimplementation, reconcile-SHA,
 * recheck-verification, preserve-diff, or block).
 *
 * @param {object} args
 * @param {string} args.project - Absolute or project-relative repo path.
 * @param {string} args.runId - UUID of the run to inspect.
 * @returns {Promise<object>} Versioned result object:
 *   { protocolVersion, runId, ownership: {...},
 *     tasks: [{ taskId, attempts: [...], evidence: {...}, suggestedAction }] }.
 */
async function diagnose(args) {
  return _notImplemented('diagnose', 'US-06-TASK-BE-02');
}

/**
 * `stop` command. Persist a stop request for a running coordinator and
 * acknowledge receipt of the request only — this does not itself claim
 * termination. `status` confirms when the run has actually paused/stopped.
 *
 * Real implementation: US-07-TASK-BE-02 (graceful: block new dispatch,
 * collect already-running results, checkpoint only if verification/review
 * evidence is already sufficient; immediate: request termination of the
 * owned process tree and await confirmed terminal state).
 *
 * @param {object} args
 * @param {string} args.project - Absolute or project-relative repo path.
 * @param {string} args.runId - UUID of the run to stop.
 * @param {'graceful'|'immediate'} [args.mode='graceful'] - Stop mode.
 * @returns {Promise<object>} Versioned result object:
 *   { protocolVersion, runId, requestAccepted: true, mode }.
 */
async function stop(args) {
  return _notImplemented('stop', 'US-07-TASK-BE-02');
}

/**
 * `reconcile` command. Apply idempotent repairs supported by existing
 * intents (e.g. recover a missing commit SHA, complete a pending
 * compare-and-swap). Does not dispatch new work, integrate new pending
 * work, reinterpret approvals, or clean resources. Requires no live
 * competing coordinator.
 *
 * Real implementation: US-06-TASK-BE-01 (resume and reconcile command
 * logic), applying the classification produced by US-06-TASK-BE-02
 * (evidence evaluation).
 *
 * @param {object} args
 * @param {string} args.project - Absolute or project-relative repo path.
 * @param {string} args.runId - UUID of the run to reconcile.
 * @returns {Promise<object>} Versioned result object:
 *   { protocolVersion, runId, repairsApplied: [{ taskId, action }] }.
 */
async function reconcile(args) {
  return _notImplemented('reconcile', 'US-06-TASK-BE-01');
}

/**
 * `resume` command. Reconcile first, then continue only the stages whose
 * evidence is valid, bound to the original plan/config. Requires no live
 * competing coordinator.
 *
 * Real implementation: US-06-TASK-BE-01 (resume and reconcile command
 * logic).
 *
 * @param {object} args
 * @param {string} args.project - Absolute or project-relative repo path.
 * @param {string} args.runId - UUID of the run to resume.
 * @returns {Promise<object>} Versioned result object:
 *   { protocolVersion, runId, runStatus, tasks: [{ taskId, status }] }.
 */
async function resume(args) {
  return _notImplemented('resume', 'US-06-TASK-BE-01');
}

/**
 * `replan` command. Validate a proposed successor plan's Gate 2/revision
 * evidence, record the old->new plan digest and task mapping, and mark the
 * original run superseded only after no workers are live and evidence is
 * retained. Grants no approval itself and does not auto-start the
 * successor.
 *
 * Real implementation: US-06-TASK-BE-03.
 *
 * @param {object} args
 * @param {string} args.project - Absolute or project-relative repo path.
 * @param {string} args.runId - UUID of the original run being replanned.
 * @param {string} args.feature - Path to the feature.md carrying the
 *   approved successor plan (new Gate 2 evidence).
 * @returns {Promise<object>} Versioned result object:
 *   { protocolVersion, originalRunId, successorPlanDigest,
 *     taskMapping: [{ oldTaskId, newTaskId }] }.
 */
async function replan(args) {
  return _notImplemented('replan', 'US-06-TASK-BE-03');
}

module.exports = {
  execute,
  status,
  diagnose,
  stop,
  reconcile,
  resume,
  replan,
};
