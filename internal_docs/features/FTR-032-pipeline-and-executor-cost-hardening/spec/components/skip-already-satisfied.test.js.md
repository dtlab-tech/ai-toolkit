# tests/task-executor/skip-already-satisfied.test.js — New

## Change

New file, mirroring `tests/task-executor/executor.sequential.test.js`'s real-dispatch harness —
proves UC-03's pre-dispatch short-circuit end-to-end: a task whose verification commands already
pass before its first attempt is marked `'skipped'` WITHOUT ever spawning an implementation or
review subprocess (AC-06, AC-10); a task whose verification fails, or that declares zero
verification commands, is never short-circuited (AC-07, AC-08); a task's retry is never
short-circuited either (AC-09).

**Found during implementation:** a zero-verification-commands task can never actually occur via
the real pipeline (`wb-validate.js`'s own check 16 requires at least one command before Gate 2
approval) — and reaching a full, successful `'checkpointed'` outcome with zero verification
commands hits an unrelated, pre-existing crash (`persistCheckpointIntent: verificationReceiptIds
must be a non-empty array of receipt ids`, since `verification.results` is empty). Out of scope to
fix here. AC-08's test instead uses `--mode=echo-json` (writes nothing), which — with zero
verification commands trivially "passing" — lets the EXISTING post-hoc "changedPaths is empty"
skip path complete the task as `'skipped'` without ever reaching that crash, while still proving
AC-08's real point: `state.tasks[taskId].attempts` has length 1 (a genuine dispatch happened),
never 0 (the pre-dispatch short-circuit never fired).

## Algorithm

