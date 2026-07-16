---
description: "Assess Codebase — starts the codebase assessment pipeline (parallel assessment → findings consolidation → intervention documents → findings gate). Usage: /assess-codebase [path] [--scope=architecture,security,quality,concurrency,devops] [--force]"
argument-hint: "[path] [--scope=architecture,security,quality,concurrency,devops] [--force]"
---

# Assess Codebase

Orchestrates the full codebase assessment pipeline by spawning the `assessment-manager` agent
and, once it completes, recording the real token consumption in a dedicated file.

---

## Step 1 — Spawn the Assessment Manager

Spawn the `assessment-manager` agent with the exact arguments the user provided:

```
subagent_type: assessment-manager
prompt: <path> [--scope=...] [--force]
```

If no path is provided, use `.` (current working directory).

Wait for the agent to complete. Capture its full result, including the `<usage>` block
that appears at the end of the tool result (format: `subagent_tokens: N`).

The assessment-manager handles the full pipeline internally — it presents the Phase 5 Findings Gate
to the user, records the acknowledgement and flagged interventions, and ends at the summary.
The skill waits for the agent to complete and proceeds to Step 2 regardless of outcome.

---

## Step 2 — Extract orchestrator token usage

From the `<usage>` block of the assessment-manager result, read:
- `subagent_tokens` — total tokens consumed by the assessment-manager agent itself (input + output)
- `duration_ms` — wall-clock duration of the assessment-manager run

If the `<usage>` block is missing: log warning
`"assessment-manager produced no <usage> block; orchestrator token data unavailable"`
and set `actual_tokens = "N/A"`.

---

## Step 3 — Complete Token Estimate file

The assessment-manager will have written `{PREFIX}-Token-Estimate.md` at
`docs/assessments/{PREFIX}/{PREFIX}-Token-Estimate.md` with assessment and
intervention-documentation rows. Read that file, then **append** the following in order:

### 3a — Orchestrator row

The orchestrator row is NOT added to any of the three phase-level tables (Assessment agents, Intervention documentation, Remediation agents). It appears only in the Actuals vs Estimate section (Step 3b below).

For use in Step 3b, compute the orchestrator row values as follows:

- Estimated tokens: 80,000 (baseline from estimation model)
- Estimated cost: $0.4320 — computed as `80,000 × $0.005400 / 1,000` using the sonnet blended
  rate from `docs/pricing.md`. If `docs/pricing.md` is missing, use `"N/A"` for est_cost.
- Actual tokens: value from `subagent_tokens` in the `<usage>` block; `"N/A"` if block was missing
- Actual cost: `(actual_tokens / 1,000) × blended_rate_per_1k`, formatted to 4 decimal places; `"N/A"` if actual_tokens is `"N/A"` or pricing data is unavailable

### 3b — Actuals vs Estimate section

Append a horizontal rule (`---`) followed by an Actuals vs Estimate section. Include one
row for every agent that ran: all assessment agents, intervention-documentation-standard,
and the assessment-manager orchestrator.

```markdown
## Actuals vs Estimate

| Agent | Task/Scope | Model | Est. tokens | Actual tokens | Delta | Est. cost ($) | Actual cost ($) | Duration |
|-------|------------|-------|-------------|---------------|-------|---------------|-----------------|----------|
| {agent} | {scope} | {model} | {est} | {actual} | {±delta} | {est_cost} | {actual_cost} | {Xmin Ys} |
```

Column rules:
- **Delta**: `actual_tokens − est_tokens`; show as `+N` or `−N`. Show `"N/A"` if either
  value is missing.
- **Duration**: convert `duration_ms` to `Xmin Ys` where available; use `"—"` where not.
- Rows with `"N/A"` actual tokens are still shown in the table but excluded from any
  aggregate calculations.

### 3c — Estimation accuracy by agent type (conditional)

If 2 or more distinct model tiers appear in the rows that have non-`"N/A"` actual tokens
(e.g., haiku AND sonnet), append:

```markdown
## Estimation accuracy by agent type

| Model | Count | Avg est. tokens | Avg actual tokens | Avg delta | Trend |
|-------|-------|-----------------|-------------------|-----------|-------|
| {model} | {N} | {avg_est} | {avg_actual} | {avg_delta} | {trend} |
```

Column rules:
- One row per model tier (e.g., `haiku`, `sonnet`)
- Exclude rows with `"N/A"` actual tokens from all averages
- **Trend**: `"over-target"` if avg delta > +20% of avg est; `"under-target"` if avg delta
  < −20% of avg est; otherwise `"on-target"`

### 3d — Grand Total section

Update the Grand Total section already written in the file: replace the
`"partial — updated at pipeline end"` marker with `"Final"` and fill in the computed values:

```markdown
## Grand Total (Final)

| Metric | Estimated | Actual | Delta | Delta % |
|--------|-----------|--------|-------|---------|
| Total tokens (all agents) | {sum_est} | {sum_actual} | ±{delta} | {delta_pct} |
| Total cost ($) | ${sum_est_cost} | ${sum_actual_cost} | ±${delta_cost} | {delta_cost_pct} |
| Total wall-clock | — | {Xmin Ys} | — | — |
```

Column rules:
- **Delta %**: `(delta / estimated) × 100` at 1 decimal place; show `"N/A"` if estimated is 0

Summation rules:
- Sum all agents' tokens and costs; exclude `"N/A"` rows from sums
- Cost values: 2 decimal places for subtotals and totals; 4 decimal places for per-row costs
- The "Remediation" section in the Token Estimate file contains a static note (not a placeholder); leave it as-is
- Wall-clock: convert `duration_ms` from the assessment-manager result to minutes/seconds

---

## Step 4 — Report to user

After writing to the Token Estimate file, report:

```
Assessment pipeline complete.
   Token estimate + actuals → {PREFIX}-Token-Estimate.md
   Approvals                → docs/assessments/{PREFIX}/{PREFIX}-Approvals.md
   Process log              → docs/assessments/{PREFIX}/{PREFIX}-process-log.txt
```

If the Token Estimate file does not exist (assessment-manager failed before writing it):
note this in the report but do not halt — the skill has completed its work.
