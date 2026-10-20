<a id="task-US-02-TASK-BE-02"></a>
### US-02-TASK-BE-02

- **Task ID:** US-02-TASK-BE-02
- **Title:** Wire the AC-table header check into req-skeleton-check.js before the positional parse
- **Outcome:** req-skeleton-check.js calls parseTableHeader/checkAcTableHeader on Section 7's AC table before parseAcTable; a malformed header short-circuits acTable to [] for the run and folds a MALFORMED_AC_TABLE_HEADER error into the existing unified errors[] output
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-05, AC-06
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** req-skeleton-check
- **Commit subject:** validate the AC table's column header before parsing it

**Implementation notes:**

Full diff per `spec/components/req-skeleton-check.js.md`: widen the `require('./req-assembler')`
destructure to also pull in `findSectionRange`/`parseTableHeader`; replace the parse `try` block
(`req-skeleton-check.js:33-41`) to compute `acHeaderErrors` via `findSectionRange(indexContent, 7)`
+ `parseTableHeader` + `graphChecks.checkAcTableHeader`, and only call `parseAcTable` when
`acHeaderErrors.length === 0` (otherwise `acTable = []`); prepend `...acHeaderErrors` to the
existing unified `errors` array (`req-skeleton-check.js:49-58`). No change to the script's own
exit-code convention (`0`/`1`/`2`) or JSON output shape — the new error is just another entry in
the same `errors[]` array, same as every existing graph-check finding.

**Verification commands:**

```
npm test -- tests/req-skeleton-check.test.js
```
