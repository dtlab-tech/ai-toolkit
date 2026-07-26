# Rewrite Orchestrators as Workflow Scripts

## Feature ID
FTR-009

## Summary
Rewrite the `project-manager` and `assessment-manager` orchestrators as Claude Code Workflow scripts (JavaScript, `.claude/workflows/`) and update the `implement-feature` and `assess-codebase` skills to invoke those workflows. Worker agents remain unchanged. This eliminates the non-deterministic inline-execution behaviour that occurs when orchestrators are spawned as subagents at `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2`, enabling reliable per-agent token tracking and making FTR-007 per-agent model assignments effective in orchestrated pipelines.

## Problem Statement
The `project-manager` and `assessment-manager` agents are currently defined as `.md` files and are spawned as subagents by their respective skills. When spawned at depth 2 the Claude Code harness does not reliably call the `Agent` tool — it tends to execute all child agent logic inline in the same context instead. The consequences are:

1. **Per-agent token tracking never works.** Every agent's usage shows N/A in the Token-Estimate file because there is no agent boundary through which to capture `usage` data.
2. **Per-agent model assignment (FTR-007) has no real effect.** Without a genuine subagent spawn, the `model:` frontmatter of worker agents is not honoured — all work executes on whatever model the parent orchestrator is running.
3. **Non-determinism.** Whether the LLM decides to spawn or inline is unpredictable; pipeline behaviour varies across runs.

These are not cosmetic issues — they mean every pipeline run produces inaccurate cost data and ignores the cost-efficiency model mapping committed in FTR-007.

## Actors

| Actor | Role | Frequency |
|-------|------|-----------|
| Toolkit user (developer / tech lead) | Invokes `/implement-feature` or `/assess-codebase`; benefits from deterministic pipelines and accurate per-agent cost reporting | Every feature delivery or assessment run |
| Claude Code harness | Executes Workflow scripts; honours `agentType:` calls with real subagent boundaries and native `usage` data | Every pipeline invocation |
| Toolkit maintainer | Authors and maintains the workflow scripts and updated skills | Once (this change), then incrementally |

## Core Flow (Happy Path)

### Feature Delivery Pipeline (`/implement-feature`)

1. User invokes `/implement-feature docs/features/FTR-XXX-slug/feature.md`.
2. The skill reads the feature path, then invokes `pm-phase1` workflow synchronously.
3. `pm-phase1` runs: discovery (reads feature.md, existing docs), generates Requirements, Tech-Spec, validates docs, writes Effort-Estimate. Each worker agent is called via `agentType:`. Real `usage` data is accumulated.
4. `pm-phase1` returns its outputs and accumulated token usage to the skill.
5. Skill presents Gate 1 to the user (docs + estimates). Waits for explicit approval.
6. On approval, skill invokes `pm-phase2` workflow.
7. `pm-phase2` runs: generates Work Breakdown, detailed task estimates.
8. `pm-phase2` returns outputs and token usage to the skill.
9. Skill presents Gate 2 to the user (work breakdown + estimates). Waits for explicit approval.
10. On approval, skill invokes `pm-phase3` workflow.
11. `pm-phase3` runs: dispatches developer agents (backend, frontend, testing) per the work breakdown, runs `review-solution`, opens a PR. Accumulates token usage.
12. `pm-phase3` writes the final Token-Estimate file with real per-agent actuals and returns.
13. Skill reports the PR URL and final token summary to the user.

### Assessment Pipeline (`/assess-codebase`)

1. User invokes `/assess-codebase [path] [--scope=...]`.
2. Skill invokes `am-phase1` workflow.
3. `am-phase1` runs: discovery, parallel assessment agents (each via `agentType:`), `intervention-documentation-standard`, writes Effort-Estimate and Token-Estimate with per-agent actuals.
4. `am-phase1` returns to the skill with the intervention index and token summary.
5. Skill presents the Findings Gate to the user. Waits for explicit approval.
6. On approval, skill invokes `am-phase2` workflow.
7. `am-phase2` runs: writes Approvals file, updates REGISTRY.md, writes Assessment Summary.
8. `am-phase2` returns to the skill.
9. Skill confirms completion.

## Out of Scope

