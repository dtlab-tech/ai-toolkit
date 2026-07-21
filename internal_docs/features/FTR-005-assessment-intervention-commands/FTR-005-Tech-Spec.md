# Technical Specification — Assessment Intervention Commands

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-005 — Assessment Intervention Commands |
| Version | 1.0 |
| Date | 2026-07-21 |
| Status | Draft |

---

## 1. Overview

Two read-only Claude Code slash commands are added to the toolkit:

- **`/next-intervention [prefix]`** — surfaces the first un-actioned flagged intervention from a completed assessment run, outputting the document path and a ready-to-use `/define-feature` invocation.
- **`/check-interventions [prefix]`** — produces a full reconciliation table that cross-references `{PREFIX}-Approvals.md`, `{PREFIX}-Interventions-Index.md`, and on-disk INT-NNN document files, plus a feature-actioning status for every flagged intervention.

Both commands are implemented as Markdown instruction files under `.claude/commands/`. They follow the exact same pattern as the existing `next-task.md`, `assessment-status.md`, `feature-status.md`, and `check-docs.md` command files already in the repository. No backend, no frontend, no database changes — the deliverables are two instruction files and their tests are the acceptance criteria verified manually.

---

## 2. Architecture

### 2.1 System Context

```
User (Claude Code CLI)
  │
  ├──/next-intervention [prefix]──► .claude/commands/next-intervention.md
  │                                    reads: docs/assessments/{PREFIX}/{PREFIX}-Approvals.md
  │                                    reads: internal_docs/features/**/feature.md
  │                                    reads: docs/features/**/feature.md
  │                                    lists: internal_docs/features/ (glob)
  │                                    lists: docs/features/ (glob)
  │
  └──/check-interventions [prefix]──► .claude/commands/check-interventions.md
                                       reads: docs/assessments/{PREFIX}/{PREFIX}-Approvals.md
                                       reads: docs/assessments/{PREFIX}/{PREFIX}-Interventions-Index.md
                                       checks: docs/assessments/{PREFIX}/{PREFIX}-INT-NNN-*.md (glob)
                                       reads: internal_docs/features/**/feature.md
                                       reads: docs/features/**/feature.md
                                       lists: internal_docs/features/ (glob)
                                       lists: docs/features/ (glob)
```

### 2.2 Component Diagram

```
.claude/commands/next-intervention.md
  └── logic: parse prefix → read Approvals → for each flagged INT → check feature folders → output first un-actioned

.claude/commands/check-interventions.md
  └── logic: parse prefix → read Approvals → read Interventions Index → check INT files → check feature folders → render table + inconsistencies
```

No agent spawning. No subagents. No writes.

### 2.3 Sequence Diagrams

**`/next-intervention ASSESS-001` — main flow:**

```
User → Claude Code: /next-intervention ASSESS-001
Claude Code → File system: read docs/assessments/ASSESS-001/ASSESS-001-Approvals.md
Claude Code → File system: glob internal_docs/features/ + docs/features/
Claude Code → File system: read feature.md for each folder (fallback body match)
Claude Code → User: output INT-NNN path + /define-feature invocation
```

**`/check-interventions ASSESS-001` — main flow:**

```
User → Claude Code: /check-interventions ASSESS-001
Claude Code → File system: read ASSESS-001-Approvals.md
Claude Code → File system: read ASSESS-001-Interventions-Index.md
Claude Code → File system: glob ASSESS-001-INT-*.md (existence check)
Claude Code → File system: glob + feature.md reads (for flagged interventions)
Claude Code → User: reconciliation table + inconsistency list
```

---

## 3. Backend

Not applicable. This feature produces no backend code, API, database changes, or services.

---

## 4. Frontend

Not applicable. This feature produces no UI components, routes, or i18n keys.

---

## 5. External Integrations

None. Both commands are entirely local file-system read operations.

---

## 6. Security Considerations

- **No writes:** Both commands are constrained to `allowed-tools: Read, Glob, Grep` in their frontmatter, which prevents the Claude Code harness from executing any write tool calls.
- **No secret exposure:** Commands read only assessment and feature markdown files; no credentials, tokens, or environment variables are accessed.
- **Path traversal:** Prefix normalisation ensures only well-formed `ASSESS-NNN` paths are constructed; no user-supplied raw string is passed directly to a file path without the `docs/assessments/{PREFIX}/` prefix.

---

## 7. Database Changes

