'use strict'

const fs = require('fs')
const path = require('path')

// Directory/legacy loader + task/phase detail block codec for the split Work Breakdown
// format (FTR-020). Exports loadWorkBreakdown(inputPath), which detects single-file
// (legacy schema v2) vs. directory (wbs/, schema v3) input and returns the same
// { schemaVersion, feature, phases: [{ id, type, title, commit, tasks: [...] }] } shape
// wb-validate.js/wb-render.js already consume — their own logic is otherwise unchanged.
// Also exports parseTaskDetailBlock/renderTaskDetailBlock and, for the phase tier (OQ-04),
// parsePhaseDetailBlock/renderPhaseDetailBlock — all four independently reimplemented from
// the field-line/fence conventions already proven in lib/task-executor/plan.js, NOT
// imported from that module (feature.md Out of Scope — plan.js is not touched).

const DASH = '—'

// Field values are read from the CONTIGUOUS RUN of `- **Label:** value` lines starting
// immediately after the heading, stopping at the first non-matching line — NOT a global
// regex scan over the whole file. A task's Implementation notes section may legitimately
// illustrate this exact block format inside a fenced code example; a global scan would
// mistake that illustrative text for real field values. Found empirically while authoring
// this feature's own `wbs/` fixture (see `US-03-TASK-INFRA-01.md`).
const FIELD_LINE_RE = /^- \*\*(.+?):\*\*[ \t]?(.*)$/
const FENCE_RE = /^(`{3,})\r?\n([\s\S]*?)\r?\n\1[ \t]*$/gm

function _listOrEmpty(value) {
  if (value === DASH) return []
  return value.split(',').map(s => s.trim()).filter(Boolean)
}

function _stringOrNull(value) {
  return value === DASH ? null : value
}

// Mirrors lib/task-executor/plan.js's own identically-named function — a non-numeric value is a
// parse error, not silently coerced (the task's own "Estimate — agent minutes"/"Estimate —
// tokens" fields are never `—`, per gaia-task-template.md's own placeholder contract, so `null`
// here only ever means the label itself was missing from the field block).
function _numberOrNull(value) {
  if (value == null) return null
  const n = Number(value)
  if (Number.isNaN(n)) {
    throw new Error(`wbs-assembler: expected a numeric value, got ${JSON.stringify(value)}`)
  }
  return n
}

// ── Template engine ───────────────────────────────────────────────────────────
// Loads a canonical templates/gaia-{name}-template.md file and fills in its placeholders. The
// template file is the single source of truth for field labels, their order, and section
// headings — these renderers only ever supply VALUES, never hardcode the shape themselves (the
// whole point of FTR-025's fix: a field added/reworded/reordered in the template is picked up
// automatically, instead of the template and the renderer silently drifting apart the way the
// FTR-020 phase-detail template did for years before anything used it). Fails closed (throws) if
// the template references a label/section the caller didn't supply a value for, or vice versa —
// a silently-blank or stale placeholder slipping into real output is exactly the bug class this
// fix exists to prevent.

function _loadTemplate(name) {
  return fs.readFileSync(path.join(__dirname, 'templates', `gaia-${name}-template.md`), 'utf8')
}

function _stripTemplateComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '')
}

// Fills the contiguous run of `- **Label:** <placeholder>` fields starting immediately after the
// heading — same contiguous-run rule _parseFieldBlock uses when reading an instance, applied here
// to a template to both discover its shape and substitute real values in one pass. A field's own
// placeholder guidance may itself be hard-wrapped across several physical lines (several of the
// real FTR-020 templates do this for a long explanation) — a continuation line never starts with
// `- **`, so it is skipped rather than mistaken for the end of the field block; only a blank line
// (or EOF) ends the run. The whole multi-line span for a given field is collapsed to the single
// substituted line.
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

// Replaces the inline value after a `**Label:** <placeholder>` line (a bold field OUTSIDE the
// dash-prefixed field block, e.g. "Depends on phases:" — the value lives on the same line as the
// label, not in a separate block below it).
// Same multi-line-wrapped-placeholder handling as _fillFieldBlock: the value after the label may
// itself wrap across several physical lines (gaia-user-story-template.md's own "Depends on
// phases" placeholder does), so this consumes every line from the label's own line up to the next
// blank line (or EOF), not just the first line — a naive single-line regex would leave the
// wrapped continuation behind as orphaned text in the real output.
function _fillInlineBoldField(templateText, label, value) {
  const lines = templateText.split('\n')
  const marker = `**${label}:**`
  const startIdx = lines.findIndex(l => l.includes(marker))
  if (startIdx === -1) throw new Error(`Template is missing the "${label}" inline field`)
  let end = startIdx + 1
  while (end < lines.length && lines[end].trim() !== '') end++
  return [...lines.slice(0, startIdx), `${marker} ${value}`, ...lines.slice(end)].join('\n')
}

// Replaces everything between a `**Section Name:**` marker and the next `**...:**` marker (or end
// of file) with real content — used for block-shaped sections (a paragraph, a bullet list), as
// opposed to _fillInlineBoldField's single-line value.
function _fillNamedSection(templateText, sectionName, content) {
  const marker = `**${sectionName}:**`
  const idx = templateText.indexOf(marker)
  if (idx === -1) throw new Error(`Template is missing the "${sectionName}" section`)
  const afterMarker = idx + marker.length
  const nextMarkerIdx = templateText.indexOf('\n**', afterMarker)
  const end = nextMarkerIdx === -1 ? templateText.length : nextMarkerIdx
  return templateText.slice(0, afterMarker) + '\n\n' + content + '\n' + templateText.slice(end)
}

function _parseFieldBlock(text) {
  const lines = text.split(/\r?\n/)
  const fields = {}
  let i = 0
  while (i < lines.length && !FIELD_LINE_RE.test(lines[i])) i++
  for (; i < lines.length; i++) {
    const m = lines[i].match(FIELD_LINE_RE)
    if (!m) break // first non-field line ends the contiguous run
    fields[m[1].trim()] = m[2].trim()
  }
  return fields
}

function _parseVerificationCommands(text) {
  const marker = '**Verification commands:**'
  const idx = text.lastIndexOf(marker) // LAST occurrence — the real section is always the
  // final one in a well-formed file; an earlier occurrence could be inside an illustrative
  // example in the Implementation notes section (same collision risk as the field lines)
  if (idx === -1) return []
  const verifPart = text.slice(idx + marker.length)
  const commands = []
  let m
  FENCE_RE.lastIndex = 0
  while ((m = FENCE_RE.exec(verifPart))) commands.push(m[2])
  return commands
}

// ── Task detail block codec ──────────────────────────────────────────────────

function parseTaskDetailBlock(text) {
  const fields = _parseFieldBlock(text)
  return {
    // FTR-032: the per-task detail call's own template already asks for a real estimate in every
    // response — the WBS skeleton call no longer does (see loadWorkBreakdown's per-task mapping
    // below), so THIS is now the authoritative source, not a value silently discarded as before.
    estimate: {
      agentMinutes: _numberOrNull(fields['Estimate — agent minutes']),
      tokens: _numberOrNull(fields['Estimate — tokens']),
    },
    groupingRationale: _stringOrNull(fields['Grouping rationale']),
    verificationCommands: _parseVerificationCommands(text),
  }
}

// Loads templates/gaia-task-template.md and fills it in — the template is the single source of
// truth for the 14 field labels/order and the two section headings; this function only supplies
// values. `implementationNotes` is optional: the real per-task agent (gaia-generate-work-
// breakdown-task.md) writes its own full response directly, so this function's only real caller
// is the round-trip tests, which never populate it — a neutral, clearly-a-placeholder default
// keeps the template's own required section non-blank without inventing fake content.
function renderTaskDetailBlock(task, implementationNotes) {
  const cmds = (task.verification && task.verification.commands) || []
  const cmdBlocks = cmds.length
    ? cmds.map(c => '```\n' + c + '\n```').join('\n\n')
    : '_No verification commands._'
  const dependsOn = Array.isArray(task.dependsOn) && task.dependsOn.length ? task.dependsOn.join(', ') : DASH
  const acceptanceCriteria = Array.isArray(task.acceptanceCriteria) && task.acceptanceCriteria.length
    ? task.acceptanceCriteria.join(', ')
    : DASH
  let text = _stripTemplateComments(_loadTemplate('task'))
  text = text.replace(/\{TASK_ID\}/g, task.id)
  text = _fillFieldBlock(text, {
    'Task ID': task.id,
    'Title': task.title,
    'Outcome': task.outcome,
    'Domain': task.domain,
    'Agent type': task.agentType,
    'Dependencies': dependsOn,
    'Acceptance criteria': acceptanceCriteria,
    'Estimate — agent minutes': task.estimate.agentMinutes,
    'Estimate — tokens': task.estimate.tokens,
    'Output count': task.outputCount,
    'Grouping rationale': task.groupingRationale == null ? DASH : task.groupingRationale,
    'Commit type': task.commit.type,
    'Commit scope': task.commit.scope == null ? DASH : task.commit.scope,
    'Commit subject': task.commit.subject,
  })
  text = _fillNamedSection(text, 'Implementation notes', implementationNotes == null ? '_No implementation notes supplied._' : implementationNotes)
  text = _fillNamedSection(text, 'Verification commands', cmdBlocks)
  return text.trim() + '\n'
}

// ── Phase detail block codec (OQ-04, third tier — no fenced section) ─────────

function parsePhaseDetailBlock(text) {
  const fields = _parseFieldBlock(text)
  return {
    title: fields['Title'],
    commit: {
      type: _stringOrNull(fields['Commit type']),
      scope: _stringOrNull(fields['Commit scope']),
      subject: _stringOrNull(fields['Commit subject']),
    },
  }
}

// Loads templates/gaia-user-story-template.md and fills it in — the template is the single
// source of truth for the 7 field labels/order and the three section headings (Context/Tasks in
// this phase/Depends on phases); this function only supplies values, mechanically derived where
// possible (Source UC from phase.sourceUC, Tasks-in-phase from each task's own title, Depends-on-
// phases from the task dependsOn graph — see pm-phase2.js's computeDependsOnPhases) or taken
// as-is from the one field that genuinely needs narrative judgment (Context). taskTitles/
// dependsOnPhases default to [] so the minimal round-trip tests (which only exercise title/
// commit) can keep calling this with just a phase object.
function renderPhaseDetailBlock(phase, taskTitles = [], dependsOnPhases = []) {
  const sourceUC = Array.isArray(phase.sourceUC) && phase.sourceUC.length ? phase.sourceUC.join(', ') : DASH
  const tasksBlock = taskTitles.length
    ? taskTitles.map(t => `- \`${t.id}\` — ${t.title}`).join('\n')
    : '_No tasks._'
  const dependsOn = dependsOnPhases.length ? dependsOnPhases.join(', ') : 'none'
  let text = _stripTemplateComments(_loadTemplate('user-story'))
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

