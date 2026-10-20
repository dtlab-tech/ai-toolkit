# tests/req-graph-checks.test.js — Modified

## Change

New direct unit tests for `checkAcTableHeader`, added alongside this file's existing tests (real
`require()` of `req-graph-checks.js`, not a mirror).

## Algorithm

```js
describe('checkAcTableHeader()', () => {
  test('a correct 4-column header produces no errors', () => {
    expect(checkAcTableHeader(['ID', 'Criterion', 'Related UC', 'Priority'])).toEqual([])
  })

  test('a correct 3-column header (no trailing Priority) also produces no errors', () => {
    expect(checkAcTableHeader(['ID', 'Criterion', 'Related UC'])).toEqual([])
  })

  test('fewer than 3 columns produces one MALFORMED_AC_TABLE_HEADER error', () => {
    const errors = checkAcTableHeader(['ID', 'Criterion'])
    expect(errors).toHaveLength(1)
    expect(errors[0].category).toBe('MALFORMED_AC_TABLE_HEADER')
  })

  test('a 5-column header (Given/When/Then split) produces one MALFORMED_AC_TABLE_HEADER error', () => {
    const errors = checkAcTableHeader(['ID', 'Given', 'When', 'Then', 'Priority'])
    expect(errors).toHaveLength(1)
    expect(errors[0].category).toBe('MALFORMED_AC_TABLE_HEADER')
    expect(errors[0].message).toContain('"ID", "Given", "When"')
  })

  test('null header (no table found) produces one MALFORMED_AC_TABLE_HEADER error', () => {
    const errors = checkAcTableHeader(null)
    expect(errors).toHaveLength(1)
    expect(errors[0].category).toBe('MALFORMED_AC_TABLE_HEADER')
  })
})
```

## Tests

This component *is* the test file — no further test file covers it.
