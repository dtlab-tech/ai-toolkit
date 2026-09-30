'use strict';

// Tests for lib/task-executor/index.js finalizeTaskCheckpoint (US-05-TASK-BE-05,
// FTR-018). Completes US-05 "checkpoint, stage, commit, and register SHA":
// reconciles an already-registered commit SHA (store.js's registerCommitSHA,
// US-05-TASK-BE-04, already ran) against real Git ancestry on the feature
// branch, marks the task's overall status 'checkpointed', and closes the
// ledger's 'task'-kind activity that dispatchTaskAttempt (US-03-TASK-BE-03)
// opens at dispatch time and deliberately never closes itself.
//
// SAFETY (mandatory — mirrors tests/lib/git.commit.test.js's exact discipline):
// every git command in this suite runs with an explicit `cwd` pointing at a
// repository created fresh, per test, under `fs.mkdtempSync(os.tmpdir())`,
// with a LOCAL (repo-scoped only) `user.name`/`user.email` set via
// `git config` (never `--global`). No git command in this file ever targets
// this project's own working tree (c:/ws/Fincantieri.CommonLibraries.AIToolkit).
// Every tmp repo is removed in `afterEach`.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const store = require('../../lib/task-executor/store');
const ledger = require('../../lib/execution-ledger');
const { finalizeTaskCheckpoint } = require('../../lib/task-executor/index');

const RUN_ID = 'run-1';
const TASK_ID = 'US-99-TASK-BE-01';
const ATTEMPT_NUMBER = 1;
const LEDGER_TASK_AGENT_KEY = 'executor:' + RUN_ID + ':' + TASK_ID + ':task';

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

