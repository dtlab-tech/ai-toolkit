---
description: "Check Interventions — full reconciliation view of all interventions from an assessment run: document presence, Approvals/Index consistency, and feature-actioning status. Usage: /check-interventions [prefix]"
argument-hint: "[assessment-prefix]"
allowed-tools: Read, Glob, Grep
---

Produce a full reconciliation table for all interventions from a completed assessment run.

## Step 1 — Resolve prefix

If `$ARGUMENTS` is empty:
- Glob `docs/assessments/ASSESS-*/` to list available assessment folders.
- Output the list and say: "Please specify a prefix from the list above (e.g. `/check-interventions ASSESS-001`)."
- STOP.

Otherwise:
- If the argument is digits-only (e.g. `001`), prepend `ASSESS-` to form `ASSESS-001`.
- Strip any trailing slash.
- Use this as `{PREFIX}` for all subsequent steps.

## Step 2 — Check assessment directory

If `docs/assessments/{PREFIX}/` does not exist:
```
❌ Assessment directory not found: docs/assessments/{PREFIX}/
   Run /assess-codebase to start a new assessment.
```
STOP.

## Step 3 — Read Approvals file

File path: `docs/assessments/{PREFIX}/{PREFIX}-Approvals.md`

If the file does not exist:
```
❌ Approvals file not found: docs/assessments/{PREFIX}/{PREFIX}-Approvals.md
   The assessment pipeline's Findings Gate must complete before this command can run.
```
STOP.

Read the file. If it does NOT contain `## Interventions Flagged for Feature Delivery`:
```
❌ This Approvals file uses a pre-FTR-003 format (missing "Interventions Flagged for Feature Delivery" section).
   This command requires the FTR-003 format produced by assessment-manager Phase 5.
```
STOP.

Parse the Markdown table under `## Interventions Flagged for Feature Delivery`. Extract all rows (both `Yes` and `No`). Record:
- `INT-NNN` identifier (normalise by stripping leading zeros for matching)
- `Flagged` value (`Yes`, `No`, or malformed if any other value)
- Full `Intervention` column value (e.g. `INT-001 — sql-injection-hardening`) to extract the slug

## Step 4 — Read Interventions Index

File path: `docs/assessments/{PREFIX}/{PREFIX}-Interventions-Index.md`

If the file does not exist:
- Set `index_available = false`
- Note: Title, Criticality, and cross-file consistency checks will be skipped or shown as `—`.

If the file exists:
- Set `index_available = true`
- Parse the Markdown table: extract columns `ID`, `Title`, `Criticality` for each row.

## Step 5 — Build unified intervention list

Collect all INT-NNN identifiers from:
1. The Approvals file (all rows)
2. The Interventions Index (all rows, if available)

Union both sets (deduplicated, normalised). This is the full list to reconcile.

## Step 6 — For each intervention, collect data

For each INT-NNN in the unified list:

**a. Doc file status:**
- Glob `docs/assessments/{PREFIX}/{PREFIX}-{INT-NNN}-*.md`
- If one or more files found: `✅ present`
- If no files found: `❌ missing`

**b. In Approvals:**
- `Yes` if INT-NNN is in the Approvals table, `No` otherwise

**c. Flagged value:**
- From Approvals table: `Yes`, `No`, or `⚠️ malformed ({value})` if not exactly `Yes`/`No`
- If INT-NNN not in Approvals: `n/a`

**d. In Interventions Index:**
- `Yes` if INT-NNN is in the Index, `No` otherwise (or `—` if index unavailable)

**e. Title and Criticality:**
- From Interventions Index if available; else `—`

**f. Actioned status (only for interventions where Flagged = Yes):**
- Glob `internal_docs/features/FTR-*/` and `docs/features/FTR-*/`
- For each feature folder, apply the two-step heuristic:
  1. **Slug match:** folder name contains the INT-NNN slug (case-insensitive substring)
  2. **Body match (fallback):** read `feature.md`; body contains the INT-NNN identifier string
- If a match is found: `✅ actioned → {matched-folder}`
- If no match: `⏳ pending`
- If Flagged is not `Yes`: `n/a`

## Step 7 — Render reconciliation table

```
📊 Intervention Reconciliation — {PREFIX}
════════════════════════════════════════════════════════════════

| INT-NNN | Title          | Criticality | Flagged | Doc file    | Actioned         |
|---------|----------------|-------------|---------|-------------|------------------|
| INT-001 | {title}        | CRITICAL    | Yes     | ✅ present  | ✅ actioned → FTR-010-... |
| INT-002 | {title}        | HIGH        | Yes     | ✅ present  | ⏳ pending       |
| INT-003 | {title}        | MEDIUM      | No      | ❌ missing  | n/a              |
| INT-004 | {title}        | LOW         | No      | ✅ present  | n/a              |

Total: {N} interventions | {K} flagged | {A} actioned | {P} pending
```

If `index_available = false`, note above the table:
```
⚠️ Interventions Index not found — Title and Criticality columns not available.
```

## Step 8 — Render inconsistency list

Collect all inconsistencies:

- For each INT-NNN in Approvals that is NOT in the Interventions Index (when index available):
  `INT-NNN: present in Approvals but not in Interventions Index`
- For each INT-NNN in Interventions Index that is NOT in Approvals (when index available):
  `INT-NNN: present in Interventions Index but missing from Approvals`
- For each row in Approvals where `Flagged` is not exactly `Yes` or `No`:
  `INT-NNN: malformed Flagged value '{value}' (expected 'Yes' or 'No')`

If no inconsistencies:
```
────────────────────────────────────────
✅ No inconsistencies found.
════════════════════════════════════════════════════════════════
```

If inconsistencies exist:
```
────────────────────────────────────────
⚠️ Inconsistencies ({N}):
  • INT-NNN: present in Approvals but not in Interventions Index
  • INT-NNN: malformed Flagged value 'Approved' (expected 'Yes' or 'No')
════════════════════════════════════════════════════════════════
```
