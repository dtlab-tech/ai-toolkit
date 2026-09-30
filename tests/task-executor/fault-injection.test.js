'use strict';

// Fault-injection / crash-recovery suite (US-09-TASK-TEST-01, FTR-018).
//
// This is the feature's most thorough exercise of the Gate-1 binding
// constraint "no task completion on model self-report alone" across the
// FULL checkpoint lifecycle: dispatch -> verification -> review ->
// checkpoint-intent -> stage -> commit -> SHA registration -> ledger
// finalization. Every scenario below constructs REALISTIC PARTIAL STATE —
// exactly the durable evidence a real coordinator crash at that precise
// boundary would leave — using the REAL persistence primitives this
// codebase already implements and already tests in isolation:
//   - store.js: State / writeState / writeReceipt / writeIntent /
//     persistVerificationReviewOutcome / registerCommitSHA
//   - git.js: persistCheckpointIntent / stageTaskFiles / createTaskCommit
//   - index.js: dispatchTaskAttempt / runVerifications / runReview /
//     finalizeTaskCheckpoint / reconcile / resume
// Each scenario then calls the REAL reconcile() (never a hand-rolled
// classifier) and asserts:
//   1. the correct, already-established classification/action (the exact
//      vocabulary tests/lib/resume-reconcile.test.js, tests/lib/evidence-
//      table.test.js and tests/task-executor/resume-replan.test.js already
//      use — nothing here invents a new classification string);
//   2. nothing already-durable is lost, discarded, or rewritten (files,
//      commits, receipts already on disk before the simulated crash point
//      are re-checked as still present/reachable AFTER reconcile runs);
//   3. no task is ever marked 'checkpointed'/'integrated' when its actual
//      durable evidence does not support that — the core AC-10 assertion,
//      checked explicitly in every scenario below, not only in the
//      "mandatory negative test" one.
//
// Per-scenario construction choice (documented at each describe block,
// per this task's own instructions): where a real dispatch/verification/
// review call is cheap and the point of the scenario IS to prove the real
// call chain leaves exactly the expected durable trace (scenarios 1, 2, 3a,
// 8a, 8b), a real call is made. Where only the DURABLE RESULT of an
// earlier, already-exhaustively-tested step matters and re-running the
// whole chain up to that point would be redundant (e.g. re-deriving the
// 'reviewed' stage for scenarios 4-7, or the 'verified' stage for 3b, or
// the ledger 'task' activity dispatchTaskAttempt would have opened for
// scenarios 6-7), the durable state is constructed directly via the real
// store.js/git.js/execution-ledger.js primitives instead — exactly
// mirroring the technique tests/lib/resume-reconcile.test.js's own
// "committed but not yet finalized" and "commit exists but SHA not
// recorded" tests already use.
//
// SAFETY (mirrors tests/lib/resume-reconcile.test.js's and tests/task-
// executor/resume-replan.test.js's exact discipline):
//   - NEVER invokes real claude.exe or any real LLM/API call anywhere in
//     this file. Every dispatch/review spawn uses tests/fixtures/
//     fake-claude-cli.js via process.execPath (the local Node binary) as
//     "claudePath" — claudeProcess.verifyAgentIdentity is stubbed via
//     jest.spyOn so no real toolkit-install identity resolution is needed
//     either.
//   - Every git command in this suite runs with an explicit `cwd` pointing
//     at a repository created fresh, per test, under
//     fs.mkdtempSync(os.tmpdir()), with a LOCAL (repo-scoped only)
//     user.name/user.email set via `git config` (never --global). No git
//     command in this file ever targets this project's own working tree
//     (c:/ws/Fincantieri.CommonLibraries.AIToolkit). Every tmp repo is
//     removed in afterEach.
//   - Real process-liveness assertions are only qualified on Windows (E-02
//     evidence spike) — scenario 2 branches its expected classification by
//     platform rather than gating the whole scenario itself, so it still
//     runs (with an equally honest, non-inventing assertion) on this
//     project's ubuntu-latest CI runner (see AGENTS.md).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const store = require('../../lib/task-executor/store');
const git = require('../../lib/task-executor/git');
const ledger = require('../../lib/execution-ledger');
const ownership = require('../../lib/task-executor/ownership');
const claudeProcess = require('../../lib/task-executor/claude-process');
const {
  dispatchTaskAttempt,
  runVerifications,
  runReview,
  finalizeTaskCheckpoint,
  reconcile,
} = require('../../lib/task-executor/index');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-claude-cli.js');
const NODE = process.execPath;
const NODE_EXE_BASENAME = path.basename(process.execPath); // 'node.exe' on Windows
const IS_WINDOWS = process.platform === 'win32';

