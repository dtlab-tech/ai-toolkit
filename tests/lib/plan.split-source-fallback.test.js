'use strict';

// Regression test for a real bug (reported against Fincantieri.ISDM.JobScheduler, FTR-012):
// lib/task-executor/index.js's execute() hardcoded reading {PREFIX}-Work-Breakdown.md/.csv
// and threw PLAN_NOT_FOUND whenever a feature only had the split wbs/ directory pm-phase2.js
// writes today (FTR-025 stopped auto-rendering the legacy .md/.csv view, since "nothing
// downstream ever read" it — except this executor, which nobody updated to match). The fix
// (_loadPlanDocs in lib/task-executor/index.js) falls back to loadWorkBreakdown(wbsDir) +
// an in-process renderMarkdown/renderCsv when the legacy files are absent.
//
// This test exercises exactly that fallback's own two building blocks — wbs-assembler.js's
// loadWorkBreakdown and wb-render.js's (now-exported) computePhaseDependsOn/renderMarkdown/
// renderCsv — against a real, previously-shipped split wbs/ fixture, and confirms the
// resulting MD/CSV text is exactly what plan.createPlanSnapshot (the same parser every other
// run already depends on) expects: every task from index.json, reconciled and unmutated.

const fs = require('fs');
const path = require('path');

const { loadWorkBreakdown } = require('../../src/claude/scripts/wbs-assembler');
const { computePhaseDependsOn, renderMarkdown, renderCsv } = require('../../src/claude/scripts/wb-render');
const plan = require('../../lib/task-executor/plan');

const WBS_DIR = path.resolve(__dirname, '..', 'fixtures', 'ftr-020-wbs');

describe('split wbs/ directory -> in-memory MD/CSV -> plan.createPlanSnapshot (execute()\'s fallback path)', () => {
  test('wb-render.js exports renderMarkdown/renderCsv/computePhaseDependsOn for in-process use (not CLI-only)', () => {
    expect(typeof renderMarkdown).toBe('function');
    expect(typeof renderCsv).toBe('function');
    expect(typeof computePhaseDependsOn).toBe('function');
  });

  test('a real split wbs/ directory with no legacy .md/.csv produces a valid plan snapshot with every task from index.json', () => {
    const index = JSON.parse(fs.readFileSync(path.join(WBS_DIR, 'index.json'), 'utf8'));
    expect(index.schemaVersion).toBe(3);
    const expectedTaskIds = Object.keys(index.tasks).sort();

    const wb = loadWorkBreakdown(WBS_DIR);
    expect(wb.schemaVersion).toBe(2); // assembled in-memory contract version, per loadWorkBreakdown's own comment

    const phaseDepsMap = computePhaseDependsOn(wb);
    const md = renderMarkdown(wb, 'FTR-020', phaseDepsMap);
    const csv = renderCsv(wb, 'FTR-020', phaseDepsMap);

    const snapshot = plan.createPlanSnapshot(md, csv);
    expect(snapshot.tasks.map(t => t.id).sort()).toEqual(expectedTaskIds);
    expect(snapshot.phases).toHaveLength(index.phases.length);
  });
});
