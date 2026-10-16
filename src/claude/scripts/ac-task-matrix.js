#!/usr/bin/env node
'use strict'

// FTR-022: deterministic renderer producing {PREFIX}-AC-Task-Matrix.md — a table mapping every
// Requirements Acceptance Criterion to the Work Breakdown task(s)/phase(s) that cover it. No new
// data, no new validation: every fact here is already computed and enforced by wb-validate.js's
// checks 19-21 (checkAcCoverage, wb-graph-checks.js). This script never re-validates; it assumes
// its inputs already passed those checks and only renders what they already guarantee.

const fs = require('fs')
const path = require('path')
const { loadWorkBreakdown } = require('./wbs-assembler')
const { parseAcTable } = require('./wb-graph-checks')

function computeCoverage(wb, acMap) {
  // taskPhase mirrors checkAcCoverage's own seenTaskIds pattern — not read by this function's
  // own return value, kept available for any future lookup that needs "which phase owns task X"
  // directly instead of iterating coverage's per-AC sets.
  const taskPhase = new Map()
  for (const phase of wb.phases) for (const task of phase.tasks) taskPhase.set(task.id, phase.id)

  const coverage = new Map([...acMap.keys()].map(acId => [acId, { taskIds: new Set(), phaseIds: new Set() }]))
  for (const phase of wb.phases) {
    for (const task of phase.tasks) {
      for (const acId of (task.acceptanceCriteria || [])) {
        if (!coverage.has(acId)) continue // AC_NOT_FOUND is wb-validate.js's job, not this script's
        coverage.get(acId).taskIds.add(task.id)
        coverage.get(acId).phaseIds.add(phase.id)
      }
    }
  }
  return coverage
}

function renderMatrix(prefix, acMap, coverage) {
  const rows = [...acMap.entries()].map(([acId, ac]) => {
    const relatedUc = ac.unscoped ? 'All UCs' : ac.allowedUserStories.map(us => us.replace('US-', 'UC-')).join(', ')
    const cov = coverage.get(acId)
    const taskIds = [...cov.taskIds].join(', ') || '—'
    const phaseIds = [...cov.phaseIds].join(', ') || '—'
    return `| ${acId} | ${ac.criterion} | ${ac.priority} | ${relatedUc} | ${taskIds} | ${phaseIds} |`
  })
  return `# AC ↔ Task Traceability Matrix — ${prefix}\n\n` +
    '| AC ID | Criterion | Priority | Related UC | Covering Task(s) | Covering Phase(s) |\n' +
    '|---|---|---|---|---|---|\n' +
    rows.join('\n') + '\n\n' +
    '> **Legend:** **AC ID** — unique identifier from the Requirements Acceptance Criteria ' +
    'table. **Criterion** — the testable Given/When/Then statement, copied verbatim. ' +
    '**Priority** — MoSCoW; every `Must` row is guaranteed non-empty in **Covering Task(s)** by ' +
    'wb-validate.js check 21 before this file is ever generated. **Related UC** — which Use ' +
    'Case(s) this AC belongs to, or `All UCs`. **Covering Task(s)** — every Work Breakdown task ' +
    'whose `acceptanceCriteria` cites this AC, comma-separated, or `—` if none. **Covering ' +
    'Phase(s)** — the distinct phase(s) those tasks belong to, comma-separated, or `—` if none.\n'
}

if (require.main === module) {
  const [wbsPath, requirementsPath, prefix] = process.argv.slice(2)
  if (!wbsPath || !requirementsPath || !prefix) {
    process.stderr.write('Usage: node ac-task-matrix.js <wbs-path> <requirements-path> <prefix>\n')
    process.exit(1)
  }
  const wb = loadWorkBreakdown(path.resolve(wbsPath))
  const acMap = parseAcTable(path.resolve(requirementsPath))
  const coverage = computeCoverage(wb, acMap)
  const outPath = path.join(path.dirname(path.resolve(requirementsPath)), `${prefix}-AC-Task-Matrix.md`)
  fs.writeFileSync(outPath, renderMatrix(prefix, acMap, coverage))
  console.log(JSON.stringify({ outputPath: outPath }))
}

module.exports = { computeCoverage, renderMatrix }
