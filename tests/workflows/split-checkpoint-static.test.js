'use strict'

// FTR-037 US-01-TASK-TEST-04: static pins on the check-size hook that pm-phase1.js runs after the
// validation loop and before the Gate 1 digest. pm-phase1.js runs in a sandboxed AsyncFunction with
// no `require` (lib/workflow-runner.js), so it cannot be executed here. These tests read its source
// as text and assert on the hook's call form, position, return contract, and parse guard. No
// workflow is run and no LLM call is made.

const fs = require('fs')
const path = require('path')

const HOOK_PATH = path.join(__dirname, '..', '..', 'src', 'claude', 'workflows', 'pm-phase1.js')
const hookSrc = fs.readFileSync(HOOK_PATH, 'utf8')

const SKILL_PATH = path.join(__dirname, '..', '..', 'src', 'claude', 'skills', 'implement-feature', 'SKILL.md')
const skillSrc = fs.readFileSync(SKILL_PATH, 'utf8')
const WORKFLOWS_DIR = path.join(__dirname, '..', '..', 'src', 'claude', 'workflows')

// Anchors taken from the real source, not guessed:
// - the validation loop header (only loop with a `cycle` counter), and
// - the last statement inside that loop body, so "after the loop" means after its closing brace.
const VALIDATION_LOOP_ANCHOR = 'for (let cycle = 1; cycle <= 3; cycle++)'
const VALIDATION_LOOP_END_ANCHOR = 'if (mergedNeedsTechSpecFix) { await generateTechSpec(true)'
// Bare `docsDigest` also appears in a comment earlier in the file, so anchor on the computation itself.
const GATE1_DIGEST_ANCHOR = 'const docsDigest ='

// The c.command argv for the feature-split.js call, from its run-asset opener to the closing bracket.
// The argv is captured in two parts: group 1 = before `'check-size'`, group 2 = after it.
// `[^\]]` keeps the match inside one argv array, so an earlier run-asset call cannot match.
const CHECK_SIZE_CALL = /c\.command\(\s*\[\s*'run-asset',\s*'scripts\/feature-split\.js'([^\]]*?)'check-size'([^\]]*)\]/

// Every c.command argv that mentions feature-split.js, in any position.
const ANY_FEATURE_SPLIT_CALL = /c\.command\(\s*\[[^\]]*feature-split[^\]]*\]/g

function extractFunction(source, name) {
  const match = source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))
  return match ? match[0] : ''
}

const parseSplitCheckSrc = extractFunction(hookSrc, 'parseSplitCheck')
const unavailableCheckSrc = extractFunction(hookSrc, 'unavailableCheck')

describe('pm-phase1 check-size hook: call form', () => {
  test('invokes check-size through c.command with run-asset on scripts/feature-split.js', () => {
    expect(hookSrc).toMatch(CHECK_SIZE_CALL)
  })

  test('passes --feature-dir and --prefix to check-size in the same call', () => {
    const argvAfterCheckSize = hookSrc.match(CHECK_SIZE_CALL)[2]
    expect(argvAfterCheckSize).toMatch(/'--feature-dir'/)
    expect(argvAfterCheckSize).toMatch(/'--prefix'/)
  })

  test('never passes the apply subcommand to feature-split.js', () => {
    const calls = hookSrc.match(ANY_FEATURE_SPLIT_CALL) || []
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call).not.toMatch(/'apply'/)
    }
  })
})

describe('pm-phase1 check-size hook: position', () => {
  test('check-size runs after the validation loop', () => {
    const loopAt = hookSrc.indexOf(VALIDATION_LOOP_ANCHOR)
    const loopEndAt = hookSrc.indexOf(VALIDATION_LOOP_END_ANCHOR)
    const callAt = hookSrc.search(CHECK_SIZE_CALL)
    expect(loopAt).toBeGreaterThanOrEqual(0)
    expect(loopEndAt).toBeGreaterThan(loopAt)
    expect(callAt).toBeGreaterThan(loopEndAt)
  })

  test('check-size runs before the Gate 1 digest is computed', () => {
    const callAt = hookSrc.search(CHECK_SIZE_CALL)
    const digestAt = hookSrc.indexOf(GATE1_DIGEST_ANCHOR)
    expect(digestAt).toBeGreaterThanOrEqual(0)
    expect(callAt).toBeLessThan(digestAt)
  })
})

describe('pm-phase1 check-size hook: return contract', () => {
  test('returns split_checkpoint on both the stop path and the continue path', () => {
    const returnedShorthand = hookSrc.match(/\bsplit_checkpoint\s*[,}]/g) || []
    expect(returnedShorthand.length).toBeGreaterThanOrEqual(2)
  })
})

