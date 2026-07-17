# Work Breakdown — Assessment Registry

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-004: Assessment Registry |
| Version | 1.0 |
| Date | 2026-07-17 |
| Status | Draft |
| Source: Requirements | FTR-004-Requirements.md |
| Source: Tech-Spec | FTR-004-Tech-Spec.md |

---

## 1. Summary

| Metric | Value |
|--------|-------|
| Total User Stories | 6 |
| Total Tasks | 19 |
| Domain distribution | INFRA: 2, BE: 10, TEST: 7 |
| Complexity | S: 4, M: 13, L: 2 |
| Estimated total (Human) | 51h |
| Estimated total (Agent) | 175min |
| Implementation phases | 3 |

---

## 2. Shared Infrastructure Tasks

| ID | Task | Domain | Required by | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|-------------|------------|-----------|-----------|-------------|
| INFRA-T01 | Define Interventions Index format contract | INFRA | US-01, US-02, US-03, US-04, US-05 | M | 2h | 10min | Document the expected "Criticality" column format and valid values (CRITICAL, HIGH, MEDIUM, LOW) from `intervention-documentation-standard` output as a formal data contract in assessment-manager.md Phase 6. Establish error handling if contract is violated. |
| INFRA-T02 | Define Approvals file format contract | INFRA | US-01, US-02, US-03, US-04, US-05 | M | 2h | 10min | Document the expected "Interventions Flagged for Feature Delivery" section and "Flagged" column structure from FTR-003 output as a formal data contract in assessment-manager.md Phase 6. Establish error handling if contract is violated. |

---

## 3. User Stories

### US-01: Create Registry File on First Assessment

| Field | Value |
|-------|-------|
| Derived from | UC-01 |
| Actor | assessment-manager (orchestrator agent) |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-02 |

**Description:**
As the assessment-manager orchestrator, I want to create `docs/assessments/registry.md` with a header and first data row when no registry exists, so that teams have a persistent chronological record of their first assessment run.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-01-T01 | Parse Interventions Index to extract severity counts | BE | INFRA-T01 | M | 3h | 15min | Implement extraction algorithm (Steps 1–7 from Tech-Spec 3.2) to parse `{PREFIX}-Interventions-Index.md` and count rows by Criticality column (CRITICAL, HIGH, MEDIUM, LOW). Handle missing file gracefully (return all counts as 0 with warning log). Validate that table structure matches contract and log errors if parsing fails. |
| US-01-T02 | Parse Approvals file to extract flagged count | BE | INFRA-T02 | M | 3h | 15min | Implement extraction algorithm (Steps 1–3 from Tech-Spec 3.2) to parse `{PREFIX}-Approvals.md` "Interventions Flagged for Feature Delivery" table and count rows where Flagged = "Yes". Handle missing file with critical error (halt registry write with error message). Validate table structure against contract. |
| US-01-T03 | Build registry row data structure | BE | US-01-T01, US-01-T02 | S | 1h | 5min | Construct the new registry row as a Markdown table line: `| {date} | [{PREFIX}]({PREFIX}/) | {total} | {critical} | {high} | {medium} | {low} | {flagged} |`. Ensure date is formatted as YYYY-MM-DD. Verify row structure matches table schema. |
| US-01-T04 | Create registry file with header and first row | BE | US-01-T03 | M | 2h | 10min | Implement logic to write `docs/assessments/registry.md` (from Tech-Spec 3.3, first-run path). Write Markdown header: `# Assessment Registry` followed by table header row. Append new data row. Add atomic write guarantee (all-or-nothing). Add write verification (read file back to confirm). |
| US-01-T05 | Log registry creation to process log | BE | US-01-T04 | S | 1h | 5min | Append entries to `{PREFIX}-process-log.txt` documenting registry creation: timestamp, extracted counts, row content, file location. Use format defined in Tech-Spec 3.5 "Process Log Entry" section. |
| US-01-T06 | Update Phase 6 summary display for first run | BE | US-01-T04 | M | 2h | 10min | Enhance assessment-manager Phase 6 summary output to include registry confirmation line: `Registry: docs/assessments/registry.md [created]`. Display absolute or relative path clearly. Add optional brief summary of appended row. |
| US-01-T07 | Unit test: extract severity counts from Interventions Index | TEST | US-01-T01 | M | 2h | 15min | Write unit tests for extraction logic: test with 0 findings, 1 finding, mixed severities, malformed table, missing file. Verify correct counts and error handling. Test edge case: file exists but Criticality column missing. |
| US-01-T08 | Unit test: extract flagged count from Approvals file | TEST | US-01-T02 | M | 2h | 15min | Write unit tests for flagged count extraction: test with 0 flagged, all flagged, some flagged, empty table, missing file. Verify correct count. Test edge case: Flagged column values are case-sensitive ("Yes" vs "yes"). |
| US-01-T09 | Unit test: registry row construction | TEST | US-01-T03 | S | 1h | 10min | Write unit tests for row building: verify date formatting (YYYY-MM-DD), prefix link format (`[{PREFIX}]({PREFIX}/)`), column order, pipe delimiters, all severity counts and totals included. |
| US-01-T10 | Unit test: file creation with header and row | TEST | US-01-T04 | M | 2h | 15min | Write unit tests for file creation logic: verify file is created with correct path, header row is present, data row is appended correctly, file content is valid Markdown, write is atomic (no partial writes on failure). Test with various file system scenarios. |

