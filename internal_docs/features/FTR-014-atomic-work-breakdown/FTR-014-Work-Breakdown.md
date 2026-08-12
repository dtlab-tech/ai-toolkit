# Work Breakdown — Atomic Work Breakdown

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-014 — Atomic Work Breakdown |
| Version | 2.0 |
| Date | 2026-08-09 |
| Status | Draft |
| Source: Requirements | FTR-014-Requirements.md |
| Source: Tech-Spec | FTR-014-Tech-Spec.md |

---

## 1. Summary

| Metric | Value |
|--------|-------|
| Total User Stories | 7 |
| Total Tasks | 62 |
| Domain distribution | BE: 32, INFRA: 12, TEST: 18 |
| Complexity | S: 28, M: 34 |
| Estimated total (Human) | ~61h |
| Estimated total (Agent) | ~564min (~9h 24min) |
| Implementation phases | 8 |

---

## 2. Shared Infrastructure Tasks

| ID | Task | Domain | Required by | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|-------------|------------|-----------|-----------|-------------|
| INFRA-T01 | Create `.claude/scripts/` directory structure | INFRA | US-02, US-04 | S | 15min | 5min | Establish the `.claude/scripts/` directory; verify it is included in installer copy paths |
| INFRA-T02 | Define WB JSON schema v2 constants | INFRA | US-01, US-02, US-04 | M | 30min | 10min | Define constants at the top of `wb-validate.js`: schema version, required phase/task fields, domain whitelist, agentType whitelist; output is the constants block inside `wb-validate.js` |
| INFRA-T03 | Create AC table parser test fixture | INFRA | US-02 | S | 25min | 8min | Write `tests/fixtures/ac-table-format.md` with example UC metadata tables and AC table in the exact format expected by the Section 3.2 parser contract |
| INFRA-T04 | Define WB_WRAPPER_SCHEMA and WB_RENDER_SCHEMA constants | INFRA | US-05, US-06 | S | 15min | 5min | Define inline in `pm-phase2.js`: `WB_WRAPPER_SCHEMA = { exitCode, stdout, stderr }` and `WB_RENDER_SCHEMA = { exitCode, stdout, stderr, markdownPath, csvPath, markdownExists, csvExists }`; output is the constants block inside `pm-phase2.js` |
| INFRA-T05 | Create test fixtures — valid and invalid WB JSON samples | INFRA | US-02, US-04 | S | 15min | 5min | Write `tests/fixtures/wb-valid.json` (schema v2, 2+ phases, 5+ tasks) and `tests/fixtures/wb-invalid-*.json` covering each validation error category |
| INFRA-T06 | Extract buildWaves algorithm as shared test utility | INFRA | US-02, US-04 | M | 40min | 12min | Extract pm-phase3's `buildWaves` wave-planning function into `.claude/scripts/tests/helpers/buildWaves.js`; verify it returns identical waves on a known fixture |
| INFRA-T07 | Define duration policy constants | INFRA | US-02 | S | 10min | 3min | Define `TARGET_MAX=15`, `ABOVE_MAX=20`, `WARNING_MAX=30` as module-level constants inside `wb-validate.js`; output is the constants block inside `wb-validate.js` |
| INFRA-T08 | Define wb-validate error catalog constants | INFRA | US-02 | S | 15min | 5min | Define all 19+ error category strings (`unique_id_violation`, `missing_field`, etc.) as a constants object inside `wb-validate.js`; eliminates magic strings across wb-validate.js |

---

## 3. User Stories

### US-01: Update generate-work-breakdown to produce schema v2 JSON

| Field | Value |
|-------|-------|
| Derived from | UC-01 |
| Actor | `generate-work-breakdown` agent (haiku) |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-02, AC-03, AC-04, AC-13 |

**Description:**
As a feature delivery architect, I want the `generate-work-breakdown` agent to produce schema v2 JSON with all required task fields, so that wb-validate.js can perform deterministic validation on its output.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-01-T01 | Update `generate-work-breakdown.md` to produce schema v2 JSON | INFRA | INFRA-T02 | M | 30min | 10min | Modify `.claude/agents/generate-work-breakdown.md`: produce `{PREFIX}-Work-Breakdown.json` (schema v2) with all task fields (outcome, dependsOn, acceptanceCriteria, verification.commands, estimate, outputCount, groupingRationale, commit); target ≤15 min/task; phase-level commit |
| US-01-T02 | Generate Work Breakdown JSON for a test feature | BE | US-01-T01 | M | 1.5h | 10min | Run the updated agent on a real test feature; produce valid `{PREFIX}-Work-Breakdown.json` with 10+ tasks across 2+ phases; verify all required fields present |
| US-01-T03 | Verify schema v2 compliance | TEST | US-01-T02 | S | 30min | 5min | Manually inspect the generated JSON against the schema v2 field list from INFRA-T02 constants; verify all required fields present and schemaVersion === 2; no dependency on wb-validate.js (runs in parallel with US-02) |

---

