'use strict';

// Tests for lib/task-executor/index.js's replan() command (US-06-TASK-BE-03,
// FTR-018). Completes US-06 "resume from persisted evidence and reconcile
// without re-execution" for the branch-off case: an original run whose plan
// itself must change, requiring a human-approved successor plan (produced
// entirely outside this executor) before the original run can be marked
// superseded.
//
// SAFETY (mirrors tests/lib/resume-reconcile.test.js's and
// tests/lib/evidence-table.test.js's exact discipline): every git command in
// this suite runs with an explicit `cwd` pointing at a repository created
// fresh, per test, under `fs.mkdtempSync(os.tmpdir())`, with a LOCAL
// (repo-scoped only) `user.name`/`user.email`. No git command in this file
// ever targets this project's own working tree
// (c:/ws/Fincantieri.CommonLibraries.AIToolkit). Every tmp repo is removed in
// `afterEach`. This suite ALSO never touches this repo's own
// internal_docs/features/ directories — the "successor feature" fixture used
// to exercise replan()'s Gate 2/plan-file reads is built fresh under the same
// per-test tmpDir, never under internal_docs/.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const store = require('../../lib/task-executor/store');
const { replan, _buildProcessTag } = require('../../lib/task-executor/index');

const IS_WINDOWS = process.platform === 'win32';
const itWindowsOnly = IS_WINDOWS ? test : test.skip;

const RUN_ID = 'run-1';
const NODE_EXE_BASENAME = path.basename(process.execPath); // 'node.exe' on Windows

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

async function killAndWait(pid) {
  if (IS_WINDOWS) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { process.kill(pid, 'SIGKILL'); } catch (_) {}
  }
  for (let i = 0; i < 50 && isAlive(pid); i++) await sleep(100);
}

// A REAL, short-lived, tagged child process — mirrors
// tests/lib/evidence-table.test.js's own spawnTaggedChild exactly: the tag is
// a literal trailing argv element, never a mock of the OS query.
function spawnTaggedChild(tag) {
  return spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 120000);', tag], { stdio: 'ignore' });
}

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

function baseStateFields(overrides) {
  return Object.assign(
    {
      runId: RUN_ID,
      featureId: 'FTR-099',
      repo: '/repo',
      commonDir: '/repo/.git',
      featureRef: 'refs/heads/feature/x',
      baseSha: 'a'.repeat(40),
      planDigest: 'b'.repeat(64),
      contextHashes: {},
      config: { maxConcurrency: 1 },
      runStatus: 'running',
    },
    overrides || {}
  );
}

// ── Successor feature fixture builder ────────────────────────────────────────
//
// Mirrors tests/lib/plan.markdown.test.js's own fixture builder (kept
// deliberately minimal here — only the fields parseMarkdown requires) so the
// successor's Work-Breakdown.md/.csv are byte-faithful to what
// scripts/wb-render.js actually produces, without executing that CLI script
// directly.
function fencedCommandBlock(cmd) {
  return '```\n' + cmd + '\n```';
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
  L.push('_No verification commands._');
  L.push('');
  return L.join('\n');
}

function buildSuccessorMarkdown(prefix, tasks) {
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
  for (const task of tasks) {
    L.push(renderTaskDetail(task));
  }
  L.push('## Statistics');
  L.push('');
  return L.join('\n');
}

function buildSuccessorCsv(tasks) {
  const HEADER = 'phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type';
  const L = [HEADER];
  for (const task of tasks) {
    L.push(['PHASE-1', 'Successor phase', 'feat: successor', '', task.id, task.title, task.domain, task.agentType].join('|'));
  }
  return L.join('\n') + '\n';
}

