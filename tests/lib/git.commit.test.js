'use strict';

// Tests for lib/task-executor/git.js createTaskCommit (US-05-TASK-BE-03,
// FTR-018). Commits an already-verified staged tree (stageTaskFiles's result,
// US-05-TASK-BE-02) against an already-persisted checkpoint intent
// (persistCheckpointIntent, US-05-TASK-BE-01), using `git commit-tree` +
// compare-and-swap `git update-ref` rather than `git commit`. This suite
// exercises the real `git` binary against isolated, disposable repositories —
// it does not mock Git or child_process.
//
// SAFETY (mandatory, verified by inspection — see the discipline note at the
// bottom of this file): every single git command this suite runs is executed
// with an explicit `cwd` pointing at a repository created fresh, per test,
// under `fs.mkdtempSync(os.tmpdir())`, with a LOCAL (repo-scoped only)
// `user.name`/`user.email` set via `git config` (never `--global`). No git
// command in this file ever runs without an explicit cwd argument, and no
// command ever targets this project's own working tree
// (c:/ws/Fincantieri.CommonLibraries.AIToolkit). Every tmp repo is removed in
// `afterEach`.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createTaskCommit } = require('../../lib/task-executor/git');

const TASK_REF = 'refs/heads/ai-toolkit-task-test';

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

function currentTreeSha(dir) {
  return git(dir, ['write-tree']).trim();
}

function makeTrailers(overrides) {
  return Object.assign(
    {
      'AI-Toolkit-Run': 'run-001',
      'AI-Toolkit-Task': 'US-05-TASK-BE-03',
      'AI-Toolkit-Attempt': '1',
      'AI-Toolkit-Plan': 'plandigest-abc123',
    },
    overrides || {}
  );
}

