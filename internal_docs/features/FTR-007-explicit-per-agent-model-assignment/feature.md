# Explicit Per-Agent Model Assignment

## Feature ID
FTR-007

> Source: OPT-01 in `docs/token-optimization-backlog.md` (derived from `docs/token-optimization.md`, 2026-07-24).

## Summary
Add an explicit `model:` field to the YAML frontmatter of the 15 toolkit agents that currently lack one, so that every agent declares the model appropriate to its role instead of silently inheriting the session's model (frequently Opus). This is a pure cost-efficiency change to agent configuration: no prompt bodies, no behavior, and no runtime logic are altered. It makes the model-selection pattern already applied to 7 agents (`haiku`) consistent across the entire agent catalog.

## Problem Statement
Of the 22 agents in `.claude/agents/`, 15 have no `model:` field in their frontmatter — including the two heavyweight orchestrators (`assessment-manager`, `project-manager`). An agent without an explicit model inherits the session's active model, which is often Opus. Per `docs/pricing.md` blended rates, Opus costs roughly 5x Haiku and 1.7x Sonnet per token. Running coordination and implementation agents on Opus by default wastes tokens with no quality benefit.

This is not an active bug — nothing is broken. It is a recurring cost inefficiency paid on every pipeline run (`/implement-feature`, `/assess-codebase`, and individual agent invocations), potentially many times per day. The toolkit already sets `model: haiku` on 7 assessment/generation agents, proving the pattern is viable; it is simply applied inconsistently.

## Actors

| Actor | Role | Frequency |
|-------|------|-----------|
| Toolkit user (developer / tech lead) | Runs the toolkit's agents and pipelines; benefits from lower token cost per run | Every session, potentially many times a day |
| Claude Code harness | Reads each agent's `model:` frontmatter and dispatches the subagent on the declared model | Every agent spawn |
| Toolkit maintainer | Owns the agent frontmatter; applies and verifies the model mapping | Once (this change) |

## Core Flow (Happy Path)
This feature has no interactive end-user flow. The "flow" is the configuration change and its verification:

1. Maintainer opens each of the 15 agent files missing a `model:` field.
2. For each file, a `model:` line is added to the existing YAML frontmatter block (between the `---` delimiters), with the value from the mapping below.
3. No other line in any file is changed — prompt bodies and all other frontmatter keys remain byte-for-byte identical.
4. Verification command `grep -L "^model:" .claude/agents/*.md` returns nothing (every agent now declares a model).
5. Every `model:` value across all 22 agents is one of `{haiku, sonnet, opus}`.
6. On the next pipeline run, each agent is dispatched on its declared model instead of inheriting the session model.

## Model Mapping (the change)

### Assign `model: sonnet` (14 agents)
Coordination and implementation roles — capable work that does not require top-tier architectural judgment:

- `assessment-manager`
- `project-manager`
- `developer-backend`
- `developer-frontend`
- `developer-testing`
- `god-class-decomposition`
- `domain-model-refactoring`
- `dependency-injection-refactoring`
- `security-hardening`
- `dependency-supply-chain-security`
- `define-feature`
- `init-agents-md`
- `install-toolkit`
- `intervention-documentation-standard`

### Assign `model: opus` (1 agent)
- `review-solution` — the only role requiring deep architectural judgment.

### Leave unchanged (`model: haiku`, 7 agents — already set, OUT OF SCOPE)
- `concurrency-safety-assessment`
- `generate-requirements`
- `generate-tech-spec`
- `generate-work-breakdown`
- `generic-software-assessment`
- `layered-architecture-assessment`
- `validate-feature-docs`

