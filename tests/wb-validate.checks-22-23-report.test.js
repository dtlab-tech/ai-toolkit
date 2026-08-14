'use strict'
const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

const VALIDATE = path.resolve(__dirname, '../src/claude/scripts/wb-validate.js')
const FIXTURES = path.resolve(__dirname, 'fixtures')

function runValidator(wbPath, reqPath) {
  const args = [VALIDATE, wbPath]
  if (reqPath) args.push(reqPath)
  const result = spawnSync('node', args, { encoding: 'utf8' })
  let report = null
  try { report = JSON.parse(result.stdout) } catch (_) {}
  return { exitCode: result.status, report, stderr: result.stderr, rawStdout: result.stdout }
}

let tmpFile
beforeEach(() => { tmpFile = path.join(os.tmpdir(), `wb-t21-${Date.now()}.json`) })
afterEach(() => { try { fs.unlinkSync(tmpFile) } catch (_) {} })
function writeFixture(obj) { fs.writeFileSync(tmpFile, JSON.stringify(obj, null, 2)); return tmpFile }

function makeTask(id, overrides = {}) {
  return {
    id, title: `Task ${id}`, outcome: 'Done', domain: 'BE',
    agentType: 'developer-backend', dependsOn: [], acceptanceCriteria: [],
    verification: { commands: ['node --version'] },
    estimate: { agentMinutes: 10, tokens: 5000 },
    outputCount: 1, groupingRationale: 'Single', commit: { subject: `feat: ${id}` },
    ...overrides,
  }
}
function makePhase(id, tasks, overrides = {}) {
  return { id, type: 'user-story', title: `Phase ${id}`, commit: `feat(${id}): done`, tasks, ...overrides }
}
function makeWB(phases) { return { schemaVersion: 2, phases } }

