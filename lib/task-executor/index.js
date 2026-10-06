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

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const store        = require('./store');
const ownership    = require('./ownership');
const plan         = require('./plan');
const claudeProcess = require('./claude-process');
const git          = require('./git');
const ledger       = require('../execution-ledger');
const agentRegistry = require('../agent-registry');

const IS_WINDOWS = process.platform === 'win32';

// ── worker-liveness process tagging (US-06-TASK-BE-02) ──────────────────────
//
// Generalizes the E-02 evidence-spike's PROVEN "intent-first + reconcile-by-
// tag" technique (see internal_docs/features/FTR-018-deterministic-task-
// execution-checkpoints-and-resume/evidence/E-02-process-supervision/
// harness-registration-window.js): every dispatched worker's argv carries a
// unique, discoverable tag; a coordinator that crashes and later comes back
// (reconcile/resume) can positively confirm whether that exact worker is
// still alive by querying the OS for a live process whose command line
// contains the tag — never by trusting its own possibly-stale in-memory
// belief about what it dispatched. dispatchTaskAttempt (US-03-TASK-BE-03,
// below) is the writer side: it generates the tag and durably persists it
// into attempt.processIdentity BEFORE spawning. _findLiveTaggedProcess below
// is the reader side, used by reconcile/resume's evidence evaluation
// (US-06-TASK-BE-02) to answer "is the worker that owns this tag still
// running right now".
const PROCESS_TAG_PREFIX = 'ai-toolkit-task';

function _buildProcessTag(runId, taskId, attemptNumber) {
  return PROCESS_TAG_PREFIX + ':' + runId + ':' + taskId + ':' + attemptNumber;
}

// Default basename of the real, qualified Claude CLI executable this module
// spawns in production (Windows: claude.exe) — the actual spawned executable
// dispatchTaskAttempt invokes, NOT node.exe (the harness spike's own fake
// workers were plain Node scripts, which is why its filter used
// "Name='node.exe'"; this module's real, production spawn target is the
// Claude CLI itself, so the filter must match ITS basename instead).
// Callers (reconcile/resume/evaluateTaskEvidence) may override this default
// via an explicit exeBasename — tests do so unconditionally, since they
// spawn a real, short-lived Node child process (never a real claude.exe) as
// the tagged "worker" under test, per this task's own testing constraint.
const DEFAULT_TAGGED_PROCESS_EXE_BASENAME = 'claude.exe';

// Permission-bypass flag required for every real (non-test-fixture) worker
// spawn — implementation AND review alike. Without it, a non-interactive
// `--print` invocation has no TTY to answer a permission prompt, so every
// Write/Edit/mkdir tool call is denied by default: confirmed against a real
// blocked run (INFRA-TASK-INFRA-01's own post-dispatch verification found
// none of its expected directories had been created) before this constant
// existed at all. `--permission-mode auto` is a real, documented choice on
// the installed CLI (`claude --help`: "(choices: \"acceptEdits\", \"auto\",
// \"bypassPermissions\", \"manual\", \"dontAsk\", \"plan\")") and is
// deliberately broad (unscoped within the spawned cwd) — the executor's
// whole job is letting a developer agent write anywhere under the task's
// project, so a narrower scoped allowlist is not an option here the way it
// was for pm-phase1/2's read-only-text workers (see
// lib/workflow-control.js's own doc comment on why THAT subsystem sidesteps
// Write entirely instead).
//
// CORRECTION: an earlier version of this constant also appended
// `--permission-prompts none`, citing Tech-Spec OQ-01's pre-Gate-1 spike
// note ("Percorso C", resolved 2026-09-18) as having validated that exact
// pair. Reproduced directly against the real, currently-installed CLI
// (v2.1.220): `--permission-prompts` is NOT a recognized flag at all —
// `claude --print --permission-mode auto --permission-prompts none` fails
// immediately with `error: unknown option '--permission-prompts'` (exit 1,
// commander.js argv validation, before any model/API call). Every dispatch
// would have failed closed again, just with a different symptom (an argv
// crash instead of a denied Write) — so the historical spike note is either
// stale against a since-changed CLI surface or was never run against the
// real executable as literally claimed (this Tech-Spec history already
// contains one prior instance of an overclaimed, later-audited-away result —
// see FTR-018-Gate1-Review-Actions.md's own "Correction (2026-09-22)"). Only
// `--permission-mode auto` is carried forward; it alone was independently
// confirmed sufficient (a live dispatch created all of its task's expected
// directories and files).
const EXECUTOR_PERMISSION_BYPASS_ARGS = ['--permission-mode', 'auto'];

// Real, positive-evidence-only liveness query for a tagged process, using
// the exact E-02-qualified Win32_Process/CIM technique proven in the Gate-1
// evidence spike, adapted from `Name='node.exe'` to the caller-supplied
// `exeBasename` (the real executable dispatchTaskAttempt actually spawned):
//   Get-CimInstance Win32_Process -Filter "Name='<exeBasename>'" |
//     Where-Object { $_.CommandLine -like '*<tag>*' } |
//     Select-Object -ExpandProperty ProcessId
// Same shell:false-at-the-Node-level, single-PowerShell-argv-string spawn
// convention already used by ownership.js's own _queryProcessStartTimeSync
// and claude-process.js's tree-kill helper (the PowerShell command string
// itself is unavoidably one argument; nothing here is built by concatenating
// untrusted input into a shell command outside that one, already-established
// pattern).
//
// Windows-only (Gate-1 E-02 qualification: "no implicit cross-platform
// guarantee") — mirrors ownership.js's checkOwnerLiveness discipline exactly:
// only ever returns positive evidence, never coerces an inconclusive result
// into either extreme.
//
// Returns exactly one of:
//   { status: 'found-alive', pids: number[], reason }         — one or more
//     live processes named `exeBasename` whose command line contains `tag`.
//   { status: 'confirmed-not-found', pids: [], reason }       — the OS
//     positively confirms no such process exists (positive absence
//     evidence, not merely "we didn't look").
//   { status: 'unknown', pids: [], reason }                   — non-Windows,
//     invalid input, or the OS query itself failed/returned an untrusted
//     result. Callers MUST treat this exactly like 'found-alive' for any
//     "is it safe to touch this attempt" decision — never as evidence of
//     death.
function _findLiveTaggedProcess(tag, exeBasename) {
  if (!IS_WINDOWS) {
    return {
      status: 'unknown',
      pids: [],
      reason:
        'process liveness checking is only qualified on Windows (E-02 evidence spike); ' +
        'this platform ("' + process.platform + '") has no qualified liveness mechanism yet',
    };
  }
  if (typeof tag !== 'string' || tag.length === 0) {
    return { status: 'unknown', pids: [], reason: '_findLiveTaggedProcess: tag must be a non-empty string' };
  }
  if (typeof exeBasename !== 'string' || exeBasename.length === 0) {
    return { status: 'unknown', pids: [], reason: '_findLiveTaggedProcess: exeBasename must be a non-empty string' };
  }

  let result;
  try {
    result = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='" + exeBasename + "'\" | " +
          "Where-Object { $_.CommandLine -like '*" + tag + "*' } | " +
          'Select-Object -ExpandProperty ProcessId',
      ],
      { encoding: 'utf8', windowsHide: true }
    );
  } catch (_) {
    return { status: 'unknown', pids: [], reason: '_findLiveTaggedProcess: failed to spawn the OS process query' };
  }

  if (!result || result.error || result.status !== 0 || typeof result.stdout !== 'string') {
    return {
      status: 'unknown',
      pids: [],
      reason: '_findLiveTaggedProcess: the OS process query failed or returned an untrusted result',
    };
  }

  const pids = result.stdout
    .split(/\r?\n/)
    .map(function (s) { return s.trim(); })
    .filter(Boolean)
    .map(Number)
    .filter(function (n) { return Number.isInteger(n) && n > 0; });

  if (pids.length > 0) {
    return {
      status: 'found-alive',
      pids: pids,
      reason:
        'found ' + pids.length + ' live process(es) named "' + exeBasename + '" whose command line ' +
        'matches tag "' + tag + '" (confirmed via OS process query)',
    };
  }
  return {
    status: 'confirmed-not-found',
    pids: [],
    reason:
      'no live process named "' + exeBasename + '" with a command line matching tag "' + tag + '" was found ' +
      '(positive absence evidence, confirmed via OS process query)',
  };
}

// Tree-kill for stop()'s 'immediate' mode, given only a bare PID discovered
// via _findLiveTaggedProcess — NOT claude-process.js's own
// _killProcessTreeSync(child), which requires a live ChildProcess handle this
// process spawned itself. stop() has no such handle: the worker it is
// terminating may belong to a completely different coordinator process (the
// one that originally called dispatchTaskAttempt), discovered only through
// the OS-level tag query. Same E-02-qualified technique otherwise
// (`taskkill /PID <pid> /T /F` on Windows; best-effort SIGKILL by PID,
// reported 'unknown', elsewhere) — duplicated rather than exported from
// claude-process.js for the same reason _killVerificationProcessTreeSync
// above already duplicates it: a different trust/lifetime domain, kept
// independently readable.
function _killProcessTreeByPidSync(pid) {
  if (IS_WINDOWS) {
    const res = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return !res.error && res.status === 0;
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch (_) {
    // best-effort only
  }
  return 'unknown';
}

function _sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// Bounded poll for stop()'s 'immediate' mode: after issuing the kill above,
// re-queries _findLiveTaggedProcess up to `maxAttempts` times (a handful of
// short waits, never an unbounded loop) until the OS positively confirms the
// tagged process is gone. Returns true ONLY on an explicit
// 'confirmed-not-found' result — 'found-alive' (kill did not yet take
// effect) and 'unknown' (inconclusive OS query) both resolve to false, per
// this module's existing discipline of never coercing an inconclusive result
// into a positive claim (mirrors _findLiveTaggedProcess's own contract).
async function _awaitConfirmedTermination(tag, exeBasename, opts) {
  opts = opts || {};
  const maxAttempts = Number.isInteger(opts.maxAttempts) && opts.maxAttempts > 0 ? opts.maxAttempts : 5;
  const intervalMs = Number.isInteger(opts.intervalMs) && opts.intervalMs > 0 ? opts.intervalMs : 200;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const check = _findLiveTaggedProcess(tag, exeBasename);
    if (check.status === 'confirmed-not-found') {
      return true;
    }
    if (attempt < maxAttempts - 1) {
      await _sleep(intervalMs);
    }
  }
  return false;
}

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

