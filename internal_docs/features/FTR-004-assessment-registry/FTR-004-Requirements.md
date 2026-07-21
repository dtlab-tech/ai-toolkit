# Functional Requirements — Assessment Registry

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-004: Assessment Registry |
| Version | 1.0 |
| Date | 2026-07-16 |
| Status | Draft |

## 1. Introduction

### 1.1 Purpose

This document specifies the functional requirements for the Assessment Registry feature. The registry provides a persistent, chronological record of all completed assessment runs within a project by maintaining a lightweight Markdown table that accumulates one row per assessment completion. The registry enables teams to track assessment history, review severity trends, and understand the scope of past interventions without manually inspecting individual assessment run folders.

### 1.2 Scope

**In Scope:**
- Creating and maintaining `docs/assessments/registry.md` as a Markdown table
- Extracting severity counts from assessment run artifacts
- Appending one row per completed assessment run after the Findings Gate is acknowledged
- Displaying confirmation of registry update in the Phase 6 summary
- Supporting the first assessment run (creating the file with header) and subsequent runs (appending rows)
- Handling edge cases: zero findings, missing registry file, manually edited registry, duplicate prefixes

**Out of Scope:**
- Diff or comparison views between two assessment runs
- Modifications to the `/assessment-status` command
- Trend charts or visualizations
- Global registry across multiple projects
- Automated alerts or thresholds based on registry data
- Validation or repair of manually edited registry rows
- Retroactive population of the registry from existing run folders

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| Tech Lead / Project Manager | Reviews registry to understand assessment history and severity trends across runs; accesses the registry after each assessment run and ad hoc when preparing reports |
| assessment-manager (orchestrator agent) | Appends one row to `docs/assessments/registry.md` at the end of every completed assessment pipeline run; reads artifacts to extract row values |
| assess-codebase skill | Entry point to the assessment pipeline; no changes to file writes |

## 2. Use Cases

### UC-01: Create Registry File on First Assessment

| Field | Value |
|-------|-------|
| Actor | assessment-manager |
| Preconditions | A completed assessment run exists; `{PREFIX}-Approvals.md` has been successfully written; `docs/assessments/registry.md` does not yet exist |
| Trigger | Phase 6 of the assessment pipeline is entered after the Findings Gate is acknowledged |
| Priority | Must |

**Main flow:**

1. assessment-manager checks whether `docs/assessments/registry.md` exists in the assessed project
2. assessment-manager determines the file does not exist
3. assessment-manager creates `docs/assessments/registry.md` with a Markdown table header: `| Date | Prefix | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged |`
4. assessment-manager reads `{PREFIX}-Interventions-Index.md` to extract severity counts (CRITICAL, HIGH, MEDIUM, LOW, Total)
5. assessment-manager reads `{PREFIX}-Approvals.md` to count interventions flagged as "Yes"
6. assessment-manager captures the system date in YYYY-MM-DD format
7. assessment-manager constructs the first data row with all extracted values
8. assessment-manager writes the file with header and first data row
9. Phase 6 summary confirms registry creation and displays the file path

**Postconditions:**

- `docs/assessments/registry.md` exists in the project with header and one data row
- The file contains the correct date, prefix link, severity counts, and flagged count
- The Phase 6 summary includes confirmation of registry creation

### UC-02: Append Registry Row on Subsequent Assessment

| Field | Value |
|-------|-------|
| Actor | assessment-manager |
| Preconditions | A completed assessment run exists; `{PREFIX}-Approvals.md` has been successfully written; `docs/assessments/registry.md` already exists with one or more rows |
| Trigger | Phase 6 of the assessment pipeline is entered after the Findings Gate is acknowledged |
| Priority | Must |

**Main flow:**

1. assessment-manager checks whether `docs/assessments/registry.md` exists in the assessed project
2. assessment-manager determines the file exists
3. assessment-manager reads `{PREFIX}-Interventions-Index.md` to extract severity counts (CRITICAL, HIGH, MEDIUM, LOW, Total)
4. assessment-manager reads `{PREFIX}-Approvals.md` to count interventions flagged as "Yes"
5. assessment-manager captures the system date in YYYY-MM-DD format
6. assessment-manager constructs a new data row with all extracted values
7. assessment-manager appends the new row at the bottom of the existing file (below all existing rows)
8. Phase 6 summary confirms registry update and displays the file path

