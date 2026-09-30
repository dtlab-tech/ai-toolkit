---
description: "Assess Codebase — starts the codebase assessment pipeline (parallel assessment → findings consolidation → intervention documents → findings gate). Usage: /assess-codebase [path] [--scope=architecture,security,quality,concurrency,devops] [--force]"
argument-hint: "[path] [--scope=architecture,security,quality,concurrency,devops] [--force]"
---

# Assess Codebase

Orchestrates the full codebase assessment pipeline by invoking two sequential workflow phases
(`am-phase1`, `am-phase2`), handling the Findings Gate in the main loop between the phases,
and recording the real token consumption at the end.

Run workflows through the deterministic Node host. Workflows are not agent types. Resolve the absolute Claude executable path using docs/task-executor-bootstrap.md.

---

## Step 1 — Determine assessment prefix

Scan `docs/assessments/` for folders matching `ASSESS-[0-9]+*`. Increment the highest number
found, or start at `ASSESS-001`. This prefix is used for all output files in this run.

---

## Step 2 — Invoke am-phase1 (Assessment Phase)

Invoke the `am-phase1` workflow:

```bash
ai-toolkit workflow run am-phase1 --project . --claude-path "{ABSOLUTE_CLAUDE_EXE}" -- "<path>" [--scope=<areas>] --prefix ASSESS-NNN
```

If no path was provided by the user, use `.` (current working directory).
Always pass `--prefix ASSESS-NNN` with the prefix determined in Step 1.

Wait for exit 0, then parse stdout JSON. A nonzero exit is a HARD STOP; do not present a successful Findings Gate. The host owns ledger transitions. Extract from the result:
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

If any worker fails, stop. Partial assessments must not be represented as a completed workflow.

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

```bash
ai-toolkit workflow run am-phase2 --project . -- "--prefix" "{prefix}" --output-dir "{output_dir}" --flagged "{flagged_ids}" --ack "{acknowledgement_text}"
```

Where `{flagged_ids}` is the comma-separated list of INT-NNN identifiers (or "none").

Wait for the workflow to complete. Extract from the result:
- `approvals_path` — path to `{PREFIX}-Approvals.md`
- `registry_updated` — registry write result string
- `summary` — full assessment summary text

---

## Step 5 — Report results

Use the deterministic Token-Estimate and Effort-Estimate files returned by am-phase1, and the summary returned by am-phase2. Worker usage is in token_ledger; missing usage remains unavailable. Do not invent an orchestrator usage block or overwrite the host-generated metrics.
