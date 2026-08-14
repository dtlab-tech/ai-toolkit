'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const VALIDATE = path.resolve(__dirname, '../src/claude/scripts/wb-validate.js');
const FIXTURES = path.resolve(__dirname, 'fixtures');

function runValidator(wbPath) {
  const result = spawnSync('node', [VALIDATE, wbPath], { encoding: 'utf8' });
  let report = null;
  try { report = JSON.parse(result.stdout); } catch (_) {}
  return { exitCode: result.status, report, stderr: result.stderr };
}

// ── Shared temp-file lifecycle ────────────────────────────────────────────────

let tmpFile;

beforeEach(() => { tmpFile = path.join(os.tmpdir(), `wb-t17-${Date.now()}.json`); });
afterEach(() => { try { fs.unlinkSync(tmpFile); } catch (_) {} });

function writeFixture(obj) { fs.writeFileSync(tmpFile, JSON.stringify(obj, null, 2)); return tmpFile; }

// ── Domain builders ───────────────────────────────────────────────────────────

function makeTask(id, dependsOn = []) {
  return {
    id,
    title: `Task ${id}`,
    outcome: 'Done',
    domain: 'BE',
    agentType: 'developer-backend',
    dependsOn,
    acceptanceCriteria: [],
    verification: { commands: ['node --version'] },
    estimate: { agentMinutes: 10, tokens: 5000 },
    outputCount: 1,
    groupingRationale: 'Single',
    commit: { subject: `feat: ${id}` },
  };
}

function makePhase(id, tasks) {
  return { id, type: 'user-story', title: `Phase ${id}`, commit: `feat(${id}): done`, tasks };
}

function makeWB(phases) { return { schemaVersion: 2, phases }; }

// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — check 11 — task cycle detection (DFS gray/black coloring)', () => {

  // ── Test A: existing cycle fixture ───────────────────────────────────────────

  test('exits 1 and reports at least one task_cycle_detected error when the existing wb-invalid-cycle.json fixture is validated', () => {
    // Arrange: use the pre-existing cycle fixture (INFRA-TASK-INFRA-01 ↔ INFRA-TASK-INFRA-02)
    const wbPath = path.join(FIXTURES, 'wb-invalid-cycle.json');

    // Act
    const { exitCode, report } = runValidator(wbPath);

    // Assert
    expect(exitCode).toBe(1);
    expect(report.errors.some(e => e.category === 'task_cycle_detected')).toBe(true);
  });

  // ── Test B: two-node mutual cycle A→B, B→A ───────────────────────────────────

  test('exits 1, reports task_cycle_detected, and details.cycleMembers contains both task IDs for a two-node cycle (A→B, B→A)', () => {
    // Arrange
    const wb = makeWB([makePhase('US-01', [
      makeTask('US-01-TASK-BE-01', ['US-01-TASK-BE-02']),
      makeTask('US-01-TASK-BE-02', ['US-01-TASK-BE-01']),
    ])]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(1);
    const cycleErr = report.errors.find(e => e.category === 'task_cycle_detected');
    expect(cycleErr).toBeDefined();
    expect(Array.isArray(cycleErr.details.cycleMembers)).toBe(true);
    expect(cycleErr.details.cycleMembers).toContain('US-01-TASK-BE-01');
    expect(cycleErr.details.cycleMembers).toContain('US-01-TASK-BE-02');
  });

  // ── Test C: three-node cycle A→B→C→A ────────────────────────────────────────

  test('exits 1, reports task_cycle_detected, and details.cycleMembers has at least 3 elements for a three-node cycle (A→B→C→A)', () => {
    // Arrange
    const wb = makeWB([makePhase('US-01', [
      makeTask('US-01-TASK-BE-01', ['US-01-TASK-BE-02']),
      makeTask('US-01-TASK-BE-02', ['US-01-TASK-BE-03']),
      makeTask('US-01-TASK-BE-03', ['US-01-TASK-BE-01']),
    ])]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(1);
    const cycleErr = report.errors.find(e => e.category === 'task_cycle_detected');
    expect(cycleErr).toBeDefined();
    expect(Array.isArray(cycleErr.details.cycleMembers)).toBe(true);
    expect(cycleErr.details.cycleMembers.length).toBeGreaterThanOrEqual(3);
  });

  // ── Test D: acyclic diamond graph — no cycles ────────────────────────────────

  test('exits 0, reports no task_cycle_detected errors, and report.dependencies.taskCycles is an empty array for an acyclic diamond graph (A→B, A→C, B→D, C→D)', () => {
    // Arrange
    const wb = makeWB([makePhase('US-01', [
      makeTask('US-01-TASK-BE-01', []),
      makeTask('US-01-TASK-BE-02', ['US-01-TASK-BE-01']),
      makeTask('US-01-TASK-BE-03', ['US-01-TASK-BE-01']),
      makeTask('US-01-TASK-BE-04', ['US-01-TASK-BE-02', 'US-01-TASK-BE-03']),
    ])]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(0);
    expect(report.errors.filter(e => e.category === 'task_cycle_detected')).toHaveLength(0);
    expect(report.dependencies.taskCycles).toEqual([]);
  });

  // ── Test E: cross-phase cycle ────────────────────────────────────────────────

  test('exits 1 and reports task_cycle_detected when a mutual dependency cycle spans two phases (US-01-A→US-02-B, US-02-B→US-01-A)', () => {
    // Arrange: task in US-01 depends on task in US-02, which depends back on US-01 task
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', ['US-02-TASK-BE-01'])]),
      makePhase('US-02', [makeTask('US-02-TASK-BE-01', ['US-01-TASK-BE-01'])]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(1);
    expect(report.errors.some(e => e.category === 'task_cycle_detected')).toBe(true);
  });

  // ── Test F: taskCycles always present in report ──────────────────────────────

  test('report.dependencies.taskCycles is always an array even when there are no cycles (valid fixture exits 0)', () => {
    // Arrange: use the pre-existing valid fixture which has no dependency cycles
    const wbPath = path.join(FIXTURES, 'wb-valid.json');

    // Act
    const { exitCode, report } = runValidator(wbPath);

    // Assert
    expect(exitCode).toBe(0);
    expect(Array.isArray(report.dependencies.taskCycles)).toBe(true);
  });
});