```js
test('a task whose verification already passes before dispatch is skipped without any dispatch (AC-06)', async () => {
  const task = {
    id: 'US-01-TASK-BE-ALREADY-DONE-01', title: 'Already-done task',
    outcome: 'Nothing to do — the file already exists', domain: 'BE', agentType: 'developer-backend',
    dependsOn: [], verificationCommands: ['test -f already-done.txt'],
  };
  writeWorkBreakdownFixture(featureDir, 'FTR-906', [task]);
  writeFile(repoDir, 'already-done.txt', 'pre-existing\n');
  commitAll(repoDir, 'pre-existing file already committed');

  const result = await execute({
    project: repoDir, feature: path.join(featureDir, 'feature.md'), claudePath: NODE,
    taskTimeoutMs: 15000, agentBudgetUsd: 5,
    implementationSpawnArgs: [FIXTURE, '--mode=fail-if-invoked'], // new fake-claude-cli.js mode: fails if ever spawned
    reviewSpawnArgs: [FIXTURE, '--mode=fail-if-invoked'],
  });

  expect(result.runStatus).toBe('completed');
  expect(result.tasks).toEqual([{ taskId: task.id, status: 'skipped' }]);
  const state = store.readState(executionRoot, result.runId);
  expect(state.tasks[task.id].reason).toBe('already-satisfied-pre-dispatch');
  expect(state.tasks[task.id].attempts).toHaveLength(0); // never even persisted an attempt
});

test('a task whose verification fails before dispatch proceeds to a normal dispatch (AC-07)', async () => {
  const task = {
    id: 'US-01-TASK-BE-NOT-DONE-01', title: 'Not-done task',
    outcome: 'The file does not exist yet', domain: 'BE', agentType: 'developer-backend',
    // fake-claude-cli.js's write-file-and-succeed mode always writes "<taskId>.output.txt" —
    // the verification command must match that exact convention.
    dependsOn: [], verificationCommands: ['test -f US-01-TASK-BE-NOT-DONE-01.output.txt'],
  };
  writeWorkBreakdownFixture(featureDir, 'FTR-906', [task]);

  const result = await execute({
    project: repoDir, feature: path.join(featureDir, 'feature.md'), claudePath: NODE,
    taskTimeoutMs: 15000, agentBudgetUsd: 5,
    implementationSpawnArgs: [FIXTURE, '--mode=write-file-and-succeed'],
    reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
  });
  expect(result.tasks).toEqual([{ taskId: task.id, status: 'checkpointed' }]); // normal dispatch, not skipped
});

test('a task with zero verification commands is never short-circuited (AC-08)', async () => {
  const task = {
    id: 'US-01-TASK-BE-NO-VERIF-01', title: 'No-verification task',
    outcome: 'This task declares no verification commands at all', domain: 'BE', agentType: 'developer-backend',
    dependsOn: [], verificationCommands: [],
  };
  writeWorkBreakdownFixture(featureDir, 'FTR-906', [task]);

  const result = await execute({
    project: repoDir, feature: path.join(featureDir, 'feature.md'), claudePath: NODE,
    taskTimeoutMs: 15000, agentBudgetUsd: 5,
    implementationSpawnArgs: [FIXTURE, '--mode=echo-json'], // avoids an unrelated, pre-existing crash — see this file's own Change note
    reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
  });
  expect(result.tasks).toEqual([{ taskId: task.id, status: 'skipped' }]);
  const state = store.readState(executionRoot, result.runId);
  expect(state.tasks[task.id].attempts).toHaveLength(1); // a real dispatch happened — not the zero-attempt short-circuit
});

test('a task\'s retry (second attempt) is never short-circuited, even if it would otherwise match (AC-09)', async () => {
  // scenario: attempt 1's implementation agent writes nothing real (echo-json) -> verification
  // fails -> retried as attempt 2. Verification still fails before attempt 2 too (nothing was
  // ever written), proving attempt 2 was correctly NOT short-circuited into a false 'skipped' —
  // a short-circuit bug here would incorrectly mark it 'skipped' instead of 'blocked'.
  const task = {
    id: 'US-01-TASK-BE-RETRY-01', title: 'Retry task',
    outcome: 'First attempt fails verification, second attempt is a normal retry, not a short-circuit',
    domain: 'BE', agentType: 'developer-backend', dependsOn: [],
    verificationCommands: ['test -f US-01-TASK-BE-RETRY-01.output.txt'],
  };
  writeWorkBreakdownFixture(featureDir, 'FTR-906', [task]);

  const result = await execute({
    project: repoDir, feature: path.join(featureDir, 'feature.md'), claudePath: NODE,
    taskTimeoutMs: 15000, agentBudgetUsd: 5,
    implementationSpawnArgs: [FIXTURE, '--mode=echo-json'],
    reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
  });
  expect(result.tasks).toEqual([{ taskId: task.id, status: 'blocked' }]);
  const state = store.readState(executionRoot, result.runId);
  expect(state.tasks[task.id].attempts).toHaveLength(2); // both attempts real dispatches, neither short-circuited
});

test('measured cost: a short-circuited task dispatches zero subprocesses; a normally-dispatched task dispatches real ones (AC-10)', async () => {
  const alreadyDone = {
    id: 'US-01-TASK-BE-ALREADY-DONE-02', title: 'Already-done', outcome: 'done', domain: 'BE',
    agentType: 'developer-backend', verificationCommands: ['test -f already-done-2.txt'], dependsOn: [],
  };
  const notDone = {
    id: 'US-01-TASK-BE-NOT-DONE-02', title: 'Not done', outcome: 'not done yet', domain: 'BE',
    agentType: 'developer-backend', verificationCommands: ['test -f US-01-TASK-BE-NOT-DONE-02.output.txt'], dependsOn: [],
  };
  writeWorkBreakdownFixture(featureDir, 'FTR-906', [alreadyDone, notDone]);
  writeFile(repoDir, 'already-done-2.txt', 'pre-existing\n');
  commitAll(repoDir, 'pre-existing file already committed');

  const result = await execute({
    project: repoDir, feature: path.join(featureDir, 'feature.md'), claudePath: NODE,
    taskTimeoutMs: 15000, agentBudgetUsd: 5,
    implementationSpawnArgs: [FIXTURE, '--mode=write-file-and-succeed'],
    reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
  });
  expect(result.tasks.find(t => t.taskId === alreadyDone.id).status).toBe('skipped');
  expect(result.tasks.find(t => t.taskId === notDone.id).status).toBe('checkpointed');
  const state = store.readState(executionRoot, result.runId);
  expect(state.tasks[alreadyDone.id].attempts).toHaveLength(0);
  expect(state.tasks[notDone.id].attempts).toHaveLength(1);
});
```

`fake-claude-cli.js` gains one new mode, `--mode=fail-if-invoked`, which immediately exits non-zero
with a distinctive error message — used as a hard, test-enforced guarantee that the short-circuited
task's test genuinely never spawns anything, rather than relying only on an absence-of-assertion.

## Tests

This component *is* the test file for AC-06 through AC-10 — no further test file covers them.
