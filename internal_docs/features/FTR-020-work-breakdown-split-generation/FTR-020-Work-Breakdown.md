# Work Breakdown — FTR-020

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-020 |
| Schema | v2 |
| Generated | 2026-10-15T12:59:32.231Z |

## Summary
| Metric | Value |
|--------|-------|
| Total tasks | 16 |
| Total phases | 6 |
| Within target (≤15 min) | 8 |
| Above target (16–20 min) | 8 |
| Warning (21–30 min) | 0 |
| Split required (>30 min) | 0 |
| Domain distribution | BE: 9, FE: 0, DB: 0, DevOps: 0, INFRA: 2, TEST: 5 |

## Infrastructure Phase (INFRA)

### Commit
feat(FTR-020): shared wbs-split infrastructure

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| INFRA-TASK-BE-01 | Extract 11 skeleton-answerable checks into wb-graph-checks.js | src/claude/scripts/wb-graph-checks.js exists exporting one pure function per check (unique task IDs, ID format, domain whitelist, agentType whitelist, dependency existence, self-dependency, phase ID consistency, task cycle, phase dependency projection + cycle, phase schedulability, AC existence/scope/Must-coverage) plus parseAcTable/splitTableRow relocated from wb-validate.js, each taking a plain {phases, tasks} structure and returning error/warning objects in wb-validate.js's existing report shape | BE | 18 | — | 1 cmd — [details](#task-INFRA-TASK-BE-01) |
| INFRA-TASK-TEST-01 | Unit tests for wb-graph-checks.js functions | tests/wb-graph-checks.test.js exists covering all 11 exported functions directly, reusing fixtures from tests/wb-validate.checks-1-7.test.js, tests/wb-validate.checks-8-10.test.js, tests/wb-validate.checks-11.test.js, tests/wb-validate.checks-12-14.test.js, and tests/wb-validate.checks-19-21.test.js | TEST | 15 | INFRA-TASK-BE-01 | 1 cmd — [details](#task-INFRA-TASK-TEST-01) |
| INFRA-TASK-BE-02 | Create wbs-assembler.js with loadWorkBreakdown and detail block parse/render | src/claude/scripts/wbs-assembler.js exists exporting loadWorkBreakdown(inputPath) (dispatches on file vs. directory input, returns the existing {schemaVersion, feature, phases:[{...,tasks:[...]}]} shape), parseTaskDetailBlock(text)/renderTaskDetailBlock(task), and parsePhaseDetailBlock(text)/renderPhaseDetailBlock(phase) for the phase tier, all independently reimplemented (not imported from lib/task-executor/plan.js) | BE | 20 | — | 1 cmd — [details](#task-INFRA-TASK-BE-02) |
| INFRA-TASK-TEST-02 | Unit tests for wbs-assembler.js | tests/wbs-assembler.test.js exists covering: directory-format vs. legacy-JSON parity using the internal_docs/features/FTR-020-work-breakdown-split-generation/wbs/ fixture (deep-equal assembled output), missing index.json, missing referenced task file, missing referenced phase file, malformed task detail block, malformed phase detail block (each asserting a structured error naming the exact path), a parseTaskDetailBlock/renderTaskDetailBlock round-trip including verification commands with embedded pipes and backticks, a parsePhaseDetailBlock/renderPhaseDetailBlock round-trip, and a regression test parsing US-03-TASK-INFRA-01.md itself (whose Implementation notes contain an illustrative field-line example) asserting the real field values are returned, not the example's placeholder text | TEST | 19 | INFRA-TASK-BE-02 | 1 cmd — [details](#task-INFRA-TASK-TEST-02) |

## User Story Phases

### US-02: As the coordinator, I want to validate the skeleton structurally before spending per-task tokens, so that a broken graph is rejected before any per-task call is dispatched

### Commit
feat(FTR-020): implement US-02 skeleton structural pre-checks

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-02-TASK-BE-01 | Wire wb-validate.js to use wb-graph-checks.js for checks 3, 5-14, 19-21 | wb-validate.js requires wb-graph-checks.js and calls its functions for checks 3, 5-14, 19-21 instead of the previous inline code; checks 4, 15-18, 22, 23 remain inline unchanged | BE | 16 | INFRA-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-BE-01) |
| US-02-TASK-BE-02 | Wire wb-validate.js to load input via wbs-assembler.loadWorkBreakdown | wb-validate.js's top-of-file fs.readFileSync + JSON.parse pair is replaced with const wb = loadWorkBreakdown(process.argv[2]); the rest of the script (report construction, all checks) is unchanged | BE | 10 | INFRA-TASK-BE-02, US-02-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-BE-02) |
| US-02-TASK-TEST-01 | Regression test: wb-validate.js output byte-identical before/after extraction | tests/wb-validate.extraction-regression.test.js exists running wb-validate.js against the existing checks-1-7/8-10/11/12-14/15-18/19-21/22-23 fixtures and asserting identical JSON report and exit code to the pre-extraction baseline | TEST | 14 | US-02-TASK-BE-01, US-02-TASK-BE-02 | 1 cmd — [details](#task-US-02-TASK-TEST-01) |

### US-05: As the coordinator, I want wb-render.js to assemble its input from either format, so that final Work Breakdown .md/.csv output is unaffected by this feature

### Commit
feat(FTR-020): implement US-05 renderer directory-format support

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-05-TASK-BE-01 | Wire wb-render.js to load input via wbs-assembler.loadWorkBreakdown | wb-render.js's top-of-file fs.readFileSync + JSON.parse pair is replaced with const wb = loadWorkBreakdown(process.argv[2]); renderMarkdown, renderCsv, computePhaseDependsOn, sanitizeField, fencedCommandBlock, and taskAnchor are unchanged | BE | 10 | INFRA-TASK-BE-02 | 1 cmd — [details](#task-US-05-TASK-BE-01) |
| US-05-TASK-TEST-01 | Regression test: wb-render.js byte-identical .md/.csv for split-dir vs legacy-JSON input | tests/wb-render.wbs-directory-parity.test.js exists building an equivalent split-directory and legacy-JSON fixture pair and asserting wb-render.js produces byte-identical .md and .csv output from both | TEST | 14 | US-05-TASK-BE-01 | 1 cmd — [details](#task-US-05-TASK-TEST-01) |

### US-01: As the coordinator, I want one bounded call to fix the whole task graph, so that per-task calls never need to invent IDs, phases, or dependencies

### Commit
feat(FTR-020): implement US-01 skeleton-generation agent

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-01-TASK-INFRA-01 | Repurpose gaia-generate-work-breakdown.md to emit the schema-v3 skeleton only | src/claude/agents/gaia-generate-work-breakdown.md's Step 7 describes the schema-v3 skeleton shape (phases + per-task structural fields: id, title, outcome, domain, agentType, dependsOn, acceptanceCriteria, estimate, outputCount, commit) instead of full schema-v2 task objects; Atomicity Contract, task-ID format, and dependency/AC-assignment guidance are retained; verification-command and grouping-rationale guidance is removed (moved to the new per-task agent) | INFRA | 18 | — | 1 cmd — [details](#task-US-01-TASK-INFRA-01) |

### US-03: As the coordinator, I want a per-task agent that fills in one task's detail, so that a single task's generation failure never requires regenerating any other task

### Commit
feat(FTR-020): implement US-03 per-task detail-generation agent

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-03-TASK-INFRA-01 | Create gaia-generate-work-breakdown-task.md agent | src/claude/agents/gaia-generate-work-breakdown-task.md exists (sonnet, no Write tool) taking one skeleton task entry + relevant Tech-Spec section + compact full-skeleton task list as input, returning that task's detail block in the existing rendered format (field lines + fenced verification commands), instructed to restate skeleton-owned fields verbatim and supply only verification commands and groupingRationale as new content | INFRA | 15 | — | 1 cmd — [details](#task-US-03-TASK-INFRA-01) |

### US-04: As the coordinator, I want pm-phase2.js to orchestrate the skeleton and per-task passes with resume-by-status, so that generation, validation, and rendering compose into the existing Gate 2 flow unchanged

### Commit
feat(FTR-020): implement US-04 pm-phase2.js orchestration

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-04-TASK-BE-01 | Implement skeleton-call step in pm-phase2.js | pm-phase2.js dispatches gaia.agent.planner.work-breakdown with the SKELETON_SCHEMA (no declared worker() output), then materializeIndex() adds detailFile and status:"pending" per task, and the coordinator writes wbs/index.json itself via c.writeOutput; resume path (index.json already exists) reuses it via c.json instead of re-dispatching | BE | 18 | US-01-TASK-INFRA-01, INFRA-TASK-BE-02 | 1 cmd — [details](#task-US-04-TASK-BE-01) |
| US-04-TASK-BE-02 | Implement structural pre-check step in pm-phase2.js | pm-phase2.js calls a new runGraphChecks(index, requirementsText) helper that invokes the same wb-graph-checks.js functions wb-validate.js now imports, against the skeleton shape; a non-empty result throws before any per-task call is dispatched | BE | 14 | INFRA-TASK-BE-01, US-04-TASK-BE-01 | 1 cmd — [details](#task-US-04-TASK-BE-02) |
| US-04-TASK-BE-03 | Implement per-task generation loop with resume-by-status in pm-phase2.js | pm-phase2.js iterates index.phases/taskIds in order; for each task with status !== "generated" or a missing detail file, dispatches gaia.agent.planner.work-breakdown-task via buildTaskPrompt(), writes the response to wbs/tasks/{taskId}.md via c.writeOutput, sets status to "generated", and persists index.json after each task; already-generated tasks with an existing file are skipped without dispatch | BE | 20 | US-03-TASK-INFRA-01, US-04-TASK-BE-02 | 1 cmd — [details](#task-US-04-TASK-BE-03) |
| US-04-TASK-BE-04 | Wire pm-phase2.js's wb-validate.js/wb-render.js calls to pass the wbs directory | pm-phase2.js's existing c.command(['run-asset', 'scripts/wb-validate.js', ...]) and c.command(['run-asset', 'scripts/wb-render.js', ...]) calls receive the wbs directory path instead of the single jsonPath; the rest of the existing report/semantic-validation/render/Gate-2-payload body is unchanged | BE | 10 | US-02-TASK-BE-02, US-05-TASK-BE-01, US-04-TASK-BE-03 | 1 cmd — [details](#task-US-04-TASK-BE-04) |
| US-04-TASK-TEST-01 | Integration test: pm-phase2 resume-by-status dispatches only pending tasks | tests/pm-phase2-wbs-resume.test.js exists: a pre-seeded index.json with some tasks already status:"generated" (with existing detail files) and some "pending" is run through pm-phase2.js's per-task loop with a stubbed dispatch counting invocations; asserts exactly the pending tasks dispatch a call and generated tasks are skipped | TEST | 18 | US-04-TASK-BE-04 | 1 cmd — [details](#task-US-04-TASK-TEST-01) |

## Task Details

> Authoritative per-task detail. Every field is rendered integrally so this document, together with the dispatch CSV, is a complete deliverable requiring no separate JSON. Verification commands are preserved **verbatim** in fenced code blocks — operators such as `||`, shell pipes `|`, and regex alternations (`grep -E 'a|b|c'`) survive byte-for-byte. Each command is an independent fenced block.

<a id="task-INFRA-TASK-BE-01"></a>
### INFRA-TASK-BE-01

- **Task ID:** INFRA-TASK-BE-01
- **Title:** Extract 11 skeleton-answerable checks into wb-graph-checks.js
- **Outcome:** src/claude/scripts/wb-graph-checks.js exists exporting one pure function per check (unique task IDs, ID format, domain whitelist, agentType whitelist, dependency existence, self-dependency, phase ID consistency, task cycle, phase dependency projection + cycle, phase schedulability, AC existence/scope/Must-coverage) plus parseAcTable/splitTableRow relocated from wb-validate.js, each taking a plain {phases, tasks} structure and returning error/warning objects in wb-validate.js's existing report shape
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** All 11 checks share the same module, inputs, and output contract; splitting them into separate tasks would not be independently verifiable since none compiles or is meaningful alone without the others' shared helpers (parseAcTable, splitTableRow, the WHITE/GRAY/BLACK cycle-DFS).
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add wb-graph-checks.js with 11 extracted pure check functions

**Verification commands:**

```
node --check src/claude/scripts/wb-graph-checks.js
```

<a id="task-INFRA-TASK-TEST-01"></a>
### INFRA-TASK-TEST-01

- **Task ID:** INFRA-TASK-TEST-01
- **Title:** Unit tests for wb-graph-checks.js functions
- **Outcome:** tests/wb-graph-checks.test.js exists covering all 11 exported functions directly, reusing fixtures from tests/wb-validate.checks-1-7.test.js, tests/wb-validate.checks-8-10.test.js, tests/wb-validate.checks-11.test.js, tests/wb-validate.checks-12-14.test.js, and tests/wb-validate.checks-19-21.test.js
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 25000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for wb-graph-checks.js

**Verification commands:**

```
npx jest --testPathPattern=tests/wb-graph-checks.test.js
```

<a id="task-INFRA-TASK-BE-02"></a>
### INFRA-TASK-BE-02

- **Task ID:** INFRA-TASK-BE-02
- **Title:** Create wbs-assembler.js with loadWorkBreakdown and detail block parse/render
- **Outcome:** src/claude/scripts/wbs-assembler.js exists exporting loadWorkBreakdown(inputPath) (dispatches on file vs. directory input, returns the existing {schemaVersion, feature, phases:[{...,tasks:[...]}]} shape), parseTaskDetailBlock(text)/renderTaskDetailBlock(task), and parsePhaseDetailBlock(text)/renderPhaseDetailBlock(phase) for the phase tier, all independently reimplemented (not imported from lib/task-executor/plan.js)
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 40000
- **Output count:** 1
- **Grouping rationale:** loadWorkBreakdown and its four helper functions (parseTaskDetailBlock, renderTaskDetailBlock, parsePhaseDetailBlock, renderPhaseDetailBlock) form one cohesive, mutually-dependent module — loadWorkBreakdown calls both parse functions internally and none is independently testable or meaningful without the others.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add wbs-assembler.js with directory/legacy loader and detail block codec

**Verification commands:**

```
node --check src/claude/scripts/wbs-assembler.js
```

<a id="task-INFRA-TASK-TEST-02"></a>
### INFRA-TASK-TEST-02

- **Task ID:** INFRA-TASK-TEST-02
- **Title:** Unit tests for wbs-assembler.js
- **Outcome:** tests/wbs-assembler.test.js exists covering: directory-format vs. legacy-JSON parity using the internal_docs/features/FTR-020-work-breakdown-split-generation/wbs/ fixture (deep-equal assembled output), missing index.json, missing referenced task file, missing referenced phase file, malformed task detail block, malformed phase detail block (each asserting a structured error naming the exact path), a parseTaskDetailBlock/renderTaskDetailBlock round-trip including verification commands with embedded pipes and backticks, a parsePhaseDetailBlock/renderPhaseDetailBlock round-trip, and a regression test parsing US-03-TASK-INFRA-01.md itself (whose Implementation notes contain an illustrative field-line example) asserting the real field values are returned, not the example's placeholder text
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** INFRA-TASK-BE-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 19
- **Estimate — tokens:** 36000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for wbs-assembler.js

**Verification commands:**

```
npx jest --testPathPattern=tests/wbs-assembler.test.js
```

<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Wire wb-validate.js to use wb-graph-checks.js for checks 3, 5-14, 19-21
- **Outcome:** wb-validate.js requires wb-graph-checks.js and calls its functions for checks 3, 5-14, 19-21 instead of the previous inline code; checks 4, 15-18, 22, 23 remain inline unchanged
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** above target (16 min): the 10 checks are wired as one mechanical, same-shaped substitution across one file; splitting per-check would produce 10 non-independently-verifiable partial edits to the same function.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** wire wb-validate.js to reuse wb-graph-checks.js for 11 extracted checks

**Verification commands:**

```
node --check src/claude/scripts/wb-validate.js
```

<a id="task-US-02-TASK-BE-02"></a>
### US-02-TASK-BE-02

- **Task ID:** US-02-TASK-BE-02
- **Title:** Wire wb-validate.js to load input via wbs-assembler.loadWorkBreakdown
- **Outcome:** wb-validate.js's top-of-file fs.readFileSync + JSON.parse pair is replaced with const wb = loadWorkBreakdown(process.argv[2]); the rest of the script (report construction, all checks) is unchanged
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-02, US-02-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** wire wb-validate.js to accept split-directory or legacy-JSON input via wbs-assembler

**Verification commands:**

```
node --check src/claude/scripts/wb-validate.js
```

<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Regression test: wb-validate.js output byte-identical before/after extraction
- **Outcome:** tests/wb-validate.extraction-regression.test.js exists running wb-validate.js against the existing checks-1-7/8-10/11/12-14/15-18/19-21/22-23 fixtures and asserting identical JSON report and exit code to the pre-extraction baseline
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01, US-02-TASK-BE-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add wb-validate.js extraction regression test

**Verification commands:**

```
npx jest --testPathPattern=tests/wb-validate.extraction-regression.test.js
```

<a id="task-US-05-TASK-BE-01"></a>
### US-05-TASK-BE-01

- **Task ID:** US-05-TASK-BE-01
- **Title:** Wire wb-render.js to load input via wbs-assembler.loadWorkBreakdown
- **Outcome:** wb-render.js's top-of-file fs.readFileSync + JSON.parse pair is replaced with const wb = loadWorkBreakdown(process.argv[2]); renderMarkdown, renderCsv, computePhaseDependsOn, sanitizeField, fencedCommandBlock, and taskAnchor are unchanged
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** wire wb-render.js to accept split-directory or legacy-JSON input via wbs-assembler

**Verification commands:**

```
node --check src/claude/scripts/wb-render.js
```

<a id="task-US-05-TASK-TEST-01"></a>
### US-05-TASK-TEST-01

- **Task ID:** US-05-TASK-TEST-01
- **Title:** Regression test: wb-render.js byte-identical .md/.csv for split-dir vs legacy-JSON input
- **Outcome:** tests/wb-render.wbs-directory-parity.test.js exists building an equivalent split-directory and legacy-JSON fixture pair and asserting wb-render.js produces byte-identical .md and .csv output from both
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-05-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add wb-render.js split-directory parity regression test

**Verification commands:**

```
npx jest --testPathPattern=tests/wb-render.wbs-directory-parity.test.js
```

<a id="task-US-01-TASK-INFRA-01"></a>
### US-01-TASK-INFRA-01

- **Task ID:** US-01-TASK-INFRA-01
- **Title:** Repurpose gaia-generate-work-breakdown.md to emit the schema-v3 skeleton only
- **Outcome:** src/claude/agents/gaia-generate-work-breakdown.md's Step 7 describes the schema-v3 skeleton shape (phases + per-task structural fields: id, title, outcome, domain, agentType, dependsOn, acceptanceCriteria, estimate, outputCount, commit) instead of full schema-v2 task objects; Atomicity Contract, task-ID format, and dependency/AC-assignment guidance are retained; verification-command and grouping-rationale guidance is removed (moved to the new per-task agent)
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** repurpose gaia-generate-work-breakdown.md to emit schema-v3 skeleton

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter
```

<a id="task-US-03-TASK-INFRA-01"></a>
### US-03-TASK-INFRA-01

- **Task ID:** US-03-TASK-INFRA-01
- **Title:** Create gaia-generate-work-breakdown-task.md agent
- **Outcome:** src/claude/agents/gaia-generate-work-breakdown-task.md exists (sonnet, no Write tool) taking one skeleton task entry + relevant Tech-Spec section + compact full-skeleton task list as input, returning that task's detail block in the existing rendered format (field lines + fenced verification commands), instructed to restate skeleton-owned fields verbatim and supply only verification commands and groupingRationale as new content
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add gaia-generate-work-breakdown-task.md per-task detail agent

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter
```

<a id="task-US-04-TASK-BE-01"></a>
### US-04-TASK-BE-01

- **Task ID:** US-04-TASK-BE-01
- **Title:** Implement skeleton-call step in pm-phase2.js
- **Outcome:** pm-phase2.js dispatches gaia.agent.planner.work-breakdown with the SKELETON_SCHEMA (no declared worker() output), then materializeIndex() adds detailFile and status:"pending" per task, and the coordinator writes wbs/index.json itself via c.writeOutput; resume path (index.json already exists) reuses it via c.json instead of re-dispatching
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-INFRA-01, INFRA-TASK-BE-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add skeleton-call step with resume detection to pm-phase2.js

**Verification commands:**

```
node --check src/claude/workflows/pm-phase2.js
```

<a id="task-US-04-TASK-BE-02"></a>
### US-04-TASK-BE-02

- **Task ID:** US-04-TASK-BE-02
- **Title:** Implement structural pre-check step in pm-phase2.js
- **Outcome:** pm-phase2.js calls a new runGraphChecks(index, requirementsText) helper that invokes the same wb-graph-checks.js functions wb-validate.js now imports, against the skeleton shape; a non-empty result throws before any per-task call is dispatched
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01, US-04-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add skeleton structural pre-check step to pm-phase2.js

**Verification commands:**

```
node --check src/claude/workflows/pm-phase2.js
```

<a id="task-US-04-TASK-BE-03"></a>
### US-04-TASK-BE-03

- **Task ID:** US-04-TASK-BE-03
- **Title:** Implement per-task generation loop with resume-by-status in pm-phase2.js
- **Outcome:** pm-phase2.js iterates index.phases/taskIds in order; for each task with status !== "generated" or a missing detail file, dispatches gaia.agent.planner.work-breakdown-task via buildTaskPrompt(), writes the response to wbs/tasks/{taskId}.md via c.writeOutput, sets status to "generated", and persists index.json after each task; already-generated tasks with an existing file are skipped without dispatch
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-INFRA-01, US-04-TASK-BE-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** above target (20 min): the dispatch, write, status update, and persist-after-each-task steps are one atomic resume-safety unit (US-04's BR-03/BR-04) that cannot be split without leaving an intermediate state where a task could be marked generated without its file, or vice versa.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add per-task generation loop with resume-by-status to pm-phase2.js

**Verification commands:**

```
node --check src/claude/workflows/pm-phase2.js
```

<a id="task-US-04-TASK-BE-04"></a>
### US-04-TASK-BE-04

- **Task ID:** US-04-TASK-BE-04
- **Title:** Wire pm-phase2.js's wb-validate.js/wb-render.js calls to pass the wbs directory
- **Outcome:** pm-phase2.js's existing c.command(['run-asset', 'scripts/wb-validate.js', ...]) and c.command(['run-asset', 'scripts/wb-render.js', ...]) calls receive the wbs directory path instead of the single jsonPath; the rest of the existing report/semantic-validation/render/Gate-2-payload body is unchanged
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-02, US-05-TASK-BE-01, US-04-TASK-BE-03
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** wire pm-phase2.js validate/render calls to the wbs directory path

**Verification commands:**

```
node --check src/claude/workflows/pm-phase2.js
```

<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Integration test: pm-phase2 resume-by-status dispatches only pending tasks
- **Outcome:** tests/pm-phase2-wbs-resume.test.js exists: a pre-seeded index.json with some tasks already status:"generated" (with existing detail files) and some "pending" is run through pm-phase2.js's per-task loop with a stubbed dispatch counting invocations; asserts exactly the pending tasks dispatch a call and generated tasks are skipped
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-04
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add pm-phase2 resume-by-status integration test

**Verification commands:**

```
npx jest --testPathPattern=tests/pm-phase2-wbs-resume.test.js
```

## Statistics

| Domain | Count | Target | Above | Warning | Split |
|--------|-------|--------|-------|---------|-------|
| BE | 9 | 4 | 5 | 0 | 0 |
| FE | 0 | 0 | 0 | 0 | 0 |
| DB | 0 | 0 | 0 | 0 | 0 |
| DevOps | 0 | 0 | 0 | 0 | 0 |
| INFRA | 2 | 1 | 1 | 0 | 0 |
| TEST | 5 | 3 | 2 | 0 | 0 |
| **Total** | **16** | **8** | **8** | **0** | **0** |