describe('pm-phase1 check-size hook: guarded parse', () => {
  test('parseSplitCheck wraps JSON.parse of the stdout in try/catch', () => {
    expect(parseSplitCheckSrc).toMatch(/try\s*\{[\s\S]*?JSON\.parse\(result\.stdout\)[\s\S]*?\}\s*catch\s*\([^)]*\)\s*\{/)
  })

  test('parseSplitCheck maps a parse failure to an unavailable result', () => {
    expect(parseSplitCheckSrc).toMatch(/catch\s*\([^)]*\)\s*\{\s*return unavailableCheck\(/)
  })

  test('unavailableCheck returns status unavailable', () => {
    expect(unavailableCheckSrc).toMatch(/status:\s*'unavailable'/)
  })
})

describe('pm-phase1 check-size hook: restrictions', () => {
  test('never prompts the user for input or confirmation', () => {
    expect(hookSrc).not.toMatch(/\b(readline|confirm)\s*\(/)
    expect(hookSrc).not.toMatch(/\bprompt\s*\(/)
  })
})

// FTR-037 US-02-TASK-TEST-03: static pins on the implement-feature SKILL.md Step 1a text. Step 1a is
// the main-loop branch that reads split_checkpoint and decides between continuing to Gate 1, the
// unavailable stop, and the split proposal decision loop. The skill is prose for an agent, so these
// tests pin the wording the behaviour depends on. They read the skill text and make no LLM call.

// Returns the text of the section that starts at the first heading matching headingRe, up to the
// next heading of the same or higher level. Scoping to the section stops matches elsewhere in the
// skill from satisfying the assertions.
function sectionOf(headingRe) {
  const m = headingRe.exec(skillSrc)
  if (!m) throw new Error('heading not found: ' + headingRe)
  const level = m[0].match(/^#+/)[0].length
  const rest = skillSrc.slice(m.index + m[0].length)
  const next = new RegExp('^#{1,' + level + '} ', 'm').exec(rest)
  return next ? rest.slice(0, next.index) : rest
}

describe('implement-feature SKILL.md Step 1a text', () => {
  const STEP_1A_HEADING = /^#{1,6} .*Step 1a\b.*$/m
  // The skill wraps long sentences across lines; collapse whitespace so phrase matches do not depend on wrapping.
  const step1a = () => sectionOf(STEP_1A_HEADING).replace(/\s+/g, ' ')

  test('Step 1a heading sits before the Gate 1 heading', () => {
    const step1aAt = /^#{1,6} .*Step 1a\b/m.exec(skillSrc)
    const gate1At = /^#{1,6} .*Gate 1\b/m.exec(skillSrc)
    expect(step1aAt).not.toBeNull()
    expect(gate1At).not.toBeNull()
    expect(step1aAt.index).toBeLessThan(gate1At.index)
  })

  test.each(['passed', 'skipped', 'unavailable', 'split-proposed'])(
    'Step 1a names the %s status',
    (status) => {
      expect(step1a()).toContain(status)
    }
  )

  test('passed and skipped continue to Gate 1', () => {
    expect(step1a()).toMatch(/`passed` or `skipped`: continue to Gate 1/)
  })

  test('passed and skipped show no prompt', () => {
    expect(step1a()).toMatch(/`passed` or `skipped`[^\n]*Show no prompt/)
  })

  test('unavailable prints one line per count with its reason', () => {
    expect(step1a()).toMatch(/- <count>: <reason>/)
  })

  test('unavailable is a plain error, not a gate or approval prompt', () => {
    expect(step1a()).toMatch(/print a plain error, not a gate and not an approval prompt/)
  })

  test('unavailable stops and does not reach Gate 1', () => {
    expect(step1a()).toMatch(/Then STOP\. Do not reach Gate 1\./)
  })

  test('a missing or malformed split_checkpoint result is treated as unavailable', () => {
    expect(step1a()).toMatch(/is missing, is not an object, or has no string `status`: treat it as unavailable/)
  })

  test('Keywords are derived by the main loop, not by the script', () => {
    expect(step1a()).toMatch(/Derive Keywords only\./)
  })

  test('Step 1a runs in the main loop', () => {
    expect(step1a()).toMatch(/main-loop agent/)
  })

  test('an edit below minChildren is refused and the previous proposal is kept', () => {
    expect(step1a()).toMatch(/Child count below `minChildren`: print `Edit refused: it would leave <n> children; the minimum is <value>\. The previous proposal is kept\.`/)
  })

  test('the minimum child count is read from the result, not written as a number', () => {
    expect(step1a()).toMatch(/Read the minimum from\s+`split_checkpoint\.proposal\.minChildren`; never write it as a number in this skill/)
  })

  test('an edit that is not refused re-presents the proposal', () => {
    expect(step1a()).toMatch(/Re-present it\s+with the rules of this step/)
  })

  test('a re-presented proposal needs a fresh explicit accept', () => {
    expect(step1a()).toMatch(/Each re-presented proposal needs a fresh explicit accept\. An edit is never an accept\./)
  })

  test('accept runs feature-split.js apply for the current proposal', () => {
    expect(step1a()).toMatch(/`accept`: the main-loop agent runs `feature-split\.js apply` for the proposal shown to the user/)
  })

  test('reject continues to Gate 1 unchanged and stores nothing', () => {
    expect(step1a()).toMatch(/`reject`: the pipeline continues to Gate 1 unchanged and stores nothing\./)
  })

  test('nothing is created before an explicit accept', () => {
    expect(step1a()).toMatch(/Nothing is created before an explicit accept\./)
  })

  test('the feature-split.js apply call is in the skill', () => {
    expect(skillSrc).toMatch(/feature-split\.js apply/)
  })

  test('no workflow script calls feature-split.js apply', () => {
    const workflowFiles = fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.js'))
    expect(workflowFiles.length).toBeGreaterThan(0)
    for (const file of workflowFiles) {
      const src = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8')
      expect(src).not.toMatch(/feature-split\.js[^\n]*\bapply\b/)
    }
  })

  test('the skill hard-codes no threshold number', () => {
    expect(skillSrc).not.toMatch(/threshold[^\n]*\b(is|=|:|of)\s*\d+/i)
  })

  test('the skill hard-codes no size-limit number for use cases, criteria or components', () => {
    expect(skillSrc).not.toMatch(/\b(useCases|acceptanceCriteria|components)\s*(>=|<=|>|<|=)\s*\d+/)
  })

  test('the skill hard-codes no minChildren number', () => {
    expect(skillSrc).not.toMatch(/minChildren\s*(=|is|:)\s*\d+/i)
  })
})
