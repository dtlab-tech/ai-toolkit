#!/usr/bin/env node
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const packageRoot = path.join(__dirname, '..');

// ── colors ────────────────────────────────────────────────────────────────────

const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  red:     '\x1b[31m',
  gray:    '\x1b[90m',
  white:   '\x1b[97m',
};

const clr = (color, text) => `${c[color]}${text}${c.reset}`;
const bold = (text)        => `${c.bold}${text}${c.reset}`;
const dim  = (text)        => `${c.dim}${text}${c.reset}`;

function divider(char = '─', len = 60) {
  return clr('gray', char.repeat(len));
}

function banner() {
  console.log();
  console.log(clr('cyan', '╔══════════════════════════════════════════════════════════╗'));
  console.log(clr('cyan', '║') + bold(clr('white', '            AI Toolkit  —  Installer                      ')) + clr('cyan', '║'));
  console.log(clr('cyan', '║') + clr('gray',  `         @dtlabs/ai-toolkit  v${require('../package.json').version.padEnd(22)}`) + clr('cyan', '║'));
  console.log(clr('cyan', '╚══════════════════════════════════════════════════════════╝'));
  console.log();
}

// ── helpers ──────────────────────────────────────────────────────────────────

// User-owned config that must NEVER be copied into a destination. We only verify
// and advise on these — copying would clobber the user's existing settings.
const NEVER_COPY = new Set(['settings.json', 'settings.local.json']);

// Path segments that identify non-distributable source files. Applied by
// isDistributable() inside expandMappings() — the single source of truth for
// whether a file enters the install plan, copy, manifest, and orphan pipeline.
// Tests, fixtures, and helpers live under .claude/scripts/tests/ and must never
// be shipped to destination projects (FTR-015 will move them to tests/**).
const NEVER_DIST_SEGMENTS = ['.claude/scripts/tests/'];

function isDistributable(srcPath) {
  const n = srcPath.replace(/\\/g, '/');
  if (NEVER_DIST_SEGMENTS.some(seg => n.includes(seg))) return false;
  if (path.basename(srcPath).endsWith('.test.js') && n.includes('.claude/scripts/')) return false;
  return true;
}

function fileHash(filePath) {
  return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
}

