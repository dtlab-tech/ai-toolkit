# Technical Specification — Split-Source-Native Work Breakdown Pipeline

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-026 |
| Version | 1.0 |
| Date | 2026-10-19 |
| Status | Draft |

## 1. Overview

Removes `pm-phase2.js`'s automatic `bridge-requirements-tech-spec` step (FTR-025's transitional
shim) by repointing every one of its own downstream consumers — three deterministic script call
sites, two agent prompts, and the per-task detail worker's Tech-Spec input — at the split `req/`/
`spec/` sources directly. The highest-value change is the per-task detail worker: today it receives
the **entire** assembled Tech-Spec text on every call; this feature replaces that with a
host-computed excerpt of just the component(s) relevant to that task's own Acceptance Criteria,
eliminating the pipeline's single largest structural token cost.

## 2. Architecture

### 2.1 System Context

No new system boundary. This feature changes internal data flow inside one existing workflow script
(`pm-phase2.js`), three existing agent prompts (`gaia-validate-work-breakdown-semantic`,
`gaia-generate-work-breakdown`, `gaia-generate-work-breakdown-task`), and one small, additive,
backward-compatible CLI argument on an existing standalone script (`ac-task-matrix.js`, needed to
keep its output location stable once its Requirements argument changes — see Risks). No new script,
no new command.

### 2.2 Component Diagram

```
Before (today, post-FTR-025):
  pm-phase2.js --bridge step--> assembles+writes {PREFIX}-Requirements.md/{PREFIX}-Tech-Spec.md
                                     |
                                     +--read by--> wb-skeleton-check.js / wb-validate.js (parseAcTable)
                                     +--read by--> ac-task-matrix.js (parseAcTable + parseFileInventoryEntries)
                                     +--read by--> gaia-validate-work-breakdown-semantic (full Read)
                                     +--read by--> gaia-generate-work-breakdown (full Read, both files)
                                     +--inlined into--> every per-task prompt (full Tech-Spec text)

After (this feature):
  pm-phase2.js --no bridge step, no automatic write-->
                                     |
                                     +--reqIndexPath/specIndexPath--> wb-skeleton-check.js / wb-validate.js / ac-task-matrix.js
                                     +--reqIndexPath--> gaia-validate-work-breakdown-semantic (reads req/index.md)
                                     +--reqIndexPath+specIndexPath--> gaia-generate-work-breakdown (targeted reads)
                                     +--host-computed excerpt--> per-task worker (only relevant spec/components/*.md)

  User --explicitly runs--> assemble-docs.js [req|spec|wbs|all] --> single-file view(s), on demand (unchanged)
```

### 2.3 Sequence Diagrams

**Gate 1 digest re-check (UC-01), at `pm-phase2.js` entry:**
```
pm-phase2.js -> req-assembler.js (subprocess): assemble req/ -> stdout (in-memory only)
pm-phase2.js -> tech-spec-assembler.js (subprocess): assemble spec/ -> stdout (in-memory only)
pm-phase2.js: currentDigest = hash(assembledRequirements + NUL + assembledTechSpec)
pm-phase2.js: compare against Approvals.md's recorded Docs Digest (unchanged logic)
```
A legacy feature (no `req/`/`spec/`) instead reads the existing monolithic files directly, as before.

