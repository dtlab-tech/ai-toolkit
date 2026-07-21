# Technical Specification — Assessment Registry

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-004: Assessment Registry |
| Version | 1.0 |
| Date | 2026-07-16 |
| Status | Draft |

## 1. Overview

The Assessment Registry feature adds a persistent, chronological record of all completed assessment runs to each assessed project via `docs/assessments/registry.md`. After the assessment-manager completes Phase 5 (Findings Gate) and the user acknowledges findings and flags interventions, Phase 6 writes one row to the registry with: assessment date, run prefix, severity counts (CRITICAL, HIGH, MEDIUM, LOW, Total), and flagged intervention count. The registry enables teams to review assessment history at a glance, identify severity trends across runs, and reconstruct assessment evolution without manually opening individual run folders.

**Affected system:** assessment-manager orchestrator (Phase 6 enhancement); no changes to assessment agents, intervention-documentation-standard, or feature delivery pipeline.

## 2. Architecture

### 2.1 System Context

The Assessment Registry exists at the project level, alongside run-specific folders. The pipeline flow is:

1. User runs `/assess-codebase [path] [--scope=...] [--force]`
2. assessment-manager executes Phases 1–5 (discovery, planning, assessment, intervention docs, findings gate)
3. User completes Findings Gate: acknowledges findings and flags INT-NNN identifiers
4. `{PREFIX}-Approvals.md` is written (FTR-003 output)
5. **[NEW — Phase 6 enhancement]** assessment-manager reads severity counts and flagged count from artifacts
6. **[NEW]** assessment-manager creates or appends `docs/assessments/registry.md`
7. Phase 6 summary is displayed, confirming registry update
8. Pipeline ends (read-only, no remediation)

The registry is never written if the pipeline terminates before `{PREFIX}-Approvals.md` is successfully written.

### 2.2 Component Diagram

```
Assessment Manager (Phase 6)
        ├─→ Read {PREFIX}-Interventions-Index.md (severity counts)
        ├─→ Read {PREFIX}-Approvals.md (flagged count)
        ├─→ Determine system date (YYYY-MM-DD)
        └─→ Create or append docs/assessments/registry.md
                ├─→ [First run] Create file with header + one row
                └─→ [Subsequent runs] Append one row to existing file

docs/assessments/registry.md
    ├─→ Markdown table format
    ├─→ One header row: | Date | Prefix | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged |
    ├─→ One data row per completed assessment
    └─→ Chronological order (newest at bottom)
```

### 2.3 Sequence Diagram

```
User invokes /assess-codebase
         │
         ├─→ Phase 1–5 execute
         │
         ├─→ {PREFIX}-Approvals.md written ✓
         │
         ├─→ [Phase 6 start]
         │
         ├─→ Check: Does docs/assessments/registry.md exist?
         │     │
         │     ├─ NO  → Create with header + first row
         │     │
         │     └─ YES → Append row to existing file
         │
         ├─→ Read {PREFIX}-Interventions-Index.md → extract severity counts
         │
         ├─→ Read {PREFIX}-Approvals.md → count Flagged: Yes rows
         │
         ├─→ Capture system date (YYYY-MM-DD)
         │
         ├─→ Construct row: [Date | [PREFIX](PREFIX/) | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged]
         │
         ├─→ Write/append file
         │
         ├─→ Display Phase 6 summary with registry confirmation
         │
         └─→ Pipeline ends
```

## 3. Backend

### 3.1 Data Model

**Registry File** (`docs/assessments/registry.md`)

| Attribute | Type | Description | Constraints |
|-----------|------|-------------|-------------|
| Path | String | Relative to project root | `docs/assessments/registry.md` |
| Format | Markdown | Table with header row and N data rows | Valid Markdown; consistent column order |
| Content-Type | Text (UTF-8) | Plain text Markdown | ASCII alphanumeric, pipes, hyphens, brackets, colons |

**Header Row (immutable across runs)**

