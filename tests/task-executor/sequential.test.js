'use strict';

// Sequential execution end-to-end tests (US-07-TASK-TEST-01, FTR-018),
// completing User Story US-07 "sequential execution with one active task".
//
// This file is DELIBERATELY a different, new file from:
//   - tests/task-executor/executor.sequential.test.js (US-07-TASK-BE-01's own
//     test): already proves a real 3-task dependency chain runs strictly in
//     order to completion via real git commit parentage, the mandatory
//     negative test (false self-report caught by real verification), and
//     UNSUPPORTED_CONCURRENCY rejection.
//   - tests/task-executor/stop.test.js (US-07-TASK-BE-02's own test): already
//     proves stop() validation/idempotency/both modes in isolation, a real
//     tagged-process kill+confirm, and one deterministic execute()+stop()
//     graceful-cooperation integration test (task A checkpoints, task B never
//     dispatched, final runStatus 'paused').
//
// This file adds only what neither of those already covers, chaining the
// REAL functions end-to-end (dispatchTaskAttempt via execute(), execute,
// stop, reconcile, resume — never re-testing any single function's
// unit-level internals):
//   1. The "one-at-a-time capacity invariant" (AC-06) as its OWN explicit
//      assertion, independent of "did the run finish in order": a passthrough
//      spy on store.writeState observes EVERY real, persisted state snapshot
//      written during a real 3-task run and asserts that no such snapshot
//      ever shows more than one task with status 'active' at once. Every
//      call site that can set OR clear a task's 'active' status
//      (lib/task-executor/index.js's three setTaskStatus call sites, all
//      followed immediately by store.writeState(...)) is a module-level
//      property access on the `store` object, so jest.spyOn's passthrough
//      wrapper genuinely intercepts every one of them — this is a real,
//      exhaustive observation of the run's own persisted history, not a
//      sample.
//   2. "Partial results before stop": a real 3-task execute() run where a
//      REAL stop({mode:'immediate'}) is issued the moment the second task's
//      attempt is genuinely 'dispatching' (a real, live, tagged worker
//      process — the exact real-tagged-process technique already
//      established by stop.test.js's own itWindowsOnly real-kill test and
//      resume-replan.test.js's own dead-worker test). Confirms task 1 is
//      fully checkpointed with a real commit, task 2's in-flight worker is
//      really killed (stop()'s own real, unmocked OS-level confirmation),
//      and task 3 is never touched.
//   3. "Recovery on resume": calls the REAL reconcile()/resume() (US-06)
//      against that same run afterward and confirms they report the correct
//      evidence-based classification for all three tasks, without triggering
//      any re-execution of already-completed or never-started work.
//
// TWO ARCHITECTURE FINDINGS surfaced while designing test #2/#3 below (both
// are plain observations for the orchestrator, NOT bugs silently patched —
// lib/task-executor/*.js was not modified):
//
//   FINDING A (expected, per this task's own instructions): resume() only
//   reconciles and reports; it never dispatches new work. Confirmed by
//   direct inspection of lib/task-executor/index.js's resume() (calls only
//   _ensureNoLiveCompetingCoordinator + reconcile() + store.readState — no
//   dispatchTaskAttempt/runVerifications/runReview call anywhere in it) and
//   of execute() (always mints `runId = crypto.randomUUID()` unconditionally
//   and always calls `state.addTask(...)` fresh for every plan task — there
//   is no parameter or code path that accepts an existing runId to continue).
//   There is currently no way to actually finish/continue an interrupted run
//   — only to safely inspect and reconcile it. Test #3 below empirically
//   confirms this for the never-started task (it stays at zero attempts,
//   with no dispatched worker/file, after resume() returns).
//
//   FINDING B (originally observed by this task; FIXED — see
//   _runTaskToResolution's own retry-loop stop-awareness checks, added right
//   after each of its two _isBeyondRetryPolicy checks): the inner per-task
//   retry loop (the `for (;;) {...}` loop that would otherwise dispatch
//   attempt 2 after attempt 1 fails verification) now ALSO checks
//   state.runStatus === 'stopping' before looping back to dispatch another
//   attempt — not just execute()'s OUTER loop, which only observes
//   'stopping' BETWEEN different ready tasks, never between retry attempts
//   of the SAME task. Consequence of the fix: an immediate stop requested
//   while a task's attempt 1 is genuinely dispatching now prevents that same
//   task from ever being dispatched again for attempt 2 — the run notices
//   the pending stop immediately after the killed attempt's own verification
//   settles, rather than after the task's full retry budget is consumed.
//   This matches Tech-Spec section 7's stop semantics ("immediate: request
//   termination of the owned process tree; wait for confirmed terminal
//   state" — "stop work on this task now"). Per the fix's own contract, the
//   interrupted task's status is deliberately left as whatever it already
//   was ('active', from the top of the retry loop) rather than forced to
//   'blocked' — 'blocked' specifically means "retry policy exhausted", which
//   is not what happened here; the task was interrupted by a stop request,
//   a different, honest outcome. Test #2 below asserts this CORRECTED
//   behavior (task 2 ends with exactly ONE real, killed attempt, status
//   still 'active', never advanced to 'blocked'; the run still pauses).
//
// SAFETY (mirrors executor.sequential.test.js's and stop.test.js's exact
// discipline):
//   - NO test in this file ever spawns real claude.exe or makes a real LLM/
//     API call. Every dispatched "agent" is tests/fixtures/fake-claude-cli.js,
//     invoked via process.execPath (the local Node binary) as the
//     `claudePath` — a deterministic, LLM-free, zero-cost Node script.
//   - claudeProcess.verifyAgentIdentity is stubbed via jest.spyOn (same house
//     style as every other task-executor integration test).
//   - Every Git operation in this suite runs against a repository created
//     fresh, per test, under fs.mkdtempSync(os.tmpdir()), with a LOCAL
//     (repo-scoped only) user.name/user.email set via `git config` (never
//     --global). No git command in this file ever targets this project's own
//     working tree. Every tmp repo is removed in afterEach.
//   - Real process-liveness/kill assertions are gated itWindowsOnly (E-02
//     evidence spike qualification), exactly like stop.test.js and
//     resume-replan.test.js.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const store = require('../../lib/task-executor/store');
const ownership = require('../../lib/task-executor/ownership');
const claudeProcess = require('../../lib/task-executor/claude-process');
const { execute, stop, reconcile, resume, _buildProcessTag } = require('../../lib/task-executor/index');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-claude-cli.js');
const NODE = process.execPath;
const NODE_EXE_BASENAME = path.basename(process.execPath); // 'node.exe' on Windows
const IS_WINDOWS = process.platform === 'win32';
// Real process-liveness/kill assertions are only qualified on Windows (E-02
// evidence spike) — mirrors stop.test.js's own itWindowsOnly gating exactly.
const itWindowsOnly = IS_WINDOWS ? test : test.skip;