### US-02: Implement wb-validate.js deterministic validator

| Field | Value |
|-------|-------|
| Derived from | UC-02 |
| Actor | `.claude/scripts/wb-validate.js` (deterministic Node.js module) |
| Priority | Must |
| Acceptance Criteria | AC-05, AC-06, AC-07, AC-08, AC-09, AC-13, AC-16, AC-17, AC-18 |

**Description:**
As a work breakdown validator, I want to perform all 23 deterministic structural checks on the JSON without invoking an LLM, so that I can provide fast, reproducible validation results with no token cost.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-02-T01 | Implement wb-validate.js entry point — JSON parse and schema version check | BE | INFRA-T02, INFRA-T07, INFRA-T08 | M | 1.5h | 10min | Create `.claude/scripts/wb-validate.js`; parse CLI args (JSON path, Requirements path); parse JSON with exit 2 on failure; check schemaVersion === 2 |
| US-02-T02 | Implement unique ID and required field validation | BE | US-02-T01 | S | 1h | 8min | Detect duplicate task IDs across all phases; verify all phase and task fields present and non-null (outcome, domain, agentType, dependsOn, acceptanceCriteria, verification.commands, estimate.agentMinutes, estimate.tokens, outputCount, commit.subject) |
| US-02-T03 | Implement task ID format, domain, agentType validation | BE | US-02-T01 | S | 45min | 5min | Verify task IDs match `INFRA-TASK-{DOMAIN}-{NN}` or `{US-ID}-TASK-{DOMAIN}-{NN}`; domain in whitelist (BE, FE, DB, DevOps, INFRA, TEST); agentType in whitelist |
| US-02-T04 | Implement task dependency resolution — refs, self-dep, phase consistency | BE | US-02-T01 | S | 1h | 8min | Verify all `dependsOn` IDs exist in the feature; reject self-dependencies; verify `INFRA-TASK-*` only in INFRA phase, `{US-ID}-TASK-*` only in matching US phase |
| US-02-T05 | Implement task cycle detection (DFS gray/black coloring) | BE | US-02-T04 | M | 2h | 15min | Full DFS traversal over task graph with gray/black marking; detect and report all members of every cycle; acyclic graph passes cleanly |
| US-02-T06 | Implement phase-level dependency projection and cycle detection | BE | US-02-T04, INFRA-T06 | M | 1.5h | 10min | Union all task `dependsOn` IDs per phase → map to owner phases → remove self → deduplicate; verify all referenced phase IDs exist; DFS cycle detection on phase graph |
| US-02-T07 | Implement phase schedulability check (buildWaves) | BE | US-02-T06, INFRA-T06 | S | 1h | 8min | Apply `buildWaves` algorithm from INFRA-T06 utility to the phase graph; flag any phase that cannot be consumed as `phase_unschedulable` (blocking error) |
| US-02-T08 | Implement duration policy checks | BE | US-02-T01, INFRA-T07 | S | 45min | 5min | Categorize each task into four bands using INFRA-T07 constants: ≤15 target (no flag), 16–20 above target (no flag), 21–30 warning (non-blocking), >30 splitRequired (blocking error) |
| US-02-T09 | Implement verification command, commit subject, outputCount rationale validation | BE | US-02-T01 | S | 45min | 5min | Reject empty `verification.commands[]` or empty entries; reject null/empty `commit.subject`; if `outputCount > 1`, require non-null `groupingRationale` |
| US-02-T10 | Implement AC parser (Section 3.2 contract) | BE | INFRA-T03 | M | 1.5h | 12min | Parse `## 7. Acceptance Criteria` table from Requirements.md per the exact Section 3.2 contract; build `Map<acId, { priority, allowedUserStories, unscoped }>` in memory; abort exit 2 if table not found or malformed |
| US-02-T11 | Implement AC existence and scope validation | BE | US-02-T10 | M | 1.25h | 10min | For each AC ID in task `acceptanceCriteria[]`: verify it exists in the parsed AC index; verify the task's US is in `allowedUserStories` (or AC is unscoped); error categories `ac_not_found`, `ac_wrong_us`, `ac_invalid_uc_ref`, `uc_missing_priority` |
| US-02-T12 | Implement AC priority derivation and Must coverage check | BE | US-02-T10, US-02-T11 | S | 1h | 8min | Derive priority per AC from UC metadata (Must > Should > Could for multi-UC); verify every AC with derived priority Must is referenced by ≥1 task; error category `must_ac_uncovered` |
| US-02-T13 | Implement text field character validation and empty phase detection | BE | US-02-T01 | S | 45min | 5min | Reject `|`, CR (`\r`), LF (`\n`) in `phase.title`, `task.title`, `commit.subject`; reject phases with zero tasks |
| US-02-T14 | Implement validator report output and exit codes | BE | US-02-T01 | S | 1h | 8min | Construct and emit structured JSON report to stdout: `{ valid, schemaVersion, taskCount, errors[], warnings[], durationBands, domainDistribution, dependencies }`; exit 0 (pass), 1 (validation errors), 2 (runtime error) |
| US-02-T15 | Tests: schema version, unique IDs, required fields, task ID format, domain/agentType | TEST | US-02-T01, US-02-T02, US-02-T03 | M | 1.5h | 15min | Jest suite covering checks 1–7: schemaVersion 2 required; duplicate IDs detected; missing/null fields detected; ID format patterns; domain whitelist; agentType whitelist |
| US-02-T16 | Tests: task dependencies — refs, self-dep, phase consistency, cross-phase | TEST | US-02-T04 | M | 1.25h | 12min | Jest suite covering checks 8–10: non-existent `dependsOn` ID; self-dependency; INFRA-TASK-* in wrong phase; US-ID-TASK-* in wrong phase; cross-phase INFRA deps work |
| US-02-T17 | Tests: task cycle detection | TEST | US-02-T05 | M | 1h | 10min | Jest suite covering check 11: A→B→A cycle detected; A→B→C→A longer cycle; all cycle members reported; acyclic graph passes |
| US-02-T18 | Tests: phase graph — projection, cycles, schedulability | TEST | US-02-T06, US-02-T07 | M | 1.25h | 12min | Jest suite covering checks 12–14: phase aggregate computed correctly; phase self-dep detected; phase cycle detected; buildWaves consumes all phases; unschedulable phase flagged |
| US-02-T19 | Tests: duration policy, verification commands, commit subject, outputCount | TEST | US-02-T08, US-02-T09 | M | 1h | 10min | Jest suite covering checks 15–18: four-band categorization; empty commands[]; empty string in commands[]; null commit.subject; outputCount > 1 without rationale |
| US-02-T20 | Tests: AC parsing, scope, priority derivation, Must coverage | TEST | US-02-T10, US-02-T11, US-02-T12 | M | 1.5h | 15min | Jest suite covering checks 19–21: AC exists; AC scope (single UC, multi-UC, All UCs); non-existent UC-NN in Related UC; UC missing priority; priority derivation; Must AC uncovered |
| US-02-T21 | Tests: text field characters, empty phase, report structure, exit codes | TEST | US-02-T13, US-02-T14 | M | 1h | 10min | Jest suite covering checks 22–23 and output contract: pipe/CR/LF in title/commit; empty phase; report JSON structure; exit 0/1/2 routing |

