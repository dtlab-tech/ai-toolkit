'use strict';

/**
 * CLI integration tests for resolve-asset command — US-06-TASK-TEST-01 (FTR-015).
 *
 * Covers:
 * - Tier 1: clean exit 0, stdout=path, stderr empty
 * - Tier 2: exit 0, stdout=path, stderr=warnings (no manifest, condC only)
 * - Tier 3: exit 1, stdout empty, stderr=error
 * - Path traversal rejection (Phase 0, before filesystem access)
 * - Non-catalog asset rejection (Phase D)
 * - No installation found
 * - --home isolation (global home has no toolkit)
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI          = path.join(__dirname, '..', '..', 'bin', 'cli.js');
const TOOLKIT_ROOT = path.join(__dirname, '..', '..');
const { getAssetCategories } = require('../../lib/asset-catalog');
const { TOOLKIT_INTERNAL_ASSETS } = require('../../bin/cli');

// Install catalog files into <projectDir>/.claude/ with manifest + stamp.
// Applies TOOLKIT_INTERNAL_ASSETS exclusions to match what the real installer writes,
// preventing stale-entry warnings from the resolver (Phase C manifest validation).
function makeCompleteInstall(projectDir, { mode = 'local', version = '0.10.1' } = {}) {
  const clauDir = path.join(projectDir, '.claude');
  fs.mkdirSync(clauDir, { recursive: true });
  const files = [];
  for (const cat of getAssetCategories()) {
    const srcDir      = path.join(TOOLKIT_ROOT, cat.sourceDir);
    const internalSet = TOOLKIT_INTERNAL_ASSETS[cat.name];
    if (!fs.existsSync(srcDir)) continue;
    for (const topEntry of fs.readdirSync(srcDir)) {
      if (internalSet && internalSet.has(topEntry)) continue; // skip internal assets
      const topFull = path.join(srcDir, topEntry);
      const stack   = [topFull];
      while (stack.length > 0) {
        const cur = stack.pop();
        const stat = fs.statSync(cur);
        if (stat.isDirectory()) {
          for (const sub of fs.readdirSync(cur)) stack.push(path.join(cur, sub));
        } else {
          const rel      = path.relative(srcDir, cur).replace(/\\/g, '/');
          const destPath = path.join(clauDir, cat.name, rel);
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(cur, destPath);
          files.push(`.claude/${cat.name}/${rel}`);
        }
      }
    }
  }
  fs.writeFileSync(
    path.join(clauDir, '.ai-toolkit-manifest.json'),
    JSON.stringify({ version, installedAt: '2026-01-01T00:00:00.000Z', installationMode: mode, files }, null, 2)
  );
  fs.writeFileSync(path.join(clauDir, '.ai-toolkit-version'), version);
}

// Install catalog payload files only (no manifest, no stamp) — satisfies condC only.
// Phase C will emit warnings about missing manifest (Tier 2 scenario).
// Also applies TOOLKIT_INTERNAL_ASSETS exclusions.
function makePayloadOnlyInstall(projectDir) {
  const clauDir = path.join(projectDir, '.claude');
  fs.mkdirSync(clauDir, { recursive: true });
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
          const rel      = path.relative(srcDir, cur).replace(/\\/g, '/');
          const destPath = path.join(clauDir, cat.name, rel);
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(cur, destPath);
        }
      }
    }
  }
}

function runCLI(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    shell: false,
  });
}

describe('resolve-asset CLI — Tier 1 (clean success)', () => {
  let tmpDir;
  let fakeHome;

  beforeAll(() => {
    tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-t1 with spaces-'));
    fakeHome = path.join(tmpDir, 'home');
    fs.mkdirSync(fakeHome, { recursive: true });
    makeCompleteInstall(tmpDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exit 0 for a known catalog agent asset', () => {
    const result = runCLI([
      'resolve-asset', 'agents/developer-backend.md',
      '--project', tmpDir, '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
  });

  test('stdout contains the resolved path to the asset', () => {
    const result = runCLI([
      'resolve-asset', 'agents/developer-backend.md',
      '--project', tmpDir, '--home', fakeHome,
    ]);
    const resolved = result.stdout.trim();
    expect(resolved).toContain('developer-backend.md');
    expect(path.isAbsolute(resolved)).toBe(true);
  });

  test('stderr is empty on Tier 1 success', () => {
    const result = runCLI([
      'resolve-asset', 'agents/developer-backend.md',
      '--project', tmpDir, '--home', fakeHome,
    ]);
    expect(result.stderr.trim()).toBe('');
  });

  test('resolves a scripts asset', () => {
    const result = runCLI([
      'resolve-asset', 'scripts/wb-render.js',
      '--project', tmpDir, '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toContain('wb-render.js');
  });

  test('--home isolation: global home has no toolkit, local used', () => {
    const result = runCLI([
      'resolve-asset', 'scripts/wb-validate.js',
      '--project', tmpDir, '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toContain('wb-validate.js');
  });
});

describe('resolve-asset CLI — Tier 2 (warnings, condC only)', () => {
  let tmpDir;
  let fakeHome;

  beforeAll(() => {
    tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-t2-'));
    fakeHome = path.join(tmpDir, 'home');
    fs.mkdirSync(fakeHome, { recursive: true });
    makePayloadOnlyInstall(tmpDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exit 0 even without manifest (condC satisfies presence)', () => {
    const result = runCLI([
      'resolve-asset', 'agents/developer-backend.md',
      '--project', tmpDir, '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
  });

  test('stdout contains resolved path (Tier 2)', () => {
    const result = runCLI([
      'resolve-asset', 'agents/developer-backend.md',
      '--project', tmpDir, '--home', fakeHome,
    ]);
    expect(result.stdout.trim()).toContain('developer-backend.md');
  });

  test('stderr contains warning about missing manifest (Tier 2)', () => {
    const result = runCLI([
      'resolve-asset', 'agents/developer-backend.md',
      '--project', tmpDir, '--home', fakeHome,
    ]);
    expect(result.stderr).toMatch(/[Ww]arning/);
  });
});

describe('resolve-asset CLI — Tier 3 (errors)', () => {
  test('path traversal (..) rejected — exit 1', () => {
    const emptyProject = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-t3a-'));
    const emptyHome    = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-t3a-home-'));
    try {
      const result = runCLI([
        'resolve-asset', '../etc/passwd',
        '--project', emptyProject, '--home', emptyHome,
      ]);
      expect(result.status).toBe(1);
      expect(result.stdout.trim()).toBe('');
      expect(result.stderr).toContain('path traversal');
    } finally {
      fs.rmSync(emptyProject, { recursive: true, force: true });
      fs.rmSync(emptyHome, { recursive: true, force: true });
    }
  });

  test('no installation found — exit 1', () => {
    const emptyProject = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-t3b-'));
    const emptyHome    = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-t3b-home-'));
    try {
      const result = runCLI([
        'resolve-asset', 'agents/developer-backend.md',
        '--project', emptyProject, '--home', emptyHome,
      ]);
      expect(result.status).toBe(1);
      expect(result.stdout.trim()).toBe('');
      expect(result.stderr).toBeTruthy();
    } finally {
      fs.rmSync(emptyProject, { recursive: true, force: true });
      fs.rmSync(emptyHome, { recursive: true, force: true });
    }
  });

  test('non-catalog asset rejected — exit 1, stderr mentions catalog', () => {
    const tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-t3c-'));
    const fakeHome = path.join(tmpDir, 'home');
    fs.mkdirSync(fakeHome);
    makeCompleteInstall(tmpDir);
    try {
      const result = runCLI([
        'resolve-asset', 'unknown-category/nonexistent.md',
        '--project', tmpDir, '--home', fakeHome,
      ]);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/catalog/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('missing relativePath argument — exit 1', () => {
    const emptyProject = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-t3d-'));
    const emptyHome    = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-t3d-home-'));
    try {
      const result = runCLI([
        'resolve-asset',
        '--project', emptyProject, '--home', emptyHome,
      ]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('requires a relative path');
    } finally {
      fs.rmSync(emptyProject, { recursive: true, force: true });
      fs.rmSync(emptyHome, { recursive: true, force: true });
    }
  });

  test('absolute path rejected — exit 1', () => {
    const emptyProject = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-t3e-'));
    const emptyHome    = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-t3e-home-'));
    try {
      const result = runCLI([
        'resolve-asset', '/etc/passwd',
        '--project', emptyProject, '--home', emptyHome,
      ]);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/absolute/i);
    } finally {
      fs.rmSync(emptyProject, { recursive: true, force: true });
      fs.rmSync(emptyHome, { recursive: true, force: true });
    }
  });
});
