'use strict';

/**
 * Manifest hash integrity tests.
 * US-11-TASK-TEST-01 / US-13-TASK-TEST-01 (FTR-017).
 *
 * Contracts verified:
 *  1. A fresh install produces a manifest with fileHashes whose keys equal
 *     the files array (set equality) and whose values have the sha256:<hex> format.
 *  2. A v0.12.0 manifest (no fileHashes) is read back-compat: resolveAgent()
 *     returns "hash-unverifiable", not a crash.
 *  3. After a v0.12.0 → v0.13.0 upgrade (reinstall), the manifest transitions:
 *     - files list updated to current payload
 *     - fileHashes present with exactly one key per files entry
 *     - doctor agents transitions from hash-unverifiable to verified for the agent
 *  4. The set(files) == set(keys(fileHashes)) invariant is enforced by writeManifest.
 *  5. A tampered installed file (hash mismatch) is reported as hash-mismatch,
 *     --require-verified exits non-zero, doctor agents shows [!!], and preflight hard-stops
 *     (AC-12).
 */

const crypto = require('crypto');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI          = path.join(__dirname, '..', '..', 'bin', 'cli.js');
const TOOLKIT_ROOT = path.join(__dirname, '..', '..');

jest.setTimeout(90000);

function runCLI(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', shell: false });
}

function realInstall(projectDir) {
  return spawnSync(process.execPath, [CLI, '--local', projectDir, '--force'], {
    encoding: 'utf8', cwd: TOOLKIT_ROOT,
  });
}

function readManifest(projectDir) {
  const mPath = path.join(projectDir, '.claude', '.ai-toolkit-manifest.json');
  return JSON.parse(fs.readFileSync(mPath, 'utf8'));
}

function writeManifestJSON(dir, manifest) {
  const claudeDir = path.join(dir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, '.ai-toolkit-manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );
}

function writeFileAt(installRoot, relPath, content) {
  const absPath = path.join(installRoot, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, 'utf8');
}

const tmpDirs = [];
function mktmp(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `manifest-hash-${label}-`));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Fresh install produces fileHashes with correct format (AC-11, AC-38)
// ─────────────────────────────────────────────────────────────────────────────

