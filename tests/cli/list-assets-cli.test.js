'use strict';

/**
 * CLI integration tests for list-assets command — US-06-TASK-TEST-03 (FTR-015).
 *
 * Contract (Tech Spec):
 * - --project and --category are BOTH mandatory; omitting either → exit 1,
 *   empty stdout, diagnostic on stderr.
 * - Output contains exclusively assets from the distributable payload
 *   (buildExpectedPayload); foreign/user-created files are never returned.
 * - Absolute OS-native paths, sorted deterministically.
 * - Unknown category → exit 1; no installation → exit 1 (Tier 3); mixed
 *   installation → exit 1; valid category with no files → exit 0 + [].
 *
 * Isolation: every test builds its own fixtures under fresh temp directories
 * (beforeEach) and removes them (afterEach); no shared beforeAll state. Complete
 * installations are produced by the REAL CLI installer rather than a parallel
 * reimplementation of the catalog/traversal/exclusion logic.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI          = path.join(__dirname, '..', '..', 'bin', 'cli.js');
const TOOLKIT_ROOT = path.join(__dirname, '..', '..');

jest.setTimeout(60000);

function runCLI(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', shell: false });
}

// Produce a complete, correct installation via the real installer.
function realInstall(projectDir) {
  spawnSync(process.execPath, [CLI, '--local', projectDir, '--force'], {
    encoding: 'utf8', cwd: TOOLKIT_ROOT,
  });
}

// ── Per-test temp-dir pool ──────────────────────────────────────────────────
const tmpDirs = [];
function mktmp(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `list-assets-${label}-`));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

// ─────────────────────────────────────────────────────────────────────────────
// Complete local installation (real installer)
// ─────────────────────────────────────────────────────────────────────────────

describe('list-assets CLI — with a complete local installation', () => {
  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('full');
    fakeHome = mktmp('full-home');
    realInstall(projDir);
  });

  test('exit 0 when listing a category', () => {
    const result = runCLI(['list-assets', '--category', 'agents', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
  });

  test('plain format returns one absolute path per line', () => {
    const result = runCLI([
      'list-assets', '--category', 'agents', '--format', 'plain', '--project', projDir, '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
    const lines = result.stdout.split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(path.isAbsolute(line)).toBe(true);
  });

  test('JSON format returns a valid non-empty JSON array', () => {
    const result = runCLI([
      'list-assets', '--category', 'agents', '--format', 'json', '--project', projDir, '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
    let parsed;
    expect(() => { parsed = JSON.parse(result.stdout); }).not.toThrow();
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  test('each of the 5 categories returns absolute paths under its own dir', () => {
    const claudeDir  = path.join(projDir, '.claude');
    const categories = ['agents', 'commands', 'skills', 'workflows', 'scripts'];
    for (const cat of categories) {
      const result  = runCLI(['list-assets', '--category', cat, '--format', 'json', '--project', projDir, '--home', fakeHome]);
      expect(result.status).toBe(0);
      const files   = JSON.parse(result.stdout);
      const catDir  = path.join(claudeDir, cat);
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) {
        expect(path.isAbsolute(f)).toBe(true);
        expect(f.startsWith(catDir + path.sep) || f.startsWith(catDir + '/')).toBe(true);
      }
    }
  });

  test('output is sorted alphabetically (deterministic)', () => {
    const result = runCLI(['list-assets', '--category', 'agents', '--format', 'json', '--project', projDir, '--home', fakeHome]);
    const files  = JSON.parse(result.stdout);
    expect(files).toEqual([...files].sort());
  });

  test('--category scripts returns absolute paths for scripts only', () => {
    const result = runCLI(['list-assets', '--category', 'scripts', '--format', 'json', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    const files      = JSON.parse(result.stdout);
    const scriptsDir = path.join(projDir, '.claude', 'scripts');
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(path.isAbsolute(f)).toBe(true);
      expect(f.startsWith(scriptsDir)).toBe(true);
    }
  });

  test('--home isolation: all paths are under the local project, not the home dir', () => {
    const result = runCLI(['list-assets', '--category', 'agents', '--format', 'json', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    const files = JSON.parse(result.stdout);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f.startsWith(path.resolve(projDir))).toBe(true);
  });

  test('default format is JSON (no --format flag)', () => {
    const result = runCLI(['list-assets', '--category', 'agents', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    let parsed;
    expect(() => { parsed = JSON.parse(result.stdout); }).not.toThrow();
    expect(Array.isArray(parsed)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mandatory parameters (P2)
// ─────────────────────────────────────────────────────────────────────────────

describe('list-assets CLI — mandatory parameters (P2)', () => {
  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('mand');
    fakeHome = mktmp('mand-home');
    realInstall(projDir);
  });

  test('missing --project → exit 1, empty stdout, diagnostic on stderr', () => {
    const result = runCLI(['list-assets', '--category', 'agents', '--home', fakeHome]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/--project/);
  });

  test('missing --category → exit 1, empty stdout, diagnostic on stderr', () => {
    const result = runCLI(['list-assets', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/--category/);
  });

  test('missing both → exit 1, empty stdout (project checked first)', () => {
    const result = runCLI(['list-assets', '--home', fakeHome]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/--project/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unknown category
// ─────────────────────────────────────────────────────────────────────────────

describe('list-assets CLI — unknown category', () => {
  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('unk');
    fakeHome = mktmp('unk-home');
    realInstall(projDir);
  });

  test('unknown --category value → exit 1', () => {
    const result = runCLI(['list-assets', '--category', 'nonexistent', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(1);
  });

  test('unknown category stderr lists valid categories', () => {
    const result = runCLI(['list-assets', '--category', 'banana', '--project', projDir, '--home', fakeHome]);
    expect(result.stderr).toMatch(/agents|commands|skills|workflows|scripts/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// No installation (Tier 3 error)
// ─────────────────────────────────────────────────────────────────────────────

describe('list-assets CLI — no installation (Tier 3 error)', () => {
  let emptyProject;
  let emptyHome;

  beforeEach(() => {
    emptyProject = mktmp('empty');
    emptyHome    = mktmp('empty-home');
  });

  test('exit 1 when no toolkit installed', () => {
    const result = runCLI(['list-assets', '--category', 'agents', '--format', 'json', '--project', emptyProject, '--home', emptyHome]);
    expect(result.status).toBe(1);
  });

  test('no-installation: stdout is empty (Tier 3 contract)', () => {
    const result = runCLI(['list-assets', '--category', 'agents', '--format', 'json', '--project', emptyProject, '--home', emptyHome]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
  });

  test('no-installation: stderr contains a diagnostic message', () => {
    const result = runCLI(['list-assets', '--category', 'agents', '--format', 'plain', '--project', emptyProject, '--home', emptyHome]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/no toolkit installation/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mixed installation (both local and global present) → exit 1
// ─────────────────────────────────────────────────────────────────────────────

describe('list-assets CLI — mixed installation', () => {
  let projDir;
  let homeDir;

  beforeEach(() => {
    projDir = mktmp('mixed');
    homeDir = mktmp('mixed-home');
    // Minimal presence markers in BOTH locations (condA: manifest exists).
    for (const root of [path.join(projDir, '.claude'), path.join(homeDir, '.claude')]) {
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(
        path.join(root, '.ai-toolkit-manifest.json'),
        JSON.stringify({ version: '0.1.0', installedAt: '2026-01-01T00:00:00.000Z', installationMode: 'local', files: [] }, null, 2)
      );
    }
  });

  test('mixed installation → exit 1 with diagnostic', () => {
    const result = runCLI(['list-assets', '--category', 'agents', '--project', projDir, '--home', homeDir]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/mixed installation/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Valid category with no files installed
// ─────────────────────────────────────────────────────────────────────────────

describe('list-assets CLI — valid category with no files installed', () => {
  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('emptycat');
    fakeHome = mktmp('emptycat-home');
    // Manifest present (condA satisfied) but the agents dir is empty on disk.
    const clauDir = path.join(projDir, '.claude');
    fs.mkdirSync(path.join(clauDir, 'agents'), { recursive: true });
    fs.writeFileSync(
      path.join(clauDir, '.ai-toolkit-manifest.json'),
      JSON.stringify({ version: '0.1.0', installedAt: '2026-01-01T00:00:00.000Z', installationMode: 'local', files: [] }, null, 2)
    );
  });

  test('empty installation dir for a category → exit 0 and empty array', () => {
    const result = runCLI(['list-assets', '--category', 'agents', '--format', 'json', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    const files = JSON.parse(result.stdout);
    expect(Array.isArray(files)).toBe(true);
    expect(files).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Foreign file exclusion (P1-A)
// ─────────────────────────────────────────────────────────────────────────────

describe('list-assets CLI — foreign file exclusion (P1-A)', () => {
  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('foreign');
    fakeHome = mktmp('foreign-home');
    realInstall(projDir);
    // Inject a foreign file directly into .claude/agents/ (not from the toolkit source).
    fs.writeFileSync(
      path.join(projDir, '.claude', 'agents', 'user-created-agent.md'),
      '# user-created foreign agent',
      'utf8'
    );
  });

  test('foreign file under .claude/agents/ is NOT returned by list-assets', () => {
    const result = runCLI(['list-assets', '--category', 'agents', '--format', 'json', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    const files = JSON.parse(result.stdout);
    expect(files.some(f => f.includes('user-created-agent.md'))).toBe(false);
  });

  test('foreign file exclusion: legitimate catalog agent IS returned', () => {
    const result = runCLI(['list-assets', '--category', 'agents', '--format', 'json', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    const files = JSON.parse(result.stdout);
    expect(files.some(f => f.includes('developer-backend.md'))).toBe(true);
  });

  test('install-toolkit.md is NOT returned by list-assets (excluded from distribution)', () => {
    const result = runCLI(['list-assets', '--category', 'agents', '--format', 'json', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    const files = JSON.parse(result.stdout);
    expect(files.some(f => f.includes('install-toolkit.md'))).toBe(false);
  });
});
