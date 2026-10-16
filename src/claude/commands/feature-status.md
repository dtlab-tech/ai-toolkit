---
description: "Feature Status — reports presence and state of all feature artifacts (feature.md, requirements, tech-spec, work breakdown, implementation). Usage: /feature-status <feature-slug>"
argument-hint: <feature-slug>
allowed-tools: Read, Glob, Grep, Bash
---

Report the status of feature `$ARGUMENTS`.

Steps:
1. Locate the feature folder under `docs/features/`. Match by slug or FTR id (e.g. `FTR-001-user-login` matches both `001` and `user-login`).
2. For each of the following artifacts, check presence and basic completeness:
   - `feature.md` — the source brief
   - Requirements — ✅ if either `req/index.md` (split, default) or `{PREFIX}-Requirements.md`
     (assembled, legacy or user-requested via `/assemble-docs`) exists; note which shape was found
   - Tech-Spec — ✅ if either `spec/index.md` (split, default) or `{PREFIX}-Tech-Spec.md`
     (assembled) exists; note which shape was found
   - Work Breakdown — ✅ if either `wbs/index.json` (split, always the case since FTR-020) or
     `{PREFIX}-Work-Breakdown.md` (rendered, only present if `/assemble-docs` was run) exists
   - Implementation status: cross-check tasks in the work breakdown against the codebase (read
     `wbs/` directly). For each task, report `done` / `partial` / `not started` based on whether
     the referenced files/symbols exist.
3. Output a single markdown table with columns: `Artifact | Status | Notes`. Status uses ✅ / ⚠️ / ❌. Keep notes under 80 chars.
4. After the table, list the next 1–3 actionable items in priority order.

Do not spawn subagents. Do not modify files. Read-only operation.
