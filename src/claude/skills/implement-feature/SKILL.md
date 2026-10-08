---
description: "Implement Feature — starts the full feature delivery pipeline (requirements → tech-spec → approval → work breakdown → implementation → review → PR). Usage: /implement-feature <path-to-feature.md> [--force]"
argument-hint: <path-to-feature.md> [--force]
---

# Implement Feature

Runs documentation and work breakdown through the deterministic Node workflow host, then implementation through the FTR-018 task executor. Approval gates remain in the main loop.

Workflows are JavaScript assets, never agent types. Do not pass pm-phase1/2/3 or am-phase1/2 to agentType, subagent_type, or --agent. Use the workflow CLI below. Resolve the absolute Claude executable path as described in docs/task-executor-bootstrap.md.

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

Run directly via the shell tool:

```bash
ai-toolkit workflow run pm-phase1 --project . --claude-path "{ABSOLUTE_CLAUDE_EXE}" -- "<path-to-feature.md>" [--force]
```

The host verifies the installed workflow and each worker and owns all ledger transitions. Do not manually open/close its entries. Nonzero exit is a HARD STOP: do not present the next gate or report successful completion. Parse stdout as JSON only on exit 0. Never dispatch the workflow as a subagent.

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

Run directly via the shell tool:

```bash
ai-toolkit workflow run pm-phase2 --project . --claude-path "{ABSOLUTE_CLAUDE_EXE}" -- "<path-to-feature.md>"
```

The host verifies the installed workflow and each worker and owns all ledger transitions. Do not manually open/close its entries. Nonzero exit is a HARD STOP: do not present the next gate or report successful completion. Parse stdout as JSON only on exit 0. Never dispatch the workflow as a subagent.

Extract from the result:
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

Before launching the task executor, create the feature branch:

```bash
git checkout -b feature/{PREFIX}-{short-slug}
```

If the branch already exists, switch to it without recreating:

```bash
git checkout feature/{PREFIX}-{short-slug}
```

---

## Step 6 — Launch the task executor (Implementation Phase)

Pre-condition check: read `{PREFIX}-Approvals.md` and verify BOTH Gate 1 ✅ and Gate 2 ✅.
If either is missing, return to the missing gate.

Implementation is no longer dispatched as a subagent from this skill. There is no
pm-phase3 workflow, no Tier-1 dispatch guard, and no `pm-phase3:dispatch` ledger entry for
this step — none of that applies once implementation runs as an external process instead of
an in-chat subagent. Once Gate 2 is approved, this skill's job is limited to presenting or
launching **one explicit `task-executor` start command**; the executor process itself then
owns the repo, plans, executes, checkpoints and resumes tasks deterministically, independent
of this chat.

**No subagent orchestrates the run, and no assistant or agent involvement is required for
each task transition once the run has started.** This is a deliberate behavioral change from
the retired pm-phase3 grouping model: previously an assistant-driven subagent had to be
present for the whole implementation phase; now a single durable command launch is enough,
and the run may keep going, checkpointing and resuming, even after this conversation ends.

### Step 6a — Present or launch the executor start command

Build the start command:

```bash
ai-toolkit executor start \
  --project . \
  --feature <path-to-feature.md> \
  --max-concurrency 1 \
  --claude-path <resolved-claude-cli-path> \
  --task-timeout-ms <task-timeout-ms, e.g. 900000> \
  --agent-budget-usd <per-agent budget in USD, e.g. 5.00>
```

Placeholders:
- `<path-to-feature.md>` — the feature.md path passed to this skill
- `<resolved-claude-cli-path>` — the Claude CLI executable path on this host; try automated
  discovery first (`docs/task-executor-bootstrap.md` section 2 — covers both a standalone CLI on
  `PATH` and the VS Code-extension-cached SDK binary case), validate any candidate with
  `--version` before trusting it, and ask the user only when discovery is inconclusive or finds
  more than one candidate
