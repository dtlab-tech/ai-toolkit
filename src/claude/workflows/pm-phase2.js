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
      required: ['id', 'type', 'title', 'commit', 'sourceUC', 'context', 'taskIds'],
      properties: {
        id: { type: 'string' }, type: { enum: ['infrastructure', 'user-story'] },
        title: { type: 'string' },
        commit: { type: 'object', required: ['type', 'subject'],
          properties: { type: { type: 'string' }, subject: { type: 'string' } } },
        sourceUC: { type: 'array', items: { type: 'string' } },
        // 2-4 sentences: why this phase exists, how its tasks relate, any sequencing note other
        // phases/tasks need before opening this phase's own task files — the one part of the
        // FTR-020 phase-detail template that genuinely needs narrative judgment, not something
        // the host can derive mechanically the way it does Source UC/Tasks-in-phase/Depends-on.
        context: { type: 'string' },
        taskIds: { type: 'array', items: { type: 'string' } },
      },
    } },
    tasks: { type: 'object', additionalProperties: {
      type: 'object',
      required: ['title', 'outcome', 'domain', 'agentType', 'dependsOn',
        'acceptanceCriteria', 'outputCount', 'commit'],
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
        // FTR-032: estimate (agentMinutes/tokens) deliberately removed from this schema — the
        // per-task detail call already produces a real one in every response (its own template
        // asks for it); wbs-assembler.js's parseTaskDetailBlock/loadWorkBreakdown now reads that
        // value back instead, so asking for it again here would be pure duplicated cost on top
        // of a call that already has to reason about every task in the feature in one turn.
        outputCount: { type: 'integer' },
        commit: { type: 'object', required: ['type', 'subject'],
          properties: { type: { type: 'string' }, subject: { type: 'string' } } },
      },
    } },
  },
}

// Splits the skeleton response into (a) index.json's structural, map-keyed shape and
// (b) nothing else — phase title/commit/context are NOT copied into index.json (OQ-04); they
// are rendered straight to each phase's detail file by the caller, from the same skeleton
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

// Duplicated from src/claude/scripts/wbs-assembler.js's renderPhaseDetailBlock/template-engine
// primitives — NOT required from it, since this workflow script's runtime has no `require` (see
// lib/workflow-runner.js: only `control`/`args` are injected); reads the template via `c.read()`
// (project-root-relative) instead of `fs.readFileSync(__dirname, ...)`, the one difference the
// sandboxed runtime forces. The fragile inverse (parsing, with the contiguous-run algorithm)
// stays exclusively in wbs-assembler.js, used only by wb-validate.js/wb-render.js. Keep both
// copies' FIELD/SECTION handling in sync if gaia-user-story-template.md's shape ever changes.
const FIELD_LINE_RE = /^- \*\*(.+?):\*\*[ \t]?(.*)$/
function _stripTemplateComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '')
}
function _fillFieldBlock(templateText, values) {
  const lines = templateText.split('\n')
  let start = 0
  while (start < lines.length && !FIELD_LINE_RE.test(lines[start])) start++
  const starts = []
  let end = start
  for (let j = start; j < lines.length; j++) {
    const m = lines[j].match(FIELD_LINE_RE)
    if (m) starts.push({ label: m[1] })
    else if (lines[j].trim() === '') { end = j; break }
    end = j + 1
  }
  const seen = new Set()
  const newFieldLines = starts.map(({ label }) => {
    if (!(label in values)) throw new Error(`Template field "${label}" has no supplied value`)
    seen.add(label)
    return `- **${label}:** ${values[label]}`
  })
  for (const label of Object.keys(values)) {
    if (!seen.has(label)) throw new Error(`Supplied value for "${label}" matches no template field`)
  }
  return [...lines.slice(0, start), ...newFieldLines, ...lines.slice(end)].join('\n')
}
function _fillNamedSection(templateText, sectionName, content) {
  const marker = `**${sectionName}:**`
  const idx = templateText.indexOf(marker)
  if (idx === -1) throw new Error(`Template is missing the "${sectionName}" section`)
  const afterMarker = idx + marker.length
  const nextMarkerIdx = templateText.indexOf('\n**', afterMarker)
  const end = nextMarkerIdx === -1 ? templateText.length : nextMarkerIdx
  return templateText.slice(0, afterMarker) + '\n\n' + content + '\n' + templateText.slice(end)
}
function _fillInlineBoldField(templateText, label, value) {
  const lines = templateText.split('\n')
  const marker = `**${label}:**`
  const startIdx = lines.findIndex(l => l.includes(marker))
  if (startIdx === -1) throw new Error(`Template is missing the "${label}" inline field`)
  let end = startIdx + 1
  while (end < lines.length && lines[end].trim() !== '') end++
  return [...lines.slice(0, startIdx), `${marker} ${value}`, ...lines.slice(end)].join('\n')
}
function renderPhaseDetailBlock(phase, taskTitles, dependsOnPhases) {
  const DASH = '—'
  const sourceUC = Array.isArray(phase.sourceUC) && phase.sourceUC.length ? phase.sourceUC.join(', ') : DASH
  const tasksBlock = taskTitles.length
    ? taskTitles.map(t => `- \`${t.id}\` — ${t.title}`).join('\n')
    : '_No tasks._'
  const dependsOn = dependsOnPhases.length ? dependsOnPhases.join(', ') : 'none'
  // The template lives under the toolkit's own installed scripts/templates/ — outside the project
  // for a globally-installed toolkit, which a plain c.read() has no way to resolve (it only reads
  // project-relative paths). Read via print-asset instead, same as gaia-task-template.md below —
  // this was previously a bare c.read() of a local-install-relative path, which only worked when
  // the toolkit happened to be installed locally into this project's own .claude/ folder (a real
  // incident: a project with only a global install failed with ENOENT on this exact line).
  let text = _stripTemplateComments(c.command(['print-asset', 'scripts/templates/gaia-user-story-template.md', '--project', c.root]).stdout)
  text = text.replace(/\{PHASE_ID\}/g, phase.id)
  text = _fillFieldBlock(text, {
    'Phase ID': phase.id,
    'Type': phase.type,
    'Source UC': sourceUC,
    'Title': phase.title,
    'Commit type': phase.commit.type,
    'Commit scope': phase.commit.scope == null ? DASH : phase.commit.scope,
    'Commit subject': phase.commit.subject,
  })
  text = _fillNamedSection(text, 'Context', phase.context == null ? DASH : phase.context)
  text = _fillNamedSection(text, 'Tasks in this phase', tasksBlock)
  text = _fillInlineBoldField(text, 'Depends on phases', dependsOn)
  return text.trim() + '\n'
}

