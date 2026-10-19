'use strict'

const { spawnSync } = require('child_process')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { computeCoverage, renderMatrix, computeTechSpecCoverage, buildMatrixJson } = require('../src/claude/scripts/ac-task-matrix')

function wbWith(phases) { return { schemaVersion: 2, feature: 'FTR-TEST', phases } }
function acMapWith(entries) { return new Map(entries.map(e => [e.id, e])) }

describe('computeCoverage()', () => {
  test('an AC covered by one task in one phase', () => {
    const wb = wbWith([{ id: 'US-01', tasks: [{ id: 'US-01-TASK-BE-01', acceptanceCriteria: ['AC-01'] }] }])
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Must', allowedUserStories: ['US-01'], unscoped: false }])
    const coverage = computeCoverage(wb, acMap)
    expect([...coverage.get('AC-01').taskIds]).toEqual(['US-01-TASK-BE-01'])
    expect([...coverage.get('AC-01').phaseIds]).toEqual(['US-01'])
  })

  test('an AC covered by two tasks in two different phases lists both', () => {
    const wb = wbWith([
      { id: 'US-01', tasks: [{ id: 'US-01-TASK-BE-01', acceptanceCriteria: ['AC-01'] }] },
      { id: 'US-02', tasks: [{ id: 'US-02-TASK-BE-01', acceptanceCriteria: ['AC-01'] }] },
    ])
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Must', allowedUserStories: ['US-01', 'US-02'], unscoped: false }])
    const coverage = computeCoverage(wb, acMap)
    expect([...coverage.get('AC-01').taskIds].sort()).toEqual(['US-01-TASK-BE-01', 'US-02-TASK-BE-01'])
    expect([...coverage.get('AC-01').phaseIds].sort()).toEqual(['US-01', 'US-02'])
  })

  test('an AC with zero covering tasks yields empty sets, not an error', () => {
    const wb = wbWith([{ id: 'US-01', tasks: [{ id: 'US-01-TASK-BE-01', acceptanceCriteria: [] }] }])
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Should', allowedUserStories: ['US-01'], unscoped: false }])
    const coverage = computeCoverage(wb, acMap)
    expect(coverage.get('AC-01').taskIds.size).toBe(0)
  })

  test("a task citing an AC ID absent from acMap is silently skipped (wb-validate.js's job, not this one)", () => {
    const wb = wbWith([{ id: 'US-01', tasks: [{ id: 'US-01-TASK-BE-01', acceptanceCriteria: ['AC-99'] }] }])
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Should', allowedUserStories: ['US-01'], unscoped: false }])
    expect(() => computeCoverage(wb, acMap)).not.toThrow()
  })
})

describe('renderMatrix()', () => {
  test('rows appear in acMap insertion order', () => {
    const acMap = acMapWith([
      { id: 'AC-02', criterion: 'second', priority: 'Must', allowedUserStories: ['US-01'], relatedUCs: ['UC-01'], unscoped: false },
      { id: 'AC-01', criterion: 'first', priority: 'Must', allowedUserStories: ['US-01'], relatedUCs: ['UC-01'], unscoped: false },
    ])
    const coverage = new Map([['AC-02', { taskIds: new Set(), phaseIds: new Set() }], ['AC-01', { taskIds: new Set(), phaseIds: new Set() }]])
    const md = renderMatrix('FTR-TEST', acMap, coverage)
    expect(md.indexOf('AC-02')).toBeLessThan(md.indexOf('AC-01'))
  })

  test('zero coverage renders em-dash in both cells', () => {
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Should', allowedUserStories: ['US-01'], relatedUCs: ['UC-01'], unscoped: false }])
    const coverage = new Map([['AC-01', { taskIds: new Set(), phaseIds: new Set() }]])
    const md = renderMatrix('FTR-TEST', acMap, coverage)
    expect(md).toMatch(/\| AC-01 \| x \| Should \| UC-01 \| — \| — \| — \|/)
  })

  test('an unscoped AC renders "All UCs" in the Related UC column', () => {
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Must', allowedUserStories: [], relatedUCs: [], unscoped: true }])
    const coverage = new Map([['AC-01', { taskIds: new Set(['T-01']), phaseIds: new Set(['US-01']) }]])
    const md = renderMatrix('FTR-TEST', acMap, coverage)
    expect(md).toContain('| AC-01 | x | Must | All UCs | — | T-01 | US-01 |')
  })
})