**Postconditions:**

- `docs/assessments/registry.md` contains N+1 rows (where N was the previous count)
- All existing rows remain unchanged
- The new row is appended at the bottom with correct date, prefix link, severity counts, and flagged count
- The Phase 6 summary includes confirmation of registry update

### UC-03: Skip Registry Update on Incomplete Assessment

| Field | Value |
|-------|-------|
| Actor | assessment-manager |
| Preconditions | A user aborts the assessment pipeline before the Findings Gate completes; `{PREFIX}-Approvals.md` is not written |
| Trigger | Pipeline exits (abort or early termination) |
| Priority | Must |

**Main flow:**

1. Pipeline execution is terminated before the Findings Gate is presented or acknowledged
2. assessment-manager does not proceed to Phase 6
3. assessment-manager does not attempt to read or write `docs/assessments/registry.md`

**Postconditions:**

- `docs/assessments/registry.md` is not created or modified
- The incomplete assessment run is not reflected in the registry

### UC-04: Handle Zero-Finding Assessment

| Field | Value |
|-------|-------|
| Actor | assessment-manager |
| Preconditions | A completed assessment run with zero findings exists; the Findings Gate is presented and acknowledged by the user; `{PREFIX}-Approvals.md` is written with zero flagged interventions |
| Trigger | Phase 6 of the assessment pipeline is entered |
| Priority | Must |

**Main flow:**

1. assessment-manager reads `{PREFIX}-Interventions-Index.md` and extracts zero counts for all severity levels
2. assessment-manager reads `{PREFIX}-Approvals.md` and counts zero flagged interventions
3. assessment-manager constructs a registry row with Total=0, CRITICAL=0, HIGH=0, MEDIUM=0, LOW=0, Flagged=0
4. assessment-manager appends (or creates) the registry with this row

**Postconditions:**

- Registry row is created or appended with all severity counts as 0
- The row is indistinguishable from any other valid row

### UC-05: Handle Duplicate Prefix Run

| Field | Value |
|-------|-------|
| Actor | assessment-manager |
| Preconditions | A completed assessment run with prefix P exists in the registry; a second assessment run with the same prefix P is executed and completes (using `--force` or similar mechanism) |
| Trigger | Phase 6 of the second assessment pipeline with the same prefix |
| Priority | Must |

**Main flow:**

1. assessment-manager reads `{PREFIX}-Interventions-Index.md` for the second run
2. assessment-manager reads `{PREFIX}-Approvals.md` for the second run
3. assessment-manager constructs a new registry row for the second run
4. assessment-manager appends the new row to the registry (no deduplication logic)

**Postconditions:**

- Registry contains two rows with the same prefix
- Both rows reflect their respective run's findings
- No deduplication or overwrite occurs

### UC-06: Review Assessment History in Registry

| Field | Value |
|-------|-------|
| Actor | Tech Lead / Project Manager |
| Preconditions | At least one assessment has completed; `docs/assessments/registry.md` exists |
| Trigger | User opens `docs/assessments/registry.md` to view assessment history |
| Priority | Must |

**Main flow:**

1. User navigates to `docs/assessments/registry.md`
2. User reads the Markdown table showing all historical assessment runs
3. User reviews dates, severity trends, and flagged intervention counts across runs
4. User can click on prefix links to navigate to individual assessment run folders

**Postconditions:**

- User can see the complete chronological history of assessments
- User can compare severity counts across runs to identify trends

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | Registry write only occurs after `{PREFIX}-Approvals.md` has been successfully written | UC-01, UC-02, UC-04, UC-05 |
| BR-02 | Registry row is not appended if the assessment pipeline is aborted before the Findings Gate completes | UC-03 |
| BR-03 | The registry file is trusted as-is; no validation or repair of manually edited rows is performed | UC-01, UC-02, UC-06 |
| BR-04 | Severity counts in a registry row must sum to the Total column value | UC-01, UC-02, UC-04, UC-05 |
| BR-05 | Each completed assessment run produces exactly one registry row, regardless of whether findings exist | UC-04 |
| BR-06 | No deduplication of prefixes occurs; the same prefix may appear in multiple rows if run twice | UC-05 |
| BR-07 | The Prefix column is rendered as a Markdown relative link pointing to `{PREFIX}/` within `docs/assessments/` | UC-01, UC-02, UC-05 |

## 4. Data Requirements

### 4.1 Entities

