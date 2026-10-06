'use strict';

// Tests for lib/task-executor/index.js dispatchTaskAttempt (US-03-TASK-BE-03,
// FTR-018). Completes US-03 "dispatch one implementation agent per task per
// attempt": wires ownership.js (lease read), claude-process.js (identity
// verification + subprocess spawn), store.js (state persistence) and
// execution-ledger.js (ledger activity) into one dispatch primitive.
//
// SAFETY: every test that reaches spawnClaudeAgent uses
// tests/fixtures/fake-claude-cli.js via process.execPath (the local Node
// binary) as the "claudePath" — NEVER a real claude.exe and NEVER any real
// LLM/API call. verifyAgentIdentity is stubbed directly (jest.spyOn) rather
// than exercised through a real toolkit install state, since US-03-TASK-BE-02's
// own test suite already covers real CLI resolution; stubbing it here keeps
// this suite focused on dispatch orchestration/ordering, not identity
// resolution mechanics.

const fs = require('fs');
const os = require('os');
const path = require('path');

const ownership = require('../../lib/task-executor/ownership');
const store = require('../../lib/task-executor/store');
const claudeProcess = require('../../lib/task-executor/claude-process');
const { dispatchTaskAttempt, _buildProcessTag } = require('../../lib/task-executor/index');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-claude-cli.js');
const NODE = process.execPath;

// Real (fixture) subprocess spawns can be slow under a loaded CI/parallel
// test-run machine — mirrors the 15s allowance claude-process.spawn.test.js
// already uses for its own real-spawn cases.
jest.setTimeout(15000);

const RUN_ID = 'run-1';
const TASK_ID = 'US-99-TASK-BE-01';

