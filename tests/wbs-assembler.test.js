'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadWorkBreakdown,
  parseTaskDetailBlock,
  renderTaskDetailBlock,
  parsePhaseDetailBlock,
  renderPhaseDetailBlock,
} = require('../src/claude/scripts/wbs-assembler');

const FIXTURES = path.resolve(__dirname, 'fixtures');
const WBS_DIR = path.join(FIXTURES, 'ftr-020-wbs');
const LEGACY_JSON = path.join(FIXTURES, 'ftr-020-wb-legacy.json');

// ── Helper: build a fresh copy of the wbs fixture directory in a temp dir, so tests that
// delete/corrupt a file never mutate the shared fixture. ─────────────────────────────────

function copyFixtureDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbs-assembler-test-'));
  fs.cpSync(WBS_DIR, tmpDir, { recursive: true });
  return tmpDir;
}

let tmpDirs = [];
afterEach(() => {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  tmpDirs = [];
});

function freshFixtureDir() {
  const d = copyFixtureDir();
  tmpDirs.push(d);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('loadWorkBreakdown() — directory vs. legacy parity', () => {
  // sourceUC is schema-v3-only information with no legacy analog (the single-shot, pre-FTR-020
  // generation path never had a concept of "which UC(s) does this phase realize") — so an
  // exact deep-equal is no longer the right assertion for phases; strip it before comparing,
  // and assert its presence/correctness separately below.
  test('directory format and legacy JSON produce deep-equal assembled structures, aside from the new sourceUC field', () => {
    const fromDir = loadWorkBreakdown(WBS_DIR);
    const fromJson = loadWorkBreakdown(LEGACY_JSON);
    const stripSourceUC = wb => ({ ...wb, phases: wb.phases.map(({ sourceUC, ...rest }) => rest) });
    expect(stripSourceUC(fromDir)).toEqual(stripSourceUC(fromJson));
    expect(fromJson.phases.every(p => !('sourceUC' in p))).toBe(true);
  });

  test('assembled structure has schemaVersion 2 regardless of on-disk index.json schemaVersion 3', () => {
    const assembled = loadWorkBreakdown(WBS_DIR);
    expect(assembled.schemaVersion).toBe(2);
    expect(assembled.feature).toBe('FTR-020');
    expect(assembled.phases).toHaveLength(6);
  });

  test("each directory-assembled phase's sourceUC is passed through from index.json, not dropped", () => {
    const assembled = loadWorkBreakdown(WBS_DIR);
    const index = JSON.parse(fs.readFileSync(path.join(WBS_DIR, 'index.json'), 'utf8'));
    for (const phase of assembled.phases) {
      const skeleton = index.phases.find(p => p.id === phase.id);
      expect(phase.sourceUC).toEqual(skeleton.sourceUC);
    }
    // US-04 is the realistic multi-UC case this field exists for: one phase realizing several
    // UCs, which a naive UC-NN<->US-NN id-matching rule could never express correctly.
    expect(assembled.phases.find(p => p.id === 'US-04').sourceUC).toEqual(['UC-01', 'UC-02', 'UC-03', 'UC-04']);
  });
});

describe('loadWorkBreakdown() — error paths', () => {
  test('throws naming the exact path when index.json is missing', () => {
    const dir = freshFixtureDir();
    fs.unlinkSync(path.join(dir, 'index.json'));
    expect(() => loadWorkBreakdown(dir)).toThrow(/index\.json/);
  });

  test('throws naming the exact path when a referenced task file is missing', () => {
    const dir = freshFixtureDir();
    fs.unlinkSync(path.join(dir, 'tasks', 'INFRA-TASK-BE-01.md'));
    expect(() => loadWorkBreakdown(dir)).toThrow(/INFRA-TASK-BE-01\.md/);
  });

  test('throws naming the exact path when a referenced phase file is missing', () => {
    const dir = freshFixtureDir();
    fs.unlinkSync(path.join(dir, 'user-stories', 'US-01.md'));
    expect(() => loadWorkBreakdown(dir)).toThrow(/US-01\.md/);
  });

  test('throws when index.json references an unknown task ID', () => {
    const dir = freshFixtureDir();
    const indexPath = path.join(dir, 'index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    index.phases[0].taskIds.push('GHOST-TASK-ID');
    fs.writeFileSync(indexPath, JSON.stringify(index));
    expect(() => loadWorkBreakdown(dir)).toThrow(/GHOST-TASK-ID/);
  });

  test('throws when index.json has the wrong schemaVersion', () => {
    const dir = freshFixtureDir();
    const indexPath = path.join(dir, 'index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    index.schemaVersion = 99;
    fs.writeFileSync(indexPath, JSON.stringify(index));
    expect(() => loadWorkBreakdown(dir)).toThrow(/schemaVersion/);
  });

  test('does NOT throw when a legacy JSON file has the "wrong" schemaVersion — loaded exactly as today (AC-06); wb-validate.js check 2 reports this non-fatally, not the assembler', () => {
    const tmpFile = path.join(os.tmpdir(), `legacy-bad-${Date.now()}.json`);
    const wb = { schemaVersion: 1, feature: 'X', phases: [] };
    fs.writeFileSync(tmpFile, JSON.stringify(wb));
    try {
      expect(loadWorkBreakdown(tmpFile)).toEqual(wb);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

describe('parseTaskDetailBlock() / renderTaskDetailBlock() — round-trip', () => {
  test('verification commands with embedded pipes and backticks survive a round-trip', () => {
    const task = {
      id: 'T-01', title: 't', outcome: 'o', domain: 'BE', agentType: 'developer-backend',
      dependsOn: [], acceptanceCriteria: [], estimate: { agentMinutes: 5, tokens: 1000 },
      outputCount: 1, groupingRationale: null, commit: { type: 'feat', scope: null, subject: 's' },
      verification: { commands: ["grep -E 'a|b|c' file.js", 'echo `date`'] },
    };
    const rendered = renderTaskDetailBlock(task);
    const parsed = parseTaskDetailBlock(rendered);
    expect(parsed.verificationCommands).toEqual(task.verification.commands);
    expect(parsed.groupingRationale).toBeNull();
  });

  test('a non-null groupingRationale survives a round-trip', () => {
    const task = {
      id: 'T-02', title: 't', outcome: 'o', domain: 'TEST', agentType: 'developer-testing',
      dependsOn: ['T-01'], acceptanceCriteria: ['AC-01'], estimate: { agentMinutes: 20, tokens: 3000 },
      outputCount: 2, groupingRationale: 'Grouped because X and Y are inseparable',
      commit: { type: 'test', scope: 'core', subject: 's2' },
      verification: { commands: ['npm test'] },
    };
    const rendered = renderTaskDetailBlock(task);
    const parsed = parseTaskDetailBlock(rendered);
    expect(parsed.groupingRationale).toBe(task.groupingRationale);
  });

  test('a task file whose Implementation notes contain an illustrative field-line example parses to the real values, not the example (regression: US-03-TASK-INFRA-01.md)', () => {
    const text = fs.readFileSync(path.join(WBS_DIR, 'tasks', 'US-03-TASK-INFRA-01.md'), 'utf8');
    const parsed = parseTaskDetailBlock(text);
    expect(parsed.groupingRationale).toBeNull();
    expect(parsed.verificationCommands).toEqual(['npx jest --testPathPattern=tests/frontmatter']);
  });
});

describe('parsePhaseDetailBlock() / renderPhaseDetailBlock() — round-trip', () => {
  test('title and commit survive a round-trip', () => {
    const phase = { id: 'US-09', type: 'user-story', title: 'As a user, I want X, so that Y',
      commit: { type: 'feat', scope: null, subject: 'implement US-09' } };
    const rendered = renderPhaseDetailBlock(phase);
    const parsed = parsePhaseDetailBlock(rendered);
    expect(parsed.title).toBe(phase.title);
    expect(parsed.commit).toEqual(phase.commit);
  });

  test('a commit scope survives a round-trip', () => {
    const phase = { id: 'INFRA', type: 'infrastructure', title: 'Shared setup',
      commit: { type: 'feat', scope: 'infra', subject: 'shared setup' } };
    const rendered = renderPhaseDetailBlock(phase);
    const parsed = parsePhaseDetailBlock(rendered);
    expect(parsed.commit.scope).toBe('infra');
  });
});

describe('CLI entry point (node wbs-assembler.js <path>)', () => {
  const { spawnSync } = require('child_process');
  const ASSEMBLER = path.resolve(__dirname, '../src/claude/scripts/wbs-assembler.js');

  test('prints the assembled structure as JSON to stdout and exits 0 for the directory format', () => {
    const result = spawnSync('node', [ASSEMBLER, WBS_DIR], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.phases).toHaveLength(6);
  });

  test('exits 2 with a usage message when no path argument is given', () => {
    const result = spawnSync('node', [ASSEMBLER], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/Usage/);
  });

  test('exits 2 naming the missing path when a referenced task file is absent', () => {
    const dir = freshFixtureDir();
    fs.unlinkSync(path.join(dir, 'tasks', 'INFRA-TASK-BE-01.md'));
    const result = spawnSync('node', [ASSEMBLER, dir], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/INFRA-TASK-BE-01\.md/);
  });
});
