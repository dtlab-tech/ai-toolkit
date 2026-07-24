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

// ── install ───────────────────────────────────────────────────────────────────

async function runInstall(label, mappings, force) {
  const files    = expandMappings(mappings);
  const entries  = categorize(files);

  const newFiles = entries.filter(e => e.status === 'new');
  const modified = entries.filter(e => e.status === 'modified');
  const same     = entries.filter(e => e.status === 'same');

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
    return;
  }

  if (force) {
    console.log(`  ${clr('yellow', '⚑')}  --force: overwriting all modified files.`);
    for (const e of modified) {
      ensureDir(e.dest);
      fs.copyFileSync(e.src, e.dest);
      console.log(`     ${clr('yellow', '↺')} ${dim(path.relative(process.cwd(), e.dest))}`);
    }
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
}

// ── Matt Pocock skills ───────────────────────────────────────────────────────

function isMattPocockInstalled() {
  const homedir = require('os').homedir();
  // 'grilling' is a skill exclusive to Matt Pocock's package — not included in this toolkit
  const pathsToCheck = [
    path.join(homedir, '.claude', 'skills', 'grilling', 'SKILL.md'),
    path.join(process.cwd(), '.claude', 'skills', 'grilling', 'SKILL.md'),
  ];
  return pathsToCheck.some(p => fs.existsSync(p));
}

async function installMattPocock() {
  const { execSync } = require('child_process');
  console.log(`\n  ${clr('cyan', '↓')}  Running: ${dim('npx skills@latest add mattpocock/skills')}\n`);
  try {
    execSync('npx skills@latest add mattpocock/skills', { stdio: 'inherit' });
    console.log(`\n  ${clr('green', '✔')}  Matt Pocock skills installed successfully.\n`);
  } catch (err) {
    console.error(`\n  ${clr('red', '✖')}  Install failed: ${err.message}`);
    console.error(`     Run manually: ${dim('npx skills@latest add mattpocock/skills')}\n`);
  }
}

async function askMattPocock() {
  const installed = isMattPocockInstalled();

  console.log(divider());
  console.log(bold('  Matt Pocock Skills'));
  console.log(divider());
  console.log(`  ${dim('Includes: define-feature, grilling, TDD, prototype, handoff, and more.')}`);
  console.log();

  if (!installed) {
    console.log(`  ${clr('gray', '○')}  Status : ${clr('gray', 'not installed')}\n`);
    const ok = await askConfirm('Install Matt Pocock\'s skills now?');
    if (ok) await installMattPocock();
    else console.log(`\n  ${clr('gray', 'Skipped. Install later with: npx skills@latest add mattpocock/skills')}\n`);
    return;
  }

  console.log(`  ${clr('green', '✔')}  Status : ${clr('green', 'installed')}\n`);
  const ok = await askConfirm('Re-install / update Matt Pocock skills?');
  if (ok) await installMattPocock();
  else console.log(`  ${clr('gray', 'Skipped.')}\n`);
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
  await runInstall(`local project`, mappings, force);
  writeInstalledVersion(targetDir);
  console.log(`  ${clr('green', '✔')}  ${bold('Install complete.')}\n`);
  checkSpawnDepth(targetDir);
  await askMattPocock();
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
      { src: path.join(packageRoot, '.claude', 'agents'),   dest: path.join(target, 'agents') },
      { src: path.join(packageRoot, '.claude', 'skills'),   dest: path.join(target, 'skills') },
      { src: path.join(packageRoot, '.claude', 'commands'), dest: path.join(target, 'commands') },
      { src: path.join(packageRoot, 'docs'),                dest: path.join(target, 'docs') },
      { src: path.join(packageRoot, 'CLAUDE.md'),           dest: path.join(target, 'CLAUDE.md') },
    ];
    await runInstall('global Claude folder', mappings, force);
    writeInstalledVersion(target);
    console.log(`  ${clr('green', '✔')}  ${bold('Global install complete.')}\n`);
    checkSpawnDepth(homedir);
    await askMattPocock();
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

main();
