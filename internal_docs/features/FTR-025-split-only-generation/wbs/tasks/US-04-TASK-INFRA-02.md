<a id="task-US-04-TASK-INFRA-02"></a>
### US-04-TASK-INFRA-02

- **Task ID:** US-04-TASK-INFRA-02
- **Title:** Update feature-status.md's artifact-presence check
- **Outcome:** feature-status.md's step 2 checks Requirements/Tech-Spec/Work-Breakdown presence as 'either split shape (req/index.md, spec/index.md, wbs/index.json) or the assembled file', noting which shape was found, instead of assuming the monolithic files always exist
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-10
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 8000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** docs
- **Commit scope:** —
- **Commit subject:** update feature-status.md for the new split-by-default artifact set

**Implementation notes:**

Depends only on US-01-TASK-BE-01 (the fact that monolithic files are no longer unconditionally
written) — independent of US-02/US-03/US-04's own tasks. Rewrite step 2's bullet list: Requirements
→ "✅ if either `req/index.md` (split, default) or `{PREFIX}-Requirements.md` (assembled, legacy
or user-requested via `/assemble-docs`) exists; note which shape was found"; same pattern for
Tech-Spec (`spec/index.md`) and Work Breakdown (`wbs/index.json` vs `{PREFIX}-Work-Breakdown.md`).
Implementation-status cross-checking already reads `wbs/` directly and is unaffected.

**Verification commands:**

```
npx jest --testPathPattern=tests/cli/asset-catalog.test.js
```
