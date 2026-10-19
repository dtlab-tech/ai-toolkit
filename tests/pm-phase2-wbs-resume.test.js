'use strict';

// FTR-020 US-04-TASK-TEST-01 / AC-03 / UC-04: pm-phase2.js's per-task generation loop must
// skip (not dispatch) a task only when its recorded status is "generated" AND its detail file
// actually exists — status alone is never trusted (a task whose file went missing despite a
// "generated" status is treated as pending). Since pm-phase2.js runs in a sandboxed
// AsyncFunction with no `require` (lib/workflow-runner.js) and cannot itself be `require`d by
// a test, this exercises a hand-synced mirror of its selection predicate
// (tests/helpers/pm-phase2-flow.js:selectPendingTaskIds) — the same pattern this repo's own
// tests/pm-phase2.orchestration-flow.test.js already uses for pm-phase2's other predicates —
// plus a source-text check that the real script still contains the matching condition, so the
// mirror cannot silently drift from the real implementation unnoticed.

const fs = require('fs');
const path = require('path');
const { selectPendingTaskIds } = require('./helpers/pm-phase2-flow');

const PM_PHASE2_SOURCE = fs.readFileSync(
  path.join(__dirname, '../src/claude/workflows/pm-phase2.js'), 'utf8');

function makeIndex(taskStatuses) {
  const phase = { id: 'US-01', taskIds: Object.keys(taskStatuses) };
  const tasks = {};
  for (const [id, status] of Object.entries(taskStatuses)) {
    tasks[id] = { detailFile: `tasks/${id}.md`, status };
  }
  return { phases: [phase], tasks };
}

describe('pm-phase2 resume-by-status: mirror stays in sync with the real script', () => {
  test('pm-phase2.js still contains the exact resume-by-status condition the mirror replicates', () => {
    expect(PM_PHASE2_SOURCE).toContain("task.status === 'generated' && c.exists(detailPath)");
  });
});

describe('selectPendingTaskIds()', () => {
  test('dispatches only pending tasks; generated tasks with an existing file are skipped', () => {
    const index = makeIndex({ 'T-01': 'generated', 'T-02': 'pending', 'T-03': 'generated' });
    const existing = new Set(['/wbs/tasks/T-01.md', '/wbs/tasks/T-03.md']); // T-02 has no file yet
    const pending = selectPendingTaskIds(index, '/wbs', p => existing.has(p));
    expect(pending).toEqual(['T-02']);
  });

  test('a "generated" task whose detail file is missing is treated as pending, not trusted on status alone', () => {
    const index = makeIndex({ 'T-01': 'generated', 'T-02': 'generated' });
    const existing = new Set(['/wbs/tasks/T-01.md']); // T-02's file went missing
    const pending = selectPendingTaskIds(index, '/wbs', p => existing.has(p));
    expect(pending).toEqual(['T-02']);
  });

  test('all tasks pending on a fresh skeleton (none generated yet) dispatch in phase/taskIds order', () => {
    const index = makeIndex({ 'T-01': 'pending', 'T-02': 'pending' });
    const pending = selectPendingTaskIds(index, '/wbs', () => false);
    expect(pending).toEqual(['T-01', 'T-02']);
  });

  test('no tasks dispatch when every task is already generated with its file present', () => {
    const index = makeIndex({ 'T-01': 'generated', 'T-02': 'generated' });
    const pending = selectPendingTaskIds(index, '/wbs', () => true);
    expect(pending).toEqual([]);
  });
});
