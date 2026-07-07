---
description: "Next Task — finds the next unblocked task in the active work breakdown and suggests which developer agent should handle it. Usage: /next-task [feature-slug]"
argument-hint: "[feature-slug]"
allowed-tools: Read, Glob, Grep
---

Identify the next unblocked task to work on.

Steps:
1. If `$ARGUMENTS` is provided, target that feature. Otherwise, list all feature folders under `docs/features/` and select the most recently modified one (use `git log -1 --format=%cd <path>` or filesystem mtime).
2. Read `work-breakdown.md` in the chosen feature folder.
3. Parse the task list. Identify the FIRST task that meets ALL these criteria, in order:
   - Status is `pending` / `todo` / `not started` (not `done`, `in progress`, `blocked`)
   - All listed dependencies (other task IDs) are marked `done`
   - Not flagged as `BLOCKED` or `BLOCKED BY`
4. Output a structured block:

   ```
   Feature: <slug>
   Task ID: <id>
   Domain: <DB | BE | FE | INFRA | TEST>
   Title: <task title>

   Suggested agent: <subagent_type>
   Suggested invocation:
     subagent_type: <developer-backend | developer-frontend | developer-testing>
     prompt: <feature-md-path> <task-id>
   ```

   Domain → agent mapping:
   - `DB`, `BE`, `INFRA` → `developer-backend`
   - `FE` → `developer-frontend`
   - `TEST` → `developer-testing`

5. If no unblocked task remains, output: `✅ All tasks are either done, in progress, or blocked. Check blockers.`

Do not spawn the agent automatically. Just suggest the invocation — the user decides when to delegate.
