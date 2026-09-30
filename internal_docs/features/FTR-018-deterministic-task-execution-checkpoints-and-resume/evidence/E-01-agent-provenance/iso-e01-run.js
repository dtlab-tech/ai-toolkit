#!/usr/bin/env node
'use strict';
/*
 * E-01 isolated provenance proof — definitive harness (Percorso C).
 *
 * Goal: bind the Node-hash-verified agent definition to the definition claude.exe ACTUALLY loads,
 * WITHOUT modifying the installed agent and WITHOUT a model-declared hash.
 *
 * Isolation strategy (validated LLM-free): environment variables do NOT redirect claude.exe's
 * agent search on Windows (proven in iso-discovery.js). Instead we use claude.exe's own --debug
 * output as ground truth for WHICH file it loads, and we prove UNIQUENESS of the source:
 *   - managed agents dir (C:\Program Files\ClaudeCode\.claude\agents) is ENOENT   -> no policy override
 *   - plugin agents loaded == 0                                                    -> no plugin agent
 *   - cwd is placed so its only agent source resolves to userSettings (same inode) -> single physical
 *     definition; the debug log names it ("already loaded from userSettings")
 * The single reachable definition's sha256 is verified == EXPECT_HASH before and after the run.
 *
 * Modes:
 *   node iso-e01-run.js verify   -> isolation checks only, NO paid call. Prints ISOLATION: PASS/FAIL.
 *   node iso-e01-run.js run      -> re-runs isolation checks; ONLY if PASS, performs ONE capped paid
 *                                    run (--max-budget-usd 0.03, no retry).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const MODE = process.argv[2];
if (!['verify', 'run'].includes(MODE)) { console.error('usage: node iso-e01-run.js verify|run'); process.exit(2); }

const CLAUDE = 'C:\\Users\\Tomada D\\AppData\\Local\\Claude-3p\\claude-code\\2.1.260\\claude.exe';
const SRC = 'C:\\Users\\Tomada D\\.claude\\agents\\gaia-developer-backend.md';
const EXPECT_HASH = '7457e83ac6defc0a78018bd61561f79fb80968190a51b5821115b7af5f671f11';
const AGENT = 'gaia-developer-backend';
const HARD_CAP = '0.03';
const OUT_DIR = __dirname;

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function inode(p) { return String(fs.statSync(p).ino); }

// A cwd under %TEMP% (which lives under the user profile) so claude's project ancestor-walk
// re-discovers the userSettings .claude as a SAME-INODE duplicate, forcing an explicit
// "already loaded from userSettings" line in the debug log = positive source naming.
function freshCwd() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'e01-wt-'));
  // git init so the cwd is a real repo context, like the executor's worktree (persistence target)
  spawnSync('git', ['init', '-q'], { cwd: d });
  return d;
}

function verifyIsolation(cwd, dbgLog) {
  const ev = { checks: [], pass: true };
  const add = (name, ok, detail) => { ev.checks.push({ name, ok, detail }); if (!ok) ev.pass = false; };

  // (0) source hash pinned
  const srcHash = sha256(SRC);
  add('source-hash == EXPECT_HASH', srcHash === EXPECT_HASH, `${SRC} sha256=${srcHash}`);

  // (1) FREE debug probe: nonexistent agent -> fail-fast, logs full agent resolution, $0
  const probe = spawnSync(CLAUDE, [
    '--print', '--output-format', 'json',
    '--debug', '--debug-file', dbgLog,
    '--agent', 'definitely-not-real-000',
    '--max-budget-usd', '0.001', 'hi'
  ], { cwd, input: '', encoding: 'utf8', timeout: 90000 });
  const log = fs.existsSync(dbgLog) ? fs.readFileSync(dbgLog, 'utf8') : '';
  const stdcost = /"total_cost_usd"\s*:\s*([0-9.]+)/.exec(probe.stdout || '');
  add('probe cost == 0 (fail-fast, no model call)', !stdcost || Number(stdcost[1]) === 0,
      `exit=${probe.status}, cost=${stdcost ? stdcost[1] : '0'}`);

  // (2) managed agents dir absent -> no policy override
  const managedEnoent = /Failed to stat directory .*ClaudeCode\\\.claude\\agents:.*ENOENT/i.test(log)
    || /Failed to stat directory C:\\Program Files\\ClaudeCode\\\.claude\\agents/i.test(log);
  add('managed agents dir ENOENT (no policy override)', managedEnoent,
      managedEnoent ? 'C:\\Program Files\\ClaudeCode\\.claude\\agents not present' : 'MANAGED DIR PRESENT — investigate');

  // (3) zero plugin agents
  const pluginZero = /Total plugin agents loaded:\s*0\b/.test(log);
  add('plugin agents loaded == 0', pluginZero, (/Total plugin agents loaded:[^\n]*/.exec(log) || [''])[0]);

  // (4) target agent is reachable
  const avail = /Available agents:\s*([^\n]+)/.exec(log);
  const reachable = avail ? avail[1].split(',').map(s => s.trim()) : [];
  add(`${AGENT} reachable`, reachable.includes(AGENT), `available count=${reachable.length}`);

  // (5) source uniqueness: no DIFFERENT-inode competitor for the agent name.
  //     - cwd has no project .claude/agents copy (we create none)
  //     - the only same-name file(s) resolve to the userSettings inode.
  const projCopy = path.join(cwd, '.claude', 'agents', AGENT + '.md');
  const noProjectCopy = !fs.existsSync(projCopy);
  add('no competing project-scope copy in cwd', noProjectCopy, projCopy);

  // Positive naming: debug names userSettings as the load source for the agent (same-inode dedup line),
  // OR (single source) the agent is present with managed absent + plugins 0 + no project copy.
  const skipLine = new RegExp(`${AGENT}\\.md'[^\\n]*already loaded from userSettings`, 'i').exec(log);
  const namedUserSettings = !!skipLine;
  add('debug names userSettings as load source (or single-source by elimination)',
      namedUserSettings || (managedEnoent && pluginZero && noProjectCopy),
      namedUserSettings ? skipLine[0] : 'by elimination: managed absent, plugins 0, no project copy');

  // (6) no different-inode duplicate of the agent name was loaded from a foreign source
  const foreignLoad = new RegExp(`Skipping[^\\n]*${AGENT}\\.md[^\\n]*(?!already loaded from userSettings)`, 'i');
  // (any skip line that is NOT the userSettings same-inode one would be suspicious)
  const suspiciousSkips = (log.match(new RegExp(`[^\\n]*${AGENT}\\.md[^\\n]*`, 'ig')) || [])
    .filter(l => /Skipping|Overriding|shadow/i.test(l) && !/already loaded from userSettings/i.test(l));
  add('no foreign-source override/shadow of the agent', suspiciousSkips.length === 0,
      suspiciousSkips.length ? suspiciousSkips.join(' | ') : 'none');

  ev.srcHash = srcHash;
  ev.srcInode = inode(SRC);
  return ev;
}

