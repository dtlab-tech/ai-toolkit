<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Update the pm-phase1-req-resume.test.js mirror and source-text guard
- **Outcome:** tests/pm-phase1-req-resume.test.js's selectPendingUcIds mirror gains an isValidFn parameter and a new test case; its source-text guard asserts the updated literal condition
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-04, AC-05
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 16000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase1-req-resume
- **Commit subject:** cover the use-case validity condition in the resume mirror

**Implementation notes:**

Edit `tests/pm-phase1-req-resume.test.js`:

```js
// Source-text guard — updated literal:
expect(PM_PHASE1_SOURCE).toContain(
  'if (!regenSkeleton && c.exists(ucPath) && isValidUseCaseFile(c.read(ucPath), row.id)) continue')

// Mirror function — gains an isValidFn parameter (all 4 existing call sites updated to pass one):
function selectPendingUcIds(ucTable, reqDir, existsFn, regenSkeleton, isValidFn) {
  return ucTable.filter(row => {
    const p = `${reqDir}/${row.file}`
    return !(!regenSkeleton && existsFn(p) && isValidFn(p, row.id))
  }).map(row => row.id)
}

// New test case:
test('a UC file that exists but fails the validity check is treated as pending, not trusted on existence alone', () => {
  const ucTable = [{ id: 'UC-01', file: 'use-cases/UC-01.md' }, { id: 'UC-02', file: 'use-cases/UC-02.md' }]
  const existing = new Set(['/req/use-cases/UC-01.md', '/req/use-cases/UC-02.md'])
  const isValidFn = (p) => p.endsWith('UC-01.md')
  expect(selectPendingUcIds(ucTable, '/req', p => existing.has(p), false, isValidFn)).toEqual(['UC-02'])
})
```

Update the 4 PRE-EXISTING test cases' call sites too, passing `() => true` as `isValidFn` so they
keep asserting exactly what they did before this feature.

**Verification commands:**

```
npm test -- tests/pm-phase1-req-resume.test.js
```