**Registry File** (`docs/assessments/registry.md`)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| File path | String | Location relative to project root | `docs/assessments/registry.md` |
| Content | Markdown table | Chronologically ordered table of assessment runs | See table structure below |

**Registry Table Structure**

| Column | Type | Source | Format | Notes |
|--------|------|--------|--------|-------|
| Date | String | System date at Findings Gate completion | YYYY-MM-DD | Never edited retroactively |
| Prefix | String | Assessment prefix from Phase 1b | Markdown link: `[{PREFIX}]({PREFIX}/)` | Relative link to run subfolder |
| Total | Integer | Sum of all severity counts | Numeric | Must equal CRITICAL + HIGH + MEDIUM + LOW |
| CRITICAL | Integer | Count from Interventions Index | Numeric | >= 0 |
| HIGH | Integer | Count from Interventions Index | Numeric | >= 0 |
| MEDIUM | Integer | Count from Interventions Index | Numeric | >= 0 |
| LOW | Integer | Count from Interventions Index | Numeric | >= 0 |
| Flagged | Integer | Count from Approvals file | Numeric | Count of rows where Flagged = "Yes" |

**Example Registry Content:**

```markdown
# Assessment Registry

| Date | Prefix | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged |
|------|--------|-------|----------|------|--------|-----|---------|
| 2026-01-15 | [ASSESS-001](ASSESS-001/) | 12 | 2 | 4 | 5 | 1 | 3 |
| 2026-04-20 | [ASSESS-002](ASSESS-002/) | 9  | 1 | 3 | 4 | 1 | 2 |
| 2026-07-14 | [ASSESS-003](ASSESS-003/) | 7  | 0 | 2 | 4 | 1 | 1 |
```

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| Date | Written as YYYY-MM-DD at time of registry append; must be the system date when row is appended; never edited retroactively |
| Prefix link | Must point to the subfolder name as it exists on disk (e.g., `ASSESS-001/`); must be a valid relative Markdown link |
| Total | Must equal the sum of CRITICAL + HIGH + MEDIUM + LOW |
| CRITICAL, HIGH, MEDIUM, LOW | Sourced from Interventions Index; must be non-negative integers |
| Flagged | Must be a non-negative integer representing the count of "Flagged: Yes" entries in Approvals file |
| Registry structure | Must be valid Markdown with a header row and zero or more data rows; consistent column order |

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Performance | Registry append operation must complete in < 100 milliseconds for files with up to 1000 rows |
| NFR-02 | Compatibility | Registry file must be a plain Markdown file (.md); no schema validation or external tooling required |
| NFR-03 | Maintainability | Registry read/write logic is encapsulated within assessment-manager; no changes to other agents or commands |
| NFR-04 | Usability | Registry table must be human-readable in any Markdown viewer; prefix links must be clickable in Markdown-aware tools |
| NFR-05 | Reliability | Registry write must be atomic; either the full row is appended or the file is left unchanged (no partial writes) |
| NFR-06 | Accessibility | Phase 6 summary must display the registry file path in human-readable format for easy navigation |

## 6. UI Requirements

### 6.1 Pages / Screens

#### Phase 6 Summary Display (Enhancement)

**Purpose:** Display confirmation that the registry was updated or created and show the file path for user navigation.

**Components:**

- Confirmation message: "Assessment registry updated" or "Assessment registry created"
- File path display: Absolute or relative path to `docs/assessments/registry.md`
- Optional: Brief summary of the appended row (e.g., "1 row added: [ASSESS-003] with 7 findings")

**Interactions:**

- User reads the summary and can reference the registry file path
- If the tool supports clickable links, the path should be clickable to open the file

### 6.2 Navigation Flow

The registry is accessed through two paths:

1. **After Assessment Completion:** User completes the assessment pipeline, Phase 6 summary is displayed with registry update confirmation and file path
2. **Ad Hoc Review:** User navigates to `docs/assessments/registry.md` directly to review assessment history; can click on prefix links to open individual assessment run folders