// ─────────────────────────────────────────────────────────────────────────────
// W1 regression guard — checks 22 and 23 must not crash on missing/non-array phases
// Before fix: both checks iterated wb.phases directly → TypeError: not iterable.
// After fix:  both use the guarded `phases` constant (same as checks 3-21).
// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — checks 22 and 23 — no crash when wb.phases is absent or non-array', () => {

  test('exits 0 and emits valid JSON when wb.phases is absent (missing field)', () => {
    // Arrange: valid schemaVersion but no phases field at all
    const wb = { schemaVersion: 2 }
    writeFixture(wb)
    const { exitCode, report } = runValidator(tmpFile)
    // Assert: no TypeError — exits cleanly and produces a structured report
    expect(exitCode).toBe(0)
    expect(report).not.toBeNull()
    expect(Array.isArray(report.errors)).toBe(true)
  })

  test('exits 0 and emits valid JSON when wb.phases is null', () => {
    // Arrange
    const wb = { schemaVersion: 2, phases: null }
    writeFixture(wb)
    const { exitCode, report } = runValidator(tmpFile)
    expect(exitCode).toBe(0)
    expect(report).not.toBeNull()
    expect(Array.isArray(report.errors)).toBe(true)
  })

  test('exits 0 and emits valid JSON when wb.phases is a non-array object', () => {
    // Arrange
    const wb = { schemaVersion: 2, phases: { id: 'US-01' } }
    writeFixture(wb)
    const { exitCode, report } = runValidator(tmpFile)
    expect(exitCode).toBe(0)
    expect(report).not.toBeNull()
    expect(Array.isArray(report.errors)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Check 22 — invalid text field characters (invalid_text_field_chars)
// Forbidden characters: | (pipe), \r (CR), \n (LF)
// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — check 22 — invalid text field characters (invalid_text_field_chars)', () => {

  // ── Test A: pipe in task title ────────────────────────────────────────────────

  test('exits 1 and report.errors contains invalid_text_field_chars with field "title" when task title contains a pipe character', () => {
    // Arrange
    const wb = makeWB([makePhase('US-01', [makeTask('US-01-TASK-BE-01', { title: 'Task with | pipe' })])])
    writeFixture(wb)

    // Act
    const { exitCode, report } = runValidator(tmpFile)

    // Assert
    expect(exitCode).toBe(1)
    const error = report.errors.find(e => e.category === 'invalid_text_field_chars')
    expect(error).toBeDefined()
    expect(error.field).toBe('title')
  })

  // ── Test B: LF in commit.subject ──────────────────────────────────────────────

  test('exits 1 and report.errors contains invalid_text_field_chars with field "commit.subject" when task commit subject contains a newline character', () => {
    // Arrange
    const wb = makeWB([makePhase('US-01', [makeTask('US-01-TASK-BE-01', { commit: { subject: 'feat: line1\nline2' } })])])
    writeFixture(wb)

    // Act
    const { exitCode, report } = runValidator(tmpFile)

    // Assert
    expect(exitCode).toBe(1)
    const error = report.errors.find(e => e.category === 'invalid_text_field_chars')
    expect(error).toBeDefined()
    expect(error.field).toBe('commit.subject')
  })

  // ── Test C: CR in phase title ─────────────────────────────────────────────────

  test('exits 1 and report.errors contains invalid_text_field_chars with field "title" and phaseId set when phase title contains a carriage return character', () => {
    // Arrange
    const wb = makeWB([makePhase('US-01', [makeTask('US-01-TASK-BE-01')], { title: 'Phase\rTitle' })])
    writeFixture(wb)

    // Act
    const { exitCode, report } = runValidator(tmpFile)

    // Assert
    expect(exitCode).toBe(1)
    const error = report.errors.find(e => e.category === 'invalid_text_field_chars')
    expect(error).toBeDefined()
    expect(error.field).toBe('title')
    expect(error.phaseId).toBe('US-01')
  })

  // ── Test D: clean fields — no invalid_text_field_chars error ──────────────────

  test('exits 0 and report contains no invalid_text_field_chars errors when all text fields contain only valid characters', () => {
    // Arrange — default makeTask and makePhase produce clean strings with no pipe, CR, or LF
    const wb = makeWB([makePhase('US-01', [makeTask('US-01-TASK-BE-01')])])
    writeFixture(wb)

    // Act
    const { exitCode, report } = runValidator(tmpFile)

    // Assert
    expect(exitCode).toBe(0)
    expect(report.errors.filter(e => e.category === 'invalid_text_field_chars')).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Check 23 — empty phase (empty_phase)
// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — check 23 — empty phase (empty_phase)', () => {

  // ── Test A: phase with no tasks ───────────────────────────────────────────────

  test('exits 1 and report.errors contains empty_phase when a phase has an empty tasks array', () => {
    // Arrange
    const wb = makeWB([makePhase('US-01', [])])
    writeFixture(wb)

    // Act
    const { exitCode, report } = runValidator(tmpFile)

    // Assert
    expect(exitCode).toBe(1)
    const error = report.errors.find(e => e.category === 'empty_phase')
    expect(error).toBeDefined()
  })

  // ── Test B: phase with at least one task ──────────────────────────────────────

  test('exits 0 and report contains no empty_phase errors when a phase has at least one task', () => {
    // Arrange
    const wb = makeWB([makePhase('US-01', [makeTask('US-01-TASK-BE-01')])])
    writeFixture(wb)

    // Act
    const { exitCode, report } = runValidator(tmpFile)

    // Assert
    expect(exitCode).toBe(0)
    expect(report.errors.filter(e => e.category === 'empty_phase')).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Report output contract — structure and exit codes
// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — report output contract', () => {

  // ── Test A: valid WB — full report shape ──────────────────────────────────────

  test('exits 0 and emits a report with all required top-level keys and correct types when the work breakdown is valid', () => {
    // Arrange — use the canonical valid fixture; no requirements path so AC checks are skipped
    // Act
    const { exitCode, report } = runValidator(path.join(FIXTURES, 'wb-valid.json'))

    // Assert
    expect(exitCode).toBe(0)
    expect(report).toMatchObject({
      valid: true,
      schemaVersion: 2,
      taskCount: expect.any(Number),
      errors: [],
      warnings: expect.any(Array),
      durationBands: expect.objectContaining({
        target: expect.any(Number),
        above_target: expect.any(Number),
        warning: expect.any(Number),
        split_required: expect.any(Number),
      }),
      domainDistribution: expect.objectContaining({
        BE: expect.any(Number),
        FE: expect.any(Number),
        DB: expect.any(Number),
        DevOps: expect.any(Number),
        INFRA: expect.any(Number),
        TEST: expect.any(Number),
      }),
      dependencies: expect.objectContaining({
        taskGraph: expect.any(Object),
        taskCycles: expect.any(Array),
        phaseGraph: expect.any(Object),
        phaseCycles: expect.any(Array),
        phaseWaves: expect.any(Array),
        phaseUnschedulable: expect.any(Array),
      }),
    })
  })

  // ── Test B: invalid WB — valid = false and errors non-empty ──────────────────

  test('exits 1 and emits a report with valid=false and at least one error when the work breakdown has a duplicate task ID', () => {
    // Arrange — the duplicate-ID fixture contains INFRA-TASK-INFRA-01 in two phases
    // Act
    const { exitCode, report } = runValidator(path.join(FIXTURES, 'wb-invalid-duplicate-id.json'))

    // Assert
    expect(exitCode).toBe(1)
    expect(report.valid).toBe(false)
    expect(report.errors.length).toBeGreaterThan(0)
  })

  // ── Test C: exit code 2 on file not found ─────────────────────────────────────

  test('exits with code 2 when the specified work breakdown file does not exist', () => {
    // Arrange — path points to a non-existent file
    // Act
    const result = spawnSync('node', [VALIDATE, '/nonexistent/path/wb.json'], { encoding: 'utf8' })

    // Assert
    expect(result.status).toBe(2)
  })

  // ── Test D: exit code 2 on invalid JSON ───────────────────────────────────────

  test('exits with code 2 when the work breakdown file contains invalid JSON', () => {
    // Arrange — write a file with malformed JSON content
    fs.writeFileSync(tmpFile, '{ invalid json')

    // Act
    const result = spawnSync('node', [VALIDATE, tmpFile], { encoding: 'utf8' })

    // Assert
    expect(result.status).toBe(2)
  })

  // ── Test E: exit code 2 on missing path argument ──────────────────────────────

  test('exits with code 2 when no work breakdown path argument is provided', () => {
    // Arrange: invoke with no arguments
    // Act
    const result = spawnSync('node', [VALIDATE], { encoding: 'utf8' })

    // Assert
    expect(result.status).toBe(2)
  })

  // ── Test F: stdout is always valid JSON on exit 1 ─────────────────────────────

  test('emits valid JSON to stdout even when validation fails and exits with code 1', () => {
    // Arrange — the duplicate-ID fixture produces exit 1 but must still emit valid JSON
    // Act
    const { exitCode, report } = runValidator(path.join(FIXTURES, 'wb-invalid-duplicate-id.json'))

    // Assert — if report is non-null, JSON.parse succeeded without throwing
    expect(exitCode).toBe(1)
    expect(report).not.toBeNull()
  })
})
