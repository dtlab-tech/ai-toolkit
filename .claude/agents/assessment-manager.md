---
name: assessment-manager
description: "Assessment Manager — intelligent orchestrator for the codebase assessment pipeline. Discovers available assessment agents, runs them in parallel, consolidates findings, gates on human approval, plans remediation, and dispatches developer agents to fix confirmed issues. Input: path to target codebase (or '.' for current directory) [--scope=<area1,area2>] [--force]"
---

# Assessment Manager

An intelligent orchestrator that **assesses before it plans, and plans before it executes**. Discovers available assessment agents, runs them against the target codebase, consolidates findings, gates on human approval, then drives remediation through existing developer agents.

Before starting, read these procedures from `docs/procedures/`:
- `process-log.md` — log format and token tracking rules
- `issues-register.md` — Issues Register format and severity rules
- `assessment-approval-gate.md` — gate presentation, approvals file format, rules
- `token-estimation.md` — Token-Estimate.md format, estimation model, and assessment pipeline input size estimates

Also read `docs/pricing.md` — model pricing table and blended cost formula (80/20 input/output split).

---

## Phase 1 — Discovery

### 1a. Discover available agents

Scan `.claude/agents/` and read each file's `description` frontmatter. Classify each agent as:
- **Assessment** — produces findings (keywords: "assessment", "audit", "analysis")
- **Remediation** — implements fixes (keywords: "refactoring", "hardening", "decomposition")
- **Documentation** — produces structured documents (keywords: "documentation standard", "intervention")
- **Orchestrator** — skip self-invocation

Build two registries: `assessment_agents` and `remediation_agents`.

### 1b. Determine assessment prefix

Scan `docs/assessments/` for folders matching `ASSESS-[0-9]+*`. Increment the highest number found, or start at `ASSESS-001`.

Output directory: `docs/assessments/ASSESS-NNN-{codebase-slug}/`
Prefix: `ASSESS-NNN`

### 1c. Assess existing outputs

If `--force` is not passed and the assessment directory exists, check staleness of existing output files (same pattern as `project-manager`). Build a state map.

### 1d. Parse scope filter

If `--scope=<areas>` is passed, restrict to agents covering those areas. Valid values: `architecture`, `security`, `quality`, `concurrency`, `devops`, `domain-model`, `dependencies`. No scope → run all discovered assessment agents.

---

## Phase 2 — Planning

### Dependency graph

```
Target codebase
  ├── generic-software-assessment      → {PREFIX}-Generic-Assessment.md
  ├── layered-architecture-assessment  → {PREFIX}-Layer-Assessment.md
  ├── concurrency-safety-assessment    → {PREFIX}-Concurrency-Assessment.md
  └── [other discovered assessment agents — all in parallel]
                │
                └── intervention-documentation-standard
                          │
                          ├── {PREFIX}-INT-NNN-*.md (one per finding)
                          └── {PREFIX}-Interventions-Index.md
                                    │
                          ══ REMEDIATION GATE ══  →  {PREFIX}-Approvals.md
                                    │
                          Remediation loop (approved interventions, parallel where possible)
                                    │
                          review-solution per intervention → commit on pass
                                    │
                          Pull Request  (feature/{PREFIX}-remediation → develop)
```

### Planning rules

1. All assessment agents run in **parallel** — read-only, no mutual dependencies
2. `intervention-documentation-standard` runs **after** all assessments complete
3. Skip agents with fresh output unless `--force`
4. Remediation agents dispatch **only after** the Remediation Gate is approved
5. Parallelize remediation agents where interventions have no dependency on each other

### Show plan to user before executing

```
📋 Assessment Plan  (prefix: ASSESS-001, target: .)
─────────────────────────────────────────────────────
🔄 RUN (parallel):
   generic-software-assessment      → ASSESS-001-Generic-Assessment.md
   layered-architecture-assessment  → ASSESS-001-Layer-Assessment.md
   concurrency-safety-assessment    → ASSESS-001-Concurrency-Assessment.md

⏳ QUEUE: intervention-documentation-standard → ASSESS-001-INT-*.md + Interventions-Index.md
⏳ GATE:  Remediation approval
⏳ IMPL:  Approved interventions (parallel where no dependency)
⏳ PR:    feature/ASSESS-001-remediation → develop
─────────────────────────────────────────────────────
```

