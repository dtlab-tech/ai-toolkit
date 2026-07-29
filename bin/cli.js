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

// ── file enumeration ─────────────────────────────────────────────────────────

function expandMappings(mappings) {
  const files = [];
  for (const { src, dest } of mappings) {
    if (!fs.existsSync(src)) continue;
    if (fs.statSync(src).isDirectory()) {
      for (const entry of walkDir(src)) {
        if (NEVER_COPY.has(path.basename(entry))) continue; // never clobber user config
        const rel = path.relative(src, entry);
        files.push({ src: entry, dest: path.join(dest, rel) });
      }
    } else {
      if (NEVER_COPY.has(path.basename(src))) continue;
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
    if (Array.isArray(parsed.files)) {
      parsed.files = parsed.files.map(f => f.replace(/\\/g, '/'));
    }
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
  };
}
