# FTR-021 — Technical Specification

## 1. Baseline

- Branch: `develop`. `pm-phase1.js` (`src/claude/workflows/pm-phase1.js`, 93 lines) orchestrates:
  `c.worker('gaia.agent.planner.requirements', featurePath, { outputs: [{ path:
  file('Requirements'), inputs: [featurePath] }] })` → `assertCompleteSections(…, 9)` →
  `c.worker('gaia.agent.planner.tech-spec', …)` → `assertCompleteSections(…, 12)` → up to 3
  cycles of `gaia.agent.planner.validate-feature-docs` with structured
  `needsRequirementsFix`/`needsTechSpecFix` routing → `docsDigest` → Gate 1 payload.
- `gaia-generate-requirements.md` is a haiku agent with `tools: Read, Glob, Grep` (no Write)
  whose entire response is the 9-section document content, persisted verbatim by `c.worker()`'s
  single declared output.
- `lib/workflow-control.js`'s `worker()` enforces exactly one declared output per call; **not
  modified** by this feature.
- `gaia-generate-tech-spec.md`, `gaia-validate-feature-docs.md`, and `gaia-generate-work-breakdown.md`
  all read `{PREFIX}-Requirements.md` as plain text input. **Not modified.**
- `lib/workflow-runner.js` executes every workflow script (including `pm-phase1.js`) via `new
  AsyncFunction('control', 'args', body)(control, parseArgs(args))` — confirmed during FTR-020 to
  have **no `require` in scope**. Any new script logic this feature needs must be invoked via
  `c.command(['run-asset', 'scripts/X.js', '--project', c.root, '--', ...args])`, exactly like
  `wbs-assembler.js`/`wb-skeleton-check.js` already are.

## 2. Resolution of Open Questions

### OQ-1 (feature.md): is file-existence-only resume tracking sufficient?

**Decision:** yes — no sidecar status file. Re-examining FTR-020's own `index.json.tasks[id].status`
field: `pm-phase2.js`'s actual resume predicate is `task.status === 'generated' && c.exists(detailPath)`
— a task is skipped only when **both** hold. A task whose file exists but whose status update did
not persist (a crash between the two `c.writeOutput` calls) is *not* skipped — it is harmlessly
regenerated and overwritten. So in FTR-020's own implementation, `status` never gates correctness
beyond what `c.exists(detailPath)` alone already provides; it only ever adds a redundant,
occasionally-wasteful re-generation avoidance. For `req/`, with no analogous "already-committed
graph" to protect (the use-case index table is immutable once the skeleton call returns — UC-03
cannot introduce new UC IDs, per BR-01), `c.exists(req/use-cases/{UC-ID}.md)` alone is both
necessary and sufficient: a missing file always means "not generated yet," and `c.writeOutput`
writes its full string argument synchronously, so a file that exists is, by construction, complete.
No `req/index.json` or any other sidecar file is introduced.

### OQ-2 (feature.md): self-consistency check — standalone script or inline?

**Decision:** standalone script, `src/claude/scripts/req-graph-checks.js`, exporting four pure
functions — `checkUniqueUcIds`, `checkUcIdFormat`, `checkUcTableFileParity`,
`checkCrossReferencesResolve` (validates every AC `Related UC` and every Business Rule
`Applies to` entry against the UC ID set) — each taking a plain `{ ucIds: string[], acTable: {id,
relatedUc}[], businessRules: {id, appliesTo}[] }` shape and returning an array of error objects,
mirroring `wb-graph-checks.js`'s pure-function, no-I/O convention exactly. A thin CLI wrapper,
`src/claude/scripts/req-skeleton-check.js` (mirroring `wb-skeleton-check.js`), parses
`req/index.md` into that shape and runs all four, printing a JSON report and exiting 0/1/2. This
keeps the checks independently unit-testable without requiring `pm-phase1.js` to `require()`
anything — consistent with §1's runtime constraint — and reuses the same two-file pattern
(pure-checks module + CLI-wrapper script) FTR-020 already established, rather than inventing a
different organization for a structurally identical problem.

### OQ-3 (feature.md): assembler module boundary

**Decision:** one new file, `src/claude/scripts/req-assembler.js`, exporting
`loadRequirements(inputPath)` plus a `require.main === module` CLI entry point that prints the
assembled Markdown to stdout — the same shape as `wbs-assembler.js`'s CLI mode, so `pm-phase1.js`
retrieves the assembled document via `c.command(['run-asset', 'scripts/req-assembler.js',
'--project', c.root, '--', reqDir]).stdout`. Unlike `wbs-assembler.js`, this assembler's job is
textual reassembly (concatenating already-Markdown fragments into the right slots), not
JSON→Markdown rendering — there is no `req-render.js` counterpart, assembly and rendering are the
same step here.

