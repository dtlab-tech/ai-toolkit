# Procedure: Assessment Findings Gate

After intervention documents are generated, present findings to the user and obtain explicit acknowledgement before closing the pipeline. The pipeline is read-only — no remediation code is written.

## Gate presentation

```
📊 Assessment Complete — {PREFIX}
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

Interventions Index: docs/assessments/{PREFIX}/{PREFIX}-Interventions-Index.md

Remediation Effort Estimate (from {PREFIX}-Effort-Estimate.md)
─────────────────────────────────────────────────────────────
  CRITICAL: N × 8h = Xh
  HIGH:     N × 4h = Xh
  MEDIUM:   N × 2h = Xh
  LOW:      N × 1h = Xh
  Total estimated (human sequential): Xh
─────────────────────────────────────────────────────────────
```

## Step 5a — Mandatory acknowledgement

Output the following hard-stop message and **wait for a text reply from the user**. Do NOT use `AskUserQuestion` — it cannot be answered through the agent relay chain.

```
⛔ FINDINGS GATE — STEP 1 OF 2 — HARD STOP

Please review the Interventions Index above.

Reply with "Acknowledged" (or any text) to confirm you have reviewed the findings.

The pipeline CANNOT continue until you reply directly.
```

Accept any non-empty text reply as acknowledgement. Record the timestamp.

## Step 5b — Optional intervention flagging

Immediately after acknowledgement, output:

```
FINDINGS GATE — STEP 2 OF 2

Which interventions (if any) do you want to flag for feature delivery?

Reply with one of:
  "None" — no interventions flagged
  "INT-001, INT-003, ..." — comma-separated list of INT-NNN identifiers

Flagged interventions will be recorded in {PREFIX}-Approvals.md.
Any intervention can be actioned later via /define-feature referencing its INT-NNN document.
```

**Validation:** For each INT-NNN the user provides, verify it exists in `{PREFIX}-Interventions-Index.md`. If any identifier is unknown, report it and re-prompt Step 5b without proceeding:

```
Unknown identifier(s): INT-099
Please re-enter — only identifiers from {PREFIX}-Interventions-Index.md are valid.
```

Re-prompt until all listed identifiers are valid, or the user replies "None".

## Approvals file format

Write `{PREFIX}-Approvals.md` in the assessment directory **only after both steps complete successfully**. Never write a partial file.

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
| INT-001 — {slug} | Yes | {date} | — |
| INT-002 — {slug} | No | {date} | Not selected |
```

Rules:
- Every intervention from `{PREFIX}-Interventions-Index.md` must appear — one row per intervention
- "Flagged: Yes" for each INT-NNN the user explicitly named in Step 5b
- "Flagged: No" for all others, with Notes = "Not selected"
- If zero interventions were flagged, add a note below the table: `> No interventions selected for feature delivery.`
- If zero interventions exist (empty index), write the table header only and add: `> No interventions proposed — zero findings identified.`

## Process log entries

```
[timestamp] Phase 5 gate: presented findings (N interventions)
[timestamp] Phase 5 gate: Step 5a — user acknowledged findings
[timestamp] Phase 5 gate: Step 5b — user flagged: INT-001, INT-003 (or "none")
[timestamp] Phase 5 gate: wrote {PREFIX}-Approvals.md
```

## Rules

- **Never skip this gate** — it is mandatory regardless of finding count
- **Never write a partial Approvals file** — both steps must complete before writing
- **`--force` does not bypass the gate** — it re-presents the gate and overwrites the existing Approvals file
- **Log every gate event** in the process log (gate opened, step 5a complete, step 5b result, file written)
- **No remediation** — this gate never triggers branch creation, agent dispatch, commits, or PRs
