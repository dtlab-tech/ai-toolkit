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

describe('renderMarkdown() "Generated" line — planDigest determinism (regression)', () => {
  // Regression test for a real bug (reported against Fincantieri.ISDM.JobScheduler, FTR-012):
  // renderMarkdown() embedded a live new Date().toISOString() "Generated" line on every call.
  // The legacy .md/.csv path rendered once to disk and read the same static bytes back every
  // time (deterministic planDigest); _loadPlanDocs()'s split-wbs/ fallback re-renders in memory
  // on EVERY execute()/replan() call, so two calls against the exact same unchanged plan
  // produced DIFFERENT bytes -> different planDigest -> a real replan() then
  // execute() --from-replan-run-id sequence spuriously failed REPLAN_PLAN_DIGEST_MISMATCH.
  test('two renders of the identical wb/prefix/phaseDepsMap with NO generatedAt (CLI/default use) are allowed to differ', () => {
    const wb = loadWorkBreakdown(WBS_DIR);
    const phaseDepsMap = computePhaseDependsOn(wb);
    // Not asserting they always differ (a same-millisecond race is theoretically possible) —
    // only that the default path is still live wall-clock time, i.e. unchanged CLI behavior.
    const a = renderMarkdown(wb, 'FTR-020', phaseDepsMap);
    expect(a).toMatch(/\| Generated \| \d{4}-\d{2}-\d{2}T/);
  });

  test('two renders with an explicit generatedAt are byte-identical, and planDigest agrees across calls', () => {
    const wb = loadWorkBreakdown(WBS_DIR);
    const phaseDepsMap = computePhaseDependsOn(wb);
    const csv = renderCsv(wb, 'FTR-020', phaseDepsMap);
    const generatedAt = 'FIXED-FOR-TEST';

    const mdCallOne = renderMarkdown(wb, 'FTR-020', phaseDepsMap, generatedAt);
    const mdCallTwo = renderMarkdown(wb, 'FTR-020', phaseDepsMap, generatedAt);
    expect(mdCallOne).toBe(mdCallTwo);

    const digestOne = plan.createPlanSnapshot(mdCallOne, csv).planDigest;
    const digestTwo = plan.createPlanSnapshot(mdCallTwo, csv).planDigest;
    expect(digestOne).toBe(digestTwo);
  });

  test('a genuinely different plan (changed wb content) still changes the digest even with the same generatedAt', () => {
    const wb = loadWorkBreakdown(WBS_DIR);
    const phaseDepsMap = computePhaseDependsOn(wb);
    const csv = renderCsv(wb, 'FTR-020', phaseDepsMap);
    const generatedAt = 'FIXED-FOR-TEST';

    const original = plan.createPlanSnapshot(renderMarkdown(wb, 'FTR-020', phaseDepsMap, generatedAt), csv).planDigest;

    const mutatedWb = JSON.parse(JSON.stringify(wb));
    mutatedWb.phases[0].tasks[0].title = mutatedWb.phases[0].tasks[0].title + ' (edited)';
    const mutated = plan.createPlanSnapshot(renderMarkdown(mutatedWb, 'FTR-020', phaseDepsMap, generatedAt), csv).planDigest;

    expect(mutated).not.toBe(original);
  });
});