## Out of Scope
- The 7 agents already carrying `model: haiku` — not touched.
- Any edit to agent prompt bodies (instructions, phases, examples).
- Any other frontmatter key (`name`, `description`, `tools`, etc.).
- Any behavioral, pipeline, or orchestration logic change.
- Reconsidering whether `haiku` is the right model for the 7 pre-set agents.
- Introducing a `budget:` or any other non-supported frontmatter field.
- Model assignment for OPT-02, OPT-03, OPT-04, and any other backlog item (separate features).

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| An agent file has no frontmatter block at all | Not expected (all 22 have frontmatter); if encountered, add a proper `---` delimited block with the `model:` value rather than a bare line. Verify by re-reading. |
| A `model:` value is misspelled (e.g. `sonnett`) | Rejected — the acceptance check requires every value ∈ {haiku, sonnet, opus}. |
| A file already has `model:` but was thought to be missing | The `grep -L "^model:"` list is authoritative; only files it returns are edited. Confirmed list = 15 files. |
| Frontmatter uses pinned model IDs elsewhere | The repo's existing 7 agents use bare aliases (`haiku`); follow that same alias convention for consistency (see Open Questions). |

## Data Model
Not applicable. This feature creates, reads, updates, and deletes no runtime data. The only artifacts modified are 15 Markdown agent-definition files under `.claude/agents/`. Each gains one YAML key:

| Field | Type | Constraint |
|-------|------|------------|
| `model` (frontmatter key) | string | Must be one of `haiku`, `sonnet`, `opus` |

## Roles and Permissions
Not applicable. No user-facing permission model. The change is to static configuration files under version control; the only "actor" that reads the field is the Claude Code harness at agent-dispatch time.

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | The 15 agents currently missing a `model:` field | The change is applied | `grep -L "^model:" .claude/agents/*.md` returns nothing (all 22 agents declare a model) | Must |
| AC-02 | All 22 agent files | The change is applied | Every `model:` value is one of `{haiku, sonnet, opus}` | Must |
| AC-03 | The 14 sonnet-target agents listed in the mapping | The change is applied | Each declares `model: sonnet` | Must |
| AC-04 | The `review-solution` agent | The change is applied | It declares `model: opus` | Must |
| AC-05 | The 7 agents already on `model: haiku` | The change is applied | Their files are unchanged (still `model: haiku`) | Must |
| AC-06 | Each of the 15 edited files | The change is applied | Only the added `model:` line differs from the pre-change version; prompt bodies and other frontmatter keys are unchanged | Must |

## MVP vs Deferred

### MVP (must ship)
- All 15 `model:` assignments per the mapping (14 sonnet + 1 opus).
- Passing AC-01 through AC-06.

### Deferred (next iteration / separate backlog items)
- OPT-02: deduplicate global vs project CLAUDE.md.
- OPT-03: "Compact instructions" block in CLAUDE.md.
- OPT-04: move catalogs from CLAUDE.md to reference.md.
- Any future re-tuning of per-agent model choices based on observed quality/cost.

## Open Questions (RESOLVED)

| # | Question | Decision | Impact |
|---|----------|----------|--------|
| OQ-1 | Should the `model:` value be a bare alias (`sonnet`) or a pinned model ID? | **Bare alias** — confirmed by user 2026-07-24. Aliases auto-track promotional model versions and match the repo's 7 existing agents (`haiku`). No pinned IDs. | Low |
| OQ-2 | Is `sonnet` the right tier for the two orchestrators (`assessment-manager`, `project-manager`), or should they be `opus` for coordination robustness? | **`sonnet`** — confirmed by user 2026-07-24. Orchestration is coordination/dispatch work, not deep architectural reasoning (which is delegated to specialized agents, each with its own model). The orchestrator's model does not cascade to spawned subagents. Aligns with Anthropic's "Sonnet for coordination" guidance and backlog OPT-01. Reversible in one line if PM planning regresses on large features. | Low-medium |

## Dependencies and Assumptions
- **No dependencies.** OPT-01 is standalone (per the backlog: "Dipendenze: nessuna").
- **Assumption:** The Claude Code harness honors a bare `model:` alias in agent frontmatter (validated by the 7 agents already using `model: haiku`).
- **Assumption:** The authoritative list of files to edit is exactly the 15 returned by `grep -L "^model:" .claude/agents/*.md` (verified: 15 files).
- **Convention note:** This is one of the toolkit's OWN features, so its docs live in `internal_docs/features/` (development workspace, excluded from npm), not `docs/features/` (which is for target-project features). Verified against FTR-005's feature.md and the existing FTR-001..006 folders.
