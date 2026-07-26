---
description: "Assess Codebase — starts the codebase assessment pipeline (parallel assessment → findings consolidation → intervention documents → findings gate). Usage: /assess-codebase [path] [--scope=architecture,security,quality,concurrency,devops] [--force]"
argument-hint: "[path] [--scope=architecture,security,quality,concurrency,devops] [--force]"
---

# Assess Codebase

Orchestrates the full codebase assessment pipeline by invoking two sequential workflow phases
(`am-phase1`, `am-phase2`), handling the Findings Gate in the main loop between the phases,
and recording the real token consumption at the end.

Each workflow phase runs as a real subagent boundary, ensuring assessment agents are dispatched
with accurate per-agent `usage` data and their declared `model:` frontmatter honoured.

---

## Step 1 — Determine assessment prefix

Scan `docs/assessments/` for folders matching `ASSESS-[0-9]+*`. Increment the highest number
found, or start at `ASSESS-001`. This prefix is used for all output files in this run.

---

## Step 2 — Invoke am-phase1 (Assessment Phase)

Invoke the `am-phase1` workflow:

```
subagent_type: am-phase1
prompt: <path> [--scope=<areas>] --prefix ASSESS-NNN [--force]
```

If no path was provided by the user, use `.` (current working directory).
Always pass `--prefix ASSESS-NNN` with the prefix determined in Step 1.

Wait for the workflow to complete. Capture its full result, including the `<usage>` block
(format: `subagent_tokens: N`). Extract from the result:
- `prefix` — confirmed assessment prefix
- `output_dir` — path to `docs/assessments/ASSESS-NNN/`
- `assessment_summaries` — list of `{ agent, output_file }` for each completed assessment
- `interventions_index_path` — path to `{PREFIX}-Interventions-Index.md`
- `severity_counts` — `{ CRITICAL, HIGH, MEDIUM, LOW }`
- `total_interventions` — total intervention count
- `remediation_hours_est` — estimated remediation hours
- `effort_estimate_path` — path to `{PREFIX}-Effort-Estimate.md`
- `token_estimate_path` — path to `{PREFIX}-Token-Estimate.md`
- `errors` — any agent failures during phase 1

If `errors` is non-empty, report them to the user before presenting the Findings Gate.
Partial assessments are acceptable — present the Findings Gate with available data.

---

## Step 3 — Present Findings Gate (HARD STOP — present in main loop)

The Findings Gate has two mandatory steps.

### Step 3a — Acknowledge

Present the findings summary to the user:

```
Assessment complete for {prefix} — {output_dir}
────────────────────────────────────────────────────────────
Findings:      {CRITICAL} CRITICAL | {HIGH} HIGH | {MEDIUM} MEDIUM | {LOW} LOW
Interventions: {total_interventions} proposed
────────────────────────────────────────────────────────────
Estimated remediation effort: {remediation_hours_est}h (human sequential)
Reference: {effort_estimate_path} for full breakdown
────────────────────────────────────────────────────────────
{list each assessment agent and its output file}
────────────────────────────────────────────────────────────
```

Then output this hard-stop message and **wait for any non-empty text reply from the user**:

```
⛔ FINDINGS GATE — ASSESSMENT ACKNOWLEDGEMENT — HARD STOP

Please review the assessment findings above.

Reply with any text to acknowledge (e.g. "Acknowledged", "OK", "Proceed").
You will then be asked which interventions to flag for feature delivery.

The pipeline CANNOT continue until you reply directly.
```

Capture the acknowledgement text.

### Step 3b — Flag interventions

After acknowledgement, read `{PREFIX}-Interventions-Index.md` and list all INT-NNN identifiers.
Present them to the user and prompt:

```
Which interventions do you want to flag for feature delivery?

{list of INT-NNN — title — criticality}

Reply with a comma-separated list of INT-NNN identifiers (e.g. "INT-001, INT-003"),
or reply "None" to flag nothing.
```

Wait for a text reply. Validate each supplied identifier against the Interventions Index.
If any are unknown, list them and re-prompt once. Accept "None" for zero flagged.

Capture the flagged identifiers (as a comma-separated string, or "none").

---

## Step 4 — Invoke am-phase2 (Approvals and Registry Phase)

Invoke the `am-phase2` workflow:

```
subagent_type: am-phase2
prompt: --prefix {prefix} --output-dir {output_dir} --flagged {flagged_ids} --ack "{acknowledgement_text}"
```

