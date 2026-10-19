<a id="task-US-03-TASK-TEST-01"></a>
### US-03-TASK-TEST-01

- **Task ID:** US-03-TASK-TEST-01
- **Title:** Integration test: pm-phase2 produces the AC-Task matrix and surfaces its path
- **Outcome:** tests/integration/workflow-runtime.test.js (or a new file) extends an existing pm-phase2 fixture to assert {PREFIX}-AC-Task-Matrix.md exists, is readable, and its path appears in result.gate2_payload.ac_task_matrix_path, without changing gate2_blocked semantics
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-06
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add pm-phase2 AC-Task matrix integration test

**Implementation notes:**

Extend the existing `pm-phase2 runs real validator/renderer and blocks a negative semantic
verdict: true` test in `tests/integration/workflow-runtime.test.js` (it already uses
`phase2Setup()`/`phase2Dispatch()` from FTR-020's own fixture rework and already runs the real
`wb-render.js` step this feature's new step sits next to) — add these assertions to its `valid:
true` branch, right alongside the existing `result.tasks_csv_path` assertion:

```js
expect(result.gate2_payload.ac_task_matrix_path).toBeDefined();
const matrixContent = fs.readFileSync(result.gate2_payload.ac_task_matrix_path, 'utf8');
expect(matrixContent).toContain('AC ↔ Task Traceability Matrix');
expect(matrixContent).toContain('AC-01'); // from phase2Setup's own Requirements.md fixture's AC table
```

Note `phase2Setup()`'s own `FTR-099-Requirements.md` fixture (`'## 7. Acceptance Criteria\n\n| ID
| Criterion | Related UC |\n|---|---|---|\n'`) currently has an EMPTY AC table (header row only,
no data rows) — `parseAcTable` returns an empty (but non-null) `acMap` for it, so
`ac-task-matrix.js` renders a matrix with a header and zero rows, which is valid but makes the
`toContain('AC-01')` assertion above impossible as written. Update `phase2Setup()`'s Requirements
fixture to add one real data row (e.g. `| AC-01 | Example criterion | UC-01 |`, with a matching
`### UC-01: ...` heading + `| Priority | Must |` row earlier in the document, matching
`parseAcTable`'s own UC-priority-lookup requirement — see `wb-graph-checks.js`'s
`ucPriorityMap` scan) so the matrix has at least one real row to assert on. Confirm this
addition doesn't change any *other* existing pm-phase2 test's behavior (those tests never
assert on AC table contents today).

**Verification commands:**

```
npx jest --testPathPattern=tests/integration/workflow-runtime.test.js
```
