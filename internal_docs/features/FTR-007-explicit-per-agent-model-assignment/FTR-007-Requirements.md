# Functional Requirements — Explicit Per-Agent Model Assignment

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-007 — Explicit Per-Agent Model Assignment |
| Version | 1.0 |
| Date | 2026-07-24 |
| Status | Draft |

## 1. Introduction

### 1.1 Purpose
This document specifies the functional requirements for adding an explicit `model:` field to the YAML frontmatter of the 15 toolkit agents in `.claude/agents/` that currently lack one. The goal is a pure cost-efficiency configuration change: every agent declares the model appropriate to its role instead of silently inheriting the session's active model (frequently Opus).

### 1.2 Scope

**In scope:**
- Adding a `model:` frontmatter key to exactly the 15 agent files that currently lack one.
- Applying the values from the mapping: `model: sonnet` to 14 agents, `model: opus` to 1 agent (`review-solution`).
- Verifying that all 22 agents declare a model and every value is one of `{haiku, sonnet, opus}`.

**Out of scope:**
- The 7 agents already carrying `model: haiku` (untouched).
- Any edit to agent prompt bodies (instructions, phases, examples).
- Any other frontmatter key (`name`, `description`, `tools`, etc.).
- Any behavioral, pipeline, or orchestration logic change.
- Reconsidering whether `haiku` is correct for the 7 pre-set agents.
- Any non-supported frontmatter field (e.g. `budget:`).
- Model assignment for OPT-02, OPT-03, OPT-04 or other backlog items.

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| Toolkit user (developer / tech lead) | Runs the toolkit's agents and pipelines; benefits from lower token cost per run. |
| Claude Code harness | Reads each agent's `model:` frontmatter and dispatches the subagent on the declared model at spawn time. |
| Toolkit maintainer | Owns the agent frontmatter; applies and verifies the model mapping (this change). |

## 2. Use Cases

### UC-01: Add explicit model field to agents missing one

| Field | Value |
|-------|-------|
| Actor | Toolkit maintainer |
| Preconditions | 15 agent files under `.claude/agents/` have no `model:` key in their YAML frontmatter; 7 already carry `model: haiku`. |
| Trigger | The maintainer applies FTR-007. |
| Priority | Must |

**Main flow:**
1. Identify the authoritative list of files to edit via `grep -L "^model:" .claude/agents/*.md` (returns exactly 15 files).
2. For each of the 14 sonnet-target agents, add `model: sonnet` to the existing YAML frontmatter block (between the `---` delimiters).
3. For `review-solution`, add `model: opus`.
4. Leave prompt bodies and all other frontmatter keys byte-for-byte identical.
5. Save each file.

**Alternative flows:**
- An agent file has no frontmatter block at all → add a proper `---` delimited block with the `model:` value rather than a bare line, then re-read to verify. (Not expected — all 22 have frontmatter.)

**Error flows:**
- A `model:` value is misspelled (e.g. `sonnett`) → rejected by the acceptance check requiring every value ∈ {haiku, sonnet, opus}; correct and re-verify.
- A file thought to be missing already has `model:` → the `grep -L` list is authoritative; only files it returns are edited.

**Postconditions:**
- All 22 agents declare a model. The 15 edited files differ from their prior version only by the added `model:` line.

### UC-02: Verify model assignment coverage and validity

| Field | Value |
|-------|-------|
| Actor | Toolkit maintainer |
| Preconditions | UC-01 edits applied. |
| Trigger | The maintainer runs the verification commands. |
| Priority | Must |

**Main flow:**
1. Run `grep -L "^model:" .claude/agents/*.md` — confirm it returns nothing.
2. Enumerate every `model:` value across all 22 agents — confirm each ∈ {haiku, sonnet, opus}.
3. Confirm the 14 sonnet-target agents each declare `model: sonnet`.
4. Confirm `review-solution` declares `model: opus`.
5. Confirm the 7 pre-set agents still declare `model: haiku` and are otherwise unchanged.

**Alternative flows:**
- Verification finds a missing or invalid value → return to UC-01, correct, re-verify.

**Error flows:**
- `grep -L` returns one or more files → those files were not edited correctly; edit and re-verify.

**Postconditions:**
- All acceptance criteria AC-01 through AC-06 pass.

### UC-03: Harness dispatches each agent on its declared model

| Field | Value |
|-------|-------|
| Actor | Claude Code harness |
| Preconditions | UC-01 and UC-02 complete. |
| Trigger | A pipeline run or individual agent invocation spawns an agent. |
| Priority | Must |

**Main flow:**
1. The harness reads the spawned agent's `model:` frontmatter.
2. The harness dispatches the subagent on the declared model rather than inheriting the session model.

