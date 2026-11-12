---
description: "Implement Feature — starts the full feature delivery pipeline (requirements → tech-spec → approval → work breakdown → implementation → review → PR). Usage: /implement-feature <path-to-feature.md> [--force]"
argument-hint: <path-to-feature.md> [--force]
---

# Implement Feature

Runs documentation and work breakdown through the deterministic Node workflow host, then implementation through the FTR-018 task executor. Approval gates remain in the main loop.

Workflows are JavaScript assets, never agent types. Do not pass pm-phase1/2/3 or am-phase1/2 to agentType, subagent_type, or --agent. Use the workflow CLI below. Resolve the absolute Claude executable path as described in `docs/task-executor-bootstrap.md` — never relative to this skill's own package directory (which holds only this `SKILL.md`, no `docs/` subfolder). That path is relative to wherever this toolkit's `docs/` landed for the install actually in use: the project root for a local install, or `~/.claude/` for a global install (`bin/cli.js`'s `installLocal`/`installGlobal` — a global install nests `docs/` under `~/.claude/docs/` alongside `skills/`/`agents/`; a local install places it at `<project-root>/docs/`, a sibling of `.claude/`, not inside it).

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
- `requirements.path` / `requirements.summary` — Requirements artifact path (the split
  `req/index.md` by default — generation no longer produces a single assembled file
  automatically) and its summary
- `tech_spec.path` / `tech_spec.summary` — Tech-Spec artifact path (the split `spec/index.md` by
  default) and its summary
- `validation.summary` — validation result (gaps or clean)
- `validation.open_gaps` — array of the validator's findings still open after the last revision
  cycle; empty when validation was clean. Non-empty means the workflow stopped revising and left
  these for the Gate 1 reviewer to accept, reject or send back
- `docs_digest` — content digest binding this approval to the exact Requirements/Tech-Spec
  bytes just produced; embed verbatim into `{PREFIX}-Approvals.md` in Step 2 below
- `token_ledger` — array of per-agent token data from phase 1
- `errors` — any agent failures during phase 1

If `errors` is non-empty, report them to the user but continue to Gate 1 if the
required documents were produced.

---

## Step 1a — Split checkpoint

Read `split_checkpoint` from the pm-phase1 result.

1. If `split_checkpoint` is missing, is not an object, or has no string `status`: treat it as
   unavailable with the reason "split checkpoint result missing or malformed".
2. If `status` is `passed` or `skipped`: continue to Gate 1 (Step 2). Show no prompt.
3. If `status` is `unavailable`: print a plain error, not a gate and not an approval prompt:
   ```
   Feature split check unavailable. Cannot proceed to Gate 1.
     - <count>: <reason>        (one line per entry in split_checkpoint.unavailable)
   ```
   If there are no entries (missing or malformed result), print one line:
   `  - split_checkpoint: <reason>`.
   Then STOP. Do not reach Gate 1. Do not ask the user anything.
4. If `status` is `split-proposed`: show the measured proposal. Do not reach Gate 1.
   - If `split_checkpoint.proposal` is missing or not an object: treat it as unavailable with the
     reason "split proposal missing or malformed", print it as in step 3, and STOP.
   - Derive Keywords only. For each child in `proposal.children`, in order, set its `keywords` from
     its `name`, the use cases and the component paths in its `assigned` text. Do not change
     `name`, `purpose`, `summary`, `dependsOn`, `assigned` or the order of the children.
   - Print the over-threshold counts. For each key in `split_checkpoint.over`, print one line:
     `<key>: <counts[key]> / threshold <thresholds[key]> (over)`. Read both numbers from the
     result. Do not list keys that are not in `over`.
   - For each child, in order, print: name, purpose, Summary (`summary`), Keywords, dependsOn and
     the assigned use cases and components (`assigned`). Summary is editable; show what the
     proposal gives. A child whose `assigned` text names no components is shown as an error and
     cannot be accepted unedited.
   - Foundation: if `proposal.sharedFoundationOwner` is a child name, print it as the shared
     foundation owner and list the children whose `dependsOn` names it. If it is null, print
     `proposal.foundationNote` exactly as given. Do not invent a foundation.
   - State that this proposal exists only on screen and nothing has been written. Nothing is
     written before an explicit accept.
   - Set `current_proposal` to `proposal`, with the Keywords derived above. Then run the decision
     loop below.
   - This branch never calls `feature-split.js apply`.
   - **Decision loop.** Ask the user once: `accept | edit | reject`. Wait for the answer. Any other
     answer: ask the same question again.
     - `accept`: its outcome is not defined in this step. It applies `current_proposal`, the last
       re-presented proposal, never the original.
     - `reject`: its outcome is not defined in this step. Nothing is written.
     - `edit`: run the edit arm below, then return to this prompt.
   - **Edit arm.** Ask the user for one change: a child name, a purpose, the order, the foundation
     owner, add a child, remove a child, merge two children, the Summary or the Keywords. Each edit
     is one change. Map it to one op of the form `rename` (`from`, `to`), `set` (`name`, `field` as
     `purpose`, `summary` or `keywords`, `value`), `reorder` (`names`), `owner` (`name`), `add`
     (`child`), `remove` (`name`) or `merge` (`names`, `into`).
     - Check the change with the FTR-035 edit rules (`editProposal`), through the validator. This
       is the only `feature-split.js` call in this step. Do not call `apply` here.

       ```
       cat <<'FEATURE_SPLIT_JSON' | ai-toolkit run-asset scripts/feature-split.js --project . -- validate-proposal
       { "proposal": <current_proposal JSON>, "edit": <one op JSON> }
       FEATURE_SPLIT_JSON
       ```
     - If the command exits non-zero: print its error, keep `current_proposal` and return to the
       decision prompt.
     - Otherwise read the single JSON line it prints: `proposal` (revised, or unchanged on refusal)
       and `violations`.
     - If `violations` is not empty, the edit is refused and changes nothing. A child count below
       `minChildren` is refused with the message below. Read the minimum from
       `split_checkpoint.proposal.minChildren`; never write it as a number in this skill.
       - Child count below `minChildren`: print `Edit refused: it would leave <n> children; the minimum
         is <value>. The previous proposal is kept.`
       - Any other violation: print `Edit refused: <violation message>. The previous proposal is kept.`
       Keep `current_proposal` and return to the decision prompt. The user may try a different edit,
       or answer accept or reject.
     - If `violations` is empty, set `current_proposal` to the returned `proposal`. Re-present it
       with the rules of this step: the over-threshold lines as printed above (an edited proposal is
       not re-measured), each child's fields, and the foundation note. Print each returned
       `foundationWarnings` message. Then return to the decision prompt.
     - Each re-presented proposal needs a fresh explicit accept. An edit is never an accept. A
       proposal is applied only when the user answers `accept` after its last re-presentation.
     - Keywords the user types are kept as entered. They are not re-derived after an edit.
5. Any other status: treat it as unavailable with the reason
   "unknown split checkpoint status: <status>", print it the same way as step 3, and STOP.

Rules for this step:
- Step 1a calls `feature-split.js` only for `validate-proposal` in the edit arm. Otherwise the
  proposal is read from the pm-phase1 result.
- An unknown or malformed result never leads to Gate 1. Only `passed` and `skipped` continue.
- The unavailable message must not contain the words "accept", "approve" or "confirm", so it
  cannot read as an approval prompt.

---

## Step 2 — Present Gate 1 (HARD STOP — present in main loop)

Present the following to the user:

```
Documents generated for {PREFIX}:

  {requirements.path} — {requirements.summary}
  {tech_spec.path}    — {tech_spec.summary}
  {PREFIX}-Validation-Report.md — {validation.summary}

If `validation.open_gaps` is non-empty, also list every entry verbatim under a heading
"Open validation gaps — your decision at this gate", then continue. These are design points the
validator could not close in three cycles. "Approve with notes" records the ones you accept in
`{PREFIX}-Approvals.md`; "Request changes" sends them back.

To view a single combined document instead of the split source files, run:
  /assemble-docs {PREFIX} [req|spec|all]
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
| {requirements.path} | ✅ Approved | {today} | {notes or —} |
| {tech_spec.path} | ✅ Approved | {today} | {notes or —} |
| {PREFIX}-Validation-Report.md | ✅ Approved | {today} | {notes or —} |

**Docs Digest:** `{docs_digest}`

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

### Step 5a — Commit the approved planning documents

The task executor (Step 6) dispatches each task directly against this project directory and
reviews/commits exactly what `git status` reports changed. If the planning documents this
pipeline just produced (`<feature-dir>/` — feature.md, req/, spec/, wbs/, coverage-matrix/,
`{PREFIX}-Approvals.md`, `{PREFIX}-Validation-Report.md`) are still sitting uncommitted at this
point, every task's own review prompt and commit would be contaminated by them — reproduced on a
real run (hundreds of KB of unrelated planning docs bleeding into a single task's own small diff,
"Prompt is too long"). Commit them now, on the feature branch just created above, scoped to the
feature's own directory only:

```bash
git add <feature-dir>
git commit -m "docs({PREFIX}): commit approved Requirements/Tech-Spec/Work Breakdown"
```

Skip this commit if `git status --porcelain <feature-dir>` reports nothing (e.g. a resumed run
where the docs were already committed in a prior pass) — do not fail or retry, an empty commit is
never created. `<feature-dir>` is the directory containing feature.md (same directory derived in
Step 0).

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

**Preferred:** run `ai-toolkit executor report --project . --feature <path-to-feature.md>`. It writes `{PREFIX}-Token-Estimate.md` (measured totals for documentation, developer agents and reviews, by run, by phase, with attempts per task) and `{PREFIX}-executor-ledger.json` (one compact row per executor call) from the evidence of every run of the feature. The executor also does this by itself when a run ends or pauses. When the command succeeds, the file is complete: read it back for Step 8 and skip the manual procedure below. The manual procedure is the fallback when the command fails.

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