// ── loadWorkBreakdown(inputPath) ──────────────────────────────────────────────

function _assemblyError(message) {
  const err = new Error(message)
  err.code = 'WBS_ASSEMBLY_ERROR'
  return err
}

function _isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory()
  } catch (err) {
    throw _assemblyError(`cannot access "${p}": ${err.message}`)
  }
}

function _readFile(p) {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch (err) {
    throw _assemblyError(`cannot read "${p}": ${err.message}`)
  }
}

function loadWorkBreakdown(inputPath) {
  if (_isDirectory(inputPath)) {
    const indexPath = path.join(inputPath, 'index.json')
    let index
    try {
      index = JSON.parse(_readFile(indexPath))
    } catch (err) {
      if (err.code === 'WBS_ASSEMBLY_ERROR') throw err
      throw _assemblyError(`"${indexPath}" is not valid JSON: ${err.message}`)
    }
    if (index.schemaVersion !== 3) {
      throw _assemblyError(`"${indexPath}" must have schemaVersion 3, got ${JSON.stringify(index.schemaVersion)}`)
    }

    const phases = (index.phases || []).map(phaseSkeleton => {
      const phaseDetailPath = path.join(inputPath, phaseSkeleton.detailFile)
      if (!fs.existsSync(phaseDetailPath)) {
        throw _assemblyError(`phase "${phaseSkeleton.id}" has no detail file at ${phaseDetailPath}`)
      }
      const phaseDetail = parsePhaseDetailBlock(_readFile(phaseDetailPath))

      const tasks = (phaseSkeleton.taskIds || []).map(taskId => {
        const skeletonTask = index.tasks ? index.tasks[taskId] : null
        if (skeletonTask == null) {
          throw _assemblyError(`index.json references unknown task "${taskId}"`)
        }
        const detailPath = path.join(inputPath, skeletonTask.detailFile)
        if (!fs.existsSync(detailPath)) {
          throw _assemblyError(`task "${taskId}" has no detail file at ${detailPath}`)
        }
        const detail = parseTaskDetailBlock(_readFile(detailPath))
        return {
          id: taskId,
          title: skeletonTask.title,
          outcome: skeletonTask.outcome,
          domain: skeletonTask.domain,
          agentType: skeletonTask.agentType,
          dependsOn: skeletonTask.dependsOn,
          acceptanceCriteria: skeletonTask.acceptanceCriteria,
          estimate: detail.estimate,
          outputCount: skeletonTask.outputCount,
          groupingRationale: detail.groupingRationale,
          commit: skeletonTask.commit,
          verification: { commands: detail.verificationCommands },
        }
      })

      return {
        id: phaseSkeleton.id,
        type: phaseSkeleton.type,
        title: phaseDetail.title,
        commit: phaseDetail.commit,
        // sourceUC was dropped here from FTR-020 through FTR-024 — wb-graph-checks.js's
        // check 20 (AC scope validation) needs it to correctly scope an AC to the phase(s)
        // that actually realize its UC, instead of assuming phase ID numbering matches UC
        // numbering 1:1 (which the worked example behind this initiative already found false
        // in general: one phase can span several UCs, one UC can span several phases).
        sourceUC: phaseSkeleton.sourceUC,
        tasks,
      }
    })

    // Normalized to the existing in-memory shape wb-validate.js/wb-render.js already
    // consume; schemaVersion is reported as 2 here because that is the *assembled,
    // in-memory* contract version those scripts' downstream logic was written against —
    // index.json's own on-disk schemaVersion stays 3, a separate, unrelated version number.
    return { schemaVersion: 2, feature: index.feature, phases }
  }

  // Legacy path: unchanged behavior — no schemaVersion gate here. wb-validate.js's own
  // check 2 is what reports a schemaVersion mismatch, as a NON-FATAL report entry (exit 1),
  // not a fatal parse error (exit 2); gating on it here would turn that into a fatal abort
  // and break the existing contract (AC-06: "loaded exactly as today").
  return JSON.parse(_readFile(inputPath))
}

module.exports = {
  loadWorkBreakdown,
  parseTaskDetailBlock,
  renderTaskDetailBlock,
  parsePhaseDetailBlock,
  renderPhaseDetailBlock,
}

// ── CLI entry point ───────────────────────────────────────────────────────────
// pm-phase2.js's workflow-script runtime has no `require` (see lib/workflow-runner.js),
// so it cannot call loadWorkBreakdown() in-process the way wb-validate.js/wb-render.js do.
// This CLI mode lets it get the assembled structure (needed for c.estimates()'s metrics)
// via the same `c.command(['run-asset', 'scripts/wbs-assembler.js', ...])` subprocess
// pattern already used for wb-validate.js/wb-render.js — prints the assembled JSON to
// stdout. Coexists with the module.exports above; this guard only runs when the file is
// executed directly, not when required.
if (require.main === module) {
  const inputPath = process.argv[2]
  if (!inputPath) {
    process.stderr.write('Usage: node wbs-assembler.js <path-to-work-breakdown-or-wbs-dir>\n')
    process.exit(2)
  }
  try {
    const wb = loadWorkBreakdown(path.resolve(inputPath))
    process.stdout.write(JSON.stringify(wb) + '\n')
    process.exit(0)
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`)
    process.exit(2)
  }
}
