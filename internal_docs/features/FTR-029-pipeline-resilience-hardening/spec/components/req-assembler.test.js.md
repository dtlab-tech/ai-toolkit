# tests/req-assembler.test.js — Modified

## Change

New direct unit test for `parseTableHeader`, added alongside this file's existing tests (real
`require()` of `req-assembler.js`, not a mirror).

## Algorithm

```js
describe('parseTableHeader()', () => {
  test('returns the header cells for a well-formed table', () => {
    const content = '## 7. Acceptance Criteria\n\n| ID | Criterion | Related UC | Priority |\n|---|---|---|---|\n| AC-01 | x | UC-01 | Must |\n'
    const { start, end, lines } = findSectionRange(content, 7)
    expect(parseTableHeader(lines, start, end)).toEqual(['ID', 'Criterion', 'Related UC', 'Priority'])
  })

  test('returns null for a section with no table at all', () => {
    const content = '## 7. Acceptance Criteria\n\nNo table here.\n'
    const { start, end, lines } = findSectionRange(content, 7)
    expect(parseTableHeader(lines, start, end)).toBeNull()
  })

  test('excludes the separator row from its result', () => {
    const content = '## 7. Acceptance Criteria\n\n| ID | Criterion | Related UC |\n|---|---|---|\n| AC-01 | x | UC-01 |\n'
    const { start, end, lines } = findSectionRange(content, 7)
    const header = parseTableHeader(lines, start, end)
    expect(header).toEqual(['ID', 'Criterion', 'Related UC'])
    expect(header).not.toContain('---')
  })
})
```

## Tests

This component *is* the test file — no further test file covers it.