- Rewriting any worker agent `.md` files (`generate-requirements`, `developer-backend`, `developer-frontend`, `developer-testing`, `review-solution`, `generate-work-breakdown`, `validate-feature-docs`, `generate-tech-spec`, `generic-software-assessment`, `layered-architecture-assessment`, `concurrency-safety-assessment`, `intervention-documentation-standard`, etc.).
- Option A (standalone Node/Python SDK scripts) and Option B (subprocess CLI wrappers).
- Any CI/CD pipeline changes.
- Changing gate approval semantics — gate content and approval language remain identical to the current PM/AM behaviour.
- Introducing new worker agents or new pipeline phases.
- Changing the `feature.md` schema or any downstream document formats.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| A worker agent called via `agentType:` fails mid-phase | The workflow surfaces the error to the skill, which reports it to the user. No silent continuation. |
| User rejects at Gate 1 or the Findings Gate | The skill exits. No subsequent workflow phases are invoked. |
| A phase workflow is interrupted (e.g., context limit) | The skill reports the interruption. The user can re-invoke starting from the failed phase by passing a `--phase=N` flag (open question — see OQ-1). |
| `usage` data is missing from an agent call response | That agent's token row is written as N/A in the Token-Estimate rather than crashing the accumulation loop. |
| The `install-toolkit` agent runs against a destination project | Workflow scripts from `.claude/workflows/` are copied alongside agents, skills, and commands. The destination project's skills invoke workflows correctly. |
| Old `project-manager.md` / `assessment-manager.md` are present | They are deleted as part of this feature. The old files are not kept alongside the new workflows. |

## Data Model

This feature creates no new runtime data entities. It modifies the toolkit's file structure:

### New files

| Path | Type | Description |
|------|------|-------------|
| `.claude/workflows/pm-phase1.js` | Workflow script | Discovery + Requirements + Tech-Spec + Validation + Effort Estimate |
| `.claude/workflows/pm-phase2.js` | Workflow script | Work Breakdown + task-level estimates |
| `.claude/workflows/pm-phase3.js` | Workflow script | Implementation dispatch + Review + PR + Token-Estimate write |
| `.claude/workflows/am-phase1.js` | Workflow script | Discovery + parallel assessments + Intervention docs + Effort/Token Estimates |
| `.claude/workflows/am-phase2.js` | Workflow script | Approvals + Registry update + Assessment Summary |

### Modified files

| Path | Change |
|------|--------|
| `.claude/skills/implement-feature.md` | Replace PM subagent spawn with sequential `pm-phase1/2/3` workflow invocations; handle gate presentation in the main loop |
| `.claude/skills/assess-codebase.md` | Replace AM subagent spawn with sequential `am-phase1/2` workflow invocations; handle gate presentation in the main loop |
| `.claude/agents/install-toolkit.md` | Add `.claude/workflows/` to the list of directories copied to destination projects |
| `bin/cli.js` (if applicable) | Add `.claude/workflows/` to the install copy list |

### Deleted files

| Path | Reason |
|------|--------|
| `.claude/agents/project-manager.md` | Replaced by workflow scripts + updated skill |
| `.claude/agents/assessment-manager.md` | Replaced by workflow scripts + updated skill |

### Token-Estimate output format

The format is unchanged from the existing FTR-001/FTR-002 format. Data sourcing changes as follows:

- **Phase totals (exact):** each workflow's `subagent_tokens` from the task notification gives the real token count for that phase (pm-phase1, pm-phase2, pm-phase3 / am-phase1, am-phase2).
- **Per-agent rows (proportional):** individual agent rows within a phase are computed by distributing the phase total proportionally using the estimated weights from `docs/procedures/token-estimation.md`. Each such row is marked `*(proportional)*` and the Token-Estimate file includes a disclaimer: _"Per-agent values are proportional distributions of the phase total. Phase totals and grand total are exact measurements."_
- **Grand total (exact):** sum of all phase totals.

## Roles and Permissions

| Role | Permissions |
|------|-------------|
| Toolkit user | Invokes skills (read + write to `docs/features/`, `internal_docs/` as applicable); no new permissions required |
| Claude Code harness | Executes workflow scripts with the same tool access as the current orchestrator agents |
| Toolkit maintainer | Full read/write to `.claude/workflows/`, `.claude/skills/`, `.claude/agents/` |

