'use strict';

// Tests for lib/task-executor/index.js's `stop` command (US-07-TASK-BE-02,
// FTR-018) and the small execute()-loop-cooperation change it depends on
// (the loop's own top-of-iteration runStatus==='stopping' check, added to
// US-07-TASK-BE-01's already-tested main loop).
//
// Two test-design layers, deliberately kept separate:
//   1. stop() itself, exercised directly against hand-constructed state
//      (validation, idempotency, graceful persistence, immediate persistence
//      with no in-flight worker, immediate-mode in-flight-stage scoping) —
//      cheap, deterministic, no real execute() run needed for any of these.
//   2. ONE full execute()+stop() integration test proving the loop-
//      cooperation fix actually works end-to-end: a real 2-task chain is
//      driven by execute() while a jest.spyOn(store, 'writeState') wrapper
//      calls the REAL stop({mode:'graceful'}) synchronously at the exact
//      moment task A's write lands 'checkpointed' (both stop()'s own
//      readState/writeState and requestStop() are synchronous fs calls with
//      no `await` on the 'graceful' path, so this is a deterministic
//      same-tick sequencing hook, not a timing race).
//   3. ONE itWindowsOnly real-process immediate-kill test, using the exact
//      same spawn+tag+kill technique already established by tests/lib/
//      evidence-table.test.js and tests/task-executor/resume-replan.test.js
//      (spawnTaggedChild via a real, short-lived Node child process, never
//      the real claude.exe), applied directly to a hand-constructed
//      'dispatching'-stage attempt rather than a full dispatchTaskAttempt/
//      execute() run — chosen over a full end-to-end
//      execute()-dispatches-a-hang-ignore-sigterm-fixture-then-stop()
//      scenario because the isolated version exercises the exact same
//      stop()-side code path (_findLiveTaggedProcess + kill-by-PID + poll)
//      with far less timing sensitivity and no dependency on
//      dispatchTaskAttempt's own taskTimeoutMs racing against this test's
//      own stop() call.
//
// SAFETY (mirrors tests/lib/evidence-table.test.js's and tests/task-executor/
// resume-replan.test.js's exact discipline):
//   - Every git command in this suite runs with an explicit `cwd` pointing at
//     a repository created fresh, per test, under fs.mkdtempSync(os.tmpdir()),
//     with a LOCAL (repo-scoped only) user.name/user.email. No git command in
//     this file ever targets this project's own working tree. Every tmp repo
//     is removed in afterEach.
//   - Every "worker" this suite spawns is a REAL, harmless process: either a
//     plain Node child tagged via a literal argv element (spawnTaggedChild,
//     killed via the same taskkill/SIGKILL technique stop() itself uses), or
//     tests/fixtures/fake-claude-cli.js dispatched via process.execPath —
//     NEVER the real claude.exe, NEVER a real LLM/API call anywhere in this
//     file. Real process-liveness assertions are gated itWindowsOnly (E-02
//     evidence spike qualification), same as every other file in this suite.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const store = require('../../lib/task-executor/store');
const ownership = require('../../lib/task-executor/ownership');
const claudeProcess = require('../../lib/task-executor/claude-process');
const {
  stop,
  execute,
  _buildProcessTag,
  DEFAULT_TAGGED_PROCESS_EXE_BASENAME,
} = require('../../lib/task-executor/index');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-claude-cli.js');
const NODE = process.execPath;
const NODE_EXE_BASENAME = path.basename(process.execPath); // 'node.exe' on Windows
const IS_WINDOWS = process.platform === 'win32';
// Real process-liveness assertions are only qualified on Windows (E-02
// evidence spike) — see tests/lib/ownership.liveness.test.js's own
// itWindowsOnly gating, mirrored here for the same reason.
const itWindowsOnly = IS_WINDOWS ? test : test.skip;

