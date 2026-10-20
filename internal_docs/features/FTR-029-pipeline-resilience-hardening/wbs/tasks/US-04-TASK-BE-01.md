<a id="task-US-04-TASK-BE-01"></a>
### US-04-TASK-BE-01

- **Task ID:** US-04-TASK-BE-01
- **Title:** Validate a per-component generation result immediately, with one bounded retry
- **Outcome:** pm-phase1.js's per-component loop validates each worker's response via isValidComponentDetail immediately after dispatch, before writing to disk; an invalid result is retried once (identical prompt); still-invalid throws a precise error naming the component
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-10, AC-11
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** pm-phase1
- **Commit subject:** fail fast on an invalid Tech-Spec component, with one bounded retry

**Implementation notes:**

Per `spec/components/pm-phase1.js.md`'s "Edit 2" — replace the per-component loop
(`pm-phase1.js:439-445`) with the version shown there: add `COMPONENT_RETRY_ATTEMPTS = 2` as a
top-level constant near the other duplicated primitives (not inline); the loop body now calls the
worker in an inner retry loop, checking `isValidComponentDetail(detail)` after each attempt, and
throws a precise error naming `comp.filePath`/`comp.fileSlug` if still invalid after
`COMPONENT_RETRY_ATTEMPTS`. `c.writeOutput(compPath, detail)` only runs once a valid result is in
hand — never on an invalid intermediate attempt.

**Verification commands:**

```
npm test
```
