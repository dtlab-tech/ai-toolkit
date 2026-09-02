'use strict'

const fs   = require('fs')
const path = require('path')

// ── Argument parsing ──────────────────────────────────────────────────────────

const jsonPath = process.argv[2]
const prefix   = process.argv[3]

if (!jsonPath || !prefix) {
  process.stderr.write('Usage: node wb-render.js <path-to-work-breakdown.json> <feature-prefix> [destination-dir]\n')
  process.exit(1)
}

const destDir = process.argv[4]
  ? process.argv[4]
  : path.dirname(path.resolve(jsonPath))

// ── Read and parse JSON ───────────────────────────────────────────────────────

let raw
try {
  raw = fs.readFileSync(jsonPath, 'utf8')
} catch (err) {
  process.stderr.write(`Error: cannot read file "${jsonPath}": ${err.message}\n`)
  process.exit(1)
}

let wb
try {
  wb = JSON.parse(raw)
} catch (err) {
  process.stderr.write(`Error: "${jsonPath}" is not valid JSON: ${err.message}\n`)
  process.exit(1)
}

// ── Basic structure check ─────────────────────────────────────────────────────

if (wb.schemaVersion !== 2) {
  process.stderr.write(`Error: schemaVersion must be 2, got ${JSON.stringify(wb.schemaVersion)}\n`)
  process.exit(2)
}

if (!Array.isArray(wb.phases)) {
  process.stderr.write('Error: "phases" must be an array\n')
  process.exit(2)
}

// ── Output file paths ─────────────────────────────────────────────────────────

const mdPath  = path.join(destDir, `${prefix}-Work-Breakdown.md`)
const csvPath = path.join(destDir, `${prefix}-Work-Breakdown.csv`)

// ── Phase-level depends_on aggregation ───────────────────────────────────────

function computePhaseDependsOn(wb) {
  // Build taskId → phaseId index
  const taskToPhase = new Map()
  for (const phase of wb.phases) {
    const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
    for (const task of tasks) {
      if (task.id != null) taskToPhase.set(task.id, phase.id)
    }
  }

  // For each phase, compute external phase dependencies
  const result = new Map()
  for (const phase of wb.phases) {
    if (phase.id == null) continue
    const extPhases = new Set()
    const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
    for (const task of tasks) {
      if (!Array.isArray(task.dependsOn)) continue
      for (const depId of task.dependsOn) {
        const ownerPhase = taskToPhase.get(depId)
        if (ownerPhase == null) continue          // unresolved — skip
        if (ownerPhase === phase.id) continue     // intra-phase — remove
        extPhases.add(ownerPhase)
      }
    }
    result.set(phase.id, [...extPhases].sort().join(' '))
  }
  return result
}

// ── Compute phase dependencies ────────────────────────────────────────────────

