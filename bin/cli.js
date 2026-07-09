#!/usr/bin/env node
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const packageRoot = path.join(__dirname, '..');

// ── helpers ──────────────────────────────────────────────────────────────────

function fileHash(filePath) {
  return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function askConfirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question + ' (y/N): ', (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

// ── file enumeration ─────────────────────────────────────────────────────────

/** Recursively expand directory mappings into individual file mappings. */
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

/** Returns { src, dest, status: 'new' | 'same' | 'modified' } for each file. */
function categorize(files) {
  return files.map(({ src, dest }) => {
    if (!fs.existsSync(dest)) return { src, dest, status: 'new' };
    return fileHash(src) === fileHash(dest)
      ? { src, dest, status: 'same' }
      : { src, dest, status: 'modified' };
  });
}

// ── install ───────────────────────────────────────────────────────────────────

async function runInstall(label, mappings, force) {
  const files    = expandMappings(mappings);
  const entries  = categorize(files);

  const newFiles  = entries.filter(e => e.status === 'new');
  const modified  = entries.filter(e => e.status === 'modified');
  const same      = entries.filter(e => e.status === 'same');

  // ── print plan ──
  console.log(`\n📦 Install plan  →  ${label}`);
  console.log('─'.repeat(60));
  for (const e of newFiles)  console.log(`  ✅ NEW       ${path.relative(process.cwd(), e.dest)}`);
  for (const e of modified)  console.log(`  ⚠️  MODIFIED  ${path.relative(process.cwd(), e.dest)}`);
  for (const e of same)      console.log(`  ⏭  SAME      ${path.relative(process.cwd(), e.dest)}`);
  console.log('─'.repeat(60));
  console.log(`  New: ${newFiles.length}  |  Modified: ${modified.length}  |  Unchanged: ${same.length}\n`);

  // ── copy new files (always) ──
  for (const e of newFiles) {
    ensureDir(e.dest);
    fs.copyFileSync(e.src, e.dest);
  }

  if (modified.length === 0) {
    console.log('No conflicts. All new files copied.');
    return;
  }

  if (force) {
    // --force: overwrite all modified without asking
    console.log('--force passed: overwriting all modified files.');
    for (const e of modified) {
      ensureDir(e.dest);
      fs.copyFileSync(e.src, e.dest);
    }
    return;
  }

  // ── per-file prompt for modified files ──
  console.log('The following files already exist and differ from the toolkit version.');
  console.log('Decide for each one:\n');

  let overwritten = 0;
  let skipped = 0;

  for (const e of modified) {
    const rel = path.relative(process.cwd(), e.dest);
    const ok = await askConfirm(`  Overwrite  ${rel}?`);
    if (ok) {
      ensureDir(e.dest);
      fs.copyFileSync(e.src, e.dest);
      overwritten++;
    } else {
      skipped++;
    }
  }

  console.log(`\nDone. Overwritten: ${overwritten}  |  Kept as-is: ${skipped}`);
}

async function installMattPocock() {
  const { execSync } = require('child_process');
  console.log('\nInstalling Matt Pocock skills via: npx skills@latest add mattpocock/skills');
  try {
    execSync('npx skills@latest add mattpocock/skills', { stdio: 'inherit' });
    console.log('Matt Pocock skills installed successfully.');
  } catch (err) {
    console.error('Failed to install Matt Pocock skills:', err.message);
    console.error('You can install them manually with: npx skills@latest add mattpocock/skills');
  }
}

async function askMattPocock() {
  const ok = await askConfirm(
    '\nDo you want to also install Matt Pocock\'s skills (define-feature, grilling, TDD, etc.)?\n' +
    'These are powerful companion skills that work great with this toolkit.'
  );
  if (ok) await installMattPocock();
}

async function installLocal(targetDir, force) {
  targetDir = path.resolve(process.cwd(), targetDir || '.');
  console.log('Installing files into', targetDir);
  const mappings = [
    { src: path.join(packageRoot, '.claude'),    dest: path.join(targetDir, '.claude') },
    { src: path.join(packageRoot, 'docs'),       dest: path.join(targetDir, 'docs') },
    { src: path.join(packageRoot, 'CLAUDE.md'),  dest: path.join(targetDir, 'CLAUDE.md') },
  ];
  await runInstall(`in ${targetDir}`, mappings, force);
  console.log('Install complete.');
  await askMattPocock();
}

async function installGlobal(force) {
  try {
    const homedir = require('os').homedir();
    const target = path.join(homedir, '.claude');
    console.log('Installing into global Claude folder:', target);
    const mappings = [
      { src: path.join(packageRoot, '.claude', 'agents'),   dest: path.join(target, 'agents') },
      { src: path.join(packageRoot, '.claude', 'skills'),   dest: path.join(target, 'skills') },
      { src: path.join(packageRoot, '.claude', 'commands'), dest: path.join(target, 'commands') },
      { src: path.join(packageRoot, 'docs'),                dest: path.join(target, 'docs') },
      { src: path.join(packageRoot, 'CLAUDE.md'),           dest: path.join(target, 'CLAUDE.md') },
    ];
    await runInstall('in global Claude folder', mappings, force);
    console.log('Global install into Claude folder complete.');
    await askMattPocock();
  } catch (err) {
    console.error('Global install failed:', err.message);
    process.exit(1);
  }
}

function help() {
  console.log('Usage:\n  swf-ai-toolkit [--local <dir>] [--force]\n  swf-ai-toolkit --global [--force]');
}

async function main() {
  const argv = process.argv.slice(2);
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