// Depends-on-phases is 100% mechanically derivable from the skeleton's own task dependsOn
// graph (same information checkPhaseDependencyAndCycle computes in wb-graph-checks.js, just
// recomputed here since that function needs the post-assembly {phases:[{tasks:[...]}]} shape,
// not the skeleton's map-of-tasks-by-id) — no LLM judgment needed, unlike Context.
function computeDependsOnPhases(skeleton, phaseId, taskIdToPhase) {
  const phase = skeleton.phases.find(p => p.id === phaseId)
  const deps = new Set()
  for (const taskId of phase.taskIds) {
    const task = skeleton.tasks[taskId]
    for (const depId of (task.dependsOn || [])) {
      const depPhase = taskIdToPhase.get(depId)
      if (depPhase && depPhase !== phaseId) deps.add(depPhase)
    }
  }
  return [...deps]
}

// FTR-026: local re-implementation of tech-spec-assembler.js's findSectionRange/parseTableRows
// (from req-assembler.js)/findSubsectionRange/parseComponentsTable — duplicated, not imported,
// same "sandboxed runtime has no `require`" reason as the template-engine primitives above.
// Keep in sync with tech-spec-assembler.js if spec/index.md's Section 9 table shape ever changes.
function _findSectionRange(content, sectionNumber) {
  const lines = content.split('\n')
  let start = -1, end = lines.length
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^## (\d+)\.\s/)
    if (!m) continue
    const n = Number(m[1])
    if (n === sectionNumber) start = i
    else if (start !== -1 && n > sectionNumber) { end = i; break }
  }
  if (start === -1) throw new Error(`missing section ${sectionNumber}`)
  return { start, end, lines }
}
function _parseTableRows(lines, start, end) {
  const tableLines = lines.slice(start, end).filter(l => l.trim().startsWith('|'))
  if (tableLines.length < 2) return []
  return tableLines.slice(2).map(line =>
    line.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1))
}
function _findSubsectionRange(lines, start, end, heading) {
  let subStart = -1
  for (let i = start; i < end; i++) {
    if (lines[i].trim() === `### ${heading}`) { subStart = i; break }
  }
  if (subStart === -1) return null
  let subEnd = end
  for (let i = subStart + 1; i < end; i++) {
    if (/^#{2,3}\s/.test(lines[i])) { subEnd = i; break }
  }
  return { start: subStart, end: subEnd }
}
function parseComponentsTableLocal(specIndexContent) {
  const { start, end, lines } = _findSectionRange(specIndexContent, 9)
  const entries = []
  for (const [heading, changeType] of [['New files', 'New'], ['Modified files', 'Modified']]) {
    const sub = _findSubsectionRange(lines, start, end, heading)
    if (!sub) continue
    for (const cells of _parseTableRows(lines, sub.start, sub.end)) {
      const [filePath, purposeOrChange, addresses, domain, specLink] = cells
      const m = specLink && specLink.match(/\(components\/([^)]+)\)/)
      if (!m) throw new Error(`malformed Spec column for "${filePath}" in spec/index.md`)
      entries.push({ filePath, purposeOrChange, changeType, domain, addresses, fileSlug: m[1] })
    }
  }
  return entries
}

