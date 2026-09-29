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
// dispatchTaskAttempt (US-03-TASK-BE-03), runVerifications (US-04-TASK-BE-01),
// runReview (US-04-TASK-BE-02) and finalizeTaskCheckpoint (US-05-TASK-BE-05),
// all added below, are the exceptions: each is a new addition, not one of
// the seven skeleton commands above, and each has a real body. Together they
// are the single-task dispatch/verify/review/checkpoint primitives the real
// run loop (execute(), US-07-TASK-BE-01, still NOT_IMPLEMENTED) will call
// once per ready task — see each function's own doc comment for its design.

const { spawn, spawnSync } = require('child_process');

const store        = require('./store');
const ownership    = require('./ownership');
const plan         = require('./plan');
const claudeProcess = require('./claude-process');
const git          = require('./git');
const ledger       = require('../execution-ledger');

const IS_WINDOWS = process.platform === 'win32';

// Bounded per-stream output ceiling for verification commands (10 MiB).
// Unlike claude-process.js's spawnClaudeAgent (which kills the process tree
// on overflow, because an LLM agent's output is open-ended and unbounded-by-
// design), verification commands are finite, deterministic invocations
// (npm test, grep, test -f, ...) — bounding here only guards memory against
// a pathological command, not runaway control loss. So on overflow this
// module simply stops buffering further chunks and marks the stream
// truncated; it lets the command run to its real exit code rather than
// killing it, which keeps the recorded exitCode meaningful.
const DEFAULT_MAX_VERIFICATION_OUTPUT_BYTES = 10 * 1024 * 1024;

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

// Unlike _requireNonEmptyString, an empty string is valid here (a no-op
// task's diff is legitimately empty per Tech-Spec section 8: "No-op tasks:
// require verifications and review proving outcome at the current
// baseline"). Only non-string values (missing/undefined/wrong type) fail.
function _requireString(value, label) {
  if (typeof value !== 'string') {
    throw _err('DISPATCH_VALIDATION_ERROR', label + ' must be a string');
  }
}

