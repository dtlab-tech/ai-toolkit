'use strict'

const fs = require('fs')
const path = require('path')
const { loadTechSpec, AssemblyError } = require('../src/claude/scripts/tech-spec-assembler')

const FIXTURE = path.join(__dirname, 'fixtures', 'ftr-024-spec')
const LEGACY_FIXTURE = path.join(__dirname, 'fixtures', 'ftr-024-tech-spec-legacy.md')
const FIXTURE_NO_INDEX = path.join(__dirname, 'fixtures', 'ftr-024-spec-no-index')
const FIXTURE_MISSING_COMPONENT = path.join(__dirname, 'fixtures', 'ftr-024-spec-missing-component')
const FIXTURE_EMPTY_TABLE = path.join(__dirname, 'fixtures', 'ftr-024-spec-empty-table')

describe('loadTechSpec() — split directory format', () => {
  test('reconstructs all 12 sections in order', () => {
    const doc = loadTechSpec(FIXTURE)
    const sectionNumbers = [...doc.matchAll(/^## (\d+)\.\s/gm)].map(m => Number(m[1]))
    expect(sectionNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  test('Section 9 is reduced back to the 3-column Path|Purpose-or-Change|Addresses shape, with correct New/Modified split', () => {
    const doc = loadTechSpec(FIXTURE)
    const section9 = doc.split('## 9.')[1].split('## 10.')[0]
    expect(section9).toContain('| Path | Purpose-or-Change | Addresses |')
    expect(section9).not.toContain('Domain')
    expect(section9).not.toContain('Spec |')
    const newFilesBlock = section9.split('### New files')[1].split('### Modified files')[0]
    const modifiedFilesBlock = section9.split('### Modified files')[1]
    expect(newFilesBlock).toContain('src/example-be.js')
    expect(newFilesBlock).toContain('src/example-fe.tsx')
    expect(newFilesBlock).not.toContain('infra/deploy.yml')
    expect(modifiedFilesBlock).toContain('infra/deploy.yml')
    expect(modifiedFilesBlock).not.toContain('src/example-be.js')
  })

  test('a BE-domain component\'s detail lands under Section 3, not 4 or 5', () => {
    const doc = loadTechSpec(FIXTURE)
    const section3 = doc.split('## 3.')[1].split('## 4.')[0]
    expect(section3).toContain('src/example-be.js')
    const section4 = doc.split('## 4.')[1].split('## 5.')[0]
    expect(section4).not.toContain('src/example-be.js')
  })

  test('an FE-domain component lands under Section 4', () => {
    const doc = loadTechSpec(FIXTURE)
    const section4 = doc.split('## 4.')[1].split('## 5.')[0]
    expect(section4).toContain('src/example-fe.tsx')
  })

  test('an unclassified-domain component (DevOps) lands under Section 5', () => {
    const doc = loadTechSpec(FIXTURE)
    const section5 = doc.split('## 5.')[1].split('## 6.')[0]
    expect(section5).toContain('infra/deploy.yml')
  })

  test('Section 10 contains every component\'s own Tests subsection, in Components-table order', () => {
    const doc = loadTechSpec(FIXTURE)
    const section10 = doc.split('## 10.')[1].split('## 11.')[0]
    const positions = ['src/example-be.js', 'src/example-fe.tsx', 'infra/deploy.yml'].map(p => section10.indexOf(p))
    expect(positions.every(p => p !== -1)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(section10).toContain("doExampleWork('x')")
  })
})

describe('loadTechSpec() — legacy monolithic file (AC-06)', () => {
  test('returns the file content unchanged', () => {
    expect(loadTechSpec(LEGACY_FIXTURE)).toBe(fs.readFileSync(LEGACY_FIXTURE, 'utf8'))
  })
})

describe('loadTechSpec() — structured errors (AC-05)', () => {
  test('missing index.md names the exact path', () => {
    expect(() => loadTechSpec(FIXTURE_NO_INDEX)).toThrow(AssemblyError)
    expect(() => loadTechSpec(FIXTURE_NO_INDEX)).toThrow(/index\.md/)
  })

  test('missing a referenced component file names the exact path', () => {
    expect(() => loadTechSpec(FIXTURE_MISSING_COMPONENT)).toThrow(AssemblyError)
    expect(() => loadTechSpec(FIXTURE_MISSING_COMPONENT)).toThrow(/example-be\.js/)
  })

  test('an empty Components table is rejected', () => {
    expect(() => loadTechSpec(FIXTURE_EMPTY_TABLE)).toThrow(/no rows/)
  })

  test('a nonexistent path is rejected', () => {
    expect(() => loadTechSpec(path.join(__dirname, 'fixtures', 'does-not-exist'))).toThrow(AssemblyError)
  })
})