Where `{flagged_ids}` is the comma-separated list of INT-NNN identifiers (or "none").

Wait for the workflow to complete. Extract from the result:
- `approvals_path` — path to `{PREFIX}-Approvals.md`
- `registry_updated` — registry write result string
- `summary` — full assessment summary text

---

## Step 5 — Complete Token Estimate file

From the `<usage>` block of the am-phase1 result, read:
- `subagent_tokens` — total tokens consumed by the am-phase1 workflow
- `duration_ms` — wall-clock duration of am-phase1

If the `<usage>` block is missing: log warning
`"am-phase1 produced no <usage> block; orchestrator token data unavailable"`
and set `actual_tokens = "N/A"`.

Read `{token_estimate_path}`. Append the following in order:

### 5a — Orchestrator row (for use in 5b only)

Compute values:
- Estimated tokens: 80,000 (baseline from estimation model)
- Estimated cost: $0.4320 — `80,000 × $0.005400 / 1,000` using sonnet blended rate
- Actual tokens: `subagent_tokens` from `<usage>` block; `"N/A"` if missing
- Actual cost: `(actual_tokens / 1,000) × 0.005400` at 4 decimal places; `"N/A"` if unavailable

### 5b — Actuals vs Estimate section

Append a horizontal rule (`---`) followed by:

```markdown
## Actuals vs Estimate

| Agent | Task/Scope | Model | Est. tokens | Actual tokens | Delta | Est. cost ($) | Actual cost ($) | Duration |
|-------|------------|-------|-------------|---------------|-------|---------------|-----------------|----------|
| {agent} | {scope} | {model} | {est} | {actual} | {±delta} | {est_cost} | {actual_cost} | {Xmin Ys} |
...
| assessment-manager/am-phase1 (orchestrator) | — | sonnet | 80,000 | {actual} | ±{delta} | $0.4320 | ${actual_cost} | {duration} |
```

Column rules:
- **Delta**: `actual_tokens − est_tokens`; show as `+N` or `−N`. Show `"N/A"` if either missing.
- **Duration**: convert `duration_ms` to `Xmin Ys` where available; use `"—"` where not.
- Rows with `"N/A"` actual tokens are still shown but excluded from aggregate calculations.

### 5c — Estimation accuracy by agent type (conditional)

If 2+ distinct model tiers appear with non-N/A actuals, append:

```markdown
## Estimation accuracy by agent type

| Model | Count | Avg est. tokens | Avg actual tokens | Avg delta | Trend |
|-------|-------|-----------------|-------------------|-----------|-------|
| {model} | {N} | {avg_est} | {avg_actual} | {avg_delta} | {trend} |
```

- One row per model tier (e.g., `haiku`, `sonnet`)
- Exclude N/A rows from averages
- **Trend**: `"over-target"` if avg delta > +20% of avg est; `"under-target"` if < −20%; else `"on-target"`

### 5d — Grand Total section

Update the Grand Total section: replace `"partial — updated at pipeline end"` with Final values:

```markdown
## Grand Total (Final)

| Metric | Estimated | Actual | Delta | Delta % |
|--------|-----------|--------|-------|---------|
| Total tokens (all agents) | {sum_est} | {sum_actual} | ±{delta} | {delta_pct} |
| Total cost ($) | ${sum_est_cost} | ${sum_actual_cost} | ±${delta_cost} | {delta_cost_pct} |
| Total wall-clock | — | {Xmin Ys} | — | — |
```

- **Delta %**: `(delta / estimated) × 100` at 1 decimal place; `"N/A"` if estimated is 0
- Sum all agents' tokens and costs; exclude `"N/A"` rows from sums
- Cost: 2 decimal places for totals; 4 decimal places for per-row costs
- The "Remediation" section contains a static note — leave it as-is
- Wall-clock: convert `duration_ms` from am-phase1 `<usage>` to minutes/seconds

---

## Step 6 — Report to user

After writing to the Token Estimate file, report:

```
Assessment pipeline complete.
   Token estimate + actuals → {token_estimate_path}
   Approvals                → {approvals_path}
   Process log              → {output_dir}/{prefix}-process-log.txt

{summary from am-phase2}
```

If the Token Estimate file does not exist (am-phase1 failed before writing it):
note this in the report but do not halt — the skill has completed its work.
