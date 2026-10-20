# src/claude/scripts/req-graph-checks.js — Modified

## Change

Adds `checkAcTableHeader(headerCells)`, a new pure, I/O-free check function, mirroring
`wb-graph-checks.js`'s existing AC-table header check for the Work-Breakdown-side document exactly
(same column names, same order, same tolerance for a missing trailing `Priority` column).

## Algorithm

Add near the existing check functions (`checkUniqueUcIds`, `checkUcIdFormat`, etc.):

```js
// UC-02: the AC table's first 3 columns must be exactly "ID", "Criterion", "Related UC" in that
// order — mirrors wb-graph-checks.js's own identical check for the Work-Breakdown-side AC table
// (same names, same order, same "at least 3 columns" tolerance for a missing trailing Priority
// column). Runs BEFORE req-assembler.js's parseAcTable positional destructure, so a malformed
// header is reported as its own distinct, correctly-attributed error instead of a misleading
// downstream DANGLING_AC_UC_REFERENCE (the real incident this closes: a 5-column table shifted
// every cell, silently misattributing "When [...]" text into the Related UC field).
function checkAcTableHeader(headerCells) {
  if (!headerCells || headerCells.length < 3) {
    return [{
      category: 'MALFORMED_AC_TABLE_HEADER', severity: 'error',
      message: `AC table header has fewer than 3 columns (found ${headerCells ? headerCells.length : 0})`,
    }]
  }
  if (headerCells[0] !== 'ID' || headerCells[1] !== 'Criterion' || headerCells[2] !== 'Related UC') {
    return [{
      category: 'MALFORMED_AC_TABLE_HEADER', severity: 'error',
      message: `AC table columns must be "ID", "Criterion", "Related UC" in order; got "${headerCells[0]}", "${headerCells[1]}", "${headerCells[2]}"`,
    }]
  }
  return []
}
```

Export it alongside the existing functions:

```js
module.exports = {
  checkUniqueUcIds,
  checkUcIdFormat,
  checkUcTableFileParity,
  checkCrossReferencesResolve,
  checkAcTableHeader,
}
```

## Tests

`tests/req-graph-checks.test.js` (pre-existing, real `require()` of this module) gains direct unit
tests for `checkAcTableHeader`: a correct 4-column header produces no errors; a correct 3-column
header (no trailing `Priority`) also produces no errors (BR-03's own tolerance); fewer than 3
columns, or the first 3 not exactly `ID`/`Criterion`/`Related UC` in order, each produce exactly one
`MALFORMED_AC_TABLE_HEADER` error with a precise message.
