<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Cover the semantic validator split-source prompt path
- **Outcome:** tests/integration/workflow-runtime.test.js asserts the gaia.agent.planner.validate-work-breakdown mock dispatch receives reqIndexPath for a real-split fixture and the legacy path for a legacy fixture
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-04, AC-07
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase2
- **Commit subject:** cover the semantic validator split-source prompt path

**Implementation notes:**

```js
describe('pm-phase2 — semantic validator prompt path', () => {
  test('receives reqIndexPath for a real-split fixture', async () => {
    const workerSpy = jest.spyOn(mockControl, 'worker')
    await runPmPhase2(featureDir, prefix)
    const call = workerSpy.mock.calls.find(([name]) => name === 'gaia.agent.planner.validate-work-breakdown')
    expect(call[1]).toContain(`${featureDir}/req/index.md`)
    expect(call[1]).not.toContain(`${prefix}-Requirements.md`)
  })

  test('falls back to the legacy monolithic path for a legacy fixture', async () => {
    const { featureDir } = buildLegacyFixture()
    const workerSpy = jest.spyOn(mockControl, 'worker')
    await runPmPhase2(featureDir, prefix)
    const call = workerSpy.mock.calls.find(([name]) => name === 'gaia.agent.planner.validate-work-breakdown')
    expect(call[1]).toContain(`${prefix}-Requirements.md`)
  })
})
```

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js
```
