#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const packageRoot = path.join(__dirname, '..');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function listPotentialConflicts(mappings) {
  return mappings.filter(({ dest }) => fs.existsSync(dest)).map(({ dest }) => dest);
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

async function runInstall(label, mappings, force) {
  const conflicts = listPotentialConflicts(mappings);
  if (conflicts.length && !force) {
    console.log(`Found existing files that would be overwritten ${label}:`);
    for (const c of conflicts) console.log('  ', c);
    const ok = await askConfirm('Proceed and overwrite these files?');
    if (!ok) {
      console.log('Aborted by user. No files were changed.');
      process.exit(0);
    }
  }
  for (const { src, dest } of mappings) {
    if (!fs.existsSync(src)) continue;
    copyRecursive(src, dest);
  }
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
