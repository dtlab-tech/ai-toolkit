<a id="task-US-02-TASK-BE-03"></a>
### US-02-TASK-BE-03

- **Task ID:** US-02-TASK-BE-03
- **Title:** Correct the stale 3-column AC example in gaia-generate-requirements.md
- **Outcome:** gaia-generate-requirements.md's inline Section 7 example is corrected from a 3-column shape (missing Priority) to the real, authoritative 4-column shape, matching gaia-requirements-index-template.md
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-07
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** fix
- **Commit scope:** gaia-generate-requirements
- **Commit subject:** correct the stale 3-column AC table example

**Implementation notes:**

Per `spec/components/gaia-generate-requirements.md.md`'s Algorithm section: replace Section 7's
example table (`gaia-generate-requirements.md:124-130`) with the 4-column version shown there
(`ID | Criterion | Related UC | Priority`), and add the one-sentence instruction not to add,
remove, split, or reorder columns. No other part of this agent's own instructions changes.

**Verification commands:**

```
npm test -- tests/frontmatter/agents.test.js
```
