'use strict';

// Regression/feature test for FTR-032 (UC-03): the task executor used to dispatch a full
// implementation + review cycle unconditionally, even when a task's own verification commands
// already passed BEFORE the first attempt. Reported against a real run
// (Fincantieri.ISDM.JobScheduler, FTR-012, toolkit v0.22.0): a task whose entire job was a 4-line
// SQL rename already present in the codebase still cost ~20 real minutes to conclude "nothing to
// do." This proves the new pre-dispatch short-circuit end to end: a task already satisfied is
// marked 'skipped' with zero dispatches at all (AC-06, AC-10); a task not yet satisfied, or with
// no verification commands, or on a retry, is never short-circuited (AC-07, AC-08, AC-09).
//
// SAFETY: mirrors tests/task-executor/executor.sequential.test.js's exact discipline — no real
// claude.exe/LLM call (tests/fixtures/fake-claude-cli.js via process.execPath only; the
// --mode=fail-if-invoked case hard-fails if ever spawned, a stronger guarantee than an
// absence-of-assertion), a fresh repo per test under fs.mkdtempSync(os.tmpdir()) with LOCAL-only
// git config, removed in afterEach.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const claudeProcess = require('../../lib/task-executor/claude-process');
const store = require('../../lib/task-executor/store');
const { execute } = require('../../lib/task-executor/index');

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

jest.setTimeout(30000);

function gitCmd(dir, args, opts) {
  const res = spawnSync('git', args, Object.assign({ cwd: dir, shell: false, encoding: 'utf8', windowsHide: true }, opts || {}));
  if (res.status !== 0) {
    throw new Error('test setup: "git ' + args.join(' ') + '" in ' + dir + ' failed: ' + (res.stderr || res.error));
  }
  return res.stdout;
}

