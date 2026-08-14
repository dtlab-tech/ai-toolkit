'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

// Raise the default timeout for this file — Groups 6, 8, and 9 spawn real
// subprocess installs and `npm pack`, which can take several seconds each.
jest.setTimeout(60000);

const ROOT = path.resolve(__dirname, '..'); // toolkit root
const CLI_PATH        = path.join(ROOT, 'bin', 'cli.js');
const SCRIPTS         = path.join(ROOT, 'src', 'claude', 'scripts');
const WB_VALIDATE     = path.join(SCRIPTS, 'wb-validate.js');
const WB_RENDER       = path.join(SCRIPTS, 'wb-render.js');
const CLI_SRC         = fs.readFileSync(CLI_PATH, 'utf8');
const INSTALL_TOOLKIT_SRC = fs.readFileSync(
  path.join(ROOT, 'src', 'claude', 'agents', 'install-toolkit.md'), 'utf8'
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

// Helper: recursively list all files under a directory; returns [] if missing
function walkDirSync(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) results.push(...walkDirSync(full));
    else results.push(full);
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Group 1: Source files exist (precondition)
// ─────────────────────────────────────────────────────────────────────────────

describe('installer.scripts-distribution — Group 1: source files exist', () => {
  test('wb-validate.js exists at src/claude/scripts/wb-validate.js in the toolkit root', () => {
    expect(fs.existsSync(WB_VALIDATE)).toBe(true);
  });

  test('wb-render.js exists at src/claude/scripts/wb-render.js in the toolkit root', () => {
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
  test('installLocal maps .claude as source root; expandMappings filters it to distributable files only', () => {
    // The local install maps { src: path.join(packageRoot, '.claude'), dest: ... } and
    // passes the mapping to runInstall → expandMappings, which applies isDistributable()
    // to every resolved file. The source-root mapping does NOT mean everything is shipped.
    const localBody = extractInstallLocalBody();
    expect(localBody).toContain("path.join(packageRoot, '.claude')");
  });

  test('src/claude/scripts/ directory contains wb-validate.js and wb-render.js', () => {
    const files = fs.readdirSync(SCRIPTS);
    expect(files).toContain('wb-validate.js');
    expect(files).toContain('wb-render.js');
  });

  test('wb-validate.js with no args exits with code 2 (usage error) and writes to stderr', () => {
    const result = spawnSync(process.execPath, [WB_VALIDATE], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  test('wb-render.js with no args exits with code 1 (usage error) and writes to stderr', () => {
    const result = spawnSync(process.execPath, [WB_RENDER], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 3: Global install mapping includes scripts (static verification)
// ─────────────────────────────────────────────────────────────────────────────

describe('installer.scripts-distribution — Group 3: global install mapping includes scripts', () => {
  test('installGlobal in bin/cli.js contains a mapping entry for .claude/scripts', () => {
    const globalBody = extractInstallGlobalBody();
    expect(globalBody).toContain("'scripts'");
  });

  test('global install destination path for scripts is derived from target + scripts', () => {
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

// ─────────────────────────────────────────────────────────────────────────────
// Group 5: isDistributable — source structure (static)
//
// Verifies that the single-source-of-truth filter (isDistributable / NEVER_DIST_SEGMENTS)
// is correctly wired into expandMappings for both the directory-walk branch and the
// single-file branch. A regression here would mean expandMappings ships test files
// again without any test turning red.
// ─────────────────────────────────────────────────────────────────────────────

describe('installer.scripts-distribution — Group 5: isDistributable source structure', () => {
  test('source defines isDistributable function', () => {
    expect(CLI_SRC).toMatch(/function isDistributable\s*\(/);
  });

  test('NEVER_DIST_SEGMENTS is defined and includes the tests/ path segment', () => {
    expect(CLI_SRC).toMatch(/NEVER_DIST_SEGMENTS\s*=\s*\[/);
    expect(CLI_SRC).toContain("'.claude/scripts/tests/'");
  });

  test('isDistributable body excludes *.test.js files under .claude/scripts/', () => {
    const fnStart = CLI_SRC.indexOf('function isDistributable');
    const fnEnd   = CLI_SRC.indexOf('\n}', fnStart) + 2;
    const fnBody  = CLI_SRC.slice(fnStart, fnEnd);
    expect(fnBody).toContain('.test.js');
    expect(fnBody).toContain('.claude/scripts/');
  });

  test('expandMappings calls isDistributable for directory-walk entries', () => {
    const fnStart = CLI_SRC.indexOf('function expandMappings');
    const fnEnd   = CLI_SRC.indexOf('\n}', fnStart) + 2;
    const dirBranchStart = CLI_SRC.indexOf('for (const entry of walkDir', fnStart);
    const dirBranchEnd   = fnEnd;
    const dirBranch = CLI_SRC.slice(dirBranchStart, dirBranchEnd);
    expect(dirBranch).toContain('isDistributable');
  });

  test('expandMappings calls isDistributable for single-file entries (else branch)', () => {
    // Both the directory branch and the else/single-file branch must call isDistributable;
    // missing either one leaves a gap that allows test files to slip through.
    const fnStart = CLI_SRC.indexOf('function expandMappings');
    const fnEnd   = CLI_SRC.indexOf('\n}', fnStart) + 2;
    const fnBody  = CLI_SRC.slice(fnStart, fnEnd);
    const callCount = (fnBody.match(/isDistributable/g) || []).length;
    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 6: Local install simulation — behavioral
//
// Runs `node bin/cli.js --local <tmpDir> --force` against a real temp directory
// and asserts on the installed file set and manifest. These tests would have caught
// the regression fixed in commit 3489618 — test files were distributed because
// expandMappings lacked the isDistributable filter.
// ─────────────────────────────────────────────────────────────────────────────

describe('installer.scripts-distribution — Group 6: local install simulation', () => {
  let tmpDir;
  let installResult;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-toolkit-local-'));
    installResult = spawnSync(
      process.execPath,
      [CLI_PATH, '--local', tmpDir, '--force'],
      { encoding: 'utf8', cwd: ROOT }
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('install exits with code 0', () => {
    expect(installResult.status).toBe(0);
  });

  test('wb-validate.js is installed', () => {
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'scripts', 'wb-validate.js'))).toBe(true);
  });

  test('wb-render.js is installed', () => {
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'scripts', 'wb-render.js'))).toBe(true);
  });

  test('scripts/tests directory is NOT installed', () => {
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'scripts', 'tests'))).toBe(false);
  });

  test('no *.test.js files are present under the installed .claude/scripts/', () => {
    const allFiles = walkDirSync(path.join(tmpDir, '.claude', 'scripts'));
    const testFiles = allFiles.filter(f => f.endsWith('.test.js'));
    expect(testFiles).toHaveLength(0);
  });

  test('installed manifest records wb-validate.js', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json'), 'utf8')
    );
    expect(manifest.files.some(f => f.includes('scripts/wb-validate.js'))).toBe(true);
  });

  test('installed manifest records wb-render.js', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json'), 'utf8')
    );
    expect(manifest.files.some(f => f.includes('scripts/wb-render.js'))).toBe(true);
  });

  test('installed manifest contains no scripts/tests entries', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json'), 'utf8')
    );
    expect(manifest.files.filter(f => f.includes('scripts/tests'))).toHaveLength(0);
  });

  test('installed manifest contains no *.test.js entries', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json'), 'utf8')
    );
    expect(manifest.files.filter(f => f.endsWith('.test.js'))).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 7: Global install — single source of truth (static)
//
// Global install is not run against a real directory (its target is hardcoded to
// ~/.claude). These static checks verify that installGlobal delegates to runInstall,
// which calls expandMappings → isDistributable. There must be no separate isDistributable
// call inside installGlobal itself; the filter must flow through a single code path.
// ─────────────────────────────────────────────────────────────────────────────

describe('installer.scripts-distribution — Group 7: global install uses shared filter', () => {
  test('installGlobal calls runInstall (which calls expandMappings → isDistributable)', () => {
    expect(extractInstallGlobalBody()).toContain('runInstall');
  });

  test('runInstall calls expandMappings as its first operation', () => {
    const start = CLI_SRC.indexOf('async function runInstall');
    const end   = CLI_SRC.indexOf('\nasync function ', start + 1);
    const body  = CLI_SRC.slice(start, end === -1 ? undefined : end);
    expect(body).toContain('expandMappings');
  });

  test('installGlobal has no direct isDistributable call (single source of truth)', () => {
    // If installGlobal called isDistributable directly, that would be a second filter
    // path and could diverge from local install behaviour. The filter must live only
    // in expandMappings.
    expect(extractInstallGlobalBody()).not.toContain('isDistributable');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 8: Upgrade from contaminated manifest — orphan cleanup
//
// Simulates the scenario where a user has a previous installation that included
// .claude/scripts/tests/ files (before this fix). On the next install, those
// files must be detected as orphans, moved to trash, and removed from the manifest.
// ─────────────────────────────────────────────────────────────────────────────

describe('installer.scripts-distribution — Group 8: upgrade from contaminated manifest', () => {
  let tmpDir;
  // Relative path as stored in the manifest (posix-style, relative to destRoot)
  const STALE_REL = '.claude/scripts/tests/legacy.test.js';

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-toolkit-manifest-'));

    // Build the directory structure a legacy install would have produced
    const testsDir = path.join(tmpDir, '.claude', 'scripts', 'tests');
    fs.mkdirSync(testsDir, { recursive: true });
    fs.writeFileSync(path.join(testsDir, 'legacy.test.js'), '// legacy', 'utf8');

    // Write a manifest that records the stale test file as if it was previously installed
    const manifest = {
      version: '0.8.0',
      installedAt: '2026-01-01T00:00:00.000Z',
      files: [
        STALE_REL,
        '.claude/scripts/wb-validate.js', // legitimate entry to confirm non-orphan safety
      ],
    };
    fs.writeFileSync(
      path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );

    // Run the installer — --force auto-moves orphans to trash without prompting
    spawnSync(
      process.execPath,
      [CLI_PATH, '--local', tmpDir, '--force'],
      { encoding: 'utf8', cwd: ROOT }
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('stale test file is moved to trash (orphan detected and removed)', () => {
    const trashPath = path.join(tmpDir, '.claude', '.ai-toolkit-trash', STALE_REL);
    expect(fs.existsSync(trashPath)).toBe(true);
  });

  test('stale test file is no longer at its original installed location', () => {
    expect(fs.existsSync(path.join(tmpDir, STALE_REL))).toBe(false);
  });

  test('new manifest contains no scripts/tests entries', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json'), 'utf8')
    );
    expect(manifest.files.filter(f => f.includes('scripts/tests'))).toHaveLength(0);
  });

  test('runtime scripts are installed and present after the upgrade', () => {
    // Confirms that orphan cleanup targets only stale manifest entries and does not
    // remove files that are part of the current install set.
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'scripts', 'wb-validate.js'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'scripts', 'wb-render.js'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 9: npm pack — package does not include test files
//
// Verifies the package.json files[] allowlist excludes .claude/scripts/tests.
// npm's files[] takes absolute precedence — .npmignore alone cannot override it
// for paths that are inside a whitelisted directory. These tests enforce that
// the allowlist is specific enough to exclude the tests/ subtree.
// ─────────────────────────────────────────────────────────────────────────────

describe('installer.scripts-distribution — Group 9: npm pack excludes test files', () => {
  let packOutput;

  beforeAll(() => {
    const result = spawnSync('npm', ['pack', '--dry-run'], {
      encoding: 'utf8',
      cwd: ROOT,
      shell: true,
    });
    packOutput = result.stdout + result.stderr;
  });

  test('npm pack --dry-run includes no files under .claude/scripts/tests/', () => {
    const lines = packOutput.split('\n').filter(l => /scripts[/\\]tests/.test(l));
    expect(lines).toHaveLength(0);
  });

  test('npm pack --dry-run includes no *.test.js files under .claude/scripts/', () => {
    const lines = packOutput.split('\n').filter(l =>
      /\.claude[/\\]scripts[/\\]/.test(l) && /\.test\.js/.test(l)
    );
    expect(lines).toHaveLength(0);
  });

  test('npm pack --dry-run includes wb-validate.js', () => {
    expect(packOutput).toContain('wb-validate.js');
  });

  test('npm pack --dry-run includes wb-render.js', () => {
    expect(packOutput).toContain('wb-render.js');
  });
});
