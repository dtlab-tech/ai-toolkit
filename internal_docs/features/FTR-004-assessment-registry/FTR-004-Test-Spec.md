# Test Specification — Assessment Registry

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-004: Assessment Registry |
| Version | 1.0 |
| Date | 2026-07-17 |
| Status | Draft |
| Source: Work Breakdown | FTR-004-Work-Breakdown.md |
| Source: Tech-Spec | FTR-004-Tech-Spec.md |
| Implementation under test | `.claude/agents/assessment-manager.md` Phase 6 |

---

## Overview

This specification covers all Phase 3 testing tasks for FTR-004. The system under test is the Phase 6 registry write logic embedded in `assessment-manager.md`. Because this is a Markdown-only toolkit with no compiled runtime, tests take the form of documented scenarios with explicit input fixtures, expected outputs, and step-by-step verification procedures. These serve as acceptance checklists and as the reference for any future automation.

**Test environment:** Any invocation of `assessment-manager` that reaches Phase 6. Manual tests use a Markdown viewer (GitHub web UI, VSCode preview, or equivalent). Fixture-driven tests simulate the file state the agent would observe at Phase 6 entry.

**Key contracts under test:**

- Interventions Index `Criticality` column: values `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` — exact, case-sensitive
- Approvals file `Flagged` column: values `Yes` or `No` — exact, case-sensitive (`yes`, `YES`, `no`, `NO` are invalid)
- Registry path: `docs/assessments/registry.md` (relative to project root)
- Registry row format: exactly eight pipe-delimited columns in order: `Date | Prefix | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged`
- Severity extraction failures are **non-fatal** (counts default to 0)
- Approvals file failures are **fatal to the registry write** (registry not created or modified)

---

## Task Index

| Task ID | Name | Type | Section |
|---------|------|------|---------|
| US-01-T07 | Extract severity counts from Interventions Index | Unit | §1 |
| US-01-T08 | Extract flagged count from Approvals file | Unit | §2 |
| US-01-T09 | Registry row construction | Unit | §3 |
| US-01-T10 | File creation with header and row | Unit | §4 |
| US-02-T06 | Append row to existing registry | Unit | §5 |
| US-03-T02 | Skip registry write when Approvals missing | Unit | §6 |
| US-04-T01 | Registry row with zero findings | Unit / Integration | §7 |
| US-05-T01 | Duplicate prefix produces two rows | Integration | §8 |
| US-06-T01 | Markdown table readability | Manual | §9 |
| US-06-T02 | Prefix links are clickable | Manual | §10 |
| US-06-T03 | Chronological ordering | Unit / Manual | §11 |

---

## §1 — US-01-T07: Extract Severity Counts from Interventions Index

**Type:** Unit  
**Implementation step:** Phase 6, Step 2 — extract severity counts from `{PREFIX}-Interventions-Index.md`

### Scenario 1.1 — Zero findings: empty table body

**Given** an Interventions Index file with a valid table header but no data rows:

```markdown
# Interventions Index — ASSESS-001

| ID | Title | Area | Criticality | Depends on | Suggested Agent |
|---|---|---|---|---|---|
```

**When** the extraction algorithm processes the file.

**Then:**
- `critical_count = 0`
- `high_count = 0`
- `medium_count = 0`
- `low_count = 0`
- `total_count = 0`
- No error or warning is logged — zero findings is a valid state
- Processing continues normally to Step 3

**Verification steps:**
1. Provide the fixture above as `docs/assessments/ASSESS-001/ASSESS-001-Interventions-Index.md`
2. Trigger Phase 6 registry write
3. Inspect the registry row written: verify all numeric columns show `0`
4. Inspect the process log: verify the entry shows `CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, Total: 0` with no WARNING line

---

### Scenario 1.2 — Single finding: one data row

**Given** an Interventions Index with exactly one data row:

```markdown
# Interventions Index — ASSESS-001

| ID | Title | Area | Criticality | Depends on | Suggested Agent |
|---|---|---|---|---|---|
| INT-001 | SQL injection in query builder | Security | CRITICAL | — | security-hardening |
```

**When** the extraction algorithm processes the file.

**Then:**
- `critical_count = 1`
- `high_count = 0`
- `medium_count = 0`
- `low_count = 0`
- `total_count = 1`

**Verification steps:**
1. Provide the fixture above
2. Trigger Phase 6 registry write
3. Inspect the registry row: `| {date} | [ASSESS-001](ASSESS-001/) | 1 | 1 | 0 | 0 | 0 | {flagged} |`

---

### Scenario 1.3 — Mixed severities: multiple rows with all four levels

**Given** an Interventions Index with rows at every severity level:

```markdown
# Interventions Index — ASSESS-002

| ID | Title | Area | Criticality | Depends on | Suggested Agent |
|---|---|---|---|---|---|
| INT-001 | SQL injection | Security | CRITICAL | — | security-hardening |
| INT-002 | God class decomposition | Code Quality | HIGH | INT-003 | god-class-decomposition |
| INT-003 | Layer boundary violations | Architecture | HIGH | — | developer-backend |
| INT-004 | Missing null checks | Code Quality | MEDIUM | — | developer-backend |
| INT-005 | Inconsistent naming | Documentation | MEDIUM | — | developer-backend |
| INT-006 | Dead code removal | Code Quality | MEDIUM | — | developer-backend |
| INT-007 | Comment updates | Documentation | LOW | — | developer-frontend |
```

**When** the extraction algorithm processes the file.

**Then:**
- `critical_count = 1`
- `high_count = 2`
- `medium_count = 3`
- `low_count = 1`
- `total_count = 7`

**Verification steps:**
1. Provide the fixture above as `ASSESS-002-Interventions-Index.md`
2. Trigger Phase 6 registry write
3. Inspect the registry row: `| {date} | [ASSESS-002](ASSESS-002/) | 7 | 1 | 2 | 3 | 1 | {flagged} |`
4. Confirm `total_count` equals the arithmetic sum (1 + 2 + 3 + 1 = 7)

---

### Scenario 1.4 — Malformed table: unrecognised Criticality values in some rows

**Given** an Interventions Index where some rows have invalid values in the Criticality column:

```markdown
# Interventions Index — ASSESS-003

| ID | Title | Area | Criticality | Depends on | Suggested Agent |
|---|---|---|---|---|---|
| INT-001 | SQL injection | Security | CRITICAL | — | security-hardening |
| INT-002 | God class | Code Quality | high | INT-003 | god-class-decomposition |
| INT-003 | Missing tests | Testability | MEDIUM | — | developer-testing |
| INT-004 | Dead code | Code Quality | UNKNOWN | — | developer-backend |
```

**When** the extraction algorithm processes the file.

