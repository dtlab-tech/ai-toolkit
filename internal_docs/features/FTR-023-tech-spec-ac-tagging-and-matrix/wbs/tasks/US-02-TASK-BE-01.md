<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Export parseTableRows and create tech-spec-graph-checks.js
- **Outcome:** req-assembler.js's module.exports gains parseTableRows (already implemented internally, now exported, zero behavior change); src/claude/scripts/tech-spec-graph-checks.js exists exporting parseFileInventoryEntries(techSpecContent), checkAddressesResolve(entries, validAcIds), findSubsectionRange(lines, start, end, heading), plus a require.main CLI mode printing a JSON validity report
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-02, AC-03, AC-04, AC-06
- **Estimate — agent minutes:** 22
- **Estimate — tokens:** 36000
- **Output count:** 1
- **Grouping rationale:** The `parseTableRows` export and the new script are one task because the export exists solely to be consumed by this script — there is no independent way to verify "parseTableRows is exported" except by using it, and this script is its only consumer.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add tech-spec-graph-checks.js and export req-assembler.js's parseTableRows

**Implementation notes:**

Step 1 — `req-assembler.js`'s `module.exports` (one-line addition, nothing else in that file
changes):

```js
module.exports = {
  loadRequirements,
  parseUseCaseIndexTable,
  parseAcTable,
  parseBusinessRulesTable,
  spliceSection2,
  findSectionRange,
  parseTableRows,
  AssemblyError,
}
```

Step 2 — new file, from Tech-Spec §4 verbatim:

```js
#!/usr/bin/env node
'use strict'
const fs = require('fs')
const path = require('path')
const { findSectionRange, parseTableRows } = require('./req-assembler')
const { parseAcTable } = require('./wb-graph-checks')

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
    if (!sub) continue
    for (const cells of parseTableRows(lines, sub.start, sub.end)) {
      const filePath = cells[0]
      const addressesCell = cells[2]
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

Note `findSectionRange(techSpecContent, 9)` throws (`AssemblyError`, propagated unmodified) if
Tech-Spec has no `## 9.` heading at all — this is intentional per Tech-Spec §4/§7: there is no
separate "Tech-Spec is missing §9" error class for this script to invent, it reuses
`req-assembler.js`'s existing error exactly as-is.

**Verification commands:**

```
node --check src/claude/scripts/req-assembler.js
node --check src/claude/scripts/tech-spec-graph-checks.js
```