```markdown
| Date | Prefix | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged |
|------|--------|-------|----------|------|--------|-----|---------|
```

**Data Row Structure (one per assessment run)**

| Column | Type | Source | Format | Validation |
|--------|------|--------|--------|-----------|
| Date | String | System date at Findings Gate completion | YYYY-MM-DD | Must be valid date; never edited retroactively |
| Prefix | String | Assessment prefix from Phase 1b | Markdown link: `[{PREFIX}]({PREFIX}/)` | Must point to existing subfolder; relative path |
| Total | Integer | Sum of CRITICAL + HIGH + MEDIUM + LOW | Numeric (no decimals) | Must equal sum of severity counts |
| CRITICAL | Integer | Count from {PREFIX}-Interventions-Index.md | Numeric (no decimals) | >= 0; sourced from index |
| HIGH | Integer | Count from {PREFIX}-Interventions-Index.md | Numeric (no decimals) | >= 0; sourced from index |
| MEDIUM | Integer | Count from {PREFIX}-Interventions-Index.md | Numeric (no decimals) | >= 0; sourced from index |
| LOW | Integer | Count from {PREFIX}-Interventions-Index.md | Numeric (no decimals) | >= 0; sourced from index |
| Flagged | Integer | Count of "Flagged: Yes" rows in {PREFIX}-Approvals.md | Numeric (no decimals) | >= 0; <= Total |

**Example Registry File**

```markdown
# Assessment Registry

| Date | Prefix | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged |
|------|--------|-------|----------|------|--------|-----|---------|
| 2026-01-15 | [ASSESS-001](ASSESS-001/) | 12 | 2 | 4 | 5 | 1 | 3 |
| 2026-04-20 | [ASSESS-002](ASSESS-002/) | 9  | 1 | 3 | 4 | 1 | 2 |
| 2026-07-14 | [ASSESS-003](ASSESS-003/) | 7  | 0 | 2 | 4 | 1 | 1 |
```

### 3.2 Data Extraction

#### From {PREFIX}-Interventions-Index.md

The Interventions Index (produced by `intervention-documentation-standard` in Phase 4) has the following structure:

```markdown
# Interventions Index — {PREFIX}

| ID | Title | Area | Criticality | Depends on | Suggested Agent |
|---|---|---|---|---|---|
| INT-001 | ... | Security | CRITICAL | — | developer-backend |
| INT-002 | ... | Code Quality | HIGH | INT-003 | developer-backend |
| INT-003 | ... | Architecture | MEDIUM | — | developer-backend |
| INT-004 | ... | Documentation | LOW | — | developer-frontend |
```

**Extraction algorithm:**
1. Parse the Interventions Index table
2. For each row, extract the "Criticality" column value (one of: CRITICAL, HIGH, MEDIUM, LOW)
3. Count rows where Criticality = CRITICAL → store as `critical_count`
4. Count rows where Criticality = HIGH → store as `high_count`
5. Count rows where Criticality = MEDIUM → store as `medium_count`
6. Count rows where Criticality = LOW → store as `low_count`
7. Compute `total_count = critical_count + high_count + medium_count + low_count`

If the Interventions Index is malformed or missing:
- Log a warning: `"[timestamp] WARNING: {PREFIX}-Interventions-Index.md not found or malformed; severity counts unavailable"`
- Use `critical_count = high_count = medium_count = low_count = total_count = 0`
- Continue (non-fatal)

#### From {PREFIX}-Approvals.md

The Approvals file (produced by assessment-manager in Phase 5, per FTR-003) has the following structure:

```markdown
# Findings Acknowledgement — {PREFIX}

## Assessment Reviewed

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| {PREFIX}-Generic-Assessment.md | Acknowledged | {date} | — |
| {PREFIX}-Interventions-Index.md | Acknowledged | {date} | — |

## Interventions Flagged for Feature Delivery

| Intervention | Flagged | Date | Notes |
|---|---|---|---|
| INT-001 — sql-injection-hardening | Yes | {date} | — |
| INT-002 — god-class-decomposition | Yes | {date} | — |
| INT-003 — di-refactoring | No | {date} | Not selected |
```