- `<task-timeout-ms>` and `<agent-budget-usd>` — must be supplied explicitly; there is no hidden default timeout or spend

**If the host's ordinary terminal capability can launch a durable external command**, launch
it directly through that capability so the process persists independently of this chat.

**If the host cannot launch a durable external command, show the exact command above for the
user to run themselves in a terminal.** Do not attempt to fake a durable launch by running it
as a blocking in-chat command — the run must be able to outlive this conversation.

In both cases, capture (or ask the user to report back) the `run-id` printed by `start` — it
is required for every subsequent `status`, `diagnose`, `stop`, `reconcile`, `resume`, and
`replan` call; there is no implicit last-run selection.

Tell the user that implementation has been launched and that progress and cost can be
checked at any time with:

```bash
ai-toolkit executor status --run-id {run_id} --format json
```

Do not block this skill on the run reaching a terminal state — proceed to Step 7 with
whatever the latest `status` reports at this point. No fallback to the retired pm-phase3
grouping model is permitted.

---

## Step 7 — Complete Token Estimate file

Phases 1 and 2 return JSON token_ledger entries from measured worker subprocess usage. They do not return a workflow subagent usage block. Missing measurements stay unavailable. For phase 3 use the executor:

```bash
ai-toolkit executor status --run-id {run_id} --format json
```

Read the run's total actual tokens/cost and duration from that ledger-sourced summary. If the
run has not yet reached a terminal state (it may still be executing or may outlive this
chat), treat its actuals as **not yet available** for this pass — apply the same
null-compatibility rule below, and note in the file that the run is still in progress and the
row should be refreshed with a later `status` call.

Read `{PREFIX}-Token-Estimate.md`. Append the executor run row and grand total:

> **Null-compatibility — actuals reading and cost calculation:** Treat a token value of `null`, `0`, or `not_available` as **data unavailable** — never as a real, observable zero consumption. Render unavailable values as `—` in the Actual tokens and Actual cost columns; exclude them from sums, averages, and grand totals. Preventing resume clobber and legacy misinterpretation requires that no unavailable measurement is coerced into a real zero.

```markdown
| task-executor (run {run_id}) | — | — | 80,000 (estimated) | {ledger_actual_tokens} (actual) | ±{delta} | {ledger_duration} |

---

## Actuals vs Estimate

| Agent | Task / Scope | Model | Est. tokens | Actual tokens | Delta | Est. cost ($) | Actual cost ($) | Duration |
|-------|-------------|-------|------------|---------------|-------|--------------|----------------|----------|
{one row per entry in token_ledger from phase 1 and 2, plus per-task ledger entries recorded by the executor run for phase 3; for any entry where actual tokens is null, 0, or not_available show — in Actual tokens and Actual cost and exclude that row from totals}
| task-executor (run {run_id}) | — | — | 80,000 | {ledger_actual_tokens} | ±{delta} | $0.4320 | ${ledger_actual_cost} | {ledger_duration} |

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
> Phase 1/2 actuals come from worker usage in token_ledger; implementation actuals come from the task executor ledger. Missing measurements remain unavailable.

If the Token Estimate file does not exist (a prior phase failed before writing it), create it
from scratch using the data available in the token_ledger.

---

## Step 8 — Report to user

After writing the token file, report:

```
Feature pipeline complete through implementation launch.
   Token estimate + actuals → {PREFIX}-Token-Estimate.md
   Effort estimate + actuals → {PREFIX}-Effort-Estimate.md
   Implementation run       → run-id {run_id} (check with `ai-toolkit executor status --run-id {run_id}`)
```

Unlike the retired pm-phase3 model, this skill does not itself produce a pull request: the
executor's scope is task execution, checkpointing and branch integration, not PR creation.
Once `executor status` reports the run has reached a terminal, fully-integrated state, open
the pull request the same way you would for any other finished branch (e.g. `gh pr create`,
or the toolkit's own `/pr-description` skill).
