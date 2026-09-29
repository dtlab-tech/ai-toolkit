'use strict';

// Tests for lib/task-executor/index.js's evidence-evaluation additions
// (US-06-TASK-BE-02, FTR-018): real worker-liveness classification
// (_findLiveTaggedProcess + _classifyLiveOrDeadWorkerAttempt), retry-policy
// attempt-count enforcement (_classifyFailedAttempt), corrupted/modified-
// state detection for completed tasks (AC-12), and dispatchTaskAttempt's own
// processIdentity tagging (US-03-TASK-BE-03, extended here).
//
// This completes the two edge-cases-table rows US-06-TASK-BE-01 left as an
// honest partial — see tests/lib/resume-reconcile.test.js's own
// "worker-live-or-unknown / failed (honest partial, no repair)" describe
// block, whose no-processIdentity / within-policy assertions must still pass
// completely unchanged (regression-checked here too, not just there).
//
// SAFETY (mirrors tests/lib/ownership.liveness.test.js's exact discipline):
// real subprocess liveness assertions run only on Windows (E-02 evidence
// spike qualification). Every "worker" this suite spawns is a REAL, plain
// Node child process tagged via a literal argv element — never the real
// claude.exe, never a mock of the PowerShell/CIM query — mirroring the E-02
// evidence spike's own containment discipline (harness-registration-
// window.js: "every worker carries a unique RUN_TAG in its argv; the proof
// only ever terminates PIDs whose command line contains that RUN_TAG").
//
// Git safety (mirrors tests/lib/resume-reconcile.test.js's exact discipline):
// every git command in this suite runs with an explicit `cwd` pointing at a
// repository created fresh, per test, under `fs.mkdtempSync(os.tmpdir())`,
// with a LOCAL (repo-scoped only) `user.name`/`user.email`. No git command
// in this file ever targets this project's own working tree. Every tmp repo
// is removed in `afterEach`.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const store = require('../../lib/task-executor/store');
const ledger = require('../../lib/execution-ledger');
const ownership = require('../../lib/task-executor/ownership');
const claudeProcess = require('../../lib/task-executor/claude-process');
const {
  reconcile,
  evaluateTaskEvidence,
  dispatchTaskAttempt,
  _buildProcessTag,
  _findLiveTaggedProcess,
} = require('../../lib/task-executor/index');

const IS_WINDOWS = process.platform === 'win32';
// Real process-liveness assertions are only qualified on Windows (E-02
// evidence spike) — see tests/lib/ownership.liveness.test.js's own
// itWindowsOnly gating, mirrored here for the same reason.
const itWindowsOnly = IS_WINDOWS ? test : test.skip;

const RUN_ID = 'run-1';
const TASK_ID = 'US-99-TASK-BE-01';
const NODE_EXE_BASENAME = path.basename(process.execPath); // 'node.exe' on Windows
const NODE = process.execPath;
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-claude-cli.js');

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

// A REAL, short-lived, tagged child process: a plain Node script that just
// sleeps, with the tag passed as a literal trailing argv element — exactly
// mirroring how dispatchTaskAttempt itself appends processIdentity to
// spawnArgs. The OS's own CommandLine property captures this whole argv
// verbatim, which is exactly what _findLiveTaggedProcess's substring match
// depends on.
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

