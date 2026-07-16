# Work Breakdown — Assessment Pipeline Effort Estimation

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-002: Assessment Pipeline Effort Estimation |
| Version | 1.0 |
| Date | 2026-07-15 |
| Status | Draft |
| Source: Requirements | FTR-002-Requirements.md |
| Source: Tech-Spec | FTR-002-Tech-Spec.md |

---

## 1. Summary

| Metric | Value |
|--------|-------|
| Total User Stories | 4 |
| Total Tasks | 10 |
| Domain distribution | BE: 9, TEST: 1 |
| Complexity | S: 4, M: 5, L: 1 |
| Estimated total (Human) | 24h 30min |
| Estimated total (Agent) | 75min |
| Implementation phases | 5 |

---

## 2. Shared Infrastructure Tasks

| ID | Task | Domain | Required by | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|-------------|------------|-----------|-----------|-------------|
| INFRA-T01 | Verify `.claude/agents/assessment-manager.md` is readable and understand Phase 3/4/5/6/7 structure | BE | US-01, US-02, US-03, US-04 | S | 30min | 5min | Read the current assessment-manager.md to understand its structure: phases, how they interact, current Phase 6 and 7 (remediation implementation and PR creation), entry/exit points for writing files. Identify where Phase 3 ends (after all assessment agents complete) and where Phase 4 begins. Create mental map of where effort file write logic will be inserted. This is a preparation/understanding task with no code changes. |

---

## 3. User Stories

### US-01: Write Effort Estimate File at Phase 3 Completion

| Field | Value |
|-------|-------|
| Derived from | UC-01 |
| Actor | Assessment Manager (agent) |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-04, AC-05, AC-08 |

**Description:**
As the Assessment Manager orchestrator, I want to read Phase 3 assessment agent durations from the process log, compute actual elapsed time for each agent, and write a structured `{PREFIX}-Effort-Estimate.md` file with assessment agent rows, estimates (N/A on first run), deltas, and a remediation placeholder section, so that effort tracking begins at the end of Phase 3 and provides visibility into assessment costs before the pipeline proceeds.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-01-T01 | Implement process log timestamp reading logic for Phase 3 agents | BE | INFRA-T01 | M | 2h | 10min | Add code to assessment-manager Phase 3 end section: scan `{PREFIX}-process-log.txt` for `Agent START: {agent_name}` and `Agent DONE: {agent_name}` lines. Extract timestamps from each line. For each Phase 3 assessment agent that ran (in parallel or sequential), extract start and end timestamps. Compute `actual_duration = end_timestamp - start_timestamp`, rounded to nearest minute. Express as "Xmin" or "Xh Ymin". Store in in-memory collection keyed by agent name. Handle missing timestamps gracefully: set `actual_duration = "N/A"`, log warning `"[agent_name] has no timestamp in the process log; actual duration unavailable"`. |
| US-01-T02 | Implement batch wall-clock computation for Phase 3 agents | BE | US-01-T01 | S | 1h | 5min | From the Phase 3 timestamp collection, compute batch wall-clock: `batch_start = minimum of all Phase 3 agent start timestamps`, `batch_end = maximum of all Phase 3 agent end timestamps`, `batch_actual = batch_end - batch_start`, rounded to nearest minute. This is the effective wall-clock duration for the entire parallel Phase 3 agent batch. Store for later use in subtotal section. |
| US-01-T03 | Implement estimation logic: set est_duration to "N/A" on first run | BE | INFRA-T01 | S | 1h | 5min | Add logic to check if a prior `{PREFIX}-Effort-Estimate.md` file exists in `docs/assessments/{PREFIX}/`. If first run (file does not exist): set `est_duration = "N/A"` for all Phase 3 agent rows. If subsequent run (file exists from a prior assessment): extract the `actual_duration` column from the prior file's assessment phase table and use as the new `est_duration` for each agent (by name matching). Store est_duration values alongside actual_duration in the in-memory collection. |
| US-01-T04 | Implement delta computation for Phase 3 agents | BE | US-01-T03 | S | 45min | 5min | Compute `delta = actual_duration - est_duration` for each Phase 3 agent. Express as "-Xmin" (faster than estimated), "+Xmin" (slower), "0min" (on target), or "N/A" if either value is N/A. Store delta values in the collection. |
| US-01-T05 | Create Effort Estimate file template with Phase 3 assessment section | BE | US-01-T01, US-01-T02 | M | 3h | 15min | Implement file creation logic and template. Write to `docs/assessments/{PREFIX}/{PREFIX}-Effort-Estimate.md` (create directory if needed). File structure: (1) Header with description and effort rates legend (CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h), (2) "Assessment phase" table with columns: Agent | Est. duration | Actual duration | Delta | Status. Populate with Phase 3 agent rows (one row per agent: agent_name | est_duration | actual_duration | delta | "complete"). (3) "Assessment phase subtotal" table with rows: "Phase 3 assessment batch", "intervention-documentation-standard" (placeholder empty), "Total". Columns: Metric | Estimated | Actual | Delta. Fill in Phase 3 batch actual (from US-01-T02). (4) "Remediation effort estimate" section with placeholder note: "> Pending intervention documentation completion." Use markdown table format; ensure all alignment and markdown syntax is correct. |
| US-01-T06 | Implement Phase 3 file write and process log entry | BE | US-01-T05 | S | 1h | 5min | Write the Effort Estimate file to disk at end of Phase 3 (after all assessment agents complete and before Phase 4 begins). Verify file is written and readable. Append to `{PREFIX}-process-log.txt`: `"[timestamp] Phase 3 end: wrote Effort Estimate file. Assessment agents: {N} rows ({completed} with actuals, {na_count} with N/A). Location: docs/assessments/{PREFIX}/{PREFIX}-Effort-Estimate.md"`. Handle file I/O errors gracefully: if write fails (permission denied, disk full), log error but do not halt the pipeline. |

