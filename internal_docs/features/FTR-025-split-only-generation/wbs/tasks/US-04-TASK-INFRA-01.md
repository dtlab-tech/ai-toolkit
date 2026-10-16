<a id="task-US-04-TASK-INFRA-01"></a>
### US-04-TASK-INFRA-01

- **Task ID:** US-04-TASK-INFRA-01
- **Title:** Update implement-feature/SKILL.md's Gate 1 presentation
- **Outcome:** SKILL.md's Step 2 presentation block uses {requirements.path}/{tech_spec.path} (now req/index.md/spec/index.md) instead of the literal monolithic filenames, adds a line pointing at the new /assemble-docs command, and the Approvals.md template's Gate 1 table rows are updated to the same paths; docs_digest and pm-phase2.js's Gate 1 regex check (heading/approval-marker/digest-line only) are unaffected
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-02, US-03-TASK-BE-02
- **Acceptance criteria:** AC-10
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 10000
- **Output count:** 1
- **Grouping rationale:** Depends on both US-01 (requirements.path/tech_spec.path's new value) and US-03 (the pipeline's post-Gate-1 behavior this step describes) — bundled as one small task since both dependencies must already be resolved before this wording can be written accurately, and editing the same short section twice (once per dependency) would be artificial churn.
- **Commit type:** docs
- **Commit scope:** —
- **Commit subject:** update implement-feature SKILL.md for the new split-by-default artifact set

**Implementation notes:**

Replace the "Documents generated for {PREFIX}:" block's two monolithic-filename lines with
`{requirements.path} — {requirements.summary}` / `{tech_spec.path} — {tech_spec.summary}`, and add
a line: "To view a single combined document instead of the split source files, run: /assemble-docs
{PREFIX} [req|spec|all]". In the Approvals.md template (the markdown block written on user
approval), change the Gate 1 table's Requirements/Tech-Spec row labels from
`{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` to `{requirements.path}`/`{tech_spec.path}` —
purely cosmetic, since `pm-phase2.js`'s Gate 1 check only parses the `## Gate 1` heading, a
`✅ Approved` marker, and the `**Docs Digest:**` line, never the row text itself. `docs_digest`
itself is unchanged in format/meaning.

**Verification commands:**

```
npx jest --testPathPattern=tests/integration/workflow-runtime.test.js
```