// Canonical agent ID for the review-solution agent — the same string
// lib/agent-registry.js's AGENT_TYPE_TO_CANONICAL_ID['review-solution'] and
// its AGENT_RECORDS entry both use to resolve/dispatch this agent everywhere
// else in the toolkit. runReview hardcodes it (rather than accepting it as a
// caller-supplied parameter like dispatchTaskAttempt's generic args.agentId)
// because this function is specific to one agent, not a generic dispatch
// primitive for any domain agent.
const REVIEW_AGENT_ID = 'gaia.agent.review.solution';

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
 *      resumed dispatch: stage moves directly to 'dispatching'), and TWO
 *      ledger activities for this attempt are opened via execution-ledger.js's
 *      open()/computeOperationId — both complete BEFORE spawnClaudeAgent is
 *      ever called:
 *        - 'implementation' (kind 'implementation'): this one dispatch
 *          invocation. Closed as soon as its result is durably received
 *          (US-04-TASK-BE-03's persistVerificationReviewOutcome path, via
 *          runVerifications/runReview — not by this function).
 *        - 'task' (kind 'task'): spans the WHOLE per-task-attempt lifecycle
 *          (Tech-Spec section 6: "kinds: task, implementation,
 *          verification-<index>, review ... The task activity carries null
 *          token usage (reason: control-only) and closes after checkpoint
 *          and, for N>1, verified integration"). Opened here (dispatch is the
 *          first point at which this attempt becomes active) but ONLY closed
 *          by finalizeTaskCheckpoint (US-05-TASK-BE-05, below) — never by
 *          this function.
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
 * runtime. The ledger agent keys follow Tech-Spec section 6 exactly:
 * `executor:<runId>:<taskId>:implementation` and
 * `executor:<runId>:<taskId>:task`.
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

  // Task-kind ledger activity (Tech-Spec section 6) — opened together with
  // 'implementation' above, but spans the whole task-attempt lifecycle: it
  // is deliberately left open here and only ever closed by
  // finalizeTaskCheckpoint (US-05-TASK-BE-05) once the checkpoint SHA has
  // been registered and verified reachable on the feature branch. Opened
  // AFTER 'implementation' so ledgerOpenResult (and every existing caller
  // that reads the first ledger entry written for this attempt) keeps
  // referring to the 'implementation' activity unchanged.
  const ledgerTaskAgentKey = 'executor:' + runId + ':' + task.id + ':task';
  ledger.open(
    ledgerPaths.runDir,
    runId,
    ledgerTaskAgentKey,
    'task',
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

// Deterministic review prompt: task context, the exact diff bytes (verbatim,
// never re-escaped or reformatted — Tech-Spec section 8: "unexpected tracked
// changes invalidate the reviewed diff", so the review agent must see
// exactly what will be checkpointed), and the review criteria the diff must
// satisfy. There is no separate "review criteria" field in the plan.js task
// shape (see plan.js's parseMarkdown/mapPhases) — Tech-Spec section 7's
// binding rule is "review passed=true with no blocking finding" evaluated
// against the task's own approved acceptance/verification contract, so the
// task's acceptanceCriteria and verificationCommands are exactly what this
// function feeds as the criteria the diff must satisfy.
function _buildReviewPrompt(task, diff) {
  const lines = [
    'Task ID: ' + task.id,
    'Title: ' + (task.title || ''),
    'Domain: ' + (task.domain || ''),
    'Outcome: ' + (task.outcome || ''),
  ];
  if (task.groupingRationale) {
    lines.push('Grouping rationale: ' + task.groupingRationale);
  }
  if (Array.isArray(task.acceptanceCriteria) && task.acceptanceCriteria.length > 0) {
    lines.push('Acceptance criteria: ' + task.acceptanceCriteria.join(', '));
  }
  lines.push('');
  lines.push('Review criteria (the diff below must satisfy ALL of these):');
  if (Array.isArray(task.acceptanceCriteria) && task.acceptanceCriteria.length > 0) {
    task.acceptanceCriteria.forEach(function (ac) { lines.push('  - Acceptance criterion: ' + ac); });
  }
  if (Array.isArray(task.verificationCommands) && task.verificationCommands.length > 0) {
    task.verificationCommands.forEach(function (cmd) { lines.push('  - Verification command must pass: ' + cmd); });
  }
  if (
    (!Array.isArray(task.acceptanceCriteria) || task.acceptanceCriteria.length === 0) &&
    (!Array.isArray(task.verificationCommands) || task.verificationCommands.length === 0)
  ) {
    lines.push('  (none declared on the task)');
  }
  lines.push('');
  lines.push('--- BEGIN DIFF (exact, verbatim) ---');
  lines.push(diff);
  lines.push('--- END DIFF ---');
  return lines.join('\n') + '\n';
}

// Parses whatever structured verdict it can out of the review-solution
// agent's reply. That agent's own definition (src/claude/agents/
// gaia-review-solution.md, "## Output") specifies a fixed human-readable text
// template — "Verdict: PASS / FAIL", "CRITICAL (blocks merge): ..." — not a
// JSON contract; there is no machine schema published for it. This function
// is therefore a best-effort pattern match over that documented template,
// applied to the CLI's own `result.result` field — spawnClaudeAgent's parsed
// --output-format json envelope; see tests/fixtures/fake-claude-cli.js's
// 'echo-json' mode for the shape it mimics: { is_error, result: <agent reply
// text> }. When the reply does not match the template (missing/malformed
// envelope, or free text that doesn't follow it), `passed` is reported as
// `null` rather than guessed — this function never fabricates a pass.
// Authoritative pass/fail enforcement against the Tech-Spec's binding rule
// ("review passed=true with no blocking finding") is intentionally left to
// US-04-TASK-BE-03 (closing / combined verification+review outcome
// persistence), which is free to treat a non-matching or null reply as a
// failure — this function only reports what it can read.
function _extractReviewVerdict(spawnResult) {
  const text = spawnResult && spawnResult.result && typeof spawnResult.result.result === 'string'
    ? spawnResult.result.result
    : null;

  if (text === null) {
    return { passed: null, criticalFindings: [] };
  }

  const verdictMatch = text.match(/Verdict:\s*(PASS|FAIL)/i);
  const passed = verdictMatch ? verdictMatch[1].toUpperCase() === 'PASS' : null;

  const criticalFindings = [];
  const criticalSectionMatch = text.match(
    /CRITICAL \(blocks merge\):([\s\S]*?)(?:\n\s*\n\s*WARNING \(should fix\):|\n\s*\n\s*INFO \(improvements\):|$)/i
  );
  if (criticalSectionMatch) {
    criticalSectionMatch[1].split('\n').forEach(function (line) {
      const trimmed = line.trim();
      if (trimmed.length > 0 && trimmed.toLowerCase() !== 'none') {
        criticalFindings.push(trimmed);
      }
    });
  }

  return { passed: passed, criticalFindings: criticalFindings };
}

/**
 * Dispatches exactly one review-solution agent invocation for one task
 * attempt (US-04-TASK-BE-02; completes the "dispatch review agent with diff
 * context" half of US-04). Mirrors dispatchTaskAttempt's fail-closed
 * ordering discipline exactly, adapted for the review-solution agent instead
 * of a developer agent:
 *   1. Ownership check — ownership.readLease(executionRoot) must return a
 *      lease whose runId matches `runId`. No lease, or a lease held by a
 *      different runId, throws NO_LOCK_HELD before anything else happens —
 *      no agent (implementation or review) is ever dispatched without the
 *      caller demonstrably holding the repo-wide execution lease it claims.
 *   2. Identity verification — claude-process.verifyAgentIdentity({
 *      projectDir, agentId: REVIEW_AGENT_ID }) must succeed (Tech-Spec
 *      section 7: "Before EACH implementation and review invocation:
 *      operational resolveAgent..."). Any failure (AGENT_NOT_VERIFIED,
 *      DEFINITION_HASH_MISMATCH) propagates unmodified.
 *   3. Persist-before-invoke — the ledger 'review' activity for this attempt
 *      is opened via execution-ledger.js's open()/computeOperationId BEFORE
 *      spawnClaudeAgent is ever called. Unlike dispatchTaskAttempt, this does
 *      NOT add/update a state attempt: the attempt already exists from the
 *      implementation stage, and recording its 'reviewed' stage or any
 *      pass/fail outcome is US-04-TASK-BE-03's job (closing / combined
 *      verification+review outcome persistence), not this function's — this
 *      function only opens the ledger activity.
 *   4. Only once 1-3 have succeeded: claude-process.spawnClaudeAgent(...) is
 *      called with the verified identity's nativeName wired in as the
 *      --agent selector, and a prompt containing the task's context, the
 *      exact diff (verbatim, via stdin — never argv), and the review
 *      criteria (the task's own acceptanceCriteria/verificationCommands).
 *   5. Returns a structured result combining the raw spawn result with a
 *      best-effort parsed verdict (see _extractReviewVerdict) and the
 *      run/task/attempt identifiers used. No outcome persistence happens
 *      here — scope ends at "review dispatched and its raw result captured".
 *
 * Ledger placement: same per-run ledger file dispatchTaskAttempt uses
 * (<executionRoot>/runs/<runId>/<runId>-token-ledger.json). The ledger agent
 * key follows Tech-Spec section 6 exactly: `executor:<runId>:<taskId>:review`
 * (kind `review`, per section 6's kinds list: task, implementation,
 * verification-<index>, review).
 *
 * @param {object} args
 * @param {string} args.executionRoot - Absolute path to
 *   <common-git-dir>/ai-toolkit/execution.
 * @param {string} args.runId - UUID of the run that must currently hold the
 *   repo-wide execution lease.
 * @param {object} args.task - Plan task object (plan.js shape): at least
 *   `id`; `title`/`outcome`/`domain`/`groupingRationale`/`acceptanceCriteria`/
 *   `verificationCommands` are used to build the review prompt.
 * @param {number} args.attemptNumber - Positive integer attempt number this
 *   review belongs to (the attempt already dispatched/verified earlier).
 * @param {string} args.claudePath - Absolute path to the qualified Claude
 *   CLI executable (forwarded to spawnClaudeAgent).
 * @param {string} args.projectDir - Project root used both for identity
 *   verification (--project) and as the spawned process's cwd.
 * @param {string} args.diff - Exact diff text (e.g. `git diff` output) the
 *   review must evaluate against the review criteria. This function does not
 *   compute the diff itself — that is the caller's responsibility. An empty
 *   string is valid (a no-op task's diff is legitimately empty).
 * @param {number} [args.taskTimeoutMs] - Optional per-task timeout budget,
 *   forwarded to spawnClaudeAgent.
 * @param {string[]} [args.spawnArgs] - Test-only override of the full CLI
 *   args array forwarded to spawnClaudeAgent, exactly like dispatchTaskAttempt's
 *   own args.spawnArgs (see tests/fixtures/fake-claude-cli.js).
 * @returns {Promise<{
 *   runId: string, taskId: string, attemptNumber: number,
 *   agentId: string, nativeAgentName: string,
 *   ledgerOperationId: string, spawnResult: object,
 *   reviewPassed: (boolean|null), criticalFindings: string[]
 * }>}
 * @throws {Error} NO_LOCK_HELD, AGENT_NOT_VERIFIED, DEFINITION_HASH_MISMATCH,
 *   DISPATCH_VALIDATION_ERROR, or any error surfaced by spawnClaudeAgent
 *   (e.g. CLAUDE_EXECUTABLE_NOT_FOUND, CLAUDE_SPAWN_FAILED).
 */
async function runReview(args) {
  args = args || {};

  _requireNonEmptyString(args.executionRoot, 'runReview: args.executionRoot');
  _requireNonEmptyString(args.runId, 'runReview: args.runId');
  _requireNonEmptyString(args.claudePath, 'runReview: args.claudePath');
  _requireNonEmptyString(args.projectDir, 'runReview: args.projectDir');
  if (args.task == null || typeof args.task !== 'object') {
    throw _err('DISPATCH_VALIDATION_ERROR', 'runReview: args.task must be an object');
  }
  _requireNonEmptyString(args.task.id, 'runReview: args.task.id');
  if (!Number.isInteger(args.attemptNumber) || args.attemptNumber < 1) {
    throw _err('DISPATCH_VALIDATION_ERROR', 'runReview: args.attemptNumber must be a positive integer');
  }
  _requireString(args.diff, 'runReview: args.diff');

  const executionRoot = args.executionRoot;
  const runId = args.runId;
  const task = args.task;
  const attemptNumber = args.attemptNumber;
  const diff = args.diff;

  // 1. Ownership check — never acquire/reclaim here, only verify the caller
  // already holds it (same precondition dispatchTaskAttempt enforces).
  const lease = ownership.readLease(executionRoot);
  if (!lease || lease.runId !== runId) {
    throw _err(
      'NO_LOCK_HELD',
      'runReview: no repo-wide execution lease held by runId "' + runId + '" at ' +
        executionRoot + (lease ? ' (currently held by runId "' + lease.runId + '")' : ' (no lease held)')
    );
  }

  // 2. Identity verification — propagate failures unmodified.
  const identity = claudeProcess.verifyAgentIdentity({
    projectDir: args.projectDir,
    agentId: REVIEW_AGENT_ID,
  });

  // 3. Persist-before-invoke: open the ledger 'review' activity only (no
  // state attempt mutation — see doc comment above).
  const ledgerPaths = store._executionPaths(executionRoot, runId);
  const ledgerAgentKey = 'executor:' + runId + ':' + task.id + ':review';
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
    'review',
    null,
    attemptNumber,
    ledgerMetadata
  );

  // 4. Only now: dispatch the verified review agent.
  const prompt = _buildReviewPrompt(task, diff);
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

  // 5. Raw capture + best-effort verdict extraction — no outcome persistence
  // here (US-04-TASK-BE-03 owns closing this out).
  const verdict = _extractReviewVerdict(spawnResult);

  return {
    runId: runId,
    taskId: task.id,
    attemptNumber: attemptNumber,
    agentId: identity.agentId,
    nativeAgentName: identity.nativeName,
    ledgerOperationId: ledgerOpenResult.operation_id,
    spawnResult: spawnResult,
    reviewPassed: verdict.passed,
    criticalFindings: verdict.criticalFindings,
  };
}

