# src/claude/scripts/req-assembler.js — Modified

## Change

Adds `parseTableHeader(lines, start, end)`, the one piece of information `parseTableRows` already
discards (it drops the header and separator rows by design, returning only data rows) — needed by
UC-02's new AC-table header check.

## Algorithm

Add near `parseTableRows` (currently `req-assembler.js:32-39`):

```js
// Returns the raw header-row cells for the first Markdown table found inside [start, end), or
// null if no table is present at all. Companion to parseTableRows, which deliberately discards
// this same row — UC-02's AC-table header validation needs it back.
function parseTableHeader(lines, start, end) {
  const tableLines = lines.slice(start, end).filter(l => l.trim().startsWith('|'))
  if (tableLines.length < 1) return null
  return tableLines[0].split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1)
}
```

Export it alongside the existing `findSectionRange`/`parseTableRows`:

```js
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
```

No change to `parseAcTable`, `loadRequirements`, or any other existing export — this is a pure
addition.

## Tests

`tests/req-assembler.test.js` (pre-existing, real `require()` of this module — not a mirror) gains
a direct unit test for `parseTableHeader`: returns the header cells for a well-formed table, returns
`null` for a section with no table at all, and correctly excludes the separator row (`|---|---|`)
from its result. Also exercised indirectly through `components/req-skeleton-check.test.js.md`'s
real CLI-level fixtures.
