<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Persist evidence for implementation and review dispatches
- **Outcome:** dispatchTaskAttempt and runReview each wrap their own claudeProcess.spawnClaudeAgent call with lib/workflow-worker-evidence.js's createEvidence/save, scoped under executionRoot/evidence/<runId>/
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-05
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** task-executor
- **Commit subject:** persist turn-by-turn evidence for implementation and review dispatches

**Implementation notes:**

Per `spec/components/index.js.md`'s Edits 1-2, in `lib/task-executor/index.js`:

```js
// at the top of the file, alongside the other requires:
const { createEvidence } = require('../workflow-worker-evidence');
```

In `dispatchTaskAttempt` (step 4, wraps the existing `claudeProcess.spawnClaudeAgent` call):

```js
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
    claudePath: args.claudePath, args: spawnArgs, prompt: prompt,
    cwd: args.projectDir, taskTimeoutMs: args.taskTimeoutMs,
  });
  evidence.save({ outcome: 'done', response: spawnResult, completedAt: new Date().toISOString() });
} catch (error) {
  evidence.save({ outcome: 'failed', error: String(error), completedAt: new Date().toISOString() });
  throw error;
}
```

Add `evidencePath: evidence.file` to the object `dispatchTaskAttempt` returns, alongside the
existing `ledgerOperationId`.

In `runReview` (step 4, same pattern, `dispatchKind: 'review'`), identical structure, same new
`evidencePath: evidence.file` added to its own returned object.

`path` and `executionRoot`/`runId`/`identity` are all already in scope in both functions — no new
parameter needed on either function's own public signature. `createEvidence`'s existing `redact()`
pass (credential scrubbing) applies automatically, unchanged — this task does not touch
`lib/workflow-worker-evidence.js` itself at all.

**Verification commands:**

```
node -e "const i = require('./lib/task-executor/index'); console.log(typeof i.dispatchTaskAttempt, typeof i.runReview)"
```
