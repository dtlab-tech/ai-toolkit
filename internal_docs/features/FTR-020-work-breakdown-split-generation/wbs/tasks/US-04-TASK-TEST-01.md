<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Integration test: pm-phase2 resume-by-status dispatches only pending tasks
- **Outcome:** tests/pm-phase2-wbs-resume.test.js exists: a pre-seeded index.json with some tasks already status:"generated" (with existing detail files) and some "pending" is run through pm-phase2.js's per-task loop with a stubbed dispatch counting invocations; asserts exactly the pending tasks dispatch a call and generated tasks are skipped
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-04
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add pm-phase2 resume-by-status integration test

**Implementation notes:**

Check how existing workflow tests stub `c.worker`/dispatch first (e.g.
`tests/cli/pm-phase2-source.test.js`, `tests/cli/workflow-worker-contract.test.js` — reuse
whatever stubbing convention they already establish for `options.dispatch` in
`lib/workflow-control.js`, don't invent a second one). Shape of the test:

```js
test('resume dispatches only pending tasks', async () => {
  const tmpFeatureDir = makeTempFeatureDir()           // real temp dir + git repo, per existing convention
  const wbsDir = path.join(tmpFeatureDir, 'wbs')   // no prefix — matches the no-prefix directory convention
  // Seed: 3 tasks, 2 already "generated" with real detail files on disk, 1 "pending"
  writeIndexJson(wbsDir, {
    tasks: {
      'T-01': { status: 'generated', detailFile: 'tasks/T-01.md', /* ... */ },
      'T-02': { status: 'generated', detailFile: 'tasks/T-02.md', /* ... */ },
      'T-03': { status: 'pending',   detailFile: 'tasks/T-03.md', /* ... */ },
    },
  })
  writeTaskDetailFile(wbsDir, 'T-01'); writeTaskDetailFile(wbsDir, 'T-02')  // T-03 has no file

  let dispatchCount = 0
  const fakeDispatch = () => { dispatchCount++; return fakeWorkerResult(/* valid task detail block */) }

  await runPmPhase2PerTaskLoop(tmpFeatureDir, { dispatch: fakeDispatch })  // call the extracted
  // loop logic directly if pm-phase2.js exposes it as a testable unit (preferred), or run the
  // whole workflow script with options.dispatch stubbed the same way other workflow tests do

  expect(dispatchCount).toBe(1)   // only T-03
  const index = JSON.parse(fs.readFileSync(path.join(wbsDir, 'index.json'), 'utf8'))
  expect(index.tasks['T-03'].status).toBe('generated')
  expect(fs.existsSync(path.join(wbsDir, 'tasks', 'T-03.md'))).toBe(true)
})
```
Also cover the "status says generated but file is missing" edge case (Requirements UC-04: "a task
whose detail file is missing despite a generated status is treated as pending") — seed a task
with `status: 'generated'` and no file, assert it DOES dispatch.

**Verification commands:**

```
npx jest --testPathPattern=tests/pm-phase2-wbs-resume.test.js
```