**Extraction algorithm:**
1. Parse the "Interventions Flagged for Feature Delivery" table
2. Count rows where the "Flagged" column value is "Yes" (case-sensitive) → store as `flagged_count`
3. If the table is empty or missing, set `flagged_count = 0`

If the Approvals file is malformed or missing:
- This should not happen in practice because the registry write is gated on `{PREFIX}-Approvals.md` existing
- Log a critical error: `"[timestamp] ERROR: {PREFIX}-Approvals.md not found or malformed; cannot extract flagged count"`
- **Do not write the registry row** — halt Phase 6 registry write and report the error to the user

### 3.3 File Write Logic

#### Pseudo-code: Create or Append Registry

```
PHASE 6 REGISTRY WRITE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Check prerequisite: Does {PREFIX}-Approvals.md exist?
   IF NOT
       Log critical error: "Cannot write registry: {PREFIX}-Approvals.md not found"
       RETURN without writing registry
   END IF

2. Set target_path = "docs/assessments/registry.md" (relative to project root)

3. Extract severity counts from {PREFIX}-Interventions-Index.md
   critical_count = count of rows with Criticality = CRITICAL
   high_count = count of rows with Criticality = HIGH
   medium_count = count of rows with Criticality = MEDIUM
   low_count = count of rows with Criticality = LOW
   total_count = critical_count + high_count + medium_count + low_count
   [If index is missing/malformed, set all counts to 0]

4. Extract flagged count from {PREFIX}-Approvals.md
   flagged_count = count of rows where Flagged = "Yes"
   [If approvals is missing/malformed, halt with error]

5. Capture system date
   current_date = today in YYYY-MM-DD format

6. Construct new row
   prefix_link = "[{PREFIX}]({PREFIX}/)"
   new_row = "| {current_date} | {prefix_link} | {total_count} | {critical_count} | {high_count} | {medium_count} | {low_count} | {flagged_count} |"

7. Check if target_path exists
   IF NOT EXISTS(target_path)
       // FIRST RUN
       header = "# Assessment Registry\n\n| Date | Prefix | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged |\n|------|--------|-------|----------|------|--------|-----|---------|"
       file_content = header + "\n" + new_row + "\n"
       WRITE(target_path, file_content)
       Log: "[timestamp] Phase 6: created registry.md with first row"
       Log: "  Location: docs/assessments/registry.md"
   ELSE
       // SUBSEQUENT RUN — APPEND
       existing_content = READ(target_path)
       file_content = existing_content.rstrip() + "\n" + new_row + "\n"
       WRITE(target_path, file_content)
       Log: "[timestamp] Phase 6: appended row to registry.md"
       Log: "  Location: docs/assessments/registry.md"
   END IF

8. Verify write
   IF NOT EXISTS(target_path) OR EMPTY(target_path)
       Log error: "Registry write failed: file not readable"
       Report to user and continue (non-fatal)
   END IF
```

#### Atomicity Constraint

Registry writes must be **atomic** — either the full row is appended or the file is left unchanged. If a write fails mid-way:
- Do not leave partial rows or corrupted Markdown
- Log the error with timestamp and full path
- Continue to Phase 6 summary (the absence of a registry is non-fatal to the pipeline)

#### Idempotency

If a registry row with the same prefix and date is written twice:
- The second write appends a duplicate row; **no deduplication occurs**
- This can happen if `--force` is used to re-run the same prefix
- Both rows appear in the registry; both reflect their respective run's findings
- This is **intentional** — it preserves the history of re-runs

### 3.4 Error Handling

