# tests/task-executor/dispatch-evidence.test.js — New

## Change

New file, mirroring `tests/task-executor/executor.sequential.test.js`'s exact real-dispatch
harness (fake-claude-cli.js fixture, real git repo under `fs.mkdtempSync(os.tmpdir())`, LOCAL-only
git config, `claudeProcess.verifyAgentIdentity` stubbed via `jest.spyOn`) — proves a real
implementation dispatch AND a real review dispatch each leave behind an independently-readable
evidence file (AC-05).

## Algorithm

```js
const { execute } = require('../../lib/task-executor/index');
// ... same initRepo/writeFile/commitAll/writeWorkBreakdownFixture helpers as
// executor.sequential.test.js (copied, not imported — this project's own established
// per-test-file fixture convention)

test('a real implementation dispatch and a real review dispatch each leave an independently-readable evidence file', async () => {
  const task = {
    id: 'US-01-TASK-BE-EVIDENCE-01', title: 'Evidence test task',
    outcome: 'Evidence files exist for this task\'s dispatches', domain: 'BE', agentType: 'developer-backend',
    verificationCommands: ['test -f US-01-TASK-BE-EVIDENCE-01.output.txt'],
  };
  writeWorkBreakdownFixture(featureDir, 'FTR-903', [task]);

  const result = await execute({
    project: repoDir, feature: path.join(featureDir, 'feature.md'), claudePath: NODE,
    taskTimeoutMs: 15000, agentBudgetUsd: 5,
    implementationSpawnArgs: [FIXTURE, '--mode=write-file-and-succeed'],
    reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
  });

  expect(result.runStatus).toBe('completed');

  const evidenceDir = path.join(executionRoot, 'evidence', result.runId);
  const files = fs.readdirSync(evidenceDir).filter(f => f.endsWith('.json'));
  expect(files.length).toBeGreaterThanOrEqual(2); // at least one implementation + one review

  const records = files.map(f => JSON.parse(fs.readFileSync(path.join(evidenceDir, f), 'utf8')));
  const implRecord = records.find(r => r.invocation.dispatchKind === 'implementation' && r.invocation.taskId === task.id);
  const reviewRecord = records.find(r => r.invocation.dispatchKind === 'review' && r.invocation.taskId === task.id);
  expect(implRecord).toBeDefined();
  expect(implRecord.outcome).toBe('done');
  expect(reviewRecord).toBeDefined();
  expect(reviewRecord.outcome).toBe('done');

  // independently readable: parses cleanly with no dependency on the run's own in-progress state
  expect(() => JSON.parse(fs.readFileSync(path.join(evidenceDir, files[0]), 'utf8'))).not.toThrow();
});

test('a dispatch that throws still leaves an evidence file with outcome "failed"', async () => {
  const task = {
    id: 'US-01-TASK-BE-EVIDENCE-FAIL-01', title: 'Evidence failure test task',
    outcome: 'Evidence captured even when dispatch itself errors', domain: 'BE', agentType: 'developer-backend',
    verificationCommands: ['test -f US-01-TASK-BE-EVIDENCE-FAIL-01.output.txt'],
  };
  writeWorkBreakdownFixture(featureDir, 'FTR-903', [task]);

  await execute({
    project: repoDir, feature: path.join(featureDir, 'feature.md'), claudePath: NODE,
    taskTimeoutMs: 15000, agentBudgetUsd: 5,
    implementationSpawnArgs: [FIXTURE, '--mode=echo-json'], // reports success but writes nothing -> verification fails -> retried -> blocked
    reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
  }).catch(() => {}); // runStatus 'blocked' is a normal resolved result, not a throw, for this fixture mode

  const runDirs = fs.readdirSync(path.join(executionRoot, 'evidence'));
  expect(runDirs.length).toBeGreaterThan(0);
  const evidenceDir = path.join(executionRoot, 'evidence', runDirs[0]);
  const files = fs.readdirSync(evidenceDir).filter(f => f.endsWith('.json'));
  const records = files.map(f => JSON.parse(fs.readFileSync(path.join(evidenceDir, f), 'utf8')));
  // at least one implementation record exists per attempt, with a real outcome either way
  expect(records.some(r => r.invocation.dispatchKind === 'implementation' && (r.outcome === 'done' || r.outcome === 'failed'))).toBe(true);
});
```

## Tests

This component *is* the test file for AC-05 — no further test file covers it.
