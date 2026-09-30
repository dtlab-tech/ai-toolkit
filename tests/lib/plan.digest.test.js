'use strict';

const fs = require('fs');
const path = require('path');
const { createPlanSnapshot, PARSER_FORMAT_VERSION } = require('../../lib/task-executor/plan');

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

const HEADER = 'phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type';

describe('createPlanSnapshot() — real FTR-018-Work-Breakdown.md/.csv', () => {
  let markdown;
  let csv;

  beforeAll(() => {
    markdown = fs.readFileSync(REAL_MD_PATH, 'utf8');
    csv = fs.readFileSync(REAL_CSV_PATH, 'utf8');
  });

  test('returns a 64-character hex planDigest bound to normalized tasks/phases', () => {
    const snapshot = createPlanSnapshot(markdown, csv);

    expect(snapshot.planDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.formatVersion).toBe(PARSER_FORMAT_VERSION);
    expect(snapshot.mdHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(snapshot.csvHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(snapshot.tasks).toHaveLength(46);
    expect(snapshot.phases.length).toBeGreaterThan(0);
  });

  test('is deterministic — identical MD/CSV bytes always produce the same digest', () => {
    const first = createPlanSnapshot(markdown, csv);
    const second = createPlanSnapshot(markdown, csv);

    expect(second.planDigest).toBe(first.planDigest);
    expect(second.mdHash).toBe(first.mdHash);
    expect(second.csvHash).toBe(first.csvHash);
  });

  test('changing a single MD byte changes the planDigest and mdHash but not the csvHash', () => {
    const base = createPlanSnapshot(markdown, csv);
    const mutatedMarkdown = markdown + '\n';
    const mutated = createPlanSnapshot(mutatedMarkdown, csv);

    expect(mutated.planDigest).not.toBe(base.planDigest);
    expect(mutated.mdHash).not.toBe(base.mdHash);
    expect(mutated.csvHash).toBe(base.csvHash);
  });

  test('changing a single CSV byte changes the planDigest and csvHash but not the mdHash', () => {
    const base = createPlanSnapshot(markdown, csv);
    const mutatedCsv = csv + '\n';
    const mutated = createPlanSnapshot(markdown, mutatedCsv);

    expect(mutated.planDigest).not.toBe(base.planDigest);
    expect(mutated.csvHash).not.toBe(base.csvHash);
    expect(mutated.mdHash).toBe(base.mdHash);
  });

  test('changing formatVersion changes the planDigest without changing the independent file hashes', () => {
    const base = createPlanSnapshot(markdown, csv, 1);
    const bumped = createPlanSnapshot(markdown, csv, 2);

    expect(bumped.planDigest).not.toBe(base.planDigest);
    expect(bumped.mdHash).toBe(base.mdHash);
    expect(bumped.csvHash).toBe(base.csvHash);
  });

  test('propagates the underlying PLAN_PARSE_ERROR for a malformed CSV without swallowing it', () => {
    const malformedCsv = HEADER + '\nnot-enough-columns\n';

    expect(() => createPlanSnapshot(markdown, malformedCsv)).toThrow(/parseCSV:/);
    try {
      createPlanSnapshot(markdown, malformedCsv);
      throw new Error('expected createPlanSnapshot to throw');
    } catch (err) {
      expect(err.code).toBe('PLAN_PARSE_ERROR');
    }
  });

  test('propagates the underlying PLAN_PARSE_ERROR for MD/CSV task ID mismatches without swallowing it', () => {
    // Renaming every MD occurrence of a task ID (anchor, heading, "Task ID"
    // field, and any dependent task's "Dependencies" field) leaves that ID
    // internally consistent within the MD but orphaned from the CSV, which
    // still carries the original task_id — this is mapPhases' reconciliation
    // check, distinct from the parseCSV shape check exercised above.
    const malformedMarkdown = markdown.split('US-01-TASK-BE-04').join('US-01-TASK-BE-04-RENAMED');

    expect(() => createPlanSnapshot(malformedMarkdown, csv)).toThrow(/mapPhases:/);
    try {
      createPlanSnapshot(malformedMarkdown, csv);
      throw new Error('expected createPlanSnapshot to throw');
    } catch (err) {
      expect(err.code).toBe('PLAN_PARSE_ERROR');
    }
  });

  describe('snapshot immutability', () => {
    let snapshot;

    beforeEach(() => {
      snapshot = createPlanSnapshot(markdown, csv);
    });

    test('the snapshot object itself is frozen', () => {
      expect(Object.isFrozen(snapshot)).toBe(true);
      expect(() => { snapshot.planDigest = 'tampered'; }).toThrow(TypeError);
    });

    test('the tasks array and its elements are frozen — push and field mutation both throw', () => {
      expect(Object.isFrozen(snapshot.tasks)).toBe(true);
      expect(Object.isFrozen(snapshot.tasks[0])).toBe(true);
      expect(() => snapshot.tasks.push({})).toThrow(TypeError);
      expect(() => { snapshot.tasks[0].title = 'tampered'; }).toThrow(TypeError);
    });

    test('nested task fields (commit object, dependsOn array) are frozen', () => {
      const taskWithDeps = snapshot.tasks.find((t) => t.dependsOn.length > 0);

      expect(Object.isFrozen(snapshot.tasks[0].commit)).toBe(true);
      expect(() => { snapshot.tasks[0].commit.type = 'tampered'; }).toThrow(TypeError);
      expect(Object.isFrozen(taskWithDeps.dependsOn)).toBe(true);
      expect(() => taskWithDeps.dependsOn.push('tampered')).toThrow(TypeError);
    });

    test('the phases array and its elements are frozen', () => {
      expect(Object.isFrozen(snapshot.phases)).toBe(true);
      expect(Object.isFrozen(snapshot.phases[0])).toBe(true);
      expect(() => snapshot.phases.push({})).toThrow(TypeError);
      expect(() => { snapshot.phases[0].title = 'tampered'; }).toThrow(TypeError);
    });
  });
});
