'use strict';

// Tests for lib/task-executor/index.js runVerifications (US-04-TASK-BE-01,
// FTR-018). Completes US-04's "run verifications" outcome: executes a task
// attempt's APPROVED Work Breakdown verification commands as real shell
// (Bash) command lines, fails fast on the first non-zero exit, and persists
// every command's result as an immutable store.js receipt before moving on.
//
// SAFETY: every command here is a small, deterministic, offline shell
// invocation (test -f, grep, echo, exit N) against files inside a per-test
// tmpDir — never a real network call, never the real Claude CLI, never a
// real LLM/API call.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return { ...actual, spawn: jest.fn(actual.spawn) };
});

const { spawn } = require('child_process');
const store = require('../../lib/task-executor/store');
const { runVerifications } = require('../../lib/task-executor/index');

const RUN_ID = 'run-1';
const TASK_ID = 'US-99-TASK-BE-01';

function makeTask(verificationCommands) {
  return { id: TASK_ID, verificationCommands: verificationCommands || [] };
}

describe('runVerifications', () => {
  let tmpDir;
  let executionRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'executor-verification-test-'));
    executionRoot = path.join(tmpDir, 'execution');
    spawn.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function baseArgs(overrides) {
    return Object.assign(
      {
        executionRoot,
        runId: RUN_ID,
        task: makeTask(),
        attemptNumber: 1,
        cwd: tmpDir,
      },
      overrides || {}
    );
  }

  function receiptId(index, attemptNumber) {
    return TASK_ID + '-attempt' + (attemptNumber === undefined ? 1 : attemptNumber) + '-verification-' + index;
  }

  describe('input validation', () => {
    test('throws DISPATCH_VALIDATION_ERROR when executionRoot is missing', async () => {
      await expect(runVerifications({ runId: RUN_ID, task: makeTask(), attemptNumber: 1 })).rejects.toMatchObject({
        code: 'DISPATCH_VALIDATION_ERROR',
      });
    });

    test('throws DISPATCH_VALIDATION_ERROR when task is missing', async () => {
      await expect(runVerifications(baseArgs({ task: undefined }))).rejects.toMatchObject({
        code: 'DISPATCH_VALIDATION_ERROR',
      });
    });

    test('throws DISPATCH_VALIDATION_ERROR when attemptNumber is not a positive integer', async () => {
      await expect(runVerifications(baseArgs({ attemptNumber: 0 }))).rejects.toMatchObject({
        code: 'DISPATCH_VALIDATION_ERROR',
      });
      await expect(runVerifications(baseArgs({ attemptNumber: 'one' }))).rejects.toMatchObject({
        code: 'DISPATCH_VALIDATION_ERROR',
      });
    });
  });

  describe('no verification commands', () => {
    test('is a trivial pass with empty results and no receipts written', async () => {
      const result = await runVerifications(baseArgs({ task: makeTask([]) }));
      expect(result).toEqual({ taskId: TASK_ID, attemptNumber: 1, passed: true, results: [] });
      expect(store.listReceipts(executionRoot, RUN_ID)).toEqual([]);
    });
  });

  describe('all commands pass', () => {
    test('runs commands in order and reports overall pass', async () => {
      fs.writeFileSync(path.join(tmpDir, 'marker.txt'), 'hello world');
      const commands = ["test -f marker.txt", "grep -q 'hello' marker.txt", "echo done"];
      const result = await runVerifications(baseArgs({ task: makeTask(commands) }));

      expect(result.passed).toBe(true);
      expect(result.results).toHaveLength(3);
      result.results.forEach((r, i) => {
        expect(r.command).toBe(commands[i]);
        expect(r.exitCode).toBe(0);
        expect(r.passed).toBe(true);
        expect(typeof r.durationMs).toBe('number');
      });
      expect(result.results[2].stdout).toContain('done');
    });

    test('persists one immutable receipt per command, matching the results', async () => {
      const commands = ['test -f package.json', 'echo second'];
      // package.json does not exist in tmpDir; use a passing check instead.
      fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
      await runVerifications(baseArgs({ task: makeTask(commands) }));

      const ids = store.listReceipts(executionRoot, RUN_ID).sort();
      expect(ids).toEqual([receiptId(0), receiptId(1)].sort());

      const first = store.readReceipt(executionRoot, RUN_ID, receiptId(0));
      expect(first.command).toBe('test -f package.json');
      expect(first.exitCode).toBe(0);
      expect(first.passed).toBe(true);
      expect(first.taskId).toBe(TASK_ID);
      expect(first.attemptNumber).toBe(1);
      expect(first.index).toBe(0);
    });

    test('captures stdout via a real pipe (grep -E over echo output)', async () => {
      const result = await runVerifications(
        baseArgs({ task: makeTask(["echo 'abc123' | grep -E '[0-9]+'"]) })
      );
      expect(result.passed).toBe(true);
      expect(result.results[0].stdout).toContain('abc123');
    });
  });

  describe('fail-fast on first non-zero exit', () => {
    test('stops before running later commands and reports overall failure', async () => {
      const commands = ['exit 1', 'echo should-not-run'];
      const result = await runVerifications(baseArgs({ task: makeTask(commands) }));

      expect(result.passed).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].command).toBe('exit 1');
      expect(result.results[0].exitCode).toBe(1);
      expect(result.results[0].passed).toBe(false);

      // Only the failing command's receipt exists — the second command was
      // never run, so it was never persisted either.
      expect(store.listReceipts(executionRoot, RUN_ID)).toEqual([receiptId(0)]);
    });

    test('a middle command failing still records receipts only up to and including it', async () => {
      const commands = ['echo one', 'exit 3', 'echo three'];
      const result = await runVerifications(baseArgs({ task: makeTask(commands) }));

      expect(result.passed).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].passed).toBe(true);
      expect(result.results[1].exitCode).toBe(3);
      expect(result.results[1].passed).toBe(false);
      expect(store.listReceipts(executionRoot, RUN_ID).sort()).toEqual([receiptId(0), receiptId(1)].sort());
    });
  });

  describe('unspawnable command (e.g. shell not found on PATH)', () => {
    test('is treated as a failure, not an uncaught crash, and is still persisted', async () => {
      spawn.mockImplementationOnce(() => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        process.nextTick(() => {
          const err = new Error('spawn bash ENOENT');
          err.code = 'ENOENT';
          child.emit('error', err);
        });
        return child;
      });

      const result = await runVerifications(baseArgs({ task: makeTask(['echo unreachable']) }));

      expect(result.passed).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].exitCode).toBeNull();
      expect(result.results[0].passed).toBe(false);

      const receipt = store.readReceipt(executionRoot, RUN_ID, receiptId(0));
      expect(receipt.spawnError).toEqual(expect.stringContaining('ENOENT'));
      expect(receipt.passed).toBe(false);
    });
  });

  describe('multiple attempts', () => {
    test('receipt ids are namespaced by attemptNumber', async () => {
      await runVerifications(baseArgs({ task: makeTask(['echo a']), attemptNumber: 1 }));
      await runVerifications(baseArgs({ task: makeTask(['echo b']), attemptNumber: 2 }));

      const ids = store.listReceipts(executionRoot, RUN_ID).sort();
      expect(ids).toEqual([receiptId(0, 1), receiptId(0, 2)].sort());
    });
  });
});