---

### US-02: Append Registry Row on Subsequent Assessment

| Field | Value |
|-------|-------|
| Derived from | UC-02 |
| Actor | assessment-manager (orchestrator agent) |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-03 |

**Description:**
As the assessment-manager orchestrator, I want to append a new row to an existing `docs/assessments/registry.md` when a second assessment completes, so that teams can accumulate assessment history without losing previous records.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-02-T01 | Detect existing registry file | BE | INFRA-T01, INFRA-T02 | S | 1h | 5min | Implement file existence check for `docs/assessments/registry.md`. Return boolean (exists vs does not exist). Handle file system errors gracefully (log and return false). |
| US-02-T02 | Read existing registry file content | BE | US-02-T01 | S | 1h | 5min | Implement logic to read existing registry file as plain text. Preserve all existing content exactly (no modifications to existing rows). Handle UTF-8 encoding. Handle read errors gracefully. |
| US-02-T03 | Append row to existing registry file | BE | US-02-T02, US-01-T03 | M | 2h | 10min | Implement append logic: take existing content, strip trailing whitespace, append new row, ensure trailing newline. Maintain atomic write (all-or-nothing). Verify write by reading file back. Do not validate or repair existing rows. |
| US-02-T04 | Log registry append to process log | BE | US-02-T03 | S | 1h | 5min | Append entries to `{PREFIX}-process-log.txt` documenting registry append: timestamp, appended row content, file location, new row count. Use format defined in Tech-Spec 3.5. |
| US-02-T05 | Update Phase 6 summary display for append | BE | US-02-T03 | M | 2h | 10min | Enhance assessment-manager Phase 6 summary output to include registry update confirmation line: `Registry: docs/assessments/registry.md [updated]`. Display file path. Optionally show "row N appended" summary. |
| US-02-T06 | Unit test: append row to existing registry | TEST | US-02-T03 | M | 2h | 15min | Write unit tests for append logic: verify new row is added at bottom of file, all existing rows are unchanged, header row is unchanged, no partial writes on failure. Test with registry containing 1 row, 2 rows, many rows (100+). Verify atomicity. |

---

### US-03: Skip Registry Update on Incomplete Assessment

| Field | Value |
|-------|-------|
| Derived from | UC-03 |
| Actor | assessment-manager (orchestrator agent) |
| Priority | Must |
| Acceptance Criteria | AC-04 |

