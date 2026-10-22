# src/claude/workflows/pm-phase2.js — Modified

## Change

Replaces `SKELETON_SCHEMA` + the single monolithic skeleton-generation call with
`PHASE_ENUMERATION_SCHEMA` (phase-enumeration, repurposed `gaia-generate-work-breakdown`) +
`PHASE_TASKS_SCHEMA` (per-phase task generation, new `gaia-generate-work-breakdown-phase`),
dispatched in a new per-phase loop with incremental `index.json` persistence and phase-level
resume. A new local `parseUseCaseIndexTableLocal`/`buildPhaseRequirementsExcerpt` pair scopes
Requirements per phase, mirroring the existing local Tech-Spec helpers
(`_findSectionRange`/`_parseTableRows`/`parseComponentsTableLocal`). `buildComponentDrillDownText`
(FTR-032) is reused completely unmodified.

## Algorithm

**Edit 1 — schemas** (replaces `SKELETON_SCHEMA` entirely with two smaller schemas):

```js
// before: SKELETON_SCHEMA (required: schemaVersion/feature/phases/tasks; phases require
// id/type/title/commit/sourceUC/context/taskIds; tasks require title/outcome/domain/agentType/
// dependsOn/acceptanceCriteria/outputCount/commit; optional needsComponentDetail)

// after:
const PHASE_ENUMERATION_SCHEMA = {
  type: 'object',
  required: ['schemaVersion', 'feature', 'phases'],
  properties: {
    schemaVersion: { const: 3 },
    feature: { type: 'string' },
    phases: { type: 'array', items: {
      type: 'object',
      required: ['id', 'type', 'title', 'commit', 'sourceUC'],
      properties: {
        id: { type: 'string' }, type: { enum: ['infrastructure', 'user-story'] },
        title: { type: 'string' },
        commit: { type: 'object', required: ['type', 'subject'],
          properties: { type: { type: 'string' }, subject: { type: 'string' } } },
        sourceUC: { type: 'array', items: { type: 'string' } },
      },
    } },
  },
}

const PHASE_TASKS_SCHEMA = {
  type: 'object',
  required: ['context', 'tasks'],
  properties: {
    context: { type: 'string' },
    tasks: { type: 'object', additionalProperties: {
      type: 'object',
      required: ['title', 'outcome', 'domain', 'agentType', 'dependsOn',
        'acceptanceCriteria', 'outputCount', 'commit'],
      properties: {
        title: { type: 'string' }, outcome: { type: 'string' },
        domain: { enum: ['BE', 'FE', 'DB', 'DevOps', 'INFRA', 'TEST'] },
        ['agentType']: { enum: ['developer-backend', 'developer-frontend', 'developer-testing', 'review-solution'] },
        dependsOn: { type: 'array', items: { type: 'string' } },
        acceptanceCriteria: { type: 'array', items: { type: 'string' } },
        outputCount: { type: 'integer' },
        commit: { type: 'object', required: ['type', 'subject'],
          properties: { type: { type: 'string' }, subject: { type: 'string' } } },
      },
    } },
    needsComponentDetail: { type: 'array', items: { type: 'object',
      properties: { fileSlug: { type: 'string' }, reason: { type: 'string' } }, required: ['fileSlug'] } },
  },
}
```

`SKELETON_DRILL_DOWN_MAX_COMPONENTS` and `buildComponentDrillDownText` (FTR-032) are unchanged —
kept as-is, called per phase now instead of once per feature.

**Edit 2 — `materializeIndex` replaced by `materializeEnumeratedPhases`** (additively persists
`title`/`commit` per phase, per this feature's own Data Model decision — see `req/index.md`'s
BR-09):

