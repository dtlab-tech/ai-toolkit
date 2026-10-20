#!/usr/bin/env node
'use strict'

// FTR-021: deterministic structural pre-check for a Requirements skeleton (req/index.md),
// run by pm-phase1.js before any per-use-case generation call is dispatched (UC-02).
//
// This is a separate script from req-assembler.js's CLI mode, not a reuse of it, because
// pm-phase1.js's workflow-script runtime has no `require` (lib/workflow-runner.js) — this
// is invoked as a real Node subprocess via `c.command(['run-asset',
// 'scripts/req-skeleton-check.js', ...])`, the same pattern already used for
// wb-skeleton-check.js/wb-validate.js/wb-render.js (FTR-020).

const fs = require('fs')
const path = require('path')
const graphChecks = require('./req-graph-checks')
const { parseUseCaseIndexTable, parseAcTable, parseBusinessRulesTable, findSectionRange, parseTableHeader } = require('./req-assembler')

function main() {
  const indexPath = process.argv[2]
  if (!indexPath) {
    process.stderr.write('Usage: node req-skeleton-check.js <path-to-req-index.md>\n')
    process.exit(2)
  }

  let indexContent
  try {
    indexContent = fs.readFileSync(indexPath, 'utf8')
  } catch (e) {
    console.log(JSON.stringify({ valid: false, errors: [{ message: `cannot read ${indexPath}: ${e.message}` }] }))
    process.exit(2)
  }

  let ucTable, acTable, businessRules
  const acHeaderErrors = []
  try {
    ucTable = parseUseCaseIndexTable(indexContent)
    // UC-02: validate the AC table's column header BEFORE parseAcTable's positional destructure
    // ever runs across data rows — a malformed header (e.g. a 5-column table) must never be
    // silently misparsed into the wrong fields.
    const { start, end, lines } = findSectionRange(indexContent, 7)
    acHeaderErrors.push(...graphChecks.checkAcTableHeader(parseTableHeader(lines, start, end)))
    acTable = acHeaderErrors.length ? [] : parseAcTable(indexContent)
    businessRules = parseBusinessRulesTable(indexContent)
  } catch (e) {
    console.log(JSON.stringify({ valid: false, errors: [{ message: `parse failure: ${e.message}` }] }))
    process.exit(2)
  }

  const ucIds = ucTable.map(r => r.id)
  const useCasesDir = path.join(path.dirname(indexPath), 'use-cases')
  const existingUcFiles = fs.existsSync(useCasesDir)
    ? fs.readdirSync(useCasesDir).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
    : []

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

  console.log(JSON.stringify({ valid: errors.length === 0, errors }, null, 2))
  process.exit(errors.length === 0 ? 0 : 1)
}

main()
