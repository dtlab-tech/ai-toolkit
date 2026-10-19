<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Cover matched and fallback per-task Tech-Spec excerpts
- **Outcome:** tests/integration/workflow-runtime.test.js asserts a task whose acceptanceCriteria matches exactly one component's Addresses column receives only that component's body, and a task matching no component receives the full Components table
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-01, US-04-TASK-BE-02
- **Acceptance criteria:** AC-06, AC-07
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase2
- **Commit subject:** cover matched and fallback per-task Tech-Spec excerpts

**Implementation notes:**

```js
describe('pm-phase2 — per-task Tech-Spec excerpt', () => {
  test('a task matching exactly one component receives only that component\'s body', async () => {
    const workerSpy = jest.spyOn(mockControl, 'worker')
    await runPmPhase2(featureDirWithTwoComponents, prefix) // fixture: 2 components, distinct Addresses
    const call = workerSpy.mock.calls.find(([name, prompt]) =>
      name === 'gaia.agent.planner.work-breakdown-task' && prompt.includes('TASK-01'))
    expect(call[1]).toContain('componentA.js')
    expect(call[1]).not.toContain('componentB.js')
  })

  test('a task matching no component receives the full Components table', async () => {
    const workerSpy = jest.spyOn(mockControl, 'worker')
    await runPmPhase2(featureDirWithUnmatchedTask, prefix)
    const call = workerSpy.mock.calls.find(([name, prompt]) =>
      name === 'gaia.agent.planner.work-breakdown-task' && prompt.includes('TASK-GLUE'))
    expect(call[1]).toContain('full Components table below')
    expect(call[1]).toContain('componentA.js')
    expect(call[1]).toContain('componentB.js')
  })

  test('a legacy fixture (no spec/) still inlines the full assembled Tech-Spec text', async () => {
    const { featureDir } = buildLegacyFixture()
    const workerSpy = jest.spyOn(mockControl, 'worker')
    await runPmPhase2(featureDir, prefix)
    const call = workerSpy.mock.calls.find(([name]) => name === 'gaia.agent.planner.work-breakdown-task')
    expect(call[1]).toContain('Tech-Spec:\n') // full legacy text, unchanged shape
  })
})
```

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js
```
