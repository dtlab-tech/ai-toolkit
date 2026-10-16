'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { loadRequirements } = require('../src/claude/scripts/req-assembler')
const { loadTechSpec } = require('../src/claude/scripts/tech-spec-assembler')
const { assembleReq, assembleSpec, assembleWbs } = require('../src/claude/scripts/assemble-docs')

const SCRIPT = path.resolve(__dirname, '../src/claude/scripts/assemble-docs.js')
const FIXTURES = path.resolve(__dirname, 'fixtures')
const REQ_FIXTURE = path.join(FIXTURES, 'ftr-021-req')
const SPEC_FIXTURE = path.join(FIXTURES, 'ftr-024-spec')
const WBS_FIXTURE = path.join(FIXTURES, 'ftr-020-wbs')

// Each test gets its own temp feature dir with symlink-free copies of the shared split
// fixtures, so a test writing {PREFIX}-Requirements.md etc. alongside them never mutates the
// shared fixture directories other test files also read.
function freshFeatureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assemble-docs-test-'))
  fs.cpSync(REQ_FIXTURE, path.join(dir, 'req'), { recursive: true })
  fs.cpSync(SPEC_FIXTURE, path.join(dir, 'spec'), { recursive: true })
  fs.cpSync(WBS_FIXTURE, path.join(dir, 'wbs'), { recursive: true })
  return dir
}

let tmpDirs = []
afterEach(() => {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }) } catch (_) {} }
  tmpDirs = []
})
function trackedFeatureDir() {
  const dir = freshFeatureDir()
  tmpDirs.push(dir)
  return dir
}

describe('assembleReq() / assembleSpec() / assembleWbs() — direct calls', () => {
  test('assembleReq produces output identical to calling loadRequirements directly', () => {
    const dir = trackedFeatureDir()
    const outPath = assembleReq(dir, 'FTR-TEST')
    expect(outPath).toBe(path.join(dir, 'FTR-TEST-Requirements.md'))
    expect(fs.readFileSync(outPath, 'utf8')).toBe(loadRequirements(path.join(dir, 'req')))
  })

  test('assembleSpec produces output identical to calling loadTechSpec directly', () => {
    const dir = trackedFeatureDir()
    const outPath = assembleSpec(dir, 'FTR-TEST')
    expect(outPath).toBe(path.join(dir, 'FTR-TEST-Tech-Spec.md'))
    expect(fs.readFileSync(outPath, 'utf8')).toBe(loadTechSpec(path.join(dir, 'spec')))
  })

  test('assembleWbs produces the same .md/.csv wb-render.js would produce standalone', () => {
    const dir = trackedFeatureDir()
    const [mdPath, csvPath] = assembleWbs(dir, 'FTR-TEST')
    expect(mdPath).toBe(path.join(dir, 'FTR-TEST-Work-Breakdown.md'))
    expect(csvPath).toBe(path.join(dir, 'FTR-TEST-Work-Breakdown.csv'))
    // Render again, standalone, into a SEPARATE directory with the SAME prefix — the rendered
    // content itself embeds the prefix (e.g. commit messages), so a true byte-identical
    // comparison needs the same prefix on both sides, just a different destination.
    const directDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assemble-docs-direct-'))
    tmpDirs.push(directDir)
    const direct = spawnSync('node', [path.resolve(__dirname, '../src/claude/scripts/wb-render.js'),
      path.join(dir, 'wbs'), 'FTR-TEST', directDir], { encoding: 'utf8' })
    expect(direct.status).toBe(0)
    // wb-render.js stamps the Markdown's own "Generated" field with the current timestamp —
    // the one genuinely non-deterministic byte in otherwise-identical output from two calls a
    // few milliseconds apart; normalize it out before comparing.
    const stripGenerated = text => text.replace(/\| Generated \|.*\|/, '| Generated | — |')
    expect(stripGenerated(fs.readFileSync(mdPath, 'utf8'))).toBe(
      stripGenerated(fs.readFileSync(path.join(directDir, 'FTR-TEST-Work-Breakdown.md'), 'utf8')))
    expect(fs.readFileSync(csvPath, 'utf8')).toBe(
      fs.readFileSync(path.join(directDir, 'FTR-TEST-Work-Breakdown.csv'), 'utf8'))
  })

  test('assembleWbs throws naming the exact expected path when wbs/ does not exist', () => {
    const dir = trackedFeatureDir()
    fs.rmSync(path.join(dir, 'wbs'), { recursive: true })
    expect(() => assembleWbs(dir, 'FTR-TEST')).toThrow(/wbs\//)
    expect(() => assembleWbs(dir, 'FTR-TEST')).toThrow(path.join(dir, 'wbs'))
  })
})

describe('CLI entry point (node assemble-docs.js <feature-dir> <prefix> [which])', () => {
  function run(args) {
    const result = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' })
    let parsed = null
    try { parsed = JSON.parse(result.stdout) } catch (_) {}
    return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr, parsed }
  }

  test('"all" (default) writes all five files', () => {
    const dir = trackedFeatureDir()
    const { exitCode, parsed } = run([dir, 'FTR-TEST'])
    expect(exitCode).toBe(0)
    expect(parsed.written).toHaveLength(4)
    expect(fs.existsSync(path.join(dir, 'FTR-TEST-Requirements.md'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'FTR-TEST-Tech-Spec.md'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'FTR-TEST-Work-Breakdown.md'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'FTR-TEST-Work-Breakdown.csv'))).toBe(true)
  })

  test('a single target ("req") writes only that file', () => {
    const dir = trackedFeatureDir()
    const { exitCode, parsed } = run([dir, 'FTR-TEST', 'req'])
    expect(exitCode).toBe(0)
    expect(parsed.written).toEqual([path.join(dir, 'FTR-TEST-Requirements.md')])
    expect(fs.existsSync(path.join(dir, 'FTR-TEST-Tech-Spec.md'))).toBe(false)
  })

  test('an unknown target exits 1 with a usage-style message, writes nothing', () => {
    const dir = trackedFeatureDir()
    const { exitCode, stderr } = run([dir, 'FTR-TEST', 'bogus'])
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/Unknown target "bogus"/)
    expect(fs.existsSync(path.join(dir, 'FTR-TEST-Requirements.md'))).toBe(false)
  })

  test('missing required arguments exits 1 with a usage message', () => {
    const { exitCode, stderr } = run([])
    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/Usage: node assemble-docs\.js/)
  })

  test('req/spec against a feature directory missing the matching split directory exits 2, naming the exact expected path', () => {
    const dir = trackedFeatureDir()
    fs.rmSync(path.join(dir, 'req'), { recursive: true })
    const { exitCode, stderr } = run([dir, 'FTR-TEST', 'req'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain(path.join(dir, 'req'))
  })

  test('wbs against a feature directory missing wbs/ exits 2, naming the exact expected path', () => {
    const dir = trackedFeatureDir()
    fs.rmSync(path.join(dir, 'wbs'), { recursive: true })
    const { exitCode, stderr } = run([dir, 'FTR-TEST', 'wbs'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain(path.join(dir, 'wbs'))
  })
})
