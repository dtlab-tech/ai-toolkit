# tests/req-skeleton-check.test.js — Modified

## Change

New end-to-end CLI fixture tests covering AC-05/AC-06: a malformed AC-table header fails with the
new `MALFORMED_AC_TABLE_HEADER` category, before any `DANGLING_AC_UC_REFERENCE` noise; a correct
header is unaffected.

## Algorithm

New fixtures under `tests/fixtures/`, mirroring the existing `ftr-021-req-*` naming convention:

- `ftr-029-req-malformed-ac-header/index.md` — Section 7's AC table has 5 columns
  (`ID | Given | When | Then | Priority`), otherwise a clean, complete skeleton (reusing the
  existing `ftr-021-req-clean` fixture's other sections).
- `ftr-029-req-ac-header-no-priority/index.md` — Section 7's AC table has exactly 3 columns
  (`ID | Criterion | Related UC`, no `Priority`) — the BR-03 tolerance case.

```js
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
```

## Tests

This component *is* the test file — no further test file covers it.
