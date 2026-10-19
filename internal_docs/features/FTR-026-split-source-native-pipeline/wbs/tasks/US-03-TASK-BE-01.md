<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Generate the Work Breakdown skeleton from split req//spec/ sources with targeted drilldown
- **Outcome:** gaia-generate-work-breakdown.md's Step 1 reads req/index.md+spec/index.md first for a real-split feature (falling back to the two monolithic files for a legacy feature), drilling into req/use-cases/*.md/spec/components/*.md only as needed via its existing Read/Glob/Grep tools; steps 2 onward are unchanged
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-05
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** gaia-generate-work-breakdown
- **Commit subject:** read split req/spec index files with targeted per-item drilldown

**Implementation notes:**

Rewrite `src/claude/agents/gaia-generate-work-breakdown.md`'s Step 1 ("Load and
Cross-Reference") only — no other step changes, since they already operate on *extracted
information*, not on which file it came from.

```markdown
<!-- BEFORE -->
### Step 1 — Load and Cross-Reference

1. Read `{PREFIX}-Requirements.md` fully — extract all Use Cases (UC-XX), acceptance criteria
   (AC-XX), business rules (BR-XX), NFRs
2. Read `{PREFIX}-Tech-Spec.md` fully — extract architecture, file inventory, implementation
   order, data model, API endpoints, frontend components

<!-- AFTER -->
### Step 1 — Load and Cross-Reference

1. Check whether `req/index.md` exists (the split Requirements format, FTR-021). If it does:
   - Read `req/index.md` fully — it already contains the full Use Cases index table, all Business
     Rules, all Acceptance Criteria, and all NFRs
   - For any UC whose own full flow description you need beyond the index's short summary, Read
     `req/use-cases/{UC-ID}.md` directly
   If `req/index.md` does not exist (a legacy feature), Read `{PREFIX}-Requirements.md` fully
   instead.
2. Check whether `spec/index.md` exists (the split Tech-Spec format, FTR-024). If it does:
   - Read `spec/index.md` fully — it already contains Architecture, Section 9's complete File
     Inventory/Components table, Implementation Order, and Risks
   - For any component whose own design detail you need beyond the Components table's one-line
     summary, Read `spec/components/{file-slug}.md` directly — the `Spec` column names the path
   - If the index alone is insufficient to decide which per-item files matter for a given phase/task,
     fall back to reading every file under `spec/components/` rather than proceeding with
     incomplete context
   If `spec/index.md` does not exist (a legacy feature), Read `{PREFIX}-Tech-Spec.md` fully
   instead.
```

This component's own dispatch call in `pm-phase2.js` (`c.worker('gaia.agent.planner.work-breakdown',
featurePath, { schema: SKELETON_SCHEMA })`) is unchanged — only the agent's internal instructions
change, so no call-site edit is needed in `pm-phase2.js` for this task.

**Verification commands:**

```
echo "prompt-only change — no automated test; see Tech-Spec §10 for rationale"
```