describe('computeTechSpecCoverage()', () => {
  test('an AC addressed by one file', () => {
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Must', allowedUserStories: ['US-01'], unscoped: false }])
    const coverage = computeTechSpecCoverage([{ filePath: 'a.js', acIds: ['AC-01'] }], acMap)
    expect([...coverage.get('AC-01')]).toEqual(['a.js'])
  })

  test('an AC addressed by two files', () => {
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Must', allowedUserStories: ['US-01'], unscoped: false }])
    const coverage = computeTechSpecCoverage(
      [{ filePath: 'a.js', acIds: ['AC-01'] }, { filePath: 'b.js', acIds: ['AC-01'] }], acMap)
    expect([...coverage.get('AC-01')].sort()).toEqual(['a.js', 'b.js'])
  })

  test('an AC addressed by zero files yields an empty set', () => {
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Should', allowedUserStories: ['US-01'], unscoped: false }])
    const coverage = computeTechSpecCoverage([{ filePath: 'a.js', acIds: [] }], acMap)
    expect(coverage.get('AC-01').size).toBe(0)
  })

  test('a file citing an AC ID absent from acMap is silently skipped', () => {
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Should', allowedUserStories: ['US-01'], unscoped: false }])
    expect(() => computeTechSpecCoverage([{ filePath: 'a.js', acIds: ['AC-99'] }], acMap)).not.toThrow()
  })
})

describe('renderMatrix() — Tech-Spec column (FTR-023)', () => {
  test('without a 4th argument, the new column renders em-dash (backward compatible)', () => {
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Should', allowedUserStories: ['US-01'], relatedUCs: ['UC-01'], unscoped: false }])
    const coverage = new Map([['AC-01', { taskIds: new Set(), phaseIds: new Set() }]])
    const md = renderMatrix('FTR-TEST', acMap, coverage) // no 4th arg
    expect(md).toMatch(/\| AC-01 \| x \| Should \| UC-01 \| — \| — \| — \|/)
  })

  test('with techSpecCoverage, the new column lists the addressing file(s)', () => {
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Should', allowedUserStories: ['US-01'], relatedUCs: ['UC-01'], unscoped: false }])
    const coverage = new Map([['AC-01', { taskIds: new Set(), phaseIds: new Set() }]])
    const techSpecCoverage = new Map([['AC-01', new Set(['a.js'])]])
    const md = renderMatrix('FTR-TEST', acMap, coverage, techSpecCoverage)
    expect(md).toContain('| AC-01 | x | Should | UC-01 | a.js | — | — |')
  })
})

describe('renderMatrix() — Must-AC coverage summary (FTR-026)', () => {
  test('summary counts covered vs. total Must ACs and links index.json', () => {
    const acMap = acMapWith([
      { id: 'AC-01', criterion: 'x', priority: 'Must', allowedUserStories: ['US-01'], relatedUCs: ['UC-01'], unscoped: false },
      { id: 'AC-02', criterion: 'y', priority: 'Must', allowedUserStories: ['US-01'], relatedUCs: ['UC-01'], unscoped: false },
      { id: 'AC-03', criterion: 'z', priority: 'Should', allowedUserStories: ['US-01'], relatedUCs: ['UC-01'], unscoped: false },
    ])
    const coverage = new Map([
      ['AC-01', { taskIds: new Set(['T-01']), phaseIds: new Set(['US-01']) }],
      ['AC-02', { taskIds: new Set(), phaseIds: new Set() }],
      ['AC-03', { taskIds: new Set(), phaseIds: new Set() }],
    ])
    const md = renderMatrix('FTR-TEST', acMap, coverage)
    expect(md).toContain('**Must-AC coverage:** 1/2 covered.')
    expect(md).toContain('[index.json](index.json)')
  })
})

