'use strict';

// Tests for lib/task-executor/index.js reconcile/resume (US-06-TASK-BE-01,
// FTR-018). Covers the edge-cases-table rows this task's scope explicitly
// claims as achievable now (Tech-Spec section 9), and explicitly does NOT
// attempt to cover the rows deferred to US-06-TASK-BE-02 (worker liveness,
// retry-policy attempt counting) beyond asserting the honest partial
// classification they get here.
//
// SAFETY (mandatory — mirrors tests/lib/reconciliation.test.js's exact
// discipline): every git command in this suite runs with an explicit `cwd`
// pointing at a repository created fresh, per test, under
// `fs.mkdtempSync(os.tmpdir())`, with a LOCAL (repo-scoped only)
// `user.name`/`user.email` set via `git config` (never `--global`). No git
// command in this file ever targets this project's own working tree
// (c:/ws/Fincantieri.CommonLibraries.AIToolkit). Every tmp repo is removed in
// `afterEach`.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const store = require('../../lib/task-executor/store');
const git = require('../../lib/task-executor/git');
const ledger = require('../../lib/execution-ledger');
const ownership = require('../../lib/task-executor/ownership');
const { reconcile, resume } = require('../../lib/task-executor/index');

const RUN_ID = 'run-1';
const IS_WINDOWS = process.platform === 'win32';
// Real process-liveness assertions (host matches + pid confirmed alive/dead)
// are only qualified on Windows (E-02 evidence spike) — see
// tests/lib/ownership.liveness.test.js's own itWindowsOnly gating, mirrored
// here for the same reason. On non-Windows CI runners these are skipped
// rather than faked.
const itWindowsOnly = IS_WINDOWS ? test : test.skip;

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

