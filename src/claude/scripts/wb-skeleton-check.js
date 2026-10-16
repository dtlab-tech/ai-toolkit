'use strict'

const fs = require('fs')
const path = require('path')
const graphChecks = require('./wb-graph-checks')

// Deterministic structural pre-check for a Work Breakdown SKELETON (schema v3 index.json),
// run by pm-phase2.js before any per-task generation call is dispatched (FTR-020 UC-02).
//
// This is a SEPARATE script from wb-validate.js, not a reuse of it, because wb-validate.js
// also runs checks 4/15-18/22/23 (inline, not extracted to wb-graph-checks.js), which need
// full per-task detail (verification.commands, groupingRationale) the skeleton does not
// carry yet — running wb-validate.js against a skeleton would falsely report every task as
// missing those fields. This script runs only the 11 skeleton-answerable checks (reusing the
// exact same wb-graph-checks.js functions wb-validate.js itself now imports) plus empty-phase
// detection (check 23's logic, trivial enough from taskIds alone not to warrant importing it).
//
// pm-phase2.js cannot call wb-graph-checks.js's functions in-process — its workflow-script
// runtime has no `require` (see lib/workflow-runner.js) — so this is invoked as a real Node
// subprocess via `c.command(['run-asset', 'scripts/wb-skeleton-check.js', ...])`, the same
// pattern already used for wb-validate.js/wb-render.js.

const indexPath = process.argv[2]
const requirementsPath = process.argv[3]

if (!indexPath) {
  process.stderr.write('Error: missing required argument <path-to-index.json>\n')
  process.exit(2)
}

let index
try {
  index = JSON.parse(fs.readFileSync(path.resolve(indexPath), 'utf8'))
} catch (err) {
  process.stderr.write(`Error: cannot read or parse "${indexPath}": ${err.message}\n`)
  process.exit(2)
}

if (index.schemaVersion !== 3) {
  process.stderr.write(`Error: index.json must have schemaVersion 3, got ${JSON.stringify(index.schemaVersion)}\n`)
  process.exit(2)
}

// Project the skeleton's map-of-tasks shape into the array-of-tasks-per-phase shape every
// wb-graph-checks.js function expects (the same shape wb-validate.js/wb-render.js use after
// assembly) — the skeleton's own `index.tasks` map has no `id` field per entry (it's the map
// key), so it is added back here.
const phases = (index.phases || []).map(phaseSkeleton => ({
  id: phaseSkeleton.id,
  type: phaseSkeleton.type,
  tasks: (phaseSkeleton.taskIds || []).map(taskId => ({ id: taskId, ...(index.tasks || {})[taskId] })),
}))

const errors = []

const check3 = graphChecks.checkUniqueTaskIds({ phases })
errors.push(...check3.errors)
const seenTaskIds = check3.seenTaskIds

errors.push(...graphChecks.checkTaskIdFormat({ phases }).errors)
errors.push(...graphChecks.checkDomainWhitelist({ phases }).errors)
errors.push(...graphChecks.checkAgentTypeWhitelist({ phases }).errors)

const allTaskIds = new Set(seenTaskIds.keys())
errors.push(...graphChecks.checkDependencyExistence({ phases }, allTaskIds).errors)
errors.push(...graphChecks.checkSelfDependency({ phases }).errors)
errors.push(...graphChecks.checkPhaseIdConsistency({ phases }).errors)
errors.push(...graphChecks.checkTaskCycle({ phases }, allTaskIds).errors)

const check1213 = graphChecks.checkPhaseDependencyAndCycle({ phases }, seenTaskIds)
errors.push(...check1213.errors)
errors.push(...graphChecks.checkPhaseSchedulability({ phases }, check1213.phaseDepsMap).errors)

const acMap = graphChecks.parseAcTable(requirementsPath)
errors.push(...graphChecks.checkAcCoverage({ phases }, acMap, seenTaskIds).errors)

// Empty-phase detection (check 23's logic — simple enough from taskIds alone not to import)
for (const phase of phases) {
  if (phase.tasks.length === 0) {
    errors.push({
      category: graphChecks.ERRORS.EMPTY_PHASE,
      severity: 'error',
      taskId: null,
      phaseId: phase.id,
      field: 'taskIds',
      message: `Phase "${phase.id}" has no tasks; each phase must contain at least one task`,
      details: { phaseId: phase.id },
    })
  }
}

const report = { valid: errors.length === 0, errors }
process.stdout.write(JSON.stringify(report, null, 2) + '\n')
process.exit(report.valid ? 0 : 1)
