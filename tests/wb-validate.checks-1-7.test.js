'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const VALIDATE = path.resolve(__dirname, '../src/claude/scripts/wb-validate.js');
const FIXTURES = path.resolve(__dirname, 'fixtures');

/**
 * Run wb-validate.js as a subprocess and return exit code, stdout, stderr,
 * and the parsed JSON report (or null if stdout is not valid JSON).
 */
function runValidator(wbPath, reqPath) {
  const args = [VALIDATE, wbPath];
  if (reqPath) args.push(reqPath);
  const result = spawnSync('node', args, { encoding: 'utf8' });
  let report = null;
  try { report = JSON.parse(result.stdout); } catch (_) {}
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr, report };
}

/**
 * Minimal valid work breakdown JSON that passes all checks 1–23 when no
 * requirements file is provided.  Used as a base for inline fixtures.
 */
const MINIMAL_VALID_WB = {
  schemaVersion: 2,
  phases: [
    {
      id: 'US-01',
      type: 'user-story',
      title: 'Test phase',
      commit: 'feat(US-01): test',
      tasks: [
        {
          id: 'US-01-TASK-BE-01',
          title: 'A task',
          outcome: 'Something is done',
          domain: 'BE',
          agentType: 'developer-backend',
          dependsOn: [],
          acceptanceCriteria: [],
          verification: { commands: ['node --version'] },
          estimate: { agentMinutes: 10, tokens: 5000 },
          outputCount: 1,
          groupingRationale: 'Single responsibility',
          commit: { subject: 'feat(US-01): implement task' },
        },
      ],
    },
  ],
};

// ── helper — write a WB object to a temp file and return the path ─────────────

function writeTmp(tmpFile, wb) {
  fs.writeFileSync(tmpFile, JSON.stringify(wb));
}

// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — checks 1–7', () => {

  // ── Check 1: missing file argument ──────────────────────────────────────────

  describe('check 1 — missing file argument', () => {
    test('exits with code 2 and reports "missing required argument" to stderr when no path argument is given', () => {
      // Arrange: invoke the validator with no arguments at all
      // Act
      const result = spawnSync('node', [VALIDATE], { encoding: 'utf8' });
      // Assert
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('missing required argument');
    });
  });

  // ── Check 2: schema version ──────────────────────────────────────────────────

  describe('check 2 — schema version', () => {
    let tmpFile;

    beforeEach(() => {
      tmpFile = path.join(os.tmpdir(), `wb-test-${Date.now()}.json`);
    });

    afterEach(() => {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    });

    test('exits 0 and report.valid is true when schemaVersion is exactly 2', () => {
      // Arrange
      writeTmp(tmpFile, MINIMAL_VALID_WB);
      // Act
      const { exitCode, report } = runValidator(tmpFile);
      // Assert
      expect(exitCode).toBe(0);
      expect(report.valid).toBe(true);
    });

    test('exits 1, report.valid is false, and schema_version_invalid is reported when schemaVersion is 1', () => {
      // Arrange
      writeTmp(tmpFile, { ...MINIMAL_VALID_WB, schemaVersion: 1 });
      // Act
      const { exitCode, report } = runValidator(tmpFile);
      // Assert
      expect(exitCode).toBe(1);
      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.category === 'schema_version_invalid')).toBe(true);
    });

    test('exits 1, report.valid is false, and schema_version_invalid is reported when schemaVersion is null', () => {
      // Arrange
      writeTmp(tmpFile, { ...MINIMAL_VALID_WB, schemaVersion: null });
      // Act
      const { exitCode, report } = runValidator(tmpFile);
      // Assert
      expect(exitCode).toBe(1);
      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.category === 'schema_version_invalid')).toBe(true);
    });
  });

  // ── Check 3: unique task IDs ─────────────────────────────────────────────────

  describe('check 3 — unique task IDs', () => {
    test('exits 1, report.valid is false, and unique_id_violation is reported when the same task ID appears in multiple phases', () => {
      // Arrange: fixture has INFRA-TASK-INFRA-01 in both the INFRA and US-01 phases
      const wbPath = path.join(FIXTURES, 'wb-invalid-duplicate-id.json');
      // Act
      const { exitCode, report } = runValidator(wbPath);
      // Assert
      expect(exitCode).toBe(1);
      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.category === 'unique_id_violation')).toBe(true);
    });

    test('exits 0, report.valid is true, and no unique_id_violation errors are present for a valid work breakdown', () => {
      // Arrange
      const wbPath = path.join(FIXTURES, 'wb-valid.json');
      // Act
      const { exitCode, report } = runValidator(wbPath);
      // Assert
      expect(exitCode).toBe(0);
      expect(report.valid).toBe(true);
      expect(report.errors.filter(e => e.category === 'unique_id_violation')).toHaveLength(0);
    });
  });

  // ── Check 4: required fields ─────────────────────────────────────────────────

  describe('check 4 — required fields', () => {
    test('exits 1, report.valid is false, and missing_field with field "outcome" is reported when outcome is absent from a task', () => {
      // Arrange: fixture has INFRA-TASK-INFRA-01 with the "outcome" field omitted
      const wbPath = path.join(FIXTURES, 'wb-invalid-missing-field.json');
      // Act
      const { exitCode, report } = runValidator(wbPath);
      // Assert
      expect(exitCode).toBe(1);
      expect(report.valid).toBe(false);
      const outcomeError = report.errors.find(
        e => e.category === 'missing_field' && e.field === 'outcome',
      );
      expect(outcomeError).toBeDefined();
    });

    test('exits 0, report.valid is true, and no missing_field errors are present for a valid work breakdown', () => {
      // Arrange
      const wbPath = path.join(FIXTURES, 'wb-valid.json');
      // Act
      const { exitCode, report } = runValidator(wbPath);
      // Assert
      expect(exitCode).toBe(0);
      expect(report.valid).toBe(true);
      expect(report.errors.filter(e => e.category === 'missing_field')).toHaveLength(0);
    });

    // W3 regression guard — groupingRationale must be enforced by check 4
    // Before fix: groupingRationale was in REQUIRED_TASK_FIELDS but absent from
    // topLevelFields, so a task without the field passed check 4 with exit 0.

    test('W3: exits 1 and missing_field with field "groupingRationale" is reported when groupingRationale is absent from a task', () => {
      const { groupingRationale: _drop, ...taskWithoutRationale } = MINIMAL_VALID_WB.phases[0].tasks[0];
      const wb = {
        ...MINIMAL_VALID_WB,
        phases: [{ ...MINIMAL_VALID_WB.phases[0], tasks: [taskWithoutRationale] }],
      };
      const tmpPath = path.join(os.tmpdir(), `wb-w3-${Date.now()}.json`);
      writeTmp(tmpPath, wb);
      try {
        const { exitCode, report } = runValidator(tmpPath);
        expect(exitCode).toBe(1);
        expect(report.valid).toBe(false);
        const err = report.errors.find(e => e.category === 'missing_field' && e.field === 'groupingRationale');
        expect(err).toBeDefined();
      } finally {
        try { fs.unlinkSync(tmpPath); } catch (_) {}
      }
    });

    test('W3: exits 0 and no missing_field for groupingRationale when the field is present and non-empty', () => {
      // MINIMAL_VALID_WB already includes groupingRationale — use it directly
      const wbPath = path.join(FIXTURES, 'wb-valid.json');
      const { exitCode, report } = runValidator(wbPath);
      expect(exitCode).toBe(0);
      expect(report.errors.filter(e => e.category === 'missing_field' && e.field === 'groupingRationale')).toHaveLength(0);
    });
  });

  // ── Check 5: task ID format ──────────────────────────────────────────────────

  describe('check 5 — task ID format', () => {
    let tmpFile;

    beforeEach(() => {
      tmpFile = path.join(os.tmpdir(), `wb-test-${Date.now()}.json`);
    });

    afterEach(() => {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    });

    test('exits 1, report.valid is false, and invalid_id_format is reported when a non-INFRA task ID does not match the expected pattern', () => {
      // Arrange: replace the task id with a string that matches no expected pattern
      const wb = {
        ...MINIMAL_VALID_WB,
        phases: [
          {
            ...MINIMAL_VALID_WB.phases[0],
            tasks: [
              { ...MINIMAL_VALID_WB.phases[0].tasks[0], id: 'BAD-FORMAT' },
            ],
          },
        ],
      };
      writeTmp(tmpFile, wb);
      // Act
      const { exitCode, report } = runValidator(tmpFile);
      // Assert
      expect(exitCode).toBe(1);
      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.category === 'invalid_id_format')).toBe(true);
    });

    test('exits 0, report.valid is true, and no invalid_id_format errors are present for a valid work breakdown', () => {
      // Arrange
      const wbPath = path.join(FIXTURES, 'wb-valid.json');
      // Act
      const { exitCode, report } = runValidator(wbPath);
      // Assert
      expect(exitCode).toBe(0);
      expect(report.valid).toBe(true);
      expect(report.errors.filter(e => e.category === 'invalid_id_format')).toHaveLength(0);
    });
  });

  // ── Check 6: domain whitelist ────────────────────────────────────────────────

  describe('check 6 — domain whitelist', () => {
    test('exits 1, report.valid is false, and invalid_domain is reported when a task has an unrecognised domain value', () => {
      // Arrange: fixture has domain "BACKEND" which is not in the VALID_DOMAINS list
      const wbPath = path.join(FIXTURES, 'wb-invalid-bad-domain.json');
      // Act
      const { exitCode, report } = runValidator(wbPath);
      // Assert
      expect(exitCode).toBe(1);
      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.category === 'invalid_domain')).toBe(true);
    });

    test('exits 0, report.valid is true, and no invalid_domain errors are present for a valid work breakdown', () => {
      // Arrange
      const wbPath = path.join(FIXTURES, 'wb-valid.json');
      // Act
      const { exitCode, report } = runValidator(wbPath);
      // Assert
      expect(exitCode).toBe(0);
      expect(report.valid).toBe(true);
      expect(report.errors.filter(e => e.category === 'invalid_domain')).toHaveLength(0);
    });
  });

  // ── Check 7: agentType whitelist ─────────────────────────────────────────────

  describe('check 7 — agentType whitelist', () => {
    let tmpFile;

    beforeEach(() => {
      tmpFile = path.join(os.tmpdir(), `wb-test-${Date.now()}.json`);
    });

    afterEach(() => {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    });

    test('exits 1, report.valid is false, and invalid_agent_type is reported when a task has an unrecognised agentType', () => {
      // Arrange: replace agentType with a value that is not in the VALID_AGENT_TYPES list
      const wb = {
        ...MINIMAL_VALID_WB,
        phases: [
          {
            ...MINIMAL_VALID_WB.phases[0],
            tasks: [
              { ...MINIMAL_VALID_WB.phases[0].tasks[0], agentType: 'unknown-agent' },
            ],
          },
        ],
      };
      writeTmp(tmpFile, wb);
      // Act
      const { exitCode, report } = runValidator(tmpFile);
      // Assert
      expect(exitCode).toBe(1);
      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.category === 'invalid_agent_type')).toBe(true);
    });

    test('exits 0, report.valid is true, and no invalid_agent_type errors are present for a valid work breakdown', () => {
      // Arrange
      const wbPath = path.join(FIXTURES, 'wb-valid.json');
      // Act
      const { exitCode, report } = runValidator(wbPath);
      // Assert
      expect(exitCode).toBe(0);
      expect(report.valid).toBe(true);
      expect(report.errors.filter(e => e.category === 'invalid_agent_type')).toHaveLength(0);
    });
  });
});