```js
// before:
function materializeIndex(skeleton) {
  const tasks = {}
  for (const [taskId, t] of Object.entries(skeleton.tasks)) {
    tasks[taskId] = { ...t, detailFile: `tasks/${taskId}.md`, status: 'pending' }
  }
  const phases = skeleton.phases.map(p => ({
    id: p.id, type: p.type, sourceUC: p.sourceUC, detailFile: `user-stories/${p.id}.md`, taskIds: p.taskIds,
  }))
  return { schemaVersion: 3, feature: skeleton.feature, phases, tasks }
}

// after:
function materializeEnumeratedPhases(phaseList) {
  const phases = phaseList.phases.map(p => ({
    id: p.id, type: p.type, title: p.title, commit: p.commit, sourceUC: p.sourceUC,
    detailFile: `user-stories/${p.id}.md`, taskIds: [],
  }))
  return { schemaVersion: 3, feature: phaseList.feature, phases, tasks: {} }
}
```

**Edit 3 — new prompt builders**, added alongside the existing `buildSkeletonPrompt`
(renamed `buildPhaseEnumerationPrompt`, same body) and `buildComponentDrillDownText`:

```js
// renamed from buildSkeletonPrompt — identical body, new name reflecting its narrower job
function buildPhaseEnumerationPrompt(featurePath, requirementsText, techSpecSkeletonText) {
  return [
    featurePath, '', 'Requirements:', requirementsText, '', 'Tech-Spec:', techSpecSkeletonText,
  ].join('\n')
}

// New local re-implementation of req-assembler.js's own parseUseCaseIndexTable, reusing the
// ALREADY-local _findSectionRange/_parseTableRows this file established for Tech-Spec's own
// Section 9 table (FTR-026) — same "sandboxed runtime has no require" reason.
function parseUseCaseIndexTableLocal(reqIndexContent) {
  const { start, end, lines } = _findSectionRange(reqIndexContent, 2)
  return _parseTableRows(lines, start, end).map(cells => {
    const [id, title, actor, priority, fileCol] = cells
    const m = fileCol && fileCol.match(/\(([^)]+)\)/)
    if (!m) throw new Error(`malformed File column for UC "${id}" in req/index.md`)
    return { id, file: m[1] }
  })
}

// Scopes Requirements to one phase's own sourceUC: req/index.md's feature-wide content (Business
// Rules/AC table/NFRs, never per-UC) is ALWAYS included in full; only the per-UC flow detail is
// narrowed to this phase's own UC(s). Falls back to the raw text unchanged for a legacy
// (non-split) feature, matching this file's existing legacy-fallback convention everywhere else.
function buildPhaseRequirementsExcerpt(reqIndexContent, sourceUC, reqDirArg) {
  const ucTable = parseUseCaseIndexTableLocal(reqIndexContent)
  const matched = ucTable.filter(row => (sourceUC || []).includes(row.id))
  if (matched.length === 0) return reqIndexContent
  const ucBodies = matched.map(row => c.read(`${reqDirArg}/${row.file}`)).join('\n\n')
  return `${reqIndexContent}\n\n${ucBodies}`
}

function buildPhaseTaskPrompt(phase, requirementsExcerpt, techSpecSkeletonText, priorTasks, drillDownText) {
  const priorTasksList = priorTasks.length
    ? priorTasks.map(t => `- ${t.id}: ${t.title} — ${t.outcome} (domain: ${t.domain})`).join('\n')
    : '(none — this is the first phase generated)'
  const parts = [
    `Phase:\n${JSON.stringify(phase, null, 2)}`,
    `Requirements (scoped to this phase's own sourceUC, plus feature-wide sections):\n${requirementsExcerpt}`,
    `Tech-Spec:\n${techSpecSkeletonText}`,
    `Tasks already decided by prior phases:\n${priorTasksList}`,
  ]
  if (drillDownText) parts.push(`Component detail you requested:\n${drillDownText}`)
  return parts.join('\n\n')
}
```

**Edit 4 — the main loop** (replaces the entire "1. Skeleton" block):

```js
// 1. Phase enumeration (no declared worker() output — host writes every file itself)
let index
if (!c.exists(indexPath)) {
  const requirementsForSkeleton = hasReq
    ? c.command(['run-asset', 'scripts/req-assembler.js', '--project', c.root, '--', reqDir]).stdout
    : c.read(file('Requirements.md'))
  const techSpecSkeletonForSkeleton = hasSpec ? c.read(specIndexPath) : c.read(file('Tech-Spec.md'))

  const phaseList = await c.worker('gaia.agent.planner.work-breakdown',
    buildPhaseEnumerationPrompt(featurePath, requirementsForSkeleton, techSpecSkeletonForSkeleton),
    { schema: PHASE_ENUMERATION_SCHEMA })

  index = materializeEnumeratedPhases(phaseList)
  c.writeOutput(indexPath, JSON.stringify(index, null, 2))
} else {
  index = c.json(indexPath) // resume: reuse already-enumerated phases / already-generated tasks as-is
}

