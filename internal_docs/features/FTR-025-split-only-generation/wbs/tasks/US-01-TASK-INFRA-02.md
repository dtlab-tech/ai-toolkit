<a id="task-US-01-TASK-INFRA-02"></a>
### US-01-TASK-INFRA-02

- **Task ID:** US-01-TASK-INFRA-02
- **Title:** Repoint gaia-generate-tech-spec's traceability read at req/index.md
- **Outcome:** gaia-generate-tech-spec.md's Process step 2 changes from 'Read {PREFIX}-Requirements.md if it exists (for traceability)' to 'Read req/index.md if it exists (for traceability)'; the Guidelines' AC-citation rule is updated the same way, from '{PREFIX}-Requirements.md's own AC table' to 'req/index.md's own AC table'
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-09
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 10000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** repoint gaia-generate-tech-spec's traceability read at req/index.md

**Implementation notes:**

Independent of every other task in this phase — the host (`pm-phase1.js`) already only ever passes
`featurePath` to this agent; it locates its own traceability input by convention, so no host-side
change is needed, only this prompt-wording fix. The AC table and Use Case index this agent needs
for traceability already live, untouched, in `req/index.md` (FTR-021) — no behavioral change, only
which file the agent is told to read.

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter/agents.test.js
```
