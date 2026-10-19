<a id="task-US-02-TASK-TEST-02"></a>
### US-02-TASK-TEST-02

- **Task ID:** US-02-TASK-TEST-02
- **Title:** Cover invalid/valid use-case resume behavior end to end
- **Outcome:** tests/integration/workflow-runtime.test.js has passing tests: a use-case file starting with the wrong UC heading is regenerated on resume; a correctly-headed one is still skipped
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-04, AC-05
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase1
- **Commit subject:** cover invalid/valid use-case resume behavior end to end

**Implementation notes:**

Add to `tests/integration/workflow-runtime.test.js`:

```js
describe('FTR-027 — Requirements use-case resume validity', () => {
  test('a UC file starting with the wrong heading is regenerated, not skipped', async () => {
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: jest.fn(phase1Dispatch) })
    fs.writeFileSync(path.join(f.dir, 'req', 'use-cases', 'UC-01.md'), '### UC-02: Wrong use case\n\nGarbled.\n')
    const dispatchFn = jest.fn(phase1Dispatch)
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn })
    const calledAgents = dispatchFn.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1])
    expect(calledAgents).toContain('gaia-generate-requirements-use-case')
    expect(calledAgents).not.toContain('gaia-generate-requirements') // skeleton still fresh
  })

  test('a valid UC file is still skipped on resume (no regression)', async () => {
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: jest.fn(phase1Dispatch) })
    const dispatchFn = jest.fn(phase1Dispatch)
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn })
    const calledAgents = dispatchFn.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1])
    expect(calledAgents).not.toContain('gaia-generate-requirements-use-case')
  })
})
```

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js
```