describe('_findLiveTaggedProcess (US-06-TASK-BE-02)', () => {
  const spawnedPids = [];

  afterEach(async () => {
    while (spawnedPids.length) {
      const pid = spawnedPids.pop();
      if (isAlive(pid)) await killAndWait(pid);
    }
  });

  test('returns unknown (never throws) for a non-string tag or exeBasename', () => {
    expect(_findLiveTaggedProcess(null, 'node.exe').status).toBe('unknown');
    expect(_findLiveTaggedProcess('', 'node.exe').status).toBe('unknown');
    expect(_findLiveTaggedProcess('tag', null).status).toBe('unknown');
    expect(_findLiveTaggedProcess('tag', '').status).toBe('unknown');
  });

  test('returns unknown on a non-Windows platform, without attempting an OS query', () => {
    jest.resetModules();
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });
    try {
      const fresh = require('../../lib/task-executor/index');
      const result = fresh._findLiveTaggedProcess('some-tag', 'node.exe');
      expect(result.status).toBe('unknown');
      expect(result.reason).toMatch(/only qualified on Windows/);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      jest.resetModules();
    }
  });

  itWindowsOnly(
    'finds a real, live tagged process by exact tag + exe basename match, then confirms it gone after kill',
    async () => {
      const tag = 'evidence-table-test-' + Date.now() + '-' + Math.random().toString(16).slice(2);
      const child = spawnTaggedChild(tag);
      spawnedPids.push(child.pid);
      await sleep(500); // let the OS finish registering the process before we query it

      const found = _findLiveTaggedProcess(tag, NODE_EXE_BASENAME);
      expect(found.status).toBe('found-alive');
      expect(found.pids).toContain(child.pid);

      await killAndWait(child.pid);

      const afterKill = _findLiveTaggedProcess(tag, NODE_EXE_BASENAME);
      expect(afterKill.status).toBe('confirmed-not-found');
      expect(afterKill.pids).toEqual([]);
    },
    20000
  );

  itWindowsOnly(
    'does not match a live process carrying a different tag (positive absence evidence, not a wildcard match)',
    async () => {
      const unrelatedTag = 'evidence-table-test-unrelated-' + Date.now();
      const child = spawnTaggedChild(unrelatedTag);
      spawnedPids.push(child.pid);
      await sleep(500);

      const searchedTag = 'evidence-table-test-does-not-exist-' + Date.now();
      const result = _findLiveTaggedProcess(searchedTag, NODE_EXE_BASENAME);
      expect(result.status).toBe('confirmed-not-found');
    },
    20000
  );
});

