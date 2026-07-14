# Assessment Pipeline Token Estimation

## Feature ID
FTR-001

## Summary
Extend the assessment pipeline orchestrated by `assessment-manager` to produce a `{PREFIX}-Token-Estimate.md` file that tracks estimated and actual token usage (and cost) for every agent invoked during a run. The file is written at the end of Phase 3 (after all assessment agents complete) and progressively filled with actuals as each subsequent phase completes. The `assess-codebase` skill appends the orchestrator row and grand total at the very end, mirroring the pattern already used by `/implement-feature` for `project-manager`.

## Problem Statement
Currently the assessment pipeline logs token counts to `{PREFIX}-process-log.txt` but produces no structured cost summary file. Users and project managers cannot easily track how much a given assessment run cost, compare estimates vs actuals over time, or understand the per-agent cost breakdown. Without this artefact the pipeline cannot support cost governance, retrospectives, or estimation accuracy improvement loops.

## Actors

| Actor | Role | Frequency |
|-------|------|-----------|
| Project Manager / Tech Lead | Reviews cost summary post-run to track estimation accuracy and justify spend | After each pipeline run |
| Assessment Manager (orchestrator agent) | Writes and progressively updates the Token Estimate file throughout the pipeline | Every pipeline run |
| assess-codebase skill | Appends the orchestrator row and grand total at the very end of the run | Every pipeline run |
| Pipeline tooling / CI (future) | Reads the file to feed cost data into dashboards or budget alerts | Potential future consumer |

## Core Flow (Happy Path)

1. `assessment-manager` completes Phase 2 planning and shows the plan to the user.
2. All assessment agents run in parallel (Phase 3). While they run, the orchestrator accumulates token usage from each agent's `<usage>` block.
3. At the end of Phase 3 — after all assessment agents have completed — `assessment-manager` writes `{PREFIX}-Token-Estimate.md` to the assessment output directory. The file contains:
   - Estimation model parameters (from `docs/procedures/token-estimation.md`)
   - One row per assessment agent with: model, estimated tokens, estimated cost, actual tokens, actual cost, status = "complete"
   - A placeholder section "Remediation — pending gate approval" with no rows yet
   - Partial phase subtotals (assessment phase only)
   - Grand total rows marked "partial — updated at pipeline end"
4. Phase 4 (`intervention-documentation-standard`) runs. On completion, its row is appended to the file with actuals filled in.
5. Phase 5 — Remediation Gate. If the user selects "Assessment only", the skill skips to Phase 8 (Summary). The Token Estimate file already exists with assessment actuals; no remediation rows are added. The orchestrator row and final grand total are appended by `assess-codebase` before the summary is shown.
6. If remediation proceeds: after the gate, once interventions are approved, the placeholder section is replaced with one row per approved remediation agent call (with estimate only; actuals pending).
7. As each remediation agent completes, its actual tokens and cost are filled in progressively.
8. After the PR is created (Phase 7), `assess-codebase` appends:
   - The `assessment-manager` (orchestrator) row with actuals
   - The "Actuals vs Estimate" summary section
   - The "Estimation accuracy by agent type" table
   - The grand total (estimated vs actual vs delta)