// Matches a task's own acceptanceCriteria against each component's Addresses column (the same
// relation spec/index.md's own Section 9 table already expresses) to give the per-task worker
// only the Tech-Spec content relevant to its own task, instead of the entire assembled spec —
// the single largest structural token cost this feature removes. Falls back to the full
// Components table (never zero content) when nothing matches, e.g. a purely organizational task.
function buildTaskTechSpecExcerpt(components, task, specDir, specIndexContent) {
  const acSet = new Set(task.acceptanceCriteria || [])
  const relevant = components.filter(comp =>
    (comp.addresses || '').split(',').map(s => s.trim()).some(acId => acSet.has(acId)))
  if (relevant.length === 0) {
    return "_No component's Addresses column cites this task's Acceptance Criteria — full " +
      'Components table below._\n\n' + specIndexContent
  }
  return relevant.map(comp => {
    const body = c.read(`${specDir}/components/${comp.fileSlug}`)
    return `### ${comp.filePath}\n\n${body}`
  }).join('\n\n')
}

// FTR-027: duplicates wbs-assembler.js's own _parseVerificationCommands algorithm (last
// occurrence of the marker wins — an illustrative example earlier in Implementation notes must
// never be mistaken for the real section) — returns a boolean instead of the parsed array, since
// resume-by-status only needs the yes/no "does this task file have at least one verification
// command" signal, per the task template's own documented "Must be non-empty" contract. A task
// file that exists and is marked `generated` but has none is regenerated, not skipped forever.
const FENCE_RE_LOCAL = /```[^\n]*\n([\s\S]*?)```/g
function hasVerificationCommands(content) {
  const marker = '**Verification commands:**'
  const idx = content.lastIndexOf(marker)
  if (idx === -1) return false
  const verifPart = content.slice(idx + marker.length)
  FENCE_RE_LOCAL.lastIndex = 0
  return FENCE_RE_LOCAL.test(verifPart)
}

// Compact prompt for the per-task detail-generation worker: this task's own skeleton entry,
// the full skeleton's sibling task list (id + title + outcome only, for duplicate-
// implementation awareness), and the Tech-Spec excerpt (FTR-026: already pre-sliced to this
// task's own relevant component(s) by buildTaskTechSpecExcerpt, or the full legacy Tech-Spec
// text for a feature with no spec/ directory).
function buildTaskPrompt(index, taskId, techSpecText, taskTemplate) {
  const task = index.tasks[taskId]
  const siblingList = Object.entries(index.tasks)
    .map(([id, t]) => `- ${id}: ${t.title} — ${t.outcome}`).join('\n')
  return [
    `Task skeleton entry (restate these fields verbatim; do not re-derive them):\n${JSON.stringify({ id: taskId, ...task }, null, 2)}`,
    `Tech-Spec:\n${techSpecText}`,
    `All tasks in this feature (for duplicate-implementation awareness):\n${siblingList}`,
    `Template (tasks/{TASK_ID}.md):\n${taskTemplate}`,
  ].join('\n\n')
}

