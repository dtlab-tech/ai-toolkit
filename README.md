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

## Required configuration — subagent spawn depth

> ⚠️ **This setting is not optional for the orchestrated pipelines.** Without it, `/implement-feature` and `/assess-codebase` silently degrade.

The toolkit is built on a **two-level agent hierarchy**: an orchestrator (`project-manager` or `assessment-manager`) is spawned as a subagent, and it in turn spawns the specialized worker agents (developers, reviewers, assessors), each on its own role-appropriate model with an isolated context.

Since Claude Code **v2.1.217, a subagent cannot spawn further subagents by default** (spawn depth is capped at 1, an intentional guard against unbounded recursive fan-out and cost). Under that default, when an orchestrator runs as a subagent it has **no `Agent` tool** — so instead of delegating, it executes every worker's task *inline, in its own context, on its own model*. The consequences:

- **Per-agent model assignment stops taking effect** — the `haiku`/`sonnet`/`opus` mapping on each agent is never applied, because those agents are never actually spawned. Everything runs on the orchestrator's model.
- **Context isolation is lost** — one long orchestrator context replaces the intended per-agent isolation.
- **Per-agent token telemetry disappears** — no per-agent `<usage>` blocks are emitted, so `*-Token-Estimate.md` records only an aggregate orchestrator total.

To let the toolkit work as designed, raise the allowed depth to **2** (main loop → orchestrator → workers). This repo already sets it in [`.claude/settings.json`](.claude/settings.json):

```json
{
  "env": {
    "CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH": "2"
  }
}
```

**When you install the toolkit into another project, you must add this setting yourself.** The installers (`npx @dtlabs/ai-toolkit`, `ai-toolkit --global`, and the `/install-toolkit` agent) **never copy or edit any `settings.json`** — that file is user-owned, and merging it automatically would risk clobbering your existing configuration. Instead, each installer **checks** whether `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` is set to `2`+ in the destination and, if it is missing, prints the exact snippet to add (to `.claude/settings.json` for one project, or `~/.claude/settings.json` for all projects). After adding it, restart Claude Code so the variable is loaded.

The orchestrator agents already omit the `tools:` frontmatter field, so they inherit the `Agent` tool automatically once the depth allows it — no per-agent changes are needed.

## Development

### Running tests locally

```bash
npm install        # install devDependencies (jest, gray-matter)
npm test           # run all tests; stops at first failure (--bail)
npm run test:coverage  # run all tests and generate a coverage report
```

The test suite covers:

- **`tests/cli/`** — unit tests for pure functions in `bin/cli.js`
  (`fileHash`, `walkDir`, `expandMappings`, `categorize`, `readInstalledVersion`, `isMattPocockInstalled`)
- **`tests/frontmatter/`** — structural validation of all `.claude/agents/*.md`
  and `.claude/skills/**/SKILL.md` frontmatter fields

Coverage reports land in `coverage/` (gitignored). Open `coverage/index.html`
in a browser to browse line-level coverage. No coverage threshold is enforced;
the report is diagnostic only.

### CI

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs automatically on
every pull request targeting `main`:

1. Checks out the repo on `ubuntu-latest` with Node 20
2. Installs dependencies with `npm ci`
3. Runs `npm test` — the PR check is red if any test fails
4. Runs `npm run test:coverage` and uploads the `coverage/` directory as a
   30-day workflow artifact

### Adding or changing tests

- When you modify a function in `bin/cli.js`, update the matching test file
  in `tests/cli/`.
- When you add an agent `.md` or skill `SKILL.md`, the frontmatter tests in
  `tests/frontmatter/` run against it automatically — just make sure the
  required fields (`name`, `description`, `model` for agents; `description`
  for skills) are present and valid.

## Documentation

- [Quick Reference](docs/reference.md) — cheatsheet of every skill, command, agent, and procedure
- [Installation guide](docs/installation.md) — full `.npmrc` setup and CLI options
- [`CLAUDE.md`](CLAUDE.md) — agent and skill reference
- [`docs/procedures/`](docs/procedures/) — reusable workflows

## License

MIT