**Then:**
- `critical_count = 1` (INT-001 counted)
- `high_count = 0` (`high` is not a valid value; row skipped)
- `medium_count = 1` (INT-003 counted)
- `low_count = 0`
- `total_count = 2`
- A WARNING is logged for INT-002 (`high` is not a recognised Criticality value)
- A WARNING is logged for INT-004 (`UNKNOWN` is not a recognised Criticality value)
- Processing continues — this is non-fatal; the registry row is written with counts from valid rows only

**Verification steps:**
1. Provide the fixture above
2. Trigger Phase 6 registry write
3. Inspect the process log: verify two WARNING lines, one naming INT-002 and one naming INT-004
4. Inspect the registry row: verify `| {date} | [ASSESS-003](ASSESS-003/) | 2 | 1 | 0 | 1 | 0 | {flagged} |`
5. Confirm the row was written despite the invalid rows (non-fatal)

---

### Scenario 1.5 — Missing file: Interventions Index not found

**Given** no `ASSESS-004-Interventions-Index.md` file exists at `docs/assessments/ASSESS-004/`.

**When** Phase 6 attempts to extract severity counts.

**Then:**
- A WARNING is logged: `[timestamp] WARNING: ASSESS-004-Interventions-Index.md not found; severity counts set to 0`
- All counts default to 0: `critical_count = high_count = medium_count = low_count = total_count = 0`
- Processing continues to Step 3 (flagged count extraction) — non-fatal
- The registry row is written with all severity columns as `0`

**Verification steps:**
1. Ensure no Interventions Index file exists for the prefix
2. Trigger Phase 6 registry write (Approvals file must be present and valid)
3. Inspect the process log: verify the WARNING line with the exact text above
4. Inspect the registry row: verify all numeric columns show `0`
5. Confirm the registry file was created or appended (non-fatal outcome)

---

### Scenario 1.6 — Criticality column absent from table header

**Given** an Interventions Index file where the table exists but has no `Criticality` column:

```markdown
# Interventions Index — ASSESS-005

| ID | Title | Area | Severity | Depends on | Suggested Agent |
|---|---|---|---|---|---|
| INT-001 | SQL injection | Security | CRITICAL | — | security-hardening |
```

Note: The column is named `Severity` instead of `Criticality`.

**When** the extraction algorithm processes the file.

**Then:**
- A WARNING is logged: `[timestamp] WARNING: ASSESS-005-Interventions-Index.md missing Criticality column; severity counts set to 0`
- All counts default to 0
- Processing continues — non-fatal
- The registry row is written with all severity columns as `0`

**Verification steps:**
1. Provide the fixture above
2. Trigger Phase 6 registry write
3. Inspect the process log: verify the WARNING line referencing the missing `Criticality` column
4. Inspect the registry row: confirm all severity and total columns are `0`

---

## §2 — US-01-T08: Extract Flagged Count from Approvals File

**Type:** Unit  
**Implementation step:** Phase 6, Step 3 — extract flagged count from `{PREFIX}-Approvals.md`

### Scenario 2.1 — Zero flagged: all interventions marked No

**Given** an Approvals file where every row in the flagged table has `No`:

```markdown
# Findings Acknowledgement — ASSESS-001

## Assessment Reviewed

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| ASSESS-001-Interventions-Index.md | Acknowledged | 2026-07-17 | — |

## Interventions Flagged for Feature Delivery

| Intervention | Flagged | Date | Notes |
|---|---|---|---|
| INT-001 — sql-injection-hardening | No | 2026-07-17 | Not selected |
| INT-002 — god-class-decomposition | No | 2026-07-17 | Not selected |
```

**When** the extraction algorithm processes the `Flagged` column.

**Then:**
- `flagged_count = 0`
- No error or warning is logged
- Processing continues; the registry row will have `Flagged = 0`

**Verification steps:**
1. Provide the fixture above
2. Trigger Phase 6 registry write
3. Inspect the process log: verify `Flagged for feature delivery: 0`
4. Inspect the registry row: verify the last column shows `0`

---

### Scenario 2.2 — All flagged: every intervention marked Yes

**Given** an Approvals file where every row is marked `Yes`:

```markdown
## Interventions Flagged for Feature Delivery

| Intervention | Flagged | Date | Notes |
|---|---|---|---|
| INT-001 — sql-injection-hardening | Yes | 2026-07-17 | — |
| INT-002 — god-class-decomposition | Yes | 2026-07-17 | — |
| INT-003 — di-refactoring | Yes | 2026-07-17 | — |
```

**When** the extraction algorithm processes the file.

**Then:**
- `flagged_count = 3`
- No error is logged
- The registry row will have `Flagged = 3`

**Verification steps:**
1. Provide the fixture above (with all other required sections present)
2. Trigger Phase 6 registry write
3. Inspect the registry row: verify the Flagged column shows `3`
4. Confirm `flagged_count` matches the total number of rows in the table (all were `Yes`)

---

### Scenario 2.3 — Some flagged: mixed Yes and No

**Given** an Approvals file with a mix of `Yes` and `No`:

```markdown
## Interventions Flagged for Feature Delivery

| Intervention | Flagged | Date | Notes |
|---|---|---|---|
| INT-001 — sql-injection-hardening | Yes | 2026-07-17 | — |
| INT-002 — god-class-decomposition | Yes | 2026-07-17 | — |
| INT-003 — di-refactoring | No | 2026-07-17 | Not selected |
| INT-004 — missing-tests | No | 2026-07-17 | Deferred |
```

**When** the extraction algorithm counts rows with `Flagged = "Yes"`.

**Then:**
- `flagged_count = 2` (INT-001 and INT-002 only)
- No error is logged
- The `No` rows are not counted

**Verification steps:**
1. Provide the fixture above
2. Trigger Phase 6 registry write
3. Inspect the registry row: verify the Flagged column shows `2`

---

### Scenario 2.4 — Empty table: section present but no data rows

**Given** an Approvals file where the flagged section exists but the table has no data rows:

```markdown
## Interventions Flagged for Feature Delivery

| Intervention | Flagged | Date | Notes |
|---|---|---|---|
```

**When** the extraction algorithm processes the file.

**Then:**
- `flagged_count = 0` — this is valid; not an error
- No error or warning is logged
- Processing continues normally

**Verification steps:**
1. Provide the fixture above
2. Trigger Phase 6 registry write
3. Inspect the process log: verify `Flagged for feature delivery: 0` with no ERROR or WARNING
4. Inspect the registry row: verify the Flagged column shows `0`

---

### Scenario 2.5 — Missing file: Approvals file not found

**Given** no `ASSESS-006-Approvals.md` file exists.

**When** Phase 6 begins and runs the prerequisite check (Step 1).

**Then:**
- An ERROR is logged: `[timestamp] ERROR: Cannot write registry — ASSESS-006-Approvals.md not found. Ensure the Findings Gate completed successfully.`
- The registry write is **halted** — no registry file is created or modified
- The Phase 6 summary reports: `Registry: docs/assessments/registry.md [ERROR — Approvals file not found]`
- The pipeline itself continues (non-fatal to overall pipeline)

