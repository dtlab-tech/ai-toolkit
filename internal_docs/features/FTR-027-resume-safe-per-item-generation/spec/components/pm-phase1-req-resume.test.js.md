# tests/pm-phase1-req-resume.test.js — Modified

## Change

Updates the hand-synced mirror (`selectPendingUcIds`) and its source-text guard to match
`pm-phase1.js`'s new validity-aware resume condition (UC-02).

## Algorithm

```js
// Source-text guard — updated literal:
expect(PM_PHASE1_SOURCE).toContain(
  'if (!regenSkeleton && c.exists(ucPath) && isValidUseCaseFile(c.read(ucPath), row.id)) continue')

// Mirror function — gains an isValidFn parameter:
function selectPendingUcIds(ucTable, reqDir, existsFn, regenSkeleton, isValidFn) {
  return ucTable.filter(row => {
    const path = `${reqDir}/${row.file}`
    return !(!regenSkeleton && existsFn(path) && isValidFn(path, row.id))
  }).map(row => row.id)
}
```

New test cases, alongside the existing four:
```js
test('a UC file that exists but fails the validity check is treated as pending, not trusted on existence alone', () => {
  const ucTable = [{ id: 'UC-01', file: 'use-cases/UC-01.md' }, { id: 'UC-02', file: 'use-cases/UC-02.md' }]
  const existing = new Set(['/req/use-cases/UC-01.md', '/req/use-cases/UC-02.md'])
  const isValidFn = (path) => path.endsWith('UC-01.md') // UC-02's file exists but is "invalid"
  expect(selectPendingUcIds(ucTable, '/req', p => existing.has(p), false, isValidFn)).toEqual(['UC-02'])
})
```

## Tests

This component *is* the test file — no further test file covers it.
