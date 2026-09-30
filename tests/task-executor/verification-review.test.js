'use strict';

// Integration tests for the FULL verification + review + outcome cycle
// (US-04-TASK-TEST-01, FTR-018). This completes US-04 ("run verifications
// and review") by wiring together, end-to-end, exactly as a real caller
// (the future US-07 run-loop) will:
//   1. lib/task-executor/index.js's runVerifications  (real Bash commands)
//   2. lib/task-executor/index.js's runReview          (fake-CLI-dispatched
//      review-solution agent)
//   3. lib/task-executor/store.js's persistVerificationReviewOutcome
//
// This suite deliberately does NOT re-test any of the three functions'
// internals — those are already covered in isolation by
// tests/lib/executor.verification.test.js, tests/lib/executor.review.test.js
// and tests/lib/store.verification-review-outcome.test.js. Its only job is
// to prove the three real, already-implemented pieces compose correctly,
// including the Gate-1 binding constraint: verification gates review — no
// completion on model self-report alone.
//
// SAFETY: review dispatch uses tests/fixtures/fake-claude-cli.js via
// process.execPath (the local Node binary) as the "claudePath" — this is
// NEVER a real claude.exe and NEVER a real LLM/API call, exactly like
// tests/lib/executor.review.test.js. verifyAgentIdentity is stubbed via
// jest.spyOn (same house style as executor.review.test.js /
// executor.dispatch.test.js — identity resolution mechanics are already
// covered by US-03-TASK-BE-02's own tests). spawnClaudeAgent is spied on
// WITHOUT replacing its implementation (call-through) purely so this suite
// can assert it is never invoked when verification fails.

const fs = require('fs');
const os = require('os');
const path = require('path');

const ownership = require('../../lib/task-executor/ownership');
const store = require('../../lib/task-executor/store');
const claudeProcess = require('../../lib/task-executor/claude-process');
const { runVerifications, runReview } = require('../../lib/task-executor/index');
const { State, writeState, readState, listReceipts, readReceipt, persistVerificationReviewOutcome } = require('../../lib/task-executor/store');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-claude-cli.js');
const NODE = process.execPath;

// Real (fixture) subprocess spawns can be slow under a loaded CI/parallel
// test-run machine — mirrors the 15s allowance executor.review.test.js and
// executor.dispatch.test.js already use for their own real-spawn cases.
jest.setTimeout(15000);

const RUN_ID = 'run-1';
const REVIEW_AGENT_ID = 'gaia.agent.review.solution';

const VERIFIED_IDENTITY = {
  agentId: REVIEW_AGENT_ID,
  nativeName: 'gaia-review-solution',
  sha256: 'sha256:' + 'c'.repeat(64),
  path: '/fake/path/gaia-review-solution.md',
  manifestPath: '/fake/path/.ai-toolkit-manifest.json',
  toolkitVersion: '0.13.0',
  scope: 'project',
};

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

