'use strict';

// Tests for lib/task-executor/store.js persistVerificationReviewOutcome
// (US-04-TASK-BE-03, FTR-018). Completes US-04's closing outcome: persists
// the combined verification+review result for one task attempt as a durable
// record (BR-09: "verification persisted before review; review persisted
// before checkpoint") — pure persistence over already-computed results, no
// dispatch/spawn of any kind.

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const {
  State,
  writeState,
  readState,
  writeReceipt,
  persistVerificationReviewOutcome,
} = require('../../lib/task-executor/store');

const RUN_ID = 'run-1';
const TASK_ID = 'US-99-TASK-BE-01';

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

function passingVerification(count) {
  const results = [];
  for (let i = 0; i < (count === undefined ? 1 : count); i++) {
    results.push({ command: 'npm test -- ' + i, exitCode: 0, stdout: '', stderr: '', durationMs: 1, passed: true });
  }
  return { taskId: TASK_ID, attemptNumber: 1, passed: true, results: results };
}

function failingVerification() {
  return {
    taskId: TASK_ID,
    attemptNumber: 1,
    passed: false,
    results: [
      { command: 'npm test -- 0', exitCode: 0, stdout: '', stderr: '', durationMs: 1, passed: true },
      { command: 'npm test -- 1', exitCode: 1, stdout: '', stderr: 'boom', durationMs: 1, passed: false },
    ],
  };
}

function passingReview() {
  return { reviewPassed: true, criticalFindings: [] };
}

function failingReview() {
  return { reviewPassed: false, criticalFindings: ['does not satisfy AC-04'] };
}

function ambiguousReview() {
  return { reviewPassed: null, criticalFindings: [] };
}

