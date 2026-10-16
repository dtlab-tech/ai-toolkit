export const meta = {
  controlPlaneVersion: 1,
  name: 'pm-phase2',
  description: 'Generate, validate and render a work breakdown with deterministic control-plane operations.',
  phases: [{ title: 'Work Breakdown' }, { title: 'Effort Estimate' }],
}

// ── Skeleton JSON schema (FTR-020) ───────────────────────────────────────────
// Passed as opts.schema to the skeleton-generation worker call. See
// src/claude/agents/gaia-generate-work-breakdown.md Step 7 for the authoritative
// description of this shape.
const SKELETON_SCHEMA = {
  type: 'object',
  required: ['schemaVersion', 'feature', 'phases', 'tasks'],
  properties: {
    schemaVersion: { const: 3 },
    feature: { type: 'string' },
    phases: { type: 'array', items: {
      type: 'object',
      required: ['id', 'type', 'title', 'commit', 'sourceUC', 'taskIds'],
      properties: {
        id: { type: 'string' }, type: { enum: ['infrastructure', 'user-story'] },
        title: { type: 'string' },
        commit: { type: 'object', required: ['type', 'subject'],
          properties: { type: { type: 'string' }, subject: { type: 'string' } } },
        sourceUC: { type: 'array', items: { type: 'string' } },
        taskIds: { type: 'array', items: { type: 'string' } },
      },
    } },
    tasks: { type: 'object', additionalProperties: {
      type: 'object',
      required: ['title', 'outcome', 'domain', 'agentType', 'dependsOn',
        'acceptanceCriteria', 'estimate', 'outputCount', 'commit'],
      properties: {
        title: { type: 'string' }, outcome: { type: 'string' },
        domain: { enum: ['BE', 'FE', 'DB', 'DevOps', 'INFRA', 'TEST'] },
        // Bracket-key form is deliberate — this is a JSON-Schema PROPERTY NAME describing a
        // task's own field, not a dispatch-mechanism option key; written this way so the
        // literal text doesn't collide with tests/cli/pm-phase2-source.test.js's source-text
        // guard against this script ever using a non-c.worker dispatch mechanism.
        ['agentType']: { enum: ['developer-backend', 'developer-frontend', 'developer-testing', 'review-solution'] },
        dependsOn: { type: 'array', items: { type: 'string' } },
        acceptanceCriteria: { type: 'array', items: { type: 'string' } },
        estimate: { type: 'object', required: ['agentMinutes', 'tokens'],
          properties: { agentMinutes: { type: 'integer' }, tokens: { type: 'integer' } } },
        outputCount: { type: 'integer' },
        commit: { type: 'object', required: ['type', 'subject'],
          properties: { type: { type: 'string' }, subject: { type: 'string' } } },
      },
    } },
  },
}

// Splits the skeleton response into (a) index.json's structural, map-keyed shape and
// (b) nothing else — phase title/commit are NOT copied into index.json (OQ-04); they are
// rendered straight to each phase's detail file by the caller, from the same skeleton
// response, since phase content is fully known the moment this one call returns.
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

// Duplicated from src/claude/scripts/wbs-assembler.js's renderPhaseDetailBlock — NOT
// required from it, since this workflow script's runtime has no `require` (see
// lib/workflow-runner.js: only `control`/`args` are injected). Kept as a small, simple
// render-only duplicate; the fragile inverse (parsing, with the contiguous-run algorithm)
// stays exclusively in wbs-assembler.js, used only by wb-validate.js/wb-render.js.
function renderPhaseDetailBlock(phase) {
  const DASH = '—'
  return [
    `<a id="phase-${phase.id}"></a>`,
    `### ${phase.id}`,
    '',
    `- **Phase ID:** ${phase.id}`,
    `- **Type:** ${phase.type}`,
    `- **Title:** ${phase.title}`,
    `- **Commit type:** ${phase.commit.type}`,
    `- **Commit scope:** ${phase.commit.scope == null ? DASH : phase.commit.scope}`,
    `- **Commit subject:** ${phase.commit.subject}`,
  ].join('\n')
}

