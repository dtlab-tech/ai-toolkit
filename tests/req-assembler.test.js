'use strict'

const fs = require('fs')
const path = require('path')
const { loadRequirements, parseUseCaseIndexTable, AssemblyError } =
  require('../src/claude/scripts/req-assembler')

const FIXTURE = path.join(__dirname, 'fixtures', 'ftr-021-req')
const FIXTURE_WITH_UI = path.join(__dirname, 'fixtures', 'ftr-021-req-with-ui')
const FIXTURE_NO_INDEX = path.join(__dirname, 'fixtures', 'ftr-021-req-no-index')
const FIXTURE_MISSING_UC = path.join(__dirname, 'fixtures', 'ftr-021-req-missing-uc')
const FIXTURE_EMPTY_TABLE = path.join(__dirname, 'fixtures', 'ftr-021-req-empty-table')
const LEGACY_FIXTURE = path.join(__dirname, 'fixtures', 'ftr-021-requirements-legacy.md')

describe('loadRequirements() — split directory format', () => {
  test('reconstructs all 9 sections in order', () => {
    const doc = loadRequirements(FIXTURE)
    const sectionNumbers = [...doc.matchAll(/^## (\d+)\.\s/gm)].map(m => Number(m[1]))
    expect(sectionNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  test('Section 2 is built from UC files in index-table order', () => {
    const doc = loadRequirements(FIXTURE)
    const ucTable = parseUseCaseIndexTable(fs.readFileSync(path.join(FIXTURE, 'index.md'), 'utf8'))
    const positions = ucTable.map(row => doc.indexOf(`### ${row.id}:`))
    expect(positions.every(p => p !== -1)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  test('Section 2 contains the full UC body (main flow, postconditions), not just the index table', () => {
    const doc = loadRequirements(FIXTURE)
    expect(doc).toMatch(/### UC-01: Do the first thing[\s\S]+\*\*Main flow:\*\*[\s\S]+\*\*Postconditions:\*\*/)
    expect(doc).toMatch(/### UC-02: Do the second thing/)
  })

  test('every other section is carried through unchanged from index.md', () => {
    const doc = loadRequirements(FIXTURE)
    expect(doc).toContain('## 3. Business Rules')
    expect(doc).toContain('BR-01')
    expect(doc).toContain('## 8. Dependencies & Assumptions')
  })

  test('a fixture with non-empty UI Requirements (Section 6) round-trips its content', () => {
    const doc = loadRequirements(FIXTURE_WITH_UI)
    expect(doc).toMatch(/## 6\. UI Requirements[\s\S]+### 6\.1 Pages \/ Screens[\s\S]+First Thing Page/)
  })
})

describe('loadRequirements() — legacy monolithic file (AC-07)', () => {
  test('returns the file content unchanged', () => {
    expect(loadRequirements(LEGACY_FIXTURE)).toBe(fs.readFileSync(LEGACY_FIXTURE, 'utf8'))
  })
})

describe('loadRequirements() — structured errors (AC-05)', () => {
  test('missing index.md names the exact path', () => {
    expect(() => loadRequirements(FIXTURE_NO_INDEX)).toThrow(AssemblyError)
    expect(() => loadRequirements(FIXTURE_NO_INDEX)).toThrow(/index\.md/)
  })

  test('missing a referenced UC file names the exact path', () => {
    expect(() => loadRequirements(FIXTURE_MISSING_UC)).toThrow(AssemblyError)
    expect(() => loadRequirements(FIXTURE_MISSING_UC)).toThrow(/UC-02/)
  })

  test('an empty use-case table is rejected', () => {
    expect(() => loadRequirements(FIXTURE_EMPTY_TABLE)).toThrow(/no rows/)
  })

  test('a nonexistent path is rejected', () => {
    expect(() => loadRequirements(path.join(__dirname, 'fixtures', 'does-not-exist'))).toThrow(AssemblyError)
  })
})
