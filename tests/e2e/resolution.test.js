'use strict';

/**
 * E2E resolution tests — US-06-TASK-TEST-04 (FTR-015).
 *
 * Tests the four installation mode scenarios using argv arrays (no shell),
 * isolated temp dirs (including paths with spaces), and --home on every call.
 *
 * Modes:
 * - local-only: manifest+payload in project/.claude/, nothing in home/.claude/
 * - global-only: manifest+payload in home/.claude/, nothing in project/.claude/
 * - both: toolkit present in both → ambiguous error (Phase B)
 * - none: no toolkit anywhere → not-found error (Phase B)
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const CLI          = path.join(__dirname, '..', '..', 'bin', 'cli.js');
const TOOLKIT_ROOT = path.join(__dirname, '..', '..');
const { getAssetCategories } = require('../../lib/asset-catalog');
const { TOOLKIT_INTERNAL_ASSETS } = require('../../bin/cli');

jest.setTimeout(60000);

// ── Helpers ────────────────────────────────────────────────────────────────────

// Copies distributable catalog files into clauDir, applying TOOLKIT_INTERNAL_ASSETS
// exclusions to match what the real installer writes (avoids stale-entry warnings).
function installCatalogFilesInto(clauDir) {
  fs.mkdirSync(clauDir, { recursive: true });
  const files = [];
  for (const cat of getAssetCategories()) {
    const srcDir      = path.join(TOOLKIT_ROOT, cat.sourceDir);
    const internalSet = TOOLKIT_INTERNAL_ASSETS[cat.name];
    if (!fs.existsSync(srcDir)) continue;
    for (const topEntry of fs.readdirSync(srcDir)) {
      if (internalSet && internalSet.has(topEntry)) continue;
      const topFull = path.join(srcDir, topEntry);
      const stack   = [topFull];
      while (stack.length > 0) {
        const cur = stack.pop();
        if (fs.statSync(cur).isDirectory()) {
          for (const sub of fs.readdirSync(cur)) stack.push(path.join(cur, sub));
        } else {
          const rel  = path.relative(srcDir, cur).replace(/\\/g, '/');
          const dest = path.join(clauDir, cat.name, rel);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(cur, dest);
          files.push(`.claude/${cat.name}/${rel}`);
        }
      }
    }
  }
  return files;
}

function writeManifestAndStamp(clauDir, files, mode) {
  fs.writeFileSync(
    path.join(clauDir, '.ai-toolkit-manifest.json'),
    JSON.stringify({ version: '0.10.1', installedAt: '2026-01-01T00:00:00.000Z', installationMode: mode, files }, null, 2)
  );
  fs.writeFileSync(path.join(clauDir, '.ai-toolkit-version'), '0.10.1');
}

// Full install (manifest + stamp + all payload files) into <baseDir>/.claude/
function makeInstall(baseDir, mode) {
  const clauDir = path.join(baseDir, '.claude');
  const files   = installCatalogFilesInto(clauDir);
  writeManifestAndStamp(clauDir, files, mode);
}

// Run resolve-asset via argv array (shell: false)
function resolveAsset(relativePath, { projectDir, home }) {
  try {
    const stdout = execFileSync(
      process.execPath,
      [CLI, 'resolve-asset', relativePath, '--project', projectDir, '--home', home],
      { encoding: 'utf8' }
    );
    return { status: 0, stdout: stdout.trim(), stderr: '' };
  } catch (err) {
    return {
      status: err.status || 1,
      stdout: (err.stdout || '').trim(),
      stderr: (err.stderr || '').trim(),
    };
  }
}

// ── local-only mode ────────────────────────────────────────────────────────────

describe('E2E resolution — local-only mode', () => {
  let projectDir;
  let home;

  beforeAll(() => {
    // Use a path with spaces to verify argv array handling
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve e2e local-'));
    home       = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve e2e home-'));
    makeInstall(projectDir, 'local');
    // home has no toolkit → local-only
  });

  afterAll(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('resolves an agent asset — exit 0, returns absolute path', () => {
    const result = resolveAsset('agents/developer-backend.md', { projectDir, home });
    expect(result.status).toBe(0);
    expect(path.isAbsolute(result.stdout)).toBe(true);
    expect(result.stdout).toContain('developer-backend.md');
  });

  test('resolved path is inside projectDir/.claude/', () => {
    const result = resolveAsset('agents/developer-backend.md', { projectDir, home });
    const expected = path.resolve(path.join(projectDir, '.claude'));
    expect(result.stdout.startsWith(expected)).toBe(true);
  });

  test('resolves a scripts asset', () => {
    const result = resolveAsset('scripts/wb-render.js', { projectDir, home });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('wb-render.js');
  });

  test('path with spaces in projectDir handled correctly', () => {
    // The projectDir was created with spaces — verify it works
    expect(projectDir).toContain(' ');
    const result = resolveAsset('agents/developer-backend.md', { projectDir, home });
    expect(result.status).toBe(0);
  });
});

// ── global-only mode ───────────────────────────────────────────────────────────

describe('E2E resolution — global-only mode', () => {
  let projectDir;
  let home;

  beforeAll(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve e2e nolocal-'));
    home       = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve e2e global-'));
    makeInstall(home, 'global');
    // projectDir has no toolkit → global-only
  });

  afterAll(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('resolves from global installation — exit 0', () => {
    const result = resolveAsset('agents/developer-backend.md', { projectDir, home });
    expect(result.status).toBe(0);
  });

  test('resolved path is inside home/.claude/', () => {
    const result = resolveAsset('agents/developer-backend.md', { projectDir, home });
    const expected = path.resolve(path.join(home, '.claude'));
    expect(result.stdout.startsWith(expected)).toBe(true);
  });
});

// ── both installations (ambiguous) ────────────────────────────────────────────

describe('E2E resolution — both installations present (ambiguous)', () => {
  let projectDir;
  let home;

  beforeAll(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve e2e both-p-'));
    home       = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve e2e both-h-'));
    makeInstall(projectDir, 'local');
    makeInstall(home, 'global');
  });

  afterAll(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('exits 1 when both local and global installations are detected', () => {
    const result = resolveAsset('agents/developer-backend.md', { projectDir, home });
    expect(result.status).toBe(1);
  });

  test('stderr mentions ambiguity', () => {
    const result = resolveAsset('agents/developer-backend.md', { projectDir, home });
    expect(result.stderr).toMatch(/[Aa]mbiguous/);
  });
});

// ── no installation (not found) ───────────────────────────────────────────────

describe('E2E resolution — no installation found', () => {
  let projectDir;
  let home;

  beforeAll(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve e2e none-p-'));
    home       = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve e2e none-h-'));
    // No install in either location
  });

  afterAll(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('exits 1 when no installation found', () => {
    const result = resolveAsset('agents/developer-backend.md', { projectDir, home });
    expect(result.status).toBe(1);
  });

  test('stderr describes the missing installation', () => {
    const result = resolveAsset('agents/developer-backend.md', { projectDir, home });
    expect(result.stderr).toBeTruthy();
    expect(result.stdout).toBe('');
  });
});

// ── fresh CLI local install → resolve ─────────────────────────────────────────
// Validates the installer–resolver contract end-to-end: a fresh `--local` install
// via the CLI must produce an installation that the resolver accepts without error.
// This is the key P0-1 regression guard.

describe('E2E resolution — fresh CLI local install → resolve-asset', () => {
  let projectDir;
  let home;

  beforeAll(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve e2e cli-install-'));
    home       = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve e2e cli-home-'));
    // Run the actual CLI installer (applies TOOLKIT_INTERNAL_ASSETS exclusions)
    spawnSync(
      process.execPath,
      [CLI, '--local', projectDir, '--force'],
      { encoding: 'utf8', cwd: TOOLKIT_ROOT }
    );
  });

  afterAll(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('fresh local install → resolve-asset scripts/wb-validate.js exits 0', () => {
    const result = resolveAsset('scripts/wb-validate.js', { projectDir, home });
    expect(result.status).toBe(0);
    expect(path.isAbsolute(result.stdout)).toBe(true);
    expect(result.stdout).toContain('wb-validate.js');
  });

  test('fresh local install → resolved path is inside projectDir/.claude/', () => {
    const result = resolveAsset('scripts/wb-validate.js', { projectDir, home });
    const expected = path.resolve(path.join(projectDir, '.claude'));
    expect(result.stdout.startsWith(expected)).toBe(true);
  });

  test('fresh local install → resolve-asset agents/developer-backend.md exits 0', () => {
    const result = resolveAsset('agents/developer-backend.md', { projectDir, home });
    expect(result.status).toBe(0);
  });

  test('fresh local install → install-toolkit.md is NOT resolvable (excluded from distribution)', () => {
    const result = resolveAsset('agents/install-toolkit.md', { projectDir, home });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not a registered catalog asset');
  });
});

// ── fresh CLI global install → resolve ────────────────────────────────────────

describe('E2E resolution — fresh CLI global install → resolve-asset', () => {
  let projectDir;
  let home;

  beforeAll(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve e2e global-install-p-'));
    home       = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve e2e global-install-h-'));
    // Run the actual CLI global installer with --home override for test isolation
    spawnSync(
      process.execPath,
      [CLI, '--global', '--force', '--home', home],
      { encoding: 'utf8', cwd: TOOLKIT_ROOT }
    );
  });

  afterAll(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('fresh global install → resolve-asset scripts/wb-validate.js exits 0', () => {
    const result = resolveAsset('scripts/wb-validate.js', { projectDir, home });
    expect(result.status).toBe(0);
    expect(path.isAbsolute(result.stdout)).toBe(true);
    expect(result.stdout).toContain('wb-validate.js');
  });

  test('fresh global install → resolved path is inside home/.claude/', () => {
    const result = resolveAsset('scripts/wb-validate.js', { projectDir, home });
    const expected = path.resolve(path.join(home, '.claude'));
    expect(result.stdout.startsWith(expected)).toBe(true);
  });

  test('fresh global install → install-toolkit.md is NOT resolvable (excluded from distribution)', () => {
    const result = resolveAsset('agents/install-toolkit.md', { projectDir, home });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not a registered catalog asset');
  });
});
