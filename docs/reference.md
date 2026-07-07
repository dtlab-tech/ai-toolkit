# SWF AI Toolkit — Quick Reference

Cheatsheet of every skill, command, agent, and procedure shipped with this toolkit. For the full integration guide see [`CLAUDE.md`](../CLAUDE.md). For installation see [`installation.md`](installation.md).

---

## When do I use what?

| You want to… | Use |
|---|---|
| Start a new feature from scratch | Skill `/define-feature` (produces `feature.md`) |
| Run the full delivery pipeline end-to-end | Skill `/implement-feature` |
| Onboard a new project to the toolkit | Skill `/init-agents` |
| Copy the toolkit into another folder | Skill `/install-toolkit` |
| See what's left on a feature | Command `/feature-status <slug>` |
| Verify docs are consistent | Command `/check-docs <slug>` |
| Draft a PR description | Command `/pr-description` |
| Pick the next task to tackle | Command `/next-task [slug]` |
| Implement a single backend task | Agent `developer-backend` |
| Implement a single frontend task | Agent `developer-frontend` |
| Write tests for a task | Agent `developer-testing` |
| Get an architect-level code review | Agent `review-solution` |

---

## Skills (in `.claude/skills/`)

Invoked as `/<name>`. Comprehensive workflows that may chain multiple agents.

| Skill | Purpose | Typical usage |
|---|---|---|
| `/define-feature` | Interviews you to produce `feature.md` (from Matt Pocock's skills) | `/define-feature` then answer the prompts |
| `/init-agents` | Analyzes the codebase and generates `AGENTS.md` (the conventions file the toolkit depends on) | Run once per new project |
| `/install-toolkit` | Copies agents/skills/commands/procedures into a destination project | `/install-toolkit /path/to/dest [--force]` |
| `/implement-feature` | Full pipeline: requirements → tech-spec → approval → work breakdown → implementation → review → PR | `/implement-feature docs/features/FTR-001-foo/feature.md` |

---

## Commands (in `.claude/commands/`)

Invoked as `/<name>`. Lightweight shortcuts focused on the current state of the repo. Do **not** spawn long-running workflows.

| Command | Purpose | Args |
|---|---|---|
| `/feature-status` | Tabella ✅/⚠️/❌ degli artefatti di una feature + prossimi step | `<feature-slug>` |
| `/check-docs` | Inconsistenze tra `feature.md`, `requirements.md`, `tech-spec.md`. Solo i gap. | `<feature-slug>` |
| `/pr-description` | Genera PR description da branch + commit + feature.md collegata | (nessuno) |
| `/next-task` | Prossimo task non bloccato dal work breakdown + agent suggerito | `[feature-slug]` (opzionale) |

---

## Agents (in `.claude/agents/`)

Invoked via the Agent tool with `subagent_type`. Specialised sub-conversations that produce a single deliverable.

### Bootstrap

| `subagent_type` | What it produces |
|---|---|
| `install-toolkit` | Toolkit files copied into a destination |
| `init-agents-md` | `AGENTS.md` for a new project |

### Feature pipeline

| `subagent_type` | Input | Output |
|---|---|---|
| `define-feature` | User answers | `feature.md` |
| `generate-requirements` | `feature.md` | `requirements.md` |
| `generate-tech-spec` | `feature.md` + `requirements.md` | `tech-spec.md` |
| `validate-feature-docs` | All three above | Validation report + targeted revisions |
| `generate-work-breakdown` | Approved docs | `work-breakdown.md` (user stories + tasks) |
| `project-manager` | `feature.md` path | Orchestrates the whole pipeline |

### Implementation

| `subagent_type` | Domain | Notes |
|---|---|---|
| `developer-backend` | DB, BE, INFRA tasks | Reads `AGENTS.md` for tech stack |
| `developer-frontend` | FE tasks | Reads `AGENTS.md` for design system |
| `developer-testing` | TEST tasks | Unit + integration tests |

### Review

| `subagent_type` | Scope |
|---|---|
| `review-solution` | Full review across quality, reuse, architecture, security — reports findings, does NOT auto-fix |

---

## Procedures (in `docs/procedures/`)

Reusable text procedures referenced by agents. **Override locally** by placing a file with the same name in your project's `docs/procedures/` — agents check the project first, then fall back to the toolkit.

| File | Used by |
|---|---|
| `code-generation.md` | All `developer-*` agents |
| `code-review.md` | `review-solution` |
| `secure-coding.md` | `developer-backend`, `review-solution` |
| `testing.md` | `developer-testing` |

---

## Typical flows

### Flow 1 — Brand new feature, end-to-end

```text
/define-feature            → produces docs/features/FTR-XXX-slug/feature.md
/implement-feature docs/features/FTR-XXX-slug/feature.md
```

The pipeline pauses for human approval after requirements + tech-spec.

### Flow 2 — Pick up an in-progress feature

```text
/feature-status <slug>     → see what's done and what's left
/next-task <slug>          → identify the next task and which agent to use
```

Then delegate manually to the suggested agent, or rerun `/implement-feature` to continue automatically.

### Flow 3 — Ship a PR

```text
/check-docs <slug>         → no inconsistencies?
/pr-description            → markdown ready to paste
```

---

## File locations

| What | Local install | Global install |
|---|---|---|
| Agents | `<project>/.claude/agents/` | `~/.claude/agents/` |
| Skills | `<project>/.claude/skills/` | `~/.claude/skills/` |
| Commands | `<project>/.claude/commands/` | `~/.claude/commands/` |
| Procedures | `<project>/docs/procedures/` | `~/.claude/docs/procedures/` |
| This reference | `<project>/docs/reference.md` | `~/.claude/docs/reference.md` |
