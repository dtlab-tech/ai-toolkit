# FTR-023 — Technical Specification

## 1. Baseline

- Branch: `develop`. `gaia-generate-tech-spec.md`'s §9 "File Inventory" template has two tables,
  "New files" (`Path | Purpose`) and "Modified files" (`Path | Change description`), each
  currently two columns. **Modified** to add a third column, `Addresses`, to both.
- `req-assembler.js` (FTR-021) exports `findSectionRange(content, sectionNumber)` (locate a
  numbered `## N. ` section's line range) and `parseTableRows(lines, start, end)` (split the
  first Markdown table in a line range into cell arrays, dropping header/separator rows) — both
  generic, neither Requirements-specific in implementation despite the module's name. **Neither
  is modified** by this feature; `parseTableRows` is additionally exported (it already existed,
  just not in `module.exports`).
- `wb-graph-checks.js`'s `parseAcTable(requirementsPath)` (FTR-020, extended by FTR-022 to carry
  `criterion`) is the single authoritative source for which AC IDs exist. **Not modified** by
  this feature.
- `ac-task-matrix.js` (FTR-022) exports `computeCoverage(wb, acMap)` and `renderMatrix(prefix,
  acMap, coverage)` — nothing outside this script's own CLI mode calls either function today
  (confirmed: `grep -rn "require.*ac-task-matrix"` outside the script's own file and its test
  returns nothing), so extending their signatures is a zero-consumer-impact change.
- `pm-phase1.js`'s existing validation loop dispatches `gaia.agent.planner.validate-feature-docs`
  inside a `for (let cycle = 1; cycle <= 3; cycle++)` loop, both on first generation and after a
  `needsTechSpecFix` revision. `lib/workflow-runner.js` runs it with no `require()` in scope
  (confirmed during FTR-020/021); any new script logic must be invoked via
  `c.command(['run-asset', ...])`.

## 2. Resolution of Open Questions

### OQ-1 (feature.md): standalone script or new functions on an existing module?

**Decision:** one new standalone file, `src/claude/scripts/tech-spec-graph-checks.js`. Unlike
`wb-graph-checks.js`/`req-graph-checks.js` (which each hold *several* checks reused across
multiple call sites, justifying a checks-module + CLI-wrapper two-file split), this feature has
exactly **one** check used in exactly **one** context (the `pm-phase1.js` pre-check). A single
file combining the pure parse/check functions and a `require.main === module` CLI entry point
(the same combined-file pattern `req-assembler.js`/`wbs-assembler.js` already use) is simpler and
avoids inventing a second-file split with no second consumer to justify it.

### OQ-2 (feature.md): new File-Inventory parser, or reuse `req-assembler.js`'s generic helpers?

