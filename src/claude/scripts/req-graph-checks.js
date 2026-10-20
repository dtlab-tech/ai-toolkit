'use strict'

// FTR-021: 4 pure self-consistency check functions for the split Requirements format
// (req/index.md). Mirrors wb-graph-checks.js's convention: no file I/O, no process.exit,
// just plain functions over an already-parsed plain object, returning an array of error
// objects. The actual Markdown parsing lives in req-assembler.js / req-skeleton-check.js.

const UC_ID_RE = /^UC-\d{2,}$/

function checkUniqueUcIds({ ucIds }) {
  const seen = new Set()
  const duplicates = new Set()
  for (const id of ucIds) {
    if (seen.has(id)) duplicates.add(id)
    else seen.add(id)
  }
  return [...duplicates].map(id => ({
    category: 'DUPLICATE_UC_ID', severity: 'error', ucId: id,
    message: `Duplicate UC ID "${id}" appears more than once in the use-case index table`,
  }))
}

function checkUcIdFormat({ ucIds }) {
  return ucIds.filter(id => !UC_ID_RE.test(id)).map(id => ({
    category: 'INVALID_UC_ID_FORMAT', severity: 'error', ucId: id,
    message: `UC ID "${id}" does not match the required UC-NN format`,
  }))
}

// Orphan-file direction only: a use-cases/*.md file that no longer corresponds to any row
// in the current table (e.g. left over after a UC was renamed/removed from a hand-edited
// index.md). Deliberately NOT bidirectional — this check runs BEFORE per-use-case
// dispatch, when every row is expected to have no file yet, so "table row without a file"
// is the normal pre-dispatch state, not an error. That direction is enforced correctly,
// after generation, by req-assembler.js's own missing-file error at assembly time.
function checkUcTableFileParity({ ucIds }, existingUcFiles) {
  const idSet = new Set(ucIds)
  return existingUcFiles.filter(id => !idSet.has(id)).map(id => ({
    category: 'UC_FILE_WITHOUT_TABLE_ROW', severity: 'error', ucId: id,
    message: `use-cases/${id}.md exists but has no row in the use-case index table`,
  }))
}

function checkCrossReferencesResolve({ ucIds, acTable, businessRules }) {
  const idSet = new Set(ucIds)
  const errors = []
  const checkRefs = (rows, idField, refField, category) => {
    for (const row of rows) {
      const raw = row[refField]
      if (raw == null || raw.trim() === 'All UCs') continue
      for (const ref of raw.split(',').map(s => s.trim()).filter(Boolean)) {
        if (!idSet.has(ref)) {
          errors.push({
            category, severity: 'error', id: row[idField], ucId: ref,
            message: `${row[idField]}'s "${refField}" references unknown UC "${ref}"`,
          })
        }
      }
    }
  }
  checkRefs(acTable || [], 'id', 'relatedUc', 'DANGLING_AC_UC_REFERENCE')
  checkRefs(businessRules || [], 'id', 'appliesTo', 'DANGLING_BR_UC_REFERENCE')
  return errors
}

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

module.exports = {
  checkUniqueUcIds,
  checkUcIdFormat,
  checkUcTableFileParity,
  checkCrossReferencesResolve,
  checkAcTableHeader,
}
