'use strict';

// Regression test for a real bug (reported against Fincantieri.ISDM.JobScheduler, FTR-012):
// execute() dispatches directly against the real project directory (maxConcurrency=1), and
// git.detectChangedPaths(cwd) reports EVERY uncommitted path in that directory — not just what
// the current task's own attempt touched. Reported real-world trigger: this feature's own
// planning docs (feature.md/req/spec/wbs), left uncommitted by design after Gate 1/Gate 2 per
// implement-feature/SKILL.md, were still sitting uncommitted when `executor start` ran, and bled
// into EVERY task's review prompt (400KB+ of unrelated docs on a 30-line task's own diff) and
// got silently staged/committed into that task's own commit by stageTaskFiles.
//
// Fix: git.excludePreExistingPaths (see its own doc comment / unit tests in
// tests/lib/git.exclude-pre-existing-paths.test.js) filters out anything that was ALREADY
// uncommitted before the task started. This test proves it end-to-end: a stray uncommitted
// "planning doc" file sits in the repo before execute() ever runs; after a real task completes,
// that file is STILL uncommitted (never staged, never part of the task's commit) while the
// task's own real output file IS committed normally.
//
// SAFETY: mirrors tests/task-executor/executor.sequential.test.js's exact discipline — no real
// claude.exe/LLM call (fake-claude-cli.js fixture only), a fresh repo per test under
// fs.mkdtempSync(os.tmpdir()) with LOCAL-only git config, removed in afterEach.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const claudeProcess = require('../../lib/task-executor/claude-process');
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
    L.push('```');
    L.push(cmd);
    L.push('```');
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
    L.push(['PHASE-1', 'Review-diff test phase', 'feat: review diff test', '', task.id, task.title, task.domain, task.agentType].join('|'));
  });
  return L.join('\n') + '\n';
}

function writeWorkBreakdownFixture(featureDir, prefix, tasks) {
  fs.mkdirSync(featureDir, { recursive: true });
  writeFile(featureDir, 'feature.md', '# Review-Diff Pre-Existing-Dirt Test Feature\n\nFixture feature for review-diff-pre-existing-dirt.test.js.\n');
  writeFile(featureDir, prefix + '-Work-Breakdown.md', buildMarkdown(prefix, tasks));
  writeFile(featureDir, prefix + '-Work-Breakdown.csv', buildCsv(tasks));
}

describe('execute(): pre-existing uncommitted content is excluded from review/staging (not misattributed to a task)', () => {
  let tmpDir;
  let repoDir;
  let featureDir;
  let verifyIdentitySpy;
  let originalPlatform;

  beforeEach(() => {
    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-diff-pre-existing-dirt-test-'));
    repoDir = path.join(tmpDir, 'repo');
    featureDir = path.join(tmpDir, 'FTR-901-dirt-test');
    fs.mkdirSync(repoDir);

    initRepo(repoDir);
    writeFile(repoDir, 'base.txt', 'base\n');
    commitAll(repoDir, 'init');

    verifyIdentitySpy = jest.spyOn(claudeProcess, 'verifyAgentIdentity').mockReturnValue(VERIFIED_IDENTITY);
  });

  afterEach(() => {
    verifyIdentitySpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  test('a stray uncommitted "planning doc" sitting in the repo before the run stays uncommitted after a real task completes', async () => {
    // Simulates the real trigger: this feature's own Requirements/Tech-Spec left
    // uncommitted after Gate 1/Gate 2 approval, still present when `executor start` runs.
    writeFile(repoDir, 'FTR-901-Requirements.md', '# Unrelated planning doc\n\nStill uncommitted when the run starts.\n');

    const task = {
      id: 'US-01-TASK-BE-DIRT-01',
      title: 'Dirt-test task',
      outcome: 'Task completes without touching the unrelated pre-existing doc',
      domain: 'BE',
      agentType: 'developer-backend',
      verificationCommands: ['test -f US-01-TASK-BE-DIRT-01.output.txt'],
    };
    writeWorkBreakdownFixture(featureDir, 'FTR-901', [task]);

    const statusBefore = gitCmd(repoDir, ['status', '--porcelain']).trim();
    expect(statusBefore).toContain('FTR-901-Requirements.md');

    const result = await execute({
      project: repoDir,
      feature: path.join(featureDir, 'feature.md'),
      claudePath: NODE,
      taskTimeoutMs: 15000,
      agentBudgetUsd: 5,
      implementationSpawnArgs: [FIXTURE, '--mode=write-file-and-succeed'],
      reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
    });

    expect(result.runStatus).toBe('completed');
    expect(result.tasks).toEqual([{ taskId: task.id, status: 'checkpointed' }]);

    // The task's own real output file WAS committed.
    expect(fs.existsSync(path.join(repoDir, task.id + '.output.txt'))).toBe(true);
    const trackedFiles = gitCmd(repoDir, ['ls-tree', '-r', '--name-only', 'HEAD']);
    expect(trackedFiles).toContain(task.id + '.output.txt');

    // The unrelated pre-existing doc was NEVER staged/committed — it is
    // exactly as untracked/uncommitted as it was before the run, and the
    // commit history never mentions it.
    expect(trackedFiles).not.toContain('FTR-901-Requirements.md');
    const statusAfter = gitCmd(repoDir, ['status', '--porcelain']).trim();
    expect(statusAfter).toContain('FTR-901-Requirements.md'); // still shows up as dirty, untouched
    const log = gitCmd(repoDir, ['log', '--all', '--name-only', '--format=']);
    expect(log).not.toContain('FTR-901-Requirements.md');
  });
});