// Tree-kill for a verification command that exceeded its optional
// commandTimeoutMs. Duplicates (rather than imports) claude-process.js's
// E-02-qualified `taskkill /PID <pid> /T /F` technique: that helper is not
// exported (claude-process.js's public surface is intentionally limited to
// spawnClaudeAgent/verifyAgentIdentity), and verification commands are a
// different trust/lifetime domain from Claude subprocess supervision, so
// duplicating this small helper here keeps the two modules independently
// readable rather than forcing a cross-module export for one shared branch.
function _killVerificationProcessTreeSync(child) {
  if (IS_WINDOWS) {
    const res = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return !res.error && res.status === 0;
  }
  try {
    child.kill('SIGKILL');
  } catch (_) {
    // best-effort only
  }
  return 'unknown';
}

// Runs one verification command line as a real Bash command (see
// runVerifications' doc comment for why Bash + shell:false, rather than
// shell:true, is the correct choice here). Resolves — never rejects — with a
// result object describing exactly what happened, including the case where
// the command could not even be spawned (e.g. no `bash` on PATH): that case
// is reported via `spawnError` rather than thrown, so a missing shell is
// handled the same way as any other command failure (AC: "the code should
// not crash uncaught").
function _runVerificationCommand(command, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = new Date();
    const startedHr = process.hrtime.bigint();
    let settled = false;
    let timedOut = false;
    let timeoutHandle = null;

    function clearTimer() {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    }

    function finish(fields) {
      if (settled) return;
      settled = true;
      clearTimer();
      const endedAt = new Date();
      const durationMs = Number(process.hrtime.bigint() - startedHr) / 1e6;
      resolve(Object.assign(
        {
          command: command,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          durationMs: durationMs,
          exitCode: null,
          signal: null,
          stdout: '',
          stderr: '',
          stdoutTruncated: false,
          stderrTruncated: false,
          timedOut: timedOut,
          spawnError: null,
        },
        fields
      ));
    }

    let child;
    try {
      child = spawn('bash', ['-c', command], {
        cwd: cwd,
        shell: false, // never true: shell:true on Windows silently runs cmd.exe, not Bash
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      finish({ spawnError: 'failed to spawn bash: ' + err.message });
      return;
    }

    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;

    child.stdout.on('data', (chunk) => {
      if (stdoutTruncated) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > DEFAULT_MAX_VERIFICATION_OUTPUT_BYTES) {
        stdoutTruncated = true;
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr.on('data', (chunk) => {
      if (stderrTruncated) return;
      stderrBytes += chunk.length;
      if (stderrBytes > DEFAULT_MAX_VERIFICATION_OUTPUT_BYTES) {
        stderrTruncated = true;
        return;
      }
      stderrChunks.push(chunk);
    });

    child.on('error', (err) => {
      // Covers "bash not found on PATH" (ENOENT) and other un-spawnable
      // cases — Tech-Spec section 8's "unsupported shell fails preflight"
      // is satisfied here: the very first verification command fails
      // closed with a clear reason instead of crashing the coordinator.
      finish({ spawnError: 'bash command failed to run: ' + err.message });
    });

    child.on('close', (code, signal) => {
      finish({
        exitCode: code === undefined ? null : code,
        signal: signal === undefined ? null : signal,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        stdoutTruncated: stdoutTruncated,
        stderrTruncated: stderrTruncated,
      });
    });

    if (timeoutMs !== null && timeoutMs !== undefined) {
      timeoutHandle = setTimeout(() => {
        if (settled) return;
        timedOut = true;
        _killVerificationProcessTreeSync(child);
      }, timeoutMs);
    }
  });
}

/**
 * Executes one task attempt's APPROVED verification commands — the fenced
 * command blocks parsed losslessly out of the Work Breakdown by plan.js's
 * parseMarkdown (task.verificationCommands) — as real shell command lines
 * (US-04-TASK-BE-01). Tech-Spec section 8: "Verification commands come from
 * approved fenced blocks, preserve exact bytes and declared shell semantics
 * ... Execute independently and require each exit 0; generic npm test
 * success cannot hide an individual failure."
 *
 * Why Bash + shell:false here, unlike claude-process.js's spawnClaudeAgent
 * (shell:false, argv array, no shell at all): spawnClaudeAgent spawns an LLM
 * agent whose prompt content is potentially adversarial natural-language
 * input, so it deliberately avoids a shell entirely to rule out any
 * metacharacter-injection risk. Verification commands are the opposite trust
 * case — they are authored by an approved planning agent, embedded verbatim
 * in the Work Breakdown, and only ever reach this function after a human has
 * approved them at Gate 2 (reviewed, static, versioned text, never raw
 * end-user input). They also legitimately depend on real shell features the
 * Work Breakdown already uses verbatim: pipes, `grep -E 'a|b'`, `test -f`,
 * `||`, redirects like `2>/dev/null` (see this very feature's own Work
 * Breakdown command `npm pack --dry-run 2>/dev/null | grep -E '...'`).
 * Running these without a shell would silently break every command that
 * isn't a single bare argv invocation.
 *
 * This function still spawns with shell:false and an explicit argv array —
 * it just names `bash` as the executable and `-c <command>` as its argv,
 * rather than passing Node's own shell:true (which on Windows launches
 * cmd.exe, not Bash, and would silently reinterpret Unix-only syntax like
 * `test -f`, single-quoted `grep` patterns, or `2>/dev/null`). This is
 * exactly Tech-Spec section 8's requirement: "Existing Bash commands run
 * under an explicitly available Bash, not silently converted to PowerShell
 * ... Unsupported shell fails preflight" — spawning Bash directly is what
 * makes that hold on every platform, Windows included. A missing/unspawnable
 * Bash is not treated as a special preflight step; it surfaces as the first
 * command's `spawnError`, which fails that command exactly like a non-zero
 * exit (see _runVerificationCommand).
 *
 * Fail-fast: commands run strictly in the order given. The first command
 * that exits non-zero (or cannot be spawned at all) stops the loop —
 * subsequent commands are never run for this attempt. This matches the
 * outcome's "requires each command exit 0" and Tech-Spec's "require each
 * exit 0; generic npm test success cannot hide an individual failure."
 *
 * Persistence: every command's result — including a failing or unspawnable
 * one — is written as an immutable receipt via store.writeReceipt (the
 * existing INFRA-TASK-BE-01 primitive; no new persistence primitive was
 * needed here) BEFORE the loop moves on to the next command, using id
 * `<taskId>-attempt<attemptNumber>-verification-<index>`. This is a stronger
 * guarantee than the outcome's literal wording ("persists each result before
 * proceeding to review" — review is the separate US-04-TASK-BE-02 stage),
 * but per-command persist-as-you-go is the simplest correct design: it costs
 * nothing extra, and it means a crash between two verification commands
 * still leaves every already-completed command's evidence durable on disk,
 * not just whatever happened to finish before the later review stage began.
 *
 * Empty verificationCommands is a trivial pass (nothing to verify) — it is
 * never treated as a failure or as "unverified".
 *
 * Timeout: Tech-Spec section 8 does not mandate a timeout for verification
 * commands (unlike claude-process.js's taskTimeoutMs for agent dispatch), so
 * `args.commandTimeoutMs` is optional and defaults to no timeout — a caller
 * (the future run loop, US-07/US-08) may supply one if it wants to bound a
 * hanging verification command. When supplied and exceeded, the process
 * tree is killed using the same E-02-qualified technique claude-process.js
 * uses (see _killVerificationProcessTreeSync).
 *
 * @param {object} args
 * @param {string} args.executionRoot - Absolute path to
 *   <common-git-dir>/ai-toolkit/execution (forwarded to store.writeReceipt).
 * @param {string} args.runId - UUID of the current run (forwarded to
 *   store.writeReceipt).
 * @param {object} args.task - Plan task object (plan.js shape): at least
 *   `id`; `verificationCommands` (array of exact command-line strings) is
 *   the field this function executes. Missing/non-array is treated as no
 *   commands to verify.
 * @param {number} args.attemptNumber - Positive integer attempt number this
 *   verification run belongs to (used in receipt ids).
 * @param {string} [args.cwd] - Working directory each command runs in.
 *   Defaults to `process.cwd()`.
 * @param {number} [args.commandTimeoutMs] - Optional per-command timeout
 *   budget; see "Timeout" above. No default (no timeout) when omitted.
 * @returns {Promise<{
 *   taskId: string, attemptNumber: number, passed: boolean,
 *   results: Array<{ command: string, exitCode: ?number, stdout: string,
 *     stderr: string, durationMs: number, passed: boolean }>
 * }>} `results` holds every command run up to and including the first
 *   failure (or all commands, if every one passed).
 * @throws {Error} code DISPATCH_VALIDATION_ERROR on malformed input (the same
 *   shared validation-error code _requireNonEmptyString already uses for
 *   dispatchTaskAttempt's argument checks above); any
 *   error store.writeReceipt itself throws (e.g. RECEIPT_CONFLICT if this
 *   exact attempt/index was already recorded with different content)
 *   propagates unmodified.
 */
async function runVerifications(args) {
  args = args || {};

  _requireNonEmptyString(args.executionRoot, 'runVerifications: args.executionRoot');
  _requireNonEmptyString(args.runId, 'runVerifications: args.runId');
  if (args.task == null || typeof args.task !== 'object') {
    throw _err('DISPATCH_VALIDATION_ERROR', 'runVerifications: args.task must be an object');
  }
  _requireNonEmptyString(args.task.id, 'runVerifications: args.task.id');
  if (!Number.isInteger(args.attemptNumber) || args.attemptNumber < 1) {
    throw _err('DISPATCH_VALIDATION_ERROR', 'runVerifications: args.attemptNumber must be a positive integer');
  }

  const executionRoot = args.executionRoot;
  const runId = args.runId;
  const task = args.task;
  const attemptNumber = args.attemptNumber;
  const cwd = args.cwd === undefined ? process.cwd() : args.cwd;
  const commandTimeoutMs = args.commandTimeoutMs === undefined ? null : args.commandTimeoutMs;

  const commands = Array.isArray(task.verificationCommands) ? task.verificationCommands : [];

  const results = [];
  for (let index = 0; index < commands.length; index++) {
    const command = commands[index];
    const outcome = await _runVerificationCommand(command, cwd, commandTimeoutMs);
    const passed = outcome.spawnError === null && outcome.exitCode === 0;

    const receiptId = task.id + '-attempt' + attemptNumber + '-verification-' + index;
    store.writeReceipt(executionRoot, runId, receiptId, {
      taskId: task.id,
      attemptNumber: attemptNumber,
      index: index,
      command: command,
      exitCode: outcome.exitCode,
      signal: outcome.signal,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      stdoutTruncated: outcome.stdoutTruncated,
      stderrTruncated: outcome.stderrTruncated,
      durationMs: outcome.durationMs,
      startedAt: outcome.startedAt,
      endedAt: outcome.endedAt,
      timedOut: outcome.timedOut,
      spawnError: outcome.spawnError,
      passed: passed,
    });

    results.push({
      command: command,
      exitCode: outcome.exitCode,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      durationMs: outcome.durationMs,
      passed: passed,
    });

    if (!passed) {
      return { taskId: task.id, attemptNumber: attemptNumber, passed: false, results: results };
    }
  }

  return { taskId: task.id, attemptNumber: attemptNumber, passed: true, results: results };
}

// 40-character hex SHA-1, case-insensitive — same pattern store.js's
// registerCommitSHA and git.js's createTaskCommit already use; kept as its
// own local constant here (no shared export exists for it) rather than
// reaching into either module's private scope.
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

// Real git reachability check: is `sha` an ancestor of (i.e. reachable by
// walking parent links from) whatever `ref` currently resolves to?
//
// `git merge-base --is-ancestor <sha> <ref>` is used rather than
// `git rev-list <ref> | grep <sha>` (enumerate every reachable commit and
// text-search it) for two reasons: (1) correctness — rev-list | grep is a
// substring match that can false-positive on a SHA that is merely a prefix
// of another, and requires shelling a pipe, which this codebase's git
// helpers deliberately avoid (shell:false, argv array, no shell
// interpolation — see git.js's _runGitSync); merge-base needs no pipe at
// all, one argv-only spawnSync call. (2) efficiency — merge-base is the
// git-native primitive for exactly this question and can use the commit
// graph/generation numbers to answer in effectively O(log history) rather
// than materializing and scanning the full reachable set, which matters
// once a feature branch has a non-trivial history. Exit code contract per
// git-merge-base(1): 0 = is an ancestor (reachable), 1 = is not, anything
// else = the query itself was invalid (bad SHA/ref) and is surfaced as a
// real error rather than silently treated as "not reachable".
//
// Duplicated here (not imported from git.js) because git.js has no exported
// generic git-spawn helper — its own _runGitSync/_runGitOrThrow are module-
// private, and exporting one purely for this one call would widen git.js's
// public surface for a single caller. index.js already imports spawnSync
// from child_process (dispatchTaskAttempt's sibling helpers use it too), so
// this duplicates only the minimal spawn call, in the same shell:false,
// argv-array, windowsHide style git.js itself uses.
function _isCommitReachableOnRef(cwd, sha, ref) {
  const res = spawnSync('git', ['merge-base', '--is-ancestor', sha, ref], {
    cwd: cwd,
    shell: false,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (res.error) {
    throw _err(
      'GIT_SPAWN_FAILED',
      'finalizeTaskCheckpoint: failed to spawn "git merge-base --is-ancestor ' + sha + ' ' + ref + '": ' +
        res.error.message
    );
  }
  if (res.status === 0) return true;
  if (res.status === 1) return false;
  throw _err(
    'GIT_MERGE_BASE_FAILED',
    'finalizeTaskCheckpoint: "git merge-base --is-ancestor ' + sha + ' ' + ref + '" in ' + cwd +
      ' failed unexpectedly (exit ' + res.status + '): ' + (res.stderr || '').trim()
  );
}

/**
 * Finalizes one task attempt's checkpoint (US-05-TASK-BE-05; completes US-05
 * "checkpoint, stage, commit, and register SHA"). Runs only after
 * createTaskCommit (US-05-TASK-BE-03, git.js) has produced a commit and
 * store.js's registerCommitSHA (US-05-TASK-BE-04) has already durably
 * recorded it — this function does not commit or register anything itself,
 * it reconciles and closes out what was already recorded:
 *
 *   1. Read the attempt's registered SHA. The attempt must already be at
 *      stage 'committed' (the stage registerCommitSHA leaves it at) — if it
 *      is not, fails closed with TASK_NOT_COMMITTED before touching Git or
 *      the ledger. This is the literal "commit/ledger reconciliation" guard:
 *      a checkpoint can never be finalized on the strength of a chat/agent
 *      self-report alone, only on a durably persisted, staged transition.
 *   2. Verify the registered SHA is REACHABLE on `taskRef` right now, via a
 *      real `git merge-base --is-ancestor` call (see
 *      _isCommitReachableOnRef above for why this call and not a
 *      rev-list-and-grep). A trailer or a bare `git show` success is
 *      explicitly insufficient (Tech-Spec section 8: "A trailer alone or
 *      git show success is insufficient") — ancestry is the only thing this
 *      function trusts. Fails closed with SHA_NOT_ON_BRANCH if the SHA is
 *      not an ancestor of `taskRef`.
 *   3. Mark the task's overall status 'checkpointed' via store.js's
 *      setTaskStatus (existing TASK_STATUSES enum value — not a new status).
 *   4. Close the ledger's 'task'-kind activity — the one dispatchTaskAttempt
 *      (US-03-TASK-BE-03) opens at dispatch time and deliberately never
 *      closes — via execution-ledger.js's finalizeActivity, status 'done',
 *      tokens null with reason 'control-only' (Tech-Spec section 6: "The
 *      task activity carries null token usage (reason: control-only)"),
 *      using the exact same operation_id/agent-key dispatchTaskAttempt used
 *      to open it (`executor:<runId>:<taskId>:task`, same attemptNumber).
 *
 * Scope boundary (explicit — do not extend past this without a later Work
 * Breakdown task): this function implements the N=1 case only, where
 * "closing after checkpoint" IS the terminal task-activity closure
 * (Tech-Spec section 6: "closes after checkpoint and, for N>1, verified
 * integration"; section 8: "N=1: task commit is on feature branch and
 * integratedSha=originalSha after verification"). For maxConcurrency N>1,
 * an attempt's commit lands on a private technical branch first and is only
 * later cherry-picked onto the feature branch by a separate, serialized
 * integration step (US-08-TASK-BE-03/04, not yet implemented) — closing the
 * task activity here, before that integration has happened and been
 * verified, would violate the Tech-Spec's own closing rule for N>1. This
 * function does not know or enforce N=1 vs N>1 itself (no execute()/run
 * loop exists yet to drive either path, per US-07/US-08); it is the future
 * N>1 call site's responsibility to call this function only once
 * integration is verified (or to route through a different, integration-
 * aware finalization step once US-08-TASK-BE-03/04 land), not to call it
 * straight after createTaskCommit's original commit the way the current N=1
 * call site does.
 *
 * Idempotency: calling this twice for the same already-checkpointed attempt
 * is safe. Step 1's precondition (attempt.stage === 'committed') still holds
 * on a second call — nothing in this function advances attempt.stage past
 * 'committed' — so the reachability check simply re-verifies (cheap, no
 * side effect), store.setTaskStatus('checkpointed') is a harmless repeat
 * assignment, and finalizeActivity's own replay contract (identical
 * status/tokens/reason/completedAt returns the existing entry unchanged; is
 * exact-operation_id-match, so a second call finds the entry finalizeActivity
 * would find are conflicting instead of duplicated) makes the ledger close
 * idempotent without any extra bookkeeping in this function.
 *
 * @param {object} args
 * @param {string} args.executionRoot - Absolute path to
 *   <common-git-dir>/ai-toolkit/execution.
 * @param {string} args.runId - UUID of the run.
 * @param {string} args.taskId - Task ID whose attempt is being finalized.
 * @param {number} args.attemptNumber - Positive integer attempt number to
 *   finalize (must match the attempt registerCommitSHA already advanced to
 *   'committed').
 * @param {string} args.projectDir - Absolute path to the Git worktree/repo
 *   the reachability check runs in (the same repo createTaskCommit committed
 *   into).
 * @param {string} args.taskRef - The feature/task ref the registered SHA
 *   must be reachable from (N=1: the feature branch itself, per Tech-Spec
 *   section 8).
 * @returns {{taskId: string, attemptNumber: number, taskStatus: 'checkpointed',
 *   originalSha: string, taskRef: string, ledgerOperationId: string}}
 * @throws {Error} DISPATCH_VALIDATION_ERROR for malformed input;
 *   STATE_NOT_FOUND / STATE_TASK_NOT_FOUND / STATE_ATTEMPT_NOT_FOUND when the
 *   target does not exist; TASK_NOT_COMMITTED when the attempt has not yet
 *   reached stage 'committed'; SHA_NOT_ON_BRANCH when the registered SHA is
 *   not reachable from `taskRef`; GIT_SPAWN_FAILED / GIT_MERGE_BASE_FAILED
 *   for a git invocation problem; ACTIVITY_NOT_FOUND / TERMINAL_CONFLICT
 *   propagated unmodified from execution-ledger.js's finalizeActivity.
 */
function finalizeTaskCheckpoint(args) {
  args = args || {};

  _requireNonEmptyString(args.executionRoot, 'finalizeTaskCheckpoint: args.executionRoot');
  _requireNonEmptyString(args.runId, 'finalizeTaskCheckpoint: args.runId');
  _requireNonEmptyString(args.taskId, 'finalizeTaskCheckpoint: args.taskId');
  _requireNonEmptyString(args.projectDir, 'finalizeTaskCheckpoint: args.projectDir');
  _requireNonEmptyString(args.taskRef, 'finalizeTaskCheckpoint: args.taskRef');
  if (!Number.isInteger(args.attemptNumber) || args.attemptNumber < 1) {
    throw _err('DISPATCH_VALIDATION_ERROR', 'finalizeTaskCheckpoint: args.attemptNumber must be a positive integer');
  }

  const executionRoot = args.executionRoot;
  const runId = args.runId;
  const taskId = args.taskId;
  const attemptNumber = args.attemptNumber;
  const projectDir = args.projectDir;
  const taskRef = args.taskRef;

  // 1. Read the registered SHA — the attempt must already be 'committed'.
  let state = store.readState(executionRoot, runId);
  const task = state.tasks[taskId];
  if (!task) {
    throw _err('STATE_TASK_NOT_FOUND', 'finalizeTaskCheckpoint: task "' + taskId + '" not found');
  }
  const attempt = task.attempts.find(function (a) { return a.number === attemptNumber; });
  if (!attempt) {
    throw _err(
      'STATE_ATTEMPT_NOT_FOUND',
      'finalizeTaskCheckpoint: attempt ' + attemptNumber + ' not found for task "' + taskId + '"'
    );
  }
  if (attempt.stage !== 'committed' || typeof attempt.originalSha !== 'string' || !SHA_PATTERN.test(attempt.originalSha)) {
    throw _err(
      'TASK_NOT_COMMITTED',
      'finalizeTaskCheckpoint: attempt ' + attemptNumber + ' of task "' + taskId + '" is at stage "' + attempt.stage +
        '" and cannot be checkpointed — a checkpoint may only be finalized once the commit SHA has been ' +
        'registered (expected stage "committed" with a valid originalSha)'
    );
  }
  const commitSha = attempt.originalSha;

  // 2. Real git reachability check — never trust the trailer/SHA alone.
  const reachable = _isCommitReachableOnRef(projectDir, commitSha, taskRef);
  if (!reachable) {
    throw _err(
      'SHA_NOT_ON_BRANCH',
      'finalizeTaskCheckpoint: registered commit ' + commitSha + ' for attempt ' + attemptNumber + ' of task "' +
        taskId + '" is not reachable from "' + taskRef + '" — refusing to finalize the checkpoint; nothing changed'
    );
  }

  // 3. Mark the task's overall status 'checkpointed' (existing TASK_STATUSES
  // value — see store.js).
  state = state.setTaskStatus(taskId, 'checkpointed');
  state = store.writeState(executionRoot, runId, state);

  // 4. Close the ledger's 'task'-kind activity dispatchTaskAttempt opened
  // and deliberately left open — same operation_id/agent-key/attempt it was
  // opened with.
  const ledgerPaths = store._executionPaths(executionRoot, runId);
  const ledgerTaskAgentKey = 'executor:' + runId + ':' + taskId + ':task';
  const finalizeResult = ledger.finalizeActivity(ledgerPaths.runDir, runId, ledgerTaskAgentKey, attemptNumber, {
    status: 'done',
    tokens: null,
    reason: 'control-only',
  });

  return {
    taskId: taskId,
    attemptNumber: attemptNumber,
    taskStatus: 'checkpointed',
    originalSha: commitSha,
    taskRef: taskRef,
    ledgerOperationId: finalizeResult.operation_id,
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
  runVerifications,
  runReview,
  finalizeTaskCheckpoint,
};