---

## Phase 3 — Assessment Execution

Dispatch all assessment agents in parallel (`run_in_background: true`). Each agent receives: target codebase path, assessment prefix, output directory path. Track tokens for every agent call (see `docs/procedures/process-log.md`).

After all complete:
- Verify each expected output file exists and is non-empty
- If an agent produced no output, log the failure and continue — partial assessments are better than none

### Write initial Token Estimate file

After verifying outputs and before moving to Phase 4, accumulate token usage from every completed assessment agent and write `{PREFIX}-Token-Estimate.md` to `docs/assessments/{PREFIX}/`. Create the directory if it does not exist.

**Step 1 — Check estimation model (mandatory).** Confirm `docs/procedures/token-estimation.md` is present and readable. If it is missing, log an error and halt — token estimation is non-negotiable. Parse the file to extract the canonical parameters:

| Parameter | Value |
|-----------|-------|
| Avg chars per token | 4 |
| Haiku system prompt | ~2,000 tokens |
| Sonnet system prompt | ~3,000 tokens |
| Base overhead per call | ~5,000 tokens |

Store these parameters in memory and reuse them for all estimation calculations in Phases 3–6. If the file is present but a parameter is missing, use the defaults above and log a warning: `"Using default token estimation parameter: {parameter}; consider updating docs/procedures/token-estimation.md"`.

**Step 2 — Check pricing data (graceful).** Confirm `docs/pricing.md` is present and readable. If it is missing or malformed, log a warning: `"docs/pricing.md missing/malformed; cost columns will show N/A"` — then set all cost columns (est_cost, actual_cost) to `N/A` for all rows and continue. Token counts (estimated and actual) are still recorded with full precision. Phase subtotals and grand total cost rows show `N/A`. The pipeline does not halt. Delta cost and delta % in the Phase 8 accuracy analysis also show `N/A` when pricing data is unavailable. If the file is available, read the **Blended unit cost reference** table and look up the blended rate for each agent's model. Default to `sonnet` for any agent whose model cannot be determined from its frontmatter.

**Step 3 — Estimate tokens per assessment agent.** For each agent that ran in Phase 3, apply the estimation formula from `docs/procedures/token-estimation.md` (Assessment pipeline usage section):

```
est_tokens = base_overhead + system_prompt_weight + (input_size_chars / 4)
           = 5,000        + 3,000 (sonnet)        + (input_size_chars / 4)
```

Use the agent-specific input size estimates from `docs/procedures/token-estimation.md`. The blended rate for all assessment agents is `$0.005400/1k tokens` (sonnet). Compute:

```
est_cost = est_tokens × (blended_rate / 1000)
```

Round `est_tokens` to the nearest integer; format `est_cost` to 4 decimal places (e.g., `$0.0444`).

**Step 4 — Extract actual tokens per assessment agent.** For each completed assessment agent, read its `<usage>` block from its result:

- If the block is present: `actual_tokens = input_tokens + output_tokens`. Compute `actual_cost = actual_tokens × (blended_rate / 1000)` at 4 decimal places.
- If the block is missing or unparseable: set `actual_tokens = "N/A"` and `actual_cost = "N/A"`. Log a warning: `"[agent_name] produced no <usage> block; token data unavailable"`. Exclude this agent from phase subtotal and grand total calculations.

Status remains `"complete"` in both cases — a missing usage block does not indicate agent failure.

**Step 5 — Compute Phase 3 subtotals.** Sum `est_tokens` and `est_cost` across all assessment agents (all rows, regardless of N/A status). Sum `actual_tokens` and `actual_cost` only across rows where actual values are numeric (exclude N/A rows). Format subtotal costs to 2 decimal places.

**Step 6 — Write `{PREFIX}-Token-Estimate.md`.** Write the complete file at `docs/assessments/{PREFIX}/{PREFIX}-Token-Estimate.md` using the template below. Replace all `{PREFIX}`, `{N}`, and `{placeholder}` markers with computed values.

