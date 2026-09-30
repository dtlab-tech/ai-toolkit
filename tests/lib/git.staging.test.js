'use strict';

// Tests for lib/task-executor/git.js stageTaskFiles (US-05-TASK-BE-02,
// FTR-018). Stages ONLY the enumerated task-attributable paths via argv-based
// `git add -- <path...>`, then reports the resulting tree SHA and staged
// path list for a later caller (US-05-TASK-BE-03, commit creation) to compare
// against a persisted checkpoint intent. This suite exercises the real `git`
// binary against isolated, disposable repositories — it does not mock Git.
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
const { stageTaskFiles } = require('../../lib/task-executor/git');

// Thin real-git helper used ONLY for test setup/assertions (never as part of
// the code under test) — always takes an explicit `dir`, always shell:false,
// always argv array.
function git(dir, args) {
  const res = spawnSync('git', args, { cwd: dir, shell: false, encoding: 'utf8', windowsHide: true });
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
}

describe('stageTaskFiles', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-toolkit-git-staging-test-'));
    initRepo(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('input validation (fails closed, no git command run)', () => {
    test('throws STAGING_VALIDATION_ERROR for a non-existent cwd', () => {
      expect(() =>
        stageTaskFiles(path.join(tmpDir, 'does-not-exist'), [{ path: 'a.txt', changeType: 'add' }])
      ).toThrow(expect.objectContaining({ code: 'STAGING_VALIDATION_ERROR' }));
    });

    test('throws STAGING_VALIDATION_ERROR for an empty changedPaths array', () => {
      expect(() => stageTaskFiles(tmpDir, [])).toThrow(
        expect.objectContaining({ code: 'STAGING_VALIDATION_ERROR' })
      );
    });

    test('throws STAGING_VALIDATION_ERROR for an invalid changeType', () => {
      expect(() => stageTaskFiles(tmpDir, [{ path: 'a.txt', changeType: 'bogus' }])).toThrow(
        expect.objectContaining({ code: 'STAGING_VALIDATION_ERROR' })
      );
    });

    test('throws STAGING_VALIDATION_ERROR for a duplicated path entry', () => {
      writeFile(tmpDir, 'a.txt', 'x\n');
      expect(() =>
        stageTaskFiles(tmpDir, [
          { path: 'a.txt', changeType: 'add' },
          { path: 'a.txt', changeType: 'add' },
        ])
      ).toThrow(expect.objectContaining({ code: 'STAGING_VALIDATION_ERROR' }));
    });
  });

  describe('successful staging', () => {
    test('stages an added, a modified and a deleted path in one call and reports a tree matching write-tree', () => {
      writeFile(tmpDir, 'keep.txt', 'unchanged\n');
      writeFile(tmpDir, 'modify-me.txt', 'v1\n');
      writeFile(tmpDir, 'delete-me.txt', 'to be removed\n');
      commitAll(tmpDir, 'init');

      writeFile(tmpDir, 'new.txt', 'brand new\n');
      writeFile(tmpDir, 'modify-me.txt', 'v2\n');
      fs.unlinkSync(path.join(tmpDir, 'delete-me.txt'));

      const result = stageTaskFiles(tmpDir, [
        { path: 'new.txt', changeType: 'add' },
        { path: 'modify-me.txt', changeType: 'modify' },
        { path: 'delete-me.txt', changeType: 'delete' },
      ]);

      expect(result.treeSha).toMatch(/^[0-9a-f]{40}$/);
      expect(result.stagedPaths.slice().sort()).toEqual(['delete-me.txt', 'modify-me.txt', 'new.txt']);

      const actualTreeSha = git(tmpDir, ['write-tree']).trim();
      expect(result.treeSha).toBe(actualTreeSha);

      expect(result.stagedPaths).not.toContain('keep.txt');
      expect(git(tmpDir, ['status', '--porcelain'])).not.toMatch(/keep\.txt/);
    });

    test('handles paths containing spaces and Unicode characters', () => {
      writeFile(tmpDir, 'a file.txt', 'v1\n');
      writeFile(tmpDir, 'ünïcödé.txt', 'v1\n');
      commitAll(tmpDir, 'init');

      writeFile(tmpDir, 'a file.txt', 'v2\n');
      writeFile(tmpDir, 'ünïcödé.txt', 'v2\n');

      const result = stageTaskFiles(tmpDir, [
        { path: 'a file.txt', changeType: 'modify' },
        { path: 'ünïcödé.txt', changeType: 'modify' },
      ]);

      expect(result.stagedPaths.slice().sort()).toEqual(['a file.txt', 'ünïcödé.txt'].sort());
    });

    test('ignores a pre-existing unrelated dirty file and does not report it as staged', () => {
      writeFile(tmpDir, 'target.txt', 'v1\n');
      writeFile(tmpDir, 'dirty.txt', 'v1\n');
      commitAll(tmpDir, 'init');

      writeFile(tmpDir, 'target.txt', 'v2\n');
      writeFile(tmpDir, 'dirty.txt', 'v2 unrelated dirt, never enumerated\n');

      const result = stageTaskFiles(tmpDir, [{ path: 'target.txt', changeType: 'modify' }]);

      expect(result.stagedPaths).toEqual(['target.txt']);
      expect(git(tmpDir, ['status', '--porcelain'])).toMatch(/ M dirty\.txt/);
    });
  });

  describe('STAGING_MISMATCH', () => {
    test('throws when a declared "delete" path is still present and unchanged on disk', () => {
      writeFile(tmpDir, 'still-here.txt', 'unchanged\n');
      commitAll(tmpDir, 'init');
      // Not actually deleted from disk — contradicts the declared changeType.

      expect(() => stageTaskFiles(tmpDir, [{ path: 'still-here.txt', changeType: 'delete' }])).toThrow(
        expect.objectContaining({ code: 'STAGING_MISMATCH' })
      );

      expect(git(tmpDir, ['status', '--porcelain']).trim()).toBe('');
    });

    test('throws when a declared "modify" path is actually missing (would stage as a deletion)', () => {
      writeFile(tmpDir, 'oops.txt', 'v1\n');
      commitAll(tmpDir, 'init');
      fs.unlinkSync(path.join(tmpDir, 'oops.txt'));

      expect(() => stageTaskFiles(tmpDir, [{ path: 'oops.txt', changeType: 'modify' }])).toThrow(
        expect.objectContaining({ code: 'STAGING_MISMATCH' })
      );
    });
  });

  describe('git add failure (bad pathspec)', () => {
    test('throws GIT_ADD_FAILED for a path matching no tracked or existing file, and stages nothing at all', () => {
      writeFile(tmpDir, 'real.txt', 'v1\n');
      commitAll(tmpDir, 'init');
      writeFile(tmpDir, 'real.txt', 'v2\n');

      expect(() =>
        stageTaskFiles(tmpDir, [
          { path: 'real.txt', changeType: 'modify' },
          { path: 'ghost.txt', changeType: 'add' },
        ])
      ).toThrow(expect.objectContaining({ code: 'GIT_ADD_FAILED' }));

      // Atomic: real.txt must remain unstaged too — nothing from the failed
      // call was partially applied.
      expect(git(tmpDir, ['status', '--porcelain'])).toMatch(/ M real\.txt/);
      expect(git(tmpDir, ['diff', '--cached', '--name-only']).trim()).toBe('');
    });
  });

  describe('UNEXPECTED_INDEX_CHANGE (external mutation during staging)', () => {
    test('throws when a git clean-filter side effect modifies an unrelated tracked file during git add', () => {
      writeFile(tmpDir, 'other.txt', 'line1\n');
      writeFile(tmpDir, 'target.txt', 'hello\n');
      commitAll(tmpDir, 'init');

      // A real Git extension point (a clean filter, declared via
      // .gitattributes + `git config filter.<name>.clean`) that runs an
      // arbitrary external process during `git add`. This script passes
      // target.txt's content through unchanged (a well-behaved clean filter
      // must), but as a side effect also mutates an entirely unrelated
      // tracked file — modeling exactly the "hooks may fail or change index"
      // / external-mutation case the Tech-Spec calls out. This is a real git
      // mechanism, not a stub or mock of stageTaskFiles.
      const scriptPath = path.join(tmpDir, 'sideeffect.js');
      fs.writeFileSync(
        scriptPath,
        [
          "const fs = require('fs');",
          'const otherPath = process.argv[2];',
          "fs.appendFileSync(otherPath, 'external-mutation\\n');",
          'const data = fs.readFileSync(0);',
          'process.stdout.write(data);',
          '',
        ].join('\n')
      );

      writeFile(tmpDir, '.gitattributes', 'target.txt filter=sideeffect\n');
      const otherAbsPath = path.join(tmpDir, 'other.txt').split(path.sep).join('/');
      const scriptAbsPath = scriptPath.split(path.sep).join('/');
      const nodeAbsPath = process.execPath.split(path.sep).join('/');
      git(tmpDir, [
        'config',
        'filter.sideeffect.clean',
        '"' + nodeAbsPath + '" "' + scriptAbsPath + '" "' + otherAbsPath + '"',
      ]);

      writeFile(tmpDir, 'target.txt', 'hello\nchanged\n');

      expect(() => stageTaskFiles(tmpDir, [{ path: 'target.txt', changeType: 'modify' }])).toThrow(
        expect.objectContaining({ code: 'UNEXPECTED_INDEX_CHANGE' })
      );

      // Nothing was reset/cleaned — the mutation and the (attempted) staging
      // are both still visible, exactly as the Tech-Spec requires
      // ("block on mismatch without discarding anything").
      expect(fs.readFileSync(path.join(tmpDir, 'other.txt'), 'utf8')).toContain('external-mutation');
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
