'use strict';

// Parallel execution end-to-end tests (US-08-TASK-TEST-01, FTR-018),
// completing User Story US-08 ("parallel execution with N isolated
// worktrees") at the primitive level.
//
// CRITICAL SCOPE NOTE (matches every other US-08 file's own header): execute()'s
// real main loop (US-07-TASK-BE-01/02) is STILL N=1/sequential ONLY — it
// explicitly rejects any maxConcurrency other than 1 (UNSUPPORTED_CONCURRENCY,
// see tests/task-executor/executor.sequential.test.js's own test for that).
// ALL of US-08's BE tasks so far (createTaskWorktree, createSlotPool,
// integrateAttempt, registerIntegratedSHA) are STANDALONE PRIMITIVES, never
// wired into execute(). There is no real "execute() with maxConcurrency=N"
// code path to call. This file's job is to manually orchestrate those real,
// already-implemented primitives together — exactly like
// tests/task-executor/verification-review.test.js, resume-replan.test.js and
// sequential.test.js manually chain real functions — to PROVE they compose
// correctly for a parallel scenario. It does not invoke a not-yet-existing
// N>1 execute() path, and does not build one (that would be production code,
// out of scope for a TEST task).
//
// Every real primitive used below already has its own dedicated unit/
// integration test file, which this suite deliberately does NOT re-test in
// isolation:
//   - createSlotPool                    -> tests/task-executor/concurrency.test.js
//   - createTaskWorktree                -> tests/task-executor/worktree-creation.test.js
//   - dispatchTaskAttempt/runVerifications/runReview
//                                       -> tests/lib/executor.dispatch.test.js,
//                                          executor.verification.test.js, executor.review.test.js
//   - store.persistVerificationReviewOutcome
//                                       -> tests/lib/store.verification-review-outcome.test.js
//   - git.persistCheckpointIntent/stageTaskFiles/createTaskCommit
//                                       -> tests/lib/git.checkpoint-intent.test.js,
//                                          git.staging.test.js, git.commit.test.js
//   - store.registerCommitSHA          -> tests/lib/store.sha-registration.test.js
//   - git.integrateAttempt             -> tests/lib/git.integration.test.js
//   - store.registerIntegratedSHA      -> tests/lib/store.sha-tracking.test.js
// This file's only job is proving the composition, not the internals.
//
// TWO FINDINGS surfaced while designing this suite (both are plain
// observations for the orchestrator, NOT bugs silently patched — none of
// lib/task-executor/*.js was modified while writing this file):
//
//   FINDING A: store.js's State.recordDispatch(taskId, attemptNumber) (which
//   appends to state.dispatchSequence — the field the Tech-Spec says
//   integration order must be driven by: "Record a monotonically assigned
//   dispatch sequence; integration follows that sequence, never completion
//   timing") is a real, already-implemented, already-unit-tested State method
//   (tests/lib/store.test.js: "recordDispatch and recordIntegration append
//   monotonic sequence entries"). But a repo-wide grep confirms NO production
//   code path anywhere in lib/task-executor/index.js (dispatchTaskAttempt,
//   execute(), or anywhere else) ever calls it. dispatchSequence is therefore
//   always `[]` in any real run today. This suite calls the real
//   state.recordDispatch(...) itself (a real, tested primitive) at the exact
//   point each attempt is dispatched, precisely so the serial-integration
//   scenario below can genuinely reuse a real, persisted dispatchSequence to
//   derive integration order (per this task's own instructions) — but a
//   future N>1 wiring task must actually call recordDispatch from
//   dispatchTaskAttempt (or its future N>1 caller) for this to happen for
//   real outside of a test harness.
//
//   FINDING B: dispatchTaskAttempt's "persist-before-invoke" step (index.js,
//   step 3) only rejects a caller-requested attemptNumber via
//   ATTEMPT_NUMBER_MISMATCH when NO existing attempt record matches that
//   number AND it does not equal the task's current attempts.length + 1
//   (a genuine "skip-ahead" request). When TWO concurrent calls request the
//   SAME, not-yet-existing attemptNumber for the SAME task (the realistic
//   "duplicate dispatch" scenario a buggy N>1 scheduler could produce), the
//   analysis below (confirmed empirically by the "dedup prevention" describe
//   block) shows the SECOND call does NOT get rejected: by the time its own
//   internal store.readState() runs, the FIRST call's synchronous
//   persist-before-invoke prefix (readState -> addAttempt -> writeState ->
//   updateAttempt(stage:'dispatching') -> writeState, all synchronous, no
//   await) has already completed in full (Node's single-threaded execution
//   model guarantees this — dispatchTaskAttempt has no `await` until its
//   final claudeProcess.spawnClaudeAgent call), so the second call's own
//   `existingAttempt` lookup FINDS the first call's just-added attempt and
//   takes the "resumed dispatch" branch (index.js: "uses updateAttempt (not
//   addAttempt) when the attempt already exists") instead of the
//   ATTEMPT_NUMBER_MISMATCH branch. This branch does NOT check whether the
//   attempt it is "resuming" is already live/dispatching — it unconditionally
//   writes processIdentity again and proceeds to spawn its OWN real
//   subprocess for the same nominal attempt. The net effect, EMPIRICALLY
//   CONFIRMED by the "dedup prevention" describe block below: two concurrent
//   calls for the identical task+attemptNumber both genuinely dispatch real
//   subprocesses (neither rejects) — real double-dispatch is not prevented at
//   this layer for this specific race. It is actually WORSE than a simple
//   "last write wins" overwrite: processIdentity is `_buildProcessTag(runId,
//   taskId, attemptNumber)` — a value derived ONLY from those three already-
//   identical inputs, so it is byte-identical for both calls. Persisted state
//   therefore cannot even show that two separate real processes were spawned
//   for this nominal attempt at all — both writes produce the exact same tag.
//   This also means the OS-level liveness tagging mechanism this same tag
//   feeds (_findLiveTaggedProcess, used by reconcile/resume/stop) could find
//   TWO live real processes carrying the identical tag in this scenario,
//   which none of its existing tests exercise (they all assume at most one
//   real tagged process per attempt). Genuine protection against this race
//   exists only for a caller that requests a MISMATCHED (skip-ahead) number,
//   and across coordinators via the repo-wide ownership lease (NO_LOCK_HELD)
//   — both proven below. This is reported plainly per this task's own
//   instructions, not patched.
//
// SAFETY (mirrors every other tests/task-executor/*.test.js file's exact
// discipline):
//   - NO test in this file ever spawns real claude.exe or makes a real LLM/
//     API call. Every dispatched "agent" is tests/fixtures/fake-claude-cli.js,
//     invoked via process.execPath (the local Node binary) as the
//     `claudePath` — a deterministic, LLM-free, zero-cost Node script.
//   - claudeProcess.verifyAgentIdentity is stubbed via jest.spyOn (same house
//     style as every other task-executor integration test).
//   - Every Git operation in this suite runs against a repository (and its
//     linked worktrees) created fresh, per test, under
//     fs.mkdtempSync(os.tmpdir()), with a LOCAL (repo-scoped only)
//     user.name/user.email set via `git config` (never --global). No git
//     command in this file ever targets this project's own working tree.
//     Every tmp repo (and every worktree it owns) is removed wholesale via
//     fs.rmSync(tmpDir) in afterEach.
//   - No itWindowsOnly/real-process-liveness assertions are needed in this
//     file: every scenario below is about git/slot/integration mechanics, not
//     OS-level process supervision (already covered by stop.test.js /
//     resume-replan.test.js / executor.sequential.test.js).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const store = require('../../lib/task-executor/store');
const ownership = require('../../lib/task-executor/ownership');
const claudeProcess = require('../../lib/task-executor/claude-process');
const git = require('../../lib/task-executor/git');
const { dispatchTaskAttempt, runVerifications, runReview, createTaskWorktree, createSlotPool } = require('../../lib/task-executor/index');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-claude-cli.js');
const NODE = process.execPath;

