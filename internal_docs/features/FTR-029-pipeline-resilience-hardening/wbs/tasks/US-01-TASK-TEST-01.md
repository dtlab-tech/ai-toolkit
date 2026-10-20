<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Cover the missing-structured-output retry and nudge end to end
- **Outcome:** tests/cli/workflow-worker-contract.test.js has passing tests: a clean-exit attempt with no recoverable structured output is retried with the nudge appended; a response already recoverable via the existing text fallback is NOT retried; exhausting every attempt still throws the existing error
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-03, AC-04
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** workflow-control
- **Commit subject:** cover the missing-structured-output retry and corrective nudge

**Implementation notes:**

Add the new `describe('worker() missing-structured-output retry (FTR-029)', ...)` block to
`tests/cli/workflow-worker-contract.test.js` exactly per
`spec/components/workflow-worker-contract.test.js.md`'s own Algorithm section: 3 tests — (1) a
first attempt with no JSON at all is retried, asserting the SECOND attempt's prompt contains the
nudge text and the first did not; (2) a response recoverable via the existing
` ```json ` fence fallback dispatches exactly once (`jest.fn` call count); (3) exhausting
`WORKER_MAX_ATTEMPTS` with no recoverable output still rejects with `'Worker returned no structured
output'`. Use this file's own existing `createControl`/`c.worker(id, 'test', { schema })` style
(not a mocked extraction function) — same precedent as every other test in this file.

**Verification commands:**

```
npm test -- tests/cli/workflow-worker-contract.test.js -t "missing-structured-output retry"
```