const VERIFIED_IDENTITY = {
  agentId: 'gaia.agent.developer.backend',
  nativeName: 'gaia-developer-backend',
  sha256: 'sha256:' + 'e'.repeat(64),
  path: '/fake/path/gaia-developer-backend.md',
  manifestPath: '/fake/path/.ai-toolkit-manifest.json',
  toolkitVersion: '0.13.0',
  scope: 'project',
};

// Real subprocess spawns (tagged children, powershell CIM queries, the
// execute() integration test's real fixture dispatch/verify/review/commit
// chain) can be slow on a loaded CI/parallel test-run machine — mirrors the
// generous allowances every other real-spawn suite in this project uses.
jest.setTimeout(30000);

const RUN_ID = 'run-stop-1';

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

// A REAL, short-lived, tagged child process — mirrors tests/lib/evidence-
// table.test.js's own spawnTaggedChild exactly: the tag is a literal trailing
// argv element, never a mock of the OS query.
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

describe('stop() (US-07-TASK-BE-02)', () => {
  let tmpDir;
  let repoDir;
  let executionRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-test-'));
    repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir);
    initRepo(repoDir);
    writeFile(repoDir, 'base.txt', 'base\n');
    commitAll(repoDir, 'init');

    const commonDirOut = gitCmd(repoDir, ['rev-parse', '--git-common-dir']).trim();
    executionRoot = path.join(path.resolve(repoDir, commonDirOut), 'ai-toolkit', 'execution');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Validation ─────────────────────────────────────────────────────────

  test('rejects a missing args.project / args.runId with DISPATCH_VALIDATION_ERROR', async () => {
    await expect(stop({ runId: RUN_ID })).rejects.toMatchObject({ code: 'DISPATCH_VALIDATION_ERROR' });
    await expect(stop({ project: repoDir })).rejects.toMatchObject({ code: 'DISPATCH_VALIDATION_ERROR' });
  });

  test('rejects an invalid args.mode with STOP_VALIDATION_ERROR, before touching any state', async () => {
    await expect(stop({ project: repoDir, runId: RUN_ID, mode: 'aggressive' })).rejects.toMatchObject({
      code: 'STOP_VALIDATION_ERROR',
    });
  });

  test('defaults args.mode to "graceful" when omitted', async () => {
    let state = new store.State(baseStateFields({})).addTask('T1', { dependencies: [] });
    store.writeState(executionRoot, RUN_ID, state);

    const result = await stop({ project: repoDir, runId: RUN_ID });
    expect(result.mode).toBe('graceful');
  });

  // ── Idempotency ────────────────────────────────────────────────────────

  describe('idempotency', () => {
    test.each(['completed', 'blocked', 'superseded', 'paused'])(
      'a run already at settled runStatus "%s" is a no-op: acknowledges without re-persisting',
      async (settledStatus) => {
        let state = new store.State(baseStateFields({ runStatus: settledStatus })).addTask('T1', { dependencies: [] });
        state = store.writeState(executionRoot, RUN_ID, state);
        const generationBefore = state.generation;

        const result = await stop({ project: repoDir, runId: RUN_ID, mode: 'immediate' });

        expect(result).toMatchObject({ requestAccepted: true, mode: 'immediate', idempotent: true });
        expect(result.terminationConfirmed).toBeUndefined();
        expect(result.killAttempts).toBeUndefined();

        const after = store.readState(executionRoot, RUN_ID);
        expect(after.generation).toBe(generationBefore);
        expect(after.runStatus).toBe(settledStatus);
      }
    );

    test('a run already "stopping" is a no-op and reports the ORIGINALLY recorded mode, not this call\'s mode', async () => {
      let state = new store.State(baseStateFields({})).addTask('T1', { dependencies: [] });
      state = state.requestStop('immediate');
      state = store.writeState(executionRoot, RUN_ID, state);
      const generationBefore = state.generation;

      // Second call requests 'graceful' — must NOT downgrade/escalate, must
      // NOT re-persist, and must NOT attempt any termination work.
      const result = await stop({ project: repoDir, runId: RUN_ID, mode: 'graceful' });

      expect(result).toMatchObject({ requestAccepted: true, mode: 'immediate', idempotent: true });

      const after = store.readState(executionRoot, RUN_ID);
      expect(after.generation).toBe(generationBefore);
    });
  });

  // ── Graceful: persists the request only ────────────────────────────────

  test('graceful: persists runStatus "stopping" and the requested mode in config.stopRequest, in one write', async () => {
    let state = new store.State(baseStateFields({})).addTask('T1', { dependencies: [] });
    state = store.writeState(executionRoot, RUN_ID, state);
    const generationBefore = state.generation;

    const result = await stop({ project: repoDir, runId: RUN_ID, mode: 'graceful' });

    expect(result).toEqual({
      protocolVersion: store.PROTOCOL_VERSION,
      runId: RUN_ID,
      requestAccepted: true,
      mode: 'graceful',
    });
    expect(result.terminationConfirmed).toBeUndefined();

    const after = store.readState(executionRoot, RUN_ID);
    expect(after.runStatus).toBe('stopping');
    expect(after.config.stopRequest.mode).toBe('graceful');
    expect(typeof after.config.stopRequest.requestedAt).toBe('string');
    expect(new Date(after.config.stopRequest.requestedAt).toString()).not.toBe('Invalid Date');
    expect(after.generation).toBe(generationBefore + 1);
  });

  // ── Immediate: no in-flight attempt at all (vacuous case) ──────────────

  test('immediate: with no dispatching/running attempt anywhere, reports terminationConfirmed:true and an empty killAttempts', async () => {
    let state = new store.State(baseStateFields({})).addTask('T1', { dependencies: [] });
    state = state.addAttempt('T1', { stage: 'committed', processIdentity: _buildProcessTag(RUN_ID, 'T1', 1) });
    state = store.writeState(executionRoot, RUN_ID, state);

    const result = await stop({ project: repoDir, runId: RUN_ID, mode: 'immediate' });

    expect(result.requestAccepted).toBe(true);
    expect(result.mode).toBe('immediate');
    expect(result.terminationConfirmed).toBe(true);
    expect(result.killAttempts).toEqual([]);

    const after = store.readState(executionRoot, RUN_ID);
    expect(after.runStatus).toBe('stopping');
    expect(after.config.stopRequest.mode).toBe('immediate');
  });

  // ── Immediate: real worker termination (Windows-qualified) ─────────────

  describe('immediate mode against a real tagged worker process', () => {
    const spawnedPids = [];

    afterEach(async () => {
      while (spawnedPids.length) {
        const pid = spawnedPids.pop();
        if (isAlive(pid)) await killAndWait(pid);
      }
    });

    itWindowsOnly(
      'kills a real, live, dispatching-stage tagged worker and confirms termination before returning',
      async () => {
        const taskId = 'T1';
        const tag = _buildProcessTag(RUN_ID, taskId, 1);
        const child = spawnTaggedChild(tag);
        spawnedPids.push(child.pid);
        await sleep(500); // let the OS finish registering the process

        let state = new store.State(baseStateFields({})).addTask(taskId, { dependencies: [] });
        state = state.addAttempt(taskId, { stage: 'dispatching', processIdentity: tag });
        store.writeState(executionRoot, RUN_ID, state);

        expect(isAlive(child.pid)).toBe(true);

        const result = await stop({
          project: repoDir,
          runId: RUN_ID,
          mode: 'immediate',
          exeBasename: NODE_EXE_BASENAME,
        });

        expect(result.requestAccepted).toBe(true);
        expect(result.terminationConfirmed).toBe(true);
        expect(result.killAttempts).toEqual([
          { taskId: taskId, attemptNumber: 1, processIdentity: tag, confirmed: true },
        ]);

        // Real, independent OS-level confirmation — not just this module's
        // own report of itself.
        expect(isAlive(child.pid)).toBe(false);

        const after = store.readState(executionRoot, RUN_ID);
        expect(after.runStatus).toBe('stopping');
        expect(after.config.stopRequest.mode).toBe('immediate');
      },
      20000
    );

    itWindowsOnly(
      'does NOT touch a live tagged process whose attempt is at a non-in-flight stage (e.g. "checkpoint-prepared")',
      async () => {
        const taskId = 'T1';
        const tag = _buildProcessTag(RUN_ID, taskId, 1);
        const child = spawnTaggedChild(tag);
        spawnedPids.push(child.pid);
        await sleep(500);

        // 'checkpoint-prepared' is not 'dispatching'/'running' — this attempt
        // is not "potentially mid-flight" per the Work Breakdown outcome's own
        // scoping, even though its processIdentity happens to still resolve
        // to a genuinely live process (e.g. a coordinator that has already
        // moved past dispatch but not yet reaped/cleared the tag).
        let state = new store.State(baseStateFields({})).addTask(taskId, { dependencies: [] });
        state = state.addAttempt(taskId, { stage: 'checkpoint-prepared', processIdentity: tag });
        store.writeState(executionRoot, RUN_ID, state);

        const result = await stop({
          project: repoDir,
          runId: RUN_ID,
          mode: 'immediate',
          exeBasename: NODE_EXE_BASENAME,
        });

        expect(result.terminationConfirmed).toBe(true); // vacuous: no in-flight candidate found
        expect(result.killAttempts).toEqual([]);

        // Untouched: still genuinely alive.
        expect(isAlive(child.pid)).toBe(true);
      },
      20000
    );
  });

  // ── DEFAULT_TAGGED_PROCESS_EXE_BASENAME sanity (no real spawn needed) ──

  test('immediate mode defaults exeBasename to DEFAULT_TAGGED_PROCESS_EXE_BASENAME when not overridden', async () => {
    // No attempt at an in-flight stage at all, so the default basename is
    // never actually queried against — this only proves the vacuous path
    // still runs to completion without requiring args.exeBasename.
    let state = new store.State(baseStateFields({})).addTask('T1', { dependencies: [] });
    store.writeState(executionRoot, RUN_ID, state);

    const result = await stop({ project: repoDir, runId: RUN_ID, mode: 'immediate' });
    expect(result.terminationConfirmed).toBe(true);
    expect(typeof DEFAULT_TAGGED_PROCESS_EXE_BASENAME).toBe('string');
  });
});