| Scenario | Logged as | Severity | Action | Halt? |
|----------|-----------|----------|--------|-------|
| {PREFIX}-Approvals.md not found | ERROR | Critical | Do not write registry row; report to user in Phase 6 summary | No* |
| {PREFIX}-Interventions-Index.md not found | WARNING | High | Set severity counts to 0; continue | No |
| {PREFIX}-Interventions-Index.md malformed (unparseable Criticality) | WARNING | High | Count intact rows; skip unparseable rows; log count of skipped rows | No |
| {PREFIX}-Approvals.md malformed (unparseable table) | ERROR | Critical | Do not write registry row; report to user | No* |
| Registry write I/O fails (permission denied, disk full) | ERROR | High | Log full error message and path; continue to Phase 6 summary | No |
| Registry file unreadable after write (verification fails) | ERROR | High | Log full error and path; report to user; continue | No |
| docs/assessments/ directory does not exist | ERROR | Critical | Should never happen (directory created in Phase 1b); log error and halt registry write | No* |

*Non-fatal to pipeline exit, but reported in Phase 6 summary and process log.

### 3.5 Integration with assessment-manager

**Phase 6 Summary Display (enhanced)**

After the registry write completes, the Phase 6 summary display (per `assessment-manager.md` Phase 6) is updated to include a registry confirmation line:

```
Assessment Manager — Run Summary
─────────────────────────────────────────────────────
Target: {codebase path}  |  Prefix: {PREFIX}
─────────────────────────────────────────────────────
Assessment:
  ✅ generic-software-assessment    → {PREFIX}-Generic-Assessment.md
  ✅ layered-architecture-assessment → {PREFIX}-Layer-Assessment.md
  ✅ concurrency-safety-assessment   → {PREFIX}-Concurrency-Assessment.md
─────────────────────────────────────────────────────
Findings:       N CRITICAL | N HIGH | N MEDIUM | N LOW
Interventions:  N proposed | N flagged for feature delivery
─────────────────────────────────────────────────────
Approvals:           {PREFIX}-Approvals.md
Registry:            docs/assessments/registry.md [created | updated]
Token Estimate:      {PREFIX}-Token-Estimate.md
Effort Estimate:     {PREFIX}-Effort-Estimate.md
Process log:         docs/assessments/{PREFIX}/{PREFIX}-process-log.txt
─────────────────────────────────────────────────────
```

**Line format:**
- If registry was created: `Registry: docs/assessments/registry.md [created]`
- If registry was appended: `Registry: docs/assessments/registry.md [updated]`
- If registry write was skipped (error): `Registry: docs/assessments/registry.md [write skipped — see process log]`

**Process Log Entry**

assessment-manager appends to `{PREFIX}-process-log.txt`:

```
[timestamp] Phase 6 start: registry write
[timestamp] Phase 6: extracted severity counts from {PREFIX}-Interventions-Index.md
  CRITICAL: N, HIGH: N, MEDIUM: N, LOW: N, Total: N
[timestamp] Phase 6: extracted flagged count from {PREFIX}-Approvals.md
  Flagged for feature delivery: N
[timestamp] Phase 6: [created | appended] registry row
  Location: docs/assessments/registry.md
  Row: | {date} | [{PREFIX}]({PREFIX}/) | {total} | {critical} | {high} | {medium} | {low} | {flagged} |
[timestamp] Phase 6 end: registry write complete
```

If an error occurs:
```
[timestamp] Phase 6: registry write skipped — {error description}
```

## 4. Frontend

Not applicable. The registry is a static Markdown file. Teams review it via text editors or Markdown viewers (GitHub, GitLab, IDE, etc.). No UI components or dynamic rendering required.

## 5. External Integrations

None. The registry is entirely file-based. No external APIs or services are called.

## 6. Security Considerations

- **No authentication required** — registry is a project-level file, subject to normal file system permissions
- **No sensitive data exposure** — registry contains only assessment metadata (dates, counts, prefix links); no code snippets, no PII, no credentials
- **File integrity** — registry is plain text Markdown; no encryption or signing is performed (consistent with other assessment artifacts)
- **Manual editing** — users may manually edit the registry without breaking the pipeline; the file is trusted as-is

