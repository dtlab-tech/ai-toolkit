'use strict';

// Tests for lib/task-executor/git.js persistCheckpointIntent
// (US-05-TASK-BE-01, FTR-018). Persists the full pre-commit checkpoint
// intent for one task attempt — feature/run/task/attempt identifiers,
// planDigest, featureRef/taskRef, parent SHA, expected full tree SHA, an
// explicit enumerated changed-path inventory, review/verification receipt
// ids, and the planned commit message plus AI-Toolkit-Run/Task/Attempt/Plan
// trailer values — BEFORE any commit is attempted. This suite proves the
// validation, the reuse of store.js's writeIntent primitive, and the attempt
// stage transition to 'checkpoint-prepared'. It does not touch Git at all —
// no staging/commit logic exists yet (US-05-TASK-BE-02/03).

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const {
  State,
  writeState,
  readState,
  readIntent,
  listIntents,
} = require('../../lib/task-executor/store');
const { persistCheckpointIntent } = require('../../lib/task-executor/git');

const RUN_ID = 'run-1';
const TASK_ID = 'US-99-TASK-BE-01';
const PARENT_SHA = 'a'.repeat(40);
const TREE_SHA = 'b'.repeat(40);
const PLAN_DIGEST = 'c'.repeat(64);

function baseFields(overrides) {
  return Object.assign({
    runId:         RUN_ID,
    featureId:     'FTR-099',
    repo:          '/repo',
    commonDir:     '/repo/.git',
    featureRef:    'refs/heads/feature/x',
    baseSha:       PARENT_SHA,
    planDigest:    PLAN_DIGEST,
    contextHashes: {},
    config:        { maxConcurrency: 1 },
    runStatus:     'running',
  }, overrides || {});
}

function validIntent(overrides) {
  return Object.assign({
    featureId:              'FTR-099',
    runId:                  RUN_ID,
    taskId:                 TASK_ID,
    attemptNumber:          1,
    planDigest:             PLAN_DIGEST,
    featureRef:             'refs/heads/feature/x',
    taskRef:                'refs/heads/feature/x/' + TASK_ID,
    parentSha:              PARENT_SHA,
    expectedTreeSha:        TREE_SHA,
    changedPaths:           [{ path: 'lib/task-executor/git.js', changeType: 'modify' }],
    verificationReceiptIds: [TASK_ID + '-attempt1-verification-0'],
    reviewReceiptId:        TASK_ID + '-attempt1-review',
    outcomeReceiptId:       TASK_ID + '-attempt1-outcome',
    commitMessage:          'feat: add checkpoint intent persistence',
  }, overrides || {});
}

