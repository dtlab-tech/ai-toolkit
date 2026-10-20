'use strict'

const { execFileSync } = require('child_process')
const path = require('path')

const SCRIPT = path.join(__dirname, '../src/claude/scripts/req-skeleton-check.js')
const FIXTURES = path.join(__dirname, 'fixtures')

function run(fixtureRelPath) {
  try {
    const stdout = execFileSync('node', [SCRIPT, path.join(FIXTURES, fixtureRelPath)], { encoding: 'utf8' })
    return { exitCode: 0, report: JSON.parse(stdout) }
  } catch (e) {
    return { exitCode: e.status, report: JSON.parse(e.stdout) }
  }
}

test('exits 0 on a clean index.md', () => {
  const { exitCode, report } = run('ftr-021-req-clean/index.md')
  expect(exitCode).toBe(0)
  expect(report.valid).toBe(true)
  expect(report.errors).toHaveLength(0)
})

test('exits 1 with findings on a dangling cross-reference', () => {
  const { exitCode, report } = run('ftr-021-req-dangling-ref/index.md')
  expect(exitCode).toBe(1)
  expect(report.valid).toBe(false)
  expect(report.errors.some(e => e.category === 'DANGLING_AC_UC_REFERENCE')).toBe(true)
})

test('exits 2 on an unparseable index.md (no Use Cases table)', () => {
  const { exitCode, report } = run('ftr-021-req-unparseable/index.md')
  expect(exitCode).toBe(2)
  expect(report.valid).toBe(false)
})

test('exits 2 with a usage message when no path argument is given', () => {
  expect(() => execFileSync('node', [SCRIPT], { encoding: 'utf8' })).toThrow()
})

test('exits 1 with MALFORMED_AC_TABLE_HEADER on a malformed AC table header, no dangling-reference noise', () => {
  const { exitCode, report } = run('ftr-029-req-malformed-ac-header/index.md')
  expect(exitCode).toBe(1)
  expect(report.valid).toBe(false)
  expect(report.errors.some(e => e.category === 'MALFORMED_AC_TABLE_HEADER')).toBe(true)
  expect(report.errors.some(e => e.category === 'DANGLING_AC_UC_REFERENCE')).toBe(false)
})

test('exits 0 on an AC table missing only the trailing Priority column', () => {
  const { exitCode, report } = run('ftr-029-req-ac-header-no-priority/index.md')
  expect(exitCode).toBe(0)
  expect(report.valid).toBe(true)
})
