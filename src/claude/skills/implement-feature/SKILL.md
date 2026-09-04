---
description: "Implement Feature — starts the full feature delivery pipeline (requirements → tech-spec → approval → work breakdown → implementation → review → PR). Usage: /implement-feature <path-to-feature.md> [--force]"
argument-hint: <path-to-feature.md> [--force]
---

# Implement Feature

Orchestrates the full feature delivery pipeline by invoking three sequential workflow phases
(`pm-phase1`, `pm-phase2`, `pm-phase3`), handling approval gates in the main loop between
each phase, and recording the real token consumption at the end.

Each workflow phase runs as a real subagent boundary, ensuring worker agents are dispatched
with their declared `model:` frontmatter honoured and producing accurate per-agent `usage` data.

---

## Step 1 — Invoke pm-phase1 (Documentation Phase)

Invoke the `pm-phase1` workflow with the feature path:

```
subagent_type: pm-phase1
prompt: <path-to-feature.md>
```

Wait for the workflow to complete. Do NOT proceed until it returns.

Extract from the result:
- `prefix` — feature prefix (e.g. `FTR-009`)
- `requirements.summary` — requirements file summary
- `tech_spec.summary` — tech-spec file summary
- `validation.summary` — validation result (gaps or clean)
- `token_ledger` — array of per-agent token data from phase 1
- `errors` — any agent failures during phase 1

If `errors` is non-empty, report them to the user but continue to Gate 1 if the
required documents were produced.

---

## Step 2 — Present Gate 1 (HARD STOP — present in main loop)

Present the following to the user:

```
Documents generated for {PREFIX}:

  {PREFIX}-Requirements.md — {requirements.summary}
  {PREFIX}-Tech-Spec.md    — {tech_spec.summary}
  {PREFIX}-Validation-Report.md — {validation.summary}
```

Then output this hard-stop message and **wait for a text reply from the user**:

```
⛔ GATE 1 — DOCS APPROVAL — HARD STOP

Please review the documents above and reply with one of:

  "Approve — proceed to Work Breakdown"
  "Request changes: <describe what to change>"
  "Approve with notes: <your comments>"

The pipeline CANNOT continue until you reply directly.
```

**If the user requests changes:** note them and stop. Do not invoke pm-phase2.

**If the user approves:** immediately write `{PREFIX}-Approvals.md`:

```markdown
# Approval Record — {PREFIX}

## Gate 1 — Document Approvals

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| {PREFIX}-Requirements.md | ✅ Approved | {today} | {notes or —} |
| {PREFIX}-Tech-Spec.md | ✅ Approved | {today} | {notes or —} |
| {PREFIX}-Validation-Report.md | ✅ Approved | {today} | {notes or —} |

## Approval History

| Cycle | Action | Date | Details |
|-------|--------|------|---------|
| 1 | Approved | {today} | {user reply text} |
```

Read back `{PREFIX}-Approvals.md` and verify it exists with Gate 1 ✅ before continuing.
If the file is missing or incomplete, write it again before proceeding.

---

## Step 3 — Invoke pm-phase2 (Work Breakdown Phase)

Invoke the `pm-phase2` workflow:

```
subagent_type: pm-phase2
prompt: <path-to-feature.md>
```

Wait for the workflow to complete. Extract from the result:
- `user_stories` — number of User Stories
- `total_tasks` — total task count
- `domain_breakdown` — tasks per domain
- `implementation_phases` — number of phases
- `human_estimate` — human sequential estimate
- `agent_estimate` — agent parallel estimate
- `token_ledger` — per-agent token data from phase 2

---

## Step 4 — Present Gate 2 (HARD STOP — present in main loop)

Pre-condition check: read `{PREFIX}-Approvals.md` and verify Gate 1 ✅ is present.
If missing, return to Step 2.

Present the following to the user:

```
Work Breakdown for {PREFIX}:

  User Stories: {user_stories} (US-01 ÷ US-{NN})
  Total tasks:  {total_tasks} ({domain_breakdown})
  Implementation phases: {implementation_phases}
  Human estimate: {human_estimate} | Agent estimate: {agent_estimate}
  Reference: {PREFIX}-Effort-Estimate.md for full detail
```

Then output this hard-stop message and **wait for a text reply from the user**:

