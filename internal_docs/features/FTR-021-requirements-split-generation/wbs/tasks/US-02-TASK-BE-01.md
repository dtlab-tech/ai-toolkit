<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Create req-assembler.js with loadRequirements and CLI entry point
- **Outcome:** src/claude/scripts/req-assembler.js exists exporting loadRequirements(inputPath) (file input returns content unchanged; directory input reads index.md, parses the use-case index table, reads each use-cases/{UC-ID}.md in table order, and reconstructs the 9-section document via spliceSection2), plus a require.main === module CLI entry point printing the assembled document to stdout
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-04, AC-07
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 34000
- **Output count:** 1
- **Grouping rationale:** The loader, the table parser, and the section-2 splicer have no independent meaning or verifiable output on their own — `loadRequirements` is not callable until all three exist together, same reasoning FTR-020 applied to its single-module skeleton-check extraction.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add req-assembler.js with directory/legacy loader and section-2 splicer

**Implementation notes:**

From Tech-Spec §4:

```js
'use strict';
const fs = require('fs');
const path = require('path');

const SECTION_RE = /^## (\d+)\.\s/m;

function findSectionRange(content, sectionNumber) {
  const lines = content.split('\n');
  let start = -1, end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^## (\d+)\.\s/);
    if (!m) continue;
    const n = Number(m[1]);
    if (n === sectionNumber) start = i;
    else if (start !== -1 && n > sectionNumber) { end = i; break; }
  }
  if (start === -1) throw new AssemblyError(`req/index.md is missing section ${sectionNumber}`);
  return { start, end, lines };
}

// First Markdown table found between the "## 2. Use Cases" heading and the next "## 3." heading.
function parseUseCaseIndexTable(indexContent) {
  const { start, end, lines } = findSectionRange(indexContent, 2);
  const tableLines = lines.slice(start, end).filter(l => l.trim().startsWith('|'));
  const rows = tableLines.slice(2); // drop header + separator row
  return rows.map(line => {
    const cells = line.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    const [id, title, actor, priority, fileCol] = cells;
    const fileMatch = fileCol.match(/\(([^)]+)\)/);       // "[use-cases/UC-01.md](use-cases/UC-01.md)"
    if (!fileMatch) throw new AssemblyError(`malformed File column for UC "${id}" in req/index.md`);
    return { id, title, actor, priority, file: fileMatch[1] };
  });
}

function spliceSection2(indexContent, section2Body) {
  const { start, end, lines } = findSectionRange(indexContent, 2);
  const heading = lines[start]; // "## 2. Use Cases"
  const before = lines.slice(0, start + 1).join('\n');
  const after = lines.slice(end).join('\n');
  return `${before}\n\n${section2Body}\n\n${after}`;
}

class AssemblyError extends Error {}

function loadRequirements(inputPath) {
  const stat = fs.statSync(inputPath, { throwIfNoEntry: false });
  if (!stat) throw new AssemblyError(`path does not exist: ${inputPath}`);
  if (stat.isFile()) return fs.readFileSync(inputPath, 'utf8');   // legacy path (AC-07)

  const indexPath = path.join(inputPath, 'index.md');
  if (!fs.existsSync(indexPath)) throw new AssemblyError(`missing req/index.md at ${indexPath}`);
  const indexContent = fs.readFileSync(indexPath, 'utf8');

  const ucTable = parseUseCaseIndexTable(indexContent);
  if (ucTable.length === 0) throw new AssemblyError('req/index.md has no rows in its Use Cases index table');

  const ucBlocks = ucTable.map(row => {
    const ucPath = path.join(inputPath, row.file);
    if (!fs.existsSync(ucPath)) throw new AssemblyError(`use case "${row.id}" has no detail file at ${ucPath}`);
    return fs.readFileSync(ucPath, 'utf8').trimEnd();
  });

  return spliceSection2(indexContent, ucBlocks.join('\n\n'));
}

if (require.main === module) {
  const inputPath = process.argv[2];
  process.stdout.write(loadRequirements(path.resolve(inputPath)));
}

module.exports = { loadRequirements, parseUseCaseIndexTable, spliceSection2, AssemblyError };
```

The `File` column's link target (not its link text) is the authoritative path — matches the
templates' `[use-cases/{UC-ID}.md](use-cases/{UC-ID}.md)` convention, where both happen to be
identical strings today but only the parenthesized target is parsed, per Tech-Spec §4.

**Verification commands:**

```
node --check src/claude/scripts/req-assembler.js
```