**Decision:** reuse `findSectionRange`/`parseTableRows` from `req-assembler.js`, imported by the
new `tech-spec-graph-checks.js`. Tech-Spec's §9 has **two** named subsections ("### New files",
"### Modified files") inside one numbered section, which `parseTableRows` alone doesn't
distinguish (it would flatten both tables' rows together if given the whole §9 range) — so
`tech-spec-graph-checks.js` adds one small new helper, `findSubsectionRange(lines, start, end,
heading)`, that locates a `### {heading}` line within an already-located numbered-section range
and returns the sub-range up to the next `###`/`##` heading. This is a genuinely new (and
Tech-Spec-shaped) piece of logic, kept in the new file; the row-splitting itself
(`parseTableRows`) is not duplicated.

### OQ-3 (feature.md): `ac-task-matrix.js` extension mechanism

**Decision:** extend in place, additively. `computeCoverage`/`renderMatrix` keep their existing
call shape for their first N parameters; `renderMatrix` gains one new, optional 4th parameter
(`techSpecCoverage = new Map()`, defaulting to "no Tech-Spec coverage data" so a caller passing
only 3 arguments — none exist today, but the signature stays backward-compatible regardless —
gets a matrix with an all-`—` new column rather than a crash). A new function,
`computeTechSpecCoverage(fileInventoryEntries, acMap)`, is added alongside `computeCoverage` —
not merged into it — since it walks a structurally different input (Tech-Spec file-inventory
rows, not Work Breakdown phases/tasks) and keeping the two separate keeps each one simple and
independently testable, matching this script's own existing precedent of two small, focused
functions rather than one that branches on input shape.

## 3. New and Modified Files

| File | Change |
|---|---|
| `src/claude/agents/gaia-generate-tech-spec.md` | **Modified.** §9 "File Inventory" template: both the "New files" and "Modified files" tables gain a third column, `Addresses`. One new Guidelines bullet: *"For every file in the File Inventory, cite the Requirements AC ID(s) it implements in the `Addresses` column (comma-separated), or `—` if the file has no direct AC traceability (e.g. a shared helper). Do not invent AC IDs — only cite ones that exist in `{PREFIX}-Requirements.md`'s own AC table."* No other section changes. |
| `src/claude/scripts/req-assembler.js` | **Modified** (additive only): `parseTableRows` added to `module.exports` (it already existed as an internal function; this is a visibility change only, zero behavior change to the function itself or any existing caller). |
| `src/claude/scripts/tech-spec-graph-checks.js` | **New.** `parseFileInventoryEntries(techSpecPath)` → `{ filePath, acIds: string[] }[]` (combining both tables, `acIds` empty for a `—` cell); `checkAddressesResolve(entries, acIds)` → pure check, returns an array of dangling-reference error objects (mirrors `req-graph-checks.js`'s `checkCrossReferencesResolve` shape); CLI entry point. |
| `src/claude/scripts/ac-task-matrix.js` | **Modified** (additive): new `computeTechSpecCoverage(entries, acMap)` function; `renderMatrix`'s signature gains the optional `techSpecCoverage` 4th parameter and one new rendered column; CLI entry point updated to parse the Tech-Spec file inventory (via `tech-spec-graph-checks.js`'s `parseFileInventoryEntries`) and pass it through. |
| `src/claude/workflows/pm-phase1.js` | **Modified.** One new `c.activity('tech-spec-ac-check', ...)` block inserted immediately before the existing validation-cycle loop's first `gaia.agent.planner.validate-feature-docs` dispatch (and re-run identically after a `needsTechSpecFix` revision, since the loop already re-enters at the top on each cycle). |

## 4. `tech-spec-graph-checks.js`

```js
#!/usr/bin/env node
'use strict'
const fs = require('fs')
const path = require('path')
const { findSectionRange, parseTableRows } = require('./req-assembler')
const { parseAcTable } = require('./wb-graph-checks')

// Locates a "### {heading}" line within [start, end) and returns its own sub-range, up to the
// next "###" or "##" heading (or `end`). Tech-Spec-specific: req-assembler.js's
// findSectionRange only knows about numbered "## N." headings, one level up from this.
function findSubsectionRange(lines, start, end, heading) {
  let subStart = -1
  for (let i = start; i < end; i++) {
    if (lines[i].trim() === `### ${heading}`) { subStart = i; break }
  }
  if (subStart === -1) return null
  let subEnd = end
  for (let i = subStart + 1; i < end; i++) {
    if (/^#{2,3}\s/.test(lines[i])) { subEnd = i; break }
  }
  return { start: subStart, end: subEnd }
}

function parseFileInventoryEntries(techSpecContent) {
  const { start, end, lines } = findSectionRange(techSpecContent, 9)
  const entries = []
  for (const heading of ['New files', 'Modified files']) {
    const sub = findSubsectionRange(lines, start, end, heading)
    if (!sub) continue // a Tech-Spec with only one of the two tables is valid (e.g. a pure-addition feature)
    for (const cells of parseTableRows(lines, sub.start, sub.end)) {
      const filePath = cells[0]
      const addressesCell = cells[2] // Path | Purpose-or-Change-description | Addresses
      const acIds = (!addressesCell || addressesCell.trim() === '—') ? []
        : addressesCell.split(',').map(s => s.trim()).filter(Boolean)
      entries.push({ filePath, acIds })
    }
  }
  return entries
}

function checkAddressesResolve(entries, validAcIds) {
  const idSet = new Set(validAcIds)
  const errors = []
  for (const entry of entries) {
    for (const acId of entry.acIds) {
      if (!idSet.has(acId)) {
        errors.push({
          category: 'DANGLING_TECH_SPEC_AC_REFERENCE', severity: 'error',
          filePath: entry.filePath, acId,
          message: `File "${entry.filePath}"'s "Addresses" column references unknown AC "${acId}"`,
        })
      }
    }
  }
  return errors
}

if (require.main === module) {
  const [techSpecPath, requirementsPath] = process.argv.slice(2)
  if (!techSpecPath || !requirementsPath) {
    process.stderr.write('Usage: node tech-spec-graph-checks.js <tech-spec-path> <requirements-path>\n')
    process.exit(2)
  }
  let entries, acMap
  try {
    entries = parseFileInventoryEntries(fs.readFileSync(path.resolve(techSpecPath), 'utf8'))
    acMap = parseAcTable(path.resolve(requirementsPath))
  } catch (e) {
    console.log(JSON.stringify({ valid: false, errors: [{ message: `parse failure: ${e.message}` }] }))
    process.exit(2)
  }
  const errors = checkAddressesResolve(entries, [...acMap.keys()])
  console.log(JSON.stringify({ valid: errors.length === 0, errors }, null, 2))
  process.exit(errors.length === 0 ? 0 : 1)
}

