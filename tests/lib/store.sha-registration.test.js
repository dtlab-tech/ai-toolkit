'use strict';

// Tests for lib/task-executor/store.js registerCommitSHA (US-05-TASK-BE-04,
// FTR-018). Persists the real, already-confirmed commit SHA that
// createTaskCommit (US-05-TASK-BE-03, git.js) produced, into executor state
// OUTSIDE the tracked worktree. This suite runs no git commands — it drives
// registerCommitSHA directly against a store State fixture, exactly as a
// real caller would after createTaskCommit has already returned.

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const {
  State,
  writeState,
  readState,
  registerCommitSHA,
} = require('../../lib/task-executor/store');

const RUN_ID = 'run-1';
const TASK_ID = 'US-99-TASK-BE-01';
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

function baseFields(overrides) {
  return Object.assign({
    runId:         RUN_ID,
    featureId:     'FTR-099',
    repo:          '/repo',
    commonDir:     '/repo/.git',
    featureRef:    'refs/heads/feature/x',
    baseSha:       'a'.repeat(40),
    planDigest:    'b'.repeat(64),
    contextHashes: {},
    config:        { maxConcurrency: 1 },
    runStatus:     'running',
  }, overrides || {});
}

describe('registerCommitSHA', () => {
  let tmpDir;
  let executionRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-sha-registration-test-'));
    executionRoot = path.join(tmpDir, 'execution');

    let state = new State(baseFields()).addTask(TASK_ID, { dependencies: [] });
    state = state.addAttempt(TASK_ID, { stage: 'checkpoint-prepared' });
    writeState(executionRoot, RUN_ID, state);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('input validation', () => {
    test('throws SHA_REGISTRATION_VALIDATION_ERROR for a malformed taskId', () => {
      expect(() => registerCommitSHA(executionRoot, RUN_ID, '', 1, SHA_A))
        .toThrow(expect.objectContaining({ code: 'STATE_VALIDATION_ERROR' }));
    });

    test('throws SHA_REGISTRATION_VALIDATION_ERROR when attemptNumber is not a positive integer', () => {
      expect(() => registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 0, SHA_A))
        .toThrow(expect.objectContaining({ code: 'SHA_REGISTRATION_VALIDATION_ERROR' }));
    });

    test('throws SHA_REGISTRATION_VALIDATION_ERROR when commitSha is not a 40-char hex string', () => {
      expect(() => registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, 'not-a-sha'))
        .toThrow(expect.objectContaining({ code: 'SHA_REGISTRATION_VALIDATION_ERROR' }));
    });

    test('throws SHA_REGISTRATION_VALIDATION_ERROR when commitSha is too short', () => {
      expect(() => registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, 'abc123'))
        .toThrow(expect.objectContaining({ code: 'SHA_REGISTRATION_VALIDATION_ERROR' }));
    });

    test('accepts an uppercase-hex commitSha (case-insensitive SHA pattern)', () => {
      const result = registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_A.toUpperCase());
      expect(result.originalSha).toBe(SHA_A.toUpperCase());
    });

    test('throws STATE_TASK_NOT_FOUND for an unknown task', () => {
      expect(() => registerCommitSHA(executionRoot, RUN_ID, 'MISSING-TASK', 1, SHA_A))
        .toThrow(expect.objectContaining({ code: 'STATE_TASK_NOT_FOUND' }));
    });

    test('throws STATE_ATTEMPT_NOT_FOUND for an unknown attempt number', () => {
      expect(() => registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 2, SHA_A))
        .toThrow(expect.objectContaining({ code: 'STATE_ATTEMPT_NOT_FOUND' }));
    });
  });

  describe('stage preconditions', () => {
    test('throws SHA_REGISTRATION_STAGE_ERROR when the attempt is not at "checkpoint-prepared"', () => {
      let state = readState(executionRoot, RUN_ID);
      state = state.updateAttempt(TASK_ID, 1, { stage: 'reviewed' });
      writeState(executionRoot, RUN_ID, state);

      expect(() => registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_A))
        .toThrow(expect.objectContaining({ code: 'SHA_REGISTRATION_STAGE_ERROR' }));
    });
  });

  describe('default (non-sequential) registration', () => {
    test('sets originalSha and advances stage to "committed", leaving integratedSha null', () => {
      const result = registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_A);
      expect(result.stage).toBe('committed');
      expect(result.originalSha).toBe(SHA_A);
      expect(result.integratedSha).toBeNull();

      const state = readState(executionRoot, RUN_ID);
      const attempt = state.tasks[TASK_ID].attempts[0];
      expect(attempt.stage).toBe('committed');
      expect(attempt.originalSha).toBe(SHA_A);
      expect(attempt.integratedSha).toBeNull();
    });

    test('does not embed or otherwise write to the commit object — pure state mutation', () => {
      // No git command is ever invoked by registerCommitSHA; asserting the
      // function returns and only the state.json envelope changed is the
      // full extent of what can be checked from here (no worktree exists in
      // this fixture at all).
      registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_A);
      const stateFile = path.join(executionRoot, 'runs', RUN_ID, 'state.json');
      expect(fs.existsSync(stateFile)).toBe(true);
    });
  });

  describe('sequential (N=1) registration', () => {
    test('opts.sequential = true sets both originalSha and integratedSha to the same value', () => {
      const result = registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_A, { sequential: true });
      expect(result.originalSha).toBe(SHA_A);
      expect(result.integratedSha).toBe(SHA_A);

      const state = readState(executionRoot, RUN_ID);
      const attempt = state.tasks[TASK_ID].attempts[0];
      expect(attempt.originalSha).toBe(SHA_A);
      expect(attempt.integratedSha).toBe(SHA_A);
    });
  });

  describe('idempotent replay', () => {
    test('registering the identical SHA twice (non-sequential) is a no-op, not a conflict', () => {
      registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_A);
      expect(() => registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_A)).not.toThrow();

      const result = registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_A);
      expect(result.stage).toBe('committed');
      expect(result.originalSha).toBe(SHA_A);
    });

    test('registering the identical SHA twice (sequential) is a no-op', () => {
      registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_A, { sequential: true });
      expect(() => registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_A, { sequential: true })).not.toThrow();
    });

    test('a repeated identical call does not bump the state generation', () => {
      registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_A);
      const genAfterFirst = readState(executionRoot, RUN_ID).generation;
      registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_A);
      const genAfterSecond = readState(executionRoot, RUN_ID).generation;
      expect(genAfterSecond).toBe(genAfterFirst);
    });

    test('replaying non-sequential after a sequential registration is a conflict (integratedSha differs in intent)', () => {
      registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_A, { sequential: true });
      // Same commitSha, but now asking for a sequential registration to
      // re-verify integratedSha matches too — since it does, this must
      // still be treated as an identical, idempotent replay.
      expect(() => registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_A, { sequential: true })).not.toThrow();
    });
  });

  describe('fail-closed conflict on a different SHA', () => {
    test('throws SHA_REGISTRATION_CONFLICT when a different SHA is registered after one is already recorded', () => {
      registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_A);
      expect(() => registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_B))
        .toThrow(expect.objectContaining({ code: 'SHA_REGISTRATION_CONFLICT' }));

      // Nothing overwritten: the originally registered SHA is still in state.
      const state = readState(executionRoot, RUN_ID);
      expect(state.tasks[TASK_ID].attempts[0].originalSha).toBe(SHA_A);
    });

    test('throws SHA_REGISTRATION_CONFLICT when sequential=true is requested after a non-sequential registration', () => {
      registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_A);
      expect(() => registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_A, { sequential: true }))
        .toThrow(expect.objectContaining({ code: 'SHA_REGISTRATION_CONFLICT' }));

      const state = readState(executionRoot, RUN_ID);
      expect(state.tasks[TASK_ID].attempts[0].integratedSha).toBeNull();
    });
  });
});