const VERIFIED_IDENTITY = {
  agentId: 'gaia.agent.developer.backend',
  nativeName: 'gaia-developer-backend',
  sha256: 'sha256:' + 'f'.repeat(64),
  path: '/fake/path/gaia-developer-backend.md',
  manifestPath: '/fake/path/.ai-toolkit-manifest.json',
  toolkitVersion: '0.13.0',
  scope: 'project',
};

// Real subprocess spawns, real git operations, a real tree-kill and a real
// (bounded) taskTimeoutMs-triggered auto-kill all happen in test #2 below —
// generous allowance, matching every other real-spawn suite in this project.
jest.setTimeout(60000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Bounded poll: repeatedly evaluates `predicateFn` (which must return a
// truthy value once its condition is satisfied, or a falsy value otherwise)
// until it succeeds or `maxAttempts` is exhausted. Never an unbounded loop.
async function waitFor(predicateFn, opts) {
  opts = opts || {};
  const intervalMs = opts.intervalMs || 50;
  const maxAttempts = opts.maxAttempts || 400;
  const label = opts.label || 'condition';
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const value = predicateFn();
    if (value) return value;
    await sleep(intervalMs);
  }
  throw new Error('waitFor: timed out waiting for: ' + label);
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

// ── Minimal real Work-Breakdown.md/.csv fixture builder ─────────────────────
// Same byte-for-byte structural style as executor.sequential.test.js's own
// builder (kept as its own copy per this suite's own file-local convention —
// no shared helper module between task-executor test files).

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
    L.push(['PHASE-1', 'Sequential recovery test phase', 'feat: sequential recovery test', '', task.id, task.title, task.domain, task.agentType].join('|'));
  });
  return L.join('\n') + '\n';
}