---

### US-03: Create validate-work-breakdown-semantic agent

| Field | Value |
|-------|-------|
| Derived from | UC-03 |
| Actor | `validate-work-breakdown-semantic` agent (Sonnet) |
| Priority | Must |
| Acceptance Criteria | AC-10, AC-11, AC-19, AC-20 |

**Description:**
As a semantic validator, I want to analyze task coherence and scope alignment against the requirements, so that I can detect hidden multiplicity, scope creep, estimation misalignment, and bundled verifiable outcomes that escaped structural validation.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-03-T01 | Create `validate-work-breakdown-semantic.md` agent definition | INFRA | INFRA-T04 | M | 30min | 10min | New Sonnet agent at `.claude/agents/validate-work-breakdown-semantic.md`; reads `{PREFIX}-Work-Breakdown.json` and Requirements; analyzes each task for hidden multiplicity, scope creep, estimate incompatibility, bundled verifiable outcomes |
| US-03-T02 | Implement semantic analysis logic in agent | BE | US-03-T01 | M | 2h | 15min | Agent prompt logic: detect "N types", "all", "complete" patterns; verify task scope matches assigned US; flag unrealistic estimates; detect multiple independently verifiable outcomes |
| US-03-T03 | Implement structured semantic output | BE | US-03-T01, US-03-T02 | M | 1.25h | 10min | Agent returns `{ valid: boolean, findings: [{ taskId, type, severity, blocking, splitRequired, description }] }`; `valid: false` when any finding has `blocking: true` |
| US-03-T04 | Manual semantic validation on test features | TEST | US-03-T01, US-03-T02, US-03-T03 | M | 1.25h | 12min | Run agent on 3 test features with varied task complexity; verify output schema conforms to contract; review findings quality for representative cases |

---

### US-04: Implement wb-render.js Markdown and CSV renderer

| Field | Value |
|-------|-------|
| Derived from | UC-04 |
| Actor | `.claude/scripts/wb-render.js` (deterministic Node.js module) |
| Priority | Must |
| Acceptance Criteria | AC-14, AC-15, AC-16 |

