'use strict';

// Regression test for the "Bug 4" checkpoint crash found on a real downstream
// run: a task whose verification AND review both genuinely pass, but whose
// deliverable was already committed before this attempt (a prior manual
// commit, an earlier attempt, or a prerequisite task) — so this attempt's own
// git.detectChangedPaths() legitimately returns []. git.stageTaskFiles()
// deliberately refuses an empty changedPaths array ("must be a non-empty
// array — explicit enumeration, never a wildcard"), and before this fix
// nothing in _runTaskToResolution guarded against calling it with one —
// STAGING_VALIDATION_ERROR propagated all the way out of execute() uncaught,
// aborting the ENTIRE run instead of completing one task cleanly.
//
// SAFETY: mirrors tests/task-executor/sequential.test.js's exact discipline —
// every git command runs against a repository created fresh, per test, under
// fs.mkdtempSync(os.tmpdir()), with a LOCAL (repo-scoped only)
// user.name/user.email. No real claude.exe/LLM call: implementation dispatch
// uses fake-claude-cli.js's 'echo-json' mode (writes nothing to disk — the
// point of this test is that it must NOT need to write anything), review
// dispatch uses its 'review-verdict-pass' mode (fixed PASS, independent of
// diff content). Every tmp repo is removed in afterEach.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const claudeProcess = require('../../lib/task-executor/claude-process');
const store = require('../../lib/task-executor/store');
const { execute } = require('../../lib/task-executor/index');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-claude-cli.js');
const NODE = process.execPath;

jest.setTimeout(30000);

const VERIFIED_IDENTITY = {
  agentId: 'gaia.agent.developer.backend',
  nativeName: 'gaia-developer-backend',
  sha256: 'sha256:' + 'd'.repeat(64),
  path: '/fake/path/gaia-developer-backend.md',
  manifestPath: '/fake/path/.ai-toolkit-manifest.json',
  toolkitVersion: '0.13.0',
  scope: 'project',
};

function gitCmd(dir, args) {
  const res = spawnSync('git', args, { cwd: dir, shell: false, encoding: 'utf8', windowsHide: true });
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
  const fence = '```';
  return fence + '\n' + cmd + '\n' + fence;
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
  L.push('- **Dependencies:** —');
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
  task.verificationCommands.forEach(function (cmd) {
    L.push(fencedCommandBlock(cmd));
    L.push('');
  });
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
    L.push(['PHASE-1', 'Checkpoint no-op test phase', 'feat: checkpoint no-op test', '', task.id, task.title, task.domain, task.agentType].join('|'));
  });
  return L.join('\n') + '\n';
}

function writeWorkBreakdownFixture(featureDir, prefix, tasks) {
  fs.mkdirSync(featureDir, { recursive: true });
  writeFile(featureDir, 'feature.md', '# Checkpoint No-op Test Feature\n\nFixture feature for checkpoint-noop.test.js.\n');
  writeFile(featureDir, prefix + '-Work-Breakdown.md', buildMarkdown(prefix, tasks));
  writeFile(featureDir, prefix + '-Work-Breakdown.csv', buildCsv(tasks));
}

describe('checkpoint: no-op completion when changedPaths is empty', () => {
  let tmpDir;
  let repoDir;
  let featureDir;
  let verifyIdentitySpy;
  let originalPlatform;

  beforeEach(() => {
    // execute()'s literal first statement refuses to run on non-win32 —
    // mirrors sequential.test.js's own override so this logic runs on any
    // host OS; no real process-liveness assertion in this file depends on it.
    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-noop-test-'));
    repoDir = path.join(tmpDir, 'repo');
    featureDir = path.join(tmpDir, 'FTR-780-checkpoint-noop-test');
    fs.mkdirSync(repoDir);

    initRepo(repoDir);
    writeFile(repoDir, 'base.txt', 'base\n');
    // The task's own deliverable, committed BEFORE execute() ever runs —
    // reproduces "already satisfied by a prior manual commit / earlier
    // attempt / prerequisite task" exactly as found on the real run.
    writeFile(repoDir, 'already-done.txt', 'pre-existing deliverable\n');
    commitAll(repoDir, 'init (deliverable already present)');

    verifyIdentitySpy = jest.spyOn(claudeProcess, 'verifyAgentIdentity').mockReturnValue(VERIFIED_IDENTITY);
  });

  afterEach(() => {
    verifyIdentitySpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  test('completes the run and marks the task "skipped" instead of crashing with STAGING_VALIDATION_ERROR', async () => {
    const TASK_ID = 'US-99-TASK-NOOP-01';
    const tasks = [{
      id: TASK_ID, title: 'Already-satisfied task', outcome: 'Deliverable already present',
      domain: 'BE', agentType: 'developer-backend', dependsOn: [],
      verificationCommands: ['test -f already-done.txt'],
    }];
    writeWorkBreakdownFixture(featureDir, 'FTR-780', tasks);

    const result = await execute({
      project: repoDir,
      feature: path.join(featureDir, 'feature.md'),
      claudePath: NODE,
      taskTimeoutMs: 15000,
      agentBudgetUsd: 5,
      // echo-json writes nothing to disk — the implementing agent makes zero
      // real file changes, exactly like a real agent finding nothing left to
      // do. review-verdict-pass is a fixed PASS, independent of the (empty)
      // diff content — both are the point of this test, not incidental.
      implementationSpawnArgs: [FIXTURE, '--mode=echo-json'],
      reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
    });

    expect(result.runStatus).toBe('completed');
    expect(result.tasks).toContainEqual({ taskId: TASK_ID, status: 'skipped' });

    // No new commit was created — the deliverable's original commit is still
    // the branch tip (a genuine no-op leaves nothing new to integrate).
    const commonDirOut = gitCmd(repoDir, ['rev-parse', '--git-common-dir']).trim();
    const executionRoot = path.join(path.resolve(repoDir, commonDirOut), 'ai-toolkit', 'execution');
    const state = store.readState(executionRoot, result.runId);
    expect(state.tasks[TASK_ID].attempts[0].originalSha).toBeNull();
    expect(state.tasks[TASK_ID].attempts[0].integratedSha).toBeNull();
  });
});
