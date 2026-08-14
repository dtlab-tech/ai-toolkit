'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const VALIDATE = path.resolve(__dirname, '../src/claude/scripts/wb-validate.js');

function runValidator(wbPath) {
  const result = spawnSync('node', [VALIDATE, wbPath], { encoding: 'utf8' });
  let report = null;
  try { report = JSON.parse(result.stdout); } catch (_) {}
  return { exitCode: result.status, report, stderr: result.stderr };
}

// ── Shared temp-file lifecycle ────────────────────────────────────────────────

let tmpFile;

beforeEach(() => { tmpFile = path.join(os.tmpdir(), `wb-t19-${Date.now()}.json`); });
afterEach(() => { try { fs.unlinkSync(tmpFile); } catch (_) {} });

function writeFixture(obj) { fs.writeFileSync(tmpFile, JSON.stringify(obj, null, 2)); return tmpFile; }

// ── Domain builders ───────────────────────────────────────────────────────────

function makeTask(id, overrides = {}) {
  return {
    id,
    title: `Task ${id}`,
    outcome: 'Done',
    domain: 'BE',
    agentType: 'developer-backend',
    dependsOn: [],
    acceptanceCriteria: [],
    verification: { commands: ['node --version'] },
    estimate: { agentMinutes: 10, tokens: 5000 },
    outputCount: 1,
    groupingRationale: 'Single',
    commit: { subject: `feat: ${id}` },
    ...overrides,
  };
}

function makePhase(id, tasks) {
  return { id, type: 'user-story', title: `Phase ${id}`, commit: `feat(${id}): done`, tasks };
}

function makeWB(phases) { return { schemaVersion: 2, phases }; }

// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — check 15 — duration policy (target / above_target / warning / split_required)', () => {

  // ── Test A: target band (≤15 min) ────────────────────────────────────────────

  test('exits 0, no errors or warnings, and durationBands.target >= 1 when agentMinutes is 10 (≤15, target band)', () => {
    // Arrange
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', { estimate: { agentMinutes: 10, tokens: 5000 } })]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(0);
    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
    expect(report.durationBands.target).toBeGreaterThanOrEqual(1);
  });

  // ── Test B: above_target band (16–20 min) ────────────────────────────────────

  test('exits 0, no errors or warnings, and durationBands.above_target >= 1 when agentMinutes is 18 (16–20, above_target band)', () => {
    // Arrange
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', { estimate: { agentMinutes: 18, tokens: 5000 } })]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(0);
    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
    expect(report.durationBands.above_target).toBeGreaterThanOrEqual(1);
  });

  // ── Test C: warning band (21–30 min) — non-blocking ─────────────────────────

  test('exits 0, report.warnings contains a duration_warning entry, and durationBands.warning >= 1 when agentMinutes is 25 (21–30, warning band)', () => {
    // Arrange
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', { estimate: { agentMinutes: 25, tokens: 5000 } })]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(0);
    const warningEntry = report.warnings.find(w => w.category === 'duration_warning');
    expect(warningEntry).toBeDefined();
    expect(report.durationBands.warning).toBeGreaterThanOrEqual(1);
  });

  // ── Test D: split_required band (>30 min) — blocking error ───────────────────

  test('exits 1, report.errors contains a split_required entry, and durationBands.split_required >= 1 when agentMinutes is 35 (>30, split_required band)', () => {
    // Arrange
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', { estimate: { agentMinutes: 35, tokens: 5000 } })]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(1);
    const errorEntry = report.errors.find(e => e.category === 'split_required');
    expect(errorEntry).toBeDefined();
    expect(report.durationBands.split_required).toBeGreaterThanOrEqual(1);
  });

  // ── Test E: all four bands present in one WB ─────────────────────────────────

  test('exits 1 and durationBands has all four keys with correct counts when tasks span all four duration bands (10 / 18 / 25 / 35 min)', () => {
    // Arrange: four tasks — one in each duration band
    const wb = makeWB([
      makePhase('US-01', [
        makeTask('US-01-TASK-BE-01', { estimate: { agentMinutes: 10, tokens: 5000 } }),
        makeTask('US-01-TASK-BE-02', { estimate: { agentMinutes: 18, tokens: 5000 } }),
        makeTask('US-01-TASK-BE-03', { estimate: { agentMinutes: 25, tokens: 5000 } }),
        makeTask('US-01-TASK-BE-04', { estimate: { agentMinutes: 35, tokens: 5000 } }),
      ]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert: split_required causes a blocking error → exit 1
    expect(exitCode).toBe(1);
    expect(report.durationBands.target).toBe(1);
    expect(report.durationBands.above_target).toBe(1);
    expect(report.durationBands.warning).toBe(1);
    expect(report.durationBands.split_required).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — check 16 — empty verification commands (empty_verification_commands)', () => {

  // ── Test A: empty commands array → blocking error ────────────────────────────

  test('exits 1 and report.errors contains empty_verification_commands when verification.commands is an empty array', () => {
    // Arrange
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', { verification: { commands: [] } })]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(1);
    const errorEntry = report.errors.find(e => e.category === 'empty_verification_commands');
    expect(errorEntry).toBeDefined();
  });

  // ── Test B: non-empty commands array → no error ──────────────────────────────

  test('exits 0 and no empty_verification_commands error is reported when verification.commands has at least one entry', () => {
    // Arrange
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', { verification: { commands: ['node --version'] } })]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(0);
    expect(report.errors.find(e => e.category === 'empty_verification_commands')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — check 17 — empty commit subject (empty_commit_subject)', () => {

  // ── Test A: empty string subject → blocking error ────────────────────────────

  test('exits 1 and report.errors contains empty_commit_subject when commit.subject is an empty string', () => {
    // Arrange
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', { commit: { subject: '' } })]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(1);
    const errorEntry = report.errors.find(e => e.category === 'empty_commit_subject');
    expect(errorEntry).toBeDefined();
  });

  // ── Test B: whitespace-only subject → blocking error ─────────────────────────

  test('exits 1 and report.errors contains empty_commit_subject when commit.subject is whitespace only', () => {
    // Arrange
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', { commit: { subject: '   ' } })]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(1);
    const errorEntry = report.errors.find(e => e.category === 'empty_commit_subject');
    expect(errorEntry).toBeDefined();
  });

  // ── Test C: valid non-empty subject → no error ───────────────────────────────

  test('exits 0 and no empty_commit_subject error is reported when commit.subject is a non-empty string', () => {
    // Arrange
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', { commit: { subject: 'feat: do something' } })]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(0);
    expect(report.errors.find(e => e.category === 'empty_commit_subject')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — check 18 — missing grouping rationale (missing_grouping_rationale)', () => {

  // ── Test A: empty string rationale → blocking error ──────────────────────────

  test('exits 1 and report.errors contains missing_grouping_rationale when groupingRationale is an empty string', () => {
    // Arrange
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', { groupingRationale: '' })]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(1);
    const errorEntry = report.errors.find(e => e.category === 'missing_grouping_rationale');
    expect(errorEntry).toBeDefined();
  });

  // ── Test B: whitespace-only rationale → blocking error ───────────────────────

  test('exits 1 and report.errors contains missing_grouping_rationale when groupingRationale is whitespace only', () => {
    // Arrange
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', { groupingRationale: '   ' })]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(1);
    const errorEntry = report.errors.find(e => e.category === 'missing_grouping_rationale');
    expect(errorEntry).toBeDefined();
  });

  // ── Test C: valid non-empty rationale → no error ─────────────────────────────

  test('exits 0 and no missing_grouping_rationale error is reported when groupingRationale is a non-empty string', () => {
    // Arrange
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', { groupingRationale: 'Single responsibility' })]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(0);
    expect(report.errors.find(e => e.category === 'missing_grouping_rationale')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// W2 contract-pinning — check 15 details field name must be agentMinutes
//
// Pins the field name contract between wb-validate.js (producer) and pm-phase2.js
// (consumer). If wb-validate.js ever renames the field, this test breaks before
// the consumer silently returns undefined at runtime.
// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — check 15 — details field contract: agentMinutes (not estimateMinutes)', () => {

  test('duration_warning entry details contains agentMinutes (not estimateMinutes) when task exceeds target band', () => {
    // Arrange: task with 25 min estimate → warning band (21-30 min)
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', { estimate: { agentMinutes: 25, tokens: 5000 } })]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(0);  // warning band is non-blocking
    const warning = (report.warnings || []).find(w => w.category === 'duration_warning');
    expect(warning).toBeDefined();
    expect(warning.details).toHaveProperty('agentMinutes', 25);
    expect(warning.details).not.toHaveProperty('estimateMinutes');
  });

  test('split_required entry details contains agentMinutes (not estimateMinutes) when task exceeds split band', () => {
    // Arrange: task with 35 min estimate → split_required band (>30 min)
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', { estimate: { agentMinutes: 35, tokens: 5000 } })]),
    ]);
    writeFixture(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(1);  // split_required is a blocking error
    const error = report.errors.find(e => e.category === 'split_required');
    expect(error).toBeDefined();
    expect(error.details).toHaveProperty('agentMinutes', 35);
    expect(error.details).not.toHaveProperty('estimateMinutes');
  });
});
