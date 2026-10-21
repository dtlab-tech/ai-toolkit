# lib/task-executor/index.js — Modified

## Change

Two independent edits, both additive to existing functions, neither touching any existing
retry/terminal-status decision beyond UC-03's own new short-circuit path:

1. **UC-02's evidence capture.** `dispatchTaskAttempt` and `runReview` each wrap their own
   `claudeProcess.spawnClaudeAgent` call with `lib/workflow-worker-evidence.js`'s existing
   `createEvidence`/`save` — the SAME primitive `lib/workflow-control.js` already uses for every
   `pm-phase1`/`pm-phase2` worker call — scoped under the run's own `executionRoot` instead of
   `os.tmpdir()`.
2. **UC-03's pre-dispatch short-circuit.** `_runTaskToResolution` runs a task's own verification
   commands once, before ever calling `dispatchTaskAttempt`, but ONLY on that task's first
   attempt and ONLY when it declares one or more verification commands. An all-pass result marks
   the task `'skipped'` directly, with a `reason` distinguishing it from the existing post-hoc
   no-op-checkpoint `'skipped'` path (Tech-Spec Open Question 2).

## Algorithm

**Edit 1 — `dispatchTaskAttempt`'s spawn call** (wraps the existing
`claudeProcess.spawnClaudeAgent` call near the end of the function):

```js
// at the top of the file, alongside the other lib/task-executor requires:
const { createEvidence } = require('../workflow-worker-evidence');

// before (inside dispatchTaskAttempt, step 4):
const spawnResult = await claudeProcess.spawnClaudeAgent({
  claudePath: args.claudePath,
  args: spawnArgs,
  prompt: prompt,
  cwd: args.projectDir,
  taskTimeoutMs: args.taskTimeoutMs,
});

// after:
const evidence = createEvidence(
  { diagnosticsDir: path.join(executionRoot, 'evidence') },
  runId,
  identity,
  { dispatchKind: 'implementation', taskId: task.id, attemptNumber: attemptNumber,
    executable: args.claudePath, cwd: args.projectDir, args: spawnArgs }
);
let spawnResult;
try {
  spawnResult = await claudeProcess.spawnClaudeAgent({
    claudePath: args.claudePath,
    args: spawnArgs,
    prompt: prompt,
    cwd: args.projectDir,
    taskTimeoutMs: args.taskTimeoutMs,
  });
  evidence.save({ outcome: 'done', response: spawnResult, completedAt: new Date().toISOString() });
} catch (error) {
  evidence.save({ outcome: 'failed', error: String(error), completedAt: new Date().toISOString() });
  throw error;
}
```

The returned object from `dispatchTaskAttempt` gains one new field, `evidencePath: evidence.file`,
alongside the existing `ledgerOperationId` — mirroring how `lib/workflow-control.js`'s own
`tokenLedger` entries carry `evidence_path` for the same discoverability reason.

**Edit 2 — `runReview`'s spawn call** (identical pattern, `dispatchKind: 'review'`, inside
`runReview`'s own step 4):

```js
// before:
const spawnResult = await claudeProcess.spawnClaudeAgent({
  claudePath: args.claudePath,
  args: spawnArgs,
  prompt: prompt,
  cwd: args.projectDir,
  taskTimeoutMs: args.taskTimeoutMs,
});

// after:
const evidence = createEvidence(
  { diagnosticsDir: path.join(executionRoot, 'evidence') },
  runId,
  identity,
  { dispatchKind: 'review', taskId: task.id, attemptNumber: attemptNumber,
    executable: args.claudePath, cwd: args.projectDir, args: spawnArgs }
);
let spawnResult;
try {
  spawnResult = await claudeProcess.spawnClaudeAgent({
    claudePath: args.claudePath,
    args: spawnArgs,
    prompt: prompt,
    cwd: args.projectDir,
    taskTimeoutMs: args.taskTimeoutMs,
  });
  evidence.save({ outcome: 'done', response: spawnResult, completedAt: new Date().toISOString() });
} catch (error) {
  evidence.save({ outcome: 'failed', error: String(error), completedAt: new Date().toISOString() });
  throw error;
}
```

`runReview`'s returned object similarly gains `evidencePath: evidence.file`.

**Edit 3 — `_runTaskToResolution`'s pre-dispatch short-circuit** (inside the `for (;;)` attempt
loop, right after `attemptNumber` is computed, BEFORE `dispatchTaskAttempt` is called):

```js
// before:
const attemptNumber = state.tasks[taskId].attempts.length + 1;

let dispatchResult;
try {
  dispatchResult = await dispatchTaskAttempt({ ... });

// after:
const attemptNumber = state.tasks[taskId].attempts.length + 1;

// Deliberately calls _runVerificationCommand directly, NOT runVerifications — the latter
// persists an immutable receipt per command keyed by taskId+attemptNumber+index; calling it
// here under attemptNumber=1 collides with the REAL post-dispatch verification receipt for the
// same attempt whenever this check does NOT short-circuit (different timestamps, same receipt
// ID, a genuine RECEIPT_CONFLICT — found via a real pre-existing test failure during
// implementation). This pre-check has nothing to attribute a receipt to yet, so it
// intentionally persists nothing.
if (attemptNumber === 1 && task.verificationCommands.length > 0) {
  let alreadySatisfied = true;
  for (const command of task.verificationCommands) {
    const outcome = await _runVerificationCommand(command, projectDir, ctx.taskTimeoutMs);
    if (!(outcome.spawnError === null && outcome.exitCode === 0)) { alreadySatisfied = false; break; }
  }
  if (alreadySatisfied) {
    state = store.readState(executionRoot, runId);
    state = state.setTaskStatus(taskId, 'skipped', { reason: 'already-satisfied-pre-dispatch' });
    store.writeState(executionRoot, runId, state);
    return;
  }
  // any failure: fall through to a normal dispatch below, unchanged
}

let dispatchResult;
try {
  dispatchResult = await dispatchTaskAttempt({ ... });
```

This pre-check writes no receipt and opens/closes no ledger activity — there is nothing to
attribute either to yet (no attempt has been persisted), consistent with how
`_computeReviewDiff`/`detectChangedPaths` already run as plain, unlogged helper calls elsewhere in
this same function. A PRE-EXISTING test (`tests/task-executor/checkpoint-noop.test.js`) needed a
fixture update found during implementation: its task previously declared a verification command
that already passed before the first attempt (a pre-committed deliverable) specifically to reach
the post-hoc "changedPaths is empty" skip path — that scenario is now intercepted EARLIER by this
new pre-dispatch short-circuit instead. Changed to zero verification commands (exempt from the
short-circuit per AC-08, and verification trivially "passes" with no commands to fail), which still
reproduces the exact original `STAGING_VALIDATION_ERROR` scenario that test guards against.

`state.setTaskStatus(taskId, 'skipped', { reason: ... })` is a new, optional second parameter —
`setTaskStatus`'s existing single-argument call sites (the post-hoc no-op-checkpoint path, and
every other status transition in this file) are unaffected; the reason is stored alongside the
task's status in state and is readable from `status`/`diagnose`'s own existing state dump, but
introduces no new required field anywhere else.

## Tests

See `components/dispatch-evidence.test.js.md` (AC-05) and
`components/skip-already-satisfied.test.js.md` (AC-06 through AC-10).