function writeSuccessorFixture(featureDir, prefix, opts) {
  const options = opts || {};
  const tasks = options.tasks || [
    { id: 'US-01-TASK-BE-01', title: 'Successor task one', outcome: 'Outcome one', domain: 'BE', agentType: 'developer-backend' },
  ];

  fs.mkdirSync(featureDir, { recursive: true });
  writeFile(featureDir, 'feature.md', '# Successor Feature\n\nFixture feature for replan() tests.\n');

  if (options.approvalsContent !== undefined) {
    if (options.approvalsContent !== null) {
      writeFile(featureDir, prefix + '-Approvals.md', options.approvalsContent);
    }
    // null => deliberately do not write an Approvals.md at all.
  } else {
    writeFile(
      featureDir,
      prefix + '-Approvals.md',
      '# Approval Record — ' + prefix + '\n\n' +
        '## Gate 1 — Document Approvals\n\n| Document | Status |\n|---|---|\n\n' +
        '## Gate 2 — Work Breakdown Approval\n\n| Document | Status |\n|---|---|\n' +
        '| ' + prefix + '-Work-Breakdown.md | ✅ Approved |\n'
    );
  }

  if (options.skipPlanFiles !== true) {
    writeFile(featureDir, prefix + '-Work-Breakdown.md', buildSuccessorMarkdown(prefix, tasks));
    writeFile(featureDir, prefix + '-Work-Breakdown.csv', buildSuccessorCsv(tasks));
  }

  return { tasks: tasks };
}

