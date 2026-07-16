# Procedure: Assessment Remediation Gate

After intervention documents are generated, present findings to the user and obtain explicit approval before any remediation code is written.

## Gate presentation

```
📊 Assessment Complete — ASSESS-001
═══════════════════════════════════════
Assessment results:
  Generic quality:     [KPI summary scores]
  Layer violations:    N CRITICAL, N HIGH, N MEDIUM
  Concurrency hazards: N CRITICAL, N HIGH
  [other assessments]

Interventions proposed: N total
  CRITICAL: N  (immediate attention)
  HIGH:     N  (next sprint)
  MEDIUM:   N  (planned cycle)
  LOW:      N  (backlog)

Interventions Index: docs/assessments/ASSESS-001/ASSESS-001-Interventions-Index.md
```

Output the following hard-stop message and **wait for a text reply from the user**. Do NOT use `AskUserQuestion` — it cannot be answered through the agent relay chain.

```
⛔ ASSESSMENT GATE — HARD STOP

Review the findings above and reply with one of:

  "Approve all" — all proposed interventions approved
  "Approve CRITICAL only" — only CRITICAL severity approved
  "Select interventions: INT-001, INT-003, ..." — specify which to approve
  "Assessment only" — stop here, no remediation

The pipeline CANNOT continue until you reply directly.
```

If the user selects **"Assessment only"**, skip to the Summary phase.

## Approvals file format

Write `{PREFIX}-Approvals.md` in the assessment directory:

```markdown
# Approval Record — {PREFIX}

## Assessment Approvals

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| {PREFIX}-Generic-Assessment.md | ✅ Reviewed | {date} | — |
| {PREFIX}-Interventions-Index.md | ✅ Reviewed | {date} | — |

## Remediation Scope

| Intervention | Approved | Date | Notes |
|---|---|---|---|
| INT-001 — sql-injection-hardening | ✅ Approved | {date} | — |
| INT-002 — god-class-decomposition | ✅ Approved | {date} | — |
| INT-003 — di-refactoring | ❌ Deferred | {date} | Out of current sprint scope |
```

## Rules

- **Never skip this gate** — remediation cannot start without explicit approval
- **Log the approval outcome** in the process log
- **Record every decision** including deferred interventions and the reason
