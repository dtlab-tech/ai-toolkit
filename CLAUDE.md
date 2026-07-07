# SWF AI Toolkit

A reusable set of AI agents and procedures for software feature delivery — from requirements to PR.

> **Need a quick overview of what's available?** See [`docs/reference.md`](docs/reference.md) for the cheatsheet.

## Dependencies

This toolkit expects the **`define-feature`** agent from [Matt Pocock's skills package](https://github.com/mattpocock/skills) to be available. That agent is responsible for producing the `feature.md` input file that `/implement-feature` and all downstream agents consume.

Install it with:

```bash
npx skills@latest add mattpocock/skills
```

Then run `/setup-matt-pocock-skills` in your agent to complete the setup.

> **Tip:** Install Matt's skills globally (`~/.claude/skills/`) so they are available in every project without repeating the setup.

## How it works

This toolkit provides **generic agents** that work with any project. Each agent reads project-specific conventions from `AGENTS.md` in the current working directory.

### Integration

Add this toolkit to your Claude Code `settings.json`:

```json
{
  "permissions": {
    "additionalDirectories": [
      "c:\\ws\\swf-ai-toolkit\\.claude"
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

| Skill | Command | Purpose |
|-------|---------|---------|
| Install Toolkit | `/install-toolkit` | Copies all agents, skills, commands, and procedures into a destination project (no local toolkit repo needed) |
| Init AGENTS.md | `/init-agents` | Analyzes a project codebase and generates the AGENTS.md convention file required by all developer agents |
| Implement Feature | `/implement-feature` | Starts the full feature delivery pipeline: docs → approval → implement → review → PR |

## Commands (slash shortcuts, in `.claude/commands/`)

| Command | Purpose |
|---------|---------|
| `/feature-status <slug>` | Reports presence/state of feature.md, requirements, tech-spec, work-breakdown, and implementation progress |
| `/check-docs <slug>` | Terse consistency check between feature docs — outputs only the inconsistencies |
| `/pr-description` | Generates a PR description from the current branch commits + linked feature.md |
| `/next-task [slug]` | Finds the next unblocked task in the work breakdown and suggests the agent to delegate it to |

## Agents (spawnable subagents, in `.claude/agents/`)

| Agent | subagent_type | Purpose |
|-------|---------------|---------|
| Install Toolkit | `install-toolkit` | Copies toolkit files into a destination project |
| Init AGENTS.md | `init-agents-md` | Analyzes codebase and generates AGENTS.md |
| Generate Requirements | `generate-requirements` | Produces functional requirements from feature.md |
| Generate Tech-Spec | `generate-tech-spec` | Produces technical specification from feature + requirements |
| Validate Docs | `validate-feature-docs` | Cross-validates requirements + tech-spec against feature.md |
| Generate Work Breakdown | `generate-work-breakdown` | Creates User Stories + tasks from approved docs |
| Backend Developer | `developer-backend` | Implements backend tasks (DB, BE, INFRA domains) |
| Frontend Developer | `developer-frontend` | Implements frontend tasks (FE domain) |
| Testing Agent | `developer-testing` | Creates unit/integration tests (TEST domain) |
| Review Solution | `review-solution` | Architect-level code review |

## Available procedures (in `docs/procedures/`)

| Procedure | Purpose |
|-----------|---------|
| `code-generation.md` | Step-by-step workflow for generating/modifying code |
| `code-review.md` | Checklist and process for reviewing code |
| `secure-coding.md` | Security checklist for auth/data handling |
| `testing.md` | Strategy and guidelines for writing tests |
