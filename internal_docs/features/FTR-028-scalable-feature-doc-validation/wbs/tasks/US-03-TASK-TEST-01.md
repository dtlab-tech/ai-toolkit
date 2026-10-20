<a id="task-US-03-TASK-TEST-01"></a>
### US-03-TASK-TEST-01

- **Task ID:** US-03-TASK-TEST-01
- **Title:** Cover component-detail drill-down dispatch, validation, dedup, and batching end to end
- **Outcome:** tests/integration/workflow-runtime.test.js has passing tests: a valid fileSlug dispatches a drill-down call reading only that file; a hallucinated fileSlug is dropped and reported, never dispatched; two claims on the same fileSlug collapse into one batch slot; more unique flagged components than K produce multiple bounded calls; zero needsComponentDetail entries dispatch zero drill-down calls; a drill-down finding forces needsTechSpecFix even when the main pass reported clean
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-02
- **Acceptance criteria:** AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12
- **Estimate — agent minutes:** 28
- **Estimate — tokens:** 36000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase1
- **Commit subject:** cover component-detail drill-down dispatch, validation, dedup, and batching

**Implementation notes:**

Add a `describe('FTR-028 — component-detail drill-down (UC-03)', ...)` block to
`tests/integration/workflow-runtime.test.js` per `spec/components/workflow-runtime.test.js.md`:

1. **Valid fileSlug dispatches correctly.** Mock `gaia-validate-feature-docs`'s response with
   `needsComponentDetail: [{ claim: 'endpoint returns 401 on expired token', fileSlug:
   'AuthMiddleware.cs.md' }]` (a real row in the fixture's `spec/index.md`); mock
   `gaia-validate-tech-spec-component-detail`'s response as `{ findings: [] }`. Assert the
   drill-down call's prompt contains both `'AuthMiddleware.cs.md'` and the claim text.
2. **Hallucinated fileSlug.** `needsComponentDetail: [{ claim: '...', fileSlug:
   'DoesNotExist.cs.md' }]` (no matching row). Assert NO `gaia-validate-tech-spec-component-detail`
   dispatch occurs, and the Validation-Report contains `'component-detail check referenced a
   non-existent file "DoesNotExist.cs.md"'`.
3. **Unsatisfied claim forces a fix.** Mock the drill-down response as `{ findings: ['Tech-Spec:
   ...not satisfied...'] }`; assert a second validation cycle runs and the report contains that
   finding.
4. **Dedup.** Two `needsComponentDetail` entries, same `fileSlug`, different claims; assert exactly
   ONE `gaia-validate-tech-spec-component-detail` dispatch for that fileSlug, prompt containing
   both claims.
5. **Batching.** `needsComponentDetail` names `DRILL_DOWN_BATCH_SIZE + 3` distinct, all-existing
   fileSlugs (fixture needs that many component rows); assert exactly 2 drill-down dispatches
   (`ceil(11/8)`), and no single dispatch's prompt mentions more than 8 distinct `"Component
   file:"` lines.
6. **Zero entries, zero cost.** `needsComponentDetail: []`; assert `dispatchFn` never invokes
   `gaia-validate-tech-spec-component-detail` at all for that cycle.

For cases 3 and 5's revision cycle, reuse the existing `needsTechSpecFix`-driven re-dispatch
fixture pattern already present in this test file (see US-02-TASK-TEST-01's own notes).

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "FTR-028 — component-detail drill-down"
```