describe('finalizeTaskCheckpoint', () => {
  let tmpDir;
  let executionRoot;
  let repoDir;
  let featureRef;
  let baseSha;
  let taskCommitSha;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconciliation-test-'));
    executionRoot = path.join(tmpDir, 'execution');
    repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir);

    initRepo(repoDir);
    writeFile(repoDir, 'base.txt', 'base\n');
    baseSha = commitAll(repoDir, 'init');

    // N=1 model (Tech-Spec section 8): the task commit lands directly on the
    // feature branch — taskRef IS the checked-out branch here.
    const branchName = git(repoDir, ['symbolic-ref', '--short', 'HEAD']).trim();
    featureRef = 'refs/heads/' + branchName;

    // Simulates createTaskCommit (US-05-TASK-BE-03) having already committed
    // the task's change directly onto the feature branch.
    writeFile(repoDir, 'task.txt', 'v1\n');
    taskCommitSha = commitAll(repoDir, 'feat(US-99-TASK-BE-01): task commit');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Seeds executor state with the task attempt already at stage 'committed'
  // with the given originalSha — i.e. exactly where registerCommitSHA
  // (US-05-TASK-BE-04) leaves it. This suite does not call registerCommitSHA
  // itself (its own contract is covered by store.sha-registration.test.js);
  // it starts from that already-reached state, same as store.sha-registration
  // and git.commit's own suites start from their own upstream preconditions.
  function seedState(attemptOverrides) {
    let state = new store.State(baseStateFields()).addTask(TASK_ID, { dependencies: [] });
    state = state.addAttempt(
      TASK_ID,
      Object.assign({ stage: 'committed', originalSha: taskCommitSha }, attemptOverrides || {})
    );
    store.writeState(executionRoot, RUN_ID, state);
  }

  // Mirrors what dispatchTaskAttempt (US-03-TASK-BE-03) does at dispatch time
  // for the 'task'-kind ledger activity: opens it before this suite's
  // function under test ever runs. finalizeActivity requires an EXISTING
  // entry (exact operation_id match, no name-only fallback) — it cannot
  // create one — so every test that expects finalizeTaskCheckpoint to
  // succeed must call this first.
  function openTaskLedgerActivity() {
    const ledgerPaths = store._executionPaths(executionRoot, RUN_ID);
    return ledger.open(ledgerPaths.runDir, RUN_ID, LEDGER_TASK_AGENT_KEY, 'task', null, ATTEMPT_NUMBER);
  }

  function readLedgerEntries() {
    const ledgerPaths = store._executionPaths(executionRoot, RUN_ID);
    const ledgerFile = path.join(ledgerPaths.runDir, RUN_ID + '-token-ledger.json');
    return JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  }

  function baseArgs(overrides) {
    return Object.assign(
      {
        executionRoot,
        runId: RUN_ID,
        taskId: TASK_ID,
        attemptNumber: ATTEMPT_NUMBER,
        projectDir: repoDir,
        taskRef: featureRef,
      },
      overrides || {}
    );
  }

  describe('happy path (step 1-4, in order)', () => {
    test('marks the task checkpointed and closes the ledger task activity with control-only null tokens', () => {
      seedState();
      openTaskLedgerActivity();

      const result = finalizeTaskCheckpoint(baseArgs());

      expect(result).toMatchObject({
        taskId: TASK_ID,
        attemptNumber: ATTEMPT_NUMBER,
        taskStatus: 'checkpointed',
        originalSha: taskCommitSha,
        taskRef: featureRef,
      });
      expect(typeof result.ledgerOperationId).toBe('string');

      const state = store.readState(executionRoot, RUN_ID);
      expect(state.tasks[TASK_ID].status).toBe('checkpointed');

      const entries = readLedgerEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].agent).toBe(LEDGER_TASK_AGENT_KEY);
      expect(entries[0].status).toBe('done');
      expect(entries[0].phase_delta_tokens).toBeNull();
      expect(entries[0].usage_reason).toBe('control-only');
      expect(entries[0].completed_at).toBeTruthy();
    });

    test('succeeds when the registered SHA is an ancestor several generations behind the current branch tip (real transitive ancestry, not tip equality)', () => {
      seedState();
      openTaskLedgerActivity();

      // Advance the feature branch further past taskCommitSha — the
      // registered SHA is still reachable, just no longer the tip.
      writeFile(repoDir, 'later.txt', 'v2\n');
      commitAll(repoDir, 'feat: a later unrelated commit');
      writeFile(repoDir, 'later2.txt', 'v3\n');
      commitAll(repoDir, 'feat: another later commit');

      const result = finalizeTaskCheckpoint(baseArgs());
      expect(result.taskStatus).toBe('checkpointed');

      const state = store.readState(executionRoot, RUN_ID);
      expect(state.tasks[TASK_ID].status).toBe('checkpointed');
    });
  });

  describe('SHA_NOT_ON_BRANCH', () => {
    test('throws and leaves task/ledger state untouched when the registered SHA is not reachable from taskRef', () => {
      seedState();
      openTaskLedgerActivity();

      // A sibling branch created from the pre-task-commit base — genuinely
      // does not contain taskCommitSha.
      git(repoDir, ['branch', 'other-branch', baseSha]);
      const otherRef = 'refs/heads/other-branch';

      expect(() => finalizeTaskCheckpoint(baseArgs({ taskRef: otherRef })))
        .toThrow(expect.objectContaining({ code: 'SHA_NOT_ON_BRANCH' }));

      const state = store.readState(executionRoot, RUN_ID);
      expect(state.tasks[TASK_ID].status).toBe('pending');

      const entries = readLedgerEntries();
      expect(entries[0].status).toBe('running');
      expect(entries[0].completed_at).toBeNull();
    });
  });

  describe('TASK_NOT_COMMITTED', () => {
    test('throws when the attempt is at an earlier stage than "committed"', () => {
      seedState({ stage: 'checkpoint-prepared', originalSha: null });
      openTaskLedgerActivity();

      expect(() => finalizeTaskCheckpoint(baseArgs()))
        .toThrow(expect.objectContaining({ code: 'TASK_NOT_COMMITTED' }));

      const state = store.readState(executionRoot, RUN_ID);
      expect(state.tasks[TASK_ID].status).toBe('pending');
    });

    test('throws when stage is "committed" but originalSha is missing/invalid (defensive guard)', () => {
      seedState({ originalSha: null });
      openTaskLedgerActivity();

      expect(() => finalizeTaskCheckpoint(baseArgs()))
        .toThrow(expect.objectContaining({ code: 'TASK_NOT_COMMITTED' }));
    });
  });

  describe('state lookup failures', () => {
    test('throws STATE_TASK_NOT_FOUND for an unknown task', () => {
      seedState();
      openTaskLedgerActivity();

      expect(() => finalizeTaskCheckpoint(baseArgs({ taskId: 'MISSING-TASK' })))
        .toThrow(expect.objectContaining({ code: 'STATE_TASK_NOT_FOUND' }));
    });

    test('throws STATE_ATTEMPT_NOT_FOUND for an unknown attempt number', () => {
      seedState();
      openTaskLedgerActivity();

      expect(() => finalizeTaskCheckpoint(baseArgs({ attemptNumber: 7 })))
        .toThrow(expect.objectContaining({ code: 'STATE_ATTEMPT_NOT_FOUND' }));
    });

    test('throws STATE_NOT_FOUND when no run state exists at all', () => {
      // No seedState() call — executionRoot/runId has never been written.
      expect(() => finalizeTaskCheckpoint(baseArgs()))
        .toThrow(expect.objectContaining({ code: 'STATE_NOT_FOUND' }));
    });
  });

  describe('ledger activity precondition (finalizeActivity contract propagated unmodified)', () => {
    test('throws ACTIVITY_NOT_FOUND when the task-kind ledger activity was never opened', () => {
      seedState();
      // Deliberately skip openTaskLedgerActivity() — simulates a legacy run
      // (or a dispatch path that predates this task's fix) where the 'task'
      // kind entry was never opened.
      expect(() => finalizeTaskCheckpoint(baseArgs()))
        .toThrow(expect.objectContaining({ code: 'ACTIVITY_NOT_FOUND' }));

      // Documented (not a bug): steps 1-3 already ran and durably advanced
      // task status to 'checkpointed' before step 4's ledger close failed.
      // Nothing here re-verifies attempt.stage (still 'committed') or
      // reachability (still holds), so a later retry — once the ledger
      // activity is fixed/opened — safely completes step 4 without
      // repeating any git or state work incorrectly.
      const state = store.readState(executionRoot, RUN_ID);
      expect(state.tasks[TASK_ID].status).toBe('checkpointed');
    });
  });

  describe('idempotent replay', () => {
    test('calling finalizeTaskCheckpoint twice for the same already-checkpointed attempt does not throw or duplicate the ledger close', () => {
      seedState();
      openTaskLedgerActivity();

      const first = finalizeTaskCheckpoint(baseArgs());
      expect(() => finalizeTaskCheckpoint(baseArgs())).not.toThrow();
      const second = finalizeTaskCheckpoint(baseArgs());

      expect(second.taskStatus).toBe('checkpointed');
      expect(second.originalSha).toBe(first.originalSha);

      const entries = readLedgerEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].status).toBe('done');
    });
  });

  describe('input validation', () => {
    test('throws DISPATCH_VALIDATION_ERROR when required fields are missing', () => {
      expect(() => finalizeTaskCheckpoint({}))
        .toThrow(expect.objectContaining({ code: 'DISPATCH_VALIDATION_ERROR' }));
    });

    test('throws DISPATCH_VALIDATION_ERROR when attemptNumber is not a positive integer', () => {
      seedState();
      openTaskLedgerActivity();
      expect(() => finalizeTaskCheckpoint(baseArgs({ attemptNumber: 0 })))
        .toThrow(expect.objectContaining({ code: 'DISPATCH_VALIDATION_ERROR' }));
      expect(() => finalizeTaskCheckpoint(baseArgs({ attemptNumber: 'one' })))
        .toThrow(expect.objectContaining({ code: 'DISPATCH_VALIDATION_ERROR' }));
    });

    test('throws DISPATCH_VALIDATION_ERROR when taskRef is missing', () => {
      seedState();
      openTaskLedgerActivity();
      expect(() => finalizeTaskCheckpoint(baseArgs({ taskRef: undefined })))
        .toThrow(expect.objectContaining({ code: 'DISPATCH_VALIDATION_ERROR' }));
    });
  });

  describe('git reachability check mechanics', () => {
    test('throws GIT_MERGE_BASE_FAILED (not silently false) when the registered SHA is not a valid object at all', () => {
      seedState({ originalSha: 'f'.repeat(40) }); // well-formed hex, but not a real object in this repo
      openTaskLedgerActivity();

      expect(() => finalizeTaskCheckpoint(baseArgs()))
        .toThrow(expect.objectContaining({ code: 'GIT_MERGE_BASE_FAILED' }));

      const state = store.readState(executionRoot, RUN_ID);
      expect(state.tasks[TASK_ID].status).toBe('pending');
    });
  });
});

// ── Test-isolation discipline note ──────────────────────────────────────────
// Grep verification performed manually before reporting this task done: every
// call to spawnSync('git', ...) in this file (both the local `git()` helper
// and its callers) passes an explicit `cwd` bound to `repoDir`, itself nested
// under `tmpDir` (a fresh fs.mkdtempSync(os.tmpdir()) directory created in
// beforeEach and removed in afterEach). No test in this file calls
// process.chdir(), no test omits `cwd`, and no test path resolves into
// c:/ws/Fincantieri.CommonLibraries.AIToolkit (this project's own working
// tree). user.name/user.email are set locally per repo, never --global.
// finalizeTaskCheckpoint itself (lib/task-executor/index.js) also always
// receives an explicit projectDir/cwd for its own git merge-base call —
// never a bare `git` invocation relying on process.cwd().
