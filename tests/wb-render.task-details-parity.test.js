'use strict'

// Gate-2 parity guard: the "Task Details" section of the rendered Work Breakdown must
// integrally represent EVERY task field, so the Markdown (plus the dispatch CSV) is a
// complete deliverable and the intermediate JSON can be deleted. This test renders a
// fixture and reconstructs each field from the Markdown, asserting:
//   • verification commands are byte-for-byte identical to the JSON;
//   • all other fields (id, title, outcome, domain, agent type, dependencies,
//     acceptance criteria, estimate agentMinutes + tokens, output count, grouping
//     rationale, commit type/scope/subject) are recovered unambiguously and equal to
//     the JSON — including free-text fields carrying pipes, which must NOT be
//     sanitised in the detail section.

const { spawnSync } = require('child_process')
const os   = require('os')
const fs   = require('fs')
const path = require('path')

const RENDER = path.resolve(__dirname, '../src/claude/scripts/wb-render.js')
const TMPDIR = os.tmpdir()

// ── Fixture ───────────────────────────────────────────────────────────────────

// Task A: fully populated, with pipes in free-text fields (title, outcome, grouping,
// commit subject) and hazardous verification commands. Task B: minimal — empty deps
// and acceptance criteria, no commit scope, and no verification commands.
const TASK_A = {
  id: 'US-01-TASK-BE-01',
  title: 'Implement thing|with|pipe',
  outcome: 'Do X || fallback Y; grep -E "a|b|c" is preserved here',
  domain: 'BE',
  agentType: 'developer-backend',
  dependsOn: ['INFRA-TASK-BE-01', 'US-00-TASK-BE-02'],
  acceptanceCriteria: ['AC-01', 'AC-13'],
  verification: { commands: [
    'node --check "src/my folder/exec ledger.js"',
    `grep -E 'status|exit|hard-stop' out.log || exit 1`,
    'echo ```danger``` && node --check x.js',
  ] },
  estimate: { agentMinutes: 13, tokens: 32000 },
  outputCount: 1,
  groupingRationale: 'Bundled A|B because they share a single output',
  commit: { type: 'feat', scope: 'core', subject: 'add thing with | pipe' },
}

const TASK_B = {
  id: 'US-01-TASK-TEST-01',
  title: 'Second task',
  outcome: 'A plain outcome with no special characters',
  domain: 'TEST',
  agentType: 'developer-testing',
  dependsOn: [],
  acceptanceCriteria: [],
  verification: { commands: [] },
  estimate: { agentMinutes: 8, tokens: 20000 },
  outputCount: 2,
  groupingRationale: 'Atomic task with a single verifiable output; no grouping required.',
  commit: { type: 'test', subject: 'add tests for the second task' },
}

const WB = {
  schemaVersion: 2,
  feature: 'PARITY',
  title: 'Parity WB',
  phases: [
    { id: 'US-01', title: 'Story One', commit: { type: 'feat', scope: 'US-01', subject: 'story one' }, tasks: [TASK_A, TASK_B] },
  ],
}

// ── Render once ─────────────────────────────────────────────────────────────────