let phaseDepsMap
try {
  phaseDepsMap = computePhaseDependsOn(wb)
} catch (err) {
  process.stderr.write(`Error: phase dependency aggregation failed: ${err.message}\n`)
  process.exit(3)
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function sanitizeField(str) {
  const s = typeof str === 'string' ? str : String(str ?? '')
  return s
    .replace(/\|/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .trim()
}

// ── Verification-command helpers (LOSSLESS — never sanitized) ─────────────────
//
// Verification commands are executable and MUST survive verbatim: operators like
// `||`, shell pipes `|`, and regex alternations `grep -E 'a|b|c'` are destroyed by
// sanitizeField (which maps `|` → space to protect table/CSV column structure).
// These commands are therefore rendered in a dedicated section as fenced code
// blocks whose content is byte-equivalent to the source JSON. The task table shows
// only a reference (a count + anchor link), never a sanitized copy of a command.

function getVerificationCommands(task) {
  const v = task && (task.verificationCommands ?? task.verification?.commands)
  return Array.isArray(v) ? v : []
}

// Stable, deterministic HTML anchor id for a task's verification block.
function verifyAnchor(id) {
  const s = typeof id === 'string' ? id : String(id ?? '')
  return 'verify-' + s.replace(/[^A-Za-z0-9_-]/g, '-')
}

// Render a single command inside a fenced code block, byte-equivalent to `cmd`.
// The fence length is chosen to exceed the longest backtick run in the content so a
// command that itself contains backticks can never prematurely close the fence.
function fencedCommandBlock(cmd) {
  const s = typeof cmd === 'string' ? cmd : String(cmd ?? '')
  const runs = s.match(/`+/g) || []
  const maxRun = runs.reduce((m, r) => Math.max(m, r.length), 0)
  const fence = '`'.repeat(Math.max(3, maxRun + 1))
  return `${fence}\n${s}\n${fence}`
}

function buildCommitSubject(task) {
  if (!task.commit || typeof task.commit !== 'object') {
    return 'chore: implement task'
  }
  const type    = sanitizeField(task.commit.type    ?? '')
  const scope   = sanitizeField(task.commit.scope   ?? '')
  const subject = sanitizeField(task.commit.subject ?? '')
  const full = `${type}(${scope}): ${subject}`
  return full.length > 72 ? full.slice(0, 72) + '…' : full
}

// ── Render stubs (implemented in T03–T05) ─────────────────────────────────────

function renderMarkdown(wb, prefix, phaseDepsMap) {
  const DOMAINS = ['BE', 'FE', 'DB', 'DevOps', 'INFRA', 'TEST']

  function getAgentMinutes(task) {
    const m = task.agentMinutes ?? task.estimate?.agentMinutes
    return (m !== undefined && m !== null) ? Number(m) : null
  }

  function getDurationBand(mins) {
    if (mins === null) return null
    if (mins <= 15) return 'target'
    if (mins <= 20) return 'above'
    if (mins <= 30) return 'warning'
    return 'split'
  }

  const allTasks = wb.phases.flatMap(p => Array.isArray(p.tasks) ? p.tasks : [])

  // Summary duration totals — across all tasks
  let summaryTarget = 0, summaryAbove = 0, summaryWarning = 0, summarySplit = 0
  for (const task of allTasks) {
    const band = getDurationBand(getAgentMinutes(task))
    if (band === 'target')  summaryTarget++
    else if (band === 'above')   summaryAbove++
    else if (band === 'warning') summaryWarning++
    else if (band === 'split')   summarySplit++
  }

  // Per-domain stats — for Statistics table and domain distribution string
  const domainStats = {}
  for (const d of DOMAINS) domainStats[d] = { count: 0, target: 0, above: 0, warning: 0, split: 0 }
  for (const task of allTasks) {
    const d = task.domain
    if (!d || !DOMAINS.includes(d)) continue
    const band = getDurationBand(getAgentMinutes(task))
    domainStats[d].count++
    if (band) domainStats[d][band]++
  }

  const domainDistStr = DOMAINS.map(d => `${d}: ${domainStats[d].count}`).join(', ')

  const statTotals = DOMAINS.reduce(
    (acc, d) => {
      acc.count   += domainStats[d].count
      acc.target  += domainStats[d].target
      acc.above   += domainStats[d].above
      acc.warning += domainStats[d].warning
      acc.split   += domainStats[d].split
      return acc
    },
    { count: 0, target: 0, above: 0, warning: 0, split: 0 }
  )

  function phaseCommit(phase) {
    if (!phase.commit || typeof phase.commit !== 'object') {
      return `chore(${sanitizeField(prefix)}): implement phase`
    }
    const type    = sanitizeField(phase.commit.type    ?? 'chore')
    const subject = sanitizeField(phase.commit.subject ?? '')
    return `${type}(${sanitizeField(prefix)}): ${subject}`
  }

  function taskRow(task) {
    const id       = sanitizeField(task.id ?? '—')
    const title    = sanitizeField(task.title ?? '')
    const outcome  = sanitizeField(task.outcome ?? '')
    const domain   = sanitizeField(task.domain ?? '—')
    const mins     = getAgentMinutes(task)
    const est      = mins !== null ? String(mins) : '—'
    const depArr   = Array.isArray(task.dependsOn) && task.dependsOn.length > 0 ? task.dependsOn : null
    const deps     = depArr ? depArr.join(', ') : '—'
    // Verification commands are NOT rendered in-table (sanitizeField would destroy
    // their operators). The cell references the lossless "Verification Commands"
    // section instead; see fencedCommandBlock / renderVerificationSection.
    const verifCmds = getVerificationCommands(task)
    const verif     = verifCmds.length > 0
      ? `${verifCmds.length} cmd — [details](#${verifyAnchor(task.id)})`
      : '—'
    return `| ${id} | ${title} | ${outcome} | ${domain} | ${est} | ${deps} | ${verif} |`
  }

  const title     = wb.title ?? wb.feature ?? prefix
  const generated = new Date().toISOString()
  const L         = []

  // ── Title ──
  L.push(`# Work Breakdown — ${title}`)
  L.push('')

  // ── Document Info ──
  L.push('## Document Info')
  L.push('| Field | Value |')
  L.push('|-------|-------|')
  L.push(`| Feature | ${sanitizeField(prefix)} |`)
  L.push('| Schema | v2 |')
  L.push(`| Generated | ${generated} |`)
  L.push('')

  // ── Summary ──
  L.push('## Summary')
  L.push('| Metric | Value |')
  L.push('|--------|-------|')
  L.push(`| Total tasks | ${allTasks.length} |`)
  L.push(`| Total phases | ${wb.phases.length} |`)
  L.push(`| Within target (≤15 min) | ${summaryTarget} |`)
  L.push(`| Above target (16–20 min) | ${summaryAbove} |`)
  L.push(`| Warning (21–30 min) | ${summaryWarning} |`)
  L.push(`| Split required (>30 min) | ${summarySplit} |`)
  L.push(`| Domain distribution | ${domainDistStr} |`)
  L.push('')

  // ── Infrastructure Phase ──
  const infraPhases     = wb.phases.filter(p => p.id === 'INFRA')
  const userStoryPhases = wb.phases.filter(p => p.id !== 'INFRA')

  for (const phase of infraPhases) {
    L.push('## Infrastructure Phase (INFRA)')
    L.push('')
    L.push('### Commit')
    L.push(phaseCommit(phase))
    L.push('')
    L.push('### Tasks')
    L.push('| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |')
    L.push('|---|---|---|---|---|---|---|')
    for (const task of (Array.isArray(phase.tasks) ? phase.tasks : [])) {
      L.push(taskRow(task))
    }
    L.push('')
  }

  // ── User Story Phases ──
  if (userStoryPhases.length > 0) {
    L.push('## User Story Phases')
    L.push('')
    for (const phase of userStoryPhases) {
      L.push(`### ${sanitizeField(phase.id ?? '')}: ${sanitizeField(phase.title ?? '')}`)
      L.push('')
      L.push('### Commit')
      L.push(phaseCommit(phase))
      L.push('')
      L.push('### Tasks')
      L.push('| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |')
      L.push('|---|---|---|---|---|---|---|')
      for (const task of (Array.isArray(phase.tasks) ? phase.tasks : [])) {
        L.push(taskRow(task))
      }
      L.push('')
    }
  }

  // ── Verification Commands (LOSSLESS) ──
  // Each task's executable verification commands, preserved byte-for-byte from the
  // source JSON as fenced code blocks. This is the authoritative form the developer
  // agent must read; the task-table "Verification" column only links here.
  L.push('## Verification Commands')
  L.push('')
  L.push('> Executable verification commands per task, preserved **verbatim** from the Work Breakdown source — never sanitized. Operators such as `||`, shell pipes `|`, and regex alternations (`grep -E \'a|b|c\'`) survive byte-for-byte. Each command is an independent fenced code block.')
  L.push('')
  for (const phase of wb.phases) {
    for (const task of (Array.isArray(phase.tasks) ? phase.tasks : [])) {
      const cmds = getVerificationCommands(task)
      L.push(`<a id="${verifyAnchor(task.id)}"></a>`)
      L.push(`### ${sanitizeField(task.id ?? '—')}`)
      L.push('')
      if (cmds.length === 0) {
        L.push('_No verification commands._')
        L.push('')
      } else {
        for (const cmd of cmds) {
          L.push(fencedCommandBlock(cmd))
          L.push('')
        }
      }
    }
  }

  // ── Statistics ──
  L.push('## Statistics')
  L.push('')
  L.push('| Domain | Count | Target | Above | Warning | Split |')
  L.push('|--------|-------|--------|-------|---------|-------|')
  for (const d of DOMAINS) {
    const s = domainStats[d]
    L.push(`| ${d} | ${s.count} | ${s.target} | ${s.above} | ${s.warning} | ${s.split} |`)
  }
  L.push(`| **Total** | **${statTotals.count}** | **${statTotals.target}** | **${statTotals.above}** | **${statTotals.warning}** | **${statTotals.split}** |`)
  L.push('')

  return L.join('\n')
}

function renderCsv(wb, prefix, phaseDepsMap) {
  const rows = ['phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type']
  for (const phase of wb.phases) {
    const phaseId    = sanitizeField(phase.id ?? '')
    const phaseTitle = sanitizeField(phase.title ?? '')
    const commitMsg  = phase.commit && typeof phase.commit === 'object'
      ? sanitizeField(phase.commit.type ?? 'chore') + '(' + sanitizeField(prefix) + '): ' + sanitizeField(phase.commit.subject ?? '')
      : `chore(${sanitizeField(prefix)}): implement phase`
    const dependsOn  = sanitizeField(phaseDepsMap.get(phase.id) ?? '')
    const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
    for (const task of tasks) {
      const taskId    = sanitizeField(task.id ?? '')
      const taskTitle = sanitizeField(task.title ?? '')
      const domain    = sanitizeField(task.domain ?? '')
      const agentType = sanitizeField(task.agentType ?? '')
      rows.push(`${phaseId}|${phaseTitle}|${commitMsg}|${dependsOn}|${taskId}|${taskTitle}|${domain}|${agentType}`)
    }
  }
  return rows.join('\n') + '\n'
}

// ── Write files and exit ──────────────────────────────────────────────────────

const md  = renderMarkdown(wb, prefix, phaseDepsMap)
const csv = renderCsv(wb, prefix, phaseDepsMap)
fs.writeFileSync(mdPath, md, 'utf8')
fs.writeFileSync(csvPath, csv, 'utf8')
process.stdout.write(JSON.stringify({ exitCode: 0, markdownPath: mdPath, csvPath }) + '\n')
process.exit(0)
