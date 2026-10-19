# tests/pm-phase2-wbs-resume.test.js — Modified

## Change

Updates the source-text guard and `selectPendingTaskIds` call sites for `pm-phase2.js`'s new
validity-aware resume condition (UC-03).

## Algorithm

```js
// Source-text guard — updated literal:
expect(PM_PHASE2_SOURCE).toContain(
  "task.status === 'generated' && c.exists(detailPath) && hasVerificationCommands(c.read(detailPath))")

// Every existing selectPendingTaskIds(...) call site gains a 4th argument — by default an
// always-true isValidFn, so the four pre-existing tests keep asserting exactly what they did
// before this feature (this feature only ADDS a new failure mode, it doesn't change the meaning
// of "exists" for the pre-existing tests):
const alwaysValid = () => true
selectPendingTaskIds(index, '/wbs', p => existing.has(p), alwaysValid)

// New test case:
test('a "generated" task whose file exists but has no verification commands is treated as pending', () => {
  const index = makeIndex({ 'T-01': 'generated', 'T-02': 'generated' })
  const existing = new Set(['/wbs/tasks/T-01.md', '/wbs/tasks/T-02.md'])
  const isValidFn = (path) => path.endsWith('T-01.md') // T-02's file exists but has no commands
  const pending = selectPendingTaskIds(index, '/wbs', p => existing.has(p), isValidFn)
  expect(pending).toEqual(['T-02'])
})
```

## Tests

This component *is* the test file — no further test file covers it.
