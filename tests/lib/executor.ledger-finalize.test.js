'use strict';

// Tests for lib/task-executor/index.js's _measureTokensFromSpawnResult and
// _finalizeDispatchLedgerActivity — the fix for a real gap found against a
// live executor run: dispatchTaskAttempt/runReview open 'implementation'/
// 'review' ledger activities before spawning, but _runTaskToResolution used
// to never close them, on EITHER outcome (success or failure). Every such
// entry stayed status:'running' forever, which is also why the newly
// implemented `status` command's totalTokens/totalCostUsd were always null
// for a real run, success or not.

const fs = require('fs');
const os = require('os');
const path = require('path');

const store = require('../../lib/task-executor/store');
const ledger = require('../../lib/execution-ledger');
const { _measureTokensFromSpawnResult, _finalizeDispatchLedgerActivity } = require('../../lib/task-executor/index');

const RUN_ID = 'run-1';
const TASK_ID = 'US-99-TASK-BE-01';

describe('_measureTokensFromSpawnResult', () => {
  test('sums the four usage fields when all are present and valid', () => {
    const spawnResult = { result: { usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 } } };
    expect(_measureTokensFromSpawnResult(spawnResult)).toBe(165);
  });

  test('treats missing cache fields as zero, not unavailable', () => {
    const spawnResult = { result: { usage: { input_tokens: 100, output_tokens: 50 } } };
    expect(_measureTokensFromSpawnResult(spawnResult)).toBe(150);
  });

  test('returns null (never 0) when usage is missing entirely', () => {
    expect(_measureTokensFromSpawnResult({ result: {} })).toBeNull();
    expect(_measureTokensFromSpawnResult({})).toBeNull();
    expect(_measureTokensFromSpawnResult(null)).toBeNull();
  });

  test('returns null when a required field is not a non-negative integer', () => {
    expect(_measureTokensFromSpawnResult({ result: { usage: { input_tokens: null, output_tokens: 50 } } })).toBeNull();
    expect(_measureTokensFromSpawnResult({ result: { usage: { input_tokens: -1, output_tokens: 50 } } })).toBeNull();
  });

  test('returns null (never 0) when the total computes to zero', () => {
    const spawnResult = { result: { usage: { input_tokens: 0, output_tokens: 0 } } };
    expect(_measureTokensFromSpawnResult(spawnResult)).toBeNull();
  });
});

describe('_finalizeDispatchLedgerActivity', () => {
  let tmpDir;
  let executionRoot;
  let runDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'executor-ledger-finalize-test-'));
    executionRoot = path.join(tmpDir, 'execution');
    runDir = store._executionPaths(executionRoot, RUN_ID).runDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function openActivity(kind) {
    fs.mkdirSync(runDir, { recursive: true });
    ledger.open(runDir, RUN_ID, 'executor:' + RUN_ID + ':' + TASK_ID + ':' + kind, kind, null, 1, {});
  }

  function readEntries() {
    return JSON.parse(fs.readFileSync(path.join(runDir, RUN_ID + '-token-ledger.json'), 'utf8'));
  }

  test('closes an open "implementation" activity as done with measured tokens', () => {
    openActivity('implementation');

    _finalizeDispatchLedgerActivity(executionRoot, RUN_ID, TASK_ID, 1, 'implementation', { status: 'done', tokens: 1234 });

    const entries = readEntries();
    const entry = entries.find((e) => e.agent === 'executor:' + RUN_ID + ':' + TASK_ID + ':implementation');
    expect(entry.status).toBe('done');
    expect(entry.phase_delta_tokens).toBe(1234);
  });

  test('closes an open "review" activity as failed with null tokens and a reason', () => {
    openActivity('review');

    _finalizeDispatchLedgerActivity(executionRoot, RUN_ID, TASK_ID, 1, 'review', { status: 'failed', tokens: null, reason: 'CLAUDE_SPAWN_FAILED' });

    const entries = readEntries();
    const entry = entries.find((e) => e.agent === 'executor:' + RUN_ID + ':' + TASK_ID + ':review');
    expect(entry.status).toBe('failed');
    expect(entry.phase_delta_tokens).toBeNull();
    expect(entry.usage_reason).toBe('CLAUDE_SPAWN_FAILED');
  });

  test('never leaves the activity open: a never-closed entry would stay status "running" forever', () => {
    openActivity('implementation');
    expect(readEntries()[0].status).toBe('running');

    _finalizeDispatchLedgerActivity(executionRoot, RUN_ID, TASK_ID, 1, 'implementation', { status: 'done', tokens: 10 });

    expect(readEntries()[0].status).not.toBe('running');
  });

  test('throws ACTIVITY_NOT_FOUND for a kind that was never opened', () => {
    fs.mkdirSync(runDir, { recursive: true });
    expect(() => {
      _finalizeDispatchLedgerActivity(executionRoot, RUN_ID, TASK_ID, 1, 'implementation', { status: 'done', tokens: 1 });
    }).toThrow(expect.objectContaining({ code: 'ACTIVITY_NOT_FOUND' }));
  });
});
