# tests/integration/workflow-runtime.test.js — Modified

## Change

New end-to-end tests covering AC-01 through AC-08: an invalid-but-present component/use-case/task
file is regenerated on resume (not permanently skipped); a genuinely valid one is still skipped,
unchanged from today; the Requirements/Tech-Spec outer regen gates react to an invalid file the same
way they already react to a missing one.

## Algorithm

```js
describe('FTR-027 — resume regenerates an invalid-but-present item instead of trusting existence alone', () => {
  test('a Tech-Spec component missing its ## Change section is regenerated, not skipped', async () => {
    // Seed a real split feature: spec/index.md fresh, one component file written WITHOUT a
    // "## Change" heading (simulating the real production incident's fence-wrap corruption, now
    // separately fixed at the source — this test guards the independent resume-safety net).
    // ... existing two-component skeleton/dispatch fixture, reused from the neighboring
    // "resume-by-existence dispatches only missing components" test ...
    fs.writeFileSync(path.join(f.dir, 'spec', 'components', 'a.js.md'), '# a.js — New\n\nNo Change heading here.\n')
    const dispatchFn = jest.fn(dispatch)
    const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn })
    const componentCalls = dispatchFn.mock.calls.map(([o]) => o)
      .filter(o => o.args[o.args.indexOf('--agent') + 1] === 'gaia-generate-tech-spec-component')
    expect(componentCalls.some(c => c.prompt.includes('Path: a.js'))).toBe(true) // regenerated, not skipped
    expect(result.validation.summary).toContain('clean')
  })

  test('a valid Tech-Spec component is still skipped on resume (no regression)', async () => {
    // ... same fixture, a.js.md left as a genuinely valid component file ...
    // asserts componentCalls does NOT include a.js
  })

  test('the outer gate alone detects an invalid component file before any per-item dispatch', async () => {
    // Writes an invalid a.js.md, asserts gaia-generate-tech-spec itself is NOT re-dispatched
    // (skeleton still fresh) while gaia-generate-tech-spec-component IS, for exactly a.js —
    // proving the outer anyComponentFileMissing-style gate, not just the inner loop, caught it.
  })

  test('a use-case file starting with the wrong UC heading is regenerated, not skipped', async () => {
    fs.writeFileSync(path.join(f.dir, 'req', 'use-cases', 'UC-01.md'), '### UC-02: Wrong use case\n\nGarbled.\n')
    // asserts gaia-generate-requirements-use-case is dispatched again for UC-01
  })

  test('a valid use-case file is still skipped on resume (no regression)', async () => {
    // asserts a correctly-headed UC-01.md is NOT re-dispatched
  })

  test('a Work Breakdown task marked generated with zero verification commands is regenerated', async () => {
    // Writes a task detail file with a "**Verification commands:**" marker but no fenced command
    // block after it, status already "generated" in index.json; asserts
    // gaia-generate-work-breakdown-task is dispatched again for that task, not skipped.
  })

  test('a valid Work Breakdown task (at least one verification command) is still skipped (no regression)', async () => {
    // existing taskDetailDoc() fixture already includes one fenced command — asserts it is NOT
    // re-dispatched on a second run with status already "generated".
  })
})
```

## Tests

This component *is* the test file — no further test file covers it.
