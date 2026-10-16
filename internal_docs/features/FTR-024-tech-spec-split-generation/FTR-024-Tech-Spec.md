# FTR-024 — Technical Specification

## 1. Baseline

- Branch: `develop`. `gaia-generate-tech-spec.md` is a haiku agent (`tools: Read, Glob, Grep`, no
  Write) whose entire response is the 12-section document content, persisted verbatim by
  `pm-phase1.js`'s `c.worker()` single declared output. The 12 numbered sections: 1 Overview,
  2 Architecture, 3 Backend, 4 Frontend, 5 External Integrations, 6 Security Considerations,
  7 Database Changes, 8 Configuration, 9 File Inventory (New files / Modified files, each gained
  an `Addresses` column in FTR-023), 10 Testing Strategy, 11 Implementation Order,
  12 Risks & Mitigations.
- `req-assembler.js`'s `findSectionRange`/`parseTableRows` (exported since FTR-023) are the direct
  template for `tech-spec-assembler.js`. **Not modified.**
- `tech-spec-graph-checks.js`'s `parseFileInventoryEntries`/`checkAddressesResolve` (FTR-023) are
  the structural pre-check this feature reuses against the skeleton. **Not modified** — see
  OQ-2's empirical verification below.
- `lib/workflow-runner.js` runs `pm-phase1.js` with no `require()` in scope; any new script logic
  must be invoked via `c.command(['run-asset', ...])`.

## 2. Resolution of Open Questions

### OQ-1 (feature.md): exact section-to-skeleton/component mapping against the real 12-section template

**Decision, re-validated against the real template (not assumed from the worked example's own
simplified Tech-Spec):**

- **Skeleton (`spec/index.md`), feature-wide:** Section 1 (Overview), Section 2 (Architecture —
  System Context/Component Diagram/Sequence Diagrams all describe the whole system, not one
  file), Section 6 (Security Considerations), Section 7 (Database Changes), Section 8
  (Configuration), Section 11 (Implementation Order — inherently a cross-component sequencing,
  not owned by one file), Section 12 (Risks & Mitigations), plus Section 9's Components index
  table.
- **Per-component (`spec/components/{fileSlug}.md`):** Section 3 (Backend) and Section 4
  (Frontend) subsections' content, as they apply to that one file; Section 5 (External
  Integrations) content owned by that file; **all** of Section 10 (Testing Strategy) — confirmed
  by the FTR-020 worked example's own empirical finding ("every test-plan bullet already named
  exactly one component's own test file") and re-confirmed here as still true against the real
  template (its Testing Strategy guidance — "unit test coverage targets, integration test
  scenarios, manual verification steps" — names no feature-wide test concept that isn't already
  reducible to a specific file's own tests).
- **New field needed to reconstruct Sections 3/4/10 from per-component content (not present in
  the worked example, because its own simplified Tech-Spec never had real 3/4 subsections to
  reconcile):** the skeleton's Components table gains a `Domain` column — reusing the Work
  Breakdown's own existing `BE | FE | DB | DevOps | INFRA | TEST` enum, no new taxonomy invented.
  The assembler (§4) uses it to route each component's own detail content into Section 3 (`BE`),
  Section 4 (`FE`), or Section 5 (anything else — `DB`/`DevOps`/`INFRA`, an MVP simplification;
  see §7 Deferred). Section 10 is always built from every component's own `Tests` subsection,
  regardless of `Domain`.

### OQ-2 (feature.md): does `tech-spec-graph-checks.js` need modification to run against the skeleton?

**Decision: no modification — verified empirically, not assumed.** Ran
`parseFileInventoryEntries`/`checkAddressesResolve` directly against a hand-built 4-column
skeleton table (`Path | Purpose | Addresses | Spec`, the extra `Spec` column appended after
`Addresses`):

```
$ node -e "... parseFileInventoryEntries(skeletonWith4Columns) ..."
[
  { "filePath": "src/foo.js", "acIds": ["AC-01", "AC-02"] },
  { "filePath": "src/baz.js", "acIds": [] }
]
```

Both entries parse correctly (`filePath` from `cells[0]`, `acIds` from `cells[2]`) — the parser
reads positionally, not by column count, so the appended `Spec` column (and the new `Domain`
column from OQ-1, inserted between `Addresses` and `Spec`) are both silently ignored without
any code change. `tech-spec-graph-checks.js`'s only new touch point is a second call site (in
`pm-phase1.js`, pointed at `spec/index.md` instead of the assembled document) — the module
itself is untouched.

