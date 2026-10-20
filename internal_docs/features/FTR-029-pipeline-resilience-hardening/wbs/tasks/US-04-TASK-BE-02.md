<a id="task-US-04-TASK-BE-02"></a>
### US-04-TASK-BE-02

- **Task ID:** US-04-TASK-BE-02
- **Title:** Validate a per-UC generation result immediately, with one bounded retry
- **Outcome:** pm-phase1.js's per-UC loop validates each worker's response via isValidUseCaseFile immediately after dispatch, before writing to disk; an invalid result is retried once (identical prompt); still-invalid throws a precise error naming the UC
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-12
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** pm-phase1
- **Commit subject:** fail fast on an invalid Requirements use case, with one bounded retry

**Implementation notes:**

Per `spec/components/pm-phase1.js.md`'s "Edit 3" — replace the per-UC loop (`pm-phase1.js:193-202`)
with the version shown there: add `USE_CASE_RETRY_ATTEMPTS = 2` as a top-level constant; the loop
body calls the worker in an inner retry loop, checking `isValidUseCaseFile(detail, row.id)` after
each attempt, and throws a precise error naming `row.id` if still invalid after
`USE_CASE_RETRY_ATTEMPTS`. The existing `ucCrossReferences` append and `c.writeOutput` only run
once a valid result is in hand.

**Verification commands:**

```
npm test
```
