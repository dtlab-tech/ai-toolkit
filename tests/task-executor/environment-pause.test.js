'use strict';

// An environment error (the Claude executable vanished) pauses the run and never consumes a task attempt.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const claudeProcess = require('../../lib/task-executor/claude-process');
const store = require('../../lib/task-executor/store');
const { execute } = require('../../lib/task-executor/index')
const claudeLocator = require('../../lib/task-executor/claude-locator');

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


describe('environment errors pause the run and never consume a task attempt', () => {
  let tmpDir, repoDir, featureDir, verifyIdentitySpy, originalPlatform;
  const TASK_ID = 'US-99-TASK-ENV-01';
  const TASKS = [{
    id: TASK_ID, title: 'Env task', outcome: 'Writes a file', domain: 'BE', agentType: 'developer-backend',
    dependsOn: [], verificationCommands: ['test -f never-created.txt'],
  }];

  beforeEach(() => {
    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-pause-test-'));
    repoDir = path.join(tmpDir, 'repo');
    featureDir = path.join(tmpDir, 'FTR-781-env-pause-test');
    fs.mkdirSync(repoDir);
    initRepo(repoDir);
    writeFile(repoDir, 'base.txt', 'base\n');
    commitAll(repoDir, 'init');
    writeWorkBreakdownFixture(featureDir, 'FTR-781', TASKS);
    verifyIdentitySpy = jest.spyOn(claudeProcess, 'verifyAgentIdentity').mockReturnValue(VERIFIED_IDENTITY);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  function stateOf(result) {
    const commonDirOut = gitCmd(repoDir, ['rev-parse', '--git-common-dir']).trim();
    const executionRoot = path.join(path.resolve(repoDir, commonDirOut), 'ai-toolkit', 'execution');
    return store.readState(executionRoot, result.runId);
  }

  const baseArgs = () => ({
    project: repoDir, feature: path.join(featureDir, 'feature.md'),
    taskTimeoutMs: 15000, agentBudgetUsd: 5,
    implementationSpawnArgs: [FIXTURE, '--mode=echo-json'], reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
  });

  test('a configured path that is gone and cannot be re-resolved pauses the run before any attempt', async () => {
    jest.spyOn(claudeLocator, 'ensureClaudePath').mockReturnValue({ path: null, rediscovered: false, candidates: ['C:\\a\\claude.exe', 'C:\\b\\claude.exe'] });
    const result = await execute(Object.assign(baseArgs(), { claudePath: 'C:\\gone\\claude.exe' }));
    expect(result.runStatus).toBe('paused');
    expect(result.pauseReason.code).toBe('CLAUDE_EXECUTABLE_NOT_FOUND');
    expect(result.pauseReason.candidates).toHaveLength(2);
    const state = stateOf(result);
    expect(state.tasks[TASK_ID].status).toBe('pending');
    expect(state.tasks[TASK_ID].attempts).toHaveLength(0);
    expect(state.config.pauseReason.code).toBe('CLAUDE_EXECUTABLE_NOT_FOUND');
  });

  test('a path that is gone but re-resolves to one working executable is replaced and the run goes on', async () => {
    jest.spyOn(claudeLocator, 'ensureClaudePath').mockReturnValue({ path: NODE, rediscovered: true, candidates: [NODE] });
    const result = await execute(Object.assign(baseArgs(), { claudePath: 'C:\\gone\\claude.exe' }));
    expect(result.runStatus).not.toBe('paused');
    expect(stateOf(result).config.claudePath).toBe(NODE);
  });

  test('CLAUDE_EXECUTABLE_NOT_FOUND at dispatch time pauses the run and the attempt does not count', async () => {
    const err = new Error('executable not found');
    err.code = 'CLAUDE_EXECUTABLE_NOT_FOUND';
    jest.spyOn(claudeProcess, 'spawnClaudeAgent').mockRejectedValue(err);
    const result = await execute(Object.assign(baseArgs(), { claudePath: NODE }));
    expect(result.runStatus).toBe('paused');
    const task = stateOf(result).tasks[TASK_ID];
    expect(task.status).toBe('pending');
    expect(task.attempts).toHaveLength(1);
    expect(task.attempts[0].terminalReason).toBe('environment-error:CLAUDE_EXECUTABLE_NOT_FOUND');
  });

  test('two environment errors do not block the task (the retry policy ignores them)', async () => {
    const err = new Error('executable not found');
    err.code = 'CLAUDE_EXECUTABLE_NOT_FOUND';
    jest.spyOn(claudeProcess, 'spawnClaudeAgent').mockRejectedValue(err);
    // execute() starts a new run each time; the policy is exercised through the exported helper instead.
    const { _isBeyondRetryPolicy } = require('../../lib/task-executor/index');
    const result = await execute(Object.assign(baseArgs(), { claudePath: NODE }));
    let state = stateOf(result);
    state = state.addAttempt(TASK_ID, { stage: 'failed', terminalReason: 'environment-error:CLAUDE_EXECUTABLE_NOT_FOUND' });
    expect(_isBeyondRetryPolicy(state, TASK_ID)).toBe(false);
    state = state.addAttempt(TASK_ID, { stage: 'failed', terminalReason: 'dispatch-error:CLAUDE_SPAWN_FAILED' });
    state = state.addAttempt(TASK_ID, { stage: 'failed', terminalReason: 'verification-failed' });
    expect(_isBeyondRetryPolicy(state, TASK_ID)).toBe(true);
  });
});
