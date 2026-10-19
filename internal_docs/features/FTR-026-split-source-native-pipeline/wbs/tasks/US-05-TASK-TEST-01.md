<a id="task-US-05-TASK-TEST-01"></a>
### US-05-TASK-TEST-01

- **Task ID:** US-05-TASK-TEST-01
- **Title:** Cover bridge-step removal and run the full regression suite
- **Outcome:** tests/integration/workflow-runtime.test.js asserts 'bridge-requirements-tech-spec' no longer appears in c.tokenLedger's activity list and that no {PREFIX}-Requirements.md/{PREFIX}-Tech-Spec.md file is written for a real-split fixture; full npm test suite passes
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-05-TASK-INFRA-01
- **Acceptance criteria:** AC-01, AC-08, AC-09
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase2
- **Commit subject:** cover bridge-step removal and run the full regression suite

**Implementation notes:**

```js
describe('pm-phase2 — bridge step removed', () => {
  test('no bridge-requirements-tech-spec activity and no monolithic file written, for a real-split fixture', async () => {
    const result = await runPmPhase2(featureDir, prefix)
    expect(result.token_ledger.some(a => a.name === 'bridge-requirements-tech-spec')).toBe(false)
    expect(fs.existsSync(`${featureDir}/${prefix}-Requirements.md`)).toBe(false)
    expect(fs.existsSync(`${featureDir}/${prefix}-Tech-Spec.md`)).toBe(false)
  })

  test('legacy fixture still completes successfully with no bridge step and no error', async () => {
    const { featureDir } = buildLegacyFixture()
    const result = await runPmPhase2(featureDir, prefix)
    expect(result.errors).toEqual([])
  })
})
```

Final step: run the complete suite (not just this file) to catch any other test that asserted on the
now-removed bridge activity or an assembled-file read this feature's earlier tasks didn't already
account for.

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js
```

```
npm test
```
