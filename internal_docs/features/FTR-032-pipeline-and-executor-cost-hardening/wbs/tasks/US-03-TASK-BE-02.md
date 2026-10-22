<a id="task-US-03-TASK-BE-02"></a>
### US-03-TASK-BE-02

- **Task ID:** US-03-TASK-BE-02
- **Title:** Short-circuit dispatch for a task already satisfied before its first attempt
- **Outcome:** _runTaskToResolution runs a task's verification commands once before its first attempt only; an all-pass result marks it 'skipped' with reason 'already-satisfied-pre-dispatch', without ever calling dispatchTaskAttempt
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-06, AC-07, AC-08, AC-09, AC-10
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 16000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** task-executor
- **Commit subject:** short-circuit dispatch for a task already satisfied before its first attempt

**Implementation notes:**

Per `spec/components/index.js.md`'s Edit 3, in `lib/task-executor/index.js`'s
`_runTaskToResolution`, inside the `for (;;)` attempt loop, right after `attemptNumber` is
computed and BEFORE `dispatchTaskAttempt` is called:

```js
const attemptNumber = state.tasks[taskId].attempts.length + 1;

// Calls _runVerificationCommand directly, NOT runVerifications — the latter persists an
// immutable receipt per command keyed by taskId+attemptNumber+index, which collides with the
// REAL post-dispatch verification receipt for the same attempt whenever this check does NOT
// short-circuit (found via a real test failure: same receipt ID, different timestamps,
// RECEIPT_CONFLICT). This pre-check has nothing to attribute a receipt to yet, so it
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
  dispatchResult = await dispatchTaskAttempt({ ... }); // unchanged from today
```

`_runVerificationCommand(command, cwd, timeoutMs)` is the lower-level primitive `runVerifications`
itself already builds on (no receipt-writing side effect — that happens one level up, in
`runVerifications`'s own loop). This short-circuit check runs ONLY when `attemptNumber === 1` — a
retry (attempt 2+) always falls through to a normal dispatch, regardless of current verification
state (AC-09). A task with `task.verificationCommands.length === 0` also always falls through
(AC-08). Found during implementation: `tests/task-executor/checkpoint-noop.test.js` needed a
fixture update — its task previously used a verification command that already passed before the
first attempt specifically to reach the OLD post-hoc "changedPaths is empty" skip path, which this
new short-circuit now intercepts earlier; changed to zero verification commands (exempt per AC-08)
to keep exercising that older path distinctly.

**Verification commands:**

```
node -e "const fs = require('fs'); const src = fs.readFileSync('lib/task-executor/index.js', 'utf8'); if (!src.includes(\"reason: 'already-satisfied-pre-dispatch'\")) { throw new Error('short-circuit wiring not found') }"
```
