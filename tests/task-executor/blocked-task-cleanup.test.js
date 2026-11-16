'use strict';

// A task that ends 'blocked' must not leave its uncommitted work in the shared worktree: the next task
// would take it for pre-existing dirt and lose its own changes to the same files.
// Real git repositories under os.tmpdir(), a fake Claude CLI, no real agent.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const claudeProcess = require('../../lib/task-executor/claude-process');
const store = require('../../lib/task-executor/store');
const git = require('../../lib/task-executor/git');
const { execute } = require('../../lib/task-executor/index');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-claude-cli.js');
const NODE = process.execPath;
jest.setTimeout(60000);

const VERIFIED_IDENTITY = {
  agentId: 'gaia.agent.developer.backend', nativeName: 'gaia-developer-backend',
  sha256: 'sha256:' + 'd'.repeat(64), path: '/fake/gaia-developer-backend.md',
  manifestPath: '/fake/.ai-toolkit-manifest.json', toolkitVersion: '0.13.0', scope: 'project',
};

function gitCmd(dir, args) {
  const res = spawnSync('git', args, { cwd: dir, shell: false, encoding: 'utf8', windowsHide: true });
  if (res.status !== 0) throw new Error('git ' + args.join(' ') + ' failed: ' + (res.stderr || res.error));
  return res.stdout;
}
function initRepo(dir) {
  gitCmd(dir, ['init', '-q']);
  gitCmd(dir, ['config', 'user.name', 'AI Toolkit Test']);
  gitCmd(dir, ['config', 'user.email', 'ai-toolkit-test@example.invalid']);
  gitCmd(dir, ['config', 'core.autocrlf', 'false']);
}
function writeFile(dir, rel, content) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}
function commitAll(dir, message) {
  gitCmd(dir, ['add', '-A']);
  gitCmd(dir, ['commit', '-q', '-m', message]);
}

describe('git.preserveAndDiscardTaskWork', () => {
  let tmp;
  let repo;
  let saveDir;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blocked-cleanup-git-'));
    repo = path.join(tmp, 'repo');
    saveDir = path.join(tmp, 'saved');
    fs.mkdirSync(repo);
    initRepo(repo);
    writeFile(repo, 'tracked.txt', 'one\n');
    writeFile(repo, 'doc.md', 'plan\n');
    writeFile(repo, 'gone.txt', 'will be deleted\n');
    commitAll(repo, 'init');
  });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('saves and restores a modified, a deleted, an untracked and a staged-new path', () => {
    const baseline = git.detectChangedPaths(repo);
    writeFile(repo, 'tracked.txt', 'two\n');
    fs.rmSync(path.join(repo, 'gone.txt'));
    writeFile(repo, 'new-untracked.txt', 'u\n');
    writeFile(repo, 'new-staged.txt', 's\n');
    gitCmd(repo, ['add', 'new-staged.txt']);

    const res = git.preserveAndDiscardTaskWork(repo, baseline, saveDir);

    expect(res.saved).toBe(true);
    expect(res.discarded.sort()).toEqual(['gone.txt', 'new-staged.txt', 'new-untracked.txt', 'tracked.txt']);
    expect(git.detectChangedPaths(repo)).toEqual([]);
    expect(fs.readFileSync(path.join(repo, 'tracked.txt'), 'utf8')).toBe('one\n');
    expect(fs.existsSync(path.join(repo, 'gone.txt'))).toBe(true);
    expect(fs.existsSync(path.join(repo, 'new-untracked.txt'))).toBe(false);
    expect(fs.existsSync(path.join(repo, 'new-staged.txt'))).toBe(false);
    // everything was saved first
    expect(fs.readFileSync(path.join(saveDir, 'blocked-task.patch'), 'utf8')).toContain('+two');
    expect(fs.readFileSync(path.join(saveDir, 'new-files', 'new-untracked.txt'), 'utf8')).toBe('u\n');
    expect(fs.readFileSync(path.join(saveDir, 'new-files', 'new-staged.txt'), 'utf8')).toBe('s\n');
  });

  test('a path that was already dirty before the task started is left alone and reported as kept', () => {
    writeFile(repo, 'doc.md', 'plan, edited before the task\n');
    const baseline = git.detectChangedPaths(repo);
    writeFile(repo, 'doc.md', 'plan, edited before the task and by the task\n');
    writeFile(repo, 'tracked.txt', 'two\n');

    const res = git.preserveAndDiscardTaskWork(repo, baseline, saveDir);

    expect(res.discarded).toEqual(['tracked.txt']);
    expect(res.kept).toEqual(['doc.md']);
    expect(fs.readFileSync(path.join(repo, 'doc.md'), 'utf8')).toBe('plan, edited before the task and by the task\n');
  });

  test('nothing to discard writes nothing', () => {
    const res = git.preserveAndDiscardTaskWork(repo, git.detectChangedPaths(repo), saveDir);
    expect(res).toEqual({ saved: false, saveDir: null, discarded: [], kept: [] });
    expect(fs.existsSync(saveDir)).toBe(false);
  });
});