const cwd = freshCwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dbgVerify = path.join(OUT_DIR, `run-verify-debug-${stamp}.log`);
const ev = verifyIsolation(cwd, dbgVerify);

console.log('\n=== E-01 ISOLATION VERIFICATION (no paid call) ===');
console.log('cwd = ' + cwd);
for (const c of ev.checks) console.log(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.name}  — ${c.detail}`);
console.log('ISOLATION: ' + (ev.pass ? 'PASS' : 'FAIL'));

if (MODE === 'verify') {
  fs.writeFileSync(path.join(OUT_DIR, `iso-verify-result-${stamp}.json`), JSON.stringify(ev, null, 2));
  console.log('\n(verify-only mode: no paid call made)');
  process.exit(ev.pass ? 0 : 1);
}

// MODE === 'run'
if (!ev.pass) {
  console.error('\nISOLATION FAILED — refusing to spend. No paid call made.');
  process.exit(1);
}

// ---- ONE paid run, hard-capped, no retry ----
const nonce = 'E01ISO-' + Date.now();
const schema = '{"type":"object","properties":{"status":{"type":"string"},"marker":{"type":"string"}},"required":["status","marker"],"additionalProperties":false}';
const prompt = `Using the Write tool, create a file named e01-iso-proof.txt in the current working directory whose entire contents are exactly: ${nonce}. After the file is written, produce the final structured output with status set to "done" and marker set to ${nonce}.`;

const hashBefore = sha256(SRC);
const dbgRun = path.join(OUT_DIR, `run-paid-debug-${stamp}.log`);
const args = [
  '--print', '--output-format', 'json',
  '--debug', '--debug-file', dbgRun,
  '--json-schema', schema,
  '--agent', AGENT,
  '--tools', 'Write',
  '--permission-mode', 'acceptEdits',
  '--add-dir', cwd,
  '--max-budget-usd', HARD_CAP,
  prompt
];
console.log('\n=== E-01 PAID RUN (single, hard cap $' + HARD_CAP + ', NO retry) ===');
console.log('  hash-before = ' + hashBefore);
const t0 = Date.now();
const res = spawnSync(CLAUDE, args, { cwd, input: '', encoding: 'utf8', timeout: 300000 });
const durMs = Date.now() - t0;
const hashAfter = fs.existsSync(SRC) ? sha256(SRC) : '(missing)';

fs.writeFileSync(path.join(OUT_DIR, `run-paid-stdout-${stamp}.json`), res.stdout || '');
fs.writeFileSync(path.join(OUT_DIR, `run-paid-stderr-${stamp}.txt`), res.stderr || '');

let parsed = null; try { parsed = JSON.parse(res.stdout || 'null'); } catch (_) {}
const markerFile = path.join(cwd, 'e01-iso-proof.txt');
const markerPersisted = fs.existsSync(markerFile) ? fs.readFileSync(markerFile, 'utf8') : '(not written)';
const runLog = fs.existsSync(dbgRun) ? fs.readFileSync(dbgRun, 'utf8') : '';
const runManagedEnoent = /Failed to stat directory C:\\Program Files\\ClaudeCode\\\.claude\\agents/i.test(runLog);
const runPluginZero = /Total plugin agents loaded:\s*0\b/.test(runLog);
const runUserSettings = new RegExp(`${AGENT}\\.md'[^\\n]*already loaded from userSettings`, 'i').test(runLog);

