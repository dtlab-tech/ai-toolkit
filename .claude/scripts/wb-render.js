'use strict'

const fs   = require('fs')
const path = require('path')

// ── Argument parsing ──────────────────────────────────────────────────────────

const jsonPath = process.argv[2]
const prefix   = process.argv[3]

if (!jsonPath || !prefix) {
  process.stderr.write('Usage: node wb-render.js <path-to-work-breakdown.json> <feature-prefix> [destination-dir]\n')
  process.exit(1)
}

const destDir = process.argv[4]
  ? process.argv[4]
  : path.dirname(path.resolve(jsonPath))

// ── Read and parse JSON ───────────────────────────────────────────────────────

let raw
try {
  raw = fs.readFileSync(jsonPath, 'utf8')
} catch (err) {
  process.stderr.write(`Error: cannot read file "${jsonPath}": ${err.message}\n`)
  process.exit(1)
}

let wb
try {
  wb = JSON.parse(raw)
} catch (err) {
  process.stderr.write(`Error: "${jsonPath}" is not valid JSON: ${err.message}\n`)
  process.exit(1)
}

// ── Basic structure check ─────────────────────────────────────────────────────

if (wb.schemaVersion !== 2) {
  process.stderr.write(`Error: schemaVersion must be 2, got ${JSON.stringify(wb.schemaVersion)}\n`)
  process.exit(2)
}

if (!Array.isArray(wb.phases)) {
  process.stderr.write('Error: "phases" must be an array\n')
  process.exit(2)
}

// ── Output file paths ─────────────────────────────────────────────────────────

const mdPath  = path.join(destDir, `${prefix}-Work-Breakdown.md`)
const csvPath = path.join(destDir, `${prefix}-Work-Breakdown.csv`)

// ── Render stubs (implemented in T02–T05) ─────────────────────────────────────

function renderMarkdown(wb, prefix) {
  // TODO: implemented in T02-T04
  return ''
}

function renderCsv(wb, prefix) {
  // TODO: implemented in T02, T05
  return ''
}

// ── Write files and exit ──────────────────────────────────────────────────────

const md  = renderMarkdown(wb, prefix)
const csv = renderCsv(wb, prefix)
fs.writeFileSync(mdPath, md, 'utf8')
fs.writeFileSync(csvPath, csv, 'utf8')
process.stdout.write(JSON.stringify({ exitCode: 0, markdownPath: mdPath, csvPath }) + '\n')
process.exit(0)
