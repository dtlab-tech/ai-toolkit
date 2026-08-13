'use strict'

const { spawnSync } = require('child_process')
const os   = require('os')
const fs   = require('fs')
const path = require('path')

const RENDER = path.resolve(__dirname, '../wb-render.js')
const TMPDIR = os.tmpdir()

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeWb(overrides) {
  return Object.assign({
    schemaVersion: 2,
    feature: 'TEST',
    title: 'Test WB',
    phases: []
  }, overrides)
}

function makePhase(id, title, tasks, commitOverride) {
  return {
    id,
    title,
    commit: commitOverride !== undefined ? commitOverride : { type: 'feat', scope: id, subject: `implement ${id}` },
    tasks: tasks != null ? tasks : []
  }
}

function makeTask(id, domain, overrides) {
  return Object.assign({
    id,
    title: `Task ${id}`,
    domain,
    agentType: 'developer-backend',
    agentMinutes: 10,
    outcome: `outcome of ${id}`,
    dependsOn: [],
    verificationCommands: ['echo ok'],
    commit: { type: 'feat', scope: 'wb', subject: `implement ${id}` }
  }, overrides)
}

function writeFixture(wb) {
  const p = path.join(TMPDIR, `wb-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  fs.writeFileSync(p, JSON.stringify(wb), 'utf8')
  return p
}

function runRender(jsonPath, prefix, destDir) {
  const args = [jsonPath, prefix]
  if (destDir) args.push(destDir)
  return spawnSync(process.execPath, [RENDER, ...args], { encoding: 'utf8' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Group 1: sanitizeField — via CSV and Markdown output
// ─────────────────────────────────────────────────────────────────────────────

describe('wb-render.js — Group 1: sanitizeField behaviour via output files', () => {

  // ── Test 1: pipe in task title → CSV row has exactly 8 columns ───────────────

  test('pipe in task title is replaced so CSV data row has exactly 8 pipe-separated columns', () => {
    // Arrange
    const task  = makeTask('T-01', 'BE', { title: 'foo|bar' })
    const phase = makePhase('US-01', 'Phase One', [task])
    const wb    = makeWb({ phases: [phase] })
    const jsonPath = writeFixture(wb)
    const tmpDir   = fs.mkdtempSync(path.join(TMPDIR, 'wb-sanitize-t1-'))
    try {
      // Act
      runRender(jsonPath, 'TEST', tmpDir)
      const csv = fs.readFileSync(path.join(tmpDir, 'TEST-Work-Breakdown.csv'), 'utf8')
      const dataRows = csv.split('\n').filter((l, i) => i > 0 && l.trim() !== '')

      // Assert: each data row has exactly 8 pipe-separated fields (pipe in title is replaced with space)
      expect(dataRows.length).toBeGreaterThan(0)
      for (const row of dataRows) {
        expect(row.split('|')).toHaveLength(8)
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      try { fs.unlinkSync(jsonPath) } catch (_) {}
    }
  })

  // ── Test 2: LF in phase title → no embedded newline in CSV data rows ─────────

  test('LF in phase title is replaced with space so CSV has no extra lines in data section', () => {
    // Arrange
    const task  = makeTask('T-01', 'BE')
    const phase = makePhase('US-01', 'Phase\nOne', [task])
    const wb    = makeWb({ phases: [phase] })
    const jsonPath = writeFixture(wb)
    const tmpDir   = fs.mkdtempSync(path.join(TMPDIR, 'wb-sanitize-t2-'))
    try {
      // Act
      runRender(jsonPath, 'TEST', tmpDir)
      const csv = fs.readFileSync(path.join(tmpDir, 'TEST-Work-Breakdown.csv'), 'utf8')
      const nonEmptyLines = csv.split('\n').filter(l => l.trim() !== '')

      // Assert: exactly 2 non-empty lines — 1 header + 1 data row (no extra LF-split lines)
      expect(nonEmptyLines).toHaveLength(2)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      try { fs.unlinkSync(jsonPath) } catch (_) {}
    }
  })

  // ── Test 3: CR in phase title → no carriage-return in CSV output ─────────────

  test('CR in phase title is stripped so CSV content contains no carriage-return characters', () => {
    // Arrange
    const task  = makeTask('T-01', 'BE')
    const phase = makePhase('US-01', 'Phase\rOne', [task])
    const wb    = makeWb({ phases: [phase] })
    const jsonPath = writeFixture(wb)
    const tmpDir   = fs.mkdtempSync(path.join(TMPDIR, 'wb-sanitize-t3-'))
    try {
      // Act
      runRender(jsonPath, 'TEST', tmpDir)
      const csv = fs.readFileSync(path.join(tmpDir, 'TEST-Work-Breakdown.csv'), 'utf8')

      // Assert: no raw CR bytes anywhere in the CSV
      expect(csv).not.toContain('\r')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      try { fs.unlinkSync(jsonPath) } catch (_) {}
    }
  })

  // ── Test 4: pipe in task title → MD table row contains sanitized form ─────────

  test('pipe in task title is replaced with space in Markdown task table so raw pipe is absent', () => {
    // Arrange
    const task  = makeTask('T-01', 'BE', { title: 'foo|bar' })
    const phase = makePhase('US-01', 'Phase One', [task])
    const wb    = makeWb({ phases: [phase] })
    const jsonPath = writeFixture(wb)
    const tmpDir   = fs.mkdtempSync(path.join(TMPDIR, 'wb-sanitize-t4-'))
    try {
      // Act
      runRender(jsonPath, 'TEST', tmpDir)
      const md = fs.readFileSync(path.join(tmpDir, 'TEST-Work-Breakdown.md'), 'utf8')

      // Assert: sanitized value present; raw piped title absent
      expect(md).toContain('foo bar')
      expect(md).not.toContain('foo|bar')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      try { fs.unlinkSync(jsonPath) } catch (_) {}
    }
  })

  // ── Test 5: null task title → no crash, exit 0 ───────────────────────────────

  test('null task title does not crash the renderer and process exits with code 0', () => {
    // Arrange
    const task  = makeTask('T-01', 'BE', { title: null })
    const phase = makePhase('US-01', 'Phase One', [task])
    const wb    = makeWb({ phases: [phase] })
    const jsonPath = writeFixture(wb)
    const tmpDir   = fs.mkdtempSync(path.join(TMPDIR, 'wb-sanitize-t5-'))
    try {
      // Act
      const result = runRender(jsonPath, 'TEST', tmpDir)

      // Assert
      expect(result.status).toBe(0)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      try { fs.unlinkSync(jsonPath) } catch (_) {}
    }
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// Group 2: buildCommitSubject / phase commit formatting — via CSV and MD output
// ─────────────────────────────────────────────────────────────────────────────

describe('wb-render.js — Group 2: commit message formatting in output files', () => {

  // ── Test 6: CSV commit_message uses phase commit type and prefix arg ──────────

  test('CSV commit_message starts with type(PREFIX): when phase.commit is present', () => {
    // Arrange
    const task  = makeTask('T-01', 'BE')
    const phase = makePhase('US-01', 'Phase One', [task], { type: 'feat', subject: 'implement us-01' })
    const wb    = makeWb({ phases: [phase] })
    const jsonPath = writeFixture(wb)
    const tmpDir   = fs.mkdtempSync(path.join(TMPDIR, 'wb-commit-t6-'))
    try {
      // Act
      runRender(jsonPath, 'TEST-PREFIX', tmpDir)
      const csv = fs.readFileSync(path.join(tmpDir, 'TEST-PREFIX-Work-Breakdown.csv'), 'utf8')
      const dataRows = csv.split('\n').filter((l, i) => i > 0 && l.trim() !== '')

      // Assert: commit_message column (index 2) starts with feat(TEST-PREFIX):
      expect(dataRows.length).toBeGreaterThan(0)
      for (const row of dataRows) {
        const cols = row.split('|')
        expect(cols[2]).toMatch(/^feat\(TEST-PREFIX\):/)
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      try { fs.unlinkSync(jsonPath) } catch (_) {}
    }
  })

  // ── Test 7: missing phase.commit → CSV falls back to chore(PREFIX): ──────────

  test('CSV commit_message falls back to chore(PREFIX): when phase has no commit field', () => {
    // Arrange: phase object without a commit field
    const task  = makeTask('T-01', 'BE')
    const phase = { id: 'US-01', title: 'Phase One', tasks: [task] }
    const wb    = makeWb({ phases: [phase] })
    const jsonPath = writeFixture(wb)
    const tmpDir   = fs.mkdtempSync(path.join(TMPDIR, 'wb-commit-t7-'))
    try {
      // Act
      runRender(jsonPath, 'TEST-PREFIX', tmpDir)
      const csv = fs.readFileSync(path.join(tmpDir, 'TEST-PREFIX-Work-Breakdown.csv'), 'utf8')
      const dataRows = csv.split('\n').filter((l, i) => i > 0 && l.trim() !== '')

      // Assert: commit_message column (index 2) starts with chore(TEST-PREFIX):
      expect(dataRows.length).toBeGreaterThan(0)
      for (const row of dataRows) {
        const cols = row.split('|')
        expect(cols[2]).toMatch(/^chore\(TEST-PREFIX\):/)
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      try { fs.unlinkSync(jsonPath) } catch (_) {}
    }
  })

  // ── Test 8: long phase commit subject → Markdown commit section renders correctly

  test('long phase commit subject is rendered verbatim in Markdown commit section', () => {
    // Arrange: subject long enough to produce a commit line exceeding 72 chars
    const longSubject = 'a'.repeat(85) // "feat(PREFIX): " (14 chars) + 85 = 99 chars total
    const task  = makeTask('T-01', 'BE')
    const phase = makePhase('US-01', 'Phase One', [task], { type: 'feat', subject: longSubject })
    const wb    = makeWb({ phases: [phase] })
    const jsonPath = writeFixture(wb)
    const tmpDir   = fs.mkdtempSync(path.join(TMPDIR, 'wb-commit-t8-'))
    try {
      // Act
      runRender(jsonPath, 'PREFIX', tmpDir)
      const md = fs.readFileSync(path.join(tmpDir, 'PREFIX-Work-Breakdown.md'), 'utf8')

      // Assert: the full commit line appears in the MD (phaseCommit renders untruncated)
      const expectedLine = `feat(PREFIX): ${longSubject}`
      expect(md).toContain(expectedLine)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      try { fs.unlinkSync(jsonPath) } catch (_) {}
    }
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// Group 3: Output file paths
// ─────────────────────────────────────────────────────────────────────────────

describe('wb-render.js — Group 3: output file path resolution', () => {

  // ── Test 9: default destDir is same directory as JSON file ───────────────────

  test('output files are written to the JSON directory when no destDir argument is provided', () => {
    // Arrange
    const task  = makeTask('T-01', 'BE')
    const phase = makePhase('US-01', 'Phase One', [task])
    const wb    = makeWb({ phases: [phase] })
    const jsonPath  = writeFixture(wb)
    const prefix    = 'TEST-P9'
    const jsonDir   = path.dirname(jsonPath)
    const expectedMd  = path.join(jsonDir, `${prefix}-Work-Breakdown.md`)
    const expectedCsv = path.join(jsonDir, `${prefix}-Work-Breakdown.csv`)
    try {
      // Act: run without destDir — output defaults to JSON's directory
      runRender(jsonPath, prefix)

      // Assert: both output files exist in the JSON's directory
      expect(fs.existsSync(expectedMd)).toBe(true)
      expect(fs.existsSync(expectedCsv)).toBe(true)
    } finally {
      try { fs.unlinkSync(jsonPath) }  catch (_) {}
      try { fs.unlinkSync(expectedMd) }  catch (_) {}
      try { fs.unlinkSync(expectedCsv) } catch (_) {}
    }
  })

  // ── Test 10: explicit destDir overrides output location ──────────────────────

  test('output files appear in explicit destDir and not in the JSON file directory', () => {
    // Arrange
    const task  = makeTask('T-01', 'BE')
    const phase = makePhase('US-01', 'Phase One', [task])
    const wb    = makeWb({ phases: [phase] })
    const jsonPath  = writeFixture(wb)
    const prefix    = 'TEST-P10'
    const customDir = fs.mkdtempSync(path.join(TMPDIR, 'wb-paths-t10-'))
    const jsonDir   = path.dirname(jsonPath)
    try {
      // Act
      runRender(jsonPath, prefix, customDir)

      // Assert: output files are in customDir
      expect(fs.existsSync(path.join(customDir, `${prefix}-Work-Breakdown.md`))).toBe(true)
      expect(fs.existsSync(path.join(customDir, `${prefix}-Work-Breakdown.csv`))).toBe(true)

      // Assert: output files are NOT in the JSON's directory (unique prefix ensures no collision)
      expect(fs.existsSync(path.join(jsonDir, `${prefix}-Work-Breakdown.md`))).toBe(false)
      expect(fs.existsSync(path.join(jsonDir, `${prefix}-Work-Breakdown.csv`))).toBe(false)
    } finally {
      fs.rmSync(customDir, { recursive: true, force: true })
      try { fs.unlinkSync(jsonPath) } catch (_) {}
    }
  })

  // ── Test 11: stdout JSON contains markdownPath and csvPath keys ───────────────

  test('stdout from a successful run is valid JSON with correct markdownPath and csvPath values', () => {
    // Arrange
    const task  = makeTask('T-01', 'BE')
    const phase = makePhase('US-01', 'Phase One', [task])
    const wb    = makeWb({ phases: [phase] })
    const jsonPath = writeFixture(wb)
    const tmpDir   = fs.mkdtempSync(path.join(TMPDIR, 'wb-paths-t11-'))
    const prefix   = 'TEST-P11'
    try {
      // Act
      const result = runRender(jsonPath, prefix, tmpDir)
      const parsed = JSON.parse(result.stdout.trim())

      // Assert: stdout JSON has the expected path keys with correct values
      expect(parsed).toHaveProperty('markdownPath')
      expect(parsed).toHaveProperty('csvPath')
      expect(parsed.markdownPath).toBe(path.join(tmpDir, `${prefix}-Work-Breakdown.md`))
      expect(parsed.csvPath).toBe(path.join(tmpDir, `${prefix}-Work-Breakdown.csv`))
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      try { fs.unlinkSync(jsonPath) } catch (_) {}
    }
  })

})