describe('replan (US-06-TASK-BE-03)', () => {
  let tmpDir;
  let executionRoot;
  let repoDir;
  let successorFeatureDir;
  let featureRef;
  let baseSha;
  const SUCCESSOR_PREFIX = 'FTR-777';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replan-test-'));
    executionRoot = path.join(tmpDir, 'execution');
    repoDir = path.join(tmpDir, 'repo');
    successorFeatureDir = path.join(tmpDir, SUCCESSOR_PREFIX + '-successor-slug');
    fs.mkdirSync(repoDir);

    initRepo(repoDir);
    writeFile(repoDir, 'base.txt', 'base\n');
    baseSha = commitAll(repoDir, 'init');

    const branchName = gitCmd(repoDir, ['symbolic-ref', '--short', 'HEAD']).trim();
    featureRef = 'refs/heads/' + branchName;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function baseArgs(overrides) {
    return Object.assign(
      {
        executionRoot: executionRoot,
        runId: RUN_ID,
        projectDir: repoDir,
        taskRef: featureRef,
        feature: path.join(successorFeatureDir, 'feature.md'),
        taskMapping: [],
      },
      overrides || {}
    );
  }

  function seedOriginalRun(taskId, taskOverrides) {
    let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
    if (taskOverrides) {
      state = taskOverrides(state, taskId);
    }
    store.writeState(executionRoot, RUN_ID, state);
    return state;
  }

  describe('input validation', () => {
    test('rejects missing required args', async () => {
      await expect(replan({})).rejects.toThrow();
    });

    test('rejects a non-array taskMapping', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
      seedOriginalRun('US-99-TASK-BE-01');
      await expect(replan(baseArgs({ taskMapping: 'nope' }))).rejects.toThrow();
    });

    test('rejects a taskMapping entry missing oldTaskId/newTaskId', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
      seedOriginalRun('US-99-TASK-BE-01');
      await expect(replan(baseArgs({ taskMapping: [{ oldTaskId: 'x' }] }))).rejects.toThrow();
    });
  });

  describe('successor Gate 2 approval evidence', () => {
    test('fails closed with SUCCESSOR_NOT_APPROVED when Approvals.md is missing entirely', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX, { approvalsContent: null });
      seedOriginalRun('US-99-TASK-BE-01');

      await expect(replan(baseArgs())).rejects.toMatchObject({ code: 'SUCCESSOR_NOT_APPROVED' });
    });

    test('fails closed with SUCCESSOR_NOT_APPROVED when Approvals.md has no "## Gate 2" heading', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX, {
        approvalsContent: '# Approval Record — ' + SUCCESSOR_PREFIX + '\n\n## Gate 1 — Document Approvals\n\nApproved.\n',
      });
      seedOriginalRun('US-99-TASK-BE-01');

      await expect(replan(baseArgs())).rejects.toMatchObject({ code: 'SUCCESSOR_NOT_APPROVED' });

      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.runStatus).toBe('running'); // untouched
    });

    test('proceeds past this gate when "## Gate 2" is present', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
      seedOriginalRun('US-99-TASK-BE-01');

      const result = await replan(baseArgs());
      expect(result.originalRunId).toBe(RUN_ID);
    });
  });

  describe('successor plan snapshot', () => {
    test('fails closed with SUCCESSOR_PLAN_NOT_FOUND when Work-Breakdown.md/.csv are missing', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX, { skipPlanFiles: true });
      seedOriginalRun('US-99-TASK-BE-01');

      await expect(replan(baseArgs())).rejects.toMatchObject({ code: 'SUCCESSOR_PLAN_NOT_FOUND' });
    });

    test('propagates the underlying PLAN_PARSE_ERROR for a malformed successor Work-Breakdown.md', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
      // Corrupt the MD after the fixture wrote a valid one.
      fs.writeFileSync(path.join(successorFeatureDir, SUCCESSOR_PREFIX + '-Work-Breakdown.md'), '# no task details section\n');
      seedOriginalRun('US-99-TASK-BE-01');

      await expect(replan(baseArgs())).rejects.toMatchObject({ code: 'PLAN_PARSE_ERROR' });
    });

    test('returns the successor\'s real planDigest computed from its own MD/CSV bytes', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
      seedOriginalRun('US-99-TASK-BE-01');

      const result = await replan(baseArgs());
      expect(result.successorPlanDigest).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('taskMapping validation (fail closed on either side)', () => {
    test('rejects an unknown oldTaskId not present in the original run', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
      seedOriginalRun('US-99-TASK-BE-01');

      await expect(
        replan(baseArgs({ taskMapping: [{ oldTaskId: 'NOPE', newTaskId: 'US-01-TASK-BE-01' }] }))
      ).rejects.toMatchObject({ code: 'REPLAN_UNKNOWN_TASK_MAPPING' });

      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.runStatus).toBe('running'); // untouched
    });

    test('rejects an unknown newTaskId not present in the successor plan', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
      seedOriginalRun('US-99-TASK-BE-01');

      await expect(
        replan(baseArgs({ taskMapping: [{ oldTaskId: 'US-99-TASK-BE-01', newTaskId: 'NOPE' }] }))
      ).rejects.toMatchObject({ code: 'REPLAN_UNKNOWN_TASK_MAPPING' });

      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.runStatus).toBe('running'); // untouched
    });
  });

  describe('carry-completion eligibility', () => {
    test('is false for a task that was never checkpointed', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
      seedOriginalRun('US-99-TASK-BE-01'); // pending, zero attempts

      const result = await replan(
        baseArgs({ taskMapping: [{ oldTaskId: 'US-99-TASK-BE-01', newTaskId: 'US-01-TASK-BE-01' }] })
      );

      expect(result.taskMapping).toEqual([
        { oldTaskId: 'US-99-TASK-BE-01', newTaskId: 'US-01-TASK-BE-01', carriesCompletion: false },
      ]);
    });

    test('is true for a checkpointed task whose registered commit is reachable on taskRef', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
      writeFile(repoDir, 'task.txt', 'v1\n');
      const taskCommitSha = commitAll(repoDir, 'feat(US-99-TASK-BE-01): task commit');

      const taskId = 'US-99-TASK-BE-01';
      let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, { stage: 'committed', originalSha: taskCommitSha, integratedSha: taskCommitSha });
      state = state.setTaskStatus(taskId, 'checkpointed');
      store.writeState(executionRoot, RUN_ID, state);

      const result = await replan(
        baseArgs({ taskMapping: [{ oldTaskId: taskId, newTaskId: 'US-01-TASK-BE-01' }] })
      );

      expect(result.taskMapping).toEqual([
        { oldTaskId: taskId, newTaskId: 'US-01-TASK-BE-01', carriesCompletion: true },
      ]);
    });

    test('is false for a checkpointed task whose registered commit is NOT reachable on taskRef', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
      writeFile(repoDir, 'task.txt', 'v1\n');
      const taskCommitSha = commitAll(repoDir, 'feat(US-99-TASK-BE-01): task commit');

      // A sibling branch created from the pre-task-commit base — genuinely
      // does not contain taskCommitSha.
      gitCmd(repoDir, ['branch', 'other-branch', baseSha]);
      const otherRef = 'refs/heads/other-branch';

      const taskId = 'US-99-TASK-BE-01';
      let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, { stage: 'committed', originalSha: taskCommitSha, integratedSha: taskCommitSha });
      state = state.setTaskStatus(taskId, 'checkpointed');
      store.writeState(executionRoot, RUN_ID, state);

      const result = await replan(
        baseArgs({ taskRef: otherRef, taskMapping: [{ oldTaskId: taskId, newTaskId: 'US-01-TASK-BE-01' }] })
      );

      expect(result.taskMapping).toEqual([
        { oldTaskId: taskId, newTaskId: 'US-01-TASK-BE-01', carriesCompletion: false },
      ]);

      // Never touched the old task's own evidence either way.
      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.tasks[taskId].status).toBe('checkpointed');
      expect(finalState.tasks[taskId].attempts[0].originalSha).toBe(taskCommitSha);
    });
  });

  describe('no live workers gate', () => {
    const spawnedPids = [];

    afterEach(async () => {
      while (spawnedPids.length) {
        const pid = spawnedPids.pop();
        if (isAlive(pid)) await killAndWait(pid);
      }
    });

    test('proceeds when no attempt has a recorded processIdentity at all', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
      const taskId = 'US-99-TASK-BE-01';
      let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, { stage: 'failed', terminalReason: 'verification-failed' }); // no processIdentity
      store.writeState(executionRoot, RUN_ID, state);

      const result = await replan(baseArgs());
      expect(result.originalRunId).toBe(RUN_ID);

      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.runStatus).toBe('superseded');
    });

    itWindowsOnly('refuses with LIVE_WORKER_BLOCKS_REPLAN when a tagged worker is confirmed alive', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
      const taskId = 'US-99-TASK-BE-01';
      const tag = _buildProcessTag(RUN_ID, taskId, 1);

      const child = spawnTaggedChild(tag);
      spawnedPids.push(child.pid);
      await sleep(300); // let the OS finish registering the process before querying it

      let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, { stage: 'dispatching', processIdentity: tag });
      store.writeState(executionRoot, RUN_ID, state);

      await expect(replan(baseArgs({ exeBasename: NODE_EXE_BASENAME }))).rejects.toMatchObject({
        code: 'LIVE_WORKER_BLOCKS_REPLAN',
      });

      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.runStatus).toBe('running'); // untouched
    });

    itWindowsOnly('proceeds once the tagged worker is confirmed dead', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
      const taskId = 'US-99-TASK-BE-01';
      const tag = _buildProcessTag(RUN_ID, taskId, 1);

      const child = spawnTaggedChild(tag);
      spawnedPids.push(child.pid);
      await sleep(300);
      await killAndWait(child.pid);

      let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, { stage: 'interrupted', processIdentity: tag });
      store.writeState(executionRoot, RUN_ID, state);

      const result = await replan(baseArgs({ exeBasename: NODE_EXE_BASENAME }));
      expect(result.originalRunId).toBe(RUN_ID);

      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.runStatus).toBe('superseded');
    });
  });

  describe('success: superseded run + durable mapping record', () => {
    test('sets runStatus=superseded and persists a durable old->new mapping record via writeIntent', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
      const taskId = 'US-99-TASK-BE-01';
      seedOriginalRun(taskId);

      const result = await replan(
        baseArgs({ taskMapping: [{ oldTaskId: taskId, newTaskId: 'US-01-TASK-BE-01' }] })
      );

      expect(result).toMatchObject({
        originalRunId: RUN_ID,
        taskMapping: [{ oldTaskId: taskId, newTaskId: 'US-01-TASK-BE-01', carriesCompletion: false }],
      });
      expect(typeof result.protocolVersion).toBe('number');
      expect(result.successorPlanDigest).toMatch(/^[0-9a-f]{64}$/);

      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.runStatus).toBe('superseded');

      const record = store.readIntent(executionRoot, RUN_ID, 'replan');
      expect(record.originalRunId).toBe(RUN_ID);
      expect(record.successorPlanDigest).toBe(result.successorPlanDigest);
      expect(record.taskMapping).toEqual(result.taskMapping);
    });

    test('does not dispatch, start, or otherwise create any successor run artifacts', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
      seedOriginalRun('US-99-TASK-BE-01');

      await replan(baseArgs());

      // The only executionRoot side effect is against the ORIGINAL runId —
      // no new run directory was ever created for a "successor run" (replan
      // never invents or starts one).
      const runsDir = path.join(executionRoot, 'runs');
      expect(fs.readdirSync(runsDir)).toEqual([RUN_ID]);
    });

    test('is idempotent: a second call with identical inputs succeeds without INTENT_CONFLICT', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
      const taskId = 'US-99-TASK-BE-01';
      seedOriginalRun(taskId);

      const args = baseArgs({ taskMapping: [{ oldTaskId: taskId, newTaskId: 'US-01-TASK-BE-01' }] });
      const first = await replan(args);
      const second = await replan(args);

      expect(second).toEqual(first);
      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.runStatus).toBe('superseded');
    });

    test('a conflicting second call (different taskMapping) fails closed with INTENT_CONFLICT', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX, {
        tasks: [
          { id: 'US-01-TASK-BE-01', title: 'Successor task one', outcome: 'Outcome one', domain: 'BE', agentType: 'developer-backend' },
          { id: 'US-01-TASK-BE-02', title: 'Successor task two', outcome: 'Outcome two', domain: 'BE', agentType: 'developer-backend' },
        ],
      });
      const taskId = 'US-99-TASK-BE-01';
      seedOriginalRun(taskId);

      await replan(baseArgs({ taskMapping: [{ oldTaskId: taskId, newTaskId: 'US-01-TASK-BE-01' }] }));

      await expect(
        replan(baseArgs({ taskMapping: [{ oldTaskId: taskId, newTaskId: 'US-01-TASK-BE-02' }] }))
      ).rejects.toMatchObject({ code: 'INTENT_CONFLICT' });
    });

    test('never deletes or rewrites the original task\'s own attempt evidence', async () => {
      writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
      writeFile(repoDir, 'task.txt', 'v1\n');
      const taskCommitSha = commitAll(repoDir, 'feat(US-99-TASK-BE-01): task commit');

      const taskId = 'US-99-TASK-BE-01';
      let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, { stage: 'committed', originalSha: taskCommitSha, integratedSha: taskCommitSha });
      state = state.setTaskStatus(taskId, 'checkpointed');
      store.writeState(executionRoot, RUN_ID, state);

      await replan(baseArgs({ taskMapping: [{ oldTaskId: taskId, newTaskId: 'US-01-TASK-BE-01' }] }));

      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.tasks[taskId].status).toBe('checkpointed');
      expect(finalState.tasks[taskId].attempts).toHaveLength(1);
      expect(finalState.tasks[taskId].attempts[0].originalSha).toBe(taskCommitSha);
      expect(finalState.tasks[taskId].attempts[0].stage).toBe('committed');
    });
  });
});

// ── Test-isolation discipline note ──────────────────────────────────────────
// Grep verification performed manually before reporting this task done: every
// call to spawnSync('git', ...) in this file passes an explicit `cwd` bound
// to `repoDir`, itself nested under `tmpDir` (a fresh fs.mkdtempSync(os.tmpdir())
// directory created in beforeEach and removed in afterEach). The successor
// feature fixture (Approvals.md / Work-Breakdown.md / .csv) is likewise
// written only under `tmpDir`, never under this repo's own
// internal_docs/features/ directory. No test in this file calls
// process.chdir(), no test omits `cwd`, and no test path resolves into
// c:/ws/Fincantieri.CommonLibraries.AIToolkit (this project's own working
// tree). user.name/user.email are set locally per repo, never --global.