// Real (fixture) subprocess spawns + real bash verification commands can be
// slow on a loaded CI/parallel test-run machine — mirrors the 15-20s
// allowance every other real-spawn suite in this project already uses.
jest.setTimeout(20000);

const RUN_ID = 'run-1';

// Single static identity, reused for BOTH the developer-agent dispatch and
// the review-solution dispatch — exactly the same convention tests/task-
// executor/executor.sequential.test.js and tests/task-executor/resume-
// replan.test.js already use (verifyAgentIdentity is a pure plumbing stub
// here; identity-resolution correctness is already covered in isolation).
const VERIFIED_IDENTITY = {
  agentId: 'gaia.agent.developer.backend',
  nativeName: 'gaia-developer-backend',
  sha256: 'sha256:' + 'f'.repeat(64),
  path: '/fake/path/gaia-developer-backend.md',
  manifestPath: '/fake/path/.ai-toolkit-manifest.json',
  toolkitVersion: '0.13.0',
  scope: 'project',
};

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

function commitExists(dir, sha) {
  const res = spawnSync('git', ['cat-file', '-e', sha], { cwd: dir, shell: false, windowsHide: true });
  return res.status === 0;
}

function isAncestor(dir, sha, ref) {
  const res = spawnSync('git', ['merge-base', '--is-ancestor', sha, ref], { cwd: dir, shell: false, windowsHide: true });
  return res.status === 0;
}