## 3. New and Modified Files

| File | Change |
|---|---|
| `src/claude/scripts/req-graph-checks.js` | **New.** Pure functions for the 4 self-consistency checks (§2, OQ-2). No file I/O, no `process.exit`. |
| `src/claude/scripts/req-skeleton-check.js` | **New.** Standalone CLI: parses `req/index.md`'s use-case table, AC table, and Business Rules table into the plain shape `req-graph-checks.js` expects, runs all 4 checks, prints a JSON report, exits 0 (clean) / 1 (findings) / 2 (parse failure) — mirrors `wb-skeleton-check.js`'s exit-code convention. |
| `src/claude/scripts/req-assembler.js` | **New.** Exports `loadRequirements(inputPath)` (§4): if `inputPath` is a file, returns its content unchanged (legacy path, AC-07). If it is a directory, reads `index.md`, extracts the use-case index table, reads each `use-cases/{UC-ID}.md` in table order, and reconstructs the 9-section document (§4). CLI entry point prints the assembled document to stdout. |
| `src/claude/agents/gaia-generate-requirements.md` | **Modified.** Repurposed to the skeleton pass only: Output Structure keeps Sections 1, 3, 4, 5, 6, 7, 8, 9 verbatim; Section 2 is reduced to the use-case index table only (no per-UC flow content); Process step 5 updated accordingly. |
| `src/claude/agents/gaia-generate-requirements-use-case.md` | **New.** One-UC-scoped haiku agent: input is one UC's index-table row + the compact full use-case index + `feature.md`; output is that UC's Section-2 block (field table + Main/Alternative/Error flows + Postconditions), in the exact format `gaia-generate-requirements` already produces today. No Write tool — host writes the response, same convention as every other `worker()`-dispatched agent. |
| `src/claude/workflows/pm-phase1.js` | **Modified.** Requirements generation (currently lines 36 and 39–44, §5) replaced with: skeleton call → `req-skeleton-check.js` pre-check → per-UC loop with resume-by-existence → assembly via `req-assembler.js` → existing `assertCompleteSections`/Tech-Spec/validation loop, unchanged past that point. |

## 4. `req-assembler.js` — `loadRequirements(inputPath)`

```
function loadRequirements(inputPath):
  if isFile(inputPath):
    return readFile(inputPath)                         // legacy path: unchanged behavior (AC-07)

  indexPath = join(inputPath, 'index.md')
  if !exists(indexPath): throw AssemblyError('missing req/index.md at ' + indexPath)
  indexContent = readFile(indexPath)

  ucTable = parseUseCaseIndexTable(indexContent)        // [{ id, title, actor, priority, file }]
  if ucTable.length === 0: throw AssemblyError('req/index.md has no rows in its Use Cases index table')

  ucBlocks = []
  for row in ucTable:
    ucPath = join(inputPath, row.file)                  // e.g. "use-cases/UC-01.md"
    if !exists(ucPath): throw AssemblyError('use case "' + row.id + '" has no detail file at ' + ucPath)
    ucBlocks.push(readFile(ucPath).trimEnd())

  // Section 2 is the only section whose body is NOT already in indexContent — every other
  // section (1, 3, 4, 5, 6, 7, 8, 9) is copied through unchanged, in the order index.md already
  // has them. Section 2's heading line ("## 2. Use Cases") is kept from index.md; everything
  // between it and the next "## 3." heading in index.md (the use-case index table + its legend)
  // is DROPPED and replaced with the concatenated ucBlocks, separated by a blank line.
  return spliceSection2(indexContent, ucBlocks.join('\n\n'))
```

`spliceSection2` locates `## 2. Use Cases` and the next `## 3. ` heading via the same
`/^## (\d+)\.\s/m` convention `pm-phase1.js`'s `assertCompleteSections` already uses to find
section boundaries — no new heading-detection logic is invented, the existing one is reused for a
second purpose (splice point, not just presence check).

`parseUseCaseIndexTable` reads the Markdown table immediately following the `## 2. Use Cases`
heading (first table found, standard `| … | … |` GFM syntax) into `{ id, title, actor, priority,
file }` rows, deriving `file` from the table's `File` column (a Markdown link
`[use-cases/{UC-ID}.md](use-cases/{UC-ID}.md)` — the path inside the parens is used, not the link
text).

All `isFile`/`exists`/`readFile` failures raise a structured error naming the exact path
(AC-05/NFR-05) — the same error-reporting shape `wbs-assembler.js` already uses for its own
missing-file cases.

`pm-phase1.js`'s Requirements step is changed from a direct `c.worker()` + `c.read(file('Requirements'))`
pair to a skeleton/per-UC/assembly sequence (§5) whose final output is still written to
`file('Requirements')` via `c.writeOutput`, so every consumer downstream of that path — including
`assertCompleteSections` — needs no change.

