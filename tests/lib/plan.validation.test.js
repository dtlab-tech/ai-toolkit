'use strict';

const fs = require('fs');
const path = require('path');
const { parseCSV, mapPhases, parseMarkdown, validateDAG } = require('../../lib/task-executor/plan');

const REAL_CSV_PATH = path.join(
  __dirname, '..', '..', 'internal_docs', 'features',
  'FTR-018-deterministic-task-execution-checkpoints-and-resume',
  'FTR-018-Work-Breakdown.csv'
);

const REAL_MD_PATH = path.join(
  __dirname, '..', '..', 'internal_docs', 'features',
  'FTR-018-deterministic-task-execution-checkpoints-and-resume',
  'FTR-018-Work-Breakdown.md'
);

function task(overrides) {
  return Object.assign({
    id: 'US-99-TASK-BE-01',
    title: 'Fixture task',
    outcome: 'Fixture outcome',
    domain: 'BE',
    agentType: 'developer-backend',
    dependsOn: [],
    acceptanceCriteria: ['AC-01'],
    agentMinutes: 10,
    tokens: 20000,
    outputCount: 1,
    groupingRationale: 'Fixture rationale',
    commit: { type: 'feat', scope: null, subject: 'fixture' },
    verificationCommands: [],
  }, overrides);
}

describe('validateDAG() — synthetic fixtures', () => {
  test('returns true for a well-formed DAG with no cycles', () => {
    const tasks = [
      task({ id: 'US-99-TASK-BE-01', dependsOn: [] }),
      task({ id: 'US-99-TASK-BE-02', dependsOn: ['US-99-TASK-BE-01'] }),
      task({ id: 'US-99-TASK-BE-03', dependsOn: ['US-99-TASK-BE-01', 'US-99-TASK-BE-02'] }),
    ];
    expect(validateDAG(tasks)).toBe(true);
  });

  test('rejects a duplicate task ID', () => {
    const tasks = [
      task({ id: 'US-99-TASK-BE-01' }),
      task({ id: 'US-99-TASK-BE-01' }),
    ];
    expect(() => validateDAG(tasks)).toThrow(/duplicate task ID "US-99-TASK-BE-01"/);
    try {
      validateDAG(tasks);
      throw new Error('expected validateDAG to throw');
    } catch (err) {
      expect(err.code).toBe('PLAN_PARSE_ERROR');
    }
  });

  test('rejects a dependsOn reference to a task ID that does not exist', () => {
    const tasks = [
      task({ id: 'US-99-TASK-BE-01', dependsOn: ['US-99-TASK-BE-999'] }),
    ];
    expect(() => validateDAG(tasks)).toThrow(/depends on unknown task ID "US-99-TASK-BE-999"/);
  });

  test('rejects a task depending on itself', () => {
    const tasks = [
      task({ id: 'US-99-TASK-BE-01', dependsOn: ['US-99-TASK-BE-01'] }),
    ];
    expect(() => validateDAG(tasks)).toThrow(/self-dependency/);
  });

  test('rejects a task missing the required "id" field', () => {
    const tasks = [
      task({ id: null }),
    ];
    expect(() => validateDAG(tasks)).toThrow(/missing required field\(s\): id/);
  });

  test('rejects a task missing the required "dependsOn" field', () => {
    const tasks = [
      task({ id: 'US-99-TASK-BE-01', dependsOn: undefined }),
    ];
    expect(() => validateDAG(tasks)).toThrow(/task "US-99-TASK-BE-01" is missing required field\(s\): dependsOn/);
  });

  test('rejects a direct two-task cycle and reports the cycle path', () => {
    const tasks = [
      task({ id: 'US-99-TASK-BE-01', dependsOn: ['US-99-TASK-BE-02'] }),
      task({ id: 'US-99-TASK-BE-02', dependsOn: ['US-99-TASK-BE-01'] }),
    ];
    expect(() => validateDAG(tasks)).toThrow(
      /dependency cycle detected: US-99-TASK-BE-01 -> US-99-TASK-BE-02 -> US-99-TASK-BE-01/
    );
    try {
      validateDAG(tasks);
      throw new Error('expected validateDAG to throw');
    } catch (err) {
      expect(err.code).toBe('PLAN_PARSE_ERROR');
    }
  });

  test('rejects a longer indirect cycle and reports the full cycle path', () => {
    const tasks = [
      task({ id: 'US-99-TASK-BE-01', dependsOn: ['US-99-TASK-BE-03'] }),
      task({ id: 'US-99-TASK-BE-02', dependsOn: ['US-99-TASK-BE-01'] }),
      task({ id: 'US-99-TASK-BE-03', dependsOn: ['US-99-TASK-BE-02'] }),
    ];
    expect(() => validateDAG(tasks)).toThrow(
      /dependency cycle detected: US-99-TASK-BE-01 -> US-99-TASK-BE-03 -> US-99-TASK-BE-02 -> US-99-TASK-BE-01/
    );
  });

  test('does not reject a diamond dependency shape (shared ancestor is not a cycle)', () => {
    const tasks = [
      task({ id: 'US-99-TASK-BE-01', dependsOn: [] }),
      task({ id: 'US-99-TASK-BE-02', dependsOn: ['US-99-TASK-BE-01'] }),
      task({ id: 'US-99-TASK-BE-03', dependsOn: ['US-99-TASK-BE-01'] }),
      task({ id: 'US-99-TASK-BE-04', dependsOn: ['US-99-TASK-BE-02', 'US-99-TASK-BE-03'] }),
    ];
    expect(validateDAG(tasks)).toBe(true);
  });

  test('treats an empty task list as a trivially valid DAG', () => {
    expect(validateDAG([])).toBe(true);
  });
});

describe('validateDAG() — real FTR-018-Work-Breakdown.md/.csv', () => {
  test('validates cleanly against the real plan (46 tasks, no cycles)', () => {
    const csv = fs.readFileSync(REAL_CSV_PATH, 'utf8');
    const markdown = fs.readFileSync(REAL_MD_PATH, 'utf8');
    const rows = parseCSV(csv);
    const mdTasks = parseMarkdown(markdown);
    const { tasks } = mapPhases(rows, mdTasks);

    expect(tasks).toHaveLength(46);
    expect(validateDAG(tasks)).toBe(true);
  });
});
