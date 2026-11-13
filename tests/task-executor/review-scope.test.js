'use strict';

// --review-scope (execute args.reviewScope) and the feedback handed to a retry.
//
// 'task' (default) reviews every task attempt, as before. 'phase' reviews once per phase (a user
// story of the Work Breakdown): every task still runs its own verification commands and is
// committed as soon as they pass, but only the LAST task of the phase to complete is reviewed, on
// the diff of the whole phase. A failed phase review retries that last task with the findings in
// its prompt; the earlier tasks stay committed (fix forward, no work is lost).
//
// SAFETY: same discipline as executor.sequential.test.js — no real claude.exe (fake-claude-cli.js
// only), a fresh repo per test under os.tmpdir() with LOCAL-only git config, removed in afterEach.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const claudeProcess = require('../../lib/task-executor/claude-process');
const store = require('../../lib/task-executor/store');
const executor = require('../../lib/task-executor/index');
const { execute } = executor;

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-claude-cli.js');
const NODE = process.execPath;

const VERIFIED_IDENTITY = {
  agentId: 'gaia.agent.developer.backend',
  nativeName: 'gaia-developer-backend',
  sha256: 'sha256:' + 'd'.repeat(64),
  path: '/fake/path/gaia-developer-backend.md',
  manifestPath: '/fake/path/.ai-toolkit-manifest.json',
  toolkitVersion: '0.13.0',
  scope: 'project',
};

jest.setTimeout(90000);

