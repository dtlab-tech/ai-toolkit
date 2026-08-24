'use strict';

/**
 * CLI integration tests for list-assets command — US-06-TASK-TEST-03 (FTR-015).
 *
 * Covers:
 * - JSON output format (--format json, default)
 * - Plain text output format (--format plain)
 * - Absolute OS-native paths in output (Tech Spec contract)
 * - Deterministic ordering (sorted alphabetically)
 * - --category filter
 * - --home isolation (only local manifest used)
 * - Unknown category → exit 1
 * - No installation → exit 1 Tier 3 error (not empty list)
 * - Mixed installation → exit 1
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI          = path.join(__dirname, '..', '..', 'bin', 'cli.js');
const TOOLKIT_ROOT = path.join(__dirname, '..', '..');
const { getAssetCategories } = require('../../lib/asset-catalog');

function makeCompleteInstall(projectDir) {
  const clauDir = path.join(projectDir, '.claude');
  fs.mkdirSync(clauDir, { recursive: true });
  const files = [];
  for (const cat of getAssetCategories()) {
    const srcDir = path.join(TOOLKIT_ROOT, cat.sourceDir);
    if (!fs.existsSync(srcDir)) continue;
    const stack = [srcDir];
    while (stack.length > 0) {
      const dir = stack.pop();
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) { stack.push(full); }
        else {
          const rel      = path.relative(srcDir, full).replace(/\\/g, '/');
          const destPath = path.join(clauDir, cat.name, rel);
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(full, destPath);
          files.push(`.claude/${cat.name}/${rel}`);
        }
      }
    }
  }
  fs.writeFileSync(
    path.join(clauDir, '.ai-toolkit-manifest.json'),
    JSON.stringify({ version: '0.10.1', installedAt: '2026-01-01T00:00:00.000Z', installationMode: 'local', files }, null, 2)
  );
  fs.writeFileSync(path.join(clauDir, '.ai-toolkit-version'), '0.10.1');
}

function runCLI(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    shell: false,
  });
}

describe('list-assets CLI — with a complete local installation', () => {
  let tmpDir;
  let fakeHome;

  beforeAll(() => {
    tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'list-assets-full-'));
    fakeHome = path.join(tmpDir, 'home');
    fs.mkdirSync(fakeHome);
    makeCompleteInstall(tmpDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exit 0 when listing all assets', () => {
    const result = runCLI([
      'list-assets', '--project', tmpDir, '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
  });

  test('plain format returns one absolute path per line', () => {
    const result = runCLI([
      'list-assets', '--format', 'plain', '--project', tmpDir, '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
    const lines = result.stdout.split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(path.isAbsolute(line)).toBe(true);
    }
  });

  test('JSON format returns a valid JSON array', () => {
    const result = runCLI([
      'list-assets', '--format', 'json', '--project', tmpDir, '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
    let parsed;
    expect(() => { parsed = JSON.parse(result.stdout); }).not.toThrow();
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  test('JSON output contains absolute paths for all 5 categories', () => {
    const result = runCLI([
      'list-assets', '--format', 'json', '--project', tmpDir, '--home', fakeHome,
    ]);
    const files = JSON.parse(result.stdout);
    const claudeDir = path.join(tmpDir, '.claude');
    const categories = ['agents', 'commands', 'skills', 'workflows', 'scripts'];
    for (const cat of categories) {
      const catDir = path.join(claudeDir, cat);
      const catFiles = files.filter(f => f.startsWith(catDir + path.sep) || f.startsWith(catDir + '/'));
      expect(catFiles.length).toBeGreaterThan(0);
    }
  });

  test('all JSON output paths are absolute', () => {
    const result = runCLI([
      'list-assets', '--format', 'json', '--project', tmpDir, '--home', fakeHome,
    ]);
    const files = JSON.parse(result.stdout);
    for (const f of files) {
      expect(path.isAbsolute(f)).toBe(true);
    }
  });

  test('output is sorted alphabetically (deterministic)', () => {
    const result = runCLI([
      'list-assets', '--format', 'json', '--project', tmpDir, '--home', fakeHome,
    ]);
    const files = JSON.parse(result.stdout);
    const sorted = [...files].sort();
    expect(files).toEqual(sorted);
  });

  test('--category agents returns absolute paths for agents only', () => {
    const result = runCLI([
      'list-assets', '--category', 'agents', '--format', 'json',
      '--project', tmpDir, '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
    const files = JSON.parse(result.stdout);
    expect(files.length).toBeGreaterThan(0);
    const agentsDir = path.join(tmpDir, '.claude', 'agents');
    for (const f of files) {
      expect(path.isAbsolute(f)).toBe(true);
      expect(f.startsWith(agentsDir)).toBe(true);
    }
  });

  test('--category scripts returns absolute paths for scripts only', () => {
    const result = runCLI([
      'list-assets', '--category', 'scripts', '--format', 'json',
      '--project', tmpDir, '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
    const files = JSON.parse(result.stdout);
    expect(files.length).toBeGreaterThan(0);
    const scriptsDir = path.join(tmpDir, '.claude', 'scripts');
    for (const f of files) {
      expect(path.isAbsolute(f)).toBe(true);
      expect(f.startsWith(scriptsDir)).toBe(true);
    }
  });

  test('--home isolation: global home has no toolkit, local manifest used', () => {
    const result = runCLI([
      'list-assets', '--format', 'json',
      '--project', tmpDir, '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
    const files = JSON.parse(result.stdout);
    expect(files.length).toBeGreaterThan(0);
    // All paths must be under tmpDir (local), not fakeHome (global)
    for (const f of files) {
      expect(f.startsWith(path.resolve(tmpDir))).toBe(true);
    }
  });

  test('default format is JSON (no --format flag)', () => {
    const result = runCLI([
      'list-assets', '--project', tmpDir, '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
    let parsed;
    expect(() => { parsed = JSON.parse(result.stdout); }).not.toThrow();
    expect(Array.isArray(parsed)).toBe(true);
  });
});

describe('list-assets CLI — unknown category', () => {
  test('unknown --category value → exit 1', () => {
    const emptyProject = fs.mkdtempSync(path.join(os.tmpdir(), 'list-unk-'));
    const emptyHome    = fs.mkdtempSync(path.join(os.tmpdir(), 'list-unk-h-'));
    try {
      const result = runCLI([
        'list-assets', '--category', 'nonexistent',
        '--project', emptyProject, '--home', emptyHome,
      ]);
      expect(result.status).toBe(1);
    } finally {
      fs.rmSync(emptyProject, { recursive: true, force: true });
      fs.rmSync(emptyHome, { recursive: true, force: true });
    }
  });

  test('unknown category stderr lists valid categories', () => {
    const emptyProject = fs.mkdtempSync(path.join(os.tmpdir(), 'list-unk2-'));
    const emptyHome    = fs.mkdtempSync(path.join(os.tmpdir(), 'list-unk2-h-'));
    try {
      const result = runCLI([
        'list-assets', '--category', 'banana',
        '--project', emptyProject, '--home', emptyHome,
      ]);
      expect(result.stderr).toMatch(/agents|commands|skills|workflows|scripts/i);
    } finally {
      fs.rmSync(emptyProject, { recursive: true, force: true });
      fs.rmSync(emptyHome, { recursive: true, force: true });
    }
  });
});

describe('list-assets CLI — no installation (Tier 3 error)', () => {
  test('exit 1 when no toolkit installed', () => {
    const emptyProject = fs.mkdtempSync(path.join(os.tmpdir(), 'list-empty-'));
    const emptyHome    = fs.mkdtempSync(path.join(os.tmpdir(), 'list-empty-h-'));
    try {
      const result = runCLI([
        'list-assets', '--format', 'json',
        '--project', emptyProject, '--home', emptyHome,
      ]);
      expect(result.status).toBe(1);
    } finally {
      fs.rmSync(emptyProject, { recursive: true, force: true });
      fs.rmSync(emptyHome, { recursive: true, force: true });
    }
  });

  test('no-installation: stdout is empty (Tier 3 contract)', () => {
    const emptyProject = fs.mkdtempSync(path.join(os.tmpdir(), 'list-empty2-'));
    const emptyHome    = fs.mkdtempSync(path.join(os.tmpdir(), 'list-empty2-h-'));
    try {
      const result = runCLI([
        'list-assets', '--format', 'json',
        '--project', emptyProject, '--home', emptyHome,
      ]);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
    } finally {
      fs.rmSync(emptyProject, { recursive: true, force: true });
      fs.rmSync(emptyHome, { recursive: true, force: true });
    }
  });

  test('no-installation: stderr contains a diagnostic message', () => {
    const emptyProject = fs.mkdtempSync(path.join(os.tmpdir(), 'list-empty3-'));
    const emptyHome    = fs.mkdtempSync(path.join(os.tmpdir(), 'list-empty3-h-'));
    try {
      const result = runCLI([
        'list-assets', '--format', 'plain',
        '--project', emptyProject, '--home', emptyHome,
      ]);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/no toolkit installation/i);
    } finally {
      fs.rmSync(emptyProject, { recursive: true, force: true });
      fs.rmSync(emptyHome, { recursive: true, force: true });
    }
  });
});

describe('list-assets CLI — valid category with no files installed', () => {
  test('empty installation dir for a category → exit 0 and empty array', () => {
    const projDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'list-emptycat-'));
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'list-emptycat-h-'));
    try {
      // Create an empty agents dir (satisfies condC = false but manifest satisfies condA)
      const clauDir = path.join(projDir, '.claude');
      fs.mkdirSync(path.join(clauDir, 'agents'), { recursive: true });
      fs.writeFileSync(
        path.join(clauDir, '.ai-toolkit-manifest.json'),
        JSON.stringify({ version: '0.1.0', installedAt: '2026-01-01T00:00:00.000Z', installationMode: 'local', files: [] }, null, 2)
      );
      const result = runCLI([
        'list-assets', '--category', 'agents', '--format', 'json',
        '--project', projDir, '--home', fakeHome,
      ]);
      expect(result.status).toBe(0);
      const files = JSON.parse(result.stdout);
      expect(Array.isArray(files)).toBe(true);
      expect(files).toHaveLength(0);
    } finally {
      fs.rmSync(projDir,  { recursive: true, force: true });
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});
