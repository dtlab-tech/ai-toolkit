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
//
// dispatchTaskAttempt (US-03-TASK-BE-03, added below) is the exception: it
// is a new addition, not one of the seven skeleton commands above, and its
// body is real. It is the single-task dispatch primitive the real run loop
// (execute(), US-07-TASK-BE-01, still NOT_IMPLEMENTED) will call once per
// ready task — see its own doc comment for the full design.

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

function _err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function _requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw _err('DISPATCH_VALIDATION_ERROR', label + ' must be a non-empty string');
  }
}

// Deterministic default prompt built from the plan task's own fields (id,
// title, outcome, domain, dependsOn, acceptanceCriteria, verificationCommands
// — see plan.js's parseMarkdown/mapPhases for this shape). This task's scope
// is dispatch orchestration, not prompt authoring; the prompt is assembled
// here (rather than requiring every caller to build one) purely so
// dispatchTaskAttempt is callable with only the plan task object, per its
// documented signature.
function _buildTaskPrompt(task) {
  const lines = [
    'Task ID: ' + task.id,
    'Title: ' + (task.title || ''),
    'Domain: ' + (task.domain || ''),
    'Outcome: ' + (task.outcome || ''),
  ];
  if (Array.isArray(task.dependsOn) && task.dependsOn.length > 0) {
    lines.push('Depends on: ' + task.dependsOn.join(', '));
  }
  if (Array.isArray(task.acceptanceCriteria) && task.acceptanceCriteria.length > 0) {
    lines.push('Acceptance criteria: ' + task.acceptanceCriteria.join(', '));
  }
  if (Array.isArray(task.verificationCommands) && task.verificationCommands.length > 0) {
    lines.push('Verification commands:');
    task.verificationCommands.forEach(function (cmd) { lines.push('  ' + cmd); });
  }
  return lines.join('\n') + '\n';
}

