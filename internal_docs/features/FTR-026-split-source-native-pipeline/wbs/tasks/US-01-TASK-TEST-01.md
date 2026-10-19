<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Cover digest parity, repointed call sites, and the legacy fallback
- **Outcome:** tests/integration/workflow-runtime.test.js has passing tests asserting: (a) the in-memory digest matches pm-phase1.js's own digest for an unchanged real-split fixture, (b) wb-skeleton-check.js/wb-validate.js receive reqIndexPath for a real-split fixture and ac-task-matrix.js receives reqIndexPath/specIndexPath/featureDir with gate2_payload exposing the new coverage-matrix paths, (c) all of the above fall back to the legacy monolithic paths for a feature fixture with no req//spec/ directories
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01, US-01-TASK-BE-02
- **Acceptance criteria:** AC-02, AC-03, AC-07
- **Estimate — agent minutes:** 24
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** Covers three related call sites (digest, wb-skeleton-check/wb-validate, ac-task-matrix) plus their shared legacy-fallback path in one file-focused test task, rather than three near-identical test tasks that would each re-set-up the same two fixtures.
- **Commit type:** test
- **Commit scope:** pm-phase2
- **Commit subject:** cover digest parity, repointed call sites, and legacy fallback

**Implementation notes:**

Add to `tests/integration/workflow-runtime.test.js`, reusing the existing real-split and
legacy fixture helpers already in this file (the same two fixture shapes FTR-025's own
`'pm-phase2 — bridge step (real split sources)'`/`'... (legacy, no split sources)'` blocks used):

```js
describe('pm-phase2 — digest recomputation and repointed call sites', () => {
  test('in-memory digest matches pm-phase1\'s own digest for an unchanged real-split fixture', async () => {
    const { reqDir, specDir } = buildRealSplitFixture() // existing helper
    const p1Digest = computeExpectedDigest(reqDir, specDir) // existing helper, reused from pm-phase1 tests
    const result = await runPmPhase2(featureDir, prefix)
    expect(result.gate1DigestUsed).toBe(p1Digest) // or whatever the test harness exposes
  })

  test('wb-skeleton-check/wb-validate/ac-task-matrix receive split index paths for a real-split fixture', async () => {
    const commandSpy = jest.spyOn(mockControl, 'command')
    const result = await runPmPhase2(featureDir, prefix)
    const skeletonCheckCall = commandSpy.mock.calls.find(([a]) => a[1] === 'scripts/wb-skeleton-check.js')
    expect(skeletonCheckCall[0]).toContain(`${featureDir}/req/index.md`)
    const matrixCall = commandSpy.mock.calls.find(([a]) => a[1] === 'scripts/ac-task-matrix.js')
    expect(matrixCall[0]).toContain(`${featureDir}/req/index.md`)
    expect(matrixCall[0]).toContain(`${featureDir}/spec/index.md`)
    expect(matrixCall[0]).toContain(featureDir)
    expect(result.gate2_payload.ac_task_matrix_json_path).toBe(`${featureDir}/coverage-matrix/index.json`)
    expect(result.gate2_payload.ac_task_matrix_md_path).toBe(`${featureDir}/coverage-matrix/index.md`)
  })

  test('all three call sites fall back to the legacy monolithic paths for a legacy fixture', async () => {
    const { featureDir } = buildLegacyFixture() // existing helper, no req//spec/
    const commandSpy = jest.spyOn(mockControl, 'command')
    await runPmPhase2(featureDir, prefix)
    const skeletonCheckCall = commandSpy.mock.calls.find(([a]) => a[1] === 'scripts/wb-skeleton-check.js')
    expect(skeletonCheckCall[0]).toContain(`${prefix}-Requirements.md`)
  })
})
```

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js
```