No new permission scopes are introduced. Workflow scripts execute under the same tool-access model as the agents they replace.

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | `.claude/agents/` after this feature | The change is applied | `project-manager.md` and `assessment-manager.md` do not exist | Must |
| AC-02 | `.claude/workflows/` after the change | The change is applied | Files `pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js`, `am-phase1.js`, `am-phase2.js` exist and are valid JavaScript | Must |
| AC-03 | A full `/implement-feature` run on a real feature | The pipeline completes end-to-end | Token-Estimate contains non-N/A per-agent token rows for every worker agent invoked | Must |
| AC-04 | A full `/assess-codebase` run on a real target | The pipeline completes end-to-end | Token-Estimate contains non-N/A per-agent token rows for every assessment agent invoked | Must |
| AC-05 | The worker agents listed in the mapping (FTR-007) | A pipeline run completes | Each worker agent is dispatched on its declared `model:` (sonnet/haiku/opus as per FTR-007) — verifiable via logged usage model fields | Must |
| AC-06 | The `implement-feature` skill | A pipeline run reaches Gate 1 | Gate 1 content is presented in the main loop (not inside a subagent); the skill blocks until the user approves | Must |
| AC-07 | The `implement-feature` skill | A pipeline run reaches Gate 2 | Gate 2 content is presented in the main loop; the skill blocks until the user approves | Must |
| AC-08 | The `assess-codebase` skill | A pipeline run reaches the Findings Gate | Findings Gate content is presented in the main loop; the skill blocks until the user approves | Must |
| AC-09 | `install-toolkit` run against a destination project | The install completes | `.claude/workflows/` directory and all five workflow scripts are present in the destination | Must |
| AC-10 | All existing worker agent `.md` files | The change is applied | No worker agent file is modified — byte-for-byte identical to pre-change state | Must |

## MVP vs Deferred

### MVP (must ship)
- Five workflow scripts (`pm-phase1/2/3`, `am-phase1/2`) covering the complete existing pipeline logic.
- Updated `implement-feature.md` skill with gate handling in the main loop.
- Updated `assess-codebase.md` skill with Findings Gate handling in the main loop.
- Updated `install-toolkit.md` (and `bin/cli.js`) to copy `.claude/workflows/`.
- Deletion of `project-manager.md` and `assessment-manager.md`.
- Passing AC-01 through AC-10.

### Deferred (next iteration)
- Phase-resume flag (`--phase=N`) for recovering interrupted runs (see OQ-1).
- Workflow-level retry logic for transient agent failures.
- Parallel developer dispatch within `pm-phase3` (currently sequential per work breakdown domain).
- Any new pipeline phases or new worker agents.

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| OQ-1 | If `pm-phase3` is interrupted mid-implementation (e.g., context limit), should the skill support a `--phase=3 --resume` flag to re-enter from the last completed task? | Medium — affects recoverability on large features; can be deferred to a follow-up. |
| OQ-2 | ✅ RESOLVED — `budget.spent()` delta does not capture per-agent token data. Actual: the Workflow runtime exposes `subagent_tokens` at phase granularity (per workflow invocation) via the task notification, not per `agent()` call. Individual agent rows in Token-Estimate use proportional distribution of the phase total, clearly marked as estimated. Phase totals and grand total are exact. | — |
| OQ-3 | ✅ RESOLVED — Workflow scripts live in `.claude/workflows/` for symmetry with `.claude/agents/` and `.claude/skills/`. | — |

## Dependencies and Assumptions

- **FTR-007 (per-agent model assignment):** This feature assumes all worker agents carry correct `model:` frontmatter as set by FTR-007. FTR-009 makes those assignments effective; FTR-007 must be merged first.
- **Claude Code Workflow SDK:** Assumes the `Workflow` tool infrastructure supports `agentType:` calls that return `usage` data. This must be verified before implementation (see OQ-2).
- **No changes to document formats:** Requirements, Tech-Spec, Work Breakdown, Token-Estimate, and Effort-Estimate file formats are unchanged. Workflow scripts read and write the same schemas the current PM/AM agents use.
- **Convention note:** This is a toolkit-internal feature. Docs live in `internal_docs/features/FTR-009-workflow-orchestrators/` (excluded from npm distribution), not `docs/features/`.
- **Backward compatibility:** Any project that has already installed the toolkit will need to re-run `install-toolkit` to receive the workflow scripts. The old PM/AM agent files will remain in those projects until the next install. This is acceptable — old agent files are inert once the skill no longer invokes them.
