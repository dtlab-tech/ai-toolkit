#!/usr/bin/env node
'use strict'

// FTR-024: loader/renderer for the split Tech-Spec format (spec/index.md +
// spec/components/*.md). Reconstructs the exact 12-section monolithic shape
// gaia-generate-tech-spec already produced in one turn before this feature: Section 9 rebuilt
// from the skeleton's own Components table (authoritative, restated from each component, never
// re-derived); Sections 3 (Backend)/4 (Frontend)/5 (External Integrations) populated per
// component Domain routing; Section 10 (Testing Strategy) built from every component's own
// Tests subsection, unconditionally. Legacy input (a single monolithic file) is returned
// unchanged.

const fs = require('fs')
const path = require('path')
const { findSectionRange, parseTableRows } = require('./req-assembler')

const SECTION_BY_DOMAIN = { BE: 3, FE: 4 } // anything else (DB/DevOps/INFRA/TEST) routes to 5

class AssemblyError extends Error {}

// Same helper tech-spec-graph-checks.js already has (FTR-023) — duplicated here deliberately,
// not imported: this script reads 5-column rows for a structurally different purpose (section
// routing, not Addresses validation), and importing a function named for a different module's
// job would read as a false shared contract. Same precedent as wbs-assembler.js independently
// reimplementing plan.js's field-parsing convention (FTR-020).
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
  // changeType ('New'/'Modified') comes from WHICH table a row was found in, not from any
  // column's text — the "Purpose-or-Change" column is free-text (e.g. "does backend stuff"),
  // never literally the word "New"/"Modified". A real bug, found only by actually assembling a
  // hand-built fixture and inspecting Section 9's rebuilt New/Modified split: every row landed
  // under "Modified" because `change.toLowerCase() === 'new'` almost never matched free text.
  for (const [heading, changeType] of [['New files', 'New'], ['Modified files', 'Modified']]) {
    const sub = findSubsectionRange(lines, start, end, heading)
    if (!sub) continue
    for (const cells of parseTableRows(lines, sub.start, sub.end)) {
      // Column order: Addresses MUST stay 3rd (index 2) — the exact position
      // tech-spec-graph-checks.js's unmodified, positional parser already reads from a
      // 3-column legacy table (FTR-023). Domain/Spec are new trailing columns.
      const [filePath, purposeOrChange, addresses, domain, specLink] = cells
      const m = specLink && specLink.match(/\(components\/([^)]+)\)/)
      if (!m) throw new AssemblyError(`malformed Spec column for "${filePath}" in spec/index.md`)
      entries.push({ filePath, purposeOrChange, changeType, domain, addresses, fileSlug: m[1] })
    }
  }
  return entries
}

// Parses one component file into { change, body, tests }: `body` is everything between
// "## Change" (exclusive of its own heading) and "## Tests" — the component's own
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

module.exports = {
  loadTechSpec,
  parseComponentsTable,
  parseComponentDetail,
  spliceSectionBody,
  findSubsectionRange,
  AssemblyError,
}