**Verification steps:**
1. Ensure no Approvals file exists for the prefix; Interventions Index may be valid
2. Trigger Phase 6 registry write
3. Inspect the process log: verify the ERROR line with the exact text above
4. Confirm `docs/assessments/registry.md` was not created (if first run) or was not modified (if existing)
5. Inspect the Phase 6 summary output: verify the `[ERROR — Approvals file not found]` status on the Registry line

---

### Scenario 2.6 — Case sensitivity: lowercase "yes" is not a valid Flagged value

**Given** an Approvals file where some rows use lowercase `yes` instead of `Yes`:

```markdown
## Interventions Flagged for Feature Delivery

| Intervention | Flagged | Date | Notes |
|---|---|---|---|
| INT-001 — sql-injection-hardening | Yes | 2026-07-17 | — |
| INT-002 — god-class-decomposition | yes | 2026-07-17 | — |
| INT-003 — di-refactoring | YES | 2026-07-17 | — |
```

**When** the extraction algorithm counts rows with `Flagged = "Yes"` (case-sensitive match).

**Then:**
- `flagged_count = 1` (only INT-001 matches the exact string `Yes`)
- `yes` and `YES` are not counted — they are not valid per the data contract
- No ERROR is raised for unrecognised values; they are simply not counted
- The registry row will have `Flagged = 1`

**Verification steps:**
1. Provide the fixture above
2. Trigger Phase 6 registry write
3. Inspect the registry row: verify the Flagged column shows `1`
4. Confirm only the exact string `Yes` (capital Y, lowercase es) was matched

---

### Scenario 2.7 — Missing required section heading

**Given** an Approvals file that exists but does not contain the `## Interventions Flagged for Feature Delivery` section:

```markdown
# Findings Acknowledgement — ASSESS-007

## Assessment Reviewed

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| ASSESS-007-Interventions-Index.md | Acknowledged | 2026-07-17 | — |
```

**When** Phase 6 attempts to locate the required section.

**Then:**
- An ERROR is logged: `[timestamp] ERROR: ASSESS-007-Approvals.md missing required section 'Interventions Flagged for Feature Delivery'; cannot extract flagged count`
- The registry write is **halted**
- The registry file is not created or modified
- The Phase 6 summary shows the error status on the Registry line

**Verification steps:**
1. Provide the fixture above (no flagged section)
2. Trigger Phase 6 registry write
3. Inspect the process log: verify the ERROR references the missing section by its exact heading
4. Confirm the registry was not written

---

### Scenario 2.8 — Flagged column absent from table header

**Given** an Approvals file with the required section but the table uses a different column name:

```markdown
## Interventions Flagged for Feature Delivery

| Intervention | Selected | Date | Notes |
|---|---|---|---|
| INT-001 — sql-injection-hardening | Yes | 2026-07-17 | — |
```

Note: Column is named `Selected` instead of `Flagged`.

**When** the extraction algorithm looks for the `Flagged` column (exact, case-sensitive).

**Then:**
- An ERROR is logged: `[timestamp] ERROR: ASSESS-008-Approvals.md missing Flagged column; cannot extract flagged count`
- The registry write is **halted**
- The registry file is not created or modified

**Verification steps:**
1. Provide the fixture above
2. Trigger Phase 6 registry write
3. Inspect the process log: verify the ERROR referencing the missing `Flagged` column
4. Confirm the registry was not written

---

### Scenario 2.9 — Malformed table body: section present but table body is unparseable

**Given** an Approvals file that has the required section heading and table header, but the table body rows are structurally malformed (e.g., missing pipe delimiters, mixed column counts, or binary garbage in the table body):

```markdown
## Interventions Flagged for Feature Delivery

| Intervention | Flagged | Date | Notes |
|---|---|---|---|
INT-001 — sql-injection-hardening Yes 2026-07-17
| INT-002 | Yes | 2026-07-17
```

**When** the extraction algorithm attempts to parse the table body.

**Then:**
- An ERROR is logged: `[timestamp] ERROR: {PREFIX}-Approvals.md malformed; cannot extract flagged count`
- The registry write is **halted** — no registry file is created or modified
- The Phase 6 summary reports: `Registry: docs/assessments/registry.md [ERROR — Approvals file contract violation; see process log]`
- The pipeline itself continues (non-fatal to overall pipeline)

**Verification steps:**
1. Provide the fixture above as `{PREFIX}-Approvals.md`
2. Trigger Phase 6 registry write
3. Inspect the process log: verify the ERROR references the malformed file
4. Confirm the registry was not written (neither created nor modified)
5. Confirm the pipeline continues past the failure

---

## §3 — US-01-T09: Registry Row Construction

**Type:** Unit  
**Implementation step:** Phase 6, Step 4 — build registry row

### Scenario 3.1 — Date format is YYYY-MM-DD

**Given** the system date is 2026-07-17 and valid severity and flagged counts have been extracted:
- `critical_count = 2`, `high_count = 4`, `medium_count = 5`, `low_count = 1`, `total_count = 12`, `flagged_count = 3`, `PREFIX = ASSESS-001`

**When** the row is constructed.

**Then** the date field is formatted as `2026-07-17` (ISO 8601, zero-padded month and day, no time component).

**Verification steps:**
1. Trigger Phase 6 on 2026-07-17
2. Inspect the registry row: verify the first column is `2026-07-17`
3. Verify there is no time component, no slash separators, no day-first ordering

---

### Scenario 3.2 — Prefix link uses relative Markdown link format

**Given** `PREFIX = ASSESS-001`.

**When** the row is constructed.

**Then** the Prefix column value is `[ASSESS-001](ASSESS-001/)` — a relative Markdown link with a trailing slash on the path, no absolute URL, no extra spaces.

**Verification steps:**
1. Inspect the raw Markdown of the registry file
2. Verify the second column contains exactly `[ASSESS-001](ASSESS-001/)`
3. Verify the link text matches the prefix
4. Verify the link target is `{PREFIX}/` (relative, trailing slash)

---

### Scenario 3.3 — Column order and pipe delimiters

**Given** any valid set of extracted counts.

**When** the row is constructed.

**Then** the row conforms to this exact structure:
```
| {YYYY-MM-DD} | [{PREFIX}]({PREFIX}/) | {total} | {critical} | {high} | {medium} | {low} | {flagged} |
```

Specifically:
- The row starts and ends with `|`
- There are exactly eight data fields separated by `|`
- Column order is: Date, Prefix, Total, CRITICAL, HIGH, MEDIUM, LOW, Flagged
- Total appears before the individual severity columns
- Numeric values are plain integers with no decimal places and no trailing spaces inside the cell

