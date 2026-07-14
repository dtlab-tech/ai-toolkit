# @dtlabs/ai-toolkit — AI Toolkit

Reusable Claude Code agents, skills, commands, and procedures for end-to-end software feature delivery and codebase assessment — from requirements to PR, and from audit to remediation.

## Meet Gaia — your toolkit assistant

Once installed, the best way to get started is to say hi:

```
/hi-gaia
```

**Gaia** is the toolkit's built-in assistant. She introduces herself, scans your workspace to understand the context (is the project already set up? are there features in progress?), and guides you toward the right tool for your situation.

You can also ask her about specific topics directly:

```
/hi-gaia feature       → how to build a new feature end-to-end
/hi-gaia assess        → how to audit and improve an existing codebase
/hi-gaia setup         → how to onboard a new project
/hi-gaia agents        → full catalog of available agents and skills
```

If you're ever unsure which command or agent to use, Gaia is the right starting point. She won't run anything — she helps you understand the toolkit and decide what to do next.

---

## What it provides

Two independent pipelines:

### Feature Delivery Pipeline
- **12 agents** for the full delivery lifecycle (requirements → tech-spec → work breakdown → backend/frontend/testing implementation → architect review)
- **5 skills** invocable via slash commands (`/install-toolkit`, `/init-agents`, `/implement-feature`, `/define-feature`, `/hi-gaia`)
- **4 commands** for quick day-to-day shortcuts (`/feature-status`, `/check-docs`, `/pr-description`, `/next-task`)

### Assessment & Remediation Pipeline
- **10 agents** for codebase assessment and targeted remediation (generic assessment, layer audit, concurrency safety, god class decomposition, DI refactoring, domain model refactoring, security hardening, supply chain security, intervention documentation)
- **1 skill** (`/assess-codebase`) that runs the full assessment pipeline with a human approval gate before any code changes
- **1 command** (`/assessment-status`) for checking the state of an ongoing assessment

### Shared
- **4 generic procedures** (code generation, code review, secure coding, testing) that projects can override locally

## Install

**Local installation** (into the current project):

```bash
npx @dtlabs/ai-toolkit
```

**Global installation** (into `~/.claude/`):

```bash
npm install -g @dtlabs/ai-toolkit
ai-toolkit --global
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