describe('reconcile / resume (US-06-TASK-BE-01)', () => {
  let tmpDir;
  let executionRoot;
  let repoDir;
  let featureRef;
  let baseSha;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-reconcile-test-'));
    executionRoot = path.join(tmpDir, 'execution');
    repoDir = path.join(tmpDir, 'repo');
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
      { executionRoot: executionRoot, runId: RUN_ID, projectDir: repoDir, taskRef: featureRef },
      overrides || {}
    );
  }

  describe('input validation', () => {
    test('reconcile throws on missing required args', () => {
      return expect(reconcile({})).rejects.toThrow();
    });

    test('resume throws on missing required args', () => {
      return expect(resume({})).rejects.toThrow();
    });
  });

  describe('never-started task', () => {
    test('classifies a pending task with zero attempts as not-started and applies no repair', async () => {
      const taskId = 'US-99-TASK-BE-01';
      const state = new store.State(baseStateFields()).addTask(taskId, { dependencies: [] });
      store.writeState(executionRoot, RUN_ID, state);

      const result = await reconcile(baseArgs());

      expect(result.repairsApplied).toEqual([]);
      expect(result.classifications).toContainEqual({ taskId: taskId, classification: 'not-started', action: 'none' });
    });
  });

  describe('implementation-recorded -> needs-verification (no repair)', () => {
    test('reports the classification without dispatching anything', async () => {
      const taskId = 'US-99-TASK-BE-01';
      let state = new store.State(baseStateFields()).addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, { stage: 'implementation-recorded' });
      store.writeState(executionRoot, RUN_ID, state);

      const result = await reconcile(baseArgs());

      expect(result.repairsApplied).toEqual([]);
      expect(result.classifications).toContainEqual({
        taskId: taskId, classification: 'implementation-recorded', action: 'needs-verification',
      });
    });
  });

  describe('reviewed, no commit yet -> needs-checkpoint-completion (no repair)', () => {
    test('reports the classification without finishing the checkpoint itself', async () => {
      const taskId = 'US-99-TASK-BE-01';
      let state = new store.State(baseStateFields()).addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, { stage: 'reviewed' });
      store.writeState(executionRoot, RUN_ID, state);

      const result = await reconcile(baseArgs());

      expect(result.repairsApplied).toEqual([]);
      expect(result.classifications).toContainEqual({
        taskId: taskId, classification: 'reviewed-no-checkpoint', action: 'needs-checkpoint-completion',
      });
    });
  });

  describe('worker-live-or-unknown / failed (honest partial, no repair)', () => {
    test.each(['prepared', 'dispatching', 'running', 'interrupted'])(
      'classifies stage "%s" as worker-live-or-unknown without assuming liveness',
      async (stage) => {
        const taskId = 'US-99-TASK-BE-01';
        let state = new store.State(baseStateFields()).addTask(taskId, { dependencies: [] });
        state = state.addAttempt(taskId, { stage: stage });
        store.writeState(executionRoot, RUN_ID, state);

        const result = await reconcile(baseArgs());

        expect(result.repairsApplied).toEqual([]);
        expect(result.classifications).toContainEqual({
          taskId: taskId, classification: 'worker-live-or-unknown', action: 'no-replacement-diagnose',
        });
      }
    );

    test('classifies stage "failed" honestly, without claiming retry-policy accounting', async () => {
      const taskId = 'US-99-TASK-BE-01';
      let state = new store.State(baseStateFields()).addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, { stage: 'failed', terminalReason: 'verification-failed' });
      store.writeState(executionRoot, RUN_ID, state);

      const result = await reconcile(baseArgs());

      expect(result.repairsApplied).toEqual([]);
      expect(result.classifications).toContainEqual({
        taskId: taskId, classification: 'failed', action: 'needs-new-attempt-subject-to-retry-policy',
      });
    });
  });

  describe('commit exists but SHA not recorded -> exact intent reconciliation (real repair)', () => {
    test('registers the commit SHA when the checkpoint-prepared attempt intent exactly matches taskRef\'s current tip', async () => {
      const taskId = 'US-99-TASK-BE-01';
      let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, { stage: 'reviewed' });
      store.writeState(executionRoot, RUN_ID, state);

      // Drive the real checkpoint-intent + staging + commit pipeline
      // (US-05-TASK-BE-01/02/03) so a real commit lands on featureRef whose
      // trailers/tree/parent exactly match this attempt's persisted intent —
      // then stop short of registerCommitSHA (US-05-TASK-BE-04), which is
      // exactly the scenario this row of the edge-cases table describes.
      writeFile(repoDir, 'task.txt', 'v1\n');
      const stagingResult = git.stageTaskFiles(repoDir, [{ path: 'task.txt', changeType: 'add' }]);

      const intentInput = {
        featureId: 'FTR-099',
        runId: RUN_ID,
        taskId: taskId,
        attemptNumber: 1,
        planDigest: 'b'.repeat(64),
        featureRef: featureRef,
        taskRef: featureRef,
        parentSha: baseSha,
        expectedTreeSha: stagingResult.treeSha,
        changedPaths: [{ path: 'task.txt', changeType: 'add' }],
        verificationReceiptIds: [taskId + '-attempt1-verification-0'],
        reviewReceiptId: taskId + '-attempt1-review',
        outcomeReceiptId: taskId + '-attempt1-outcome',
        commitMessage: 'feat(US-99-TASK-BE-01): task commit',
      };
      const persisted = git.persistCheckpointIntent(executionRoot, RUN_ID, intentInput);
      const commitResult = git.createTaskCommit(repoDir, persisted.intent, stagingResult);

      const result = await reconcile(baseArgs());

      expect(result.repairsApplied).toEqual([{ taskId: taskId, action: 'register-commit-sha' }]);
      expect(result.classifications).toContainEqual({
        taskId: taskId, classification: 'reconciled', action: 'commit-sha-registered',
      });

      const finalState = store.readState(executionRoot, RUN_ID);
      const attempt = finalState.tasks[taskId].attempts[0];
      expect(attempt.stage).toBe('committed');
      expect(attempt.originalSha).toBe(commitResult.commitSha);
    });

    test('does not land on featureRef yet -> checkpoint-prepared-no-commit, no repair', async () => {
      const taskId = 'US-99-TASK-BE-01';
      let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, { stage: 'reviewed' });
      store.writeState(executionRoot, RUN_ID, state);

      writeFile(repoDir, 'task.txt', 'v1\n');
      const stagingResult = git.stageTaskFiles(repoDir, [{ path: 'task.txt', changeType: 'add' }]);
      git.persistCheckpointIntent(executionRoot, RUN_ID, {
        featureId: 'FTR-099',
        runId: RUN_ID,
        taskId: taskId,
        attemptNumber: 1,
        planDigest: 'b'.repeat(64),
        featureRef: featureRef,
        taskRef: featureRef,
        parentSha: baseSha,
        expectedTreeSha: stagingResult.treeSha,
        changedPaths: [{ path: 'task.txt', changeType: 'add' }],
        verificationReceiptIds: [taskId + '-attempt1-verification-0'],
        reviewReceiptId: taskId + '-attempt1-review',
        outcomeReceiptId: taskId + '-attempt1-outcome',
        commitMessage: 'feat(US-99-TASK-BE-01): task commit',
      });
      // Deliberately never call createTaskCommit — featureRef still points
      // at baseSha, exactly the intent's own parentSha.

      const result = await reconcile(baseArgs());

      expect(result.repairsApplied).toEqual([]);
      expect(result.classifications).toContainEqual({
        taskId: taskId, classification: 'checkpoint-prepared-no-commit', action: 'needs-commit-creation',
      });
    });
  });

  describe('committed but not yet finalized -> checkpoint finalization (real repair)', () => {
    test('calls finalizeTaskCheckpoint when the registered SHA is reachable on taskRef', async () => {
      const taskId = 'US-99-TASK-BE-01';
      writeFile(repoDir, 'task.txt', 'v1\n');
      const taskCommitSha = commitAll(repoDir, 'feat(US-99-TASK-BE-01): task commit');

      let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, { stage: 'committed', originalSha: taskCommitSha, integratedSha: taskCommitSha });
      store.writeState(executionRoot, RUN_ID, state);

      const ledgerPaths = store._executionPaths(executionRoot, RUN_ID);
      const ledgerAgentKey = 'executor:' + RUN_ID + ':' + taskId + ':task';
      ledger.open(ledgerPaths.runDir, RUN_ID, ledgerAgentKey, 'task', null, 1);

      const result = await reconcile(baseArgs());

      expect(result.repairsApplied).toEqual([{ taskId: taskId, action: 'finalize-checkpoint' }]);
      expect(result.classifications).toContainEqual({
        taskId: taskId, classification: 'reconciled', action: 'checkpoint-finalized',
      });

      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.tasks[taskId].status).toBe('checkpointed');
    });
  });

  describe('completed task evidence', () => {
    function seedCheckpointedTask(taskId, taskCommitSha) {
      let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, {
        stage: 'committed',
        originalSha: taskCommitSha,
        integratedSha: taskCommitSha,
        intentIds: [taskId + '-attempt1-checkpoint'],
      });
      state = state.setTaskStatus(taskId, 'checkpointed');
      store.writeState(executionRoot, RUN_ID, state);

      store.writeIntent(executionRoot, RUN_ID, taskId + '-attempt1-checkpoint', { taskId: taskId, note: 'test-intent' });
      store.writeReceipt(executionRoot, RUN_ID, taskId + '-attempt1-outcome', { taskId: taskId, note: 'test-outcome' });
    }

    test('valid intent and receipts + reachable commit -> up-to-date, no repair (keep completion)', async () => {
      const taskId = 'US-99-TASK-BE-01';
      writeFile(repoDir, 'task.txt', 'v1\n');
      const taskCommitSha = commitAll(repoDir, 'feat(US-99-TASK-BE-01): task commit');
      seedCheckpointedTask(taskId, taskCommitSha);

      const result = await reconcile(baseArgs());

      expect(result.repairsApplied).toEqual([]);
      expect(result.classifications).toContainEqual({
        taskId: taskId, classification: 'up-to-date', action: 'keep-completion',
      });
    });

    test('an integrated task with the same valid evidence is also up-to-date', async () => {
      const taskId = 'US-99-TASK-BE-01';
      writeFile(repoDir, 'task.txt', 'v1\n');
      const taskCommitSha = commitAll(repoDir, 'feat(US-99-TASK-BE-01): task commit');

      let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, {
        stage: 'integrated', originalSha: taskCommitSha, integratedSha: taskCommitSha,
        intentIds: [taskId + '-attempt1-checkpoint'],
      });
      state = state.setTaskStatus(taskId, 'integrated');
      store.writeState(executionRoot, RUN_ID, state);
      store.writeIntent(executionRoot, RUN_ID, taskId + '-attempt1-checkpoint', { taskId: taskId });
      store.writeReceipt(executionRoot, RUN_ID, taskId + '-attempt1-outcome', { taskId: taskId });

      const result = await reconcile(baseArgs());

      expect(result.classifications).toContainEqual({
        taskId: taskId, classification: 'up-to-date', action: 'keep-completion',
      });
    });

    test('unreachable/mismatched commit -> blocked, without rewriting history', async () => {
      const taskId = 'US-99-TASK-BE-01';
      writeFile(repoDir, 'task.txt', 'v1\n');
      const taskCommitSha = commitAll(repoDir, 'feat(US-99-TASK-BE-01): task commit');
      seedCheckpointedTask(taskId, taskCommitSha);

      // A sibling branch created from the pre-task-commit base — genuinely
      // does not contain taskCommitSha.
      gitCmd(repoDir, ['branch', 'other-branch', baseSha]);
      const otherRef = 'refs/heads/other-branch';

      const result = await reconcile(baseArgs({ taskRef: otherRef }));

      expect(result.repairsApplied).toEqual([]);
      expect(result.classifications).toContainEqual({
        taskId: taskId, classification: 'blocked', action: 'unreachable-or-mismatched-commit',
      });

      // Nothing rewritten: task status is untouched.
      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.tasks[taskId].status).toBe('checkpointed');
    });

    test('missing intent/receipt evidence -> blocked (corrupted-or-missing-evidence), no empty defaults', async () => {
      const taskId = 'US-99-TASK-BE-01';
      writeFile(repoDir, 'task.txt', 'v1\n');
      const taskCommitSha = commitAll(repoDir, 'feat(US-99-TASK-BE-01): task commit');

      let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, {
        stage: 'committed', originalSha: taskCommitSha, integratedSha: taskCommitSha,
        intentIds: [taskId + '-attempt1-checkpoint'], // never actually written via store.writeIntent
      });
      state = state.setTaskStatus(taskId, 'checkpointed');
      store.writeState(executionRoot, RUN_ID, state);
      // No writeIntent / writeReceipt calls — evidence is missing.

      const result = await reconcile(baseArgs());

      expect(result.repairsApplied).toEqual([]);
      expect(result.classifications).toContainEqual({
        taskId: taskId, classification: 'blocked', action: 'corrupted-or-missing-evidence',
      });
    });
  });

  describe('plan/config changed -> block until approved successor plan', () => {
    test('blocks every task and applies no repairs when planDigest does not match recorded state', async () => {
      const taskId = 'US-99-TASK-BE-01';
      let state = new store.State(baseStateFields({ featureRef: featureRef, planDigest: 'b'.repeat(64) }))
        .addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, { stage: 'reviewed' }); // would otherwise be a no-op classification only
      store.writeState(executionRoot, RUN_ID, state);

      const result = await reconcile(baseArgs({ planDigest: 'c'.repeat(64) }));

      expect(result.repairsApplied).toEqual([]);
      expect(result.classifications).toContainEqual({
        taskId: taskId, classification: 'blocked', action: 'blocked-plan-changed',
      });
    });

    test('a matching planDigest does not block anything', async () => {
      const taskId = 'US-99-TASK-BE-01';
      const digest = 'b'.repeat(64);
      let state = new store.State(baseStateFields({ featureRef: featureRef, planDigest: digest }))
        .addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, { stage: 'reviewed' });
      store.writeState(executionRoot, RUN_ID, state);

      const result = await reconcile(baseArgs({ planDigest: digest }));

      expect(result.classifications).toContainEqual({
        taskId: taskId, classification: 'reviewed-no-checkpoint', action: 'needs-checkpoint-completion',
      });
    });
  });

  describe('no live competing coordinator (Tech-Spec section 9)', () => {
    const OTHER_RUN_ID = 'run-other';
    const spawnedPids = [];

    function isAlive(pid) {
      try {
        process.kill(pid, 0);
        return true;
      } catch (err) {
        return err.code === 'EPERM';
      }
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function killAndWait(pid) {
      if (IS_WINDOWS) {
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        try { process.kill(pid, 'SIGKILL'); } catch (_) {}
      }
      for (let i = 0; i < 50 && isAlive(pid); i++) await sleep(100);
    }

    afterEach(async () => {
      while (spawnedPids.length) {
        const pid = spawnedPids.pop();
        if (isAlive(pid)) await killAndWait(pid);
      }
    });

    // Seeds a task in exactly the "committed but not yet finalized" shape
    // already exercised above — a real repair (finalizeTaskCheckpoint) is
    // available to apply, so these tests can assert it either DOES or does
    // NOT get applied depending on the competing-coordinator scenario.
    function seedCommittedAttemptReadyForFinalize(taskId) {
      writeFile(repoDir, 'task.txt', 'v1\n');
      const taskCommitSha = commitAll(repoDir, 'feat(' + taskId + '): task commit');

      let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, { stage: 'committed', originalSha: taskCommitSha, integratedSha: taskCommitSha });
      store.writeState(executionRoot, RUN_ID, state);

      const ledgerPaths = store._executionPaths(executionRoot, RUN_ID);
      ledger.open(ledgerPaths.runDir, RUN_ID, 'executor:' + RUN_ID + ':' + taskId + ':task', 'task', null, 1);
    }

    test('no lease held at all -> proceeds normally (nothing to compete with)', async () => {
      const taskId = 'US-99-TASK-BE-01';
      seedCommittedAttemptReadyForFinalize(taskId);
      expect(ownership.readLease(executionRoot)).toBeNull();

      const result = await reconcile(baseArgs());

      expect(result.repairsApplied).toEqual([{ taskId: taskId, action: 'finalize-checkpoint' }]);
      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.tasks[taskId].status).toBe('checkpointed');
    });

    test("lease held by the caller's own runId -> proceeds normally", async () => {
      const taskId = 'US-99-TASK-BE-01';
      seedCommittedAttemptReadyForFinalize(taskId);
      ownership.acquireLease(executionRoot, RUN_ID);

      const result = await reconcile(baseArgs());

      expect(result.repairsApplied).toEqual([{ taskId: taskId, action: 'finalize-checkpoint' }]);
      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.tasks[taskId].status).toBe('checkpointed');
    });

    itWindowsOnly(
      'lease held by a different, LIVE runId -> refuses with COMPETING_COORDINATOR_LIVE, no repair applied',
      async () => {
        const taskId = 'US-99-TASK-BE-01';
        seedCommittedAttemptReadyForFinalize(taskId);

        // The current test process is genuinely alive right now — acquiring
        // the lease with its own default pid/host gives checkOwnerLiveness a
        // real, positive "alive: true" result (same technique
        // tests/lib/ownership.liveness.test.js uses for its own "alive: true"
        // case), exactly the "different LIVE coordinator" scenario.
        ownership.acquireLease(executionRoot, OTHER_RUN_ID);

        await expect(reconcile(baseArgs())).rejects.toMatchObject({ code: 'COMPETING_COORDINATOR_LIVE' });
        await expect(resume(baseArgs())).rejects.toMatchObject({ code: 'COMPETING_COORDINATOR_LIVE' });

        const finalState = store.readState(executionRoot, RUN_ID);
        expect(finalState.tasks[taskId].status).not.toBe('checkpointed');
        expect(finalState.tasks[taskId].attempts[0].stage).toBe('committed');
      }
    );

    test(
      'lease held by a different runId with UNKNOWN liveness -> refuses with COMPETING_COORDINATOR_LIVENESS_UNKNOWN, no repair applied',
      async () => {
        const taskId = 'US-99-TASK-BE-01';
        seedCommittedAttemptReadyForFinalize(taskId);

        // A host mismatch makes checkOwnerLiveness inconclusive regardless of
        // platform (see ownership.js's own host-mismatch branch) — a clean,
        // deterministic way to force 'unknown' without depending on the
        // Windows-only real process query.
        ownership.acquireLease(executionRoot, OTHER_RUN_ID, { host: 'some-other-host' });

        await expect(reconcile(baseArgs())).rejects.toMatchObject({ code: 'COMPETING_COORDINATOR_LIVENESS_UNKNOWN' });
        await expect(resume(baseArgs())).rejects.toMatchObject({ code: 'COMPETING_COORDINATOR_LIVENESS_UNKNOWN' });

        const finalState = store.readState(executionRoot, RUN_ID);
        expect(finalState.tasks[taskId].status).not.toBe('checkpointed');
        expect(finalState.tasks[taskId].attempts[0].stage).toBe('committed');
      }
    );

    itWindowsOnly(
      'lease held by a different, confirmed-DEAD runId -> proceeds normally, applies repairs',
      async () => {
        const taskId = 'US-99-TASK-BE-01';
        seedCommittedAttemptReadyForFinalize(taskId);

        const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 120000)'], { stdio: 'ignore' });
        spawnedPids.push(child.pid);
        await sleep(300); // let the OS finish registering the process before we query it

        ownership.acquireLease(executionRoot, OTHER_RUN_ID, { pid: child.pid });

        await killAndWait(child.pid);

        const result = await reconcile(baseArgs());

        expect(result.repairsApplied).toEqual([{ taskId: taskId, action: 'finalize-checkpoint' }]);
        const finalState = store.readState(executionRoot, RUN_ID);
        expect(finalState.tasks[taskId].status).toBe('checkpointed');

        // reclaimLease was never called anywhere in this path — the old,
        // now-dead coordinator's lease file is still sitting there, untouched.
        const leaseAfter = ownership.readLease(executionRoot);
        expect(leaseAfter.runId).toBe(OTHER_RUN_ID);
      },
      20000
    );
  });

  describe('resume', () => {
    test('reconciles first, then reports task status + nextAction per task', async () => {
      const doneTaskId = 'US-99-TASK-BE-01';
      const pendingTaskId = 'US-99-TASK-BE-02';

      writeFile(repoDir, 'task.txt', 'v1\n');
      const taskCommitSha = commitAll(repoDir, 'feat(US-99-TASK-BE-01): task commit');

      let state = new store.State(baseStateFields({ featureRef: featureRef }))
        .addTask(doneTaskId, { dependencies: [] })
        .addTask(pendingTaskId, { dependencies: [] });
      state = state.addAttempt(doneTaskId, {
        stage: 'committed', originalSha: taskCommitSha, integratedSha: taskCommitSha,
        intentIds: [doneTaskId + '-attempt1-checkpoint'],
      });
      store.writeState(executionRoot, RUN_ID, state);
      store.writeIntent(executionRoot, RUN_ID, doneTaskId + '-attempt1-checkpoint', { taskId: doneTaskId });
      store.writeReceipt(executionRoot, RUN_ID, doneTaskId + '-attempt1-outcome', { taskId: doneTaskId });

      const ledgerPaths = store._executionPaths(executionRoot, RUN_ID);
      ledger.open(ledgerPaths.runDir, RUN_ID, 'executor:' + RUN_ID + ':' + doneTaskId + ':task', 'task', null, 1);

      const result = await resume(baseArgs());

      expect(result.runId).toBe(RUN_ID);
      expect(result.runStatus).toBe('running');
      expect(result.tasks).toContainEqual({ taskId: doneTaskId, status: 'checkpointed', nextAction: 'checkpoint-finalized' });
      expect(result.tasks).toContainEqual({ taskId: pendingTaskId, status: 'pending', nextAction: 'none' });
      expect(result.repairsApplied).toEqual([{ taskId: doneTaskId, action: 'finalize-checkpoint' }]);
    });

    test('is idempotent across repeated calls (no duplicate repair, no throw)', async () => {
      const taskId = 'US-99-TASK-BE-01';
      writeFile(repoDir, 'task.txt', 'v1\n');
      const taskCommitSha = commitAll(repoDir, 'feat(US-99-TASK-BE-01): task commit');

      let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
      state = state.addAttempt(taskId, {
        stage: 'committed', originalSha: taskCommitSha, integratedSha: taskCommitSha,
        intentIds: [taskId + '-attempt1-checkpoint'],
      });
      store.writeState(executionRoot, RUN_ID, state);
      store.writeIntent(executionRoot, RUN_ID, taskId + '-attempt1-checkpoint', { taskId: taskId });
      store.writeReceipt(executionRoot, RUN_ID, taskId + '-attempt1-outcome', { taskId: taskId });

      const ledgerPaths = store._executionPaths(executionRoot, RUN_ID);
      ledger.open(ledgerPaths.runDir, RUN_ID, 'executor:' + RUN_ID + ':' + taskId + ':task', 'task', null, 1);

      const first = await resume(baseArgs());
      expect(first.repairsApplied).toEqual([{ taskId: taskId, action: 'finalize-checkpoint' }]);

      await expect(resume(baseArgs())).resolves.toBeTruthy();
      const second = await resume(baseArgs());

      expect(second.tasks).toContainEqual({ taskId: taskId, status: 'checkpointed', nextAction: 'keep-completion' });

      const ledgerFile = path.join(ledgerPaths.runDir, RUN_ID + '-token-ledger.json');
      const entries = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
      expect(entries).toHaveLength(1);
      expect(entries[0].status).toBe('done');
    });
  });
});

// ── Test-isolation discipline note ──────────────────────────────────────────
// Grep verification performed manually before reporting this task done: every
// call to spawnSync('git', ...) in this file (both the local `gitCmd()`
// helper and its callers, plus the real lib/task-executor/git.js functions
// exercised here) passes an explicit `cwd` bound to `repoDir`, itself nested
// under `tmpDir` (a fresh fs.mkdtempSync(os.tmpdir()) directory created in
// beforeEach and removed in afterEach). No test in this file calls
// process.chdir(), no test omits `cwd`, and no test path resolves into
// c:/ws/Fincantieri.CommonLibraries.AIToolkit (this project's own working
// tree). user.name/user.email are set locally per repo, never --global.