**Postconditions:**
- Coordination and implementation agents run on `sonnet`; `review-solution` runs on `opus`; the 7 assessment/generation agents run on `haiku`.

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | The authoritative list of files to edit is exactly the 15 returned by `grep -L "^model:" .claude/agents/*.md`. Only those files are edited. | UC-01 |
| BR-02 | Every `model:` value across all 22 agents must be one of `{haiku, sonnet, opus}`. | UC-01, UC-02 |
| BR-03 | The `model:` value is a bare alias (e.g. `sonnet`), never a pinned model ID — matching the repo's existing `model: haiku` convention (OQ-1). | UC-01 |
| BR-04 | The 14 coordination/implementation agents receive `model: sonnet`. | UC-01 |
| BR-05 | `review-solution` receives `model: opus` (the only role requiring deep architectural judgment). | UC-01 |
| BR-06 | The 7 agents already on `model: haiku` are not touched. | UC-01 |
| BR-07 | In each edited file, only the added `model:` line may differ from the pre-change version; prompt bodies and other frontmatter keys stay identical. | UC-01 |
| BR-08 | The two orchestrators (`assessment-manager`, `project-manager`) receive `sonnet`, not `opus` (OQ-2); the orchestrator's model does not cascade to spawned subagents. | UC-01 |

## 4. Data Requirements

### 4.1 Entities

Not applicable as runtime data. The only artifacts modified are 15 Markdown agent-definition files under `.claude/agents/`. Each gains one YAML frontmatter key:

| Field | Type | Constraint |
|-------|------|------------|
| `model` (frontmatter key) | string | Must be one of `haiku`, `sonnet`, `opus` |

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| `model` | Present in every agent file (`grep -L "^model:"` returns nothing). |
| `model` | Value ∈ {haiku, sonnet, opus}; bare alias, not a pinned ID. |

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Cost efficiency | Coordination and implementation agents must no longer default to Opus; they run on Sonnet (~1.7× cheaper) and Haiku where already set. `review-solution` remains Opus by deliberate choice. |
| NFR-02 | Consistency | The model-selection pattern already applied to 7 agents is applied uniformly across the full 22-agent catalog. |
| NFR-03 | Maintainability | Model choice is reversible in a single line per agent. Bare aliases auto-track promotional model versions. |
| NFR-04 | Non-regression | No prompt body, behavior, pipeline, or orchestration logic changes; the diff is limited to added `model:` lines. |
| NFR-05 | Compatibility | Bare `model:` aliases must be honored by the Claude Code harness (validated by the 7 agents already using `model: haiku`). |

## 6. UI Requirements

### 6.1 Pages / Screens
Not applicable. This feature has no interactive end-user flow or UI.

### 6.2 Navigation Flow
Not applicable.

## 7. Acceptance Criteria

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-01 | Given the 15 agents currently missing a `model:` field, when the change is applied, then `grep -L "^model:" .claude/agents/*.md` returns nothing (all 22 declare a model). | UC-01, UC-02 |
| AC-02 | Given all 22 agent files, when the change is applied, then every `model:` value is one of `{haiku, sonnet, opus}`. | UC-02 |
| AC-03 | Given the 14 sonnet-target agents, when the change is applied, then each declares `model: sonnet`. | UC-01, UC-02 |
| AC-04 | Given the `review-solution` agent, when the change is applied, then it declares `model: opus`. | UC-01, UC-02 |
| AC-05 | Given the 7 agents already on `model: haiku`, when the change is applied, then their files are unchanged (still `model: haiku`). | UC-01, UC-02 |
| AC-06 | Given each of the 15 edited files, when the change is applied, then only the added `model:` line differs from the pre-change version; prompt bodies and other frontmatter keys are unchanged. | UC-01 |

## 8. Dependencies & Assumptions

- **No dependencies.** OPT-01 is standalone (backlog: "Dipendenze: nessuna").
- **Assumption:** The Claude Code harness honors a bare `model:` alias in agent frontmatter (validated by the 7 agents already using `model: haiku`).
- **Assumption:** The authoritative list of files to edit is exactly the 15 returned by `grep -L "^model:" .claude/agents/*.md` (verified: 15 files).
- **Registry note:** No prior feature (FTR-001..005) touches agent `model:` frontmatter — those features modify agent prompt bodies and procedures. No overlap, dependency, or conflict.
- **Convention note:** As one of the toolkit's own features, FTR-007 docs live in `internal_docs/features/` (dev workspace, excluded from npm), not `docs/features/`.

## 9. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| — | (none open) | — | OQ-1 (bare alias) and OQ-2 (sonnet for orchestrators) were RESOLVED by the user 2026-07-24 per feature.md. |
