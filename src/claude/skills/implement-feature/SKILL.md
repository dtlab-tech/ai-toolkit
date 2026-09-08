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

## Step 0 — Agent Preflight (fail-closed, AC-19)

Before starting the pipeline, verify that every pipeline agent is installed and verified.

1. **Derive the feature prefix** from the `<path-to-feature.md>` argument (e.g. path contains `FTR-017` → prefix = `FTR-017`). Derive the ledger directory as the directory containing the feature.md file.

2. **Open the preflight ledger entry** (fail-closed — if this fails, do NOT proceed):
   ```bash
   ai-toolkit ledger open \
     --prefix {PREFIX} \
     --agent agent-preflight:implement-feature \
     --phase phase3 \
     --dir {LEDGER_DIR}
   ```
   If the command exits non-zero, **STOP IMMEDIATELY** — report the error and do not continue.

3. **Run the preflight check:**
   ```bash
   ai-toolkit agents preflight --project . --pipeline implement-feature
   ```

4. **On success** (exit 0): close the ledger entry:
   ```bash
   ai-toolkit ledger close \
     --prefix {PREFIX} \
     --agent agent-preflight:implement-feature \
     --dir {LEDGER_DIR}
   ```
   Then continue to Step 1.

5. **On failure** (exit non-zero): mark the ledger entry failed and STOP:
   ```bash
   ai-toolkit ledger fail \
     --prefix {PREFIX} \
     --agent agent-preflight:implement-feature \
     --error "agent preflight failed — one or more pipeline agents unverified" \
     --dir {LEDGER_DIR}
   ```
   Report the preflight error to the user. Do NOT continue to Step 1.

---

## Step 1 — Invoke pm-phase1 (Documentation Phase)

### Step 1a — Tier 1 dispatch guard (AC-06, AC-07, AC-20)

Before dispatching, resolve and verify the pm-phase1 orchestrator:

```bash
ai-toolkit agents resolve \
  --project . \
  --id gaia.orchestrator.feature.phase1 \
  --require-verified
```

If exit non-zero → **HARD STOP**: report the error, do not dispatch pm-phase1.

Store the resolution record fields: `nativeName`, `sha256` (definitionHash), `scope` (resolutionScope), `toolkitVersion`.

Open the dispatch ledger entry (fail-closed):

```bash
ai-toolkit ledger open \
  --prefix {PREFIX} \
  --agent pm-phase1:dispatch \
  --phase phase3 \
  --dir {LEDGER_DIR} \
  --metadata-json '{"agentId":"gaia.orchestrator.feature.phase1","nativeAgentName":"{nativeName}","platform":"claude","toolkitVersion":"{toolkitVersion}","resolutionScope":"{scope}","definitionHash":"{sha256}"}'
```

If exit non-zero → **HARD STOP** (fail-closed): do not dispatch.

### Step 1b — Invoke pm-phase1 using verified nativeName

Invoke the workflow using ONLY the resolved `nativeName` (never a hardcoded name):

```
subagent_type: {nativeName}
prompt: <path-to-feature.md>
```

Wait for the workflow to complete. Do NOT proceed until it returns.

After the workflow returns, close the dispatch ledger entry:

```bash
ai-toolkit ledger close \
  --prefix {PREFIX} --agent pm-phase1:dispatch --dir {LEDGER_DIR}
```

If ledger close fails → **HARD STOP**: report the error and do not continue.

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

### Step 3a — Tier 1 dispatch guard

Resolve and verify pm-phase2:

```bash
ai-toolkit agents resolve \
  --project . \
  --id gaia.orchestrator.feature.phase2 \
  --require-verified
```

If exit non-zero → **HARD STOP**: do not dispatch pm-phase2.

Open the dispatch ledger entry (fail-closed):

```bash
ai-toolkit ledger open \
  --prefix {PREFIX} \
  --agent pm-phase2:dispatch \
  --phase phase3 \
  --dir {LEDGER_DIR} \
  --metadata-json '{"agentId":"gaia.orchestrator.feature.phase2","nativeAgentName":"{nativeName}","platform":"claude","toolkitVersion":"{toolkitVersion}","resolutionScope":"{scope}","definitionHash":"{sha256}"}'
```

If exit non-zero → **HARD STOP** (fail-closed).

### Step 3b — Invoke pm-phase2 using verified nativeName

```
subagent_type: {nativeName}
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

Close the dispatch ledger entry after the workflow returns:

```bash
ai-toolkit ledger close \
  --prefix {PREFIX} --agent pm-phase2:dispatch --dir {LEDGER_DIR}
```

If ledger close fails → **HARD STOP**: report the error. Do not continue to Gate 2. The error is not swallowed (AC-22).

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

### Step 6a — Tier 1 dispatch guard (Gate 2 post-approval, AC-06, AC-07, AC-08)

After Gate 2 approval, resolve and verify pm-phase3 with `--require-verified`. Only a `verified` status permits dispatch:

```bash
ai-toolkit agents resolve \
  --project . \
  --id gaia.orchestrator.feature.phase3 \
  --require-verified
```

If exit non-zero → **HARD STOP** (AC-08): pm-phase3 is absent or tampered. Report the error with remediation instructions:

```
⛔ HARD STOP — pm-phase3 cannot be dispatched.

Remediation:
  1. Run: ai-toolkit agents resolve --project . --id gaia.orchestrator.feature.phase3
  2. Check the status field in the output for the failure reason.
  3. Re-install the toolkit if the status is not-installed or hash-mismatch.
  4. Contact the toolkit team if the issue persists.

Do NOT use an alternative workflow name or any fallback. This pipeline requires verified agents.
```

Do NOT use any alternative workflow name or fallback.

Open the dispatch ledger entry (fail-closed):

```bash
ai-toolkit ledger open \
  --prefix {PREFIX} \
  --agent pm-phase3:dispatch \
  --phase phase3 \
  --dir {LEDGER_DIR} \
  --metadata-json '{"agentId":"gaia.orchestrator.feature.phase3","nativeAgentName":"{nativeName}","platform":"claude","toolkitVersion":"{toolkitVersion}","resolutionScope":"{scope}","definitionHash":"{sha256}"}'
```

If exit non-zero → **HARD STOP** (fail-closed): do not dispatch.

### Step 6b — Invoke pm-phase3 using verified nativeName

Invoke the workflow using ONLY the resolved `nativeName` (never a hardcoded name):

```
subagent_type: {nativeName}
prompt: <path-to-feature.md> --branch feature/{PREFIX}-{short-slug}
```

Wait for the workflow to complete. Capture its full result, including the `<usage>` block
(format: `subagent_tokens: N`). Extract from the result:
- `pr_url` — the created pull request URL
- `token_ledger` — all per-agent token data from phase 3
- `issues_summary` — escalation and issues counts

If `issues_summary.escalations > 0`, report the escalation details to the user.

**If pm-phase3 returned an error or escalation:** mark the dispatch ledger entry failed before stopping:

```bash
ai-toolkit ledger fail \
  --prefix {PREFIX} --agent pm-phase3:dispatch \
  --error "pm-phase3 returned an error or escalation" \
  --dir {LEDGER_DIR}
```

If `ledger fail` itself exits non-zero → **HARD STOP** (AC-22): report both the original workflow error and the ledger failure. The error is NOT swallowed.

**On successful completion:** close the dispatch ledger entry:

```bash
ai-toolkit ledger close \
  --prefix {PREFIX} --agent pm-phase3:dispatch --dir {LEDGER_DIR}
```

If ledger close fails → **HARD STOP** (AC-22): report the error. The pipeline does not silently swallow ledger failures after dispatch returns.

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
