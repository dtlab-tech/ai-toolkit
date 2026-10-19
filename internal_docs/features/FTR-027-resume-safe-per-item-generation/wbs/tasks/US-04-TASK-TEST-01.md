<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Confirm force/revision-cycle bypass is unaffected, then run the full regression suite
- **Outcome:** A new test confirms --force and needsRequirementsFix/needsTechSpecFix still regenerate every item unconditionally despite the new validity checks (AC-08); full npm test suite passes
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01, US-02-TASK-BE-01, US-03-TASK-BE-01
- **Acceptance criteria:** AC-08, AC-09
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase1, pm-phase2
- **Commit subject:** confirm force/revision-cycle bypass is unaffected; run the full regression

**Implementation notes:**

Add to `tests/integration/workflow-runtime.test.js`:

```js
test('FTR-027 — --force still regenerates every valid item unconditionally', async () => {
  const dispatchFn = jest.fn(phase1Dispatch)
  await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn })
  dispatchFn.mockClear()
  // Every existing file is perfectly VALID here — only --force should cause re-dispatch, the
  // new validity checks must never be the reason a --force run skips something.
  await runWorkflow('pm-phase1', [f.feature, '--force'], { ...f.options, dispatch: dispatchFn })
  expect(dispatchFn).toHaveBeenCalledTimes(5) // requirements skeleton + 1 use case + tech-spec skeleton + 1 component + validate
})
```

Final step: run the complete suite (`npm test`, not just this file) to confirm the new validity
checks introduce no regression anywhere else in the pipeline.

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js
```

```
npm test
```
