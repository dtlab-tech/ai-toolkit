# Technical Specification — Split-Only Document Generation with On-Demand Assembly

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-025 |
| Version | 1.0 |
| Date | 2026-10-16 |
| Status | Draft |

## 1. Overview

Stops `pm-phase1.js` from automatically writing `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md`
as a by-product of generation. Every internal gate inside `pm-phase1.js` that currently reads the
assembled file (regen-freshness, truncation, `tech-spec-ac-check`, the Gate 1 validator's input,
`docsDigest`) is repointed at the split index files (`req/index.md`, `spec/index.md`); in-memory
assembly still happens (reusing the existing, unmodified `req-assembler.js`/`tech-spec-assembler.js`),
it is just never persisted. `pm-phase2.js` — whose own unmodified internals (including
`gaia-generate-work-breakdown`, which hard-aborts without the monolithic files) still need them —
transparently regenerates them itself at its own entry, so the end-to-end pipeline keeps working
with zero new required manual steps. A new `assemble-docs.js` script gives a user an explicit,
on-demand way to produce any of the three single-file views (Requirements, Tech-Spec, Work
Breakdown) whenever they actually want one.

## 2. Architecture

### 2.1 System Context

No new system boundary. This feature changes internal data flow inside two existing workflow
scripts (`pm-phase1.js`, `pm-phase2.js`) and two existing agent prompts
(`gaia-validate-feature-docs`, `gaia-generate-tech-spec`), and adds one new standalone CLI script
plus a thin command wrapper.

### 2.2 Component Diagram

```
Before (today):
  pm-phase1.js --writes--> {PREFIX}-Requirements.md / {PREFIX}-Tech-Spec.md
                                |
                                +--read by--> gaia-validate-feature-docs (by convention)
                                +--read by--> docsDigest
                                +--read by--> pm-phase2.js's own internals (unchanged downstream)

After (this feature):
  pm-phase1.js --writes--> req/index.md+use-cases/*.md ; spec/index.md+components/*.md  (only)
                                |
                                +--in-memory assembly (never written)--> inlined into
                                |     gaia-validate-feature-docs' prompt, and docsDigest
                                |
  pm-phase2.js (own entry) --assembles from req/+spec/--> {PREFIX}-Requirements.md / {PREFIX}-Tech-Spec.md
                                |                                (transparent bridge, written to disk)
                                +--unchanged--> wb-skeleton-check.js / wb-validate.js /
                                                ac-task-matrix.js / semantic validator /
                                                gaia-generate-work-breakdown

  User --explicitly runs--> assemble-docs.js [req|spec|wbs|all] --> single-file view(s), on demand
```

### 2.3 Sequence Diagrams

**Gate 1 validation (UC-02), per cycle:**
```
pm-phase1.js -> req-assembler.js (subprocess): assemble req/ -> stdout (in-memory only)
pm-phase1.js -> tech-spec-assembler.js (subprocess): assemble spec/ -> stdout (in-memory only)
pm-phase1.js -> gaia-validate-feature-docs (worker): prompt = featurePath + inlined Requirements
                                                      text + inlined Tech-Spec text + instructions
gaia-validate-feature-docs -> pm-phase1.js: {valid, findings, needsRequirementsFix,
                                             needsTechSpecFix, report}
pm-phase1.js: docsDigest = hash(assembledRequirements + NUL + assembledTechSpec)
```

**pm-phase2 bridge (UC-03), at entry:**
```
pm-phase2.js: reqDir/specDir exist?
  yes -> assemble (same two subprocess calls) -> write {PREFIX}-Requirements.md/{PREFIX}-Tech-Spec.md
  no  -> {PREFIX}-Requirements.md/{PREFIX}-Tech-Spec.md already exist (legacy)? use as-is : error
pm-phase2.js: Gate 1 digest re-check (unchanged logic) against the just-written/legacy files
pm-phase2.js: wb-skeleton-check.js / wb-validate.js / semantic validator / ac-task-matrix.js /
              gaia-generate-work-breakdown (all unchanged, read the bridged files)
```

## 3. Backend

### src/claude/scripts/assemble-docs.js

## Service Interface

