'use strict'

const { parseFileInventoryEntries, checkAddressesResolve, findSubsectionRange } =
  require('../src/claude/scripts/tech-spec-graph-checks')

function techSpec(newFilesRows, modifiedFilesRows, trailingSection = '## 10. Testing Strategy\n') {
  const row = ([p, d, a]) => `| ${p} | ${d} | ${a} |`
  return '## 9. File Inventory\n\n' +
    (newFilesRows ? `### New files\n| Path | Purpose | Addresses |\n|---|---|---|\n${newFilesRows.map(row).join('\n')}\n\n` : '') +
    (modifiedFilesRows ? `### Modified files\n| Path | Change description | Addresses |\n|---|---|---|\n${modifiedFilesRows.map(row).join('\n')}\n\n` : '') +
    trailingSection
}

describe('parseFileInventoryEntries()', () => {
  test('parses both tables when both are present', () => {
    const content = techSpec([['a.js', 'new', 'AC-01']], [['b.js', 'changed', '—']])
    const entries = parseFileInventoryEntries(content)
    expect(entries).toEqual([
      { filePath: 'a.js', acIds: ['AC-01'] },
      { filePath: 'b.js', acIds: [] },
    ])
  })

  test('a dash cell yields an empty acIds array', () => {
    const content = techSpec([['a.js', 'new', '—']], null)
    expect(parseFileInventoryEntries(content)[0].acIds).toEqual([])
  })

  test('a multi-AC cell is split and trimmed', () => {
    const content = techSpec([['a.js', 'new', 'AC-01, AC-02']], null)
    expect(parseFileInventoryEntries(content)[0].acIds).toEqual(['AC-01', 'AC-02'])
  })

  test('one table missing (e.g. a pure-addition feature with no modified files) is valid', () => {
    const content = techSpec([['a.js', 'new', 'AC-01']], null)
    expect(parseFileInventoryEntries(content)).toEqual([{ filePath: 'a.js', acIds: ['AC-01'] }])
  })
})

describe('checkAddressesResolve()', () => {
  test('passes when every AC ID exists', () => {
    const entries = [{ filePath: 'a.js', acIds: ['AC-01'] }]
    expect(checkAddressesResolve(entries, ['AC-01', 'AC-02'])).toHaveLength(0)
  })

  test('flags a dangling AC reference, naming the file and the AC', () => {
    const entries = [{ filePath: 'a.js', acIds: ['AC-99'] }]
    const errors = checkAddressesResolve(entries, ['AC-01'])
    expect(errors).toHaveLength(1)
    expect(errors[0].filePath).toBe('a.js')
    expect(errors[0].acId).toBe('AC-99')
  })
})

describe('findSubsectionRange()', () => {
  test('a subsection followed by another heading stops before it', () => {
    const lines = ['## 9. File Inventory', '', '### New files', '| a |', '', '### Modified files', '| b |']
    const sub = findSubsectionRange(lines, 0, lines.length, 'New files')
    expect(lines.slice(sub.start, sub.end)).toEqual(['### New files', '| a |', ''])
  })

  test('a subsection with nothing after it runs to the given end', () => {
    const lines = ['## 9. File Inventory', '', '### Modified files', '| b |']
    const sub = findSubsectionRange(lines, 0, lines.length, 'Modified files')
    expect(sub.end).toBe(lines.length)
  })

  test('returns null when the heading is absent', () => {
    const lines = ['## 9. File Inventory', '### New files', '| a |']
    expect(findSubsectionRange(lines, 0, lines.length, 'Modified files')).toBeNull()
  })
})
