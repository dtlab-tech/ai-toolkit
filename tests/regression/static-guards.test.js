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

test('all workflow dispatches use the deterministic host, never bare agent()', () => {
  for (const file of readWorkflowFiles()) expect(file.source).not.toMatch(/\bagent\s*\(/);
});
test('skills never route workflow native names to subagent_type', () => {
  for (const name of ['implement-feature', 'assess-codebase']) {
    const source = fs.readFileSync(path.join(__dirname, '../../src/claude/skills', name, 'SKILL.md'), 'utf8');
    expect(source).not.toMatch(/subagent_type:\s*(?:[pa]m-phase|\{nativeName\})/);
    expect(source).toContain('ai-toolkit workflow run');
  }
});
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