**Description:**
As the assessment-manager orchestrator, I want to skip registry creation or append if the assessment pipeline is aborted before the Findings Gate completes, so that incomplete runs do not pollute the registry with partial data.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-03-T01 | Implement prerequisite check: Approvals file exists | BE | INFRA-T02 | M | 2h | 10min | Before attempting any registry write (Phase 6), verify that `{PREFIX}-Approvals.md` has been successfully written. Check file existence and basic structure (header section present). If missing, log critical error: "Cannot write registry: {PREFIX}-Approvals.md not found" and halt registry write without creating or modifying registry file. |
| US-03-T02 | Unit test: skip registry write when Approvals missing | TEST | US-03-T01 | M | 2h | 15min | Write unit tests verifying registry write is skipped when `{PREFIX}-Approvals.md` does not exist. Verify error is logged and registry file is not created or modified. Test with pipeline halted at various phases (before Findings Gate, after gate but before Approvals write). |

---

### US-04: Handle Zero-Finding Assessment

| Field | Value |
|-------|-------|
| Derived from | UC-04 |
| Actor | assessment-manager (orchestrator agent) |
| Priority | Must |
| Acceptance Criteria | AC-05 |

**Description:**
As the assessment-manager orchestrator, I want to append a registry row even when an assessment produces zero findings, so that teams have a complete record of all assessment runs, including clean runs.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-04-T01 | Unit test: registry row with zero findings | TEST | US-01-T10, US-02-T06 | M | 2h | 15min | Write unit tests verifying registry row is created or appended correctly when Interventions Index contains zero findings. Verify: Total = 0, all severity counts = 0, Flagged = 0. Verify row is indistinguishable from any other valid row in structure. Test with empty Interventions Index table. |

---

### US-05: Handle Duplicate Prefix Run

| Field | Value |
|-------|-------|
| Derived from | UC-05 |
| Actor | assessment-manager (orchestrator agent) |
| Priority | Must |
| Acceptance Criteria | AC-06 |

**Description:**
As the assessment-manager orchestrator, I want to append a new registry row when the same prefix is run twice (with `--force` or similar), so that the registry preserves the complete history of all runs without deduplication.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-05-T01 | Unit test: duplicate prefix produces two rows | TEST | US-02-T06 | M | 2h | 15min | Write integration tests verifying that running the same prefix twice (with `--force`) produces two rows in the registry with the same prefix but potentially different dates and severity counts. Verify: both rows present, no deduplication, both rows reflect respective run's findings. |

---

### US-06: Review Assessment History in Registry

| Field | Value |
|-------|-------|
| Derived from | UC-06 |
| Actor | Tech Lead / Project Manager (human user) |
| Priority | Must |
| Acceptance Criteria | AC-08, AC-09, AC-10 |

**Description:**
As a Tech Lead or Project Manager, I want to view the assessment history in a readable registry file with clickable links, so that I can review assessment evolution and trends without manually inspecting individual run folders.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-06-T01 | Verify Markdown table readability | TEST | US-01-T04 | S | 1h | 10min | Manual testing: open registry file in a Markdown viewer (GitHub, IDE, VSCode, etc.). Verify table renders correctly with proper column alignment. Verify dates are readable (YYYY-MM-DD). Verify severity counts and totals are correctly displayed. Verify no special characters or encoding issues. |
| US-06-T02 | Verify prefix links are clickable | TEST | US-01-T04, US-02-T03 | S | 1h | 10min | Manual testing: open registry in a Markdown-aware tool (GitHub web UI, IDE with Markdown preview). Click on a prefix link (e.g., `[ASSESS-001](ASSESS-001/)`). Verify link resolves to the corresponding assessment run folder (`docs/assessments/{PREFIX}/`). Verify link is relative and works across systems. |
| US-06-T03 | Verify chronological ordering | TEST | US-02-T06 | M | 2h | 15min | Write unit and manual tests verifying registry rows are in chronological order: oldest run first (top of table), newest run last (bottom of table). Test appending rows in non-chronological order (e.g., prefix ASSESS-003 before ASSESS-002); verify new rows still appear at bottom in append order, not sorted. |

---