## 7. Database Changes

Not applicable. No database schema changes. The registry is a plain text Markdown file.

## 8. Configuration

### 8.1 Environment Variables

None required.

### 8.2 Feature Flags

None. Registry write is always enabled for completed assessment runs.

### 8.3 Registry File Path

Fixed at `docs/assessments/registry.md` (relative to project root). No configuration option to change the path.

## 9. File Inventory

### New files
| Path | Purpose |
|------|---------|
| `docs/assessments/registry.md` | Created by assessment-manager after first completed assessment run |

### Modified files
| Path | Change description |
|------|-------------------|
| `.claude/agents/assessment-manager.md` | **Phase 6 enhancement:** Add registry write logic (Steps 1–8 above). Add registry confirmation line to Phase 6 summary display. Add registry entry to process log. Modify Phase 6 section title or description to indicate registry is part of summary flow. |
| `docs/reference.md` | Update "registry" entry if `/assessment-status` command documentation needs clarity on registry presence (optional; registry is not queried by the command). |

## 10. Testing Strategy

### 10.1 Unit Test Scope

**Test the row extraction logic independently:**
- Parsing severity counts from `{PREFIX}-Interventions-Index.md` (various formats: 0 findings, 1 finding, mixed severities)
- Parsing flagged count from `{PREFIX}-Approvals.md` (0 flagged, all flagged, some flagged)
- Date formatting (YYYY-MM-DD)
- Prefix link formatting (`[{PREFIX}]({PREFIX}/`)
- Row construction (fields in correct order, pipe delimiters)

**Test file creation logic:**
- File does not exist → create with header + one row
- File already exists → append row without modifying existing rows
- Header preservation (first row of existing file unchanged)

**Test error handling:**
- Missing Interventions Index → severity counts default to 0
- Missing Approvals file → do not write row (halt with error)
- Malformed Interventions Index → skip unparseable rows, count valid rows
- Malformed Approvals file → do not write row (halt with error)
- Write I/O failure → log error, continue

### 10.2 Integration Test Scenarios

| Scenario | Setup | Action | Expected result |
|----------|-------|--------|------------------|
| First assessment run | No registry file exists | Complete assessment pipeline | `docs/assessments/registry.md` created with header + one row |
| Second assessment run | Registry exists with one row | Complete assessment pipeline with different prefix | Registry now has header + two rows; first row unchanged |
| Zero findings | Interventions Index is empty | Complete assessment pipeline | Registry row appended with all severity counts = 0, Flagged = 0 |
| All flagged | All interventions flagged at gate | Complete assessment pipeline | Registry row appended with Flagged = Total |
| Duplicate prefix with --force | Same prefix run twice | Run first, then run again with --force | Registry has two rows with same prefix; both present, no deduplication |
| Abort before gate | User cancels pipeline before Findings Gate | Pipeline halts | Registry not modified; no new row appended |
| Aborted after gate | Pipeline proceeds to Phase 6 but registry write fails | Complete gate, registry I/O error | Registry write error logged; Phase 6 summary reports error; pipeline continues |

### 10.3 Manual Verification

1. **Create registry on first run:**
   - Run `/assess-codebase .` on a project with no registry
   - Verify `docs/assessments/registry.md` is created with header
   - Verify one row is appended with current date, correct prefix link, and correct severity/flagged counts
   - Verify Phase 6 summary shows "Registry: docs/assessments/registry.md [created]"

2. **Append row on second run:**
   - Run `/assess-codebase . --force` on same project
   - Verify new row is appended at bottom
   - Verify first row is unchanged
   - Verify Phase 6 summary shows "Registry: docs/assessments/registry.md [updated]"

3. **Handle zero findings:**
   - Create an assessment that produces zero findings
   - Complete the Findings Gate (acknowledge zero findings)
   - Verify registry row is appended with Total=0, all counts=0, Flagged=0

