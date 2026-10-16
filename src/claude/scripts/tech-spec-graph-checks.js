#!/usr/bin/env node
'use strict'

// FTR-023: deterministic structural check that every Tech-Spec File Inventory "Addresses"
// reference resolves to a real Requirements AC ID. Combined parse/check/CLI in one file — unlike
// wb-graph-checks.js/req-graph-checks.js (several checks, multiple consumers), this feature has
// exactly one check used in exactly one context, so a separate checks-module + CLI-wrapper split
// isn't justified.

const fs = require('fs')
const path = require('path')
const { findSectionRange, parseTableRows } = require('./req-assembler')
const { parseAcTable } = require('./wb-graph-checks')

// Locates a "### {heading}" line within [start, end) and returns its own sub-range, up to the
// next "###" or "##" heading (or `end`). Tech-Spec-specific: req-assembler.js's
// findSectionRange only knows about numbered "## N." headings, one level up from this.
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
    if (!sub) continue // a Tech-Spec with only one of the two tables is valid (e.g. a pure-addition feature)
    for (const cells of parseTableRows(lines, sub.start, sub.end)) {
      const filePath = cells[0]
      const addressesCell = cells[2] // Path | Purpose-or-Change-description | Addresses
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
