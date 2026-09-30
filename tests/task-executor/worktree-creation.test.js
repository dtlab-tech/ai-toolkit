'use strict';

// Unit/integration tests for createTaskWorktree (US-08-TASK-BE-01, FTR-018):
// lib/task-executor/index.js's isolated worktree creation/management
// primitive. This is a standalone primitive — NOT wired into execute()'s
// existing sequential main loop (US-07-TASK-BE-01), which stays N=1/
// single-worktree-free per that task's explicit scope. These tests exercise
// createTaskWorktree directly, never through execute().
//
// SAFETY (mirrors every other tests/task-executor/*.test.js file's exact
// discipline):
//   - Every git command in this suite runs against a repository created
//     fresh, per test, under fs.mkdtempSync(os.tmpdir()), with a LOCAL
//     (repo-scoped only) user.name/user.email set via `git config` (never
//     --global). No git command in this file ever targets this project's own
//     working tree.
//   - `git worktree add` creates REAL additional directories on disk (plus
//     `.git/worktrees/<name>` registrations). Every worktree this suite
//     creates is removed via the function's OWN cleanup() callback (proving
//     cleanup works), and the tmp repo itself is removed in afterEach — no
//     stray worktree directories or registrations are left behind anywhere
//     outside the test's own tmpDir.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const store = require('../../lib/task-executor/store');
const { createTaskWorktree } = require('../../lib/task-executor/index');

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

// Canonicalizes via fs.realpathSync.native, falling back to path.resolve
// when the path does not exist. Both this helper's callers and
// createTaskWorktree itself need this: on Windows, a tmp path built from
// os.tmpdir()/fs.mkdtempSync can be an 8.3 short-name alias (e.g.
// "...\TOMADA~1\...") while Git reports the SAME directory using its long
// form (e.g. "...\Tomada D\...") in `git worktree list --porcelain" — plain
// fs.realpathSync does not resolve this alias, but fs.realpathSync.native
// does (proven by direct experiment during implementation).
function realpathForCompare(p) {
  try {
    return fs.realpathSync.native(p);
  } catch (_) {
    return path.resolve(p);
  }
}

function listWorktreePaths(dir) {
  const out = gitCmd(dir, ['worktree', 'list', '--porcelain']);
  const paths = [];
  out.split(/\r?\n/).forEach(function (line) {
    if (line.indexOf('worktree ') === 0) {
      paths.push(realpathForCompare(line.slice('worktree '.length).trim()));
    }
  });
  return paths;
}