**Description:**
As a renderer, I want to deterministically generate human-readable Markdown and machine-readable CSV from the authoritative JSON, so that stakeholders can review at Gate 2 and pm-phase3 can execute consistently.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-04-T01 | Implement wb-render.js entry point | BE | INFRA-T02 | S | 1h | 8min | Create `.claude/scripts/wb-render.js`; parse CLI args (JSON path, feature prefix, optional dest dir); parse JSON with exit 1 on failure; exit codes 0/1/2/3 |
| US-04-T02 | Implement phase-level depends_on aggregation | BE | INFRA-T06, US-04-T01 | M | 1.25h | 10min | For each phase: union all task `dependsOn` IDs → map to owner phases → remove current phase → deduplicate → join with space; same result as wb-validate.js projection; **must be implemented before CSV generation** |
| US-04-T03 | Implement defensive character stripping and commit message construction | BE | US-04-T01 | S | 45min | 5min | Strip `|`, CR, LF from `phase_title`, `task_title` before writing; construct `commit_message = phase.commit.type + "(" + feature + "): " + phase.commit.subject`; **must be implemented before CSV generation** |
| US-04-T04 | Implement Markdown output generation | BE | US-04-T01, US-04-T02, US-04-T03 | M | 1.5h | 12min | Generate `{PREFIX}-Work-Breakdown.md` per Tech-Spec Section 3.4 format: Document Info, Summary table, per-phase sections with task tables, four-band statistics, domain distribution |
| US-04-T05 | Implement CSV output generation | BE | US-04-T01, US-04-T02, US-04-T03 | M | 1.5h | 12min | Generate `{PREFIX}-Work-Breakdown.csv`: pipe-separated, 8-column header, one row per task, `depends_on` = phase-level aggregate (same on every row of phase), stripped text fields, constructed commit_message |
| US-04-T06 | Tests: Markdown structure, CSV structure, dependency aggregation | TEST | US-04-T04, US-04-T05 | M | 1.5h | 15min | Jest tests: header present, summary table correct, phases rendered in order, task tables formatted, statistics included; CSV header correct, 8 columns, one row per task, same depends_on on all rows of a phase |
| US-04-T07 | Tests: character stripping, commit construction, output file paths | TEST | US-04-T03, US-04-T04, US-04-T05 | M | 1h | 10min | Jest tests: pipe stripped from phase_title/task_title/commit; commit_message constructed correctly; .md and .csv written to correct directory |
| US-04-T08 | CSV regression test against pm-phase3 parser | TEST | US-04-T05 | M | 1.25h | 12min | Integration test: generate CSV via wb-render.js → parse with pm-phase3 CSV parser (extracted to test helper) → run buildWaves → verify correct wave ordering; depends_on consistent across all rows of a phase |

---

### US-05: Update pm-phase2 orchestration and Gate 2 presentation

| Field | Value |
|-------|-------|
| Derived from | UC-05 |
| Actor | `pm-phase2` workflow |
| Priority | Must |
| Acceptance Criteria | AC-07, AC-12, AC-17, AC-18, AC-20 |

**Description:**
As a workflow orchestrator, I want pm-phase2 to invoke wb-validate, semantic validator, and wb-render sequentially with conditional execution, then assemble Gate 2 payload and present it with all blocking reasons, so that Gate 2 blocks appropriately and gives the reviewer all necessary information.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-05-T01 | Update pm-phase2.js — invoke wb-validate sequentially | BE | INFRA-T04, US-02-T14 | M | 1.5h | 10min | Add step 2 to pm-phase2: run `node .claude/scripts/wb-validate.js` via agent; capture exitCode/stdout/stderr (WB_WRAPPER_SCHEMA); routing: exit 0/1 → done; exit 2/unexpected → throw; empty stdout → throw; non-JSON stdout → throw; consistency guards |
| US-05-T02 | Add semantic validator invocation (conditional on wb-validate exit 0) | BE | US-03-T03, US-05-T01 | S | 1h | 8min | Step 3: if `wbValidatorPassed`, invoke `validate-work-breakdown-semantic` agent; on technical failure set `semanticFailed = true`; skip if wb-validate did not pass |
| US-05-T03 | Add wb-render invocation (conditional on wb-validate pass and semantic not failed) | BE | US-04-T05, US-05-T01 | S | 1h | 8min | Step 4: if `wbValidatorPassed && !semanticFailed`, invoke `wb-render.js` via agent with WB_RENDER_SCHEMA; verify markdownExists and csvExists; on failure set `renderFailed = true` |
| US-05-T04 | Implement four-band duration statistics computation | BE | US-05-T01 | S | 1h | 8min | From `wbValidatorReport.durationBands`: extract target/aboveTarget/warning/splitRequired counts; compute domain distribution; extract warning-band task list and grouped tasks |
| US-05-T05 | Implement Gate 2 blocking logic | BE | US-05-T01, US-05-T02, US-05-T03, US-05-T04 | M | 1.25h | 10min | Block Gate 2 if: `validateFailed`, `!wbValidatorPassed`, `semanticFailed`, `renderFailed`, any semantic finding `blocking: true`, any Must AC uncovered; collect all `gate2BlockedReasons` |
| US-05-T06 | Assemble complete gate2_payload structure | BE | US-05-T04, US-05-T05 | S | 1h | 8min | Build payload: js_validator_report, js_validator_failed, semantic_validator_result, semantic_validator_failed, renderer_result, renderer_failed, duration_bands, domain_distribution, warning_band_tasks, split_required_tasks, must_ac_uncovered, phase_unschedulable, gate2_blocked |
| US-05-T07 | Update `implement-feature` SKILL.md Gate 2 presentation | INFRA | US-05-T06 | S | 25min | 8min | Modify `.claude/skills/implement-feature/SKILL.md`: Gate 2 presentation includes four-band duration stats, validator errors summary, semantic findings list, uncovered Must ACs, renderer failure status, all blocking reasons; result is a human-readable hard-stop message |
| US-05-T08 | Tests: orchestration flow — wb-validate → semantic → render sequence | TEST | US-05-T01, US-05-T02, US-05-T03 | M | 1h | 10min | Jest tests: wb-validate exit 1 → semantic skipped, render skipped; wb-validate exit 0 → semantic runs; semantic fails → render skipped; semantic pass → render runs |
| US-05-T09 | Tests: Gate 2 blocking logic | TEST | US-05-T05, US-05-T06 | M | 1h | 10min | Jest tests: each blocking condition triggers alone; all non-blocking → gate2_blocked = false; multiple conditions → all reasons listed |

