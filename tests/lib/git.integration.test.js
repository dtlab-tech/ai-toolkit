'use strict';

// Tests for lib/task-executor/git.js integrateAttempt (US-08-TASK-BE-03,
// FTR-018). Serial, dispatch-order integration of an N>1 attempt's
// already-verified, already-committed technical-branch commit onto the
// feature branch: cherry-pick --no-commit into a dedicated integration
// worktree, commit-tree the resulting tree, advance the feature ref only by
// compare-and-swap, record dispatch-serial integration order via store.js's
// existing recordIntegration. This suite exercises the real `git` binary
// against isolated, disposable repositories — it does not mock Git or
// child_process.
//
// SAFETY (mandatory, verified by inspection — see the discipline note at the
// bottom of this file): every single git command this suite runs is executed
// with an explicit `cwd` pointing at a repository (or a linked worktree of
// one) created fresh, per test, under `fs.mkdtempSync(os.tmpdir())`, with a
// LOCAL (repo-scoped only) `user.name`/`user.email` set via `git config`
// (never `--global`). No git command in this file ever runs without an
// explicit cwd argument, and no command ever targets this project's own
// working tree (c:/ws/Fincantieri.CommonLibraries.AIToolkit). store.js's
// executionRoot for each test is also a fresh tmpdir. Every tmp directory is
// removed in `afterEach`.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { integrateAttempt } = require('../../lib/task-executor/git');
const store = require('../../lib/task-executor/store');

const RUN_ID = 'run-1';
const TASK_ID = 'TASK-1';

// Thin real-git helper used ONLY for test setup/assertions (never as part of
// the code under test) — always takes an explicit `dir`, always shell:false,
// always argv array.
function git(dir, args, opts) {
  const res = spawnSync('git', args, Object.assign({ cwd: dir, shell: false, encoding: 'utf8', windowsHide: true }, opts || {}));
  if (res.status !== 0) {
    throw new Error('test setup: "git ' + args.join(' ') + '" in ' + dir + ' failed: ' + (res.stderr || res.error));
  }
  return res.stdout;
}

function gitAllowFail(dir, args) {
  return spawnSync('git', args, { cwd: dir, shell: false, encoding: 'utf8', windowsHide: true });
}