**Verification steps:**
1. Trigger Phase 6 with known counts (e.g., 2 CRITICAL, 4 HIGH, 5 MEDIUM, 1 LOW, 3 flagged)
2. Count the `|` characters in the written row: expect 9 (one leading + one per column + one trailing)
3. Split by `|` and verify each field is in the correct position
4. Verify the Total column value equals the sum of the four severity counts

---

### Scenario 3.4 — Total equals arithmetic sum of severity counts

**Given** `critical_count = 2`, `high_count = 4`, `medium_count = 5`, `low_count = 1`.

**When** `total_count` is computed.

**Then** `total_count = 2 + 4 + 5 + 1 = 12`. The Total column in the row reflects this computed value, not a separately sourced number.

**Verification steps:**
1. Provide an Interventions Index with 2 CRITICAL, 4 HIGH, 5 MEDIUM, 1 LOW rows
2. Trigger Phase 6 registry write
3. Inspect the registry row: verify `Total = 12`
4. Verify Total is the sum of the four individual severity columns in that same row

---

### Scenario 3.5 — All-zero counts produce valid row structure

**Given** all counts are 0: `critical_count = high_count = medium_count = low_count = total_count = flagged_count = 0`.

**When** the row is constructed.

**Then** the row is:
```
| {YYYY-MM-DD} | [ASSESS-001](ASSESS-001/) | 0 | 0 | 0 | 0 | 0 | 0 |
```

The row structure is identical to any other row. The values are `0` (integer zero), not empty strings, not dashes, not blank cells.

**Verification steps:**
1. Trigger Phase 6 with empty Interventions Index and empty flagged table
2. Inspect the written row: verify eight columns with `0` values for all numeric fields
3. Verify the row passes Markdown table structure validation (parseable as a valid table row)

---

## §4 — US-01-T10: File Creation with Header and Row

**Type:** Unit  
**Implementation step:** Phase 6, Step 6 — create registry on first run

### Scenario 4.1 — Registry file is created at the correct path

**Given** `docs/assessments/registry.md` does not exist.

**When** Phase 6 creates the registry file.

**Then** the file is created at exactly `docs/assessments/registry.md` (relative to the project root). No other path is used. The Phase 6 summary emits `Registry: docs/assessments/registry.md [created]`.

**Verification steps:**
1. Confirm `docs/assessments/registry.md` does not exist before the run
2. Complete Phase 6
3. Verify `docs/assessments/registry.md` now exists
4. Verify no other registry file was created at a different path
5. Inspect the Phase 6 summary: verify the Registry line reads `Registry: docs/assessments/registry.md [created]`

---

### Scenario 4.2 — Created file contains the title heading

**Given** the file is being created for the first time.

**When** the file is written.

**Then** the first line of the file is `# Assessment Registry`.

**Verification steps:**
1. Open `docs/assessments/registry.md` after creation
2. Verify line 1 is exactly `# Assessment Registry` (no leading spaces, no trailing characters)

---

### Scenario 4.3 — Created file contains the header row before the data row

**Given** the file is being created for the first time.

**When** the file is written.

**Then** the table header row `| Date | Prefix | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged |` and separator row `|------|--------|-------|----------|------|--------|-----|---------|` appear before any data row.

**Verification steps:**
1. Open `docs/assessments/registry.md` after creation
2. Locate the table header: verify it appears before the data row
3. Verify the separator row is present directly below the header row
4. Verify column names in the header match exactly: `Date`, `Prefix`, `Total`, `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `Flagged`

---

### Scenario 4.4 — Created file contains exactly one data row

**Given** this is the first registry creation.

**When** the file is written.

**Then** the file contains exactly one data row beneath the header and separator rows. No extra rows, no blank data rows.

**Verification steps:**
1. Open the file and count data rows (rows that are not the title, header, or separator)
2. Verify exactly one data row is present
3. Verify the data row matches the fixture built from the current run's counts

---

### Scenario 4.5 — File content is valid Markdown

**Given** any valid set of inputs.

**When** the file is written.

**Then** the file content is valid Markdown with no malformed table syntax, no broken pipe delimiters, no unescaped special characters in the data rows.

**Verification steps:**
1. Open `docs/assessments/registry.md` in a Markdown viewer (GitHub preview or VSCode)
2. Verify the table renders without errors
3. Verify no raw pipe characters appear outside of the table structure

---

### Scenario 4.6 — Write is atomic: no partial file on failure

**Given** a simulated I/O failure occurring mid-write (e.g., disk full or permission denied).

**When** the write is interrupted.

**Then** the file is either fully written (complete content including header and data row) or absent. No partial file with truncated content or a broken table is left on disk. An ERROR is logged.

**Verification steps:**
1. Simulate a write failure by temporarily making `docs/assessments/` read-only
2. Trigger Phase 6 registry write
3. Verify either: the file does not exist, or it contains the complete expected content
4. Verify the ERROR is logged with timestamp and path
5. Verify the pipeline continues past the failed write (non-fatal to pipeline)

---

### Scenario 4.7 — Write verification: file is read back after creation

**Given** the file has been written.

**When** the verification step runs (reading the file back to confirm it is non-empty and exists).

**Then** the verification succeeds silently for a successful write. If the read-back fails (e.g., file disappeared), an ERROR is logged: `[timestamp] ERROR: Registry write failed — file not readable after creation: docs/assessments/registry.md`.

**Verification steps:**
1. Complete a successful Phase 6 run
2. Inspect the process log: verify no read-back ERROR line is present
3. To test the error path: simulate a race condition by deleting the file between write and verify (if tooling permits) and confirm the ERROR line is logged

---

### Scenario 4.8 — Registry existence check fails: no write attempted

**Given** `docs/assessments/` exists on disk but the filesystem raises a permission-denied error when Phase 6 attempts to check whether `docs/assessments/registry.md` exists (Step 5).

**When** the existence check fails.

**Then:**
- An ERROR is logged: `[timestamp] ERROR: Phase 6 — registry existence check failed: {error message}` (where `{error message}` is the underlying OS error string, e.g., `Permission denied`)
- No write to the registry file is attempted — neither creation nor append
- The Phase 6 summary reports an error status on the Registry line
- The pipeline continues past this failure (non-fatal)

**Verification steps:**
1. Simulate a permission-denied condition on `docs/assessments/` (e.g., remove read/execute permission on the directory)
2. Trigger Phase 6 with valid Approvals and Interventions Index fixtures
3. Inspect the process log: verify the ERROR line begins with `ERROR: Phase 6 — registry existence check failed:` and includes the OS error message
4. Confirm neither `docs/assessments/registry.md` nor any partial file was created or modified
5. Confirm the Phase 6 summary reports an error on the Registry line
6. Confirm the pipeline does not halt

---

## §5 — US-02-T06: Append Row to Existing Registry

**Type:** Unit  
**Implementation step:** Phase 6, Step 7 — append row on subsequent runs

### Scenario 5.1 — New row is added at the bottom with one existing row

**Given** `docs/assessments/registry.md` already exists with this content:

```markdown
# Assessment Registry

