---
description: "Assessment Status — reports presence and state of all assessment artifacts for a given prefix (ASSESS-NNN). Shows what has been produced, what is stale, and what the next step is. Usage: /assessment-status <assessment-prefix>"
---

# Assessment Status Command

Report the state of all assessment artifacts for the given prefix. This is a read-only command — it does not modify files or spawn agents.

## Input

The user provides an assessment prefix, e.g. `ASSESS-001` or just `001`. Normalise to `ASSESS-NNN` format.

If no prefix is provided, scan `docs/assessments/` for all `ASSESS-*` folders and list them, then ask which one to inspect.

## Step 1 — Locate Assessment Directory

Look for `docs/assessments/{PREFIX}/` in the current working directory.

If not found, report:
```
❌ No assessment directory found for {PREFIX}.
   Expected: docs/assessments/{PREFIX}/
   Run /assess-codebase to start a new assessment.
```

## Step 2 — Check Each Artifact

For each expected artifact, report status:

| Symbol | Meaning |
|--------|---------|
| ✅ | File exists and is not stale |
| ⚠️  | File exists but may be stale (check modification date) |
| ❌ | File missing |
| ⏭  | Deliberately skipped (noted in process log) |

### Assessment artifacts

| Artifact | Expected file |
|---|---|
| Generic Assessment | `{PREFIX}-Generic-Assessment.md` |
| Layer Assessment | `{PREFIX}-Layer-Assessment.md` |
| Concurrency Assessment | `{PREFIX}-Concurrency-Assessment.md` |
| [Other specialised assessments] | `{PREFIX}-*-Assessment.md` |
| Interventions Index | `{PREFIX}-Interventions-Index.md` |
| Approval Record | `{PREFIX}-Approvals.md` |
| Issues Register | `{PREFIX}-Issues.md` |
| Process Log | `{PREFIX}-process-log.txt` |

### Intervention documents

Scan for all `{PREFIX}-INT-NNN-*.md` files and report:
- Total count
- Count per criticality (if readable from file frontmatter or heading)
- Which have corresponding approved entries in `{PREFIX}-Approvals.md`

## Step 3 — Determine Current Phase

Based on what exists:

| Condition | Phase |
|---|---|
| No assessment files | Not started |
| Assessment files exist, no Interventions Index | Assessment in progress or incomplete |
| Interventions Index exists, no Approvals | Awaiting Remediation Gate |
| Approvals exist, no remediation commits | Remediation not started |
| Remediation commits exist, no PR | Remediation in progress |
| PR exists | Remediation complete — PR open |

## Step 4 — Suggest Next Step

Based on the current phase, suggest the appropriate action:

```
Next step: Run /assess-codebase docs/assessments/{PREFIX}/ --force
           to regenerate stale assessment documents.
```

```
Next step: Review docs/assessments/{PREFIX}/{PREFIX}-Interventions-Index.md
           then approve/reject interventions via /assess-codebase to continue.
```

## Output Format

```
📊 Assessment Status — {PREFIX}
════════════════════════════════════════

Directory: docs/assessments/{PREFIX}/

Assessment Documents:
  ✅ {PREFIX}-Generic-Assessment.md        (modified: {date})
  ✅ {PREFIX}-Layer-Assessment.md          (modified: {date})
  ❌ {PREFIX}-Concurrency-Assessment.md    (missing)

Intervention Documents:
  ✅ {PREFIX}-Interventions-Index.md       (N interventions: N CRITICAL, N HIGH, N MEDIUM, N LOW)
  ✅ {PREFIX}-INT-001-security-hardening.md
  ✅ {PREFIX}-INT-002-god-class-decomposition.md
  ❌ {PREFIX}-INT-003-di-refactoring.md    (missing)

Approval Record:
  ✅ {PREFIX}-Approvals.md                 (INT-001 ✅, INT-002 ✅, INT-003 ⏭ deferred)

Issues Register:
  ⚠️  {PREFIX}-Issues.md                   (N open, N fixed, N deferred)

Process Log:
  ✅ {PREFIX}-process-log.txt              (last entry: {timestamp})

────────────────────────────────────────
Current phase: Remediation in progress
Next step:     Continue remediation or review open issues in {PREFIX}-Issues.md
════════════════════════════════════════
```
