# src/claude/agents/gaia-generate-tech-spec.md — Modified

## Change

One-line wording change in the `## Process` section: step 2 ("Read `{PREFIX}-Requirements.md` if
it exists (for traceability)") becomes "Read `req/index.md` if it exists (for traceability)". No
behavior change in what information the agent uses — the AC table and Use Case index it needs for
traceability already live, untouched, in the Requirements skeleton's index file (FTR-021); only the
file it's told to read changes, since the monolithic assembled file is no longer guaranteed to
exist. The Guidelines section's AC-citation rule ("only cite ones that exist in
`{PREFIX}-Requirements.md`'s own AC table") is updated the same way, to `req/index.md`'s own AC
table.

## Service Interface

```markdown
<!-- BEFORE (## Process, step 2) -->
2. **Read** `{PREFIX}-Requirements.md` if it exists (for traceability)

<!-- AFTER -->
2. **Read** `req/index.md` if it exists (for traceability) — the AC table and Use Case index it
   needs already live there, untouched by the per-UC split (FTR-021)
```

```markdown
<!-- BEFORE (## Guidelines) -->
- ... Do not invent AC IDs — only cite ones that exist in `{PREFIX}-Requirements.md`'s own AC table.

<!-- AFTER -->
- ... Do not invent AC IDs — only cite ones that exist in `req/index.md`'s own AC table.
```

## Tests

`tests/integration/workflow-runtime.test.js` (see that file's own component): no test asserts this
agent reads `{PREFIX}-Requirements.md` by path — the host dispatch for `gaia-generate-tech-spec`
already only ever passed `featurePath` (the agent locates its own traceability input by
convention); this is a prompt-wording-only change with no host-side test fixture to update beyond
confirming the agent file's own frontmatter/structure still parses (existing frontmatter tests
already cover this generically).