const cost = parsed && (parsed.total_cost_usd != null) ? parsed.total_cost_usd
  : (/"total_cost_usd"\s*:\s*([0-9.]+)/.exec(res.stdout || '') || [])[1];

const result = {
  when: new Date().toISOString(),
  cli: '2.1.260',
  agent: AGENT,
  cwd, args,
  nonce,
  isolation: ev,
  hashBefore, hashAfter, hashUnchanged: hashBefore === EXPECT_HASH && hashAfter === EXPECT_HASH,
  runDebug: { managedEnoent: runManagedEnoent, pluginZero: runPluginZero, userSettingsNamed: runUserSettings },
  exit: res.status,
  is_error: parsed ? parsed.is_error : null,
  subtype: parsed ? parsed.subtype : null,
  structured_output: parsed ? parsed.structured_output : null,
  model: parsed ? (parsed.modelUsage ? Object.keys(parsed.modelUsage) : parsed.model) : null,
  total_cost_usd: cost,
  duration_ms: durMs,
  markerPersisted,
  markerMatchesNonce: markerPersisted.trim() === nonce
};
fs.writeFileSync(path.join(OUT_DIR, `iso-run-result-${stamp}.json`), JSON.stringify(result, null, 2));

console.log('  hash-after  = ' + hashAfter + (result.hashUnchanged ? '  (UNCHANGED == EXPECT_HASH)' : '  (!! CHANGED !!)'));
console.log('  exit=' + res.status + '  is_error=' + result.is_error + '  subtype=' + result.subtype);
console.log('  structured_output = ' + JSON.stringify(result.structured_output));
console.log('  model = ' + JSON.stringify(result.model));
console.log('  total_cost_usd = ' + cost + '   duration_ms=' + durMs);
console.log('  marker persisted = ' + JSON.stringify(markerPersisted) + '  matches nonce? ' + result.markerMatchesNonce);
console.log('  run-debug: managedEnoent=' + runManagedEnoent + ' pluginZero=' + runPluginZero + ' userSettingsNamed=' + runUserSettings);
console.log('\nRESULT JSON -> ' + path.join(OUT_DIR, `iso-run-result-${stamp}.json`));
console.log('(single paid run complete — NO retry performed)');