// ── execute()'s loop-cooperation fix: full integration ───────────────────

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
    L.push(['PHASE-1', 'Stop test phase', 'feat: stop test', '', task.id, task.title, task.domain, task.agentType].join('|'));
  });
  return L.join('\n') + '\n';
}

function writeWorkBreakdownFixture(featureDir, prefix, tasks) {
  fs.mkdirSync(featureDir, { recursive: true });
  writeFile(featureDir, 'feature.md', '# Stop Test Feature\n\nFixture feature for stop.test.js.\n');
  writeFile(featureDir, prefix + '-Work-Breakdown.md', buildMarkdown(prefix, tasks));
  writeFile(featureDir, prefix + '-Work-Breakdown.csv', buildCsv(tasks));
}

describe('execute() + stop(): graceful loop-cooperation (US-07-TASK-BE-02)', () => {
  let tmpDir;
  let repoDir;
  let featureDir;
  let executionRoot;
  let verifyIdentitySpy;
  let writeStateSpy;
  let originalPlatform;

  beforeEach(() => {
    // US-08-TASK-BE-05's platform guard is execute()'s literal first
    // statement, refusing to run at all on non-win32. This describe block's
    // test exercises graceful stop-cooperation using the fake CLI fixture
    // only (no real Windows-only process-liveness check) — overriding here
    // lets execute() past the guard on any host OS. The file's other,
    // genuinely Windows-only real-process tests use their own itWindowsOnly
    // gating (evaluated at module load time from the real process.platform,
    // unaffected by this runtime override) and are untouched.
    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-integ-test-'));
    repoDir = path.join(tmpDir, 'repo');
    featureDir = path.join(tmpDir, 'FTR-778-stop-test');
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
    if (writeStateSpy) {
      writeStateSpy.mockRestore();
      writeStateSpy = null;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  test(
    'a graceful stop() requested exactly when task A checkpoints stops the loop before task B is ever dispatched, leaving B pending and the final run "paused"',
    async () => {
      const TASK_A = 'US-07-TASK-STOP-A';
      const TASK_B = 'US-07-TASK-STOP-B';
      const tasks = [
        {
          id: TASK_A,
          title: 'Task A',
          outcome: 'Task A completes',
          domain: 'BE',
          agentType: 'developer-backend',
          dependsOn: [],
          verificationCommands: ['test -f ' + TASK_A + '.output.txt'],
        },
        {
          id: TASK_B,
          title: 'Task B',
          outcome: 'Task B completes after A',
          domain: 'BE',
          agentType: 'developer-backend',
          dependsOn: [TASK_A],
          verificationCommands: ['test -f ' + TASK_B + '.output.txt'],
        },
      ];
      writeWorkBreakdownFixture(featureDir, 'FTR-778', tasks);

      // Deterministic same-tick hook (no timing race): stop()'s 'graceful'
      // path is entirely synchronous fs I/O (store.readState/requestStop/
      // writeState, no `await` reached before it returns) — see stop()'s own
      // doc comment. Firing it from inside this synchronous writeState
      // wrapper, at the exact write that marks task A 'checkpointed', means
      // by the time this wrapper returns, runStatus 'stopping' is already
      // durably on disk — so execute()'s very next loop-top readState (the
      // natural iteration boundary the Work Breakdown outcome describes)
      // is guaranteed to observe it, with no sleep/poll needed in this test.
      const realWriteState = store.writeState;
      let stopTriggered = false;
      writeStateSpy = jest.spyOn(store, 'writeState').mockImplementation(function (executionRootArg, runIdArg, stateArg) {
        const result = realWriteState(executionRootArg, runIdArg, stateArg);
        if (!stopTriggered && result.tasks[TASK_A] && result.tasks[TASK_A].status === 'checkpointed') {
          stopTriggered = true;
          // Not awaited here: 'graceful' stop() has no async gap, so this
          // has already fully executed (readState + requestStop + writeState)
          // by the time this call returns control to us.
          stop({ project: repoDir, runId: runIdArg, mode: 'graceful' });
        }
        return result;
      });

      const result = await execute({
        project: repoDir,
        feature: path.join(featureDir, 'feature.md'),
        claudePath: NODE,
        taskTimeoutMs: 15000,
        agentBudgetUsd: 5,
        implementationSpawnArgs: [FIXTURE, '--mode=write-file-and-succeed'],
        reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
      });

      expect(stopTriggered).toBe(true);
      expect(result.runStatus).toBe('paused');
      expect(result.tasks.sort((a, b) => a.taskId.localeCompare(b.taskId))).toEqual([
        { taskId: TASK_A, status: 'checkpointed' },
        { taskId: TASK_B, status: 'pending' },
      ]);

      // Task A really completed (real file, real commit); task B was NEVER
      // dispatched — no file, no attempts recorded at all.
      expect(fs.existsSync(path.join(repoDir, TASK_A + '.output.txt'))).toBe(true);
      expect(fs.existsSync(path.join(repoDir, TASK_B + '.output.txt'))).toBe(false);

      const state = store.readState(executionRoot, result.runId);
      expect(state.tasks[TASK_B].attempts).toEqual([]);
      expect(state.runStatus).toBe('paused');
      expect(state.config.stopRequest).toMatchObject({ mode: 'graceful' });

      // The repo-wide execution lease was still released — execute()'s own
      // try/finally releases it regardless of how the loop exited.
      expect(ownership.readLease(executionRoot)).toBeNull();
    }
  );
});