## 4. Dependency Graph

### Implementation Phases

Phases are organized as **vertical slices**: each phase delivers a complete, committable set of functionality. Within a phase, tasks execute in dependency order; independent tasks within the same layer may run in parallel.

#### Phase 1 — Shared Infrastructure (no dependencies)

| Task ID | Task | Domain |
|---------|------|--------|
| INFRA-T01 | Define Interventions Index format contract | INFRA |
| INFRA-T02 | Define Approvals file format contract | INFRA |

**Deliverable:** Updated assessment-manager.md Phase 6 section with documented format contracts and error handling requirements.

---

#### Phase 2 — US-01 + US-02: Core Registry Write Functionality

Depends on: Phase 1

This phase implements the core logic: extract data from artifacts, build row, create or append file.

| Task ID | Task | Domain |
|---------|------|--------|
| US-01-T01 | Parse Interventions Index to extract severity counts | BE |
| US-01-T02 | Parse Approvals file to extract flagged count | BE |
| US-01-T03 | Build registry row data structure | BE |
| US-01-T04 | Create registry file with header and first row | BE |
| US-01-T05 | Log registry creation to process log | BE |
| US-01-T06 | Update Phase 6 summary display for first run | BE |
| US-02-T01 | Detect existing registry file | BE |
| US-02-T02 | Read existing registry file content | BE |
| US-02-T03 | Append row to existing registry file | BE |
| US-02-T04 | Log registry append to process log | BE |
| US-02-T05 | Update Phase 6 summary display for append | BE |

**Deliverable:** Fully functional assessment-manager Phase 6 registry write logic, integrated into the pipeline. First and subsequent assessment runs create or append registry successfully.

---

#### Phase 3 — US-03 + US-04 + US-05 + US-06: Edge Cases and Testing

Depends on: Phase 2

This phase implements edge case handling and comprehensive test coverage.

| Task ID | Task | Domain |
|---------|------|--------|
| US-03-T01 | Implement prerequisite check: Approvals file exists | BE |
| US-04-T01 | Unit test: registry row with zero findings | TEST |
| US-05-T01 | Unit test: duplicate prefix produces two rows | TEST |
| US-06-T01 | Verify Markdown table readability | TEST |
| US-06-T02 | Verify prefix links are clickable | TEST |
| US-06-T03 | Verify chronological ordering | TEST |
| US-01-T07 | Unit test: extract severity counts from Interventions Index | TEST |
| US-01-T08 | Unit test: extract flagged count from Approvals file | TEST |
| US-01-T09 | Unit test: registry row construction | TEST |
| US-01-T10 | Unit test: file creation with header and row | TEST |
| US-02-T06 | Unit test: append row to existing registry | TEST |
| US-03-T02 | Unit test: skip registry write when Approvals missing | TEST |

**Deliverable:** Complete test suite covering all scenarios from feature.md (first run, subsequent run, zero findings, duplicate prefix, incomplete abort, missing Approvals). All acceptance criteria verified. Ready for production release.

---

### Critical Path

The longest dependency chain determining minimum implementation time:

```
INFRA-T01, INFRA-T02 (both 2h in parallel)
  → US-01-T01 (3h)
  → US-01-T03 (1h)
  → US-01-T04 (2h)
  → US-01-T06 (2h)
  → US-02-T03 (2h)
  → US-02-T05 (2h)
  → Testing (7 tasks: 2–2h each in parallel to 15h total)
  ─────────────────────────────────
Total: 4h (infra) + 3h + 1h + 2h + 2h + 2h + 2h + 15h = **31h (human)**
       10min + 10min + 15min + 5min + 10min + 10min + 10min + (105min test) = **175min (agent)**
```

The critical path is the sequential chain through Phase 1 → Phase 2 (extraction → build → create/append → summary) → Phase 3 (testing). Parallel execution within phases and across independent test tasks can reduce wall-clock time.

---

## 5. Domain Summary