```js
#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { loadRequirements, AssemblyError: ReqAssemblyError } = require('./req-assembler')
const { loadTechSpec, AssemblyError: SpecAssemblyError } = require('./tech-spec-assembler')

// loadRequirements()/loadTechSpec() already throw a structured AssemblyError naming the exact
// missing path when the directory doesn't exist (`fs.statSync(inputPath, {throwIfNoEntry:false})`
// returning null) — no separate existence pre-check needed here, it would only duplicate what
// the assembler already does correctly.
function assembleReq(featureDir, prefix) {
  const outPath = path.join(featureDir, `${prefix}-Requirements.md`)
  fs.writeFileSync(outPath, loadRequirements(path.join(featureDir, 'req')))
  return outPath
}

function assembleSpec(featureDir, prefix) {
  const outPath = path.join(featureDir, `${prefix}-Tech-Spec.md`)
  fs.writeFileSync(outPath, loadTechSpec(path.join(featureDir, 'spec')))
  return outPath
}

function assembleWbs(featureDir, prefix) {
  const wbsDir = path.join(featureDir, 'wbs')
  if (!fs.existsSync(wbsDir)) throw new ReqAssemblyError(`wbs/ not found at ${wbsDir}`)
  // wb-render.js is CLI-only (writes {prefix}-Work-Breakdown.md/.csv itself and exits) — shell out,
  // same subprocess convention pm-phase2.js already used for its own (now-removed) automatic call.
  execFileSync('node', [path.join(__dirname, 'wb-render.js'), wbsDir, prefix], { cwd: featureDir })
  return [path.join(featureDir, `${prefix}-Work-Breakdown.md`), path.join(featureDir, `${prefix}-Work-Breakdown.csv`)]
}

const HANDLERS = { req: assembleReq, spec: assembleSpec, wbs: assembleWbs }

if (require.main === module) {
  const [featureDir, prefix, which = 'all'] = process.argv.slice(2)
  if (!featureDir || !prefix) {
    process.stderr.write('Usage: node assemble-docs.js <feature-dir> <prefix> [req|spec|wbs|all]\n')
    process.exit(1)
  }
  const targets = which === 'all' ? Object.keys(HANDLERS) : [which]
  if (!targets.every(t => HANDLERS[t])) {
    process.stderr.write(`Unknown target "${which}" — expected req, spec, wbs, or all\n`)
    process.exit(1)
  }
  try {
    const written = targets.map(t => HANDLERS[t](path.resolve(featureDir), prefix)).flat()
    process.stdout.write(JSON.stringify({ written }) + '\n')
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`)
    process.exit((err instanceof ReqAssemblyError || err instanceof SpecAssemblyError) ? 2 : 1)
  }
}

module.exports = { assembleReq, assembleSpec, assembleWbs }
```

### src/claude/commands/assemble-docs.md

## Component Props

```markdown
---
description: "Assemble Docs — renders the split Requirements/Tech-Spec/Work-Breakdown sources into single combined documents, on demand. Usage: /assemble-docs <feature-slug> [req|spec|wbs|all]"
argument-hint: <feature-slug> [req|spec|wbs|all]
allowed-tools: Bash, Glob, Read
---

Produce an on-demand, single-file view of one or more of this feature's split documents.

Approach:
1. Locate the feature folder under `docs/features/` (match by slug or FTR id) from the first
   argument.