None.

---

## 8. Configuration

No new environment variables, app settings, or feature flags are required.

The two new command files are auto-discovered by Claude Code when placed under `.claude/commands/`. No explicit registration is needed.

---

## 9. File Inventory

### New files

| Path | Purpose |
|------|---------|
| `.claude/commands/next-intervention.md` | Command instruction file for `/next-intervention` |
| `.claude/commands/check-interventions.md` | Command instruction file for `/check-interventions` |

### Modified files

None. No existing files are changed.

---

## 10. Testing Strategy

Both commands are read-only instruction files; there is no compiled code to unit-test. Verification is done manually against the acceptance criteria:

**Manual verification steps:**

1. Create a minimal fixture in `docs/assessments/ASSESS-999-test/`:
   - `ASSESS-999-Approvals.md` with FTR-003 format, 3 flagged interventions
   - `ASSESS-999-Interventions-Index.md` with the same 3 + 1 extra entry
   - `ASSESS-999-INT-001-sql-injection.md` (present), `ASSESS-999-INT-002-god-class.md` (present), `ASSESS-999-INT-003-di-refactor.md` (absent)
   - One matching feature folder for INT-001 (slug match)
2. Run `/next-intervention ASSESS-999` → verify output is INT-002 (INT-001 is actioned), with correct path and `/define-feature` suggestion.
3. Run `/check-interventions ASSESS-999` → verify reconciliation table shows INT-001 (actioned, doc present), INT-002 (pending, doc present), INT-003 (pending, doc missing), and INT-004 (in Index but not in Approvals) in the inconsistency section.
4. Run either command with no prefix → verify `docs/assessments/` is scanned and user is prompted.
5. Run either command with a missing Approvals file → verify appropriate error message.
6. Run either command with an old-format Approvals file → verify format-incompatibility message.
7. Confirm after all runs: no files were created or modified.

---

## 11. Implementation Order

1. Write `.claude/commands/next-intervention.md` — depends on: nothing (reads only existing files)
2. Write `.claude/commands/check-interventions.md` — depends on: nothing (reads only existing files); can be done in parallel with step 1

Both tasks are independent and can be dispatched in parallel.

---

## 12. Detailed Command Specifications

### 12.1 `/next-intervention`

**Frontmatter:**

```markdown
---
description: "Next Intervention — finds the next un-actioned flagged intervention from an assessment run and suggests the /define-feature invocation to start on it. Usage: /next-intervention [prefix]"
argument-hint: "[assessment-prefix]"
allowed-tools: Read, Glob, Grep
---
```

**Logic flow:**

```
Step 1 — Resolve prefix
  IF $ARGUMENTS is empty:
    Glob docs/assessments/ASSESS-*/
    List found folders
    Output: "Please specify a prefix from the list above."
    STOP
  ELSE:
    Normalise: if digits-only (e.g. "001") → prepend "ASSESS-"; strip trailing slash
    prefix = normalised value (e.g. "ASSESS-001")

Step 2 — Check assessment directory
  IF docs/assessments/{prefix}/ does not exist:
    Output: "Assessment directory not found: docs/assessments/{prefix}/
             Run /assess-codebase to start a new assessment."
    STOP

Step 3 — Read Approvals file
  path = docs/assessments/{prefix}/{prefix}-Approvals.md
  IF file does not exist:
    Output: "Approvals file not found: {path}
             The assessment pipeline's Findings Gate must complete before this command can run."
    STOP
  Read file
  IF file does not contain "## Interventions Flagged for Feature Delivery":
    Output: "This Approvals file uses a pre-FTR-003 format (no 'Interventions Flagged for Feature Delivery' section).
             This command requires the FTR-003 format."
    STOP

Step 4 — Extract flagged interventions (in document order)
  Parse the table in "## Interventions Flagged for Feature Delivery"
  flagged = rows where Flagged == "Yes" (case-sensitive)
  IF flagged is empty:
    Output: "No interventions were flagged for feature delivery in this assessment."
    STOP

Step 5 — For each flagged intervention, check for a matching feature folder
  Glob internal_docs/features/FTR-*/
  Glob docs/features/FTR-*/
  all_feature_folders = union of both globs

  For each folder in all_feature_folders:
    slug_match(INT_NNN_slug, folder) = folder_name contains INT_NNN_slug (case-insensitive substring)
    body_match(INT_NNN_id, folder)   = read folder/feature.md; body contains INT_NNN_id string

  actioned(intervention) =
    any folder where slug_match(intervention.slug, folder) = true
    OR any folder where body_match(intervention.id, folder) = true

Step 6 — Find first un-actioned
  first_pending = first intervention in flagged where actioned(intervention) = false
  IF first_pending is None:
    Output: "All flagged interventions have been actioned. ({N} of {N})"
    List each intervention and its matched feature folder
    STOP

Step 7 — Output
  Construct document path:
    doc_path = docs/assessments/{prefix}/{prefix}-{INT_NNN_id}-{INT_NNN_slug}.md
  Output:
    "Next un-actioned intervention: {INT_NNN_id} — {slug}"
    "Document path: {doc_path}"
    "Suggested command: /define-feature {doc_path}"
    IF any interventions were already actioned:
      "Previously actioned ({K} of {N} flagged):"
      List each with its matched feature folder
```