| Domain | Tasks | S | M | L | Human Total | Agent Total |
|--------|-------|---|---|---|------------|------------|
| INFRA | 2 | 0 | 2 | 0 | 4h | 20min |
| BE | 11 | 4 | 7 | 0 | 26h | 90min |
| TEST | 6 | 0 | 6 | 0 | 21h | 105min |
| **Total** | **19** | **4** | **13** | **0** | **51h** | **175min** |

---

## 6. Traceability Matrix

| UC | US | Tasks | ACs Covered |
|----|----|----|-------------|
| UC-01 | US-01 | US-01-T01, US-01-T02, US-01-T03, US-01-T04, US-01-T05, US-01-T06, US-01-T07, US-01-T08, US-01-T09, US-01-T10 | AC-01, AC-02 |
| UC-02 | US-02 | US-02-T01, US-02-T02, US-02-T03, US-02-T04, US-02-T05, US-02-T06 | AC-01, AC-03 |
| UC-03 | US-03 | US-03-T01, US-03-T02 | AC-04 |
| UC-04 | US-04 | US-04-T01 | AC-05 |
| UC-05 | US-05 | US-05-T01 | AC-06 |
| UC-06 | US-06 | US-06-T01, US-06-T02, US-06-T03 | AC-08, AC-09, AC-10 |
| (Cross-cutting) | (Shared) | INFRA-T01, INFRA-T02 | AC-07 (Phase 6 summary confirmation) |

**Note:** AC-07 (Phase 6 summary confirmation line) is addressed by INFRA-T02 (format contract) and all BE Phase 6 display tasks (US-01-T06, US-02-T05).

---

## 7. Open Points & Risks

| # | Item | Impact on Work Breakdown | Suggested Resolution |
|---|------|--------------------------|---------------------|
| 1 | **FTR-003 Implementation Status** — The registry write depends on FTR-003 (Findings Gate, Approvals file format). FTR-003 must be completed or in flight concurrently for FTR-004 work to proceed. | If FTR-003 is not implemented, INFRA-T01 and INFRA-T02 cannot establish a firm contract; extraction logic may need re-work if Approvals file structure changes post-facto. | Confirm FTR-003 completion status with Project Manager. If FTR-003 is deferred, move FTR-004 Phase 1 (INFRA tasks) to later when FTR-003 format is locked. Consider implementing FTR-003 and FTR-004 in the same pass to avoid rework. |
| 2 | **Interventions Index Format Fragility** — The severity count extraction depends on the `intervention-documentation-standard` agent producing a consistent "Criticality" column. If that agent's output format changes, registry extraction logic breaks silently or requires re-implementation. | High maintenance cost if intervention-documentation-standard evolves without coordination. Task US-01-T01 must be robust to parse variations, and INFRA-T01 must establish a clear contract. | INFRA-T01 must document the expected field name, valid values, and table structure as a formal data contract. Add explicit validation in US-01-T01: if Criticality column is not found or values are unexpected, log a clear error and halt with a message pointing to the breaking change. Consider adding a version field or contract version to Interventions Index to detect format changes early. |
| 3 | **Test Environment Setup** — Integration tests (US-02-T06, US-04-T01, US-05-T01) require a working assessment-manager instance with real or mock assessment artifacts (Interventions Index, Approvals file). | Testing cannot proceed without a test harness for assessment-manager. | Create a test fixture generator that produces valid Interventions Index and Approvals files with controlled inputs (0 findings, all findings, mixed severities, etc.). Use these fixtures to test extraction and write logic in isolation before full end-to-end testing. |
| 4 | **File System Permissions and I/O Error Handling** — Registry write is expected to complete in < 100ms (NFR-01). Large registries (1000+ rows) on slow file systems may exceed this target. Also, write failures (permission denied, disk full) must be handled gracefully without breaking the pipeline. | If write fails silently or causes pipeline to halt, teams lose assessment data and the pipeline becomes unusable. | Implement comprehensive I/O error handling: log all errors with timestamp and full path, verify writes atomically (read back to confirm), add retry logic with exponential backoff for transient failures. Add performance monitoring: log write time and alert if it exceeds 100ms. Verify on target file systems (Windows, Linux, cloud storage) during manual testing (US-06-T01). |
| 5 | **Chronological Ordering and User Confusion** — Registry appends new rows at the bottom. If assessments are run out of order (e.g., re-run with `--force`), the registry order reflects append time, not chronological date order. Users may be confused if dates are not ascending. | Users may misinterpret the registry as "not in order" or suspect data corruption. | Document this behavior clearly in the Phase 6 summary and in the registry file itself (add a header note: "Rows are appended in completion order; dates may not be monotonically increasing"). Consider a deferred feature: `/assessment-history` command that sorts the registry by date and shows trends. For now, the current append-only design is acceptable per AC-06. |
| 6 | **Backward Compatibility with Pre-FTR-004 Projects** — Projects with existing assessment runs (pre-dating this feature) will not have a registry until their next assessment run. Teams may want to backfill the registry from existing folders. | Historical registry data is incomplete if not backfilled. Teams cannot see the full assessment evolution. | Out of scope for MVP (per feature.md "Retroactive population"). Add to deferred features list: a utility script or agent that scans existing `ASSESS-*` folders and populates registry.md retroactively. Document the process for teams that want to do this manually. |
| 7 | **Automated Testing of Markdown Readability** — Tasks US-06-T01 and US-06-T02 are manual verification tasks (opening files in Markdown viewers, clicking links). | Manual testing is not scalable; hard to automate in CI/CD pipelines. | For automated CI testing: generate a registry file and parse it with a Markdown parser (e.g., markdown-it, pandoc) to verify table structure. For link testing: use a regex or link validator to verify prefix links match the pattern `[{PREFIX}]({PREFIX}/)`. Manual testing in various tools (GitHub, VSCode, IDE) remains necessary for visual regression. |

