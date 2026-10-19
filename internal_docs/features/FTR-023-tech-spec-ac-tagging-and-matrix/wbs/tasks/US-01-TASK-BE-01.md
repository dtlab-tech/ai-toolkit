<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Add Addresses column to gaia-generate-tech-spec.md's File Inventory template
- **Outcome:** src/claude/agents/gaia-generate-tech-spec.md's Section 9 'New files' and 'Modified files' tables each gain a third 'Addresses' column; a new Guidelines bullet instructs the agent to cite real Requirements AC IDs (comma-separated) or em-dash, never inventing an AC ID
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-01, AC-06
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add Addresses column to Tech-Spec File Inventory template

**Implementation notes:**

Edit only §9's two tables (currently, pre-this-task: `### New files` with columns `Path |
Purpose`, `### Modified files` with columns `Path | Change description`) — no other section of
`gaia-generate-tech-spec.md` changes:

```markdown
## 9. File Inventory

Complete list of files to create or modify:

### New files
| Path | Purpose | Addresses |
|------|---------|-----------|
| ... | ... | ... |

### Modified files
| Path | Change description | Addresses |
|------|-------------------|-----------|
| ... | ... | ... |
```

Add one new bullet to the existing `## Guidelines` section (do not replace or reorder the
existing bullets, append this one): *"For every file in the File Inventory, cite the
Requirements AC ID(s) it implements in the `Addresses` column (comma-separated), or `—` if the
file has no direct AC traceability (e.g. a shared helper with no behavior of its own). Do not
invent AC IDs — only cite ones that exist in `{PREFIX}-Requirements.md`'s own AC table."*

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter
```
