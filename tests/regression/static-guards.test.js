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