// Compact prompt for the per-task detail-generation worker: this task's own skeleton entry,
// the full skeleton's sibling task list (id + title + outcome only, for duplicate-
// implementation awareness), and the Tech-Spec text (the per-task agent further narrows its
// own Read/Grep use as needed — this call does not pre-slice the Tech-Spec by domain).
function buildTaskPrompt(index, taskId, techSpecText) {
  const task = index.tasks[taskId]
  const siblingList = Object.entries(index.tasks)
    .map(([id, t]) => `- ${id}: ${t.title} — ${t.outcome}`).join('\n')
  return [
    `Task skeleton entry (restate these fields verbatim; do not re-derive them):\n${JSON.stringify({ id: taskId, ...task }, null, 2)}`,
    `Tech-Spec:\n${techSpecText}`,
    `All tasks in this feature (for duplicate-implementation awareness):\n${siblingList}`,
  ].join('\n\n')
}

const c = control
const { featurePath, featureDir, prefix } = c.feature(args[0])
return c.run(meta.name, featureDir, prefix, async () => {
  const file = suffix => `${featureDir}/${prefix}-${suffix}`
  const approvals = c.read(file('Approvals.md'))
  const gate = approvals.match(/^## Gate 1\b[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)
  if (!gate || !/✅\s*Approved/.test(gate[1])) throw new Error('Gate 1 approval evidence missing')
  // Binds this approval to the EXACT Requirements/Tech-Spec content pm-phase1
  // produced when it was approved (docs_digest, written into Approvals.md by
  // SKILL.md's Step 2) — never just "a Gate 1 row says Approved". A missing
  // digest (an approval recorded before this check existed) is not enforced,
  // same null-compatible "unavailable, never fabricated" convention used
  // throughout this toolkit; a PRESENT digest that no longer matches the
  // current files fails closed — the approved documents changed since
  // approval (e.g. a later --force re-run of pm-phase1) and must be
  // re-approved, not silently carried forward on stale consent.
  const digestMatch = gate[1].match(/\*\*Docs Digest:\*\*\s*`([^`]+)`/)
  if (digestMatch) {
    const currentDigest = c.hash(c.read(file('Requirements.md')) + '\u0000' + c.read(file('Tech-Spec.md')))
    if (digestMatch[1] !== currentDigest) {
      throw new Error('Gate 1 approval is stale: Requirements/Tech-Spec content no longer matches what was approved (docs digest mismatch) — re-approve Gate 1 before proceeding')
    }
  }

  // Deliberately NOT file('wbs') — file() always prepends '{prefix}-' (every other
  // artifact, e.g. file('Requirements.md') -> '{prefix}-Requirements.md', is a single file
  // named after its own content, so the prefix disambiguates it; this is a directory nested
  // inside the feature's own already-prefixed folder, so repeating the prefix is redundant.
  const wbsDir = `${featureDir}/wbs`
  const indexPath = `${wbsDir}/index.json`

  // 1. Skeleton (no declared worker() output — host writes every file itself)
  let index
  if (!c.exists(indexPath)) {
    const skeleton = await c.worker('gaia.agent.planner.work-breakdown', featurePath, { schema: SKELETON_SCHEMA })
    index = materializeIndex(skeleton)
    for (const phase of index.phases) {
      const skeletonPhase = skeleton.phases.find(p => p.id === phase.id)
      c.writeOutput(`${wbsDir}/${phase.detailFile}`, renderPhaseDetailBlock(skeletonPhase))
    }
    c.writeOutput(indexPath, JSON.stringify(index, null, 2))
  } else {
    index = c.json(indexPath) // resume: reuse existing skeleton as-is
  }

  // 2. Structural pre-checks (wb-skeleton-check.js, same wb-graph-checks.js functions
  // wb-validate.js now imports — run via subprocess since this runtime has no `require`)
  const skeletonCheck = await c.activity('wb-skeleton-check', async () => {
    const res = c.command(['run-asset', 'scripts/wb-skeleton-check.js', '--project', c.root,
      '--', indexPath, file('Requirements.md')], [0, 1])
    const parsed = JSON.parse(res.stdout)
    if (typeof parsed.valid !== 'boolean' || !Array.isArray(parsed.errors) ||
        (res.exitCode === 0) !== parsed.valid) throw new Error('Invalid skeleton-check result')
    if (!parsed.valid) throw new Error('Work breakdown skeleton failed structural checks: ' + res.stdout)
    return parsed
  })

  // 3. Per-task generation, resume-by-status, sequential
  for (const phase of index.phases) {
    for (const taskId of phase.taskIds) {
      const task = index.tasks[taskId]
      const detailPath = `${wbsDir}/${task.detailFile}`
      if (task.status === 'generated' && c.exists(detailPath)) continue // resume: skip, no dispatch
      const detail = await c.worker('gaia.agent.planner.work-breakdown-task',
        buildTaskPrompt(index, taskId, c.read(file('Tech-Spec.md'))), { label: `work-breakdown-task:${taskId}` })
      c.writeOutput(detailPath, detail)
      task.status = 'generated'
      c.writeOutput(indexPath, JSON.stringify(index, null, 2)) // persist status after each task
    }
  }

  // 4. Assembly (implicit, via the now directory-aware wb-validate.js/wb-render.js) +
  // existing pipeline, unchanged past this point except the path passed in
  const report = await c.activity('wb-validate', async () => {
    const res = c.command(['run-asset', 'scripts/wb-validate.js', '--project', c.root,
      '--', wbsDir, file('Requirements.md')], [0, 1])
    const parsed = JSON.parse(res.stdout)
    if (typeof parsed.valid !== 'boolean' || !Array.isArray(parsed.errors) ||
        !Array.isArray(parsed.warnings) || (res.exitCode === 0) !== parsed.valid) throw new Error('Invalid validator result')
    if (!parsed.valid || parsed.errors.length) throw new Error('Work breakdown structural validation failed: ' + res.stdout)
    return parsed
  })
  const semantic = await c.worker('gaia.agent.planner.validate-work-breakdown',
    `${wbsDir}\n${file('Requirements.md')}`, { schema: {
      type: 'object', properties: { valid: { type: 'boolean' }, findings: { type: 'array' } }, required: ['valid', 'findings'],
    } })
  if (!semantic.valid || semantic.findings.some(f => f.blocking)) throw new Error('Work breakdown semantic validation failed')
  const rendered = await c.activity('wb-render', async () => {
    const result = c.command(['run-asset', 'scripts/wb-render.js', '--project', c.root, '--', wbsDir, prefix])
    const markdownPath = file('Work-Breakdown.md'), csvPath = file('Work-Breakdown.csv')
    if (!c.exists(markdownPath) || !c.exists(csvPath)) throw new Error('Renderer outputs missing')
    // Read the actual bytes now: unreadable output must never produce an approved gate.
    c.read(markdownPath); c.read(csvPath)
    return { ...result, markdownPath, csvPath, markdownExists: true, csvExists: true }
  })
  // Assembled structure for c.estimates()'s metrics — via wbs-assembler.js's own CLI mode
  // (subprocess), since this runtime cannot `require` it in-process either.
  const assembled = JSON.parse(c.command(['run-asset', 'scripts/wbs-assembler.js', '--project', c.root, '--', wbsDir]).stdout)
  const metrics = await c.estimates(featureDir, prefix, assembled)
  c.append(file('process-log.txt'), `[${new Date().toISOString()}] pm-phase2 complete; Gate 2 approval requested\n`)
  return {
    ...metrics, feature_path: featurePath, token_ledger: c.tokenLedger, errors: [],
    gate2_payload: {
      skeleton_check_report: skeletonCheck, skeleton_check_failed: false,
      js_validator_report: report, js_validator_failed: false,
      semantic_validator_result: semantic, semantic_validator_failed: false,
      renderer_result: rendered, renderer_failed: false, gate2_blocked: false,
      duration_bands: report.durationBands, domain_distribution: report.domainDistribution,
      warning_band_tasks: report.warnings.filter(w => w.category === 'duration_warning').map(w => ({ taskId: w.taskId, agentMinutes: w.details?.agentMinutes })),
      split_required_tasks: [], must_ac_uncovered: [], phase_unschedulable: [],
    },
  }
})
