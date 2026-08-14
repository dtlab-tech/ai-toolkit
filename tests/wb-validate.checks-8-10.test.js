'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const VALIDATE = path.resolve(__dirname, '../src/claude/scripts/wb-validate.js');

/**
 * Run wb-validate.js as a subprocess and return exit code, parsed JSON report,
 * and stderr.  No requirements path is needed for checks 8–10.
 */
function runValidator(wbPath) {
  const result = spawnSync('node', [VALIDATE, wbPath], { encoding: 'utf8' });
  let report = null;
  try { report = JSON.parse(result.stdout); } catch (_) {}
  return { exitCode: result.status, report, stderr: result.stderr };
}

// ── Shared temp-file lifecycle ────────────────────────────────────────────────

let tmpFile;

beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `wb-t16-${Date.now()}.json`);
});

afterEach(() => {
  try { fs.unlinkSync(tmpFile); } catch (_) {}
});

function writeFixture(obj) {
  fs.writeFileSync(tmpFile, JSON.stringify(obj, null, 2));
  return tmpFile;
}

// ── Domain builders ───────────────────────────────────────────────────────────

function makeTask(id, dependsOn = []) {
  return {
    id,
    title: `Task ${id}`,
    outcome: 'Something done',
    domain: 'BE',
    agentType: 'developer-backend',
    dependsOn,
    acceptanceCriteria: [],
    verification: { commands: ['node --version'] },
    estimate: { agentMinutes: 10, tokens: 5000 },
    outputCount: 1,
    groupingRationale: 'Single responsibility',
    commit: { subject: `feat: ${id}` },
  };
}

function makePhase(id, tasks, type = 'user-story') {
  return { id, type, title: `Phase ${id}`, commit: `feat(${id}): done`, tasks };
}

function makeWB(phases) {
  return { schemaVersion: 2, phases };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — checks 8–10', () => {

  // ── Check 8: dependency reference existence ────────────────────────────────

  describe('check 8 — dependency reference existence', () => {

    test('exits 1 and reports dependency_not_found for the referencing task when dependsOn contains a non-existent task ID', () => {
      // Arrange: task depends on US-01-TASK-BE-99 which is not declared anywhere
      const wb = makeWB([
        makePhase('US-01', [
          makeTask('US-01-TASK-BE-01', ['US-01-TASK-BE-99']),
        ]),
      ]);
      writeFixture(wb);

      // Act
      const { exitCode, report } = runValidator(tmpFile);

      // Assert
      expect(exitCode).toBe(1);
      expect(report.valid).toBe(false);
      const err = report.errors.find(e => e.category === 'dependency_not_found');
      expect(err).toBeDefined();
      expect(err.taskId).toBe('US-01-TASK-BE-01');
    });

    test('exits 0 and reports no dependency_not_found errors when all dependsOn IDs resolve to declared tasks', () => {
      // Arrange: two tasks in the same phase; second depends on first
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
      expect(report.valid).toBe(true);
      expect(report.errors.filter(e => e.category === 'dependency_not_found')).toHaveLength(0);
    });

    test('exits 0 and reports no dependency_not_found errors when a US task depends on an INFRA task from a preceding phase', () => {
      // Arrange: INFRA phase declared first; US-01 task resolves its dep cross-phase
      const wb = makeWB([
        makePhase('INFRA', [makeTask('INFRA-TASK-BE-01')], 'infra'),
        makePhase('US-01', [makeTask('US-01-TASK-BE-01', ['INFRA-TASK-BE-01'])]),
      ]);
      writeFixture(wb);

      // Act
      const { exitCode, report } = runValidator(tmpFile);

      // Assert
      expect(exitCode).toBe(0);
      expect(report.valid).toBe(true);
      expect(report.errors.filter(e => e.category === 'dependency_not_found')).toHaveLength(0);
    });
  });

  // ── Check 9: self-dependency ───────────────────────────────────────────────

  describe('check 9 — self-dependency', () => {

    test('exits 1 and reports self_dependency for the task that lists its own ID in dependsOn', () => {
      // Arrange: task references itself as a dependency
      const wb = makeWB([
        makePhase('US-01', [
          makeTask('US-01-TASK-BE-01', ['US-01-TASK-BE-01']),
        ]),
      ]);
      writeFixture(wb);

      // Act
      const { exitCode, report } = runValidator(tmpFile);

      // Assert
      expect(exitCode).toBe(1);
      expect(report.valid).toBe(false);
      const err = report.errors.find(e => e.category === 'self_dependency');
      expect(err).toBeDefined();
      expect(err.taskId).toBe('US-01-TASK-BE-01');
    });

    test('exits 0 and reports no self_dependency errors when no task lists its own ID in dependsOn', () => {
      // Arrange: simple valid WB with no self-references
      const wb = makeWB([
        makePhase('US-01', [makeTask('US-01-TASK-BE-01')]),
      ]);
      writeFixture(wb);

      // Act
      const { exitCode, report } = runValidator(tmpFile);

      // Assert
      expect(exitCode).toBe(0);
      expect(report.valid).toBe(true);
      expect(report.errors.filter(e => e.category === 'self_dependency')).toHaveLength(0);
    });
  });

  // ── Check 10: phase ID / task ID prefix consistency ────────────────────────

  describe('check 10 — phase ID / task ID prefix consistency', () => {

    test('exits 1 and reports phase_id_mismatch when an INFRA-prefixed task ID appears in a non-INFRA phase', () => {
      // Arrange: task ID starts with INFRA-TASK- but is placed in US-01
      const wb = makeWB([
        makePhase('US-01', [
          makeTask('INFRA-TASK-BE-01'),
        ]),
      ]);
      writeFixture(wb);

      // Act
      const { exitCode, report } = runValidator(tmpFile);

      // Assert
      expect(exitCode).toBe(1);
      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.category === 'phase_id_mismatch')).toBe(true);
    });

    test('exits 1 and reports phase_id_mismatch when a task ID carries a US-prefix that does not match its containing phase', () => {
      // Arrange: task prefixed US-02 but placed in phase US-01
      const wb = makeWB([
        makePhase('US-01', [
          makeTask('US-02-TASK-BE-01'),
        ]),
      ]);
      writeFixture(wb);

      // Act
      const { exitCode, report } = runValidator(tmpFile);

      // Assert
      expect(exitCode).toBe(1);
      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.category === 'phase_id_mismatch')).toBe(true);
    });

    test('exits 0 and reports no phase_id_mismatch errors when a US task ID prefix exactly matches its phase ID', () => {
      // Arrange: prefix US-01 matches phase US-01
      const wb = makeWB([
        makePhase('US-01', [makeTask('US-01-TASK-BE-01')]),
      ]);
      writeFixture(wb);

      // Act
      const { exitCode, report } = runValidator(tmpFile);

      // Assert
      expect(exitCode).toBe(0);
      expect(report.valid).toBe(true);
      expect(report.errors.filter(e => e.category === 'phase_id_mismatch')).toHaveLength(0);
    });

    test('exits 0 and reports no phase_id_mismatch errors when an INFRA-prefixed task is placed in the INFRA phase', () => {
      // Arrange: INFRA-TASK-BE-01 correctly placed in the INFRA phase
      const wb = makeWB([
        makePhase('INFRA', [makeTask('INFRA-TASK-BE-01')], 'infra'),
      ]);
      writeFixture(wb);

      // Act
      const { exitCode, report } = runValidator(tmpFile);

      // Assert
      expect(exitCode).toBe(0);
      expect(report.valid).toBe(true);
      expect(report.errors.filter(e => e.category === 'phase_id_mismatch')).toHaveLength(0);
    });
  });
});