function writeWorkBreakdownFixture(featureDir, prefix, tasks) {
  fs.mkdirSync(featureDir, { recursive: true });
  writeFile(featureDir, 'feature.md', '# Sequential Recovery Test Feature\n\nFixture feature for sequential.test.js.\n');
  writeFile(featureDir, prefix + '-Work-Breakdown.md', buildMarkdown(prefix, tasks));
  writeFile(featureDir, prefix + '-Work-Breakdown.csv', buildCsv(tasks));
}

describe('sequential execution end-to-end (US-07-TASK-TEST-01)', () => {
  let tmpDir;
  let repoDir;
  let featureDir;
  let executionRoot;
  let verifyIdentitySpy;
  let originalPlatform;

  beforeEach(() => {
    // US-08-TASK-BE-05's platform guard is execute()'s literal first
    // statement, refusing to run at all on non-win32. Overriding here lets
    // it past that guard on any host OS so the real logic below actually
    // runs; this file's own itWindowsOnly gating (line ~122, evaluated at
    // module load time from the REAL process.platform, before this runtime
    // override ever applies) is unaffected — the genuinely Windows-only
    // real-process scenario below still correctly skips on non-Windows.
    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'executor-seq-recovery-test-'));
    repoDir = path.join(tmpDir, 'repo');
    featureDir = path.join(tmpDir, 'FTR-779-seq-recovery-test');
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

  // ── Scenario 1: one-at-a-time capacity invariant ──────────────────────────

  test(
    'one-at-a-time capacity invariant: no persisted state snapshot during a real 3-task run ever shows more than one task with status "active"',
    async () => {
      const TASK_1 = 'US-07-TASK-SEQ-CAP-01';
      const TASK_2 = 'US-07-TASK-SEQ-CAP-02';
      const TASK_3 = 'US-07-TASK-SEQ-CAP-03';
      const tasks = [
        {
          id: TASK_1, title: 'Capacity chain task one', outcome: 'First task completes',
          domain: 'BE', agentType: 'developer-backend', dependsOn: [],
          verificationCommands: ['test -f ' + TASK_1 + '.output.txt'],
        },
        {
          id: TASK_2, title: 'Capacity chain task two', outcome: 'Second task completes after the first',
          domain: 'BE', agentType: 'developer-backend', dependsOn: [TASK_1],
          verificationCommands: ['test -f ' + TASK_2 + '.output.txt'],
        },
        {
          id: TASK_3, title: 'Capacity chain task three', outcome: 'Third task completes last',
          domain: 'BE', agentType: 'developer-backend', dependsOn: [TASK_2],
          verificationCommands: ['test -f ' + TASK_3 + '.output.txt'],
        },
      ];
      writeWorkBreakdownFixture(featureDir, 'FTR-779', tasks);

      // Passthrough spy: calls the REAL store.writeState (via a captured
      // reference to it), then inspects the exact state object it just
      // durably wrote. Every one of index.js's setTaskStatus('active'/
      // 'blocked'/'checkpointed') call sites is followed immediately by a
      // store.writeState(...) call (a property access on the `store` module
      // object at call time, not a bound/cached reference) — so this spy
      // genuinely observes every persisted snapshot capable of showing a
      // task's status, across the WHOLE real run, not a timing-dependent
      // sample.
      const realWriteState = store.writeState;
      let maxConcurrentActive = 0;
      let observedActiveWriteCount = 0;
      const violations = [];
      const writeStateSpy = jest.spyOn(store, 'writeState').mockImplementation(function (executionRootArg, runIdArg, stateArg) {
        const written = realWriteState(executionRootArg, runIdArg, stateArg);
        const activeTaskIds = Object.keys(written.tasks).filter(function (id) {
          return written.tasks[id].status === 'active';
        });
        if (activeTaskIds.length > 0) observedActiveWriteCount++;
        if (activeTaskIds.length > maxConcurrentActive) maxConcurrentActive = activeTaskIds.length;
        if (activeTaskIds.length > 1) {
          violations.push({ generation: written.generation, activeTaskIds: activeTaskIds });
        }
        return written;
      });

      let result;
      try {
        result = await execute({
          project: repoDir,
          feature: path.join(featureDir, 'feature.md'),
          claudePath: NODE,
          taskTimeoutMs: 15000,
          agentBudgetUsd: 5,
          implementationSpawnArgs: [FIXTURE, '--mode=write-file-and-succeed'],
          reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
        });
      } finally {
        writeStateSpy.mockRestore();
      }

      expect(result.runStatus).toBe('completed');

      // The invariant itself: across EVERY real persisted write this run
      // ever made, never more than one task was 'active' at once.
      expect(violations).toEqual([]);
      expect(maxConcurrentActive).toBeLessThanOrEqual(1);
      // Sanity: the spy actually observed real 'active' writes (at least one
      // per task) — this is not a vacuously-passing assertion over an empty
      // observation set.
      expect(observedActiveWriteCount).toBeGreaterThanOrEqual(tasks.length);
    }
  );

  // ── Scenarios 2 + 3: partial results before stop, then recovery on resume ──

  describe('immediate stop mid-flight on task 2, then reconcile()/resume() evidence-based recovery', () => {
    itWindowsOnly(
      'task 1 checkpoints for real, task 2 is really killed mid-dispatch and the stop is honored before a retry attempt is dispatched, task 3 is never touched, and reconcile()/resume() report correct evidence without dispatching further work',
      async () => {
        const TASK_A = 'US-07-TASK-SEQ-STOP-A';
        const TASK_B = 'US-07-TASK-SEQ-STOP-B';
        const TASK_C = 'US-07-TASK-SEQ-STOP-C';
        const tasks = [
          {
            id: TASK_A, title: 'Stop-chain task A', outcome: 'Task A completes normally',
            domain: 'BE', agentType: 'developer-backend', dependsOn: [],
            verificationCommands: ['test -f ' + TASK_A + '.output.txt'],
          },
          {
            id: TASK_B, title: 'Stop-chain task B', outcome: 'Task B is killed mid-flight',
            domain: 'BE', agentType: 'developer-backend', dependsOn: [TASK_A],
            verificationCommands: ['test -f ' + TASK_B + '.output.txt'],
          },
          {
            id: TASK_C, title: 'Stop-chain task C', outcome: 'Task C must never be dispatched',
            domain: 'BE', agentType: 'developer-backend', dependsOn: [TASK_B],
            verificationCommands: ['test -f ' + TASK_C + '.output.txt'],
          },
        ];
        writeWorkBreakdownFixture(featureDir, 'FTR-779', tasks);

        // One static implementationSpawnArgs configuration applies to EVERY
        // task's dispatch during this run (execute()'s own contract — see
        // its own args.implementationSpawnArgs doc comment); 'conditional-hang'
        // (tests/fixtures/fake-claude-cli.js) resolves this by hanging (real,
        // tagged, tree-killable process) ONLY for TASK_B's dispatches, and
        // behaving exactly like 'write-file-and-succeed' for every other task.
        const executePromise = execute({
          project: repoDir,
          feature: path.join(featureDir, 'feature.md'),
          claudePath: NODE,
          // Belt-and-braces bound: with the stop-awareness fix, TASK_B's
          // attempt 2 is never dispatched (the retry loop returns as soon as
          // it observes the already-persisted 'stopping' runStatus), so this
          // timeout is not expected to fire in the steady-state assertions
          // below — kept short regardless so a regression back to FINDING B's
          // original (dispatch-attempt-2-anyway) behavior still terminates
          // for real well within this test's own 60s ceiling instead of
          // hanging.
          taskTimeoutMs: 4000,
          agentBudgetUsd: 5,
          implementationSpawnArgs: [FIXTURE, '--mode=conditional-hang', '--hang-task-id=' + TASK_B],
          reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
        });

        // Discover the real runId execute() minted (no other run exists in
        // this fresh executionRoot).
        const runId = await waitFor(
          function () {
            const runsDir = path.join(executionRoot, 'runs');
            if (!fs.existsSync(runsDir)) return null;
            const entries = fs.readdirSync(runsDir);
            return entries.length > 0 ? entries[0] : null;
          },
          { label: 'a run directory to appear under ' + executionRoot }
        );

        // Wait for TASK_B's attempt 1 to be genuinely, durably 'dispatching'
        // (processIdentity persisted BEFORE the real subprocess spawn, per
        // dispatchTaskAttempt's own persist-before-invoke ordering) — this
        // also means TASK_A already reached a terminal status by now, since
        // the outer loop dispatches strictly one ready task at a time.
        await waitFor(
          function () {
            let state;
            try { state = store.readState(executionRoot, runId); } catch (_) { return null; }
            const task = state.tasks[TASK_B];
            const last = task && task.attempts[task.attempts.length - 1];
            return (last && last.stage === 'dispatching' && typeof last.processIdentity === 'string' && last.processIdentity.length > 0)
              ? last
              : null;
          },
          { label: 'task ' + TASK_B + '\'s attempt 1 to reach stage "dispatching"' }
        );
        await sleep(500); // let the OS finish registering the process (mirrors stop.test.js's own real-kill test)

        const stopResult = await stop({
          project: repoDir,
          runId: runId,
          mode: 'immediate',
          exeBasename: NODE_EXE_BASENAME,
        });

        expect(stopResult.requestAccepted).toBe(true);
        expect(stopResult.mode).toBe('immediate');
        expect(stopResult.terminationConfirmed).toBe(true);
        expect(stopResult.killAttempts).toEqual([
          { taskId: TASK_B, attemptNumber: 1, processIdentity: _buildProcessTag(runId, TASK_B, 1), confirmed: true },
        ]);

        // Let the real run finish: TASK_B's attempt 1 (just killed) fails
        // real verification (no file was ever written) and — see FINDING B
        // in this file's own header comment, now FIXED — the inner retry
        // loop observes the already-persisted 'stopping' runStatus right
        // there and returns without dispatching attempt 2. The outer loop
        // then notices 'stopping' on its very next iteration and pauses.
        const result = await executePromise;

        expect(result.runStatus).toBe('paused');
        expect(result.tasks.sort((a, b) => a.taskId.localeCompare(b.taskId))).toEqual([
          { taskId: TASK_A, status: 'checkpointed' },
          // Interrupted by the stop request while still within retry policy
          // — deliberately NOT 'blocked' (that status means "retry policy
          // exhausted", which is not what happened here). Left exactly as
          // the retry loop set it at the top of its attempt-1 iteration.
          { taskId: TASK_B, status: 'active' },
          { taskId: TASK_C, status: 'pending' },
        ]);

        // Real, durable partial results: task A's file/commit survive; task
        // B's/C's files were never written at all.
        expect(fs.existsSync(path.join(repoDir, TASK_A + '.output.txt'))).toBe(true);
        expect(fs.existsSync(path.join(repoDir, TASK_B + '.output.txt'))).toBe(false);
        expect(fs.existsSync(path.join(repoDir, TASK_C + '.output.txt'))).toBe(false);
        expect(gitCmd(repoDir, ['log', '--oneline']).trim().split('\n')).toHaveLength(2); // "init" + task A's real commit

        const state = store.readState(executionRoot, runId);

        const taskAState = state.tasks[TASK_A];
        expect(taskAState.status).toBe('checkpointed');
        expect(taskAState.attempts).toHaveLength(1);
        expect(taskAState.attempts[0].stage).toBe('committed');
        expect(taskAState.attempts[0].originalSha).toMatch(/^[0-9a-f]{40}$/);

        const taskBState = state.tasks[TASK_B];
        // 'active', not 'blocked': the stop-awareness fix returns without
        // forcing a status change once it observes 'stopping' still within
        // retry policy (see FINDING B, fixed).
        expect(taskBState.status).toBe('active');
        expect(taskBState.attempts).toHaveLength(1); // attempt 2 never dispatched (FINDING B, fixed)
        taskBState.attempts.forEach(function (attempt) {
          expect(attempt.stage).toBe('failed');
          expect(attempt.terminalReason).toBe('verification-failed');
          expect(attempt.originalSha).toBeNull(); // never staged/committed
        });

        const taskCState = state.tasks[TASK_C];
        expect(taskCState.status).toBe('pending');
        expect(taskCState.attempts).toEqual([]); // never touched at all

        // The repo-wide execution lease was still released — execute()'s
        // own try/finally releases it regardless of how the loop exited.
        expect(ownership.readLease(executionRoot)).toBeNull();

        // ── Recovery on resume (US-06) ───────────────────────────────────

        const taskRef = 'refs/heads/' + gitCmd(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();

        const reconcileResult = await reconcile({
          executionRoot: executionRoot,
          runId: runId,
          projectDir: repoDir,
          taskRef: taskRef,
          exeBasename: NODE_EXE_BASENAME,
        });

        expect(reconcileResult.classifications.sort((a, b) => a.taskId.localeCompare(b.taskId))).toEqual([
          { taskId: TASK_A, classification: 'up-to-date', action: 'keep-completion' },
          // Task B was left non-terminal ('active', one real failed attempt)
          // by the stop-awareness fix (see FINDING B, fixed) — reconcile()
          // correctly reports its real evidence-based classification (a
          // failed attempt still within retry policy) rather than treating
          // the interruption as "blocked" or reopening/reinterpreting it.
          { taskId: TASK_B, classification: 'failed', action: 'needs-new-attempt-subject-to-retry-policy' },
          { taskId: TASK_C, classification: 'not-started', action: 'none' },
        ]);
        // Task A's completion is genuinely up-to-date evidence — no repair
        // needed for any task.
        expect(reconcileResult.repairsApplied).toEqual([]);

        const resumeResult = await resume({
          executionRoot: executionRoot,
          runId: runId,
          projectDir: repoDir,
          taskRef: taskRef,
          exeBasename: NODE_EXE_BASENAME,
        });

        expect(resumeResult.runStatus).toBe('paused'); // resume() never advances/finishes a run itself
        expect(resumeResult.tasks.sort((a, b) => a.taskId.localeCompare(b.taskId))).toEqual([
          { taskId: TASK_A, status: 'checkpointed', nextAction: 'keep-completion' },
          { taskId: TASK_B, status: 'active', nextAction: 'needs-new-attempt-subject-to-retry-policy' },
          { taskId: TASK_C, status: 'pending', nextAction: 'none' },
        ]);

        // FINDING A, empirically confirmed: resume() did NOT dispatch task
        // C (or a new attempt for task B) — no new file, no new attempt
        // recorded, run status still 'paused', not 'completed'/'running'.
        const stateAfterResume = store.readState(executionRoot, runId);
        expect(stateAfterResume.tasks[TASK_C].attempts).toEqual([]);
        expect(fs.existsSync(path.join(repoDir, TASK_C + '.output.txt'))).toBe(false);
        expect(stateAfterResume.runStatus).toBe('paused');
      },
      60000
    );
  });
});