| Date | Prefix | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged |
|------|--------|-------|----------|------|--------|-----|---------|
| 2026-01-15 | [ASSESS-001](ASSESS-001/) | 12 | 2 | 4 | 5 | 1 | 3 |
```

**When** Phase 6 appends a new row for `ASSESS-002` with counts `9 | 1 | 3 | 4 | 1 | 2`.

**Then** the resulting file is:

```markdown
# Assessment Registry

| Date | Prefix | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged |
|------|--------|-------|----------|------|--------|-----|---------|
| 2026-01-15 | [ASSESS-001](ASSESS-001/) | 12 | 2 | 4 | 5 | 1 | 3 |
| 2026-04-20 | [ASSESS-002](ASSESS-002/) | 9 | 1 | 3 | 4 | 1 | 2 |
```

The ASSESS-001 row is byte-for-byte unchanged. The ASSESS-002 row appears on the line immediately following.

**Verification steps:**
1. Create the initial fixture file
2. Trigger Phase 6 for ASSESS-002
3. Read back the file and confirm two data rows are present
4. Confirm the ASSESS-001 row is unchanged (compare character-by-character)
5. Confirm the new row is last

---

### Scenario 5.2 — New row is added at the bottom with two existing rows

**Given** a registry with two data rows (ASSESS-001 and ASSESS-002).

**When** Phase 6 appends a row for ASSESS-003.

**Then** the file contains three data rows. The first two rows are unchanged. ASSESS-003 is the last row.

**Verification steps:**
1. Create the fixture with two data rows
2. Trigger Phase 6 for ASSESS-003
3. Confirm three data rows are present
4. Confirm the first two rows are unchanged
5. Confirm ASSESS-003 is the third and last data row

---

### Scenario 5.3 — New row is added at the bottom with 1000 existing rows

**Given** a registry with 1000 data rows (ASSESS-001 through ASSESS-1000).

**When** Phase 6 appends a row for ASSESS-1001.

**Then** the file contains 1001 data rows. All existing 1000 rows are unchanged. ASSESS-1001 is the last row.

**Fixture construction:** Generate 1000 rows programmatically following the row format, varying only the prefix and date.

**Verification steps:**
1. Create the fixture with 1000 data rows
2. Trigger Phase 6 for ASSESS-1001
3. Count the data rows in the resulting file: expect 1001
4. Spot-check rows 1, 500, and 1000 are unchanged
5. Confirm ASSESS-1001 is the 1001st and last data row
6. Measure approximate write time: the operation must complete in under 100ms for a 1000-row file

---

### Scenario 5.4 — Header row is unchanged after append

**Given** a registry with one or more existing rows.

**When** Phase 6 appends a new row.

**Then** the title line `# Assessment Registry`, the header row `| Date | Prefix | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged |`, and the separator row `|------|--------|-------|----------|------|--------|-----|---------|` are all unchanged.

**Verification steps:**
1. Record the exact content of the first three lines before the append
2. Trigger Phase 6
3. Compare the first three lines after append: must be byte-for-byte identical

---

### Scenario 5.5 — Trailing whitespace is stripped before appending

**Given** a registry file whose last line has trailing whitespace or blank lines at the end of the file.

**When** Phase 6 appends a new row.

**Then** the trailing whitespace/blank lines from the existing content are stripped before the new row is appended. The new row is separated from the previous row by exactly one newline. The file ends with exactly one trailing newline after the new row.

**Verification steps:**
1. Create a registry file with two trailing blank lines after the last data row
2. Trigger Phase 6 append
3. Open the raw file and verify: no blank lines between the last existing row and the new row; exactly one newline at end of file

---

### Scenario 5.6 — Append is atomic: existing file unchanged on failure

**Given** a registry with one existing row and a simulated I/O failure during the append write.

**When** the write is interrupted.

**Then** the original file content is preserved exactly — the existing row is not lost or corrupted. The failed write is logged as an ERROR. The pipeline continues.

**Verification steps:**
1. Create the fixture and note its exact content
2. Simulate a write failure (temporarily make the file read-only)
3. Trigger Phase 6 append
4. Read the file back: verify the original row is still present and unchanged
5. Verify the ERROR is logged with timestamp and path

---

### Scenario 5.7 — Process log records append with row position

**Given** a registry with two existing rows.

**When** Phase 6 appends a third row successfully.

**Then** the process log contains:
```
[timestamp] Phase 6: appended row to registry.md
  Location: docs/assessments/registry.md
  Row: | {date} | [{PREFIX}]({PREFIX}/) | {total} | {critical} | {high} | {medium} | {low} | {flagged} |
```

And the Phase 6 summary line reads: `Registry: docs/assessments/registry.md [updated — row 3 appended]`.

**Verification steps:**
1. Trigger Phase 6 with a two-row registry
2. Inspect the process log for the append entry with the correct row content
3. Inspect the Phase 6 summary: verify "row 3 appended" (data rows only; title, header, separator are not counted)

---

## §6 — US-03-T02: Skip Registry Write When Approvals Missing

**Type:** Unit  
**Implementation step:** Phase 6, Step 1 — prerequisite check

### Scenario 6.1a — Approvals file does not exist: registry not created

**Given** the pipeline has completed Phase 4 but `{PREFIX}-Approvals.md` was never written (pipeline aborted before the Findings Gate).

**When** Phase 6 begins and runs the prerequisite check (Step 1) — the file-absent branch.

**Then:**
- An ERROR is logged: `[timestamp] ERROR: Cannot write registry — {PREFIX}-Approvals.md not found. Ensure the Findings Gate completed successfully.`
- No registry file is created (if this is a first run)
- The Phase 6 summary reports: `Registry: docs/assessments/registry.md [ERROR — Approvals file not found]`
- The pipeline continues past this failure (non-fatal)

**Verification steps:**
1. Ensure `docs/assessments/ASSESS-001/ASSESS-001-Approvals.md` does not exist
2. Ensure `docs/assessments/registry.md` does not exist
3. Trigger Phase 6
4. Confirm `docs/assessments/registry.md` was NOT created
5. Inspect the process log: verify the ERROR line with the exact text above
6. Inspect the Phase 6 summary: verify `[ERROR — Approvals file not found]` on the Registry line

---

### Scenario 6.1b — Approvals file present but missing required section: registry not created

**Given** `{PREFIX}-Approvals.md` exists on disk but does not contain the `## Interventions Flagged for Feature Delivery` section (e.g., the file was created manually or truncated).

**When** Phase 6 begins and runs the prerequisite check (Step 1) — the missing-section branch.