/**
 * Dispatches exactly one implementation agent invocation for one task
 * attempt (US-03-TASK-BE-03; completes US-03 "dispatch one implementation
 * agent per task per attempt"). This is the single-task dispatch primitive
 * the real run loop (US-07-TASK-BE-01, execute()) will call once per ready
 * task — it does not itself iterate the ready queue, and it does not
 * acquire/reclaim the repo-wide execution lease (that is the run-start/
 * resume responsibility of US-07/US-06); it only CHECKS that the caller
 * already holds it.
 *
 * Ordering guarantees (fail-closed at every step, in order):
 *   1. Ownership check — ownership.readLease(executionRoot) must return a
 *      lease whose runId matches `runId`. No lease, or a lease held by a
 *      different runId, throws NO_LOCK_HELD before anything else happens.
 *   2. Identity verification — claude-process.verifyAgentIdentity({
 *      projectDir, agentId }) must succeed. Any failure (AGENT_NOT_VERIFIED,
 *      DEFINITION_HASH_MISMATCH) propagates unmodified — dispatch never
 *      swallows or rewraps it.
 *   3. Persist-before-invoke (AC-01) — the attempt is recorded via
 *      store.js's addAttempt (brand-new attempt: stage 'prepared', written,
 *      then updated to 'dispatching', written again) or updateAttempt alone
 *      (an attempt numbered `attemptNumber` already exists in state — e.g. a
 *      resumed dispatch: stage moves directly to 'dispatching'), and the
 *      ledger 'implementation' activity for this attempt is opened via
 *      execution-ledger.js's open()/computeOperationId — both complete
 *      BEFORE spawnClaudeAgent is ever called.
 *   4. Only once 1-3 have succeeded: claude-process.spawnClaudeAgent(...) is
 *      called with the verified identity's nativeName wired in as the
 *      --agent selector and the task's prompt fed via stdin.
 *   5. Returns a structured result combining the raw spawn result with the
 *      run/task/attempt identifiers used. No verification/review/checkpoint
 *      happens here (US-04/US-05) — scope ends at "dispatch happened and its
 *      raw result was captured".
 *
 * Ledger placement: the per-run ledger file lives alongside the run's other
 * artifacts, at store._executionPaths(executionRoot, runId).runDir, using
 * `runId` itself as the file-name prefix (i.e.
 * <executionRoot>/runs/<runId>/<runId>-token-ledger.json) — this is
 * deliberately separate from any feature-delivery-pipeline ledger (e.g.
 * FTR-018-token-ledger.json), which tracks the cost of building the
 * executor, not the cost of tasks the executor itself dispatches at
 * runtime. The ledger agent key follows Tech-Spec section 6 exactly:
 * `executor:<runId>:<taskId>:implementation`.
 *
 * @param {object} args
 * @param {string} args.executionRoot - Absolute path to
 *   <common-git-dir>/ai-toolkit/execution.
 * @param {string} args.runId - UUID of the run that must currently hold the
 *   repo-wide execution lease.
 * @param {object} args.task - Plan task object (plan.js shape): at least
 *   `id`; `title`/`outcome`/`domain`/`dependsOn`/`acceptanceCriteria`/
 *   `verificationCommands` are used to build the default prompt when
 *   `args.prompt` is not supplied.
 * @param {number} args.attemptNumber - Positive integer attempt number for
 *   this dispatch. Must equal the task's next attempt number
 *   (task.attempts.length + 1 in current state) when no attempt numbered
 *   `attemptNumber` already exists, or match an existing attempt's number
 *   for a resumed dispatch.
 * @param {string} args.claudePath - Absolute path to the qualified Claude
 *   CLI executable (forwarded to spawnClaudeAgent).
 * @param {string} args.agentId - Canonical agent ID to verify and dispatch
 *   (forwarded to verifyAgentIdentity; its resolved nativeName is what is
 *   actually passed as the --agent selector).
 * @param {string} args.projectDir - Project root used both for identity
 *   verification (--project) and as the spawned process's cwd.
 * @param {number} [args.taskTimeoutMs] - Optional per-task timeout budget,
 *   forwarded to spawnClaudeAgent.
 * @param {string} [args.prompt] - Explicit prompt override. When omitted, a
 *   deterministic default is built from `args.task`'s own fields.
 * @param {string[]} [args.spawnArgs] - Test-only override of the full CLI
 *   args array forwarded to spawnClaudeAgent. Defaults to the production
 *   shape (`--print --output-format json --agent <nativeName>`). Tests use
 *   this to substitute the fake-claude-cli fixture's own invocation shape
 *   (see tests/fixtures/fake-claude-cli.js) while still exercising a real
 *   subprocess spawn end-to-end.
 * @returns {Promise<{
 *   runId: string, taskId: string, attemptNumber: number,
 *   agentId: string, nativeAgentName: string,
 *   ledgerOperationId: string, spawnResult: object
 * }>}
 * @throws {Error} NO_LOCK_HELD, AGENT_NOT_VERIFIED, DEFINITION_HASH_MISMATCH,
 *   ATTEMPT_NUMBER_MISMATCH, STATE_NOT_FOUND, STATE_TASK_NOT_FOUND, or any
 *   error surfaced by spawnClaudeAgent (e.g. CLAUDE_EXECUTABLE_NOT_FOUND,
 *   CLAUDE_SPAWN_FAILED).
 */