## 7. Acceptance Criteria

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-01 | Given a completed assessment run with `{PREFIX}-Approvals.md` written, when Phase 6 is reached, then `docs/assessments/registry.md` contains exactly one new row for this run with the correct date (YYYY-MM-DD), prefix link, severity counts (summing to Total), and flagged count | UC-01, UC-02 |
| AC-02 | Given `docs/assessments/registry.md` does not exist, when the first completed assessment run finishes, then the file is created with the correct Markdown table header followed by one data row | UC-01 |
| AC-03 | Given `docs/assessments/registry.md` already exists with N rows, when a second completed assessment run finishes, then the file contains N+1 rows; existing rows are unchanged; the new row is appended at the bottom | UC-02 |
| AC-04 | Given the user aborts the pipeline before completing the Findings Gate, when the pipeline exits, then `registry.md` is not modified (no new row is appended, no file is created) | UC-03 |
| AC-05 | Given a run produces zero findings, when the Findings Gate completes (user acknowledges zero findings), then the registry row is appended with Total=0, all severity counts=0, Flagged=0 | UC-04 |
| AC-06 | Given the same prefix is run twice with `--force`, when both runs complete the Findings Gate, then `registry.md` contains two rows with the same prefix; no deduplication occurs; both rows reflect their respective run's findings | UC-05 |
| AC-07 | Given a completed assessment run finishes, when the Phase 6 summary is displayed, then the summary includes a confirmation line that `docs/assessments/registry.md` was updated (or created) and shows its file path | UC-01, UC-02 |
| AC-08 | Given any tool reads the Prefix column value, when the table is rendered, then the prefix is rendered as a Markdown relative link: `[{PREFIX}]({PREFIX}/)` pointing to the subfolder within `docs/assessments/` | UC-01, UC-02, UC-05, UC-06 |
| AC-09 | Given the user views `docs/assessments/registry.md` in a Markdown viewer, when the user clicks on a prefix link, then the browser or tool navigates to the corresponding assessment run folder (`docs/assessments/{PREFIX}/`) | UC-06 |
| AC-10 | Given a registry file with multiple rows, when a user reads the file, then all rows are in chronological order (oldest run first, newest run last) | UC-06 |

## 8. Dependencies & Assumptions

### Dependencies

- **FTR-003 (Assessment Scope Reduction):** Must be implemented first or concurrently. The registry write is gated on `{PREFIX}-Approvals.md` existing, which is an FTR-003 output.
- **intervention-documentation-standard agent:** Produces `{PREFIX}-Interventions-Index.md` with machine-readable severity counts per intervention.
- **assessment-manager orchestrator:** Must be enhanced to include Phase 6 registry write logic.
- **docs/assessments/ directory:** Must exist before registry is written (created in Phase 1b of assessment-manager).

### Assumptions

- The `{PREFIX}-Interventions-Index.md` file is produced in a consistent, machine-readable format with criticality per intervention clearly identifiable.
- The `{PREFIX}-Approvals.md` file has a "Flagged" column that is consistently named and structured.
- The system clock is accurate; dates are captured at the moment the registry row is written.
- `docs/assessments/` directory always exists by the time the registry is written.
- The registry file is plain Markdown with no schema validation, no database, and no external tooling dependency.
- The `/assessment-status` command is not modified by this feature; it continues to operate on individual run folders only.
- Assessment agents and the `intervention-documentation-standard` agent are not changed by this feature.
- Users may manually edit the registry file without breaking the pipeline; the file is trusted as-is.

### Related Features

- **FTR-001 (Assessment Token Estimation):** Provides token count estimates for assessments; does not interact with registry.
- **FTR-002 (Assessment Effort Estimation):** Provides effort estimates for assessments; does not interact with registry.
- **FTR-003 (Assessment Scope Reduction):** Defines the Findings Gate and Approvals output format; registry depends on this.

## 9. Open Questions

| # | Question | Impact | Suggested Resolution |
|---|----------|--------|---------------------|
| 1 | FTR-003 is not yet implemented. The registry write depends on the FTR-003 gate flow (`{PREFIX}-Approvals.md` format and the Phase 6 summary). Should the work breakdown sequence FTR-003 before FTR-004, or implement both in the same pass? | Implementation ordering and dependencies | Confirm with Project Manager that FTR-003 is prioritized first, or plan concurrent implementation with clear handoff points |
| 2 | The Interventions Index format is defined by the `intervention-documentation-standard` agent, not by any FTR document. If the severity labelling in that file changes, the registry row extraction logic must change too. Is there a canonical field or heading name that should be treated as a contract? | Fragility of row extraction and maintenance cost | Document the expected field names and column structure from `intervention-documentation-standard` output as a data contract within the technical specification |