### 12.2 `/check-interventions`

**Frontmatter:**

```markdown
---
description: "Check Interventions — full reconciliation view of all interventions from an assessment run: document presence, Approvals/Index consistency, and feature-actioning status. Usage: /check-interventions [prefix]"
argument-hint: "[assessment-prefix]"
allowed-tools: Read, Glob, Grep
---
```

**Logic flow:**

```
Steps 1–3: Same as /next-intervention (resolve prefix, check directory, read Approvals file).

Step 4 — Read Interventions Index
  index_path = docs/assessments/{prefix}/{prefix}-Interventions-Index.md
  IF file does not exist:
    index_available = false
    Note: checks requiring the index (Title, Criticality, cross-file consistency) will be skipped
  ELSE:
    index_available = true
    Parse table: extract rows with columns ID, Title, Criticality

Step 5 — Build unified intervention list
  from_approvals = all INT-NNN entries in Approvals file (both Flagged=Yes and Flagged=No)
  from_index     = all INT-NNN entries in Interventions Index (if available)
  all_ids        = union of both sets (normalised INT-NNN identifiers)

Step 6 — For each intervention in all_ids:
  a. doc_exists: glob docs/assessments/{prefix}/{prefix}-{INT_NNN_id}-*.md → present / missing
  b. in_approvals: bool — is INT-NNN in Approvals table
  c. flagged: Flagged column value from Approvals (Yes / No / malformed / n/a if not in Approvals)
  d. in_index: bool — is INT-NNN in Interventions Index
  e. title, criticality: from Interventions Index if available; else "—"
  f. actioned: if flagged=Yes → same slug_match/body_match logic as /next-intervention; else "n/a"

Step 7 — Render reconciliation table
  Columns: INT-NNN | Title | Criticality | Flagged | Doc file | Actioned
  Symbols:
    Doc file: "present" (checkmark) / "missing" (cross)
    Actioned: "actioned" / "pending" / "n/a"

Step 8 — Render inconsistency list
  inconsistencies = []
  For each INT-NNN in from_approvals where NOT in from_index:
    inconsistencies += "INT-NNN: present in Approvals but not in Interventions Index"
  For each INT-NNN in from_index where NOT in from_approvals:
    inconsistencies += "INT-NNN: present in Interventions Index but missing from Approvals"
  For each row in Approvals where Flagged not in {Yes, No}:
    inconsistencies += "INT-NNN: malformed Flagged value '{value}' (expected 'Yes' or 'No')"
  IF inconsistencies is empty:
    Output: "No inconsistencies found."
  ELSE:
    Output inconsistency list
```

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Slug/body match heuristic produces false positives (two different assessments' INT-NNN match the same feature folder) | `/next-intervention` would skip interventions that are not truly actioned | Accepted as-is for current scale; document as known limitation; consider `source-intervention:` frontmatter field in a future iteration |
| Approvals file table format varies slightly between assessment runs (e.g. extra columns, different column order) | Parser fails silently or misreads Flagged values | Use case-sensitive string matching on `Flagged` column header; treat any value other than exact `Yes`/`No` as malformed and report it |
| Large number of feature folders slows down body-match (reading many feature.md files) | Noticeable latency for users with 100+ feature folders | Slug match is attempted first; body match is only the fallback; in practice, toolkit-scale deployments will have < 50 features |
| INT-NNN identifier has inconsistent zero-padding between Approvals and Index files | Cross-reference misses a match | Normalise all INT-NNN identifiers by stripping leading zeros before comparison |
