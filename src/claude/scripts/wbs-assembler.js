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
    groupingRationale: _stringOrNull(fields['Grouping rationale']),
    verificationCommands: _parseVerificationCommands(text),
  }
}

function renderTaskDetailBlock(task) {
  const cmds = (task.verification && task.verification.commands) || []
  const cmdBlocks = cmds.length
    ? cmds.map(c => '```\n' + c + '\n```').join('\n\n')
    : '_No verification commands._'
  const dependsOn = Array.isArray(task.dependsOn) && task.dependsOn.length ? task.dependsOn.join(', ') : DASH
  const acceptanceCriteria = Array.isArray(task.acceptanceCriteria) && task.acceptanceCriteria.length
    ? task.acceptanceCriteria.join(', ')
    : DASH
  return [
    `<a id="task-${task.id}"></a>`,
    `### ${task.id}`,
    '',
    `- **Task ID:** ${task.id}`,
    `- **Title:** ${task.title}`,
    `- **Outcome:** ${task.outcome}`,
    `- **Domain:** ${task.domain}`,
    `- **Agent type:** ${task.agentType}`,
    `- **Dependencies:** ${dependsOn}`,
    `- **Acceptance criteria:** ${acceptanceCriteria}`,
    `- **Estimate — agent minutes:** ${task.estimate.agentMinutes}`,
    `- **Estimate — tokens:** ${task.estimate.tokens}`,
    `- **Output count:** ${task.outputCount}`,
    `- **Grouping rationale:** ${task.groupingRationale == null ? DASH : task.groupingRationale}`,
    `- **Commit type:** ${task.commit.type}`,
    `- **Commit scope:** ${task.commit.scope == null ? DASH : task.commit.scope}`,
    `- **Commit subject:** ${task.commit.subject}`,
    '',
    '**Verification commands:**',
    '',
    cmdBlocks,
    '',
  ].join('\n')
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

function renderPhaseDetailBlock(phase) {
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
          estimate: skeletonTask.estimate,
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
