<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Cover the skeleton/detail estimate boundary move end to end
- **Outcome:** New describe block in workflow-runtime.test.js proving AC-01 through AC-04: a skeleton without estimate is accepted, the assembled task's estimate comes from the per-task detail response, c.estimates() and the structural checks are unaffected
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01, US-01-TASK-BE-02
- **Acceptance criteria:** AC-01, AC-02, AC-03, AC-04
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** workflow-runtime
- **Commit subject:** cover the WBS skeleton/detail estimate boundary move end to end

**Implementation notes:**

Per `spec/components/workflow-runtime.test.js.md`. Add a new
`describe('FTR-032 — WBS skeleton call no longer requires estimate; per-task detail call is the
source of truth', ...)` block to `tests/integration/workflow-runtime.test.js`, reusing this file's
own existing `baseWb()`/`phase2Dispatch(wb)`/`taskDetailDoc(taskId)` fixture helpers (already
defined earlier in the file, used by the FTR-020/FTR-027 describe blocks) — no new fixture
machinery needed beyond one small addition:

```js
// alongside the existing taskDetailDoc(taskId) definition:
const taskDetailDocWithEstimate = (taskId, { agentMinutes, tokens }) =>
  taskDetailDoc(taskId).replace(/- \*\*Estimate — agent minutes:\*\* \d+/, `- **Estimate — agent minutes:** ${agentMinutes}`)
                        .replace(/- \*\*Estimate — tokens:\*\* \d+/, `- **Estimate — tokens:** ${tokens}`)
```

Then the four tests from the Tech-Spec component's own Algorithm section — delete `wb.tasks[
'INFRA-TASK-BE-01'].estimate` before dispatching for AC-01/AC-03/AC-04, and additionally swap in
`taskDetailDocWithEstimate(..., { agentMinutes: 13, tokens: 31000 })` (a deliberately DIFFERENT
value than any skeleton-era fixture ever used) for AC-02, asserting the final assembled task's
`estimate` equals exactly that pair — a pass here can only mean the per-task response's own
estimate was genuinely read, not a skeleton-era leftover. Use `wbs-assembler.js`'s
`loadWorkBreakdown` directly (already imported elsewhere in this file) to read back the assembled
structure after `runWorkflow('pm-phase2', ...)` completes.

**Verification commands:**

```
npx jest tests/integration/workflow-runtime.test.js -t "FTR-032"
```
