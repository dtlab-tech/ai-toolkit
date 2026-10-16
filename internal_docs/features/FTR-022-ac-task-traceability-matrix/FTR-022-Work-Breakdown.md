# Work Breakdown — FTR-022

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-022 |
| Schema | v2 |
| Generated | 2026-10-16T08:50:21.965Z |

## Summary
| Metric | Value |
|--------|-------|
| Total tasks | 6 |
| Total phases | 3 |
| Within target (≤15 min) | 4 |
| Above target (16–20 min) | 2 |
| Warning (21–30 min) | 0 |
| Split required (>30 min) | 0 |
| Domain distribution | BE: 3, FE: 0, DB: 0, DevOps: 0, INFRA: 0, TEST: 3 |

## User Story Phases

### US-01: As the matrix renderer, I want parseAcTable to also capture each AC's Criterion text, so that the matrix can display it without a second, duplicate table reader

### Commit
feat(FTR-022): implement US-01 parseAcTable criterion extension

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-01-TASK-BE-01 | Extend parseAcTable to capture the Criterion text column | src/claude/scripts/wb-graph-checks.js's parseAcTable additionally sets criterion: cells[1] on every acMap entry; checkAcCoverage and its three checks (19-21) are untouched and read exactly the fields they already read | BE | 10 | — | 1 cmd — [details](#task-US-01-TASK-BE-01) |
| US-01-TASK-TEST-01 | Regression test: checkAcCoverage unchanged, criterion field present | tests/wb-graph-checks.test.js (or a new file) re-runs the existing checks-19-21 fixtures through the extended parseAcTable and asserts checkAcCoverage's errors output is byte-identical to before the extension, plus a new assertion that acMap.get(id).criterion returns the table's real Criterion text | TEST | 12 | US-01-TASK-BE-01 | 1 cmd — [details](#task-US-01-TASK-TEST-01) |

### US-02: As the coordinator, I want a script that computes AC-to-task-to-phase coverage and renders it as a Markdown table, so that traceability already enforced by wb-validate.js becomes visible without any new LLM call

### Commit
feat(FTR-022): implement US-02 ac-task-matrix computation and rendering

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-02-TASK-BE-01 | Create ac-task-matrix.js with computeCoverage, renderMatrix, and CLI entry point | src/claude/scripts/ac-task-matrix.js exists exporting computeCoverage(wb, acMap) (builds acId -> {taskIds, phaseIds} by walking every phase's tasks) and renderMatrix(prefix, acMap, coverage) (renders the 6-column Markdown table + legend, AC rows in acMap insertion order), plus a require.main === module CLI entry point that loads the WB and Requirements, computes coverage, and writes {PREFIX}-AC-Task-Matrix.md | BE | 20 | US-01-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-BE-01) |
| US-02-TASK-TEST-01 | Unit tests for ac-task-matrix.js's computeCoverage and renderMatrix | tests/ac-task-matrix.test.js exists covering: an AC covered by one task, an AC covered by two tasks in two different phases (both phases listed), an unscoped (All UCs) AC, an AC with zero covering tasks (renders em-dash), and row order matching acMap's insertion order | TEST | 16 | US-02-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-TEST-01) |

### US-03: As the coordinator, I want pm-phase2.js to generate the AC-Task matrix right after rendering the Work Breakdown, so that it ships at Gate 2 alongside the existing deliverables with no new blocking condition

### Commit
feat(FTR-022): implement US-03 pm-phase2.js wiring

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-03-TASK-BE-01 | Wire ac-task-matrix.js into pm-phase2.js after wb-render.js | pm-phase2.js runs a new c.activity('ac-task-matrix', ...) block immediately after the existing wb-render.js activity block, invoking ac-task-matrix.js via c.command(['run-asset', 'scripts/ac-task-matrix.js', ...]), reading the produced {PREFIX}-AC-Task-Matrix.md back before trusting it, and adding gate2_payload.ac_task_matrix_path to the returned result; gate2_blocked logic is unchanged | BE | 10 | US-02-TASK-BE-01 | 1 cmd — [details](#task-US-03-TASK-BE-01) |
| US-03-TASK-TEST-01 | Integration test: pm-phase2 produces the AC-Task matrix and surfaces its path | tests/integration/workflow-runtime.test.js (or a new file) extends an existing pm-phase2 fixture to assert {PREFIX}-AC-Task-Matrix.md exists, is readable, and its path appears in result.gate2_payload.ac_task_matrix_path, without changing gate2_blocked semantics | TEST | 14 | US-03-TASK-BE-01 | 1 cmd — [details](#task-US-03-TASK-TEST-01) |

## Task Details

> Authoritative per-task detail. Every field is rendered integrally so this document, together with the dispatch CSV, is a complete deliverable requiring no separate JSON. Verification commands are preserved **verbatim** in fenced code blocks — operators such as `||`, shell pipes `|`, and regex alternations (`grep -E 'a|b|c'`) survive byte-for-byte. Each command is an independent fenced block.

<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Extend parseAcTable to capture the Criterion text column
- **Outcome:** src/claude/scripts/wb-graph-checks.js's parseAcTable additionally sets criterion: cells[1] on every acMap entry; checkAcCoverage and its three checks (19-21) are untouched and read exactly the fields they already read
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-05
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** capture AC criterion text in parseAcTable's acMap entries

**Verification commands:**

```
node --check src/claude/scripts/wb-graph-checks.js
```

<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Regression test: checkAcCoverage unchanged, criterion field present
- **Outcome:** tests/wb-graph-checks.test.js (or a new file) re-runs the existing checks-19-21 fixtures through the extended parseAcTable and asserts checkAcCoverage's errors output is byte-identical to before the extension, plus a new assertion that acMap.get(id).criterion returns the table's real Criterion text
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-05, AC-06
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add parseAcTable criterion-extension regression test

**Verification commands:**

```
npx jest --testPathPattern=tests/wb-graph-checks.test.js
```

<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Create ac-task-matrix.js with computeCoverage, renderMatrix, and CLI entry point
- **Outcome:** src/claude/scripts/ac-task-matrix.js exists exporting computeCoverage(wb, acMap) (builds acId -> {taskIds, phaseIds} by walking every phase's tasks) and renderMatrix(prefix, acMap, coverage) (renders the 6-column Markdown table + legend, AC rows in acMap insertion order), plus a require.main === module CLI entry point that loads the WB and Requirements, computes coverage, and writes {PREFIX}-AC-Task-Matrix.md
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-01, AC-02, AC-03, AC-04
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** `computeCoverage`, `renderMatrix`, and the CLI entry point have no independent meaning in isolation — the CLI is not callable until both functions exist, and splitting them into separate tasks would mean one task's output is untestable without the other's, the same reasoning FTR-020/021 applied to their own single-module script tasks.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add ac-task-matrix.js computing and rendering AC-to-task coverage

**Verification commands:**

```
node --check src/claude/scripts/ac-task-matrix.js
```

<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Unit tests for ac-task-matrix.js's computeCoverage and renderMatrix
- **Outcome:** tests/ac-task-matrix.test.js exists covering: an AC covered by one task, an AC covered by two tasks in two different phases (both phases listed), an unscoped (All UCs) AC, an AC with zero covering tasks (renders em-dash), and row order matching acMap's insertion order
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-01, AC-02, AC-03, AC-04, AC-06
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for ac-task-matrix.js

**Verification commands:**

```
npx jest --testPathPattern=tests/ac-task-matrix.test.js
```

<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Wire ac-task-matrix.js into pm-phase2.js after wb-render.js
- **Outcome:** pm-phase2.js runs a new c.activity('ac-task-matrix', ...) block immediately after the existing wb-render.js activity block, invoking ac-task-matrix.js via c.command(['run-asset', 'scripts/ac-task-matrix.js', ...]), reading the produced {PREFIX}-AC-Task-Matrix.md back before trusting it, and adding gate2_payload.ac_task_matrix_path to the returned result; gate2_blocked logic is unchanged
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-05
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** wire ac-task-matrix.js into pm-phase2.js's Gate 2 flow

**Verification commands:**

```
node --check src/claude/workflows/pm-phase2.js
```

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

**Verification commands:**

```
npx jest --testPathPattern=tests/integration/workflow-runtime.test.js
```

## Statistics

| Domain | Count | Target | Above | Warning | Split |
|--------|-------|--------|-------|---------|-------|
| BE | 3 | 2 | 1 | 0 | 0 |
| FE | 0 | 0 | 0 | 0 | 0 |
| DB | 0 | 0 | 0 | 0 | 0 |
| DevOps | 0 | 0 | 0 | 0 | 0 |
| INFRA | 0 | 0 | 0 | 0 | 0 |
| TEST | 3 | 2 | 1 | 0 | 0 |
| **Total** | **6** | **4** | **2** | **0** | **0** |