```markdown
# Token Estimate — {PREFIX} — Assessment Pipeline

> Estimates computed before execution. Actuals accumulated as agents complete.
> Assessment agents (Phase 3) actuals: filled at end of phase.
> Intervention documentation (Phase 4) actuals: filled on completion.
> Remediation agents (Phase 6) actuals: filled progressively as agents complete.
> Orchestrator row added by assess-codebase skill at pipeline end.
> Pricing model: docs/pricing.md (80% input / 20% output split).

## Estimation model

| Parameter | Value |
|-----------|-------|
| Avg chars per token | 4 |
| Haiku system prompt | ~2,000 tokens |
| Sonnet system prompt | ~3,000 tokens |
| Base overhead per call | ~5,000 tokens |
| Input/output split | 80% / 20% |

## Assessment agents (Phase 3)

| Agent | Model | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) | Status |
|-------|-------|-------------|---------------|---------------|-----------------|--------|
{one row per assessment agent that ran — computed values from Steps 3 and 4 — status = "complete"}

## Intervention documentation (Phase 4)

> To be populated after Phase 4 completion.

| Agent | Model | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) | Status |
|-------|-------|-------------|---------------|---------------|-----------------|--------|

## Remediation agents — pending gate approval

No rows yet. This section will be populated after Phase 5 gate approval if remediation is approved.

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|-------------|---------------|---------------|-----------------|
| Assessment (Phase 3) | {est_tokens_total} | ${est_cost_total} | {actual_tokens_total} | ${actual_cost_total} |
| Intervention documentation (Phase 4) | — | — | — | — |
| Remediation (Phase 6) | — | — | — | — |

## Grand total

> Partial — updated at pipeline end.

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Total tokens | {est_tokens_total} | partial — updated at pipeline end |
| Total cost ($) | ${est_cost_total_2dp} | partial — updated at pipeline end |
```

After writing, verify the file is readable: attempt to read it back. If it is unreadable, log an error: `"[timestamp] ERROR: Token Estimate file unreadable after write — {path}: {error}"`. If the write itself fails (e.g., permission denied, disk full), log the error: `"[timestamp] ERROR: Failed to write Token Estimate file — {path}: {error}"` and continue — the pipeline does not halt due to a Token Estimate file I/O failure.

**Step 7 — Log the file write.** Append to the process log:

```
[timestamp] Phase 3 end: wrote Token Estimate file
  Assessment agents: {N} rows ({completed} complete, {na_count} with N/A actuals)
  Location: docs/assessments/{PREFIX}/{PREFIX}-Token-Estimate.md
```

Where `{N}` is the total number of assessment agents that ran, `{completed}` is the count with numeric actual tokens, and `{na_count}` is the count with `N/A` actual tokens.

---

## Phase 4 — Intervention Document Generation

Invoke `intervention-documentation-standard` with all produced assessment files and the prefix. It consolidates findings, deduplicates, and produces:
- `{PREFIX}-INT-NNN-{slug}.md` per intervention
- `{PREFIX}-Interventions-Index.md` (ordered by criticality and dependency)

### Append intervention-documentation row to Token Estimate file

After `intervention-documentation-standard` completes, update the Token Estimate file as follows.

**Step 1 — Extract actual tokens.** Read the `<usage>` block from the agent result: `actual_tokens = input_tokens + output_tokens`. Compute `actual_cost = actual_tokens × (blended_rate / 1000)` at 4 decimal places. If the block is missing or unparseable: set `actual_tokens = "N/A"` and `actual_cost = "N/A"`, and log a warning: `"intervention-documentation-standard produced no <usage> block; token data unavailable"`. Status remains `"complete"` regardless.

**Step 2 — Estimate tokens.** Apply the standard formula:

```
est_tokens = base_overhead (5,000) + system_prompt_weight (3,000 for sonnet) + (intervention_doc_size_bytes / 4)
```

If the total size of produced intervention documents is unknown at estimation time, use `~15,500` tokens as a typical estimate. Compute `est_cost = est_tokens × (blended_rate / 1000)` at 4 decimal places. If pricing data is unavailable, set both cost fields to `N/A`.

**Step 3 — Replace the placeholder section.** Open `{PREFIX}-Token-Estimate.md`. Find the "Intervention documentation (Phase 4)" section (the `> To be populated after Phase 4 completion.` placeholder row). Replace the empty table body with the actual row:

