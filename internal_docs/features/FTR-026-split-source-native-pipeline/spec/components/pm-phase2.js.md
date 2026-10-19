# src/claude/workflows/pm-phase2.js — Modified

## Change

Six changes, all inside the existing `c.run(...)` body, none touching `SKELETON_SCHEMA`,
`materializeIndex`, the template-engine primitives, or `computeDependsOnPhases`:

1. The `bridge-requirements-tech-spec` activity (current lines 195-212) is deleted outright — once
   changes 2-6 below land, nothing in this file needs the assembled monolithic files to exist.
2. The Gate 1 digest re-check (`c.hash(c.read(file('Requirements.md')) + '\u0000' + c.read(file('Tech-Spec.md')))`)
   is replaced with an in-memory recomputation: the same `req-assembler.js`/`tech-spec-assembler.js`
   subprocess calls `pm-phase1.js` already makes, run here, never written to disk. A legacy feature
   (no `req/`/`spec/`) keeps reading the existing monolithic files directly.
3. The `wb-skeleton-check.js` and `wb-validate.js` `c.command()` calls change their Requirements
   argument from `file('Requirements.md')` to `reqIndexPath` (new local constant, computed the same
   `hasReq`/`hasSpec`-style way the old bridge step did, now inline).
4. The `ac-task-matrix.js` `c.command()` call changes its Requirements/Tech-Spec arguments to
   `reqIndexPath`/`specIndexPath` and gains a required 5th `featureDir` argument (that script's own
   output-location redesign — see its component). The activity wrapper around this call
   (`c.activity('ac-task-matrix', ...)`) is updated to check/read the two new output paths
   (`coverage-matrix/index.json`, `coverage-matrix/index.md`) instead of the old single
   `file('AC-Task-Matrix.md')`, and `gate2_payload` exposes `ac_task_matrix_json_path`/
   `ac_task_matrix_md_path` in place of the old single `ac_task_matrix_path`.
5. The semantic validator worker call's prompt changes from `` `${wbsDir}\n${file('Requirements.md')}` ``
   to `` `${wbsDir}\n${reqIndexPath}` ``.
6. `buildTaskPrompt()` stops accepting a full `techSpecText` string. A new helper,
   `buildTaskTechSpecExcerpt(specIndexContent, task)`, computes a per-task excerpt instead, and the
   per-task dispatch loop passes its result in place of `c.read(file('Tech-Spec.md'))`.

## Algorithm