describe('dispatchTaskAttempt: processIdentity tagging (US-06-TASK-BE-02)', () => {
  let tmpDir;
  let executionRoot;
  let verifyIdentitySpy;

  const VERIFIED_IDENTITY = {
    agentId: 'gaia.agent.developer.backend',
    nativeName: 'gaia-developer-backend',
    sha256: 'sha256:' + 'a'.repeat(64),
    path: '/fake/path/gaia-developer-backend.md',
    manifestPath: '/fake/path/.ai-toolkit-manifest.json',
    toolkitVersion: '0.13.0',
    scope: 'project',
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-table-dispatch-test-'));
    executionRoot = path.join(tmpDir, 'execution');
    verifyIdentitySpy = jest.spyOn(claudeProcess, 'verifyAgentIdentity').mockReturnValue(VERIFIED_IDENTITY);

    const state = new store.State(baseStateFields()).addTask(TASK_ID, { dependencies: [] });
    store.writeState(executionRoot, RUN_ID, state);
    ownership.acquireLease(executionRoot, RUN_ID);
  });

  afterEach(() => {
    verifyIdentitySpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeTask(overrides) {
    return Object.assign(
      { id: TASK_ID, title: 'Do the thing', outcome: 'The thing is done', domain: 'BE', dependsOn: [], acceptanceCriteria: [], verificationCommands: [] },
      overrides || {}
    );
  }

  function baseArgs(overrides) {
    return Object.assign(
      {
        executionRoot,
        runId: RUN_ID,
        task: makeTask(),
        attemptNumber: 1,
        claudePath: NODE,
        agentId: VERIFIED_IDENTITY.agentId,
        projectDir: tmpDir,
        spawnArgs: [FIXTURE, '--mode=echo-json'],
      },
      overrides || {}
    );
  }

  test('persists a processIdentity tag into the attempt BEFORE spawning, and returns it', async () => {
    const result = await dispatchTaskAttempt(baseArgs());
    const expectedTag = 'ai-toolkit-task:' + RUN_ID + ':' + TASK_ID + ':1';

    expect(result.processIdentity).toBe(expectedTag);

    const state = store.readState(executionRoot, RUN_ID);
    expect(state.tasks[TASK_ID].attempts[0].processIdentity).toBe(expectedTag);
  });

  test('appends the same tag as an extra trailing argv element on the spawned process', async () => {
    const result = await dispatchTaskAttempt(baseArgs());
    const expectedTag = 'ai-toolkit-task:' + RUN_ID + ':' + TASK_ID + ':1';

    // fake-claude-cli.js's echo-json mode echoes back process.argv.slice(3)
    // (its own argv beyond node/script/--mode) — the tag must appear there,
    // proving it reached the child's real command line, not just this
    // function's in-memory bookkeeping.
    expect(result.spawnResult.result.argv).toContain(expectedTag);
  });

  test('a resumed dispatch (existing attempt) also persists and appends the tag', async () => {
    let state = store.readState(executionRoot, RUN_ID);
    state = state.addAttempt(TASK_ID, { stage: 'prepared' });
    store.writeState(executionRoot, RUN_ID, state);

    const result = await dispatchTaskAttempt(baseArgs({ attemptNumber: 1 }));
    const expectedTag = 'ai-toolkit-task:' + RUN_ID + ':' + TASK_ID + ':1';

    expect(result.processIdentity).toBe(expectedTag);
    expect(result.spawnResult.result.argv).toContain(expectedTag);
  });
});

describe('reconcile / evaluateTaskEvidence: worker liveness + retry policy (US-06-TASK-BE-02)', () => {
  let tmpDir;
  let executionRoot;
  let repoDir;
  let featureRef;
  let baseSha;
  const spawnedPids = [];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-table-test-'));
    executionRoot = path.join(tmpDir, 'execution');
    repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir);

    initRepo(repoDir);
    writeFile(repoDir, 'base.txt', 'base\n');
    baseSha = commitAll(repoDir, 'init');

    const branchName = gitCmd(repoDir, ['symbolic-ref', '--short', 'HEAD']).trim();
    featureRef = 'refs/heads/' + branchName;
  });

  afterEach(async () => {
    while (spawnedPids.length) {
      const pid = spawnedPids.pop();
      if (isAlive(pid)) await killAndWait(pid);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function baseArgs(overrides) {
    return Object.assign(
      { executionRoot, runId: RUN_ID, projectDir: repoDir, taskRef: featureRef, exeBasename: NODE_EXE_BASENAME },
      overrides || {}
    );
  }

  function evaluateArgs(overrides) {
    return Object.assign(
      { executionRoot, runId: RUN_ID, task: { id: TASK_ID }, projectDir: repoDir, taskRef: featureRef, exeBasename: NODE_EXE_BASENAME },
      overrides || {}
    );
  }

  describe('no processIdentity recorded (regression: unchanged honest partial)', () => {
    test.each(['prepared', 'dispatching', 'running', 'interrupted'])(
      'stage "%s" without a tag still classifies as worker-live-or-unknown',
      async (stage) => {
        let state = new store.State(baseStateFields({ featureRef })).addTask(TASK_ID, { dependencies: [] });
        state = state.addAttempt(TASK_ID, { stage });
        store.writeState(executionRoot, RUN_ID, state);

        const result = await evaluateTaskEvidence(evaluateArgs());
        expect(result.classification).toBe('worker-live-or-unknown');
        expect(result.action).toBe('no-replacement-diagnose');
      }
    );
  });

  describe('"Worker still live" -> no-replacement-diagnose-or-pause (real check)', () => {
    itWindowsOnly('a genuinely live tagged worker is never replaced', async () => {
      const tag = _buildProcessTag(RUN_ID, TASK_ID, 1);
      const child = spawnTaggedChild(tag);
      spawnedPids.push(child.pid);
      await sleep(500);

      let state = new store.State(baseStateFields({ featureRef })).addTask(TASK_ID, { dependencies: [] });
      state = state.addAttempt(TASK_ID, { stage: 'running', processIdentity: tag });
      store.writeState(executionRoot, RUN_ID, state);

      const result = await reconcile(baseArgs());

      expect(result.repairsApplied).toEqual([]);
      expect(result.classifications).toContainEqual({
        taskId: TASK_ID, classification: 'worker-live', action: 'no-replacement-diagnose-or-pause',
      });
    }, 20000);
  });

  describe('"Dead worker, partial diff" -> preserve-and-attribute (real check)', () => {
    itWindowsOnly('a confirmed-dead tagged worker with no live process, within retry policy, is classified dead-worker', async () => {
      const tag = _buildProcessTag(RUN_ID, TASK_ID, 1);
      // Deliberately never spawned — the tag has no live process anywhere.

      let state = new store.State(baseStateFields({ featureRef })).addTask(TASK_ID, { dependencies: [] });
      state = state.addAttempt(TASK_ID, { stage: 'interrupted', processIdentity: tag });
      store.writeState(executionRoot, RUN_ID, state);

      const result = await evaluateTaskEvidence(evaluateArgs());

      expect(result.classification).toBe('dead-worker');
      expect(result.action).toBe('preserve-and-attribute-new-attempt-within-retry-policy');
      expect(result.hasPartialEvidence).toBe(false);
    }, 20000);

    itWindowsOnly('preserves and reports partial evidence (verificationRefs) when present', async () => {
      const tag = _buildProcessTag(RUN_ID, TASK_ID, 1);

      let state = new store.State(baseStateFields({ featureRef })).addTask(TASK_ID, { dependencies: [] });
      state = state.addAttempt(TASK_ID, {
        stage: 'interrupted', processIdentity: tag, verificationRefs: [TASK_ID + '-attempt1-verification-0'],
      });
      store.writeState(executionRoot, RUN_ID, state);

      const result = await evaluateTaskEvidence(evaluateArgs());

      expect(result.classification).toBe('dead-worker');
      expect(result.hasPartialEvidence).toBe(true);
    }, 20000);

    itWindowsOnly('a dead worker beyond the retry policy (2 attempts already recorded) is blocked, not replaced', async () => {
      const tag = _buildProcessTag(RUN_ID, TASK_ID, 2);

      let state = new store.State(baseStateFields({ featureRef })).addTask(TASK_ID, { dependencies: [] });
      state = state.addAttempt(TASK_ID, { stage: 'failed', terminalReason: 'verification-failed' }); // attempt 1 (consumed)
      state = state.addAttempt(TASK_ID, { stage: 'interrupted', processIdentity: tag }); // attempt 2 (dead)
      store.writeState(executionRoot, RUN_ID, state);

      const result = await evaluateTaskEvidence(evaluateArgs());

      expect(result.classification).toBe('blocked');
      expect(result.action).toBe('replan-required');
    }, 20000);
  });

  describe('"Failed verification/review" -> retry-policy attempt-count enforcement', () => {
    test('within policy (1 attempt consumed) still reports the original needs-new-attempt action (regression)', async () => {
      let state = new store.State(baseStateFields({ featureRef })).addTask(TASK_ID, { dependencies: [] });
      state = state.addAttempt(TASK_ID, { stage: 'failed', terminalReason: 'verification-failed' });
      store.writeState(executionRoot, RUN_ID, state);

      const result = await evaluateTaskEvidence(evaluateArgs());

      expect(result.classification).toBe('failed');
      expect(result.action).toBe('needs-new-attempt-subject-to-retry-policy');
    });

    test('beyond policy (2 attempts already consumed) is blocked with replan-required', async () => {
      let state = new store.State(baseStateFields({ featureRef })).addTask(TASK_ID, { dependencies: [] });
      state = state.addAttempt(TASK_ID, { stage: 'failed', terminalReason: 'verification-failed' }); // attempt 1
      state = state.addAttempt(TASK_ID, { stage: 'failed', terminalReason: 'review-failed' }); // attempt 2 (rework, also failed)
      store.writeState(executionRoot, RUN_ID, state);

      const result = await evaluateTaskEvidence(evaluateArgs());

      expect(result.classification).toBe('blocked');
      expect(result.action).toBe('replan-required');
    });
  });

  describe('"Corrupted/modified state" (AC-12): completed task with an unexpectedly-still-alive tagged worker', () => {
    itWindowsOnly('a "committed" attempt whose tag is still alive is blocked, not finalized', async () => {
      writeFile(repoDir, 'task.txt', 'v1\n');
      const taskCommitSha = commitAll(repoDir, 'feat(' + TASK_ID + '): task commit');

      const tag = _buildProcessTag(RUN_ID, TASK_ID, 1);
      const child = spawnTaggedChild(tag);
      spawnedPids.push(child.pid);
      await sleep(500);

      let state = new store.State(baseStateFields({ featureRef })).addTask(TASK_ID, { dependencies: [] });
      state = state.addAttempt(TASK_ID, {
        stage: 'committed', originalSha: taskCommitSha, integratedSha: taskCommitSha, processIdentity: tag,
      });
      store.writeState(executionRoot, RUN_ID, state);
      // Deliberately never opens the 'task' ledger activity: the corrupted
      // check must short-circuit BEFORE finalizeTaskCheckpoint is ever
      // attempted, so no ACTIVITY_NOT_FOUND should ever surface here.

      const result = await reconcile(baseArgs());

      expect(result.repairsApplied).toEqual([]);
      expect(result.classifications).toContainEqual({
        taskId: TASK_ID, classification: 'blocked', action: 'corrupted-or-modified-state',
      });

      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.tasks[TASK_ID].status).not.toBe('checkpointed');
    }, 20000);

    itWindowsOnly('an already-"checkpointed" task whose last attempt tag is still alive is blocked, not kept as up-to-date', async () => {
      writeFile(repoDir, 'task.txt', 'v1\n');
      const taskCommitSha = commitAll(repoDir, 'feat(' + TASK_ID + '): task commit');

      const tag = _buildProcessTag(RUN_ID, TASK_ID, 1);
      const child = spawnTaggedChild(tag);
      spawnedPids.push(child.pid);
      await sleep(500);

      let state = new store.State(baseStateFields({ featureRef })).addTask(TASK_ID, { dependencies: [] });
      state = state.addAttempt(TASK_ID, {
        stage: 'committed', originalSha: taskCommitSha, integratedSha: taskCommitSha, processIdentity: tag,
        intentIds: [TASK_ID + '-attempt1-checkpoint'],
      });
      state = state.setTaskStatus(TASK_ID, 'checkpointed');
      store.writeState(executionRoot, RUN_ID, state);
      store.writeIntent(executionRoot, RUN_ID, TASK_ID + '-attempt1-checkpoint', { taskId: TASK_ID });
      store.writeReceipt(executionRoot, RUN_ID, TASK_ID + '-attempt1-outcome', { taskId: TASK_ID });

      const result = await reconcile(baseArgs());

      expect(result.classifications).toContainEqual({
        taskId: TASK_ID, classification: 'blocked', action: 'corrupted-or-modified-state',
      });
    }, 20000);

    test('a "committed" attempt whose tag is confirmed dead is NOT flagged corrupted (normal finalize proceeds)', async () => {
      writeFile(repoDir, 'task.txt', 'v1\n');
      const taskCommitSha = commitAll(repoDir, 'feat(' + TASK_ID + '): task commit');

      const tag = _buildProcessTag(RUN_ID, TASK_ID, 1); // never spawned — confirmed-not-found

      let state = new store.State(baseStateFields({ featureRef })).addTask(TASK_ID, { dependencies: [] });
      state = state.addAttempt(TASK_ID, {
        stage: 'committed', originalSha: taskCommitSha, integratedSha: taskCommitSha, processIdentity: tag,
      });
      store.writeState(executionRoot, RUN_ID, state);

      const ledgerPaths = store._executionPaths(executionRoot, RUN_ID);
      ledger.open(ledgerPaths.runDir, RUN_ID, 'executor:' + RUN_ID + ':' + TASK_ID + ':task', 'task', null, 1);

      const result = await reconcile(baseArgs());

      expect(result.repairsApplied).toEqual([{ taskId: TASK_ID, action: 'finalize-checkpoint' }]);
      expect(result.classifications).toContainEqual({
        taskId: TASK_ID, classification: 'reconciled', action: 'checkpoint-finalized',
      });
    });
  });
});
