<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Cover invalid/valid Tech-Spec component resume behavior end to end
- **Outcome:** tests/integration/workflow-runtime.test.js has passing tests: an invalid-but-present component file is regenerated on resume; a valid one is still skipped; the outer gate alone (before the per-component loop) detects an invalid file the same way it already detects a missing one
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-01, AC-02, AC-03
- **Estimate — agent minutes:** 22
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Covers three closely related resume-behavior assertions (invalid regenerated, valid skipped, outer-gate detection) against the same two-component fixture already established by the neighboring "resume-by-existence dispatches only missing components" test, rather than three separate test tasks that would each re-set-up the identical fixture.
- **Commit type:** test
- **Commit scope:** pm-phase1
- **Commit subject:** cover invalid/valid Tech-Spec component resume behavior

**Implementation notes:**

Add to `tests/integration/workflow-runtime.test.js`, reusing the existing
`twoComponentSkeletonDoc`/`componentDetail` fixture helpers from the neighboring
"pm-phase1 Tech-Spec resume-by-existence dispatches only missing components" test:

```js
describe('FTR-027 — Tech-Spec component resume validity', () => {
  test('a component missing its ## Change section is regenerated, not skipped', async () => {
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: jest.fn(dispatch) })
    fs.writeFileSync(path.join(f.dir, 'spec', 'components', 'a.js.md'), '# a.js — New\n\nNo Change heading here.\n')
    const dispatchFn = jest.fn(dispatch)
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn })
    const componentCalls = dispatchFn.mock.calls.map(([o]) => o)
      .filter(o => o.args[o.args.indexOf('--agent') + 1] === 'gaia-generate-tech-spec-component')
    expect(componentCalls.some(c => c.prompt.includes('Path: a.js'))).toBe(true)
    const skeletonCalls = dispatchFn.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1])
    expect(skeletonCalls).not.toContain('gaia-generate-tech-spec') // skeleton still fresh
  })

  test('a valid component is still skipped on resume (no regression)', async () => {
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: jest.fn(dispatch) })
    const dispatchFn = jest.fn(dispatch)
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn })
    const componentCalls = dispatchFn.mock.calls.map(([o]) => o)
      .filter(o => o.args[o.args.indexOf('--agent') + 1] === 'gaia-generate-tech-spec-component')
    expect(componentCalls).toHaveLength(0)
  })
})
```

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js
```