module.exports = { parseFileInventoryEntries, checkAddressesResolve, findSubsectionRange }
```

A Tech-Spec with neither "### New files" nor "### Modified files" present under §9 yields an
empty `entries` array — `checkAddressesResolve([], anything)` returns no errors, so a feature
with literally no file inventory content (should not occur in practice, since §9 is already
required by the existing 12-section truncation guard) does not spuriously fail this new check;
it would already have failed the pre-existing `assertCompleteSections` guard first.

## 5. `ac-task-matrix.js` Extension

```js
// New function, alongside the existing computeCoverage — same file, same conventions.
function computeTechSpecCoverage(entries, acMap) {
  const coverage = new Map([...acMap.keys()].map(acId => [acId, new Set()]))
  for (const entry of entries) {
    for (const acId of entry.acIds) {
      if (coverage.has(acId)) coverage.get(acId).add(entry.filePath)
    }
  }
  return coverage
}

// renderMatrix signature: (prefix, acMap, coverage, techSpecCoverage = new Map())
// New column inserted between "Related UC" and "Covering Task(s)":
// `${[...(techSpecCoverage.get(acId) || [])].join(', ') || '—'}`
```

Header row becomes: `| AC ID | Criterion | Priority | Related UC | Addressed by Tech-Spec
File(s) | Covering Task(s) | Covering Phase(s) |`. Legend gains one bullet: *"**Addressed by
Tech-Spec File(s)** — every Tech-Spec file whose `Addresses` column cites this AC,
comma-separated, or `—` if none."*

CLI entry point (`require.main === module` block) updated: after loading `wb`/`acMap` as today,
also read the Tech-Spec path (a new, 4th CLI argument) via
`tech-spec-graph-checks.js`'s `parseFileInventoryEntries`, compute `techSpecCoverage`, and pass
it as `renderMatrix`'s 4th argument. Usage becomes: `node ac-task-matrix.js <wbs-path>
<requirements-path> <tech-spec-path> <prefix>`.

## 6. `pm-phase1.js` Wiring

Inserted immediately before the existing `for (let cycle = 1; cycle <= 3; cycle++)` validation
loop (so it runs once per `pm-phase1.js` invocation, re-checked only when Tech-Spec itself was
just (re)generated or revised — not once per validation cycle, since a `needsRequirementsFix`-only
cycle doesn't touch Tech-Spec at all):

```js
await c.activity('tech-spec-ac-check', async () => {
  const res = c.command(['run-asset', 'scripts/tech-spec-graph-checks.js', '--project', c.root,
    '--', file('Tech-Spec'), file('Requirements')], [0, 1])
  const parsed = JSON.parse(res.stdout)
  if (typeof parsed.valid !== 'boolean' || !Array.isArray(parsed.errors) ||
      (res.exitCode === 0) !== parsed.valid) throw new Error('Invalid tech-spec-ac-check result')
  if (!parsed.valid) throw new Error('Tech-Spec has dangling AC references: ' + res.stdout)
  return parsed
})
```

Placed after Tech-Spec generation/truncation-check succeeds and before the validation loop
begins — matches NFR-02 ("runs before `gaia-validate-feature-docs` is dispatched"). Re-entering
`generateRequirements`'s/`techSpec()`'s existing freshness-driven regeneration already causes this
new activity to naturally re-run on a subsequent `pm-phase1.js` invocation too, with no special
resume logic needed (it is cheap and deterministic — unlike an LLM call, there is no cost
argument for skipping it when nothing changed).

## 7. Legacy Compatibility

A Tech-Spec generated before this feature (no `Addresses` column at all) is loaded by
`parseFileInventoryEntries`'s `parseTableRows` call exactly as it already loads a two-column
table: `cells[2]` is simply `undefined` for every row, which the `!addressesCell` branch already
treats as `acIds: []` — equivalent to every row being `—`. No legacy-format branch is needed;
this is a natural consequence of the parser already tolerating missing cells (AC-04's `—`
handling and "a pre-existing Tech-Spec with no column at all" are the same code path).

## 8. Test Plan (AC-07)

- `tech-spec-graph-checks.test.js`: `parseFileInventoryEntries` against a hand-built Tech-Spec
  fixture (both tables present, one table missing, a `—` cell, a multi-AC cell); `checkAddressesResolve`
  against a clean list and a list with one dangling reference; `findSubsectionRange` against a
  Tech-Spec where "### Modified files" appears before the next `##` section heading and one where
  it's the last thing in the document (no trailing heading at all).
- `ac-task-matrix.test.js` (extend the FTR-022 file): `computeTechSpecCoverage` against one AC
  addressed by one file, one AC addressed by two files, one AC addressed by zero files;
  `renderMatrix` with and without the 4th `techSpecCoverage` argument (confirming the
  backward-compatible default still renders `—` in the new column).
- `pm-phase1-tech-spec-ac-check.test.js` (or extend `tests/integration/workflow-runtime.test.js`):
  a full `runWorkflow('pm-phase1', ...)` run with a Tech-Spec mock containing a dangling
  `Addresses` reference asserts the run fails before `gaia-validate-feature-docs` is ever
  dispatched (mirrors the existing "a Requirements document truncated mid-generation is rejected
  immediately" test's dispatch-order-assertion style); a second run with a clean/`—`-only
  Tech-Spec asserts the existing validation flow proceeds unchanged.