---

### US-06: Add FTR-013 token ledger tracking to pm-phase2 pipeline

| Field | Value |
|-------|-------|
| Derived from | UC-06 |
| Actor | `pm-phase2` workflow (ledger integration) |
| Priority | Must |
| Acceptance Criteria | AC-18, AC-19, AC-20, AC-21 |

**Description:**
As a ledger tracker, I want to record all three new pm-phase2 activities (wb-validate, semantic, wb-render) in the FTR-013 token ledger with status transitions and token accounting, so that the FTR-013 token ledger has complete visibility into the validation pipeline.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-06-T01 | Implement FTR-013 ledger tracking for wb-validate | BE | US-05-T01 | S | 1h | 8min | `appendLedgerEntry(running)` before invoke; `updateLedgerEntry(done)` on exit 0/1; `updateLedgerEntry(failed)` on throw with actual tokens consumed, `error_summary`, `exit_code`; `validateExitCode` declared before try and set immediately after agent call; `err._exitCode ?? validateExitCode ?? null` in catch |
| US-06-T02 | Implement FTR-013 ledger tracking for semantic validator | BE | US-05-T02 | S | 1h | 8min | `appendLedgerEntry(running)` or `appendLedgerEntry(skipped)` if precondition not met; `updateLedgerEntry(done)` on success (even with blocking findings); `updateLedgerEntry(failed)` on technical error |
| US-06-T03 | Implement FTR-013 ledger tracking for wb-render | BE | US-05-T03 | S | 1h | 8min | `appendLedgerEntry(running/skipped)`; `updateLedgerEntry(done)` on exit 0 with both files present; `updateLedgerEntry(failed)` on non-zero exit, missing path, or missing files on disk; `err._exitCode ?? renderResult?.exitCode ?? null` in catch |
| US-06-T04 | Tests: ledger entry creation, status transitions, token attribution, exit_code routing | TEST | US-06-T01, US-06-T02, US-06-T03 | M | 1h | 10min | Jest tests: running → done/failed/skipped for each activity; phase_delta_tokens actual for done/failed, 0 for skipped; exit_code 0/1/2/null per scenario; error_summary present for failed entries; exit code attribution chains verified |

---

### US-07: Update installer to distribute wb scripts (AC-22 / NFR-00)

| Field | Value |
|-------|-------|
| Derived from | NFR-00 (AC-22) |
| Actor | `install-toolkit` agent, `bin/cli.js` |
| Priority | Must |
| Acceptance Criteria | AC-22 |

**Description:**
As a toolkit installer, I want all three installation methods (local copy, global install, install-toolkit agent) to distribute `wb-validate.js` and `wb-render.js` to the target project, so that pm-phase2 can invoke them without access to the ai-toolkit source repository.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-07-T01 | Update `install-toolkit.md` — add `.claude/scripts/` to copied directories | INFRA | US-02-T14, US-04-T05 | S | 15min | 5min | Modify `.claude/agents/install-toolkit.md`: add `.claude/scripts/` to the list of directories copied to the destination project; output is the updated agent file |
| US-07-T02 | Update `bin/cli.js` — add `.claude/scripts/` to global install mapping | BE | US-07-T01 | S | 45min | 5min | Modify `bin/cli.js`: add `{ src: '.claude/scripts', dest: 'scripts' }` (or equivalent) to the global install path mapping; output is the updated cli.js |
| US-07-T03 | Tests: local copy — wb-validate.js and wb-render.js present and invocable | TEST | US-07-T01, US-07-T02 | M | 1h | 10min | Jest/shell test: perform a local copy install to a temp target directory; verify `.claude/scripts/wb-validate.js` and `.claude/scripts/wb-render.js` exist; invoke each with `--help` or no-args to confirm they run without error |
| US-07-T04 | Tests: global install — scripts present and invocable | TEST | US-07-T02 | M | 1h | 10min | Jest/shell test: simulate global install (or run `bin/cli.js` with `--global`); verify scripts at expected global path; invoke both scripts to confirm invocable without ai-toolkit source |
| US-07-T05 | Tests: install-toolkit agent — scripts present in destination project | TEST | US-07-T01 | M | 1h | 10min | Run `install-toolkit` agent against a test destination project; verify both scripts exist at `.claude/scripts/`; verify they are invocable; covers all three install modes per AC-22 |

