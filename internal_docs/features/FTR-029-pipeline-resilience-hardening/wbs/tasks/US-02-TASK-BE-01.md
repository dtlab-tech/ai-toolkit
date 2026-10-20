<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Add parseTableHeader and checkAcTableHeader
- **Outcome:** req-assembler.js gains parseTableHeader(lines, start, end), exported alongside findSectionRange/parseTableRows; req-graph-checks.js gains checkAcTableHeader(headerCells), mirroring wb-graph-checks.js's own AC-table header check
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-05, AC-06
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 2
- **Grouping rationale:** Both are small, independent pure-function additions that the next task (wiring) needs together — grouped so that task always has both available.
- **Commit type:** feat
- **Commit scope:** req-assembler, req-graph-checks
- **Commit subject:** add AC-table header extraction and validation

**Implementation notes:**

Per `spec/components/req-assembler.js.md` and `spec/components/req-graph-checks.js.md`:

1. `src/claude/scripts/req-assembler.js` — add `parseTableHeader(lines, start, end)` near
   `parseTableRows`, exactly as shown in that component's Algorithm section (returns the raw header
   cells, or `null` if no table is present). Add it to the existing `module.exports` object.
2. `src/claude/scripts/req-graph-checks.js` — add `checkAcTableHeader(headerCells)` near the other
   pure check functions, exactly as shown in that component's Algorithm section (requires the first
   3 cells to be `ID`/`Criterion`/`Related UC` in order; tolerates a missing trailing `Priority`).
   Add it to the existing `module.exports` object.

No other function in either file changes.

**Verification commands:**

```
npm test -- tests/req-assembler.test.js tests/req-graph-checks.test.js
```
