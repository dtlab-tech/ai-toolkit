<a id="task-US-01-TASK-BE-03"></a>
### US-01-TASK-BE-03

- **Task ID:** US-01-TASK-BE-03
- **Title:** Redesign ac-task-matrix.js's output into a coverage-matrix/ subfolder (JSON+MD)
- **Outcome:** ac-task-matrix.js's CLI requires a 5th featureDir argument and writes coverage-matrix/index.json (full AC<->Task<->Phase<->Tech-Spec-file relation data) and coverage-matrix/index.md (human-readable, with a Must-AC coverage summary and a link to index.json) under it, replacing the single {PREFIX}-AC-Task-Matrix.md file
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-03, AC-10
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** ac-task-matrix
- **Commit subject:** write coverage-matrix/index.json+index.md under an explicit feature directory

**Implementation notes:**

Two motivations: (a) a real bug, found while validating this feature's own Tech-Spec
against the real script — `ac-task-matrix.js`'s CLI derives its output path from
`path.dirname(path.resolve(requirementsPath))`, which would silently move from the feature root into
`req/` once US-01-TASK-BE-02 repoints that argument to `reqIndexPath`; (b) a deliberate redesign,
requested directly: output moves into a dedicated `coverage-matrix/` subfolder as a JSON+MD pair
instead of one loose file.

```js
// New: serializes the same in-memory data renderMatrix already consumes.
function buildMatrixJson(prefix, acMap, coverage, techSpecCoverage = new Map()) {
  const acceptanceCriteria = [...acMap.entries()].map(([acId, ac]) => {
    const cov = coverage.get(acId)
    return {
      id: acId, criterion: ac.criterion, priority: ac.priority, unscoped: !!ac.unscoped,
      relatedUCs: ac.unscoped ? [] : ac.relatedUCs,
      techSpecFiles: [...(techSpecCoverage.get(acId) || [])],
      taskIds: [...cov.taskIds], phaseIds: [...cov.phaseIds],
    }
  })
  return { prefix, generatedAt: new Date().toISOString(), acceptanceCriteria }
}

// renderMatrix gains one summary line above the existing table — table/legend unchanged:
function renderMatrix(prefix, acMap, coverage, techSpecCoverage = new Map()) {
  const mustEntries = [...acMap.entries()].filter(([, ac]) => ac.priority === 'Must')
  const mustCovered = mustEntries.filter(([id]) => coverage.get(id).taskIds.size > 0).length
  const summary = `**Must-AC coverage:** ${mustCovered}/${mustEntries.length} covered. ` +
    'Machine-readable data: [index.json](index.json).'
  // ...existing row-building logic, unchanged...
  return `# AC ↔ Task Traceability Matrix — ${prefix}\n\n${summary}\n\n` + /* existing table/legend */
}

if (require.main === module) {
  const [wbsPath, requirementsPath, techSpecPath, prefix, featureDir] = process.argv.slice(2)
  if (!wbsPath || !requirementsPath || !techSpecPath || !prefix || !featureDir) {
    process.stderr.write(
      'Usage: node ac-task-matrix.js <wbs-path> <requirements-path> <tech-spec-path> <prefix> <feature-dir>\n')
    process.exit(1)
  }
  const wb = loadWorkBreakdown(path.resolve(wbsPath))
  const acMap = parseAcTable(path.resolve(requirementsPath))
  const coverage = computeCoverage(wb, acMap)
  const techSpecEntries = parseFileInventoryEntries(fs.readFileSync(path.resolve(techSpecPath), 'utf8'))
  const techSpecCoverage = computeTechSpecCoverage(techSpecEntries, acMap)
  const outDir = path.join(path.resolve(featureDir), 'coverage-matrix')
  fs.mkdirSync(outDir, { recursive: true })
  const jsonPath = path.join(outDir, 'index.json')
  const mdPath = path.join(outDir, 'index.md')
  fs.writeFileSync(jsonPath, JSON.stringify(buildMatrixJson(prefix, acMap, coverage, techSpecCoverage), null, 2))
  fs.writeFileSync(mdPath, renderMatrix(prefix, acMap, coverage, techSpecCoverage))
  console.log(JSON.stringify({ jsonPath, mdPath }))
}
```

`featureDir` is REQUIRED, not optional — confirmed by `grep -rn "ac-task-matrix.js"` that
`pm-phase2.js` and its own test suite are the only callers, so there is no backward-compatible
no-arg case worth preserving. `module.exports` gains `buildMatrixJson` alongside the existing
`computeCoverage`/`renderMatrix`/`computeTechSpecCoverage`. Must land before US-01-TASK-BE-02,
which will pass `featureDir` as this new 5th argument.

**Verification commands:**

```
npm test -- tests/ac-task-matrix.test.js
```