// 2. Per-phase task generation (resume-by-phase: a phase whose taskIds is already non-empty is
// skipped entirely, never redispatched)
const reqIndexContentForPhases = c.read(reqIndexPath)
const techSpecSkeletonForPhases = hasSpec ? c.read(specIndexPath) : c.read(file('Tech-Spec.md'))
const taskIdToPhase = new Map()
for (const phase of index.phases) {
  if (phase.taskIds.length > 0) {
    for (const taskId of phase.taskIds) taskIdToPhase.set(taskId, phase.id)
    continue
  }
  const reqExcerpt = hasReq
    ? buildPhaseRequirementsExcerpt(reqIndexContentForPhases, phase.sourceUC, reqDir)
    : reqIndexContentForPhases
  const priorTasks = Object.entries(index.tasks).map(([id, t]) => ({ id, title: t.title, outcome: t.outcome, domain: t.domain }))

  let phaseResult = await c.worker('gaia.agent.planner.work-breakdown-phase',
    buildPhaseTaskPrompt(phase, reqExcerpt, techSpecSkeletonForPhases, priorTasks),
    { schema: PHASE_TASKS_SCHEMA, label: `work-breakdown-phase:${phase.id}` })

  const needsComponentDetail = phaseResult.needsComponentDetail || []
  if (hasSpec && needsComponentDetail.length > 0) {
    const drillDownText = buildComponentDrillDownText(needsComponentDetail, c.read(specIndexPath), specDir)
    if (drillDownText) {
      phaseResult = await c.worker('gaia.agent.planner.work-breakdown-phase',
        buildPhaseTaskPrompt(phase, reqExcerpt, techSpecSkeletonForPhases, priorTasks, drillDownText),
        { schema: PHASE_TASKS_SCHEMA, label: `work-breakdown-phase:${phase.id}:with-drilldown` })
    }
  }

  for (const [taskId, t] of Object.entries(phaseResult.tasks)) {
    index.tasks[taskId] = { ...t, detailFile: `tasks/${taskId}.md`, status: 'pending' }
    taskIdToPhase.set(taskId, phase.id)
  }
  phase.taskIds = Object.keys(phaseResult.tasks)

  const taskTitles = phase.taskIds.map(taskId => ({ id: taskId, title: index.tasks[taskId].title }))
  const dependsOnPhases = computeDependsOnPhases(index, phase.id, taskIdToPhase)
  c.writeOutput(`${wbsDir}/${phase.detailFile}`,
    renderPhaseDetailBlock({ ...phase, context: phaseResult.context }, taskTitles, dependsOnPhases))
  c.writeOutput(indexPath, JSON.stringify(index, null, 2)) // persist BEFORE the next phase's call
}
```

`computeDependsOnPhases` (unchanged, FTR-026) is called here with `index` directly — it only reads
`phase.taskIds`/`index.tasks[...].dependsOn` for the CURRENT phase being rendered, which is already
fully populated by this point; no change needed to that function itself. `renderPhaseDetailBlock`
is also unchanged — `{ ...phase, context: phaseResult.context }` supplies the one field (`context`)
`index.phases` entries deliberately don't carry (BR-09's own scope: only `title`/`commit` are
additively persisted; `context` stays a per-render-time value, exactly as `taskIds`/`sourceUC`
already did before this feature).

## Tests

See `components/workflow-runtime.test.js.md` for the full list of new integration tests
(AC-01 through AC-08).
