'use strict'

// Regression guard for the Gate-2 blocker: wb-render.js must render each task's
// executable verification commands VERBATIM (byte-for-byte) in the Markdown, never
// passed through sanitizeField() — which maps `|` → space and would destroy `||`,
// shell pipes, and regex alternations. Descriptive tabular fields (title, outcome…)
// remain sanitised; only verification commands are lossless.

const { spawnSync } = require('child_process')
const os   = require('os')
const fs   = require('fs')
const path = require('path')

const RENDER = path.resolve(__dirname, '../src/claude/scripts/wb-render.js')
const TMPDIR = os.tmpdir()

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeTask(id, verificationCommands, overrides) {
  return Object.assign({
    id,
    title: `Task ${id}`,
    domain: 'BE',
    agentType: 'developer-backend',
    agentMinutes: 10,
    outcome: `outcome of ${id}`,
    dependsOn: [],
    verification: { commands: verificationCommands },
    commit: { type: 'feat', scope: 'wb', subject: `implement ${id}` }
  }, overrides)
}

function makePhase(id, title, tasks) {
  return { id, title, commit: { type: 'feat', scope: id, subject: `implement ${id}` }, tasks }
}

function makeWb(phases) {
  return { schemaVersion: 2, feature: 'TEST', title: 'Lossless WB', phases }
}

