# Technical Specification — Explicit Per-Agent Model Assignment

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-007 — Explicit Per-Agent Model Assignment |
| Version | 1.0 |
| Date | 2026-07-24 |
| Status | Draft |

## 1. Overview

This feature adds a single YAML frontmatter key, `model:`, to the 15 agent-definition Markdown files under `.claude/agents/` that currently lack one. It is a pure configuration change to static, version-controlled files. No runtime code, prompt bodies, pipeline logic, or orchestration behavior is affected. There is no application backend, frontend, database, or API surface involved — the only consumer of the field is the Claude Code harness at agent-dispatch time.

> Note: This project has no `AGENTS.md` (it is the toolkit repository itself, not a target project consuming the toolkit). The "tech stack" here is the toolkit's own agent-definition format: Markdown files with a YAML frontmatter block delimited by `---`.

## 2. Architecture

### 2.1 System Context

The `.claude/agents/*.md` files are agent definitions. Each has a YAML frontmatter block (keys such as `name`, `description`, `tools`, and optionally `model`) followed by the agent's system-prompt body. When a pipeline (e.g. `/implement-feature`, `/assess-codebase`) or a direct invocation spawns an agent, the Claude Code harness reads that agent's frontmatter and, if a `model:` key is present, dispatches the subagent on the declared model. If absent, the subagent inherits the session's active model (frequently Opus).

### 2.2 Component Diagram

```
[Pipeline / user invocation]
        --(spawn agent X)--> [Claude Code harness]
                                   --(read .claude/agents/X.md frontmatter)-->
                                   --(model: present? dispatch on declared model : inherit session model)-->
                             [Subagent X running on selected model]
```

### 2.3 Sequence Diagrams

```
Maintainer -> Repo: add "model:" line to 15 frontmatter blocks
Maintainer -> Shell: grep -L "^model:" .claude/agents/*.md   (expect empty)
Maintainer -> Shell: enumerate all model: values             (expect ⊆ {haiku,sonnet,opus})
--- later, at runtime ---
Harness -> AgentFile: read frontmatter
AgentFile -> Harness: model: sonnet | opus | haiku
Harness -> Subagent: dispatch on declared model
```

## 3. Backend

Not applicable — no application backend. The subsections below are retained per template and marked N/A.

### 3.1 Data Model
N/A. The only "data" is the `model` frontmatter key (string, ∈ {haiku, sonnet, opus}).

### 3.2 DTOs / Response Models
N/A.

### 3.3 Validation
The acceptance validation is performed by shell commands, not application code:
- `grep -L "^model:" .claude/agents/*.md` must return nothing.
- Every `model:` value must be one of `{haiku, sonnet, opus}`.

### 3.4 API Endpoints
N/A — no endpoints.

### 3.5 Services
N/A.

### 3.6 Mapping / Transformations
N/A.

### 3.7 Dependency Registration
N/A.

## 4. Frontend
Not applicable — no UI, routes, components, pages, i18n, or types.

## 5. External Integrations

The Claude Code harness is the only external consumer. It reads the `model:` key and dispatches subagents accordingly. Contract: the harness honors a bare alias (`haiku`/`sonnet`/`opus`) — validated by the 7 agents already using `model: haiku`. No network integration, auth, or rate limiting is involved.

## 6. Security Considerations

None. The change edits static configuration files under version control. No authentication, authorization, input validation, or sensitive-data handling is affected. No secrets are introduced.

## 7. Database Changes
None.

## 8. Configuration

The change *is* configuration: one YAML key per file. No environment variables, app settings, or feature flags.

### The model mapping (the entire change)

**Assign `model: sonnet` (14 agents):**

| # | Agent file |
|---|------------|
| 1 | `assessment-manager.md` |
| 2 | `project-manager.md` |
| 3 | `developer-backend.md` |
| 4 | `developer-frontend.md` |
| 5 | `developer-testing.md` |
| 6 | `god-class-decomposition.md` |
| 7 | `domain-model-refactoring.md` |
| 8 | `dependency-injection-refactoring.md` |
| 9 | `security-hardening.md` |
| 10 | `dependency-supply-chain-security.md` |
| 11 | `define-feature.md` |
| 12 | `init-agents-md.md` |
| 13 | `install-toolkit.md` |
| 14 | `intervention-documentation-standard.md` |

