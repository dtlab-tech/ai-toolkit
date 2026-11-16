'use strict'

const fs = require('fs')
const path = require('path')
const graphChecks = require('./wb-graph-checks')
const { parseTaskDetailBlock } = require('./wbs-assembler')

// Early, per-task form of wb-validate.js's check 24 (a task must have a verification command that can
// fail before its deliverable exists), run by pm-phase2.js right after each task detail is written so
// a weak task is repaired once, immediately, instead of failing the whole structural validation after
// every task of the feature has been generated.
//
// Usage: node wb-task-check.js <path-to-task-detail.md> [<task-id>]
// stdout: { valid, taskId, commands, errors }   exit: 0 valid, 1 invalid, 2 usage/read error
// pm-phase2.js's runtime has no `require`, so it invokes this as a subprocess (same pattern as
// wb-skeleton-check.js).

const detailPath = process.argv[2]
const taskId = process.argv[3] || path.basename(String(detailPath || ''), '.md')

if (!detailPath) {
  process.stderr.write('Error: missing required argument <path-to-task-detail.md>\n')
  process.exit(2)
}

let text
try {
  text = fs.readFileSync(path.resolve(detailPath), 'utf8')
} catch (err) {
  process.stderr.write(`Error: cannot read "${detailPath}": ${err.message}\n`)
  process.exit(2)
}

const commands = parseTaskDetailBlock(text).verificationCommands
const errors = graphChecks.checkVerificationDiscriminates([
  { id: 'task', tasks: [{ id: taskId, verification: { commands } }] },
])
const valid = errors.length === 0
process.stdout.write(JSON.stringify({ valid, taskId, commands, errors }, null, 2) + '\n')
process.exit(valid ? 0 : 1)