// Mirrors lib/workflow-control.js's worker() token-measurement convention
// exactly (same four usage fields, same "only trust a whole, non-negative
// total" rule) so this module reports token usage under the same shared
// definition of "measured" vs "unavailable" the rest of the toolkit uses.
// Returns null (never 0) when usage is missing, partial, or computes to a
// non-positive total.
function _measureTokensFromSpawnResult(spawnResult) {
  const usage = spawnResult && spawnResult.result && spawnResult.result.usage;
  if (!usage) return null;
  const counts = [
    usage.input_tokens, usage.output_tokens,
    usage.cache_read_input_tokens || 0, usage.cache_creation_input_tokens || 0,
  ];
  if (!counts.every(function (n) { return Number.isInteger(n) && n >= 0; })) return null;
  const total = counts.reduce(function (a, b) { return a + b; }, 0);
  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

// Finalizes the 'implementation' or 'review' ledger activity dispatchTaskAttempt/
// runReview already opened for this attempt (Tech-Spec section 6 ledger-kind
// strings) — previously left open forever by _runTaskToResolution regardless
// of outcome (confirmed against a real run: every 'implementation'/'review'
// entry stayed status:'running' indefinitely, even for permanently-failed
// tasks). `kind` must be 'implementation' or 'review'; the agent key this
// reconstructs must match, byte for byte, the literal string
// dispatchTaskAttempt/runReview used when calling ledger.open (their own
// 'executor:'+runId+':'+task.id+':'+kind construction) — finalizeActivity
// requires an exact operation_id match, no name-only fallback.
function _finalizeDispatchLedgerActivity(executionRoot, runId, taskId, attemptNumber, kind, options) {
  return ledger.finalizeActivity(
    store._executionPaths(executionRoot, runId).runDir,
    runId,
    'executor:' + runId + ':' + taskId + ':' + kind,
    attemptNumber,
    options
  );
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
 *   subprocess spawn end-to-end. Either way (default or override), the
 *   attempt's processIdentity tag (US-06-TASK-BE-02) is appended as one
 *   extra trailing argv element before spawning — see the inline comment at
 *   the actual spawnArgs assignment below for the documented residual risk
 *   this carries against the real (not-yet-exercised) Claude CLI.
 * @returns {Promise<{
 *   runId: string, taskId: string, attemptNumber: number,
 *   agentId: string, nativeAgentName: string,
 *   ledgerOperationId: string, processIdentity: string, spawnResult: object
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
  //
  // processIdentity (US-06-TASK-BE-02): a unique, discoverable per-attempt
  // tag (see the "worker-liveness process tagging" file comment above
  // IS_WINDOWS) is generated here and written into the attempt's
  // processIdentity field in the SAME updateAttempt/writeState call that
  // advances the stage to 'dispatching' — i.e. durably on disk BEFORE
  // spawnClaudeAgent is ever invoked below. This ordering is the whole
  // point: a coordinator crash between this write and the actual spawn (or
  // between the spawn and any later write) still leaves a discoverable,
  // already-persisted trail that reconcile/resume's evidence evaluation can
  // positively confirm alive or dead later, with no dependency on any
  // in-memory state the crashed coordinator held.
  const processIdentity = _buildProcessTag(runId, task.id, attemptNumber);

  let state = store.readState(executionRoot, runId);
  const stateTaskEntry = state.tasks[task.id];
  const existingAttempt = stateTaskEntry
    ? stateTaskEntry.attempts.find(function (a) { return a.number === attemptNumber; })
    : undefined;

  if (existingAttempt) {
    state = state.updateAttempt(task.id, attemptNumber, { stage: 'dispatching', processIdentity: processIdentity });
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
    state = state.updateAttempt(task.id, attemptNumber, { stage: 'dispatching', processIdentity: processIdentity });
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
  const baseSpawnArgs = Array.isArray(args.spawnArgs)
    ? args.spawnArgs
    : ['--print', '--output-format', 'json', '--agent', identity.nativeName].concat(EXECUTOR_PERMISSION_BYPASS_ARGS);
  // Append the same processIdentity tag already persisted above as one extra
  // trailing argv element, so it appears verbatim in the spawned process's
  // own command line — this is what makes _findLiveTaggedProcess's later OS
  // query able to find it (see the file-level "worker-liveness process
  // tagging" comment above IS_WINDOWS).
  //
  // RESIDUAL RISK (documented, not blocking): this appends an extra argv
  // element to whatever args the real Claude CLI would otherwise receive.
  // Nothing in this codebase's E-00/E-01/E-02 evidence dossier (see
  // FTR-018-Tech-Spec.md section 3's evidence table) documents a claude.exe
  // CLI flag reference that conclusively confirms an unrecognized trailing
  // positional argv element is safe/ignored by the real executable — every
  // spawn in this test suite (and in this codebase to date) targets
  // tests/fixtures/fake-claude-cli.js, never real claude.exe. The
  // real-Claude-runtime test (US-09-TASK-TEST-02) is separately gated and
  // not yet authorized, so this cannot be empirically validated here. Flagged
  // for verification once that real-runtime test is authorized.
  const spawnArgs = baseSpawnArgs.concat([processIdentity]);
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
    processIdentity: processIdentity,
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
// `criticalFindings` captures both the "CRITICAL (blocks merge):" section AND
// any "Build:"/"Tests:" empirical-verification line carrying the template's
// own ❌ marker — the agent's contract allows FAIL via either path ("FAIL =
// 1+ CRITICAL findings OR build/test failure"), so a build/test-driven FAIL
// is reported just as explainably as a findings-driven one, never as an
// empty, unexplained list.
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

  // The agent's own contract (src/claude/agents/gaia-review-solution.md,
  // "## Output": "FAIL = 1+ CRITICAL findings OR build/test failure") allows
  // a FAIL verdict with zero CRITICAL findings, driven instead by its
  // "Build: ✅/❌ ..." / "Tests: ✅/❌ ..." empirical-verification lines.
  // Without surfacing those too, a build/test-driven FAIL was
  // indistinguishable from an unexplained one — criticalFindings: [] either
  // way (confirmed against a real run: a review-only task with zero code
  // changes failed review twice with reviewPassed:false, criticalFindings:
  // [], and no other evidence persisted anywhere to tell the two cases
  // apart). Any Build/Tests line carrying the template's own ❌ failure
  // marker is folded in here — it is exactly as blocking per the agent's own
  // documented contract, so the outcome receipt now always explains a FAIL,
  // not only a CRITICAL-findings one.
  const empiricalMatches = text.matchAll(/^[ \t]*(Build|Tests):[ \t]*(.*)$/gim);
  for (const m of empiricalMatches) {
    if (m[2].indexOf('❌') !== -1) {
      criticalFindings.push(m[1] + ': ' + m[2].trim());
    }
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
    : ['--print', '--output-format', 'json', '--agent', identity.nativeName].concat(EXECUTOR_PERMISSION_BYPASS_ARGS);
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

// ── reconcile/resume evidence classification (US-06-TASK-BE-01/02) ─────────
//
// Classifies each task's current evidence against the Tech-Spec section 9
// edge-cases table and applies an idempotent repair for the rows that have
// one (registerCommitSHA, finalizeTaskCheckpoint).
//
// US-06-TASK-BE-02 completes the two rows US-06-TASK-BE-01 left as an
// honest partial (see its own historical comment, preserved in git history):
//   - "Worker still live or unknown" / "Dead worker, partial diff": now a
//     REAL check, via the processIdentity tag dispatchTaskAttempt persists
//     before spawning and _findLiveTaggedProcess's OS-level query (see the
//     "worker-liveness process tagging" file comment above IS_WINDOWS) —
//     _classifyLiveOrDeadWorkerAttempt below. An attempt with no recorded
//     processIdentity (predates this feature, or dispatch never reached the
//     persist step) is still reported honestly as liveness-unknown — never
//     silently treated as dead, never replaced. Only a positive
//     confirmed-not-found result, together with the retry policy still
//     permitting a new attempt, ever reports 'dead-worker'.
//   - "Failed verification/review ... within retry policy": full retry-
//     policy attempt-count enforcement ("one initial implementation + one
//     automatic rework, two total per task ... a task beyond policy is
//     blocked: replan-required") is now applied — _classifyFailedAttempt
//     below.
// Also NOT implemented: the Tech-Spec's full "Recovery of missing SHA"
// search ("search reachable commits from recorded task/feature refs; match
// exact trailers, parent, full tree and path inventory ... one exact
// candidate is recoverable ... multiple/incompatible candidates block").
// That is a full scan over every commit reachable from taskRef. This module
// only inspects the CURRENT TIP of taskRef as the sole recovery candidate
// (reusing finalizeTaskCheckpoint's own merge-base-adjacent, single-commit
// inspection style) — a narrower, real, working check consistent with
// createTaskCommit's own post-commit tree/parent/trailer reinspection
// pattern (lib/task-executor/git.js), not a reachable-set-wide scan. A tip
// that does not exactly match this attempt's persisted checkpoint intent is
// reported as blocked (ambiguous), never guessed at.
//
// "Reconcile/resume require no live competing coordinator" (Tech-Spec
// section 9) IS enforced, by _ensureNoLiveCompetingCoordinator below, called
// at the very start of both reconcile() and resume() — before any repair
// (registerCommitSHA/finalizeTaskCheckpoint). See that function's own doc
// comment for the exact decision table. Neither function acquires or
// reclaims the repo-wide execution lease itself — only verifies no OTHER
// live coordinator holds it.

// Narrow, tip-only commit inspection — NOT a reachable-set scan (see file
// comment above). Duplicates (rather than imports) the minimal tree/parent/
// trailer parsing git.js's createTaskCommit already does privately, in the
// same shell:false/argv-array/windowsHide spawn style already used
// throughout this file (e.g. _isCommitReachableOnRef above). Returns null
// (never throws) when `sha` cannot be read as a commit object.
function _readCommitObjectSummary(cwd, sha) {
  const res = spawnSync('git', ['cat-file', '-p', sha], {
    cwd: cwd,
    shell: false,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (res.error || res.status !== 0) return null;

  const lines = res.stdout.split('\n');
  let tree = null;
  const parents = [];
  let i = 0;
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === '') { i += 1; break; }
    if (line.indexOf('tree ') === 0) {
      tree = line.slice(5).trim();
    } else if (line.indexOf('parent ') === 0) {
      parents.push(line.slice(7).trim());
    }
  }
  const message = lines.slice(i).join('\n');
  const trimmed = message.replace(/\s+$/, '');
  const paragraphs = trimmed.split(/\n\n+/);
  const lastParagraph = paragraphs[paragraphs.length - 1] || '';
  const trailers = {};
  lastParagraph.split('\n').forEach(function (line) {
    const idx = line.indexOf(': ');
    if (idx === -1) return;
    trailers[line.slice(0, idx)] = line.slice(idx + 2);
  });

  return { tree: tree, parents: parents, trailers: trailers };
}

// "Corrupted/modified state" (AC-12, US-06-TASK-BE-02): a completed task
// (checkpointed/integrated) or an already-'committed' attempt awaiting only
// checkpoint finalization whose last dispatched attempt's TAGGED WORKER
// PROCESS IS STILL ALIVE right now is an internally inconsistent evidence
// set. dispatchTaskAttempt only ever returns once spawnClaudeAgent's promise
// resolves — i.e. after that process has fully exited — so a genuinely
// finished attempt's worker should already be gone; a live match here means
// either the tag was reused/corrupted, or a stale/orphaned process is still
// running under the identity this run believes is done and checkpointed.
// Detected ONLY from POSITIVE liveness evidence (found-alive): 'unknown' and
// 'confirmed-not-found' are the expected, non-corrupted outcomes for a
// genuinely finished attempt's worker (already exited, or liveness simply
// can't be checked on this platform) and are never themselves treated as
// evidence of corruption — mirrors this whole file's "never guess" discipline.
function _isCompletedAttemptWorkerUnexpectedlyAlive(ctx, attempt) {
  if (typeof attempt.processIdentity !== 'string' || attempt.processIdentity.length === 0) {
    return false;
  }
  const liveness = _findLiveTaggedProcess(attempt.processIdentity, ctx.exeBasename);
  return liveness.status === 'found-alive';
}

// "Integrated commit + valid intent and receipts" / "Completed task but
// unreachable/mismatched commit" / "Corrupted/missing evidence" (for an
// already-checkpointed/integrated task). Read-only — never repairs a
// completed task; a task that already reached 'checkpointed'/'integrated'
// with bad evidence is reported blocked, not silently reopened.
function _classifyCompletedTask(ctx, taskId, attempt) {
  if (_isCompletedAttemptWorkerUnexpectedlyAlive(ctx, attempt)) {
    return { classification: 'blocked', action: 'corrupted-or-modified-state' };
  }

  if (typeof attempt.originalSha !== 'string' || !SHA_PATTERN.test(attempt.originalSha)) {
    return { classification: 'blocked', action: 'corrupted-or-missing-evidence' };
  }

  let reachable;
  try {
    reachable = _isCommitReachableOnRef(ctx.projectDir, attempt.originalSha, ctx.taskRef);
  } catch (_err) {
    return { classification: 'blocked', action: 'corrupted-or-missing-evidence' };
  }
  if (!reachable) {
    return { classification: 'blocked', action: 'unreachable-or-mismatched-commit' };
  }

  if (!Array.isArray(attempt.intentIds) || attempt.intentIds.length === 0) {
    return { classification: 'blocked', action: 'corrupted-or-missing-evidence' };
  }
  try {
    attempt.intentIds.forEach(function (id) { store.readIntent(ctx.executionRoot, ctx.runId, id); });
    store.readReceipt(ctx.executionRoot, ctx.runId, taskId + '-attempt' + attempt.number + '-outcome');
  } catch (_err) {
    return { classification: 'blocked', action: 'corrupted-or-missing-evidence' };
  }

  return { classification: 'up-to-date', action: 'keep-completion' };
}

// "Integration commit/ref exists but state missing" (N=1 shape: attempt
// already 'committed', task overall status not yet advanced past it).
// Repair: finalizeTaskCheckpoint — an already-existing, already-idempotent
// primitive (US-05-TASK-BE-05) — is invoked directly; this function does not
// duplicate its reachability/ledger logic.
function _classifyCommittedAttempt(ctx, taskId, attempt) {
  if (_isCompletedAttemptWorkerUnexpectedlyAlive(ctx, attempt)) {
    return { classification: 'blocked', action: 'corrupted-or-modified-state' };
  }

  if (typeof attempt.originalSha !== 'string' || !SHA_PATTERN.test(attempt.originalSha)) {
    return { classification: 'blocked', action: 'corrupted-or-missing-evidence' };
  }

  let reachable;
  try {
    reachable = _isCommitReachableOnRef(ctx.projectDir, attempt.originalSha, ctx.taskRef);
  } catch (_err) {
    return { classification: 'blocked', action: 'corrupted-or-missing-evidence' };
  }
  if (!reachable) {
    return { classification: 'blocked', action: 'unreachable-or-mismatched-commit' };
  }

  try {
    finalizeTaskCheckpoint({
      executionRoot: ctx.executionRoot,
      runId: ctx.runId,
      taskId: taskId,
      attemptNumber: attempt.number,
      projectDir: ctx.projectDir,
      taskRef: ctx.taskRef,
    });
  } catch (err) {
    return { classification: 'blocked', action: 'checkpoint-finalization-failed:' + (err.code || 'UNKNOWN') };
  }

  return { classification: 'reconciled', action: 'checkpoint-finalized', repairAction: 'finalize-checkpoint' };
}

// "Commit exists but SHA not recorded" (attempt at 'checkpoint-prepared',
// no originalSha registered yet) vs the case where no commit has landed at
// all yet. See the file-level scope comment above: only taskRef's CURRENT
// TIP is inspected as the sole recovery candidate — this is intentionally
// narrower than the Tech-Spec's full reachable-commit-set scan.
function _classifyCheckpointPreparedAttempt(ctx, taskId, attempt) {
  const checkpointIntentId = taskId + '-attempt' + attempt.number + '-checkpoint';
  const intentIds = Array.isArray(attempt.intentIds) ? attempt.intentIds : [];
  if (intentIds.indexOf(checkpointIntentId) === -1) {
    return { classification: 'blocked', action: 'corrupted-or-missing-evidence' };
  }

  let intent;
  try {
    intent = store.readIntent(ctx.executionRoot, ctx.runId, checkpointIntentId);
  } catch (_err) {
    return { classification: 'blocked', action: 'corrupted-or-missing-evidence' };
  }

  const tipRes = spawnSync('git', ['rev-parse', '--verify', ctx.taskRef + '^{commit}'], {
    cwd: ctx.projectDir,
    shell: false,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (tipRes.error || tipRes.status !== 0) {
    return { classification: 'blocked', action: 'corrupted-or-missing-evidence' };
  }
  const tip = tipRes.stdout.trim();

  if (tip === intent.parentSha) {
    // taskRef has not moved since the checkpoint intent was persisted — no
    // commit has landed yet. Reconcile never creates commits; this only
    // reports the classification.
    return { classification: 'checkpoint-prepared-no-commit', action: 'needs-commit-creation' };
  }

  const candidate = _readCommitObjectSummary(ctx.projectDir, tip);
  const trailerKeys = intent.trailers ? Object.keys(intent.trailers) : [];
  const matches = candidate !== null &&
    candidate.parents.length === 1 &&
    candidate.parents[0] === intent.parentSha &&
    candidate.tree === intent.expectedTreeSha &&
    trailerKeys.length > 0 &&
    trailerKeys.every(function (key) { return candidate.trailers[key] === intent.trailers[key]; });

  if (!matches) {
    // taskRef moved, but the tip does not exactly match this attempt's own
    // persisted intent — an ambiguous/incompatible candidate. Per Tech-Spec
    // ("multiple/incompatible candidates block"): block, never guess.
    return { classification: 'blocked', action: 'unreachable-or-mismatched-commit' };
  }

  try {
    store.registerCommitSHA(ctx.executionRoot, ctx.runId, taskId, attempt.number, tip, { sequential: true });
  } catch (err) {
    return { classification: 'blocked', action: 'sha-registration-failed:' + (err.code || 'UNKNOWN') };
  }

  return { classification: 'reconciled', action: 'commit-sha-registered', repairAction: 'register-commit-sha' };
}

// "Worker still live or unknown" / "Dead worker, partial diff" (Tech-Spec
// section 9, US-06-TASK-BE-02). Real check via the processIdentity tag
// dispatchTaskAttempt persists before spawning (see the "worker-liveness
// process tagging" file comment above IS_WINDOWS) and _findLiveTaggedProcess's
// OS-level query.
function _classifyLiveOrDeadWorkerAttempt(ctx, taskId, task, attempt) {
  if (typeof attempt.processIdentity !== 'string' || attempt.processIdentity.length === 0) {
    // No tag recorded at all (an attempt that predates this feature, or one
    // whose dispatch never reached the persist-before-invoke step) — cannot
    // be checked. Same honest-partial result US-06-TASK-BE-01 already
    // reported unconditionally for every attempt at these stages.
    return { classification: 'worker-live-or-unknown', action: 'no-replacement-diagnose' };
  }

  const liveness = _findLiveTaggedProcess(attempt.processIdentity, ctx.exeBasename);

  if (liveness.status === 'found-alive') {
    // Worker confirmed live: never touch, never dispatch a replacement — the
    // same safe behavior US-06-TASK-BE-01 already applied unconditionally,
    // now backed by a real, positive OS confirmation instead of an assumption.
    return { classification: 'worker-live', action: 'no-replacement-diagnose-or-pause' };
  }

  if (liveness.status === 'unknown') {
    // Inconclusive (non-Windows, or the OS query itself failed/untrusted) —
    // never coerce into either extreme; refuse to touch, exactly like a
    // confirmed-live worker.
    return { classification: 'worker-live-or-unknown', action: 'no-replacement-diagnose' };
  }

  // confirmed-not-found: positive absence evidence — the tagged worker
  // process genuinely no longer exists. Subject to the retry policy
  // (Tech-Spec section 9: "one initial implementation + one automatic
  // rework, two total per task ... a task beyond policy is blocked:
  // replan-required") — this attempt itself already consumed one of the (at
  // most two) real implementation invocations task.attempts.length counts
  // (see _classifyFailedAttempt's own comment for why that count needs no
  // extra filtering).
  if (task.attempts.length >= 2) {
    return { classification: 'blocked', action: 'replan-required' };
  }

  // "Dead worker, partial diff" -> "Preserve and attribute; new attempt
  // within retry policy". Whatever partial evidence this attempt already
  // recorded (a verification/review outcome, or even a commit that somehow
  // landed despite the worker dying) is preserved as-is — nothing here
  // discards or rewrites it; hasPartialEvidence is reported for visibility
  // only, the action is the same either way (a new attempt is needed, subject
  // to the retry policy just enforced above).
  const hasPartialEvidence =
    (Array.isArray(attempt.verificationRefs) && attempt.verificationRefs.length > 0) ||
    (Array.isArray(attempt.reviewRefs) && attempt.reviewRefs.length > 0) ||
    (typeof attempt.originalSha === 'string' && attempt.originalSha.length > 0);

  return {
    classification: 'dead-worker',
    action: 'preserve-and-attribute-new-attempt-within-retry-policy',
    hasPartialEvidence: hasPartialEvidence,
  };
}

// "Failed verification/review" (Tech-Spec section 9, US-06-TASK-BE-02): full
// retry-policy attempt-count enforcement. "One initial implementation + one
// automatic rework (two total per task). Review rejections and
// implementation failures consume attempts when new implementation is
// invoked. Resuming verification, ledger projection or an existing commit
// does not. A task beyond policy is blocked: replan-required."
//
// task.attempts.length is exactly the count of real implementation
// invocations recorded for this task: store.js's addAttempt is only ever
// called from dispatchTaskAttempt (US-03-TASK-BE-03) — nothing in this
// codebase calls it merely to resume verification, project the ledger, or
// re-inspect an existing commit. So this count already matches the
// Tech-Spec's own "resuming ... does not [consume attempts]" rule with no
// extra filtering needed: a task whose attempts.length is already 2 has used
// both the initial implementation and its one automatic rework, so a third
// attempt is beyond policy.
function _classifyFailedAttempt(task) {
  if (task.attempts.length >= 2) {
    return { classification: 'blocked', action: 'replan-required' };
  }
  return { classification: 'failed', action: 'needs-new-attempt-subject-to-retry-policy' };
}

// Single per-task classification dispatch. Never touches a task that has
// never been dispatched (status 'pending' with zero attempts) — reconcile
// "does not dispatch" (Tech-Spec section 9).
function _classifyTask(ctx, taskId, task) {
  if (task.status === 'skipped') {
    return { classification: 'skipped', action: 'none' };
  }

  if (task.status === 'checkpointed' || task.status === 'integrated') {
    const attempt = task.attempts[task.attempts.length - 1];
    if (!attempt) {
      return { classification: 'blocked', action: 'corrupted-or-missing-evidence' };
    }
    return _classifyCompletedTask(ctx, taskId, attempt);
  }

  if (task.status === 'blocked') {
    return { classification: 'blocked', action: 'already-blocked' };
  }

  if (!Array.isArray(task.attempts) || task.attempts.length === 0) {
    return { classification: 'not-started', action: 'none' };
  }

  const attempt = task.attempts[task.attempts.length - 1];
  switch (attempt.stage) {
    case 'committed':
      return _classifyCommittedAttempt(ctx, taskId, attempt);
    case 'checkpoint-prepared':
      return _classifyCheckpointPreparedAttempt(ctx, taskId, attempt);
    case 'reviewed':
      // "Review passed, no commit" -> recheck unchanged tree then finish
      // checkpoint. Recomputing/re-verifying the tree is out of scope here
      // (it needs the same inputs persistCheckpointIntent/stageTaskFiles
      // need, which reconcile is not given); this reports the classification
      // only.
      return { classification: 'reviewed-no-checkpoint', action: 'needs-checkpoint-completion' };
    case 'verified':
      // Real, reachable persisted stage only between the two writes
      // persistVerificationReviewOutcome makes when verification passes
      // (store.js) — evidence of a passed verification without a recorded
      // review outcome yet.
      return { classification: 'verified-no-review-outcome', action: 'needs-review' };
    case 'implementation-recorded':
      // "Implementation result persisted" -> continue verification, not
      // implementation.
      return { classification: 'implementation-recorded', action: 'needs-verification' };
    case 'prepared':
    case 'dispatching':
    case 'running':
    case 'interrupted':
      return _classifyLiveOrDeadWorkerAttempt(ctx, taskId, task, attempt);
    case 'failed':
      return _classifyFailedAttempt(task);
    default:
      return { classification: 'blocked', action: 'corrupted-or-missing-evidence' };
  }
}

// ── execute() main loop (US-07-TASK-BE-01) ──────────────────────────────────
//
// Sequential (maxConcurrency=1) run loop: derives the executor's run identity
// from the approved feature's own Work Breakdown, acquires the repo-wide
// execution lease for a brand-new run, creates the initial run state, then
// drives the ready queue to completion one task at a time. Each ready task's
// slot is reserved (task status 'active') through dispatch -> verify ->
// review -> checkpoint -> commit, and released only once the task reaches a
// terminal status ('checkpointed' or 'blocked') — before the next ready task
// is ever considered. N>1 concurrent slots is explicitly out of scope here
// (US-08).

// One initial implementation + one automatic rework, two total per task
// (Tech-Spec section 9) — the same retry-policy rule US-06-TASK-BE-02's
// _classifyFailedAttempt/_classifyLiveOrDeadWorkerAttempt already enforce via
// a literal `>= 2` check; named here so execute()'s own enforcement of the
// identical rule reads as the same policy, not a coincidentally-matching
// magic number.
const MAX_ATTEMPTS_PER_TASK = 2;

function _isBeyondRetryPolicy(state, taskId) {
  return state.tasks[taskId].attempts.length >= MAX_ATTEMPTS_PER_TASK;
}

// Resolves the absolute common Git directory for `projectDir` THROUGH Git
// (Tech-Spec section 5: "Discover absolute worktree root and common Git
// directory through Git, not root/.git string concatenation") — never
// hand-built by string-concatenating ".git" onto the project path, which
// would be wrong for a linked worktree. `git rev-parse --git-common-dir` may
// return a path relative to `projectDir` depending on the installed Git
// version, so the result is resolved to absolute via `path.resolve` against
// `projectDir` — that resolution step is the only non-Git part of this
// function; the directory identity itself always comes from Git.
function _resolveCommonGitDir(projectDir) {
  const res = spawnSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: projectDir, shell: false, encoding: 'utf8', windowsHide: true,
  });
  if (res.error || res.status !== 0) {
    throw _err(
      'GIT_SPAWN_FAILED',
      'execute: failed to resolve the common Git directory for "' + projectDir + '": ' +
        (res.error ? res.error.message : (res.stderr || '').trim())
    );
  }
  return path.resolve(projectDir, res.stdout.trim());
}

function _resolveRefTip(cwd, ref, label) {
  const res = spawnSync('git', ['rev-parse', '--verify', ref + '^{commit}'], {
    cwd: cwd, shell: false, encoding: 'utf8', windowsHide: true,
  });
  if (res.error || res.status !== 0) {
    throw _err(
      'GIT_REF_RESOLUTION_FAILED',
      'execute: failed to resolve ' + label + ' "' + ref + '" in ' + cwd + ': ' +
        (res.error ? res.error.message : (res.stderr || '').trim())
    );
  }
  return res.stdout.trim();
}

// Derives taskRef as the CURRENT checked-out branch (Tech-Spec's N=1 model:
// "task commit is on feature branch") via `git rev-parse --abbrev-ref HEAD` —
// used only when the caller (execute()) does not supply an explicit
// args.taskRef override. A detached HEAD has no branch to derive a ref from,
// so it fails closed rather than guessing.
function _currentBranchRef(projectDir) {
  const res = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: projectDir, shell: false, encoding: 'utf8', windowsHide: true,
  });
  if (res.error || res.status !== 0) {
    throw _err(
      'GIT_REF_RESOLUTION_FAILED',
      'execute: failed to resolve the current branch for "' + projectDir + '": ' +
        (res.error ? res.error.message : (res.stderr || '').trim())
    );
  }
  const name = res.stdout.trim();
  if (name === 'HEAD') {
    throw _err(
      'EXECUTE_VALIDATION_ERROR',
      'execute: "' + projectDir + '" has a detached HEAD — a task/feature ref cannot be derived automatically; ' +
        'check out a branch first, or pass args.taskRef explicitly'
    );
  }
  return 'refs/heads/' + name;
}

function _buildTaskCommitMessage(task) {
  if (task.commit && typeof task.commit.type === 'string' && typeof task.commit.subject === 'string') {
    const scope = typeof task.commit.scope === 'string' && task.commit.scope.length > 0
      ? '(' + task.commit.scope + ')'
      : '';
    return task.commit.type + scope + ': ' + task.commit.subject;
  }
  return 'chore: ' + task.id;
}

// Real, side-effect-free diff for the review agent (Tech-Spec section 8:
// "the review must see exactly what will be checkpointed" / "unexpected
// tracked changes invalidate the reviewed diff"). Built per enumerated
// changedPaths entry (the SAME array git.detectChangedPaths just produced,
// and that will later be staged/committed unchanged) rather than a single
// blanket `git diff`, specifically so this function never mutates the Git
// index (no `git add -N`/intent-to-add trick, which WOULD mutate it) —
// stageTaskFiles's own before/after index snapshot (US-05-TASK-BE-02) must
// still see the exact pre-staging state this function ran against.
//   - 'delete'/'modify' entries: plain `git diff -- <path>` (tracked file,
//     real exit 0 either way).
//   - 'add' entries: `git diff --no-index -- /dev/null <path>` — the
//     documented git idiom for diffing an untracked file against "nothing"
//     without ever touching the index; per git-diff(1), --no-index exits 1
//     when a difference is found (the expected, common case here), which is
//     NOT an error and must not be treated as one.
function _computeReviewDiff(cwd, changedPaths) {
  const parts = changedPaths.map(function (entry) {
    let res;
    if (entry.changeType === 'add') {
      res = spawnSync('git', ['diff', '--no-color', '--no-index', '--', '/dev/null', entry.path], {
        cwd: cwd, shell: false, encoding: 'utf8', windowsHide: true,
      });
      if (res.error || (res.status !== 0 && res.status !== 1)) {
        throw _err(
          'REVIEW_DIFF_FAILED',
          '_computeReviewDiff: "git diff --no-index" for added path "' + entry.path + '" failed: ' +
            (res.error ? res.error.message : (res.stderr || '').trim())
        );
      }
    } else {
      res = spawnSync('git', ['diff', '--no-color', '--', entry.path], {
        cwd: cwd, shell: false, encoding: 'utf8', windowsHide: true,
      });
      if (res.error || res.status !== 0) {
        throw _err(
          'REVIEW_DIFF_FAILED',
          '_computeReviewDiff: "git diff" for path "' + entry.path + '" (changeType "' + entry.changeType +
            '") failed: ' + (res.error ? res.error.message : (res.stderr || '').trim())
        );
      }
    }
    return res.stdout;
  });
  return parts.join('\n');
}

// Drives ONE ready task through dispatch -> verify -> review -> checkpoint,
// retrying (a NEW attempt on the SAME task) within the retry policy on a
// failure, and only returning once the task has reached a terminal status
// ('checkpointed' or 'blocked') — i.e. once its reserved slot can safely be
// released back to the outer ready-queue loop in execute().
async function _runTaskToResolution(ctx) {
  const executionRoot = ctx.executionRoot;
  const runId = ctx.runId;
  const projectDir = ctx.projectDir;
  const taskRef = ctx.taskRef;
  const featureRef = ctx.featureRef;
  const planDigest = ctx.planDigest;
  const task = ctx.task;
  const taskId = task.id;
  const agentId = agentRegistry.resolveWorkBreakdownAgentType(task.agentType).canonicalId;

  for (;;) {
    let state = store.readState(executionRoot, runId);
    state = state.setTaskStatus(taskId, 'active');
    state = store.writeState(executionRoot, runId, state);

    const attemptNumber = state.tasks[taskId].attempts.length + 1;

    let dispatchResult;
    try {
      dispatchResult = await dispatchTaskAttempt({
        executionRoot: executionRoot,
        runId: runId,
        task: task,
        attemptNumber: attemptNumber,
        claudePath: ctx.claudePath,
        agentId: agentId,
        projectDir: projectDir,
        taskTimeoutMs: ctx.taskTimeoutMs,
        spawnArgs: ctx.implementationSpawnArgs,
      });
    } catch (dispatchErr) {
      state = store.readState(executionRoot, runId);
      const attemptRecord = state.tasks[taskId].attempts.find(function (a) { return a.number === attemptNumber; });
      if (!attemptRecord) {
        // Failed BEFORE persist-before-invoke (e.g. NO_LOCK_HELD,
        // AGENT_NOT_VERIFIED, DEFINITION_HASH_MISMATCH, a systemic/config
        // problem, not a per-task transient failure). Never consume a task
        // attempt for an environment problem outside the task itself —
        // propagate so execute() itself fails (the lease is still released
        // via its own try/finally).
        throw dispatchErr;
      }
      // Close the 'implementation' ledger activity dispatchTaskAttempt already
      // opened before this threw — the same persist-before-invoke ordering
      // that proves the attempt was durably recorded (the check just above)
      // also proves ledger.open already ran for it. Otherwise this activity
      // would stay open forever, exactly the gap the success path below also
      // fixes.
      _finalizeDispatchLedgerActivity(executionRoot, runId, taskId, attemptNumber, 'implementation',
        { status: 'failed', tokens: null, reason: dispatchErr.code || 'UNKNOWN' });
      // Genuine spawn-level failure (spawnClaudeAgent itself threw) AFTER
      // the attempt was already durably recorded — this DOES consume the
      // attempt, exactly like a verification/review failure does.
      state = state.updateAttempt(taskId, attemptNumber, {
        stage: 'failed',
        terminalReason: 'dispatch-error:' + (dispatchErr.code || 'UNKNOWN'),
      });
      state = store.writeState(executionRoot, runId, state);
      if (_isBeyondRetryPolicy(state, taskId)) {
        state = state.setTaskStatus(taskId, 'blocked');
        store.writeState(executionRoot, runId, state);
        return;
      }
      if (state.runStatus === 'stopping') {
        // A stop request was persisted while this attempt was in flight
        // (Tech-Spec section 7: "immediate: request termination ... await
        // confirmed terminal state" — stop work on this task now, not after
        // one more retry attempt). Still within retry policy, so this is NOT
        // 'blocked' (that status means "retry policy exhausted", which is
        // not what happened here) — leave the attempt's/task's status as
        // already recorded ('failed'/'active') and return without dispatching
        // attempt 2. execute()'s own outer loop observes 'stopping' on its
        // very next iteration and sets the final runStatus to 'paused'.
        return;
      }
      continue;
    }

    // Close the 'implementation' ledger activity opened by dispatchTaskAttempt
    // — previously left open forever (confirmed against a real run: every
    // 'implementation'/'review' entry stayed status:'running' indefinitely,
    // even for tasks that had already reached a terminal 'failed' stage).
    // "done" here means the subprocess ran to completion and returned a
    // result, independent of whether verification/review later judges that
    // result a pass or fail — that judgment is recorded separately, on the
    // task's own outcome receipt (persistVerificationReviewOutcome below),
    // never on this activity's ledger status. Mirrors the 'task'-kind
    // control-only close below (finalizeTaskCheckpoint) in structure, but
    // carries real measured tokens instead of an always-null control signal.
    _finalizeDispatchLedgerActivity(executionRoot, runId, taskId, attemptNumber, 'implementation',
      { status: 'done', tokens: _measureTokensFromSpawnResult(dispatchResult.spawnResult) });

    const verification = await runVerifications({
      executionRoot: executionRoot, runId: runId, task: task, attemptNumber: attemptNumber,
      cwd: projectDir, commandTimeoutMs: ctx.taskTimeoutMs,
    });

    let review = null;
    let changedPaths = null;
    if (verification.passed) {
      // Detected once per attempt (Gate-1 binding constraint #2's mandatory
      // negative test relies on this: a self-reported "success" that wrote
      // nothing real is caught here/by verification, never trusted alone).
      changedPaths = git.detectChangedPaths(projectDir);
      const diff = _computeReviewDiff(projectDir, changedPaths);
      review = await runReview({
        executionRoot: executionRoot, runId: runId, task: task, attemptNumber: attemptNumber,
        claudePath: ctx.claudePath, projectDir: projectDir, diff: diff, taskTimeoutMs: ctx.taskTimeoutMs,
        spawnArgs: ctx.reviewSpawnArgs,
      });
      // Close the 'review' ledger activity runReview already opened — same
      // previously-open-forever gap the 'implementation' close above fixes,
      // same reasoning: "done" reflects the subprocess completing, not the
      // review's own pass/fail verdict (that lives on the outcome receipt).
      _finalizeDispatchLedgerActivity(executionRoot, runId, taskId, attemptNumber, 'review',
        { status: 'done', tokens: _measureTokensFromSpawnResult(review.spawnResult) });
    }

    const outcome = store.persistVerificationReviewOutcome(executionRoot, runId, taskId, attemptNumber, verification, review);

    if (outcome.stage !== 'reviewed') {
      state = store.readState(executionRoot, runId);
      if (_isBeyondRetryPolicy(state, taskId)) {
        state = state.setTaskStatus(taskId, 'blocked');
        store.writeState(executionRoot, runId, state);
        return;
      }
      if (state.runStatus === 'stopping') {
        // Same stop-awareness as the dispatch-error retry site above: a stop
        // request was persisted while this attempt's verification/review was
        // in flight (or just after). Still within retry policy — return
        // without dispatching another attempt rather than forcing 'blocked',
        // and let execute()'s outer loop settle the run to 'paused'.
        return;
      }
      continue;
    }

    // Checkpoint: stage first (US-05-TASK-BE-02) so its OWN write-tree
    // result becomes the checkpoint intent's expectedTreeSha, THEN persist
    // the intent (US-05-TASK-BE-01) with that now-known treeSha, THEN commit
    // (US-05-TASK-BE-03) against the exact intent just persisted, THEN
    // register the SHA (US-05-TASK-BE-04, store.js) sequentially — this run
    // is always N=1 — THEN finalize (US-05-TASK-BE-05).
    const stagingResult = git.stageTaskFiles(projectDir, changedPaths);
    const parentSha = _resolveRefTip(projectDir, taskRef, 'taskRef');

    const verificationReceiptIds = verification.results.map(function (_result, index) {
      return taskId + '-attempt' + attemptNumber + '-verification-' + index;
    });

    state = store.readState(executionRoot, runId);
    const persisted = git.persistCheckpointIntent(executionRoot, runId, {
      featureId: state.featureId,
      runId: runId,
      taskId: taskId,
      attemptNumber: attemptNumber,
      planDigest: planDigest,
      featureRef: featureRef,
      taskRef: taskRef,
      parentSha: parentSha,
      expectedTreeSha: stagingResult.treeSha,
      changedPaths: changedPaths,
      verificationReceiptIds: verificationReceiptIds,
      reviewReceiptId: outcome.reviewReceiptId,
      outcomeReceiptId: outcome.outcomeReceiptId,
      commitMessage: _buildTaskCommitMessage(task),
    });

    const commitResult = git.createTaskCommit(projectDir, persisted.intent, stagingResult);

    store.registerCommitSHA(executionRoot, runId, taskId, attemptNumber, commitResult.commitSha, { sequential: true });

    finalizeTaskCheckpoint({
      executionRoot: executionRoot, runId: runId, taskId: taskId, attemptNumber: attemptNumber,
      projectDir: projectDir, taskRef: taskRef,
    });

    return;
  }
}

// ── createTaskWorktree (US-08-TASK-BE-01) ───────────────────────────────────
//
// Creates and manages one isolated Git worktree for one task attempt — the
// standalone primitive later US-08 tasks (N-limit concurrency/slot
// reservation, US-08-TASK-BE-02; serial cherry-pick integration,
// US-08-TASK-BE-03) will build on. This function does NOT dispatch any
// agent and does NOT stage/commit anything — it only creates/manages the
// worktree directory itself. It is NOT wired into execute()'s existing
// sequential main loop above, which stays N=1/single-worktree-free per
// US-07-TASK-BE-01's explicit scope; execute() never calls this function.
//
// Path convention: <executionRoot>/runs/<runId>/worktrees/<taskId>-attempt
// <attemptNumber> — reuses store.js's own run-owned root layout
// (store._executionPaths: runs/<runId>/{state.json,receipts/,intents/}, see
// that module's file-header comment) rather than inventing a new root.
// Tech-Spec section 8 requires only "an external worktree path under a
// validated run-owned root; no reused slot names" for N>1 attempts — it does
// not mandate a more precise shape — so extending store.js's existing runDir
// convention is the natural, non-duplicating choice. taskId+attemptNumber
// together are already the unique identity of an attempt throughout this
// module (see _buildProcessTag, addAttempt's own `id: taskId + '#' +
// number`), so this path can never collide across tasks or attempts within
// one run.
//
// Branch convention: Tech-Spec section 8 DOES mandate an exact branch name
// for N>1 attempts — "each attempt has unique branch
// ai-toolkit/<runId>/<taskId>/<attempt>" — so createTaskWorktree creates
// exactly that branch (`git worktree add -b <branch> <path> <baseSha>`),
// never a detached HEAD, so later cherry-pick/integration (US-08-TASK-BE-03)
// has a real ref to read the attempt's commit(s) from.
const WORKTREE_BRANCH_PREFIX = 'ai-toolkit';

function _worktreeFail(field, reason) {
  throw _err('WORKTREE_VALIDATION_ERROR', 'createTaskWorktree: ' + field + ' ' + reason);
}

// Local string validator (rather than the shared _requireNonEmptyString,
// which is hardcoded to DISPATCH_VALIDATION_ERROR for the dispatch-family
// functions above) so every malformed-input error this function throws
// carries the same, single WORKTREE_VALIDATION_ERROR code.
function _requireWorktreeString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    _worktreeFail(field, 'must be a non-empty string');
  }
}

// Shared spawn helper for every git invocation in this section — same house
// style as every other git.js/index.js spawn site: shell:false (argv array,
// no shell interpolation/globbing), encoding utf8, windowsHide.
function _runGitForWorktree(cwd, args) {
  return spawnSync('git', args, { cwd: cwd, shell: false, encoding: 'utf8', windowsHide: true });
}

// Parses `git worktree list --porcelain` into the absolute, resolved list of
// every worktree path Git currently knows about for this repo (the main
// worktree first, then every linked one) — the ground truth this function
// cross-checks a newly requested path against, rather than trusting its own
// computed path never to collide.
function _listWorktreePaths(projectDir) {
  const res = _runGitForWorktree(projectDir, ['worktree', 'list', '--porcelain']);
  if (res.error || res.status !== 0) {
    throw _err(
      'GIT_WORKTREE_LIST_FAILED',
      'createTaskWorktree: failed to list existing worktrees for "' + projectDir + '": ' +
        (res.error ? res.error.message : (res.stderr || '').trim())
    );
  }
  const paths = [];
  (res.stdout || '').split(/\r?\n/).forEach(function (line) {
    if (line.indexOf('worktree ') === 0) {
      paths.push(path.resolve(line.slice('worktree '.length).trim()));
    }
  });
  return paths;
}

// Canonicalizes `p` for COMPARISON purposes only (never for the path
// actually handed to git argv or returned to callers — those stay the
// plain, deterministic path.resolve() form). This exists because on
// Windows, a path built from os.tmpdir()/fs.mkdtempSync can be an 8.3
// short-name alias (e.g. "...\TOMADA~1\...") while Git reports the SAME
// directory using its long form (e.g. "...\Tomada D\...") in
// `git worktree list --porcelain` — proven by direct experiment, not
// assumed: plain fs.realpathSync does NOT resolve this alias on this
// platform, but fs.realpathSync.native (the libuv-backed, OS-level call)
// does. Without canonicalizing both sides before comparison, every
// collision/independence check below would silently never match, and every
// "same path" check would silently never fire.
// For a path that does not exist yet (the target worktree path, before
// creation), realpath.native has nothing to resolve — so this walks up to
// the deepest EXISTING ancestor, canonicalizes that, and re-appends the
// not-yet-existing suffix unchanged.
function _canonicalizePathForCompare(p) {
  const resolved = path.resolve(p);
  let existing = resolved;
  const suffix = [];
  for (;;) {
    try {
      const real = fs.realpathSync.native(existing);
      return suffix.length > 0 ? path.join.apply(path, [real].concat(suffix)) : real;
    } catch (_) {
      const parent = path.dirname(existing);
      if (parent === existing) {
        return resolved; // reached the filesystem root; nothing existed to canonicalize against
      }
      suffix.unshift(path.basename(existing));
      existing = parent;
    }
  }
}

function _samePath(a, b) {
  return _canonicalizePathForCompare(a) === _canonicalizePathForCompare(b);
}

// True when `b` is exactly `a`, or is nested one or more levels inside `a` —
// used both directions (new path inside an existing worktree, or an
// existing worktree inside the new path) so createTaskWorktree fails closed
// on ANY overlap rather than only the more obvious direction. Compares
// canonicalized forms (see _canonicalizePathForCompare) so Windows
// short/long path aliasing can never hide a real collision or manufacture a
// false one.
function _pathsOverlap(a, b) {
  const realA = _canonicalizePathForCompare(a);
  const realB = _canonicalizePathForCompare(b);
  if (realA === realB) return true;
  const rel = path.relative(realA, realB);
  return rel !== '' && rel !== '.' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Creates one isolated Git worktree for one task attempt, under a run-owned
 * root, and returns its path plus a cleanup callback. See the file comment
 * immediately above for the path/branch conventions this follows.
 *
 * Independence is validated BOTH before and after creation:
 *   - Before: the computed target path is cross-checked against every path
 *     `git worktree list --porcelain` reports (main worktree included) for
 *     exact collision and for nesting in either direction. Any overlap fails
 *     closed with WORKTREE_COLLISION before `git worktree add` ever runs.
 *   - After: the path Git actually registers must include the exact
 *     requested path (WORKTREE_INDEPENDENCE_CHECK_FAILED otherwise), and its
 *     real (symlink-resolved) directory must differ from the main
 *     worktree's real directory — guards against a path that Git or the
 *     filesystem silently aliased back onto the main checkout.
 *
 * @param {object} args
 * @param {string} args.projectDir - Absolute path to the main Git worktree
 *   (the project root `git worktree add` is run from).
 * @param {string} args.executionRoot - Absolute path to
 *   <common-git-dir>/ai-toolkit/execution (same root store.js's
 *   _executionPaths resolves runs/<runId>/... under).
 * @param {string} args.runId - UUID of the current run.
 * @param {string} args.taskId - Task identifier this worktree is for.
 * @param {number} args.attemptNumber - Positive integer attempt number this
 *   worktree is for.
 * @param {string} args.baseSha - Commit-ish (full SHA, or any ref Git can
 *   resolve) the new attempt branch is created from.
 * @returns {{ worktreePath: string, branch: string, cleanup: Function }}
 *   `cleanup` is synchronous, idempotent, and safe to call even if the
 *   worktree directory was already removed by hand — see its own inline
 *   comment below for exactly what "safe" means here.
 * @throws {Error} WORKTREE_VALIDATION_ERROR for malformed input;
 *   GIT_WORKTREE_LIST_FAILED if `git worktree list` cannot be run;
 *   WORKTREE_COLLISION if the computed path collides with or is nested
 *   inside/around an existing worktree, or already exists on disk;
 *   GIT_WORKTREE_ADD_FAILED if `git worktree add` itself fails;
 *   WORKTREE_INDEPENDENCE_CHECK_FAILED if post-creation verification does
 *   not confirm a genuinely separate, registered worktree.
 */
function createTaskWorktree(args) {
  args = args || {};
  _requireWorktreeString(args.projectDir, 'args.projectDir');
  _requireWorktreeString(args.executionRoot, 'args.executionRoot');
  _requireWorktreeString(args.runId, 'args.runId');
  _requireWorktreeString(args.taskId, 'args.taskId');
  _requireWorktreeString(args.baseSha, 'args.baseSha');
  if (!Number.isInteger(args.attemptNumber) || args.attemptNumber < 1) {
    _worktreeFail('args.attemptNumber', 'must be a positive integer');
  }

  const projectDir = path.resolve(args.projectDir);
  const executionRoot = args.executionRoot;
  const runId = args.runId;
  const taskId = args.taskId;
  const attemptNumber = args.attemptNumber;
  const baseSha = args.baseSha;

  const runDir = store._executionPaths(executionRoot, runId).runDir;
  const worktreesRoot = path.join(runDir, 'worktrees');
  const worktreePath = path.resolve(path.join(worktreesRoot, taskId + '-attempt' + attemptNumber));
  const branch = WORKTREE_BRANCH_PREFIX + '/' + runId + '/' + taskId + '/' + attemptNumber;

  if (fs.existsSync(worktreePath)) {
    throw _err(
      'WORKTREE_COLLISION',
      'createTaskWorktree: target path "' + worktreePath + '" already exists on disk — refusing to overwrite it'
    );
  }

  // The run-owned root (executionRoot, hence worktreePath) lives under the
  // repo's common Git directory (Tech-Spec section 5 / store.js's own
  // convention: <common-git-dir>/ai-toolkit/execution) — administrative Git
  // storage that is, BY GIT'S OWN DESIGN, excluded from every worktree's
  // tracked file tree (no `git status`/diff in ANY worktree ever reports
  // into another worktree's .git internals). A worktree path that lands
  // under commonDir is therefore never actually "inside" any worktree's
  // checked-out content, even though it is filesystem-nested under the main
  // worktree's own directory for a standard (non `--separate-git-dir`)
  // repo — so nesting under commonDir specifically is exempted from the
  // collision check below. Anything else — a path nested inside a
  // worktree's real tracked directory, or identical to one — still fails
  // closed.
  const commonDir = path.resolve(_resolveCommonGitDir(projectDir));
  const worktreePathIsUnderCommonDir = _samePath(commonDir, worktreePath) || _pathsOverlap(commonDir, worktreePath);

  // Pre-creation independence check against every worktree Git already
  // knows about, main included — fail closed on any real overlap rather
  // than letting `git worktree add` decide (it would happily create a
  // worktree nested inside another one's tracked directory).
  const knownPaths = _listWorktreePaths(projectDir);
  if (!knownPaths.some(function (p) { return _samePath(p, projectDir); })) {
    knownPaths.push(projectDir);
  }
  knownPaths.forEach(function (knownPath) {
    if (_samePath(knownPath, worktreePath)) {
      throw _err(
        'WORKTREE_COLLISION',
        'createTaskWorktree: requested worktree path "' + worktreePath + '" is identical to the existing ' +
          'worktree "' + knownPath + '" — refusing to create a non-independent worktree'
      );
    }
    if (_pathsOverlap(worktreePath, knownPath)) {
      // The new path would be an ANCESTOR of an existing worktree — always a
      // real collision (it would swallow that worktree's tracked directory),
      // regardless of commonDir.
      throw _err(
        'WORKTREE_COLLISION',
        'createTaskWorktree: requested worktree path "' + worktreePath + '" would contain the existing ' +
          'worktree "' + knownPath + '" — refusing to create a non-independent worktree'
      );
    }
    if (_pathsOverlap(knownPath, worktreePath)) {
      // The new path is nested inside knownPath's directory. Exempt only
      // when that nesting is entirely explained by commonDir sitting inside
      // knownPath (i.e., the overlap is administrative Git storage, not
      // knownPath's own tracked content).
      const exemptViaCommonDir = worktreePathIsUnderCommonDir &&
        (_samePath(knownPath, commonDir) || _pathsOverlap(knownPath, commonDir));
      if (!exemptViaCommonDir) {
        throw _err(
          'WORKTREE_COLLISION',
          'createTaskWorktree: requested worktree path "' + worktreePath + '" is nested inside the existing ' +
            'worktree "' + knownPath + '" — refusing to create a non-independent worktree'
        );
      }
    }
  });

  fs.mkdirSync(worktreesRoot, { recursive: true });

  const addRes = _runGitForWorktree(projectDir, ['worktree', 'add', '-b', branch, worktreePath, baseSha]);
  if (addRes.error || addRes.status !== 0) {
    throw _err(
      'GIT_WORKTREE_ADD_FAILED',
      'createTaskWorktree: "git worktree add -b ' + branch + ' ' + worktreePath + ' ' + baseSha + '" failed: ' +
        (addRes.error ? addRes.error.message : (addRes.stderr || '').trim())
    );
  }

  // Post-creation independence verification: the path Git actually
  // registered must be exactly the one requested (not silently normalized
  // or aliased to something else), and its real, symlink-resolved directory
  // must differ from the main worktree's.
  const postPaths = _listWorktreePaths(projectDir);
  if (!postPaths.some(function (p) { return _samePath(p, worktreePath); })) {
    throw _err(
      'WORKTREE_INDEPENDENCE_CHECK_FAILED',
      'createTaskWorktree: "git worktree add" reported success but "' + worktreePath + '" is not listed by ' +
        '"git worktree list --porcelain" afterward — refusing to trust an unconfirmed worktree'
    );
  }
  let realWorktreePath;
  let realProjectDir;
  try {
    realWorktreePath = fs.realpathSync.native(worktreePath);
    realProjectDir = fs.realpathSync.native(projectDir);
  } catch (err) {
    throw _err(
      'WORKTREE_INDEPENDENCE_CHECK_FAILED',
      'createTaskWorktree: failed to resolve real paths for independence verification: ' + err.message
    );
  }
  if (realWorktreePath === realProjectDir) {
    throw _err(
      'WORKTREE_INDEPENDENCE_CHECK_FAILED',
      'createTaskWorktree: the created worktree resolves to the SAME real directory as the main worktree "' +
        projectDir + '" — refusing an alias rather than a genuinely independent checkout'
    );
  }

  let cleaned = false;

  // Removes the worktree directory (`git worktree remove --force`, never the
  // plain/"safe" variant — deliberate: by the time this primitive's caller
  // is done with an attempt's worktree, the attempt's real output is already
  // checkpointed as a commit on `branch` (Tech-Spec section 8: "commit
  // remains on technical ref until integration"), so any leftover
  // uncommitted/untracked worktree state is disposable, never the sole copy
  // of anything that matters. A plain `git worktree remove` refuses on any
  // uncommitted change, which would leave a slot permanently stuck for a
  // reason this primitive does not need to honor here).
  //
  // Safe to call more than once (no-op after the first successful removal),
  // and safe to call after the worktree directory was already removed by
  // hand: this is confirmed by RE-QUERYING `git worktree list --porcelain`
  // after a failed/no-op remove attempt — only a remove that fails AND still
  // leaves the path registered is treated as a real failure (e.g. genuinely
  // locked, or blocked by something other than "it's already gone").
  function cleanup() {
    if (cleaned) return;

    const removeRes = _runGitForWorktree(projectDir, ['worktree', 'remove', '--force', worktreePath]);
    if (!removeRes.error && removeRes.status === 0) {
      cleaned = true;
      return;
    }

    const stillRegistered = _listWorktreePaths(projectDir).some(function (p) { return _samePath(p, worktreePath); });
    if (!stillRegistered) {
      cleaned = true; // already gone (manually removed, or already cleaned up) — safe no-op
      return;
    }

    throw _err(
      'GIT_WORKTREE_REMOVE_FAILED',
      'createTaskWorktree.cleanup: "git worktree remove --force ' + worktreePath + '" failed and the worktree ' +
        'is still registered: ' + (removeRes.error ? removeRes.error.message : (removeRes.stderr || '').trim())
    );
  }

  return { worktreePath: worktreePath, branch: branch, cleanup: cleanup };
}

// ── createSlotPool (US-08-TASK-BE-02) ───────────────────────────────────────
//
// N-limit concurrency control / slot reservation — the second standalone
// US-08 primitive, alongside createTaskWorktree (US-08-TASK-BE-01) above.
// Like createTaskWorktree, this is NOT wired into execute()'s existing
// sequential main loop (US-07-TASK-BE-01, which stays N=1/unchanged);
// execute() never calls this function. Real N>1 dispatch integration is
// US-08-TASK-BE-03 (serial integration) and US-08-TASK-BE-04 (SHA tracking) —
// both later, separate tasks.
//
// Tech-Spec's binding rule for N (section 7): "N counts reserved task slots
// through verification/review/commit/integration; a full slot is released
// only when consolidated or safely stopped. This bounds unintegrated work as
// well."
//
// SCOPE BOUNDARY — read before wiring this into any future orchestrator:
// this primitive tracks ONLY the count/identity of currently held slot
// tokens against a fixed capacity N. It has no idea what a "task", an
// "attempt", "verification", "review", "checkpoint", or "integration" is —
// those concepts do not appear anywhere in this section. The Tech-Spec rule
// above is an OPERATIONAL DISCIPLINE the CALLER must follow, not something
// this primitive enforces or even observes: a future execute()-level
// orchestrator is responsible for calling tryAcquire() at dispatch time and
// holding the returned token through the ENTIRE dispatch → verify → review →
// checkpoint → commit → integration lifecycle for that task attempt, calling
// release() only once that whole lifecycle reaches a terminal outcome
// (successful integration, or a safe-stop/terminal-failure path that gives
// up on the attempt for good). If a future caller released the slot early
// (e.g. right after dispatch, before verification/review/integration
// complete), this primitive would have no way to know that was wrong — it
// would simply see one more free unit of capacity and hand it out to a new
// acquire. Enforcing "released only after integration verified" as a system
// property requires the future orchestrator to hold the token op-for-op
// across that whole lifecycle; this primitive only supplies the fail-closed
// counting/identity mechanism that discipline is built on top of.
//
// maxConcurrency validation deliberately mirrors execute()'s own
// "args.maxConcurrency must be a positive safe integer" check (Number.isInteger
// + Number.isSafeInteger + >= 1) for consistency of error shape across the
// module — but NOT execute()'s separate "only 1 is supported, reject any
// other value, never downgrade" policy: that reject/never-downgrade decision
// is about what execute() itself currently implements, not a constraint
// createSlotPool needs to know about or duplicate. This primitive accepts
// any valid positive-safe-integer N — enforcing which N values a future
// orchestrator is allowed to request stays entirely execute()'s call.
function createSlotPool(maxConcurrency) {
  if (!Number.isInteger(maxConcurrency) || !Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1) {
    throw _err('SLOT_POOL_VALIDATION_ERROR', 'createSlotPool: maxConcurrency must be a positive safe integer');
  }

  // Held-slot identity set, keyed by an opaque token string this pool itself
  // mints and hands back from tryAcquire(). Using an explicit per-slot token
  // (rather than a bare counter) is what makes double-release and
  // bogus-release detectable: release() can check "is this EXACT token
  // currently held" instead of merely "is the counter above zero" — a caller
  // that fabricates a token, reuses one already released, or passes a token
  // from a different pool entirely is rejected the same way a genuine
  // double-release is (SLOT_NOT_HELD), never silently accepted.
  const heldTokens = new Set();
  let nextTokenSeq = 1;

  // Fails closed: returns null (never throws, never blocks) the instant all
  // maxConcurrency slots are already held — per this task's own documented
  // choice of "returns null" over "throws SLOT_POOL_EXHAUSTED", since a
  // future caller driving a ready-queue loop naturally wants a plain falsy
  // "no capacity right now, try another task or wait" signal here rather
  // than an exception for what is an entirely expected, non-error condition
  // (a full pool is the normal steady state of a busy run, not a fault).
  function tryAcquire() {
    if (heldTokens.size >= maxConcurrency) {
      return null;
    }
    const token = 'slot-' + (nextTokenSeq++);
    heldTokens.add(token);
    return token;
  }

  // Releases exactly one previously acquired, still-held token. Guards
  // against double-release and bogus/unknown tokens by construction (Set
  // membership check) rather than trusting the caller: an already-released
  // token, a fabricated string, or a token from a different createSlotPool()
  // instance all fail the same way (SLOT_NOT_HELD) instead of silently
  // decrementing a bare counter below zero or accepting a release that was
  // never actually a held slot.
  function release(token) {
    if (typeof token !== 'string' || !heldTokens.has(token)) {
      throw _err(
        'SLOT_NOT_HELD',
        'createSlotPool.release: "' + token + '" is not a currently held slot in this pool ' +
          '(never acquired, already released, or acquired from a different pool)'
      );
    }
    heldTokens.delete(token);
  }

  // Read-only inspection for tests/diagnostics — neither call ever mutates
  // pool state; both simply report the CURRENT snapshot at call time (there
  // is no cached/stale value to go wrong, since heldTokens.size is read
  // fresh on every call).
  function activeCount() {
    return heldTokens.size;
  }

  function remainingCapacity() {
    return maxConcurrency - heldTokens.size;
  }

  return {
    tryAcquire: tryAcquire,
    release: release,
    activeCount: activeCount,
    remainingCapacity: remainingCapacity,
    maxConcurrency: maxConcurrency,
  };
}

/**
 * `start` command real implementation (US-07-TASK-BE-01): sequential
 * (maxConcurrency=1) main loop with ready-queue dispatch. Validates
 * args/config, acquires the repo-wide execution lease for a brand-new run,
 * creates an immutable initial state from the feature's OWN approved plan
 * (this feature's own Work-Breakdown.md/.csv, read from disk via the same
 * _deriveFeatureDir/_derivePrefix convention replan() already uses), and
 * drives dispatch/verification/review/checkpoint to completion or block.
 *
 * Only maxConcurrency=1 is implemented here — any other requested value is
 * REJECTED (UNSUPPORTED_CONCURRENCY), never silently downgraded (Tech-Spec
 * section 10: "Requested N=effective N; if host cannot support it, reject,
 * never downgrade"). N>1 concurrent slots is US-08 scope.
 *
 * Main-loop design (see file-level "execute() main loop" comment above and
 * _runTaskToResolution for the per-task detail):
 *   1. Compute the ready queue (plan.computeReadyQueue) once, up front, over
 *      the immutable plan snapshot — this is the full stable dispatch order
 *      the run will use whenever nothing is actually blocked (see
 *      computeReadyQueue's own doc comment for why one static pass suffices).
 *   2. Repeatedly: re-read state, find the FIRST task (in that stable order)
 *      that is still 'pending' AND whose dependencies are all
 *      'checkpointed'/'integrated'. Dispatch it via _runTaskToResolution,
 *      which reserves its slot (status 'active') through dispatch, verify,
 *      review, checkpoint and commit — retrying a NEW attempt on the SAME
 *      task within the retry policy on failure, or marking it 'blocked' once
 *      the policy is exhausted — before this loop ever considers another
 *      task. This is the literal "one task slot" invariant (AC-06).
 *   3. Stop (never spin) once no task is both non-terminal and ready — e.g.
 *      every remaining task is pending on a dependency that is itself
 *      blocked. The final run status reflects this (see below).
 *
 * Final runStatus: 'completed' if every task reached
 * checkpointed/integrated/skipped; 'blocked' otherwise (at least one task is
 * blocked, or pending on a dependency that never resolved).
 *
 * The repo-wide execution lease is released in a try/finally, so it is
 * released even if the loop exits via an uncaught error (e.g. a
 * DEFINITION_HASH_MISMATCH / NO_LOCK_HELD systemic failure propagated by
 * _runTaskToResolution) — this run never leaves the lease dangling on the
 * failure path it itself created.
 *
 * @param {object} args
 * @param {string} args.project - Absolute or project-relative path used to
 *   resolve the repo root and common Git directory (also used as `cwd` for
 *   every dispatch/verification/git operation).
 * @param {string} args.feature - Path to the feature's feature.md, used to
 *   derive PREFIX and locate this feature's OWN Work-Breakdown.md/.csv.
 * @param {number} [args.maxConcurrency=1] - Requested task slot count N.
 *   Must be a positive safe integer; only 1 is supported by this task — any
 *   other value is rejected with UNSUPPORTED_CONCURRENCY, never downgraded.
 * @param {string} [args.claudePath] - Explicit path to the qualified Claude
 *   CLI executable, forwarded to every dispatch/review invocation.
 * @param {number} [args.taskTimeoutMs] - Per-task timeout budget, forwarded
 *   to dispatch/verification/review.
 * @param {number} [args.agentBudgetUsd] - Per-run agent spend budget,
 *   persisted into state.config unchanged (not itself enforced here).
 * @param {string} [args.taskRef] - Explicit override for the feature/task ref
 *   commits land on. When omitted, derived from the CURRENT checked-out
 *   branch of args.project via `git rev-parse --abbrev-ref HEAD`.
 * @param {string[]} [args.implementationSpawnArgs] - Test-only override of
 *   the full CLI args array forwarded to every dispatchTaskAttempt call (see
 *   dispatchTaskAttempt's own args.spawnArgs) — tests use this to substitute
 *   tests/fixtures/fake-claude-cli.js's own invocation shape while still
 *   exercising a real subprocess spawn end-to-end. Omitted in production.
 * @param {string[]} [args.reviewSpawnArgs] - Test-only override of the full
 *   CLI args array forwarded to every runReview call (see runReview's own
 *   args.spawnArgs). Omitted in production.
 * @returns {Promise<object>} Versioned result object:
 *   { protocolVersion, runId, runStatus, tasks: [{ taskId, status }] }.
 * @throws {Error} DISPATCH_VALIDATION_ERROR for malformed maxConcurrency;
 *   UNSUPPORTED_CONCURRENCY for any requested maxConcurrency other than 1;
 *   EXECUTE_VALIDATION_ERROR when a PREFIX cannot be derived or HEAD is
 *   detached with no explicit args.taskRef; PLAN_NOT_FOUND when this
 *   feature's own Work-Breakdown.md/.csv cannot be read; PLAN_PARSE_ERROR
 *   propagated unmodified from plan.createPlanSnapshot; LEASE_HELD when a
 *   repo-wide execution lease is already held; any error propagated
 *   unmodified from dispatchTaskAttempt/runVerifications/runReview/git.js/
 *   store.js for a systemic (non-task-attempt) failure.
 */
async function execute(args) {
  // Platform qualification guard (US-08-TASK-BE-05) — the single most
  // fundamental precondition of this whole function, checked before ANY
  // other validation, before deriving executionRoot, before touching the
  // plan/snapshot, before acquiring the ownership lease, and before creating
  // any worktree. Checked dynamically against the live process.platform
  // (never a module-load-time-cached constant like this file's own
  // IS_WINDOWS above) so it reflects the real, current platform at call
  // time. Fail-closed, no partial/"best effort" execution on any other
  // platform: this feature's own Gate-1 approval (binding constraint #3)
  // states "E-02 is Windows-only qualified. Other platforms require
  // dedicated proofs before their execution is enabled; no implicit
  // cross-platform guarantee." E-02 is the process-supervision evidence
  // dossier (tree-kill via taskkill, tag-based liveness scanning via
  // Win32_Process CIM queries) that this executor's crash-recovery/stop/
  // worker-liveness machinery (ownership.js's checkOwnerLiveness, this
  // file's own _findLiveTaggedProcess, stop()'s immediate-mode kill) depends
  // on — none of it is proven correct on non-Windows platforms.
  if (process.platform !== 'win32') {
    throw _err(
      'PLATFORM_NOT_QUALIFIED',
      'execute: platform "' + process.platform + '" is not qualified to run the task executor — the E-02 ' +
        'process-supervision qualification (tree-kill via taskkill, tag-based liveness scanning via ' +
        'Win32_Process CIM queries) that this executor\'s crash-recovery/stop/worker-liveness machinery ' +
        'depends on is proven for Windows only. Other platforms require dedicated proofs before their ' +
        'execution is enabled; refusing to proceed (no partial or best-effort execution).'
    );
  }

  args = args || {};
  _requireNonEmptyString(args.project, 'execute: args.project');
  _requireNonEmptyString(args.feature, 'execute: args.feature');

  const maxConcurrency = args.maxConcurrency === undefined ? 1 : args.maxConcurrency;
  if (!Number.isInteger(maxConcurrency) || !Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1) {
    throw _err('DISPATCH_VALIDATION_ERROR', 'execute: args.maxConcurrency must be a positive safe integer');
  }
  if (maxConcurrency !== 1) {
    throw _err(
      'UNSUPPORTED_CONCURRENCY',
      'execute: requested maxConcurrency ' + maxConcurrency + ' is not supported yet — only maxConcurrency=1 is ' +
        'implemented (US-07-TASK-BE-01); N>1 concurrent slots is US-08 scope. Refusing to silently downgrade ' +
        '(Tech-Spec section 10: "Requested N=effective N; if host cannot support it, reject, never downgrade").'
    );
  }

  const projectDir = args.project;

  const featureDir = _deriveFeatureDir(args.feature);
  const prefix = _derivePrefix(featureDir);
  if (!prefix) {
    throw _err(
      'EXECUTE_VALIDATION_ERROR',
      'execute: could not derive a PREFIX (e.g. "FTR-018") from feature directory "' + featureDir + '"'
    );
  }
  const mdPath = path.join(featureDir, prefix + '-Work-Breakdown.md');
  const csvPath = path.join(featureDir, prefix + '-Work-Breakdown.csv');
  let md;
  let csv;
  try {
    md = fs.readFileSync(mdPath, 'utf8');
    csv = fs.readFileSync(csvPath, 'utf8');
  } catch (err) {
    throw _err(
      'PLAN_NOT_FOUND',
      'execute: Work Breakdown MD/CSV not found at "' + mdPath + '" / "' + csvPath + '": ' + err.message
    );
  }
  // Propagates PLAN_PARSE_ERROR unmodified — a malformed/unapproved plan
  // never silently starts a run.
  const snapshot = plan.createPlanSnapshot(md, csv);

  const commonDir = _resolveCommonGitDir(projectDir);
  const executionRoot = path.join(commonDir, 'ai-toolkit', 'execution');

  const runId = crypto.randomUUID();
  // Fail closed if already held — this is a brand-new run; reclaiming a
  // stale lease is an explicit reconcile/resume/replan decision, never an
  // implicit part of starting a fresh execute() call.
  const lease = ownership.acquireLease(executionRoot, runId);

  try {
    const taskRef = typeof args.taskRef === 'string' && args.taskRef.length > 0
      ? args.taskRef
      : _currentBranchRef(projectDir);
    const featureRef = taskRef;
    const baseSha = _resolveRefTip(projectDir, 'HEAD', 'HEAD');

    let state = new store.State({
      runId: runId,
      featureId: prefix,
      repo: projectDir,
      commonDir: commonDir,
      featureRef: featureRef,
      baseSha: baseSha,
      planDigest: snapshot.planDigest,
      config: {
        maxConcurrency: 1,
        claudePath: args.claudePath,
        taskTimeoutMs: args.taskTimeoutMs,
        agentBudgetUsd: args.agentBudgetUsd,
      },
      runStatus: 'running',
    });

    snapshot.tasks.forEach(function (task) {
      state = state.addTask(task.id, { dependencies: task.dependsOn });
    });
    store.writeState(executionRoot, runId, state);

    const tasksById = new Map(snapshot.tasks.map(function (t) { return [t.id, t]; }));
    const orderedTaskIds = plan.computeReadyQueue(snapshot).map(function (t) { return t.id; });

    // US-07-TASK-BE-02 loop-cooperation flag: stop()'s graceful mode is
    // documented as "block new dispatch" — this loop is the only thing that
    // can actually enforce that block, since stop() itself never touches a
    // task in flight. Set only when this loop observes runStatus 'stopping'
    // at its own natural iteration boundary (the re-read below, which
    // already happens once per completed/blocked task — never mid-task);
    // used after the loop to report 'paused' instead of running the normal
    // completed/blocked classification against a run that still has
    // legitimately-pending (never dispatched) tasks.
    let stopRequested = false;

    for (;;) {
      state = store.readState(executionRoot, runId);

      if (state.runStatus === 'stopping') {
        // A stop request (either mode) was persisted by a concurrent stop()
        // call. This is the exact "natural iteration boundary" the request
        // waits for: the previous task (if any) already reached a terminal
        // outcome (checkpointed/blocked) via the prior loop iteration's
        // await below, and no task is currently reserved by this loop. Do
        // not dispatch the next ready task — leave it 'pending' — and stop.
        stopRequested = true;
        break;
      }

      const nonTerminalIds = orderedTaskIds.filter(function (id) {
        const st = state.tasks[id].status;
        return st !== 'checkpointed' && st !== 'integrated' && st !== 'skipped' && st !== 'blocked';
      });
      if (nonTerminalIds.length === 0) break;

      const readyTaskId = orderedTaskIds.find(function (id) {
        const t = state.tasks[id];
        if (t.status !== 'pending') return false;
        return t.dependencies.every(function (depId) {
          const dep = state.tasks[depId];
          return dep && (dep.status === 'checkpointed' || dep.status === 'integrated');
        });
      });

      if (!readyTaskId) {
        // Nothing more can proceed right now (e.g. every remaining task is
        // pending on a dependency that is itself blocked) — stop, do not
        // spin. Reflected in the final run status below.
        break;
      }

      await _runTaskToResolution({
        executionRoot: executionRoot,
        runId: runId,
        projectDir: projectDir,
        taskRef: taskRef,
        featureRef: featureRef,
        planDigest: snapshot.planDigest,
        task: tasksById.get(readyTaskId),
        claudePath: args.claudePath,
        taskTimeoutMs: args.taskTimeoutMs,
        implementationSpawnArgs: args.implementationSpawnArgs,
        reviewSpawnArgs: args.reviewSpawnArgs,
      });
    }

    state = store.readState(executionRoot, runId);
    let finalRunStatus;
    if (stopRequested) {
      // Tech-Spec section 10: "Stopping a run returns accepted request
      // state; status confirms when it actually paused." 'paused' (already
      // part of RUN_STATUSES) is the correct terminal-for-this-loop status
      // here — unlike the completed/blocked branch below, a stop-truncated
      // run legitimately still has 'pending' tasks that were never attempted
      // and are not "blocked" in the retry-policy/dependency sense.
      finalRunStatus = 'paused';
    } else {
      const allTerminalSuccess = Object.keys(state.tasks).every(function (id) {
        const st = state.tasks[id].status;
        return st === 'checkpointed' || st === 'integrated' || st === 'skipped';
      });
      finalRunStatus = allTerminalSuccess ? 'completed' : 'blocked';
    }
    state = state.setRunStatus(finalRunStatus);
    state = store.writeState(executionRoot, runId, state);

    return {
      protocolVersion: store.PROTOCOL_VERSION,
      runId: runId,
      runStatus: finalRunStatus,
      tasks: Object.keys(state.tasks).sort().map(function (id) {
        return { taskId: id, status: state.tasks[id].status };
      }),
    };
  } finally {
    try {
      ownership.releaseLease(executionRoot, runId, lease.nonce);
    } catch (_releaseErr) {
      // Best-effort: never mask the loop's own result/error because the
      // lease could not be released (e.g. it was already gone).
    }
  }
}

// Reads the run's own token ledger (<executionRoot>/runs/<runId>/<runId>-
// token-ledger.json, written by ../execution-ledger.js's open/close/fail/
// skip) as a flat array of entries. No activity opened yet is a normal,
// non-error state (returns []) — a present-but-unparseable file fails closed
// instead, since that is evidence of a corrupted run, not an empty one.
function _readRunLedgerEntries(executionRoot, runId) {
  const ledgerPath = path.join(executionRoot, 'runs', runId, runId + '-token-ledger.json');
  let raw;
  try {
    raw = fs.readFileSync(ledgerPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw _err('LEDGER_READ_FAILED', 'status: failed to read token ledger at ' + ledgerPath + ': ' + err.message);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw _err('LEDGER_CORRUPTED', 'status: token ledger at ' + ledgerPath + ' is not valid JSON: ' + err.message);
  }
  if (!Array.isArray(parsed)) {
    throw _err('LEDGER_CORRUPTED', 'status: token ledger at ' + ledgerPath + ' must be a JSON array, got ' + typeof parsed);
  }
  return parsed;
}

// Loads docs/token-pricing.json from the TARGET project (args.project), not
// this toolkit's own checkout — the same file and project-relative
// resolution lib/workflow-artifacts.js's pricing() uses for feature
// Token-Estimate documents (see lib/workflow-control.js). A missing file
// means "cost unavailable", not an error: not every consuming project ships
// pricing data, and status must still report token counts for one that
// doesn't. A present-but-invalid file fails closed.
function _loadTokenPricing(projectDir) {
  const pricingPath = path.join(projectDir, 'docs', 'token-pricing.json');
  let raw;
  try {
    raw = fs.readFileSync(pricingPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw _err('PRICING_READ_FAILED', 'status: failed to read token pricing at ' + pricingPath + ': ' + err.message);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw _err('PRICING_CORRUPTED', 'status: token pricing at ' + pricingPath + ' is not valid JSON: ' + err.message);
  }
  if (!parsed || !parsed.models || !Number.isFinite(parsed.usd_to_eur) || parsed.usd_to_eur <= 0) {
    throw _err('PRICING_CORRUPTED', 'status: token pricing at ' + pricingPath + ' is missing "models" or a valid "usd_to_eur" rate');
  }
  return parsed;
}

// USD cost for one ledger entry's measured tokens, using the estimated
// 80/20 input/output split already established by lib/workflow-artifacts.js's
// cost() for the same pricing file — unlike that helper, this never converts
// to EUR (the field this feeds is totalCostUsd). Returns null (not 0) when
// the entry's model is missing/unknown or its tokens are not a finite number
// — an unattributable entry is excluded from the total, never coerced into a
// zero-cost one.
function _usdCostForLedgerEntry(tokens, model, pricing) {
  if (!Number.isFinite(tokens) || typeof model !== 'string' || model.length === 0) return null;
  const rate = pricing.models[model];
  if (!rate || !Number.isFinite(rate.input_per_1m_usd) || !Number.isFinite(rate.output_per_1m_usd)) return null;
  return tokens * (0.8 * rate.input_per_1m_usd + 0.2 * rate.output_per_1m_usd) / 1000000;
}

// Null-compatibility (mirrors the convention already established by
// src/claude/skills/implement-feature/SKILL.md's Step 7 and
// lib/workflow-artifacts.js's pricing/cost helpers): a token value that is
// null/undefined/not a finite number is "not yet measured", never coerced
// into a real, observable zero. totalTokens/totalCostUsd stay null — not 0 —
// when nothing measurable exists yet, so a caller can tell "nothing spent"
// apart from "nothing reported". Every executor ledger entry is currently
// opened with model: null (see _runTaskToResolution's ledger.open calls
// above), so totalCostUsd is null whenever no pricing file is present OR
// every entry's model is still unattributed — both are legitimate,
// non-error outcomes, not a bug in this function.
function _summarizeLedgerTotals(entries, projectDir) {
  let totalTokens = null;
  let totalCostUsd = null;
  let pricing;
  let pricingLoaded = false;

  entries.forEach(function (entry) {
    const tokens = entry.phase_delta_tokens;
    if (!Number.isFinite(tokens)) return;
    totalTokens = (totalTokens || 0) + tokens;

    if (!pricingLoaded) {
      pricing = _loadTokenPricing(projectDir);
      pricingLoaded = true;
    }
    if (!pricing) return;

    const entryCost = _usdCostForLedgerEntry(tokens, entry.model, pricing);
    if (entryCost === null) return;
    totalCostUsd = (totalCostUsd || 0) + entryCost;
  });

  return { totalTokens: totalTokens, totalCostUsd: totalCostUsd };
}

/**
 * `status` command. Read-only summary of a run: counts of tasks per
 * status, current run status, and total cost as reported by the ledger
 * (the sole cost source). Never mutates state.
 *
 * Built entirely from three already-implemented data sources — no new Work
 * Breakdown task was required: store.readState (INFRA-TASK-BE-01) for task
 * statuses/runStatus, the run's own token-ledger.json
 * (INFRA-TASK-BE-02/../execution-ledger.js) for token counts, and the
 * target project's docs/token-pricing.json (already read the same way by
 * lib/workflow-artifacts.js) for USD cost attribution.
 *
 * @param {object} args
 * @param {string} args.project - Absolute or project-relative repo path.
 * @param {string} args.runId - UUID of the run to inspect.
 * @returns {Promise<object>} Versioned result object:
 *   { protocolVersion, runId, runStatus,
 *     taskCounts: { pending, active, checkpointed, integrated, skipped, blocked },
 *     totalTokens, totalCostUsd }.
 *   totalTokens/totalCostUsd are null (never 0) when nothing measurable has
 *   been recorded yet, or (totalCostUsd only) when the project ships no
 *   docs/token-pricing.json.
 * @throws {Error} DISPATCH_VALIDATION_ERROR for a malformed args.project/
 *   args.runId (via _requireNonEmptyString, same as every other command in
 *   this module); any error store.readState throws (STATE_NOT_FOUND,
 *   STATE_CORRUPTED) propagates unmodified — a corrupted/missing run is
 *   never silently defaulted; LEDGER_READ_FAILED/LEDGER_CORRUPTED/
 *   PRICING_READ_FAILED/PRICING_CORRUPTED for an unreadable or unparseable
 *   ledger or pricing file.
 */
async function status(args) {
  args = args || {};
  _requireNonEmptyString(args.project, 'status: args.project');
  _requireNonEmptyString(args.runId, 'status: args.runId');

  const projectDir = args.project;
  const runId = args.runId;
  const commonDir = _resolveCommonGitDir(projectDir);
  const executionRoot = path.join(commonDir, 'ai-toolkit', 'execution');

  // Propagates STATE_NOT_FOUND / STATE_CORRUPTED unmodified — never
  // fabricates an empty/default run for a corrupted/missing one.
  const state = store.readState(executionRoot, runId);

  const taskCounts = { pending: 0, active: 0, checkpointed: 0, integrated: 0, skipped: 0, blocked: 0 };
  Object.keys(state.tasks).forEach(function (taskId) {
    const st = state.tasks[taskId].status;
    if (Object.prototype.hasOwnProperty.call(taskCounts, st)) {
      taskCounts[st] += 1;
    }
  });

  const ledgerEntries = _readRunLedgerEntries(executionRoot, runId);
  const totals = _summarizeLedgerTotals(ledgerEntries, projectDir);

  return {
    protocolVersion: store.PROTOCOL_VERSION,
    runId: runId,
    runStatus: state.runStatus,
    taskCounts: taskCounts,
    totalTokens: totals.totalTokens,
    totalCostUsd: totals.totalCostUsd,
  };
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
 * `stop` command (US-07-TASK-BE-02). Persists a stop request for a running
 * coordinator and acknowledges receipt of the request ONLY — this function
 * never itself claims the run has actually stopped. `status`/`diagnose`
 * (both still NOT_IMPLEMENTED — US-06-TASK-BE-01/02, out of scope here)
 * confirm that once the coordinator's own loop observes the request.
 *
 * Modes:
 *   - 'graceful' (default): persists the request only. execute()'s own main
 *     loop (see its inline comment at the top-of-loop runStatus check, above)
 *     is the ONLY thing that can actually "block new dispatch" — it observes
 *     runStatus 'stopping' at its next natural iteration boundary (after its
 *     current task reaches checkpointed/blocked) and stops there, leaving
 *     every remaining task 'pending'. This function does nothing further for
 *     'graceful': collecting already-running results and checkpointing only
 *     when evidence is already sufficient (Tech-Spec section 7) is the
 *     RUNNING coordinator's job when it next observes the request, not this
 *     call's — this call only persists the request.
 *   - 'immediate': ADDITIONALLY attempts real termination of every attempt
 *     whose stage is 'dispatching' or 'running' (i.e. potentially mid-flight
 *     right now) with a recorded processIdentity: finds it via the same
 *     tag-scan technique already used elsewhere in this module
 *     (_findLiveTaggedProcess, US-06-TASK-BE-02), and if found alive (or
 *     liveness unknown), terminates it via the same E-02-qualified tree-kill
 *     technique used elsewhere, adapted to a bare PID
 *     (_killProcessTreeByPidSync — needed because, unlike
 *     claude-process.js's spawnClaudeAgent, this function never held a
 *     ChildProcess handle for a worker it did not itself spawn: the worker
 *     may belong to an entirely different coordinator process). It then
 *     polls _findLiveTaggedProcess with a bounded number of short waits
 *     (_awaitConfirmedTermination) before returning. If termination cannot
 *     be positively confirmed within that bound, this function still
 *     acknowledges the request as persisted, but reports
 *     `terminationConfirmed: false` — it never claims a termination it
 *     cannot verify (the same discipline _findLiveTaggedProcess itself
 *     already enforces for 'unknown').
 *
 * Idempotency (exact rule): if the run's CURRENT runStatus is already
 * 'stopping', or is settled — 'completed'/'blocked'/'superseded', or
 * 'paused' (execute()'s own loop already fully drained a prior stop request
 * — see its final-status computation) — this call is a pure no-op: nothing
 * is re-persisted (no generation bump) and NO mode-specific action runs (no
 * re-kill attempt, and no escalation if this call's mode differs from
 * whatever was originally requested — a second stop() call never upgrades a
 * prior 'graceful' request to 'immediate'; only the first accepted request
 * for a run ever performs mode-specific work). The acknowledged `mode` in
 * the idempotent-'stopping' case reflects the ORIGINALLY recorded mode
 * (state.config.stopRequest.mode), not necessarily this call's own mode.
 *
 * @param {object} args
 * @param {string} args.project - Absolute or project-relative repo path
 *   (resolved to the common Git directory / execution root exactly like
 *   execute() does).
 * @param {string} args.runId - UUID of the run to stop.
 * @param {'graceful'|'immediate'} [args.mode='graceful'] - Stop mode.
 * @param {string} [args.exeBasename] - Test-only override of the real
 *   spawned executable's basename to match for 'immediate' mode's worker
 *   termination (_findLiveTaggedProcess) — same override reconcile()/
 *   resume() already accept via ctx.exeBasename. Defaults to
 *   DEFAULT_TAGGED_PROCESS_EXE_BASENAME ('claude.exe') in production.
 * @returns {Promise<object>} Versioned result object:
 *   { protocolVersion, runId, requestAccepted: true, mode,
 *     idempotent?: true,
 *     terminationConfirmed?: boolean,
 *     killAttempts?: Array<{taskId, attemptNumber, processIdentity, confirmed: boolean}> }
 *   `terminationConfirmed`/`killAttempts` are present only for a
 *   newly-accepted 'immediate' request (never for 'graceful', never for an
 *   idempotent replay).
 * @throws {Error} STOP_VALIDATION_ERROR for a malformed args.project/args.
 *   runId/args.mode; any error store.readState throws (STATE_NOT_FOUND,
 *   STATE_CORRUPTED) propagates unmodified — a corrupted/missing run is
 *   never silently defaulted.
 */
async function stop(args) {
  args = args || {};
  _requireNonEmptyString(args.project, 'stop: args.project');
  _requireNonEmptyString(args.runId, 'stop: args.runId');

  const mode = args.mode === undefined ? 'graceful' : args.mode;
  if (mode !== 'graceful' && mode !== 'immediate') {
    throw _err(
      'STOP_VALIDATION_ERROR',
      'stop: args.mode must be "graceful" or "immediate", got ' + JSON.stringify(args.mode)
    );
  }

  const projectDir = args.project;
  const runId = args.runId;
  const commonDir = _resolveCommonGitDir(projectDir);
  const executionRoot = path.join(commonDir, 'ai-toolkit', 'execution');

  // Propagates STATE_NOT_FOUND / STATE_CORRUPTED unmodified — never
  // fabricates an empty/default run for a corrupted/missing one.
  let state = store.readState(executionRoot, runId);

  // Idempotency (see doc comment above for the exact rule and rationale for
  // including 'paused' alongside the terminal statuses).
  const SETTLED_OR_STOPPING_RUN_STATUSES = ['stopping', 'completed', 'blocked', 'superseded', 'paused'];
  if (SETTLED_OR_STOPPING_RUN_STATUSES.indexOf(state.runStatus) !== -1) {
    const recordedMode = state.config && state.config.stopRequest && state.config.stopRequest.mode;
    return {
      protocolVersion: store.PROTOCOL_VERSION,
      runId: runId,
      requestAccepted: true,
      mode: recordedMode || mode,
      idempotent: true,
    };
  }

  // Persist the stop request: one write, both the runStatus transition and
  // the requested mode (store.js's State#requestStop — see its own doc
  // comment for why `config` was chosen over a new top-level field).
  state = state.requestStop(mode);
  state = store.writeState(executionRoot, runId, state);

  if (mode === 'graceful') {
    // That's it — the already-running execute() loop enforces the block
    // (see execute()'s own inline comment at its loop-top runStatus check).
    return {
      protocolVersion: store.PROTOCOL_VERSION,
      runId: runId,
      requestAccepted: true,
      mode: mode,
    };
  }

  // mode === 'immediate': additionally attempt real termination of every
  // attempt that is potentially mid-flight right now.
  const exeBasename = typeof args.exeBasename === 'string' && args.exeBasename.length > 0
    ? args.exeBasename
    : DEFAULT_TAGGED_PROCESS_EXE_BASENAME;

  const inFlightStages = ['dispatching', 'running'];
  const candidates = [];
  Object.keys(state.tasks).sort().forEach(function (taskId) {
    const task = state.tasks[taskId];
    (Array.isArray(task.attempts) ? task.attempts : []).forEach(function (attempt) {
      if (inFlightStages.indexOf(attempt.stage) === -1) return;
      if (typeof attempt.processIdentity !== 'string' || attempt.processIdentity.length === 0) return;
      candidates.push({ taskId: taskId, attemptNumber: attempt.number, processIdentity: attempt.processIdentity });
    });
  });

  const killAttempts = [];
  let terminationConfirmed = true; // vacuously true when there is nothing to kill

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const liveness = _findLiveTaggedProcess(candidate.processIdentity, exeBasename);

    if (liveness.status === 'confirmed-not-found') {
      killAttempts.push(Object.assign({}, candidate, { confirmed: true }));
      continue;
    }

    // 'found-alive': kill it now. 'unknown': never coerced into either
    // extreme up front — no kill is attempted without positive evidence,
    // but the poll below still gets a chance to observe a confirmed-dead
    // result before this attempt is reported unconfirmed.
    if (liveness.status === 'found-alive') {
      for (let p = 0; p < liveness.pids.length; p++) {
        _killProcessTreeByPidSync(liveness.pids[p]);
      }
    }

    const confirmed = await _awaitConfirmedTermination(candidate.processIdentity, exeBasename);
    killAttempts.push(Object.assign({}, candidate, { confirmed: confirmed }));
    if (!confirmed) {
      terminationConfirmed = false;
    }
  }

  return {
    protocolVersion: store.PROTOCOL_VERSION,
    runId: runId,
    requestAccepted: true,
    mode: mode,
    terminationConfirmed: terminationConfirmed,
    killAttempts: killAttempts,
  };
}

/**
 * Enforces Tech-Spec section 9's "reconcile/resume require no live competing
 * coordinator" precondition. Called at the very start of both reconcile()
 * and resume(), before any repair (registerCommitSHA/finalizeTaskCheckpoint)
 * — fails closed, so no partial repair is ever applied while a different,
 * live coordinator might also be acting on the same run.
 *
 * Decision table:
 *   - No lease held at all: nothing to compete with — proceed.
 *   - Lease held by the SAME `runId` as the caller: this is the caller
 *     reconciling its own run (e.g. as part of its own resume flow, whether
 *     called before or after it re-acquires the lease) — proceed.
 *   - Lease held by a DIFFERENT runId: consult
 *     ownership.checkOwnerLiveness(lease).
 *       - alive === true: a different coordinator is actively live — refuse
 *         with COMPETING_COORDINATOR_LIVE.
 *       - alive === 'unknown': never treat unknown as safe-to-proceed (the
 *         same invariant enforced everywhere else in this codebase, e.g.
 *         ownership.reclaimLease's own LEASE_LIVENESS_UNKNOWN) — refuse with
 *         COMPETING_COORDINATOR_LIVENESS_UNKNOWN.
 *       - alive === false (confirmed dead): proceed. reconcile/resume are
 *         read-mostly + idempotent-repair operations, not a reclaim of the
 *         lease itself — none of their classification/repair work requires
 *         actually holding the lease, so a confirmed-dead old coordinator's
 *         still-present lease file is not a blocker here. This function
 *         deliberately does NOT call ownership.reclaimLease — reclaiming the
 *         lease is a separate, explicit operator/coordinator decision made
 *         elsewhere, not an implicit side effect of reconciling evidence.
 *
 * @param {string} executionRoot
 * @param {string} runId - The calling run's own runId (args.runId).
 * @param {string} callerName - 'reconcile' or 'resume', used only to make
 *   the thrown error message identify which command refused to proceed.
 * @throws {Error} COMPETING_COORDINATOR_LIVE, COMPETING_COORDINATOR_LIVENESS_UNKNOWN
 */
function _ensureNoLiveCompetingCoordinator(executionRoot, runId, callerName) {
  const lease = ownership.readLease(executionRoot);
  if (!lease || lease.runId === runId) {
    return;
  }

  const liveness = ownership.checkOwnerLiveness(lease);
  if (liveness.alive === true) {
    throw _err(
      'COMPETING_COORDINATOR_LIVE',
      callerName + ': refusing to proceed — a different coordinator (runId "' + lease.runId +
        '", host ' + lease.host + ', pid ' + lease.pid + ') currently holds the repo-wide execution ' +
        'lease at ' + executionRoot + ' and is confirmed live: ' + liveness.reason
    );
  }
  if (liveness.alive !== false) {
    throw _err(
      'COMPETING_COORDINATOR_LIVENESS_UNKNOWN',
      callerName + ': refusing to proceed — a different coordinator (runId "' + lease.runId +
        '", host ' + lease.host + ', pid ' + lease.pid + ') currently holds the repo-wide execution ' +
        'lease at ' + executionRoot + ' and its liveness could not be conclusively determined: ' +
        liveness.reason
    );
  }
  // liveness.alive === false (confirmed dead): fall through and proceed.
  // Never reclaim the lease here — see doc comment above.
}

/**
 * `reconcile` command (US-06-TASK-BE-01). Loads persisted state and
 * evidence (receipts, intents, registered commit SHAs) and classifies every
 * task's current attempt per the Tech-Spec section 9 edge-cases table (see
 * the file-level "reconcile/resume evidence classification" comment above
 * _classifyTask for exactly which rows are fully covered here versus
 * explicitly deferred to US-06-TASK-BE-02). Applies ONLY two kinds of
 * idempotent repair, both reusing an already-existing primitive:
 *   - registerCommitSHA, when a checkpoint-prepared attempt's taskRef tip is
 *     found to be an exact match for its own persisted checkpoint intent
 *     (narrow, tip-only recovery — see scope comment above);
 *   - finalizeTaskCheckpoint, when a committed attempt's registered SHA is
 *     confirmed reachable on taskRef but the task's overall status was not
 *     yet advanced to 'checkpointed'.
 * Never dispatches new work, never touches a task that was never started
 * (status 'pending' with zero attempts), never reinterprets approvals, never
 * cleans resources. If `args.planDigest` is supplied and does not match the
 * run's own recorded state.planDigest, every task is reported blocked
 * ('blocked-plan-changed') and no repair is attempted for any task (Tech-Spec:
 * "Plan/config changed -> Block until approved successor plan").
 *
 * Enforces "no live competing coordinator" (Tech-Spec section 9) via
 * _ensureNoLiveCompetingCoordinator, called first — before store.readState,
 * before any classification, before any repair. See that function's own doc
 * comment for the exact decision table (no lease / same runId / different-
 * but-dead runId all proceed; different-and-live-or-unknown refuses).
 *
 * @param {object} args
 * @param {string} args.executionRoot - Absolute path to
 *   <common-git-dir>/ai-toolkit/execution.
 * @param {string} args.runId - UUID of the run to reconcile.
 * @param {string} args.projectDir - Absolute path to the Git worktree/repo
 *   the commit-reachability checks run in.
 * @param {string} args.taskRef - The feature/task ref every task's commits
 *   are checked against (N=1 model only — see file-level scope comment).
 * @param {string} [args.planDigest] - The currently-approved plan's digest
 *   (e.g. from plan.createPlanSnapshot). When supplied and it differs from
 *   the run's recorded planDigest, every task is reported blocked and no
 *   repair is attempted.
 * @param {string} [args.exeBasename] - Basename of the real spawned
 *   executable to match against for worker-liveness checks
 *   (_findLiveTaggedProcess, US-06-TASK-BE-02). Defaults to
 *   DEFAULT_TAGGED_PROCESS_EXE_BASENAME ('claude.exe'); tests override this
 *   to whatever real, short-lived child process they spawn under test.
 * @returns {Promise<object>} Versioned result object:
 *   { protocolVersion, runId, repairsApplied: [{ taskId, action }],
 *     classifications: [{ taskId, classification, action }] } — the last
 *   field is additive (beyond the documented minimum shape above) so callers
 *   get the full per-task classification, not just applied repairs.
 * @throws {Error} DISPATCH_VALIDATION_ERROR for malformed input;
 *   COMPETING_COORDINATOR_LIVE / COMPETING_COORDINATOR_LIVENESS_UNKNOWN when
 *   a different, live-or-unknown-liveness coordinator holds the repo-wide
 *   execution lease; any error store.readState throws (STATE_NOT_FOUND,
 *   STATE_CORRUPTED) propagates unmodified — a corrupted/missing run is
 *   never silently defaulted.
 */
async function reconcile(args) {
  args = args || {};
  _requireNonEmptyString(args.executionRoot, 'reconcile: args.executionRoot');
  _requireNonEmptyString(args.runId, 'reconcile: args.runId');
  _requireNonEmptyString(args.projectDir, 'reconcile: args.projectDir');
  _requireNonEmptyString(args.taskRef, 'reconcile: args.taskRef');
  if (args.planDigest !== undefined && args.planDigest !== null) {
    _requireNonEmptyString(args.planDigest, 'reconcile: args.planDigest');
  }

  const executionRoot = args.executionRoot;
  const runId = args.runId;

  // Fail closed BEFORE any repair — see _ensureNoLiveCompetingCoordinator's
  // own doc comment for the exact decision table.
  _ensureNoLiveCompetingCoordinator(executionRoot, runId, 'reconcile');

  const ctx = {
    executionRoot: executionRoot,
    runId: runId,
    projectDir: args.projectDir,
    taskRef: args.taskRef,
    // US-06-TASK-BE-02: basename of the real spawned executable to match
    // against when checking worker liveness (_findLiveTaggedProcess). Tests
    // override this to the real, short-lived child process they spawn under
    // test (e.g. 'node.exe') — see the DEFAULT_TAGGED_PROCESS_EXE_BASENAME
    // file comment above IS_WINDOWS for why production defaults to
    // 'claude.exe' rather than 'node.exe'.
    exeBasename: typeof args.exeBasename === 'string' && args.exeBasename.length > 0
      ? args.exeBasename
      : DEFAULT_TAGGED_PROCESS_EXE_BASENAME,
  };

  // Propagates STATE_NOT_FOUND / STATE_CORRUPTED unmodified — never
  // fabricates an empty run for a corrupted/missing one.
  const state = store.readState(executionRoot, runId);

  const planChanged = typeof args.planDigest === 'string' && args.planDigest !== state.planDigest;

  const repairsApplied = [];
  const classifications = [];

  Object.keys(state.tasks).sort().forEach(function (taskId) {
    if (planChanged) {
      classifications.push({ taskId: taskId, classification: 'blocked', action: 'blocked-plan-changed' });
      return;
    }
    const task = state.tasks[taskId];
    const result = _classifyTask(ctx, taskId, task);
    classifications.push({ taskId: taskId, classification: result.classification, action: result.action });
    if (result.repairAction) {
      repairsApplied.push({ taskId: taskId, action: result.repairAction });
    }
  });

  return {
    protocolVersion: store.PROTOCOL_VERSION,
    runId: runId,
    repairsApplied: repairsApplied,
    classifications: classifications,
  };
}

/**
 * `resume` command (US-06-TASK-BE-01). Enforces "no live competing
 * coordinator" itself (see _ensureNoLiveCompetingCoordinator) before doing
 * anything else, then calls reconcile() (which enforces the same precondition
 * again — cheap and read-only, and keeps reconcile correct as a standalone
 * entry point too) to apply its idempotent repairs, then re-reads state and
 * reports, for every task, its current status plus the next-safe-action
 * classification reconcile already computed. Does NOT dispatch new work
 * itself — no run loop exists yet (the real dispatch loop is
 * US-07-TASK-BE-01, execute()); resume's job here ends at "reconcile, then
 * report what is safe to continue".
 *
 * @param {object} args - same shape as reconcile's args (forwarded as-is).
 * @param {string} args.executionRoot
 * @param {string} args.runId
 * @param {string} args.projectDir
 * @param {string} args.taskRef
 * @param {string} [args.planDigest]
 * @returns {Promise<object>} Versioned result object:
 *   { protocolVersion, runId, runStatus, tasks: [{ taskId, status,
 *     nextAction }] } — `nextAction` is additive (beyond the documented
 *   minimum `{ taskId, status }` shape above), taken from reconcile's own
 *   per-task classification.
 * @throws {Error} Same as reconcile — propagated unmodified, including
 *   COMPETING_COORDINATOR_LIVE / COMPETING_COORDINATOR_LIVENESS_UNKNOWN.
 */
async function resume(args) {
  args = args || {};
  _requireNonEmptyString(args.executionRoot, 'resume: args.executionRoot');
  _requireNonEmptyString(args.runId, 'resume: args.runId');
  _requireNonEmptyString(args.projectDir, 'resume: args.projectDir');
  _requireNonEmptyString(args.taskRef, 'resume: args.taskRef');

  // Fail closed BEFORE any repair — same precondition reconcile() enforces
  // (and will enforce again just below); checked here too so resume fails
  // closed even if its own delegation to reconcile ever changes.
  _ensureNoLiveCompetingCoordinator(args.executionRoot, args.runId, 'resume');

  const reconcileResult = await reconcile(args);

  const state = store.readState(args.executionRoot, args.runId);

  const classificationByTaskId = {};
  reconcileResult.classifications.forEach(function (c) { classificationByTaskId[c.taskId] = c; });

  const tasks = Object.keys(state.tasks).sort().map(function (taskId) {
    const task = state.tasks[taskId];
    const classification = classificationByTaskId[taskId];
    return {
      taskId: taskId,
      status: task.status,
      nextAction: classification ? classification.action : 'none',
    };
  });

  return {
    protocolVersion: store.PROTOCOL_VERSION,
    runId: args.runId,
    runStatus: state.runStatus,
    tasks: tasks,
    repairsApplied: reconcileResult.repairsApplied,
  };
}

/**
 * Evaluates ONE task's persisted evidence (checkpoint, commit, review, diff,
 * worker liveness) and returns the classification/action reconcile()/
 * resume() already compute per task, for a single task in isolation
 * (US-06-TASK-BE-02; completes the Work Breakdown outcome "evaluates
 * persisted evidence ... and determines: no-reimplementation, reconcile-SHA,
 * recheck-verification, preserve-diff, or block"). Built directly on top of
 * reconcile()'s own per-task dispatch (_classifyTask and its helpers) rather
 * than duplicating any evidence-reading logic — this function's whole
 * contribution over calling reconcile() for the same run is scoping the
 * question to one task and returning its full classification result object
 * (including additive fields like hasPartialEvidence, not just the
 * {taskId, classification, action} triple reconcile()'s own summary keeps).
 *
 * Read-only for the specific case evaluated here EXCEPT for the same two
 * idempotent repairs reconcile() itself may apply (registerCommitSHA,
 * finalizeTaskCheckpoint) when this task's evidence matches one of those two
 * rows — this function does not introduce a new "read-only" mode separate
 * from reconcile()'s own documented repair behavior.
 *
 * Does NOT enforce "no live competing coordinator" itself — a single-task
 * evidence read is intentionally lighter-weight than reconcile()/resume()'s
 * own repo-wide precondition; callers that need that guarantee should call
 * reconcile()/resume() instead, or add it themselves before calling this
 * function repeatedly in a loop.
 *
 * @param {object} args
 * @param {string} args.executionRoot - Absolute path to
 *   <common-git-dir>/ai-toolkit/execution.
 * @param {string} args.runId - UUID of the run to evaluate.
 * @param {object} args.task - Plan task object (plan.js shape): at least
 *   `id`, matching a task already recorded in the run's state.
 * @param {string} args.projectDir - Absolute path to the Git worktree/repo
 *   the commit-reachability checks run in.
 * @param {string} args.taskRef - The feature/task ref this task's commits
 *   are checked against (N=1 model only — see file-level scope comment above
 *   the reconcile/resume evidence classification section).
 * @param {string} [args.exeBasename] - Basename of the real spawned
 *   executable to match against for worker-liveness checks. Defaults to
 *   DEFAULT_TAGGED_PROCESS_EXE_BASENAME ('claude.exe').
 * @returns {Promise<{taskId: string, classification: string, action: string,
 *   repairAction?: string, hasPartialEvidence?: boolean}>}
 * @throws {Error} DISPATCH_VALIDATION_ERROR for malformed input;
 *   STATE_TASK_NOT_FOUND when the task is not recorded in the run's state;
 *   any error store.readState throws (STATE_NOT_FOUND, STATE_CORRUPTED)
 *   propagates unmodified.
 */
async function evaluateTaskEvidence(args) {
  args = args || {};
  _requireNonEmptyString(args.executionRoot, 'evaluateTaskEvidence: args.executionRoot');
  _requireNonEmptyString(args.runId, 'evaluateTaskEvidence: args.runId');
  _requireNonEmptyString(args.projectDir, 'evaluateTaskEvidence: args.projectDir');
  _requireNonEmptyString(args.taskRef, 'evaluateTaskEvidence: args.taskRef');
  if (args.task == null || typeof args.task !== 'object') {
    throw _err('DISPATCH_VALIDATION_ERROR', 'evaluateTaskEvidence: args.task must be an object');
  }
  _requireNonEmptyString(args.task.id, 'evaluateTaskEvidence: args.task.id');

  const executionRoot = args.executionRoot;
  const runId = args.runId;
  const taskId = args.task.id;

  const state = store.readState(executionRoot, runId);
  const task = state.tasks[taskId];
  if (!task) {
    throw _err('STATE_TASK_NOT_FOUND', 'evaluateTaskEvidence: task "' + taskId + '" not found');
  }

  const ctx = {
    executionRoot: executionRoot,
    runId: runId,
    projectDir: args.projectDir,
    taskRef: args.taskRef,
    exeBasename: typeof args.exeBasename === 'string' && args.exeBasename.length > 0
      ? args.exeBasename
      : DEFAULT_TAGGED_PROCESS_EXE_BASENAME,
  };

  const result = _classifyTask(ctx, taskId, task);
  return Object.assign({ taskId: taskId }, result);
}

// ── replan (US-06-TASK-BE-03) ────────────────────────────────────────────────
//
// Derives the successor feature's directory from its feature.md path, using
// the EXACT same separator-agnostic convention src/claude/workflows/
// pm-phase2.js's own deriveFeatureDir uses: feature directory = parent of the
// feature.md path; strip a trailing "<sep>feature.md" tail (case-insensitive,
// POSIX "/" or Windows "\"), or just a trailing separator if the path is
// already a directory. Duplicated here rather than imported — pm-phase2.js is
// a Claude Code Workflow script (run by the workflow runtime, not a
// requirable Node module; see AGENTS.md's "Workflow script pattern"), so this
// library module cannot depend on it. Keeping the exact same regex is the
// point: both places must agree on where a feature's artifacts live.
function _deriveFeatureDir(featurePath) {
  return /[/\\]feature\.md$/i.test(featurePath)
    ? featurePath.replace(/[/\\]feature\.md$/i, '')
    : featurePath.replace(/[/\\]+$/, '');
}

// Same convention pm-phase2.js uses: PREFIX is the first "<UPPER>-<digits>"
// substring found in the feature directory name (e.g. "FTR-018", "ASSESS-001").
function _derivePrefix(featureDir) {
  const m = featureDir.match(/([A-Z]+-\d+)/);
  return m ? m[1] : null;
}

// Minimal, deliberately non-generic Markdown check: does a case-sensitive
// "## Gate 2" heading appear anywhere in the successor's Approvals.md?
//
// This codebase has no existing generic Markdown-section-reader/parser to
// reuse for this: every other "verify Gate 2 is present in Approvals.md"
// pre-condition in this repo (e.g. src/claude/skills/implement-feature/
// SKILL.md Step 4/6, AGENTS.md's "Approval Gate Protocol") is carried out by
// an LLM agent reading the file in the main loop, not by a JS utility — there
// is nothing to import. plan.js's own section extraction
// (_extractTaskDetailsSection) is specific to the "## Task Details" section's
// very different internal structure (task anchors, fenced verification
// blocks) and would be a wrong-shaped tool bent to a one-line question here.
// Writing a full generic Markdown-section parser purely to answer "did a
// '## Gate 2' heading ever get appended to this file" would be
// over-engineering for what this function actually needs. `^## Gate 2`
// anchored to a line start (multiline, case-sensitive — no 'i' flag) is the
// literal heading text this codebase's own Approvals.md template always
// writes verbatim (see this feature's own FTR-018-Approvals.md: "## Gate 2 —
// Work Breakdown Approval").
const _GATE_2_HEADING_RE = /^## Gate 2\b/m;

function _hasGate2Approval(approvalsText) {
  return _GATE_2_HEADING_RE.test(approvalsText);
}

/**
 * `replan` command (US-06-TASK-BE-03; completes US-06 "resume from persisted
 * evidence and reconcile without re-execution" for the branch-off case: an
 * original run that cannot simply resume because its plan itself must
 * change). Tech-Spec section 9 (Gate-1-binding, carried into this Work
 * Breakdown): "Replan does not grant approval. First produce a proposed
 * successor plan and human decision outside the executor. Then replan
 * command validates new Gate 2/revision evidence and records old->new digest
 * and task mapping. Original run becomes superseded only after no live
 * workers and evidence retained. Carry completion only for unchanged
 * task/context with reachable verified checkpoints and explicit approved
 * mapping; otherwise require a new task identity. No data deletion,
 * automatic branch rewrite or reset of failed-attempt counters to evade
 * policy."
 *
 * This function grants NO approval itself (the successor's Gate 2 approval
 * must already exist on disk, produced by the normal implement-feature main-
 * loop gate protocol — see AGENTS.md's "Approval Gate Protocol" — entirely
 * outside this executor) and does NOT dispatch, start, or touch the
 * successor run in any way: its job ends at validating + recording the
 * mapping the caller already decided, and superseding the original run.
 * `taskMapping` is an explicit, caller-supplied old->new task ID mapping —
 * this function never invents one.
 *
 * Ordering, fail-closed at every step, in order (no step above ever mutates
 * anything once a later step can still fail):
 *   1. Successor Gate 2 / revision approval evidence must exist on disk (a
 *      "## Gate 2" heading in the successor's Approvals.md — see
 *      _hasGate2Approval above for why this minimal check, not a generic
 *      parser). Missing/unreadable Approvals.md or no such heading:
 *      SUCCESSOR_NOT_APPROVED, before anything else is read.
 *   2. The successor's plan snapshot is built via plan.createPlanSnapshot
 *      from its REAL Work-Breakdown.md/.csv files on disk (US-01-TASK-BE-04,
 *      already implemented) — this both proves the successor plan parses/
 *      validates cleanly and yields its planDigest. Missing MD/CSV files:
 *      SUCCESSOR_PLAN_NOT_FOUND. A malformed MD/CSV: the underlying
 *      PLAN_PARSE_ERROR propagates unmodified.
 *   3. The ORIGINAL run's state is read (store.readState — STATE_NOT_FOUND /
 *      STATE_CORRUPTED propagate unmodified; a corrupted/missing original
 *      run is never silently defaulted).
 *   4. Every taskMapping entry is validated against BOTH sides: oldTaskId
 *      must exist in the original run's state.tasks; newTaskId must exist in
 *      the successor snapshot's tasks. Any entry referencing an unknown ID on
 *      either side fails the WHOLE call closed with
 *      REPLAN_UNKNOWN_TASK_MAPPING, before any mutation and before any
 *      carry-completion eligibility is even computed.
 *   5. For each validated pair, carry-completion eligibility is computed —
 *      read-only, never touches the old task's own evidence either way. A
 *      pair is eligible ONLY when the OLD task's status is already
 *      'checkpointed' or 'integrated' AND its last attempt's registered
 *      originalSha is a valid SHA reachable on `taskRef` right now (reusing
 *      this same file's own _isCommitReachableOnRef — the identical
 *      merge-base-based check finalizeTaskCheckpoint/reconcile already use;
 *      not duplicated as a new helper). Anything else (wrong status, no
 *      attempt, no/invalid SHA, unreachable, or the reachability check itself
 *      failing) is recorded with carriesCompletion=false — "otherwise require
 *      a new task identity" — never guessed into true.
 *   6. "No live workers" gate: EVERY task/attempt in the ORIGINAL run (not
 *      just the mapped ones) whose attempt carries a recorded
 *      processIdentity is checked via US-06-TASK-BE-02's own
 *      _findLiveTaggedProcess. Any 'found-alive' OR 'unknown' result refuses
 *      the whole call closed with LIVE_WORKER_BLOCKS_REPLAN — 'unknown' is
 *      never treated as safe, mirroring _ensureNoLiveCompetingCoordinator's
 *      and _classifyLiveOrDeadWorkerAttempt's identical "never assume dead"
 *      discipline elsewhere in this file. Only proceeds once every checked
 *      attempt is 'confirmed-not-found', or has no processIdentity at all
 *      (nothing to check).
 *   7. Only once 1-6 have all succeeded: the old->new plan digest mapping
 *      (including each pair's carriesCompletion flag) is persisted as a
 *      durable, immutable record via store.js's existing writeIntent
 *      primitive — reused rather than inventing a new persistence primitive,
 *      the same immutable-record-by-id mechanism checkpoint intents already
 *      use (see store.js's persistCheckpointIntent-adjacent writeIntent). A
 *      single fixed id ("replan") is used per original run: at most one
 *      supersession decision is ever recorded for a given run; a replayed
 *      call with IDENTICAL inputs is an idempotent no-op (writeIntent's own
 *      identical-content replay rule), while a conflicting second call
 *      (different successor/mapping) fails closed with INTENT_CONFLICT
 *      rather than silently overwriting the first decision. This record is
 *      written BEFORE the run status changes below, so a conflicting replay
 *      never leaves the original run superseded without its mapping record
 *      durably alongside it.
 *   8. Only after the record is durably persisted: the original run's status
 *      is set to 'superseded' (store.js's existing RUN_STATUSES value — not a
 *      new status) via State.setRunStatus + store.writeState. Nothing about
 *      any task's own attempts/evidence is deleted, rewritten, or reset —
 *      this function never touches task/attempt records at all, only the
 *      run-level runStatus field and the new immutable replan record.
 *
 * Does NOT dispatch, start, or touch the successor run in any way (per its
 * own scope — see the module-level file comment's original stub doc, which
 * this replaces).
 *
 * @param {object} args
 * @param {string} args.executionRoot - Absolute path to
 *   <common-git-dir>/ai-toolkit/execution.
 * @param {string} args.runId - UUID of the original run being replanned;
 *   must already hold a valid state.json (STATE_NOT_FOUND otherwise).
 * @param {string} args.projectDir - Absolute path to the Git worktree/repo
 *   the commit-reachability checks (step 5) run in.
 * @param {string} args.taskRef - The feature/task ref carry-completion
 *   eligibility's reachability check runs against (N=1 model only — same
 *   scope boundary as reconcile()/finalizeTaskCheckpoint()).
 * @param {string} args.feature - Path to the SUCCESSOR feature's feature.md,
 *   used to derive its PREFIX/directory (same convention as
 *   src/claude/workflows/pm-phase2.js) and locate its Approvals.md and
 *   Work-Breakdown.md/.csv.
 * @param {Array<{oldTaskId: string, newTaskId: string}>} args.taskMapping -
 *   Caller-supplied explicit old->new task ID mapping (the human/caller's own
 *   decision — this function validates and records it, never invents one).
 * @param {string} [args.exeBasename] - Basename of the real spawned
 *   executable to match against for worker-liveness checks
 *   (_findLiveTaggedProcess). Defaults to DEFAULT_TAGGED_PROCESS_EXE_BASENAME
 *   ('claude.exe'); tests override this to whatever real, short-lived child
 *   process they spawn under test.
 * @returns {Promise<{protocolVersion: number, originalRunId: string,
 *   successorPlanDigest: string,
 *   taskMapping: Array<{oldTaskId: string, newTaskId: string,
 *     carriesCompletion: boolean}>}>}
 * @throws {Error} DISPATCH_VALIDATION_ERROR for malformed input;
 *   SUCCESSOR_NOT_APPROVED when the successor's Approvals.md is missing,
 *   unreadable, or has no "## Gate 2" section; SUCCESSOR_PLAN_NOT_FOUND when
 *   the successor's Work-Breakdown.md/.csv cannot be read; the underlying
 *   PLAN_PARSE_ERROR when the successor plan itself is malformed;
 *   REPLAN_UNKNOWN_TASK_MAPPING when any mapping entry references an unknown
 *   ID on either side; LIVE_WORKER_BLOCKS_REPLAN when any original-run
 *   attempt's worker liveness is not confirmed-not-found;
 *   STATE_NOT_FOUND / STATE_CORRUPTED propagated unmodified from
 *   store.readState; INTENT_CONFLICT propagated unmodified from
 *   store.writeIntent when a conflicting replan record already exists for
 *   this run.
 */
async function replan(args) {
  args = args || {};

  _requireNonEmptyString(args.executionRoot, 'replan: args.executionRoot');
  _requireNonEmptyString(args.runId, 'replan: args.runId');
  _requireNonEmptyString(args.projectDir, 'replan: args.projectDir');
  _requireNonEmptyString(args.taskRef, 'replan: args.taskRef');
  _requireNonEmptyString(args.feature, 'replan: args.feature');
  if (!Array.isArray(args.taskMapping)) {
    throw _err('DISPATCH_VALIDATION_ERROR', 'replan: args.taskMapping must be an array');
  }
  args.taskMapping.forEach(function (entry, idx) {
    if (
      entry == null || typeof entry !== 'object' ||
      typeof entry.oldTaskId !== 'string' || entry.oldTaskId.length === 0 ||
      typeof entry.newTaskId !== 'string' || entry.newTaskId.length === 0
    ) {
      throw _err(
        'DISPATCH_VALIDATION_ERROR',
        'replan: args.taskMapping[' + idx + '] must be an object with non-empty string "oldTaskId"/"newTaskId"'
      );
    }
  });

  const executionRoot = args.executionRoot;
  const runId = args.runId;
  const projectDir = args.projectDir;
  const taskRef = args.taskRef;
  const exeBasename = typeof args.exeBasename === 'string' && args.exeBasename.length > 0
    ? args.exeBasename
    : DEFAULT_TAGGED_PROCESS_EXE_BASENAME;

  // 1. Successor Gate 2 / revision approval evidence — fail closed FIRST,
  // before reading anything about the original run or the successor's plan
  // files.
  const successorFeatureDir = _deriveFeatureDir(args.feature);
  const successorPrefix = _derivePrefix(successorFeatureDir);
  if (!successorPrefix) {
    throw _err(
      'SUCCESSOR_NOT_APPROVED',
      'replan: could not derive a PREFIX (e.g. "FTR-018") from successor feature directory "' +
        successorFeatureDir + '" — refusing to treat an unidentifiable feature as approved'
    );
  }
  const successorApprovalsPath = path.join(successorFeatureDir, successorPrefix + '-Approvals.md');
  let successorApprovalsText;
  try {
    successorApprovalsText = fs.readFileSync(successorApprovalsPath, 'utf8');
  } catch (err) {
    throw _err(
      'SUCCESSOR_NOT_APPROVED',
      'replan: successor Approvals.md not found or unreadable at "' + successorApprovalsPath +
        '" — refusing to replan onto an unapproved successor: ' + err.message
    );
  }
  if (!_hasGate2Approval(successorApprovalsText)) {
    throw _err(
      'SUCCESSOR_NOT_APPROVED',
      'replan: successor Approvals.md at "' + successorApprovalsPath +
        '" has no "## Gate 2" approval section — refusing to replan onto an unapproved successor plan'
    );
  }

  // 2. Successor plan snapshot — real Work-Breakdown.md/.csv on disk, same
  // parser pipeline every other run uses (plan.createPlanSnapshot). Its own
  // PLAN_PARSE_ERROR propagates unmodified for a malformed successor plan.
  const successorMdPath = path.join(successorFeatureDir, successorPrefix + '-Work-Breakdown.md');
  const successorCsvPath = path.join(successorFeatureDir, successorPrefix + '-Work-Breakdown.csv');
  let successorMd;
  let successorCsv;
  try {
    successorMd = fs.readFileSync(successorMdPath, 'utf8');
    successorCsv = fs.readFileSync(successorCsvPath, 'utf8');
  } catch (err) {
    throw _err(
      'SUCCESSOR_PLAN_NOT_FOUND',
      'replan: successor Work Breakdown MD/CSV not found at "' + successorMdPath + '" / "' +
        successorCsvPath + '": ' + err.message
    );
  }
  const successorSnapshot = plan.createPlanSnapshot(successorMd, successorCsv);
  const successorTaskIds = new Set(successorSnapshot.tasks.map(function (t) { return t.id; }));

  // 3. Load the ORIGINAL run's state — STATE_NOT_FOUND/STATE_CORRUPTED
  // propagate unmodified.
  const state = store.readState(executionRoot, runId);

  // 4. Validate the caller-supplied taskMapping against BOTH sides before
  // touching anything — fail closed on the first unknown ID found.
  args.taskMapping.forEach(function (entry) {
    if (!Object.prototype.hasOwnProperty.call(state.tasks, entry.oldTaskId)) {
      throw _err(
        'REPLAN_UNKNOWN_TASK_MAPPING',
        'replan: taskMapping references oldTaskId "' + entry.oldTaskId +
          '", which does not exist in original run "' + runId + '"'
      );
    }
    if (!successorTaskIds.has(entry.newTaskId)) {
      throw _err(
        'REPLAN_UNKNOWN_TASK_MAPPING',
        'replan: taskMapping references newTaskId "' + entry.newTaskId +
          '", which does not exist in the successor plan snapshot (' + successorMdPath + ')'
      );
    }
  });

  // 5. Carry-completion eligibility per mapped pair — read-only, never
  // touches the old task's own evidence either way regardless of outcome.
  const taskMappingResult = args.taskMapping.map(function (entry) {
    const oldTask = state.tasks[entry.oldTaskId];
    let carriesCompletion = false;
    if (oldTask.status === 'checkpointed' || oldTask.status === 'integrated') {
      const lastAttempt = Array.isArray(oldTask.attempts) && oldTask.attempts.length > 0
        ? oldTask.attempts[oldTask.attempts.length - 1]
        : null;
      if (lastAttempt && typeof lastAttempt.originalSha === 'string' && SHA_PATTERN.test(lastAttempt.originalSha)) {
        try {
          carriesCompletion = _isCommitReachableOnRef(projectDir, lastAttempt.originalSha, taskRef);
        } catch (_reachErr) {
          carriesCompletion = false; // never guess — an unverifiable check is never eligible
        }
      }
    }
    return { oldTaskId: entry.oldTaskId, newTaskId: entry.newTaskId, carriesCompletion: carriesCompletion };
  });

  // 6. "No live workers" gate over EVERY task/attempt in the ORIGINAL run
  // (not just the mapped ones) — reuses US-06-TASK-BE-02's own
  // _findLiveTaggedProcess exactly like reconcile()'s own worker-liveness
  // classification. 'unknown' blocks exactly like 'found-alive' — never
  // assume dead.
  Object.keys(state.tasks).sort().forEach(function (taskId) {
    const task = state.tasks[taskId];
    (Array.isArray(task.attempts) ? task.attempts : []).forEach(function (attempt) {
      if (typeof attempt.processIdentity !== 'string' || attempt.processIdentity.length === 0) {
        return; // nothing recorded to check
      }
      const liveness = _findLiveTaggedProcess(attempt.processIdentity, exeBasename);
      if (liveness.status !== 'confirmed-not-found') {
        throw _err(
          'LIVE_WORKER_BLOCKS_REPLAN',
          'replan: refusing to supersede run "' + runId + '" — task "' + taskId + '" attempt ' +
            attempt.number + '\'s worker liveness is "' + liveness.status + '" (' + liveness.reason +
            '); a run may only be superseded once every worker is confirmed not running'
        );
      }
    });
  });

  // 7. Persist the durable old->new mapping record BEFORE changing run
  // status, so a conflicting replay (INTENT_CONFLICT) never leaves the
  // original run superseded without its mapping record durably alongside it.
  // Deliberately no wall-clock timestamp field here (unlike, say, a receipt's
  // startedAt/endedAt): store.js's _writeImmutableRecord treats a replay as
  // idempotent only when its content is byte-for-byte identical to what is
  // already recorded (see git.js's own persistCheckpointIntent, which
  // likewise carries no timestamp in its intent payload) — a fresh
  // Date().toISOString() on every call would make even a genuine, intentional
  // replay of the exact same replan decision always look like a conflicting
  // second decision.
  const replanRecord = {
    protocolVersion: store.PROTOCOL_VERSION,
    originalRunId: runId,
    successorFeaturePath: args.feature,
    successorPlanDigest: successorSnapshot.planDigest,
    taskMapping: taskMappingResult,
  };
  store.writeIntent(executionRoot, runId, 'replan', replanRecord);

  // 8. Only now: mark the original run superseded. Task/attempt evidence is
  // never touched by this function, in either direction.
  const supersededState = state.setRunStatus('superseded');
  store.writeState(executionRoot, runId, supersededState);

  return {
    protocolVersion: store.PROTOCOL_VERSION,
    originalRunId: runId,
    successorPlanDigest: successorSnapshot.planDigest,
    taskMapping: taskMappingResult,
  };
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
  evaluateTaskEvidence,
  createTaskWorktree,
  createSlotPool,
  DEFAULT_TAGGED_PROCESS_EXE_BASENAME,
  _buildProcessTag,
  _findLiveTaggedProcess,
  _measureTokensFromSpawnResult,
  _finalizeDispatchLedgerActivity,
};
