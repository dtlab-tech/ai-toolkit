<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Cover the skeleton-only validator prompt end to end
- **Outcome:** tests/integration/workflow-runtime.test.js has passing tests: the validator's dispatch prompt contains no per-component Change/Algorithm/Tests prose; Requirements' own full UC detail is still inlined unchanged; docsDigest still hashes the full assembled documents
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-01, AC-05, AC-13
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase1
- **Commit subject:** cover the skeleton-only validator prompt and unaffected docsDigest

**Implementation notes:**

Add a `describe('FTR-028 — validator prompt uses the Tech-Spec skeleton only', ...)` block to
`tests/integration/workflow-runtime.test.js` per `spec/components/workflow-runtime.test.js.md`'s
own Algorithm section:

1. Seed a feature fixture with `spec/index.md` (2+ component rows) and component detail files whose
   bodies contain an easily-greppable sentinel string (e.g. `SENTINEL_COMPONENT_BODY_TEXT`) inside
   their own `## Change`/`## Algorithm` sections.
2. Run `pm-phase1` with a `jest.fn(dispatch)` wrapper; find the `gaia-validate-feature-docs` call
   by its `--agent` arg; assert `validatorCall.prompt` does NOT contain the sentinel, but DOES
   contain `'## 9. File Inventory'` (the skeleton's own section header, proving the Tech-Spec text
   is still present, just reduced).
3. A second test asserts the SAME dispatch's prompt still contains a Requirements UC-flow sentinel
   (confirming only the Tech-Spec side was reduced — Requirements stays `assembledRequirements`,
   unchanged).
4. A third test (satisfies AC-13) computes `hash(assembleRequirements_output + '\u0000' +
   assembleTechSpec_output)` independently in the test (via the same `run-asset` invocations the
   workflow itself uses) and asserts it equals the real run's `result.docs_digest` — proving the
   digest was never computed from the reduced skeleton-only validator input, even though that
   input is what the dispatch itself received.
5. Mock `gaia-validate-feature-docs`'s own dispatch response as `{ valid: true, findings: [],
   needsRequirementsFix: false, needsTechSpecFix: false, report: '...' }` for all three tests — at
   this point in the Implementation Order, the schema does not yet require `needsComponentDetail`
   (added by US-03-TASK-BE-01); this task's fixture does not need an orphan AC or a flagged
   component, since US-02/US-03's own merge logic isn't exercised here.

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "FTR-028 — validator prompt uses the Tech-Spec skeleton only"
```
