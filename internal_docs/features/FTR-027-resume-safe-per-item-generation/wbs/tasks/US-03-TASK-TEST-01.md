<a id="task-US-03-TASK-TEST-01"></a>
### US-03-TASK-TEST-01

- **Task ID:** US-03-TASK-TEST-01
- **Title:** Update pm-phase2-flow.js and pm-phase2-wbs-resume.test.js for the task validity condition
- **Outcome:** tests/helpers/pm-phase2-flow.js's selectPendingTaskIds gains an isValidFn parameter; tests/pm-phase2-wbs-resume.test.js's source-text guard and all call sites are updated, plus a new test case for the invalid-but-generated task
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-06, AC-07
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase2-wbs-resume
- **Commit subject:** cover the task validity condition in the resume mirror

**Implementation notes:**

Edit `tests/helpers/pm-phase2-flow.js`:

```js
function selectPendingTaskIds(index, wbsDir, existsFn, isValidFn) {
  const pending = []
  for (const phase of index.phases) {
    for (const taskId of phase.taskIds) {
      const task = index.tasks[taskId]
      const detailPath = `${wbsDir}/${task.detailFile}`
      if (task.status === 'generated' && existsFn(detailPath) && isValidFn(detailPath)) continue
      pending.push(taskId)
    }
  }
  return pending
}
```

Edit `tests/pm-phase2-wbs-resume.test.js`:

```js
// Source-text guard — updated literal:
expect(PM_PHASE2_SOURCE).toContain(
  "task.status === 'generated' && c.exists(detailPath) && hasVerificationCommands(c.read(detailPath))")

// All 4 existing selectPendingTaskIds(...) call sites gain a 4th argument, () => true, so they
// keep asserting exactly what they did before this feature.

// New test case:
test('a "generated" task whose file exists but has no verification commands is treated as pending', () => {
  const index = makeIndex({ 'T-01': 'generated', 'T-02': 'generated' })
  const existing = new Set(['/wbs/tasks/T-01.md', '/wbs/tasks/T-02.md'])
  const isValidFn = (p) => p.endsWith('T-01.md')
  const pending = selectPendingTaskIds(index, '/wbs', p => existing.has(p), isValidFn)
  expect(pending).toEqual(['T-02'])
})
```

**Verification commands:**

```
npm test -- tests/pm-phase2-wbs-resume.test.js
```