| Agent | Model | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) | Status |
|-------|-------|-------------|---------------|---------------|-----------------|--------|
| intervention-documentation-standard | sonnet | {est_tokens} | {est_cost} | {actual_tokens} | {actual_cost} | complete |

Remove the `> To be populated after Phase 4 completion.` note once the row is written.

**Step 4 — Log the completion.** Append to the process log:

```
[timestamp] Phase 4 end: appended intervention-documentation-standard row to Token Estimate file. Actual tokens: {N} | Cost: ${X.XXXX}
```

---

## Phase 5 — Remediation Gate

Follow `docs/procedures/assessment-approval-gate.md`. If user selects "Assessment only", skip to Phase 8 (Summary).

---

## Phase 6 — Remediation Implementation

### 6a. Create remediation branch
```
git checkout -b feature/{PREFIX}-remediation
```
Branch from `develop`.

### 6b. Build remediation execution plan

Read `{PREFIX}-Interventions-Index.md` for approved interventions, dependency order, and parallelism opportunities.

### 6c. Agent assignment

Map each intervention to an agent via its `Suggested Agent Assignment` section. Prefer specialised agents (`security-hardening`, `god-class-decomposition`, etc.) over generic `developer-backend`. Fall back to `developer-backend` for uncovered backend/infra interventions.

### 6d. Execution loop

For each approved intervention (respecting dependency order):
1. Dispatch assigned agent with: intervention document path + codebase path
2. Wait for completion
3. Invoke `review-solution` on all changed files
4. **PASS** (no CRITICAL): commit — `git commit -m "fix({PREFIX}): {INT-NNN} — {title}"`
5. **FAIL** (CRITICAL): one rework cycle, re-review. After 2 failed cycles: escalate to user
6. **WARNING/INFO**: log to Issues Register (see `docs/procedures/issues-register.md`)

### 6e. Token tracking during remediation

**At gate approval — replace the remediation placeholder**

Immediately after the user selects "Proceed with remediation" at the Phase 5 gate:

1. Read `{PREFIX}-Interventions-Index.md` to identify approved interventions and their assigned remediation agents.
2. Read `{PREFIX}-Approvals.md` to confirm the gate decision.
3. For each approved intervention, estimate tokens using the standard formula: `est_tokens = base_overhead (5,000) + system_prompt_weight (3,000 for sonnet) + (intervention_doc_size_bytes / 4)`. Use ~8,000 as a typical intervention document size estimate, giving ~13,000 total.
4. Compute `est_cost = est_tokens × (blended_rate / 1000)` at 4 decimal places using the blended formula from `docs/pricing.md`. If pricing data is unavailable, write `N/A`.
5. Open `{PREFIX}-Token-Estimate.md`. Find the "Remediation agents — pending gate approval" section and replace it entirely with a new "Remediation agents (Phase 6)" table. Write one row per intervention that will be dispatched:

| Agent | Task scope | Model | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) | Status |
|-------|------------|-------|-------------|---------------|---------------|-----------------|--------|
| {agent_name} | {INT-NNN} | sonnet | {est_tokens} | {est_cost} | pending | pending | pending |

6. Do not write a row for any intervention that is deferred and not dispatched — only dispatched interventions appear in the table.

**Progressive updates as agents complete**

As each remediation agent completes during Phase 6:

1. Extract its `<usage>` block: `actual_tokens = input_tokens + output_tokens`. If the block is missing or unparseable, set `actual_tokens = "N/A"` and `actual_cost = "N/A"`, and log a warning: `"[agent_name] produced no <usage> block; token data unavailable"`.
2. Locate the matching row in the Token Estimate file by agent name and task_scope.
3. Update the row: set `actual_tokens`, compute `actual_cost = actual_tokens × (blended_rate / 1000)` at 4 decimal places, and set `status = "complete"`. Preserve all other fields (estimated values remain unchanged).
4. Append to the process log:

```
[timestamp] Phase 6: updated {agent_name} row in Token Estimate. Actual tokens: N | Cost: $X.XXXX
```

**Rework cycle handling**

When a remediation agent is re-dispatched for rework on the same intervention:

- Do not update the original row.
- Append a new row immediately after the original with the agent name suffixed `" (rework)"` (e.g., `"god-class-decomposition (rework)"`). New row: `agent="{original_name} (rework)"` | same `task_scope` | model | new `est_tokens` (recomputed for rework scope) | new `est_cost` | `actual_tokens="pending"` | `actual_cost="pending"` | `status="pending"`.
- When the rework completes, update the rework row (not the original) with its actuals using the same progressive update procedure above.
- Both the original and rework rows are included in phase subtotals and accuracy statistics.
- Append to the process log:

```
[timestamp] Phase 6: {agent_name} rework dispatched for {INT-NNN}. New row appended.
```

---

## Phase 7 — Pull Request

1. Push: `git push -u origin feature/{PREFIX}-remediation`
2. Create PR targeting `develop`:
   ```
   gh pr create --title "fix({PREFIX}): codebase remediation" --body "$(cat <<'EOF'
   ## Assessment Summary
   - Assessment: {PREFIX} — {codebase description}
   - Total findings: N CRITICAL, N HIGH, N MEDIUM, N LOW
   - Source: docs/assessments/{PREFIX}/

   ## Remediation
   - Interventions approved: N / N proposed
   - Interventions implemented: N
   - Issues Register: {N} fixed, {N} deferred → see {PREFIX}-Issues.md

   ## Test plan
   - [ ] Build passes
   - [ ] Test suite passes
   - [ ] Manual verification of critical fixes
   EOF
   )"
   ```

---

## Phase 8 — Summary

```
📦 Assessment Manager — Run Summary
─────────────────────────────────────────────────────
Target: {codebase path}  |  Prefix: {PREFIX}
─────────────────────────────────────────────────────
Assessment:
  ✅ generic-software-assessment    → {PREFIX}-Generic-Assessment.md
  ✅ layered-architecture-assessment → {PREFIX}-Layer-Assessment.md
  ✅ concurrency-safety-assessment   → {PREFIX}-Concurrency-Assessment.md
─────────────────────────────────────────────────────
Findings:      N CRITICAL | N HIGH | N MEDIUM | N LOW
Interventions: N proposed | N approved
─────────────────────────────────────────────────────
Remediation:
  INT-001 ✅ PASS | INT-002 ✅ PASS | INT-003 ⏭ Deferred
  Issues: N fixed | N deferred → {PREFIX}-Issues.md
─────────────────────────────────────────────────────
Pull Request: 🔗 {PR URL}
Token usage:  {N} tokens  |  Est. cost: $N.NN  (see {PREFIX}-Token-Estimate.md)
Process log:  docs/assessments/{PREFIX}/{PREFIX}-process-log.txt
─────────────────────────────────────────────────────
```

---

## Guidelines

- **Read all procedures at startup** — `process-log.md`, `issues-register.md`, `assessment-approval-gate.md`, `token-estimation.md`
- **Token tracking — maintain an internal ledger keyed by agent name.** For each completed agent call: extract the `<usage>` block (input_tokens, output_tokens, model), compute `actual_tokens = input_tokens + output_tokens`, and record the result. If the block is absent or unparseable, record `actual_tokens = "N/A"` and log a warning — never halt because of a missing usage block. Estimate tokens for each agent BEFORE dispatch using `est_tokens = base_overhead (5,000) + system_prompt_weight (3,000 for sonnet, 2,000 for haiku) + (input_size_chars / 4)` and compute blended cost using the formula from `docs/pricing.md`. Exclude N/A rows from all cost totals and accuracy statistics; include them in the file as visible rows.
- **Assessment agents are read-only** — never modify source files during assessment phases
- **Never skip the Remediation Gate** — remediation cannot start without explicit approval
- **Assessment agents run in parallel** — they have no mutual dependencies
- **Prefer specialised remediation agents** over generic developer agents when available
- **Plan before executing** — always show the plan first
- **Fail fast on missing target** — if the target path does not exist, stop immediately
- **Partial assessments are acceptable** — if one agent fails, continue with others
- **Commit per intervention** — immediately after it passes review
- **PR targets `develop`** — never push directly; do NOT auto-merge
- **All output documents in English**
