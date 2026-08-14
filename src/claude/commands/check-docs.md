---
description: "Check Docs — quick consistency check between feature.md, requirements, and tech-spec. Reports only inconsistencies. Usage: /check-docs <feature-slug>"
argument-hint: <feature-slug>
allowed-tools: Read, Glob, Grep, Agent
---

Run a terse consistency check on the feature documents for `$ARGUMENTS`.

Approach:
1. Locate the feature folder under `docs/features/` (match by slug or FTR id).
2. Spawn the `validate-feature-docs` agent and pass the feature.md path as input.
3. From the agent's report, extract ONLY the inconsistencies. Skip the OK items, summaries, and recommendations.
4. Render the inconsistencies as a bullet list with this exact format:
   - `<doc>:<section>` — <one-line description of the gap>

If there are no inconsistencies, output a single line: `✅ Docs are consistent.`

Do not propose fixes. This command is a diagnostic, not a corrective.