describe('buildMatrixJson() (FTR-026)', () => {
  test('one entry per AC, in table order, with all relation fields populated', () => {
    const acMap = acMapWith([
      { id: 'AC-02', criterion: 'second', priority: 'Must', allowedUserStories: ['US-01'], relatedUCs: ['UC-01'], unscoped: false },
      { id: 'AC-01', criterion: 'first', priority: 'Should', allowedUserStories: [], relatedUCs: [], unscoped: true },
    ])
    const coverage = new Map([
      ['AC-02', { taskIds: new Set(['US-01-TASK-BE-01']), phaseIds: new Set(['US-01']) }],
      ['AC-01', { taskIds: new Set(), phaseIds: new Set() }],
    ])
    const techSpecCoverage = new Map([['AC-02', new Set(['a.js'])]])
    const json = buildMatrixJson('FTR-TEST', acMap, coverage, techSpecCoverage)
    expect(json.prefix).toBe('FTR-TEST')
    expect(typeof json.generatedAt).toBe('string')
    expect(json.acceptanceCriteria).toEqual([
      { id: 'AC-02', criterion: 'second', priority: 'Must', unscoped: false, relatedUCs: ['UC-01'], techSpecFiles: ['a.js'], taskIds: ['US-01-TASK-BE-01'], phaseIds: ['US-01'] },
      { id: 'AC-01', criterion: 'first', priority: 'Should', unscoped: true, relatedUCs: [], techSpecFiles: [], taskIds: [], phaseIds: [] },
    ])
  })
})

describe('ac-task-matrix.js CLI — coverage-matrix/ output (FTR-026)', () => {
  const CLI = path.resolve(__dirname, '../src/claude/scripts/ac-task-matrix.js')
  const WBS = path.resolve(__dirname, 'fixtures/ftr-020-wbs')
  const REQ = path.resolve(__dirname, 'fixtures/ftr-021-req-clean/index.md')
  const SPEC = path.resolve(__dirname, 'fixtures/ftr-024-spec/index.md')
  const PREFIX = 'FTR-TEST'

  function runCli(args) {
    return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
  }

  test('writes coverage-matrix/index.json and index.md under the given feature directory', () => {
    const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-task-matrix-'))
    try {
      const result = runCli([WBS, REQ, SPEC, PREFIX, featureDir])
      expect(result.status).toBe(0)
      const { jsonPath, mdPath } = JSON.parse(result.stdout)
      expect(jsonPath).toBe(path.join(featureDir, 'coverage-matrix', 'index.json'))
      expect(mdPath).toBe(path.join(featureDir, 'coverage-matrix', 'index.md'))
      expect(fs.existsSync(jsonPath)).toBe(true)
      expect(fs.existsSync(mdPath)).toBe(true)
      const written = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
      expect(written.prefix).toBe(PREFIX)
      expect(Array.isArray(written.acceptanceCriteria)).toBe(true)
      const md = fs.readFileSync(mdPath, 'utf8')
      expect(md).toMatch(/\*\*Must-AC coverage:\*\* \d+\/\d+ covered/)
      expect(md).toContain('[index.json](index.json)')
    } finally {
      fs.rmSync(featureDir, { recursive: true, force: true })
    }
  })

  test('creates the coverage-matrix/ subfolder when it does not already exist', () => {
    const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-task-matrix-'))
    try {
      expect(fs.existsSync(path.join(featureDir, 'coverage-matrix'))).toBe(false)
      runCli([WBS, REQ, SPEC, PREFIX, featureDir])
      expect(fs.existsSync(path.join(featureDir, 'coverage-matrix'))).toBe(true)
    } finally {
      fs.rmSync(featureDir, { recursive: true, force: true })
    }
  })

  test('exits 1 with a usage message when featureDir is omitted', () => {
    const result = runCli([WBS, REQ, SPEC, PREFIX])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Usage:')
  })
})