describe('createTaskWorktree() (US-08-TASK-BE-01)', () => {
  let tmpDir;
  let repoDir;
  let executionRoot;
  let runId;
  let baseSha;
  const createdCleanups = [];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-creation-test-'));
    repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir);

    initRepo(repoDir);
    writeFile(repoDir, 'base.txt', 'base\n');
    baseSha = commitAll(repoDir, 'init');

    const commonDirOut = gitCmd(repoDir, ['rev-parse', '--git-common-dir']).trim();
    executionRoot = path.join(path.resolve(repoDir, commonDirOut), 'ai-toolkit', 'execution');

    runId = 'run-' + Math.random().toString(36).slice(2);
  });

  afterEach(() => {
    // Prove every cleanup() this suite created actually works, and never
    // leave a stray worktree registered against the tmp repo before it is
    // removed wholesale.
    while (createdCleanups.length > 0) {
      const cleanup = createdCleanups.pop();
      try {
        cleanup();
      } catch (_) {
        // best-effort — the repo directory is about to be removed anyway;
        // do not let a cleanup failure here mask a real test failure above.
      }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates a worktree under the run-owned root, on the exact Tech-Spec branch name, at the given baseSha', () => {
    const result = createTaskWorktree({
      projectDir: repoDir,
      executionRoot: executionRoot,
      runId: runId,
      taskId: 'US-08-TASK-BE-99',
      attemptNumber: 1,
      baseSha: baseSha,
    });
    createdCleanups.push(result.cleanup);

    const runDir = store._executionPaths(executionRoot, runId).runDir;
    const expectedPath = path.resolve(path.join(runDir, 'worktrees', 'US-08-TASK-BE-99-attempt1'));
    expect(result.worktreePath).toBe(expectedPath);
    expect(fs.existsSync(result.worktreePath)).toBe(true);
    expect(fs.readFileSync(path.join(result.worktreePath, 'base.txt'), 'utf8')).toBe('base\n');

    expect(result.branch).toBe('ai-toolkit/' + runId + '/US-08-TASK-BE-99/1');
    const branchTip = gitCmd(repoDir, ['rev-parse', '--verify', result.branch + '^{commit}']).trim();
    expect(branchTip).toBe(baseSha);

    expect(listWorktreePaths(repoDir)).toContain(realpathForCompare(result.worktreePath));
  });

  test('produces a unique, non-colliding path per attempt number for the same task', () => {
    const attempt1 = createTaskWorktree({
      projectDir: repoDir, executionRoot: executionRoot, runId: runId,
      taskId: 'US-08-TASK-BE-01', attemptNumber: 1, baseSha: baseSha,
    });
    createdCleanups.push(attempt1.cleanup);
    const attempt2 = createTaskWorktree({
      projectDir: repoDir, executionRoot: executionRoot, runId: runId,
      taskId: 'US-08-TASK-BE-01', attemptNumber: 2, baseSha: baseSha,
    });
    createdCleanups.push(attempt2.cleanup);

    expect(attempt1.worktreePath).not.toBe(attempt2.worktreePath);
    expect(fs.existsSync(attempt1.worktreePath)).toBe(true);
    expect(fs.existsSync(attempt2.worktreePath)).toBe(true);
  });

  test('produces a unique, non-colliding path per task for the same attempt number', () => {
    const taskA = createTaskWorktree({
      projectDir: repoDir, executionRoot: executionRoot, runId: runId,
      taskId: 'US-08-TASK-BE-AA', attemptNumber: 1, baseSha: baseSha,
    });
    createdCleanups.push(taskA.cleanup);
    const taskB = createTaskWorktree({
      projectDir: repoDir, executionRoot: executionRoot, runId: runId,
      taskId: 'US-08-TASK-BE-BB', attemptNumber: 1, baseSha: baseSha,
    });
    createdCleanups.push(taskB.cleanup);

    expect(taskA.worktreePath).not.toBe(taskB.worktreePath);
  });

  test('is never aliased onto the main project worktree, and lives under Git-administrative (.git) storage rather than the tracked working directory', () => {
    const result = createTaskWorktree({
      projectDir: repoDir, executionRoot: executionRoot, runId: runId,
      taskId: 'US-08-TASK-BE-77', attemptNumber: 1, baseSha: baseSha,
    });
    createdCleanups.push(result.cleanup);

    const realWorktree = fs.realpathSync.native(result.worktreePath);
    const realProject = fs.realpathSync.native(repoDir);
    expect(realWorktree).not.toBe(realProject);

    // The worktree IS expected to be a physical filesystem descendant of the
    // main project directory here (it lives under executionRoot, which this
    // suite derives from the repo's own common Git directory) — that is fine
    // and by design (Tech-Spec/store.js convention) precisely because it is
    // under Git-administrative storage (.git), which Git itself never
    // treats as part of any worktree's tracked content. What must NEVER
    // happen is landing inside the main worktree's actual TRACKED
    // directory tree (i.e., anywhere under repoDir that is not itself
    // under repoDir/.git).
    const realGitDir = fs.realpathSync.native(path.join(repoDir, '.git'));
    expect(realWorktree.indexOf(realGitDir + path.sep)).toBe(0);
  });

  test('fails closed with WORKTREE_COLLISION when the requested worktree path already exists on disk', () => {
    const runDir = store._executionPaths(executionRoot, runId).runDir;
    const collisionPath = path.join(runDir, 'worktrees', 'US-08-TASK-BE-DUP-attempt1');
    fs.mkdirSync(collisionPath, { recursive: true });

    try {
      expect(() => createTaskWorktree({
        projectDir: repoDir, executionRoot: executionRoot, runId: runId,
        taskId: 'US-08-TASK-BE-DUP', attemptNumber: 1, baseSha: baseSha,
      })).toThrowError(expect.objectContaining({ code: 'WORKTREE_COLLISION' }));
    } finally {
      fs.rmSync(collisionPath, { recursive: true, force: true });
    }
  });

  test('rejects a target path that would be nested inside an already-existing worktree', () => {
    const outer = createTaskWorktree({
      projectDir: repoDir, executionRoot: executionRoot, runId: runId,
      taskId: 'US-08-TASK-BE-OUTER', attemptNumber: 1, baseSha: baseSha,
    });
    createdCleanups.push(outer.cleanup);

    // Directly exercise the independence guard by requesting a run-owned
    // root that is itself nested inside the outer worktree's own path — the
    // same failure mode the "before" collision check exists to catch, using
    // a real existing worktree as the obstruction rather than a bare
    // directory.
    const nestedExecutionRoot = path.join(outer.worktreePath, 'nested-execution-root');
    expect(() => createTaskWorktree({
      projectDir: repoDir, executionRoot: nestedExecutionRoot, runId: 'nested-run',
      taskId: 'US-08-TASK-BE-NESTED', attemptNumber: 1, baseSha: baseSha,
    })).toThrowError(expect.objectContaining({ code: 'WORKTREE_COLLISION' }));
  });

  describe('cleanup()', () => {
    test('removes the worktree directory and its git registration', () => {
      const result = createTaskWorktree({
        projectDir: repoDir, executionRoot: executionRoot, runId: runId,
        taskId: 'US-08-TASK-BE-CLEAN', attemptNumber: 1, baseSha: baseSha,
      });

      expect(fs.existsSync(result.worktreePath)).toBe(true);
      expect(listWorktreePaths(repoDir)).toContain(realpathForCompare(result.worktreePath));

      expect(() => result.cleanup()).not.toThrow();

      expect(fs.existsSync(result.worktreePath)).toBe(false);
      expect(listWorktreePaths(repoDir)).not.toContain(realpathForCompare(result.worktreePath));
    });

    test('is idempotent — calling cleanup() a second time does not throw', () => {
      const result = createTaskWorktree({
        projectDir: repoDir, executionRoot: executionRoot, runId: runId,
        taskId: 'US-08-TASK-BE-IDEMPOTENT', attemptNumber: 1, baseSha: baseSha,
      });

      result.cleanup();
      expect(() => result.cleanup()).not.toThrow();
    });

    test('is safe to call even after the worktree directory was already removed by hand', () => {
      const result = createTaskWorktree({
        projectDir: repoDir, executionRoot: executionRoot, runId: runId,
        taskId: 'US-08-TASK-BE-MANUAL-RM', attemptNumber: 1, baseSha: baseSha,
      });

      // Simulate manual removal: delete the directory directly via fs,
      // bypassing git entirely (never `git worktree remove` here).
      fs.rmSync(result.worktreePath, { recursive: true, force: true });
      expect(fs.existsSync(result.worktreePath)).toBe(false);

      expect(() => result.cleanup()).not.toThrow();
      expect(listWorktreePaths(repoDir)).not.toContain(realpathForCompare(result.worktreePath));
    });

    test('leaves the attempt branch intact after cleanup (branch persists until integration)', () => {
      const result = createTaskWorktree({
        projectDir: repoDir, executionRoot: executionRoot, runId: runId,
        taskId: 'US-08-TASK-BE-BRANCH-PERSIST', attemptNumber: 1, baseSha: baseSha,
      });

      result.cleanup();

      const branchTip = gitCmd(repoDir, ['rev-parse', '--verify', result.branch + '^{commit}']).trim();
      expect(branchTip).toBe(baseSha);
    });
  });

  test('rejects malformed input (missing projectDir) with WORKTREE_VALIDATION_ERROR', () => {
    expect(() => createTaskWorktree({
      executionRoot: executionRoot, runId: runId,
      taskId: 'US-08-TASK-BE-BAD', attemptNumber: 1, baseSha: baseSha,
    })).toThrowError(expect.objectContaining({ code: 'WORKTREE_VALIDATION_ERROR' }));
  });

  test('rejects a non-positive-integer attemptNumber with WORKTREE_VALIDATION_ERROR', () => {
    expect(() => createTaskWorktree({
      projectDir: repoDir, executionRoot: executionRoot, runId: runId,
      taskId: 'US-08-TASK-BE-BAD-ATTEMPT', attemptNumber: 0, baseSha: baseSha,
    })).toThrowError(expect.objectContaining({ code: 'WORKTREE_VALIDATION_ERROR' }));
  });
});