const VERIFIED_IDENTITY = {
  agentId: 'gaia.agent.developer.backend',
  nativeName: 'gaia-developer-backend',
  sha256: 'sha256:' + 'e'.repeat(64),
  path: '/fake/path/gaia-developer-backend.md',
  manifestPath: '/fake/path/.ai-toolkit-manifest.json',
  toolkitVersion: '0.13.0',
  scope: 'project',
};

const PLAN_DIGEST = 'f'.repeat(64);

// Real concurrent subprocess spawns (fixture dispatch + review, per attempt),
// several real git worktrees and several real cherry-pick-based integrations
// can take a while on a loaded CI/parallel test-run machine — generous
// allowance, matching every other real-spawn suite in this project.
jest.setTimeout(60000);

function gitCmd(dir, args, opts) {
  const res = spawnSync('git', args, Object.assign({ cwd: dir, shell: false, encoding: 'utf8', windowsHide: true }, opts || {}));
  if (res.status !== 0) {
    throw new Error('test setup: "git ' + args.join(' ') + '" in ' + dir + ' failed: ' + (res.stderr || res.error));
  }
  return res.stdout;
}

function gitCmdAllowFail(dir, args) {
  return spawnSync('git', args, { cwd: dir, shell: false, encoding: 'utf8', windowsHide: true });
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

// Minimal, direct store.State construction — same style as
// tests/lib/git.integration.test.js's own initState — rather than going
// through the full plan/CSV parsing pipeline, which is out of scope here
// (already covered by tests/lib/plan.*.test.js).
function initState(executionRoot, runId, featureRef, baseSha, taskIds) {
  let state = store.State.create({
    runId: runId,
    featureId: 'FTR-018-PARALLEL-TEST',
    repo: 'test-repo',
    commonDir: 'test-common-dir',
    featureRef: featureRef,
    baseSha: baseSha,
    planDigest: PLAN_DIGEST,
    contextHashes: {},
    config: { maxConcurrency: taskIds.length },
    runStatus: 'running',
  });
  taskIds.forEach(function (id) {
    state = state.addTask(id, { dependencies: [] });
  });
  store.writeState(executionRoot, runId, state);
}

// Manually chains the real, already-implemented primitives exactly as a
// future N>1 caller would, for ONE task attempt, entirely inside its OWN
// isolated worktree: dispatch (real fixture subprocess) -> verify (real Bash)
// -> review (real fixture subprocess) -> persist outcome -> stage -> persist
// checkpoint intent -> commit -> registerCommitSHA (NOT sequential:true — the
// Tech-Spec's N>1 branch: the technical-branch commit stays there,
// integratedSha stays null, until a later, separate integration step).
async function dispatchImplementVerifyReviewCommit(ctx) {
  // Real dispatch-order recording (FINDING A above): a real caller of
  // dispatchTaskAttempt does not do this today, but the primitive itself is
  // real and already unit-tested — calling it here, synchronously, as the
  // very first step of this attempt's own flow (before dispatchTaskAttempt's
  // own synchronous persist-before-invoke prefix) is what lets the
  // "serial integration" scenario below genuinely reuse a real, persisted
  // dispatchSequence rather than an arbitrary order.
  let state = store.readState(ctx.executionRoot, ctx.runId);
  state = state.recordDispatch(ctx.taskId, ctx.attemptNumber);
  store.writeState(ctx.executionRoot, ctx.runId, state);

  const task = {
    id: ctx.taskId,
    title: 'Parallel isolated attempt ' + ctx.taskId,
    outcome: 'A real isolated-worktree attempt for ' + ctx.taskId + ' commits independently onto its own technical branch',
    domain: 'BE',
    dependsOn: [],
    acceptanceCriteria: ['AC-07', 'AC-08'],
    verificationCommands: ['test -f ' + ctx.taskId + '.output.txt'],
  };

  const dispatchResult = await dispatchTaskAttempt({
    executionRoot: ctx.executionRoot,
    runId: ctx.runId,
    task: task,
    attemptNumber: ctx.attemptNumber,
    claudePath: NODE,
    agentId: 'gaia.agent.developer.backend',
    projectDir: ctx.worktreePath,
    taskTimeoutMs: 15000,
    spawnArgs: [FIXTURE, '--mode=write-file-and-succeed'],
  });

  // Simulates additional real file changes an implementation agent made in
  // its own isolated worktree (used by the integration-conflict scenario to
  // create a genuine same-file collision between two attempts).
  (ctx.extraFileWrites || []).forEach(function (w) {
    writeFile(ctx.worktreePath, w.relPath, w.content);
  });

  const verification = await runVerifications({
    executionRoot: ctx.executionRoot, runId: ctx.runId, task: task, attemptNumber: ctx.attemptNumber, cwd: ctx.worktreePath,
  });
  if (!verification.passed) {
    throw new Error('test setup: verification unexpectedly failed for ' + ctx.taskId + ': ' + JSON.stringify(verification));
  }

  const changedPaths = git.detectChangedPaths(ctx.worktreePath);

  const review = await runReview({
    executionRoot: ctx.executionRoot, runId: ctx.runId, task: task, attemptNumber: ctx.attemptNumber,
    claudePath: NODE, projectDir: ctx.worktreePath, diff: 'stub diff for ' + ctx.taskId,
    spawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
  });

  const outcome = store.persistVerificationReviewOutcome(ctx.executionRoot, ctx.runId, ctx.taskId, ctx.attemptNumber, verification, review);
  if (outcome.stage !== 'reviewed') {
    throw new Error('test setup: outcome unexpectedly not reviewed for ' + ctx.taskId + ': ' + JSON.stringify(outcome));
  }

  const stagingResult = git.stageTaskFiles(ctx.worktreePath, changedPaths);
  const taskRef = 'refs/heads/' + ctx.branch;
  const verificationReceiptIds = verification.results.map(function (_r, i) {
    return ctx.taskId + '-attempt' + ctx.attemptNumber + '-verification-' + i;
  });

  const persisted = git.persistCheckpointIntent(ctx.executionRoot, ctx.runId, {
    featureId: 'FTR-018-PARALLEL-TEST',
    runId: ctx.runId,
    taskId: ctx.taskId,
    attemptNumber: ctx.attemptNumber,
    planDigest: PLAN_DIGEST,
    featureRef: ctx.featureRef,
    taskRef: taskRef,
    parentSha: ctx.baseSha,
    expectedTreeSha: stagingResult.treeSha,
    changedPaths: changedPaths,
    verificationReceiptIds: verificationReceiptIds,
    reviewReceiptId: outcome.reviewReceiptId,
    outcomeReceiptId: outcome.outcomeReceiptId,
    commitMessage: 'feat: ' + ctx.taskId,
  });

  const commitResult = git.createTaskCommit(ctx.worktreePath, persisted.intent, stagingResult);

  // NOT sequential:true — Tech-Spec section 8's N>1 branch: "Commit remains
  // on technical ref until integration." integratedSha is set later, only
  // once integrateAttempt has actually run, via store.registerIntegratedSHA.
  store.registerCommitSHA(ctx.executionRoot, ctx.runId, ctx.taskId, ctx.attemptNumber, commitResult.commitSha);

  return {
    taskId: ctx.taskId,
    attemptNumber: ctx.attemptNumber,
    commitSha: commitResult.commitSha,
    branch: ctx.branch,
    taskRef: taskRef,
    worktreePath: ctx.worktreePath,
    processIdentity: dispatchResult.processIdentity,
  };
}

// Wraps one attempt's full flow with real slot-pool acquire/release
// (createSlotPool, US-08-TASK-BE-02) — proves the pool genuinely bounds
// concurrently in-flight work for this real, multi-step attempt lifecycle,
// not just for a synthetic acquire/release pair.
async function acquireDispatchRelease(pool, ctx) {
  const token = pool.tryAcquire();
  if (!token) {
    throw new Error('test setup: slot pool unexpectedly exhausted for ' + ctx.taskId);
  }
  try {
    return await dispatchImplementVerifyReviewCommit(ctx);
  } finally {
    pool.release(token);
  }
}

describe('parallel execution primitives composition (US-08-TASK-TEST-01)', () => {
  let tmpDir;
  let repoDir;
  let executionRoot;
  let baseSha;
  let featureRef;
  let verifyIdentitySpy;
  const RUN_ID = 'run-parallel-test';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parallel-executor-test-'));
    repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir);

    initRepo(repoDir);
    writeFile(repoDir, 'base.txt', 'base\n');
    writeFile(repoDir, 'shared.txt', 'shared-base\n');
    baseSha = commitAll(repoDir, 'init');
    const initialBranch = gitCmd(repoDir, ['symbolic-ref', '--short', 'HEAD']).trim();
    featureRef = 'refs/heads/' + initialBranch;

    const commonDirOut = gitCmd(repoDir, ['rev-parse', '--git-common-dir']).trim();
    executionRoot = path.join(path.resolve(repoDir, commonDirOut), 'ai-toolkit', 'execution');

    verifyIdentitySpy = jest.spyOn(claudeProcess, 'verifyAgentIdentity').mockReturnValue(VERIFIED_IDENTITY);
    ownership.acquireLease(executionRoot, RUN_ID);
  });

  afterEach(() => {
    verifyIdentitySpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Scenarios 1 + 2: N slot reservation / concurrent dispatch, then serial,
  //    dispatch-order integration (with a real out-of-order refusal) ────────

  test(
    'N=2: two attempts dispatch concurrently into their own isolated worktrees, the slot pool genuinely bounds concurrency, and integration is serialized by real dispatch order (a stale out-of-order attempt is refused)',
    async () => {
      const TASK_A = 'US-08-TEST-PAR-A';
      const TASK_B = 'US-08-TEST-PAR-B';
      initState(executionRoot, RUN_ID, featureRef, baseSha, [TASK_A, TASK_B]);

      const worktreeA = createTaskWorktree({
        projectDir: repoDir, executionRoot: executionRoot, runId: RUN_ID,
        taskId: TASK_A, attemptNumber: 1, baseSha: baseSha,
      });
      const worktreeB = createTaskWorktree({
        projectDir: repoDir, executionRoot: executionRoot, runId: RUN_ID,
        taskId: TASK_B, attemptNumber: 1, baseSha: baseSha,
      });

      const pool = createSlotPool(2);

      const contexts = [
        { taskId: TASK_A, attemptNumber: 1, worktreePath: worktreeA.worktreePath, branch: worktreeA.branch, featureRef: featureRef, baseSha: baseSha, executionRoot: executionRoot, runId: RUN_ID },
        { taskId: TASK_B, attemptNumber: 1, worktreePath: worktreeB.worktreePath, branch: worktreeB.branch, featureRef: featureRef, baseSha: baseSha, executionRoot: executionRoot, runId: RUN_ID },
      ];

      // Array.prototype.map calls its callback synchronously, once per
      // element, strictly left-to-right; each callback here is an async
      // function whose FIRST statement synchronously acquires a real slot,
      // then calls dispatchImplementVerifyReviewCommit, which itself runs
      // entirely synchronously (recordDispatch -> dispatchTaskAttempt's own
      // synchronous persist-before-invoke prefix) up to its own single
      // `await claudeProcess.spawnClaudeAgent(...)` point before suspending.
      // So by the time .map() itself returns (still perfectly synchronously,
      // before either real subprocess has produced any output), BOTH real
      // slots are already held — a genuine, real proof of concurrent
      // dispatch, not a simulated one.
      const promises = contexts.map(function (ctx) { return acquireDispatchRelease(pool, ctx); });

      // Real, concurrent capacity proof: both slots are held right now, and
      // a third (oversubscribed) acquire genuinely fails while both real
      // attempts are still in flight.
      expect(pool.activeCount()).toBe(2);
      expect(pool.remainingCapacity()).toBe(0);
      expect(pool.tryAcquire()).toBeNull();

      const results = await Promise.all(promises);

      // Every slot was released once its real attempt's full flow (dispatch
      // -> verify -> review -> commit) actually completed.
      expect(pool.activeCount()).toBe(0);
      expect(pool.remainingCapacity()).toBe(2);

      const byTaskId = {};
      results.forEach(function (r) { byTaskId[r.taskId] = r; });

      // Isolation: each attempt's own real file landed in its OWN worktree,
      // never in the main project worktree, never in the other attempt's
      // worktree.
      expect(fs.existsSync(path.join(worktreeA.worktreePath, TASK_A + '.output.txt'))).toBe(true);
      expect(fs.existsSync(path.join(worktreeB.worktreePath, TASK_B + '.output.txt'))).toBe(true);
      expect(fs.existsSync(path.join(worktreeA.worktreePath, TASK_B + '.output.txt'))).toBe(false);
      expect(fs.existsSync(path.join(worktreeB.worktreePath, TASK_A + '.output.txt'))).toBe(false);
      expect(fs.existsSync(path.join(repoDir, TASK_A + '.output.txt'))).toBe(false);
      expect(fs.existsSync(path.join(repoDir, TASK_B + '.output.txt'))).toBe(false);

      // Each attempt really committed onto its OWN technical branch — never
      // the feature branch (which has not moved from baseSha yet).
      expect(gitCmd(repoDir, ['rev-parse', byTaskId[TASK_A].taskRef]).trim()).toBe(byTaskId[TASK_A].commitSha);
      expect(gitCmd(repoDir, ['rev-parse', byTaskId[TASK_B].taskRef]).trim()).toBe(byTaskId[TASK_B].commitSha);
      expect(gitCmd(repoDir, ['rev-parse', featureRef]).trim()).toBe(baseSha);

      const stateAfterDispatch = store.readState(executionRoot, RUN_ID);
      expect(stateAfterDispatch.tasks[TASK_A].attempts[0].stage).toBe('committed');
      expect(stateAfterDispatch.tasks[TASK_A].attempts[0].integratedSha).toBeNull(); // N>1: stays null until integration
      expect(stateAfterDispatch.tasks[TASK_B].attempts[0].stage).toBe('committed');
      expect(stateAfterDispatch.tasks[TASK_B].attempts[0].integratedSha).toBeNull();

      // Real, persisted dispatch order (FINDING A) — used below to derive
      // integration order, per this task's own instructions.
      const orderedDispatches = stateAfterDispatch.dispatchSequence.slice().sort(function (a, b) { return a.seq - b.seq; });
      expect(orderedDispatches.map(function (d) { return d.taskId; })).toEqual([TASK_A, TASK_B]);

      const first = byTaskId[orderedDispatches[0].taskId];
      const second = byTaskId[orderedDispatches[1].taskId];

      // ── Serial integration in real dispatch order ────────────────────────

      const firstIntegration = git.integrateAttempt({
        executionRoot: executionRoot, runId: RUN_ID, taskId: first.taskId, attemptNumber: first.attemptNumber,
        cwd: repoDir, featureRef: featureRef, expectedParentSha: baseSha,
        attemptBranch: first.branch, commitSha: first.commitSha,
      });
      store.registerIntegratedSHA(executionRoot, RUN_ID, first.taskId, first.attemptNumber, firstIntegration.integratedSha);

      // ── "Do not overtake": the second-dispatched attempt tries to
      // integrate using a STALE expectedParentSha (baseSha) that ignores the
      // fact the first-dispatched attempt already integrated and moved
      // featureRef — this is the concrete violation the CAS precondition
      // exists to catch (Tech-Spec: "do not overtake earlier dispatched
      // tasks in integration").
      expect(() => git.integrateAttempt({
        executionRoot: executionRoot, runId: RUN_ID, taskId: second.taskId, attemptNumber: second.attemptNumber,
        cwd: repoDir, featureRef: featureRef, expectedParentSha: baseSha,
        attemptBranch: second.branch, commitSha: second.commitSha,
      })).toThrow(expect.objectContaining({ code: 'INTEGRATION_PARENT_MISMATCH' }));

      // Nothing was touched by the refused attempt: featureRef is still
      // exactly at the first integration's result, first's file content is
      // intact.
      expect(gitCmd(repoDir, ['rev-parse', featureRef]).trim()).toBe(firstIntegration.integratedSha);
      expect(gitCmd(repoDir, ['status', '--porcelain']).trim()).toBe('');

      // Now integrate correctly, chaining off the REAL prior integration
      // result.
      const secondIntegration = git.integrateAttempt({
        executionRoot: executionRoot, runId: RUN_ID, taskId: second.taskId, attemptNumber: second.attemptNumber,
        cwd: repoDir, featureRef: featureRef, expectedParentSha: firstIntegration.integratedSha,
        attemptBranch: second.branch, commitSha: second.commitSha,
      });
      store.registerIntegratedSHA(executionRoot, RUN_ID, second.taskId, second.attemptNumber, secondIntegration.integratedSha);

      // Real, linear git history: second's commit parent is first's
      // integration result — never interleaved/parallel branches on the
      // feature ref.
      expect(gitCmd(repoDir, ['rev-parse', featureRef]).trim()).toBe(secondIntegration.integratedSha);
      expect(gitCmd(repoDir, ['rev-parse', secondIntegration.integratedSha + '^']).trim()).toBe(firstIntegration.integratedSha);
      expect(gitCmd(repoDir, ['rev-parse', firstIntegration.integratedSha + '^']).trim()).toBe(baseSha);

      expect(fs.existsSync(path.join(repoDir, TASK_A + '.output.txt'))).toBe(true);
      expect(fs.existsSync(path.join(repoDir, TASK_B + '.output.txt'))).toBe(true);

      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.integrationSequence.map(function (e) { return e.taskId; })).toEqual([first.taskId, second.taskId]);
      expect(finalState.tasks[first.taskId].attempts[0].stage).toBe('integrated');
      expect(finalState.tasks[first.taskId].attempts[0].integratedSha).toBe(firstIntegration.integratedSha);
      expect(finalState.tasks[second.taskId].attempts[0].stage).toBe('integrated');
      expect(finalState.tasks[second.taskId].attempts[0].integratedSha).toBe(secondIntegration.integratedSha);
    }
  );

  test(
    'N=3: three attempts dispatch concurrently, each independently and correctly implements/verifies/reviews/checkpoints onto its own technical branch, and the real persisted dispatchSequence drives a correct 3-way serial integration chain',
    async () => {
      const TASK_X = 'US-08-TEST-PAR-X';
      const TASK_Y = 'US-08-TEST-PAR-Y';
      const TASK_Z = 'US-08-TEST-PAR-Z';
      initState(executionRoot, RUN_ID, featureRef, baseSha, [TASK_X, TASK_Y, TASK_Z]);

      const worktrees = {};
      [TASK_X, TASK_Y, TASK_Z].forEach(function (taskId) {
        worktrees[taskId] = createTaskWorktree({
          projectDir: repoDir, executionRoot: executionRoot, runId: RUN_ID,
          taskId: taskId, attemptNumber: 1, baseSha: baseSha,
        });
      });

      const pool = createSlotPool(3);
      const contexts = [TASK_X, TASK_Y, TASK_Z].map(function (taskId) {
        return {
          taskId: taskId, attemptNumber: 1,
          worktreePath: worktrees[taskId].worktreePath, branch: worktrees[taskId].branch,
          featureRef: featureRef, baseSha: baseSha, executionRoot: executionRoot, runId: RUN_ID,
        };
      });

      const promises = contexts.map(function (ctx) { return acquireDispatchRelease(pool, ctx); });

      // All three real slots held simultaneously; a 4th (oversubscribed)
      // acquire genuinely fails while all three real attempts are in flight.
      expect(pool.activeCount()).toBe(3);
      expect(pool.tryAcquire()).toBeNull();

      const results = await Promise.all(promises);
      expect(pool.activeCount()).toBe(0);

      const byTaskId = {};
      results.forEach(function (r) { byTaskId[r.taskId] = r; });

      // Isolation across all three worktrees, pairwise.
      [TASK_X, TASK_Y, TASK_Z].forEach(function (ownerId) {
        [TASK_X, TASK_Y, TASK_Z].forEach(function (fileId) {
          const exists = fs.existsSync(path.join(worktrees[ownerId].worktreePath, fileId + '.output.txt'));
          expect(exists).toBe(ownerId === fileId);
        });
      });
      expect(fs.existsSync(path.join(repoDir, TASK_X + '.output.txt'))).toBe(false);

      const state = store.readState(executionRoot, RUN_ID);
      const orderedDispatches = state.dispatchSequence.slice().sort(function (a, b) { return a.seq - b.seq; });
      expect(orderedDispatches.map(function (d) { return d.taskId; })).toEqual([TASK_X, TASK_Y, TASK_Z]);

      // Serial integration strictly following the REAL persisted dispatch
      // order (per this task's own instructions: reuse dispatchSequence
      // rather than an arbitrary order), chaining expectedParentSha off each
      // prior real integration result.
      let expectedParentSha = baseSha;
      const integratedShas = [];
      orderedDispatches.forEach(function (d) {
        const attempt = byTaskId[d.taskId];
        const integration = git.integrateAttempt({
          executionRoot: executionRoot, runId: RUN_ID, taskId: attempt.taskId, attemptNumber: attempt.attemptNumber,
          cwd: repoDir, featureRef: featureRef, expectedParentSha: expectedParentSha,
          attemptBranch: attempt.branch, commitSha: attempt.commitSha,
        });
        store.registerIntegratedSHA(executionRoot, RUN_ID, attempt.taskId, attempt.attemptNumber, integration.integratedSha);
        integratedShas.push(integration.integratedSha);
        expectedParentSha = integration.integratedSha;
      });

      // Real, linear 3-commit chain on the feature branch.
      expect(gitCmd(repoDir, ['rev-parse', featureRef]).trim()).toBe(integratedShas[2]);
      expect(gitCmd(repoDir, ['rev-parse', integratedShas[2] + '^']).trim()).toBe(integratedShas[1]);
      expect(gitCmd(repoDir, ['rev-parse', integratedShas[1] + '^']).trim()).toBe(integratedShas[0]);
      expect(gitCmd(repoDir, ['rev-parse', integratedShas[0] + '^']).trim()).toBe(baseSha);

      [TASK_X, TASK_Y, TASK_Z].forEach(function (taskId) {
        expect(fs.existsSync(path.join(repoDir, taskId + '.output.txt'))).toBe(true);
      });

      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.integrationSequence.map(function (e) { return e.taskId; })).toEqual([TASK_X, TASK_Y, TASK_Z]);
      [TASK_X, TASK_Y, TASK_Z].forEach(function (taskId) {
        expect(finalState.tasks[taskId].attempts[0].stage).toBe('integrated');
      });
    }
  );

  // ── Scenario 3: dedup prevention ─────────────────────────────────────────

  describe('dedup prevention', () => {
    test(
      'a genuinely new, out-of-sequence attemptNumber request is refused (ATTEMPT_NUMBER_MISMATCH), even when raced concurrently against the legitimate next attempt',
      async () => {
        const TASK_ID = 'US-08-TEST-DEDUP-SKIP';
        initState(executionRoot, RUN_ID, featureRef, baseSha, [TASK_ID]);

        const baseArgs = function (attemptNumber) {
          return {
            executionRoot: executionRoot, runId: RUN_ID,
            task: { id: TASK_ID, title: 'dedup test', outcome: 'x', domain: 'BE', dependsOn: [], verificationCommands: [] },
            attemptNumber: attemptNumber,
            claudePath: NODE, agentId: 'gaia.agent.developer.backend', projectDir: repoDir,
            taskTimeoutMs: 15000,
            spawnArgs: [FIXTURE, '--mode=echo-json'],
          };
        };

        // Two concurrent calls for the SAME task: one legitimately requests
        // attemptNumber 1 (the real next number for a brand-new task), the
        // other — simulating a scheduler bug that skips ahead — requests
        // attemptNumber 2 before attempt 1 has ever actually been recorded.
        // Array-literal element evaluation is left-to-right and each call's
        // own synchronous persist-before-invoke prefix (no `await` until its
        // final spawnClaudeAgent call) runs to completion before the next
        // call even starts (see FINDING B above for the full analysis), so
        // this race is fully deterministic: the attemptNumber:1 call commits
        // first and always wins; the attemptNumber:2 call's own internal
        // expectedNextNumber check (attempts.length + 1) sees the just-added
        // attempt 1 and computes 2 as the expected next number too... so to
        // actually force a genuine mismatch we skip further ahead, to 3.
        const results = await Promise.allSettled([
          dispatchTaskAttempt(baseArgs(1)),
          dispatchTaskAttempt(baseArgs(3)),
        ]);

        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe('rejected');
        expect(results[1].reason).toMatchObject({ code: 'ATTEMPT_NUMBER_MISMATCH' });

        const state = store.readState(executionRoot, RUN_ID);
        // Only the legitimate attempt 1 was ever recorded — the skip-ahead
        // request never created a phantom attempt 3.
        expect(state.tasks[TASK_ID].attempts).toHaveLength(1);
        expect(state.tasks[TASK_ID].attempts[0].number).toBe(1);
      }
    );

    // FINDING B, empirically demonstrated (see this file's own header
    // comment for the full analysis): two concurrent calls requesting the
    // IDENTICAL, not-yet-existing attemptNumber for the SAME task are NOT
    // both rejected — the second is folded into the "resumed dispatch"
    // branch (no ATTEMPT_NUMBER_MISMATCH, since an attempt with that exact
    // number now exists by the time it looks) and genuinely dispatches its
    // own real subprocess too. This test proves the ACTUAL behavior plainly,
    // as a documented finding — it is not patched here.
    test(
      'FINDING: two concurrent calls requesting the IDENTICAL not-yet-existing attemptNumber for the same task both dispatch real subprocesses (neither is rejected); only one attempt record ever exists and its processIdentity is byte-identical for both calls, so persisted state cannot even show two real processes ran',
      async () => {
        const TASK_ID = 'US-08-TEST-DEDUP-IDENTICAL';
        initState(executionRoot, RUN_ID, featureRef, baseSha, [TASK_ID]);

        const args = {
          executionRoot: executionRoot, runId: RUN_ID,
          task: { id: TASK_ID, title: 'dedup identical test', outcome: 'x', domain: 'BE', dependsOn: [], verificationCommands: [] },
          attemptNumber: 1,
          claudePath: NODE, agentId: 'gaia.agent.developer.backend', projectDir: repoDir,
          taskTimeoutMs: 15000,
          spawnArgs: [FIXTURE, '--mode=echo-json'],
        };

        const results = await Promise.allSettled([
          dispatchTaskAttempt(args),
          dispatchTaskAttempt(args),
        ]);

        // Neither call is rejected — this is the finding. Both really
        // dispatched: each settled value carries its own real spawnResult
        // with a real, successful exit code from its own real (fixture)
        // subprocess — if the second call had been folded into a no-op
        // instead of a genuine re-dispatch, it would not carry a real
        // spawnResult of its own at all.
        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe('fulfilled');
        expect(results[0].value.spawnResult.exitCode).toBe(0);
        expect(results[1].value.spawnResult.exitCode).toBe(0);
        // processIdentity is `_buildProcessTag(runId, taskId, attemptNumber)`
        // — derived ONLY from those three (here identical) inputs — so both
        // calls' OWN returned processIdentity is byte-identical, even though
        // two distinct real subprocesses were spawned for it.
        expect(results[0].value.processIdentity).toBe(results[1].value.processIdentity);

        // Only ONE attempt record ever existed (the second call updated the
        // first's record rather than creating a second one), and — per the
        // finding above — its processIdentity is exactly that same shared
        // tag; persisted state has no way to distinguish "one real dispatch"
        // from "two real, concurrent dispatches" of this identical attempt.
        const state = store.readState(executionRoot, RUN_ID);
        expect(state.tasks[TASK_ID].attempts).toHaveLength(1);
        expect(state.tasks[TASK_ID].attempts[0].processIdentity).toBe(results[0].value.processIdentity);
      }
    );

    test(
      'a second coordinator (no lease / different runId) cannot dispatch at all, regardless of attemptNumber — cross-coordinator dedup via the repo-wide ownership lease',
      async () => {
        const TASK_ID = 'US-08-TEST-DEDUP-LEASE';
        initState(executionRoot, RUN_ID, featureRef, baseSha, [TASK_ID]);
        // beforeEach already acquired the lease for RUN_ID; a second,
        // different runId has no lease of its own.
        const OTHER_RUN_ID = 'run-parallel-test-OTHER';

        await expect(dispatchTaskAttempt({
          executionRoot: executionRoot, runId: OTHER_RUN_ID,
          task: { id: TASK_ID, title: 'x', outcome: 'x', domain: 'BE', dependsOn: [], verificationCommands: [] },
          attemptNumber: 1,
          claudePath: NODE, agentId: 'gaia.agent.developer.backend', projectDir: repoDir,
          spawnArgs: [FIXTURE, '--mode=echo-json'],
        })).rejects.toMatchObject({ code: 'NO_LOCK_HELD' });

        // Nothing was touched for the other (lease-less) run — no state file
        // was ever created for OTHER_RUN_ID.
        expect(() => store.readState(executionRoot, OTHER_RUN_ID)).toThrow(expect.objectContaining({ code: 'STATE_NOT_FOUND' }));
      }
    );
  });

  // ── Scenario 4: integration conflict handling ────────────────────────────

  test(
    'integration conflict: two attempts editing the SAME line of the SAME file — the first integrates cleanly, the second genuinely conflicts and is left untouched for diagnosis, and nothing about the first integration is corrupted',
    async () => {
      const TASK_1 = 'US-08-TEST-PAR-CONFLICT-1';
      const TASK_2 = 'US-08-TEST-PAR-CONFLICT-2';
      initState(executionRoot, RUN_ID, featureRef, baseSha, [TASK_1, TASK_2]);

      const worktree1 = createTaskWorktree({
        projectDir: repoDir, executionRoot: executionRoot, runId: RUN_ID,
        taskId: TASK_1, attemptNumber: 1, baseSha: baseSha,
      });
      const worktree2 = createTaskWorktree({
        projectDir: repoDir, executionRoot: executionRoot, runId: RUN_ID,
        taskId: TASK_2, attemptNumber: 1, baseSha: baseSha,
      });

      // Both attempts genuinely rewrite the SAME tracked file (shared.txt,
      // present at baseSha) with mutually incompatible content — a real
      // same-line collision, not a synthetic error.
      const attempt1 = await dispatchImplementVerifyReviewCommit({
        taskId: TASK_1, attemptNumber: 1, worktreePath: worktree1.worktreePath, branch: worktree1.branch,
        featureRef: featureRef, baseSha: baseSha, executionRoot: executionRoot, runId: RUN_ID,
        extraFileWrites: [{ relPath: 'shared.txt', content: 'conflicting content from ' + TASK_1 + '\n' }],
      });
      const attempt2 = await dispatchImplementVerifyReviewCommit({
        taskId: TASK_2, attemptNumber: 1, worktreePath: worktree2.worktreePath, branch: worktree2.branch,
        featureRef: featureRef, baseSha: baseSha, executionRoot: executionRoot, runId: RUN_ID,
        extraFileWrites: [{ relPath: 'shared.txt', content: 'conflicting content from ' + TASK_2 + '\n' }],
      });

      const firstIntegration = git.integrateAttempt({
        executionRoot: executionRoot, runId: RUN_ID, taskId: TASK_1, attemptNumber: 1,
        cwd: repoDir, featureRef: featureRef, expectedParentSha: baseSha,
        attemptBranch: attempt1.branch, commitSha: attempt1.commitSha,
      });
      store.registerIntegratedSHA(executionRoot, RUN_ID, TASK_1, 1, firstIntegration.integratedSha);

      expect(fs.readFileSync(path.join(repoDir, 'shared.txt'), 'utf8')).toBe('conflicting content from ' + TASK_1 + '\n');

      expect(() => git.integrateAttempt({
        executionRoot: executionRoot, runId: RUN_ID, taskId: TASK_2, attemptNumber: 1,
        cwd: repoDir, featureRef: featureRef, expectedParentSha: firstIntegration.integratedSha,
        attemptBranch: attempt2.branch, commitSha: attempt2.commitSha,
      })).toThrow(expect.objectContaining({ code: 'INTEGRATION_CONFLICT' }));

      // Nothing corrupted: featureRef is still exactly at the first
      // integration's result — never auto-aborted, never reset, never moved.
      expect(gitCmd(repoDir, ['rev-parse', featureRef]).trim()).toBe(firstIntegration.integratedSha);

      // The conflict is genuinely left in the worktree for diagnosis (real
      // unmerged index entries), exactly as Tech-Spec section 8 requires.
      const statusAfterConflict = gitCmd(repoDir, ['status', '--porcelain']);
      expect(statusAfterConflict).toMatch(/^(UU|AA|DD)/m);

      // The second (conflicting) attempt's integration was never recorded.
      const state = store.readState(executionRoot, RUN_ID);
      expect(state.integrationSequence).toEqual([
        { seq: 1, taskId: TASK_1, attemptNumber: 1, at: expect.any(String) },
      ]);
      expect(state.tasks[TASK_2].attempts[0].stage).toBe('committed'); // never advanced to 'integrated'
      expect(state.tasks[TASK_2].attempts[0].integratedSha).toBeNull();

      // First attempt's own registered integration is untouched by the
      // second attempt's failure.
      expect(state.tasks[TASK_1].attempts[0].stage).toBe('integrated');
      expect(state.tasks[TASK_1].attempts[0].integratedSha).toBe(firstIntegration.integratedSha);

      // Test hygiene (not part of the behavior under test): clear the
      // deliberately-left conflict state so afterEach's rmSync does not have
      // to fight a conflicted index (mirrors tests/lib/git.integration.test.js's
      // own INTEGRATION_CONFLICT test).
      gitCmdAllowFail(repoDir, ['cherry-pick', '--quit']);
    }
  );
});