2. Extract the prefix from the folder name (`FTR-025-slug` → `FTR-025`).
3. Determine `which` from the second argument (default `all`).
4. Run: `node .claude/scripts/assemble-docs.js <feature-dir> <prefix> <which>`
5. Report exactly what was written (the script's own JSON `written` array), or surface its error
   message verbatim if it failed — do not retry or guess an alternative path.

This command is a read-only rendering action: it never affects Gate 1/Gate 2, approvals, or any
digest. Running it is always safe, at any point in the pipeline.
```

### src/claude/workflows/pm-phase1.js

## Service Interface

```js
// (1) Inside generateRequirements()/generateTechSpec() — DELETE the final write:
//   const assembled = c.command([...]).stdout
//   c.writeOutput(file('Requirements'), assembled)   <-- removed, no replacement inside this fn
// generateTechSpec() loses its analogous c.writeOutput(file('Tech-Spec'), assembledSpec) the same way.

// (2) Top-level gates — BEFORE:
if (force || !fresh(file('Requirements')) || missingSections(c.read(file('Requirements')), 9).length) {
  await generateRequirements(force)
  if (!c.exists(file('Requirements'))) throw new Error('Requirements output missing')
  assertCompleteSections('Requirements', c.read(file('Requirements')), 9)
  changed = true
}
// AFTER:
if (force || !fresh(reqIndexPath) || missingSections(c.read(reqIndexPath), 9).length) {
  await generateRequirements(force)
  if (!c.exists(reqIndexPath)) throw new Error('Requirements output missing')
  assertCompleteSections('Requirements', c.read(reqIndexPath), 9)
  changed = true
}
// Tech-Spec's analogous gate: fresh(specIndexPath, [featurePath, reqIndexPath]) replaces
// fresh(file('Tech-Spec'), [featurePath, file('Requirements')]); same assertCompleteSections
// swap, reading specIndexPath instead of file('Tech-Spec').

// tech-spec-ac-check's second arg (currently file('Requirements')) becomes reqIndexPath —
// wb-graph-checks.js's parseAcTable needs no change, the AC table already lives in the index.

// (3) New top-level assembly (always runs, never written to disk):
function assembleRequirements() {
  return c.command(['run-asset', 'scripts/req-assembler.js', '--project', c.root, '--', reqDir]).stdout
}
function assembleTechSpec() {
  return c.command(['run-asset', 'scripts/tech-spec-assembler.js', '--project', c.root, '--', specDir]).stdout
}
let assembledRequirements = assembleRequirements()
let assembledTechSpec = assembleTechSpec()

// Validator dispatch — BEFORE: prompt is just featurePath + instructions (agent reads the two
// files itself, by convention). AFTER:
const result = await c.worker(valId,
  `${featurePath}\n\nRequirements:\n${assembledRequirements}\n\nTech-Spec:\n${assembledTechSpec}\n\n` +
  'Validate only; the host owns the revision loop. Return valid, a findings array ' +
  '(one string per remaining gap), needsRequirementsFix/needsTechSpecFix (true only if at least ' +
  'one finding implicates that document), and the full validation report content. Do not ' +
  'dispatch other agents.',
  { label: `validation:${cycle}`,
    outputs: [output('Validation-Report', [featurePath, reqIndexPath, specIndexPath])],
    schema: { /* unchanged */ } })

// After a fix cycle, re-assemble whichever document was regenerated, before the next cycle's prompt:
if (result.needsRequirementsFix) { await generateRequirements(true); assembledRequirements = assembleRequirements() }
if (result.needsTechSpecFix) { await generateTechSpec(true); assembledTechSpec = assembleTechSpec() }

// docsDigest — BEFORE: c.hash(c.read(file('Requirements')) + '\u0000' + c.read(file('Tech-Spec')))
// AFTER (same meaning, no file read):
const docsDigest = c.hash(assembledRequirements + '\u0000' + assembledTechSpec)

// Returned result paths — BEFORE: requirements.path = file('Requirements'), tech_spec.path = file('Tech-Spec')
// AFTER: point at the real, always-on-disk split index files:
return {
  // ...
  requirements: { path: reqIndexPath, summary: 'Requirements ready (split; req/index.md + req/use-cases/*.md)' },
  tech_spec: { path: specIndexPath, summary: 'Tech-Spec ready (split; spec/index.md + spec/components/*.md)' },
  // ... validation, docs_digest unchanged in shape
}
```

### src/claude/workflows/pm-phase2.js

## Service Interface

```js
// (1) New bridge step — inserted before the existing Gate 1 approval check:
const reqDir = `${featureDir}/req`, specDir = `${featureDir}/spec`
await c.activity('bridge-requirements-tech-spec', async () => {
  if (!c.exists(reqDir) && !c.exists(specDir)) return { bridged: false, reason: 'legacy (no split sources)' }
  const assembledRequirements = c.command(['run-asset', 'scripts/req-assembler.js',
    '--project', c.root, '--', reqDir]).stdout
  const assembledTechSpec = c.command(['run-asset', 'scripts/tech-spec-assembler.js',
    '--project', c.root, '--', specDir]).stdout
  c.writeOutput(file('Requirements.md'), assembledRequirements)
  c.writeOutput(file('Tech-Spec.md'), assembledTechSpec)
  return { bridged: true }
})
// Existing Gate 1 approval check (UNCHANGED): reads Approvals.md, extracts the Gate 1 row and
// Docs Digest, re-hashes file('Requirements.md')+file('Tech-Spec.md') (now just-written above, or
// the pre-existing legacy files if the bridge step no-op'd) and compares — byte-identical logic,
// byte-identical digest, since both phases hash the same deterministic assembly of the same
// unchanged split sources.

// (2) Removed entirely:
//   const rendered = await c.activity('wb-render', async () => { ... c.command(['run-asset',
//     'scripts/wb-render.js', ...]) ... })
// and its two keys in the returned gate2_payload:
//   renderer_result: rendered, renderer_failed: false,
```

### src/claude/agents/gaia-validate-feature-docs.md

## Service Interface

```markdown
<!-- BEFORE -->
## Phase 1 — Load Documents

1. Extract the prefix from the folder name (`FTR-001-user-management` → `FTR-001`)
2. Read all three documents fully:
   - `feature.md` — source of truth
   - `{PREFIX}-Requirements.md`
   - `{PREFIX}-Tech-Spec.md`
3. If an input document is missing, record a finding identifying it, skip checks that require it,
   and complete Phases 6 and 7 with `valid: false`. Never claim full coverage when an input could
   not be read.

<!-- AFTER -->
## Phase 1 — Load Documents

1. Extract the prefix from the folder name (`FTR-001-user-management` → `FTR-001`)
2. Read `feature.md` fully — its path is given to you first; use your Read tool.
3. The Requirements and Tech-Spec document text is included directly below, inlined into this
   prompt under `Requirements:` and `Tech-Spec:` labels — do NOT attempt to locate or Read
   `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` on disk; they are not guaranteed to exist
   (both documents are generated and stored in a split, per-item format by default — `req/`,
   `spec/` — and only assembled into a single file when a user explicitly requests it). Use the
   inlined text as the complete, authoritative content of each document for this validation pass.
4. If either inlined document's text is empty or missing, record a finding identifying it, skip
   checks that require it, and complete Phases 6 and 7 with `valid: false`. Never claim full
   coverage when an input could not be read.
```

Phase 3's subsection headings ("### Requirements coverage (against `{PREFIX}-Requirements.md`)" /
"### Tech-Spec coverage (against `{PREFIX}-Tech-Spec.md`)") are softened to "against the inlined
Requirements text" / "against the inlined Tech-Spec text" — labels only, no behavior change. Phase
6's persisted report template keeps its existing `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md`
row labels unchanged (purely a document-naming convention inside the always-real, always-written
`{PREFIX}-Validation-Report.md`, unaffected by this feature).

### src/claude/agents/gaia-generate-tech-spec.md

## Service Interface

```markdown
<!-- BEFORE (## Process, step 2) -->
2. **Read** `{PREFIX}-Requirements.md` if it exists (for traceability)

<!-- AFTER -->
2. **Read** `req/index.md` if it exists (for traceability) — the AC table and Use Case index it
   needs already live there, untouched by the per-UC split (FTR-021)
```

```markdown
<!-- BEFORE (## Guidelines) -->
- ... Do not invent AC IDs — only cite ones that exist in `{PREFIX}-Requirements.md`'s own AC table.

<!-- AFTER -->
- ... Do not invent AC IDs — only cite ones that exist in `req/index.md`'s own AC table.
```

### src/claude/skills/implement-feature/SKILL.md

## Component Props

````markdown
<!-- BEFORE (Step 2 — Present Gate 1) -->
Present the following to the user:

```
Documents generated for {PREFIX}:

  {PREFIX}-Requirements.md — {requirements.summary}
  {PREFIX}-Tech-Spec.md    — {tech_spec.summary}
  {PREFIX}-Validation-Report.md — {validation.summary}
```

<!-- AFTER -->
Present the following to the user:

```
Documents generated for {PREFIX}:

  {requirements.path} — {requirements.summary}
  {tech_spec.path}    — {tech_spec.summary}
  {PREFIX}-Validation-Report.md — {validation.summary}

To view a single combined document instead of the split source files, run:
  /assemble-docs {PREFIX} [req|spec|all]
```
````

```markdown
<!-- BEFORE (Approvals.md template, Gate 1 table rows) -->
| {PREFIX}-Requirements.md | ✅ Approved | {today} | {notes or —} |
| {PREFIX}-Tech-Spec.md | ✅ Approved | {today} | {notes or —} |
| {PREFIX}-Validation-Report.md | ✅ Approved | {today} | {notes or —} |

<!-- AFTER -->
| {requirements.path} | ✅ Approved | {today} | {notes or —} |
| {tech_spec.path} | ✅ Approved | {today} | {notes or —} |
| {PREFIX}-Validation-Report.md | ✅ Approved | {today} | {notes or —} |
```

`docs_digest` itself, and the `**Docs Digest:** \`{docs_digest}\`` line, are unchanged — the
digest's meaning and format are identical, only its computation moved (see
`pm-phase1.js.md`/`pm-phase2.js.md`). `pm-phase2.js`'s Gate 1 check (which only looks for the
literal `## Gate 1` heading, a `✅ Approved` marker, and a `**Docs Digest:**` line — never the
specific row labels) is unaffected by this wording change.

### src/claude/commands/feature-status.md

## Component Props

```markdown
<!-- BEFORE (step 2) -->
2. For each of the following artifacts, check presence and basic completeness:
   - `feature.md` — the source brief
   - `{PREFIX}-Requirements.md` — functional requirements
   - `{PREFIX}-Tech-Spec.md` — technical specification
   - `{PREFIX}-Work-Breakdown.md` — user stories + tasks
   - Implementation status: cross-check tasks in the work breakdown against the codebase. For
     each task, report `done` / `partial` / `not started` based on whether the referenced
     files/symbols exist.

<!-- AFTER -->
2. For each of the following artifacts, check presence and basic completeness:
   - `feature.md` — the source brief
   - Requirements — ✅ if either `req/index.md` (split, default) or `{PREFIX}-Requirements.md`
     (assembled, legacy or user-requested via `/assemble-docs`) exists; note which shape was found
   - Tech-Spec — ✅ if either `spec/index.md` (split, default) or `{PREFIX}-Tech-Spec.md` (assembled)
     exists; note which shape was found
   - Work Breakdown — ✅ if either `wbs/index.json` (split, always the case since FTR-020) or
     `{PREFIX}-Work-Breakdown.md` (rendered, only present if `/assemble-docs` was run) exists
   - Implementation status: cross-check tasks in the work breakdown against the codebase (reading
     `wbs/` directly, same as before — unaffected). For each task, report `done` / `partial` /
     `not started` based on whether the referenced files/symbols exist.
```

## 4. Frontend

_No components in this category._

## 5. External Integrations

### tests/assemble-docs.test.js



### tests/integration/workflow-runtime.test.js

## Service Interface

Test-level changes (not production code — described as behavioral assertions, since this file has
no exported interface of its own):

- **Existing tests updated:** every assertion of the shape
  `fs.readFileSync(path.join(f.dir, 'FTR-099-Requirements.md'), ...)` or
  `fs.existsSync(path.join(f.dir, 'FTR-099-Tech-Spec.md'))` immediately after a `pm-phase1` run is
  removed or inverted (`.not.toBe(true)`) — these files are no longer written by `pm-phase1`.
  Assertions that previously read the assembled file's *content* to check a property (e.g. section
  completeness) are redirected to read `req/index.md`/`spec/index.md` instead, where the same
  content is now authoritative.
