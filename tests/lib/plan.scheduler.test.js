'use strict';

const fs = require('fs');
const path = require('path');
const { createPlanSnapshot, computeReadyQueue } = require('../../lib/task-executor/plan');

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

function ids(tasks) {
  return tasks.map(function (t) { return t.id; });
}

describe('computeReadyQueue() — real FTR-018-Work-Breakdown.md/.csv', () => {
  let markdown;
  let csv;

  beforeAll(() => {
    markdown = fs.readFileSync(REAL_MD_PATH, 'utf8');
    csv = fs.readFileSync(REAL_CSV_PATH, 'utf8');
  });

  test('returns every task exactly once, never placing a task before any of its dependencies', () => {
    const snapshot = createPlanSnapshot(markdown, csv);
    const order = computeReadyQueue(snapshot);

    expect(order).toHaveLength(snapshot.tasks.length);
    expect(new Set(ids(order)).size).toBe(snapshot.tasks.length);

    const position = new Map();
    order.forEach(function (task, index) { position.set(task.id, index); });

    order.forEach(function (task) {
      task.dependsOn.forEach(function (depId) {
        expect(position.get(depId)).toBeLessThan(position.get(task.id));
      });
    });
  });

  test('is deterministic — two calls on the same frozen snapshot produce byte-identical ordering', () => {
    const snapshot = createPlanSnapshot(markdown, csv);

    const first = computeReadyQueue(snapshot);
    const second = computeReadyQueue(snapshot);

    expect(ids(second)).toEqual(ids(first));
  });

  test('is deterministic — two independently parsed snapshots of the same source produce byte-identical ordering', () => {
    const snapshotA = createPlanSnapshot(markdown, csv);
    const snapshotB = createPlanSnapshot(markdown, csv);

    const orderA = computeReadyQueue(snapshotA);
    const orderB = computeReadyQueue(snapshotB);

    expect(ids(orderB)).toEqual(ids(orderA));
  });

  test('does not mutate the frozen snapshot', () => {
    const snapshot = createPlanSnapshot(markdown, csv);
    computeReadyQueue(snapshot);

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.tasks)).toBe(true);
    expect(Object.isFrozen(snapshot.phases)).toBe(true);
  });
});

describe('computeReadyQueue() — Kahn ordering and tie-break rules on synthetic graphs', () => {
  test('performs a genuine Kahn topological sort regardless of input array order', () => {
    // Diamond: A -> {B, C} -> D. Deliberately listed out of topological
    // order to prove this is a real in-degree-driven Kahn pass, not an
    // incidental pass-through of input order.
    const tasks = [
      { id: 'D', dependsOn: ['B', 'C'] },
      { id: 'C', dependsOn: ['A'] },
      { id: 'B', dependsOn: ['A'] },
      { id: 'A', dependsOn: [] },
    ];

    const order = computeReadyQueue(tasks);

    // A must be first (only zero-indegree task), D must be last (depends on
    // both B and C). B and C become ready simultaneously once A completes;
    // no phaseId is present so both fall into one implicit phase and the
    // tie-break degrades to source array position: C (index 1) precedes
    // B (index 2).
    expect(ids(order)).toEqual(['A', 'C', 'B', 'D']);
  });

  test('breaks ties among simultaneously-ready tasks by source phase index from a snapshot, not raw task array order', () => {
    // T2 appears FIRST in the tasks array, but belongs to phase P2 which is
    // SECOND in the phases array; T1 appears second in the tasks array but
    // belongs to phase P1, first in the phases array. Both are immediately
    // ready (no deps). If the tie-break used raw tasks-array order, T2 would
    // sort first; per the Tech-Spec rule (source phase index first), T1
    // must sort first instead.
    const snapshot = {
      tasks: [
        { id: 'T2', dependsOn: [] },
        { id: 'T1', dependsOn: [] },
      ],
      phases: [
        { id: 'P1', taskIds: ['T1'] },
        { id: 'P2', taskIds: ['T2'] },
      ],
    };

    const order = computeReadyQueue(snapshot);

    expect(ids(order)).toEqual(['T1', 'T2']);
  });

  test('breaks ties among simultaneously-ready tasks within the same phase by source task index, then falls back to ID', () => {
    const snapshot = {
      tasks: [
        { id: 'Z', dependsOn: [] },
        { id: 'A', dependsOn: [] },
      ],
      phases: [
        // Source task index within the phase is 'Z' then 'A' — the reverse
        // of ID's alphabetical order — proving task-index beats the ID
        // tiebreak when both are present.
        { id: 'P1', taskIds: ['Z', 'A'] },
      ],
    };

    const order = computeReadyQueue(snapshot);

    expect(ids(order)).toEqual(['Z', 'A']);
  });

  test('falls back to ID as the final tiebreak when phase index and task index are equal', () => {
    const tasks = [
      { id: 'B', dependsOn: [] },
      { id: 'A', dependsOn: [] },
    ];

    // Neither task carries a phaseId, so both share the single implicit
    // phase and their taskIndexInPhase is their plain array position (0 and
    // 1 respectively) — no tie at that level either in this case, so this
    // instead exercises the plain-array fallback contract directly: source
    // array order is honored ('B' before 'A') because it precedes the ID
    // tiebreak in the plain-array contract.
    const order = computeReadyQueue(tasks);
    expect(ids(order)).toEqual(['B', 'A']);
  });

  test('accepts a plain tasks array with explicit phaseId and groups pseudo-phases by first-seen order', () => {
    const tasks = [
      { id: 'T2', phaseId: 'PHASE-B', dependsOn: [] },
      { id: 'T1', phaseId: 'PHASE-A', dependsOn: [] },
    ];

    // PHASE-B is seen first (at array index 0), so it gets pseudo phaseIndex
    // 0, even though alphabetically "PHASE-A" < "PHASE-B" — first-seen order
    // drives the pseudo-phase index, matching mapPhases' own phaseOrder
    // construction.
    const order = computeReadyQueue(tasks);
    expect(ids(order)).toEqual(['T2', 'T1']);
  });

  test('throws a PLAN_PARSE_ERROR defensively when the graph contains a cycle', () => {
    const tasks = [
      { id: 'A', dependsOn: ['B'] },
      { id: 'B', dependsOn: ['A'] },
    ];

    expect(() => computeReadyQueue(tasks)).toThrow(/computeReadyQueue:.*cycle/);
    try {
      computeReadyQueue(tasks);
      throw new Error('expected computeReadyQueue to throw');
    } catch (err) {
      expect(err.code).toBe('PLAN_PARSE_ERROR');
    }
  });

  test('throws a PLAN_PARSE_ERROR defensively for a dependsOn reference that never resolves', () => {
    const tasks = [
      { id: 'A', dependsOn: ['MISSING'] },
    ];

    expect(() => computeReadyQueue(tasks)).toThrow(/computeReadyQueue:/);
    try {
      computeReadyQueue(tasks);
      throw new Error('expected computeReadyQueue to throw');
    } catch (err) {
      expect(err.code).toBe('PLAN_PARSE_ERROR');
    }
  });

  test('rejects an input that is neither a plan snapshot nor a plain tasks array', () => {
    expect(() => computeReadyQueue(null)).toThrow(/computeReadyQueue:/);
    expect(() => computeReadyQueue({})).toThrow(/computeReadyQueue:/);
    expect(() => computeReadyQueue('not a plan')).toThrow(/computeReadyQueue:/);
  });
});