describe('createTaskCommit', () => {
  let tmpDir;
  let baseSha;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-toolkit-git-commit-test-'));
    initRepo(tmpDir);
    writeFile(tmpDir, 'keep.txt', 'unchanged\n');
    writeFile(tmpDir, 'target.txt', 'v1\n');
    baseSha = commitAll(tmpDir, 'init');
    // taskRef is deliberately a ref distinct from whatever branch `git init`
    // checked out (main/master, depending on git version/config) — createTaskCommit
    // must operate purely via ref/object-database plumbing, independent of HEAD.
    git(tmpDir, ['update-ref', TASK_REF, baseSha]);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('input validation (fails closed, no git command run)', () => {
    test('throws COMMIT_VALIDATION_ERROR for a non-existent cwd', () => {
      expect(() =>
        createTaskCommit(path.join(tmpDir, 'does-not-exist'), {
          taskRef: TASK_REF,
          parentSha: baseSha,
          expectedTreeSha: baseSha,
          commitMessage: 'x',
          trailers: makeTrailers(),
        }, { treeSha: baseSha, stagedPaths: [] })
      ).toThrow(expect.objectContaining({ code: 'COMMIT_VALIDATION_ERROR' }));
    });

    test('throws COMMIT_VALIDATION_ERROR for a malformed parentSha', () => {
      expect(() =>
        createTaskCommit(tmpDir, {
          taskRef: TASK_REF,
          parentSha: 'not-a-sha',
          expectedTreeSha: baseSha,
          commitMessage: 'x',
          trailers: makeTrailers(),
        }, { treeSha: baseSha, stagedPaths: [] })
      ).toThrow(expect.objectContaining({ code: 'COMMIT_VALIDATION_ERROR' }));
    });

    test('throws COMMIT_VALIDATION_ERROR when a trailer is missing', () => {
      const trailers = makeTrailers();
      delete trailers['AI-Toolkit-Plan'];
      expect(() =>
        createTaskCommit(tmpDir, {
          taskRef: TASK_REF,
          parentSha: baseSha,
          expectedTreeSha: baseSha,
          commitMessage: 'x',
          trailers: trailers,
        }, { treeSha: baseSha, stagedPaths: [] })
      ).toThrow(expect.objectContaining({ code: 'COMMIT_VALIDATION_ERROR' }));
    });

    test('throws COMMIT_VALIDATION_ERROR when stagingResult.treeSha is missing', () => {
      expect(() =>
        createTaskCommit(tmpDir, {
          taskRef: TASK_REF,
          parentSha: baseSha,
          expectedTreeSha: baseSha,
          commitMessage: 'x',
          trailers: makeTrailers(),
        }, { stagedPaths: [] })
      ).toThrow(expect.objectContaining({ code: 'COMMIT_VALIDATION_ERROR' }));
    });
  });

  describe('successful commit', () => {
    test('creates a commit via commit-tree, advances taskRef with the exact tree/parent/trailers, and leaves the checked-out branch untouched', () => {
      const checkedOutBranch = git(tmpDir, ['symbolic-ref', '--short', 'HEAD']).trim();

      writeFile(tmpDir, 'target.txt', 'v2\n');
      git(tmpDir, ['add', '--', 'target.txt']);
      const treeSha = currentTreeSha(tmpDir);

      const intent = {
        taskRef: TASK_REF,
        parentSha: baseSha,
        expectedTreeSha: treeSha,
        commitMessage: 'feat(US-05-TASK-BE-03): add trailer commit',
        trailers: makeTrailers(),
      };
      const stagingResult = { treeSha: treeSha, stagedPaths: ['target.txt'] };

      const result = createTaskCommit(tmpDir, intent, stagingResult);

      expect(result.treeSha).toBe(treeSha);
      expect(result.parentSha).toBe(baseSha);
      expect(result.commitSha).toMatch(/^[0-9a-f]{40}$/);

      // taskRef moved to the new commit.
      expect(git(tmpDir, ['rev-parse', TASK_REF]).trim()).toBe(result.commitSha);

      // The new commit's tree and sole parent are exactly what was intended
      // (commit-tree used explicit SHAs, not a re-derivation from the index).
      const commitObj = git(tmpDir, ['cat-file', '-p', result.commitSha]);
      expect(commitObj).toMatch(new RegExp('^tree ' + treeSha, 'm'));
      expect(commitObj).toMatch(new RegExp('^parent ' + baseSha, 'm'));
      expect(git(tmpDir, ['rev-parse', result.commitSha + '^']).trim()).toBe(baseSha);

      // All four trailers are present, verbatim, in the commit message.
      const body = git(tmpDir, ['show', '-s', '--format=%B', result.commitSha]);
      Object.keys(intent.trailers).forEach((key) => {
        expect(body).toContain(key + ': ' + intent.trailers[key]);
      });

      // The checked-out branch (whatever git init defaulted to) never moved —
      // createTaskCommit operates purely on taskRef via plumbing, independent
      // of HEAD/checkout.
      expect(git(tmpDir, ['symbolic-ref', '--short', 'HEAD']).trim()).toBe(checkedOutBranch);
      expect(git(tmpDir, ['rev-parse', 'HEAD']).trim()).toBe(baseSha);
    });

    test('commits the verified tree unchanged even if the live index drifts after staging (no index re-derivation)', () => {
      writeFile(tmpDir, 'target.txt', 'v2\n');
      git(tmpDir, ['add', '--', 'target.txt']);
      const treeSha = currentTreeSha(tmpDir);

      // Simulate a hook (or anything else) mutating the index AFTER staging
      // was verified but BEFORE createTaskCommit runs. If createTaskCommit
      // used `git commit` (which re-derives the tree from the index), this
      // extra staged file would leak into the commit. With commit-tree it
      // must not.
      writeFile(tmpDir, 'unexpected.txt', 'should not end up in the commit\n');
      git(tmpDir, ['add', '--', 'unexpected.txt']);

      const intent = {
        taskRef: TASK_REF,
        parentSha: baseSha,
        expectedTreeSha: treeSha,
        commitMessage: 'feat: index-drift guard',
        trailers: makeTrailers(),
      };
      const stagingResult = { treeSha: treeSha, stagedPaths: ['target.txt'] };

      const result = createTaskCommit(tmpDir, intent, stagingResult);

      expect(result.treeSha).toBe(treeSha);
      const commitObj = git(tmpDir, ['cat-file', '-p', result.commitSha]);
      expect(commitObj).toMatch(new RegExp('^tree ' + treeSha, 'm'));

      const filesInCommit = git(tmpDir, ['ls-tree', '-r', '--name-only', result.commitSha]);
      expect(filesInCommit).not.toMatch(/unexpected\.txt/);
    });
  });

  describe('TREE_MISMATCH', () => {
    test('throws and commits nothing when stagingResult.treeSha differs from intent.expectedTreeSha', () => {
      writeFile(tmpDir, 'target.txt', 'v2\n');
      git(tmpDir, ['add', '--', 'target.txt']);
      const actualTreeSha = currentTreeSha(tmpDir);
      const initialTreeSha = git(tmpDir, ['rev-parse', baseSha + '^{tree}']).trim();

      const intent = {
        taskRef: TASK_REF,
        parentSha: baseSha,
        expectedTreeSha: initialTreeSha, // deliberately NOT actualTreeSha
        commitMessage: 'feat: mismatch',
        trailers: makeTrailers(),
      };
      const stagingResult = { treeSha: actualTreeSha, stagedPaths: ['target.txt'] };

      expect(() => createTaskCommit(tmpDir, intent, stagingResult)).toThrow(
        expect.objectContaining({ code: 'TREE_MISMATCH' })
      );

      expect(git(tmpDir, ['rev-parse', TASK_REF]).trim()).toBe(baseSha);
    });
  });

  describe('PARENT_MISMATCH', () => {
    test('throws and leaves taskRef untouched when taskRef has moved since the intent was persisted', () => {
      writeFile(tmpDir, 'other.txt', 'someone else committed here\n');
      git(tmpDir, ['add', '-A']);
      git(tmpDir, ['commit', '-q', '-m', 'a concurrent commit on taskRef']);
      const movedSha = git(tmpDir, ['rev-parse', 'HEAD']).trim();
      git(tmpDir, ['update-ref', TASK_REF, movedSha]);

      writeFile(tmpDir, 'target.txt', 'v2\n');
      git(tmpDir, ['add', '--', 'target.txt']);
      const treeSha = currentTreeSha(tmpDir);

      const intent = {
        taskRef: TASK_REF,
        parentSha: baseSha, // stale — taskRef now points at movedSha
        expectedTreeSha: treeSha,
        commitMessage: 'feat: stale parent',
        trailers: makeTrailers(),
      };
      const stagingResult = { treeSha: treeSha, stagedPaths: ['target.txt'] };

      expect(() => createTaskCommit(tmpDir, intent, stagingResult)).toThrow(
        expect.objectContaining({ code: 'PARENT_MISMATCH' })
      );

      // Untouched — still at the "concurrent" tip, not reverted to baseSha
      // and not advanced to a new commit either.
      expect(git(tmpDir, ['rev-parse', TASK_REF]).trim()).toBe(movedSha);
    });

    test('throws PARENT_MISMATCH when taskRef does not resolve to any commit', () => {
      writeFile(tmpDir, 'target.txt', 'v2\n');
      git(tmpDir, ['add', '--', 'target.txt']);
      const treeSha = currentTreeSha(tmpDir);

      const intent = {
        taskRef: 'refs/heads/ai-toolkit-task-never-created',
        parentSha: baseSha,
        expectedTreeSha: treeSha,
        commitMessage: 'feat: missing ref',
        trailers: makeTrailers(),
      };
      const stagingResult = { treeSha: treeSha, stagedPaths: ['target.txt'] };

      expect(() => createTaskCommit(tmpDir, intent, stagingResult)).toThrow(
        expect.objectContaining({ code: 'PARENT_MISMATCH' })
      );
    });

    test('a second call against the same (now stale) intent after a successful commit is rejected rather than double-committing', () => {
      writeFile(tmpDir, 'target.txt', 'v2\n');
      git(tmpDir, ['add', '--', 'target.txt']);
      const treeSha = currentTreeSha(tmpDir);

      const intent = {
        taskRef: TASK_REF,
        parentSha: baseSha,
        expectedTreeSha: treeSha,
        commitMessage: 'feat: first call',
        trailers: makeTrailers(),
      };
      const stagingResult = { treeSha: treeSha, stagedPaths: ['target.txt'] };

      const first = createTaskCommit(tmpDir, intent, stagingResult);

      expect(() => createTaskCommit(tmpDir, intent, stagingResult)).toThrow(
        expect.objectContaining({ code: 'PARENT_MISMATCH' })
      );

      // taskRef still at the first (only) commit produced.
      expect(git(tmpDir, ['rev-parse', TASK_REF]).trim()).toBe(first.commitSha);
    });
  });
});

// ── Test-isolation discipline note ──────────────────────────────────────────
// Grep verification performed manually before reporting this task done: every
// call to spawnSync('git', ...) in this file (both the local `git()` helper
// and its callers) passes an explicit `cwd` bound to `tmpDir` (a fresh
// fs.mkdtempSync(os.tmpdir()) directory created in beforeEach and removed in
// afterEach). No test in this file calls process.chdir(), no test omits
// `cwd`, and no test path resolves into
// c:/ws/Fincantieri.CommonLibraries.AIToolkit (this project's own working
// tree). user.name/user.email are set locally per repo, never --global.