4. **Verify Markdown readability:**
   - Open registry in Markdown viewer (GitHub, IDE, etc.)
   - Verify table renders correctly
   - Verify prefix links are clickable (in Markdown-aware tools)
   - Click a prefix link; verify it opens the corresponding run folder

5. **Manually edit and re-run:**
   - Manually edit a registry row (e.g., change a date, a count)
   - Run next assessment
   - Verify new row is appended without validation or repair of edited row

## 11. Implementation Order

1. **Modify `assessment-manager.md`** — Phase 6 enhancement (add registry write logic, update summary display, add process log entries)
   - Depends on: FTR-003 implementation (gate procedure and Approvals file format)
   - Precondition: intervention-documentation-standard is producing Interventions Index with Criticality column

2. **Test extraction logic** — unit tests for parsing Interventions Index and Approvals files
   - Depends on: Step 1

3. **Test file I/O logic** — unit tests for create/append operations, error handling
   - Depends on: Step 1

4. **Integration test with assessment-manager** — end-to-end test with real assessment run
   - Depends on: Steps 1–3

5. **Manual verification** — human testing with real codebase and multiple assessment runs
   - Depends on: Step 4

6. **Documentation** — update `docs/reference.md` if needed for clarity
   - Depends on: Step 5

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Interventions Index format changes** — If `intervention-documentation-standard` agent changes how criticality is labelled or table structure changes, registry extraction logic must be updated. | High | Document the Interventions Index column structure as a data contract within `assessment-manager.md`. Link to specific section of `intervention-documentation-standard.md` that defines the table format. If contract breaks, log a clear error and halt registry write with a user-facing message pointing to the breaking change. |
| **Approvals file format changes** — If FTR-003 modifies the Approvals file structure, registry extraction logic must be updated. | High | Document the expected Approvals table structure (Interventions Flagged for Feature Delivery, Flagged column name) within this spec. Update assessment-manager.md to reference FTR-003 gate procedure. Add validation: if Approvals file does not match expected structure, log error and halt with user-facing message. |
| **Duplicate prefix appends rows instead of updating** — User runs same prefix twice with --force; registry has two rows with same prefix. This may be confusing. | Low | By design (intentional per feature spec AC-06). Document in user guides that registry preserves all runs; users should not rely on prefix uniqueness. Consider deferred feature: `/assessment-history` command with "last run" filtering. |
| **Registry file manually edited by user** — User modifies a row; extraction logic assumes consistent format. | Low | Feature spec AC-06 (out of scope) explicitly states "registry is trusted as-is". No validation or repair performed. User responsibility to maintain format. |
| **I/O failure at scale** — Registry file with 1000+ rows may be slow to read/append on some systems. | Low | NFR-01 requires < 100ms for files with up to 1000 rows. Append operation is O(n) read + O(1) write (linear only in file size); acceptable. File size is small (Markdown table, ~100 bytes per row; 1000 rows ≈ 100KB). Monitor performance in testing. |
| **Missing Interventions Index at Phase 6** — If the index is missing but Approvals file exists, registry write proceeds with severity counts = 0. This may be misleading. | Medium | Log a clear warning: "[timestamp] WARNING: {PREFIX}-Interventions-Index.md not found — severity counts set to 0. Check assessment outputs." Report warning in Phase 6 summary. User can review process log to understand what happened. |
| **Open question from feature doc** — Should the Interventions Index "Criticality" field be treated as a formal data contract? If so, add explicit validation in assessment-manager; if not, parsing may be fragile. | Medium | **Recommendation:** Add explicit data contract definition to `assessment-manager.md` Phase 6 section. Reference `intervention-documentation-standard.md` section 1.3 (Criticality field format). Define: Criticality is one of {CRITICAL, HIGH, MEDIUM, LOW}, case-sensitive, in "Criticality" column of Interventions Index table. If parsing fails, log clear error and halt registry write. |
| **Open question from feature doc** — If `intervention-documentation-standard` agent changes its format, registry extraction breaks. Should we add a versioning scheme or canonical field contract? | Medium | **Recommendation:** Do not add versioning at this time. Instead, tie assessment-manager Phase 6 logic tightly to FTR-003 and the intervention-documentation-standard agent. If either changes format, update assessment-manager.md and re-run affected assessments (user re-runs with --force). Document assumption in "Dependencies & Assumptions" section below. |