```js
// New local constants, computed once near the top of c.run()'s body, replacing the old bridge
// step's reqDir/specDir/hasReq/hasSpec locals (same detection, now used directly by call sites
// instead of feeding a write-to-disk step):
const reqDir = `${featureDir}/req`, specDir = `${featureDir}/spec`
const hasReq = c.exists(`${reqDir}/index.md`), hasSpec = c.exists(`${specDir}/index.md`)
const reqIndexPath = hasReq ? `${reqDir}/index.md` : file('Requirements.md')
const specIndexPath = hasSpec ? `${specDir}/index.md` : file('Tech-Spec.md')

// Gate 1 digest re-check — in-memory, no file write:
const assembledRequirements = hasReq
  ? c.command(['run-asset', 'scripts/req-assembler.js', '--project', c.root, '--', reqDir]).stdout
  : c.read(file('Requirements.md'))
const assembledTechSpec = hasSpec
  ? c.command(['run-asset', 'scripts/tech-spec-assembler.js', '--project', c.root, '--', specDir]).stdout
  : c.read(file('Tech-Spec.md'))
const currentDigest = c.hash(assembledRequirements + '\u0000' + assembledTechSpec)
// ...same digestMatch comparison logic as today, unchanged.

// Script call sites — same c.command() shape, different argument:
c.command(['run-asset', 'scripts/wb-skeleton-check.js', '--project', c.root, '--', indexPath, reqIndexPath], [0, 1])
c.command(['run-asset', 'scripts/wb-validate.js', '--project', c.root, '--', wbsDir, reqIndexPath], [0, 1])

// ac-task-matrix.js call + its activity wrapper — featureDir is now a required 5th argument, and
// the wrapper checks both of the script's two output files under coverage-matrix/ (its own
// component details why the output moved there):
const acTaskMatrix = await c.activity('ac-task-matrix', async () => {
  const result = c.command(['run-asset', 'scripts/ac-task-matrix.js', '--project', c.root,
    '--', wbsDir, reqIndexPath, specIndexPath, prefix, featureDir])
  const matrixJsonPath = `${featureDir}/coverage-matrix/index.json`
  const matrixMdPath = `${featureDir}/coverage-matrix/index.md`
  if (!c.exists(matrixJsonPath)) throw new Error('AC-Task matrix JSON output missing')
  if (!c.exists(matrixMdPath)) throw new Error('AC-Task matrix MD output missing')
  c.read(matrixJsonPath) // never trust an unread write
  c.read(matrixMdPath)
  return { ...result, matrixJsonPath, matrixMdPath }
})
// gate2_payload: ac_task_matrix_json_path: acTaskMatrix.matrixJsonPath,
//                ac_task_matrix_md_path: acTaskMatrix.matrixMdPath
// (replaces the old single ac_task_matrix_path field)

// Semantic validator — same worker call shape, different path in the prompt:
await c.worker('gaia.agent.planner.validate-work-breakdown', `${wbsDir}\n${reqIndexPath}`, { schema: ... })

// Per-task Tech-Spec excerpt — new helper, local re-implementation of
// tech-spec-assembler.js's parseComponentsTable (see runtime-constraint note below for why this
// can't just `require()` it):
function parseComponentsTableLocal(specIndexContent) { /* same logic as tech-spec-assembler.js's
  parseComponentsTable: read Section 9's New files/Modified files subtables via findSectionRange/
  findSubsectionRange-equivalent parsing against specIndexContent (obtained via c.read(), not
  fs.readFileSync) */ }

function buildTaskTechSpecExcerpt(specIndexContent, components, task) {
  const acSet = new Set(task.acceptanceCriteria || [])
  const relevant = components.filter(c =>
    (c.addresses || '').split(',').map(s => s.trim()).some(acId => acSet.has(acId)))
  if (relevant.length === 0) {
    return '_No component\'s Addresses column cites this task\'s Acceptance Criteria — full ' +
      'Components table below._\n\n' + specIndexContent // conservative fallback, never zero content
  }
  return relevant.map(c => `### ${c.filePath}\n\n${readComponentBody(c, specDir)}`).join('\n\n')
}
```

**Runtime constraint, same one `renderPhaseDetailBlock`/the template-engine primitives already hit
(documented at the top of this file):** this workflow script's sandboxed runtime has no `require()` —
only `control`/`args` are injected. `parseComponentsTable()`'s own logic (reading Section 9's two
subtables, `findSubsectionRange`, the `New files`/`Modified files` split) is therefore **duplicated**
here as a small local function reading `specIndexContent` directly via `c.read()`, exactly the same
precedent already established for the template-engine primitives duplicated from `wbs-assembler.js`
at the top of this file — not imported, kept in sync manually, with a comment cross-referencing the
canonical implementation in `tech-spec-assembler.js`. `readComponentBody(component, specDir)` reads
`${specDir}/components/${component.fileSlug}.md` via `c.read()` and returns its own `## Change`
through `## Tests`-exclusive body (reusing `parseComponentDetail`'s *shape*, not its code, for the
same sandboxed-runtime reason) — if a referenced component file is missing, this throws rather than
silently proceeding, same fail-closed convention as `tech-spec-assembler.js`'s own `loadTechSpec`.

`buildTaskTechSpecExcerpt` is computed once per task, inside the existing per-task dispatch loop
(reusing the already-parsed `components` array across all tasks in a single pass, computed once
before the loop starts — not re-parsed per task).

## Tests

`tests/integration/workflow-runtime.test.js` (see that file's own component): new tests for (a) the
Gate 1 digest in-memory recomputation matching `pm-phase1.js`'s own digest for the same split
sources, (b) each of the three script call sites receiving `reqIndexPath`/`specIndexPath` instead of
an assembled file path, (c) `buildTaskTechSpecExcerpt` returning only the matched component(s) for a
task whose `acceptanceCriteria` matches a component's `Addresses` column, (d) the full-Components-
table fallback when no component matches, (e) the legacy-fallback path (no `req/`/`spec/`) for every
one of the above, exercising the pre-existing monolithic-file behavior unchanged, (f) a negative test
asserting the `bridge-requirements-tech-spec` activity name no longer appears in `c.tokenLedger`'s
activity list for a real-split-source run, (g) `ac-task-matrix.js` is invoked with `featureDir` as its
5th argument and `gate2_payload` exposes `ac_task_matrix_json_path`/`ac_task_matrix_md_path` pointing
at `coverage-matrix/index.json`/`coverage-matrix/index.md` under the fixture's feature directory.
