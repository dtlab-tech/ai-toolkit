#!/usr/bin/env node
'use strict';
// E-01 isolation DISCOVERY harness — NO LLM, NO paid call.
// Purpose: determine which directories/config claude.exe actually uses to resolve --agent,
// using the FREE "agent not found -> Available agents:" oracle (exit 1, zero cost).
// It probes a deliberately NON-EXISTENT agent name so the CLI fail-fasts before any model call.
// We read the printed "Available agents" list to see which file-based gaia-* agents are reachable
// under each env/cwd configuration. This lets us find a configuration that isolates resolution
// to a SINGLE controlled copy — WITHOUT spending anything.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const CLAUDE = 'C:\\Users\\Tomada D\\AppData\\Local\\Claude-3p\\claude-code\\2.1.260\\claude.exe';
const NONEXISTENT = 'no-such-agent-xyz123';

function mkiso(tag) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e01-' + tag + '-'));
  return root;
}

// Run claude with a nonexistent agent -> capture the "Available agents" list. Zero cost.
function probe(label, { env, cwd }) {
  const res = spawnSync(CLAUDE, [
    '--print', '--output-format', 'json',
    '--agent', NONEXISTENT,
    '--max-budget-usd', '0.001',
    'hi'
  ], { env, cwd, input: '', encoding: 'utf8', timeout: 60000 });

  const err = (res.stderr || '') + (res.stdout || '');
  const m = err.match(/Available agents:\s*([^\n]+)/);
  let agents = m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
  const gaia = agents.filter(a => a.startsWith('gaia-'));
  const cwdReset = /Shell cwd was reset to (.+)/.exec(err);
  const hasCost = /"total_cost_usd"\s*:\s*([0-9.]+)/.exec(res.stdout || '');
  console.log('\n=== PROBE: ' + label + ' ===');
  console.log('  exit=' + res.status + (res.error ? ('  error=' + res.error.message) : ''));
  console.log('  cwd passed = ' + cwd);
  console.log('  cwd reset  = ' + (cwdReset ? cwdReset[1] : '(none)'));
  console.log('  cost_usd   = ' + (hasCost ? hasCost[1] : '0 (no cost line — fail-fast)'));
  console.log('  gaia agents reachable (' + gaia.length + '): ' + (gaia.join(', ') || '(none)'));
  const hasTarget = gaia.includes('gaia-developer-backend');
  console.log('  gaia-developer-backend reachable? ' + hasTarget);
  return { agents, gaia, hasTarget, cwdReset: cwdReset ? cwdReset[1] : null, raw: err };
}

const cleanEnv = () => {
  // start from a minimal env; keep PATH & system essentials, drop HOME-ish and CLAUDE-ish
  const e = { ...process.env };
  return e;
};

// A fresh empty cwd that is NOT under the repo (so no project .claude is discovered by walking up)
const EMPTY_CWD = mkiso('cwd');
const EMPTY_HOME = mkiso('home');
const EMPTY_CONFIG = mkiso('config');
console.log('EMPTY_CWD    = ' + EMPTY_CWD);
console.log('EMPTY_HOME   = ' + EMPTY_HOME);
console.log('EMPTY_CONFIG = ' + EMPTY_CONFIG);

// Baseline — default env, cwd = fresh empty temp (via spawn cwd option, not bash cd)
probe('baseline: default env, cwd=EMPTY', { env: cleanEnv(), cwd: EMPTY_CWD });

// CLAUDE_CONFIG_DIR override only
{
  const e = cleanEnv(); e.CLAUDE_CONFIG_DIR = EMPTY_CONFIG;
  probe('CLAUDE_CONFIG_DIR=EMPTY, cwd=EMPTY', { env: e, cwd: EMPTY_CWD });
}

// HOME + USERPROFILE override only
{
  const e = cleanEnv(); e.HOME = EMPTY_HOME; e.USERPROFILE = EMPTY_HOME;
  probe('HOME+USERPROFILE=EMPTY, cwd=EMPTY', { env: e, cwd: EMPTY_CWD });
}

// HOME + USERPROFILE + HOMEDRIVE/HOMEPATH override
{
  const e = cleanEnv();
  e.HOME = EMPTY_HOME; e.USERPROFILE = EMPTY_HOME;
  e.HOMEDRIVE = EMPTY_HOME.slice(0, 2); e.HOMEPATH = EMPTY_HOME.slice(2);
  probe('HOME+USERPROFILE+HOMEDRIVE/PATH=EMPTY, cwd=EMPTY', { env: e, cwd: EMPTY_CWD });
}

// EVERYTHING overridden
{
  const e = cleanEnv();
  e.HOME = EMPTY_HOME; e.USERPROFILE = EMPTY_HOME;
  e.HOMEDRIVE = EMPTY_HOME.slice(0, 2); e.HOMEPATH = EMPTY_HOME.slice(2);
  e.CLAUDE_CONFIG_DIR = EMPTY_CONFIG;
  probe('ALL overridden (HOME+USERPROFILE+HOMEDRIVE/PATH+CLAUDE_CONFIG_DIR), cwd=EMPTY', { env: e, cwd: EMPTY_CWD });
}

console.log('\n(discovery complete — no paid calls made)');
