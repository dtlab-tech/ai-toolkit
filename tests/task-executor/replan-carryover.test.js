'use strict';

// Integration test for execute()'s args.fromReplanRunId (the "other half" of
// replan(): replan() already computed and durably recorded which old tasks'
// completions are eligible to carry forward, but nothing ever consumed that
// record — a successor execute() always started every task at 'pending',
// discarding the decision replan() had just recorded. This proves the real,
// end-to-end flow: a real run completes a task for real (real commit on the
// branch), replan() supersedes it with a carry-over mapping, and a SECOND
// real execute() call, given --from-replan-run-id, seeds the mapped task
// straight to 'checkpointed' — confirmed by asserting the implementation
// agent is never spawned for it and no new commit is created.
//
// SAFETY: mirrors tests/task-executor/sequential.test.js's and
// tests/lib/replan.test.js's exact discipline — every git command runs
// against a repository created fresh, per test, under
// fs.mkdtempSync(os.tmpdir()), with a LOCAL (repo-scoped only)
// user.name/user.email. No real claude.exe/LLM call: every dispatch uses
// tests/fixtures/fake-claude-cli.js via process.execPath. Every tmp repo is
// removed in afterEach.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const claudeProcess = require('../../lib/task-executor/claude-process');
const store = require('../../lib/task-executor/store');
const { execute, replan } = require('../../lib/task-executor/index');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-claude-cli.js');
const NODE = process.execPath;

// Real process-liveness confirmation (replan()'s own "no live workers" gate,
// via _findLiveTaggedProcess) is only qualified on Windows (E-02 evidence
// spike) — mirrors tests/lib/replan.test.js's and stop.test.js's own
// itWindowsOnly gating exactly. The beforeEach process.platform override
// below only fools execute()'s own top-level PLATFORM_NOT_QUALIFIED guard —
// evaluated here at MODULE LOAD TIME, before that runtime override ever
// applies — it does nothing for the real OS-level liveness query replan()
// performs on a genuinely non-Windows CI runner, which returns 'unknown'
// (never 'confirmed-not-found') there regardless, and replan() correctly
// refuses to supersede on an unconfirmed liveness result.
const IS_WINDOWS = process.platform === 'win32';
const itWindowsOnly = IS_WINDOWS ? test : test.skip;

jest.setTimeout(30000);

const VERIFIED_IDENTITY = {
  agentId: 'gaia.agent.developer.backend',
  nativeName: 'gaia-developer-backend',
  sha256: 'sha256:' + 'e'.repeat(64),
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
    L.push('```'); L.push(cmd); L.push('```'); L.push('');
  });
  return L.join('\n');
}

function buildMarkdown(prefix, tasks) {
  const L = ['# Work Breakdown — ' + prefix, '', '## Summary', '| Metric | Value |', '|--------|-------|', '| Total tasks | ' + tasks.length + ' |', '', '## Task Details', ''];
  tasks.forEach(function (t) { L.push(renderTaskDetail(t)); });
  L.push('## Statistics', '');
  return L.join('\n');
}

function buildCsv(tasks) {
  const L = ['phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type'];
  tasks.forEach(function (t) {
    L.push(['PHASE-1', 'Replan carryover test phase', 'feat: replan carryover test', '', t.id, t.title, t.domain, t.agentType].join('|'));
  });
  return L.join('\n') + '\n';
}

function writeWorkBreakdownFixture(featureDir, prefix, tasks, opts) {
  const options = opts || {};
  fs.mkdirSync(featureDir, { recursive: true });
  writeFile(featureDir, 'feature.md', '# Replan Carryover Test Feature\n\nFixture feature for replan-carryover.test.js.\n');
  writeFile(featureDir, prefix + '-Work-Breakdown.md', buildMarkdown(prefix, tasks));
  writeFile(featureDir, prefix + '-Work-Breakdown.csv', buildCsv(tasks));
  if (options.gate2Approved) {
    writeFile(
      featureDir,
      prefix + '-Approvals.md',
      '# Approval Record — ' + prefix + '\n\n' +
        '## Gate 1 — Document Approvals\n\n| Document | Status |\n|---|---|\n\n' +
        '## Gate 2 — Work Breakdown Approval\n\n| Document | Status |\n|---|---|\n' +
        '| ' + prefix + '-Work-Breakdown.md | ✅ Approved |\n'
    );
  }
}

