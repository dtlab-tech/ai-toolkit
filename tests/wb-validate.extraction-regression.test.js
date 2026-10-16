'use strict';

// Regression guard for the FTR-020 OQ-02 extraction: checks 3, 5-14, 19-21 were relocated
// from inline code in wb-validate.js into src/claude/scripts/wb-graph-checks.js, reusing
// the same algorithms verbatim. This is a behavior-preserving extraction — wb-validate.js's
// JSON report and exit code must be unchanged for every existing fixture. Every existing
// tests/wb-validate.checks-*.test.js file already asserts this per-category; this file adds
// a snapshot of the FULL report for every fixture, so any FUTURE regression in the shared
// wb-graph-checks.js module (used by both wb-validate.js and pm-phase2.js's skeleton
// pre-check) is caught here even if no per-category assertion happens to cover it.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VALIDATE = path.resolve(__dirname, '../src/claude/scripts/wb-validate.js');
const FIXTURES = path.resolve(__dirname, 'fixtures');

function runValidator(wbPath) {
  const result = spawnSync('node', [VALIDATE, wbPath], { encoding: 'utf8' });
  let report = null;
  try { report = JSON.parse(result.stdout); } catch (_) {}
  return { exitCode: result.status, report, stderr: result.stderr };
}

const FIXTURE_FILES = fs.readdirSync(FIXTURES).filter(f => f.startsWith('wb-') && f.endsWith('.json'));

describe('wb-validate.js extraction regression — full report snapshot per fixture', () => {
  test.each(FIXTURE_FILES)('%s: exit code and report are stable', (fixtureFile) => {
    const { exitCode, report } = runValidator(path.join(FIXTURES, fixtureFile));
    expect(report).not.toBeNull();
    expect({ exitCode, report }).toMatchSnapshot(fixtureFile);
  });
});

describe('wb-validate.js extraction regression — spot checks against known fixtures', () => {
  test('wb-valid.json: exits 0, valid, zero errors', () => {
    const { exitCode, report } = runValidator(path.join(FIXTURES, 'wb-valid.json'));
    expect(exitCode).toBe(0);
    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  test('wb-invalid-duplicate-id.json: exits 1 with unique_id_violation', () => {
    const { exitCode, report } = runValidator(path.join(FIXTURES, 'wb-invalid-duplicate-id.json'));
    expect(exitCode).toBe(1);
    expect(report.errors.some(e => e.category === 'unique_id_violation')).toBe(true);
  });

  test('wb-invalid-bad-domain.json: exits 1 with invalid_domain', () => {
    const { exitCode, report } = runValidator(path.join(FIXTURES, 'wb-invalid-bad-domain.json'));
    expect(exitCode).toBe(1);
    expect(report.errors.some(e => e.category === 'invalid_domain')).toBe(true);
  });

  test('wb-invalid-cycle.json: exits 1 with task_cycle_detected', () => {
    const { exitCode, report } = runValidator(path.join(FIXTURES, 'wb-invalid-cycle.json'));
    expect(exitCode).toBe(1);
    expect(report.errors.some(e => e.category === 'task_cycle_detected')).toBe(true);
  });

  test('wb-invalid-missing-field.json: exits 1 with missing_field', () => {
    const { exitCode, report } = runValidator(path.join(FIXTURES, 'wb-invalid-missing-field.json'));
    expect(exitCode).toBe(1);
    expect(report.errors.some(e => e.category === 'missing_field')).toBe(true);
  });
});