describe('persistVerificationReviewOutcome', () => {
  let tmpDir;
  let executionRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-outcome-test-'));
    executionRoot = path.join(tmpDir, 'execution');

    let state = new State(baseFields()).addTask(TASK_ID, { dependencies: [] });
    state = state.addAttempt(TASK_ID, { stage: 'implementation-recorded' });
    writeState(executionRoot, RUN_ID, state);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('input validation', () => {
    test('throws STATE_VALIDATION_ERROR when attemptNumber is not a positive integer', () => {
      expect(() =>
        persistVerificationReviewOutcome(executionRoot, RUN_ID, TASK_ID, 0, passingVerification(), passingReview())
      ).toThrow(expect.objectContaining({ code: 'STATE_VALIDATION_ERROR' }));
    });

    test('throws STATE_VALIDATION_ERROR when verification is missing "passed"', () => {
      expect(() =>
        persistVerificationReviewOutcome(executionRoot, RUN_ID, TASK_ID, 1, { results: [] }, passingReview())
      ).toThrow(expect.objectContaining({ code: 'STATE_VALIDATION_ERROR' }));
    });

    test('throws STATE_VALIDATION_ERROR when verification.results is not an array', () => {
      expect(() =>
        persistVerificationReviewOutcome(executionRoot, RUN_ID, TASK_ID, 1, { passed: true }, passingReview())
      ).toThrow(expect.objectContaining({ code: 'STATE_VALIDATION_ERROR' }));
    });

    test('throws STATE_VALIDATION_ERROR when review is provided without "criticalFindings"', () => {
      expect(() =>
        persistVerificationReviewOutcome(executionRoot, RUN_ID, TASK_ID, 1, passingVerification(), { reviewPassed: true })
      ).toThrow(expect.objectContaining({ code: 'STATE_VALIDATION_ERROR' }));
    });

    test('throws STATE_VALIDATION_ERROR when verification passed but review is omitted', () => {
      expect(() =>
        persistVerificationReviewOutcome(executionRoot, RUN_ID, TASK_ID, 1, passingVerification(), null)
      ).toThrow(expect.objectContaining({ code: 'STATE_VALIDATION_ERROR' }));
    });

    test('throws STATE_TASK_NOT_FOUND for an unknown task', () => {
      expect(() =>
        persistVerificationReviewOutcome(executionRoot, RUN_ID, 'MISSING-TASK', 1, passingVerification(), passingReview())
      ).toThrow(expect.objectContaining({ code: 'STATE_TASK_NOT_FOUND' }));
    });

    test('throws STATE_ATTEMPT_NOT_FOUND for an unknown attempt number', () => {
      expect(() =>
        persistVerificationReviewOutcome(executionRoot, RUN_ID, TASK_ID, 2, passingVerification(), passingReview())
      ).toThrow(expect.objectContaining({ code: 'STATE_ATTEMPT_NOT_FOUND' }));
    });
  });

  describe('verification failed -> terminal "failed", regardless of review', () => {
    test('moves the attempt straight to "failed" with no review supplied', () => {
      const result = persistVerificationReviewOutcome(executionRoot, RUN_ID, TASK_ID, 1, failingVerification(), null);
      expect(result.stage).toBe('failed');
      expect(result.terminalReason).toBe('verification-failed');
      expect(result.reviewReceiptId).toBeNull();

      const state = readState(executionRoot, RUN_ID);
      const attempt = state.tasks[TASK_ID].attempts[0];
      expect(attempt.stage).toBe('failed');
      expect(attempt.terminalReason).toBe('verification-failed');
      expect(attempt.verificationRefs).toEqual([TASK_ID + '-attempt1-verification-0', TASK_ID + '-attempt1-verification-1']);
    });

    test('a passing review cannot override a failed verification (defends against caller misuse)', () => {
      const result = persistVerificationReviewOutcome(
        executionRoot, RUN_ID, TASK_ID, 1, failingVerification(), passingReview()
      );
      expect(result.stage).toBe('failed');
      expect(result.terminalReason).toBe('verification-failed');

      const state = readState(executionRoot, RUN_ID);
      expect(state.tasks[TASK_ID].attempts[0].stage).toBe('failed');
    });

    test('never leaves the attempt at "verified" when verification failed', () => {
      persistVerificationReviewOutcome(executionRoot, RUN_ID, TASK_ID, 1, failingVerification(), null);
      const state = readState(executionRoot, RUN_ID);
      expect(state.tasks[TASK_ID].attempts[0].stage).not.toBe('verified');
    });
  });

  describe('verification passed, review passed -> "reviewed"', () => {
    test('transitions through "verified" then lands on "reviewed"', () => {
      const result = persistVerificationReviewOutcome(
        executionRoot, RUN_ID, TASK_ID, 1, passingVerification(2), passingReview()
      );
      expect(result.stage).toBe('reviewed');
      expect(result.terminalReason).toBeNull();

      const state = readState(executionRoot, RUN_ID);
      const attempt = state.tasks[TASK_ID].attempts[0];
      expect(attempt.stage).toBe('reviewed');
      expect(attempt.terminalReason).toBeNull();
      expect(attempt.verificationRefs).toEqual([TASK_ID + '-attempt1-verification-0', TASK_ID + '-attempt1-verification-1']);
      expect(attempt.reviewRefs).toEqual([TASK_ID + '-attempt1-review']);
      expect(state.receiptRefs).toEqual(expect.arrayContaining([
        TASK_ID + '-attempt1-verification-0',
        TASK_ID + '-attempt1-verification-1',
        TASK_ID + '-attempt1-review',
        TASK_ID + '-attempt1-outcome',
      ]));
    });
  });

  describe('verification passed, review failed or ambiguous -> "failed"', () => {
    test('review.reviewPassed === false moves the attempt to "failed" with reason "review-failed"', () => {
      const result = persistVerificationReviewOutcome(
        executionRoot, RUN_ID, TASK_ID, 1, passingVerification(), failingReview()
      );
      expect(result.stage).toBe('failed');
      expect(result.terminalReason).toBe('review-failed');

      const state = readState(executionRoot, RUN_ID);
      expect(state.tasks[TASK_ID].attempts[0].stage).toBe('failed');
      expect(state.tasks[TASK_ID].attempts[0].terminalReason).toBe('review-failed');
    });

    test('an ambiguous (null) review verdict is treated as a failure, not a pass', () => {
      const result = persistVerificationReviewOutcome(
        executionRoot, RUN_ID, TASK_ID, 1, passingVerification(), ambiguousReview()
      );
      expect(result.stage).toBe('failed');
      expect(result.terminalReason).toBe('review-failed');
    });
  });

  describe('durable receipts', () => {
    test('writes an outcome receipt referencing the review receipt and per-command verification receipts', () => {
      const result = persistVerificationReviewOutcome(
        executionRoot, RUN_ID, TASK_ID, 1, passingVerification(2), failingReview()
      );
      const outcomePath = path.join(executionRoot, 'runs', RUN_ID, 'receipts', result.outcomeReceiptId + '.json');
      const outcome = JSON.parse(fs.readFileSync(outcomePath, 'utf8'));
      expect(outcome.stage).toBe('failed');
      expect(outcome.terminalReason).toBe('review-failed');
      expect(outcome.verification).toHaveLength(2);
      expect(outcome.review.criticalFindings).toEqual(['does not satisfy AC-04']);

      const reviewPath = path.join(executionRoot, 'runs', RUN_ID, 'receipts', TASK_ID + '-attempt1-review.json');
      const reviewReceipt = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
      expect(reviewReceipt.reviewPassed).toBe(false);
      expect(reviewReceipt.authoritative).toBe(true);
    });

    test('recording the same outcome twice with identical inputs is idempotent (no RECEIPT_CONFLICT)', () => {
      persistVerificationReviewOutcome(executionRoot, RUN_ID, TASK_ID, 1, passingVerification(), passingReview());
      expect(() =>
        persistVerificationReviewOutcome(executionRoot, RUN_ID, TASK_ID, 1, passingVerification(), passingReview())
      ).not.toThrow();
    });

    test('re-recording with different verification results throws RECEIPT_CONFLICT (receipts are immutable)', () => {
      persistVerificationReviewOutcome(executionRoot, RUN_ID, TASK_ID, 1, passingVerification(1), passingReview());
      expect(() =>
        persistVerificationReviewOutcome(executionRoot, RUN_ID, TASK_ID, 1, passingVerification(2), passingReview())
      ).toThrow(expect.objectContaining({ code: 'RECEIPT_CONFLICT' }));
    });

    test('does not duplicate a per-command verification receipt already written by runVerifications', () => {
      // Simulates the real flow: runVerifications already wrote the
      // per-command receipt with its full stdout/stderr before this function
      // ever runs. persistVerificationReviewOutcome must reference that id,
      // not rewrite it with a different (summarized) shape.
      const preWritten = {
        taskId: TASK_ID, attemptNumber: 1, index: 0, command: 'npm test -- 0',
        exitCode: 0, stdout: 'ok', stderr: '', passed: true,
      };
      writeReceipt(executionRoot, RUN_ID, TASK_ID + '-attempt1-verification-0', preWritten);

      expect(() =>
        persistVerificationReviewOutcome(executionRoot, RUN_ID, TASK_ID, 1, passingVerification(1), passingReview())
      ).not.toThrow();

      const raw = JSON.parse(fs.readFileSync(
        path.join(executionRoot, 'runs', RUN_ID, 'receipts', TASK_ID + '-attempt1-verification-0.json'), 'utf8'
      ));
      expect(raw).toEqual(preWritten);
    });
  });

  describe('idempotent evidence merging', () => {
    test('a repeated call does not drop previously recorded verificationRefs/reviewRefs', () => {
      persistVerificationReviewOutcome(executionRoot, RUN_ID, TASK_ID, 1, passingVerification(1), passingReview());
      const first = readState(executionRoot, RUN_ID).tasks[TASK_ID].attempts[0];
      expect(first.verificationRefs).toEqual([TASK_ID + '-attempt1-verification-0']);
      expect(first.reviewRefs).toEqual([TASK_ID + '-attempt1-review']);

      persistVerificationReviewOutcome(executionRoot, RUN_ID, TASK_ID, 1, passingVerification(1), passingReview());
      const second = readState(executionRoot, RUN_ID).tasks[TASK_ID].attempts[0];
      expect(second.verificationRefs).toEqual([TASK_ID + '-attempt1-verification-0']);
      expect(second.reviewRefs).toEqual([TASK_ID + '-attempt1-review']);
    });
  });
});