const c = control
const { featurePath, featureDir, prefix } = c.feature(args[0])
return c.run(meta.name, featureDir, prefix, async () => {
  const file = suffix => `${featureDir}/${prefix}-${suffix}`

  // FTR-026: pm-phase2.js is now split-source-native itself — every call site below reads
  // req/index.md/spec/index.md directly, in-memory assembly feeds only the Gate 1 digest
  // re-check, and nothing here writes an assembled monolithic file to disk (the
  // bridge-requirements-tech-spec activity FTR-025 added as a transitional shim is gone; see
  // git history for FTR-025's original version of this block). A legacy feature (monolithic
  // files only, no req/spec/ directories) falls back to reading those files directly at every
  // site below, unchanged from pre-FTR-026 behavior.
  const reqDir = `${featureDir}/req`, specDir = `${featureDir}/spec`
  // c.exists() only checks isFile() — never true for a directory — so this checks each split's
  // own index.md (a real file) rather than the directory itself.
  const hasReq = c.exists(`${reqDir}/index.md`), hasSpec = c.exists(`${specDir}/index.md`)
  const reqIndexPath = hasReq ? `${reqDir}/index.md` : file('Requirements.md')
  const specIndexPath = hasSpec ? `${specDir}/index.md` : file('Tech-Spec.md')

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
    // FTR-026: recomputed in-memory from the split sources (same req-assembler.js/
    // tech-spec-assembler.js subprocess calls pm-phase1.js already makes for its own
    // docsDigest) instead of reading an assembled file from disk — never written here.
    const assembledRequirements = hasReq
      ? c.command(['run-asset', 'scripts/req-assembler.js', '--project', c.root, '--', reqDir]).stdout
      : c.read(file('Requirements.md'))
    const assembledTechSpec = hasSpec
      ? c.command(['run-asset', 'scripts/tech-spec-assembler.js', '--project', c.root, '--', specDir]).stdout
      : c.read(file('Tech-Spec.md'))
    const currentDigest = c.hash(assembledRequirements + '\u0000' + assembledTechSpec)
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
    const taskIdToPhase = new Map(skeleton.phases.flatMap(p => p.taskIds.map(taskId => [taskId, p.id])))
    for (const phase of index.phases) {
      const skeletonPhase = skeleton.phases.find(p => p.id === phase.id)
      const taskTitles = skeletonPhase.taskIds.map(taskId => ({ id: taskId, title: skeleton.tasks[taskId].title }))
      const dependsOnPhases = computeDependsOnPhases(skeleton, phase.id, taskIdToPhase)
      c.writeOutput(`${wbsDir}/${phase.detailFile}`, renderPhaseDetailBlock(skeletonPhase, taskTitles, dependsOnPhases))
    }
    c.writeOutput(indexPath, JSON.stringify(index, null, 2))
  } else {
    index = c.json(indexPath) // resume: reuse existing skeleton as-is
  }

  // 2. Structural pre-checks (wb-skeleton-check.js, same wb-graph-checks.js functions
  // wb-validate.js now imports — run via subprocess since this runtime has no `require`)
  const skeletonCheck = await c.activity('wb-skeleton-check', async () => {
    const res = c.command(['run-asset', 'scripts/wb-skeleton-check.js', '--project', c.root,
      '--', indexPath, reqIndexPath], [0, 1])
    const parsed = JSON.parse(res.stdout)
    if (typeof parsed.valid !== 'boolean' || !Array.isArray(parsed.errors) ||
        (res.exitCode === 0) !== parsed.valid) throw new Error('Invalid skeleton-check result')
    if (!parsed.valid) throw new Error('Work breakdown skeleton failed structural checks: ' + res.stdout)
    return parsed
  })

  // 3. Per-task generation, resume-by-status, sequential
  // FTR-026: each task's own worker call now receives only the Tech-Spec content relevant to its
  // own Acceptance Criteria, not the entire assembled spec — computed once, before the loop, by
  // matching each task's acceptanceCriteria against spec/index.md's own Addresses column.
  const components = hasSpec ? parseComponentsTableLocal(c.read(specIndexPath)) : []
  // The template lives under the toolkit's own installed scripts/templates/ — outside the
  // project for a globally-installed toolkit, which a non-interactive worker invocation has no
  // way to get Read permission for. Read once via print-asset, inline into every task's prompt,
  // instead of telling the agent to Read it itself (same reasoning as pm-phase1.js's
  // readTemplate/withTemplate — this runtime duplicates the primitive, not requires it, for the
  // same "no `require`" reason as every other duplicated helper in this file).
  const taskTemplate = c.command(['print-asset', 'scripts/templates/gaia-task-template.md', '--project', c.root]).stdout
  for (const phase of index.phases) {
    for (const taskId of phase.taskIds) {
      const task = index.tasks[taskId]
      const detailPath = `${wbsDir}/${task.detailFile}`
      if (task.status === 'generated' && c.exists(detailPath) && hasVerificationCommands(c.read(detailPath))) continue // resume: skip, no dispatch
      const techSpecExcerpt = hasSpec
        ? buildTaskTechSpecExcerpt(components, task, specDir, c.read(specIndexPath))
        : c.read(file('Tech-Spec.md')) // legacy fallback: unchanged, full text
      const detail = await c.worker('gaia.agent.planner.work-breakdown-task',
        buildTaskPrompt(index, taskId, techSpecExcerpt, taskTemplate), { label: `work-breakdown-task:${taskId}` })
      c.writeOutput(detailPath, detail)
      task.status = 'generated'
      c.writeOutput(indexPath, JSON.stringify(index, null, 2)) // persist status after each task
    }
  }

  // 4. Assembly (implicit, via the now directory-aware wb-validate.js/wb-render.js) +
  // existing pipeline, unchanged past this point except the path passed in
  const report = await c.activity('wb-validate', async () => {
    const res = c.command(['run-asset', 'scripts/wb-validate.js', '--project', c.root,
      '--', wbsDir, reqIndexPath], [0, 1])
    const parsed = JSON.parse(res.stdout)
    if (typeof parsed.valid !== 'boolean' || !Array.isArray(parsed.errors) ||
        !Array.isArray(parsed.warnings) || (res.exitCode === 0) !== parsed.valid) throw new Error('Invalid validator result')
    if (!parsed.valid || parsed.errors.length) throw new Error('Work breakdown structural validation failed: ' + res.stdout)
    return parsed
  })
  const semantic = await c.worker('gaia.agent.planner.validate-work-breakdown',
    `${wbsDir}\n${reqIndexPath}`, { schema: {
      type: 'object', properties: { valid: { type: 'boolean' }, findings: { type: 'array' } }, required: ['valid', 'findings'],
    } })
  if (!semantic.valid || semantic.findings.some(f => f.blocking)) throw new Error('Work breakdown semantic validation failed')
  // FTR-025: wb-render.js is no longer called automatically here — nothing downstream ever read
  // {PREFIX}-Work-Breakdown.md/.csv (every real consumer already reads wbs/ directly via
  // wbs-assembler.js's loadWorkBreakdown()), so this view is now produced only on demand, via
  // assemble-docs.js.
  // FTR-022: a new deterministic rendering step — no new data, no new validation, purely a
  // view over AC<->task coverage wb-validate.js's checks 19-21 already enforce. Cannot fail
  // for a feature that already reached this point in the pipeline (BR-02/NFR-03).
  const acTaskMatrix = await c.activity('ac-task-matrix', async () => {
    // FTR-023: ac-task-matrix.js's CLI gained a 3rd positional argument (Tech-Spec path) to
    // render the "Addressed by Tech-Spec File(s)" column.
    // FTR-026: gained a required 5th (featureDir) argument; output moved from one loose
    // {PREFIX}-AC-Task-Matrix.md file into a coverage-matrix/ subfolder as a JSON+MD pair.
    const result = c.command(['run-asset', 'scripts/ac-task-matrix.js', '--project', c.root,
      '--', wbsDir, reqIndexPath, specIndexPath, prefix, featureDir])
    const matrixJsonPath = `${featureDir}/coverage-matrix/index.json`
    const matrixMdPath = `${featureDir}/coverage-matrix/index.md`
    if (!c.exists(matrixJsonPath)) throw new Error('AC-Task matrix JSON output missing')
    if (!c.exists(matrixMdPath)) throw new Error('AC-Task matrix MD output missing')
    c.read(matrixJsonPath) // never trust an unread write
    c.read(matrixMdPath)
    return { ...result, matrixJsonPath, matrixMdPath }
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
      gate2_blocked: false,
      ac_task_matrix_json_path: acTaskMatrix.matrixJsonPath,
      ac_task_matrix_md_path: acTaskMatrix.matrixMdPath,
      duration_bands: report.durationBands, domain_distribution: report.domainDistribution,
      warning_band_tasks: report.warnings.filter(w => w.category === 'duration_warning').map(w => ({ taskId: w.taskId, agentMinutes: w.details?.agentMinutes })),
      split_required_tasks: [], must_ac_uncovered: [], phase_unschedulable: [],
    },
  }
})