- **New: "pm-phase1 never writes the assembled Requirements/Tech-Spec files"** — a full clean run,
  then assert neither file exists on disk.
- **New: "the Gate 1 validator's prompt contains the inlined Requirements/Tech-Spec text"** —
  mock dispatch for `gaia-validate-feature-docs` inspects `options.prompt` for the expected
  `Requirements:`/`Tech-Spec:` labeled content matching the real split-source fixtures.
- **New: "docs_digest is unchanged in format and still content-sensitive"** — extends the existing
  `docs_digest` test (`/^sha256:[a-f0-9]{64}$/`, deterministic, changes with content) to confirm it
  is now computed from split-source content, by editing a `req/use-cases/UC-01.md` fixture file
  directly (not the removed assembled file) and confirming the digest changes.
- **New: "pm-phase2 bridges Requirements/Tech-Spec from split sources before its own Gate 1 check"**
  — a feature with real `req/`+`spec/` fixtures and an approved Gate 1 (digest computed the same
  way `pm-phase1` now computes it) — run `pm-phase2`, assert `{PREFIX}-Requirements.md`/
  `{PREFIX}-Tech-Spec.md` now exist and match what `loadRequirements`/`loadTechSpec` would produce,
  and that `wb-skeleton-check.js`/`wb-validate.js`/the semantic validator/`ac-task-matrix.js`/
  `gaia-generate-work-breakdown` all still receive and successfully use them.
