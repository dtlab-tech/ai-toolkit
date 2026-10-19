---
description: "Assemble Docs — renders the split Requirements/Tech-Spec/Work-Breakdown sources into single combined documents, on demand. Usage: /assemble-docs <feature-slug> [req|spec|wbs|all]"
argument-hint: <feature-slug> [req|spec|wbs|all]
allowed-tools: Bash, Glob, Read
---

Produce an on-demand, single-file view of one or more of this feature's split documents.

Approach:
1. Locate the feature folder under `docs/features/` (match by slug or FTR id) from the first argument.
2. Extract the prefix from the folder name (`FTR-025-slug` → `FTR-025`).
3. Determine `which` from the second argument (default `all`).
4. Run: `node .claude/scripts/assemble-docs.js <feature-dir> <prefix> <which>`
5. Report exactly what was written (the script's own JSON `written` array), or surface its error message verbatim if it failed — do not retry or guess an alternative path.

This command is a read-only rendering action: it never affects Gate 1/Gate 2, approvals, or any digest. Running it is always safe, at any point in the pipeline.
