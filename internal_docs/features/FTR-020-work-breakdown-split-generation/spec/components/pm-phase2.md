# `src/claude/workflows/pm-phase2.js` — Modified

**Related Open Questions:** OQ-04 (see [index.md](../index.md#2-resolution-of-open-questions))
**Related components:** [gaia-generate-work-breakdown.md](gaia-generate-work-breakdown.md), [gaia-generate-work-breakdown-task.md](gaia-generate-work-breakdown-task.md), [wb-graph-checks.md](wb-graph-checks.md), [wbs-assembler.md](wbs-assembler.md)

**Addresses:** AC-01, AC-02, AC-03, AC-08, AC-09 (see [req/index.md](../../req/index.md#6-acceptance-criteria))

## Change

New control flow: skeleton call (no declared `worker()` output; coordinator writes `index.json`
itself via `c.writeOutput`) → `wb-graph-checks.js` pre-checks → per-task loop (resume-by-status)
→ assembly via `wbs-assembler.js` (implicit, through the modified `wb-validate.js`/`wb-render.js`
CLI calls — `pm-phase2.js` itself keeps passing a path, now the `wbs` directory, to `c.command`)
→ existing semantic validation, rendering, Gate 2 payload unchanged.

## Control flow (replaces current lines 33–58)

```js
// Deliberately NOT file('wbs') — file() always prepends '{prefix}-' (every other artifact,
// e.g. file('Requirements.md') -> '{prefix}-Requirements.md', is a single file named after its
// own content, so the prefix disambiguates it; this is a directory nested inside the feature's
// own already-prefixed folder, so repeating the prefix on the directory name is redundant.
const wbsDir = `${featureDir}/wbs`                  // {featureDir}/wbs/
const indexPath = `${wbsDir}/index.json`

// 1. Skeleton (no declared worker() output — host writes every file itself)
let index
if (!c.exists(indexPath)) {
  const skeleton = await c.worker('gaia.agent.planner.work-breakdown', featurePath, {
    schema: SKELETON_SCHEMA,
  })
  // materializeIndex: (a) strips title/commit out of each phase and writes them to
  // user-stories/{id}.md via renderPhaseDetailBlock (OQ-04 — phase content is fully known now,
  // written immediately, not lazily); (b) adds detailFile + status:"pending" per task.
  index = materializeIndex(skeleton)
  for (const phase of index.phases) {
    c.writeOutput(`${wbsDir}/${phase.detailFile}`, renderPhaseDetailBlock(skeleton.phases.find(p => p.id === phase.id)))
  }
  c.writeOutput(indexPath, JSON.stringify(index, null, 2))
} else {
  index = c.json(indexPath)                          // resume: reuse existing skeleton as-is
}

// 2. Structural pre-checks (wb-graph-checks.js, same functions wb-validate.js now imports)
const graphErrors = runGraphChecks(index, c.read(file('Requirements.md')))
if (graphErrors.length) throw new Error('Work breakdown skeleton failed structural checks: ' + JSON.stringify(graphErrors))

// 3. Per-task generation, resume-by-status, sequential
for (const phase of index.phases) {
  for (const taskId of phase.taskIds) {
    const task = index.tasks[taskId]
    const detailPath = `${wbsDir}/${task.detailFile}`
    if (task.status === 'generated' && c.exists(detailPath)) continue   // UC-04
    const detail = await c.worker('gaia.agent.planner.work-breakdown-task',
      buildTaskPrompt(index, taskId, file('Tech-Spec.md')), { label: `work-breakdown-task:${taskId}` })
    c.writeOutput(detailPath, detail)
    task.status = 'generated'
    c.writeOutput(indexPath, JSON.stringify(index, null, 2))   // persist status after each task (NFR-01)
  }
}

// 4. Assembly + existing pipeline, unchanged past this point except the path passed in
const report = await c.activity('wb-validate', async () => {
  const res = c.command(['run-asset', 'scripts/wb-validate.js', '--project', c.root,
    '--', wbsDir, file('Requirements.md')], [0, 1])
  ...  // unchanged body
})
// ... semantic validation, wb-render.js (passed wbsDir instead of jsonPath), Gate 2 payload: unchanged
```

`materializeIndex`/`runGraphChecks`/`buildTaskPrompt` are small new pure helper functions local to
`pm-phase2.js` (or a co-located `pm-phase2-wbs.js` helper module if the workflow script file
would otherwise grow unreasonably large — implementation detail, not a contract surface).

## Tests

`pm-phase2-wbs-resume.test.js`: a skeleton with some tasks already `status: "generated"` and
existing detail files is re-run; assert only `pending` tasks dispatch a `worker()` call
(mock/stub dispatch, counting invocations) (AC-03).
