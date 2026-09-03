#!/usr/bin/env node
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const executionLedger = require('../lib/execution-ledger');
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
        const rel = path.relative(src, entry);
        files.push({ src: entry, dest: path.join(dest, rel) });
      }
    } else {
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

// Timestamp used for the current install/upgrade session — set once so all orphans
// from the same run land in the same subdirectory, making the trash auditable.
let _trashTimestamp = null;
function trashTimestamp() {
  if (!_trashTimestamp) _trashTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return _trashTimestamp;
}

function moveToTrash(destRoot, relativePath) {
  const source = path.join(destRoot, relativePath);
  if (!fs.existsSync(source)) return;
  // Each upgrade session gets its own timestamped subdirectory so repeated upgrades
  // never overwrite previously trashed files. The timestamp is stable for the session.
  const trashPath = path.join(destRoot, '.claude', '.ai-toolkit-trash', trashTimestamp(), relativePath);
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

function writeManifest(destRoot, fileList, installationMode) {
  const manifestPath = path.join(destRoot, '.claude', MANIFEST_FILE);
  const trashDir = path.join(destRoot, '.claude', '.ai-toolkit-trash');
  const filtered = fileList.filter(rel => {
    const abs = path.join(destRoot, rel);
    return !abs.startsWith(trashDir + path.sep) && abs !== trashDir;
  });
  const manifest = {
    version: TOOLKIT_VERSION,
    installedAt: new Date().toISOString(),
    installationMode: installationMode,
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

async function runInstall(label, mappings, force, destRoot, dryRun = false, installationMode) {
  const { getAssetCategories } = require('../lib/asset-catalog');
  // Catalog runtime-dir prefixes (e.g. '.claude/agents/') — only these paths
  // belong in the manifest. Documentation and CLAUDE.md are excluded.
  const catalogPrefixes = getAssetCategories().map(c => c.runtimeDir.replace(/\\/g, '/') + '/');

  const files    = expandMappings(mappings);
  const entries  = categorize(files);

  const newFiles = entries.filter(e => e.status === 'new');
  const modified = entries.filter(e => e.status === 'modified');
  const same     = entries.filter(e => e.status === 'same');

  // ── prune phase (before file copy) ───────────────────────────────────────────
  const oldManifest = readManifest(destRoot);
  const allFileSet  = files.map(f => path.relative(destRoot, f.dest).replace(/\\/g, '/'));
  // Restrict manifest entries to catalog runtime assets only (no docs, no CLAUDE.md).
  const newFileSet  = allFileSet.filter(rel => catalogPrefixes.some(p => rel.startsWith(p)));
  // Filter orphans to catalog prefixes only: entries from old manifests outside catalog dirs
  // (e.g. docs/, CLAUDE.md written by pre-hotfix installers) must never be treated as orphans.
  const orphans     = computeOrphans(oldManifest.files, newFileSet)
    .filter(o => catalogPrefixes.some(p => o.replace(/\\/g, '/').startsWith(p)));

  const existingOrphans = orphans.filter(o => fs.existsSync(path.join(destRoot, o)));

  if (existingOrphans.length > 0) {
    console.log();
    const orphanLabel = dryRun
      ? clr('red', `${existingOrphans.length} stale file(s) would be removed`)
      : clr('red', `${existingOrphans.length} stale file(s) found`);
    console.log(`${bold('📦 Orphan cleanup')}  ${clr('gray', '→')}  ${orphanLabel}`);
    console.log(divider());
    for (const orphan of existingOrphans) {
      const marker = dryRun ? clr('red', 'WOULD REMOVE') : clr('red', 'REMOVED ');
      console.log(`  ${clr('red', '∅')} ${marker}  ${orphan}`);
    }
    console.log(divider());
  }

  let removedCount = 0;
  let keptCount    = 0;

  if (!dryRun) {
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
  }

  // ── install plan display ──────────────────────────────────────────────────────
  console.log();
  const planTitle = dryRun ? bold('📦 Dry run — install plan') : bold('📦 Install plan');
  console.log(`${planTitle}  ${clr('gray', '→')}  ${clr('cyan', label)}`);
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

  if (dryRun) {
    console.log(`  ${clr('cyan', 'ℹ')}  Dry run — no files were written.\n`);
    return;
  }

  for (const e of newFiles) {
    ensureDir(e.dest);
    fs.copyFileSync(e.src, e.dest);
  }

  if (modified.length === 0) {
    console.log(`  ${clr('green', '✔')}  All new files copied. No conflicts.\n`);
    writeManifest(destRoot, newFileSet, installationMode);
    return;
  }

  if (force) {
    console.log(`  ${clr('yellow', '⚑')}  --force: overwriting all modified files.`);
    for (const e of modified) {
      ensureDir(e.dest);
      fs.copyFileSync(e.src, e.dest);
      console.log(`     ${clr('yellow', '↺')} ${dim(path.relative(process.cwd(), e.dest))}`);
    }
    writeManifest(destRoot, newFileSet, installationMode);
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

  writeManifest(destRoot, newFileSet, installationMode);
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

// ── resolveFeaturesRoot ───────────────────────────────────────────────────────

// US-05-TASK-BE-01 (FTR-016):
// Resolve the features root directory for a given working directory.
//
// Ordered precedence — ALL candidates are gathered before deciding so that
// ambiguity (multiply-declared AGENTS.md entries, multiple inconsistent
// defaults) can be detected rather than silently swallowed:
//   1. Explicit override via options.featuresRoot (highest precedence)
//   2. features_root: convention parsed from <cwd>/AGENTS.md
//   3. A single existing conventional default directory
//
// AGENTS.md grammar parser (deterministic):
//   - Ignores HTML-comment lines of the form <!-- ... --> (same input line)
//   - Strips inline # comments from the value and trims trailing whitespace
//   - Counts only active (non-commented) declarations when detecting the
//     multiply-declared error; throws when two or more are found
//
// Returns an absolute path.
// Throws a clear structured Error on ambiguous or multiply-declared roots.
//
// Parameters:
//   cwd     (string): project root directory
//   options (object): { featuresRoot? } — explicit override, highest precedence
function resolveFeaturesRoot(cwd, options) {
  const opts        = options || {};
  const resolvedCwd = path.resolve(cwd);

  // Conventional default directories tried when no higher-precedence source is found.
  const CONVENTIONAL_DEFAULTS = [
    'internal_docs/features',
    'docs/features',
  ];

  // ── AGENTS.md grammar parser ──────────────────────────────────────────────
  // Returns an array of trimmed value strings for each ACTIVE features_root:
  // declaration found in <cwdDir>/AGENTS.md.  Deterministic: same input →
  // same result; does not rely on filesystem ordering.
  function parseAgentsMdDeclarations(cwdDir) {
    const agentsMdPath = path.join(cwdDir, 'AGENTS.md');
    if (!fs.existsSync(agentsMdPath)) return [];
    let content;
    try { content = fs.readFileSync(agentsMdPath, 'utf8'); } catch (_) { return []; }

    const declarations = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();

      // Ignore HTML comment lines: <!-- anything -->
      if (/^<!--.*-->$/.test(trimmed)) continue;

      // Match active features_root: declarations
      const match = trimmed.match(/^features_root:\s*(.*)$/);
      if (!match) continue;

      // Strip inline # comment, then trim
      let value = match[1];
      const hashIdx = value.indexOf('#');
      if (hashIdx !== -1) value = value.substring(0, hashIdx);
      value = value.trim();

      if (value) declarations.push(value);
    }
    return declarations;
  }

  // ── Source 1: Explicit override ───────────────────────────────────────────
  if (opts.featuresRoot !== undefined && opts.featuresRoot !== null && opts.featuresRoot !== '') {
    return path.resolve(resolvedCwd, opts.featuresRoot);
  }

  // ── Source 2: AGENTS.md features_root: convention ────────────────────────
  const agentsDeclarations = parseAgentsMdDeclarations(resolvedCwd);
  if (agentsDeclarations.length > 1) {
    throw new Error(
      `resolveFeaturesRoot: AGENTS.md declares features_root: ${agentsDeclarations.length} times ` +
      `(values: ${agentsDeclarations.map(v => JSON.stringify(v)).join(', ')}); ` +
      'only one active declaration is allowed'
    );
  }
  if (agentsDeclarations.length === 1) {
    return path.resolve(resolvedCwd, agentsDeclarations[0]);
  }

  // ── Source 3: Conventional defaults — use only when exactly one exists ────
  const existingDefaults = CONVENTIONAL_DEFAULTS
    .map(d => path.resolve(resolvedCwd, d))
    .filter(d => { try { return fs.statSync(d).isDirectory(); } catch (_) { return false; } });

  if (existingDefaults.length === 1) {
    return existingDefaults[0];
  }

  if (existingDefaults.length > 1) {
    throw new Error(
      `resolveFeaturesRoot: multiple conventional default directories exist ` +
      `(${existingDefaults.join(', ')}); declare features_root: in AGENTS.md to disambiguate`
    );
  }

  throw new Error(
    `resolveFeaturesRoot: no features root found under ${resolvedCwd}. ` +
    'Declare features_root: in AGENTS.md or create one of the conventional default directories ' +
    `(${CONVENTIONAL_DEFAULTS.join(', ')})`
  );
}

// ── payload & detection ───────────────────────────────────────────────────────

// Returns file-level {src, dest} mappings (absolute paths) for ALL distributable
// catalog assets, applying TOOLKIT_INTERNAL_ASSETS exclusions.
// This is the single authoritative source used by the installer (copy plan),
// resolver, doctor, and list-assets so that ALL four agree on exactly what a valid
// installation contains. effectiveRoot must be the .claude/ runtime directory.
function buildPayloadFileMappings(effectiveRoot) {
  const { getAssetCategories } = require('../lib/asset-catalog');
  const mappings = [];
  for (const cat of getAssetCategories()) {
    const srcDir      = path.join(packageRoot, cat.sourceDir);
    if (!fs.existsSync(srcDir)) continue;
    const internalItems = TOOLKIT_INTERNAL_ASSETS[cat.name];
    const catSubDir   = cat.runtimeDir.replace(/^\.claude\//, '');
    const destCatDir  = path.join(effectiveRoot, catSubDir);
    let entries;
    try { entries = fs.readdirSync(srcDir); } catch (_) { continue; }
    for (const item of entries) {
      if (internalItems && internalItems.has(item)) continue;
      const itemSrc = path.join(srcDir, item);
      let stat;
      try { stat = fs.statSync(itemSrc); } catch (_) { continue; }
      if (stat.isDirectory()) {
        try {
          for (const f of walkDir(itemSrc)) {
            const rel = path.relative(itemSrc, f);
            mappings.push({ src: f, dest: path.join(destCatDir, item, rel) });
          }
        } catch (_) { /* ignore */ }
      } else {
        mappings.push({ src: itemSrc, dest: path.join(destCatDir, item) });
      }
    }
  }
  return mappings;
}

// Returns the Set of absolute runtime dest-paths derived from buildPayloadFileMappings.
// Used by resolver, doctor, and list-assets for completeness checks.
function buildExpectedPayload(effectiveRoot) {
  return new Set(buildPayloadFileMappings(effectiveRoot).map(m => path.resolve(m.dest)));
}

// ── validateRuntimeRelativePath ───────────────────────────────────────────────
// Single source of truth for runtime-path safety and canonicalization. Used by
// BOTH resolveClaudeRuntimeAsset() (lenient: normalizes and accepts) and
// validateManifestFilesField() (strict: rejects any non-canonical form). The
// two callers format their own diagnostics, but traversal, absolute/drive paths,
// null bytes, confinement, and the canonical computation live here only.
//
// A path is safe when it is a non-empty string with no surrounding whitespace,
// no null byte, is neither a Unix/Windows absolute path nor drive-relative
// (e.g. 'C:foo'), and contains no '..' traversal segment.
// Its canonical form uses '/' as the sole separator with no '.'/empty segments,
// no double separators, and no trailing slash.
//
// options:
//   root             — absolute installation root; when given, the returned
//                      `resolved` is confined within it. NOTE: after the
//                      absolute/drive/traversal rejections above, a surviving
//                      value can never escape root, so the 'escapes-root' branch
//                      is unreachable defence in depth (retained against future
//                      OS/symlink normalization surprises).
//   requireCanonical — when true, a value that is not already canonical is an
//                      error (code 'non-canonical'); the manifest validator uses
//                      this so doctor flags incoherent manifests instead of
//                      silently normalizing them.
//
// Returns on success: { ok: true, canonical, resolved, canonicalDiffers }
// Returns on failure: { ok: false, code, reason, canonical? }
function validateRuntimeRelativePath(value, options) {
  const opts = options || {};
  const fail = (code, reason, extra) => Object.assign({ ok: false, code, reason }, extra);

  if (typeof value !== 'string') {
    const found = value === null ? 'null' : value === undefined ? 'undefined' : typeof value;
    return fail('not-string', `must be a non-empty string (found ${found})`);
  }
  if (value.length === 0) {
    return fail('empty', 'must be a non-empty string (found empty string)');
  }
  if (value.includes('\0')) {
    return fail('null-byte', 'must not contain null bytes');
  }
  if (value.trim().length === 0) {
    return fail('whitespace-only', 'must not be a whitespace-only string');
  }
  if (value !== value.trim()) {
    return fail('surrounding-whitespace', 'must not have leading or trailing whitespace');
  }
  // Normalize separators BEFORE the absolute-path checks. Otherwise a rooted
  // Windows path ('\Windows\x.md') or a UNC path ('\\server\share\x.md') would
  // slip past a raw startsWith('/') test and be reinterpreted as relative once
  // the backslashes were converted. Per the Tech Spec: normalize '\' → '/' first,
  // then reject anything that begins with '/'.
  const unified = value.replace(/\\/g, '/');
  if (unified.startsWith('/')) {
    // Covers Unix absolute ('/etc/passwd'), rooted Windows ('\Windows\x.md' → '/…'),
    // and UNC ('\\server\share' → '//server/share', or already-'/'-form '//server').
    return fail('absolute-unix', 'must be relative (got Unix absolute path)');
  }
  if (/^[A-Za-z]:\//.test(unified)) {
    return fail('absolute-windows', 'must be relative (got Windows absolute path)');
  }
  if (/^[A-Za-z]:/.test(unified)) {
    return fail('drive-relative', 'must be relative (got Windows drive-relative path)');
  }
  if (unified.split('/').includes('..')) {
    return fail('traversal', 'must not contain path traversal (..)');
  }
  // Canonical form: forward slashes, no '.'/empty segments, no double separators,
  // no trailing slash. '..' is already rejected above, so it cannot survive here.
  const canonical = unified.split('/').filter(s => s !== '' && s !== '.').join('/');
  if (canonical.length === 0) {
    return fail('empty-after-canonical', 'must resolve to a non-empty canonical path');
  }
  let resolved = null;
  if (opts.root !== undefined && opts.root !== null) {
    const rootResolved = path.resolve(opts.root);
    resolved = path.resolve(rootResolved, canonical);
    if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
      return fail('escapes-root', 'escapes the installation root', { canonical });
    }
  }
  const canonicalDiffers = value !== canonical;
  if (opts.requireCanonical && canonicalDiffers) {
    return fail('non-canonical', `is not canonical; expected '${canonical}'`, { canonical });
  }
  return { ok: true, canonical, resolved, canonicalDiffers };
}

// Validate the shape of a manifest 'files' field for the doctor's schema check.
// Returns an array of human-readable error strings; an empty array means valid.
// A valid 'files' field is an array whose every element is a canonical,
// destination-relative path (forward slashes only, no '.'/'..'/empty segments,
// no trailing slash) confined to destRoot and free of null bytes. Non-canonical
// entries are reported — never silently normalized — so doctor requires the
// installer to regenerate an incoherent manifest.
// destRoot is the installation destination (parent of .claude) paths resolve against.
function validateManifestFilesField(files, destRoot) {
  const errors = [];
  if (!Array.isArray(files)) {
    errors.push(`'files' must be an array (found ${files === null ? 'null' : typeof files})`);
    return errors;
  }
  const rootResolved = path.resolve(destRoot);
  files.forEach((entry, i) => {
    const check = validateRuntimeRelativePath(entry, { root: rootResolved, requireCanonical: true });
    if (check.ok) return;
    // Format the diagnostic inline — this is the only caller, so no shared helper.
    // The entry is echoed (when a string) so operators can spot the culprit.
    const shown = typeof entry === 'string' ? ` ('${entry}')` : '';
    let msg;
    switch (check.code) {
      case 'traversal':
        msg = `'files[${i}]' must not contain '..' segments (path traversal)${shown}`;
        break;
      case 'non-canonical':
        msg = `'files[${i}]' is not canonical; expected '${check.canonical}'${shown}`;
        break;
      case 'escapes-root':
        msg = `'files[${i}]' escapes the installation root${shown}`;
        break;
      default:
        msg = `'files[${i}]' ${check.reason}${shown}`;
    }
    errors.push(msg);
  });
  return errors;
}

// Shared presence-detection helpers — used by resolver, doctor, and list-assets.
// condC: at least one catalog category directory inside claudeDir has files.
function hasToolkitPayloadFiles(claudeDir) {
  const { getAssetCategories } = require('../lib/asset-catalog');
  for (const cat of getAssetCategories()) {
    const catDir = path.join(claudeDir, cat.runtimeDir.replace(/^\.claude\//, ''));
    if (!fs.existsSync(catDir)) continue;
    try { if (fs.statSync(catDir).isDirectory() && walkDir(catDir).length > 0) return true; }
    catch (_) { /* ignore unreadable dirs */ }
  }
  return false;
}

// A toolkit installation is PRESENT at claudeDir when any of:
//   condA: .ai-toolkit-manifest.json exists (content may be corrupt)
//   condB: .ai-toolkit-version exists
//   condC: at least one catalog category dir contains one or more files
// settings.json / settings.local.json alone do NOT satisfy any condition.
function isToolkitInstalled(claudeDir) {
  if (fs.existsSync(path.join(claudeDir, '.ai-toolkit-manifest.json'))) return true;
  if (fs.existsSync(path.join(claudeDir, '.ai-toolkit-version')))       return true;
  return hasToolkitPayloadFiles(claudeDir);
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
  // Delegate all path-safety + canonicalization to the shared primitive. The
  // resolver is lenient (requireCanonical omitted): it normalizes backslashes,
  // '.'/empty segments, and trailing slashes into the canonical form and
  // proceeds, but still rejects null bytes, absolute/drive paths, and traversal.
  const inputCheck = validateRuntimeRelativePath(relativePath);
  if (!inputCheck.ok) {
    throw new Error(`relativePath ${inputCheck.reason}`);
  }
  relativePath = inputCheck.canonical;

  // ── Runtime root definitions ───────────────────────────────────────────────
  const localRuntimeRoot  = path.join(effectiveProjectDir, '.claude');
  const globalRuntimeRoot = path.join(effectiveHome, '.claude');

  // ── Phase A: Presence detection ────────────────────────────────────────────
  const localPresent  = isToolkitInstalled(localRuntimeRoot);
  const globalPresent = isToolkitInstalled(globalRuntimeRoot);

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

  // Confinement lives in the shared primitive: re-validate the (already canonical)
  // relativePath against the now-known installation root and reuse its resolved
  // absolute path everywhere below, instead of re-implementing path.resolve +
  // startsWith here.
  const rootedCheck = validateRuntimeRelativePath(relativePath, { root: effectiveRoot });
  if (!rootedCheck.ok) {
    throw new Error('Resolved path escapes installation root (confinement violation)');
  }
  const absoluteRequested = rootedCheck.resolved;

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
  // Use the shared distributable payload function so the resolver checks exactly
  // the same files that the installer writes (TOOLKIT_INTERNAL_ASSETS excluded).
  const expectedPayload = buildExpectedPayload(effectiveRoot);

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
  // Confinement was already enforced by the shared primitive above; absoluteRequested
  // is its confined, resolved absolute path (effectiveRoot already ends at .claude/).
  const absolutePath = absoluteRequested;

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
    // Defensive: a malformed manifest may contain non-string entries; ignore them
    // here so doctor still produces a read-only report (the schema check flags them).
    const tracked = new Set(
      manifestData.files.filter(f => typeof f === 'string').map(f => f.replace(/\\/g, '/'))
    );
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
  const localPresent  = isToolkitInstalled(localRuntimeRoot);
  const globalPresent = isToolkitInstalled(globalRuntimeRoot);

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

  // ── Disk Completeness ─────────────────────────────────────────────────────────
  H('Disk Completeness');
  let diskIncomplete = false;
  let missingRuntimeFiles = [];

  if (mode === 'local-only' || mode === 'global-only') {
    const singleRoot = mode === 'local-only' ? localRuntimeRoot : globalRuntimeRoot;
    const expected   = buildExpectedPayload(singleRoot);
    missingRuntimeFiles = [...expected].filter(f => !fs.existsSync(f));
    diskIncomplete = missingRuntimeFiles.length > 0;
  }

  if (mode !== 'local-only' && mode !== 'global-only') {
    L(`  ${dim('(check runs only for single-installation mode)')}`);
  } else if (!diskIncomplete) {
    L(`  ${tick}  ${clr('green', 'COMPLETE')}  ${dim('all catalog files present on disk')}`);
  } else {
    L(`  ${cross}  ${clr('red', 'INCOMPLETE')}  — ${missingRuntimeFiles.length} required file(s) missing:`);
    for (const f of missingRuntimeFiles.slice(0, 10)) {
      L(`    ${clr('red', '✖')} ${dim(f)}`);
    }
    if (missingRuntimeFiles.length > 10) L(`    ${dim(`... and ${missingRuntimeFiles.length - 10} more`)}`);
  }
  L('');

  // ── Action Items ────────────────────────────────────────────────────────────
  H('Action Items');
  const actions = [];
  let manifestSchemaProblematic = false;
  let manifestModeInconsistent  = false;
  let manifestFilesIncomplete   = false;

  if (mode === 'both') {
    actions.push(`${warnS}  Choose one: delete local or global installation to resolve ambiguity`);
  }
  if (mode === 'none') {
    actions.push(`${cross}  No installation found. Run 'npm run toolkit:dev-install-global' or the local installer`);
  }
  if (mode === 'local-only' || mode === 'global-only') {
    const effectiveRoot  = mode === 'local-only' ? localRuntimeRoot : globalRuntimeRoot;
    const detectedMode   = mode === 'local-only' ? 'local' : 'global';
    const iv = readVersionStamp(effectiveRoot);
    if (iv && iv !== TOOLKIT_VERSION) {
      actions.push(`${warnS}  Version mismatch: run 'npm run toolkit:dev-install-global' to update`);
    }
    const mInfo = readManifestInfo(effectiveRoot);
    if (mInfo.status === 'corrupt') {
      manifestSchemaProblematic = true;
      actions.push(`${cross}  Manifest schema invalid: file is corrupt (invalid JSON)`);
    } else if (mInfo.status === 'missing') {
      manifestSchemaProblematic = true;
      actions.push(`${warnS}  Manifest is ${mInfo.status}. Run the installer to regenerate.`);
    } else if (mInfo.status === 'present' && mInfo.data) {
      // Check required manifest fields (including installationMode).
      const required = ['version', 'installedAt', 'installationMode', 'files'];
      const missingFields = required.filter(f => mInfo.data[f] === undefined);
      if (missingFields.length > 0) {
        manifestSchemaProblematic = true;
        for (const f of missingFields) {
          actions.push(`${cross}  Manifest schema invalid: missing required field '${f}'`);
        }
        actions.push(`${warnS}  Run the installer to regenerate the manifest with all required fields.`);
      } else {
        const parentDir = path.join(effectiveRoot, '..');
        // installationMode must match the detected installation mode.
        if (mInfo.data.installationMode !== detectedMode) {
          manifestModeInconsistent = true;
          actions.push(
            `${cross}  Manifest installationMode='${mInfo.data.installationMode}' does not match ` +
            `detected mode '${detectedMode}' — run the installer to repair`
          );
        }
        // manifest.files must be a well-formed array of relative, in-bounds paths.
        const filesErrors = validateManifestFilesField(mInfo.data.files, parentDir);
        if (filesErrors.length > 0) {
          manifestSchemaProblematic = true;
          for (const e of filesErrors.slice(0, 5)) {
            actions.push(`${cross}  Manifest schema invalid: ${e}`);
          }
          if (filesErrors.length > 5) {
            actions.push(`${cross}  ... and ${filesErrors.length - 5} more manifest 'files' error(s)`);
          }
          actions.push(`${warnS}  Run the installer to regenerate the manifest with a valid 'files' list.`);
        } else {
          // files is a valid array — it must cover all expected catalog assets.
          const expected       = buildExpectedPayload(effectiveRoot);
          const manifestAbsSet = new Set(
            mInfo.data.files.map(f => path.resolve(path.join(parentDir, f)))
          );
          const missingFromManifest = [...expected].filter(f => !manifestAbsSet.has(f));
          if (missingFromManifest.length > 0) {
            manifestFilesIncomplete = true;
            actions.push(
              `${cross}  manifest.files is missing ${missingFromManifest.length} expected catalog asset(s) — run the installer`
            );
            for (const f of missingFromManifest.slice(0, 3)) {
              actions.push(`       ${dim(path.basename(f))}`);
            }
            if (missingFromManifest.length > 3) {
              actions.push(`       ${dim(`... and ${missingFromManifest.length - 3} more`)}`);
            }
          }
        }
      }
    }
  }
  if (diskIncomplete) {
    const display = missingRuntimeFiles.slice(0, 5);
    for (const f of display) {
      actions.push(`${cross}  Missing required file: ${dim(path.basename(f))} — run the installer`);
    }
    if (missingRuntimeFiles.length > 5) {
      actions.push(`${cross}  ... and ${missingRuntimeFiles.length - 5} more missing file(s) — run the installer`);
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
  // READY requires: single installation, valid manifest schema, consistent installationMode,
  // manifest.files covering all expected assets, and complete disk payload.
  const overallOk = (mode === 'local-only' || mode === 'global-only')
    && !manifestSchemaProblematic
    && !manifestModeInconsistent
    && !manifestFilesIncomplete
    && !diskIncomplete;
  const overallStatus = overallOk ? 'READY' : 'PROBLEMATIC';
  L(`  Status: ${clr(overallOk ? 'green' : 'red', overallStatus)}`);
  let recommendation;
  if (mode === 'none') {
    recommendation = "Run 'npm run toolkit:dev-install-global' to install globally, or use the local installer.";
  } else if (mode === 'both') {
    recommendation = 'Remove one installation to resolve ambiguity before running pipelines.';
  } else if (manifestSchemaProblematic || manifestModeInconsistent || manifestFilesIncomplete) {
    recommendation = 'Run the installer to repair the manifest before running pipelines.';
  } else if (diskIncomplete) {
    recommendation = 'Run the installer to complete the installation before running pipelines.';
  } else {
    recommendation = `Installation is operational in ${mode} mode.`;
  }
  L(`  Recommendation: ${dim(recommendation)}`);
  L('');
  L(clr('gray', '═'.repeat(72)));
  L('');
}

// ── validatePurityGuard ───────────────────────────────────────────────────────

// US-05-TASK-BE-03 (FTR-015):
// Rejects any *.test.js files or blocked directory segments under sourceDir.
// Called by the installer before copying and by the prepack lifecycle hook.
//
// Blocked file patterns: *.test.js
// Blocked directory names: tests, fixtures, mocks, helpers
//
// Returns an array of violation strings (empty = clean).
// Never modifies the filesystem.
const PURITY_BLOCKED_DIRS  = new Set(['tests', 'fixtures', 'mocks', 'helpers']);
const PURITY_BLOCKED_EXTS  = ['.test.js'];

function validatePurityGuard(sourceDir) {
  const violations = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    let entries;
    try { entries = fs.readdirSync(dir); } catch (_) { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      let stat;
      try { stat = fs.statSync(full); } catch (_) { continue; }
      if (stat.isDirectory()) {
        if (PURITY_BLOCKED_DIRS.has(entry)) {
          violations.push(`Blocked directory: ${full}`);
        } else {
          walk(full);
        }
      } else {
        if (PURITY_BLOCKED_EXTS.some(ext => entry.endsWith(ext))) {
          violations.push(`Blocked file: ${full}`);
        }
      }
    }
  }

  walk(sourceDir);
  return violations;
}

// validate-purity CLI command entry point.
// Scans sourceDir (defaults to src/claude/) for test or fixture contamination.
// Exit 0 = clean. Exit 1 = violations found. Violations written to stderr.
function runValidatePurity(sourceDir) {
  const effectiveDir = sourceDir
    ? path.resolve(sourceDir)
    : path.join(packageRoot, 'src', 'claude');

  const violations = validatePurityGuard(effectiveDir);
  if (violations.length === 0) {
    process.stdout.write(`Purity guard: PASS — no test files or blocked dirs under ${effectiveDir}\n`);
    process.exit(0);
  } else {
    process.stderr.write(`Purity guard: FAIL — ${violations.length} violation(s) under ${effectiveDir}:\n`);
    for (const v of violations) process.stderr.write(`  ${v}\n`);
    process.exit(1);
  }
}

// ── distributable asset mapping ───────────────────────────────────────────────

// Assets that are toolkit-internal and must NEVER be distributed to consumer
// projects. Keyed by category name; value is a Set of item names to skip.
// See AGENTS.md hard constraints.
const TOOLKIT_INTERNAL_ASSETS = {
  agents: new Set(['install-toolkit.md']),
  skills: new Set(['install-toolkit']),
};

// ── verifyInstall ─────────────────────────────────────────────────────────────

// Checks that the version stamp in <home>/.claude/.ai-toolkit-version matches
// package.json. Called as the final step of toolkit:dev-install-global.
// Exit 0 = versions match. Exit 1 = stamp missing, unreadable, or wrong version.
function runVerifyInstall(options) {
  const os = require('os');
  const opts          = options || {};
  const effectiveHome = opts.home !== undefined ? path.resolve(opts.home) : os.homedir();
  const versionFile   = path.join(effectiveHome, '.claude', VERSION_FILE);

  if (!fs.existsSync(versionFile)) {
    process.stderr.write(`Error: verify-install FAILED — no version stamp at ${versionFile}\n`);
    process.exit(1);
  }

  let stamp;
  try {
    stamp = fs.readFileSync(versionFile, 'utf8').trim();
  } catch (err) {
    process.stderr.write(`Error: verify-install FAILED — cannot read ${versionFile}: ${err.message}\n`);
    process.exit(1);
  }

  if (!stamp) {
    process.stderr.write(`Error: verify-install FAILED — version stamp is empty at ${versionFile}\n`);
    process.exit(1);
  }

  if (stamp !== TOOLKIT_VERSION) {
    process.stderr.write(
      `Error: verify-install FAILED — version mismatch\n` +
      `  installed: ${stamp}\n` +
      `  expected:  ${TOOLKIT_VERSION}\n` +
      `Run 'npm run toolkit:dev-install-global' to update.\n`
    );
    process.exit(1);
  }

  process.stdout.write(`verify-install: PASS — version ${stamp} matches package.json\n`);
  process.exit(0);
}

// ── entry points ──────────────────────────────────────────────────────────────

async function installLocal(targetDir, force, dryRun = false) {
  banner();
  targetDir = path.resolve(process.cwd(), targetDir || '.');
  console.log(`  ${clr('cyan', '▸')}  Target: ${bold(targetDir)}\n`);
  if (!dryRun) await checkVersion(targetDir, force);
  // Purity guard (UC-05 / BR-16 / AC-29): abort if source contains test files or blocked dirs.
  const srcClaudeDir = path.join(packageRoot, 'src', 'claude');
  const purityViolations = validatePurityGuard(srcClaudeDir);
  if (purityViolations.length > 0) {
    process.stderr.write(`Purity guard: FAIL — ${purityViolations.length} violation(s):\n`);
    for (const v of purityViolations) process.stderr.write(`  ${v}\n`);
    process.exit(1);
  }
  // Build copy plan from the single canonical source (buildPayloadFileMappings) so
  // installer, resolver, doctor, and list-assets all use the same distributable set.
  const mappings = [
    ...buildPayloadFileMappings(path.join(targetDir, '.claude')),
    { src: path.join(packageRoot, 'docs'),      dest: path.join(targetDir, 'docs') },
    { src: path.join(packageRoot, 'CLAUDE.md'), dest: path.join(targetDir, 'CLAUDE.md') },
  ];
  await runInstall(`local project`, mappings, force, targetDir, dryRun, 'local');
  if (dryRun) return;
  writeInstalledVersion(targetDir);
  console.log(`  ${clr('green', '✔')}  ${bold('Install complete.')}\n`);
  checkSpawnDepth(targetDir);
  console.log(divider());
  console.log(`\n  ${bold('Next steps:')}`);
  console.log(`  ${clr('cyan', '1.')} Run ${clr('cyan', '/init-agents')} to generate AGENTS.md`);
  console.log(`  ${clr('cyan', '2.')} Create a feature doc and run ${clr('cyan', '/implement-feature')}`);
  console.log();
}

async function installGlobal(force, dryRun = false, homeOverride = undefined) {
  banner();
  try {
    const homedir = homeOverride !== undefined ? path.resolve(homeOverride) : require('os').homedir();
    const target  = path.join(homedir, '.claude');
    console.log(`  ${clr('cyan', '▸')}  Target: ${bold(target)}  ${clr('gray', '(global Claude folder)')}\n`);
    // destRoot is homedir so helpers (manifest, version stamp, trash) resolve to
    // ~/.claude/... rather than ~/.claude/.claude/... (FIX: global install root path)
    if (!dryRun) await checkVersion(homedir, force);
    // Purity guard (UC-05 / BR-16 / AC-29): abort if source contains test files or blocked dirs.
    const srcClaudeDir = path.join(packageRoot, 'src', 'claude');
    const purityViolations = validatePurityGuard(srcClaudeDir);
    if (purityViolations.length > 0) {
      process.stderr.write(`Purity guard: FAIL — ${purityViolations.length} violation(s):\n`);
      for (const v of purityViolations) process.stderr.write(`  ${v}\n`);
      process.exit(1);
    }
    // Build copy plan from the single canonical source (buildPayloadFileMappings).
    const mappings = [
      ...buildPayloadFileMappings(target),
      { src: path.join(packageRoot, 'docs'),             dest: path.join(target, 'docs') },
      { src: path.join(packageRoot, 'CLAUDE.global.md'), dest: path.join(target, 'CLAUDE.md') },
    ];
    await runInstall('global Claude folder', mappings, force, homedir, dryRun, 'global');
    if (dryRun) return;
    writeInstalledVersion(homedir);
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
  console.log(`    ${clr('gray',  '                     --dry-run')}     Preview what would change — no files written`);
  console.log();
}

async function main() {
  const argv   = process.argv.slice(2);
  const force  = argv.includes('--force');
  const dryRun = argv.includes('--dry-run');

  if (argv.length === 0 || argv.every(a => a === '--force' || a === '--dry-run')) {
    await installLocal('.', force, dryRun);
    return;
  }

  if (argv[0] === '--local') {
    await installLocal(argv[1] || '.', force, dryRun);
  } else if (argv[0] === '--global') {
    const homeIdx = argv.indexOf('--home');
    const homeOverride = homeIdx !== -1 ? argv[homeIdx + 1] : undefined;
    await installGlobal(force, dryRun, homeOverride);
  } else if (argv[0] === 'install') {
    // Subcommand aliases: `install --project <dir>` ≡ `--local <dir>`
    //                     `install --global`         ≡ `--global`
    const sub = argv[1];
    if (sub === '--project') {
      await installLocal(argv[2] || '.', force, dryRun);
    } else if (sub === '--global') {
      await installGlobal(force, dryRun);
    } else {
      // No sub-flag: install into current directory (same as bare invocation)
      await installLocal(sub && !sub.startsWith('-') ? sub : '.', force, dryRun);
    }
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
  } else if (argv[0] === 'verify-install') {
    const remaining = argv.slice(1);
    const homeIdx   = remaining.indexOf('--home');
    const home      = homeIdx !== -1 ? remaining[homeIdx + 1] : undefined;
    runVerifyInstall({ home });
  } else if (argv[0] === 'doctor' && argv[1] === 'resolution') {
    const remaining  = argv.slice(2);
    const projectIdx = remaining.indexOf('--project');
    const homeIdx    = remaining.indexOf('--home');
    const projectDir = projectIdx !== -1 ? remaining[projectIdx + 1] : process.cwd();
    const home       = homeIdx    !== -1 ? remaining[homeIdx    + 1] : undefined;
    runDoctorResolution({ projectDir, home });
    process.exit(0);
  } else if (argv[0] === 'validate-purity') {
    runValidatePurity(argv[1]);
  } else if (argv[0] === 'resolve-asset') {
    // resolve-asset <relativePath> [--project <dir>] [--home <dir>]
    // Three-tier model: Tier 1 = exit 0 + stdout=path + stderr="";
    //   Tier 2 = exit 0 + stdout=path + stderr=warnings (emitted by resolver);
    //   Tier 3 = exit 1 + stdout="" + stderr=error.
    const remaining = argv.slice(1);
    let relativePath = null;
    let projectDir   = process.cwd();
    let home;
    for (let i = 0; i < remaining.length; i++) {
      if      (remaining[i] === '--project' && remaining[i + 1]) { projectDir = remaining[++i]; }
      else if (remaining[i] === '--home'    && remaining[i + 1]) { home       = remaining[++i]; }
      else if (!remaining[i].startsWith('-'))                     { relativePath = remaining[i]; }
    }
    if (!relativePath) {
      process.stderr.write('Error: resolve-asset requires a relative path argument\n');
      process.exit(1);
    }
    try {
      const resolved = resolveClaudeRuntimeAsset(relativePath, { projectDir, home });
      process.stdout.write(resolved + '\n');
      process.exit(0);
    } catch (err) {
      process.stderr.write(err.message + '\n');
      process.exit(1);
    }
  } else if (argv[0] === 'run-asset') {
    // run-asset <relativePath> [--project <dir>] [--home <dir>] [-- ...scriptArgs]
    // Security constraints: scripts category only; .js extension only; spawnSync shell:false.
    const remaining   = argv.slice(1);
    const dashDashIdx = remaining.indexOf('--');
    const scriptArgs  = dashDashIdx !== -1 ? remaining.slice(dashDashIdx + 1) : [];
    const beforeDash  = dashDashIdx !== -1 ? remaining.slice(0, dashDashIdx) : remaining;
    let relativePath  = null;
    let projectDir    = process.cwd();
    let home;
    for (let i = 0; i < beforeDash.length; i++) {
      if      (beforeDash[i] === '--project' && beforeDash[i + 1]) { projectDir = beforeDash[++i]; }
      else if (beforeDash[i] === '--home'    && beforeDash[i + 1]) { home       = beforeDash[++i]; }
      else if (!beforeDash[i].startsWith('-'))                      { relativePath = beforeDash[i]; }
    }
    if (!relativePath) {
      process.stderr.write('Error: run-asset requires a relative path argument\n');
      process.exit(1);
    }
    // Security: only the scripts category is executable
    if (!relativePath.startsWith('scripts/')) {
      process.stderr.write(`Error: run-asset is restricted to the scripts category (got: ${relativePath})\n`);
      process.exit(1);
    }
    // Security: .js extension only
    if (!relativePath.endsWith('.js')) {
      process.stderr.write(`Error: run-asset only executes .js files (got: ${relativePath})\n`);
      process.exit(1);
    }
    try {
      const scriptPath = resolveClaudeRuntimeAsset(relativePath, { projectDir, home });
      const { spawnSync } = require('child_process');
      const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
        stdio: 'inherit',
        shell: false,
      });
      if (result.error) {
        process.stderr.write(`Error spawning script: ${result.error.message}\n`);
        process.exit(1);
      }
      process.exit(result.status || 0);
    } catch (err) {
      process.stderr.write(err.message + '\n');
      process.exit(1);
    }
  } else if (argv[0] === 'list-assets') {
    // list-assets --project <dir> --category <name> [--format json|plain] [--home <dir>]
    // Both --project and --category are MANDATORY (Tech Spec contract).
    // Returns exclusively assets from the distributable payload (buildExpectedPayload).
    // Foreign/user-created files under .claude/ are never returned.
    // Exit 0 + result for installed single-mode; exit 1 for no-install or mixed install.
    const { getAssetCategories, getCategoryByName } = require('../lib/asset-catalog');
    const os         = require('os');
    const remaining  = argv.slice(1);
    let category     = null;
    let format       = 'json';
    let projectDir   = null;
    let home;
    for (let i = 0; i < remaining.length; i++) {
      if      (remaining[i] === '--category' && remaining[i + 1]) { category   = remaining[++i]; }
      else if (remaining[i] === '--format'   && remaining[i + 1]) { format     = remaining[++i]; }
      else if (remaining[i] === '--project'  && remaining[i + 1]) { projectDir = remaining[++i]; }
      else if (remaining[i] === '--home'     && remaining[i + 1]) { home       = remaining[++i]; }
    }
    // Mandatory parameter contract (Tier 3: exit 1, stdout empty, diagnostic on stderr).
    if (!projectDir) {
      process.stderr.write('Error: list-assets requires --project <dir>\n');
      process.exit(1);
    }
    if (!category) {
      process.stderr.write('Error: list-assets requires --category <name>\n');
      process.exit(1);
    }
    const cat = getCategoryByName(category);
    if (!cat) {
      const valid = getAssetCategories().map(c => c.name).join(', ');
      process.stderr.write(`Error: unknown category '${category}'. Valid: ${valid}\n`);
      process.exit(1);
    }
    // Shared 3-condition presence detection (same as resolver and doctor).
    const effectiveHome    = home       ? path.resolve(home)       : os.homedir();
    const effectiveProject = path.resolve(projectDir);
    const localClaude      = path.join(effectiveProject, '.claude');
    const globalClaude     = path.join(effectiveHome,    '.claude');

    const localPresent  = isToolkitInstalled(localClaude);
    const globalPresent = isToolkitInstalled(globalClaude);

    if (localPresent && globalPresent) {
      process.stderr.write(
        'Error: mixed installation — toolkit is present in both local (.claude/) and global ' +
        `(${globalClaude}) locations. Remove one before listing assets.\n`
      );
      process.exit(1);
    }

    // No installation → Tier 3 error (exit 1, stdout empty, diagnostic on stderr).
    if (!localPresent && !globalPresent) {
      process.stderr.write('Error: no toolkit installation found. Install with --local or --global.\n');
      process.exit(1);
    }
    const runtimeRoot = localPresent ? localClaude : globalClaude;

    // Return only catalog-defined assets (no foreign files) for the requested
    // category, and only files that actually exist on disk.
    const allExpected = [...buildExpectedPayload(runtimeRoot)].sort();
    const catDir      = path.resolve(path.join(runtimeRoot, cat.name));
    const results = allExpected
      .filter(f => f.startsWith(catDir + path.sep) || f.startsWith(catDir + '/'))
      .filter(f => fs.existsSync(f));

    if (format === 'json') {
      process.stdout.write(JSON.stringify(results, null, 2) + '\n');
    } else {
      for (const r of results) process.stdout.write(r + '\n');
    }
    process.exit(0);
  } else if (argv[0] === 'ledger') {
    handleLedgerCommand(argv.slice(1));
  } else if (fs.existsSync(argv[0]) && fs.statSync(argv[0]).isDirectory()) {
    await installLocal(argv[0], force, dryRun);
  } else {
    help();
    process.exit(1);
  }
}

// ── shell quoting helper ──────────────────────────────────────────────────────
function shellQuotePosix(arg) {
  const s = String(arg);
  if (s.indexOf('\0') !== -1) throw new Error('shellQuotePosix: argument contains a NUL byte');
  if (s.indexOf('\n') !== -1) throw new Error('shellQuotePosix: argument contains a newline');
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function parseLedgerArgs(argv) {
  const PREFIX_RE = /^[A-Za-z]+-\d+$/;
  const result = { prefix: undefined, agent: undefined, attempt: 1, tokens: undefined, dir: undefined, phase: undefined, model: undefined, error: undefined };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const val  = argv[i + 1];

    if (flag === '--prefix') {
      i++;
      if (!val || !PREFIX_RE.test(val)) {
        throw new Error(
          'parseLedgerArgs: --prefix must match /^[A-Za-z]+-\\d+$/ (e.g. FTR-016), got: ' + val
        );
      }
      result.prefix = val;
    } else if (flag === '--agent') {
      i++;
      if (!val) {
        throw new Error('parseLedgerArgs: --agent must be a non-empty string');
      }
      result.agent = val;
    } else if (flag === '--attempt') {
      i++;
      const n = Number(val);
      if (!Number.isInteger(n)) {
        throw new Error('parseLedgerArgs: --attempt must be an integer, got: ' + val);
      }
      result.attempt = n;
    } else if (flag === '--tokens') {
      i++;
      const n = Number(val);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error('parseLedgerArgs: --tokens must be an integer >= 1, got: ' + val);
      }
      result.tokens = n;
    } else if (flag === '--dir') {
      i++;
      if (!val) {
        throw new Error('parseLedgerArgs: --dir must be a non-empty string');
      }
      result.dir = val;
    } else if (flag === '--phase') {
      i++;
      if (!val) {
        throw new Error('parseLedgerArgs: --phase must be a non-empty string');
      }
      result.phase = val;
    } else if (flag === '--model') {
      i++;
      if (!val) {
        throw new Error('parseLedgerArgs: --model must be a non-empty string');
      }
      result.model = val;
    } else if (flag === '--error') {
      i++;
      if (!val) {
        throw new Error('parseLedgerArgs: --error must be a non-empty string');
      }
      result.error = val;
    }
  }

  if (!result.prefix) {
    throw new Error('parseLedgerArgs: --prefix is required');
  }
  if (!result.agent) {
    throw new Error('parseLedgerArgs: --agent is required and must be non-empty');
  }

  return result;
}

// Serialize obj to JSON with all object keys sorted recursively.
// Used by the ledger subcommand to produce deterministic stdout output.
function sortedJson(obj) {
  return JSON.stringify(obj, (key, val) => {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const sorted = {};
      for (const k of Object.keys(val).sort()) sorted[k] = val[k];
      return sorted;
    }
    return val;
  }, 2);
}

// ── ledger dispatcher ─────────────────────────────────────────────────────────
// Routes `ai-toolkit ledger <subcommand> [flags]` to the per-operation
// handlers in lib/execution-ledger.js. All operation logic lives in that
// module; this function only parses shared flags and routes.
function handleLedgerCommand(argv) {
  const subcommand = argv[0];
  const flags = argv.slice(1);
  let args;
  try {
    args = parseLedgerArgs(flags);
  } catch (err) {
    process.stderr.write(sortedJson({ message: err.message, status: 'error' }) + '\n');
    process.exitCode = 1;
    return;
  }

  if (subcommand === 'open') {
    try {
      const result = executionLedger.open(args.dir, args.prefix, args.agent, args.phase, args.model, args.attempt);
      process.stdout.write(sortedJson(result) + '\n');
      process.exitCode = 0;
    } catch (err) {
      process.stderr.write(sortedJson({ message: err.message, status: 'error' }) + '\n');
      process.exitCode = 1;
    }
    return;
  } else if (subcommand === 'close') {
    try {
      const result = executionLedger.close(args.dir, args.prefix, args.agent, args.tokens, args.attempt);
      process.stdout.write(sortedJson(result) + '\n');
      process.exitCode = 0;
    } catch (err) {
      process.stderr.write(sortedJson({ message: err.message, status: 'error' }) + '\n');
      process.exitCode = 1;
    }
    return;
  } else if (subcommand === 'fail') {
    try {
      const result = executionLedger.fail(args.dir, args.prefix, args.agent, args.error, args.attempt);
      process.stdout.write(sortedJson(result) + '\n');
      process.exitCode = 0;
    } catch (err) {
      process.stderr.write(sortedJson({ message: err.message, status: 'error' }) + '\n');
      process.exitCode = 1;
    }
    return;
  } else if (subcommand === 'skip') {
    try {
      const result = executionLedger.skip(args.dir, args.prefix, args.agent, args.phase, args.model, args.attempt);
      process.stdout.write(sortedJson(result) + '\n');
      process.exitCode = 0;
    } catch (err) {
      process.stderr.write(sortedJson({ message: err.message, status: 'error' }) + '\n');
      process.exitCode = 1;
    }
    return;
  } else {
    throw new Error('handleLedgerCommand: unknown subcommand: ' + subcommand);
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
    readManifest,
    computeOrphans,
    moveToTrash,
    trashTimestamp,
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
    resolveClaudeRuntimeAsset,
    runDoctorResolution,
    validatePurityGuard,
    TOOLKIT_INTERNAL_ASSETS,
    buildPayloadFileMappings,
    buildExpectedPayload,
    validateRuntimeRelativePath,
    validateManifestFilesField,
    hasToolkitPayloadFiles,
    isToolkitInstalled,
    runVerifyInstall,
    shellQuotePosix,
    parseLedgerArgs,
    handleLedgerCommand,
    sortedJson,
    resolveFeaturesRoot,
  };
}