**Skeleton/validation script call sites (UC-01), at `pm-phase2.js` entry and after skeleton generation:**
```
pm-phase2.js -> wb-skeleton-check.js (subprocess): args = [indexPath, reqIndexPath]
pm-phase2.js -> wb-validate.js (subprocess): args = [wbsDir, reqIndexPath]
pm-phase2.js -> ac-task-matrix.js (subprocess): args = [wbsDir, reqIndexPath, specIndexPath, prefix, featureDir]
ac-task-matrix.js -> writes: {featureDir}/coverage-matrix/index.json, {featureDir}/coverage-matrix/index.md
```
(`wb-skeleton-check.js`/`wb-validate.js` are unchanged internally — `parseAcTable()` already parses
the split index file correctly; only the argument value changes from an assembled file path.
`ac-task-matrix.js` gains the explicit 5th `featureDir` argument and writes both files into a new
`coverage-matrix/` subfolder under it, instead of one `{PREFIX}-AC-Task-Matrix.md` at
`path.dirname(reqIndexPath)` — see Risks and `ac-task-matrix.js`'s own component.)

**Semantic validation (UC-02):**
```
pm-phase2.js -> gaia-validate-work-breakdown-semantic (worker): prompt = `${wbsDir}\n${reqIndexPath}`
gaia-validate-work-breakdown-semantic -> Read(req/index.md): Use Cases/Business Rules/AC tables
gaia-validate-work-breakdown-semantic -> pm-phase2.js: {valid, findings}
```

**Skeleton generation (UC-03):**
```
pm-phase2.js -> gaia-generate-work-breakdown (worker): prompt = featurePath  (unchanged call shape)
gaia-generate-work-breakdown -> Read(req/index.md), Read(spec/index.md)
gaia-generate-work-breakdown -> Read(req/use-cases/{UC}.md) / Read(spec/components/{slug}.md)   -- only as needed
gaia-generate-work-breakdown -> pm-phase2.js: skeleton JSON (unchanged schema)
```

**Per-task Tech-Spec excerpt (UC-04), per task:**
```
pm-phase2.js: components = parseComponentsTable(specIndexContent)   -- reused from tech-spec-assembler.js
pm-phase2.js: relevantFiles = components whose Addresses ∩ task.acceptanceCriteria ≠ ∅
pm-phase2.js: techSpecExcerpt =
    relevantFiles.length
      ? relevantFiles.map(c => `### ${c.filePath}\n\n${readComponentBody(c)}`).join('\n\n')
      : "_No component's Addresses column cites this task's Acceptance Criteria — full Components table below._\n\n" + componentsTableText
pm-phase2.js -> gaia-generate-work-breakdown-task (worker): prompt = buildTaskPrompt(index, taskId, techSpecExcerpt)
```

## 3. Backend

### src/claude/workflows/pm-phase2.js

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

### src/claude/scripts/ac-task-matrix.js

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

### src/claude/agents/gaia-validate-work-breakdown-semantic.md

## Service Interface

```markdown
<!-- BEFORE -->
2. `{PREFIX}-Requirements.md` — User Story descriptions and Acceptance Criteria text
...
Use `Read` to load both files. Do not write any files. Do not produce any output other than the
single JSON object described above.

<!-- AFTER -->
2. `req/index.md` — User Story descriptions and Acceptance Criteria text (the split Requirements
   index; a legacy feature with no `req/` directory instead has `{PREFIX}-Requirements.md` — use
   whichever one the host actually gave you, named in the prompt)
...
Use `Read` to load both files. Do not write any files. Do not produce any output other than the
single JSON object described above.
```

`pm-phase2.js`'s own dispatch call changes its prompt from `` `${wbsDir}\n${file('Requirements.md')}` ``
to `` `${wbsDir}\n${reqIndexPath}` `` — `reqIndexPath` already resolves to the legacy monolithic path
for a feature with no `req/` directory, so the agent's own instructions above cover both cases by
just "Read whatever path the prompt names", without needing to special-case legacy features itself.

### src/claude/agents/gaia-generate-work-breakdown.md

## Service Interface

```markdown
<!-- BEFORE -->
### Step 1 — Load and Cross-Reference

1. Read `{PREFIX}-Requirements.md` fully — extract all Use Cases (UC-XX), acceptance criteria
   (AC-XX), business rules (BR-XX), NFRs
2. Read `{PREFIX}-Tech-Spec.md` fully — extract architecture, file inventory, implementation
   order, data model, API endpoints, frontend components

<!-- AFTER -->
### Step 1 — Load and Cross-Reference

1. Check whether `req/index.md` exists (the split Requirements format, FTR-021). If it does:
   - Read `req/index.md` fully — it already contains the full Use Cases index table, all Business
     Rules, all Acceptance Criteria, and all NFRs (FTR-021 kept these feature-wide, not per-UC)
   - For any UC whose own full flow description you need beyond the index's short Title/Actor
     summary, Read `req/use-cases/{UC-ID}.md` directly
   If `req/index.md` does not exist (a legacy feature), Read `{PREFIX}-Requirements.md` fully instead
   — extract the same information from the monolithic file.
2. Check whether `spec/index.md` exists (the split Tech-Spec format, FTR-024). If it does:
   - Read `spec/index.md` fully — it already contains Architecture, Section 9's complete File
     Inventory/Components table (with Domain/Addresses routing), Implementation Order, and Risks
   - For any component whose own Backend/Frontend/design detail you need beyond the Components
     table's one-line Purpose/Addresses summary, Read `spec/components/{file-slug}.md` directly —
     the `Spec` column in Section 9's table gives you the exact path
   - If, after reading the index, you cannot determine from its own summary tables which per-item
     files are relevant to a given phase/task decision, fall back to reading every file under
     `spec/components/` rather than proceeding with incomplete context
   If `spec/index.md` does not exist (a legacy feature), Read `{PREFIX}-Tech-Spec.md` fully instead
   — extract the same information from the monolithic file.
```

Steps 2 onward (Derive User Stories from Use Cases, and everything after) are unchanged — they
already operate on the *extracted information*, not on which file it came from.

### src/claude/agents/gaia-generate-work-breakdown-task.md

## Service Interface

```markdown
<!-- BEFORE -->
2. **The relevant Tech-Spec excerpt** for this task's domain (not the whole Tech-Spec — keeps this
   call small, which is the whole point of the per-task split).

