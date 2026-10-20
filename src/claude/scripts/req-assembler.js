'use strict'

// FTR-021: loader/renderer for the split Requirements format (req/index.md +
// req/use-cases/{UC-ID}.md). Unlike wbs-assembler.js (JSON -> Markdown rendering),
// index.md is already Markdown narrative, so assembly here is textual reassembly:
// splice each use case's already-rendered file into Section 2's slot, in index-table
// order. Legacy input (a single monolithic file) is returned unchanged.

const fs = require('fs')
const path = require('path')

class AssemblyError extends Error {}

// Returns { start, end, lines }: `start` is the index of the "## N. " heading line for
// `sectionNumber`, `end` is the index of the next "## M. " heading (M > sectionNumber),
// or lines.length if none follows. Throws if the section is not found at all.
function findSectionRange(content, sectionNumber) {
  const lines = content.split('\n')
  let start = -1
  let end = lines.length
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^## (\d+)\.\s/)
    if (!m) continue
    const n = Number(m[1])
    if (n === sectionNumber) start = i
    else if (start !== -1 && n > sectionNumber) { end = i; break }
  }
  if (start === -1) throw new AssemblyError(`missing section ${sectionNumber}`)
  return { start, end, lines }
}

// Parses the first Markdown table found inside [start, end) into rows, dropping the
// header row and the "|---|---|" separator row. Returns an array of cell-arrays.
function parseTableRows(lines, start, end) {
  const tableLines = lines.slice(start, end).filter(l => l.trim().startsWith('|'))
  if (tableLines.length < 2) return []
  return tableLines.slice(2).map(line =>
    line.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1))
}

// Returns the raw header-row cells for the first Markdown table found inside [start, end), or
// null if no table is present at all. Companion to parseTableRows, which deliberately discards
// this same row — UC-02's AC-table header validation (req-skeleton-check.js) needs it back.
function parseTableHeader(lines, start, end) {
  const tableLines = lines.slice(start, end).filter(l => l.trim().startsWith('|'))
  if (tableLines.length < 1) return null
  return tableLines[0].split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1)
}

// The "## 2. Use Cases" index table: UC ID | Title | Actor | Priority | File.
// `File` is a Markdown link `[use-cases/UC-01.md](use-cases/UC-01.md)` — the link
// TARGET (inside the parens) is authoritative, not the link text.
function parseUseCaseIndexTable(indexContent) {
  const { start, end, lines } = findSectionRange(indexContent, 2)
  return parseTableRows(lines, start, end).map(cells => {
    const [id, title, actor, priority, fileCol] = cells
    const fileMatch = fileCol && fileCol.match(/\(([^)]+)\)/)
    if (!fileMatch) throw new AssemblyError(`malformed File column for UC "${id}" in index.md`)
    return { id, title, actor, priority, file: fileMatch[1] }
  })
}

// The "## 7. Acceptance Criteria" table: ID | Criterion | Related UC | Priority.
function parseAcTable(indexContent) {
  const { start, end, lines } = findSectionRange(indexContent, 7)
  return parseTableRows(lines, start, end).map(cells => {
    const [id, criterion, relatedUc, priority] = cells
    return { id, criterion, relatedUc, priority }
  })
}

// The "## 3. Business Rules" table: ID | Rule | Applies to.
function parseBusinessRulesTable(indexContent) {
  const { start, end, lines } = findSectionRange(indexContent, 3)
  return parseTableRows(lines, start, end).map(cells => {
    const [id, rule, appliesTo] = cells
    return { id, rule, appliesTo }
  })
}

// Replaces Section 2's body (everything after its heading, up to but not including the
// next "## 3." heading) with `section2Body`, keeping the heading line itself and every
// other section untouched.
function spliceSection2(indexContent, section2Body) {
  const { start, end, lines } = findSectionRange(indexContent, 2)
  const heading = lines[start]
  const before = lines.slice(0, start).concat([heading]).join('\n')
  const after = lines.slice(end).join('\n')
  return `${before}\n\n${section2Body}\n\n${after}`
}

function loadRequirements(inputPath) {
  const stat = fs.statSync(inputPath, { throwIfNoEntry: false })
  if (!stat) throw new AssemblyError(`path does not exist: ${inputPath}`)
  if (stat.isFile()) return fs.readFileSync(inputPath, 'utf8') // legacy path (AC-07)

  const indexPath = path.join(inputPath, 'index.md')
  if (!fs.existsSync(indexPath)) throw new AssemblyError(`missing req/index.md at ${indexPath}`)
  const indexContent = fs.readFileSync(indexPath, 'utf8')

  const ucTable = parseUseCaseIndexTable(indexContent)
  if (ucTable.length === 0) throw new AssemblyError('req/index.md has no rows in its Use Cases index table')

  const ucBlocks = ucTable.map(row => {
    const ucPath = path.join(inputPath, row.file)
    if (!fs.existsSync(ucPath)) throw new AssemblyError(`use case "${row.id}" has no detail file at ${ucPath}`)
    return fs.readFileSync(ucPath, 'utf8').trimEnd()
  })

  return spliceSection2(indexContent, ucBlocks.join('\n\n'))
}

if (require.main === module) {
  const inputPath = process.argv[2]
  if (!inputPath) {
    process.stderr.write('Usage: node req-assembler.js <path-to-req-dir-or-legacy-file>\n')
    process.exit(1)
  }
  try {
    process.stdout.write(loadRequirements(path.resolve(inputPath)))
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`)
    process.exit(err instanceof AssemblyError ? 1 : 2)
  }
}

module.exports = {
  loadRequirements,
  parseUseCaseIndexTable,
  parseAcTable,
  parseBusinessRulesTable,
  spliceSection2,
  findSectionRange,
  parseTableRows,
  parseTableHeader,
  AssemblyError,
}
