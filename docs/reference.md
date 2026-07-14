# AI Toolkit — Quick Reference

Cheatsheet of every skill, command, agent, and procedure shipped with this toolkit. For the full integration guide see [`CLAUDE.md`](../CLAUDE.md). For installation see [`installation.md`](installation.md).

---

## When do I use what?

### Feature Delivery

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

### Assessment & Remediation

| You want to… | Use |
|---|---|
| Audit an existing codebase for quality issues | Skill `/assess-codebase` |
| Run only specific assessment dimensions | Skill `/assess-codebase --scope=security,architecture` |
| Check the state of an ongoing assessment | Command `/assessment-status <prefix>` |
| Decompose a God Class or God Method | Agent `god-class-decomposition` |
| Convert static coupling to DI | Agent `dependency-injection-refactoring` |
| Audit layer boundary violations | Agent `layered-architecture-assessment` |
| Harden security at system boundaries | Agent `security-hardening` |
| Audit dependency supply chain | Agent `dependency-supply-chain-security` |
| Check for race conditions and shared state | Agent `concurrency-safety-assessment` |
| Refactor a monolithic domain model | Agent `domain-model-refactoring` |
| Generate intervention documents from findings | Agent `intervention-documentation-standard` |

---

## Skills (in `.claude/skills/`)

Invoked as `/<name>`. Comprehensive workflows that may chain multiple agents.

### Feature Delivery

| Skill | Purpose | Typical usage |
|---|---|---|
| `/define-feature` | Interviews you to produce `feature.md` (from Matt Pocock's skills) | `/define-feature` then answer the prompts |
| `/init-agents` | Analyzes the codebase and generates `AGENTS.md` (the conventions file the toolkit depends on) | Run once per new project |
| `/install-toolkit` | Copies agents/skills/commands/procedures into a destination project | `/install-toolkit /path/to/dest [--force]` |
| `/implement-feature` | Full pipeline: requirements → tech-spec → approval → work breakdown → implementation → review → PR | `/implement-feature docs/features/FTR-001-foo/feature.md` |

### Assessment & Remediation

| Skill | Purpose | Typical usage |
|---|---|---|
| `/assess-codebase` | Full pipeline: parallel assessment → intervention docs → approval gate → remediation → review → PR | `/assess-codebase [path] [--scope=security,architecture] [--force]` |

### General

| Skill | Purpose | Typical usage |
|---|---|---|
| `/help [topic]` | Interactive guide — explains pipelines, agents, commands; helps you find the right tool for your situation | `/help`, `/help assess`, `/help setup`, `/help feature` |

---

## Commands (in `.claude/commands/`)

Invoked as `/<name>`. Lightweight shortcuts focused on the current state of the repo. Do **not** spawn long-running workflows.

### Feature Delivery

| Command | Purpose | Args |
|---|---|---|
| `/feature-status` | ✅/⚠️/❌ status table for all feature artifacts + next steps | `<feature-slug>` |
| `/check-docs` | Inconsistencies between `feature.md`, `requirements.md`, `tech-spec.md` — gaps only | `<feature-slug>` |
| `/pr-description` | Generates PR description from branch + commits + linked feature.md | (none) |
| `/next-task` | Next unblocked task from the work breakdown + suggested agent | `[feature-slug]` (optional) |

### Assessment & Remediation

| Command | Purpose | Args |
|---|---|---|
| `/assessment-status` | ✅/⚠️/❌ status table for all assessment artifacts (assessments, interventions, approvals, issues) + next steps | `<assessment-prefix>` |

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

### Assessment pipeline

| `subagent_type` | Input | Output |
|---|---|---|
| `assessment-manager` | codebase path | Orchestrates the full assessment + remediation pipeline |
| `generic-software-assessment` | codebase path + prefix | `{PREFIX}-Generic-Assessment.md` |
| `layered-architecture-assessment` | codebase path + prefix | `{PREFIX}-Layer-Assessment.md` |
| `concurrency-safety-assessment` | codebase path + prefix | `{PREFIX}-Concurrency-Assessment.md` |
| `intervention-documentation-standard` | assessment files + prefix | `{PREFIX}-INT-NNN-*.md` + `Interventions-Index.md` |

### Remediation

| `subagent_type` | What it fixes | Reads |
|---|---|---|
| `god-class-decomposition` | Oversized classes and methods | Intervention doc + `AGENTS.md` |
| `domain-model-refactoring` | Monolithic model files, missing type hierarchies | Intervention doc + `AGENTS.md` |
| `layered-architecture-assessment` | Layer violation audit (assessment only, no implementation) | `AGENTS.md` |
| `dependency-injection-refactoring` | Static/direct coupling converted to DI | Intervention doc + `AGENTS.md` |
| `security-hardening` | Input validation, SQL injection, secrets, log sanitisation, TLS | Intervention doc + `AGENTS.md` |
| `dependency-supply-chain-security` | Lock files, integrity verification, unused deps, SCA in CI | Intervention doc + `AGENTS.md` |
| `concurrency-safety-assessment` | Race conditions, shared state audit (assessment only) | `AGENTS.md` |

---

## Procedures (in `docs/procedures/`)

Reusable text procedures referenced by agents. **Override locally** by placing a file with the same name in your project's `docs/procedures/` — agents check the project first, then fall back to the toolkit.

| File | Used by |
|---|---|
| `code-generation.md` | All `developer-*` agents |
| `code-review.md` | `review-solution` |
| `secure-coding.md` | `developer-backend`, `review-solution`, `security-hardening` |
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

### Flow 4 — Audit an existing codebase

```text
/assess-codebase .         → runs all assessment agents in parallel
                           → produces intervention documents
                           → pauses for human approval of remediation scope
                           → implements approved interventions
                           → opens PR
```

### Flow 5 — Targeted assessment (security only)

```text
/assess-codebase . --scope=security
                           → runs only security-related assessment agents
                           → same approval gate + remediation pipeline
```

### Flow 6 — Resume an interrupted assessment

```text
/assessment-status ASSESS-001   → see what's done and what's next
/assess-codebase . --force      → restart from scratch
/assess-codebase .              → resume (skips fresh artifacts)
```

---

## File locations

| What | Local install | Global install |
|---|---|---|
| Agents | `<project>/.claude/agents/` | `~/.claude/agents/` |
| Skills | `<project>/.claude/skills/` | `~/.claude/skills/` |
| Commands | `<project>/.claude/commands/` | `~/.claude/commands/` |
| Procedures | `<project>/docs/procedures/` | `~/.claude/docs/procedures/` |
| Feature docs | `<project>/docs/features/FTR-NNN-slug/` | — |
| Assessment docs | `<project>/docs/assessments/ASSESS-NNN/` | — |
| This reference | `<project>/docs/reference.md` | `~/.claude/docs/reference.md` |