## Dependencies & Assumptions

### Dependencies

- **FTR-003 (Assessment Scope Reduction):** Must be implemented first or concurrently. The registry write is gated on `{PREFIX}-Approvals.md` existing (FTR-003 output). Registry reads the Flagged column from the Approvals table (FTR-003 data model).
- **intervention-documentation-standard agent:** Must produce `{PREFIX}-Interventions-Index.md` with a "Criticality" column. Registry extraction depends on this format.
- **assessment-manager orchestrator:** Must be enhanced to include Phase 6 registry write logic.
- **docs/assessments/ directory:** Must exist before registry is written (created in Phase 1b of assessment-manager).

### Assumptions

- The `{PREFIX}-Interventions-Index.md` file produced by `intervention-documentation-standard` contains a "Criticality" column in its main table, with values CRITICAL | HIGH | MEDIUM | LOW (case-sensitive, one per row).
- The `{PREFIX}-Approvals.md` file (per FTR-003) has a "Interventions Flagged for Feature Delivery" section with a table containing a "Flagged" column with values "Yes" or "No" (case-sensitive).
- The system clock is accurate; dates are captured at the moment the registry row is written (no timezone handling; assumes UTC or local time consistent with team).
- `docs/assessments/` directory always exists by the time the registry is written (created in Phase 1b of assessment-manager).
- The registry file is plain Markdown with no schema validation, no database, and no external tooling dependency.
- The `/assessment-status` command is **not** modified by this feature; it continues to operate on individual run folders only.
- Assessment agents (Phase 3) and `intervention-documentation-standard` (Phase 4) are not changed by this feature.
- Users may manually edit the registry file without breaking the pipeline; the file is trusted as-is (no validation or repair performed on manually edited rows).

## Related Features

- **FTR-001 (Assessment Token Estimation):** Produces token counts; does not interact with registry directly. Registry is written after gate (post-token-estimation), so token data is already finalized.
- **FTR-002 (Assessment Effort Estimation):** Produces effort estimates; does not interact with registry directly. Registry is written after gate (post-effort-estimation), so effort data is already finalized.
- **FTR-003 (Assessment Scope Reduction):** Defines the Findings Gate and Approvals output format. Registry **depends on** FTR-003 — the Approvals file structure and presence is the prerequisite for registry write.

## Open Questions

| # | Question | Impact | Suggested Resolution |
|---|----------|--------|---------------------|
| 1 | Should the Interventions Index Criticality field be formally documented as a data contract in assessment-manager.md Phase 6? Or is a loose parsing assumption acceptable? | Maintenance cost if intervention-documentation-standard changes format | **Recommendation:** Document as a formal contract in assessment-manager.md Phase 6 logic section. Reference the specific field name and valid values. If the agent changes format, registry extraction will fail gracefully (log error, halt write) rather than silently producing incorrect counts. |
| 2 | Should there be a deferred feature to backfill the registry from existing ASSESS-* folders (for teams with prior runs pre-dating this feature)? | Historical completeness of registry for existing projects | **Recommendation:** Out of scope for MVP (per feature spec). Add to deferred features list for future iteration. Include as a utility script or standalone agent that scans existing folders and populates registry retroactively. |
| 3 | Should the Phase 6 summary include a link or command to review the registry (e.g., "View full registry history: `docs/assessments/registry.md`")? | Usability; discoverability of the new feature | **Recommendation:** Yes. Add to Phase 6 summary display: "Registry: docs/assessments/registry.md [created | updated]" (already in spec). Consider adding a brief note in user-facing documentation: "Review all past assessments in docs/assessments/registry.md". |
