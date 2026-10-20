# src/claude/agents/gaia-generate-requirements.md — Modified

## Change

Corrects the agent's own inline "Output Structure" example for Section 7 (Acceptance Criteria) from
a stale 3-column shape (missing `Priority` entirely) to the real, authoritative 4-column shape
already defined by `gaia-requirements-index-template.md` — the same template `pm-phase1.js` already
inlines into this agent's own prompt (`withTemplate(featurePath, 'req/index.md',
'gaia-requirements-index-template.md')`). Removes a confirmed, real inconsistency between what this
agent's own doc shows and what gets inlined alongside it in the same prompt — defense in depth, not
claimed as the sole cause of the specific 5-column defect this feature was motivated by (neither
document shows a Given/When/Then-split-into-3-cells shape literally).

## Algorithm

Replace the Section 7 example (`gaia-generate-requirements.md:124-130`):

```markdown
# before:
## 7. Acceptance Criteria

For each use case, define testable acceptance criteria:

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-01 | Given [context], when [action], then [result] | UC-01 |

# after:
## 7. Acceptance Criteria

For each use case, define testable acceptance criteria. Use the EXACT 4-column shape below — do
not add, remove, split, or reorder columns; the host's positional parser requires this exact shape:

| ID | Criterion | Related UC | Priority |
|----|-----------|-------------|----------|
| AC-01 | Given [context], when [action], then [result] | UC-01 | Must |
```

No other part of this agent's own instructions changes — this is a one-section text correction.

## Tests

`tests/frontmatter/agents.test.js` continues to structurally validate this file's frontmatter
unmodified. See `components/req-skeleton-check.test.js.md` for the deterministic structural check
(UC-02) that is the actual enforcement mechanism regardless of whether this prompt correction alone
fully prevents a future drift.