### OQ-3 (feature.md): file-slug naming convention

**Decision:** `fileSlug` = the component's basename with its original extension kept, e.g.
`src/claude/scripts/wb-render.js` → `wb-render.js.md` (not `wb-render.md` — keeping the real
extension visible reduces, though does not eliminate, collisions between same-named files of
different types). Collision handling is **host-computed, not model-decided** (the same principle
WB's `materializeIndex` already applies to `detailFile`/`status`): when materializing the
skeleton, the coordinator checks for duplicate `fileSlug` values across the whole Components
list; for any collision, it deterministically disambiguates by prepending path segments
(right-to-left, one at a time) until unique, e.g. two files both named `index.js` in different
directories become `scripts-index.js.md` and `agents-index.js.md`. This never requires
regenerating the skeleton — it is a pure post-processing step over data the skeleton call
already returned.

## 3. New and Modified Files

| File | Change |
|---|---|
| `src/claude/agents/gaia-generate-tech-spec.md` | **Modified.** Output Structure keeps Sections 1, 2, 6, 7, 8, 11, 12 verbatim; Section 9's two tables gain a `Domain` column (`BE \| FE \| DB \| DevOps \| INFRA \| TEST`) between `Purpose-or-Change` and `Addresses`, and a `Spec` column after `Addresses`. Sections 3, 4, 5, 10 are removed from this agent's own output — Process step updated to describe the reduced, skeleton-only scope. |
| `src/claude/agents/gaia-generate-tech-spec-component.md` | **New.** One-component-scoped haiku agent: input is one component's index-table row + the compact full component index + the relevant Requirements/feature.md excerpt; output is that component's `Change`/Algorithm-or-Schema/`Tests` detail, in the `component-template.md` shape already proven by the FTR-020 worked example. No Write tool. |
| `src/claude/scripts/tech-spec-assembler.js` | **New.** Exports `loadTechSpec(inputPath)`: file input returns content unchanged (legacy path); directory input reads `spec/index.md`, parses the Components table (reusing `tech-spec-graph-checks.js`'s `parseFileInventoryEntries`-adjacent logic, extended locally to also read `Domain`/`Spec`), reads each component file, and reconstructs the 12-section document per OQ-1's routing rules. CLI entry point. |
| `src/claude/workflows/pm-phase1.js` | **Modified.** Tech-Spec generation (currently the single `techSpec()` binding and its two call sites) replaced with a `generateTechSpec(forceAll)` function mirroring `generateRequirements`'s exact shape (FTR-021): skeleton call → structural pre-check (reused `tech-spec-graph-checks.js`, pointed at `spec/index.md`) → per-component loop with resume-by-existence (+ `fileSlug` collision disambiguation) → assembly via `tech-spec-assembler.js` → unchanged downstream. |

## 4. `tech-spec-assembler.js`

```js
#!/usr/bin/env node
'use strict'
const fs = require('fs')
const path = require('path')
const { findSectionRange, parseTableRows } = require('./req-assembler')

const SECTION_BY_DOMAIN = { BE: 3, FE: 4 } // anything else routes to 5 (External Integrations)

function parseComponentsTable(indexContent) {
  const { start, end, lines } = findSectionRange(indexContent, 9)
  const entries = []
  // changeType ('New'/'Modified') must come from WHICH table a row was found in, not from the
  // "Purpose-or-Change" column's own text (free-text, e.g. "does backend stuff" — never
  // literally the word "New"). Found only by assembling a real hand-built fixture: an earlier
  // draft derived changeType from that column's content and every row silently landed under
  // "Modified" in the rebuilt Section 9.
  for (const [heading, changeType] of [['New files', 'New'], ['Modified files', 'Modified']]) {
    const sub = findSubsectionRange(lines, start, end, heading) // same helper as tech-spec-graph-checks.js
    if (!sub) continue
    for (const cells of parseTableRows(lines, sub.start, sub.end)) {
      const [filePath, purposeOrChange, domain, addresses, specLink] = cells
      const fileSlug = specLink.match(/\(components\/([^)]+)\)/)[1]
      entries.push({ filePath, purposeOrChange, changeType, domain, addresses, fileSlug })
    }
  }
  return entries
}

function loadTechSpec(inputPath) {
  const stat = fs.statSync(inputPath, { throwIfNoEntry: false })
  if (!stat) throw new AssemblyError(`path does not exist: ${inputPath}`)
  if (stat.isFile()) return fs.readFileSync(inputPath, 'utf8') // legacy path

  const indexPath = path.join(inputPath, 'index.md')
  if (!fs.existsSync(indexPath)) throw new AssemblyError(`missing spec/index.md at ${indexPath}`)
  const indexContent = fs.readFileSync(indexPath, 'utf8')
  const components = parseComponentsTable(indexContent)
  if (components.length === 0) throw new AssemblyError('spec/index.md has no rows in its Components table')

  const detailByPath = {}
  for (const c of components) {
    const compPath = path.join(inputPath, 'components', c.fileSlug)
    if (!fs.existsSync(compPath)) throw new AssemblyError(`component "${c.filePath}" has no detail file at ${compPath}`)
    detailByPath[c.filePath] = parseComponentDetail(fs.readFileSync(compPath, 'utf8')) // { change, body, tests }
  }

  let doc = indexContent
  // Section 9: rebuild from the skeleton's own table — authoritative, not re-derived (BR-01) —
  // just strip the Domain/Spec columns back down to the original 3-column Path|Change|Addresses
  // shape the legacy template already has.
  doc = rewriteSection9(doc, components)
  // Sections 3/4/5: each component's own body, routed by Domain, under a "### {filePath}" subheading.
  for (const sectionNum of [3, 4, 5]) {
    const body = components
      .filter(c => (SECTION_BY_DOMAIN[c.domain] || 5) === sectionNum)
      .map(c => `### ${c.filePath}\n\n${detailByPath[c.filePath].body}`)
      .join('\n\n')
    doc = spliceSectionBody(doc, sectionNum, body || '_No components in this category._')
  }
  // Section 10: every component's own Tests subsection, regardless of Domain.
  const testsBody = components
    .map(c => `### ${c.filePath}\n\n${detailByPath[c.filePath].tests}`)
    .join('\n\n')
  doc = spliceSectionBody(doc, 10, testsBody)
  return doc
}
```

`spliceSectionBody(doc, n, body)` reuses `req-assembler.js`'s `spliceSection2`-style splicing
logic, generalized to any section number (locate `## {n}. ` heading via `findSectionRange`,
replace everything between it and the next `## ` heading). `parseComponentDetail` parses one
component file's `## Change`, the free-form algorithm/schema body, and `## Tests` sections using
the same "contiguous content between headings" convention already used throughout this lineage
— no new parsing primitive invented, only a new application of the existing one.
`findSubsectionRange` is the exact same helper `tech-spec-graph-checks.js` already has (duplicated
locally here rather than imported, since this script needs it for a structurally different
purpose — reading 4/5-column rows, not validating 3-column `Addresses` references — and importing
a function named for a different module's job would be confusing; both are trivial, independently
obvious implementations of the same small idea, same as `wbs-assembler.js` independently
reimplementing `plan.js`'s field-parsing convention rather than importing it, per FTR-020's own
precedent).