function gitCmd(dir, args) {
  const res = spawnSync('git', args, { cwd: dir, shell: false, encoding: 'utf8', windowsHide: true });
  if (res.status !== 0) throw new Error('test setup: "git ' + args.join(' ') + '" failed: ' + (res.stderr || res.error));
  return res.stdout;
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function renderTaskDetail(task) {
  const anchor = 'task-' + task.id.replace(/[^A-Za-z0-9_-]/g, '-');
  return [
    '<a id="' + anchor + '"></a>', '### ' + task.id, '',
    '- **Task ID:** ' + task.id,
    '- **Title:** ' + task.title,
    '- **Outcome:** ' + task.outcome,
    '- **Domain:** BE',
    '- **Agent type:** developer-backend',
    '- **Dependencies:** —',
    '- **Acceptance criteria:** —',
    '- **Estimate — agent minutes:** —',
    '- **Estimate — tokens:** —',
    '- **Output count:** —',
    '- **Grouping rationale:** —',
    '- **Commit type:** —',
    '- **Commit scope:** —',
    '- **Commit subject:** —',
    '', '**Verification commands:**', '',
    '```', 'test -f ' + task.id + '.output.txt', '```', '',
  ].join('\n');
}

function buildMarkdown(prefix, tasks) {
  return [
    '# Work Breakdown — ' + prefix, '', '## Summary', '| Metric | Value |', '|--------|-------|',
    '| Total tasks | ' + tasks.length + ' |', '', '## Task Details', '',
    tasks.map(renderTaskDetail).join('\n'), '## Statistics', '',
  ].join('\n');
}

function buildCsv(tasks) {
  const rows = ['phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type'];
  tasks.forEach(function (t) {
    rows.push([t.phaseId, t.phaseTitle, 'feat: ' + t.phaseId, '', t.id, t.title, 'BE', 'developer-backend'].join('|'));
  });
  return rows.join('\n') + '\n';
}

// Two phases: US-01 with three tasks, US-02 with two.
const TASKS = [
  ['US-01', 'Phase one', 'US-01-TASK-BE-01'],
  ['US-01', 'Phase one', 'US-01-TASK-BE-02'],
  ['US-01', 'Phase one', 'US-01-TASK-BE-03'],
  ['US-02', 'Phase two', 'US-02-TASK-BE-01'],
  ['US-02', 'Phase two', 'US-02-TASK-BE-02'],
].map(function (t) {
  return { phaseId: t[0], phaseTitle: t[1], id: t[2], title: 'Task ' + t[2], outcome: 'Produces ' + t[2] + '.output.txt' };
});

function readLog(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(function (l) { return JSON.parse(l); });
}

describe('execute(): --review-scope and retry feedback', () => {
  let tmpDir, repoDir, featureDir, implLog, revLog, counter, verifyIdentitySpy, originalPlatform;

  beforeEach(() => {
    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-scope-test-'));
    repoDir = path.join(tmpDir, 'repo');
    featureDir = path.join(tmpDir, 'FTR-902-review-scope');
    fs.mkdirSync(repoDir);
    gitCmd(repoDir, ['init', '-q']);
    gitCmd(repoDir, ['config', 'user.name', 'AI Toolkit Test']);
    gitCmd(repoDir, ['config', 'user.email', 'ai-toolkit-test@example.invalid']);
    gitCmd(repoDir, ['config', 'core.autocrlf', 'false']);
    writeFile(repoDir, 'base.txt', 'base\n');
    gitCmd(repoDir, ['add', '-A']);
    gitCmd(repoDir, ['commit', '-q', '-m', 'init']);

    fs.mkdirSync(featureDir, { recursive: true });
    writeFile(featureDir, 'feature.md', '# Review scope test feature\n');
    writeFile(featureDir, 'FTR-902-Work-Breakdown.md', buildMarkdown('FTR-902', TASKS));
    writeFile(featureDir, 'FTR-902-Work-Breakdown.csv', buildCsv(TASKS));

    implLog = path.join(tmpDir, 'impl.log');
    revLog = path.join(tmpDir, 'review.log');
    counter = path.join(tmpDir, 'review.counter');
    verifyIdentitySpy = jest.spyOn(claudeProcess, 'verifyAgentIdentity').mockReturnValue(VERIFIED_IDENTITY);
  });

  afterEach(() => {
    verifyIdentitySpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  const run = (reviewScope, verdicts, extra) => execute(Object.assign({
    project: repoDir,
    feature: path.join(featureDir, 'feature.md'),
    claudePath: NODE,
    taskTimeoutMs: 20000,
    agentBudgetUsd: 5,
    reviewScope: reviewScope,
    implementationSpawnArgs: [FIXTURE, '--mode=write-file-and-succeed', '--log=' + implLog],
    reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-sequence', '--verdicts=' + verdicts, '--counter=' + counter, '--log=' + revLog],
  }, extra || {}));

  const executionRoot = () => path.join(repoDir, '.git', 'ai-toolkit', 'execution');

  test("'phase': one review per phase, on the whole phase, and every task is committed", async () => {
    const result = await run('phase', 'PASS');

    expect(result.runStatus).toBe('completed');
    expect(result.tasks.every(t => t.status === 'checkpointed')).toBe(true);
    expect(readLog(implLog)).toHaveLength(5);               // every task is implemented
    const reviews = readLog(revLog);
    expect(reviews).toHaveLength(2);                        // ...but only two phases are reviewed
    expect(gitCmd(repoDir, ['log', '--format=%s']).trim().split('\n')).toHaveLength(6);   // init + one commit per task

    const first = reviews[0].stdin;
    expect(first).toContain('Phase review: US-01 — Phase one');
    expect(first).toContain('Last task of the phase to complete: US-01-TASK-BE-03');
    ['US-01-TASK-BE-01', 'US-01-TASK-BE-02', 'US-01-TASK-BE-03'].forEach(id => expect(first).toContain(id + ' — Task ' + id));
    expect(first).toContain('=== Task US-01-TASK-BE-01 (commit');                    // an earlier task, from its commit
    expect(first).toContain('+implemented by fake-claude-cli');                      // with its diff
    expect(first).toContain('=== Task US-01-TASK-BE-03 (current attempt, not yet committed) ===');
    expect(first).toContain('Review scope (read this first)');
    expect(first).not.toContain('US-02-TASK');

    const second = reviews[1].stdin;
    expect(second).toContain('Phase review: US-02 — Phase two');
    expect(second).not.toContain('US-01-TASK-BE-01');
  });

  test("'phase': a task whose review is covered by its phase records a deferred review, never a pass", async () => {
    const result = await run('phase', 'PASS');

    const deferred = store.readReceipt(executionRoot(), result.runId, 'US-01-TASK-BE-01-attempt1-review');
    expect(deferred.deferred).toBe('covered-by-phase-review');
    expect(deferred.reviewPassed).toBeNull();

    const closer = store.readReceipt(executionRoot(), result.runId, 'US-01-TASK-BE-03-attempt1-review');
    expect(closer.deferred).toBeNull();
    expect(closer.reviewPassed).toBe(true);
  });

  test("'task' (the default) still reviews every task attempt", async () => {
    const result = await run(undefined, 'PASS');
    expect(result.runStatus).toBe('completed');
    expect(readLog(revLog)).toHaveLength(5);
    expect(readLog(revLog)[0].stdin).not.toContain('Phase review');
    expect(readLog(revLog)[0].stdin).toContain('Review scope (read this first)');
  });

  test('a finished run writes the measured actuals next to the feature documents', async () => {
    const result = await run('phase', 'PASS');
    expect(result.runStatus).toBe('completed');
    const estimate = path.join(featureDir, 'FTR-902-Token-Estimate.md');
    const ledgerFile = path.join(featureDir, 'FTR-902-executor-ledger.json');
    expect(fs.existsSync(estimate)).toBe(true);
    expect(fs.readFileSync(estimate, 'utf8')).toMatch(/Token Estimate — FTR-902/);
    const calls = JSON.parse(fs.readFileSync(ledgerFile, 'utf8')).calls;
    expect(calls.filter(c => c.kind === 'implementation')).toHaveLength(5);
    expect(calls.filter(c => c.kind === 'review')).toHaveLength(2);
  });

  test("'phase': a failed phase review retries the last task with the findings, and the earlier tasks stay committed", async () => {
    const result = await run('phase', 'FAIL,PASS');

    expect(result.runStatus).toBe('completed');
    const impl = readLog(implLog);
    expect(impl).toHaveLength(6);                           // T1, T2, T3, T3 again, T4, T5
    expect(impl[2].stdin).not.toContain('Feedback from the previous attempt');
    expect(impl[3].stdin).toContain('Feedback from the previous attempt of this task');
    expect(impl[3].stdin).toContain('was rejected by the review');
    expect(impl[3].stdin).toContain('T1.output.txt: the empty input case is not handled');
    expect(readLog(revLog)).toHaveLength(3);
    expect(gitCmd(repoDir, ['log', '--format=%s']).trim().split('\n')).toHaveLength(6);
  });

  test("'phase': a phase review that keeps failing blocks that task and leaves the earlier tasks committed", async () => {
    const result = await run('phase', 'FAIL');

    expect(result.runStatus).toBe('blocked');
    const byId = Object.fromEntries(result.tasks.map(t => [t.taskId, t.status]));
    expect(byId['US-01-TASK-BE-01']).toBe('checkpointed');
    expect(byId['US-01-TASK-BE-02']).toBe('checkpointed');
    expect(byId['US-01-TASK-BE-03']).toBe('blocked');
    // the two phases are independent, so the second one still runs and its closing task is blocked the same way
    expect(byId['US-02-TASK-BE-01']).toBe('checkpointed');
    expect(byId['US-02-TASK-BE-02']).toBe('blocked');
    expect(readLog(revLog)).toHaveLength(4);                // two attempts of each closing task, one review each
    expect(gitCmd(repoDir, ['log', '--format=%s']).trim().split('\n')).toHaveLength(4);   // init + T1 + T2 + T4
  });

  test("'task': the findings of a failed review also reach the retry", async () => {
    const result = await run('task', 'FAIL,PASS');
    expect(result.runStatus).toBe('completed');
    const impl = readLog(implLog);
    expect(impl[1].stdin).toContain('Feedback from the previous attempt of this task');
    expect(impl[1].stdin).toContain('T1.output.txt: the empty input case is not handled');
  });

  test("--review-override: a phase review FAIL the operator accepts lets the closing task through, and the receipt keeps the real verdict", async () => {
    const result = await run('phase', 'FAIL', { reviewOverrides: ['US-01-TASK-BE-03', 'US-02-TASK-BE-02'] });

    expect(result.runStatus).toBe('completed');
    expect(result.tasks.every(t => t.status === 'checkpointed')).toBe(true);
    expect(readLog(implLog)).toHaveLength(5);              // no retry with feedback: the FAIL did not trigger one
    expect(readLog(revLog)).toHaveLength(2);

    const closer = store.readReceipt(executionRoot(), result.runId, 'US-01-TASK-BE-03-attempt1-review');
    expect(closer.reviewPassed).toBe(false);               // the review's own verdict is never rewritten
    expect(closer.overridden).toMatchObject({ by: 'operator', originalVerdict: false });
    expect(closer.overridden.criticalFindings).toEqual(['T1.output.txt: the empty input case is not handled']);
    const outcome = store.readReceipt(executionRoot(), result.runId, 'US-01-TASK-BE-03-attempt1-outcome');
    expect(outcome.stage).toBe('reviewed');
    expect(outcome.review.overridden).toMatchObject({ by: 'operator' });
  });

  test('--review-override only covers the tasks it names', async () => {
    const result = await run('phase', 'FAIL', { reviewOverrides: ['US-01-TASK-BE-03'] });
    const byId = Object.fromEntries(result.tasks.map(t => [t.taskId, t.status]));
    expect(byId['US-01-TASK-BE-03']).toBe('checkpointed');
    expect(byId['US-02-TASK-BE-02']).toBe('blocked');
  });

  test('--review-override never rescues a task whose verification failed', async () => {
    // no review is ever dispatched after a failed verification, so there is nothing to override
    fs.writeFileSync(path.join(featureDir, 'FTR-902-Work-Breakdown.md'),
      buildMarkdown('FTR-902', TASKS).split('test -f US-01-TASK-BE-03.output.txt').join('test -f never-created.txt'));
    const result = await run('phase', 'PASS', { reviewOverrides: ['US-01-TASK-BE-03'] });
    expect(Object.fromEntries(result.tasks.map(t => [t.taskId, t.status]))['US-01-TASK-BE-03']).toBe('blocked');
  });

  test("--phase-review-fail block: a failed phase review blocks the closing task at once, with no retry on guessed feedback", async () => {
    const result = await run('phase', 'FAIL', { phaseReviewFail: 'block' });

    const byId = Object.fromEntries(result.tasks.map(t => [t.taskId, t.status]));
    expect(byId['US-01-TASK-BE-03']).toBe('blocked');
    expect(byId['US-02-TASK-BE-02']).toBe('blocked');
    expect(readLog(implLog)).toHaveLength(5);              // each task implemented once: no second attempt
    expect(readLog(revLog)).toHaveLength(2);
    const state = store.readState(executionRoot(), result.runId);
    expect(state.tasks['US-01-TASK-BE-03'].attempts).toHaveLength(1);
  });

  test('rejects an unknown --review-override task and an invalid --phase-review-fail before touching anything', async () => {
    await expect(run('phase', 'PASS', { reviewOverrides: ['US-09-TASK-BE-99'] }))
      .rejects.toMatchObject({ code: 'DISPATCH_VALIDATION_ERROR', message: expect.stringContaining('US-09-TASK-BE-99') });
    await expect(run('phase', 'PASS', { phaseReviewFail: 'ignore' })).rejects.toMatchObject({ code: 'DISPATCH_VALIDATION_ERROR' });
    expect(fs.existsSync(path.join(executionRoot(), 'runs'))).toBe(false);
  });

  test('rejects an unknown review scope and a non-positive budget before touching anything', async () => {
    await expect(execute({ project: repoDir, feature: path.join(featureDir, 'feature.md'), reviewScope: 'story' }))
      .rejects.toMatchObject({ code: 'DISPATCH_VALIDATION_ERROR' });
    await expect(execute({ project: repoDir, feature: path.join(featureDir, 'feature.md'), agentBudgetUsd: 0 }))
      .rejects.toMatchObject({ code: 'DISPATCH_VALIDATION_ERROR' });
  });
});

describe('spend cap and attempt feedback helpers', () => {
  test('_budgetArgs passes --max-budget-usd only for a positive number', () => {
    expect(executor._budgetArgs(2.5)).toEqual(['--max-budget-usd', '2.5']);
    expect(executor._budgetArgs(undefined)).toEqual([]);
    expect(executor._budgetArgs(0)).toEqual([]);
    expect(executor._budgetArgs(NaN)).toEqual([]);
  });

  test('_buildAttemptFeedback explains a failed verification with the command, exit code and output', () => {
    const fb = executor._buildAttemptFeedback(1, {
      passed: false,
      results: [{ command: 'npm test', exitCode: 1, stdout: '2 failed', stderr: 'boom', passed: false }],
    }, null);
    expect(fb.kind).toBe('verification');
    expect(fb.text).toContain('Attempt 1 failed its verification commands');
    expect(fb.text).toContain('npm test (exit 1)');
    expect(fb.text).toContain('2 failed');
  });

  test('_buildAttemptFeedback explains a failed review, and is null when nothing failed', () => {
    const fb = executor._buildAttemptFeedback(2, { passed: true, results: [] },
      { reviewPassed: false, criticalFindings: ['a.js: missing null check'], responseText: 'x' });
    expect(fb.kind).toBe('review');
    expect(fb.text).toContain('Attempt 2 was rejected by the review');
    expect(fb.text).toContain('a.js: missing null check');
    expect(executor._buildAttemptFeedback(1, { passed: true, results: [] }, { reviewPassed: true, criticalFindings: [] })).toBeNull();
    expect(executor._buildAttemptFeedback(1, { passed: true, results: [] }, { reviewPassed: null, deferred: 'covered-by-phase-review', criticalFindings: [] })).toBeNull();
  });

  test('_buildTaskPrompt appends the feedback only when there is some', () => {
    const task = { id: 'T-1', title: 't', outcome: 'o', domain: 'BE', dependsOn: [], acceptanceCriteria: [], verificationCommands: [] };
    expect(executor._buildTaskPrompt(task)).not.toContain('Feedback from the previous attempt');
    expect(executor._buildTaskPrompt(task, { text: 'fix the thing' })).toContain('fix the thing');
  });
});

describe('the diff handed to a phase review shows what really happened in the phase', () => {
  let tmp, repo;
  const git = (args) => gitCmd(repo, args);

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-diff-test-'));
    repo = path.join(tmp, 'repo');
    fs.mkdirSync(repo);
    gitCmd(repo, ['init', '-q']);
    gitCmd(repo, ['config', 'user.name', 'AI Toolkit Test']);
    gitCmd(repo, ['config', 'user.email', 'ai-toolkit-test@example.invalid']);
    gitCmd(repo, ['config', 'core.autocrlf', 'false']);
    writeFile(repo, 'base.txt', 'base\n');
    git(['add', '-A']); git(['commit', '-q', '-m', 'init']);
  });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  function stateWith(taskShas) {
    let state = new store.State({
      runId: 'r1', featureId: 'FTR-903', repo: '/r', commonDir: '/r/.git', featureRef: 'refs/heads/x',
      baseSha: 'a'.repeat(40), planDigest: 'b'.repeat(64), contextHashes: {}, config: {}, runStatus: 'running',
    });
    Object.keys(taskShas).forEach(id => {
      state = state.addTask(id, { dependencies: [] });
      if (taskShas[id]) state = state.addAttempt(id, { stage: 'committed' }).updateAttempt(id, 1, { originalSha: taskShas[id] });
      state = state.setTaskStatus(id, taskShas[id] ? 'checkpointed' : 'skipped');
    });
    return state;
  }

  test('a commit made by hand inside the phase is shown, and a skipped task is explained instead of looking missing', () => {
    writeFile(repo, 'T1.txt', 'task one\n');
    git(['add', '-A']); git(['commit', '-q', '-m', 'feat: T1', '-m', 'AI-Toolkit-Task: T1']);
    const t1 = git(['rev-parse', 'HEAD']).trim();
    writeFile(repo, 'by-hand.txt', 'fixed by hand\n');
    git(['add', '-A']); git(['commit', '-q', '-m', 'fix: by hand']);

    const phase = { id: 'US-01', taskIds: ['T1', 'T2', 'T3'] };
    const diff = executor._computePhaseReviewDiff(repo, stateWith({ T1: t1, T2: null, T3: null }), phase, 'T3', '+current\n');

    expect(diff).toContain('=== Task T1 (commit');
    expect(diff).toContain('+task one');
    expect(diff).toContain('=== Commit made outside the executor during this phase');
    expect(diff).toContain('+fixed by hand');
    expect(diff).toContain('=== Task T2: no commit of its own (status skipped) ===');
    expect(diff).toContain('already part of the tree');
    expect(diff).toContain('=== Task T3 (current attempt, not yet committed) ===');
  });

  test('a phase with only executor commits adds no outside-commit section', () => {
    writeFile(repo, 'T1.txt', 'task one\n');
    git(['add', '-A']); git(['commit', '-q', '-m', 'feat: T1', '-m', 'AI-Toolkit-Task: T1']);
    const t1 = git(['rev-parse', 'HEAD']).trim();
    const diff = executor._computePhaseReviewDiff(repo, stateWith({ T1: t1, T3: null }), { id: 'US-01', taskIds: ['T1', 'T3'] }, 'T3', '+x\n');
    expect(diff).not.toContain('outside the executor');
  });
});