const VERIFIED_IDENTITY = {
  agentId: 'gaia.agent.developer.backend',
  nativeName: 'gaia-developer-backend',
  sha256: 'sha256:' + 'a'.repeat(64),
  path: '/fake/path/gaia-developer-backend.md',
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

describe('dispatchTaskAttempt', () => {
  let tmpDir;
  let executionRoot;
  let verifyIdentitySpy;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'executor-dispatch-test-'));
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
        acceptanceCriteria: ['AC-01'],
        verificationCommands: [],
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
        agentId: VERIFIED_IDENTITY.agentId,
        projectDir: tmpDir,
        spawnArgs: [FIXTURE, '--mode=echo-json'],
      },
      overrides || {}
    );
  }

  function seedStateWithTask() {
    const state = new store.State(baseStateFields()).addTask(TASK_ID, { dependencies: [] });
    store.writeState(executionRoot, RUN_ID, state);
  }

  describe('ownership check (step 1)', () => {
    test('throws NO_LOCK_HELD when no lease is held', async () => {
      seedStateWithTask();
      await expect(dispatchTaskAttempt(baseArgs())).rejects.toMatchObject({ code: 'NO_LOCK_HELD' });
      expect(verifyIdentitySpy).not.toHaveBeenCalled();
    });

    test('throws NO_LOCK_HELD when the lease is held by a different runId', async () => {
      seedStateWithTask();
      ownership.acquireLease(executionRoot, 'some-other-run');
      await expect(dispatchTaskAttempt(baseArgs())).rejects.toMatchObject({ code: 'NO_LOCK_HELD' });
      expect(verifyIdentitySpy).not.toHaveBeenCalled();
    });

    test('never acquires or reclaims a lease itself', async () => {
      seedStateWithTask();
      await expect(dispatchTaskAttempt(baseArgs())).rejects.toMatchObject({ code: 'NO_LOCK_HELD' });
      expect(ownership.readLease(executionRoot)).toBeNull();
    });
  });

  describe('identity verification (step 2)', () => {
    beforeEach(() => {
      seedStateWithTask();
      ownership.acquireLease(executionRoot, RUN_ID);
    });

    test('propagates AGENT_NOT_VERIFIED unmodified and never dispatches', async () => {
      const err = new Error('not verified');
      err.code = 'AGENT_NOT_VERIFIED';
      verifyIdentitySpy.mockImplementation(() => {
        throw err;
      });

      await expect(dispatchTaskAttempt(baseArgs())).rejects.toBe(err);

      // No attempt should have been persisted past the identity check.
      const state = store.readState(executionRoot, RUN_ID);
      expect(state.tasks[TASK_ID].attempts).toHaveLength(0);
    });

    test('propagates DEFINITION_HASH_MISMATCH unmodified', async () => {
      const err = new Error('hash mismatch');
      err.code = 'DEFINITION_HASH_MISMATCH';
      verifyIdentitySpy.mockImplementation(() => {
        throw err;
      });

      await expect(dispatchTaskAttempt(baseArgs())).rejects.toBe(err);
    });
  });

  describe('persist-before-invoke (step 3, AC-01)', () => {
    beforeEach(() => {
      seedStateWithTask();
      ownership.acquireLease(executionRoot, RUN_ID);
    });

    test('persists a new attempt (prepared -> dispatching) before spawning', async () => {
      const result = await dispatchTaskAttempt(baseArgs());

      const state = store.readState(executionRoot, RUN_ID);
      const attempts = state.tasks[TASK_ID].attempts;
      expect(attempts).toHaveLength(1);
      expect(attempts[0].number).toBe(1);
      expect(attempts[0].stage).toBe('dispatching');
      expect(result.attemptNumber).toBe(1);
      expect(result.taskId).toBe(TASK_ID);
      expect(result.runId).toBe(RUN_ID);
    });

    test('opens a ledger activity with the executor:<runId>:<taskId>:implementation key before spawning', async () => {
      const result = await dispatchTaskAttempt(baseArgs());

      const ledgerPaths = store._executionPaths(executionRoot, RUN_ID);
      const ledgerFile = path.join(ledgerPaths.runDir, RUN_ID + '-token-ledger.json');
      const entries = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
      // Two activities are opened together at dispatch time (Tech-Spec
      // section 6, kinds "task, implementation, ..."): 'implementation'
      // (this one dispatch invocation) and 'task' (spans the whole task-
      // attempt lifecycle; only closed later by finalizeTaskCheckpoint,
      // US-05-TASK-BE-05 — never by dispatchTaskAttempt itself).
      expect(entries).toHaveLength(2);
      expect(entries[0].agent).toBe('executor:' + RUN_ID + ':' + TASK_ID + ':implementation');
      expect(entries[0].operation_id).toBe(result.ledgerOperationId);
      expect(entries[1].agent).toBe('executor:' + RUN_ID + ':' + TASK_ID + ':task');
      expect(entries[1].phase).toBe('task');
      expect(entries[1].status).toBe('running');
    });

    test('records ledger metadata from the verified identity', async () => {
      await dispatchTaskAttempt(baseArgs());

      const ledgerPaths = store._executionPaths(executionRoot, RUN_ID);
      const ledgerFile = path.join(ledgerPaths.runDir, RUN_ID + '-token-ledger.json');
      const entries = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
      expect(entries[0].agentId).toBe(VERIFIED_IDENTITY.agentId);
      expect(entries[0].nativeAgentName).toBe(VERIFIED_IDENTITY.nativeName);
      expect(entries[0].toolkitVersion).toBe(VERIFIED_IDENTITY.toolkitVersion);
      expect(entries[0].resolutionScope).toBe(VERIFIED_IDENTITY.scope);
      expect(entries[0].definitionHash).toBe(VERIFIED_IDENTITY.sha256);
    });

    test('uses updateAttempt (not addAttempt) when the attempt already exists (resumed dispatch)', async () => {
      let state = store.readState(executionRoot, RUN_ID);
      state = state.addAttempt(TASK_ID, { stage: 'prepared' });
      store.writeState(executionRoot, RUN_ID, state);

      await dispatchTaskAttempt(baseArgs({ attemptNumber: 1 }));

      const finalState = store.readState(executionRoot, RUN_ID);
      const attempts = finalState.tasks[TASK_ID].attempts;
      expect(attempts).toHaveLength(1);
      expect(attempts[0].stage).toBe('dispatching');
    });

    test('throws ATTEMPT_NUMBER_MISMATCH when attemptNumber skips ahead of the next expected number', async () => {
      await expect(dispatchTaskAttempt(baseArgs({ attemptNumber: 5 }))).rejects.toMatchObject({
        code: 'ATTEMPT_NUMBER_MISMATCH',
      });
    });
  });

  describe('dispatch (step 4) and raw result capture (step 5)', () => {
    beforeEach(() => {
      seedStateWithTask();
      ownership.acquireLease(executionRoot, RUN_ID);
    });

    test('spawns the (fake) CLI and returns a structured result with the raw spawn result', async () => {
      const result = await dispatchTaskAttempt(baseArgs());

      expect(result.spawnResult.exitCode).toBe(0);
      expect(result.spawnResult.result).toMatchObject({ is_error: false });
      expect(result.agentId).toBe(VERIFIED_IDENTITY.agentId);
      expect(result.nativeAgentName).toBe(VERIFIED_IDENTITY.nativeName);
    });

    test('feeds the task prompt via stdin, echoed back by the fake CLI', async () => {
      const task = makeTask({ title: 'A very specific title' });
      const result = await dispatchTaskAttempt(baseArgs({ task }));

      expect(result.spawnResult.result.result).toContain('A very specific title');
      expect(result.spawnResult.result.result).toContain(TASK_ID);
    });

    test('does not attempt verification/review/checkpoint — result has no such fields', async () => {
      const result = await dispatchTaskAttempt(baseArgs());
      expect(result.verified).toBeUndefined();
      expect(result.reviewed).toBeUndefined();
      expect(result.checkpoint).toBeUndefined();
    });

    test('defaults to the permission-bypass flags when spawnArgs is not overridden (no args can be approved non-interactively otherwise)', async () => {
      const spawnSpy = jest.spyOn(claudeProcess, 'spawnClaudeAgent').mockResolvedValue({
        exitCode: 0, signal: null, stdout: '', stderr: '',
        result: { is_error: false, result: 'ok' },
        parseError: null, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
        durationMs: 1, timedOut: false, terminationConfirmed: null,
      });

      await dispatchTaskAttempt(baseArgs({ spawnArgs: undefined }));

      const tag = _buildProcessTag(RUN_ID, TASK_ID, 1);
      expect(spawnSpy).toHaveBeenCalledWith(expect.objectContaining({
        args: [
          '--print', '--output-format', 'json', '--agent', VERIFIED_IDENTITY.nativeName,
          '--permission-mode', 'auto',
          tag,
        ],
      }));

      spawnSpy.mockRestore();
    });

    test('propagates a spawn failure (bad claudePath) without persisting a spawn result', async () => {
      const missingClaudePath = path.join(tmpDir, 'does-not-exist.exe');
      await expect(
        dispatchTaskAttempt(baseArgs({ claudePath: missingClaudePath, spawnArgs: undefined }))
      ).rejects.toMatchObject({ code: 'CLAUDE_EXECUTABLE_NOT_FOUND' });

      // The attempt was still persisted at 'dispatching' — persist-before-invoke
      // means the durable record survives even though the spawn itself failed.
      const state = store.readState(executionRoot, RUN_ID);
      expect(state.tasks[TASK_ID].attempts[0].stage).toBe('dispatching');
    });
  });

  describe('input validation', () => {
    test('throws DISPATCH_VALIDATION_ERROR when required fields are missing', async () => {
      await expect(dispatchTaskAttempt({})).rejects.toMatchObject({ code: 'DISPATCH_VALIDATION_ERROR' });
    });

    test('throws DISPATCH_VALIDATION_ERROR when attemptNumber is not a positive integer', async () => {
      await expect(dispatchTaskAttempt(baseArgs({ attemptNumber: 0 }))).rejects.toMatchObject({
        code: 'DISPATCH_VALIDATION_ERROR',
      });
      await expect(dispatchTaskAttempt(baseArgs({ attemptNumber: 'one' }))).rejects.toMatchObject({
        code: 'DISPATCH_VALIDATION_ERROR',
      });
    });
  });
});