- **New: "pm-phase2 bridge step is a no-op for a legacy feature"** — pre-existing monolithic
  `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` fixtures, no `req/`/`spec/` directories; run
  `pm-phase2`; assert the pre-existing files are untouched (same mtime/content) and no assembler
  subprocess was invoked for them.
- **New: "pm-phase2 no longer calls wb-render.js automatically"** — assert the mock
  dispatch/command spy never receives a `wb-render.js` invocation, and
  `{PREFIX}-Work-Breakdown.md`/`.csv` are not created as a side effect of a `pm-phase2` run; assert
  `gate2_payload` no longer has `renderer_result`/`renderer_failed` keys.

## 6. Security Considerations

None — internal toolkit workflow change, no new external surface, no new input validation
boundary. `assemble-docs.js` only reads files already inside the feature's own folder and writes
alongside them, same trust boundary as every other script in `src/claude/scripts/`.

## 7. Database Changes

None.

## 8. Configuration

None — no new environment variables, app settings, or feature flags.

## 9. File Inventory

### New files
| Path | Purpose-or-Change | Addresses |
|---|---|---|
| src/claude/scripts/assemble-docs.js | On-demand CLI: assembles req/spec/wbs split sources into single-file views | AC-07, AC-08 |
| src/claude/commands/assemble-docs.md | Thin `/assemble-docs` slash command wrapping the script above | AC-07 |
| tests/assemble-docs.test.js | Unit tests for the new script (req/spec/wbs/all, missing-source error paths) | AC-07, AC-11 |

