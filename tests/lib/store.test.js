'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const {
  State,
  writeState,
  readState,
  recoverState,
  writeReceipt,
  readReceipt,
  listReceipts,
  writeIntent,
  readIntent,
  listIntents,
} = require('../../lib/task-executor/store');

function baseFields(overrides) {
  return Object.assign({
    runId:         'run-1',
    featureId:     'FTR-018',
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

describe('State schema validation and construction', () => {
  test('constructs successfully with all required fields present', () => {
    const state = new State(baseFields());
    expect(state.runId).toBe('run-1');
    expect(state.generation).toBe(0);
    expect(state.protocolVersion).toBe(1);
  });

  test('throws STATE_VALIDATION_ERROR when a required field is missing', () => {
    const fields = baseFields();
    delete fields.planDigest;
    expect(() => new State(fields)).toThrow(/schema validation failed/);
    try {
      new State(fields);
      throw new Error('expected constructor to throw');
    } catch (err) {
      expect(err.code).toBe('STATE_VALIDATION_ERROR');
    }
  });

  test('throws STATE_VALIDATION_ERROR when runStatus has an invalid value', () => {
    const fields = baseFields({ runStatus: 'not-a-real-status' });
    expect(() => new State(fields)).toThrow();
  });

  test('State.validate reports errors without throwing for a malformed plain object', () => {
    const result = State.validate({ runId: 'x' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('State pure mutation methods', () => {
  test('addTask/setTaskStatus/addAttempt/updateAttempt return new immutable instances', () => {
    const s0 = new State(baseFields());
    const s1 = s0.addTask('TASK-01', { dependencies: [] });
    expect(s0.tasks).toEqual({}); // original untouched
    expect(s1.tasks['TASK-01'].status).toBe('pending');
    expect(s1.generation).toBe(s0.generation + 1);

    const s2 = s1.setTaskStatus('TASK-01', 'active');
    expect(s1.tasks['TASK-01'].status).toBe('pending'); // s1 untouched
    expect(s2.tasks['TASK-01'].status).toBe('active');

    const s3 = s2.addAttempt('TASK-01', { baseSha: 'c'.repeat(40) });
    expect(s3.tasks['TASK-01'].attempts).toHaveLength(1);
    expect(s3.tasks['TASK-01'].attempts[0].number).toBe(1);
    expect(s3.tasks['TASK-01'].attempts[0].stage).toBe('prepared');

    const s4 = s3.updateAttempt('TASK-01', 1, { stage: 'running' });
    expect(s3.tasks['TASK-01'].attempts[0].stage).toBe('prepared'); // s3 untouched
    expect(s4.tasks['TASK-01'].attempts[0].stage).toBe('running');
    expect(s4.previousDigest).toBe(s3.computeChecksum());
  });

  test('addAttempt rejects an unknown stage', () => {
    const s0 = new State(baseFields()).addTask('TASK-01');
    expect(() => s0.addAttempt('TASK-01', { stage: 'not-a-stage' })).toThrow();
  });

  test('setTaskStatus throws STATE_TASK_NOT_FOUND for an unknown task', () => {
    const s0 = new State(baseFields());
    try {
      s0.setTaskStatus('MISSING', 'active');
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe('STATE_TASK_NOT_FOUND');
    }
  });

  test('recordDispatch and recordIntegration append monotonic sequence entries', () => {
    const s0 = new State(baseFields()).addTask('TASK-01');
    const s1 = s0.recordDispatch('TASK-01', 1);
    expect(s1.dispatchSequence).toEqual([{ seq: 1, taskId: 'TASK-01', attemptNumber: 1, at: expect.any(String) }]);
    const s2 = s1.recordIntegration('TASK-01', 1);
    expect(s2.integrationSequence[0].seq).toBe(1);
  });
});

describe('State file: atomic write, readback, recovery', () => {
  let tmpDir;
  let executionRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-'));
    executionRoot = path.join(tmpDir, 'ai-toolkit', 'execution');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writeState then readState round-trips an equivalent state', () => {
    const state = new State(baseFields()).addTask('TASK-01');
    writeState(executionRoot, 'run-1', state);

    const readBack = readState(executionRoot, 'run-1');
    expect(readBack.toJSON()).toEqual(state.toJSON());
  });

  test('readState throws STATE_NOT_FOUND when no state has ever been written', () => {
    try {
      readState(executionRoot, 'never-written');
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe('STATE_NOT_FOUND');
    }
  });

  test('a second writeState rotates the prior generation into state.previous.json', () => {
    const s0 = new State(baseFields());
    writeState(executionRoot, 'run-1', s0);
    const s1 = s0.addTask('TASK-01');
    writeState(executionRoot, 'run-1', s1);

    const previousPath = path.join(executionRoot, 'runs', 'run-1', 'state.previous.json');
    expect(fs.existsSync(previousPath)).toBe(true);
    const previousEnvelope = JSON.parse(fs.readFileSync(previousPath, 'utf8'));
    expect(previousEnvelope.state.generation).toBe(s0.generation);
  });

  test('atomic write leaves no leftover temp files after a successful write', () => {
    const state = new State(baseFields());
    writeState(executionRoot, 'run-1', state);
    const runDir = path.join(executionRoot, 'runs', 'run-1');
    const leftovers = fs.readdirSync(runDir).filter((name) => name.includes('.tmp-'));
    expect(leftovers).toEqual([]);
  });

  test('readState falls back to the previous generation when the current file is corrupted', () => {
    const s0 = new State(baseFields());
    writeState(executionRoot, 'run-1', s0);
    const s1 = s0.addTask('TASK-01');
    writeState(executionRoot, 'run-1', s1);

    const statePath = path.join(executionRoot, 'runs', 'run-1', 'state.json');
    fs.writeFileSync(statePath, '{ not valid json');

    const recovered = readState(executionRoot, 'run-1');
    expect(recovered.generation).toBe(s0.generation);

    const diagnosis = recoverState(executionRoot, 'run-1');
    expect(diagnosis.recovered).toBe(true);
    expect(diagnosis.source).toBe('previous');
  });

  test('readState with allowRecovery:false throws STATE_CORRUPTED without falling back', () => {
    const s0 = new State(baseFields());
    writeState(executionRoot, 'run-1', s0);
    const statePath = path.join(executionRoot, 'runs', 'run-1', 'state.json');
    fs.writeFileSync(statePath, '{ not valid json');

    try {
      readState(executionRoot, 'run-1', { allowRecovery: false });
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe('STATE_CORRUPTED');
    }
  });

  test('readState detects a tampered state file whose checksum no longer matches', () => {
    const s0 = new State(baseFields());
    writeState(executionRoot, 'run-1', s0);
    const statePath = path.join(executionRoot, 'runs', 'run-1', 'state.json');
    const envelope = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    envelope.state.runStatus = 'stopping'; // mutate payload without recomputing checksum
    fs.writeFileSync(statePath, JSON.stringify(envelope, null, 2));

    try {
      readState(executionRoot, 'run-1', { allowRecovery: false });
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe('STATE_CORRUPTED');
      expect(err.reason).toBe('checksum-mismatch');
    }
  });

  test('recoverState throws STATE_UNRECOVERABLE when both generations are invalid', () => {
    const s0 = new State(baseFields());
    writeState(executionRoot, 'run-1', s0);
    const runDir = path.join(executionRoot, 'runs', 'run-1');
    fs.writeFileSync(path.join(runDir, 'state.json'), 'garbage');
    fs.writeFileSync(path.join(runDir, 'state.previous.json'), 'also garbage');

    try {
      recoverState(executionRoot, 'run-1');
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe('STATE_UNRECOVERABLE');
    }
  });
});

describe('Receipts: immutable, content-addressed records', () => {
  let tmpDir;
  let executionRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-'));
    executionRoot = path.join(tmpDir, 'ai-toolkit', 'execution');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writeReceipt then readReceipt round-trips the same content', () => {
    const receipt = { tokens: 123, outcome: 'done' };
    writeReceipt(executionRoot, 'run-1', 'TASK-01-implementation-1', receipt);
    expect(readReceipt(executionRoot, 'run-1', 'TASK-01-implementation-1')).toEqual(receipt);
  });

  test('writing an identical receipt twice is idempotent', () => {
    const receipt = { tokens: 123, outcome: 'done' };
    writeReceipt(executionRoot, 'run-1', 'TASK-01-implementation-1', receipt);
    expect(() => writeReceipt(executionRoot, 'run-1', 'TASK-01-implementation-1', receipt)).not.toThrow();
  });

  test('writing a conflicting receipt for the same id throws RECEIPT_CONFLICT', () => {
    writeReceipt(executionRoot, 'run-1', 'TASK-01-implementation-1', { tokens: 123 });
    try {
      writeReceipt(executionRoot, 'run-1', 'TASK-01-implementation-1', { tokens: 456 });
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe('RECEIPT_CONFLICT');
    }
  });

  test('readReceipt throws RECEIPT_NOT_FOUND for an unknown activity id', () => {
    try {
      readReceipt(executionRoot, 'run-1', 'does-not-exist');
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe('RECEIPT_NOT_FOUND');
    }
  });

  test('listReceipts returns all written activity ids sorted', () => {
    writeReceipt(executionRoot, 'run-1', 'b-activity', {});
    writeReceipt(executionRoot, 'run-1', 'a-activity', {});
    expect(listReceipts(executionRoot, 'run-1')).toEqual(['a-activity', 'b-activity']);
  });
});

describe('Intents: immutable, content-addressed records', () => {
  let tmpDir;
  let executionRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-'));
    executionRoot = path.join(tmpDir, 'ai-toolkit', 'execution');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writeIntent then readIntent round-trips the same content', () => {
    const intent = { kind: 'checkpoint', taskId: 'TASK-01' };
    writeIntent(executionRoot, 'run-1', 'intent-1', intent);
    expect(readIntent(executionRoot, 'run-1', 'intent-1')).toEqual(intent);
  });

  test('writing a conflicting intent for the same id throws INTENT_CONFLICT', () => {
    writeIntent(executionRoot, 'run-1', 'intent-1', { kind: 'checkpoint' });
    try {
      writeIntent(executionRoot, 'run-1', 'intent-1', { kind: 'integration' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe('INTENT_CONFLICT');
    }
  });

  test('readIntent throws INTENT_NOT_FOUND for an unknown intent id', () => {
    try {
      readIntent(executionRoot, 'run-1', 'does-not-exist');
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe('INTENT_NOT_FOUND');
    }
  });

  test('listIntents returns all written intent ids sorted', () => {
    writeIntent(executionRoot, 'run-1', 'z-intent', {});
    writeIntent(executionRoot, 'run-1', 'a-intent', {});
    expect(listIntents(executionRoot, 'run-1')).toEqual(['a-intent', 'z-intent']);
  });
});

describe('Path/id safety', () => {
  let tmpDir;
  let executionRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-'));
    executionRoot = path.join(tmpDir, 'ai-toolkit', 'execution');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('a runId or activityId containing path traversal segments is rejected', () => {
    expect(() => writeState(executionRoot, '../escape', new State(baseFields()))).toThrow();
    expect(() => writeReceipt(executionRoot, 'run-1', '../../escape', {})).toThrow();
  });
});