---

## Appendix: Task Dependencies Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Shared Infrastructure (2 tasks, 4h / 20min)        │
├─────────────────────────────────────────────────────────────┤
│ INFRA-T01: Define Interventions Index format contract       │
│ INFRA-T02: Define Approvals file format contract            │
│ (Both in parallel, no dependencies)                          │
└──────────────┬────────────────────────────────┬─────────────┘
               │                                │
        ┌──────▼────────────────────────────────▼──────┐
        │ Phase 2: Core Registry Write (11 BE tasks)   │
        ├───────────────────────────────────────────────┤
        │                                               │
        │ US-01-T01 ─┐                                  │
        │ (Parse    ├──→ US-01-T03 ──→ US-01-T04      │
        │  Intv)    │        (Build)   (Create)       │
        │           │                   │              │
        │ US-01-T02 ┤                   ├─→ US-01-T05  │
        │ (Parse    ├──→ ┘              │  (Log)       │
        │  Approvals)                   │              │
        │                               ├─→ US-01-T06  │
        │ US-02-T01 ──→ US-02-T02 ──→ US-02-T03       │
        │ (Detect)     (Read)      (Append) ├─→ ...    │
        │                                   │           │
        │                              ┌────▼─→ US-02-T04
        │                              │      (Log)
        │                              └────→ US-02-T05
        │                                   (Summary)
        └──────┬──────────────────────────────┬────────┘
               │                              │
        ┌──────▼──────────────────────────────▼──────┐
        │ Phase 3: Edge Cases & Testing (9 tasks)   │
        ├─────────────────────────────────────────────┤
        │                                             │
        │ US-03-T01 (Check Approvals exists)          │
        │ US-03-T02 (Test skip on missing)            │
        │ US-04-T01 (Test zero findings)              │
        │ US-05-T01 (Test duplicate prefix)           │
        │ US-06-T01, T02, T03 (Manual verification)   │
        │ US-01-T07 through US-01-T10 (Unit tests)    │
        │ US-02-T06 (Unit test append)                │
        │ (All in parallel, some depend on Phase 2)   │
        │                                             │
        └─────────────────────────────────────────────┘
```

