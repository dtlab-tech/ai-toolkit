# src/claude/commands/feature-status.md — Modified

## Change

Step 2's artifact-presence list is updated: `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` are
no longer unconditionally expected files — a feature generated under this pipeline has `req/`/
`spec/` directories instead, with the monolithic file only present if a user explicitly ran
`assemble-docs`. The check becomes "either shape is present" (split directory OR the assembled
file — covers both a freshly-generated feature and a legacy one), reporting which shape was found
in the Notes column rather than treating a missing monolithic file as a gap.

## Component Props

```markdown
<!-- BEFORE (step 2) -->
2. For each of the following artifacts, check presence and basic completeness:
   - `feature.md` — the source brief
   - `{PREFIX}-Requirements.md` — functional requirements
   - `{PREFIX}-Tech-Spec.md` — technical specification
   - `{PREFIX}-Work-Breakdown.md` — user stories + tasks
   - Implementation status: cross-check tasks in the work breakdown against the codebase. For
     each task, report `done` / `partial` / `not started` based on whether the referenced
     files/symbols exist.

<!-- AFTER -->
2. For each of the following artifacts, check presence and basic completeness:
   - `feature.md` — the source brief
   - Requirements — ✅ if either `req/index.md` (split, default) or `{PREFIX}-Requirements.md`
     (assembled, legacy or user-requested via `/assemble-docs`) exists; note which shape was found
   - Tech-Spec — ✅ if either `spec/index.md` (split, default) or `{PREFIX}-Tech-Spec.md` (assembled)
     exists; note which shape was found
   - Work Breakdown — ✅ if either `wbs/index.json` (split, always the case since FTR-020) or
     `{PREFIX}-Work-Breakdown.md` (rendered, only present if `/assemble-docs` was run) exists
   - Implementation status: cross-check tasks in the work breakdown against the codebase (reading
     `wbs/` directly, same as before — unaffected). For each task, report `done` / `partial` /
     `not started` based on whether the referenced files/symbols exist.
```

## Tests

No dedicated test file — `feature-status.md` is a prompt-only command with no existing test
coverage of its own (confirmed: no test file references it today); the updated wording is verified
manually, consistent with how this command was introduced originally.
