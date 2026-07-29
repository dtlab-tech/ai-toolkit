# AI Toolkit

A reusable set of AI agents and procedures for software feature delivery and codebase assessment — from requirements to PR, and from audit to remediation.

> **Full catalog of skills, commands, agents, and procedures:** [`docs/reference.md`](docs/reference.md)

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

## Gate Protocol — MANDATORY RULES

These rules apply in every session, without exception.

### Launching the Project Manager

**Always pass `run_in_background: false` when spawning the `project-manager` agent.**

Running the PM in the background leaves the main loop free to act independently. This creates two parallel execution paths that will conflict. The PM must block the main loop until it reaches a gate and returns.

### While the PM is running

**Do nothing.** No file reads "to prepare", no file writes "to accelerate", no implementation "because it seems stuck". The only permitted actions are:

- Receiving gate notifications and presenting them to the user
- Responding to the user's status questions ("still running")
- Sending messages to the PM via SendMessage if it is genuinely blocked and the user asks to unblock it

If the PM produces relay agents that appear to do nothing useful, that is noise — not a signal that the PM is stuck. Wait.

### Gate notifications are hard stops

When any gate notification arrives (Gate 1, Gate 2, Findings Gate, or any **HARD STOP** in any agent output):

1. Stop immediately — even if mid-turn
2. Present the full gate content to the user
3. Wait for explicit written approval before touching any file or spawning any agent

This applies even if the PM appears stuck, in a relay loop, or the gate arrives while another tool call is in progress.

## Compact instructions

When compacting this conversation, preserve:
- Current objective and which pipeline step we are on
- User decisions and approvals (Gate 1, Gate 2, Findings Gate)
- Files created or modified this session
- Open errors or blockers
- Feature/assessment prefix IDs and artifact paths (e.g. FTR-010, ASSESS-001)

Discard:
- Raw grep/glob/read output that has already been acted on
- Successful tool-call results that produced no follow-up action
- Repeated explanations of the same concept
- Superseded plans or approaches