### Modified files
| Path | Purpose-or-Change | Addresses |
|---|---|---|
| src/claude/workflows/pm-phase1.js | Stop writing assembled files; repoint regen/truncation/AC-check gates at split index files; in-memory assembly feeding the inlined validator prompt and docsDigest | AC-01, AC-02, AC-03, AC-04 |
| src/claude/workflows/pm-phase2.js | New bridge step (assemble-and-write Requirements/Tech-Spec from split sources, with legacy fallback); remove automatic wb-render.js call | AC-05, AC-06, AC-08 |
| src/claude/agents/gaia-validate-feature-docs.md | Phase 1 rewritten: Requirements/Tech-Spec text arrives inlined in the prompt, not read from disk | AC-03 |
| src/claude/agents/gaia-generate-tech-spec.md | Traceability read-step repointed from `{PREFIX}-Requirements.md` to `req/index.md` | AC-09 |
| src/claude/skills/implement-feature/SKILL.md | Gate 1 presentation reflects the new default artifact set (`req/`, `spec/`), mentions the assemble command | AC-10 |
| src/claude/commands/feature-status.md | Artifact-presence check updated for the new default artifact set | AC-10 |
| tests/integration/workflow-runtime.test.js | Updated/new tests for the removed auto-writes, repointed gates, the pm-phase2 bridge step (real-split and legacy-fallback), and the removed automatic wb-render.js call | AC-11 |

## 10. Testing Strategy

### src/claude/scripts/assemble-docs.js

See `tests/assemble-docs.test.js.md` (own component) for the full test design — this component's
own responsibility is just the implementation; `req`/`spec` targets against a real split fixture
produce byte-identical output to calling `loadRequirements`/`loadTechSpec` directly; `wbs` against a
real `wbs/` fixture produces the same `.md`/`.csv` `wb-render.js` would produce standalone; `all`
runs all three; a missing split-source directory for any requested target exits 2 with a message
naming the exact expected path; an unknown `which` value exits 1 with a usage-style message.

### src/claude/commands/assemble-docs.md

See `tests/assemble-docs.test.js.md` — this command is a thin wrapper with no logic of its own
beyond argument parsing already exercised by the script's own tests; no additional test file is
introduced for the command wrapper itself, consistent with `check-docs.md`/`feature-status.md`
having no dedicated test file either (both are exercised indirectly via the agents/scripts they
wrap).

### tests/assemble-docs.test.js

- `assembleReq()` against a real `req/` fixture produces the same content `loadRequirements()`
  would, written to `{prefix}-Requirements.md`.
- `assembleSpec()` against a real `spec/` fixture produces the same content `loadTechSpec()` would,
  written to `{prefix}-Tech-Spec.md`.
- `assembleWbs()` against a real `wbs/` fixture produces `{prefix}-Work-Breakdown.md`/`.csv`
  byte-identical to running `wb-render.js` directly on the same fixture.
