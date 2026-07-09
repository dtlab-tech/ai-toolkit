---
description: "Implement Feature — starts the full feature delivery pipeline (requirements → tech-spec → approval → work breakdown → implementation → review → PR). Usage: /implement-feature <path-to-feature.md> [--force]"
argument-hint: <path-to-feature.md> [--force]
---

# Implement Feature

Orchestrates the full feature delivery pipeline by spawning the `project-manager` agent
and, once it completes, recording the real token consumption in a dedicated file.

---

## Step 1 — Spawn the Project Manager

Spawn the `project-manager` agent with the exact arguments the user provided:

```
subagent_type: project-manager
prompt: <path-to-feature.md> [--force]
```

Wait for the agent to complete. Capture its full result, including the `<usage>` block
that appears at the end of the tool result (format: `subagent_tokens: N`).

---

## Step 2 — Extract orchestrator token usage

From the `<usage>` block of the project-manager result, read:
- `subagent_tokens` — total tokens consumed by the project-manager agent itself (input + output)
- `duration_ms` — wall-clock duration of the project-manager run

---

## Step 3 — Complete Token Estimate file

The project-manager will have already written `{PREFIX}-Token-Estimate.md` with the
upfront estimate and the child agents' actuals. Read that file, then **append**
the orchestrator row and the grand total:

```markdown
| project-manager (orchestrator) | — | sonnet | N (estimated) | N (actual) | ±N | Xh Ymin |

---

### Grand Total

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Total tokens (all agents) | N | N | ±N |
| Total wall-clock | Xh Ymin | Xh Ymin | ±Zmin |
| Average tokens per agent | N | N | — |
```

If the file does not exist yet (project-manager failed before writing it), create it
from scratch using the data available.

---

## Step 4 — Report to user

After writing the token file, report:

```
✅ Feature pipeline complete.
   Token estimate + actuals → {PREFIX}-Token-Estimate.md
   Effort estimate + actuals → {PREFIX}-Effort-Estimate.md
   Pull Request → {PR URL}
```
