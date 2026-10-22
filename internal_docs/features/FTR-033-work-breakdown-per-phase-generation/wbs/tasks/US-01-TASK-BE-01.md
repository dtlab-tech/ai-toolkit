<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Split pm-phase2.js's WBS skeleton call into phase enumeration + per-phase generation
- **Outcome:** pm-phase2.js's SKELETON_SCHEMA is replaced by PHASE_ENUMERATION_SCHEMA + PHASE_TASKS_SCHEMA; a new per-phase loop dispatches gaia.agent.planner.work-breakdown-phase once per phase in enumerated order, persisting index.json after each phase (with title/commit additively carried) and resuming from the first phase whose taskIds is still empty
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-INFRA-01, US-01-TASK-INFRA-02
- **Acceptance criteria:** AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-08
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** The schema split, the new prompt builders, the local Requirements-UC-table helper, and the per-phase loop are one task because none of them is independently dispatchable or testable — the loop needs both schemas and both prompt builders to exist, and the prompt builders need the local table helper. Splitting this into smaller tasks would only produce intermediate states that don't compile against `c.worker()`'s real call sites.
- **Commit type:** feat
- **Commit scope:** pm-phase2
- **Commit subject:** split WBS skeleton generation into phase enumeration and per-phase task generation

**Implementation notes:**

Per `spec/components/pm-phase2.js.md` verbatim, against the real current `src/claude/workflows/pm-phase2.js` (529 lines). Five edits, all within this one file:

**Edit 1 — replace `SKELETON_SCHEMA` (lines 12-69) with two schemas:**

```js
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

`SKELETON_DRILL_DOWN_MAX_COMPONENTS` (line 75) and `buildComponentDrillDownText` (lines 102-114) are
kept byte-for-byte unchanged — reused per phase instead of once per feature.

**Edit 2 — replace `buildSkeletonPrompt` (lines 81-95) and `materializeIndex` (lines 116-129):**

```js
// renamed from buildSkeletonPrompt — no drillDownText parameter: the enumeration call never
// declares needsComponentDetail (see Edit 4's own comment on why), so there is nothing to inline
// a second round for.
function buildPhaseEnumerationPrompt(featurePath, requirementsText, techSpecSkeletonText) {
  return [featurePath, '', 'Requirements:', requirementsText, '', 'Tech-Spec:', techSpecSkeletonText].join('\n')
}

// replaces materializeIndex — additively persists title/commit per phase (BR-09): a resumed run
// between phase-enumeration and the last phase's completion must be able to re-render any
// EARLIER-but-already-completed phase's own detail file (which needs title/commit) without
// re-calling the phase-enumeration agent.
function materializeEnumeratedPhases(phaseList) {
  const phases = phaseList.phases.map(p => ({
    id: p.id, type: p.type, title: p.title, commit: p.commit, sourceUC: p.sourceUC,
    detailFile: `user-stories/${p.id}.md`, taskIds: [],
  }))
  return { schemaVersion: 3, feature: phaseList.feature, phases, tasks: {} }
}
```

**Edit 3 — add three new functions, placed immediately after `parseComponentsTableLocal` (after
line 279, before `buildTaskTechSpecExcerpt`):**

```js
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
// (non-split) feature — hasReq is false, so sourceUC-based file lookups are meaningless anyway.
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

**Edit 4 — replace the entire "1. Skeleton" block (current lines 388-429, from `// 1. Skeleton`
through the closing `}` of the `else` branch) with:**

```js
  // 1. Phase enumeration (no declared worker() output — host writes every file itself)
  let index
  if (!c.exists(indexPath)) {
    const requirementsForSkeleton = hasReq
      ? c.command(['run-asset', 'scripts/req-assembler.js', '--project', c.root, '--', reqDir]).stdout
      : c.read(file('Requirements.md'))
    const techSpecSkeletonForSkeleton = hasSpec ? c.read(specIndexPath) : c.read(file('Tech-Spec.md'))

    // No needsComponentDetail round here — the enumeration agent never declares or asks for it
    // (PHASE_ENUMERATION_SCHEMA has no such property; gaia-generate-work-breakdown.md's own Output
    // section doesn't mention it either). Phase-level decisions (id/type/title/sourceUC/commit)
    // never need a component's own design body; the drill-down mechanism now lives ONLY at the
    // per-phase tier below, where task-level decisions genuinely can need it (AC-08).
    const phaseList = await c.worker('gaia.agent.planner.work-breakdown',
      buildPhaseEnumerationPrompt(featurePath, requirementsForSkeleton, techSpecSkeletonForSkeleton),
      { schema: PHASE_ENUMERATION_SCHEMA })

    index = materializeEnumeratedPhases(phaseList)
    c.writeOutput(indexPath, JSON.stringify(index, null, 2))
  } else {
    index = c.json(indexPath) // resume: reuse already-enumerated phases / already-generated tasks as-is
  }

  // 1b. Per-phase task generation (resume-by-phase: a phase whose taskIds is already non-empty is
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

    const phaseNeedsComponentDetail = phaseResult.needsComponentDetail || []
    if (hasSpec && phaseNeedsComponentDetail.length > 0) {
      const drillDownText = buildComponentDrillDownText(phaseNeedsComponentDetail, c.read(specIndexPath), specDir)
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

`computeDependsOnPhases` (lines 217-228) and `renderPhaseDetailBlock` (lines 183-211) are
UNCHANGED — `computeDependsOnPhases` only ever reads the CURRENT phase's own `taskIds` plus
`index.tasks[...].dependsOn`, both fully populated by the time it's called here;
`renderPhaseDetailBlock` already takes `context` as a plain field on the object passed to it — the
spread `{ ...phase, context: phaseResult.context }` supplies the one field `index.phases` entries
deliberately don't carry.

Everything from the current "2. Structural pre-checks" step onward (current line 431 to the end
of the file) is **unchanged** — it already operates on the final, fully-populated `index`/
`indexPath` regardless of how many calls produced it.

**Edit 5 — no changes needed to `buildTaskTechSpecExcerpt`, `hasVerificationCommands`,
`buildTaskPrompt`, or anything in step 3 (per-task detail generation) — confirmed by direct
inspection that none of them reference the removed `context`/`estimate`-on-phases shape or
`materializeIndex`/`buildSkeletonPrompt` by name.**

**Verification commands:**

```
node --check src/claude/workflows/pm-phase2.js
```