---

## 4. Dependency Graph

### Implementation Phases

Phases organized as **vertical slices**: each phase delivers a complete, committable increment.

#### Phase 1 — Shared Infrastructure (no dependencies)

| Task ID | Task | Domain |
|---------|------|--------|
| INFRA-T01 | Create `.claude/scripts/` directory structure | INFRA |
| INFRA-T02 | Define WB JSON schema v2 constants | INFRA |
| INFRA-T03 | Create AC table parser test fixture | INFRA |
| INFRA-T04 | Define WB_WRAPPER_SCHEMA and WB_RENDER_SCHEMA constants | INFRA |
| INFRA-T05 | Create test fixtures — valid and invalid WB JSON samples | INFRA |
| INFRA-T06 | Extract buildWaves algorithm as shared test utility | INFRA |
| INFRA-T07 | Define duration policy constants | INFRA |
| INFRA-T08 | Define wb-validate error catalog constants | INFRA |

#### Phase 2 — US-01: Update generate-work-breakdown (depends on Phase 1)

| Task ID | Task | Domain |
|---------|------|--------|
| US-01-T01 | Update `generate-work-breakdown.md` to produce schema v2 JSON | INFRA |
| US-01-T02 | Generate Work Breakdown JSON for a test feature | BE |
| US-01-T03 | Verify schema v2 compliance | TEST |

#### Phase 3 — US-02: Implement wb-validate.js deterministic validator (depends on Phase 1)

| Task ID | Task | Domain |
|---------|------|--------|
| US-02-T01 | Implement wb-validate.js entry point — JSON parse and schema version check | BE |
| US-02-T02 | Implement unique ID and required field validation | BE |
| US-02-T03 | Implement task ID format, domain, agentType validation | BE |
| US-02-T04 | Implement task dependency resolution — refs, self-dep, phase consistency | BE |
| US-02-T05 | Implement task cycle detection (DFS gray/black coloring) | BE |
| US-02-T06 | Implement phase-level dependency projection and cycle detection | BE |
| US-02-T07 | Implement phase schedulability check (buildWaves) | BE |
| US-02-T08 | Implement duration policy checks | BE |
| US-02-T09 | Implement verification command, commit subject, outputCount rationale validation | BE |
| US-02-T10 | Implement AC parser (Section 3.2 contract) | BE |
| US-02-T11 | Implement AC existence and scope validation | BE |
| US-02-T12 | Implement AC priority derivation and Must coverage check | BE |
| US-02-T13 | Implement text field character validation and empty phase detection | BE |
| US-02-T14 | Implement validator report output and exit codes | BE |
| US-02-T15 | Tests: schema version, unique IDs, required fields, task ID format, domain/agentType | TEST |
| US-02-T16 | Tests: task dependencies — refs, self-dep, phase consistency, cross-phase | TEST |
| US-02-T17 | Tests: task cycle detection | TEST |
| US-02-T18 | Tests: phase graph — projection, cycles, schedulability | TEST |
| US-02-T19 | Tests: duration policy, verification commands, commit subject, outputCount | TEST |
| US-02-T20 | Tests: AC parsing, scope, priority derivation, Must coverage | TEST |
| US-02-T21 | Tests: text field characters, empty phase, report structure, exit codes | TEST |

#### Phase 4 — US-03: Create semantic validator agent (depends on Phase 1, Phase 3)

| Task ID | Task | Domain |
|---------|------|--------|
| US-03-T01 | Create `validate-work-breakdown-semantic.md` agent definition | INFRA |
| US-03-T02 | Implement semantic analysis logic in agent | BE |
| US-03-T03 | Implement structured semantic output | BE |
| US-03-T04 | Manual semantic validation on test features | TEST |

#### Phase 5 — US-04: Implement wb-render.js renderer (depends on Phase 1, Phase 3)

| Task ID | Task | Domain |
|---------|------|--------|
| US-04-T01 | Implement wb-render.js entry point | BE |
| US-04-T02 | Implement phase-level depends_on aggregation | BE |
| US-04-T03 | Implement defensive character stripping and commit message construction | BE |
| US-04-T04 | Implement Markdown output generation | BE |
| US-04-T05 | Implement CSV output generation | BE |
| US-04-T06 | Tests: Markdown structure, CSV structure, dependency aggregation | TEST |
| US-04-T07 | Tests: character stripping, commit construction, output file paths | TEST |
| US-04-T08 | CSV regression test against pm-phase3 parser | TEST |

#### Phase 6 — US-05: Update pm-phase2 orchestration and Gate 2 (depends on Phase 1, Phase 2, Phase 3, Phase 4, Phase 5)