## Out of Scope
- Token tracking for the feature delivery pipeline (`project-manager` / `/implement-feature`) — that pipeline already has its own mechanism; this feature is scoped to `assessment-manager` only.
- Automatic pricing updates — `docs/pricing.md` is updated manually; the estimation file reads it at write time and does not auto-refresh.
- Dashboard integration or CI budget-gate enforcement — the file is a markdown artefact only; downstream tooling is a future concern.
- Changing the `process-log.txt` format — token counts continue to be logged there as before; the Token Estimate file is additive, not a replacement.
- Token estimation for the `assessment-manager` orchestrator itself during the run — the orchestrator's own token count is only known at the very end and is appended by the skill.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| An assessment agent produces no `<usage>` block | Write "N/A" for actual tokens and cost for that row; exclude it from accuracy stats and cost totals. Log the missing data in the process log. |
| User aborts the pipeline after Phase 3 but before the gate | The Token Estimate file already exists with assessment actuals. It is left as-is (partial). No orchestrator row or grand total is appended. |
| User selects "Assessment only" at the gate | The file contains assessment + intervention-documentation-standard actuals. The skill appends the orchestrator row and grand total reflecting assessment-only scope. The "Remediation — pending gate approval" placeholder section remains (it is not replaced). |
| An approved intervention is later deferred (not dispatched) | No token row is written for that intervention. It appears in the Approvals file but not in the Token Estimate. |
| A remediation agent is retried (rework cycle) | Each invocation gets its own row with a "(rework)" suffix. Both rows are included in totals and accuracy stats. |
| `docs/pricing.md` is missing or malformed | The orchestrator logs a warning and writes "N/A" for all cost columns. Token counts are still recorded. |
| The assessment directory does not exist yet when Phase 3 ends | The orchestrator creates the directory before writing the file (same behaviour as for other output files). |

## Data Model

### Entities

**Token Estimate File** (`{PREFIX}-Token-Estimate.md`)
- Location: `docs/assessments/{PREFIX}/` (same directory as all other assessment output files)
- One file per assessment run
- Written at end of Phase 3; updated progressively

**Assessment agent row** (written at end of Phase 3 with both estimate and actual):

| Field | Type | Notes |
|-------|------|-------|
| agent | string | Agent name from frontmatter |
| model | string | From agent frontmatter; default "sonnet" |
| est_tokens | integer | Computed before dispatch using estimation model |
| est_cost | decimal (4dp) | Computed from est_tokens × blended rate |
| actual_tokens | integer | From `<usage>` block |
| actual_cost | decimal (4dp) | Computed from actual_tokens × blended rate |
| status | string | "complete" |

**Remediation agent row** (added after gate approval; actuals filled progressively):

| Field | Type | Notes |
|-------|------|-------|
| agent | string | Agent name + "(rework)" suffix if rework invocation |
| task_scope | string | INT-NNN identifier(s) handled by this invocation |
| model | string | From agent frontmatter |
| est_tokens | integer | Computed after gate, once intervention scope is known |
| est_cost | decimal (4dp) | |
| actual_tokens | integer or "pending" | Filled on completion |
| actual_cost | decimal (4dp) or "pending" | |
| status | string | "pending" → "complete" |

**Orchestrator row** (appended by `assess-codebase` skill at very end):

| Field | Type | Notes |
|-------|------|-------|
| agent | "assessment-manager (orchestrator)" | |
| model | sonnet | |
| est_tokens | integer | Estimated at plan time |
| actual_tokens | integer | From final `<usage>` block |
| status | "complete" | |

### Validation Rules

| Field | Rule |
|-------|------|
| est_tokens | Must be positive integer; computed using estimation model in `docs/procedures/token-estimation.md` |
| actual_tokens | Must be positive integer or "N/A" (if `<usage>` block missing) |
| cost (all) | 4 decimal places for per-row values; 2 decimal places for subtotals and grand total |
| model | Must match a model in `docs/pricing.md`; default to "sonnet" if not found |
| status | One of: "complete", "pending", "N/A" |

## Roles and Permissions