describe('a blocked task leaves the worktree as it found it', () => {
  let tmp;
  let repo;
  let featureDir;
  let originalPlatform;

  beforeEach(() => {
    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blocked-cleanup-run-'));
    repo = path.join(tmp, 'repo');
    featureDir = path.join(tmp, 'FTR-782-blocked-cleanup');
    fs.mkdirSync(repo);
    initRepo(repo);
    writeFile(repo, 'base.txt', 'base\n');
    commitAll(repo, 'init');
    jest.spyOn(claudeProcess, 'verifyAgentIdentity').mockReturnValue(VERIFIED_IDENTITY);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  const anchor = (id) => 'task-' + id.replace(/[^A-Za-z0-9_-]/g, '-');
  function writeWb(prefix, tasks) {
    fs.mkdirSync(featureDir, { recursive: true });
    writeFile(featureDir, 'feature.md', '# Blocked cleanup\n');
    const md = ['# Work Breakdown — ' + prefix, '', '## Summary', '| Metric | Value |', '|--------|-------|',
      '| Total tasks | ' + tasks.length + ' |', '', '## Task Details', ''];
    tasks.forEach((t) => {
      md.push('<a id="' + anchor(t.id) + '"></a>', '### ' + t.id, '', '- **Task ID:** ' + t.id, '- **Title:** ' + t.title,
        '- **Outcome:** ' + t.outcome, '- **Domain:** BE', '- **Agent type:** developer-backend',
        '- **Dependencies:** —', '- **Acceptance criteria:** —', '- **Estimate — agent minutes:** —',
        '- **Estimate — tokens:** —', '- **Output count:** —', '- **Grouping rationale:** —',
        '- **Commit type:** —', '- **Commit scope:** —', '- **Commit subject:** —', '',
        '**Verification commands:**', '', '```', t.verify, '```', '');
    });
    md.push('## Statistics', '');
    writeFile(featureDir, prefix + '-Work-Breakdown.md', md.join('\n'));
    const csv = ['phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type'];
    tasks.forEach((t) => csv.push(['PHASE-1', 'Cleanup phase', 'feat: cleanup', '', t.id, t.title, 'BE', 'developer-backend'].join('|')));
    writeFile(featureDir, prefix + '-Work-Breakdown.csv', csv.join('\n') + '\n');
  }

  test('the blocked task\'s file is saved and removed, and the next independent task commits its own work', async () => {
    const T1 = 'US-01-TASK-BE-BLOCKED';
    const T2 = 'US-01-TASK-BE-NEXT';
    writeWb('FTR-782', [
      // the agent writes T1.output.txt, but this verification can never pass: the task ends blocked
      { id: T1, title: 'Blocked task', outcome: 'never verified', verify: 'test -f ' + T1 + '.output.txt && test -f never-created.txt' },
      { id: T2, title: 'Next task', outcome: 'writes its file', verify: 'test -f ' + T2 + '.output.txt' },
    ]);

    const result = await execute({
      project: repo, feature: path.join(featureDir, 'feature.md'), claudePath: NODE,
      taskTimeoutMs: 15000, agentBudgetUsd: 5,
      implementationSpawnArgs: [FIXTURE, '--mode=write-file-and-succeed'],
      reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
    });

    const byId = Object.fromEntries(result.tasks.map((t) => [t.taskId, t.status]));
    expect(byId[T1]).toBe('blocked');
    expect(byId[T2]).toBe('checkpointed');

    // the blocked task's work is gone from the worktree...
    expect(fs.existsSync(path.join(repo, T1 + '.output.txt'))).toBe(false);
    expect(git.detectChangedPaths(repo)).toEqual([]);
    // ...and T2's commit holds T2's file and nothing of T1
    const lastFiles = gitCmd(repo, ['show', '--name-only', '--pretty=format:', 'HEAD']).trim().split('\n');
    expect(lastFiles).toEqual([T2 + '.output.txt']);

    // ...but it was saved, and the task says where
    const commonDir = path.resolve(repo, gitCmd(repo, ['rev-parse', '--git-common-dir']).trim());
    const executionRoot = path.join(commonDir, 'ai-toolkit', 'execution');
    const task = store.readState(executionRoot, result.runId).tasks[T1];
    expect(task.blockedWork.saved).toBe(true);
    expect(task.blockedWork.discarded).toContain(T1 + '.output.txt');
    expect(fs.existsSync(path.join(task.blockedWork.saveDir, 'new-files', T1 + '.output.txt'))).toBe(true);
  });
});
