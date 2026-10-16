<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Create ac-task-matrix.js with computeCoverage, renderMatrix, and CLI entry point
- **Outcome:** src/claude/scripts/ac-task-matrix.js exists exporting computeCoverage(wb, acMap) (builds acId -> {taskIds, phaseIds} by walking every phase's tasks) and renderMatrix(prefix, acMap, coverage) (renders the 6-column Markdown table + legend, AC rows in acMap insertion order), plus a require.main === module CLI entry point that loads the WB and Requirements, computes coverage, and writes {PREFIX}-AC-Task-Matrix.md
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-01, AC-02, AC-03, AC-04
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** `computeCoverage`, `renderMatrix`, and the CLI entry point have no independent meaning in isolation — the CLI is not callable until both functions exist, and splitting them into separate tasks would mean one task's output is untestable without the other's, the same reasoning FTR-020/021 applied to their own single-module script tasks.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add ac-task-matrix.js computing and rendering AC-to-task coverage

**Implementation notes:**

From Tech-Spec §4/§5, verbatim (this task's job is to make this file real, not redesign it):

```js
#!/usr/bin/env node
'use strict'
const fs = require('fs')
const path = require('path')
const { loadWorkBreakdown } = require('./wbs-assembler')
const { parseAcTable } = require('./wb-graph-checks')

function computeCoverage(wb, acMap) {
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
```

`taskPhase` (built in `computeCoverage`) is currently unused by the return value — it mirrors
`checkAcCoverage`'s own `seenTaskIds` pattern for a reason: if a later task in this feature (or a
future one) needs "which phase owns task X" as a direct lookup rather than iterating
`coverage`'s per-AC sets, it is already available without re-deriving it. Keep it even though
`coverage` alone satisfies every AC in this task — do not delete it as dead code.

Note `allowedUserStories` already stores `US-`-prefixed IDs (`wb-graph-checks.js`'s own parse-time
normalization); `renderMatrix`'s "Related UC" column reverses that back to `UC-` form for display,
since this column's audience is reading Requirements UC IDs — "Covering Phase(s)" is where the
real `US-`/phase IDs belong instead.

**Verification commands:**

```
node --check src/claude/scripts/ac-task-matrix.js
```