```
⛔ GATE 2 — WORK BREAKDOWN APPROVAL — HARD STOP

Please review the Work Breakdown above and reply with one of:

  "Approve — start implementation"
  "Request changes: <describe what to change>"
  "Approve with notes: <your comments>"

Implementation CANNOT start until you reply directly.
```

**If the user requests changes:** note them and stop. Do not invoke pm-phase3.

**If the user approves:** append Gate 2 to `{PREFIX}-Approvals.md`:

```markdown
## Gate 2 — Work Breakdown Approval

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| {PREFIX}-Work-Breakdown.md | ✅ Approved | {today} | {total_tasks} tasks, {implementation_phases} phases |
```

Read back `{PREFIX}-Approvals.md` and verify Gate 2 ✅ is present before continuing.

---

## Step 5 — Create feature branch

Before invoking pm-phase3, create the feature branch:

```bash
git checkout -b feature/{PREFIX}-{short-slug}
```

If the branch already exists, switch to it without recreating:

```bash
git checkout feature/{PREFIX}-{short-slug}
```

---

## Step 6 — Invoke pm-phase3 (Implementation Phase)

Pre-condition check: read `{PREFIX}-Approvals.md` and verify BOTH Gate 1 ✅ and Gate 2 ✅.
If either is missing, return to the missing gate.

Invoke the `pm-phase3` workflow:

```
subagent_type: pm-phase3
prompt: <path-to-feature.md> --branch feature/{PREFIX}-{short-slug}
```

Wait for the workflow to complete. Capture its full result, including the `<usage>` block
(format: `subagent_tokens: N`). Extract from the result:
- `pr_url` — the created pull request URL
- `token_ledger` — all per-agent token data from phase 3
- `issues_summary` — escalation and issues counts

If `issues_summary.escalations > 0`, report the escalation details to the user.

---

## Step 7 — Complete Token Estimate file

From the `<usage>` block of the pm-phase3 result, read:
- `subagent_tokens` — total tokens consumed by the pm-phase3 workflow
- `duration_ms` — wall-clock duration of pm-phase3

Read `{PREFIX}-Token-Estimate.md`. Append the orchestrator row and grand total:

> **Null-compatibility — actuals reading and cost calculation:** Treat a token value of `null`, `0`, or `not_available` as **data unavailable** — never as a real, observable zero consumption. Render unavailable values as `—` in the Actual tokens and Actual cost columns; exclude them from sums, averages, and grand totals. Preventing resume clobber and legacy misinterpretation requires that no unavailable measurement is coerced into a real zero.

```markdown
| project-manager/pm-phase3 (orchestrator) | — | sonnet | 80,000 (estimated) | {subagent_tokens} (actual) | ±{delta} | {duration} |

---

## Actuals vs Estimate

| Agent | Task / Scope | Model | Est. tokens | Actual tokens | Delta | Est. cost ($) | Actual cost ($) | Duration |
|-------|-------------|-------|------------|---------------|-------|--------------|----------------|----------|
{one row per entry in token_ledger — from phase 1, 2, and 3; for any entry where actual tokens is null, 0, or not_available show — in Actual tokens and Actual cost and exclude that row from totals}
| project-manager/pm-phase3 (orchestrator) | — | sonnet | 80,000 | {subagent_tokens} | ±{delta} | $0.4320 | ${actual_cost} | {duration} |

## Estimation accuracy by agent type

| Model | Count | Avg est. tokens | Avg actual tokens | Avg delta | Trend |
|-------|-------|----------------|------------------|-----------|-------|
{one row per model tier (haiku, sonnet) — exclude rows where actual tokens is null, 0, or not_available from averages}

## Grand Total

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Total tokens (all agents) | {sum_est} | {sum_actual} | ±{delta} |
| Total cost ($) | ${sum_est_cost} | ${sum_actual_cost} | ±${delta_cost} |
| Total wall-clock | — | {total_duration} | — |
```

> Per-agent values marked *(proportional)* are estimated distributions of the phase total.
> Phase totals and grand total are exact measurements from workflow subagent_tokens.

If the Token Estimate file does not exist (pm-phase3 failed before writing it), create it
from scratch using the data available in the token_ledger.

---

## Step 8 — Report to user

After writing the token file, report:

```
Feature pipeline complete.
   Token estimate + actuals → {PREFIX}-Token-Estimate.md
   Effort estimate + actuals → {PREFIX}-Effort-Estimate.md
   Pull Request → {pr_url}
```