- CLI `all` (no third argument) runs all three and returns a `written` array with all five paths
  (two for `wbs`, one each for `req`/`spec`).
- CLI with an unknown `which` value exits 1 with a usage-style stderr message; does not write
  anything.
- CLI for `req`/`spec` against a feature directory with no `req/`/`spec/` directory exits 2,
  stderr names the exact expected path (same `AssemblyError` message `req-assembler.js`/
  `tech-spec-assembler.js` already produce — this script does not invent a new error message).
- CLI for `wbs` against a feature directory with no `wbs/` directory exits 2, stderr names the
  exact expected path.
- Missing `<feature-dir>`/`<prefix>` CLI arguments exits 1 with a usage message.

### src/claude/workflows/pm-phase1.js

`tests/integration/workflow-runtime.test.js` (see that file's own component for the full list):
assert no `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` file exists on disk after a clean
`pm-phase1` run; assert the regen-freshness/truncation/AC-check gates react to `req/index.md`/
`spec/index.md` mtime and content, not an assembled file that no longer exists; assert the
validator's received prompt contains the inlined Requirements/Tech-Spec text (mock dispatch
inspects `options.prompt`); assert `docs_digest` is unchanged in format
(`/^sha256:[a-f0-9]{64}$/`) and still deterministic/content-sensitive over the split sources; assert
a `needsRequirementsFix`/`needsTechSpecFix` cycle re-assembles before the next validator dispatch
(the second dispatch's inlined text reflects the regenerated content, not the stale first-pass
text).

### src/claude/workflows/pm-phase2.js