| Role | Permissions |
|------|-------------|
| assessment-manager (agent) | Create and update the Token Estimate file during the run |
| assess-codebase (skill) | Append the orchestrator row and grand total section after pipeline end |
| Human user | Read-only; no direct writes expected |

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A full assessment pipeline run completes (with remediation and PR) | The `assess-codebase` skill finishes | `{PREFIX}-Token-Estimate.md` exists in `docs/assessments/{PREFIX}/` and contains a row for every agent that ran, with both estimated and actual tokens/costs filled in, plus the orchestrator row and grand total | Must |
| AC-02 | The user selects "Assessment only" at the gate | The pipeline reaches its summary | `{PREFIX}-Token-Estimate.md` exists with assessment agent rows (actuals filled) and the orchestrator row appended; remediation section shows "pending gate approval" placeholder; grand total reflects assessment-only scope | Must |
| AC-03 | An assessment agent completes without a `<usage>` block | Phase 3 ends and the file is written | That agent's row shows "N/A" for actual tokens and actual cost; it is excluded from accuracy stats and cost totals; a warning appears in the process log | Must |
| AC-04 | Phase 3 ends (regardless of what happens next) | The file is first written | The file contains assessment agent rows with actuals, a "Remediation — pending gate approval" placeholder section, and partial grand total marked "partial — updated at pipeline end" | Must |
| AC-05 | A remediation agent is invoked a second time (rework) | The rework invocation completes | A second row for that agent appears with "(rework)" suffix; both rows are included in totals and accuracy stats | Must |
| AC-06 | An intervention is approved at the gate but later deferred (not dispatched) | The pipeline ends | No token row exists for that intervention in the Token Estimate file | Should |
| AC-07 | `docs/pricing.md` is missing | The orchestrator reaches any point requiring cost computation | All cost columns show "N/A"; token count columns are still populated; a warning is logged | Must |
| AC-08 | The estimation model produces a row before dispatch | Any agent's estimate row is written | The estimated cost is computed using the blended formula from `docs/pricing.md` with the 80/20 input/output split | Must |
| AC-09 | The pipeline completes with at least two agent types (e.g., haiku and sonnet) | The actuals section is written | The "Estimation accuracy by agent type" table shows a row per model tier with avg estimated, avg actual, avg delta, and trend | Should |

## MVP vs Deferred

### MVP (must ship)
- Write `{PREFIX}-Token-Estimate.md` at end of Phase 3 with assessment agent rows (estimates + actuals)
- "Remediation — pending gate approval" placeholder section at Phase 3 write time
- Progressive filling of remediation rows after gate approval
- `assess-codebase` skill appends orchestrator row + grand total at pipeline end
- "Assessment only" path: file is complete (assessment actuals + orchestrator row) with no remediation rows
- Handle missing `<usage>` blocks gracefully (N/A + process log warning)
- Handle missing `docs/pricing.md` gracefully (N/A costs + process log warning)
- "Actuals vs Estimate" section and "Estimation accuracy by agent type" table appended at end

### Deferred (next iteration)
- Historical trend across multiple runs (e.g., comparing ASSESS-001 vs ASSESS-002 accuracy)
- Machine-readable output format (JSON/CSV export) for dashboard integration
- Per-phase cost budget thresholds with configurable alerts
- Automatic pricing refresh from provider API

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Should the `intervention-documentation-standard` agent's row be included in the "Assessment phase" subtotal or in a separate "Intervention documentation" phase row? It runs after assessments but before the gate. | Affects phase subtotal grouping in the file template |
| 2 | When a remediation agent handles multiple interventions in one call (batched), is the row keyed by agent name or by INT-NNN? If batched, how are tokens attributed per intervention? | Affects remediation row schema; answer may need to come from how `assessment-manager` dispatches agents |

## Dependencies and Assumptions
- `docs/procedures/token-estimation.md` defines the estimation model parameters (chars-per-token, system prompt weights, base overhead) — this feature does not change that file; it extends its usage to the assessment pipeline.
- `docs/pricing.md` is the authoritative source for model pricing; the Token Estimate file reads it at write time.
- The `<usage>` block from each agent call is the authoritative source for actual token counts.
- The assessment output directory (`docs/assessments/{PREFIX}/`) is created by `assessment-manager` before Phase 3 ends; this feature assumes that directory always exists by the time the Token Estimate file is written.
- The existing `process-log.md` procedure continues unchanged; the Token Estimate file is additive.
- The file format mirrors `docs/procedures/token-estimation.md`'s template, adapted for the assessment pipeline's agent set.