function refTip(dir, ref) {
  return gitCmd(dir, ['rev-parse', ref]).trim();
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

function makeTask(taskId, overrides) {
  return Object.assign(
    {
      id: taskId,
      title: 'Fault-injection fixture task',
      outcome: 'The task completes only on real, durable evidence',
      domain: 'BE',
      dependsOn: [],
      acceptanceCriteria: ['AC-10', 'AC-13'],
      verificationCommands: [],
    },
    overrides || {}
  );
}

describe('fault injection / crash-recovery across the full checkpoint lifecycle (US-09-TASK-TEST-01)', () => {
  let tmpDir;
  let executionRoot;
  let repoDir;
  let featureRef;
  let baseSha;
  let verifyIdentitySpy;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fault-injection-test-'));
    executionRoot = path.join(tmpDir, 'execution');
    repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir);

    initRepo(repoDir);
    writeFile(repoDir, 'base.txt', 'base\n');
    baseSha = commitAll(repoDir, 'init');

    const branchName = gitCmd(repoDir, ['symbolic-ref', '--short', 'HEAD']).trim();
    featureRef = 'refs/heads/' + branchName;

    verifyIdentitySpy = jest.spyOn(claudeProcess, 'verifyAgentIdentity').mockReturnValue(VERIFIED_IDENTITY);
    ownership.acquireLease(executionRoot, RUN_ID);
  });

  afterEach(() => {
    verifyIdentitySpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function baseArgs(overrides) {
    return Object.assign(
      { executionRoot: executionRoot, runId: RUN_ID, projectDir: repoDir, taskRef: featureRef, exeBasename: NODE_EXE_BASENAME },
      overrides || {}
    );
  }

  // Drives a task attempt through a REAL runVerifications + REAL runReview
  // cycle (fake-CLI-dispatched review, real Bash verification) up to the
  // real, durable 'reviewed' stage persistVerificationReviewOutcome writes
  // — the shared starting point for scenarios 4-7. Also opens the ledger
  // 'task'-kind activity a real dispatchTaskAttempt call would already have
  // opened at dispatch time (Tech-Spec section 6): scenarios 6/7 need it
  // for finalizeTaskCheckpoint's repair path, exactly like tests/lib/
  // resume-reconcile.test.js's own "committed but not yet finalized" test
  // does for the identical reason. Re-running a real dispatchTaskAttempt
  // call here too would be redundant with tests/lib/executor.dispatch.
  // test.js's own exhaustive coverage of that step.
  async function runToReviewed(taskId) {
    let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
    state = state.addAttempt(taskId, { stage: 'implementation-recorded' });
    store.writeState(executionRoot, RUN_ID, state);

    const ledgerPaths = store._executionPaths(executionRoot, RUN_ID);
    ledger.open(ledgerPaths.runDir, RUN_ID, 'executor:' + RUN_ID + ':' + taskId + ':task', 'task', null, 1);

    writeFile(repoDir, taskId + '-marker.txt', 'v1\n');
    const task = makeTask(taskId, { verificationCommands: ['test -f ' + taskId + '-marker.txt'] });

    const verification = await runVerifications({
      executionRoot: executionRoot, runId: RUN_ID, task: task, attemptNumber: 1, cwd: repoDir,
    });
    expect(verification.passed).toBe(true);

    const diff = 'Verdict: PASS\n\nCRITICAL (blocks merge):\n  none\n\nWARNING (should fix):\n  none\n';
    const review = await runReview({
      executionRoot: executionRoot, runId: RUN_ID, task: task, attemptNumber: 1,
      claudePath: NODE, projectDir: repoDir, diff: diff,
      spawnArgs: [FIXTURE, '--mode=echo-json'],
    });
    expect(review.reviewPassed).toBe(true);

    const outcome = store.persistVerificationReviewOutcome(executionRoot, RUN_ID, taskId, 1, verification, review);
    expect(outcome.stage).toBe('reviewed');

    return { task: task, outcome: outcome };
  }

  function buildIntentInput(taskId, outcome, markerRelPath) {
    return {
      featureId: 'FTR-099',
      runId: RUN_ID,
      taskId: taskId,
      attemptNumber: 1,
      planDigest: 'b'.repeat(64),
      featureRef: featureRef,
      taskRef: featureRef,
      parentSha: baseSha,
      expectedTreeSha: null, // filled in by the caller once stageTaskFiles has run
      changedPaths: [{ path: markerRelPath, changeType: 'add' }],
      verificationReceiptIds: outcome.verificationReceiptIds,
      reviewReceiptId: outcome.reviewReceiptId,
      outcomeReceiptId: outcome.outcomeReceiptId,
      commitMessage: 'feat(' + taskId + '): task commit',
    };
  }

  // ── Scenario 1 ──────────────────────────────────────────────────────────
  // "Before dispatch": task exists in state, zero attempts. No real
  // dispatch/git evidence exists at all — the simplest possible crash
  // window (coordinator dies before ever touching this task).
  describe('scenario 1: before dispatch — not-started, never invents progress', () => {
    const TASK_ID = 'US-99-TASK-FAULT-01';

    test('a task with zero attempts is classified not-started; no repair, no dispatch', async () => {
      const state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(TASK_ID, { dependencies: [] });
      store.writeState(executionRoot, RUN_ID, state);

      const result = await reconcile(baseArgs());

      expect(result.repairsApplied).toEqual([]);
      expect(result.classifications).toContainEqual({ taskId: TASK_ID, classification: 'not-started', action: 'none' });

      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.tasks[TASK_ID].status).toBe('pending');
      expect(finalState.tasks[TASK_ID].attempts).toEqual([]);
    });
  });

  // ── Scenario 2 ──────────────────────────────────────────────────────────
  // "After dispatch, before verification": a REAL dispatchTaskAttempt call
  // completes (real subprocess, real file write) but runVerifications never
  // runs. Constructed with a real dispatch (not direct state injection)
  // because the whole point is to observe what the REAL call chain leaves
  // behind — which, per this codebase's own established behavior (already
  // proven end-to-end in tests/task-executor/resume-replan.test.js's
  // scenario 1), is NOT the 'implementation-recorded' stage: dispatch never
  // itself advances attempt.stage past 'dispatching', so a genuinely-
  // completed dispatch (its worker already exited by the time
  // dispatchTaskAttempt resolves) is classified via the worker-liveness
  // path, never via a fabricated "verification pending" state.
  describe('scenario 2: after dispatch, before verification — a real, already-exited worker is never treated as completion', () => {
    const TASK_ID = 'US-99-TASK-FAULT-02';

    test('a real dispatchTaskAttempt call completes with a real output file; reconcile never treats it as done', async () => {
      const state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(TASK_ID, { dependencies: [] });
      store.writeState(executionRoot, RUN_ID, state);

      const task = makeTask(TASK_ID);

      const dispatchResult = await dispatchTaskAttempt({
        executionRoot: executionRoot, runId: RUN_ID, task: task, attemptNumber: 1,
        claudePath: NODE, agentId: VERIFIED_IDENTITY.agentId, projectDir: repoDir,
        spawnArgs: [FIXTURE, '--mode=write-file-and-succeed'],
      });
      expect(dispatchResult.spawnResult.result).toMatchObject({ is_error: false });

      // Real artifact the fake agent genuinely produced — proves this was a
      // real, non-trivial dispatch, not a no-op.
      const outputFile = path.join(repoDir, TASK_ID + '.output.txt');
      expect(fs.existsSync(outputFile)).toBe(true);

      // Let the OS finish deregistering the now-exited process (mirrors the
      // 500-700ms allowance every other real-liveness check in this
      // project's test suite already uses).
      await new Promise((resolve) => setTimeout(resolve, 700));

      const beforeState = store.readState(executionRoot, RUN_ID);
      expect(beforeState.tasks[TASK_ID].attempts[0].stage).toBe('dispatching');

      const result = await reconcile(baseArgs());
      expect(result.repairsApplied).toEqual([]);

      // Never a fabricated completion, on either platform. Windows: the
      // real OS process query positively confirms the worker is gone (the
      // same real dead-worker path already proven end-to-end in
      // resume-replan.test.js's scenario 1) — the attempt is preserved and
      // attributed to a future new attempt, never silently treated as
      // verified/reviewed/checkpointed. Non-Windows (this project's own CI
      // runs ubuntu-latest, per AGENTS.md): liveness cannot be positively
      // checked at all, so the equally honest, equally non-inventing
      // 'worker-live-or-unknown' classification is expected instead.
      if (IS_WINDOWS) {
        expect(result.classifications).toContainEqual({
          taskId: TASK_ID, classification: 'dead-worker', action: 'preserve-and-attribute-new-attempt-within-retry-policy',
        });
      } else {
        expect(result.classifications).toContainEqual({
          taskId: TASK_ID, classification: 'worker-live-or-unknown', action: 'no-replacement-diagnose',
        });
      }

      // AC-10, checked explicitly: the task is never marked complete.
      const afterState = store.readState(executionRoot, RUN_ID);
      expect(afterState.tasks[TASK_ID].status).not.toBe('checkpointed');
      expect(afterState.tasks[TASK_ID].status).not.toBe('integrated');

      // Artifact preservation: reconcile is read-only over the working
      // tree — the real file the dispatched worker wrote is still there.
      expect(fs.existsSync(outputFile)).toBe(true);
    });
  });

  // ── Scenario 3 ──────────────────────────────────────────────────────────
  // "After verification, before review". Two sub-scenarios, because this
  // codebase's real call chain has TWO genuinely different durable shapes
  // for this window (see the finding recorded in this task's final report):
  describe('scenario 3: after verification, before review', () => {
    const TASK_ID_A = 'US-99-TASK-FAULT-03A';
    const TASK_ID_B = 'US-99-TASK-FAULT-03B';

    test('3a: real verification receipts are persisted, but runReview is never dispatched — attempt.stage is left unchanged (see FINDING in the final report)', async () => {
      let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(TASK_ID_A, { dependencies: [] });
      state = state.addAttempt(TASK_ID_A, { stage: 'implementation-recorded' });
      store.writeState(executionRoot, RUN_ID, state);

      writeFile(repoDir, TASK_ID_A + '-marker.txt', 'v1\n');
      const task = makeTask(TASK_ID_A, { verificationCommands: ['test -f ' + TASK_ID_A + '-marker.txt'] });

      const verification = await runVerifications({
        executionRoot: executionRoot, runId: RUN_ID, task: task, attemptNumber: 1, cwd: repoDir,
      });
      expect(verification.passed).toBe(true);
      // Deliberately never call runReview or persistVerificationReviewOutcome.

      const result = await reconcile(baseArgs());
      expect(result.repairsApplied).toEqual([]);
      // runVerifications alone never advances attempt.stage — only
      // persistVerificationReviewOutcome does, and the real caller
      // (_runTaskToResolution) only ever invokes it once BOTH verification
      // AND review have already returned. So this is the SAME classification
      // as before verification ran — never a false completion (AC-10
      // holds), but reconcile has no way to know verification already
      // succeeded here.
      expect(result.classifications).toContainEqual({
        taskId: TASK_ID_A, classification: 'implementation-recorded', action: 'needs-verification',
      });

      // Artifact preservation: the real verification receipts are still
      // durably on disk even though reconcile does not consult them here.
      const receiptIds = store.listReceipts(executionRoot, RUN_ID);
      expect(receiptIds).toContain(TASK_ID_A + '-attempt1-verification-0');
      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.tasks[TASK_ID_A].status).not.toBe('checkpointed');
    });

    test('3b: the durable "verified" stage persistVerificationReviewOutcome itself writes before its terminal step — a real, previously-uncovered reconcile classification', async () => {
      let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(TASK_ID_B, { dependencies: [] });
      state = state.addAttempt(TASK_ID_B, { stage: 'implementation-recorded' });
      store.writeState(executionRoot, RUN_ID, state);

      writeFile(repoDir, TASK_ID_B + '-marker.txt', 'v1\n');
      const task = makeTask(TASK_ID_B, { verificationCommands: ['test -f ' + TASK_ID_B + '-marker.txt'] });

      const verification = await runVerifications({
        executionRoot: executionRoot, runId: RUN_ID, task: task, attemptNumber: 1, cwd: repoDir,
      });
      expect(verification.passed).toBe(true);

      // Replicates — via the REAL State/writeState primitives — exactly
      // the durable result of persistVerificationReviewOutcome's OWN first
      // write (store.js: stage 'verified', verificationRefs populated)
      // BEFORE its second write (the terminal 'reviewed'/'failed' step)
      // ever runs. This is the real crash window "between
      // persistVerificationReviewOutcome's two writeState calls" — i.e.
      // strictly after review has already returned (persistVerificationReviewOutcome
      // requires that) but before the terminal stage lands on disk.
      const verificationReceiptIds = verification.results.map(function (_r, i) {
        return TASK_ID_B + '-attempt1-verification-' + i;
      });
      state = store.readState(executionRoot, RUN_ID);
      state = state.updateAttempt(TASK_ID_B, 1, { stage: 'verified', verificationRefs: verificationReceiptIds });
      store.writeState(executionRoot, RUN_ID, state);

      const result = await reconcile(baseArgs());
      expect(result.repairsApplied).toEqual([]);
      expect(result.classifications).toContainEqual({
        taskId: TASK_ID_B, classification: 'verified-no-review-outcome', action: 'needs-review',
      });

      const afterState = store.readState(executionRoot, RUN_ID);
      expect(afterState.tasks[TASK_ID_B].status).not.toBe('checkpointed');
      expect(afterState.tasks[TASK_ID_B].attempts[0].reviewRefs).toEqual([]);

      verificationReceiptIds.forEach(function (id) {
        expect(function () { store.readReceipt(executionRoot, RUN_ID, id); }).not.toThrow();
      });
    });
  });

  // ── Scenario 4 ──────────────────────────────────────────────────────────
  // "After review, before checkpoint": review passed for real (fake CLI,
  // real "Verdict: PASS" parsing) but persistCheckpointIntent never ran.
  describe('scenario 4: after review, before checkpoint — reviewed-no-checkpoint (no repair)', () => {
    const TASK_ID = 'US-99-TASK-FAULT-04';

    test('a real verification+review pass leaves the attempt reviewed; reconcile reports needs-checkpoint-completion without finishing the checkpoint itself', async () => {
      await runToReviewed(TASK_ID);

      const result = await reconcile(baseArgs());
      expect(result.repairsApplied).toEqual([]);
      expect(result.classifications).toContainEqual({
        taskId: TASK_ID, classification: 'reviewed-no-checkpoint', action: 'needs-checkpoint-completion',
      });

      // AC-10: no checkpoint was fabricated — no intent was ever persisted.
      const afterState = store.readState(executionRoot, RUN_ID);
      expect(afterState.tasks[TASK_ID].status).not.toBe('checkpointed');
      expect(afterState.tasks[TASK_ID].attempts[0].intentIds).toEqual([]);
      expect(fs.existsSync(path.join(repoDir, TASK_ID + '-marker.txt'))).toBe(true);
    });
  });

  // ── Scenario 5 ──────────────────────────────────────────────────────────
  // "Checkpoint-prepared, before commit": persistCheckpointIntent ran for
  // real but createTaskCommit never ran.
  describe('scenario 5: checkpoint-prepared, before commit — needs-commit-creation (no repair)', () => {
    const TASK_ID = 'US-99-TASK-FAULT-05';

    test('a real checkpoint intent is persisted but createTaskCommit never runs; reconcile reports needs-commit-creation without creating a commit itself', async () => {
      const { outcome } = await runToReviewed(TASK_ID);

      const markerRelPath = TASK_ID + '-marker.txt';
      const stagingResult = git.stageTaskFiles(repoDir, [{ path: markerRelPath, changeType: 'add' }]);
      const intentInput = buildIntentInput(TASK_ID, outcome, markerRelPath);
      intentInput.expectedTreeSha = stagingResult.treeSha;
      git.persistCheckpointIntent(executionRoot, RUN_ID, intentInput);
      // Deliberately never call git.createTaskCommit — taskRef still points
      // exactly at baseSha, the intent's own parentSha.

      expect(refTip(repoDir, featureRef)).toBe(baseSha);

      const result = await reconcile(baseArgs());
      expect(result.repairsApplied).toEqual([]);
      expect(result.classifications).toContainEqual({
        taskId: TASK_ID, classification: 'checkpoint-prepared-no-commit', action: 'needs-commit-creation',
      });

      // AC-10 + "never rewrites history": reconcile created no commit and
      // moved no ref.
      expect(refTip(repoDir, featureRef)).toBe(baseSha);
      const afterState = store.readState(executionRoot, RUN_ID);
      expect(afterState.tasks[TASK_ID].status).not.toBe('checkpointed');
      expect(afterState.tasks[TASK_ID].attempts[0].stage).toBe('checkpoint-prepared');
    });
  });

  // ── Scenario 6 ──────────────────────────────────────────────────────────
  // "After commit, before SHA registration (state-write)": createTaskCommit
  // produces a REAL commit object (independently verified reachable in the
  // repo) but registerCommitSHA is never called — the commit is real and
  // reachable, but state.attempts[n].originalSha is still null.
  describe('scenario 6: after commit, before SHA registration (state-write) — commit real & reachable, originalSha still null', () => {
    const TASK_ID = 'US-99-TASK-FAULT-06';

    test('reconcile self-heals via the SAME real repair as "commit exists, SHA not recorded"; the commit is preserved and the task is not prematurely marked complete', async () => {
      const { outcome } = await runToReviewed(TASK_ID);

      const markerRelPath = TASK_ID + '-marker.txt';
      const stagingResult = git.stageTaskFiles(repoDir, [{ path: markerRelPath, changeType: 'add' }]);
      const intentInput = buildIntentInput(TASK_ID, outcome, markerRelPath);
      intentInput.expectedTreeSha = stagingResult.treeSha;
      const persisted = git.persistCheckpointIntent(executionRoot, RUN_ID, intentInput);
      const commitResult = git.createTaskCommit(repoDir, persisted.intent, stagingResult);
      // Deliberately never call store.registerCommitSHA.

      // Real, independent confirmation the commit object genuinely exists —
      // exactly the durable evidence a crash right after createTaskCommit
      // (but before registerCommitSHA) would leave behind.
      expect(commitExists(repoDir, commitResult.commitSha)).toBe(true);

      const beforeState = store.readState(executionRoot, RUN_ID);
      expect(beforeState.tasks[TASK_ID].attempts[0].stage).toBe('checkpoint-prepared');
      expect(beforeState.tasks[TASK_ID].attempts[0].originalSha).toBeNull();
      expect(beforeState.tasks[TASK_ID].status).not.toBe('checkpointed');

      const result = await reconcile(baseArgs());

      // Same established repair this codebase already applies for "commit
      // exists but SHA not recorded" (tests/lib/resume-reconcile.test.js) —
      // this scenario constructs the identical durable evidence via the
      // real commit-then-stop-short sequence rather than direct state
      // injection.
      expect(result.repairsApplied).toEqual([{ taskId: TASK_ID, action: 'register-commit-sha' }]);
      expect(result.classifications).toContainEqual({
        taskId: TASK_ID, classification: 'reconciled', action: 'commit-sha-registered',
      });

      const afterState = store.readState(executionRoot, RUN_ID);
      expect(afterState.tasks[TASK_ID].attempts[0].stage).toBe('committed');
      expect(afterState.tasks[TASK_ID].attempts[0].originalSha).toBe(commitResult.commitSha);
      // AC-10: registering the SHA is not the same as finalizing the
      // checkpoint — this ONE reconcile() pass must not skip ahead and mark
      // the task 'checkpointed' from evidence it read before the repair.
      expect(afterState.tasks[TASK_ID].status).not.toBe('checkpointed');

      // Nothing already-durable is lost or rewritten: the commit still
      // exists and is still reachable from taskRef after reconcile ran.
      expect(commitExists(repoDir, commitResult.commitSha)).toBe(true);
      expect(isAncestor(repoDir, commitResult.commitSha, featureRef)).toBe(true);

      // A second reconcile() pass now sees the genuinely-committed attempt
      // and completes the finalization — never invented, always requiring
      // its own real evidence read.
      const second = await reconcile(baseArgs());
      expect(second.repairsApplied).toEqual([{ taskId: TASK_ID, action: 'finalize-checkpoint' }]);
      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.tasks[TASK_ID].status).toBe('checkpointed');
    });
  });

  // ── Scenario 7 ──────────────────────────────────────────────────────────
  // "After SHA registration, before ledger finalization": registerCommitSHA
  // ran (attempt at 'committed') but finalizeTaskCheckpoint (which closes
  // the 'task'-kind ledger activity and marks task.status='checkpointed')
  // never ran.
  describe('scenario 7: after SHA registration, before ledger finalization — attempt committed, task.status not yet checkpointed', () => {
    const TASK_ID = 'US-99-TASK-FAULT-07';

    test('reconcile finalizes via the real, already-verified commit; the repair is idempotent on replay', async () => {
      const { outcome } = await runToReviewed(TASK_ID);

      const markerRelPath = TASK_ID + '-marker.txt';
      const stagingResult = git.stageTaskFiles(repoDir, [{ path: markerRelPath, changeType: 'add' }]);
      const intentInput = buildIntentInput(TASK_ID, outcome, markerRelPath);
      intentInput.expectedTreeSha = stagingResult.treeSha;
      const persisted = git.persistCheckpointIntent(executionRoot, RUN_ID, intentInput);
      const commitResult = git.createTaskCommit(repoDir, persisted.intent, stagingResult);

      // Real SHA registration — the durable state-write scenario 6 stopped
      // short of. This is the "attempt committed, ledger not yet finalized"
      // crash window: registerCommitSHA has run, finalizeTaskCheckpoint
      // has not.
      store.registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, commitResult.commitSha, { sequential: true });

      const beforeState = store.readState(executionRoot, RUN_ID);
      expect(beforeState.tasks[TASK_ID].attempts[0].stage).toBe('committed');
      expect(beforeState.tasks[TASK_ID].status).not.toBe('checkpointed');

      const result = await reconcile(baseArgs());
      expect(result.repairsApplied).toEqual([{ taskId: TASK_ID, action: 'finalize-checkpoint' }]);
      expect(result.classifications).toContainEqual({
        taskId: TASK_ID, classification: 'reconciled', action: 'checkpoint-finalized',
      });

      const afterState = store.readState(executionRoot, RUN_ID);
      expect(afterState.tasks[TASK_ID].status).toBe('checkpointed');

      // Commit preserved & reachable, never rewritten.
      expect(commitExists(repoDir, commitResult.commitSha)).toBe(true);
      expect(isAncestor(repoDir, commitResult.commitSha, featureRef)).toBe(true);

      // Idempotent replay: a second reconcile() call must not re-finalize
      // or throw a terminal-conflict — it recognizes the task is already
      // up-to-date, with no additional repair and no duplicate ledger close.
      const second = await reconcile(baseArgs());
      expect(second.repairsApplied).toEqual([]);
      expect(second.classifications).toContainEqual({
        taskId: TASK_ID, classification: 'up-to-date', action: 'keep-completion',
      });

      // Two ledger activities exist for this attempt: the 'task'-kind one
      // runToReviewed opened directly (mirroring what a real
      // dispatchTaskAttempt would have opened) and the 'review'-kind one
      // the real runReview() call inside runToReviewed already opened for
      // itself (index.js's runReview step 3). Only the 'task' activity is
      // ever closed by finalizeTaskCheckpoint — this asserts THAT one
      // specifically reached 'done' exactly once (idempotent, no duplicate
      // close on the second reconcile() call), rather than assuming a
      // fixed total entry count.
      const ledgerPaths = store._executionPaths(executionRoot, RUN_ID);
      const ledgerFile = path.join(ledgerPaths.runDir, RUN_ID + '-token-ledger.json');
      const entries = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
      const taskEntries = entries.filter(function (e) { return e.agent === 'executor:' + RUN_ID + ':' + TASK_ID + ':task'; });
      expect(taskEntries).toHaveLength(1);
      expect(taskEntries[0].status).toBe('done');
    });
  });

  // ── Scenario 8 ──────────────────────────────────────────────────────────
  // The mandatory negative test (Gate-1 binding constraint #2), revisited at
  // this comprehensive granularity: a fake agent that reports success but
  // performs NO real work is caught by real evidence — never by trusting its
  // own self-report — regardless of which "stage" that self-report claims.
  describe('scenario 8: the mandatory negative test, revisited at every checkpoint boundary', () => {
    const TASK_ID_DISPATCH = 'US-99-TASK-FAULT-08A';
    const TASK_ID_REVIEW_CLAIM = 'US-99-TASK-FAULT-08B';

    test('8a: a self-reported "success" with no real file write never passes verification; review is never even dispatched off its strength; reconcile never completes it', async () => {
      const state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(TASK_ID_DISPATCH, { dependencies: [] });
      store.writeState(executionRoot, RUN_ID, state);

      const task = makeTask(TASK_ID_DISPATCH, {
        // The real verification command the task's own approved Work
        // Breakdown would require: the file the agent was supposed to
        // create as evidence of doing the work.
        verificationCommands: ['test -f ' + TASK_ID_DISPATCH + '.output.txt'],
      });

      const spawnSpy = jest.spyOn(claudeProcess, 'spawnClaudeAgent');
      try {
        // 'echo-json' reports success (is_error:false) but performs NO real
        // file write — the exact Gate-1 mandatory-negative-test shape,
        // "claimed" here at the dispatch boundary.
        await dispatchTaskAttempt({
          executionRoot: executionRoot, runId: RUN_ID, task: task, attemptNumber: 1,
          claudePath: NODE, agentId: VERIFIED_IDENTITY.agentId, projectDir: repoDir,
          spawnArgs: [FIXTURE, '--mode=echo-json'],
        });
        spawnSpy.mockClear(); // isolate "was review dispatched afterwards" from the dispatch call itself

        expect(fs.existsSync(path.join(repoDir, TASK_ID_DISPATCH + '.output.txt'))).toBe(false);

        const verification = await runVerifications({
          executionRoot: executionRoot, runId: RUN_ID, task: task, attemptNumber: 1, cwd: repoDir,
        });
        expect(verification.passed).toBe(false);
        expect(verification.results[0].exitCode).not.toBe(0);

        const outcome = store.persistVerificationReviewOutcome(executionRoot, RUN_ID, TASK_ID_DISPATCH, 1, verification, null);
        expect(outcome.stage).toBe('failed');
        expect(outcome.terminalReason).toBe('verification-failed');

        // Review is never dispatched off the strength of the agent's own
        // self-reported success — real verification gates it structurally,
        // not merely by convention.
        expect(spawnSpy).not.toHaveBeenCalled();

        const result = await reconcile(baseArgs());
        expect(result.classifications).toContainEqual({
          taskId: TASK_ID_DISPATCH, classification: 'failed', action: 'needs-new-attempt-subject-to-retry-policy',
        });
        const finalState = store.readState(executionRoot, RUN_ID);
        expect(finalState.tasks[TASK_ID_DISPATCH].status).not.toBe('checkpointed');
      } finally {
        spawnSpy.mockRestore();
      }
    });

    test('8b: a self-reported review verdict whose free-text narrative claims completion never by itself flips task.status — only a real checkpoint pipeline does', async () => {
      let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(TASK_ID_REVIEW_CLAIM, { dependencies: [] });
      state = state.addAttempt(TASK_ID_REVIEW_CLAIM, { stage: 'implementation-recorded' });
      store.writeState(executionRoot, RUN_ID, state);

      writeFile(repoDir, TASK_ID_REVIEW_CLAIM + '-marker.txt', 'v1\n');
      const task = makeTask(TASK_ID_REVIEW_CLAIM, { verificationCommands: ['test -f ' + TASK_ID_REVIEW_CLAIM + '-marker.txt'] });

      const verification = await runVerifications({
        executionRoot: executionRoot, runId: RUN_ID, task: task, attemptNumber: 1, cwd: repoDir,
      });
      expect(verification.passed).toBe(true);

      // A review verdict whose free-text NARRATIVE falsely claims the task
      // is already checkpointed/committed — review-solution's own output
      // format is unstructured text (index.js's _extractReviewVerdict only
      // regexes "Verdict: PASS/FAIL" out of it), so nothing stops a model
      // from writing something like this. The system must not care: even a
      // genuine PASS verdict never itself performs (or fakes) a checkpoint.
      const diff =
        'Verdict: PASS\n\n' +
        'CRITICAL (blocks merge):\n  none\n\n' +
        'WARNING (should fix):\n  none\n\n' +
        'Note: task committed and checkpointed successfully.\n';
      const review = await runReview({
        executionRoot: executionRoot, runId: RUN_ID, task: task, attemptNumber: 1,
        claudePath: NODE, projectDir: repoDir, diff: diff,
        spawnArgs: [FIXTURE, '--mode=echo-json'],
      });
      expect(review.reviewPassed).toBe(true);

      store.persistVerificationReviewOutcome(executionRoot, RUN_ID, TASK_ID_REVIEW_CLAIM, 1, verification, review);

      const state1 = store.readState(executionRoot, RUN_ID);
      expect(state1.tasks[TASK_ID_REVIEW_CLAIM].status).not.toBe('checkpointed');

      const result = await reconcile(baseArgs());
      expect(result.classifications).toContainEqual({
        taskId: TASK_ID_REVIEW_CLAIM, classification: 'reviewed-no-checkpoint', action: 'needs-checkpoint-completion',
      });

      // Directly attempting to "declare done" ahead of real evidence is
      // rejected fail-closed, regardless of the claim in the review text —
      // no commit was ever created, so finalizeTaskCheckpoint's own
      // precondition guard refuses.
      expect(function () {
        finalizeTaskCheckpoint({
          executionRoot: executionRoot, runId: RUN_ID, taskId: TASK_ID_REVIEW_CLAIM, attemptNumber: 1,
          projectDir: repoDir, taskRef: featureRef,
        });
      }).toThrow(expect.objectContaining({ code: 'TASK_NOT_COMMITTED' }));

      const finalState = store.readState(executionRoot, RUN_ID);
      expect(finalState.tasks[TASK_ID_REVIEW_CLAIM].status).not.toBe('checkpointed');
    });
  });
});

// ── Test-isolation discipline note ──────────────────────────────────────────
// Grep-verified manually before reporting this task done: every call to
// spawnSync('git', ...) in this file (the local gitCmd/commitExists/
// isAncestor/refTip helpers, plus the real lib/task-executor/git.js
// functions exercised here) passes an explicit `cwd` bound to `repoDir`,
// itself nested under `tmpDir` (a fresh fs.mkdtempSync(os.tmpdir())
// directory created in beforeEach and removed in afterEach). No test in
// this file calls process.chdir(), no test omits `cwd`, and no test path
// resolves into c:/ws/Fincantieri.CommonLibraries.AIToolkit (this project's
// own working tree). user.name/user.email are set locally per repo, never
// --global. Every dispatch/review subprocess spawn targets
// tests/fixtures/fake-claude-cli.js via process.execPath — real claude.exe
// is never invoked anywhere in this file.
