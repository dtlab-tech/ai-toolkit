# Work Breakdown — FTR-021

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-021 |
| Schema | v2 |
| Generated | 2026-10-15T15:51:16.743Z |

## Summary
| Metric | Value |
|--------|-------|
| Total tasks | 13 |
| Total phases | 6 |
| Within target (≤15 min) | 7 |
| Above target (16–20 min) | 6 |
| Warning (21–30 min) | 0 |
| Split required (>30 min) | 0 |
| Domain distribution | BE: 7, FE: 0, DB: 0, DevOps: 0, INFRA: 2, TEST: 4 |

## Infrastructure Phase (INFRA)

### Commit
feat(FTR-021): shared req-split structural check infrastructure

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| INFRA-TASK-BE-01 | Create req-graph-checks.js with 4 pure self-consistency check functions | src/claude/scripts/req-graph-checks.js exists exporting checkUniqueUcIds, checkUcIdFormat, checkUcTableFileParity, and checkCrossReferencesResolve, each taking a plain { ucIds, acTable, businessRules } structure and returning an array of error objects in a consistent shape | BE | 14 | — | 1 cmd — [details](#task-INFRA-TASK-BE-01) |
| INFRA-TASK-TEST-01 | Unit tests for req-graph-checks.js functions | tests/req-graph-checks.test.js exists covering all 4 exported functions against both clean and deliberately-broken inputs | TEST | 12 | INFRA-TASK-BE-01 | 1 cmd — [details](#task-INFRA-TASK-TEST-01) |

## User Story Phases

### US-01: As the coordinator, I want the skeleton-generation agent to emit everything except per-UC flow bodies, so that one bounded call can fix the use-case index, Business Rules, Data Requirements, NFRs, UI Requirements, Acceptance Criteria, Dependencies, and Open Questions before any per-UC token is spent

### Commit
feat(FTR-021): implement US-01 requirements skeleton agent

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-01-TASK-INFRA-01 | Repurpose gaia-generate-requirements.md to emit the skeleton only | src/claude/agents/gaia-generate-requirements.md's Output Structure keeps Sections 1, 3, 4, 5, 6, 7, 8, 9 verbatim; Section 2 is reduced to the use-case index table only (UC ID, Title, Actor, Priority, File columns), with no per-UC flow content; Process step 5 updated to describe this reduced scope | INFRA | 14 | — | 1 cmd — [details](#task-US-01-TASK-INFRA-01) |

### US-02: As the coordinator, I want a loader/renderer that reassembles req/index.md and req/use-cases/*.md back into the unchanged 9-section Requirements document, so that every downstream consumer keeps reading {PREFIX}-Requirements.md exactly as before

### Commit
feat(FTR-021): implement US-02 requirements assembler

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-02-TASK-BE-01 | Create req-assembler.js with loadRequirements and CLI entry point | src/claude/scripts/req-assembler.js exists exporting loadRequirements(inputPath) (file input returns content unchanged; directory input reads index.md, parses the use-case index table, reads each use-cases/{UC-ID}.md in table order, and reconstructs the 9-section document via spliceSection2), plus a require.main === module CLI entry point printing the assembled document to stdout | BE | 20 | — | 1 cmd — [details](#task-US-02-TASK-BE-01) |
| US-02-TASK-TEST-01 | Unit tests for req-assembler.js, including a UI-Requirements-bearing fixture | tests/req-assembler.test.js exists covering: directory-format assembly against a hand-built req/ fixture (asserting all 9 sections present in order, Section 2 built from UC files in table order), the legacy monolithic-file path, missing index.md, missing a referenced UC file, an empty use-case table (each asserting a structured error naming the exact path), and a second fixture whose index.md has non-empty Section 6 (UI Requirements) — the existing FTR-020 req/ worked example has none, so this exercises that section's round-trip | TEST | 18 | US-02-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-TEST-01) |

### US-03: As the coordinator, I want a per-use-case detail-generation agent, so that each use case's full flow is produced by its own bounded call instead of inline inside the skeleton

### Commit
feat(FTR-021): implement US-03 per-use-case detail agent

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-03-TASK-INFRA-01 | Create gaia-generate-requirements-use-case.md agent | src/claude/agents/gaia-generate-requirements-use-case.md exists (haiku, no Write tool) taking one UC's index-table row plus the compact full use-case index plus feature.md as input, returning that UC's Section-2 block (field table + Main flow / Alternative flows / Error flows / Postconditions) in the exact format gaia-generate-requirements already produces today | INFRA | 13 | — | 1 cmd — [details](#task-US-03-TASK-INFRA-01) |

### US-05: As the coordinator, I want a structural pre-check CLI over req/index.md, so that a broken skeleton (duplicate/malformed UC ID, dangling cross-reference, table/directory mismatch) is rejected before any per-UC call is dispatched

### Commit
feat(FTR-021): implement US-05 requirements skeleton pre-check CLI

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-05-TASK-BE-01 | Create req-skeleton-check.js CLI wrapper | src/claude/scripts/req-skeleton-check.js exists: parses req/index.md's use-case index table, Acceptance Criteria table, and Business Rules table into the plain shape req-graph-checks.js expects, runs all 4 check functions, prints a JSON report, and exits 0 (clean) / 1 (findings) / 2 (parse failure) | BE | 16 | INFRA-TASK-BE-01 | 1 cmd — [details](#task-US-05-TASK-BE-01) |
| US-05-TASK-TEST-01 | Tests for req-skeleton-check.js exit-code contract | tests/req-skeleton-check.test.js exists asserting the 0/1/2 exit-code contract against a handful of fixture index.md files (clean, findings, unparseable) | TEST | 12 | US-05-TASK-BE-01 | 1 cmd — [details](#task-US-05-TASK-TEST-01) |

### US-04: As the coordinator, I want pm-phase1.js to orchestrate the skeleton and per-UC passes with resume-by-existence, so that Requirements generation, assembly, and the existing Tech-Spec/validation/Gate-1 flow compose unchanged

### Commit
feat(FTR-021): implement US-04 pm-phase1.js orchestration

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-04-TASK-BE-01 | Implement skeleton-call step in pm-phase1.js | pm-phase1.js dispatches gaia.agent.planner.requirements (no declared worker() output) only when req/index.md does not already exist, and the coordinator writes the response to req/index.md itself via c.writeOutput; an existing req/index.md is reused as-is (resume) | BE | 16 | US-01-TASK-INFRA-01 | 1 cmd — [details](#task-US-04-TASK-BE-01) |
| US-04-TASK-BE-02 | Implement structural pre-check step in pm-phase1.js | pm-phase1.js calls req-skeleton-check.js via c.command(['run-asset', 'scripts/req-skeleton-check.js', ...]) against req/index.md; a non-zero exit code throws before any per-UC call is dispatched | BE | 12 | US-05-TASK-BE-01, US-04-TASK-BE-01 | 1 cmd — [details](#task-US-04-TASK-BE-02) |
| US-04-TASK-BE-03 | Implement per-UC generation loop with resume-by-existence in pm-phase1.js | pm-phase1.js parses req/index.md's use-case index table, and for each row whose req/use-cases/{UC-ID}.md does not already exist, dispatches gaia.agent.planner.requirements-use-case via buildUcPrompt() and writes the response via c.writeOutput; rows whose file already exists are skipped without dispatch | BE | 18 | US-03-TASK-INFRA-01, US-04-TASK-BE-02 | 1 cmd — [details](#task-US-04-TASK-BE-03) |
| US-04-TASK-BE-04 | Wire pm-phase1.js's Requirements step to assemble via req-assembler.js | pm-phase1.js's generateRequirements() calls req-assembler.js via c.command(['run-asset', 'scripts/req-assembler.js', ...]) against the req/ directory and writes the assembled document to file('Requirements') via c.writeOutput; the surrounding assertCompleteSections/docsDigest/Tech-Spec/validation-loop logic is unchanged and now reads this assembled file | BE | 14 | US-02-TASK-BE-01, US-04-TASK-BE-03 | 1 cmd — [details](#task-US-04-TASK-BE-04) |
| US-04-TASK-TEST-01 | Integration test: pm-phase1 resume-by-existence dispatches only missing use cases | tests/pm-phase1-req-resume.test.js exists: a pre-seeded req/ directory with some use-case files already present is run through pm-phase1.js's per-UC loop with a stubbed dispatch counting invocations; asserts exactly the missing UCs dispatch a call, and a legacy (non-req/) feature's existing Requirements.md still passes assertCompleteSections and preserves docsDigest behavior unchanged | TEST | 17 | US-04-TASK-BE-04 | 1 cmd — [details](#task-US-04-TASK-TEST-01) |

## Task Details

> Authoritative per-task detail. Every field is rendered integrally so this document, together with the dispatch CSV, is a complete deliverable requiring no separate JSON. Verification commands are preserved **verbatim** in fenced code blocks — operators such as `||`, shell pipes `|`, and regex alternations (`grep -E 'a|b|c'`) survive byte-for-byte. Each command is an independent fenced block.

<a id="task-INFRA-TASK-BE-01"></a>
### INFRA-TASK-BE-01

- **Task ID:** INFRA-TASK-BE-01
- **Title:** Create req-graph-checks.js with 4 pure self-consistency check functions
- **Outcome:** src/claude/scripts/req-graph-checks.js exists exporting checkUniqueUcIds, checkUcIdFormat, checkUcTableFileParity, and checkCrossReferencesResolve, each taking a plain { ucIds, acTable, businessRules } structure and returning an array of error objects in a consistent shape
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** All 4 checks share the same input shape and output contract and are too small individually to verify in isolation (e.g. `checkUcIdFormat` alone is a single regex test) — grouped the same way FTR-020's `wb-graph-checks.js` grouped its larger set of checks into one module.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add req-graph-checks.js with 4 pure self-consistency check functions

**Verification commands:**

```
node --check src/claude/scripts/req-graph-checks.js
```

<a id="task-INFRA-TASK-TEST-01"></a>
### INFRA-TASK-TEST-01

- **Task ID:** INFRA-TASK-TEST-01
- **Title:** Unit tests for req-graph-checks.js functions
- **Outcome:** tests/req-graph-checks.test.js exists covering all 4 exported functions against both clean and deliberately-broken inputs
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** AC-08
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for req-graph-checks.js

**Verification commands:**

```
npx jest --testPathPattern=tests/req-graph-checks.test.js
```

<a id="task-US-01-TASK-INFRA-01"></a>
### US-01-TASK-INFRA-01

- **Task ID:** US-01-TASK-INFRA-01
- **Title:** Repurpose gaia-generate-requirements.md to emit the skeleton only
- **Outcome:** src/claude/agents/gaia-generate-requirements.md's Output Structure keeps Sections 1, 3, 4, 5, 6, 7, 8, 9 verbatim; Section 2 is reduced to the use-case index table only (UC ID, Title, Actor, Priority, File columns), with no per-UC flow content; Process step 5 updated to describe this reduced scope
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-01
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** repurpose gaia-generate-requirements.md to emit skeleton only

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter
```

<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Create req-assembler.js with loadRequirements and CLI entry point
- **Outcome:** src/claude/scripts/req-assembler.js exists exporting loadRequirements(inputPath) (file input returns content unchanged; directory input reads index.md, parses the use-case index table, reads each use-cases/{UC-ID}.md in table order, and reconstructs the 9-section document via spliceSection2), plus a require.main === module CLI entry point printing the assembled document to stdout
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-04, AC-07
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 34000
- **Output count:** 1
- **Grouping rationale:** The loader, the table parser, and the section-2 splicer have no independent meaning or verifiable output on their own — `loadRequirements` is not callable until all three exist together, same reasoning FTR-020 applied to its single-module skeleton-check extraction.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add req-assembler.js with directory/legacy loader and section-2 splicer

**Verification commands:**

```
node --check src/claude/scripts/req-assembler.js
```

<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Unit tests for req-assembler.js, including a UI-Requirements-bearing fixture
- **Outcome:** tests/req-assembler.test.js exists covering: directory-format assembly against a hand-built req/ fixture (asserting all 9 sections present in order, Section 2 built from UC files in table order), the legacy monolithic-file path, missing index.md, missing a referenced UC file, an empty use-case table (each asserting a structured error naming the exact path), and a second fixture whose index.md has non-empty Section 6 (UI Requirements) — the existing FTR-020 req/ worked example has none, so this exercises that section's round-trip
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-04, AC-05, AC-08
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for req-assembler.js

**Verification commands:**

```
npx jest --testPathPattern=tests/req-assembler.test.js
```

<a id="task-US-03-TASK-INFRA-01"></a>
### US-03-TASK-INFRA-01

- **Task ID:** US-03-TASK-INFRA-01
- **Title:** Create gaia-generate-requirements-use-case.md agent
- **Outcome:** src/claude/agents/gaia-generate-requirements-use-case.md exists (haiku, no Write tool) taking one UC's index-table row plus the compact full use-case index plus feature.md as input, returning that UC's Section-2 block (field table + Main flow / Alternative flows / Error flows / Postconditions) in the exact format gaia-generate-requirements already produces today
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-02
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add gaia-generate-requirements-use-case.md per-UC detail agent

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter
```

<a id="task-US-05-TASK-BE-01"></a>
### US-05-TASK-BE-01

- **Task ID:** US-05-TASK-BE-01
- **Title:** Create req-skeleton-check.js CLI wrapper
- **Outcome:** src/claude/scripts/req-skeleton-check.js exists: parses req/index.md's use-case index table, Acceptance Criteria table, and Business Rules table into the plain shape req-graph-checks.js expects, runs all 4 check functions, prints a JSON report, and exits 0 (clean) / 1 (findings) / 2 (parse failure)
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** AC-02
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add req-skeleton-check.js structural pre-check CLI

**Verification commands:**

```
node --check src/claude/scripts/req-skeleton-check.js
```

<a id="task-US-05-TASK-TEST-01"></a>
### US-05-TASK-TEST-01

- **Task ID:** US-05-TASK-TEST-01
- **Title:** Tests for req-skeleton-check.js exit-code contract
- **Outcome:** tests/req-skeleton-check.test.js exists asserting the 0/1/2 exit-code contract against a handful of fixture index.md files (clean, findings, unparseable)
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-05-TASK-BE-01
- **Acceptance criteria:** AC-08
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add req-skeleton-check.js exit-code contract tests

**Verification commands:**

```
npx jest --testPathPattern=tests/req-skeleton-check.test.js
```

<a id="task-US-04-TASK-BE-01"></a>
### US-04-TASK-BE-01

- **Task ID:** US-04-TASK-BE-01
- **Title:** Implement skeleton-call step in pm-phase1.js
- **Outcome:** pm-phase1.js dispatches gaia.agent.planner.requirements (no declared worker() output) only when req/index.md does not already exist, and the coordinator writes the response to req/index.md itself via c.writeOutput; an existing req/index.md is reused as-is (resume)
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-INFRA-01
- **Acceptance criteria:** AC-01
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add skeleton-call step with resume detection to pm-phase1.js

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```

<a id="task-US-04-TASK-BE-02"></a>
### US-04-TASK-BE-02

- **Task ID:** US-04-TASK-BE-02
- **Title:** Implement structural pre-check step in pm-phase1.js
- **Outcome:** pm-phase1.js calls req-skeleton-check.js via c.command(['run-asset', 'scripts/req-skeleton-check.js', ...]) against req/index.md; a non-zero exit code throws before any per-UC call is dispatched
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-05-TASK-BE-01, US-04-TASK-BE-01
- **Acceptance criteria:** AC-02
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add skeleton structural pre-check step to pm-phase1.js

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```

<a id="task-US-04-TASK-BE-03"></a>
### US-04-TASK-BE-03

- **Task ID:** US-04-TASK-BE-03
- **Title:** Implement per-UC generation loop with resume-by-existence in pm-phase1.js
- **Outcome:** pm-phase1.js parses req/index.md's use-case index table, and for each row whose req/use-cases/{UC-ID}.md does not already exist, dispatches gaia.agent.planner.requirements-use-case via buildUcPrompt() and writes the response via c.writeOutput; rows whose file already exists are skipped without dispatch
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-INFRA-01, US-04-TASK-BE-02
- **Acceptance criteria:** AC-02, AC-03
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add per-UC generation loop with resume-by-existence to pm-phase1.js

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```

<a id="task-US-04-TASK-BE-04"></a>
### US-04-TASK-BE-04

- **Task ID:** US-04-TASK-BE-04
- **Title:** Wire pm-phase1.js's Requirements step to assemble via req-assembler.js
- **Outcome:** pm-phase1.js's generateRequirements() calls req-assembler.js via c.command(['run-asset', 'scripts/req-assembler.js', ...]) against the req/ directory and writes the assembled document to file('Requirements') via c.writeOutput; the surrounding assertCompleteSections/docsDigest/Tech-Spec/validation-loop logic is unchanged and now reads this assembled file
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01, US-04-TASK-BE-03
- **Acceptance criteria:** AC-04, AC-06
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** wire pm-phase1.js Requirements generation to assemble via req-assembler.js

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```

<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Integration test: pm-phase1 resume-by-existence dispatches only missing use cases
- **Outcome:** tests/pm-phase1-req-resume.test.js exists: a pre-seeded req/ directory with some use-case files already present is run through pm-phase1.js's per-UC loop with a stubbed dispatch counting invocations; asserts exactly the missing UCs dispatch a call, and a legacy (non-req/) feature's existing Requirements.md still passes assertCompleteSections and preserves docsDigest behavior unchanged
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-04
- **Acceptance criteria:** AC-03, AC-08
- **Estimate — agent minutes:** 17
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add pm-phase1 requirements resume-by-existence integration test

**Verification commands:**

```
npx jest --testPathPattern=tests/pm-phase1-req-resume.test.js
```

## Statistics

| Domain | Count | Target | Above | Warning | Split |
|--------|-------|--------|-------|---------|-------|
| BE | 7 | 3 | 4 | 0 | 0 |
| FE | 0 | 0 | 0 | 0 | 0 |
| DB | 0 | 0 | 0 | 0 | 0 |
| DevOps | 0 | 0 | 0 | 0 | 0 |
| INFRA | 2 | 2 | 0 | 0 | 0 |
| TEST | 4 | 2 | 2 | 0 | 0 |
| **Total** | **13** | **7** | **6** | **0** | **0** |
