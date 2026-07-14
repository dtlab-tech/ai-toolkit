# AI Toolkit

A reusable set of AI agents and procedures for software feature delivery and codebase assessment — from requirements to PR, and from audit to remediation.

> **Need a quick overview of what's available?** See [`docs/reference.md`](docs/reference.md) for the cheatsheet.

## Dependencies

This toolkit expects the **`define-feature`** agent from [Matt Pocock's skills package](https://github.com/mattpocock/skills) to be available. That agent is responsible for producing the `feature.md` input file that `/implement-feature` and all downstream agents consume.

Install it with:

```bash
npx skills@latest add mattpocock/skills
```

> **Tip:** Install Matt's skills globally (`~/.claude/skills/`) so they are available in every project without repeating the setup.

## How it works

This toolkit provides **generic agents** that work with any project. Each agent reads project-specific conventions from `AGENTS.md` in the current working directory.

### Integration

Add this toolkit to your Claude Code `settings.json`:

```json
{
  "permissions": {
    "additionalDirectories": [
      "c:\\path\\to\\ai-toolkit\\.claude"
    ]
  }
}
```

### What your project must provide

An `AGENTS.md` file in the project root with:

- **Tech stack** — languages, frameworks, package manager, build tool
- **Directory structure** — where code lives, naming conventions
- **Patterns** — controller patterns, page patterns, service patterns (with code examples)
- **Build commands** — how to verify compilation (e.g., `dotnet build`, `npx tsc --noEmit`)
- **Test commands** — how to run tests
- **Design system** — UI components available, styling rules
- **i18n** — internationalization approach
- **Hard constraints** — things that must never be done ("do NOT" list)

### Procedure override mechanism

Generic procedures live in `docs/procedures/` in this toolkit. Projects can override any procedure by placing a file with the same name at `docs/procedures/` in their own root. Agents check the project first, then fall back to the toolkit.

## Skills (user-invocable, in `.claude/skills/`)

### Feature Delivery

| Skill | Command | Purpose |
|-------|---------|---------|
| Install Toolkit | `/install-toolkit` | Copies all agents, skills, commands, and procedures into a destination project (no local toolkit repo needed) |
| Init AGENTS.md | `/init-agents` | Analyzes a project codebase and generates the AGENTS.md convention file required by all developer agents |
| Define Feature | `/define-feature` | Interviews you to define a new feature and writes `feature.md` — required input for `/implement-feature` |
| Implement Feature | `/implement-feature` | Starts the full feature delivery pipeline: docs → approval → implement → review → PR |

### Assessment & Remediation

| Skill | Command | Purpose |
|-------|---------|---------|
| Assess Codebase | `/assess-codebase` | Starts the full assessment pipeline: parallel assessment → intervention docs → approval gate → remediation → review → PR |

### General

| Skill | Command | Purpose |
|-------|---------|---------|
| Toolkit Guide | `/help [topic]` | Interactive guide to the toolkit — explains pipelines, agents, and commands; helps you find the right tool for your situation |

## Commands (slash shortcuts, in `.claude/commands/`)

### Feature Delivery

| Command | Purpose |
|---------|---------|
| `/feature-status <slug>` | Reports presence/state of feature.md, requirements, tech-spec, work-breakdown, and implementation progress |
| `/check-docs <slug>` | Terse consistency check between feature docs — outputs only the inconsistencies |
| `/pr-description` | Generates a PR description from the current branch commits + linked feature.md |
| `/next-task [slug]` | Finds the next unblocked task in the work breakdown and suggests the agent to delegate it to |

### Assessment & Remediation

| Command | Purpose |
|---------|---------|
| `/assessment-status <prefix>` | Reports presence/state of all assessment artifacts (assessments, interventions, approvals, issues register) |

## Agents (spawnable subagents, in `.claude/agents/`)

### Feature Delivery

| Agent | subagent_type | Purpose |
|-------|---------------|---------|
| Install Toolkit | `install-toolkit` | Copies toolkit files into a destination project |
| Init AGENTS.md | `init-agents-md` | Analyzes codebase and generates AGENTS.md |
| Define Feature | `define-feature` | Interviews the user and writes `feature.md` in `docs/features/FTR-XXX-slug/` |
| Generate Requirements | `generate-requirements` | Produces functional requirements from feature.md |
| Generate Tech-Spec | `generate-tech-spec` | Produces technical specification from feature + requirements |
| Validate Docs | `validate-feature-docs` | Cross-validates requirements + tech-spec against feature.md |
| Generate Work Breakdown | `generate-work-breakdown` | Creates User Stories + tasks from approved docs |
| Backend Developer | `developer-backend` | Implements backend tasks (DB, BE, INFRA domains) |
| Frontend Developer | `developer-frontend` | Implements frontend tasks (FE domain) |
| Testing Agent | `developer-testing` | Creates unit/integration tests (TEST domain) |
| Review Solution | `review-solution` | Architect-level code review |
| Project Manager | `project-manager` | Orchestrates the full feature delivery pipeline |

### Assessment & Remediation

| Agent | subagent_type | Purpose |
|-------|---------------|---------|
| Assessment Manager | `assessment-manager` | Orchestrates the full assessment + remediation pipeline |
| Generic Software Assessment | `generic-software-assessment` | Broad quality analysis across architecture, security, testability, observability, DevOps |
| Intervention Documentation Standard | `intervention-documentation-standard` | Generates structured, self-contained intervention documents from assessment findings |
| God Class Decomposition | `god-class-decomposition` | Safe incremental decomposition of oversized classes and methods |
| Domain Model Refactoring | `domain-model-refactoring` | Splits monolithic model files, introduces type hierarchies, aligns domain vocabulary |
| Layered Architecture Assessment | `layered-architecture-assessment` | Audits layer boundary violations and namespace/package misalignment |
| Dependency Injection Refactoring | `dependency-injection-refactoring` | Converts static/direct coupling to constructor-injected services |
| Security Hardening | `security-hardening` | Input validation, parameterised queries, secret management, log sanitisation, TLS |
| Dependency Supply Chain Security | `dependency-supply-chain-security` | Lock files, integrity verification, unused dependency audit, SCA in CI |
| Concurrency Safety Assessment | `concurrency-safety-assessment` | Race conditions, shared mutable state, unsafe shutdown patterns |

## Available procedures (in `docs/procedures/`)

| Procedure | Purpose |
|-----------|---------|
| `code-generation.md` | Step-by-step workflow for generating/modifying code |
| `code-review.md` | Checklist and process for reviewing code |
| `secure-coding.md` | Security checklist for auth/data handling |
| `testing.md` | Strategy and guidelines for writing tests |
