# src/claude/agents/gaia-validate-work-breakdown-semantic.md — Modified

## Change

Wherever this agent is currently instructed to Read `{PREFIX}-Requirements.md` for "User Story
descriptions and Acceptance Criteria text" (Step 2's input description, and the closing instruction
"Use `Read` to load both files"), it is repointed at `req/index.md` instead — the exact same content
(Use Cases table, Business Rules table, Acceptance Criteria table) already lives there untouched by
the per-UC split (FTR-021), so no semantic change to what the agent validates against, only where it
reads it from. The `tools: Read, Glob, Grep` grant is unchanged — already sufficient; if the agent's
own judgment needs a specific UC's full flow text beyond the index's summary tables, it Reads
`req/use-cases/{UC-ID}.md` directly, same tool, no new grant.

## Service Interface

```markdown
<!-- BEFORE -->
2. `{PREFIX}-Requirements.md` — User Story descriptions and Acceptance Criteria text
...
Use `Read` to load both files. Do not write any files. Do not produce any output other than the
single JSON object described above.

<!-- AFTER -->
2. `req/index.md` — User Story descriptions and Acceptance Criteria text (the split Requirements
   index; a legacy feature with no `req/` directory instead has `{PREFIX}-Requirements.md` — use
   whichever one the host actually gave you, named in the prompt)
...
Use `Read` to load both files. Do not write any files. Do not produce any output other than the
single JSON object described above.
```

`pm-phase2.js`'s own dispatch call changes its prompt from `` `${wbsDir}\n${file('Requirements.md')}` ``
to `` `${wbsDir}\n${reqIndexPath}` `` — `reqIndexPath` already resolves to the legacy monolithic path
for a feature with no `req/` directory, so the agent's own instructions above cover both cases by
just "Read whatever path the prompt names", without needing to special-case legacy features itself.

## Tests

`tests/integration/workflow-runtime.test.js` (see that file's own component): the mock dispatch for
`gaia.agent.planner.validate-work-breakdown` asserts the received prompt's second line is
`reqIndexPath` (the split index path) for a real-split-source feature, and the existing monolithic
path for a legacy feature — no test depends on the agent's own internal Read instructions beyond that
(same "mock dispatch, assert prompt contents" convention used throughout this test suite for every
other worker call).
