# @fincantieri/swf-ai-toolkit

Reusable Claude Code agents, skills, commands, and procedures for end-to-end software feature delivery and codebase assessment — from requirements to PR, and from audit to remediation.

## What it provides

Two independent pipelines:

### Feature Delivery Pipeline
- **12 agents** for the full delivery lifecycle (requirements → tech-spec → work breakdown → backend/frontend/testing implementation → architect review)
- **4 skills** invocable via slash commands (`/install-toolkit`, `/init-agents`, `/implement-feature`, `/define-feature`)
- **4 commands** for quick day-to-day shortcuts (`/feature-status`, `/check-docs`, `/pr-description`, `/next-task`)

### Assessment & Remediation Pipeline
- **10 agents** for codebase assessment and targeted remediation (generic assessment, layer audit, concurrency safety, god class decomposition, DI refactoring, domain model refactoring, security hardening, supply chain security, intervention documentation)
- **1 skill** (`/assess-codebase`) that runs the full assessment pipeline with a human approval gate before any code changes
- **1 command** (`/assessment-status`) for checking the state of an ongoing assessment

### Shared
- **4 generic procedures** (code generation, code review, secure coding, testing) that projects can override locally

## Install

> The package is hosted on a private Azure Artifacts feed. See [docs/installation.md](docs/installation.md) for `.npmrc` setup before running the commands below.

**Local installation** (into the current project):

```bash
npx @fincantieri/swf-ai-toolkit
```

**Global installation** (into `~/.claude/`):

```bash
npm install -g @fincantieri/swf-ai-toolkit
swf-ai-toolkit --global
```

Both commands copy agents, skills, procedures, and `CLAUDE.md` into the appropriate location.

## How it works

The toolkit ships **generic agents** that work with any project. Each agent reads project-specific conventions from an `AGENTS.md` file in the consuming project's root. Run `/init-agents` to generate that file for a new project.

Generic procedures live in `docs/procedures/`. Projects can override any of them by placing a file with the same name at their own `docs/procedures/`. Agents check the project first, then fall back to the toolkit.

## Documentation

- [Quick Reference](docs/reference.md) — cheatsheet of every skill, command, agent, and procedure
- [Installation guide](docs/installation.md) — full `.npmrc` setup and CLI options
- [`CLAUDE.md`](CLAUDE.md) — agent and skill reference
- [`docs/procedures/`](docs/procedures/) — reusable workflows

## License

MIT
