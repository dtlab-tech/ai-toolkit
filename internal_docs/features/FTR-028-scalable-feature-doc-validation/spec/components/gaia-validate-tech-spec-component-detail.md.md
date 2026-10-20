# src/claude/agents/gaia-validate-tech-spec-component-detail.md — New

## Change

A new, narrowly-scoped agent: given a small batch of `{claim, component file path}` pairs, Read
each named component file and decide whether its own content satisfies its claim. This is the
drill-down counterpart `gaia-validate-feature-docs` dispatches (via the host) when a claim needs a
component's own design body to verify — something the main validator no longer sees directly after
this feature's skeleton-only prompt change (UC-01). One call handles one batch (≤ `K` components,
however many claims those components carry between them), never the whole Tech-Spec.

## Algorithm

Frontmatter (mirrors `gaia-generate-tech-spec-component.md`'s model/tool choice — a narrow,
single-purpose per-batch agent):

```markdown
---
name: gaia-validate-tech-spec-component-detail
description: "Verifies a small batch of claims against the specific component design files named by the host. Input: a list of {claim, component file path} pairs"
model: haiku
tools: Read, Glob, Grep
---
```

Body structure (condensed from the full file; see Output Structure below for the exact schema):

```markdown
# Validate Tech-Spec Component Detail

A narrow QA agent: for each claim in this batch, Read ONLY the one named component file and decide
whether its own content satisfies that claim. Do not Read, Glob, or Grep for `feature.md`,
`req/index.md`, `spec/index.md`, or any component file NOT explicitly named in this prompt — every
file you need is already named below; searching for anything else is out of scope for this agent
and wastes the narrow batch this call was sized for.

## Phase 1 — Load This Batch

The host supplies, in the dispatch prompt, one entry per line:
`Claim: {claim text}` followed by `Component file: {absolute path}`.
Multiple claims may name the SAME component file — Read each distinct file only once, then check
every claim assigned to it against that one reading.

## Phase 2 — Verify Each Claim

For each claim, Read its named file (if not already read for an earlier claim in this batch) and
decide: does this file's own actual content (its Change/Algorithm/Schema/Tests sections, or
whichever of those the file actually has) satisfy the claim? Be specific and literal — a claim
about an exact endpoint method/path, a schema field, or an error code is satisfied only if that
exact detail is actually present in the file, not merely plausible given the file's general topic.

## Phase 3 — Structured Completion (MANDATORY — your final response)

Return a single JSON object with exactly one field:

```json
{"findings": ["Tech-Spec: components/AuthMiddleware.cs.md does not document a 401 response for an expired token, as feature.md requires"]}
```

- `findings` is an array of strings, one per claim that is NOT satisfied by its named file's
  content. A satisfied claim produces NO entry — do not report successes.
- Every finding string is prefixed `"Tech-Spec: "`, matching the same convention
  `gaia-validate-feature-docs`'s own `findings` array and the host's deterministic
  AC↔component check already use, so the host can merge every source into one array with no
  format-specific handling for this agent's own output.
- An empty array (`{"findings": []}`) means every claim in this batch was confirmed.
- The caller supplies `--json-schema`; use the runtime's structured-output mechanism to return this
  object in `structured_output`.

## Guidelines

- **Read only the named files** — never search for or infer any other document.
- **One call, one batch** — do not ask the host for more context; if a named file's content is
  genuinely ambiguous about a claim, report it as NOT satisfied (fail closed) rather than guessing.
- **Be literal, not generous** — "plausibly related" is not the same as "actually documented".
```

## Tests

See `components/workflow-runtime.test.js.md` for the end-to-end dispatch tests (AC-09, AC-10) that
exercise this agent's real resolution and response-merging path. This agent file's own frontmatter
and schema shape are also covered by the existing project-wide agent-frontmatter structural test
suite (`tests/frontmatter/`), which validates every `.claude/agents/*.md` file's frontmatter
without needing a dedicated new test.