## 5. `pm-phase1.js` Control Flow (replaces current lines 36, 39–44)

```js
// Deliberately NOT file('req') — same reasoning as FTR-020's wbsDir: this is a directory nested
// inside the feature's own already-prefixed folder, not a standalone artifact needing its own
// prefix.
const reqDir = `${featureDir}/req`
const reqIndexPath = `${reqDir}/index.md`

async function generateRequirements() {
  if (!c.exists(reqIndexPath)) {
    const skeleton = await c.worker(reqId, featurePath)       // no declared output — host writes it
    c.writeOutput(reqIndexPath, skeleton)
  }
  const checkResult = c.command(['run-asset', 'scripts/req-skeleton-check.js',
    '--project', c.root, '--', reqIndexPath], [0, 1])
  if (checkResult.exitCode !== 0) throw new Error('Requirements skeleton failed structural checks: ' + checkResult.stdout)

  const ucTable = parseUseCaseIndexTable(c.read(reqIndexPath))  // same parser req-assembler.js uses
  for (const row of ucTable) {
    const ucPath = `${reqDir}/${row.file}`
    if (c.exists(ucPath)) continue                              // UC-04: resume-by-existence
    const detail = await c.worker(reqUcId, buildUcPrompt(row, ucTable, featurePath), { label: `requirements-use-case:${row.id}` })
    c.writeOutput(ucPath, detail)
  }

  const assembled = c.command(['run-asset', 'scripts/req-assembler.js', '--project', c.root, '--', reqDir]).stdout
  c.writeOutput(file('Requirements'), assembled)
}
```

`generateRequirements()` replaces the body of today's `requirements = () => c.worker(reqId,
featurePath, { outputs: [output('Requirements')] })` — called from the exact same two call sites
(initial generation, and the `needsRequirementsFix` revision branch in the validation cycle),
with no change to the surrounding freshness checks, `assertCompleteSections` call, or the
validation loop itself. `buildUcPrompt`/`parseUseCaseIndexTable` are small new pure helper
functions local to `pm-phase1.js`.

## 6. Legacy Compatibility

A feature whose `{PREFIX}-Requirements.md` already exists as a monolithic file with no `req/`
directory is never migrated or touched by this feature's new code path: `generateRequirements()`
only runs when Requirements needs (re)generating at all (per `pm-phase1.js`'s existing freshness
check), and when it does run for such a feature, `reqIndexPath` will not exist, so the skeleton
call runs and a fresh `req/` directory is created going forward — the feature's historical
monolithic file is simply overwritten with the freshly-assembled one, exactly as today's
single-call generation already overwrites it on a forced/stale regeneration. No feature's
Requirements are read through `req-assembler.js`'s directory branch unless a `req/` directory
already exists for it (AC-07).

## 7. Test Plan (AC-08)

- `req-graph-checks.test.js`: each of the 4 functions, unit-tested against both clean and
  deliberately-broken inputs (duplicate UC ID, malformed UC ID, dangling `Related UC`/`Applies
  to` reference, table/directory mismatch).
- `req-skeleton-check.test.js`: CLI exit-code contract (0/1/2) against a handful of fixture
  `index.md` files, mirroring `wb-skeleton-check.test.js`'s shape.
- `req-assembler.test.js`: `loadRequirements()` against (a) a hand-built `req/` directory fixture
  and (b) an equivalent legacy monolithic file; assert the directory case reproduces the same 9
  sections in the same order, with Section 2 built from the UC files in table order. Also:
  missing `index.md`, missing a referenced UC file, empty use-case table — each asserts a
  structured error naming the specific path (AC-05).
- `pm-phase1-req-resume.test.js`: a `req/` directory with some UC files already present is
  re-run; assert only UC IDs without an existing file dispatch a `worker()` call (mirrors
  FTR-020's `pm-phase2-wbs-resume.test.js` mock/stub-dispatch pattern) (AC-03).
- `pm-phase1.regression.test.js` (extends existing coverage): Requirements generation through the
  new path still produces a document that passes `assertCompleteSections(…, 9)` and preserves the
  existing `docsDigest`/validation-cycle behavior unchanged for a legacy (non-`req/`) feature.

**Worked-example fixture:** `internal_docs/features/FTR-020-work-breakdown-split-generation/req/`
is a real, hand-authored `req/` directory (5 use cases) produced while designing this feature,
already reviewed for structure. It does not include a UI Requirements section (FTR-020 is a
technical/internal feature with nothing to put there) — a second fixture with a non-empty Section
6 should be added to `tests/fixtures/` to exercise that section's round-trip, since the available
worked example alone would not catch a regression specific to that section.
