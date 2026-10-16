# FTR-022 — Technical Specification

## 1. Baseline

- Branch: `develop`. `wb-graph-checks.js` (`src/claude/scripts/wb-graph-checks.js`) exports
  `parseAcTable(requirementsPath)`, returning a `Map<acId, { id, priority, allowedUserStories,
  unscoped }>` (no `criterion` text today) plus `checkAcCoverage({ phases }, acMap, seenTaskIds)`,
  which traverses every phase's tasks, builds a `coveredAcIds` set, and reports checks 19
  (AC existence), 20 (AC scope), 21 (Must-AC coverage) as error objects — it does **not** return
  the AC↔task mapping itself, only pass/fail errors.
- `wbs-assembler.js` exports `loadWorkBreakdown(inputPath)`, dispatching on file-vs-directory
  input, returning `{ schemaVersion, feature, phases: [{ id, type, title, commit, tasks: [...] }] }`
  identically for the split `wbs/` format and a legacy single JSON file. **Not modified.**
- `pm-phase2.js`'s existing post-validation flow: `wb-validate.js` (via `c.command`) →
  `gaia.agent.planner.validate-work-breakdown` (semantic) → `wb-render.js` (via `c.command`,
  produces `{PREFIX}-Work-Breakdown.md`/`.csv`) → `wbs-assembler.js` CLI mode (for
  `c.estimates()`'s metrics) → Gate 2 payload assembly.
- `lib/workflow-runner.js` executes `pm-phase2.js` with no `require()` in scope (confirmed during
  FTR-020); any new script logic must be invoked via `c.command(['run-asset', ...])`, exactly like
  `wb-validate.js`/`wb-render.js`/`wbs-assembler.js` already are.

## 2. Resolution of Open Questions

### OQ-1 (feature.md): extend `parseAcTable` in place, or parse independently?

**Decision:** extend `parseAcTable` in place, additively. Confirmed safe by inspecting every
existing caller: `tests/wb-graph-checks.test.js` and `tests/wb-validate.checks-19-21.test.js` only
ever call `checkAcCoverage({ phases }, acMap, seenTaskIds)` and assert on its `errors` array —
neither test deep-equals or snapshots `acMap`'s own entry shape. Adding one field
(`criterion: cells[1]`, the table's second column, already parsed and discarded today at
`wb-graph-checks.js`'s AC-row loop) cannot change `checkAcCoverage`'s behavior, since it never
reads that field. Writing a second, independent parser would duplicate the entire AC-table
scanning logic (UC-priority lookup, section-boundary detection, column-order validation,
duplicate-ID detection) for zero benefit — the "parse once, reuse everywhere" principle already
established by `req-assembler.js` reusing `wb-graph-checks.js`-style parsing conventions in
FTR-021.

### OQ-2 (feature.md): rendered column set and multi-value cell format

**Decision:** six columns — `AC ID | Criterion | Priority | Related UC | Covering Task(s) |
Covering Phase(s)` — one row per AC, in the Requirements AC table's own order (iterate `acMap` in
insertion order, which `Map` preserves and which matches file order since `parseAcTable` inserts
while scanning top-to-bottom). Multiple task IDs or phase IDs in one cell: comma-separated on a
single line (matches the existing convention for `dependsOn`/`acceptanceCriteria` cells in
`wb-render.js`'s own task table — no new cell-formatting convention introduced). An AC with zero
covering tasks renders `—` in both cells (same `—` convention used throughout this toolkit's
rendered tables for "no value").

## 3. New and Modified Files

| File | Change |
|---|---|
| `src/claude/scripts/wb-graph-checks.js` | **Modified** (additive only): `parseAcTable`'s `acMap.set(acId, { id: acId, priority: acPriority, allowedUserStories, unscoped })` call gains one field: `criterion: cells[1]`. No other line changes. `checkAcCoverage` and its three checks are untouched. |
| `src/claude/scripts/ac-task-matrix.js` | **New.** CLI script: `loadWorkBreakdown(wbsPath)` + `parseAcTable(requirementsPath)`, computes the AC→task→phase mapping (§4), renders the Markdown table + legend (§5), writes `{PREFIX}-AC-Task-Matrix.md`. |
| `src/claude/workflows/pm-phase2.js` | **Modified.** One new `c.activity('ac-task-matrix', ...)` block immediately after the existing `wb-render.js` `c.activity('wb-render', ...)` block (§6); its result's path added to the returned Gate 2 payload. |

## 4. `ac-task-matrix.js` — Computation

```js
#!/usr/bin/env node
'use strict'
const fs = require('fs')
const path = require('path')
const { loadWorkBreakdown } = require('./wbs-assembler')
const { parseAcTable } = require('./wb-graph-checks')

function computeCoverage(wb, acMap) {
  // taskPhase: taskId -> phaseId (built once, mirrors checkAcCoverage's own seenTaskIds pattern)
  const taskPhase = new Map()
  for (const phase of wb.phases) for (const task of phase.tasks) taskPhase.set(task.id, phase.id)

  // coverage: acId -> { taskIds: Set, phaseIds: Set }
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
```

`coverage.has(acId)` guards against a task citing a nonexistent AC ID — structurally impossible
for a feature that already passed `wb-validate.js` (check 19), but this script never assumes that
invariant on its own; it degrades to silently skipping the reference rather than crashing, since
re-reporting that error is `wb-validate.js`'s job, not this renderer's (BR-01).

## 5. `ac-task-matrix.js` — Rendering

```
# AC ↔ Task Traceability Matrix — {PREFIX}

| AC ID | Criterion | Priority | Related UC | Covering Task(s) | Covering Phase(s) |
|---|---|---|---|---|---|
| {acId} | {criterion} | {priority} | {unscoped ? 'All UCs' : allowedUserStories.map(us -> us.replace('US-','UC-')).join(', ')} | {taskIds.join(', ') or —} | {phaseIds.join(', ') or —} |

> **Legend:** **AC ID** — unique identifier from the Requirements Acceptance Criteria table.
> **Criterion** — the testable Given/When/Then statement, copied verbatim. **Priority** — MoSCoW;
> every `Must` row is guaranteed non-empty in **Covering Task(s)** by `wb-validate.js` check 21
> before this file is ever generated. **Related UC** — which Use Case(s) this AC belongs to, or
> `All UCs`. **Covering Task(s)** — every Work Breakdown task whose `acceptanceCriteria` cites
> this AC, comma-separated, or `—` if none. **Covering Phase(s)** — the distinct phase(s) those
> tasks belong to, comma-separated, or `—` if none.
```

Note `allowedUserStories` already stores **US-** prefixed IDs (`wb-graph-checks.js`'s own
`ucRef.replace('UC-', 'US-')` at parse time, needed for its own phase-scope check) — the "Related
UC" column reverses that back to `UC-` form for display, since this table's audience is reading
Requirements UC IDs, not Work Breakdown phase IDs; "Covering Phase(s)" is where the actual `US-`/
phase IDs belong instead.

`isDirectory`/`exists`/`readFile` failures propagate from `loadWorkBreakdown`/`parseAcTable`
unchanged (BR-02) — this script adds no new error class of its own.

CLI entry point:
```js
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

## 6. `pm-phase2.js` Wiring (inserted immediately after the existing `wb-render.js` block)

```js
const acTaskMatrix = await c.activity('ac-task-matrix', async () => {
  const result = c.command(['run-asset', 'scripts/ac-task-matrix.js', '--project', c.root,
    '--', wbsDir, file('Requirements.md'), prefix])
  const matrixPath = file('AC-Task-Matrix.md')
  if (!c.exists(matrixPath)) throw new Error('AC-Task matrix output missing')
  c.read(matrixPath) // never trust an unread write
  return { ...result, matrixPath }
})
```

Gate 2 payload gains one field: `gate2_payload.ac_task_matrix_path: acTaskMatrix.matrixPath` —
informational only; `gate2_blocked` logic is entirely unchanged (BR-02/NFR-03), this step cannot
fail for any feature that already reached it.

## 7. Legacy Compatibility

No legacy-format concern beyond what `loadWorkBreakdown`/`parseAcTable` already solved: a feature
whose Work Breakdown is still a single legacy JSON file, or whose Requirements predates FTR-021's
split generation, produces the exact same matrix — this script never branches on which generation
path produced its inputs, only on their already-assembled final shape (AC-04).

## 8. Test Plan (AC-06)

- `ac-task-matrix.test.js`: `computeCoverage()`/`renderMatrix()` against a hand-built `wb` +
  `acMap` fixture covering: an AC covered by one task, an AC covered by two tasks in two
  different phases (both phases listed), an unscoped (`All UCs`) AC, an AC with zero covering
  tasks (renders `—`), and row order matching `acMap`'s insertion order.
- `wb-graph-checks.parseAcTable.criterion-regression.test.js` (or folded into the existing
  `wb-graph-checks.test.js`): re-run the existing checks-19–21 fixtures through the extended
  `parseAcTable`, asserting `checkAcCoverage`'s `errors` output is byte-identical to before the
  extension (NFR-02) — plus one new assertion that `acMap.get(id).criterion` now returns the
  table's real Criterion text.
- `pm-phase2-ac-task-matrix.test.js` (or extend `tests/integration/workflow-runtime.test.js`'s
  existing pm-phase2 fixtures): a full `runWorkflow('pm-phase2', ...)` run asserts
  `{PREFIX}-AC-Task-Matrix.md` exists, is readable, and its path appears in
  `result.gate2_payload.ac_task_matrix_path`.
