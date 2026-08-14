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
  test('installLocal derives mappings from asset catalog (src/claude/ categories)', () => {
    // After FTR-015 migration, installLocal reads from getAssetCategories() to build
    // src/claude/<cat> → .claude/<cat> mappings, not from a hardcoded .claude/ root.
    const localBody = extractInstallLocalBody();
    expect(localBody).toContain("getAssetCategories");
    expect(localBody).toContain("src', 'claude");
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
  test('installGlobal derives mappings from asset catalog (getAssetCategories)', () => {
    // After FTR-015 migration, installGlobal uses getAssetCategories() to enumerate
    // src/claude/<cat> → ~/.claude/<cat> mappings, not hardcoded per-category entries.
    const globalBody = extractInstallGlobalBody();
    expect(globalBody).toContain("getAssetCategories");
  });

  test('installGlobal uses src/claude/ as source directory for asset categories', () => {
    const globalBody = extractInstallGlobalBody();
    expect(globalBody).toContain("src', 'claude");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 4: install-toolkit.md agent mentions scripts (static verification)
// ─────────────────────────────────────────────────────────────────────────────

describe('installer.scripts-distribution — Group 4: install-toolkit.md delegates to ai-toolkit install', () => {
  // After FTR-015 US-08-TASK-BE-02: install-toolkit.md no longer hardcodes source directories.
  // It delegates to `ai-toolkit install --project {dest}` for the file copy operation.

  test('install-toolkit.md delegates to ai-toolkit install', () => {
    expect(INSTALL_TOOLKIT_SRC).toContain('ai-toolkit install');
  });

  test('install-toolkit.md does not hardcode .claude/ as versioned source directory', () => {
    // The old agent listed Six source directories from .claude/. Now it delegates to the CLI.
    expect(INSTALL_TOOLKIT_SRC).not.toContain('Six source directories');
  });

  test('install-toolkit.md documents --project flag for local project installs', () => {
    expect(INSTALL_TOOLKIT_SRC).toContain('--project');
  });

  test('install-toolkit.md documents --global flag for global installs', () => {
    expect(INSTALL_TOOLKIT_SRC).toContain('--global');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 5: no exclusion filters — catalog positive-list only (static)
//
// After FTR-015 US-05-TASK-BE-02, isDistributable(), NEVER_DIST_SEGMENTS, and
// NEVER_COPY have been removed. The purity guard on src/claude/ (validatePurityGuard)
// prevents test files from ever entering the source tree, making runtime exclusion
// filters redundant. These tests are regression guards: if an exclusion filter is
// re-introduced, one of the tests below will fail.
// ─────────────────────────────────────────────────────────────────────────────

describe('installer.scripts-distribution — Group 5: no exclusion filters (catalog positive-list only)', () => {
  test('isDistributable function has been removed from the CLI source', () => {
    expect(CLI_SRC).not.toMatch(/function isDistributable\s*\(/);
  });

  test('NEVER_DIST_SEGMENTS constant has been removed from the CLI source', () => {
    expect(CLI_SRC).not.toMatch(/NEVER_DIST_SEGMENTS/);
  });

  test('NEVER_COPY constant has been removed from the CLI source', () => {
    expect(CLI_SRC).not.toMatch(/\bNEVER_COPY\b/);
  });

  test('expandMappings does not call isDistributable (no exclusion filter in directory branch)', () => {
    const fnStart = CLI_SRC.indexOf('function expandMappings');
    const fnEnd   = CLI_SRC.indexOf('\n}', fnStart) + 2;
    const fnBody  = CLI_SRC.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain('isDistributable');
  });

  test('expandMappings does not reference NEVER_COPY (no exclusion filter in single-file branch)', () => {
    const fnStart = CLI_SRC.indexOf('function expandMappings');
    const fnEnd   = CLI_SRC.indexOf('\n}', fnStart) + 2;
    const fnBody  = CLI_SRC.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain('NEVER_COPY');
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