describe('persistCheckpointIntent', () => {
  let tmpDir;
  let executionRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-checkpoint-intent-test-'));
    executionRoot = path.join(tmpDir, 'execution');

    let state = new State(baseFields()).addTask(TASK_ID, { dependencies: [] });
    state = state.addAttempt(TASK_ID, { stage: 'reviewed' });
    writeState(executionRoot, RUN_ID, state);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('input validation (fails closed before any write)', () => {
    test.each([
      ['featureId', { featureId: '' }],
      ['runId', { runId: 'wrong-run' }],
      ['taskId', { taskId: '' }],
      ['attemptNumber', { attemptNumber: 0 }],
      ['planDigest', { planDigest: '' }],
      ['featureRef', { featureRef: '' }],
      ['taskRef', { taskRef: '' }],
      ['parentSha', { parentSha: 'not-a-sha' }],
      ['expectedTreeSha', { expectedTreeSha: 'not-a-sha' }],
      ['changedPaths (empty)', { changedPaths: [] }],
      ['changedPaths (wildcard-shaped entry)', { changedPaths: [{ path: '*', changeType: 'bogus' }] }],
      ['verificationReceiptIds (empty)', { verificationReceiptIds: [] }],
      ['reviewReceiptId', { reviewReceiptId: '' }],
      ['outcomeReceiptId', { outcomeReceiptId: '' }],
      ['commitMessage', { commitMessage: '' }],
    ])('rejects an invalid %s with CHECKPOINT_INTENT_VALIDATION_ERROR and writes nothing', (label, overrides) => {
      expect(() =>
        persistCheckpointIntent(executionRoot, RUN_ID, validIntent(overrides))
      ).toThrow(expect.objectContaining({ code: 'CHECKPOINT_INTENT_VALIDATION_ERROR' }));

      expect(listIntents(executionRoot, RUN_ID)).toEqual([]);
      const state = readState(executionRoot, RUN_ID);
      expect(state.tasks[TASK_ID].attempts[0].stage).toBe('reviewed');
    });

    test('throws STATE_TASK_NOT_FOUND for an unknown task', () => {
      expect(() =>
        persistCheckpointIntent(executionRoot, RUN_ID, validIntent({ taskId: 'MISSING-TASK' }))
      ).toThrow(expect.objectContaining({ code: 'STATE_TASK_NOT_FOUND' }));
    });

    test('throws STATE_ATTEMPT_NOT_FOUND for an unknown attempt number', () => {
      expect(() =>
        persistCheckpointIntent(executionRoot, RUN_ID, validIntent({ attemptNumber: 2 }))
      ).toThrow(expect.objectContaining({ code: 'STATE_ATTEMPT_NOT_FOUND' }));
    });

    test('throws CHECKPOINT_INTENT_STAGE_ERROR when the attempt has not passed review yet', () => {
      let state = readState(executionRoot, RUN_ID);
      state = state.updateAttempt(TASK_ID, 1, { stage: 'verified' });
      writeState(executionRoot, RUN_ID, state);

      expect(() =>
        persistCheckpointIntent(executionRoot, RUN_ID, validIntent())
      ).toThrow(expect.objectContaining({ code: 'CHECKPOINT_INTENT_STAGE_ERROR' }));
      expect(listIntents(executionRoot, RUN_ID)).toEqual([]);
    });
  });

  describe('successful persistence', () => {
    test('writes the immutable intent record with the exact intent shape and derived trailers', () => {
      const result = persistCheckpointIntent(executionRoot, RUN_ID, validIntent());

      expect(result.intentId).toBe(TASK_ID + '-attempt1-checkpoint');

      const persisted = readIntent(executionRoot, RUN_ID, result.intentId);
      expect(persisted).toEqual({
        featureId:              'FTR-099',
        runId:                  RUN_ID,
        taskId:                 TASK_ID,
        attemptNumber:          1,
        planDigest:             PLAN_DIGEST,
        featureRef:             'refs/heads/feature/x',
        taskRef:                'refs/heads/feature/x/' + TASK_ID,
        parentSha:              PARENT_SHA,
        expectedTreeSha:        TREE_SHA,
        changedPaths:           [{ path: 'lib/task-executor/git.js', changeType: 'modify' }],
        verificationReceiptIds: [TASK_ID + '-attempt1-verification-0'],
        reviewReceiptId:        TASK_ID + '-attempt1-review',
        outcomeReceiptId:       TASK_ID + '-attempt1-outcome',
        commitMessage:          'feat: add checkpoint intent persistence',
        trailers: {
          'AI-Toolkit-Run':     RUN_ID,
          'AI-Toolkit-Task':    TASK_ID,
          'AI-Toolkit-Attempt': '1',
          'AI-Toolkit-Plan':    PLAN_DIGEST,
        },
      });
    });

    test('advances the attempt to "checkpoint-prepared" and records the intentId, durably', () => {
      const result = persistCheckpointIntent(executionRoot, RUN_ID, validIntent());

      const state = readState(executionRoot, RUN_ID);
      const attempt = state.tasks[TASK_ID].attempts[0];
      expect(attempt.stage).toBe('checkpoint-prepared');
      expect(attempt.intentIds).toEqual([result.intentId]);
    });

    test('does not touch Git and never mutates verificationRefs/reviewRefs', () => {
      persistCheckpointIntent(executionRoot, RUN_ID, validIntent());
      const state = readState(executionRoot, RUN_ID);
      const attempt = state.tasks[TASK_ID].attempts[0];
      expect(attempt.verificationRefs).toEqual([]);
      expect(attempt.reviewRefs).toEqual([]);
    });

    test('an identical replay is idempotent: same intentId, no INTENT_CONFLICT, attempt unchanged', () => {
      const first = persistCheckpointIntent(executionRoot, RUN_ID, validIntent());
      const second = persistCheckpointIntent(executionRoot, RUN_ID, validIntent());

      expect(second.intentId).toBe(first.intentId);
      const state = readState(executionRoot, RUN_ID);
      const attempt = state.tasks[TASK_ID].attempts[0];
      expect(attempt.stage).toBe('checkpoint-prepared');
      expect(attempt.intentIds).toEqual([first.intentId]);
    });

    test('a differing replay under the same taskId/attempt throws INTENT_CONFLICT', () => {
      persistCheckpointIntent(executionRoot, RUN_ID, validIntent());
      expect(() =>
        persistCheckpointIntent(executionRoot, RUN_ID, validIntent({ commitMessage: 'feat: something else entirely' }))
      ).toThrow(expect.objectContaining({ code: 'INTENT_CONFLICT' }));
    });
  });
});
