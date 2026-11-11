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