let md, csv, cleanup
beforeAll(() => {
  const jsonPath = path.join(TMPDIR, `wb-parity-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify(WB), 'utf8')
  const destDir = fs.mkdtempSync(path.join(TMPDIR, 'wb-parity-out-'))
  spawnSync(process.execPath, [RENDER, jsonPath, 'PARITY', destDir], { encoding: 'utf8' })
  md  = fs.readFileSync(path.join(destDir, 'PARITY-Work-Breakdown.md'), 'utf8')
  csv = fs.readFileSync(path.join(destDir, 'PARITY-Work-Breakdown.csv'), 'utf8')
  cleanup = () => {
    fs.rmSync(destDir, { recursive: true, force: true })
    try { fs.unlinkSync(jsonPath) } catch (_) {}
  }
})
afterAll(() => { if (cleanup) cleanup() })

// ── Recovery helpers (parse the Markdown back into a task record) ────────────────

// Parse the "- **Label:** value" bullet lines and the fenced verification commands
// that live under a task's "### <id>" heading in the Task Details section.
function recoverTask(md, taskId) {
  const lines = md.split('\n')
  let i = lines.findIndex(l => l === `### ${taskId}`)
  if (i === -1) return null
  i++
  const fields = {}
  // bullet field list, until the verification-commands marker or next heading
  while (i < lines.length && lines[i] !== '**Verification commands:**') {
    if (/^#{1,3} /.test(lines[i])) break
    const m = lines[i].match(/^- \*\*(.+?):\*\* (.*)$/)
    if (m) fields[m[1]] = m[2]
    i++
  }
  // verification commands
  const commands = []
  if (lines[i] === '**Verification commands:**') {
    i++
    while (i < lines.length) {
      const line = lines[i]
      if (/^#{1,3} /.test(line)) break
      const open = line.match(/^(`{3,})$/)
      if (open) {
        const fence = open[1]
        const body = []
        i++
        while (i < lines.length && lines[i] !== fence) { body.push(lines[i]); i++ }
        commands.push(body.join('\n'))
        i++
        continue
      }
      i++
    }
  }
  return { fields, commands }
}

// Expected bullet-field map for a source task, using the exact labels the renderer
// emits (em-dash U+2014 written explicitly to avoid any encoding ambiguity).
function expectedFields(task) {
  const dash = '—'
  const list = a => (Array.isArray(a) && a.length > 0) ? a.join(', ') : '—'
  return {
    'Task ID': task.id,
    'Title': task.title,
    'Outcome': task.outcome,
    'Domain': task.domain,
    'Agent type': task.agentType,
    'Dependencies': list(task.dependsOn),
    'Acceptance criteria': list(task.acceptanceCriteria),
    [`Estimate ${dash} agent minutes`]: String(task.estimate.agentMinutes),
    [`Estimate ${dash} tokens`]: String(task.estimate.tokens),
    'Output count': String(task.outputCount),
    'Grouping rationale': task.groupingRationale,
    'Commit type': task.commit.type,
    'Commit scope': task.commit.scope != null ? task.commit.scope : '—',
    'Commit subject': task.commit.subject,
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('wb-render.js — Task Details section is an authoritative, complete deliverable', () => {

  test('a "## Task Details" section exists with an anchor + heading per task', () => {
    expect(md).toContain('## Task Details')
    for (const t of [TASK_A, TASK_B]) {
      expect(md).toContain(`<a id="task-${t.id}"></a>`)
      expect(md).toContain(`### ${t.id}`)
    }
  })

  test('the summary table links every task to its authoritative detail anchor', () => {
    for (const t of [TASK_A, TASK_B]) {
      expect(md).toContain(`[details](#task-${t.id})`)
    }
  })

  test.each([['TASK_A', TASK_A], ['TASK_B', TASK_B]])(
    '%s: every non-command field is recovered from the Markdown and equals the JSON',
    (_name, task) => {
      const rec = recoverTask(md, task.id)
      expect(rec).not.toBeNull()
      const exp = expectedFields(task)
      for (const [label, value] of Object.entries(exp)) {
        expect(rec.fields[label]).toBe(value)
      }
    }
  )

  test('TASK_A verification commands are recovered byte-for-byte, in order', () => {
    const rec = recoverTask(md, TASK_A.id)
    expect(rec.commands).toEqual(TASK_A.verification.commands)
    for (let k = 0; k < TASK_A.verification.commands.length; k++) {
      const src = TASK_A.verification.commands[k]
      const got = rec.commands[k]
      expect(got.length).toBe(src.length)
      expect([...got]).toEqual([...src])   // codepoint-for-codepoint identity
    }
  })

  test('TASK_B (no commands) recovers an empty command list', () => {
    const rec = recoverTask(md, TASK_B.id)
    expect(rec.commands).toEqual([])
    expect(md).toContain('_No verification commands._')
  })

  test('free-text fields keep their pipes VERBATIM in the detail section (not sanitised)', () => {
    // title, outcome, grouping rationale, commit subject each carry a literal pipe.
    expect(md).toContain('Implement thing|with|pipe')
    expect(md).toContain('Do X || fallback Y; grep -E "a|b|c" is preserved here')
    expect(md).toContain('Bundled A|B because they share a single output')
    expect(md).toContain('add thing with | pipe')
  })

  test('the CSV dispatch structure is still protected: every data row has exactly 8 columns', () => {
    const dataRows = csv.split('\n').filter((l, i) => i > 0 && l.trim() !== '')
    expect(dataRows.length).toBe(2)
    for (const row of dataRows) expect(row.split('|')).toHaveLength(8)
  })
})
