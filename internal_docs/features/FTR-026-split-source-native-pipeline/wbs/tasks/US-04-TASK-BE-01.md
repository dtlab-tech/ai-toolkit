<a id="task-US-04-TASK-BE-01"></a>
### US-04-TASK-BE-01

- **Task ID:** US-04-TASK-BE-01
- **Title:** Compute a per-task Tech-Spec excerpt from AC-matched components
- **Outcome:** pm-phase2.js gains a local parseComponentsTableLocal(specIndexContent) + buildTaskTechSpecExcerpt(components, task, specDir) pair, wired into the per-task dispatch loop in place of c.read(file('Tech-Spec.md')); a task whose acceptanceCriteria matches a component's Addresses column receives only that component's body, with a full-Components-table fallback when nothing matches
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-06
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** pm-phase2
- **Commit subject:** compute a per-task Tech-Spec excerpt from AC-matched components

**Implementation notes:**

Add two local functions to `src/claude/workflows/pm-phase2.js` (same "duplicated, not
required — sandboxed runtime has no `require()`" precedent already used for the template-engine
primitives at the top of this file), and change the per-task dispatch loop:

```js
// Local re-implementation of tech-spec-assembler.js's parseComponentsTable, reading
// specIndexContent via c.read() instead of fs.readFileSync. Keep in sync with the canonical
// implementation if spec/index.md's Section 9 table shape ever changes.
function parseComponentsTableLocal(specIndexContent) { /* same algorithm as tech-spec-assembler.js's
  parseComponentsTable: find Section 9's "### New files"/"### Modified files" subtables, parse each
  row's [filePath, purposeOrChange, addresses, domain, specLink] cells, extract fileSlug from the
  Spec column's `(components/...)` link. */ }

function buildTaskTechSpecExcerpt(components, task, specDir, specIndexContent) {
  const acSet = new Set(task.acceptanceCriteria || [])
  const relevant = components.filter(comp =>
    (comp.addresses || '').split(',').map(s => s.trim()).some(acId => acSet.has(acId)))
  if (relevant.length === 0) {
    return "_No component's Addresses column cites this task's Acceptance Criteria — full " +
      "Components table below._\n\n" + specIndexContent
  }
  return relevant.map(comp => {
    const body = c.read(`${specDir}/components/${comp.fileSlug}`)
    return `### ${comp.filePath}\n\n${body}`
  }).join('\n\n')
}

// Per-task dispatch loop — compute components ONCE before the loop (not per task):
const components = hasSpec ? parseComponentsTableLocal(c.read(specIndexPath)) : []
for (const phase of index.phases) {
  for (const taskId of phase.taskIds) {
    const task = index.tasks[taskId]
    // ...existing resume-by-status check...
    const techSpecExcerpt = hasSpec
      ? buildTaskTechSpecExcerpt(components, task, specDir, c.read(specIndexPath))
      : c.read(file('Tech-Spec.md')) // legacy fallback: unchanged, full text
    const detail = await c.worker('gaia.agent.planner.work-breakdown-task',
      buildTaskPrompt(index, taskId, techSpecExcerpt), { label: `work-breakdown-task:${taskId}` })
    // ...rest unchanged...
  }
}
```

`buildTaskPrompt()`'s own signature/body is unchanged — it already just inlines whatever
`techSpecText` string it's given under a `Tech-Spec:\n` label; only the VALUE passed to it changes.

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "Tech-Spec excerpt"
```
