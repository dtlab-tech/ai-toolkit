<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Cover parseTableHeader and checkAcTableHeader with direct unit tests
- **Outcome:** tests/req-assembler.test.js and tests/req-graph-checks.test.js each gain direct unit tests for the new functions, including the BR-03 no-trailing-Priority tolerance case
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-05, AC-06
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** req-assembler, req-graph-checks
- **Commit subject:** cover parseTableHeader and checkAcTableHeader

**Implementation notes:**

Add the tests exactly as shown in `spec/components/req-assembler.test.js.md` (3 tests for
`parseTableHeader`: well-formed table, no table at all, separator row excluded) and
`spec/components/req-graph-checks.test.js.md` (5 tests for `checkAcTableHeader`: 4-column OK,
3-column-no-Priority OK, fewer-than-3-columns error, 5-column Given/When/Then-split error,
`null` header error).

**Verification commands:**

```
npm test -- tests/req-assembler.test.js tests/req-graph-checks.test.js
```
