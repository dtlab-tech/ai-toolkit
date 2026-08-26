'use strict'

const { spawnSync } = require('child_process')
const os   = require('os')
const fs   = require('fs')
const path = require('path')

const RENDER  = path.resolve(__dirname, '../src/claude/scripts/wb-render.js')
const FIXTURE = path.resolve(__dirname, 'fixtures/wb-valid.json')
const TMPDIR  = os.tmpdir()
const PREFIX  = 'REG-TEST'

// Load the fixture JSON to derive expected values
const fixtureWb = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
const allFixtureTasks = fixtureWb.phases.flatMap(p => p.tasks ?? [])

// ─────────────────────────────────────────────────────────────────────────────
// Regression: CSV produced by wb-render.js is correctly parsed by pm-phase3
// ─────────────────────────────────────────────────────────────────────────────

describe('wb-render.js → pm-phase3 CSV parsing regression', () => {
  let tmpDir
  let rawDataLines  // trimmed, non-header, non-empty lines from the CSV (raw strings)
  let rows          // output of pm-phase3 row mapping + filter
  let phaseMap      // output of pm-phase3 phase grouping

  beforeAll(() => {
    // Arrange: render the standard fixture into a unique temp directory
    tmpDir = fs.mkdtempSync(path.join(TMPDIR, 'wb-reg-pm3-'))
    spawnSync(process.execPath, [RENDER, FIXTURE, PREFIX, tmpDir], { encoding: 'utf8' })

    const csvPath = path.join(tmpDir, `${PREFIX}-Work-Breakdown.csv`)
    const csvContent = fs.readFileSync(csvPath, 'utf8')

    // Save raw data lines for structural assertions (before pm-phase3 field mapping)
    rawDataLines = csvContent
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('phase_id'))

    // ── pm-phase3 parsing logic — inlined verbatim from pm-phase3.js lines 77-105 ─
    rows = csvContent
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('phase_id'))  // skip header and empty lines
      .map(l => {
        const [phase_id, phase_title, commit_message, depends_on, task_id, task_title, domain, agent_type] = l.split('|')
        return { phase_id, phase_title, commit_message, depends_on: depends_on || '', task_id, task_title, domain, agent_type }
      })
      .filter(r => r.phase_id && r.task_id)

    // Group rows into phases preserving order
    phaseMap = new Map()
    for (const row of rows) {
      if (!phaseMap.has(row.phase_id)) {
        phaseMap.set(row.phase_id, {
          phase_id:       row.phase_id,
          title:          row.phase_title,
          commit_message: row.commit_message,
          depends_on:     row.depends_on.split(' ').filter(Boolean),  // [] for empty
          impl_tasks:     [],
          test_tasks:     [],
        })
      }
      const p = phaseMap.get(row.phase_id)
      if (row.domain === 'TEST') {
        p.test_tasks.push({ task_id: row.task_id, agent_type: row.agent_type })
      } else {
        p.impl_tasks.push({ task_id: row.task_id, agent_type: row.agent_type })
      }
    }
  })

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // ── Test 1: row count matches fixture task count ──────────────────────────────

  test('rows.length equals the total number of tasks in the fixture after pm-phase3 parsing', () => {
    // Arrange: allFixtureTasks derived from wb-valid.json (6 tasks across 2 phases)

    // Act: rows computed in beforeAll via inlined pm-phase3 logic

    // Assert
    expect(rows.length).toBe(allFixtureTasks.length)
  })

  // ── Test 2: every raw data line has exactly 8 pipe-separated fields ───────────

  test('every non-header data line in the CSV has exactly 8 pipe-separated fields', () => {
    // Arrange: rawDataLines are the trimmed, non-empty, non-header lines
    expect(rawDataLines.length).toBeGreaterThan(0)

    // Act & Assert
    for (const line of rawDataLines) {
      expect(line.split('|')).toHaveLength(8)
    }
  })

  // ── Test 3: every parsed row has non-empty phase_id and task_id ───────────────

  test('every parsed row has a non-empty phase_id and task_id after pm-phase3 mapping', () => {
    // Arrange: rows computed in beforeAll
    expect(rows.length).toBeGreaterThan(0)

    // Act & Assert
    for (const row of rows) {
      expect(row.phase_id).toBeTruthy()
      expect(row.task_id).toBeTruthy()
    }
  })

  // ── Test 4: phaseMap size matches fixture phase count ─────────────────────────

  test('phaseMap.size equals the number of phases in the fixture', () => {
    // Arrange: fixtureWb.phases has 2 phases (INFRA and US-01)

    // Act: phaseMap computed in beforeAll

    // Assert
    expect(phaseMap.size).toBe(fixtureWb.phases.length)
  })

  // ── Test 5: INFRA phase has the correct impl_tasks count ─────────────────────

  test('INFRA phase in phaseMap has 2 impl_tasks (the 2 non-TEST domain tasks)', () => {
    // Arrange: fixture INFRA phase has INFRA-TASK-INFRA-01 and INFRA-TASK-INFRA-02 (domain INFRA)
    const infraPhase = phaseMap.get('INFRA')

    // Assert
    expect(infraPhase).toBeDefined()
    expect(infraPhase.impl_tasks).toHaveLength(2)
  })

  // ── Test 6: INFRA phase has the correct test_tasks count ─────────────────────

  test('INFRA phase in phaseMap has 1 test_task (the TEST domain task)', () => {
    // Arrange: fixture INFRA phase has INFRA-TASK-TEST-01 (domain TEST)
    const infraPhase = phaseMap.get('INFRA')

    // Assert
    expect(infraPhase).toBeDefined()
    expect(infraPhase.test_tasks).toHaveLength(1)
  })

  // ── Test 7: US-01 phase has the correct impl_tasks count ─────────────────────

  test('US-01 phase in phaseMap has 2 impl_tasks (the 2 BE domain tasks)', () => {
    // Arrange: fixture US-01 phase has US-01-TASK-BE-01 and US-01-TASK-BE-02 (domain BE)
    const us01Phase = phaseMap.get('US-01')

    // Assert
    expect(us01Phase).toBeDefined()
    expect(us01Phase.impl_tasks).toHaveLength(2)
  })

  // ── Test 8: US-01 phase has the correct test_tasks count ─────────────────────

  test('US-01 phase in phaseMap has 1 test_task (the TEST domain task)', () => {
    // Arrange: fixture US-01 phase has US-01-TASK-TEST-01 (domain TEST)
    const us01Phase = phaseMap.get('US-01')

    // Assert
    expect(us01Phase).toBeDefined()
    expect(us01Phase.test_tasks).toHaveLength(1)
  })

  // ── Test 9: INFRA phase depends_on is an empty array ─────────────────────────

  test('INFRA phase depends_on is an empty array after split+filter because it has no external dependencies', () => {
    // Arrange: INFRA phase tasks have no cross-phase dependsOn references
    const infraPhase = phaseMap.get('INFRA')

    // Assert
    expect(infraPhase).toBeDefined()
    expect(infraPhase.depends_on).toEqual([])
  })

  // ── Test 10: US-01 phase depends_on contains INFRA ───────────────────────────

  test('US-01 phase depends_on contains "INFRA" because US-01-TASK-BE-01 references an INFRA-phase task', () => {
    // Arrange: US-01-TASK-BE-01 has dependsOn: ['INFRA-TASK-INFRA-02'] (cross-phase)
    const us01Phase = phaseMap.get('US-01')

    // Assert
    expect(us01Phase).toBeDefined()
    expect(us01Phase.depends_on).toContain('INFRA')
  })

  // ── Test 11: no row has undefined as any field value ─────────────────────────

  test('no parsed row has undefined as any of its 8 destructured field values', () => {
    // Arrange: if the CSV had fewer than 8 pipe-delimited columns, destructuring would
    // yield undefined for the missing positions — this test guards against that regression
    const FIELDS = ['phase_id', 'phase_title', 'commit_message', 'depends_on', 'task_id', 'task_title', 'domain', 'agent_type']
    expect(rows.length).toBeGreaterThan(0)

    // Act & Assert
    for (const row of rows) {
      for (const field of FIELDS) {
        expect(row[field]).not.toBeUndefined()
      }
    }
  })

  // ── Test 12: agent_type has no surrounding whitespace ────────────────────────

  test('agent_type on every parsed row is a clean string with no surrounding whitespace', () => {
    // Arrange: CSV rows end with a newline; l.trim() removes it, but this test confirms
    // the agent_type value (last column) arrives clean after pm-phase3 parsing
    expect(rows.length).toBeGreaterThan(0)

    // Act & Assert
    for (const row of rows) {
      expect(row.agent_type).toBe(row.agent_type.trim())
    }
  })
})