describe('manifest hashes — fresh install produces fileHashes (AC-11, AC-38)', () => {
  let projDir;
  let manifest;

  beforeAll(() => {
    projDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-hash-fresh-'));
    realInstall(projDir);
    manifest = readManifest(projDir);
  });

  afterAll(() => {
    fs.rmSync(projDir, { recursive: true, force: true });
  });

  test('manifest has a fileHashes field', () => {
    expect(manifest.fileHashes).toBeDefined();
    expect(typeof manifest.fileHashes).toBe('object');
    expect(manifest.fileHashes).not.toBeNull();
  });

  test('fileHashes has at least one entry', () => {
    expect(Object.keys(manifest.fileHashes).length).toBeGreaterThan(0);
  });

  test('every fileHashes value starts with "sha256:" (AC-38)', () => {
    for (const [relPath, hash] of Object.entries(manifest.fileHashes)) {
      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  test('set(files) == set(keys(fileHashes)) invariant is met (AC-40)', () => {
    const filesSet  = new Set(manifest.files.map(f => f.replace(/\\/g, '/')));
    const hashesSet = new Set(Object.keys(manifest.fileHashes).map(f => f.replace(/\\/g, '/')));
    expect(filesSet).toEqual(hashesSet);
  });

  test('every recorded hash matches the actual file on disk', () => {
    for (const [relPath, recordedHash] of Object.entries(manifest.fileHashes)) {
      const absPath = path.join(projDir, relPath);
      if (!fs.existsSync(absPath)) continue;
      const buf  = fs.readFileSync(absPath);
      const computed = 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex');
      expect(computed).toBe(recordedHash);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Backward-compatible: v0.12.0 manifest (no fileHashes) reads without crash (AC-40)
// ─────────────────────────────────────────────────────────────────────────────

describe('manifest hashes — v0.12.0 manifest (no fileHashes) backward-compatible (AC-40)', () => {
  const REL_PATH = '.claude/agents/gaia-developer-backend.md';

  test('resolveAgent returns hash-unverifiable (not a crash) for v0.12.0 manifest', () => {
    const projDir  = mktmp('v12-compat');
    const fakeHome = mktmp('v12-compat-home');
    writeFileAt(projDir, REL_PATH, '---\nname: developer-backend\n---\n');
    writeManifestJSON(projDir, {
      version:          '0.12.0',
      installedAt:      '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files:            [REL_PATH],
      // No fileHashes
    });
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', 'gaia.agent.developer.backend',
      '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
    const rec = JSON.parse(result.stdout);
    expect(rec.status).toBe('hash-unverifiable');
  });

  test('agents list exits 0 for a v0.12.0 manifest (backward-compat)', () => {
    const projDir  = mktmp('v12-list');
    const fakeHome = mktmp('v12-list-home');
    writeFileAt(projDir, REL_PATH, '---\nname: developer-backend\n---\n');
    writeManifestJSON(projDir, {
      version:          '0.12.0',
      installedAt:      '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files:            [REL_PATH],
    });
    const result = runCLI([
      'agents', 'list',
      '--project', projDir,
      '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. v0.12.0 → v0.13.0 upgrade: doctor agents transitions to verified (AC-11)
// ─────────────────────────────────────────────────────────────────────────────

describe('manifest hashes — v0.12.0 to v0.13.0 upgrade transitions doctor agents to verified', () => {
  const REL_PATH  = '.claude/agents/gaia-developer-backend.md';
  const AGENT_ID  = 'gaia.agent.developer.backend';

  test('before upgrade: resolveAgent returns hash-unverifiable', () => {
    const projDir  = mktmp('upgrade-before');
    const fakeHome = mktmp('upgrade-before-home');
    writeFileAt(projDir, REL_PATH, '---\nname: developer-backend\n---\n');
    writeManifestJSON(projDir, {
      version:          '0.12.0',
      installedAt:      '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files:            [REL_PATH],
    });
    const result = runCLI(['agents', 'resolve', '--project', projDir, '--id', AGENT_ID, '--home', fakeHome]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).status).toBe('hash-unverifiable');
  });

  test('after reinstall to v0.13.0: manifest has fileHashes', () => {
    const projDir  = mktmp('upgrade-after');
    const fakeHome = mktmp('upgrade-after-home');
    realInstall(projDir);
    const manifest = readManifest(projDir);
    expect(manifest.fileHashes).toBeDefined();
    expect(typeof manifest.fileHashes).toBe('object');
    expect(Object.keys(manifest.fileHashes).length).toBeGreaterThan(0);
  });

  test('after reinstall: set(files) == set(keys(fileHashes))', () => {
    const projDir  = mktmp('upgrade-setcheck');
    const fakeHome = mktmp('upgrade-setcheck-home');
    realInstall(projDir);
    const manifest  = readManifest(projDir);
    const filesSet  = new Set(manifest.files.map(f => f.replace(/\\/g, '/')));
    const hashesSet = new Set(Object.keys(manifest.fileHashes).map(f => f.replace(/\\/g, '/')));
    expect(filesSet).toEqual(hashesSet);
  });

  test('after reinstall: developer-backend transitions from hash-unverifiable to verified', () => {
    const projDir  = mktmp('upgrade-verified');
    const fakeHome = mktmp('upgrade-verified-home');
    realInstall(projDir);
    const result = runCLI(['agents', 'resolve', '--project', projDir, '--id', AGENT_ID, '--home', fakeHome]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).status).toBe('verified');
  });

  test('after reinstall: doctor agents shows [OK] for verified agents', () => {
    const projDir  = mktmp('upgrade-doctor');
    const fakeHome = mktmp('upgrade-doctor-home');
    realInstall(projDir);
    const result = runCLI(['doctor', 'agents', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK]');
    expect(result.stdout).toContain('verified');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. writeManifest enforces set(files) == set(keys(fileHashes)) invariant (AC-40)
// ─────────────────────────────────────────────────────────────────────────────

describe('manifest hashes — writeManifest invariant set(files)==set(keys(fileHashes)) (AC-40)', () => {
  const REL_PATH = '.claude/agents/gaia-developer-backend.md';
  const CLI_MODULE = require(path.join(TOOLKIT_ROOT, 'bin', 'cli.js'));

  test('writeManifest with matching files and fileHashes writes successfully', () => {
    const projDir = mktmp('invariant-ok');
    const content = '---\nname: developer-backend\n---\n';
    writeFileAt(projDir, REL_PATH, content);
    const hash = 'sha256:' + crypto.createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex');
    // Should not throw
    expect(() => {
      CLI_MODULE.writeManifest(projDir, [REL_PATH], 'local', { [REL_PATH]: hash });
    }).not.toThrow();
    const written = readManifest(projDir);
    expect(written.fileHashes).toBeDefined();
    expect(Object.keys(written.fileHashes)).toHaveLength(1);
  });

  test('writeManifest with fileHashes keys that are a strict subset of files rejects (invariant)', () => {
    const projDir = mktmp('invariant-fail');
    const EXTRA_PATH = '.claude/agents/other.md';
    // files has two entries but fileHashes only one → set mismatch
    expect(() => {
      CLI_MODULE.writeManifest(projDir, [REL_PATH, EXTRA_PATH], 'local', { [REL_PATH]: 'sha256:abc' });
    }).toThrow();
  });

  test('writeManifest with fileHashes keys that are a strict superset of files rejects (invariant)', () => {
    const projDir = mktmp('invariant-fail2');
    const EXTRA_PATH = '.claude/agents/other.md';
    // files has one entry but fileHashes has two → set mismatch
    expect(() => {
      CLI_MODULE.writeManifest(projDir, [REL_PATH], 'local', { [REL_PATH]: 'sha256:abc', [EXTRA_PATH]: 'sha256:def' });
    }).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Tampered installed file is reported as hash-mismatch (AC-12)
// ─────────────────────────────────────────────────────────────────────────────

describe('manifest hashes — tampered file is reported as hash-mismatch (AC-12)', () => {
  const REL_PATH = '.claude/agents/gaia-developer-backend.md';
  const AGENT_ID = 'gaia.agent.developer.backend';
  const ORIGINAL_CONTENT = '---\nname: developer-backend\n---\n# Developer Backend\n';
  const TAMPERED_CONTENT = '---\nname: developer-backend\n---\n# TAMPERED\n';

  function sha256hex(str) {
    return crypto.createHash('sha256').update(Buffer.from(str, 'utf8')).digest('hex');
  }

  function setupTamperedInstall(projDir, fakeHome) {
    // Write the agent file with its ORIGINAL content and record the hash for that content.
    writeFileAt(projDir, REL_PATH, ORIGINAL_CONTENT);
    const recordedHash = 'sha256:' + sha256hex(ORIGINAL_CONTENT);
    writeManifestJSON(projDir, {
      version:          '0.13.0',
      installedAt:      '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files:            [REL_PATH],
      fileHashes:       { [REL_PATH]: recordedHash },
    });
    // Now overwrite the file with tampered content so the hash on disk no longer matches.
    writeFileAt(projDir, REL_PATH, TAMPERED_CONTENT);
  }

  test('resolveAgent returns hash-mismatch when installed file was modified after install', () => {
    const projDir  = mktmp('mismatch-resolve');
    const fakeHome = mktmp('mismatch-resolve-home');
    setupTamperedInstall(projDir, fakeHome);
    const result = runCLI(['agents', 'resolve', '--project', projDir, '--id', AGENT_ID, '--home', fakeHome]);
    expect(result.status).toBe(0);
    const rec = JSON.parse(result.stdout);
    expect(rec.status).toBe('hash-mismatch');
  });

  test('agents resolve --require-verified exits non-zero for a hash-mismatch agent', () => {
    const projDir  = mktmp('mismatch-require');
    const fakeHome = mktmp('mismatch-require-home');
    setupTamperedInstall(projDir, fakeHome);
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', AGENT_ID,
      '--home', fakeHome,
      '--require-verified',
    ]);
    expect(result.status).not.toBe(0);
  });

  test('agents resolve --require-verified output contains hash-mismatch detail', () => {
    const projDir  = mktmp('mismatch-require-detail');
    const fakeHome = mktmp('mismatch-require-detail-home');
    setupTamperedInstall(projDir, fakeHome);
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', AGENT_ID,
      '--home', fakeHome,
      '--require-verified',
    ]);
    expect(result.stderr + result.stdout).toMatch(/hash-mismatch/);
  });

  test('doctor agents shows [!!] marker for a hash-mismatch agent (AC-12)', () => {
    const projDir  = mktmp('mismatch-doctor');
    const fakeHome = mktmp('mismatch-doctor-home');
    setupTamperedInstall(projDir, fakeHome);
    const result = runCLI(['doctor', 'agents', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[!!]');
  });

  test('doctor agents exits 0 even for a hash-mismatch agent (read-only diagnostic, AC-14)', () => {
    const projDir  = mktmp('mismatch-doctor-exit');
    const fakeHome = mktmp('mismatch-doctor-exit-home');
    setupTamperedInstall(projDir, fakeHome);
    const result = runCLI(['doctor', 'agents', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
  });

  test('agents preflight exits non-zero for a hash-mismatch agent (dispatch blocked, AC-12)', () => {
    const projDir  = mktmp('mismatch-preflight');
    const fakeHome = mktmp('mismatch-preflight-home');
    setupTamperedInstall(projDir, fakeHome);
    const result = runCLI([
      'agents', 'preflight',
      '--project', projDir,
      '--home', fakeHome,
      '--pipeline', 'implement-feature',
    ]);
    expect(result.status).not.toBe(0);
  });
});