function readJsonSafe(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function askConfirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${clr('cyan', '?')} ${question} ${dim('(y/N)')} `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

// ── allowlist ─────────────────────────────────────────────────────────────────

// INFRA-T01: Canonical Bash permission lists (FTR-012, AC-11, AC-12).
// These are fixed baselines — one combined list covering base read-only,
// .NET, and npm commands. Unused entries in a project are harmless.
const CANONICAL_ALLOW = [
  'ls', 'dir', 'cat', 'head', 'tail', 'find', 'grep', 'rg', 'wc', 'echo',
  'pwd', 'which', 'date',
  'git status', 'git diff', 'git log', 'git show', 'git branch', 'git rev-parse',
  'git add', 'git commit',
  'dotnet build', 'dotnet test', 'dotnet restore',
  'npm test', 'npm run build',
];

// Dangerous outward-facing commands that must always surface a human prompt.
// git checkout stays on ask: it runs only in the implement-feature main loop
// (Step 5), never inside pm-phase3 worker agents. If pm-phase3 ever gains
// branch-management steps, this decision must be revisited.
const CANONICAL_ASK = [
  'git push', 'gh pr create', 'rm', 'del',
  'git checkout', 'git reset', 'git clean',
];

// INFRA-T01: Format a raw command string into a Claude Code permission token.
// Every command — including no-argument ones like 'pwd' — is formatted as
// 'Bash(<cmd>:*)' for consistency across all entries.
function commandToPermission(cmd) {
  return `Bash(${cmd}:*)`;
}

// INFRA-T02: Ensure an object parsed from settings.local.json has the expected
// shape. Mutates and returns the object so callers can chain immediately.
function normalizeSettings(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) obj = {};
  if (!obj.permissions || typeof obj.permissions !== 'object') obj.permissions = {};
  if (!obj.permissions.Bash || typeof obj.permissions.Bash !== 'object') obj.permissions.Bash = {};
  if (!Array.isArray(obj.permissions.Bash.allow)) obj.permissions.Bash.allow = [];
  if (!Array.isArray(obj.permissions.Bash.ask)) obj.permissions.Bash.ask = [];
  return obj;
}

// INFRA-T03: Return the dedup union of two arrays (preserves insertion order,
// all elements of a appear before novel elements of b).
function mergeArrays(a, b) {
  return [...new Set([...a, ...b])];
}

// INFRA-T03: Remove from allow every entry that also appears in ask.
// This enforces the ask-beats-allow invariant: a command that could be
// dangerous is never silently auto-approved just because it was also listed
// in an allow array.
function applyAskBeatsAllow(allow, ask) {
  const askSet = new Set(ask);
  return allow.filter(cmd => !askSet.has(cmd));
}

// INFRA-T04: Read {destDir}/.claude/settings.local.json.
// Returns a descriptor so callers can distinguish missing vs. malformed.
//   { exists: false, data: null,  malformed: false }  — file absent
//   { exists: true,  data: <obj>, malformed: false }  — parsed OK
//   { exists: true,  data: null,  malformed: true  }  — invalid JSON
function readSettings(destDir) {
  const settingsPath = path.join(destDir, '.claude', 'settings.local.json');
  if (!fs.existsSync(settingsPath)) return { exists: false, data: null, malformed: false };
  let raw;
  try { raw = fs.readFileSync(settingsPath, 'utf8'); } catch (err) {
    console.error(`Warning: could not read settings.local.json — ${err.message}`);
    return { exists: true, data: null, malformed: true };
  }
  try {
    const data = JSON.parse(raw);
    return { exists: true, data, malformed: false };
  } catch {
    return { exists: true, data: null, malformed: true };
  }
}

// INFRA-T04: Write {destDir}/.claude/settings.local.json, creating the
// .claude/ directory if it does not exist. Throws on I/O failure so callers
// can catch and report gracefully.
function writeSettings(destDir, data) {
  const settingsPath = path.join(destDir, '.claude', 'settings.local.json');
  ensureDir(settingsPath);
  fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf8');
}

// ── file enumeration ─────────────────────────────────────────────────────────

function expandMappings(mappings) {
  const files = [];
  for (const { src, dest } of mappings) {
    if (!fs.existsSync(src)) continue;
    if (fs.statSync(src).isDirectory()) {
      for (const entry of walkDir(src)) {
        if (NEVER_COPY.has(path.basename(entry))) continue; // never clobber user config
        if (!isDistributable(entry)) continue;
        const rel = path.relative(src, entry);
        files.push({ src: entry, dest: path.join(dest, rel) });
      }
    } else {
      if (NEVER_COPY.has(path.basename(src))) continue;
      if (!isDistributable(src)) continue;
      files.push({ src, dest });
    }
  }
  return files;
}

function walkDir(dir) {
  const results = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) results.push(...walkDir(full));
    else results.push(full);
  }
  return results;
}

// ── categorize ───────────────────────────────────────────────────────────────

function categorize(files) {
  return files.map(({ src, dest }) => {
    if (!fs.existsSync(dest)) return { src, dest, status: 'new' };
    return fileHash(src) === fileHash(dest)
      ? { src, dest, status: 'same' }
      : { src, dest, status: 'modified' };
  });
}

// ── version check ─────────────────────────────────────────────────────────────

const TOOLKIT_VERSION = require('../package.json').version;
const VERSION_FILE    = '.ai-toolkit-version';

function readInstalledVersion(destRoot) {
  const versionFile = path.join(destRoot, '.claude', VERSION_FILE);
  if (!fs.existsSync(versionFile)) return null;
  return fs.readFileSync(versionFile, 'utf8').trim();
}

function writeInstalledVersion(destRoot) {
  const versionFile = path.join(destRoot, '.claude', VERSION_FILE);
  ensureDir(versionFile);
  fs.writeFileSync(versionFile, TOOLKIT_VERSION, 'utf8');
}

async function checkVersion(destRoot, force) {
  const installed = readInstalledVersion(destRoot);
  if (!installed) return true;

  console.log(divider());
  console.log(bold('  Version check'));
  console.log(divider());

  if (installed === TOOLKIT_VERSION) {
    console.log(`  ${clr('green', '✔')}  Installed : ${clr('green', `v${installed}`)}`);
    console.log(`  ${clr('blue',  '●')}  Available : ${clr('blue',  `v${TOOLKIT_VERSION}`)}`);
    console.log(`\n  ${clr('yellow', 'Already up to date.')}`);
    if (!force) {
      const ok = await askConfirm('Re-install anyway?');
      if (!ok) { console.log(`\n  ${clr('gray', 'Aborted. Nothing was changed.')}\n`); process.exit(0); }
    }
    return true;
  }

  console.log(`  ${clr('yellow', '◎')}  Installed : ${clr('yellow', `v${installed}`)}`);
  console.log(`  ${clr('green',  '▲')}  Available : ${clr('green',  `v${TOOLKIT_VERSION}`)}`);
  console.log();
  const ok = await askConfirm(`Update toolkit from ${clr('yellow', `v${installed}`)} to ${clr('green', `v${TOOLKIT_VERSION}`)}?`);
  if (!ok) {
    console.log(`\n  ${clr('gray', 'Aborted. Your installation was not changed.')}\n`);
    process.exit(0);
  }
  return true;
}

// ── manifest ──────────────────────────────────────────────────────────────────

const MANIFEST_FILE = '.ai-toolkit-manifest.json';

function readManifest(destRoot) {
  const manifestPath = path.join(destRoot, '.claude', MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) return { files: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!parsed || !Array.isArray(parsed.files)) return { files: [] };
    parsed.files = parsed.files.map(f => f.replace(/\\/g, '/'));
    return parsed;
  } catch {
    console.log(dim('Previous manifest is corrupt; treating as empty'));
    return { files: [] };
  }
}

function computeOrphans(oldFiles, newFiles) {
  const newSet = new Set(newFiles.map(f => f.replace(/\\/g, '/')));
  return oldFiles
    .map(f => f.replace(/\\/g, '/'))
    .filter(f => !newSet.has(f));
}

function moveToTrash(destRoot, relativePath) {
  const source = path.join(destRoot, relativePath);
  if (!fs.existsSync(source)) return;
  const trashPath = path.join(destRoot, '.claude', '.ai-toolkit-trash', relativePath);
  ensureDir(trashPath);
  try {
    fs.renameSync(source, trashPath);
  } catch (err) {
    if (err.code === 'EXDEV') {
      fs.copyFileSync(source, trashPath);
      fs.unlinkSync(source);
    } else {
      throw err;
    }
  }
}

function writeManifest(destRoot, fileList) {
  const manifestPath = path.join(destRoot, '.claude', MANIFEST_FILE);
  const trashDir = path.join(destRoot, '.claude', '.ai-toolkit-trash');
  const filtered = fileList.filter(rel => {
    const abs = path.join(destRoot, rel);
    return !abs.startsWith(trashDir + path.sep) && abs !== trashDir;
  });
  const manifest = {
    version: TOOLKIT_VERSION,
    installedAt: new Date().toISOString(),
    files: filtered.map(f => f.replace(/\\/g, '/')),
  };
  try {
    ensureDir(manifestPath);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  } catch (err) {
    console.log(dim(`Warning: could not write manifest — ${err.message}`));
  }
}

// ── install ───────────────────────────────────────────────────────────────────

async function runInstall(label, mappings, force, destRoot) {
  const files    = expandMappings(mappings);
  const entries  = categorize(files);

  const newFiles = entries.filter(e => e.status === 'new');
  const modified = entries.filter(e => e.status === 'modified');
  const same     = entries.filter(e => e.status === 'same');

  // ── prune phase (before file copy) ───────────────────────────────────────────
  const oldManifest = readManifest(destRoot);
  const newFileSet  = files.map(f => path.relative(destRoot, f.dest).replace(/\\/g, '/'));
  const orphans     = computeOrphans(oldManifest.files, newFileSet);

  const existingOrphans = orphans.filter(o => fs.existsSync(path.join(destRoot, o)));

  if (existingOrphans.length > 0) {
    console.log();
    console.log(`${bold('📦 Orphan cleanup')}  ${clr('gray', '→')}  ${clr('red', `${existingOrphans.length} stale file(s) found`)}`);
    console.log(divider());
    for (const orphan of existingOrphans) {
      console.log(`  ${clr('red', '∅')} ${clr('red', 'REMOVED ')}  ${orphan}`);
    }
    console.log(divider());
  }

  let removedCount = 0;
  let keptCount    = 0;

  if (force) {
    for (const orphan of existingOrphans) {
      moveToTrash(destRoot, orphan);
      removedCount++;
      console.log(`     ${clr('red', '∅')} ${dim(orphan)}`);
    }
  } else {
    for (const orphan of existingOrphans) {
      const fullPath = path.join(destRoot, orphan);
      if (!fs.existsSync(fullPath)) continue;
      const ok = await askConfirm(`  Move to trash  ${clr('red', orphan)}?`);
      if (ok) {
        moveToTrash(destRoot, orphan);
        console.log(`     ${clr('green', '✔')} Moved to trash\n`);
        removedCount++;
      } else {
        console.log(`     ${clr('gray', '✖')} Kept as-is\n`);
        keptCount++;
      }
    }
  }

  if (existingOrphans.length > 0) {
    console.log(divider());
    console.log(
      `  ${clr('red', `∅ Moved: ${removedCount}`)}` +
      `  ${clr('gray', `↪ .claude/.ai-toolkit-trash/`)}` +
      `  ${clr('gray', `✖ Kept: ${keptCount}`)}\n`
    );
  }

  // ── install plan display ──────────────────────────────────────────────────────
  console.log();
  console.log(`${bold('📦 Install plan')}  ${clr('gray', '→')}  ${clr('cyan', label)}`);
  console.log(divider());
  for (const e of newFiles)  console.log(`  ${clr('green',  '✚')} ${clr('green',  'NEW     ')}  ${dim(path.relative(process.cwd(), e.dest))}`);
  for (const e of modified)  console.log(`  ${clr('yellow', '~')} ${clr('yellow', 'MODIFIED')}  ${path.relative(process.cwd(), e.dest)}`);
  for (const e of same)      console.log(`  ${clr('gray',   '=')} ${clr('gray',   'SAME    ')}  ${dim(path.relative(process.cwd(), e.dest))}`);
  console.log(divider());
  console.log(
    `  ${clr('green', `✚ New: ${newFiles.length}`)}` +
    `  ${clr('yellow', `~ Modified: ${modified.length}`)}` +
    `  ${clr('gray', `= Unchanged: ${same.length}`)}`
  );
  console.log();

  for (const e of newFiles) {
    ensureDir(e.dest);
    fs.copyFileSync(e.src, e.dest);
  }

  if (modified.length === 0) {
    console.log(`  ${clr('green', '✔')}  All new files copied. No conflicts.\n`);
    writeManifest(destRoot, newFileSet);
    return;
  }

  if (force) {
    console.log(`  ${clr('yellow', '⚑')}  --force: overwriting all modified files.`);
    for (const e of modified) {
      ensureDir(e.dest);
      fs.copyFileSync(e.src, e.dest);
      console.log(`     ${clr('yellow', '↺')} ${dim(path.relative(process.cwd(), e.dest))}`);
    }
    writeManifest(destRoot, newFileSet);
    return;
  }

  console.log(`  ${clr('yellow', 'These files differ from the toolkit version — decide for each:')}\n`);

  let overwritten = 0;
  let skipped = 0;

  for (const e of modified) {
    const rel = path.relative(process.cwd(), e.dest);
    const ok = await askConfirm(`  Overwrite  ${clr('yellow', rel)}?`);
    if (ok) {
      ensureDir(e.dest);
      fs.copyFileSync(e.src, e.dest);
      console.log(`     ${clr('green', '✔')} Overwritten\n`);
      overwritten++;
    } else {
      console.log(`     ${clr('gray', '✖')} Kept as-is\n`);
      skipped++;
    }
  }

  console.log(divider());
  console.log(
    `  ${clr('green', `✔ Overwritten: ${overwritten}`)}` +
    `  ${clr('gray',  `✖ Kept as-is: ${skipped}`)}\n`
  );

  writeManifest(destRoot, newFileSet);
}

// ── subagent spawn-depth check (verify & advise only — never write) ────────────

const SPAWN_DEPTH_VAR = 'CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH';

// Report whether the spawn-depth prerequisite is satisfied for a destination,
// checking both project-level and local-override settings files. Purely advisory:
// this NEVER creates or modifies any settings file.
function checkSpawnDepth(destRoot) {
  const candidates = [
    path.join(destRoot, '.claude', 'settings.json'),
    path.join(destRoot, '.claude', 'settings.local.json'),
  ];

  console.log(divider());
  console.log(bold('  Subagent spawn depth (required for orchestrated pipelines)'));
  console.log(divider());

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const json = readJsonSafe(file);
    const value = json && json.env && json.env[SPAWN_DEPTH_VAR];
    if (value !== undefined && Number(value) >= 2) {
      console.log(`  ${clr('green', '✔')}  ${SPAWN_DEPTH_VAR}=${value} found in ${dim(path.relative(process.cwd(), file))}`);
      console.log(`     ${dim('Orchestrators can spawn worker subagents — pipelines will run as designed.')}\n`);
      return;
    }
  }

  console.log(`  ${clr('yellow', '⚠')}  ${SPAWN_DEPTH_VAR} is not set to 2+ in this project.`);
  console.log(`     ${dim('Without it, /implement-feature and /assess-codebase run every worker inline')}`);
  console.log(`     ${dim('on the orchestrator model: per-agent model assignment, context isolation,')}`);
  console.log(`     ${dim('and per-agent token telemetry are all lost.')}`);
  console.log();
  console.log(`     ${bold('Action required')} — add this to ${clr('cyan', '.claude/settings.json')} (project)`);
  console.log(`     or ${clr('cyan', '~/.claude/settings.json')} (all projects). We do not edit it for you,`);
  console.log(`     ${dim('to avoid clobbering your existing configuration:')}`);
  console.log();
  console.log(clr('gray', '       {'));
  console.log(clr('gray', '         "env": {'));
  console.log(clr('gray', `           "${SPAWN_DEPTH_VAR}": "2"`));
  console.log(clr('gray', '         }'));
  console.log(clr('gray', '       }'));
  console.log();
  console.log(`     ${dim('Then restart Claude Code so the variable is loaded.')}\n`);
}

// ── mergeAllowlist ────────────────────────────────────────────────────────────

// US-01-T01 / US-02-T01 / US-02-T02 / US-03-T01:
// Core pure function — creates or merges the Bash permission allowlist in
// {destDir}/.claude/settings.local.json using the canonical lists above.
//
// Return values:
//   { status: 'written' }                     — fresh file created
//   { status: 'merged', preserved: N }        — merged with N pre-existing rules
//   { status: 'reset',  reason: 'malformed' } — invalid JSON was replaced
//   { status: 'error',  message: '...' }      — I/O failure
function mergeAllowlist(destDir) {
  if (!destDir || typeof destDir !== 'string') {
    return { status: 'error', message: 'destDir must be a non-empty string' };
  }
  if (!fs.existsSync(destDir) || !fs.statSync(destDir).isDirectory()) {
    return { status: 'error', message: `destination does not exist or is not a directory: ${destDir}` };
  }

  const canonicalAllow = CANONICAL_ALLOW.map(commandToPermission);
  const canonicalAsk   = CANONICAL_ASK.map(commandToPermission);

  const { exists, data, malformed } = readSettings(destDir);

  // Malformed JSON recovery (AC-05)
  if (malformed) {
    console.log('Warning: settings.local.json is not valid JSON; resetting to default');
    const fresh = normalizeSettings({});
    fresh.permissions.Bash.allow = canonicalAllow;
    fresh.permissions.Bash.ask   = canonicalAsk;
    try {
      writeSettings(destDir, fresh);
    } catch (err) {
      return { status: 'error', message: err.message };
    }
    return { status: 'reset', reason: 'malformed' };
  }

  // Fresh install: no existing file (AC-01)
  if (!exists) {
    const fresh = normalizeSettings({});
    fresh.permissions.Bash.allow = canonicalAllow;
    fresh.permissions.Bash.ask   = canonicalAsk;
    try {
      writeSettings(destDir, fresh);
    } catch (err) {
      return { status: 'error', message: err.message };
    }
    return { status: 'written' };
  }

  // Merge path: existing file, valid JSON (AC-02, AC-03, AC-04)
  const existing = normalizeSettings(data);
  const existingAllow = existing.permissions.Bash.allow;
  const existingAsk   = existing.permissions.Bash.ask;

  const countBefore = existingAllow.length + existingAsk.length;

  let mergedAllow = mergeArrays(existingAllow, canonicalAllow);
  const mergedAsk = mergeArrays(existingAsk,   canonicalAsk);

  // ask-beats-allow: strip from allow any cmd that is now in ask
  mergedAllow = applyAskBeatsAllow(mergedAllow, mergedAsk);

  existing.permissions.Bash.allow = mergedAllow;
  existing.permissions.Bash.ask   = mergedAsk;

  try {
    writeSettings(destDir, existing);
  } catch (err) {
    return { status: 'error', message: err.message };
  }

  const preserved = countBefore;
  return { status: 'merged', preserved };
}

// INFRA-T01 (FTR-013):
// Append a new entry to {featureDir}/{prefix}-token-ledger.json atomically.
// If the file does not exist it is created. If JSON is malformed the file is
// overwritten with a single-element array containing the new entry.
//
// Algorithm:
//   1. Read and parse the existing ledger (or start with [])
//   2. Push the new entry
//   3. Write the full array back in one synchronous write (atomic)
function appendLedgerEntry(featureDir, prefix, entry) {
  const filePath = path.join(featureDir, `${prefix}-token-ledger.json`);
  let ledger = [];
  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      ledger = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      console.log(`Warning: could not parse token ledger at ${filePath} — starting fresh`);
      ledger = [];
    }
  }
  ledger.push(entry);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(ledger, null, 2), 'utf8');
}

// INFRA-T02 (FTR-013):
// Find and update an existing entry in {featureDir}/{prefix}-token-ledger.json
// by agent key, atomically. Searches from the end of the array so that the most
// recent entry for a given key is updated (handles any accidental duplicates).
// If the file does not exist or the key is not found the call is a silent no-op.
//
// Algorithm:
//   1. Read and parse the existing ledger (silent return on missing/malformed)
//   2. Find the last entry where entry.agent === agentKey
//   3. Object.assign the updates onto that entry
//   4. Write the full array back in one synchronous write (atomic)
function updateLedgerEntry(featureDir, prefix, agentKey, updates) {
  const filePath = path.join(featureDir, `${prefix}-token-ledger.json`);
  if (!fs.existsSync(filePath)) return;
  let ledger;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    ledger = Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    console.log(`Warning: could not parse token ledger at ${filePath} — skipping update for "${agentKey}"`);
    return;
  }
  let idx = -1;
  for (let i = ledger.length - 1; i >= 0; i--) {
    if (ledger[i] && ledger[i].agent === agentKey) { idx = i; break; }
  }
  if (idx === -1) {
    console.log(`Warning: ledger entry not found for agent key "${agentKey}"`);
    return;
  }
  Object.assign(ledger[idx], updates);
  fs.writeFileSync(filePath, JSON.stringify(ledger, null, 2), 'utf8');
}

// US-05-T01:
// Idempotently append `.claude/settings.local.json` to {destDir}/.gitignore.
// Creates .gitignore if it does not exist (AC-06, AC-07).
//
// Return values:
//   { status: 'appended' }     — line was added
//   { status: 'already' }      — line was already present
//   { status: 'created' }      — .gitignore did not exist; created with line
//   { status: 'error', message } — I/O failure
function updateGitignore(destDir) {
  const GITIGNORE_ENTRY = '.claude/settings.local.json';
  const gitignorePath   = path.join(destDir, '.gitignore');

  try {
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, `${GITIGNORE_ENTRY}\n`, 'utf8');
      return { status: 'created' };
    }

    const content = fs.readFileSync(gitignorePath, 'utf8');
    const lines   = content.split('\n').map(l => l.trim());
    if (lines.includes(GITIGNORE_ENTRY)) return { status: 'already' };

    const trailing = content.endsWith('\n') ? '' : '\n';
    fs.writeFileSync(gitignorePath, `${content}${trailing}${GITIGNORE_ENTRY}\n`, 'utf8');
    return { status: 'appended' };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

// ── resolveClaudeRuntimeAsset ─────────────────────────────────────────────────

// INFRA-TASK-BE-02 (FTR-015):
// Resolve a runtime asset path using a six-phase algorithm:
//   Phase 0: Input validation (no filesystem access)
//   Phase A: Presence detection — local vs global installation
//   Phase B: Mode decision — local-only | global-only | both (error) | none (error)
//   Phase C: Metadata warnings — manifest, version stamp; emit to stderr; never abort
//   Phase D: Catalog membership + completeness check
//   Phase E: Confinement check + return absolute path
//
// Parameters:
//   relativePath (string): path relative to .claude/, e.g. 'agents/agent-name.md'
//   options (object): { projectDir, home }
//     projectDir — target project directory (defaults to process.cwd())
//     home       — override for os.homedir() to enable test isolation
//
// Returns: absolute path string
// Throws: Error with diagnostics on validation failure, ambiguity, or incompleteness
function resolveClaudeRuntimeAsset(relativePath, options) {
  const os = require('os');
  const { getAssetCategories } = require('../lib/asset-catalog');

  const opts = options || {};
  const effectiveHome       = opts.home       !== undefined ? opts.home       : os.homedir();
  const effectiveProjectDir = opts.projectDir !== undefined ? opts.projectDir : process.cwd();

  // ── Phase 0: Input validation (no filesystem access) ──────────────────────
  // 0a: reject null / undefined / empty
  if (relativePath === null || relativePath === undefined || relativePath === '') {
    throw new Error('relativePath must be a non-empty string');
  }
  if (typeof relativePath !== 'string') {
    throw new Error('relativePath must be a non-empty string');
  }
  // 0b: reject null bytes
  if (relativePath.includes('\0')) {
    throw new Error('relativePath must not contain null bytes');
  }
  // 0c: normalize backslashes to forward slashes
  relativePath = relativePath.replace(/\\/g, '/');
  // 0d: reject absolute paths
  if (relativePath.startsWith('/')) {
    throw new Error('relativePath must be relative (got Unix absolute path)');
  }
  if (/^[A-Za-z]:[/\\]/.test(relativePath)) {
    throw new Error('relativePath must be relative (got Windows absolute path)');
  }
  // 0e: reject .. segments
  if (relativePath.split('/').includes('..')) {
    throw new Error('relativePath must not contain path traversal (..)');
  }

  // ── Runtime root definitions ───────────────────────────────────────────────
  const localRuntimeRoot  = path.join(effectiveProjectDir, '.claude');
  const globalRuntimeRoot = path.join(effectiveHome, '.claude');

  // Strip the '.claude/' prefix so catRelDir gives the sub-directory relative to runtimeRoot.
  // e.g. '.claude/agents' → 'agents'
  function catRelDir(cat) {
    return cat.runtimeDir.replace(/^\.claude\//, '');
  }

  // condC: at least one catalog category directory has files at this runtimeRoot
  function hasPayloadFiles(runtimeRoot) {
    for (const cat of getAssetCategories()) {
      const catDir = path.join(runtimeRoot, catRelDir(cat));
      if (!fs.existsSync(catDir)) continue;
      try {
        if (fs.statSync(catDir).isDirectory() && walkDir(catDir).length > 0) return true;
      } catch (_) { /* ignore unreadable dirs */ }
    }
    return false;
  }

  // A toolkit installation is PRESENT at runtimeRoot when any of the following hold:
  //   condA: .ai-toolkit-manifest.json exists (content may be corrupt; file presence is enough)
  //   condB: .ai-toolkit-version exists
  //   condC: at least one catalog category dir contains one or more files
  // settings.json / settings.local.json alone do NOT satisfy any condition.
  function isToolkitPresent(runtimeRoot) {
    if (fs.existsSync(path.join(runtimeRoot, '.ai-toolkit-manifest.json'))) return true;
    if (fs.existsSync(path.join(runtimeRoot, '.ai-toolkit-version'))) return true;
    return hasPayloadFiles(runtimeRoot);
  }

  // ── Phase A: Presence detection ────────────────────────────────────────────
  const localPresent  = isToolkitPresent(localRuntimeRoot);
  const globalPresent = isToolkitPresent(globalRuntimeRoot);

  // ── Phase B: Mode decision ─────────────────────────────────────────────────
  if (!localPresent && !globalPresent) {
    throw new Error(
      "No toolkit installation found. Run 'npm run toolkit:dev-install-global' to install globally, or the installer in your project."
    );
  }
  if (localPresent && globalPresent) {
    throw new Error(
      `Ambiguous: toolkit installations detected at both ${localRuntimeRoot} and ` +
      `${globalRuntimeRoot}. The error is raised even if one installation has corrupt ` +
      'metadata — presence is established regardless of metadata validity.'
    );
  }

  const effectiveRoot = localPresent ? localRuntimeRoot : globalRuntimeRoot;
  const effectiveMode = localPresent ? 'local' : 'global';

  // ── Phase C: Metadata warnings (emit to stderr; never abort) ──────────────
  const manifestPath = path.join(effectiveRoot, '.ai-toolkit-manifest.json');
  let manifest = null;
  let manifestSchemaValid = false;

  if (!fs.existsSync(manifestPath)) {
    process.stderr.write('Warning: No manifest found; installation may be manual or manifest was lost\n');
  } else {
    let parsed = null;
    try {
      parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (_) {
      process.stderr.write(`Warning: Manifest is corrupt (invalid JSON) at ${manifestPath}\n`);
    }
    if (parsed !== null) {
      const required      = ['version', 'installedAt', 'installationMode', 'files'];
      const missingFields = required.filter(f => parsed[f] === undefined);
      if (missingFields.length > 0) {
        process.stderr.write(`Warning: Manifest schema invalid: missing fields ${missingFields.join(', ')}\n`);
      } else {
        manifestSchemaValid = true;
        manifest = parsed;
        if (parsed.installationMode !== effectiveMode) {
          process.stderr.write(
            `Warning: Manifest installationMode='${parsed.installationMode}' mismatches effective mode '${effectiveMode}'\n`
          );
        }
      }
    }
  }

  const versionStampPath = path.join(effectiveRoot, '.ai-toolkit-version');
  if (!fs.existsSync(versionStampPath)) {
    process.stderr.write(`Warning: No version stamp at ${versionStampPath}\n`);
  } else {
    const stampVersion    = fs.readFileSync(versionStampPath, 'utf8').trim();
    const resolverVersion = require('../package.json').version;
    if (stampVersion !== resolverVersion) {
      process.stderr.write(
        `Warning: Version mismatch: installed=${stampVersion}, resolver=${resolverVersion}; ` +
        'run toolkit:dev-install-global to update\n'
      );
    }
  }

  // ── Phase D: Catalog membership + completeness check ──────────────────────
  // Build expectedPayload: every runtime asset path derived from the package source catalog.
  // Files are enumerated from packageRoot/cat.sourceDir and mapped to their runtime destinations.
  const categories      = getAssetCategories();
  const expectedPayload = new Set();

  for (const cat of categories) {
    const srcDir = path.join(packageRoot, cat.sourceDir);
    if (!fs.existsSync(srcDir)) continue;
    try {
      for (const f of walkDir(srcDir)) {
        const relFile    = path.relative(srcDir, f);
        const runtimeAbs = path.resolve(path.join(effectiveRoot, catRelDir(cat), relFile));
        expectedPayload.add(runtimeAbs);
      }
    } catch (_) { /* ignore unreadable source dirs */ }
  }

  // Step 6e: warn about stale manifest entries (in manifest but no longer in catalog)
  if (manifestSchemaValid && manifest && Array.isArray(manifest.files)) {
    const parentDir = path.join(effectiveRoot, '..');
    const stale     = manifest.files.filter(f => !expectedPayload.has(path.resolve(path.join(parentDir, f))));
    if (stale.length > 0) {
      process.stderr.write(
        `Warning: Manifest has ${stale.length} stale entries not in current catalog: ${stale.join(', ')}\n`
      );
    }
  }

  // Step 8a: catalog membership — requested asset must be in expectedPayload
  const absoluteRequested = path.resolve(path.join(effectiveRoot, relativePath));
  if (!expectedPayload.has(absoluteRequested)) {
    throw new Error(
      `Requested asset '${relativePath}' is not a registered catalog asset (mode: ${effectiveMode}). ` +
      'Only toolkit-installed catalog assets may be resolved; arbitrary files under .claude/ are ' +
      'not resolvable via this function.'
    );
  }

  // Step 9: warn about expected assets absent from manifest (metadata-staleness; disk is authoritative)
  if (manifestSchemaValid && manifest && Array.isArray(manifest.files)) {
    const parentDir      = path.join(effectiveRoot, '..');
    const manifestAbsSet = new Set(
      manifest.files.map(f => path.resolve(path.join(parentDir, f)))
    );
    for (const f of expectedPayload) {
      if (!manifestAbsSet.has(f)) {
        process.stderr.write(`Warning: Expected asset missing from manifest: ${f}\n`);
      }
    }
  }

  // Step 10: disk completeness — every expected catalog asset must exist on disk;
  // a stale manifest cannot suppress this error — disk truth is the only authority.
  const missingFiles = [...expectedPayload].filter(f => !fs.existsSync(f));
  if (missingFiles.length > 0) {
    throw new Error(
      `Installation incomplete (${effectiveMode}). Missing files:\n  ${missingFiles.join('\n  ')}\n` +
      'Run the installer.'
    );
  }

  // ── Phase E: Return path ───────────────────────────────────────────────────
  // Step 11: resolve absolute path (effectiveRoot already ends at .claude/)
  const absolutePath = path.resolve(path.join(effectiveRoot, relativePath));

  // Step 11a: confinement check — belt-and-suspenders after Phase 0 traversal rejection;
  // catches edge cases introduced by OS-level normalization or symlink resolution.
  const resolvedRoot = path.resolve(effectiveRoot);
  if (!absolutePath.startsWith(resolvedRoot + path.sep) && absolutePath !== resolvedRoot) {
    throw new Error('Resolved path escapes installation root (confinement violation)');
  }

  // Step 12: final existence check
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Asset not found at ${absolutePath} (mode: ${effectiveMode})`);
  }

  // Step 13: return
  return absolutePath;
}

