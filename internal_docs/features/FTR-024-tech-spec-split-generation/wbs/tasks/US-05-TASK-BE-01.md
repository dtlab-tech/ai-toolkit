<a id="task-US-05-TASK-BE-01"></a>
### US-05-TASK-BE-01

- **Task ID:** US-05-TASK-BE-01
- **Title:** Create tech-spec-assembler.js
- **Outcome:** src/claude/scripts/tech-spec-assembler.js exists exporting loadTechSpec(inputPath) (file input returns content unchanged; directory input reads spec/index.md, parses the Components table including its Domain/Spec columns, reads each component file, and reconstructs the 12-section document: Section 9 reduced back to 3 columns, Sections 3/4/5 populated per Domain routing under per-component subheadings, Section 10 built from every component's own Tests subsection), plus a require.main CLI entry point
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-04, AC-06
- **Estimate — agent minutes:** 24
- **Estimate — tokens:** 38000
- **Output count:** 1
- **Grouping rationale:** The table parser, the per-component detail parser, and the section-routing/splice logic have no independent meaning on their own — `loadTechSpec` is not callable until all three exist together, the same reasoning every prior assembler task in this lineage applied to its own single-module scope.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add tech-spec-assembler.js with directory/legacy loader and domain-routed section rebuild

**Implementation notes:**

From Tech-Spec §4, made concrete. Reuse `req-assembler.js`'s exported `findSectionRange`/
`parseTableRows` directly — do not reimplement table scanning or section-boundary detection:

```js
#!/usr/bin/env node
'use strict'
const fs = require('fs')
const path = require('path')
const { findSectionRange, parseTableRows } = require('./req-assembler')

const SECTION_BY_DOMAIN = { BE: 3, FE: 4 } // anything else (DB/DevOps/INFRA/TEST) routes to 5

class AssemblyError extends Error {}

// Same helper tech-spec-graph-checks.js already has (US-02-TASK-BE-01 in FTR-023) — duplicated
// here deliberately, not imported: this script reads 5-column rows for a structurally different
// purpose (section routing, not Addresses validation), and importing a function named for a
// different module's job would read as a false shared contract. Same precedent as
// wbs-assembler.js independently reimplementing plan.js's field-parsing convention (FTR-020).
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

function parseComponentsTable(indexContent) {
  const { start, end, lines } = findSectionRange(indexContent, 9)
  const entries = []
  // changeType ('New'/'Modified') must come from WHICH table a row was found in, not from the
  // "Purpose-or-Change" column's own free text (e.g. "does backend stuff" — never literally the
  // word "New"). Found by actually assembling a hand-built fixture: an earlier version derived
  // changeType from that column's content and every row silently landed under "Modified".
  for (const [heading, changeType] of [['New files', 'New'], ['Modified files', 'Modified']]) {
    const sub = findSubsectionRange(lines, start, end, heading)
    if (!sub) continue
    for (const cells of parseTableRows(lines, sub.start, sub.end)) {
      const [filePath, purposeOrChange, domain, addresses, specLink] = cells
      const m = specLink && specLink.match(/\(components\/([^)]+)\)/)
      if (!m) throw new AssemblyError(`malformed Spec column for "${filePath}" in spec/index.md`)
      entries.push({ filePath, purposeOrChange, changeType, domain, addresses, fileSlug: m[1] })
    }
  }
  return entries
}

// Parses one component file into { change, body, tests }: `body` is everything between
// "## Change" (exclusive of its own heading+content) and "## Tests" — i.e. the component's own
// Algorithm/Schema content, whatever heading it actually used (the component template's own
// section-naming is a free-text "menu, not a checklist" — this parser does not care what that
// heading is literally called, only that it comes after Change and before Tests).
function parseComponentDetail(content) {
  const lines = content.split('\n')
  const headingIdx = name => lines.findIndex(l => l.trim() === `## ${name}`)
  const changeIdx = headingIdx('Change')
  const testsIdx = headingIdx('Tests')
  if (changeIdx === -1) throw new AssemblyError('component file is missing its "## Change" section')
  if (testsIdx === -1) throw new AssemblyError('component file is missing its "## Tests" section')
  const nextAfterChange = lines.slice(changeIdx + 1).findIndex(l => /^##\s/.test(l))
  const changeEnd = nextAfterChange === -1 ? lines.length : changeIdx + 1 + nextAfterChange
  return {
    change: lines.slice(changeIdx + 1, changeEnd).join('\n').trim(),
    body: lines.slice(changeEnd, testsIdx).join('\n').trim(),
    tests: lines.slice(testsIdx + 1).join('\n').trim(),
  }
}

// Replaces everything between "## {n}. " and the next "## " heading with `body`, keeping the
// heading line itself — same splice primitive as req-assembler.js's spliceSection2, generalized
// to any section number instead of hardcoding 2.
function spliceSectionBody(doc, n, body) {
  const { start, end, lines } = findSectionRange(doc, n)
  const heading = lines[start]
  const before = lines.slice(0, start).concat([heading]).join('\n')
  const after = lines.slice(end).join('\n')
  return `${before}\n\n${body}\n\n${after}`
}

function rewriteSection9(doc, components) {
  const newFiles = components.filter(c => c.changeType === 'New')
  const modifiedFiles = components.filter(c => c.changeType === 'Modified')
  const table = rows => '| Path | Purpose-or-Change | Addresses |\n|---|---|---|\n' +
    rows.map(c => `| ${c.filePath} | ${c.purposeOrChange} | ${c.addresses} |`).join('\n')
  const body = `### New files\n${table(newFiles)}\n\n### Modified files\n${table(modifiedFiles)}`
  return spliceSectionBody(doc, 9, body)
}

function loadTechSpec(inputPath) {
  const stat = fs.statSync(inputPath, { throwIfNoEntry: false })
  if (!stat) throw new AssemblyError(`path does not exist: ${inputPath}`)
  if (stat.isFile()) return fs.readFileSync(inputPath, 'utf8') // legacy path (AC-06)

  const indexPath = path.join(inputPath, 'index.md')
  if (!fs.existsSync(indexPath)) throw new AssemblyError(`missing spec/index.md at ${indexPath}`)
  const indexContent = fs.readFileSync(indexPath, 'utf8')
  const components = parseComponentsTable(indexContent)
  if (components.length === 0) throw new AssemblyError('spec/index.md has no rows in its Components table')

  const detailByPath = {}
  for (const c of components) {
    const compPath = path.join(inputPath, 'components', c.fileSlug)
    if (!fs.existsSync(compPath)) throw new AssemblyError(`component "${c.filePath}" has no detail file at ${compPath}`)
    detailByPath[c.filePath] = parseComponentDetail(fs.readFileSync(compPath, 'utf8'))
  }

  let doc = rewriteSection9(indexContent, components)
  for (const sectionNum of [3, 4, 5]) {
    const matching = components.filter(c => (SECTION_BY_DOMAIN[c.domain] || 5) === sectionNum)
    const body = matching.length
      ? matching.map(c => `### ${c.filePath}\n\n${detailByPath[c.filePath].body}`).join('\n\n')
      : '_No components in this category._'
    doc = spliceSectionBody(doc, sectionNum, body)
  }
  const testsBody = components.map(c => `### ${c.filePath}\n\n${detailByPath[c.filePath].tests}`).join('\n\n')
  doc = spliceSectionBody(doc, 10, testsBody)
  return doc
}

if (require.main === module) {
  const inputPath = process.argv[2]
  if (!inputPath) {
    process.stderr.write('Usage: node tech-spec-assembler.js <path-to-spec-dir-or-legacy-file>\n')
    process.exit(1)
  }
  try {
    process.stdout.write(loadTechSpec(path.resolve(inputPath)))
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`)
    process.exit(err instanceof AssemblyError ? 1 : 2)
  }
}

module.exports = { loadTechSpec, parseComponentsTable, parseComponentDetail, spliceSectionBody, AssemblyError }
```

Note `rewriteSection9`'s New/Modified split uses each component's own `change` field
(`"New"`/`"Modified"`, case-insensitively) — the same two literal values the monolithic template
already uses for its own table split, restated by the skeleton, never re-derived from file-system
state (there is no way to know from the split format alone whether a path already existed before
this feature — that's the skeleton-generation agent's own judgment, same as it is today for the
monolithic single-call template).

**Verification commands:**

```
node --check src/claude/scripts/tech-spec-assembler.js
```