`AssemblyError` and `fileSlug` collision disambiguation live in `pm-phase1.js` (skeleton
materialization time, §5) — `tech-spec-assembler.js` only ever reads already-disambiguated,
already-written `fileSlug` values from `spec/index.md`'s own table, it never computes them.

## 5. `pm-phase1.js` Wiring

Mirrors FTR-021's `generateRequirements(forceAll)` shape exactly, substituted for Tech-Spec:

```js
const specDir = `${featureDir}/spec`
const specIndexPath = `${specDir}/index.md`

async function generateTechSpec(forceAll) {
  const skeletonStale = c.exists(specIndexPath) && !fresh(specIndexPath)
  const regenSkeleton = forceAll || skeletonStale || !c.exists(specIndexPath)

  if (regenSkeleton) {
    const skeleton = await c.worker(specId, featurePath)
    // Disambiguate any fileSlug collision (OQ-3) before writing — deterministic, host-computed.
    c.writeOutput(specIndexPath, disambiguateFileSlugs(skeleton))
  }

  await c.activity('tech-spec-ac-check', async () => {
    const res = c.command(['run-asset', 'scripts/tech-spec-graph-checks.js', '--project', c.root,
      '--', specIndexPath, file('Requirements')], [0, 1])
    const parsed = JSON.parse(res.stdout)
    if (typeof parsed.valid !== 'boolean' || !Array.isArray(parsed.errors) ||
        (res.exitCode === 0) !== parsed.valid) throw new Error('Invalid tech-spec-ac-check result')
    if (!parsed.valid) throw new Error('Tech-Spec skeleton failed structural checks: ' + res.stdout)
    return parsed
  })

  const components = parseComponentsTable(c.read(specIndexPath)) // same parser tech-spec-assembler.js exports
  for (const comp of components) {
    const compPath = `${specDir}/components/${comp.fileSlug}`
    if (!regenSkeleton && c.exists(compPath)) continue // resume: skip, no dispatch
    const detail = await c.worker(specComponentId, buildComponentPrompt(comp, components, featurePath),
      { label: `tech-spec-component:${comp.fileSlug}` })
    c.writeOutput(compPath, detail)
  }

  const assembled = c.command(['run-asset', 'scripts/tech-spec-assembler.js', '--project', c.root,
    '--', specDir]).stdout
  c.writeOutput(file('Tech-Spec'), assembled)
}
```

