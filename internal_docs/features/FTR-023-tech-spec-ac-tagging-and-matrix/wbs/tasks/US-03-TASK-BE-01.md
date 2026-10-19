<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Extend ac-task-matrix.js with Tech-Spec coverage
- **Outcome:** ac-task-matrix.js gains computeTechSpecCoverage(entries, acMap) (acId -> Set<filePath>); renderMatrix gains an optional 4th techSpecCoverage parameter (default empty Map, backward compatible) and one new column, 'Addressed by Tech-Spec File(s)', between Related UC and Covering Task(s); the CLI entry point accepts a new tech-spec-path argument and wires parseFileInventoryEntries + computeTechSpecCoverage through to renderMatrix
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-05, AC-06
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** extend ac-task-matrix.js with Tech-Spec file coverage

**Implementation notes:**

From Tech-Spec §5. Add alongside the existing `computeCoverage`:

```js
function computeTechSpecCoverage(entries, acMap) {
  const coverage = new Map([...acMap.keys()].map(acId => [acId, new Set()]))
  for (const entry of entries) {
    for (const acId of entry.acIds) {
      if (coverage.has(acId)) coverage.get(acId).add(entry.filePath)
    }
  }
  return coverage
}
```

Change `renderMatrix`'s signature and header/row rendering:

```js
function renderMatrix(prefix, acMap, coverage, techSpecCoverage = new Map()) {
  const rows = [...acMap.entries()].map(([acId, ac]) => {
    const relatedUc = ac.unscoped ? 'All UCs' : ac.allowedUserStories.map(us => us.replace('US-', 'UC-')).join(', ')
    const cov = coverage.get(acId)
    const taskIds = [...cov.taskIds].join(', ') || '—'
    const phaseIds = [...cov.phaseIds].join(', ') || '—'
    const techSpecFiles = [...(techSpecCoverage.get(acId) || [])].join(', ') || '—'
    return `| ${acId} | ${ac.criterion} | ${ac.priority} | ${relatedUc} | ${techSpecFiles} | ${taskIds} | ${phaseIds} |`
  })
  return `# AC ↔ Task Traceability Matrix — ${prefix}\n\n` +
    '| AC ID | Criterion | Priority | Related UC | Addressed by Tech-Spec File(s) | Covering Task(s) | Covering Phase(s) |\n' +
    '|---|---|---|---|---|---|---|\n' +
    rows.join('\n') + '\n\n' +
    '> **Legend:** **AC ID** — unique identifier from the Requirements Acceptance Criteria ' +
    'table. **Criterion** — the testable Given/When/Then statement, copied verbatim. ' +
    '**Priority** — MoSCoW; every `Must` row is guaranteed non-empty in **Covering Task(s)** by ' +
    'wb-validate.js check 21 before this file is ever generated. **Related UC** — which Use ' +
    'Case(s) this AC belongs to, or `All UCs`. **Addressed by Tech-Spec File(s)** — every ' +
    'Tech-Spec file whose `Addresses` column cites this AC, comma-separated, or `—` if none. ' +
    '**Covering Task(s)** — every Work Breakdown task whose `acceptanceCriteria` cites this AC, ' +
    'comma-separated, or `—` if none. **Covering Phase(s)** — the distinct phase(s) those tasks ' +
    'belong to, comma-separated, or `—` if none.\n'
}
```

CLI entry point: add a 4th positional argument (Tech-Spec path), before `prefix` — usage becomes
`node ac-task-matrix.js <wbs-path> <requirements-path> <tech-spec-path> <prefix>`:

```js
if (require.main === module) {
  const [wbsPath, requirementsPath, techSpecPath, prefix] = process.argv.slice(2)
  if (!wbsPath || !requirementsPath || !techSpecPath || !prefix) {
    process.stderr.write('Usage: node ac-task-matrix.js <wbs-path> <requirements-path> <tech-spec-path> <prefix>\n')
    process.exit(1)
  }
  const wb = loadWorkBreakdown(path.resolve(wbsPath))
  const acMap = parseAcTable(path.resolve(requirementsPath))
  const coverage = computeCoverage(wb, acMap)
  const techSpecEntries = parseFileInventoryEntries(fs.readFileSync(path.resolve(techSpecPath), 'utf8'))
  const techSpecCoverage = computeTechSpecCoverage(techSpecEntries, acMap)
  const outPath = path.join(path.dirname(path.resolve(requirementsPath)), `${prefix}-AC-Task-Matrix.md`)
  fs.writeFileSync(outPath, renderMatrix(prefix, acMap, coverage, techSpecCoverage))
  console.log(JSON.stringify({ outputPath: outPath }))
}
module.exports = { computeCoverage, renderMatrix, computeTechSpecCoverage }
```

New top-of-file import: `const { parseFileInventoryEntries } = require('./tech-spec-graph-checks')`.
**This also changes `pm-phase2.js`'s existing `US-03-TASK-BE-01` (FTR-022) call site** — its
`c.command(['run-asset', 'scripts/ac-task-matrix.js', ...])` invocation must be updated to pass
`file('Tech-Spec')` as the new 3rd positional argument, before `prefix`. This is the one piece of
this feature that touches a file outside its own new/modified set (`pm-phase2.js`) — call it out
explicitly in the PR description, since it's easy to miss that a CLI argument-order change has a
caller elsewhere.

**Verification commands:**

```
node --check src/claude/scripts/ac-task-matrix.js
node --check src/claude/workflows/pm-phase2.js
```
