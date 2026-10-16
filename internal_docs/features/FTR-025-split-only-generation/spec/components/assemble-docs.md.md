# src/claude/commands/assemble-docs.md — New

## Change

New thin slash-command, mirroring the existing `check-docs.md`/`feature-status.md` command shape:
locates the feature folder from `$ARGUMENTS`, then runs the new `assemble-docs.js` script via Bash
and reports what was written. No agent dispatch needed — the work is a deterministic script, not
an LLM judgment call.

## Component Props

```markdown
---
description: "Assemble Docs — renders the split Requirements/Tech-Spec/Work-Breakdown sources into single combined documents, on demand. Usage: /assemble-docs <feature-slug> [req|spec|wbs|all]"
argument-hint: <feature-slug> [req|spec|wbs|all]
allowed-tools: Bash, Glob, Read
---

Produce an on-demand, single-file view of one or more of this feature's split documents.

Approach:
1. Locate the feature folder under `docs/features/` (match by slug or FTR id) from the first
   argument.
2. Extract the prefix from the folder name (`FTR-025-slug` → `FTR-025`).
3. Determine `which` from the second argument (default `all`).
4. Run: `node .claude/scripts/assemble-docs.js <feature-dir> <prefix> <which>`
5. Report exactly what was written (the script's own JSON `written` array), or surface its error
   message verbatim if it failed — do not retry or guess an alternative path.

This command is a read-only rendering action: it never affects Gate 1/Gate 2, approvals, or any
digest. Running it is always safe, at any point in the pipeline.
```

## Tests

See `tests/assemble-docs.test.js.md` — this command is a thin wrapper with no logic of its own
beyond argument parsing already exercised by the script's own tests; no additional test file is
introduced for the command wrapper itself, consistent with `check-docs.md`/`feature-status.md`
having no dedicated test file either (both are exercised indirectly via the agents/scripts they
wrap).
