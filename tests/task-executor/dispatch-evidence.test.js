'use strict';

// Regression/feature test for FTR-032 (UC-02): lib/task-executor/index.js's dispatchTaskAttempt
// and runReview used to persist no record of what a dispatch actually did — only the final
// checkpoint/outcome. Reported indirectly via a real cost investigation
// (Fincantieri.ISDM.JobScheduler, FTR-012): without a turn-by-turn record, there was no way to
// root-cause where a task's real wall-clock/token cost went. This proves both dispatch kinds
// (implementation and review) now leave an independently-readable evidence file, reusing the
// existing lib/workflow-worker-evidence.js primitive (pm-phase1/pm-phase2 already use the same
// one), scoped under the run's own executionRoot.
//
// SAFETY: mirrors tests/task-executor/executor.sequential.test.js's exact discipline — no real
// claude.exe/LLM call (tests/fixtures/fake-claude-cli.js via process.execPath only), a fresh repo
// per test under fs.mkdtempSync(os.tmpdir()) with LOCAL-only git config, removed in afterEach.

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

function fencedCommandBlock(cmd) {
  const runs = cmd.match(/`+/g) || [];
  const maxRun = runs.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
  const fence = '`'.repeat(Math.max(3, maxRun + 1));
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
  (task.verificationCommands || []).forEach(function (cmd) {
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
    L.push(['PHASE-1', 'Evidence test phase', 'feat: evidence test', '', task.id, task.title, task.domain, task.agentType].join('|'));
  });
  return L.join('\n') + '\n';
}

function writeWorkBreakdownFixture(featureDir, prefix, tasks) {
  fs.mkdirSync(featureDir, { recursive: true });
  writeFile(featureDir, 'feature.md', '# Dispatch Evidence Test Feature\n\nFixture feature for dispatch-evidence.test.js.\n');
  writeFile(featureDir, prefix + '-Work-Breakdown.md', buildMarkdown(prefix, tasks));
  writeFile(featureDir, prefix + '-Work-Breakdown.csv', buildCsv(tasks));
}

describe('execute(): dispatch evidence capture (FTR-032 UC-02)', () => {
  let tmpDir;
  let repoDir;
  let featureDir;
  let executionRoot;
  let verifyIdentitySpy;
  let originalPlatform;

  beforeEach(() => {
    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-evidence-test-'));
    repoDir = path.join(tmpDir, 'repo');
    featureDir = path.join(tmpDir, 'FTR-905-evidence-test');
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

  test('a real implementation dispatch and a real review dispatch each leave an independently-readable evidence file', async () => {
    const task = {
      id: 'US-01-TASK-BE-EVIDENCE-01', title: 'Evidence test task',
      outcome: 'Evidence files exist for this task\'s dispatches', domain: 'BE', agentType: 'developer-backend',
      verificationCommands: ['test -f US-01-TASK-BE-EVIDENCE-01.output.txt'],
    };
    writeWorkBreakdownFixture(featureDir, 'FTR-905', [task]);

    const result = await execute({
      project: repoDir, feature: path.join(featureDir, 'feature.md'), claudePath: NODE,
      taskTimeoutMs: 15000, agentBudgetUsd: 5,
      implementationSpawnArgs: [FIXTURE, '--mode=write-file-and-succeed'],
      reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
    });

    expect(result.runStatus).toBe('completed');

    const evidenceDir = path.join(executionRoot, 'evidence', result.runId);
    const files = fs.readdirSync(evidenceDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(2);

    const records = files.map((f) => JSON.parse(fs.readFileSync(path.join(evidenceDir, f), 'utf8')));
    const implRecord = records.find((r) => r.invocation.dispatchKind === 'implementation' && r.invocation.taskId === task.id);
    const reviewRecord = records.find((r) => r.invocation.dispatchKind === 'review' && r.invocation.taskId === task.id);
    expect(implRecord).toBeDefined();
    expect(implRecord.outcome).toBe('done');
    expect(reviewRecord).toBeDefined();
    expect(reviewRecord.outcome).toBe('done');

    // Independently readable: parses cleanly, no dependency on the run's own in-progress state.
    expect(() => JSON.parse(fs.readFileSync(path.join(evidenceDir, files[0]), 'utf8'))).not.toThrow();
  });

  test('a dispatch whose agent reports success but writes nothing real still leaves an evidence file', async () => {
    const task = {
      id: 'US-01-TASK-BE-EVIDENCE-FAIL-01', title: 'Evidence failure test task',
      outcome: 'Evidence captured even when verification later rejects the attempt', domain: 'BE', agentType: 'developer-backend',
      verificationCommands: ['test -f US-01-TASK-BE-EVIDENCE-FAIL-01.output.txt'],
    };
    writeWorkBreakdownFixture(featureDir, 'FTR-905', [task]);

    const result = await execute({
      project: repoDir, feature: path.join(featureDir, 'feature.md'), claudePath: NODE,
      taskTimeoutMs: 15000, agentBudgetUsd: 5,
      implementationSpawnArgs: [FIXTURE, '--mode=echo-json'],
      reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
    });

    expect(result.runStatus).toBe('blocked');

    const evidenceDir = path.join(executionRoot, 'evidence', result.runId);
    const files = fs.readdirSync(evidenceDir).filter((f) => f.endsWith('.json'));
    const records = files.map((f) => JSON.parse(fs.readFileSync(path.join(evidenceDir, f), 'utf8')));
    const implRecords = records.filter((r) => r.invocation.dispatchKind === 'implementation' && r.invocation.taskId === task.id);
    expect(implRecords.length).toBeGreaterThan(0);
    implRecords.forEach((r) => expect(['done', 'failed']).toContain(r.outcome));
  });
});