function writeFixture(wb) {
  const p = path.join(TMPDIR, `wb-lossless-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  fs.writeFileSync(p, JSON.stringify(wb), 'utf8')
  return p
}

function render(wb, prefix) {
  const jsonPath = writeFixture(wb)
  const destDir  = fs.mkdtempSync(path.join(TMPDIR, 'wb-lossless-out-'))
  const result   = spawnSync(process.execPath, [RENDER, jsonPath, prefix, destDir], { encoding: 'utf8' })
  const md  = fs.readFileSync(path.join(destDir, `${prefix}-Work-Breakdown.md`), 'utf8')
  const csv = fs.readFileSync(path.join(destDir, `${prefix}-Work-Breakdown.csv`), 'utf8')
  return { result, md, csv, cleanup: () => {
    fs.rmSync(destDir, { recursive: true, force: true })
    try { fs.unlinkSync(jsonPath) } catch (_) {}
  } }
}

// Extract, from rendered Markdown, the array of fenced-code-block bodies that appear
// under a given task's detail heading (### <taskId>), after the
// "**Verification commands:**" marker, stopping at the next heading. The fence length
// is dynamic, so we match a run of >=3 backticks and pair each opening fence with the
// next identical-length closing fence.
function extractVerificationCommands(md, taskId) {
  const lines = md.split('\n')
  // find the heading line "### <taskId>"
  let i = lines.findIndex(l => l === `### ${taskId}`)
  if (i === -1) return null
  i++ // move past heading
  // advance to the verification-commands marker (skipping the field bullet list),
  // but do not cross into the next task's heading
  while (i < lines.length && lines[i] !== '**Verification commands:**') {
    if (/^#{1,3} /.test(lines[i])) return []   // no marker before next heading
    i++
  }
  i++ // move past the marker
  const cmds = []
  while (i < lines.length) {
    const line = lines[i]
    if (/^#{1,3} /.test(line)) break            // next heading → this task's section ended
    const openMatch = line.match(/^(`{3,})$/)   // opening fence (no info string)
    if (openMatch) {
      const fence = openMatch[1]
      const body = []
      i++
      while (i < lines.length && lines[i] !== fence) { body.push(lines[i]); i++ }
      cmds.push(body.join('\n'))
      i++ // skip closing fence
      continue
    }
    i++
  }
  return cmds
}

// ─────────────────────────────────────────────────────────────────────────────
// Group 1: verification commands are preserved byte-for-byte
// ─────────────────────────────────────────────────────────────────────────────

describe('wb-render.js — verification commands are lossless in Markdown', () => {

  // A single task carrying every hazardous shape the sanitiser used to destroy.
  const HAZARD_COMMANDS = [
    // 1. logical-OR operator
    `node -e "const a=1,b=2,d=3; if(a===b || a===d || b===d){process.exit(1)}"`,
    // 2. a single shell pipe
    `grep -q 'status' file.txt | wc -l`,
    // 3. regex alternation inside grep -E
    `grep -E 'status|exit|hard-stop' out.log`,
    // 4. quotes and a path containing spaces
    `node --check "src/my folder/exec ledger.js"`,
    // 5. typeof ... || typeof ... guard
    `node -e "const m=require('./m'); if(typeof m.a!=='function' || typeof m.b!=='function'){process.exit(2)}"`,
  ]

  let rendered
  beforeAll(() => {
    const task  = makeTask('US-01-TASK-BE-01', HAZARD_COMMANDS)
    const phase = makePhase('US-01', 'Story One', [task])
    rendered = render(makeWb([phase]), 'LOSSLESS')
  })
  afterAll(() => { if (rendered) rendered.cleanup() })

  test('renderer exits 0', () => {
    expect(rendered.result.status).toBe(0)
  })

  test('an authoritative "Task Details" section is emitted', () => {
    expect(rendered.md).toContain('## Task Details')
    expect(rendered.md).toContain('### US-01-TASK-BE-01')
    expect(rendered.md).toContain('**Verification commands:**')
  })

  test('every verification command is recoverable from the Markdown byte-for-byte, in order', () => {
    const recovered = extractVerificationCommands(rendered.md, 'US-01-TASK-BE-01')
    expect(recovered).not.toBeNull()
    expect(recovered).toEqual(HAZARD_COMMANDS)
  })

  test('each recovered command is character-identical (no substitution) to the source', () => {
    const recovered = extractVerificationCommands(rendered.md, 'US-01-TASK-BE-01')
    expect(recovered).toHaveLength(HAZARD_COMMANDS.length)
    for (let k = 0; k < HAZARD_COMMANDS.length; k++) {
      const src = HAZARD_COMMANDS[k]
      const got = recovered[k]
      // exact length and codepoint-for-codepoint identity
      expect(got.length).toBe(src.length)
      expect([...got]).toEqual([...src])
      // the specific operators the sanitiser used to destroy are present verbatim
      if (src.includes('||')) expect(got).toContain('||')
    }
  })

  test('the `||` operator is NOT collapsed to spaces anywhere in the section', () => {
    // The old bug produced "a===b  a===d" (double space where "||" stood).
    expect(rendered.md).toContain('a===b || a===d || b===d')
    expect(rendered.md).not.toContain('a===b  a===d  b===d')
  })

  test('the regex alternation grep -E \'status|exit|hard-stop\' survives verbatim', () => {
    expect(rendered.md).toContain(`grep -E 'status|exit|hard-stop' out.log`)
  })

  test('a quoted path containing spaces survives verbatim', () => {
    expect(rendered.md).toContain(`node --check "src/my folder/exec ledger.js"`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group 2: distinction — tabular fields stay sanitised, commands stay lossless
// ─────────────────────────────────────────────────────────────────────────────

describe('wb-render.js — tabular sanitisation vs command losslessness are distinct', () => {

  let rendered
  const CMD_WITH_PIPES = `test -f a.js || test -f b.js`
  beforeAll(() => {
    // Title carries a pipe (must be sanitised); the command carries `||` (must survive).
    const task  = makeTask('US-02-TASK-BE-01', [CMD_WITH_PIPES], { title: 'render|table|field' })
    const phase = makePhase('US-02', 'Story Two', [task])
    rendered = render(makeWb([phase]), 'DISTINCT')
  })
  afterAll(() => { if (rendered) rendered.cleanup() })

  test('in the SUMMARY TABLE the title is sanitised — raw pipe absent, spaces present', () => {
    // Scope the assertion to the summary-table row for this task (the table uses `|`
    // as a column separator, so descriptive fields must be sanitised there). The
    // authoritative Task Details section renders the SAME title verbatim (asserted
    // below) — the two representations are intentionally distinct.
    const tableRow = rendered.md.split('\n').find(l => l.startsWith('| US-02-TASK-BE-01 |'))
    expect(tableRow).toBeDefined()
    expect(tableRow).toContain('render table field')
    expect(tableRow).not.toContain('render|table|field')
  })

  test('in the TASK DETAILS section the same title is rendered verbatim (with its pipes)', () => {
    // Detail fields live outside any table, so pipes must survive byte-for-byte.
    expect(rendered.md).toContain('- **Title:** render|table|field')
  })

  test('CSV structure is protected: every data row still has exactly 8 columns', () => {
    const dataRows = rendered.csv.split('\n').filter((l, i) => i > 0 && l.trim() !== '')
    expect(dataRows.length).toBeGreaterThan(0)
    for (const row of dataRows) expect(row.split('|')).toHaveLength(8)
  })

  test('executable command IS lossless — `||` recoverable byte-for-byte', () => {
    const recovered = extractVerificationCommands(rendered.md, 'US-02-TASK-BE-01')
    expect(recovered).toEqual([CMD_WITH_PIPES])
  })

  test('the task-table Verification cell is a reference, not the sanitised command', () => {
    // It must link to the authoritative detail anchor and must NOT contain a mangled
    // copy of the command.
    expect(rendered.md).toContain('[details](#task-US-02-TASK-BE-01)')
    // the anchor target exists
    expect(rendered.md).toContain('<a id="task-US-02-TASK-BE-01"></a>')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group 3: fence-length safety for commands containing backticks
// ─────────────────────────────────────────────────────────────────────────────

describe('wb-render.js — fenced block never broken by backticks inside a command', () => {

  test('a command containing a triple-backtick run is still recoverable verbatim', () => {
    const cmd = 'echo ```danger``` && node --check x.js'
    const task  = makeTask('US-03-TASK-BE-01', [cmd])
    const phase = makePhase('US-03', 'Story Three', [task])
    const rendered = render(makeWb([phase]), 'FENCE')
    try {
      const recovered = extractVerificationCommands(rendered.md, 'US-03-TASK-BE-01')
      expect(recovered).toEqual([cmd])
    } finally {
      rendered.cleanup()
    }
  })
})