// ── runDoctorResolution ───────────────────────────────────────────────────────

// US-07-TASK-BE-01 (FTR-015):
// Human-readable diagnostics of runtime installation mode, asset resolution,
// and potential conflicts. Read-only — never modifies or deletes any file.
//
// Parameters (via options object):
//   projectDir (string): target project directory (defaults to process.cwd())
//   home       (string): override for os.homedir() to enable test isolation
//
// Output: writes to stdout; always exits 0 (reports, does not fail).
function runDoctorResolution(options) {
  const os = require('os');
  const { getAssetCategories } = require('../lib/asset-catalog');

  const opts              = options || {};
  const effectiveHome     = opts.home       !== undefined ? path.resolve(opts.home)       : os.homedir();
  const effectiveProject  = opts.projectDir !== undefined ? path.resolve(opts.projectDir) : process.cwd();

  const categories        = getAssetCategories();
  const localRuntimeRoot  = path.join(effectiveProject, '.claude');
  const globalRuntimeRoot = path.join(effectiveHome,    '.claude');

  // ── Internal helpers ────────────────────────────────────────────────────────

  function catRelDir(cat) {
    return cat.runtimeDir.replace(/^\.claude\//, '');
  }

  function hasPayloadFiles(runtimeRoot) {
    for (const cat of categories) {
      const catDir = path.join(runtimeRoot, catRelDir(cat));
      if (!fs.existsSync(catDir)) continue;
      try {
        if (fs.statSync(catDir).isDirectory() && walkDir(catDir).length > 0) return true;
      } catch (_) { /* ignore unreadable dirs */ }
    }
    return false;
  }

  // Mirrors the same three-condition presence check as resolveClaudeRuntimeAsset().
  // condA: manifest file exists (any content); condB: version stamp exists;
  // condC: at least one catalog category dir has files.
  function isToolkitPresent(runtimeRoot) {
    if (fs.existsSync(path.join(runtimeRoot, '.ai-toolkit-manifest.json'))) return true;
    if (fs.existsSync(path.join(runtimeRoot, '.ai-toolkit-version')))       return true;
    return hasPayloadFiles(runtimeRoot);
  }

  function countCategoryFiles(runtimeRoot, cat) {
    const catDir = path.join(runtimeRoot, catRelDir(cat));
    if (!fs.existsSync(catDir)) return 0;
    try { return walkDir(catDir).length; } catch (_) { return 0; }
  }

  function readVersionStamp(runtimeRoot) {
    const vFile = path.join(runtimeRoot, '.ai-toolkit-version');
    if (!fs.existsSync(vFile)) return null;
    try { return fs.readFileSync(vFile, 'utf8').trim(); } catch (_) { return null; }
  }

  // Returns { status: 'present'|'missing'|'corrupt', data: parsed|null, path: string }
  function readManifestInfo(runtimeRoot) {
    const manifestPath = path.join(runtimeRoot, '.ai-toolkit-manifest.json');
    if (!fs.existsSync(manifestPath)) return { status: 'missing', data: null, path: manifestPath };
    let raw;
    try { raw = fs.readFileSync(manifestPath, 'utf8'); } catch (_) {
      return { status: 'missing', data: null, path: manifestPath };
    }
    try {
      const parsed = JSON.parse(raw);
      return { status: 'present', data: parsed, path: manifestPath };
    } catch (_) {
      return { status: 'corrupt', data: null, path: manifestPath };
    }
  }

  // Return category files present under runtimeRoot that are NOT in manifest.files.
  // Only meaningful when manifestData exists with a files array; returns [] otherwise.
  function findResiduals(runtimeRoot, manifestData) {
    if (!manifestData || !Array.isArray(manifestData.files)) return [];
    const tracked = new Set(manifestData.files.map(f => f.replace(/\\/g, '/')));
    const residuals = [];
    const parentDir = path.dirname(runtimeRoot); // e.g. /proj (parent of .claude)
    for (const cat of categories) {
      const catDir = path.join(runtimeRoot, catRelDir(cat));
      if (!fs.existsSync(catDir)) continue;
      try {
        for (const f of walkDir(catDir)) {
          const rel = path.relative(parentDir, f).replace(/\\/g, '/');
          if (!tracked.has(rel)) residuals.push(rel);
        }
      } catch (_) { /* ignore */ }
    }
    return residuals;
  }

  // ── Detect installations ────────────────────────────────────────────────────
  const localPresent  = isToolkitPresent(localRuntimeRoot);
  const globalPresent = isToolkitPresent(globalRuntimeRoot);

  let mode, modeStatus;
  if      (localPresent && globalPresent) { mode = 'both';        modeStatus = 'AMBIGUOUS';    }
  else if (localPresent)                  { mode = 'local-only';  modeStatus = 'VALID';         }
  else if (globalPresent)                 { mode = 'global-only'; modeStatus = 'VALID';         }
  else                                    { mode = 'none';        modeStatus = 'NOT INSTALLED'; }

  const presentRoots = [];
  if (localPresent)  presentRoots.push({ label: 'Local',  root: localRuntimeRoot  });
  if (globalPresent) presentRoots.push({ label: 'Global', root: globalRuntimeRoot });

  // ── Output helpers ──────────────────────────────────────────────────────────
  const L     = (line = '') => console.log(line);
  const H     = (title)    => { L(bold(title)); L(divider('─', 68)); };
  const tick  = clr('green',  '✔');
  const cross = clr('red',    '✖');
  const warnS = clr('yellow', '⚠');

  // ── Header ──────────────────────────────────────────────────────────────────
  L('');
  L(clr('cyan', '╔══════════════════════════════════════════════════════════════════════╗'));
  L(clr('cyan', '║') + bold(clr('white', '          Claude Runtime Resolution Diagnostics                      ')) + clr('cyan', '║'));
  L(clr('cyan', '╚══════════════════════════════════════════════════════════════════════╝'));
  L('');

  // ── Toolkit Source ──────────────────────────────────────────────────────────
  H('Toolkit Source');
  L(`  Repository root:  ${dim(packageRoot)}`);
  L(`  Source directory: ${dim(path.join(packageRoot, 'src', 'claude'))}`);
  L('');

  // ── Installation Detection ──────────────────────────────────────────────────
  H('Installation Detection');
  L(`  Local runtime present:  ${localPresent  ? `${tick}  ${dim(localRuntimeRoot)}`  : `${cross}  ${dim('not found')}`}`);
  L(`  Global runtime present: ${globalPresent ? `${tick}  ${dim(globalRuntimeRoot)}` : `${cross}  ${dim('not found')}`}`);
  L('');

  // ── Effective Runtime Mode ──────────────────────────────────────────────────
  H('Effective Runtime Mode');
  const modeColors   = { 'local-only': 'green', 'global-only': 'green', 'both': 'yellow', 'none': 'red' };
  const statusColors = { 'VALID': 'green', 'AMBIGUOUS': 'yellow', 'NOT INSTALLED': 'red' };
  L(`  Mode:   ${clr(modeColors[mode],     mode)}`);
  L(`  Status: ${clr(statusColors[modeStatus] || 'gray', modeStatus)}`);
  L('');

  // ── Runtime Inventory ───────────────────────────────────────────────────────
  for (const { label, root } of presentRoots) {
    H(`Runtime Inventory (${label})`);
    for (const cat of categories) {
      const count = countCategoryFiles(root, cat);
      const name  = (cat.name.charAt(0).toUpperCase() + cat.name.slice(1)).padEnd(12);
      L(`  ${name} ${clr(count > 0 ? 'cyan' : 'gray', String(count).padStart(3))} file${count !== 1 ? 's' : ' '}`);
    }
    L('');
  }

  // ── Version Stamps ──────────────────────────────────────────────────────────
  H('Version Stamps');
  L(`  Toolkit source version:  ${clr('cyan', TOOLKIT_VERSION)}  ${dim('(from package.json)')}`);
  if (localPresent) {
    const lv = readVersionStamp(localRuntimeRoot);
    const lvDisplay = lv || dim('not found');
    const lvColor   = lv === TOOLKIT_VERSION ? 'green' : lv ? 'yellow' : 'gray';
    L(`  Local installed version:  ${lv ? clr(lvColor, lv) : lvDisplay}  ${dim('(from .claude/.ai-toolkit-version)')}`);
  }
  if (globalPresent) {
    const gv = readVersionStamp(globalRuntimeRoot);
    const gvDisplay = gv || dim('not found');
    const gvColor   = gv === TOOLKIT_VERSION ? 'green' : gv ? 'yellow' : 'gray';
    L(`  Global installed version: ${gv ? clr(gvColor, gv) : gvDisplay}  ${dim('(from ~/.claude/.ai-toolkit-version)')}`);
  }
  if (localPresent && globalPresent) {
    const lv = readVersionStamp(localRuntimeRoot);
    const gv = readVersionStamp(globalRuntimeRoot);
    const match = lv !== null && gv !== null && lv === gv;
    L(`  Match: ${match ? tick : `${cross}  ${clr('yellow', `local=${lv || '?'}, global=${gv || '?'}`)}`}`);
  }
  L('');

  // ── Duplicate Files (only when both installations present) ──────────────────
  if (mode === 'both') {
    H('Duplicate Files (local vs global)');
    const dupes = [];
    for (const cat of categories) {
      const relDir       = catRelDir(cat);
      const localCatDir  = path.join(localRuntimeRoot,  relDir);
      const globalCatDir = path.join(globalRuntimeRoot, relDir);
      if (!fs.existsSync(localCatDir) || !fs.existsSync(globalCatDir)) continue;
      try {
        const localFiles = walkDir(localCatDir).map(f => path.relative(localCatDir, f).replace(/\\/g, '/'));
        const globalSet  = new Set(walkDir(globalCatDir).map(f => path.relative(globalCatDir, f).replace(/\\/g, '/')));
        for (const f of localFiles) {
          if (!globalSet.has(f)) continue;
          const lp   = path.join(localCatDir,  f);
          const gp   = path.join(globalCatDir, f);
          const same = fileHash(lp) === fileHash(gp);
          dupes.push({ relPath: `${relDir}/${f}`, same });
        }
      } catch (_) { /* ignore */ }
    }
    if (dupes.length === 0) {
      L(`  ${dim('(no files appear in both installations)')}`);
    } else {
      for (const d of dupes) {
        L(`  ${dim(d.relPath)}: ${d.same ? `${tick} content matches` : `${cross} content differs`}`);
      }
    }
    L('');
  }

  // ── Manifest Consistency ────────────────────────────────────────────────────
  H('Manifest Consistency');
  if (presentRoots.length === 0) {
    L(`  ${dim('(no installation to check)')}`);
  } else {
    for (const { label, root } of presentRoots) {
      const mInfo        = readManifestInfo(root);
      const mSymbol      = { present: tick, missing: warnS, corrupt: cross }[mInfo.status];
      const mStatusColor = { present: 'green', missing: 'yellow', corrupt: 'red' }[mInfo.status];
      L(`  ${bold(label)} manifest:`);
      L(`    File:   ${dim(mInfo.path)}`);
      L(`    Status: ${mSymbol}  ${clr(mStatusColor, mInfo.status)}`);
      if (mInfo.status === 'present' && mInfo.data) {
        const fCount = Array.isArray(mInfo.data.files) ? mInfo.data.files.length : '?';
        L(`    Files:  ${fCount}`);
        if (mInfo.data.version)          L(`    Version:           ${mInfo.data.version}`);
        if (mInfo.data.installationMode) L(`    Installation mode: ${mInfo.data.installationMode}`);
      }
    }
  }
  L('');

  // ── Residual .claude/ Assets ────────────────────────────────────────────────
  H('Residual .claude/ Assets');
  if (presentRoots.length === 0) {
    L(`  ${dim('(no installation to check)')}`);
  } else {
    for (const { label, root } of presentRoots) {
      const mInfo = readManifestInfo(root);
      if (mInfo.status !== 'present') {
        L(`  ${label}: ${warnS}  ${dim('cannot check residuals — manifest missing or corrupt')}`);
      } else {
        const residuals = findResiduals(root, mInfo.data);
        if (residuals.length === 0) {
          L(`  ${label}: ${tick}  ${clr('green', 'CLEAN')}  ${dim('(all category files tracked in manifest)')}`);
        } else {
          L(`  ${label}: ${warnS}  ${clr('yellow', 'WARNING')}  — ${residuals.length} untracked file(s):`);
          for (const r of residuals.slice(0, 10)) L(`    ${dim(r)}`);
          if (residuals.length > 10) L(`    ${dim(`... and ${residuals.length - 10} more`)}`);
        }
      }
    }
  }
  L('');

  // ── Action Items ────────────────────────────────────────────────────────────
  H('Action Items');
  const actions = [];
  if (mode === 'both') {
    actions.push(`${warnS}  Choose one: delete local or global installation to resolve ambiguity`);
  }
  if (mode === 'none') {
    actions.push(`${cross}  No installation found. Run 'npm run toolkit:dev-install-global' or the local installer`);
  }
  if (mode === 'local-only' || mode === 'global-only') {
    const effectiveRoot = mode === 'local-only' ? localRuntimeRoot : globalRuntimeRoot;
    const iv = readVersionStamp(effectiveRoot);
    if (iv && iv !== TOOLKIT_VERSION) {
      actions.push(`${warnS}  Version mismatch: run 'npm run toolkit:dev-install-global' to update`);
    }
    const mInfo = readManifestInfo(effectiveRoot);
    if (mInfo.status !== 'present') {
      actions.push(`${warnS}  Manifest is ${mInfo.status}. Run the installer to regenerate.`);
    }
  }
  if (actions.length === 0) {
    L(`  ${tick}  ${clr('green', 'runtime ready for pipelines')}`);
  } else {
    for (const a of actions) L(`  • ${a}`);
  }
  L('');

  // ── Summary ─────────────────────────────────────────────────────────────────
  H('Summary');
  const overallOk     = mode === 'local-only' || mode === 'global-only';
  const overallStatus = overallOk ? 'READY' : 'PROBLEMATIC';
  L(`  Status: ${clr(overallOk ? 'green' : 'red', overallStatus)}`);
  let recommendation;
  if (mode === 'none')      recommendation = "Run 'npm run toolkit:dev-install-global' to install globally, or use the local installer.";
  else if (mode === 'both') recommendation = 'Remove one installation to resolve ambiguity before running pipelines.';
  else                      recommendation = `Installation is operational in ${mode} mode.`;
  L(`  Recommendation: ${dim(recommendation)}`);
  L('');
  L(clr('gray', '═'.repeat(72)));
  L('');
}

// ── entry points ──────────────────────────────────────────────────────────────

async function installLocal(targetDir, force) {
  banner();
  targetDir = path.resolve(process.cwd(), targetDir || '.');
  console.log(`  ${clr('cyan', '▸')}  Target: ${bold(targetDir)}\n`);
  await checkVersion(targetDir, force);
  const mappings = [
    { src: path.join(packageRoot, '.claude'),   dest: path.join(targetDir, '.claude') },
    { src: path.join(packageRoot, 'docs'),      dest: path.join(targetDir, 'docs') },
    { src: path.join(packageRoot, 'CLAUDE.md'), dest: path.join(targetDir, 'CLAUDE.md') },
  ];
  await runInstall(`local project`, mappings, force, targetDir);
  writeInstalledVersion(targetDir);
  console.log(`  ${clr('green', '✔')}  ${bold('Install complete.')}\n`);
  checkSpawnDepth(targetDir);
  console.log(divider());
  console.log(`\n  ${bold('Next steps:')}`);
  console.log(`  ${clr('cyan', '1.')} Run ${clr('cyan', '/init-agents')} to generate AGENTS.md`);
  console.log(`  ${clr('cyan', '2.')} Create a feature doc and run ${clr('cyan', '/implement-feature')}`);
  console.log();
}

async function installGlobal(force) {
  banner();
  try {
    const homedir = require('os').homedir();
    const target  = path.join(homedir, '.claude');
    console.log(`  ${clr('cyan', '▸')}  Target: ${bold(target)}  ${clr('gray', '(global Claude folder)')}\n`);
    await checkVersion(target, force);
    const mappings = [
      { src: path.join(packageRoot, '.claude', 'agents'),    dest: path.join(target, 'agents') },
      { src: path.join(packageRoot, '.claude', 'skills'),    dest: path.join(target, 'skills') },
      { src: path.join(packageRoot, '.claude', 'commands'),  dest: path.join(target, 'commands') },
      { src: path.join(packageRoot, '.claude', 'workflows'), dest: path.join(target, 'workflows') },
      { src: path.join(packageRoot, '.claude', 'scripts'),   dest: path.join(target, 'scripts') },
      { src: path.join(packageRoot, 'docs'),                 dest: path.join(target, 'docs') },
      { src: path.join(packageRoot, 'CLAUDE.global.md'),    dest: path.join(target, 'CLAUDE.md') },
    ];
    await runInstall('global Claude folder', mappings, force, target);
    writeInstalledVersion(target);
    console.log(`  ${clr('green', '✔')}  ${bold('Global install complete.')}\n`);
    checkSpawnDepth(homedir);
    console.log(divider());
    console.log(`\n  ${bold('Next steps:')}`);
    console.log(`  ${clr('cyan', '1.')} The toolkit is now available in all your projects`);
    console.log(`  ${clr('cyan', '2.')} Open any project and run ${clr('cyan', '/init-agents')}`);
    console.log();
  } catch (err) {
    console.error(`\n  ${clr('red', '✖')}  Global install failed: ${err.message}\n`);
    process.exit(1);
  }
}

function help() {
  banner();
  console.log(`  ${bold('Usage:')}`);
  console.log(`    ${clr('cyan', 'ai-toolkit')}                      Install into current directory`);
  console.log(`    ${clr('cyan', 'ai-toolkit')} ${clr('yellow', '--local <dir>')}       Install into target directory`);
  console.log(`    ${clr('cyan', 'ai-toolkit')} ${clr('yellow', '--global')}             Install into ~/.claude (global)`);
  console.log(`    ${clr('gray',  '                     --force')}       Overwrite all files without prompting`);
  console.log();
}

async function main() {
  const argv  = process.argv.slice(2);
  const force = argv.includes('--force');

  if (argv.length === 0 || (argv.length === 1 && argv[0] === '--force')) {
    await installLocal('.', force);
    return;
  }

  if (argv[0] === '--local') {
    await installLocal(argv[1] || '.', force);
  } else if (argv[0] === '--global') {
    await installGlobal(force);
  } else if (argv[0] === 'help' || argv[0] === '--help') {
    help();
  } else if (argv[0] === 'merge-allowlist') {
    const destDir = argv[1];
    if (!destDir) {
      console.error('Error: merge-allowlist requires a destination directory');
      process.exit(1);
    }
    try {
      const result = mergeAllowlist(destDir);
      if (result.status === 'error') {
        console.error(`Error: ${result.message}`);
        process.exit(1);
      }
      console.log(`Allowlist: ${result.status}${result.preserved !== undefined ? ` (${result.preserved} rules preserved)` : ''}`);
      process.exit(0);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  } else if (argv[0] === 'update-gitignore') {
    const destDir = argv[1];
    if (!destDir) {
      console.error('Error: update-gitignore requires a destination directory');
      process.exit(1);
    }
    try {
      const result = updateGitignore(destDir);
      if (result.status === 'error') {
        console.error(`Error: ${result.message}`);
        process.exit(1);
      }
      console.log(`Gitignore: ${result.status}`);
      process.exit(0);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  } else if (argv[0] === 'doctor' && argv[1] === 'resolution') {
    const remaining  = argv.slice(2);
    const projectIdx = remaining.indexOf('--project');
    const homeIdx    = remaining.indexOf('--home');
    const projectDir = projectIdx !== -1 ? remaining[projectIdx + 1] : process.cwd();
    const home       = homeIdx    !== -1 ? remaining[homeIdx    + 1] : undefined;
    runDoctorResolution({ projectDir, home });
    process.exit(0);
  } else if (fs.existsSync(argv[0]) && fs.statSync(argv[0]).isDirectory()) {
    await installLocal(argv[0], force);
  } else {
    help();
    process.exit(1);
  }
}

// ── entry point guard ─────────────────────────────────────────────────────────
// Run the CLI only when invoked directly (node bin/cli.js).
// When required as a module (e.g., by Jest), skip main() and export pure
// functions so they can be unit-tested without side effects.
if (require.main === module) {
  main();
} else {
  module.exports = {
    fileHash,
    walkDir,
    expandMappings,
    categorize,
    readInstalledVersion,
    NEVER_COPY,
    readManifest,
    computeOrphans,
    moveToTrash,
    writeManifest,
    CANONICAL_ALLOW,
    CANONICAL_ASK,
    commandToPermission,
    normalizeSettings,
    mergeArrays,
    applyAskBeatsAllow,
    readSettings,
    writeSettings,
    mergeAllowlist,
    updateGitignore,
    appendLedgerEntry,
    updateLedgerEntry,
    resolveClaudeRuntimeAsset,
    runDoctorResolution,
  };
}