async function dispatchTaskAttempt(args) {
  args = args || {};

  _requireNonEmptyString(args.executionRoot, 'dispatchTaskAttempt: args.executionRoot');
  _requireNonEmptyString(args.runId, 'dispatchTaskAttempt: args.runId');
  _requireNonEmptyString(args.claudePath, 'dispatchTaskAttempt: args.claudePath');
  _requireNonEmptyString(args.agentId, 'dispatchTaskAttempt: args.agentId');
  _requireNonEmptyString(args.projectDir, 'dispatchTaskAttempt: args.projectDir');
  if (args.task == null || typeof args.task !== 'object') {
    throw _err('DISPATCH_VALIDATION_ERROR', 'dispatchTaskAttempt: args.task must be an object');
  }
  _requireNonEmptyString(args.task.id, 'dispatchTaskAttempt: args.task.id');
  if (!Number.isInteger(args.attemptNumber) || args.attemptNumber < 1) {
    throw _err('DISPATCH_VALIDATION_ERROR', 'dispatchTaskAttempt: args.attemptNumber must be a positive integer');
  }

  const executionRoot = args.executionRoot;
  const runId = args.runId;
  const task = args.task;
  const attemptNumber = args.attemptNumber;

  // 1. Ownership check — never acquire/reclaim here, only verify the caller
  // already holds the lease it claims to hold.
  const lease = ownership.readLease(executionRoot);
  if (!lease || lease.runId !== runId) {
    throw _err(
      'NO_LOCK_HELD',
      'dispatchTaskAttempt: no repo-wide execution lease held by runId "' + runId + '" at ' +
        executionRoot + (lease ? ' (currently held by runId "' + lease.runId + '")' : ' (no lease held)')
    );
  }

  // 2. Identity verification — propagate failures unmodified.
  const identity = claudeProcess.verifyAgentIdentity({
    projectDir: args.projectDir,
    agentId: args.agentId,
  });

  // 3. Persist-before-invoke: attempt identity, then ledger activity.
  let state = store.readState(executionRoot, runId);
  const stateTaskEntry = state.tasks[task.id];
  const existingAttempt = stateTaskEntry
    ? stateTaskEntry.attempts.find(function (a) { return a.number === attemptNumber; })
    : undefined;

  if (existingAttempt) {
    state = state.updateAttempt(task.id, attemptNumber, { stage: 'dispatching' });
    state = store.writeState(executionRoot, runId, state);
  } else {
    const expectedNextNumber = stateTaskEntry ? stateTaskEntry.attempts.length + 1 : 1;
    if (attemptNumber !== expectedNextNumber) {
      throw _err(
        'ATTEMPT_NUMBER_MISMATCH',
        'dispatchTaskAttempt: task "' + task.id + '" expected next attempt number ' +
          expectedNextNumber + ', got ' + attemptNumber
      );
    }
    state = state.addAttempt(task.id, { stage: 'prepared' });
    state = store.writeState(executionRoot, runId, state);
    state = state.updateAttempt(task.id, attemptNumber, { stage: 'dispatching' });
    state = store.writeState(executionRoot, runId, state);
  }

  const ledgerPaths = store._executionPaths(executionRoot, runId);
  const ledgerAgentKey = 'executor:' + runId + ':' + task.id + ':implementation';
  const ledgerMetadata = {
    agentId: identity.agentId,
    nativeAgentName: identity.nativeName,
    platform: process.platform,
    toolkitVersion: identity.toolkitVersion,
    resolutionScope: identity.scope,
    definitionHash: identity.sha256,
  };
  const ledgerOpenResult = ledger.open(
    ledgerPaths.runDir,
    runId,
    ledgerAgentKey,
    'implementation',
    null,
    attemptNumber,
    ledgerMetadata
  );

  // 4. Only now: dispatch the verified agent.
  const prompt = typeof args.prompt === 'string' ? args.prompt : _buildTaskPrompt(task);
  const spawnArgs = Array.isArray(args.spawnArgs)
    ? args.spawnArgs
    : ['--print', '--output-format', 'json', '--agent', identity.nativeName];
  const spawnResult = await claudeProcess.spawnClaudeAgent({
    claudePath: args.claudePath,
    args: spawnArgs,
    prompt: prompt,
    cwd: args.projectDir,
    taskTimeoutMs: args.taskTimeoutMs,
  });

  // 5. Raw capture only — no verification/review/checkpoint here.
  return {
    runId: runId,
    taskId: task.id,
    attemptNumber: attemptNumber,
    agentId: identity.agentId,
    nativeAgentName: identity.nativeName,
    ledgerOperationId: ledgerOpenResult.operation_id,
    spawnResult: spawnResult,
  };
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
  dispatchTaskAttempt,
};
