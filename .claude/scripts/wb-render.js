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
    const verifArr = task.verificationCommands ?? task.verification?.commands ?? []
    const verif    = verifArr.length > 0 ? sanitizeField(verifArr.join('; ')) : '—'
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
  // TODO: implemented in T05
  return ''
}

// ── Write files and exit ──────────────────────────────────────────────────────

const md  = renderMarkdown(wb, prefix, phaseDepsMap)
const csv = renderCsv(wb, prefix, phaseDepsMap)
fs.writeFileSync(mdPath, md, 'utf8')
fs.writeFileSync(csvPath, csv, 'utf8')
process.stdout.write(JSON.stringify({ exitCode: 0, markdownPath: mdPath, csvPath }) + '\n')
process.exit(0)