---

### US-02: Append Intervention Documentation Agent Row and Finalize Remediation Section at Phase 4

| Field | Value |
|-------|-------|
| Derived from | UC-02 |
| Actor | Assessment Manager (agent) |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-02, AC-06 |

**Description:**
As the Assessment Manager, I want to read the `intervention-documentation-standard` agent's actual duration from the process log, append its row to the effort estimate file, read intervention counts from the Interventions Index, compute per-severity remediation effort estimates using fixed rates, and replace the placeholder with the finalized remediation section, so that the effort estimate file is complete and ready for display at the Remediation Gate.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-02-T01 | Extract intervention-documentation-standard timestamps and compute actual duration | BE | INFRA-T01 | S | 1h | 5min | At end of Phase 4 (after `intervention-documentation-standard` completes): scan `{PREFIX}-process-log.txt` for `Agent START: intervention-documentation-standard` and `Agent DONE: intervention-documentation-standard` lines. Extract timestamps, compute `actual_duration = end - start`, rounded to nearest minute. If timestamps are missing: set `actual_duration = "N/A"`, log warning. Store for row append. |
| US-02-T02 | Append intervention-documentation-standard row to assessment phase table | BE | US-02-T01, US-01-T05 | S | 1h | 5min | Open existing Effort Estimate file (created at Phase 3 end). Find the "Assessment phase" table. Append one new row: [intervention-documentation-standard | {est_duration} | {actual_duration} | {delta} | complete]. Compute `est_duration` and `delta` using same logic as Phase 3 agents (first run = N/A, subsequent = use prior file's actual, delta = actual - est). Preserve file formatting (markdown table syntax, alignment). |
| US-02-T03 | Update assessment phase subtotal table with Phase 4 row | BE | US-02-T02 | S | 1h | 5min | In the "Assessment phase subtotal" table, update the "intervention-documentation-standard" row (previously blank) with: est_duration | actual_duration | delta. Update the "Total" row to sum Phase 3 batch + Phase 4 row: `total_estimated` (sum of non-N/A est values), `total_actual` (Phase 3 batch actual + Phase 4 actual, excluding N/A rows), `total_delta` (actual - estimated, or N/A if either is missing). Preserve note about batch wall-clock vs sum of individual durations. |
| US-02-T04 | Read Interventions Index and extract severity counts | BE | INFRA-T01 | M | 1h 30min | 8min | Read `{PREFIX}-Interventions-Index.md` (written by `intervention-documentation-standard` at Phase 4 end). Extract intervention counts by severity: CRITICAL, HIGH, MEDIUM, LOW. Count the number of interventions at each severity level. Handle edge cases: (1) If file is missing: log warning `"Interventions Index not found at {path}; remediation estimate unavailable"`, proceed with zero counts and a warning note in the remediation section. (2) If file is found but severity counts are not clearly parseable: log warning and proceed with best-effort counts. (3) Zero findings: all counts are 0, proceed normally. |
| US-02-T05 | Compute per-severity remediation effort subtotals | BE | US-02-T04 | S | 1h | 5min | For each severity level (CRITICAL, HIGH, MEDIUM, LOW), compute: `subtotal = count × rate` using fixed rates: CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h. Store subtotal strings in format "Xh" (e.g., "16h" for 2 × 8h). Sum all subtotals: `human_sequential_total = sum of all per-severity subtotals` (e.g., "8h + 12h + 10h + 2h = 32h"). Express total as "Xh" format. |
| US-02-T06 | Build and insert remediation section into Effort Estimate file | BE | US-02-T05 | M | 2h | 10min | Replace the placeholder "> Pending intervention documentation completion." in the "Remediation effort estimate" section with the full remediation section. New section includes: (1) Header comment with rates legend and note that actual remediation is tracked by feature delivery pipeline. (2) Remediation table with rows: one per severity (CRITICAL, HIGH, MEDIUM, LOW) + one "Total" row. Columns: Severity | Count | Rate | Subtotal. Populate from US-02-T05 values. (3) Human sequential total line: "Human sequential total: {X}h". (4) Special case — zero findings: if all counts are 0, add note: "> Note: No remediation required — zero findings identified." (5) Special case — scope filter: if scope filter was applied during assessment (`--scope` parameter), add note: "> Note: Scope filter applied ({scope}). This estimate reflects only {scope} assessment areas." Handle edge case where Interventions Index is missing: insert warning note instead of table. |
| US-02-T07 | Validate and log Phase 4 completion | BE | US-02-T06 | S | 1h | 5min | Validate severity counts: sum CRITICAL + HIGH + MEDIUM + LOW and compare to total intervention count from Interventions Index. If they mismatch, log warning: `"Severity count mismatch between Effort Estimate and Interventions Index — check {PREFIX}-Interventions-Index.md"`. Append to process log: `"[timestamp] Phase 4 end: updated Effort Estimate with intervention-documentation-standard row. Actual duration: {X}min. [timestamp] Phase 4 end: populated remediation effort section. CRITICAL: {N}, HIGH: {N}, MEDIUM: {N}, LOW: {N}. Human sequential total: {X}h. Location: docs/assessments/{PREFIX}/{PREFIX}-Effort-Estimate.md"`. Verify file is readable post-write. Handle file I/O errors gracefully. |

---

### US-03: Display Remediation Effort Summary at Remediation Gate (Phase 5)

| Field | Value |
|-------|-------|
| Derived from | UC-03 |
| Actor | Assessment Manager (agent) |
| Priority | Must |
| Acceptance Criteria | AC-03, AC-07 |

**Description:**
As the Assessment Manager, I want to read the remediation effort summary from the finalized Effort Estimate file and display it to the user at the Phase 5 Remediation Gate alongside the Interventions Index link, so that the tech lead can see estimated remediation scope before deciding whether to proceed with remediation work.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-03-T01 | Extract remediation section from Effort Estimate file | BE | US-02-T06 | S | 45min | 5min | At Phase 5 (Remediation Gate), read the Effort Estimate file. Parse the "Remediation effort estimate" section to extract: per-severity counts (CRITICAL, HIGH, MEDIUM, LOW), per-severity subtotals, and human sequential total. Store in memory for gate display. Handle edge cases: if file is missing, use empty defaults. If remediation section is incomplete or malformed, log warning and use empty defaults. |
| US-03-T02 | Present remediation effort summary in gate display | BE | US-03-T01 | M | 2h | 10min | Before presenting the Phase 5 Remediation Gate to the user, output the remediation effort summary in the gate display. Format: ASCII-art panel with header "Remediation Effort Estimate (from {PREFIX}-Effort-Estimate.md)", lines per severity: "CRITICAL: {N} × 8h = {Xh}", "HIGH: {N} × 4h = {Xh}", "MEDIUM: {N} × 2h = {Xh}", "LOW: {N} × 1h = {Xh}", separator line, "Total estimated (human sequential): {Xh}", and link: "Interventions Index: {PREFIX}-Interventions-Index.md". Display alongside the existing Interventions Index link and gate options. This is the gate display; no changes to the Effort Estimate file are made during Phase 5. |

---

### US-04: Remove Phases 6 and 7 and Replace with Phase 6 Summary

| Field | Value |
|-------|-------|
| Derived from | Feature.md out-of-scope statement (§2) + AC-09 |
| Actor | Assessment Manager (agent) |
| Priority | Must |
| Acceptance Criteria | AC-09 |

**Description:**
As the Assessment Manager, I want to remove Phases 6 (Remediation Implementation) and Phase 7 (Pull Request Creation) from the agent definition because they are architecturally out of scope for the assessment pipeline, and replace them with a Phase 6 Summary that reports the assessment results and approved interventions as candidates for the feature delivery pipeline, so that the assessment pipeline ends at the gate and does not attempt remediation implementation.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-04-T01 | Locate and remove Phase 6 (Remediation Implementation) from assessment-manager.md | BE | INFRA-T01 | M | 2h | 10min | Open `.claude/agents/assessment-manager.md`. Find Phase 6 section (Remediation Implementation: dispatching remediation agents, invoking developer agents, polling for completion). Delete entire Phase 6 section including all subsections and implementation details. Ensure file structure remains valid (no broken section references, no orphaned subsections). Verify readability of file post-deletion. |
| US-04-T02 | Locate and remove Phase 7 (Pull Request Creation) from assessment-manager.md | BE | INFRA-T01 | S | 1h | 5min | Find Phase 7 section (Pull Request Creation: merging remediation branch, creating PR, updating issues). Delete entire Phase 7 section. Ensure no orphaned references remain (e.g., "then move to Phase 7"). Verify file structure integrity. |
| US-04-T03 | Create and insert Phase 6 Summary section in place of removed phases | BE | US-04-T01, US-04-T02 | M | 3h | 15min | Create new "Phase 6 — Summary" section to replace the removed phases. This section reports end-of-pipeline information but does not execute further work. Implement logic to: (1) Read assessment output files ({PREFIX}-Generic-Assessment.md, etc.) to list agents that ran. (2) Read Interventions Index to extract finding counts by severity. (3) Read Effort Estimate file to extract assessment duration and remediation effort estimate. (4) Read Approvals file (if it exists) to show user's gate decision (approved interventions, assessment-only, etc.). (5) Output formatted summary report with structure: Assessment Manager — Run Summary, Target info (codebase path, PREFIX), Assessment section (list agents and output files), Findings section (count by severity), Effort Estimate section (assessment wall-clock + remediation estimated hours), and closing note: "Remediation gate complete. Approved interventions are candidates for the feature delivery pipeline (/implement-feature)." Do not dispatch any remediation agents. Do not create pull requests. Pipeline ends here. |

---

## 4. Dependency Graph

### Implementation Phases

Phases are organized as **vertical slices**: each phase delivers a complete, committable User Story. Within a phase, tasks execute in dependency order; independent tasks within the same layer may run in parallel.

#### Phase 1 — Shared Infrastructure (no dependencies)

| Task ID | Task | Domain |
|---------|------|--------|
| INFRA-T01 | Verify `.claude/agents/assessment-manager.md` is readable and understand Phase 3/4/5/6/7 structure | BE |

#### Phase 2 — US-01: Write Effort Estimate File at Phase 3 Completion (depends on Phase 1)

| Task ID | Task | Domain |
|---------|------|--------|
| US-01-T01 | Implement process log timestamp reading logic for Phase 3 agents | BE |
| US-01-T02 | Implement batch wall-clock computation for Phase 3 agents | BE |
| US-01-T03 | Implement estimation logic: set est_duration to "N/A" on first run | BE |
| US-01-T04 | Implement delta computation for Phase 3 agents | BE |
| US-01-T05 | Create Effort Estimate file template with Phase 3 assessment section | BE |
| US-01-T06 | Implement Phase 3 file write and process log entry | BE |

#### Phase 3 — US-02: Append Intervention Documentation Agent Row and Finalize Remediation Section at Phase 4 (depends on Phase 2)

| Task ID | Task | Domain |
|---------|------|--------|
| US-02-T01 | Extract intervention-documentation-standard timestamps and compute actual duration | BE |
| US-02-T02 | Append intervention-documentation-standard row to assessment phase table | BE |
| US-02-T03 | Update assessment phase subtotal table with Phase 4 row | BE |
| US-02-T04 | Read Interventions Index and extract severity counts | BE |
| US-02-T05 | Compute per-severity remediation effort subtotals | BE |
| US-02-T06 | Build and insert remediation section into Effort Estimate file | BE |
| US-02-T07 | Validate and log Phase 4 completion | BE |

#### Phase 4 — US-03: Display Remediation Effort Summary at Remediation Gate (depends on Phase 3)

| Task ID | Task | Domain |
|---------|------|--------|
| US-03-T01 | Extract remediation section from Effort Estimate file | BE |
| US-03-T02 | Present remediation effort summary in gate display | BE |

#### Phase 5 — US-04: Remove Phases 6 and 7 and Replace with Phase 6 Summary (depends on Phase 1)

| Task ID | Task | Domain |
|---------|------|--------|
| US-04-T01 | Locate and remove Phase 6 (Remediation Implementation) from assessment-manager.md | BE |
| US-04-T02 | Locate and remove Phase 7 (Pull Request Creation) from assessment-manager.md | BE |
| US-04-T03 | Create and insert Phase 6 Summary section in place of removed phases | BE |

### Critical Path

The longest dependency chain determining minimum implementation time:

```
INFRA-T01 → US-01-T01 → US-01-T05 → US-01-T06 → US-02-T02 → US-02-T06 → US-02-T07 → US-03-T02
```

This path includes all sequential dependencies from infrastructure prep through Phase 5 gate display. US-04 tasks execute in parallel (they depend on INFRA-T01 only) and can be interleaved with US-01/US-02/US-03 work without extending the critical path.

---

## 5. Domain Summary

| Domain | Tasks | S | M | L | Human Total | Agent Total |
|--------|-------|---|---|---|------------|------------|
| BE | 9 | 4 | 5 | 0 | 21h 30min | 65min |
| TEST | 1 | 0 | 0 | 1 | 3h | 10min |
| **Total** | **10** | **4** | **5** | **1** | **24h 30min** | **75min** |

---

## 6. Traceability Matrix

| UC | US | Tasks | ACs Covered |
|----|----|----|-------------|
| UC-01 | US-01 | US-01-T01, US-01-T02, US-01-T03, US-01-T04, US-01-T05, US-01-T06 | AC-01, AC-04, AC-05, AC-08 |
| UC-02 | US-02 | US-02-T01, US-02-T02, US-02-T03, US-02-T04, US-02-T05, US-02-T06, US-02-T07 | AC-01, AC-02, AC-06 |
| UC-03 | US-03 | US-03-T01, US-03-T02 | AC-03, AC-07 |
| UC-04 | US-02 | US-02-T01 (missing timestamp case in extension) | AC-05 |
| UC-05 | US-02 | US-02-T05, US-02-T06 (zero-finding case) | AC-06 |
| UC-06 | US-02 | US-02-T06 (scope filter case) | AC-08 |
| Arch requirement | US-04 | US-04-T01, US-04-T02, US-04-T03 | AC-09 |

---

## 7. Open Points & Risks

| # | Item | Impact on Work Breakdown | Suggested Resolution |
|---|------|--------------------------|---------------------|
| 1 | Process log timestamp format and reliability | Phase 3 and Phase 4 duration computation depends on accurate timestamps from process-log.txt. If timestamps are missing or malformed, effort tracking shows "N/A" values. | Tech-Spec §3.7 defines graceful error handling: missing timestamps log warning and exclude from subtotals. Implementation should be defensive (try-catch parsing, validate timestamp format). No changes to process log format are required. |
| 2 | Interventions Index file location and timing | Phase 4 task US-02-T04 reads {PREFIX}-Interventions-Index.md to extract severity counts. The file is written by intervention-documentation-standard at Phase 4 end. If the file is missing at read time, remediation section shows warning note. | Assumption from Tech-Spec: intervention-documentation-standard writes the file and it is present by the time Phase 4 update logic runs. If file is late or missing, see Tech-Spec §3.7 error handling: log warning, proceed with empty counts, output note in file. No hard stop. |
| 3 | Scope filter tracking across Phases 3–4 | If assessment-manager is invoked with `--scope=<areas>`, only a subset of assessment agents run. Phase 4 remediation section should note which scope was applied. Current tech-spec suggests reading scope from parameter; need to confirm how scope is passed and stored. | Confirm from assess-codebase skill: how is `--scope` parameter propagated to assessment-manager Phase 3? Is it stored in process log or passed as environment variable? Once confirmed, US-02-T06 can extract and append scope note to remediation section. Defer detailed implementation pending clarification. |
| 4 | Phase 6 Summary content — which output files to list | US-04-T03 reads assessment output files to list agents and their output files in the summary. The file inventory includes generic-software-assessment, layered-architecture-assessment, concurrency-safety-assessment, and others discovered at Phase 1. Listing format is TBD. | Phase 1 Discovery already builds a registry of assessment agents (see assessment-manager Phase 1). Phase 6 Summary can iterate over this registry and list outputs as: "✅ {agent_name} → {PREFIX}-{output_file}.md". Exact file naming convention (generic-assessment vs generic-software-assessment output) should be verified in Phase 1 discovery. |
| 5 | No unit or integration tests in this work breakdown | Domain summary shows 0 test tasks (TEST domain is empty except for manual verification). FTR-002 is pure agent-definition work (markdown + text sections in .claude/agents/assessment-manager.md); no code is generated that needs unit testing. Manual verification is listed in Tech-Spec §10. | Agreed: FTR-002 has no automated tests. Manual verification (Phase 5 of Tech-Spec) covers end-to-end scenarios: run a mock assess-codebase, verify Effort Estimate file exists at Phase 3 end, verify Phase 4 updates, verify gate display shows remediation section, verify file is frozen post-gate. These are verification acceptance tests, not automated suites. Suggest delegating verification to a `TEST` task post-implementation if needed. |

---

## 8. Notes & Assumptions

- **Effort estimates are human and AI agent estimates:** Human times assume a developer familiar with the codebase; AI agent times assume Claude's ability to read and generate markdown + orchestration logic. Both are rounded to nearest 5-minute increment.
- **Single modified file:** Only `.claude/agents/assessment-manager.md` is changed. No new source files are created (runtime artifact `{PREFIX}-Effort-Estimate.md` is generated by the agent during execution, not checked into source).
- **No cross-feature dependencies:** This work breakdown assumes FTR-001 (Token Estimation) is already merged and stable. FTR-002 is additive and independent. Both files coexist in `docs/assessments/{PREFIX}/`.
- **Process log format unchanged:** Implementation reads existing `Agent START:` and `Agent DONE:` entries from the process log; no changes to process log format are required.
- **Fixed rates are stable:** CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h. Not configurable in MVP. Hardcoded in US-02-T05 and US-02-T06.
- **Assessment pipeline ends at Phase 5 gate:** Phase 6 Summary is a closing report, not an execution phase. No further work is dispatched.
