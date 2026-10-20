<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Cover fail-fast per-item validation end to end, both loops
- **Outcome:** tests/integration/workflow-runtime.test.js has passing tests: an invalid component valid on retry is written and used with no error; an invalid component on both attempts throws immediately, naming it, before any later component is dispatched; an invalid use case on both attempts throws immediately, naming it
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-01, US-04-TASK-BE-02
- **Acceptance criteria:** AC-10, AC-11, AC-12
- **Estimate — agent minutes:** 24
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase1
- **Commit subject:** cover fail-fast per-item validation for both the component and use-case loops

**Implementation notes:**

Add the new `describe('FTR-029 — fail fast on an invalid per-item generation result (UC-04)',
...)` block to `tests/integration/workflow-runtime.test.js` exactly per
`spec/components/workflow-runtime.test.js.md`'s own Algorithm section — 3 tests: a stateful mock
counting dispatch calls to return invalid-then-valid content for one component; a two-component
fixture where one component ("a.js") always returns invalid content, asserting the throw names it
and the SECOND component ("b.js") is never dispatched; the symmetric use-case case.

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "FTR-029 — fail fast"
```
