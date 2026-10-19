# Work Breakdown — FTR-023

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-023 |
| Schema | v2 |
| Generated | 2026-10-16T12:13:48.281Z |

## Summary
| Metric | Value |
|--------|-------|
| Total tasks | 7 |
| Total phases | 3 |
| Within target (≤15 min) | 3 |
| Above target (16–20 min) | 3 |
| Warning (21–30 min) | 1 |
| Split required (>30 min) | 0 |
| Domain distribution | BE: 3, FE: 0, DB: 0, DevOps: 0, INFRA: 1, TEST: 3 |

## User Story Phases

### US-01: As gaia-generate-tech-spec, I want to tag every File Inventory row with the AC IDs it addresses, so that Tech-Spec finally becomes a traceable link in the Requirement-to-Task chain

### Commit
feat(FTR-023): implement US-01 Tech-Spec AC tagging convention

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-01-TASK-BE-01 | Add Addresses column to gaia-generate-tech-spec.md's File Inventory template | src/claude/agents/gaia-generate-tech-spec.md's Section 9 'New files' and 'Modified files' tables each gain a third 'Addresses' column; a new Guidelines bullet instructs the agent to cite real Requirements AC IDs (comma-separated) or em-dash, never inventing an AC ID | INFRA | 10 | — | 1 cmd — [details](#task-US-01-TASK-BE-01) |

### US-02: As the coordinator, I want a deterministic check that every Tech-Spec Addresses reference resolves to a real Requirements AC, so that a structurally broken Tech-Spec never reaches semantic validation

### Commit
feat(FTR-023): implement US-02 tech-spec-graph-checks and pm-phase1 wiring

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-02-TASK-BE-01 | Export parseTableRows and create tech-spec-graph-checks.js | req-assembler.js's module.exports gains parseTableRows (already implemented internally, now exported, zero behavior change); src/claude/scripts/tech-spec-graph-checks.js exists exporting parseFileInventoryEntries(techSpecContent), checkAddressesResolve(entries, validAcIds), findSubsectionRange(lines, start, end, heading), plus a require.main CLI mode printing a JSON validity report | BE | 22 | — | 1 cmd — [details](#task-US-02-TASK-BE-01) |
| US-02-TASK-TEST-01 | Unit tests for tech-spec-graph-checks.js | tests/tech-spec-graph-checks.test.js exists covering parseFileInventoryEntries (both tables present, one table missing, a dash cell, a multi-AC cell), checkAddressesResolve (clean list, one dangling reference), and findSubsectionRange (subsection followed by another heading, subsection as the last content in the document) | TEST | 16 | US-02-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-TEST-01) |
| US-02-TASK-BE-02 | Wire tech-spec-graph-checks.js into pm-phase1.js before the validation loop | pm-phase1.js runs a new c.activity('tech-spec-ac-check', ...) block immediately before the existing 3-cycle validation loop, invoking tech-spec-graph-checks.js via c.command(['run-asset', ...]) against file('Tech-Spec') and file('Requirements'); a non-zero exit throws before gaia.agent.planner.validate-feature-docs is ever dispatched | BE | 12 | US-02-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-BE-02) |
| US-02-TASK-TEST-02 | Integration test: pm-phase1 rejects a dangling Tech-Spec AC reference before semantic validation | tests/integration/workflow-runtime.test.js (or a new file) asserts a Tech-Spec mock containing a dangling Addresses reference causes pm-phase1 to fail before gaia-validate-feature-docs is ever dispatched, and that a clean/dash-only Tech-Spec proceeds through the existing validation flow unchanged | TEST | 16 | US-02-TASK-BE-02 | 1 cmd — [details](#task-US-02-TASK-TEST-02) |

### US-03: As ac-task-matrix.js, I want to show which Tech-Spec files address each AC, so that the matrix closes the Requirement -> Tech-Spec -> Task chain in one view

### Commit
feat(FTR-023): implement US-03 ac-task-matrix Tech-Spec coverage column

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-03-TASK-BE-01 | Extend ac-task-matrix.js with Tech-Spec coverage | ac-task-matrix.js gains computeTechSpecCoverage(entries, acMap) (acId -> Set<filePath>); renderMatrix gains an optional 4th techSpecCoverage parameter (default empty Map, backward compatible) and one new column, 'Addressed by Tech-Spec File(s)', between Related UC and Covering Task(s); the CLI entry point accepts a new tech-spec-path argument and wires parseFileInventoryEntries + computeTechSpecCoverage through to renderMatrix | BE | 16 | US-02-TASK-BE-01 | 1 cmd — [details](#task-US-03-TASK-BE-01) |
| US-03-TASK-TEST-01 | Unit tests for computeTechSpecCoverage and the extended renderMatrix column | tests/ac-task-matrix.test.js (extended) covers: an AC addressed by one file, an AC addressed by two files, an AC addressed by zero files, and renderMatrix called both with and without the 4th techSpecCoverage argument, confirming the backward-compatible default renders em-dash | TEST | 14 | US-03-TASK-BE-01 | 1 cmd — [details](#task-US-03-TASK-TEST-01) |

## Task Details

> Authoritative per-task detail. Every field is rendered integrally so this document, together with the dispatch CSV, is a complete deliverable requiring no separate JSON. Verification commands are preserved **verbatim** in fenced code blocks — operators such as `||`, shell pipes `|`, and regex alternations (`grep -E 'a|b|c'`) survive byte-for-byte. Each command is an independent fenced block.

<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Add Addresses column to gaia-generate-tech-spec.md's File Inventory template
- **Outcome:** src/claude/agents/gaia-generate-tech-spec.md's Section 9 'New files' and 'Modified files' tables each gain a third 'Addresses' column; a new Guidelines bullet instructs the agent to cite real Requirements AC IDs (comma-separated) or em-dash, never inventing an AC ID
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-01, AC-06
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add Addresses column to Tech-Spec File Inventory template

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter
```

<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Export parseTableRows and create tech-spec-graph-checks.js
- **Outcome:** req-assembler.js's module.exports gains parseTableRows (already implemented internally, now exported, zero behavior change); src/claude/scripts/tech-spec-graph-checks.js exists exporting parseFileInventoryEntries(techSpecContent), checkAddressesResolve(entries, validAcIds), findSubsectionRange(lines, start, end, heading), plus a require.main CLI mode printing a JSON validity report
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-02, AC-03, AC-04, AC-06
- **Estimate — agent minutes:** 22
- **Estimate — tokens:** 36000
- **Output count:** 1
- **Grouping rationale:** The `parseTableRows` export and the new script are one task because the export exists solely to be consumed by this script — there is no independent way to verify "parseTableRows is exported" except by using it, and this script is its only consumer.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add tech-spec-graph-checks.js and export req-assembler.js's parseTableRows

**Verification commands:**

```
node --check src/claude/scripts/req-assembler.js
node --check src/claude/scripts/tech-spec-graph-checks.js
```

<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Unit tests for tech-spec-graph-checks.js
- **Outcome:** tests/tech-spec-graph-checks.test.js exists covering parseFileInventoryEntries (both tables present, one table missing, a dash cell, a multi-AC cell), checkAddressesResolve (clean list, one dangling reference), and findSubsectionRange (subsection followed by another heading, subsection as the last content in the document)
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-02, AC-03, AC-04, AC-07
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for tech-spec-graph-checks.js

**Verification commands:**

```
npx jest --testPathPattern=tests/tech-spec-graph-checks.test.js
```

<a id="task-US-02-TASK-BE-02"></a>
### US-02-TASK-BE-02

- **Task ID:** US-02-TASK-BE-02
- **Title:** Wire tech-spec-graph-checks.js into pm-phase1.js before the validation loop
- **Outcome:** pm-phase1.js runs a new c.activity('tech-spec-ac-check', ...) block immediately before the existing 3-cycle validation loop, invoking tech-spec-graph-checks.js via c.command(['run-asset', ...]) against file('Tech-Spec') and file('Requirements'); a non-zero exit throws before gaia.agent.planner.validate-feature-docs is ever dispatched
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-02, AC-03, AC-06
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** wire tech-spec-graph-checks.js into pm-phase1.js's validation flow

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```

<a id="task-US-02-TASK-TEST-02"></a>
### US-02-TASK-TEST-02

- **Task ID:** US-02-TASK-TEST-02
- **Title:** Integration test: pm-phase1 rejects a dangling Tech-Spec AC reference before semantic validation
- **Outcome:** tests/integration/workflow-runtime.test.js (or a new file) asserts a Tech-Spec mock containing a dangling Addresses reference causes pm-phase1 to fail before gaia-validate-feature-docs is ever dispatched, and that a clean/dash-only Tech-Spec proceeds through the existing validation flow unchanged
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-02
- **Acceptance criteria:** AC-02, AC-03, AC-07
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add pm-phase1 tech-spec AC-reference integration test

**Verification commands:**

```
npx jest --testPathPattern=tests/integration/workflow-runtime.test.js
```

<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Extend ac-task-matrix.js with Tech-Spec coverage
- **Outcome:** ac-task-matrix.js gains computeTechSpecCoverage(entries, acMap) (acId -> Set<filePath>); renderMatrix gains an optional 4th techSpecCoverage parameter (default empty Map, backward compatible) and one new column, 'Addressed by Tech-Spec File(s)', between Related UC and Covering Task(s); the CLI entry point accepts a new tech-spec-path argument and wires parseFileInventoryEntries + computeTechSpecCoverage through to renderMatrix
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-05, AC-06
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** extend ac-task-matrix.js with Tech-Spec file coverage

**Verification commands:**

```
node --check src/claude/scripts/ac-task-matrix.js
node --check src/claude/workflows/pm-phase2.js
```

<a id="task-US-03-TASK-TEST-01"></a>
### US-03-TASK-TEST-01

- **Task ID:** US-03-TASK-TEST-01
- **Title:** Unit tests for computeTechSpecCoverage and the extended renderMatrix column
- **Outcome:** tests/ac-task-matrix.test.js (extended) covers: an AC addressed by one file, an AC addressed by two files, an AC addressed by zero files, and renderMatrix called both with and without the 4th techSpecCoverage argument, confirming the backward-compatible default renders em-dash
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-05, AC-07
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for ac-task-matrix.js's Tech-Spec coverage extension

**Verification commands:**

```
npx jest --testPathPattern=tests/ac-task-matrix.test.js
```

## Statistics

| Domain | Count | Target | Above | Warning | Split |
|--------|-------|--------|-------|---------|-------|
| BE | 3 | 1 | 1 | 1 | 0 |
| FE | 0 | 0 | 0 | 0 | 0 |
| DB | 0 | 0 | 0 | 0 | 0 |
| DevOps | 0 | 0 | 0 | 0 | 0 |
| INFRA | 1 | 1 | 0 | 0 | 0 |
| TEST | 3 | 1 | 2 | 0 | 0 |
| **Total** | **7** | **3** | **3** | **1** | **0** |
