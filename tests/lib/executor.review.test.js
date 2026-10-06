'use strict';

// Tests for lib/task-executor/index.js runReview (US-04-TASK-BE-02, FTR-018).
// Completes the "dispatch review agent with diff context" half of US-04:
// verifies the review-solution agent's identity, persists a ledger 'review'
// activity BEFORE dispatching, feeds task context + exact diff + review
// criteria via stdin, and returns a structured result (raw spawn result plus
// a best-effort parsed verdict).
//
// SAFETY: every test that reaches spawnClaudeAgent uses
// tests/fixtures/fake-claude-cli.js via process.execPath (the local Node
// binary) as the "claudePath" — NEVER a real claude.exe and NEVER any real
// LLM/API call. This mirrors tests/lib/executor.dispatch.test.js exactly.
// verifyAgentIdentity is stubbed directly (jest.spyOn), same as that suite —
// identity resolution mechanics are already covered by US-03-TASK-BE-02's own
// tests; this suite is focused on review dispatch orchestration/ordering.

const fs = require('fs');
const os = require('os');
const path = require('path');

const ownership = require('../../lib/task-executor/ownership');
const store = require('../../lib/task-executor/store');
const claudeProcess = require('../../lib/task-executor/claude-process');
const { runReview } = require('../../lib/task-executor/index');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-claude-cli.js');
const NODE = process.execPath;

// Real (fixture) subprocess spawns can be slow under a loaded CI/parallel
// test-run machine — mirrors the 15s allowance executor.dispatch.test.js and
// claude-process.spawn.test.js already use for their own real-spawn cases.
jest.setTimeout(15000);

const RUN_ID = 'run-1';
const TASK_ID = 'US-99-TASK-BE-01';
const REVIEW_AGENT_ID = 'gaia.agent.review.solution';

