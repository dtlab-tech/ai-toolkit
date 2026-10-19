# tests/helpers/pm-phase2-flow.js — Modified

## Change

`selectPendingTaskIds` gains an `isValidFn` parameter, mirroring `pm-phase2.js`'s new
`hasVerificationCommands` validity check (UC-03).

## Algorithm

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

Existing callers that don't care about validity (none currently, besides the one updated alongside
this change — see `pm-phase2-wbs-resume.test.js`'s own component) would need to pass an
always-true `isValidFn`; there are none left unaddressed, since this helper has exactly one caller
in this test suite.

## Tests

No dedicated test file — this is a shared test helper, exercised by
`tests/pm-phase2-wbs-resume.test.js`'s own test cases (see that file's component).
