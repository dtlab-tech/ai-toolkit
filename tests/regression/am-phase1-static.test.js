'use strict';

/**
 * Static regression test for am-phase1.js — US-08-TASK-TEST-01 (FTR-015).
 *
 * Verifies that the am-phase1.js workflow script:
 * 1. Does NOT contain spawnSync (no Node.js process spawning in the workflow source)
 * 2. Does NOT contain child_process (no direct process spawning)
 * 3. Does NOT contain a hardcoded .claude/agents scan instruction (old discovery pattern)
 * 4. DOES contain 'list-assets' in the discovery prompt (new catalog-based discovery)
 *
 * These are purity guards ensuring am-phase1.js uses the ai-toolkit CLI for discovery
 * rather than hardcoded filesystem scans or direct process spawning.
 */

const fs   = require('fs');
const path = require('path');

const AM_PHASE1 = path.join(__dirname, '..', '..', 'src', 'claude', 'workflows', 'am-phase1.js');

let source;

beforeAll(() => {
  source = fs.readFileSync(AM_PHASE1, 'utf8');
});

test('am-phase1.js does not contain spawnSync', () => {
  expect(source).not.toContain('spawnSync');
});

test('am-phase1.js does not contain child_process', () => {
  expect(source).not.toContain('child_process');
});

test('am-phase1.js does not contain hardcoded ".claude/agents" scan instruction', () => {
  // The old pattern told an agent to "Scan .claude/agents/"
  // This should be replaced with the list-assets approach
  expect(source).not.toContain('Scan .claude/agents/');
});

test('am-phase1.js prompt includes list-assets for catalog-based discovery', () => {
  expect(source).toContain('list-assets');
});