function initRepo(dir) {
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.name', 'AI Toolkit Test']);
  git(dir, ['config', 'user.email', 'ai-toolkit-test@example.invalid']);
  git(dir, ['config', 'core.autocrlf', 'false']);
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function commitAll(dir, message) {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', message]);
  return git(dir, ['rev-parse', 'HEAD']).trim();
}

function initState(executionRoot, extraTaskIds) {
  let state = store.State.create({
    runId: RUN_ID,
    featureId: 'FTR-018',
    repo: 'test-repo',
    commonDir: 'test-common-dir',
    featureRef: 'refs/heads/placeholder',
    baseSha: '0'.repeat(40),
    planDigest: 'digest-abc',
  });
  state = state.addTask(TASK_ID, { dependencies: [] });
  (extraTaskIds || []).forEach(function (id) {
    state = state.addTask(id, { dependencies: [] });
  });
  store.writeState(executionRoot, RUN_ID, state);
}

describe('integrateAttempt', () => {
  let tmpDir;
  let repoDir; // the integration worktree (cwd) — a normal checkout on featureRef
  let executionRoot;
  let featureRef;
  let baseSha;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-toolkit-git-integration-test-'));
    repoDir = path.join(tmpDir, 'repo');
    executionRoot = path.join(tmpDir, 'execution');
    fs.mkdirSync(repoDir, { recursive: true });

    initRepo(repoDir);
    writeFile(repoDir, 'shared.txt', 'line1\n');
    writeFile(repoDir, 'keep.txt', 'unchanged\n');
    baseSha = commitAll(repoDir, 'init');
    const initialBranch = git(repoDir, ['symbolic-ref', '--short', 'HEAD']).trim();
    featureRef = 'refs/heads/' + initialBranch;

    initState(executionRoot);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Creates a linked worktree off `baseSha` on a brand-new branch, writes one
  // file change and commits it — mirrors createTaskWorktree's real shape
  // (US-08-TASK-BE-01: "each attempt has unique branch
  // ai-toolkit/<runId>/<taskId>/<attempt>") without depending on that
  // function directly (it lives in index.js, not git.js, and is out of scope
  // for this suite).
  function makeAttemptCommit(branch, fileContent, relPath) {
    const attemptDir = path.join(tmpDir, 'attempt-' + branch.replace(/[/\\]/g, '_'));
    git(repoDir, ['worktree', 'add', '-b', branch, attemptDir, baseSha]);
    writeFile(attemptDir, relPath || 'shared.txt', fileContent);
    const commitSha = commitAll(attemptDir, 'feat: attempt commit on ' + branch);
    return { attemptDir: attemptDir, commitSha: commitSha };
  }

  describe('input validation (fails closed, no git command run)', () => {
    test('throws INTEGRATION_VALIDATION_ERROR for a non-existent cwd', () => {
      expect(() =>
        integrateAttempt({
          executionRoot: executionRoot, runId: RUN_ID, taskId: TASK_ID, attemptNumber: 1,
          cwd: path.join(tmpDir, 'does-not-exist'),
          featureRef: featureRef, expectedParentSha: baseSha,
          attemptBranch: 'ai-toolkit/run-1/TASK-1/1', commitSha: baseSha,
        })
      ).toThrow(expect.objectContaining({ code: 'INTEGRATION_VALIDATION_ERROR' }));
    });

    test('throws INTEGRATION_VALIDATION_ERROR for a malformed commitSha', () => {
      expect(() =>
        integrateAttempt({
          executionRoot: executionRoot, runId: RUN_ID, taskId: TASK_ID, attemptNumber: 1,
          cwd: repoDir, featureRef: featureRef, expectedParentSha: baseSha,
          attemptBranch: 'ai-toolkit/run-1/TASK-1/1', commitSha: 'not-a-sha',
        })
      ).toThrow(expect.objectContaining({ code: 'INTEGRATION_VALIDATION_ERROR' }));
    });

    test('throws INTEGRATION_VALIDATION_ERROR for a non-positive-integer attemptNumber', () => {
      expect(() =>
        integrateAttempt({
          executionRoot: executionRoot, runId: RUN_ID, taskId: TASK_ID, attemptNumber: 0,
          cwd: repoDir, featureRef: featureRef, expectedParentSha: baseSha,
          attemptBranch: 'ai-toolkit/run-1/TASK-1/1', commitSha: baseSha,
        })
      ).toThrow(expect.objectContaining({ code: 'INTEGRATION_VALIDATION_ERROR' }));
    });
  });

  describe('INTEGRATION_PARENT_MISMATCH (dispatch-order CAS precondition)', () => {
    test('throws and touches nothing when featureRef does not point at expectedParentSha', () => {
      const { commitSha } = makeAttemptCommit('ai-toolkit/run-1/TASK-1/1', 'line1-A\n');
      const staleParent = '1'.repeat(40); // deliberately wrong (never actually featureRef's tip)

      expect(() =>
        integrateAttempt({
          executionRoot: executionRoot, runId: RUN_ID, taskId: TASK_ID, attemptNumber: 1,
          cwd: repoDir, featureRef: featureRef, expectedParentSha: staleParent,
          attemptBranch: 'ai-toolkit/run-1/TASK-1/1', commitSha: commitSha,
        })
      ).toThrow(expect.objectContaining({ code: 'INTEGRATION_PARENT_MISMATCH' }));

      expect(git(repoDir, ['rev-parse', featureRef]).trim()).toBe(baseSha);
      expect(git(repoDir, ['status', '--porcelain']).trim()).toBe('');
    });

    test('a second attempt cannot overtake a first, not-yet-integrated attempt in dispatch order', () => {
      initState(executionRoot, ['TASK-2']);
      const a = makeAttemptCommit('ai-toolkit/run-1/TASK-1/1', 'line1-A\n');
      const b = makeAttemptCommit('ai-toolkit/run-1/TASK-2/1', 'line1-B\n');
      void a;

      // TASK-2's attempt tries to integrate first (out of dispatch order) —
      // still expecting baseSha as parent, which IS still featureRef's tip,
      // so this alone would not fail on parent-mismatch grounds; the real
      // "do not overtake" guarantee is structural: a caller driving dispatch
      // order always uses the PRIOR integration's resulting SHA as the next
      // expectedParentSha. This test only proves the mismatch fires the
      // instant the caller's expectation is stale relative to the real tip.
      const staleParent = '2'.repeat(40);
      expect(() =>
        integrateAttempt({
          executionRoot: executionRoot, runId: RUN_ID, taskId: 'TASK-2', attemptNumber: 1,
          cwd: repoDir, featureRef: featureRef, expectedParentSha: staleParent,
          attemptBranch: 'ai-toolkit/run-1/TASK-2/1', commitSha: b.commitSha,
        })
      ).toThrow(expect.objectContaining({ code: 'INTEGRATION_PARENT_MISMATCH' }));
    });
  });

  describe('worktree readiness', () => {
    test('throws INTEGRATION_WORKTREE_NOT_CLEAN when the integration worktree has pending changes', () => {
      const { commitSha } = makeAttemptCommit('ai-toolkit/run-1/TASK-1/1', 'line1-A\n');
      writeFile(repoDir, 'dirty.txt', 'uncommitted\n');

      expect(() =>
        integrateAttempt({
          executionRoot: executionRoot, runId: RUN_ID, taskId: TASK_ID, attemptNumber: 1,
          cwd: repoDir, featureRef: featureRef, expectedParentSha: baseSha,
          attemptBranch: 'ai-toolkit/run-1/TASK-1/1', commitSha: commitSha,
        })
      ).toThrow(expect.objectContaining({ code: 'INTEGRATION_WORKTREE_NOT_CLEAN' }));

      expect(git(repoDir, ['rev-parse', featureRef]).trim()).toBe(baseSha);
    });

    test('throws INTEGRATION_WORKTREE_STATE_MISMATCH when the integration worktree HEAD is detached', () => {
      const { commitSha } = makeAttemptCommit('ai-toolkit/run-1/TASK-1/1', 'line1-A\n');
      // Detach HEAD in the integration worktree WITHOUT moving featureRef
      // itself — featureRef still resolves to baseSha (so the earlier
      // dispatch-order CAS precondition passes), but the worktree's own HEAD
      // is no longer attached to featureRef, which this function requires.
      git(repoDir, ['checkout', '--detach', '-q', baseSha]);

      expect(() =>
        integrateAttempt({
          executionRoot: executionRoot, runId: RUN_ID, taskId: TASK_ID, attemptNumber: 1,
          cwd: repoDir, featureRef: featureRef, expectedParentSha: baseSha,
          attemptBranch: 'ai-toolkit/run-1/TASK-1/1', commitSha: commitSha,
        })
      ).toThrow(expect.objectContaining({ code: 'INTEGRATION_WORKTREE_STATE_MISMATCH' }));

      expect(git(repoDir, ['rev-parse', featureRef]).trim()).toBe(baseSha);
    });
  });

  describe('source verification', () => {
    test('throws INTEGRATION_SOURCE_NOT_FOUND when commitSha does not resolve to a commit', () => {
      makeAttemptCommit('ai-toolkit/run-1/TASK-1/1', 'line1-A\n');
      const bogusSha = 'a'.repeat(40);

      expect(() =>
        integrateAttempt({
          executionRoot: executionRoot, runId: RUN_ID, taskId: TASK_ID, attemptNumber: 1,
          cwd: repoDir, featureRef: featureRef, expectedParentSha: baseSha,
          attemptBranch: 'ai-toolkit/run-1/TASK-1/1', commitSha: bogusSha,
        })
      ).toThrow(expect.objectContaining({ code: 'INTEGRATION_SOURCE_NOT_FOUND' }));
    });

    test('throws INTEGRATION_SOURCE_NOT_ON_BRANCH when commitSha is real but not reachable from attemptBranch', () => {
      const a = makeAttemptCommit('ai-toolkit/run-1/TASK-1/1', 'line1-A\n');
      const b = makeAttemptCommit('ai-toolkit/run-1/TASK-2/1', 'line1-B\n');

      expect(() =>
        integrateAttempt({
          executionRoot: executionRoot, runId: RUN_ID, taskId: TASK_ID, attemptNumber: 1,
          cwd: repoDir, featureRef: featureRef, expectedParentSha: baseSha,
          attemptBranch: 'ai-toolkit/run-1/TASK-1/1', commitSha: b.commitSha, // wrong branch for this commit
        })
      ).toThrow(expect.objectContaining({ code: 'INTEGRATION_SOURCE_NOT_ON_BRANCH' }));
      void a;
    });
  });

  describe('successful integration', () => {
    test('cherry-picks the exact commit, advances featureRef via CAS, verifies the result, and records dispatch-serial integration order', () => {
      const { commitSha } = makeAttemptCommit('ai-toolkit/run-1/TASK-1/1', 'line1-A\n');

      const result = integrateAttempt({
        executionRoot: executionRoot, runId: RUN_ID, taskId: TASK_ID, attemptNumber: 1,
        cwd: repoDir, featureRef: featureRef, expectedParentSha: baseSha,
        attemptBranch: 'ai-toolkit/run-1/TASK-1/1', commitSha: commitSha,
      });

      expect(result.originalSha).toBe(commitSha);
      expect(result.integratedSha).toMatch(/^[0-9a-f]{40}$/);
      expect(result.integratedSha).not.toBe(commitSha); // re-parented, distinct commit object
      expect(result.parentSha).toBe(baseSha);

      // featureRef actually advanced to the new integration commit.
      expect(git(repoDir, ['rev-parse', featureRef]).trim()).toBe(result.integratedSha);

      // Tree/parent are exactly what was intended.
      const commitObj = git(repoDir, ['cat-file', '-p', result.integratedSha]);
      expect(commitObj).toMatch(new RegExp('^parent ' + baseSha, 'm'));

      // The integrated content matches the attempt's change.
      expect(fs.readFileSync(path.join(repoDir, 'shared.txt'), 'utf8')).toBe('line1-A\n');
      expect(fs.readFileSync(path.join(repoDir, 'keep.txt'), 'utf8')).toBe('unchanged\n');

      // Traceability trailer back to the original commit is present.
      const body = git(repoDir, ['show', '-s', '--format=%B', result.integratedSha]);
      expect(body).toContain('AI-Toolkit-Integrated-From: ' + commitSha);

      // The integration worktree is left clean — no dangling cherry-pick
      // sequencer state to block the next serial integration.
      expect(git(repoDir, ['status', '--porcelain']).trim()).toBe('');
      expect(gitAllowFail(repoDir, ['rev-parse', '-q', '--verify', 'CHERRY_PICK_HEAD']).status).not.toBe(0);

      // Integration intent persisted before the commit was created.
      const intent = store.readIntent(executionRoot, RUN_ID, TASK_ID + '-attempt1-integration');
      expect(intent.originalSha).toBe(commitSha);
      expect(intent.featureParentSha).toBe(baseSha);

      // Dispatch-serial integration order recorded (integrationSequence
      // only — never attempt.originalSha/integratedSha; that is
      // US-08-TASK-BE-04's own, separate job).
      const state = store.readState(executionRoot, RUN_ID);
      expect(state.integrationSequence).toEqual([
        { seq: 1, taskId: TASK_ID, attemptNumber: 1, at: expect.any(String) },
      ]);
      expect(state.tasks[TASK_ID].attempts).toEqual([]); // untouched by this function
    });

    test('a second, independent attempt integrates serially after the first, chaining expectedParentSha to the prior result', () => {
      initState(executionRoot, ['TASK-2']);
      const a = makeAttemptCommit('ai-toolkit/run-1/TASK-1/1', 'line1-A\n');
      // Attempt B touches a DIFFERENT file (not shared.txt), so chaining
      // after A's integration applies cleanly (no conflict) — this test is
      // about ordering/chaining, not conflict handling (see the
      // INTEGRATION_CONFLICT suite below for that).
      const b = makeAttemptCommit('ai-toolkit/run-1/TASK-2/1', 'other-content\n', 'other.txt');

      const first = integrateAttempt({
        executionRoot: executionRoot, runId: RUN_ID, taskId: TASK_ID, attemptNumber: 1,
        cwd: repoDir, featureRef: featureRef, expectedParentSha: baseSha,
        attemptBranch: 'ai-toolkit/run-1/TASK-1/1', commitSha: a.commitSha,
      });

      const second = integrateAttempt({
        executionRoot: executionRoot, runId: RUN_ID, taskId: 'TASK-2', attemptNumber: 1,
        cwd: repoDir, featureRef: featureRef, expectedParentSha: first.integratedSha,
        attemptBranch: 'ai-toolkit/run-1/TASK-2/1', commitSha: b.commitSha,
      });

      expect(git(repoDir, ['rev-parse', featureRef]).trim()).toBe(second.integratedSha);
      expect(git(repoDir, ['rev-parse', second.integratedSha + '^']).trim()).toBe(first.integratedSha);
      expect(fs.readFileSync(path.join(repoDir, 'shared.txt'), 'utf8')).toBe('line1-A\n');
      expect(fs.readFileSync(path.join(repoDir, 'other.txt'), 'utf8')).toBe('other-content\n');

      const state = store.readState(executionRoot, RUN_ID);
      expect(state.integrationSequence).toEqual([
        { seq: 1, taskId: TASK_ID, attemptNumber: 1, at: expect.any(String) },
        { seq: 2, taskId: 'TASK-2', attemptNumber: 1, at: expect.any(String) },
      ]);
    });
  });

  describe('INTEGRATION_CONFLICT (never auto-aborted/reset)', () => {
    test('leaves the integration worktree in its conflicted state for diagnosis and does not move featureRef', () => {
      initState(executionRoot, ['TASK-2']);
      const a = makeAttemptCommit('ai-toolkit/run-1/TASK-1/1', 'line1-A\n');
      const b = makeAttemptCommit('ai-toolkit/run-1/TASK-2/1', 'line1-B\n');
      // Both attempts edit the SAME line of shared.txt from the same base —
      // integrating A first, then B against A's result, must conflict.

      const first = integrateAttempt({
        executionRoot: executionRoot, runId: RUN_ID, taskId: TASK_ID, attemptNumber: 1,
        cwd: repoDir, featureRef: featureRef, expectedParentSha: baseSha,
        attemptBranch: 'ai-toolkit/run-1/TASK-1/1', commitSha: a.commitSha,
      });

      expect(() =>
        integrateAttempt({
          executionRoot: executionRoot, runId: RUN_ID, taskId: 'TASK-2', attemptNumber: 1,
          cwd: repoDir, featureRef: featureRef, expectedParentSha: first.integratedSha,
          attemptBranch: 'ai-toolkit/run-1/TASK-2/1', commitSha: b.commitSha,
        })
      ).toThrow(expect.objectContaining({ code: 'INTEGRATION_CONFLICT' }));

      // featureRef untouched — still at A's integration result.
      expect(git(repoDir, ['rev-parse', featureRef]).trim()).toBe(first.integratedSha);

      // The worktree is left exactly as git left it — unmerged conflict
      // markers still present in the index — never auto-aborted/reset.
      // (Verified by direct experiment: with --no-commit, a conflicting
      // cherry-pick does NOT write .git/CHERRY_PICK_HEAD — the index itself
      // is the only real signal, which is what this function's own conflict
      // detection relies on too.)
      const statusAfterConflict = git(repoDir, ['status', '--porcelain']);
      expect(statusAfterConflict).toMatch(/^(UU|AA|DD)/m);

      // integrationSequence was NOT advanced for the failed attempt.
      const state = store.readState(executionRoot, RUN_ID);
      expect(state.integrationSequence).toEqual([
        { seq: 1, taskId: TASK_ID, attemptNumber: 1, at: expect.any(String) },
      ]);

      // Clean up the deliberately-left conflict state so afterEach's rmSync
      // does not have to fight a conflicted index (best-effort test hygiene,
      // not part of the behavior under test).
      gitAllowFail(repoDir, ['cherry-pick', '--quit']);
    });
  });
});

// ── Test-isolation discipline note ──────────────────────────────────────────
// Grep verification performed manually before reporting this task done: every
// call to spawnSync('git', ...) in this file (both the local `git()`/
// `gitAllowFail()` helpers and their callers) passes an explicit `cwd` bound
// to a directory under `tmpDir` (a fresh fs.mkdtempSync(os.tmpdir())
// directory created in beforeEach and removed in afterEach). No test in this
// file calls process.chdir(), no test omits `cwd`, and no test path resolves
// into c:/ws/Fincantieri.CommonLibraries.AIToolkit (this project's own
// working tree). user.name/user.email are set locally per repo, never
// --global. store.js's executionRoot is likewise a fresh tmpdir per test.