<!-- AFTER -->
2. **The relevant Tech-Spec excerpt** for this task's own Acceptance Criteria (matched by the host
   against each component's `Addresses` column in `spec/index.md` — not the whole Tech-Spec, which
   is the whole point of the per-task split). If no component's `Addresses` column cites any of this
   task's Acceptance Criteria, you instead receive the full Components table from `spec/index.md` as
   a fallback — in that case, use your own judgment about which listed component(s) are actually
   relevant, the same way you would if asked to work from the full Tech-Spec directly.
```

No other section changes — Steps/Output/constraints already operate on "the given Tech-Spec excerpt"
as an opaque input, regardless of how it was selected.

## 4. Frontend

_No components in this category._

## 5. External Integrations

### tests/ac-task-matrix.test.js

## Algorithm

```js
describe('ac-task-matrix.js CLI — coverage-matrix/ output', () => {
  test('writes coverage-matrix/index.json and index.md under the given featureDir', () => {
    const { stdout } = runCli([wbsPath, requirementsPath, techSpecPath, prefix, featureDir])
    const { jsonPath, mdPath } = JSON.parse(stdout)
    expect(jsonPath).toBe(path.join(featureDir, 'coverage-matrix', 'index.json'))
    expect(mdPath).toBe(path.join(featureDir, 'coverage-matrix', 'index.md'))
    expect(fs.existsSync(jsonPath)).toBe(true)
    expect(fs.existsSync(mdPath)).toBe(true)
  })

  test('creates the coverage-matrix/ subfolder when it does not already exist', () => {
    const freshFeatureDir = makeTempFeatureDir() // no coverage-matrix/ yet
    runCli([wbsPath, requirementsPath, techSpecPath, prefix, freshFeatureDir])
    expect(fs.existsSync(path.join(freshFeatureDir, 'coverage-matrix'))).toBe(true)
  })

  test('index.json matches buildMatrixJson()\\'s own shape', () => {
    const { acMap, coverage, techSpecCoverage } = buildKnownFixture() // existing helper
    const expected = buildMatrixJson(prefix, acMap, coverage, techSpecCoverage)
    runCli([wbsPath, requirementsPath, techSpecPath, prefix, featureDir])
    const written = JSON.parse(fs.readFileSync(path.join(featureDir, 'coverage-matrix', 'index.json'), 'utf8'))
    expect(written.acceptanceCriteria).toEqual(expected.acceptanceCriteria)
  })

  test('index.md contains the Must-AC coverage summary and a link to index.json', () => {
    runCli([wbsPath, requirementsPath, techSpecPath, prefix, featureDir])
    const md = fs.readFileSync(path.join(featureDir, 'coverage-matrix', 'index.md'), 'utf8')
    expect(md).toMatch(/\*\*Must-AC coverage:\*\* \d+\/\d+ covered/)
    expect(md).toContain('[index.json](index.json)')
  })

  test('exits 1 with a usage message when featureDir is omitted', () => {
    const { exitCode, stderr } = runCli([wbsPath, requirementsPath, techSpecPath, prefix])
    expect(exitCode).toBe(1)
    expect(stderr).toContain('Usage:')
  })
})
```

Existing tests that asserted the old single-file `{prefix}-AC-Task-Matrix.md` output path (e.g. at
`path.dirname(requirementsPath)`) are updated in place to the new dual-output shape above, not left
alongside it.

### tests/integration/workflow-runtime.test.js

## Algorithm

Test additions, grouped by what they assert:

1. **Gate 1 digest parity:** build a real `req/`+`spec/` fixture, run `pm-phase1`'s own digest
   computation and `pm-phase2`'s new in-memory recomputation against the identical fixture, assert
   equal hashes — same "digest parity" assertion style FTR-025's own Risk #1 mitigation already
   established for the bridge step it replaces.
2. **Script call-site arguments:** spy on `c.command()` (same mock-dispatch mechanism already used
   throughout this file) and assert the `wb-skeleton-check.js`/`wb-validate.js`/`ac-task-matrix.js`
   invocations receive `reqIndexPath`/`specIndexPath` for a real-split fixture, and the legacy
   `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` paths for a legacy fixture.
3. **Semantic validator prompt:** assert the mock dispatch for
   `gaia.agent.planner.validate-work-breakdown` receives `reqIndexPath` as the prompt's second line.
4. **Per-task excerpt — matched case:** a task whose `acceptanceCriteria` includes an AC cited by
   exactly one component's `Addresses` column receives a prompt whose Tech-Spec section contains
   only that component's own body, not any other component's.
5. **Per-task excerpt — fallback case:** a task whose `acceptanceCriteria` matches no component's
   `Addresses` column receives the full Section 9 Components table as its Tech-Spec section instead
   of an empty one.
6. **Bridge step removed:** assert `'bridge-requirements-tech-spec'` no longer appears in
   `c.tokenLedger`'s activity-name list for a real-split-source run, and that no
   `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` file is written to the fixture's feature
   directory by `pm-phase2` at all.
7. **Legacy fallback, end to end:** a feature fixture with monolithic files only, no `req/`/`spec/`,
   still completes `pm-phase2` successfully, with every one of the above call sites receiving the
   legacy monolithic path, unchanged from pre-FTR-026 behavior.

## 6. Security Considerations

None — internal toolkit workflow change, no new external surface, no new input validation boundary.
The per-task excerpt computation reads only files already inside the feature's own `spec/` folder,
same trust boundary as every other script in `src/claude/scripts/`.

## 7. Database Changes

None.

## 8. Configuration

None — no new environment variables, app settings, or feature flags.

## 9. File Inventory

### New files
| Path | Purpose-or-Change | Addresses |
|---|---|---|


### Modified files
| Path | Purpose-or-Change | Addresses |
|---|---|---|
| src/claude/workflows/pm-phase2.js | Repoint Gate 1 digest re-check, `wb-skeleton-check.js`/`wb-validate.js`/`ac-task-matrix.js` call sites to split index paths; add host-computed per-task Tech-Spec excerpt (Addresses-column matching); remove the `bridge-requirements-tech-spec` activity entirely | AC-01, AC-02, AC-03, AC-06, AC-09 |
| src/claude/scripts/ac-task-matrix.js | Add an explicit `featureDir` 5th CLI argument; write both a machine-readable `coverage-matrix/index.json` and a human-readable `coverage-matrix/index.md` (with summary add-ons) under it, replacing the single loose `{PREFIX}-AC-Task-Matrix.md` whose location would otherwise silently move once its Requirements argument becomes `reqIndexPath` | AC-03, AC-10 |
| src/claude/agents/gaia-validate-work-breakdown-semantic.md | Read `req/index.md` instead of `{PREFIX}-Requirements.md` | AC-04, AC-09 |
| src/claude/agents/gaia-generate-work-breakdown.md | Read `req/index.md`+`spec/index.md` as primary entry points; drill into per-item files only as needed, with a full-directory-scan fallback if the index alone is insufficient | AC-05, AC-09 |
| src/claude/agents/gaia-generate-work-breakdown-task.md | Document that the Tech-Spec input it receives is now a host-computed excerpt (relevant component(s) only, or the full Components table as a fallback), not the full assembled Tech-Spec | AC-06, AC-09 |
| tests/ac-task-matrix.test.js | New test(s) for the `coverage-matrix/index.json`+`index.md` dual output under the given `featureDir` | AC-03, AC-10 |
| tests/integration/workflow-runtime.test.js | New/updated tests for every repointed call site, the host-computed per-task excerpt (matched and fallback cases), removal of the bridge step, and the legacy-fallback path for each | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09 |

## 10. Testing Strategy

### src/claude/workflows/pm-phase2.js

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

### src/claude/scripts/ac-task-matrix.js

`tests/ac-task-matrix.test.js` (see that file's own component): asserts `buildMatrixJson()`'s shape
against a known `acMap`/`coverage`/`techSpecCoverage` fixture (one entry per AC, correct
`unscoped`/`relatedUCs`/`techSpecFiles`/`taskIds`/`phaseIds`); asserts the CLI creates
`coverage-matrix/` under the given `featureDir` (including when it doesn't exist yet) and writes both
`index.json` (valid JSON, matching `buildMatrixJson`'s output) and `index.md` (containing the new
Must-AC coverage summary line and a link to `index.json`); asserts the CLI exits 1 with a usage
message when `featureDir` is omitted.

### src/claude/agents/gaia-validate-work-breakdown-semantic.md

`tests/integration/workflow-runtime.test.js` (see that file's own component): the mock dispatch for
`gaia.agent.planner.validate-work-breakdown` asserts the received prompt's second line is
`reqIndexPath` (the split index path) for a real-split-source feature, and the existing monolithic
path for a legacy feature — no test depends on the agent's own internal Read instructions beyond that
(same "mock dispatch, assert prompt contents" convention used throughout this test suite for every
other worker call).

### src/claude/agents/gaia-generate-work-breakdown.md

`tests/integration/workflow-runtime.test.js` (see that file's own component): since
`gaia.agent.planner.work-breakdown`'s own dispatch call in `pm-phase2.js` is unchanged (still just
`featurePath` as the prompt — this component doesn't change the call site, only the agent's own
internal instructions), no new mock-dispatch assertion is needed for the call site itself; this
component's own correctness is covered by the agent's prompt-content review during Gate 1/Gate 2 of
FTR-026's own implementation, same convention used for every other agent-prompt-only change in this
toolkit's lineage (e.g. `gaia-validate-feature-docs.md`'s FTR-025 rewrite had no dedicated unit test
either, for the same reason: a prompt file's own wording isn't exercised by the mocked test suite,
only the shape of what's dispatched to it is).

### src/claude/agents/gaia-generate-work-breakdown-task.md

`tests/integration/workflow-runtime.test.js` (see `pm-phase2.js`'s own component, which is where the
excerpt is actually computed and asserted): the mock dispatch for
`gaia.agent.planner.work-breakdown-task` asserts the received prompt's Tech-Spec section contains
only the matched component's content for a task whose `acceptanceCriteria` matches, and the full
Components table for a task whose `acceptanceCriteria` matches none — no dedicated test for this
agent file itself, same convention as `gaia-generate-work-breakdown.md`'s own component (a prompt
file's wording isn't exercised by the mocked test suite, only the shape of what's dispatched to it).

### tests/ac-task-matrix.test.js

This component *is* the test file — no further test file covers it.

### tests/integration/workflow-runtime.test.js

This component *is* the test file — no further test file covers it. Existing FTR-025-era tests whose
assertions this feature's changes make obsolete (e.g. any assertion that
`file('Requirements.md')`/`file('Tech-Spec.md')` is passed to `wb-skeleton-check.js`/`wb-validate.js`/
`ac-task-matrix.js` for a real-split-source fixture, or that the `bridge-requirements-tech-spec`
activity exists at all) are updated in place, not left alongside the new ones, to avoid two
contradictory assertions coexisting in the suite.

## 11. Implementation Order

1. `src/claude/scripts/ac-task-matrix.js` — depends on: nothing (additive, backward-compatible CLI
   argument)
2. `src/claude/workflows/pm-phase2.js` — depends on: 1 (its repointed `ac-task-matrix.js` call site
   passes the new required `featureDir` argument)
3. `src/claude/agents/gaia-validate-work-breakdown-semantic.md` — depends on: 2 (its dispatch
   call's prompt/path argument comes from `pm-phase2.js`)
4. `src/claude/agents/gaia-generate-work-breakdown.md` — depends on: nothing (its own dispatch call
   shape — just `featurePath` — is unchanged; only the agent's own internal Read instructions change)
5. `src/claude/agents/gaia-generate-work-breakdown-task.md` — depends on: 2 (the excerpt it receives
   is computed in `pm-phase2.js`)
6. `tests/ac-task-matrix.test.js` — depends on: 1
7. `tests/integration/workflow-runtime.test.js` — depends on: 2, 3, 4, 5

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| The host-computed Addresses-based file matching for a task's Tech-Spec excerpt finds zero relevant components (e.g. a purely organizational/glue task whose `acceptanceCriteria` cites an AC no component's Addresses column mentions) | The per-task worker gets insufficient Tech-Spec context | BR-05's explicit fallback: fall back to `spec/index.md`'s full Components table rather than an empty excerpt — never zero context |
| `pm-phase2.js`'s in-memory Gate 1 digest recomputation silently diverges from `pm-phase1.js`'s own assembly if either's subprocess invocation changes independently in the future | False "stale approval" failures, or a digest mismatch that blocks Gate 2 for no real reason | Both reuse the exact same `req-assembler.js`/`tech-spec-assembler.js` subprocess calls, unmodified, with the same arguments shape — same mitigation pattern FTR-025 already established and tested (digest-parity assertion) |
| Removing the `bridge-requirements-tech-spec` activity changes `pm-phase2.js`'s own token-ledger activity list | Any future reporting/ledger code assuming that activity name exists would break | Confirmed by `grep` that no other file in the repository references `'bridge-requirements-tech-spec'` by name — safe to remove outright |
| `gaia-generate-work-breakdown.md`'s new targeted-read pattern costs more total tokens than today's two full-file reads, for a feature with many small per-item files each requiring its own Read call | Net token increase instead of the intended reduction, for an edge-case feature shape | Accepted as a qualitative judgment, not empirically measured (no existing test infrastructure meters real agent token cost — `c.worker()` dispatch is mocked throughout the test suite, same limitation FTR-025 operated under); the index files alone (Use Cases/Components summary tables) are expected to be sufficient for most phase/task decisions without further per-item reads, since that is exactly what FTR-020/FTR-021/FTR-024 designed them to summarize |
| `ac-task-matrix.js`'s output path is derived from `path.dirname(requirementsPath)` — blindly repointing its Requirements argument to `reqIndexPath` (AC-03) would silently relocate `{PREFIX}-AC-Task-Matrix.md` from the feature root into `req/`, found by actually running the script with the intended arguments during this feature's own Tech-Spec validation, not by inspection alone | A Gate 2 artifact a user/downstream tooling expects at the feature root would silently move, breaking anything that reads `gate2_payload.ac_task_matrix_path` or assumes the old location | `ac-task-matrix.js`'s output is redesigned (AC-10, requested directly): a required `featureDir` 5th CLI argument, writing `coverage-matrix/index.json`+`index.md` under it, with `pm-phase2.js` updated to read both new paths and expose them as `ac_task_matrix_json_path`/`ac_task_matrix_md_path` — verified by actually re-running the script end to end against this feature's own fixtures, not just by code review |
| `coverage-matrix/index.json`'s new `generatedAt` timestamp field makes repeated runs non-byte-identical (the `index.md` summary line itself has no timestamp, so this is JSON-only) | A naive test comparing two runs' `index.json` output verbatim would flake | Normalize/strip `generatedAt` before any equality assertion — same precedent `assemble-docs.test.js` already established for `wb-render.js`'s own "Generated" timestamp field |

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Exact mechanism for giving the per-task detail worker only the Tech-Spec content it needs | **Resolved** | Host-computed, not agent-self-navigated: `pm-phase2.js` reuses `tech-spec-assembler.js`'s own `parseComponentsTable()` to get each component's `Addresses` (AC IDs) list, then for a given task includes only the component(s) whose `Addresses` intersects that task's own `acceptanceCriteria` — deterministic, reuses already-existing parsing, no new LLM judgment call, consistent with the project's "host computes anything mechanically derivable" principle. Falls back to the full Components table (not zero content) when the intersection is empty (BR-05) |
| 2 | Whether the Gate 1 digest recomputation should be its own named `c.activity()` or inline | **Resolved** | Inline, not a separate `c.activity()` — unlike FTR-025's bridge step (which performed real file I/O worth tracking in the ledger/evidence trail), this is a pure re-derivation of a value already computed once per Gate 1 cycle by `pm-phase1.js`; no new activity boundary adds meaningful evidence value here |
| 3 | Token-cost comparison for `gaia-generate-work-breakdown.md`'s targeted-read approach vs. today's two full-file reads | **Resolved (qualitative)** | No dedicated token-metering test exists or is added (see Risks row above) — accepted as a reasoned design judgment rather than an empirically measured one, consistent with the limits of the existing test infrastructure |

## Dependencies and Assumptions

- FTR-020/FTR-021/FTR-024/FTR-025 (available): the split-generation architecture, assemblers, and
  the `bridge-requirements-tech-spec` step this feature removes, all reused/modified as described.
- `tech-spec-assembler.js`'s `parseComponentsTable()` is reused, unmodified, to build the
  Addresses-to-component matching used for the per-task excerpt.
- `lib/workflow-control.js`'s `worker()`/`c.command()`/`c.hash()` contracts are fixed.
- `npm test` is the only verification command; no separate build step exists.