| Task ID | Task | Domain |
|---------|------|--------|
| US-05-T01 | Update pm-phase2.js — invoke wb-validate sequentially | BE |
| US-05-T02 | Add semantic validator invocation (conditional) | BE |
| US-05-T03 | Add wb-render invocation (conditional) | BE |
| US-05-T04 | Implement four-band duration statistics computation | BE |
| US-05-T05 | Implement Gate 2 blocking logic | BE |
| US-05-T06 | Assemble complete gate2_payload structure | BE |
| US-05-T07 | Update implement-feature SKILL.md Gate 2 presentation | INFRA |
| US-05-T08 | Tests: orchestration flow | TEST |
| US-05-T09 | Tests: Gate 2 blocking logic | TEST |

#### Phase 7 — US-06: FTR-013 ledger tracking (depends on Phase 5, Phase 6)

| Task ID | Task | Domain |
|---------|------|--------|
| US-06-T01 | Implement FTR-013 ledger tracking for wb-validate | BE |
| US-06-T02 | Implement FTR-013 ledger tracking for semantic validator | BE |
| US-06-T03 | Implement FTR-013 ledger tracking for wb-render | BE |
| US-06-T04 | Tests: ledger entries, status transitions, token attribution, exit_code routing | TEST |

#### Phase 8 — US-07: Installer distribution (depends on Phase 3, Phase 5)

| Task ID | Task | Domain |
|---------|------|--------|
| US-07-T01 | Update `install-toolkit.md` | INFRA |
| US-07-T02 | Update `bin/cli.js` | BE |
| US-07-T03 | Tests: local copy | TEST |
| US-07-T04 | Tests: global install | TEST |
| US-07-T05 | Tests: install-toolkit agent | TEST |

### Critical Path

```
Phase 1: INFRA (53min)
  ↓
Phase 3: US-02 (201min) — longest phase; critical path bottleneck
  ├─→ Phase 4: US-03 (47min) ─────────┐
  └─→ Phase 5: US-04 (84min) ──────────┤
                                        ↓
Phase 6: US-05 (80min) — requires Phase 1+2+3+4+5
  ↓
Phase 7: US-06 (34min)

Critical path: INFRA(53) → US-02(201) → US-04(84) → US-05(80) → US-06(34) = 452min (~7h 32min)

Phase 2 (US-01, 25min): parallel with US-02 after INFRA; not on critical path
Phase 8 (US-07, 40min): depends on US-02+US-04; can start at 53+201+84=338min;
                         finishes at 378min — before US-06 completes (452min); not on critical path
```

---

## 5. Domain Summary

| Domain | Tasks | S | M | Human Total | Agent Total |
|--------|-------|---|---|------------|------------|
| BE | 32 | 19 | 13 | ~31h | ~275min |
| INFRA | 12 | 8 | 4 | ~3h | ~89min |
| TEST | 18 | 1 | 17 | ~18h | ~200min |
| **Total** | **62** | **28** | **34** | **~61h** | **~564min** |

---

## 6. Traceability Matrix

| UC / NFR | US | Tasks | ACs Covered |
|----------|----|-------|-------------|
| UC-01 | US-01 | US-01-T01..T03 | AC-01, AC-02, AC-03, AC-04, AC-13 |
| UC-02 | US-02 | US-02-T01..T21 | AC-05, AC-06, AC-07, AC-08, AC-09, AC-13, AC-16, AC-17, AC-18 |
| UC-03 | US-03 | US-03-T01..T04 | AC-10, AC-11, AC-19, AC-20 |
| UC-04 | US-04 | US-04-T01..T08 | AC-14, AC-15, AC-16 |
| UC-05 | US-05 | US-05-T01..T09 | AC-07, AC-12, AC-17, AC-18, AC-20 |
| UC-06 | US-06 | US-06-T01..T04 | AC-18, AC-19, AC-20, AC-21 |
| NFR-00 | US-07 | US-07-T01..T05 | AC-22 |

**AC Coverage (AC-01 … AC-22):**

