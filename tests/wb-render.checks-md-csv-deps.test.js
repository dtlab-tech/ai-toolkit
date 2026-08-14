'use strict'

const { spawnSync } = require('child_process')
const os   = require('os')
const fs   = require('fs')
const path = require('path')

const RENDER  = path.resolve(__dirname, '../src/claude/scripts/wb-render.js')
const FIXTURE = path.resolve(__dirname, 'fixtures/wb-valid.json')
const TMPDIR  = os.tmpdir()
const PREFIX  = 'WB-TEST'

function runRender(jsonPath, prefix, destDir) {
  const args = [jsonPath, prefix]
  if (destDir) args.push(destDir)
  return spawnSync(process.execPath, [RENDER, ...args], { encoding: 'utf8' })
}

function mdPath(dir, prefix) { return path.join(dir, `${prefix}-Work-Breakdown.md`) }
function csvPath(dir, prefix) { return path.join(dir, `${prefix}-Work-Breakdown.csv`) }

// ─────────────────────────────────────────────────────────────────────────────
// Group 1: Exit codes and file creation
// ─────────────────────────────────────────────────────────────────────────────

describe('wb-render.js — Group 1: exit codes and file creation', () => {

  // ── Test 1: exits 0 and writes both output files ─────────────────────────────

  test('exits 0 and writes both MD and CSV output files when given a valid fixture', () => {
    // Arrange
    const tmpDir = fs.mkdtempSync(path.join(TMPDIR, 'wb-render-g1a-'))
    try {
      // Act
      const result = runRender(FIXTURE, PREFIX, tmpDir)

      // Assert
      expect(result.status).toBe(0)
      expect(fs.existsSync(mdPath(tmpDir, PREFIX))).toBe(true)
      expect(fs.existsSync(csvPath(tmpDir, PREFIX))).toBe(true)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  // ── Test 2: exits 1 when JSON file missing ────────────────────────────────────

  test('exits 1 when the JSON file path does not exist', () => {
    // Arrange: path points to a file that does not exist on disk
    const nonExistentPath = path.join(TMPDIR, `no-such-wb-file-${Date.now()}.json`)

    // Act
    const result = runRender(nonExistentPath, PREFIX)

    // Assert
    expect(result.status).toBe(1)
  })

  // ── Test 3: exits 1 when JSON file contains invalid JSON ─────────────────────

  test('exits 1 when the JSON file contains invalid JSON', () => {
    // Arrange
    const tmpFile = path.join(TMPDIR, `wb-render-bad-json-${Date.now()}.json`)
    fs.writeFileSync(tmpFile, '{bad json')
    try {
      // Act
      const result = runRender(tmpFile, PREFIX)

      // Assert
      expect(result.status).toBe(1)
    } finally {
      try { fs.unlinkSync(tmpFile) } catch (_) {}
    }
  })

  // ── Test 4: exits 2 when schemaVersion is wrong ───────────────────────────────

  test('exits 2 when schemaVersion is not 2', () => {
    // Arrange
    const tmpFile = path.join(TMPDIR, `wb-render-bad-schema-${Date.now()}.json`)
    const wb = { schemaVersion: 1, feature: 'TEST', phases: [] }
    fs.writeFileSync(tmpFile, JSON.stringify(wb))
    try {
      // Act
      const result = runRender(tmpFile, PREFIX)

      // Assert
      expect(result.status).toBe(2)
    } finally {
      try { fs.unlinkSync(tmpFile) } catch (_) {}
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Groups 2, 3, 4 — share a single render run against the standard fixture
// ─────────────────────────────────────────────────────────────────────────────

describe('wb-render.js — Groups 2/3/4: output content', () => {
  let tmpDir
  let csvContent
  let mdContent
  let csvRows   // array of string arrays (each row split on '|'), header excluded

  beforeAll(() => {
    // Arrange: render once into a unique temp directory
    tmpDir = fs.mkdtempSync(path.join(TMPDIR, 'wb-render-shared-'))
    runRender(FIXTURE, PREFIX, tmpDir)
    csvContent = fs.readFileSync(csvPath(tmpDir, PREFIX), 'utf8')
    mdContent  = fs.readFileSync(mdPath(tmpDir, PREFIX), 'utf8')
    const allLines = csvContent.split('\n').filter(l => l.trim() !== '')
    // Exclude the header row; parse each data row into columns
    csvRows = allLines.slice(1).map(l => l.split('|'))
  })

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Group 2: CSV structure
  // ───────────────────────────────────────────────────────────────────────────

  describe('Group 2: CSV structure', () => {

    // ── Test 5: CSV header is exact ─────────────────────────────────────────────

    test('CSV header line is exactly "phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type"', () => {
      // Arrange: csvContent contains the full file including the header row

      // Act
      const headerLine = csvContent.split('\n')[0]

      // Assert
      expect(headerLine).toBe('phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type')
    })

    // ── Test 6: every data row has exactly 8 columns ────────────────────────────

    test('every non-header data row contains exactly 8 pipe-separated columns', () => {
      // Arrange: csvRows are already parsed non-header rows (header excluded in beforeAll)
      expect(csvRows.length).toBeGreaterThan(0)

      // Act & Assert — one logical assertion group per row
      for (const row of csvRows) {
        expect(row).toHaveLength(8)
      }
    })

    // ── Test 7: phase_id repeats within a phase ──────────────────────────────────

    test('all rows whose task_id starts with "INFRA-" have phase_id "INFRA"', () => {
      // Arrange: filter rows by task_id column (index 4)
      const infraTaskRows = csvRows.filter(row => row[4].startsWith('INFRA-'))

      // Act (filtering already done)

      // Assert
      expect(infraTaskRows.length).toBeGreaterThan(0)
      for (const row of infraTaskRows) {
        expect(row[0]).toBe('INFRA')
      }
    })

    // ── Test 8: depends_on is empty for INFRA ────────────────────────────────────

    test('all INFRA phase rows have an empty depends_on column', () => {
      // Arrange: filter rows by task_id column (index 4)
      const infraTaskRows = csvRows.filter(row => row[4].startsWith('INFRA-'))

      // Act (filtering already done)

      // Assert — depends_on is column index 3
      expect(infraTaskRows.length).toBeGreaterThan(0)
      for (const row of infraTaskRows) {
        expect(row[3]).toBe('')
      }
    })

    // ── Test 9: depends_on contains INFRA for US-01 ─────────────────────────────

    test('all US-01 phase rows have depends_on containing "INFRA"', () => {
      // Arrange: filter rows by task_id column (index 4)
      const us01Rows = csvRows.filter(row => row[4].startsWith('US-01-'))

      // Act (filtering already done)

      // Assert — depends_on is column index 3
      expect(us01Rows.length).toBeGreaterThan(0)
      for (const row of us01Rows) {
        expect(row[3]).toContain('INFRA')
      }
    })

    // ── Test 10: commit_message contains the prefix argument ─────────────────────

    test('all CSV data rows have a commit_message column that contains the prefix argument', () => {
      // Arrange: csvRows are all non-header data rows; PREFIX = 'WB-TEST'
      expect(csvRows.length).toBeGreaterThan(0)

      // Act & Assert — commit_message is column index 2
      for (const row of csvRows) {
        expect(row[2]).toContain(PREFIX)
      }
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Group 3: Markdown structure
  // ───────────────────────────────────────────────────────────────────────────

  describe('Group 3: Markdown structure', () => {

    // ── Test 11: required section headers ───────────────────────────────────────

    test('MD output contains the required top-level section headers', () => {
      // Arrange: mdContent is the full Markdown file text

      // Act & Assert
      expect(mdContent).toContain('# Work Breakdown')
      expect(mdContent).toContain('## Document Info')
      expect(mdContent).toContain('## Summary')
      expect(mdContent).toContain('## Statistics')
    })

    // ── Test 12: Document Info table rows ───────────────────────────────────────

    test('MD Document Info table contains a Feature row and a "Schema | v2" row', () => {
      // Arrange: mdContent is the full Markdown file text

      // Act & Assert
      expect(mdContent).toContain('| Feature |')
      expect(mdContent).toContain('| Schema | v2 |')
    })

    // ── Test 13: Summary table has all 7 required rows ──────────────────────────

    test('MD Summary table contains all 7 required metric rows', () => {
      // Arrange: mdContent is the full Markdown file text

      // Act & Assert
      expect(mdContent).toContain('| Total tasks |')
      expect(mdContent).toContain('| Total phases |')
      expect(mdContent).toContain('| Within target')
      expect(mdContent).toContain('| Above target')
      expect(mdContent).toContain('| Warning')
      expect(mdContent).toContain('| Split required')
      expect(mdContent).toContain('| Domain distribution |')
    })

    // ── Test 14: Infrastructure Phase section ───────────────────────────────────

    test('MD output contains the Infrastructure Phase section when the INFRA phase exists in the fixture', () => {
      // Arrange: the standard fixture has an INFRA phase

      // Act & Assert
      expect(mdContent).toContain('## Infrastructure Phase (INFRA)')
    })

    // ── Test 15: User Story Phases section ──────────────────────────────────────

    test('MD output contains the User Story Phases section when non-INFRA phases exist in the fixture', () => {
      // Arrange: the standard fixture has a US-01 phase (non-INFRA)

      // Act & Assert
      expect(mdContent).toContain('## User Story Phases')
    })

    // ── Test 16: Statistics table has domain rows and Total row ─────────────────

    test('MD Statistics table contains rows for all domain categories and a Total row', () => {
      // Arrange: mdContent is the full Markdown file text

      // Act & Assert
      expect(mdContent).toContain('| BE |')
      expect(mdContent).toContain('| FE |')
      expect(mdContent).toContain('| DB |')
      expect(mdContent).toContain('| INFRA |')
      expect(mdContent).toContain('| TEST |')
      expect(mdContent).toContain('| **Total** |')
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Group 4: Phase-level dependency aggregation
  // ───────────────────────────────────────────────────────────────────────────

  describe('Group 4: phase-level dependency aggregation', () => {

    // ── Test 17: INFRA phase has no external deps ────────────────────────────────

    test('INFRA phase rows have an empty depends_on, confirming no external phase dependencies are aggregated', () => {
      // Arrange: filter rows by phase_id column (index 0)
      const infraRows = csvRows.filter(row => row[0] === 'INFRA')

      // Act (filtering already done)

      // Assert — depends_on is column index 3
      expect(infraRows.length).toBeGreaterThan(0)
      for (const row of infraRows) {
        expect(row[3]).toBe('')
      }
    })

    // ── Test 18: US-01 depends on INFRA ─────────────────────────────────────────

    test('US-01 phase rows have depends_on "INFRA" because US-01 tasks reference INFRA-phase tasks', () => {
      // Arrange: filter rows by phase_id column (index 0)
      // The fixture has US-01-TASK-BE-01 depending on INFRA-TASK-INFRA-02 (INFRA phase)
      const us01Rows = csvRows.filter(row => row[0] === 'US-01')

      // Act (filtering already done)

      // Assert — depends_on is column index 3
      expect(us01Rows.length).toBeGreaterThan(0)
      for (const row of us01Rows) {
        expect(row[3]).toContain('INFRA')
      }
    })

    // ── Test 19: intra-phase deps excluded from depends_on ───────────────────────

    test('intra-phase dependencies within US-01 are excluded from depends_on so "US-01" never appears in that column', () => {
      // Arrange: filter rows by phase_id column (index 0)
      // US-01-TASK-BE-02 depends on US-01-TASK-BE-01 — these are intra-phase and must be excluded
      const us01Rows = csvRows.filter(row => row[0] === 'US-01')

      // Act (filtering already done)

      // Assert — depends_on (column 3) must NOT contain 'US-01'
      expect(us01Rows.length).toBeGreaterThan(0)
      for (const row of us01Rows) {
        expect(row[3]).not.toContain('US-01')
      }
    })
  })
})