**Then:**
- An error is logged: `[timestamp] Phase 6: registry write skipped — {PREFIX}-Approvals.md missing required section 'Interventions Flagged for Feature Delivery'`
- No registry file is created (if this is a first run)
- The Phase 6 summary reports: `Registry: docs/assessments/registry.md [ERROR — Approvals file missing required section]`
- The pipeline continues past this failure (non-fatal)

**Verification steps:**
1. Create `docs/assessments/ASSESS-001/ASSESS-001-Approvals.md` with content that omits the `## Interventions Flagged for Feature Delivery` heading
2. Ensure `docs/assessments/registry.md` does not exist
3. Trigger Phase 6
4. Confirm `docs/assessments/registry.md` was NOT created
5. Inspect the process log: verify the error line with the exact text above
6. Inspect the Phase 6 summary: verify `[ERROR — Approvals file missing required section]` on the Registry line

---

### Scenario 6.2 — Approvals file does not exist: existing registry not modified

**Given** the pipeline has an existing registry with two rows and `{PREFIX}-Approvals.md` was not written for the current run.

**When** Phase 6 begins and runs the prerequisite check.

**Then:**
- The registry file is not modified — the existing two rows are preserved exactly
- The error is logged and the summary reports the skip

**Verification steps:**
1. Create a registry with two existing rows and note their content
2. Ensure no Approvals file exists for the current run prefix
3. Trigger Phase 6
4. Read the registry file: verify it still contains exactly the original two rows, unchanged
5. Verify no third row was appended

---

### Scenario 6.3 — Pipeline aborted before Findings Gate: registry not touched

**Given** the user cancels the pipeline during Phase 3 (assessment execution), before Phase 5 (Findings Gate) is ever reached.

**When** the pipeline terminates.

**Then** no Phase 6 registry write code is ever invoked. The registry file state is identical to its state before the run — either absent (if first run) or containing only previous rows.

**Verification steps:**
1. Simulate an early pipeline abort (cancel before Phase 5)
2. Confirm `docs/assessments/registry.md` was not created or modified
3. Confirm no partial registry entries were written

---

### Scenario 6.4 — Pipeline aborted after gate but before Approvals file written: registry not touched

**Given** the user completes the gate interaction but the Approvals file write fails (e.g., I/O error during Phase 5 file write), so `{PREFIX}-Approvals.md` does not exist.

**When** Phase 6 runs the prerequisite check.

**Then** the prerequisite check detects the missing file and halts the registry write, just as in Scenario 6.1.

**Verification steps:**
1. Ensure `{PREFIX}-Approvals.md` does not exist (simulate write failure)
2. Trigger Phase 6
3. Confirm registry is not created or modified
4. Confirm error is logged

---

## §7 — US-04-T01: Registry Row with Zero Findings

**Type:** Unit / Integration  
**Implementation step:** Phase 6, Steps 2–7 (all steps, with zero-finding inputs)

### Scenario 7.1 — Empty Interventions Index produces zero severity row

**Given:**
- Interventions Index file exists but contains no data rows:

```markdown
# Interventions Index — ASSESS-010

| ID | Title | Area | Criticality | Depends on | Suggested Agent |
|---|---|---|---|---|---|
```

- Approvals file exists with valid structure but empty flagged table:

```markdown
## Interventions Flagged for Feature Delivery

| Intervention | Flagged | Date | Notes |
|---|---|---|---|
```

**When** Phase 6 runs.

**Then** a registry row is written (or appended) with:
- `Total = 0`
- `CRITICAL = 0`
- `HIGH = 0`
- `MEDIUM = 0`
- `LOW = 0`
- `Flagged = 0`

The row is structurally identical to any other valid registry row. No special marker, note, or placeholder is used for zero values — the values are the integer `0`.

**Verification steps:**
1. Provide the fixtures above
2. Trigger Phase 6 registry write
3. Inspect the registry row: verify `| {date} | [ASSESS-010](ASSESS-010/) | 0 | 0 | 0 | 0 | 0 | 0 |`
4. Verify the row is present in the file (not skipped because counts are zero)

---

### Scenario 7.2 — Zero-finding row is indistinguishable in structure from non-zero row

**Given** a registry that already has a row with non-zero counts (ASSESS-001: 12 findings).

**When** a zero-finding row (ASSESS-002) is appended.

**Then** both rows are present. The ASSESS-002 row uses the same column format as the ASSESS-001 row — just with different values. The file parses as a valid two-row registry.

**Expected file state:**
```markdown
# Assessment Registry

| Date | Prefix | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged |
|------|--------|-------|----------|------|--------|-----|---------|
| 2026-01-15 | [ASSESS-001](ASSESS-001/) | 12 | 2 | 4 | 5 | 1 | 3 |
| 2026-04-20 | [ASSESS-002](ASSESS-002/) | 0 | 0 | 0 | 0 | 0 | 0 |
```

**Verification steps:**
1. Create the fixture with one non-zero row
2. Trigger Phase 6 for ASSESS-002 with zero-finding inputs
3. Read back the registry and confirm both rows are present
4. Confirm ASSESS-001 row is unchanged
5. Confirm ASSESS-002 row has all zeros

---

## §8 — US-05-T01: Duplicate Prefix Produces Two Rows

**Type:** Integration  
**Implementation step:** Phase 6, Step 7 — append (no deduplication logic)

### Scenario 8.1 — Same prefix run twice: both rows appear

**Given:**
- First run for `ASSESS-001` has been completed: registry contains one row for ASSESS-001 with counts `12 | 2 | 4 | 5 | 1 | 3`.
- The same prefix `ASSESS-001` is run again with `--force`, producing different counts: `7 | 0 | 2 | 4 | 1 | 1`.

**When** Phase 6 appends the second row.

**Then:**
- The registry contains exactly two rows, both with prefix `ASSESS-001`
- No deduplication occurs — the second row is appended without inspecting existing prefixes
- Row 1 reflects the first run's counts: `12 | 2 | 4 | 5 | 1 | 3`
- Row 2 reflects the second run's counts: `7 | 0 | 2 | 4 | 1 | 1`

**Expected file state (date values are illustrative):**
```markdown
# Assessment Registry

| Date | Prefix | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged |
|------|--------|-------|----------|------|--------|-----|---------|
| 2026-07-17 | [ASSESS-001](ASSESS-001/) | 12 | 2 | 4 | 5 | 1 | 3 |
| 2026-07-17 | [ASSESS-001](ASSESS-001/) | 7 | 0 | 2 | 4 | 1 | 1 |
```