function initRepo(dir) {
  gitCmd(dir, ['init', '-q']);
  gitCmd(dir, ['config', 'user.name', 'AI Toolkit Test']);
  gitCmd(dir, ['config', 'user.email', 'ai-toolkit-test@example.invalid']);
  gitCmd(dir, ['config', 'core.autocrlf', 'false']);
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function commitAll(dir, message) {
  gitCmd(dir, ['add', '-A']);
  gitCmd(dir, ['commit', '-q', '-m', message]);
  return gitCmd(dir, ['rev-parse', 'HEAD']).trim();
}

function taskAnchor(id) {
  return 'task-' + id.replace(/[^A-Za-z0-9_-]/g, '-');
}

function fencedCommandBlock(cmd) {
  return '```\n' + cmd + '\n```';
}

function renderTaskDetail(task) {
  const L = [];
  L.push('<a id="' + taskAnchor(task.id) + '"></a>');
  L.push('### ' + task.id);
  L.push('');
  L.push('- **Task ID:** ' + task.id);
  L.push('- **Title:** ' + task.title);
  L.push('- **Outcome:** ' + task.outcome);
  L.push('- **Domain:** ' + task.domain);
  L.push('- **Agent type:** ' + task.agentType);
  L.push('- **Dependencies:** ' + (task.dependsOn && task.dependsOn.length > 0 ? task.dependsOn.join(', ') : '—'));
  L.push('- **Acceptance criteria:** —');
  L.push('- **Estimate — agent minutes:** —');
  L.push('- **Estimate — tokens:** —');
  L.push('- **Output count:** —');
  L.push('- **Grouping rationale:** —');
  L.push('- **Commit type:** —');
  L.push('- **Commit scope:** —');
  L.push('- **Commit subject:** —');
  L.push('');
  L.push('**Verification commands:**');
  L.push('');
  if (task.verificationCommands.length === 0) {
    L.push('_No verification commands._');
    L.push('');
  } else {
    task.verificationCommands.forEach(function (cmd) {
      L.push(fencedCommandBlock(cmd));
      L.push('');
    });
  }
  return L.join('\n');
}

function buildMarkdown(prefix, tasks) {
  const L = [];
  L.push('# Work Breakdown — ' + prefix);
  L.push('');
  L.push('## Summary');
  L.push('| Metric | Value |');
  L.push('|--------|-------|');
  L.push('| Total tasks | ' + tasks.length + ' |');
  L.push('');
  L.push('## Task Details');
  L.push('');
  tasks.forEach(function (task) { L.push(renderTaskDetail(task)); });
  L.push('## Statistics');
  L.push('');
  return L.join('\n');
}

function buildCsv(tasks) {
  const HEADER = 'phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type';
  const L = [HEADER];
  tasks.forEach(function (task) {
    L.push(['PHASE-1', 'Short-circuit test phase', 'feat: short-circuit test', (task.dependsOn || []).join(' '), task.id, task.title, task.domain, task.agentType].join('|'));
  });
  return L.join('\n') + '\n';
}

function writeWorkBreakdownFixture(featureDir, prefix, tasks) {
  fs.mkdirSync(featureDir, { recursive: true });
  writeFile(featureDir, 'feature.md', '# Short-Circuit Test Feature\n\nFixture feature for skip-already-satisfied.test.js.\n');
  writeFile(featureDir, prefix + '-Work-Breakdown.md', buildMarkdown(prefix, tasks));
  writeFile(featureDir, prefix + '-Work-Breakdown.csv', buildCsv(tasks));
}

describe('execute(): pre-dispatch short-circuit for an already-satisfied task (FTR-032 UC-03)', () => {
  let tmpDir;
  let repoDir;
  let featureDir;
  let executionRoot;
  let verifyIdentitySpy;
  let originalPlatform;

  beforeEach(() => {
    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skip-already-satisfied-test-'));
    repoDir = path.join(tmpDir, 'repo');
    featureDir = path.join(tmpDir, 'FTR-906-short-circuit-test');
    fs.mkdirSync(repoDir);

    initRepo(repoDir);
    writeFile(repoDir, 'base.txt', 'base\n');
    commitAll(repoDir, 'init');

    const commonDirOut = gitCmd(repoDir, ['rev-parse', '--git-common-dir']).trim();
    executionRoot = path.join(path.resolve(repoDir, commonDirOut), 'ai-toolkit', 'execution');

    verifyIdentitySpy = jest.spyOn(claudeProcess, 'verifyAgentIdentity').mockReturnValue(VERIFIED_IDENTITY);
  });

  afterEach(() => {
    verifyIdentitySpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

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
      implementationSpawnArgs: [FIXTURE, '--mode=fail-if-invoked'],
      reviewSpawnArgs: [FIXTURE, '--mode=fail-if-invoked'],
    });

    expect(result.runStatus).toBe('completed');
    expect(result.tasks).toEqual([{ taskId: task.id, status: 'skipped' }]);
    const state = store.readState(executionRoot, result.runId);
    expect(state.tasks[task.id].reason).toBe('already-satisfied-pre-dispatch');
    expect(state.tasks[task.id].attempts).toHaveLength(0);
  });

  test('a task whose verification fails before dispatch proceeds to a normal dispatch (AC-07)', async () => {
    const task = {
      id: 'US-01-TASK-BE-NOT-DONE-01', title: 'Not-done task',
      outcome: 'The file does not exist yet', domain: 'BE', agentType: 'developer-backend',
      dependsOn: [], verificationCommands: ['test -f US-01-TASK-BE-NOT-DONE-01.output.txt'],
    };
    writeWorkBreakdownFixture(featureDir, 'FTR-906', [task]);

    const result = await execute({
      project: repoDir, feature: path.join(featureDir, 'feature.md'), claudePath: NODE,
      taskTimeoutMs: 15000, agentBudgetUsd: 5,
      implementationSpawnArgs: [FIXTURE, '--mode=write-file-and-succeed'],
      reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
    });
    expect(result.tasks).toEqual([{ taskId: task.id, status: 'checkpointed' }]);
  });

  test('a task with zero verification commands is never short-circuited (AC-08)', async () => {
    // A zero-verification-commands task can never actually occur via the real pipeline
    // (wb-validate.js's own check 16 requires at least one command before Gate 2 approval), so
    // this is a defensive-only scenario for the short-circuit guard itself: with no commands,
    // trivially passing verification means the EXISTING post-hoc "changedPaths is empty" skip
    // path fires instead (echo-json writes nothing) — out of scope here to touch that path's own
    // behavior. What this test proves is narrower and sufficient for AC-08: the short-circuit's
    // own `task.verificationCommands.length > 0` guard means dispatch genuinely happens (a real
    // attempt is recorded), rather than the task being skipped pre-dispatch with zero attempts.
    const task = {
      id: 'US-01-TASK-BE-NO-VERIF-01', title: 'No-verification task',
      outcome: 'This task declares no verification commands at all', domain: 'BE', agentType: 'developer-backend',
      dependsOn: [], verificationCommands: [],
    };
    writeWorkBreakdownFixture(featureDir, 'FTR-906', [task]);

    const result = await execute({
      project: repoDir, feature: path.join(featureDir, 'feature.md'), claudePath: NODE,
      taskTimeoutMs: 15000, agentBudgetUsd: 5,
      implementationSpawnArgs: [FIXTURE, '--mode=echo-json'],
      reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
    });
    expect(result.tasks).toEqual([{ taskId: task.id, status: 'skipped' }]);
    const state = store.readState(executionRoot, result.runId);
    expect(state.tasks[task.id].attempts).toHaveLength(1); // a real dispatch happened — not the zero-attempt pre-dispatch short-circuit
  });

  test('a task\'s retry (second attempt) is never short-circuited, even if it would otherwise match (AC-09)', async () => {
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
    expect(state.tasks[task.id].attempts).toHaveLength(2);
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
    expect(result.tasks.find((t) => t.taskId === alreadyDone.id).status).toBe('skipped');
    expect(result.tasks.find((t) => t.taskId === notDone.id).status).toBe('checkpointed');
    const state = store.readState(executionRoot, result.runId);
    expect(state.tasks[alreadyDone.id].attempts).toHaveLength(0);
    expect(state.tasks[notDone.id].attempts).toHaveLength(1);
  });
});
