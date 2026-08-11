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

// ── Render stubs (implemented in T03–T05) ─────────────────────────────────────

function renderMarkdown(wb, prefix, phaseDepsMap) {
  // TODO: implemented in T03-T04
  return ''
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
