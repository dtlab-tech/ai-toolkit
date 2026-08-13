'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const VALIDATE = path.resolve(__dirname, '../.claude/scripts/wb-validate.js');
const FIXTURES = path.resolve(__dirname, 'fixtures');

function runValidator(wbPath) {
  const result = spawnSync('node', [VALIDATE, wbPath], { encoding: 'utf8' });
  let report = null;
  try { report = JSON.parse(result.stdout); } catch (_) {}
  return { exitCode: result.status, report, stderr: result.stderr };
}

// ── Shared temp-file lifecycle ────────────────────────────────────────────────

let tmpFile;

beforeEach(() => { tmpFile = path.join(os.tmpdir(), `wb-t18-${Date.now()}.json`); });
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

function makePhase(id, tasks, type = 'user-story') {
  return { id, type, title: `Phase ${id}`, commit: `feat(${id}): done`, tasks };
}

function makeWB(phases) { return { schemaVersion: 2, phases }; }

// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — check 12 — phase dependency projection (phase_dependency_not_found)', () => {

  // ── Test A: cross-phase dep projects into phaseGraph ────────────────────────

  test('exits 0, phaseGraph[US-02] contains US-01, and phaseGraph[US-01] is empty when US-02 task depends on a US-01 task', () => {
    // Arrange: one cross-phase dependency — US-02-TASK-BE-01 depends on US-01-TASK-BE-01
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01')]),
      makePhase('US-02', [makeTask('US-02-TASK-BE-01', ['US-01-TASK-BE-01'])]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(0);
    expect(report.dependencies.phaseGraph['US-02']).toContain('US-01');
    expect(report.dependencies.phaseGraph['US-01']).toEqual([]);
  });

  // ── Test B: intra-phase dep does NOT appear in phaseGraph ───────────────────

  test('exits 0 and phaseGraph[US-01] is empty when a task depends on another task within the same phase (intra-phase dep is removed)', () => {
    // Arrange: both tasks are in US-01; the dep is intra-phase and must not project
    const wb = makeWB([
      makePhase('US-01', [
        makeTask('US-01-TASK-BE-01'),
        makeTask('US-01-TASK-BE-02', ['US-01-TASK-BE-01']),
      ]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(0);
    expect(report.dependencies.phaseGraph['US-01']).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — check 13 — phase cycle detection (phase_cycle_detected)', () => {

  // ── Test A: two-phase mutual cycle ───────────────────────────────────────────

  test('exits 1, reports phase_cycle_detected, and details.cycleMembers contains both phase IDs for a two-phase mutual cycle (US-01 ↔ US-02)', () => {
    // Arrange: US-01 task depends on US-02 task AND US-02 task depends on US-01 task
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', ['US-02-TASK-BE-01'])]),
      makePhase('US-02', [makeTask('US-02-TASK-BE-01', ['US-01-TASK-BE-01'])]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(1);
    const cycleErr = report.errors.find(e => e.category === 'phase_cycle_detected');
    expect(cycleErr).toBeDefined();
    expect(Array.isArray(cycleErr.details.cycleMembers)).toBe(true);
    expect(cycleErr.details.cycleMembers).toContain('US-01');
    expect(cycleErr.details.cycleMembers).toContain('US-02');
  });

  // ── Test B: acyclic WB — phaseCycles is an empty array ──────────────────────

  test('exits 0 and report.dependencies.phaseCycles is an empty array when there are no phase cycles', () => {
    // Arrange: linear chain US-01 → US-02 — no cycle
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01')]),
      makePhase('US-02', [makeTask('US-02-TASK-BE-01', ['US-01-TASK-BE-01'])]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(0);
    expect(report.dependencies.phaseCycles).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — check 14 — phase schedulability / buildWaves (phase_unschedulable)', () => {

  // ── Test A: linear chain → three sequential waves ────────────────────────────

  test('exits 0 and phaseWaves is [[US-01], [US-02], [US-03]] for a linear chain US-01 → US-02 → US-03', () => {
    // Arrange: each phase depends on the previous one's task
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01')]),
      makePhase('US-02', [makeTask('US-02-TASK-BE-01', ['US-01-TASK-BE-01'])]),
      makePhase('US-03', [makeTask('US-03-TASK-BE-01', ['US-02-TASK-BE-01'])]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(0);
    expect(report.dependencies.phaseWaves).toHaveLength(3);
    expect(report.dependencies.phaseWaves[0]).toEqual(['US-01']);
    expect(report.dependencies.phaseWaves[1]).toEqual(['US-02']);
    expect(report.dependencies.phaseWaves[2]).toEqual(['US-03']);
    expect(report.dependencies.phaseUnschedulable).toEqual([]);
  });

  // ── Test B: parallel phases → wave 0 has US-01 + US-02, wave 1 has US-03 ────

  test('exits 0, wave 0 contains both US-01 and US-02, and wave 1 is [US-03] when US-01 and US-02 are independent and US-03 depends on both', () => {
    // Arrange: US-01 and US-02 have no cross-phase deps; US-03 depends on both
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01')]),
      makePhase('US-02', [makeTask('US-02-TASK-BE-01')]),
      makePhase('US-03', [makeTask('US-03-TASK-BE-01', ['US-01-TASK-BE-01', 'US-02-TASK-BE-01'])]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(0);
    expect(report.dependencies.phaseWaves).toHaveLength(2);
    expect(report.dependencies.phaseWaves[0]).toContain('US-01');
    expect(report.dependencies.phaseWaves[0]).toContain('US-02');
    expect(report.dependencies.phaseWaves[1]).toEqual(['US-03']);
  });

  // ── Test C: phase cycle creates deadlock → phase_unschedulable ───────────────

  test('exits 1, reports phase_unschedulable error, and phaseUnschedulable contains at least one phase ID when a mutual cycle creates a scheduling deadlock', () => {
    // Arrange: same two-phase mutual cycle as check 13 test A — neither phase can be scheduled
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', ['US-02-TASK-BE-01'])]),
      makePhase('US-02', [makeTask('US-02-TASK-BE-01', ['US-01-TASK-BE-01'])]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(1);
    expect(report.dependencies.phaseUnschedulable.length).toBeGreaterThanOrEqual(1);
    expect(report.errors.some(e => e.category === 'phase_unschedulable')).toBe(true);
  });

  // ── Test D: phaseWaves is always present in the report ───────────────────────

  test('report.dependencies.phaseWaves is an array even when the WB is valid (wb-valid.json exits 0)', () => {
    // Arrange: use the pre-existing valid fixture — no cycles, fully schedulable
    const wbPath = path.join(FIXTURES, 'wb-valid.json');

    // Act
    const { exitCode, report } = runValidator(wbPath);

    // Assert
    expect(exitCode).toBe(0);
    expect(Array.isArray(report.dependencies.phaseWaves)).toBe(true);
  });
});
