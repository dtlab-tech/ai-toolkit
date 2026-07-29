# AI Toolkit — Gate Protocol

> Full catalog (Skills, Commands, Agents, Procedures): see `CLAUDE.md` in the project root,
> or [`docs/reference.md`](docs/reference.md) for the cheatsheet.

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
