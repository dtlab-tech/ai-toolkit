<a id="task-US-04-TASK-BE-03"></a>
### US-04-TASK-BE-03

- **Task ID:** US-04-TASK-BE-03
- **Title:** Implement per-task generation loop with resume-by-status in pm-phase2.js
- **Outcome:** pm-phase2.js iterates index.phases/taskIds in order; for each task with status !== "generated" or a missing detail file, dispatches gaia.agent.planner.work-breakdown-task via buildTaskPrompt(), writes the response to wbs/tasks/{taskId}.md via c.writeOutput, sets status to "generated", and persists index.json after each task; already-generated tasks with an existing file are skipped without dispatch
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-INFRA-01, US-04-TASK-BE-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** above target (20 min): the dispatch, write, status update, and persist-after-each-task steps are one atomic resume-safety unit (US-04's BR-03/BR-04) that cannot be split without leaving an intermediate state where a task could be marked generated without its file, or vice versa.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add per-task generation loop with resume-by-status to pm-phase2.js

**Implementation notes:**

The resume check is **belt-and-suspenders**: trust `status` only together with the file actually
existing (BR-04 — "status alone is not trusted without the file", Requirements UC-04):

```js
function buildTaskPrompt(index, taskId, techSpecText) {
  const task = index.tasks[taskId]
  const siblingList = Object.entries(index.tasks)
    .map(([id, t]) => `- ${id}: ${t.title} — ${t.outcome}`).join('\n')
  return [
    `Task skeleton entry:\n${JSON.stringify({ id: taskId, ...task }, null, 2)}`,
    `Tech-Spec (relevant section):\n${extractRelevantSection(techSpecText, task.domain)}`,
    `All tasks in this feature (for duplicate-implementation awareness):\n${siblingList}`,
  ].join('\n\n')
}

for (const phase of index.phases) {
  for (const taskId of phase.taskIds) {
    const task = index.tasks[taskId]
    const detailPath = `${wbsDir}/${task.detailFile}`
    if (task.status === 'generated' && c.exists(detailPath)) continue   // UC-04: skip, no dispatch

    const detail = await c.worker('gaia.agent.planner.work-breakdown-task',
      buildTaskPrompt(index, taskId, techSpecText), { label: `work-breakdown-task:${taskId}` })
    c.writeOutput(detailPath, detail)
    task.status = 'generated'
    c.writeOutput(indexPath, JSON.stringify(index, null, 2))   // persist immediately — if the
    // process dies on the NEXT task, this one must already read back as generated+file-present
  }
}
```
`extractRelevantSection(techSpecText, domain)` is a small new helper — a crude section-heading
match on the Tech-Spec's domain-labeled headings (BE/FE/DB/API/etc., whatever `AGENTS.md`'s
convention for this project uses) is acceptable; it does not need to be exhaustive, since the
per-task agent still has `Read`/`Grep` tools and can look at the Tech-Spec file itself if the
extracted excerpt is insufficient — this just keeps the common case small per Tech-Spec's whole
rationale (OQ-04's distinction: this *is* one of the calls that genuinely benefits from a smaller
prompt, unlike the phase tier).

Iterate `index.phases`/`taskIds` in that exact order (not `Object.keys(index.tasks)`, which has
no guaranteed phase-respecting order) so the dispatch sequence matches the dependency-respecting
order the skeleton call itself produced.

**Verification commands:**

```
node --check src/claude/workflows/pm-phase2.js
```
