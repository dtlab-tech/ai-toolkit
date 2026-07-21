---
description: "Next Intervention — finds the next un-actioned flagged intervention from an assessment run and suggests the /define-feature invocation to start on it. Usage: /next-intervention [prefix]"
argument-hint: "[assessment-prefix]"
allowed-tools: Read, Glob, Grep
---

Find the next un-actioned flagged intervention from a completed assessment run.

## Step 1 — Resolve prefix

If `$ARGUMENTS` is empty:
- Glob `docs/assessments/ASSESS-*/` to list available assessment folders.
- Output the list and say: "Please specify a prefix from the list above (e.g. `/next-intervention ASSESS-001`)."
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

Read the file. If it does NOT contain the section heading `## Interventions Flagged for Feature Delivery`:
```
❌ This Approvals file uses a pre-FTR-003 format (missing "Interventions Flagged for Feature Delivery" section).
   This command requires the FTR-003 format produced by assessment-manager Phase 5.
```
STOP.

## Step 4 — Extract flagged interventions

Parse the Markdown table under `## Interventions Flagged for Feature Delivery`.
- Extract all rows where the `Flagged` column value is exactly `Yes` (case-sensitive).
- Preserve document order (top-to-bottom).

If no rows are flagged:
```
ℹ️ No interventions were flagged for feature delivery in this assessment.
```
STOP.

## Step 5 — Check for matching feature folders

Glob both:
- `internal_docs/features/FTR-*/`
- `docs/features/FTR-*/`

For each flagged intervention, determine whether it is "actioned" using this two-step heuristic (attempt slug match first, then body match as fallback):

1. **Slug match:** Does any feature folder name contain the INT-NNN slug from the `Intervention` column (case-insensitive substring)?
   - The `Intervention` column format is `INT-NNN — {slug}` (e.g. `INT-001 — sql-injection-hardening`). The slug is the part after ` — `.
2. **Body match (fallback):** For any folder that did NOT match by slug, read its `feature.md` and check whether the INT-NNN identifier string (e.g. `INT-001`) appears anywhere in the body.

An intervention is "actioned" if either check returns true for at least one feature folder.

Normalise INT-NNN identifiers by stripping leading zeros before comparison (e.g. `INT-001` and `INT-1` are the same).

## Step 6 — Find the first un-actioned intervention

Scan the flagged interventions in document order and find the first one that is NOT actioned.

If all flagged interventions are actioned:
```
✅ All flagged interventions have been actioned. ({N} of {N} flagged)

Actioned interventions:
  • INT-001 — {slug} → {matched-feature-folder}
  • INT-002 — {slug} → {matched-feature-folder}
  ...
```
STOP.

## Step 7 — Output the next un-actioned intervention

Construct the document path:
```
docs/assessments/{PREFIX}/{PREFIX}-{INT-NNN}-{slug}.md
```
(Glob `docs/assessments/{PREFIX}/{PREFIX}-{INT-NNN}-*.md` to find the actual filename if the slug in the path differs from the Approvals column.)

Output:

```
🔖 Next un-actioned intervention: {INT-NNN} — {slug}

   Document path:    docs/assessments/{PREFIX}/{PREFIX}-{INT-NNN}-{slug}.md
   Suggested command: /define-feature docs/assessments/{PREFIX}/{PREFIX}-{INT-NNN}-{slug}.md
```

If some interventions were already actioned, append:
```
Previously actioned ({K} of {N} flagged):
  • INT-001 — {slug} → {matched-feature-folder}
  ...
```