**Verification steps:**
1. Complete first run for ASSESS-001; verify registry has one row
2. Complete second run for ASSESS-001 with `--force` and different input fixtures
3. Read back the registry: confirm two rows are present
4. Confirm both rows have `ASSESS-001` as the prefix
5. Confirm row 1 counts have not changed (original run's data is preserved)
6. Confirm row 2 reflects the second run's findings

---

### Scenario 8.2 — No deduplication logic is invoked

**Given** the same prefix appears twice in the registry.

**When** a third run for the same prefix is appended.

**Then** the registry has three rows with the same prefix. No error, warning, or deduplication is triggered. The append operation proceeds identically regardless of existing prefix values.

**Verification steps:**
1. Trigger a third run for the same prefix
2. Confirm three rows exist for that prefix
3. Confirm no WARNING or INFO log mentioning "duplicate" or "existing prefix" was emitted

---

### Scenario 8.3 — Duplicate rows with different dates reflect different runs

**Given** the same prefix is run on two different dates.

**When** both rows are in the registry.

**Then** each row's `Date` column reflects the actual system date of that run. The rows are distinguishable by date even though the prefix is the same.

**Verification steps:**
1. Complete first run on date A
2. Complete second run (same prefix, `--force`) on date B (different date)
3. Confirm the two rows have different values in the Date column
4. Confirm the severity counts reflect each respective run's findings

---

## §9 — US-06-T01: Markdown Table Readability

**Type:** Manual  
**Prerequisites:** A registry file has been created by a completed Phase 6 run

### Scenario 9.1 — Table renders correctly in GitHub web UI

**Given** `docs/assessments/registry.md` has been committed and pushed to a GitHub repository.

**When** a reviewer opens the file in the GitHub web UI.

**Then:**
- The Markdown table renders as a formatted HTML table, not as raw text
- Column headers (Date, Prefix, Total, CRITICAL, HIGH, MEDIUM, LOW, Flagged) are visible in bold
- Each data row occupies a distinct row in the rendered table
- Numbers are right-aligned or left-aligned consistently — no wrapping or truncation
- No raw pipe characters, no backslash artifacts, no broken rows

**Verification steps:**
1. Push the registry file to a GitHub branch
2. Navigate to the file in GitHub's web UI
3. Visually confirm the table renders as a proper Markdown table
4. Confirm all 8 columns are visible
5. Confirm date values are readable (YYYY-MM-DD format)
6. Confirm all counts are visible as integers

---

### Scenario 9.2 — Table renders correctly in VSCode Markdown preview

**Given** `docs/assessments/registry.md` exists locally.

**When** a developer opens the file in VSCode and activates the Markdown preview pane (Ctrl+Shift+V or the preview button).

**Then** the table renders identically to the expected format, with no raw Markdown syntax visible.

**Verification steps:**
1. Open the file in VSCode
2. Open the Markdown Preview pane
3. Confirm the table is rendered (not shown as raw text)
4. Confirm all columns and rows are visible and correctly aligned

---

### Scenario 9.3 — No special characters or encoding issues

**Given** the registry was created on a Windows machine (CRLF line endings possible) and opened on a Linux/Mac machine.

**When** the file is opened in any Markdown viewer.

**Then** no garbled characters (`^M`, `?`, or Unicode replacement characters) appear in the rendered output.

**Verification steps:**
1. Create the registry on the current platform (Windows)
2. Open the file in a Markdown viewer on the same or a different platform
3. Confirm no line-ending artifacts appear in the table cells or header
4. Confirm no BOM or non-ASCII characters are present unless intentional

---

## §10 — US-06-T02: Prefix Links Are Clickable

**Type:** Manual  
**Prerequisites:** A registry file exists with at least one data row; the corresponding assessment folder exists on disk

### Scenario 10.1 — Prefix link resolves to the correct subfolder in GitHub

**Given** the registry contains `[ASSESS-001](ASSESS-001/)` and the folder `docs/assessments/ASSESS-001/` exists in the repository.

**When** a reviewer clicks the `ASSESS-001` link in the GitHub web UI.

**Then** the browser navigates to `docs/assessments/ASSESS-001/` — the GitHub file browser view of that folder. The correct assessment run files are visible.

**Verification steps:**
1. Push both the registry file and the `ASSESS-001/` folder to GitHub
2. Open the registry in GitHub web UI
3. Click the `ASSESS-001` link in the Prefix column
4. Confirm the URL changes to the `ASSESS-001/` folder path
5. Confirm the folder's contents (assessment files) are listed

---

### Scenario 10.2 — Link is relative and works without knowing the absolute repository path

**Given** the registry uses a relative link `[ASSESS-001](ASSESS-001/)` (not an absolute URL like `https://github.com/org/repo/blob/main/docs/assessments/ASSESS-001/`).

**When** the repository is cloned to any local path or accessed from any host.

**Then** the link resolves correctly from the location of `registry.md` — i.e., `docs/assessments/ASSESS-001/` relative to `docs/assessments/`.

**Verification steps:**
1. Clone the repository to a new local path
2. Open the registry in a Markdown-aware tool (GitHub, GitLab, or IDE)
3. Click the prefix link
4. Confirm it resolves to the correct folder without any "not found" or 404 error
5. Verify the link does not contain any hardcoded hostname or absolute file path

---

### Scenario 10.3 — Multiple rows each have distinct, working links

**Given** the registry contains three rows with prefixes ASSESS-001, ASSESS-002, ASSESS-003 and corresponding folders exist.

**When** a reviewer clicks each prefix link in turn.

**Then** each link independently navigates to its own correct subfolder. No link points to the wrong folder.

**Verification steps:**
1. Click the ASSESS-001 link; confirm it opens `docs/assessments/ASSESS-001/`
2. Navigate back; click the ASSESS-002 link; confirm it opens `docs/assessments/ASSESS-002/`
3. Navigate back; click the ASSESS-003 link; confirm it opens `docs/assessments/ASSESS-003/`

---

## §11 — US-06-T03: Chronological Ordering

**Type:** Unit / Manual  
**Implementation step:** Phase 6, Step 7 — append without sorting

### Scenario 11.1 — Rows appear in append order: oldest at top, newest at bottom

**Given** three assessment runs completed in this order: ASSESS-001 on 2026-01-15, ASSESS-002 on 2026-04-20, ASSESS-003 on 2026-07-14.

**When** all three rows have been appended sequentially.

**Then** the registry rows appear in the order they were appended:
- Row 1: ASSESS-001 (2026-01-15)
- Row 2: ASSESS-002 (2026-04-20)
- Row 3: ASSESS-003 (2026-07-14)

The oldest run is at the top; the newest is at the bottom. This is a natural consequence of append-only writes.

**Verification steps:**
1. Run ASSESS-001, ASSESS-002, ASSESS-003 in order
2. Open the registry and verify the rows appear in the sequence above
3. Confirm the Date column values are ascending from top to bottom (as a result of running in date order)

---

### Scenario 11.2 — Non-chronological date runs: append order preserved, not sorted

**Given** the registry contains ASSESS-001 (2026-07-17) and ASSESS-002 (2026-04-20) in that order — ASSESS-001 has a later date but was appended first (e.g., run with `--force` after ASSESS-002 was already in the registry).

**When** ASSESS-003 (2026-07-18) is appended.

**Then** the row order is:
- Row 1: ASSESS-001 (2026-07-17) — appended first
- Row 2: ASSESS-002 (2026-04-20) — appended second
- Row 3: ASSESS-003 (2026-07-18) — appended third

The rows are NOT sorted by date. The registry preserves append order exactly. No reordering, no sorting, no insertion into the middle of the file.

**Verification steps:**
1. Create the fixture with ASSESS-001 (2026-07-17) as the first row and ASSESS-002 (2026-04-20) as the second
2. Trigger Phase 6 for ASSESS-003
3. Read back the file
4. Verify ASSESS-001 is still row 1 (not moved to row 2 because its date is later than ASSESS-002's)
5. Verify ASSESS-003 is the last row

---

### Scenario 11.3 — Duplicate prefix: rows appear in run order, not deduplicated or reordered

**Given** ASSESS-001 was run twice (two rows in registry) with ASSESS-002 run in between:
- Row 1: ASSESS-001 first run (2026-01-15)
- Row 2: ASSESS-002 (2026-04-20)
- Row 3: ASSESS-001 second run (2026-07-17, `--force`)

**When** a human reviewer reads the registry.

**Then** the rows appear in exactly the order they were appended. ASSESS-001 appears twice, in positions 1 and 3, not consolidated or reordered to be adjacent.

**Verification steps:**
1. Build the fixture as described above (three rows in that order)
2. Trigger a fourth run (ASSESS-003)
3. Confirm the new row is appended as row 4 at the bottom
4. Confirm rows 1, 2, and 3 are unchanged and in their original positions
5. Visually confirm in a Markdown viewer that the non-chronological ordering does not cause rendering errors

---

### Scenario 11.4 — Manual test: reviewer can visually identify oldest and newest run

**Given** a registry with at least three rows, each with a different date in the Date column.

**When** a Tech Lead opens the registry in a Markdown viewer.

**Then** the Tech Lead can identify the oldest run by reading the first data row and the newest run by reading the last data row — assuming runs were executed in date order (the normal case). No additional sorting or filtering is needed for the common case.

**Verification steps:**
1. Open the registry in a Markdown viewer
2. Read the first data row and note the date
3. Read the last data row and note the date
4. Confirm the sequence of dates reads as the actual run order (not necessarily ascending if `--force` was used)
5. Confirm no special UI or tooling is needed to read the table — it is readable as plain text

---

## Appendix A — Input Fixture Library

The following reusable fixtures are referenced throughout this spec. They are defined here for easy reproduction during test execution.

### Fixture A1 — Standard Interventions Index (mixed severities)

```markdown
# Interventions Index — ASSESS-NNN

| ID | Title | Area | Criticality | Depends on | Suggested Agent |
|---|---|---|---|---|---|
| INT-001 | SQL injection in query builder | Security | CRITICAL | — | security-hardening |
| INT-002 | God class decomposition | Code Quality | HIGH | INT-003 | god-class-decomposition |
| INT-003 | Layer boundary violations | Architecture | HIGH | — | developer-backend |
| INT-004 | Missing null checks | Code Quality | MEDIUM | — | developer-backend |
| INT-005 | Inconsistent naming | Documentation | MEDIUM | — | developer-backend |
| INT-006 | Dead code removal | Code Quality | MEDIUM | — | developer-backend |
| INT-007 | Comment updates | Documentation | LOW | — | developer-frontend |
```

Expected counts: CRITICAL=1, HIGH=2, MEDIUM=3, LOW=1, Total=7

---

### Fixture A2 — Standard Approvals File (some flagged)

```markdown
# Findings Acknowledgement — ASSESS-NNN

## Assessment Reviewed

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| ASSESS-NNN-Generic-Assessment.md | Acknowledged | 2026-07-17 | — |
| ASSESS-NNN-Interventions-Index.md | Acknowledged | 2026-07-17 | — |

## Interventions Flagged for Feature Delivery

| Intervention | Flagged | Date | Notes |
|---|---|---|---|
| INT-001 — sql-injection-hardening | Yes | 2026-07-17 | — |
| INT-002 — god-class-decomposition | Yes | 2026-07-17 | — |
| INT-003 — layer-boundary-violations | Yes | 2026-07-17 | — |
| INT-004 — missing-null-checks | No | 2026-07-17 | Not selected |
| INT-005 — inconsistent-naming | No | 2026-07-17 | Not selected |
| INT-006 — dead-code-removal | No | 2026-07-17 | Not selected |
| INT-007 — comment-updates | No | 2026-07-17 | Not selected |
```

Expected flagged_count: 3

---

### Fixture A3 — Standard Registry File (two rows)

```markdown
# Assessment Registry

| Date | Prefix | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged |
|------|--------|-------|----------|------|--------|-----|---------|
| 2026-01-15 | [ASSESS-001](ASSESS-001/) | 12 | 2 | 4 | 5 | 1 | 3 |
| 2026-04-20 | [ASSESS-002](ASSESS-002/) | 9 | 1 | 3 | 4 | 1 | 2 |
```

---

### Fixture A4 — Empty Interventions Index

```markdown
# Interventions Index — ASSESS-NNN

| ID | Title | Area | Criticality | Depends on | Suggested Agent |
|---|---|---|---|---|---|
```

Expected counts: all zero.

---

### Fixture A5 — Empty Approvals Flagged Table

```markdown
# Findings Acknowledgement — ASSESS-NNN

## Assessment Reviewed

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| ASSESS-NNN-Interventions-Index.md | Acknowledged | 2026-07-17 | — |

## Interventions Flagged for Feature Delivery

| Intervention | Flagged | Date | Notes |
|---|---|---|---|
```

Expected flagged_count: 0.

---

## Appendix B — Acceptance Criteria Cross-Reference

| AC | Description | Test Scenarios Covering It |
|----|-------------|---------------------------|
| AC-01 | Registry file created or updated after each completed run | §1 all, §2 all, §4 all, §5 all |
| AC-02 | First run creates registry with header + one row | §4.1–4.5, §7.1 |
| AC-03 | Subsequent runs append without modifying existing rows | §5.1–5.5 |
| AC-04 | Incomplete run (no Approvals) does not modify registry | §6.1a, §6.1b, §6.2–6.4 |
| AC-05 | Zero-finding run still writes a row with all counts = 0 | §7.1–7.2 |
| AC-06 | Duplicate prefix run produces two rows (no deduplication) | §8.1–8.3 |
| AC-07 | Phase 6 summary includes registry confirmation line | §4.1, §5.7, §6.1a, §6.1b |
| AC-08 | Table renders correctly in Markdown viewers | §9.1–9.3 |
| AC-09 | Prefix links are clickable and resolve correctly | §10.1–10.3 |
| AC-10 | Rows appear in append order (oldest first, newest last for normal runs) | §11.1–11.4 |