const VERIFIED_IDENTITY = {
  agentId: REVIEW_AGENT_ID,
  nativeName: 'gaia-review-solution',
  sha256: 'sha256:' + 'b'.repeat(64),
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

describe('runReview', () => {
  let tmpDir;
  let executionRoot;
  let verifyIdentitySpy;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'executor-review-test-'));
    executionRoot = path.join(tmpDir, 'execution');
    verifyIdentitySpy = jest.spyOn(claudeProcess, 'verifyAgentIdentity').mockReturnValue(VERIFIED_IDENTITY);
  });

  afterEach(() => {
    verifyIdentitySpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeTask(overrides) {
    return Object.assign(
      {
        id: TASK_ID,
        title: 'Do the thing',
        outcome: 'The thing is done',
        domain: 'BE',
        dependsOn: [],
        groupingRationale: 'Single responsibility',
        acceptanceCriteria: ['AC-04'],
        verificationCommands: ['npm test -- --testPathPattern=review.test'],
      },
      overrides || {}
    );
  }

  function baseArgs(overrides) {
    return Object.assign(
      {
        executionRoot,
        runId: RUN_ID,
        task: makeTask(),
        attemptNumber: 1,
        claudePath: NODE,
        projectDir: tmpDir,
        diff: 'diff --git a/foo.js b/foo.js\n+console.log("hi");\n',
        spawnArgs: [FIXTURE, '--mode=echo-json'],
      },
      overrides || {}
    );
  }

  function seedStateWithReviewableAttempt() {
    let state = new store.State(baseStateFields()).addTask(TASK_ID, { dependencies: [] });
    state = state.addAttempt(TASK_ID, { stage: 'verified' });
    store.writeState(executionRoot, RUN_ID, state);
  }

  describe('ownership check (step 1)', () => {
    test('throws NO_LOCK_HELD when no lease is held', async () => {
      seedStateWithReviewableAttempt();
      await expect(runReview(baseArgs())).rejects.toMatchObject({ code: 'NO_LOCK_HELD' });
      expect(verifyIdentitySpy).not.toHaveBeenCalled();
    });

    test('throws NO_LOCK_HELD when the lease is held by a different runId', async () => {
      seedStateWithReviewableAttempt();
      ownership.acquireLease(executionRoot, 'some-other-run');
      await expect(runReview(baseArgs())).rejects.toMatchObject({ code: 'NO_LOCK_HELD' });
      expect(verifyIdentitySpy).not.toHaveBeenCalled();
    });

    test('never acquires or reclaims a lease itself', async () => {
      seedStateWithReviewableAttempt();
      await expect(runReview(baseArgs())).rejects.toMatchObject({ code: 'NO_LOCK_HELD' });
      expect(ownership.readLease(executionRoot)).toBeNull();
    });
  });

  describe('identity verification (step 2)', () => {
    beforeEach(() => {
      seedStateWithReviewableAttempt();
      ownership.acquireLease(executionRoot, RUN_ID);
    });

    test('verifies identity using the canonical review-solution agent id', async () => {
      await runReview(baseArgs());
      expect(verifyIdentitySpy).toHaveBeenCalledWith({
        projectDir: tmpDir,
        agentId: REVIEW_AGENT_ID,
      });
    });

    test('propagates AGENT_NOT_VERIFIED unmodified and never dispatches', async () => {
      const err = new Error('not verified');
      err.code = 'AGENT_NOT_VERIFIED';
      verifyIdentitySpy.mockImplementation(() => {
        throw err;
      });

      await expect(runReview(baseArgs())).rejects.toBe(err);
    });

    test('propagates DEFINITION_HASH_MISMATCH unmodified', async () => {
      const err = new Error('hash mismatch');
      err.code = 'DEFINITION_HASH_MISMATCH';
      verifyIdentitySpy.mockImplementation(() => {
        throw err;
      });

      await expect(runReview(baseArgs())).rejects.toBe(err);
    });
  });

  describe('persist-before-invoke (step 3)', () => {
    beforeEach(() => {
      seedStateWithReviewableAttempt();
      ownership.acquireLease(executionRoot, RUN_ID);
    });

    test('opens a ledger activity with the executor:<runId>:<taskId>:review key before spawning', async () => {
      const result = await runReview(baseArgs());

      const ledgerPaths = store._executionPaths(executionRoot, RUN_ID);
      const ledgerFile = path.join(ledgerPaths.runDir, RUN_ID + '-token-ledger.json');
      const entries = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
      expect(entries).toHaveLength(1);
      expect(entries[0].agent).toBe('executor:' + RUN_ID + ':' + TASK_ID + ':review');
      expect(entries[0].phase).toBe('review');
      expect(entries[0].operation_id).toBe(result.ledgerOperationId);
    });

    test('records ledger metadata from the verified identity', async () => {
      await runReview(baseArgs());

      const ledgerPaths = store._executionPaths(executionRoot, RUN_ID);
      const ledgerFile = path.join(ledgerPaths.runDir, RUN_ID + '-token-ledger.json');
      const entries = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
      expect(entries[0].agentId).toBe(VERIFIED_IDENTITY.agentId);
      expect(entries[0].nativeAgentName).toBe(VERIFIED_IDENTITY.nativeName);
      expect(entries[0].toolkitVersion).toBe(VERIFIED_IDENTITY.toolkitVersion);
      expect(entries[0].resolutionScope).toBe(VERIFIED_IDENTITY.scope);
      expect(entries[0].definitionHash).toBe(VERIFIED_IDENTITY.sha256);
    });

    test('does not mutate the existing attempt state (no stage change, no new attempt)', async () => {
      await runReview(baseArgs());

      const state = store.readState(executionRoot, RUN_ID);
      const attempts = state.tasks[TASK_ID].attempts;
      expect(attempts).toHaveLength(1);
      expect(attempts[0].stage).toBe('verified');
    });
  });

  describe('dispatch (step 4) and raw result capture (step 5)', () => {
    beforeEach(() => {
      seedStateWithReviewableAttempt();
      ownership.acquireLease(executionRoot, RUN_ID);
    });

    test('spawns the (fake) CLI and returns a structured result with the raw spawn result', async () => {
      const result = await runReview(baseArgs());

      expect(result.spawnResult.exitCode).toBe(0);
      expect(result.spawnResult.result).toMatchObject({ is_error: false });
      expect(result.agentId).toBe(VERIFIED_IDENTITY.agentId);
      expect(result.nativeAgentName).toBe(VERIFIED_IDENTITY.nativeName);
      expect(result.runId).toBe(RUN_ID);
      expect(result.taskId).toBe(TASK_ID);
      expect(result.attemptNumber).toBe(1);
    });

    test('feeds task context, exact diff and review criteria via stdin, echoed back by the fake CLI', async () => {
      const task = makeTask({ title: 'A very specific title' });
      const diff = 'diff --git a/very-unique-marker.js b/very-unique-marker.js\n+// unique diff content\n';
      const result = await runReview(baseArgs({ task, diff }));

      const echoed = result.spawnResult.result.result;
      expect(echoed).toContain('A very specific title');
      expect(echoed).toContain(TASK_ID);
      expect(echoed).toContain('AC-04');
      expect(echoed).toContain('npm test -- --testPathPattern=review.test');
      expect(echoed).toContain('Single responsibility');
      expect(echoed).toContain('--- BEGIN DIFF (exact, verbatim) ---');
      expect(echoed).toContain(diff);
      expect(echoed).toContain('--- END DIFF ---');
    });

    test('does not persist any outcome beyond the ledger review activity — result has no checkpoint fields', async () => {
      const result = await runReview(baseArgs());
      expect(result.checkpoint).toBeUndefined();
      expect(result.verified).toBeUndefined();
    });

    test('defaults to the permission-bypass flags when spawnArgs is not overridden (no args can be approved non-interactively otherwise)', async () => {
      const spawnSpy = jest.spyOn(claudeProcess, 'spawnClaudeAgent').mockResolvedValue({
        exitCode: 0, signal: null, stdout: '', stderr: '',
        result: { is_error: false, result: 'Verdict: PASS' },
        parseError: null, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
        durationMs: 1, timedOut: false, terminationConfirmed: null,
      });

      await runReview(baseArgs({ spawnArgs: undefined }));

      expect(spawnSpy).toHaveBeenCalledWith(expect.objectContaining({
        args: [
          '--print', '--output-format', 'json', '--agent', VERIFIED_IDENTITY.nativeName,
          '--permission-mode', 'auto',
        ],
      }));

      spawnSpy.mockRestore();
    });

    test('propagates a spawn failure (bad claudePath)', async () => {
      const missingClaudePath = path.join(tmpDir, 'does-not-exist.exe');
      await expect(
        runReview(baseArgs({ claudePath: missingClaudePath, spawnArgs: undefined }))
      ).rejects.toMatchObject({ code: 'CLAUDE_EXECUTABLE_NOT_FOUND' });
    });
  });

  describe('verdict extraction (step 5)', () => {
    beforeEach(() => {
      seedStateWithReviewableAttempt();
      ownership.acquireLease(executionRoot, RUN_ID);
    });

    // The fake CLI's echo-json mode echoes the exact prompt (task context +
    // diff + criteria) back as result.result. Embedding the review-solution
    // agent's own documented "## Output" template (gaia-review-solution.md)
    // inside the diff argument lets this suite exercise _extractReviewVerdict
    // against realistic report text without inventing a second fixture mode.
    test('parses a PASS verdict with no critical findings', async () => {
      const diff =
        'Verdict: PASS\n\n' +
        'CRITICAL (blocks merge):\n  none\n\n' +
        'WARNING (should fix):\n  none\n';
      const result = await runReview(baseArgs({ diff }));

      expect(result.reviewPassed).toBe(true);
      expect(result.criticalFindings).toEqual([]);
    });

    test('parses a FAIL verdict and extracts critical findings', async () => {
      const diff =
        'Verdict: FAIL\n\n' +
        'CRITICAL (blocks merge):\n' +
        '  [CRITICAL] Security — foo.js:12\n' +
        '  Hardcoded credential.\n\n' +
        'WARNING (should fix):\n  none\n';
      const result = await runReview(baseArgs({ diff }));

      expect(result.reviewPassed).toBe(false);
      expect(result.criticalFindings.length).toBeGreaterThan(0);
      expect(result.criticalFindings.some((f) => f.includes('Hardcoded credential'))).toBe(true);
    });

    test('explains a FAIL driven by a build/test failure even with zero CRITICAL findings', async () => {
      // The agent's own contract ("## Output": "FAIL = 1+ CRITICAL findings OR
      // build/test failure") allows exactly this combination — reproduces the
      // real anomaly found against a live run: reviewPassed:false,
      // criticalFindings:[] with no explanation anywhere.
      const diff =
        'Verdict: FAIL\n\n' +
        'Build:  ❌ FAIL — compilation error in foo.ts\n' +
        'Tests:  ✅ 10/10 passed\n\n' +
        'CRITICAL (blocks merge):\n  none\n\n' +
        'WARNING (should fix):\n  none\n';
      const result = await runReview(baseArgs({ diff }));

      expect(result.reviewPassed).toBe(false);
      expect(result.criticalFindings.some((f) => f.includes('Build') && f.includes('compilation error'))).toBe(true);
    });

    test('does not report passing Build/Tests lines as findings', async () => {
      const diff =
        'Verdict: PASS\n\n' +
        'Build:  ✅ PASS\n' +
        'Tests:  ✅ 10/10 passed\n\n' +
        'CRITICAL (blocks merge):\n  none\n\n' +
        'WARNING (should fix):\n  none\n';
      const result = await runReview(baseArgs({ diff }));

      expect(result.reviewPassed).toBe(true);
      expect(result.criticalFindings).toEqual([]);
    });

    test('reports null passed when no recognizable verdict template is present', async () => {
      const result = await runReview(baseArgs({ diff: 'no template here' }));
      expect(result.reviewPassed).toBeNull();
      expect(result.criticalFindings).toEqual([]);
    });
  });

  describe('input validation', () => {
    test('throws DISPATCH_VALIDATION_ERROR when required fields are missing', async () => {
      await expect(runReview({})).rejects.toMatchObject({ code: 'DISPATCH_VALIDATION_ERROR' });
    });

    test('throws DISPATCH_VALIDATION_ERROR when attemptNumber is not a positive integer', async () => {
      await expect(runReview(baseArgs({ attemptNumber: 0 }))).rejects.toMatchObject({
        code: 'DISPATCH_VALIDATION_ERROR',
      });
      await expect(runReview(baseArgs({ attemptNumber: 'one' }))).rejects.toMatchObject({
        code: 'DISPATCH_VALIDATION_ERROR',
      });
    });

    test('throws DISPATCH_VALIDATION_ERROR when diff is not a string', async () => {
      await expect(runReview(baseArgs({ diff: undefined }))).rejects.toMatchObject({
        code: 'DISPATCH_VALIDATION_ERROR',
      });
      await expect(runReview(baseArgs({ diff: 123 }))).rejects.toMatchObject({
        code: 'DISPATCH_VALIDATION_ERROR',
      });
    });

    test('accepts an empty string diff (no-op task)', async () => {
      seedStateWithReviewableAttempt();
      ownership.acquireLease(executionRoot, RUN_ID);
      const result = await runReview(baseArgs({ diff: '' }));
      expect(result.spawnResult.exitCode).toBe(0);
    });
  });
});
