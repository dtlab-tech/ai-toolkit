'use strict';

// Tests for lib/task-executor/store.js registerIntegratedSHA
// (US-08-TASK-BE-04, FTR-018). This is the N>1 counterpart to
// registerCommitSHA's own opts.sequential (N=1) shortcut: it persists the
// real, already-confirmed integration commit SHA that integrateAttempt
// (US-08-TASK-BE-03, git.js) produced on the feature branch, separately from
// the originalSha already registered on the technical branch by
// registerCommitSHA. This suite runs no git commands — it drives
// registerIntegratedSHA directly against a store State fixture, exactly as a
// real caller would after integrateAttempt has already returned.

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const {
  State,
  writeState,
  readState,
  registerCommitSHA,
  registerIntegratedSHA,
} = require('../../lib/task-executor/store');

const RUN_ID = 'run-1';
const TASK_ID = 'US-99-TASK-BE-01';
const SHA_ORIGINAL = 'a'.repeat(40);
const SHA_INTEGRATED = 'c'.repeat(40);
const SHA_INTEGRATED_OTHER = 'd'.repeat(40);

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
    config:        { maxConcurrency: 2 },
    runStatus:     'running',
  }, overrides || {});
}

describe('registerIntegratedSHA', () => {
  let tmpDir;
  let executionRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-sha-tracking-test-'));
    executionRoot = path.join(tmpDir, 'execution');

    let state = new State(baseFields()).addTask(TASK_ID, { dependencies: [] });
    state = state.addAttempt(TASK_ID, { stage: 'checkpoint-prepared' });
    writeState(executionRoot, RUN_ID, state);

    // Reach the real precondition via registerCommitSHA itself (non-
    // sequential — the N>1 path this function exists for), exactly as a real
    // caller's sequence of calls would.
    registerCommitSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_ORIGINAL);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('input validation', () => {
    test('throws STATE_VALIDATION_ERROR for a malformed taskId', () => {
      expect(() => registerIntegratedSHA(executionRoot, RUN_ID, '', 1, SHA_INTEGRATED))
        .toThrow(expect.objectContaining({ code: 'STATE_VALIDATION_ERROR' }));
    });

    test('throws INTEGRATION_SHA_VALIDATION_ERROR when attemptNumber is not a positive integer', () => {
      expect(() => registerIntegratedSHA(executionRoot, RUN_ID, TASK_ID, 0, SHA_INTEGRATED))
        .toThrow(expect.objectContaining({ code: 'INTEGRATION_SHA_VALIDATION_ERROR' }));
    });

    test('throws INTEGRATION_SHA_VALIDATION_ERROR when integratedSha is not a 40-char hex string', () => {
      expect(() => registerIntegratedSHA(executionRoot, RUN_ID, TASK_ID, 1, 'not-a-sha'))
        .toThrow(expect.objectContaining({ code: 'INTEGRATION_SHA_VALIDATION_ERROR' }));
    });

    test('accepts an uppercase-hex integratedSha (case-insensitive SHA pattern)', () => {
      const result = registerIntegratedSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_INTEGRATED.toUpperCase());
      expect(result.integratedSha).toBe(SHA_INTEGRATED.toUpperCase());
    });

    test('throws STATE_TASK_NOT_FOUND for an unknown task', () => {
      expect(() => registerIntegratedSHA(executionRoot, RUN_ID, 'MISSING-TASK', 1, SHA_INTEGRATED))
        .toThrow(expect.objectContaining({ code: 'STATE_TASK_NOT_FOUND' }));
    });

    test('throws STATE_ATTEMPT_NOT_FOUND for an unknown attempt number', () => {
      expect(() => registerIntegratedSHA(executionRoot, RUN_ID, TASK_ID, 2, SHA_INTEGRATED))
        .toThrow(expect.objectContaining({ code: 'STATE_ATTEMPT_NOT_FOUND' }));
    });
  });

  describe('stage preconditions', () => {
    test('throws INTEGRATION_SHA_STAGE_ERROR when the attempt has not yet reached "committed"', () => {
      let state = readState(executionRoot, RUN_ID);
      state = state.updateAttempt(TASK_ID, 1, { stage: 'checkpoint-prepared', originalSha: null });
      writeState(executionRoot, RUN_ID, state);

      expect(() => registerIntegratedSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_INTEGRATED))
        .toThrow(expect.objectContaining({ code: 'INTEGRATION_SHA_STAGE_ERROR' }));
    });

    test('throws INTEGRATION_SHA_STAGE_ERROR when stage is "committed" but originalSha is somehow missing', () => {
      let state = readState(executionRoot, RUN_ID);
      state = state.updateAttempt(TASK_ID, 1, { originalSha: null });
      writeState(executionRoot, RUN_ID, state);

      expect(() => registerIntegratedSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_INTEGRATED))
        .toThrow(expect.objectContaining({ code: 'INTEGRATION_SHA_STAGE_ERROR' }));
    });
  });

  describe('registration', () => {
    test('sets integratedSha and advances stage to "integrated"', () => {
      const result = registerIntegratedSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_INTEGRATED);
      expect(result.stage).toBe('integrated');
      expect(result.integratedSha).toBe(SHA_INTEGRATED);
      expect(result.originalSha).toBe(SHA_ORIGINAL);

      const state = readState(executionRoot, RUN_ID);
      const attempt = state.tasks[TASK_ID].attempts[0];
      expect(attempt.stage).toBe('integrated');
      expect(attempt.integratedSha).toBe(SHA_INTEGRATED);
    });

    test('does not touch originalSha — it is identical before and after registration', () => {
      const before = readState(executionRoot, RUN_ID).tasks[TASK_ID].attempts[0].originalSha;
      registerIntegratedSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_INTEGRATED);
      const after = readState(executionRoot, RUN_ID).tasks[TASK_ID].attempts[0].originalSha;
      expect(after).toBe(before);
      expect(after).toBe(SHA_ORIGINAL);
    });

    test('does not set the task-level status (out of scope — see finalizeTaskCheckpoint precedent)', () => {
      registerIntegratedSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_INTEGRATED);
      const state = readState(executionRoot, RUN_ID);
      expect(state.tasks[TASK_ID].status).toBe('pending');
    });
  });

  describe('idempotent replay', () => {
    test('registering the identical integratedSha twice is a no-op, not a conflict', () => {
      registerIntegratedSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_INTEGRATED);
      expect(() => registerIntegratedSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_INTEGRATED)).not.toThrow();

      const result = registerIntegratedSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_INTEGRATED);
      expect(result.stage).toBe('integrated');
      expect(result.integratedSha).toBe(SHA_INTEGRATED);
    });

    test('a repeated identical call does not bump the state generation', () => {
      registerIntegratedSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_INTEGRATED);
      const genAfterFirst = readState(executionRoot, RUN_ID).generation;
      registerIntegratedSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_INTEGRATED);
      const genAfterSecond = readState(executionRoot, RUN_ID).generation;
      expect(genAfterSecond).toBe(genAfterFirst);
    });
  });

  describe('fail-closed conflict on a different SHA', () => {
    test('throws INTEGRATION_SHA_CONFLICT when a different integratedSha is registered after one is already recorded', () => {
      registerIntegratedSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_INTEGRATED);
      expect(() => registerIntegratedSHA(executionRoot, RUN_ID, TASK_ID, 1, SHA_INTEGRATED_OTHER))
        .toThrow(expect.objectContaining({ code: 'INTEGRATION_SHA_CONFLICT' }));

      // Nothing overwritten: the originally registered integratedSha is still in state.
      const state = readState(executionRoot, RUN_ID);
      expect(state.tasks[TASK_ID].attempts[0].integratedSha).toBe(SHA_INTEGRATED);
    });
  });
});
