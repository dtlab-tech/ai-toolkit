<a id="task-US-04-TASK-BE-01"></a>
### US-04-TASK-BE-01

- **Task ID:** US-04-TASK-BE-01
- **Title:** Implement skeleton-call step in pm-phase2.js
- **Outcome:** pm-phase2.js dispatches gaia.agent.planner.work-breakdown with the SKELETON_SCHEMA (no declared worker() output), then materializeIndex() adds detailFile and status:"pending" per task, and the coordinator writes wbs/index.json itself via c.writeOutput; resume path (index.json already exists) reuses it via c.json instead of re-dispatching
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-INFRA-01, INFRA-TASK-BE-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add skeleton-call step with resume detection to pm-phase2.js

**Implementation notes:**

Replaces the current lines 33–36 of `pm-phase2.js` (`const jsonPath = ...; await c.worker(...)`).
From Tech-Spec §5/§6:

```js
// NOT file('wbs') — file() always prepends '{prefix}-'; that's right for a single artifact
// file (file('Requirements.md') -> '{prefix}-Requirements.md') but redundant for a directory
// already nested inside the feature's own prefixed folder.
const wbsDir = `${featureDir}/wbs`          // {featureDir}/wbs/
const indexPath = `${wbsDir}/index.json`

const SKELETON_SCHEMA = { /* exact JSON Schema object from Tech-Spec §5 — phases[] with
  id/type/title/commit/taskIds, tasks{} keyed by id with title/outcome/domain/agentType/
  dependsOn/acceptanceCriteria/estimate/outputCount/commit, all required */ }

function materializeIndex(skeleton) {
  const tasks = {}
  for (const [taskId, t] of Object.entries(skeleton.tasks)) {
    tasks[taskId] = { ...t, detailFile: `tasks/${taskId}.md`, status: 'pending' }
  }
  const phases = skeleton.phases.map(p => ({
    id: p.id, type: p.type, detailFile: `user-stories/${p.id}.md`, taskIds: p.taskIds,
  }))
  return { schemaVersion: 3, feature: skeleton.feature, phases, tasks }
}

let index
if (!c.exists(indexPath)) {
  const skeleton = await c.worker('gaia.agent.planner.work-breakdown', featurePath, { schema: SKELETON_SCHEMA })
  index = materializeIndex(skeleton)
  // Phase tier (OQ-04): write user-stories/{id}.md now — title/commit are fully known from this
  // one response, there is no later phase-generation pass to defer to.
  for (const phase of index.phases) {
    const skeletonPhase = skeleton.phases.find(p => p.id === phase.id)
    c.writeOutput(`${wbsDir}/${phase.detailFile}`, renderPhaseDetailBlock(skeletonPhase))
  }
  c.writeOutput(indexPath, JSON.stringify(index, null, 2))
} else {
  index = c.json(indexPath)   // resume: reuse existing skeleton, do not re-dispatch
}
```
`renderPhaseDetailBlock` is imported from `wbs-assembler.js` (`INFRA-TASK-BE-02`). Note the
`c.worker()` call here has **no** `outputs` option — unlike every other `worker()` call in this
codebase, this one's result is consumed directly as the returned payload (`schema` mode already
returns the parsed/validated object; see `lib/workflow-control.js` lines 248–256) rather than
written by `worker()` itself, because the host needs to split it into N+1 files
(`index.json` + one `user-stories/*.md` per phase), and `worker()`'s output contract caps at exactly
one file (see Tech-Spec §1 — this is the whole reason the design avoids touching that contract).

**Verification commands:**

```
node --check src/claude/workflows/pm-phase2.js
```