describe('verification + review + outcome: full cycle integration', () => {
  let tmpDir;
  let executionRoot;
  let verifyIdentitySpy;
  let spawnSpy;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'executor-verification-review-test-'));
    executionRoot = path.join(tmpDir, 'execution');
    verifyIdentitySpy = jest.spyOn(claudeProcess, 'verifyAgentIdentity').mockReturnValue(VERIFIED_IDENTITY);
    // Call-through spy (no mockImplementation/mockReturnValue): real spawns
    // still happen for pass/fail review scenarios; this only lets the
    // verification-failure scenario assert the review dispatch never
    // happened at all.
    spawnSpy = jest.spyOn(claudeProcess, 'spawnClaudeAgent');
    ownership.acquireLease(executionRoot, RUN_ID);
  });

  afterEach(() => {
    verifyIdentitySpy.mockRestore();
    spawnSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeTask(taskId, overrides) {
    return Object.assign(
      {
        id: taskId,
        title: 'Integration cycle task',
        outcome: 'The integration cycle works end-to-end',
        domain: 'BE',
        dependsOn: [],
        groupingRationale: 'Single responsibility',
        acceptanceCriteria: ['AC-04'],
        verificationCommands: [],
      },
      overrides || {}
    );
  }

  // Seeds state exactly the way the real pipeline reaches this point: a task
  // with one attempt already past implementation (mirrors
  // store.verification-review-outcome.test.js's own seed), ready for
  // verification.
  function seedTaskWithAttempt(taskId) {
    let state = new State(baseStateFields()).addTask(taskId, { dependencies: [] });
    state = state.addAttempt(taskId, { stage: 'implementation-recorded' });
    writeState(executionRoot, RUN_ID, state);
  }

  // The real-caller sequence: verify, then (ONLY if verification passed)
  // review, then persist the combined outcome. This mirrors exactly how the
  // future run loop (US-07-TASK-BE-01) will chain these three already-
  // implemented primitives — review is structurally skipped, not merely
  // expected to fail, when verification does not pass.
  async function runFullCycle(task, diff) {
    const verification = await runVerifications({
      executionRoot, runId: RUN_ID, task, attemptNumber: 1, cwd: tmpDir,
    });

    let review = null;
    if (verification.passed) {
      review = await runReview({
        executionRoot, runId: RUN_ID, task, attemptNumber: 1,
        claudePath: NODE, projectDir: tmpDir, diff: diff,
        spawnArgs: [FIXTURE, '--mode=echo-json'],
      });
    }

    const outcome = persistVerificationReviewOutcome(executionRoot, RUN_ID, task.id, 1, verification, review);

    return { verification, review, outcome };
  }

  describe('scenario: verification passes, review passes -> reviewed', () => {
    const TASK_ID = 'US-99-TASK-BE-CYCLE-PASS';

    test('multiple verification commands all pass, review passes, attempt lands on "reviewed" with durable cross-referenced receipts', async () => {
      seedTaskWithAttempt(TASK_ID);
      fs.writeFileSync(path.join(tmpDir, 'marker.txt'), 'hello world');
      const task = makeTask(TASK_ID, {
        verificationCommands: ["test -f marker.txt", "grep -q 'hello' marker.txt", "echo done"],
      });
      const diff =
        'Verdict: PASS\n\n' +
        'CRITICAL (blocks merge):\n  none\n\n' +
        'WARNING (should fix):\n  none\n';

      const { verification, review, outcome } = await runFullCycle(task, diff);

      expect(verification.passed).toBe(true);
      expect(verification.results).toHaveLength(3);
      expect(review.reviewPassed).toBe(true);
      expect(review.criticalFindings).toEqual([]);
      expect(outcome.stage).toBe('reviewed');
      expect(outcome.terminalReason).toBeNull();
      expect(outcome.reviewReceiptId).not.toBeNull();
      expect(spawnSpy).toHaveBeenCalledTimes(1);

      // Cross-referenced, durable evidence: re-read state and receipts from
      // disk (not the in-memory return values) to confirm what actually
      // landed.
      const state = readState(executionRoot, RUN_ID);
      const attempt = state.tasks[TASK_ID].attempts[0];
      expect(attempt.stage).toBe('reviewed');
      expect(attempt.terminalReason).toBeNull();
      expect(attempt.verificationRefs).toEqual(outcome.verificationReceiptIds);
      expect(attempt.reviewRefs).toEqual([outcome.reviewReceiptId]);

      const receiptIds = listReceipts(executionRoot, RUN_ID);
      outcome.verificationReceiptIds.forEach((id) => expect(receiptIds).toContain(id));
      expect(receiptIds).toContain(outcome.reviewReceiptId);
      expect(receiptIds).toContain(outcome.outcomeReceiptId);

      const firstVerificationReceipt = readReceipt(executionRoot, RUN_ID, outcome.verificationReceiptIds[0]);
      expect(firstVerificationReceipt.command).toBe('test -f marker.txt');
      expect(firstVerificationReceipt.passed).toBe(true);

      const reviewReceipt = readReceipt(executionRoot, RUN_ID, outcome.reviewReceiptId);
      expect(reviewReceipt.reviewPassed).toBe(true);
      expect(reviewReceipt.authoritative).toBe(true);

      const outcomeReceipt = readReceipt(executionRoot, RUN_ID, outcome.outcomeReceiptId);
      expect(outcomeReceipt.stage).toBe('reviewed');
      expect(outcomeReceipt.verification).toHaveLength(3);
      expect(outcomeReceipt.review.receiptId).toBe(outcome.reviewReceiptId);
    });
  });

  describe('scenario: verification passes, review reports FAIL with critical findings -> failed/review-failed', () => {
    const TASK_ID = 'US-99-TASK-BE-CYCLE-REVIEW-FAIL';

    test('review dispatches, reports FAIL, attempt lands on "failed" with terminalReason "review-failed"', async () => {
      seedTaskWithAttempt(TASK_ID);
      const task = makeTask(TASK_ID, {
        verificationCommands: ["echo one", "test -d ."],
      });
      const diff =
        'Verdict: FAIL\n\n' +
        'CRITICAL (blocks merge):\n' +
        '  [CRITICAL] Correctness — foo.js:42\n' +
        '  Off-by-one error in loop bound.\n\n' +
        'WARNING (should fix):\n  none\n';

      const { verification, review, outcome } = await runFullCycle(task, diff);

      expect(verification.passed).toBe(true);
      expect(review.reviewPassed).toBe(false);
      expect(review.criticalFindings.some((f) => f.includes('Off-by-one error'))).toBe(true);
      expect(outcome.stage).toBe('failed');
      expect(outcome.terminalReason).toBe('review-failed');
      expect(spawnSpy).toHaveBeenCalledTimes(1);

      const state = readState(executionRoot, RUN_ID);
      const attempt = state.tasks[TASK_ID].attempts[0];
      expect(attempt.stage).toBe('failed');
      expect(attempt.terminalReason).toBe('review-failed');
      // Verification evidence is still recorded even though the terminal
      // reason is about review, not verification.
      expect(attempt.verificationRefs).toEqual(outcome.verificationReceiptIds);
      expect(attempt.reviewRefs).toEqual([outcome.reviewReceiptId]);

      const reviewReceipt = readReceipt(executionRoot, RUN_ID, outcome.reviewReceiptId);
      expect(reviewReceipt.reviewPassed).toBe(false);
      expect(reviewReceipt.criticalFindings.some((f) => f.includes('Off-by-one error'))).toBe(true);
      // authoritative=true because verification DID pass — this failure is
      // genuinely review's call, not a defended-against caller mistake.
      expect(reviewReceipt.authoritative).toBe(true);

      const outcomeReceipt = readReceipt(executionRoot, RUN_ID, outcome.outcomeReceiptId);
      expect(outcomeReceipt.stage).toBe('failed');
      expect(outcomeReceipt.terminalReason).toBe('review-failed');
      expect(outcomeReceipt.verification).toHaveLength(2);
    });
  });

  describe('scenario: verification itself fails -> review is never dispatched -> failed/verification-failed', () => {
    const TASK_ID = 'US-99-TASK-BE-CYCLE-VERIFY-FAIL';

    test('fail-fast stops before the review agent is ever invoked; attempt lands on "failed" with terminalReason "verification-failed"', async () => {
      seedTaskWithAttempt(TASK_ID);
      const task = makeTask(TASK_ID, {
        verificationCommands: ["echo one", "exit 7", "echo should-not-run"],
      });

      const { verification, review, outcome } = await runFullCycle(task, 'this diff is never seen by any review agent');

      expect(verification.passed).toBe(false);
      // Fail-fast: the third command never ran.
      expect(verification.results).toHaveLength(2);
      expect(verification.results[1].exitCode).toBe(7);
      expect(review).toBeNull();
      expect(outcome.stage).toBe('failed');
      expect(outcome.terminalReason).toBe('verification-failed');
      expect(outcome.reviewReceiptId).toBeNull();

      // Gate-1 binding proof: the review-solution agent is NEVER dispatched,
      // and its identity is never even verified, when verification fails.
      // Completion is never granted on a model's self-report alone —
      // verification gates review structurally, not just by convention.
      expect(spawnSpy).not.toHaveBeenCalled();
      expect(verifyIdentitySpy).not.toHaveBeenCalled();

      const state = readState(executionRoot, RUN_ID);
      const attempt = state.tasks[TASK_ID].attempts[0];
      expect(attempt.stage).toBe('failed');
      expect(attempt.terminalReason).toBe('verification-failed');
      expect(attempt.verificationRefs).toEqual(outcome.verificationReceiptIds);
      expect(attempt.reviewRefs).toEqual([]);

      const receiptIds = listReceipts(executionRoot, RUN_ID);
      expect(receiptIds).toContain(outcome.outcomeReceiptId);
      // No review receipt was ever produced or persisted for this attempt.
      expect(receiptIds.some((id) => id === TASK_ID + '-attempt1-review')).toBe(false);

      const failingReceipt = readReceipt(executionRoot, RUN_ID, outcome.verificationReceiptIds[1]);
      expect(failingReceipt.command).toBe('exit 7');
      expect(failingReceipt.exitCode).toBe(7);
      expect(failingReceipt.passed).toBe(false);

      const outcomeReceipt = readReceipt(executionRoot, RUN_ID, outcome.outcomeReceiptId);
      expect(outcomeReceipt.stage).toBe('failed');
      expect(outcomeReceipt.terminalReason).toBe('verification-failed');
      expect(outcomeReceipt.review).toBeNull();
      expect(outcomeReceipt.verification).toHaveLength(2);
    });
  });
});
