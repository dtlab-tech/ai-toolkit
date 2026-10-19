# src/claude/scripts/ac-task-matrix.js — Modified

## Change

Two reasons this file changes, found/decided during this feature's own Tech-Spec validation:

1. **A real bug**, found by actually running the script with the intended arguments, not by
   inspection alone: the CLI derives its output path from
   `path.dirname(path.resolve(requirementsPath))`. Today that resolves to the feature root (since
   `pm-phase2.js` passes `file('Requirements.md')`); once AC-03 repoints that argument to
   `reqIndexPath` (`${featureDir}/req/index.md`), the output would silently move into `req/` instead.
2. **A deliberate redesign of the output itself**, requested directly: instead of one loose
   `{PREFIX}-AC-Task-Matrix.md` file, the script now writes two files into a dedicated
   `coverage-matrix/` subfolder under an explicitly-given feature directory — `index.json` (the full
   AC↔Task↔Phase↔Tech-Spec-file relation data, machine-readable) and `index.md` (a human-readable
   rendering of the same data, plus summary add-ons the bare table didn't have: a Must-AC coverage
   count and a pointer to the JSON file).

Since there is no other caller of this script (confirmed by `grep -rn "ac-task-matrix.js"` across the
repository — only `pm-phase2.js` and its own test suite), the CLI's `featureDir` argument is made
**required**, not optional — this is a clean redesign of the output contract, not a backward-
compatible addition. No change to `computeCoverage`, `computeTechSpecCoverage`, `parseAcTable`, or
`parseFileInventoryEntries` — only the CLI entry point and a new `buildMatrixJson` function; `renderMatrix` gains two new lines, its table/legend are otherwise unchanged.

## Algorithm

```js
// New: serializes the same in-memory data renderMatrix already consumes, into the JSON shape
// req/index.md §4.1 documents (one entry per Requirements AC, in table order).
function buildMatrixJson(prefix, acMap, coverage, techSpecCoverage = new Map()) {
  const acceptanceCriteria = [...acMap.entries()].map(([acId, ac]) => {
    const cov = coverage.get(acId)
    return {
      id: acId,
      criterion: ac.criterion,
      priority: ac.priority,
      unscoped: !!ac.unscoped,
      relatedUCs: ac.unscoped ? [] : ac.relatedUCs,
      techSpecFiles: [...(techSpecCoverage.get(acId) || [])],
      taskIds: [...cov.taskIds],
      phaseIds: [...cov.phaseIds],
    }
  })
  return { prefix, generatedAt: new Date().toISOString(), acceptanceCriteria }
}

// renderMatrix gains a summary line above the existing table — everything else unchanged:
function renderMatrix(prefix, acMap, coverage, techSpecCoverage = new Map()) {
  const mustEntries = [...acMap.entries()].filter(([, ac]) => ac.priority === 'Must')
  const mustCovered = mustEntries.filter(([id]) => coverage.get(id).taskIds.size > 0).length
  const summary = `**Must-AC coverage:** ${mustCovered}/${mustEntries.length} covered. ` +
    'Machine-readable data: [index.json](index.json).'
  const rows = /* unchanged row-building logic */ ...
  return `# AC ↔ Task Traceability Matrix — ${prefix}\n\n${summary}\n\n` +
    '| AC ID | Criterion | ... |\n|---|---|...|\n' + rows.join('\n') + '\n\n' +
    '> **Legend:** ...' /* unchanged */
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

`module.exports` gains `buildMatrixJson` alongside the existing `computeCoverage`/`renderMatrix`/
`computeTechSpecCoverage`.

## Tests

`tests/ac-task-matrix.test.js` (see that file's own component): asserts `buildMatrixJson()`'s shape
against a known `acMap`/`coverage`/`techSpecCoverage` fixture (one entry per AC, correct
`unscoped`/`relatedUCs`/`techSpecFiles`/`taskIds`/`phaseIds`); asserts the CLI creates
`coverage-matrix/` under the given `featureDir` (including when it doesn't exist yet) and writes both
`index.json` (valid JSON, matching `buildMatrixJson`'s output) and `index.md` (containing the new
Must-AC coverage summary line and a link to `index.json`); asserts the CLI exits 1 with a usage
message when `featureDir` is omitted.
