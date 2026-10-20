# src/claude/scripts/req-skeleton-check.js — Modified

## Change

Calls the new `parseTableHeader`/`checkAcTableHeader` on the Acceptance Criteria table's header row
BEFORE `parseAcTable`'s positional destructure runs across data rows. On a malformed header,
`acTable` is treated as empty for the rest of this invocation (never positionally parsed on garbage
data) and the header error is folded into the SAME unified `errors[]` array/exit-code convention
this script already uses — no new output shape, no new exit-code meaning.

## Algorithm

Replace the current parse block (`req-skeleton-check.js:16, 33-41`):

```js
// before:
const { parseUseCaseIndexTable, parseAcTable, parseBusinessRulesTable } = require('./req-assembler')
...
let ucTable, acTable, businessRules
try {
  ucTable = parseUseCaseIndexTable(indexContent)
  acTable = parseAcTable(indexContent)
  businessRules = parseBusinessRulesTable(indexContent)
} catch (e) {
  console.log(JSON.stringify({ valid: false, errors: [{ message: `parse failure: ${e.message}` }] }))
  process.exit(2)
}

// after:
const { parseUseCaseIndexTable, parseAcTable, parseBusinessRulesTable, findSectionRange, parseTableHeader } = require('./req-assembler')
...
let ucTable, acTable, businessRules
const acHeaderErrors = []
try {
  ucTable = parseUseCaseIndexTable(indexContent)
  const { start, end, lines } = findSectionRange(indexContent, 7)
  acHeaderErrors.push(...graphChecks.checkAcTableHeader(parseTableHeader(lines, start, end)))
  acTable = acHeaderErrors.length ? [] : parseAcTable(indexContent)
  businessRules = parseBusinessRulesTable(indexContent)
} catch (e) {
  console.log(JSON.stringify({ valid: false, errors: [{ message: `parse failure: ${e.message}` }] }))
  process.exit(2)
}
```

And fold `acHeaderErrors` into the existing unified `errors` array (`req-skeleton-check.js:49-58`):

```js
const errors = [
  ...acHeaderErrors,
  ...graphChecks.checkUniqueUcIds({ ucIds }),
  ...graphChecks.checkUcIdFormat({ ucIds }),
  ...graphChecks.checkUcTableFileParity({ ucIds }, existingUcFiles),
  ...graphChecks.checkCrossReferencesResolve({
    ucIds,
    acTable: acTable.map(a => ({ id: a.id, relatedUc: a.relatedUc })),
    businessRules: businessRules.map(b => ({ id: b.id, appliesTo: b.appliesTo })),
  }),
]
```

With `acTable` forced to `[]` on a malformed header, `checkCrossReferencesResolve`'s own
`acTable`-related checks correctly produce zero additional (and potentially misleading) findings
for that run — the `MALFORMED_AC_TABLE_HEADER` error is the only signal, not buried among a cascade
of `DANGLING_AC_UC_REFERENCE` noise from garbage-parsed data.

## Tests

See `components/req-skeleton-check.test.js.md` for the new end-to-end CLI fixture tests.