Replaces the existing `techSpec = () => c.worker(specId, featurePath, { outputs: [...] })`
binding and both its call sites (initial generation, and the `needsTechSpecFix` branch — called
as `generateTechSpec(true)` there, same forced-full-regeneration reasoning FTR-021 established for
`generateRequirements`). The existing `tech-spec-ac-check` activity block FTR-023 added is **moved
inside** `generateTechSpec`, now checking the skeleton directly instead of the assembled document
— strictly earlier in the pipeline than before, catching a dangling reference before any
per-component token is spent rather than after the whole document was already generated.

## 6. Legacy Compatibility

A feature whose `{PREFIX}-Tech-Spec.md` already exists as a monolithic file with no `spec/`
directory is never touched by this feature's new code path, for the same reason established in
FTR-021: `generateTechSpec()` only runs when Tech-Spec needs (re)generating at all, and when it
does for such a feature, `specIndexPath` will not exist, so a fresh `spec/` directory is created
going forward — the historical monolithic file is simply overwritten with the freshly-assembled
one, exactly as today's single-call generation already does on a forced/stale regeneration.

## 7. Test Plan (AC-08)

- `tech-spec-assembler.test.js`: `loadTechSpec()` against a hand-built `spec/` directory fixture
  (at least one `BE`, one `FE`, one unclassified/`OTHER`-routed component) — asserts all 12
  sections present, Section 9 reduced back to 3 columns, Sections 3/4/5 populated per `Domain`
  routing, Section 10 containing every component's Tests subsection; the legacy monolithic-file
  path; missing `index.md`; missing a referenced component file; empty Components table — each
  asserting a structured error naming the specific path.
- `tech-spec-graph-checks.regression.test.js` (or extend the existing suite): confirm
  `parseFileInventoryEntries`/`checkAddressesResolve` still pass unmodified against a 4/5-column
  skeleton table (the empirical check from OQ-2, made a permanent regression test, not just a
  one-off manual verification).
- `pm-phase1-spec-resume.test.js` (mirrors FTR-021's `pm-phase1-req-resume.test.js`): a
  pre-seeded `spec/` directory with some component files already present is run through the
  per-component loop with a stubbed dispatch counting invocations; asserts exactly the missing
  components dispatch a call.
- `pm-phase1.regression.test.js` (extend `tests/integration/workflow-runtime.test.js`): the full
  existing Tech-Spec-related pm-phase1 test suite (truncation, `needsTechSpecFix`, `tech-spec-ac-check`
  dangling-reference rejection) re-run against the new skeleton+per-component path — same
  expectation FTR-023's own wiring set, that this will likely require updating the shared mock
  fixtures (`sectionedDoc`/`phase1Dispatch`'s Tech-Spec branch), not just adding new tests.
- `fileSlug` collision test: two components whose basenames collide (e.g. two different
  directories' `index.js`) produce two distinct, deterministically-disambiguated `fileSlug`
  values, both resolvable by the assembler.

**Worked-example fixture:** `internal_docs/features/FTR-020-work-breakdown-split-generation/spec/`
is a real, hand-authored split-format directory (7 components) produced during FTR-020's own
definition — reusable as a starting point for `tech-spec-assembler.test.js`'s fixtures, though it
predates this feature's `Domain`/`Spec` column additions (OQ-1/OQ-3) and the real 12-section
template's exact shape, so it needs updating to match, not copying verbatim the way FTR-020's own
`wbs/` fixture was reused unchanged by FTR-021/022/023.
