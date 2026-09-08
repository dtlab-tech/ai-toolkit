'use strict';

/**
 * Static source guards for the Tier 2 workflow resolution contracts.
 * US-05-TASK-TEST-01 (FTR-017).
 *
 * Asserts:
 *  (a) No workflow .js file imports lib/agent-registry directly (AC-25)
 *  (b) Every agents resolve invocation in workflow files includes --require-verified (AC-31)
 *  (c) Tier 2 dispatch uses resolvedNativeNames, not hardcoded agentType strings (AC-42)
 *  (d) Unknown WB agent_type values throw a HARD STOP, not passed unresolved to the platform
 *  (e) No legacy orchestrator agent labels appear in src/claude runtime assets (AC-17, AC-18)
 */

const fs   = require('fs');
const path = require('path');

const WORKFLOW_DIR = path.join(__dirname, '..', '..', 'src', 'claude', 'workflows');

function readWorkflowFiles() {
  return fs.readdirSync(WORKFLOW_DIR)
    .filter(f => f.endsWith('.js'))
    .map(f => ({
      name:   f,
      path:   path.join(WORKFLOW_DIR, f),
      source: fs.readFileSync(path.join(WORKFLOW_DIR, f), 'utf8'),
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// (a) No direct lib/agent-registry import (AC-25)
// ─────────────────────────────────────────────────────────────────────────────

describe('static guard (AC-25) — no workflow imports lib/agent-registry directly', () => {
  const files = readWorkflowFiles();

  test.each(files.map(f => [f.name, f.source]))(
    '%s does not require lib/agent-registry',
    (_name, source) => {
      // Only match on non-comment lines (lines not starting with // after optional whitespace)
      const nonCommentLines = source.split('\n').filter(l => !/^\s*\/\//.test(l));
      const nonCommentSource = nonCommentLines.join('\n');
      expect(nonCommentSource).not.toMatch(/require\s*\(\s*['"][^'"]*lib\/agent-registry['"]/);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) Every agents resolve call includes --require-verified (AC-31)
// ─────────────────────────────────────────────────────────────────────────────

describe('static guard (AC-31) — every agents resolve invocation includes --require-verified', () => {
  const agentDispatchingFiles = readWorkflowFiles().filter(f =>
    f.source.includes('agents resolve')
  );

  test('at least one workflow file contains an agents resolve call', () => {
    expect(agentDispatchingFiles.length).toBeGreaterThan(0);
  });

  test.each(agentDispatchingFiles.map(f => [f.name, f.source]))(
    '%s: every agents resolve call includes --require-verified',
    (_name, source) => {
      const lines = source.split('\n');
      const resolveLines = lines.filter(l => l.includes('agents resolve'));
      for (const line of resolveLines) {
        expect(line).toContain('--require-verified');
      }
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// (c) Tier 2 dispatch uses resolvedNativeNames, not hardcoded agentType strings (AC-42)
// ─────────────────────────────────────────────────────────────────────────────

describe('static guard (AC-42) — pm-phase3 dispatches use resolved nativeName, not hardcoded strings', () => {
  let source;
  beforeAll(() => {
    source = fs.readFileSync(path.join(WORKFLOW_DIR, 'pm-phase3.js'), 'utf8');
  });

  test('pm-phase3 defines IMPL_AGENT_IDS mapping from legacy names to canonical IDs', () => {
    expect(source).toContain('IMPL_AGENT_IDS');
    expect(source).toContain('gaia.agent.developer.backend');
    expect(source).toContain('gaia.agent.developer.frontend');
    expect(source).toContain('gaia.agent.developer.testing');
    expect(source).toContain('gaia.agent.review.solution');
  });

  test('pm-phase3 resolves all IMPL_AGENT_IDS upfront before the wave execution loop', () => {
    const preWaveIdx   = source.indexOf('resolvedNativeNames');
    const wavesLoopIdx = source.indexOf('for (const wave of waves)');
    expect(preWaveIdx).toBeGreaterThan(-1);
    expect(wavesLoopIdx).toBeGreaterThan(-1);
    expect(preWaveIdx).toBeLessThan(wavesLoopIdx);
  });

  test('pm-phase3 impl/test group dispatch uses nativeName (resolved), not group.agent_type directly', () => {
    expect(source).toMatch(/agentType:\s*nativeName/);
    expect(source).not.toMatch(/agentType:\s*group\.agent_type/);
  });

  test('pm-phase3 review-solution dispatch uses resolvedNativeNames, not a hardcoded literal string', () => {
    expect(source).toMatch(/agentType:\s*resolvedNativeNames\['review-solution'\]/);
    expect(source).not.toMatch(/agentType:\s*'review-solution'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (d) Unknown WB agent_type triggers HARD STOP — not passed unresolved to platform
// ─────────────────────────────────────────────────────────────────────────────

describe('static guard — unknown WB agent_type triggers HARD STOP (not passed to platform)', () => {
  let source;
  beforeAll(() => {
    source = fs.readFileSync(path.join(WORKFLOW_DIR, 'pm-phase3.js'), 'utf8');
  });

  test('pm-phase3 throws a HARD STOP error for unresolved agent_type values', () => {
    expect(source).toMatch(/HARD STOP.*no resolved nativeName for agent_type/);
  });

  test('pm-phase3 does not pass group.agent_type directly as agentType to agent()', () => {
    expect(source).not.toMatch(/agentType:\s*group\.agent_type/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (e) No legacy orchestrator agent labels in src/claude runtime assets (AC-17, AC-18)
// ─────────────────────────────────────────────────────────────────────────────

describe('static guard (AC-17, AC-18) — no legacy orchestrator labels in src/claude runtime assets', () => {
  const SRC_CLAUDE_DIR = path.join(__dirname, '..', '..', 'src', 'claude');

  function readSrcClaudeFiles() {
    const results = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (entry.name.endsWith('.md') || entry.name.endsWith('.js')) {
          results.push({ name: path.relative(SRC_CLAUDE_DIR, full), source: fs.readFileSync(full, 'utf8') });
        }
      }
    }
    walk(SRC_CLAUDE_DIR);
    return results;
  }

  let files;
  beforeAll(() => { files = readSrcClaudeFiles(); });

  test('no src/claude file contains the /agent-project-manager slash command reference', () => {
    const hits = files.filter(f => f.source.includes('/agent-project-manager'));
    expect(hits.map(f => f.name)).toEqual([]);
  });

  test('hi-gaia/SKILL.md spawnable list does not include project-manager', () => {
    const hiGaia = files.find(f => f.name.includes('hi-gaia') && f.name.endsWith('SKILL.md'));
    expect(hiGaia).toBeDefined();
    const spawnableLine = hiGaia.source.split('\n').find(l => l.includes('spawnable'));
    expect(spawnableLine).toBeDefined();
    expect(spawnableLine).not.toMatch(/\bproject-manager\b/);
  });

  test('hi-gaia/SKILL.md spawnable list does not include assessment-manager', () => {
    const hiGaia = files.find(f => f.name.includes('hi-gaia') && f.name.endsWith('SKILL.md'));
    expect(hiGaia).toBeDefined();
    const spawnableLine = hiGaia.source.split('\n').find(l => l.includes('spawnable'));
    expect(spawnableLine).toBeDefined();
    expect(spawnableLine).not.toMatch(/\bassessment-manager\b/);
  });

  test('implement-feature/SKILL.md does not contain project-manager/pm-phase3 label', () => {
    const skill = files.find(f => f.name.includes('implement-feature') && f.name.endsWith('SKILL.md'));
    expect(skill).toBeDefined();
    expect(skill.source).not.toContain('project-manager/pm-phase3');
  });

  test('assess-codebase/SKILL.md does not contain assessment-manager/am-phase label', () => {
    const skill = files.find(f => f.name.includes('assess-codebase') && f.name.endsWith('SKILL.md'));
    expect(skill).toBeDefined();
    expect(skill.source).not.toMatch(/assessment-manager\/am-phase/);
  });

  test('no src/claude file uses project-manager/pm-phase as an agent label prefix', () => {
    const hits = files.filter(f => /project-manager\/pm-phase/.test(f.source));
    expect(hits.map(f => f.name)).toEqual([]);
  });

  test('no src/claude file uses assessment-manager/am-phase as an agent label prefix', () => {
    const hits = files.filter(f => /assessment-manager\/am-phase/.test(f.source));
    expect(hits.map(f => f.name)).toEqual([]);
  });
});