| AC | Covered by |
|----|-----------|
| AC-01 | US-01-T01, US-01-T02, US-01-T03 |
| AC-02 | US-01-T01, US-01-T03 |
| AC-03 | US-01-T01, US-01-T03 |
| AC-04 | US-01-T01, US-01-T03 |
| AC-05 | US-02-T01, US-02-T08, US-02-T15, US-02-T19 |
| AC-06 | US-02-T08, US-02-T19 |
| AC-07 | US-02-T08, US-02-T19, US-05-T04 |
| AC-08 | US-02-T09, US-02-T19 |
| AC-09 | US-02-T02, US-02-T10, US-02-T11, US-02-T12, US-02-T15, US-02-T20 |
| AC-10 | US-03-T01, US-03-T02, US-03-T03, US-03-T04 |
| AC-11 | US-03-T02, US-03-T04 |
| AC-12 | US-05-T05, US-05-T06, US-05-T07, US-05-T09 |
| AC-13 | US-01-T01, US-01-T03, US-02-T03, US-02-T04, US-02-T16 |
| AC-14 | US-04-T01, US-04-T04, US-04-T05, US-04-T06 |
| AC-15 | US-04-T02, US-04-T05, US-04-T06, US-04-T08 |
| AC-16 | US-02-T13, US-02-T21, US-04-T03, US-04-T07 |
| AC-17 | US-02-T14, US-02-T21, US-05-T01, US-05-T08 |
| AC-18 | US-02-T14, US-05-T01, US-05-T08, US-06-T01, US-06-T04 |
| AC-19 | US-03-T02, US-05-T02, US-05-T08, US-06-T02, US-06-T04 |
| AC-20 | US-03-T02, US-05-T02, US-05-T03, US-05-T08, US-06-T02, US-06-T03, US-06-T04 |
| AC-21 | US-06-T01, US-06-T02, US-06-T03, US-06-T04 |
| AC-22 | US-07-T01, US-07-T02, US-07-T03, US-07-T04, US-07-T05 |

All 22 ACs covered by explicit tasks. No implied or unlisted coverage.

---

## 7. Open Points & Risks

| # | Item | Impact | Suggested Resolution |
|---|------|--------|---------------------|
| 1 | Requirements.md AC section format stability | If `## 7. Acceptance Criteria` heading or table format changes, wb-validate.js parser fails | Standardize format in AGENTS.md; parser unit tests (US-02-T20) cover known format variations |
| 2 | buildWaves replication accuracy | Incorrect algorithm in INFRA-T06 propagates to wb-validate.js and test helpers | Extract verbatim from pm-phase3.js and verify on a known fixture; regression test in US-04-T08 catches divergence |
| 3 | CSV pipe-character safety | Pipes in text fields break pm-phase3 CSV parsing | wb-validate.js rejects at source; wb-render.js strips defensively; regression test in US-04-T08 verifies safety |
| 4 | Semantic validator performance on large features | Agent may timeout on features with 100+ tasks | Profile prompt with large fixture (100+ tasks) during US-03-T04 manual validation; reduce scope or chunk input if needed |
| 5 | Gate 2 payload human readability | Excessive detail overwhelms reviewer | SKILL.md update (US-05-T07) limits display to key stats, top findings, and blocking reasons; full report available on request |
| 6 | FTR-013 ledger entry schema consistency | New ledger entries must match FTR-013 contract exactly | Schema defined in US-06-T01; verified by US-06-T04 tests |
| 7 | Token attribution for skipped activities | Skipped entries must record zero tokens (not null or undefined) | Explicit `phase_delta_tokens: 0` in all skipped appendLedgerEntry calls; verified in US-06-T04 |

---

## 8. Notes

**Complexity ratings:**
- S (Small): ≤ 8 min agent estimate — straightforward validation, simple utilities, constant definitions
- M (Medium): 9–15 min agent estimate — moderate algorithmic complexity or integration work
- No L tasks: all tasks scoped to ≤ 15 min. US-02-T05 (cycle detection, 15 min) is at the target boundary — within target but recommended for above-target monitoring.

**No task exceeds 15 min agent estimate.** All tasks are within the target band.

**Tasks above 12 min (approaching boundary):**
- INFRA-T06 (12min): buildWaves extraction — acceptable; single algorithm, well-defined scope
- US-02-T10 (12min): AC parser — acceptable; single parsing contract
- US-02-T05 (15min): cycle detection — **at target limit**; scope is single DFS algorithm; cannot be reduced without artificial fragmentation
- US-02-T15 (15min): multi-check test suite — covers 7 related checks; acceptable grouping
- US-02-T20 (15min): AC-related test suite — covers 6 related checks; acceptable grouping
- US-04-T06 (15min): renderer test suite covering 3 test categories

---

## Validation Checks

```
Task count in Markdown sections (INFRA + US-01..07):
  Phase 1 (INFRA):  8 tasks
  Phase 2 (US-01):  3 tasks
  Phase 3 (US-02): 21 tasks
  Phase 4 (US-03):  4 tasks
  Phase 5 (US-04):  8 tasks
  Phase 6 (US-05):  9 tasks
  Phase 7 (US-06):  4 tasks
  Phase 8 (US-07):  5 tasks
  Sum of phases:   62 tasks ✓

Sum by domain:
  BE: 32 tasks (US-01-T02; US-02-T01..T14; US-03-T02..T03; US-04-T01..T05; US-05-T01..T06; US-06-T01..T03; US-07-T02)
  INFRA: 12 tasks (INFRA-T01..T08; US-01-T01; US-03-T01; US-05-T07; US-07-T01)
  TEST: 18 tasks (US-01-T03; US-02-T15..T21; US-03-T04; US-04-T06..T08; US-05-T08..T09; US-06-T04; US-07-T03..T05)
  Sum by domain:   62 tasks ✓

CSV rows (excluding header):  62 rows ✓

All four counts equal: 62. ✓
```