describe('execute() args.fromReplanRunId (carry-over from a prior replan())', () => {
  let tmpDir;
  let repoDir;
  let originalFeatureDir;
  let successorFeatureDir;
  let executionRoot;
  let featureRef;
  let verifyIdentitySpy;
  let originalPlatform;

  const OLD_TASK = 'US-99-TASK-OLD-01';
  const NEW_TASK = 'US-99-TASK-NEW-01';

  beforeEach(() => {
    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replan-carryover-test-'));
    repoDir = path.join(tmpDir, 'repo');
    originalFeatureDir = path.join(tmpDir, 'FTR-782-replan-carryover-test');
    successorFeatureDir = path.join(tmpDir, 'FTR-783-replan-carryover-successor');
    fs.mkdirSync(repoDir);

    initRepo(repoDir);
    writeFile(repoDir, 'base.txt', 'base\n');
    commitAll(repoDir, 'init');

    const branchName = gitCmd(repoDir, ['symbolic-ref', '--short', 'HEAD']).trim();
    featureRef = 'refs/heads/' + branchName;
    const commonDirOut = gitCmd(repoDir, ['rev-parse', '--git-common-dir']).trim();
    executionRoot = path.join(path.resolve(repoDir, commonDirOut), 'ai-toolkit', 'execution');

    verifyIdentitySpy = jest.spyOn(claudeProcess, 'verifyAgentIdentity').mockReturnValue(VERIFIED_IDENTITY);
  });

  afterEach(() => {
    verifyIdentitySpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  itWindowsOnly('a carried-over task is seeded "checkpointed" without a new dispatch or commit', async () => {
    // 1. Real original run: one task, really implemented, verified, reviewed
    // and checkpointed — a real commit lands on featureRef.
    writeWorkBreakdownFixture(originalFeatureDir, 'FTR-782', [{
      id: OLD_TASK, title: 'Original task', outcome: 'Does the original thing',
      domain: 'BE', agentType: 'developer-backend',
      verificationCommands: ['test -f ' + OLD_TASK + '.output.txt'],
    }]);

    const originalResult = await execute({
      project: repoDir,
      feature: path.join(originalFeatureDir, 'feature.md'),
      claudePath: NODE,
      taskTimeoutMs: 15000,
      agentBudgetUsd: 5,
      implementationSpawnArgs: [FIXTURE, '--mode=write-file-and-succeed'],
      reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
    });

    expect(originalResult.runStatus).toBe('completed');
    expect(originalResult.tasks).toContainEqual({ taskId: OLD_TASK, status: 'checkpointed' });

    const commitCountBefore = gitCmd(repoDir, ['rev-list', '--count', 'HEAD']).trim();

    // 2. Successor plan: the same deliverable, now under a renamed task ID,
    // with Gate 2 approved. replan() supersedes the original run and records
    // eligibility — never touches or starts the successor run itself.
    writeWorkBreakdownFixture(successorFeatureDir, 'FTR-783', [{
      id: NEW_TASK, title: 'Renamed successor task', outcome: 'Same deliverable, new ID',
      domain: 'BE', agentType: 'developer-backend',
      verificationCommands: ['test -f ' + OLD_TASK + '.output.txt'],
    }], { gate2Approved: true });

    const replanResult = await replan({
      executionRoot: executionRoot,
      runId: originalResult.runId,
      projectDir: repoDir,
      taskRef: featureRef,
      feature: path.join(successorFeatureDir, 'feature.md'),
      taskMapping: [{ oldTaskId: OLD_TASK, newTaskId: NEW_TASK }],
    });

    expect(replanResult.taskMapping).toContainEqual({ oldTaskId: OLD_TASK, newTaskId: NEW_TASK, carriesCompletion: true });

    const originalState = store.readState(executionRoot, originalResult.runId);
    expect(originalState.runStatus).toBe('superseded');

    // 3. Successor execute(), explicitly told to carry forward from the
    // now-superseded original run. The implementation agent must never be
    // spawned for the carried-over task — if it were, this spy would see it.
    const spawnSpy = jest.spyOn(claudeProcess, 'spawnClaudeAgent');

    const successorResult = await execute({
      project: repoDir,
      feature: path.join(successorFeatureDir, 'feature.md'),
      claudePath: NODE,
      taskTimeoutMs: 15000,
      agentBudgetUsd: 5,
      fromReplanRunId: originalResult.runId,
      // Deliberately a failing/unused mode: if this were ever actually
      // dispatched for the carried-over task, verification would fail and
      // the run would NOT complete — making a wrongly-triggered dispatch
      // impossible to miss.
      implementationSpawnArgs: [FIXTURE, '--mode=fail'],
      reviewSpawnArgs: [FIXTURE, '--mode=fail'],
    });

    expect(spawnSpy).not.toHaveBeenCalled();
    expect(successorResult.runStatus).toBe('completed');
    expect(successorResult.tasks).toContainEqual({ taskId: NEW_TASK, status: 'checkpointed' });

    const successorState = store.readState(executionRoot, successorResult.runId);
    const carriedAttempt = successorState.tasks[NEW_TASK].attempts[0];
    expect(carriedAttempt.originalSha).toBe(originalState.tasks[OLD_TASK].attempts[0].originalSha);
    expect(carriedAttempt.terminalReason).toBe(
      'carried-over-from-replan:' + originalResult.runId + ':' + OLD_TASK + '#1'
    );

    // No new commit was created for the carried-over task.
    const commitCountAfter = gitCmd(repoDir, ['rev-list', '--count', 'HEAD']).trim();
    expect(commitCountAfter).toBe(commitCountBefore);

    spawnSpy.mockRestore();
  });

  describe('input validation', () => {
    test('throws REPLAN_SOURCE_NOT_SUPERSEDED when the referenced run is not superseded', async () => {
      writeWorkBreakdownFixture(originalFeatureDir, 'FTR-782', [{
        id: OLD_TASK, title: 'Original task', outcome: 'x', domain: 'BE', agentType: 'developer-backend',
        verificationCommands: ['test -f ' + OLD_TASK + '.output.txt'],
      }]);
      const originalResult = await execute({
        project: repoDir,
        feature: path.join(originalFeatureDir, 'feature.md'),
        claudePath: NODE,
        taskTimeoutMs: 15000,
        agentBudgetUsd: 5,
        implementationSpawnArgs: [FIXTURE, '--mode=write-file-and-succeed'],
        reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
      });
      // Never replanned — still runStatus 'completed', not 'superseded'.

      writeWorkBreakdownFixture(successorFeatureDir, 'FTR-783', [{
        id: NEW_TASK, title: 'x', outcome: 'x', domain: 'BE', agentType: 'developer-backend',
        verificationCommands: ['test -f irrelevant.txt'],
      }], { gate2Approved: true });

      await expect(execute({
        project: repoDir,
        feature: path.join(successorFeatureDir, 'feature.md'),
        claudePath: NODE,
        taskTimeoutMs: 15000,
        agentBudgetUsd: 5,
        fromReplanRunId: originalResult.runId,
        implementationSpawnArgs: [FIXTURE, '--mode=fail'],
        reviewSpawnArgs: [FIXTURE, '--mode=fail'],
      })).rejects.toMatchObject({ code: 'REPLAN_SOURCE_NOT_SUPERSEDED' });
    });
  });
});
