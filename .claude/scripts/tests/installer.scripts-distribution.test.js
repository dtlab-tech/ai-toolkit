'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..'); // toolkit root
const SCRIPTS         = path.join(ROOT, '.claude', 'scripts');
const WB_VALIDATE     = path.join(SCRIPTS, 'wb-validate.js');
const WB_RENDER       = path.join(SCRIPTS, 'wb-render.js');
const CLI_SRC         = fs.readFileSync(path.join(ROOT, 'bin', 'cli.js'), 'utf8');
const INSTALL_TOOLKIT_SRC = fs.readFileSync(
  path.join(ROOT, '.claude', 'agents', 'install-toolkit.md'), 'utf8'
);

// Helper: extract the body of installLocal from CLI_SRC (up to installGlobal)
function extractInstallLocalBody() {
  const localStart  = CLI_SRC.indexOf('async function installLocal');
  const globalStart = CLI_SRC.indexOf('async function installGlobal');
  return CLI_SRC.slice(localStart, globalStart);
}

// Helper: extract the body of installGlobal from CLI_SRC (up to function help)
function extractInstallGlobalBody() {
  const globalStart = CLI_SRC.indexOf('async function installGlobal');
  const helpStart   = CLI_SRC.indexOf('\nfunction help(');
  return helpStart === -1
    ? CLI_SRC.slice(globalStart)
    : CLI_SRC.slice(globalStart, helpStart);
}

// ─────────────────────────────────────────────────────────────────────────────
// Group 1: Source files exist (precondition)
// ─────────────────────────────────────────────────────────────────────────────

describe('installer.scripts-distribution — Group 1: source files exist', () => {
  test('wb-validate.js exists at .claude/scripts/wb-validate.js in the toolkit root', () => {
    expect(fs.existsSync(WB_VALIDATE)).toBe(true);
  });

  test('wb-render.js exists at .claude/scripts/wb-render.js in the toolkit root', () => {
    expect(fs.existsSync(WB_RENDER)).toBe(true);
  });

  test('wb-validate.js passes Node.js syntax check (node --check)', () => {
    const result = spawnSync(process.execPath, ['--check', WB_VALIDATE], { encoding: 'utf8' });
    expect(result.status).toBe(0);
  });

  test('wb-render.js passes Node.js syntax check (node --check)', () => {
    const result = spawnSync(process.execPath, ['--check', WB_RENDER], { encoding: 'utf8' });
    expect(result.status).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 2: Local install includes scripts (static verification)
// ─────────────────────────────────────────────────────────────────────────────

describe('installer.scripts-distribution — Group 2: local install includes scripts', () => {
  test('installLocal in bin/cli.js maps the entire .claude directory (which includes .claude/scripts/)', () => {
    // The local install maps { src: path.join(packageRoot, '.claude'), dest: ... }
    // so the whole .claude/ tree — including .claude/scripts/ — is included automatically.
    const localBody = extractInstallLocalBody();
    expect(localBody).toContain("path.join(packageRoot, '.claude')");
  });

  test('.claude/scripts/ directory contains wb-validate.js and wb-render.js', () => {
    const files = fs.readdirSync(SCRIPTS);
    expect(files).toContain('wb-validate.js');
    expect(files).toContain('wb-render.js');
  });

  test('wb-validate.js with no args exits with code 2 (usage error) and writes to stderr', () => {
    // Arrange: no arguments — the script should emit a usage error
    // Act
    const result = spawnSync(process.execPath, [WB_VALIDATE], { encoding: 'utf8' });
    // Assert
    expect(result.status).toBe(2);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  test('wb-render.js with no args exits with code 1 (usage error) and writes to stderr', () => {
    // Arrange: no arguments — the script should emit a usage message
    // Act
    const result = spawnSync(process.execPath, [WB_RENDER], { encoding: 'utf8' });
    // Assert
    expect(result.status).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 3: Global install mapping includes scripts (static verification)
// ─────────────────────────────────────────────────────────────────────────────

describe('installer.scripts-distribution — Group 3: global install mapping includes scripts', () => {
  test('installGlobal in bin/cli.js contains a mapping entry for .claude/scripts', () => {
    // The mapping line is: { src: path.join(packageRoot, '.claude', 'scripts'), ... }
    const globalBody = extractInstallGlobalBody();
    expect(globalBody).toContain("'scripts'");
  });

  test('global install destination path for scripts is derived from target + scripts', () => {
    // The mapping line is: { ..., dest: path.join(target, 'scripts') }
    // where target = path.join(homedir, '.claude') → dest = ~/.claude/scripts
    expect(CLI_SRC).toContain("path.join(target, 'scripts')");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 4: install-toolkit.md agent mentions scripts (static verification)
// ─────────────────────────────────────────────────────────────────────────────

describe('installer.scripts-distribution — Group 4: install-toolkit.md mentions scripts', () => {
  test('install-toolkit.md contains the string .claude/scripts/', () => {
    expect(INSTALL_TOOLKIT_SRC).toContain('.claude/scripts/');
  });

  test('install-toolkit.md contains wb-validate.js', () => {
    expect(INSTALL_TOOLKIT_SRC).toContain('wb-validate.js');
  });

  test('install-toolkit.md contains wb-render.js', () => {
    expect(INSTALL_TOOLKIT_SRC).toContain('wb-render.js');
  });

  test('install-toolkit.md mentions "Six source directories" (confirming the scripts table row was added)', () => {
    expect(INSTALL_TOOLKIT_SRC).toContain('Six source directories');
  });
});