`tests/integration/workflow-runtime.test.js` (see that file's own component for the full list):
a feature with real `req/`+`spec/` directories and an approved Gate 1 — assert `pm-phase2` writes
fresh `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` before its own digest check, and that
`wb-skeleton-check.js`/`wb-validate.js`/`ac-task-matrix.js`/the semantic validator/
`gaia-generate-work-breakdown` all still receive and successfully use them, unmodified; a legacy
feature (monolithic files only, no `req/`/`spec/`) — assert the bridge step is a no-op and the
pre-existing files are used as-is, with no assembly subprocess dispatched; assert `pm-phase2`
no longer calls `wb-render.js` (mock dispatch/command spy never sees it) and
`{PREFIX}-Work-Breakdown.md`/`.csv` are not written as a side effect of a `pm-phase2` run; assert
`gate2_payload` no longer carries `renderer_result`/`renderer_failed`, and no existing assertion
elsewhere depended on those keys being present.

### src/claude/agents/gaia-validate-feature-docs.md

`tests/integration/workflow-runtime.test.js` (see that file's own component): the mock dispatch for
`gaia-validate-feature-docs` asserts the received `options.prompt` contains `Requirements:` and
`Tech-Spec:` labeled sections with the expected inlined content, instead of assuming the agent
reads files from disk; no test depends on a monolithic Requirements/Tech-Spec file existing on
disk at the point this worker is dispatched.

### src/claude/agents/gaia-generate-tech-spec.md

`tests/integration/workflow-runtime.test.js` (see that file's own component): no test asserts this
agent reads `{PREFIX}-Requirements.md` by path — the host dispatch for `gaia-generate-tech-spec`
already only ever passed `featurePath` (the agent locates its own traceability input by
convention); this is a prompt-wording-only change with no host-side test fixture to update beyond
confirming the agent file's own frontmatter/structure still parses (existing frontmatter tests
already cover this generically).

### src/claude/skills/implement-feature/SKILL.md

No dedicated test file — `SKILL.md` is a prompt-only orchestration document with no existing test
coverage of its own (confirmed: `pm-phase2.js`'s Gate 1 regex checks, exercised in
`tests/integration/workflow-runtime.test.js`, parse only the heading/approval-marker/digest-line
pattern, never the row text) — verified manually, consistent with how this skill's Gate 1 section
was introduced originally.

### src/claude/commands/feature-status.md

No dedicated test file — `feature-status.md` is a prompt-only command with no existing test
coverage of its own (confirmed: no test file references it today); the updated wording is verified
manually, consistent with how this command was introduced originally.

### tests/integration/workflow-runtime.test.js

This component *is* the test file — see Service Interface above for the full list; each bullet is
itself one or more `test(...)` blocks to add/modify.

## 11. Implementation Order

1. `src/claude/workflows/pm-phase1.js` — depends on: nothing (the split sources it reads already
   exist from FTR-021/FTR-024)
2. `src/claude/agents/gaia-validate-feature-docs.md` — depends on: 1 (prompt contract must match
   what `pm-phase1.js` now sends)
3. `src/claude/agents/gaia-generate-tech-spec.md` — depends on: nothing (independent small wording
   change)
4. `src/claude/workflows/pm-phase2.js` — depends on: 1 (the bridge step exists because `pm-phase1.js`
   no longer writes the monolithic files)
5. `src/claude/scripts/assemble-docs.js` — depends on: nothing (reuses existing, unmodified
   assemblers)
6. `src/claude/commands/assemble-docs.md` — depends on: 5
7. `src/claude/skills/implement-feature/SKILL.md` — depends on: 1, 4 (describes the real post-change
   artifact set and pipeline behavior)
8. `src/claude/commands/feature-status.md` — depends on: 1 (checks the new default artifact set)
9. `tests/integration/workflow-runtime.test.js` — depends on: 1, 4 (exercises the changes made there)
10. `tests/assemble-docs.test.js` — depends on: 5

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `pm-phase2.js`'s bridge step silently diverges from `pm-phase1.js`'s own assembly (different subprocess invocation, different error handling) | Gate 1 digest mismatch, or a confusing error at Gate 2 instead of Gate 1 | Both call the exact same `req-assembler.js`/`tech-spec-assembler.js` scripts, unmodified, with the same arguments shape — verified by a test asserting digest parity between the two phases for the same split sources |
| A future change to `req-assembler.js`/`tech-spec-assembler.js` silently changes assembled output shape, breaking the inlined validator prompt or the bridge step without either being touched | Validation false positives/negatives; bridge step produces a subtly wrong monolithic file | Both assemblers already have their own dedicated test suites (`tests/req-assembler.test.js`, `tests/tech-spec-assembler.test.js`) from FTR-021/FTR-024, unaffected by this feature — any future shape change must already update those first |
| `gaia-validate-feature-docs`'s inlined-prompt contract regresses validation quality compared to the agent reading files itself (e.g. losing some Glob/Grep-based cross-reference capability) | Weaker Gate 1 validation | The agent's `tools: Read, Glob, Grep` grant is unchanged — it can still explore the codebase for any OTHER context it needs; only the two specific documents it previously located-and-read-by-convention are now inlined directly, a strict narrowing of *how* it gets that one input, not a removal of its other capabilities |

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Exact `assemble-docs.js` CLI surface | **Resolved** | `node assemble-docs.js <feature-dir> <prefix> [req\|spec\|wbs\|all]` — positional, mirroring every other script in `src/claude/scripts/` (`wb-render.js <wbs-dir> <prefix>`, `ac-task-matrix.js <wbs> <req> <spec> <prefix>`). Missing/invalid `which` prints usage and exits 1; a requested split source directory that doesn't exist exits 2 with a structured error naming the exact path (same `AssemblyError`-style convention `req-assembler.js`/`tech-spec-assembler.js` already use) |
| 2 | Whether `pm-phase2.js`'s bridge step is its own named `c.activity()` or inline setup | **Resolved** | Its own `c.activity('bridge-requirements-tech-spec', ...)`, mirroring the existing `wb-skeleton-check`/`wb-validate`/`wb-render`/`ac-task-matrix` activities in the same file — keeps the token ledger/evidence trail consistent (every meaningful deterministic step in `pm-phase2.js` is already its own named activity) |
| 3 | Exact inlined-prompt format for `gaia-validate-feature-docs` | **Resolved** | `${featurePath}\n\nRequirements:\n${assembledRequirements}\n\nTech-Spec:\n${assembledTechSpec}\n\nValidate only; ...` — same ordering and `Label:\ncontent` delimiter style `pm-phase2.js`'s existing `buildTaskPrompt` already uses to inline the assembled Tech-Spec text into the per-task prompt (`` `Tech-Spec:\n${techSpecText}` ``), so this feature introduces no new prompt-construction convention |

## Dependencies and Assumptions

- FTR-020/FTR-021/FTR-024 (available): the split-generation architecture and assemblers
  (`wbs-assembler.js`, `req-assembler.js`, `tech-spec-assembler.js`) this feature builds on,
  reused unmodified.
- `lib/workflow-control.js`'s `worker()`/`c.command()`/`c.hash()` contracts are fixed.
- `npm test` is the only verification command; no separate build step exists.