**Assign `model: opus` (1 agent):**

| # | Agent file |
|---|------------|
| 15 | `review-solution.md` |

**Leave unchanged — `model: haiku` (7 agents, OUT OF SCOPE):**
`concurrency-safety-assessment`, `generate-requirements`, `generate-tech-spec`, `generate-work-breakdown`, `generic-software-assessment`, `layered-architecture-assessment`, `validate-feature-docs`.

### Placement rule
Insert the `model:` line inside the existing `---` delimited frontmatter block. Convention (matching the 7 existing agents): place it immediately after the `description:` line and before `tools:`. No blank lines added or removed; no other line changed.

## 9. File Inventory

### New files
| Path | Purpose |
|------|---------|
| (none) | This feature creates no new source files. Feature docs live in `internal_docs/features/FTR-007-explicit-per-agent-model-assignment/`. |

### Modified files
| Path | Change description |
|------|-------------------|
| `.claude/agents/assessment-manager.md` | add `model: sonnet` to frontmatter |
| `.claude/agents/project-manager.md` | add `model: sonnet` |
| `.claude/agents/developer-backend.md` | add `model: sonnet` |
| `.claude/agents/developer-frontend.md` | add `model: sonnet` |
| `.claude/agents/developer-testing.md` | add `model: sonnet` |
| `.claude/agents/god-class-decomposition.md` | add `model: sonnet` |
| `.claude/agents/domain-model-refactoring.md` | add `model: sonnet` |
| `.claude/agents/dependency-injection-refactoring.md` | add `model: sonnet` |
| `.claude/agents/security-hardening.md` | add `model: sonnet` |
| `.claude/agents/dependency-supply-chain-security.md` | add `model: sonnet` |
| `.claude/agents/define-feature.md` | add `model: sonnet` |
| `.claude/agents/init-agents-md.md` | add `model: sonnet` |
| `.claude/agents/install-toolkit.md` | add `model: sonnet` |
| `.claude/agents/intervention-documentation-standard.md` | add `model: sonnet` |
| `.claude/agents/review-solution.md` | add `model: opus` |

## 10. Testing Strategy

No automated unit/integration tests (no runtime code). Verification is command-based and constitutes the acceptance test:

1. **Coverage** — `grep -L "^model:" .claude/agents/*.md` returns nothing (AC-01).
2. **Validity** — enumerate `grep -h "^model:" .claude/agents/*.md | sort | uniq -c`; every value ∈ {haiku, sonnet, opus} (AC-02).
3. **Sonnet targets** — each of the 14 listed files shows `model: sonnet` (AC-03).
4. **Opus target** — `review-solution.md` shows `model: opus` (AC-04).
5. **Haiku untouched** — the 7 pre-set files still show `model: haiku` and `git diff` shows no change to them (AC-05).
6. **Minimal diff** — `git diff` shows exactly one added `model:` line per edited file, nothing else (AC-06).

## 11. Implementation Order

1. Confirm the authoritative file list — `grep -L "^model:" .claude/agents/*.md` (expect 15) — depends on: nothing.
2. Add `model: sonnet` to the 14 coordination/implementation agents — depends on: 1.
3. Add `model: opus` to `review-solution.md` — depends on: 1.
4. Run all verification commands (AC-01..AC-06) — depends on: 2, 3.
5. Architect review of the diff — depends on: 4.

All 15 edits are mutually independent and may be applied in a single batch.

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| A `model:` value is misspelled | Harness may reject/mis-dispatch the agent | AC-02 verification enumerates every value against {haiku, sonnet, opus}; correct and re-verify. |
| A non-`model:` line is accidentally modified | Behavioral regression | AC-06 requires `git diff` to show only added `model:` lines; use exact single-line frontmatter insertion. |
| Harness does not honor a bare alias | Agents fail to dispatch | Contract validated by the 7 existing `model: haiku` agents; no pinned IDs (OQ-1). |
| Editing one of the 7 out-of-scope haiku files | Scope violation | BR-01: only the 15 files returned by `grep -L` are edited; AC-05 verifies the 7 are unchanged. |
| `sonnet` under-serves the two orchestrators on large features | PM planning regression | OQ-2 decision; reversible in one line per orchestrator. |
| No prior-feature conflict | — | Registry (FTR-001..005) touches prompt bodies/procedures, never `model:` frontmatter — disjoint surface. |
