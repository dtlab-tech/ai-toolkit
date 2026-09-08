'use strict';

/**
 * CLI integration tests for `agents list`, `agents resolve`, and
 * `agents resolve --require-verified` commands.
 * US-01-TASK-BE-02 + US-02-TASK-BE-01 (FTR-017).
 *
 * Scenarios covered:
 *   1. agents list returns a JSON array of catalog agents with documented fields
 *      and never includes a foreign/plugin name planted in .claude/agents/ (UC-07)
 *   2. agents resolve for a known resolvable agent exits 0 with a JSON record + status
 *   3. agents resolve for an unknown --id exits non-zero
 *   4. agents resolve against a legacy hashless manifest (v0.12.0, no fileHashes)
 *      returns exit 0 with status "hash-unverifiable"
 *   5. agents resolve against an ambiguous (both local + global) manifest exits non-zero
 *      with status "conflict"
 *   6. agents resolve against a corrupt manifest exits non-zero with status
 *      "manifest-missing"
 *   7. agents resolve --require-verified exits 0 only for verified agents (AC-04)
 *   8. agents resolve --require-verified exits non-zero for v0.12.0 manifest (AC-05)
 *   9. agents resolve --require-verified writes structured JSON error to stderr (AC-39)
 *
 * Isolation: every test uses fresh temp directories; never touches the real ~/.
 * Installs are produced by the real CLI installer rather than a parallel
 * reimplementation of the catalog/traversal logic.
 */

const crypto = require('crypto');
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

function realInstall(projectDir) {
  spawnSync(process.execPath, [CLI, '--local', projectDir, '--force'], {
    encoding: 'utf8', cwd: TOOLKIT_ROOT,
  });
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

// Write a minimal verified installation for a single agent.
// Computes the real sha256 of the written content so resolveAgent() returns "verified".
function writeVerifiedInstall(projDir, relPath, agentContent) {
  writeFileAt(projDir, relPath, agentContent);
  const buf  = Buffer.from(agentContent, 'utf8');
  const sha256 = 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex');
  writeManifestJSON(projDir, {
    version:          '0.13.0',
    installedAt:      '2026-01-01T00:00:00.000Z',
    installationMode: 'local',
    files:            [relPath],
    fileHashes:       { [relPath]: sha256 },
  });
  return sha256;
}

// Do a real install then stamp correct sha256 hashes into the manifest so every
// installed agent reports "verified" rather than "hash-unverifiable".  This
// simulates what US-11 will do once the installer writes hashes during install.
function makeInstallVerified(projDir) {
  realInstall(projDir);
  const manifestPath = path.join(projDir, '.claude', '.ai-toolkit-manifest.json');
  const manifest     = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const fileHashes   = {};
  for (const relPath of manifest.files) {
    const absPath = path.join(projDir, relPath);
    if (fs.existsSync(absPath)) {
      const buf = fs.readFileSync(absPath);
      fileHashes[relPath] = 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex');
    }
  }
  manifest.fileHashes = fileHashes;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

// ── Per-test temp-dir pool ────────────────────────────────────────────────────
const tmpDirs = [];
function mktmp(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agents-cli-${label}-`));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

// ─────────────────────────────────────────────────────────────────────────────
// agents list — complete local installation
// ─────────────────────────────────────────────────────────────────────────────

describe('agents list — complete local installation', () => {
  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('list-full');
    fakeHome = mktmp('list-full-home');
    realInstall(projDir);
  });

  test('exits 0', () => {
    const result = runCLI([
      'agents', 'list', '--project', projDir, '--format', 'json', '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
  });

  test('stdout is valid JSON array', () => {
    const result = runCLI([
      'agents', 'list', '--project', projDir, '--format', 'json', '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
    let parsed;
    expect(() => { parsed = JSON.parse(result.stdout); }).not.toThrow();
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  test('every record has agentId, nativeName, and status fields', () => {
    const result  = runCLI([
      'agents', 'list', '--project', projDir, '--format', 'json', '--home', fakeHome,
    ]);
    const records = JSON.parse(result.stdout);
    for (const rec of records) {
      expect(typeof rec.agentId).toBe('string');
      expect(typeof rec.nativeName).toBe('string');
      expect(typeof rec.status).toBe('string');
    }
  });

  test('every agentId is a namespaced "gaia.*" toolkit ID (not a foreign name)', () => {
    const result  = runCLI([
      'agents', 'list', '--project', projDir, '--format', 'json', '--home', fakeHome,
    ]);
    const records = JSON.parse(result.stdout);
    for (const rec of records) {
      expect(rec.agentId.startsWith('gaia.')).toBe(true);
    }
  });

  test('foreign plugin name planted in .claude/agents/ does NOT appear in the output (UC-07)', () => {
    // Inject a file that is NOT part of the catalog into .claude/agents/.
    fs.writeFileSync(
      path.join(projDir, '.claude', 'agents', 'my-foreign-plugin.md'),
      '# foreign plugin agent',
      'utf8'
    );
    const result  = runCLI([
      'agents', 'list', '--project', projDir, '--format', 'json', '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
    const records = JSON.parse(result.stdout);
    for (const rec of records) {
      expect(rec.nativeName).not.toBe('my-foreign-plugin');
      expect(rec.agentId).not.toMatch(/foreign/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// agents list — missing required flags
// ─────────────────────────────────────────────────────────────────────────────

describe('agents list — missing required flags', () => {
  test('missing --project exits non-zero with a --project diagnostic on stderr', () => {
    const result = runCLI(['agents', 'list', '--format', 'json']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/--project/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// agents resolve — known resolvable agent exits 0
// ─────────────────────────────────────────────────────────────────────────────

describe('agents resolve — known resolvable agent', () => {
  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('resolve-ok');
    fakeHome = mktmp('resolve-ok-home');
    realInstall(projDir);
  });

  test('exits 0 for a known catalog agent', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', 'gaia.agent.developer.backend',
      '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
  });

  test('stdout is a JSON object containing a status field', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', 'gaia.agent.developer.backend',
      '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
    let record;
    expect(() => { record = JSON.parse(result.stdout); }).not.toThrow();
    expect(typeof record.status).toBe('string');
  });

  test('resolution record contains the requested canonical agentId', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', 'gaia.agent.developer.backend',
      '--home', fakeHome,
    ]);
    const record = JSON.parse(result.stdout);
    expect(record.agentId).toBe('gaia.agent.developer.backend');
  });

  test('resolution record contains a nativeName string', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', 'gaia.agent.developer.backend',
      '--home', fakeHome,
    ]);
    const record = JSON.parse(result.stdout);
    expect(typeof record.nativeName).toBe('string');
    expect(record.nativeName.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// agents resolve — unknown ID exits non-zero
// ─────────────────────────────────────────────────────────────────────────────

describe('agents resolve — unknown canonical ID', () => {
  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('resolve-unknown');
    fakeHome = mktmp('resolve-unknown-home');
    realInstall(projDir);
  });

  test('exits non-zero for an ID that is not in the catalog', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', 'gaia.agent.nonexistent.foo',
      '--home', fakeHome,
    ]);
    expect(result.status).not.toBe(0);
  });

  test('resolution record has status "not-found" for unknown ID', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', 'gaia.agent.nonexistent.foo',
      '--home', fakeHome,
    ]);
    expect(result.status).not.toBe(0);
    const record = JSON.parse(result.stdout);
    expect(record.status).toBe('not-found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// agents resolve — missing required flags
// ─────────────────────────────────────────────────────────────────────────────

describe('agents resolve — missing required flags', () => {
  test('missing --project exits non-zero with a --project diagnostic on stderr', () => {
    const result = runCLI(['agents', 'resolve', '--id', 'gaia.agent.developer.backend']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/--project/);
  });

  test('missing --id exits non-zero with an --id diagnostic on stderr', () => {
    const projDir = mktmp('resolve-noid');
    const result  = runCLI(['agents', 'resolve', '--project', projDir]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/--id/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// agents resolve — legacy hashless manifest → hash-unverifiable → exit 0
// ─────────────────────────────────────────────────────────────────────────────

describe('agents resolve — legacy manifest without fileHashes (hash-unverifiable)', () => {
  const AGENT_ID = 'gaia.agent.developer.backend';
  const REL_PATH = '.claude/agents/developer-backend.md';

  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('resolve-hashless');
    fakeHome = mktmp('resolve-hashless-home');

    // v0.12.0-style manifest: has `files` but no `fileHashes`.
    writeManifestJSON(projDir, {
      version:          '0.12.0',
      installedAt:      '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files:            [REL_PATH],
    });

    // Write the agent file on disk so the existence check in _provenanceGuard passes.
    writeFileAt(projDir, REL_PATH, '---\nname: developer-backend\nmodel: sonnet\n---\n');
  });

  test('exits 0 (hash-unverifiable is a resolvable, known state in diagnostic mode)', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', AGENT_ID,
      '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
  });

  test('resolution record has status "hash-unverifiable"', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', AGENT_ID,
      '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
    const record = JSON.parse(result.stdout);
    expect(record.status).toBe('hash-unverifiable');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// agents resolve — ambiguous installation (both local + global) → conflict → exit non-zero
// ─────────────────────────────────────────────────────────────────────────────

describe('agents resolve — ambiguous installation (conflict)', () => {
  const AGENT_ID = 'gaia.agent.developer.backend';

  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('resolve-conflict');
    fakeHome = mktmp('resolve-conflict-home');

    // Plant a manifest in BOTH the local project and the (fake) global home.
    const minimal = {
      version:          '0.13.0',
      installedAt:      '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files:            [],
    };
    writeManifestJSON(projDir,  minimal);
    writeManifestJSON(fakeHome, minimal);
  });

  test('exits non-zero when both local and global manifests are present', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', AGENT_ID,
      '--home', fakeHome,
    ]);
    expect(result.status).not.toBe(0);
  });

  test('resolution record has status "conflict"', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', AGENT_ID,
      '--home', fakeHome,
    ]);
    expect(result.status).not.toBe(0);
    const record = JSON.parse(result.stdout);
    expect(record.status).toBe('conflict');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// agents resolve — corrupt manifest → manifest-missing → exit non-zero
// ─────────────────────────────────────────────────────────────────────────────

describe('agents resolve — corrupt manifest', () => {
  const AGENT_ID = 'gaia.agent.developer.backend';

  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('resolve-corrupt');
    fakeHome = mktmp('resolve-corrupt-home');

    // Write an invalid-JSON manifest so _readManifestSync returns null.
    const claudeDir = path.join(projDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, '.ai-toolkit-manifest.json'),
      '{ this is not valid JSON !!!',
      'utf8'
    );
  });

  test('exits non-zero for a corrupt manifest', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', AGENT_ID,
      '--home', fakeHome,
    ]);
    expect(result.status).not.toBe(0);
  });

  test('resolution record has status "manifest-missing" when manifest is corrupt', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', AGENT_ID,
      '--home', fakeHome,
    ]);
    expect(result.status).not.toBe(0);
    const record = JSON.parse(result.stdout);
    expect(record.status).toBe('manifest-missing');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// agents resolve --require-verified — operational mode (AC-04, AC-05, AC-39)
// ─────────────────────────────────────────────────────────────────────────────

describe('agents resolve --require-verified — verified agent exits 0 (AC-04)', () => {
  const AGENT_ID = 'gaia.agent.developer.backend';
  const REL_PATH = '.claude/agents/developer-backend.md';
  const CONTENT  = '---\nname: developer-backend\nmodel: sonnet\n---\n# developer-backend\n';

  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('resolve-rv-ok');
    fakeHome = mktmp('resolve-rv-ok-home');
    // Write a real hash-verified installation (v0.13.0 manifest + matching fileHashes)
    writeVerifiedInstall(projDir, REL_PATH, CONTENT);
  });

  test('exits 0 when the agent is fully verified (v0.13.0+ manifest, hash matches)', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', AGENT_ID,
      '--home', fakeHome,
      '--require-verified',
    ]);
    expect(result.status).toBe(0);
  });

  test('stdout contains the full resolution record with status "verified"', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', AGENT_ID,
      '--home', fakeHome,
      '--require-verified',
    ]);
    expect(result.status).toBe(0);
    const record = JSON.parse(result.stdout);
    expect(record.status).toBe('verified');
    expect(record.agentId).toBe(AGENT_ID);
    expect(typeof record.nativeName).toBe('string');
  });
});

describe('agents resolve --require-verified — legacy manifest is a HARD STOP (AC-05)', () => {
  const AGENT_ID = 'gaia.agent.developer.backend';
  const REL_PATH = '.claude/agents/developer-backend.md';

  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('resolve-rv-hashless');
    fakeHome = mktmp('resolve-rv-hashless-home');

    // v0.12.0-style manifest: has `files` but no `fileHashes`.
    writeManifestJSON(projDir, {
      version:          '0.12.0',
      installedAt:      '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files:            [REL_PATH],
    });
    writeFileAt(projDir, REL_PATH, '---\nname: developer-backend\nmodel: sonnet\n---\n');
  });

  test('exits non-zero for a v0.12.0 manifest under --require-verified (HARD STOP, AC-05)', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', AGENT_ID,
      '--home', fakeHome,
      '--require-verified',
    ]);
    expect(result.status).not.toBe(0);
  });

  test('structured error is written to stderr (not stdout) under --require-verified', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', AGENT_ID,
      '--home', fakeHome,
      '--require-verified',
    ]);
    expect(result.status).not.toBe(0);
    // stdout must be empty; error record on stderr
    expect(result.stdout.trim()).toBe('');
    const errRecord = JSON.parse(result.stderr);
    expect(errRecord.agentId).toBe(AGENT_ID);
    expect(errRecord.status).toBe('hash-unverifiable');
  });
});

describe('agents resolve --require-verified — not-found exits non-zero (AC-39)', () => {
  const AGENT_ID = 'gaia.agent.developer.backend';

  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('resolve-rv-notfound');
    fakeHome = mktmp('resolve-rv-notfound-home');
    // Manifest present but agent not listed in files → not-installed
    writeManifestJSON(projDir, {
      version: '0.13.0', installedAt: '2026-01-01T00:00:00.000Z',
      installationMode: 'local', files: [], fileHashes: {},
    });
  });

  test('exits non-zero when agent is not installed under --require-verified', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', AGENT_ID,
      '--home', fakeHome,
      '--require-verified',
    ]);
    expect(result.status).not.toBe(0);
  });

  test('no fuzzy match or fallback — original agentId preserved in error record (AC-39)', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', 'gaia.agent.developer.backend',
      '--home', fakeHome,
      '--require-verified',
    ]);
    expect(result.status).not.toBe(0);
    // Error written to stderr under --require-verified
    const errRecord = JSON.parse(result.stderr);
    expect(errRecord.agentId).toBe('gaia.agent.developer.backend');
    expect(errRecord.status).toBe('not-installed');
  });

  test('stderr error record includes the RESOLUTION_FAILED code (AC-39)', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', AGENT_ID,
      '--home', fakeHome,
      '--require-verified',
    ]);
    expect(result.status).not.toBe(0);
    const errRecord = JSON.parse(result.stderr);
    expect(errRecord.code).toBe('RESOLUTION_FAILED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// agents resolve --require-verified — hash-mismatch exits non-zero
// ─────────────────────────────────────────────────────────────────────────────

describe('agents resolve --require-verified — hash-mismatch exits non-zero', () => {
  const AGENT_ID = 'gaia.agent.developer.backend';
  const REL_PATH = '.claude/agents/developer-backend.md';

  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('resolve-rv-mismatch');
    fakeHome = mktmp('resolve-rv-mismatch-home');

    // Write the agent file on disk with known content...
    writeFileAt(projDir, REL_PATH, '---\nname: developer-backend\n---\n');
    // ...but put a wrong hash in the manifest so resolveAgent() returns hash-mismatch.
    writeManifestJSON(projDir, {
      version:          '0.13.0',
      installedAt:      '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files:            [REL_PATH],
      fileHashes:       { [REL_PATH]: 'sha256:' + 'c'.repeat(64) },
    });
  });

  test('exits non-zero for a tampered agent file under --require-verified', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', AGENT_ID,
      '--home', fakeHome,
      '--require-verified',
    ]);
    expect(result.status).not.toBe(0);
  });

  test('stderr error record has status "hash-mismatch" and code RESOLUTION_FAILED', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', AGENT_ID,
      '--home', fakeHome,
      '--require-verified',
    ]);
    expect(result.status).not.toBe(0);
    const errRecord = JSON.parse(result.stderr);
    expect(errRecord.status).toBe('hash-mismatch');
    expect(errRecord.code).toBe('RESOLUTION_FAILED');
  });

  test('stdout is empty when --require-verified fails (error goes to stderr only)', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', AGENT_ID,
      '--home', fakeHome,
      '--require-verified',
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stdout.trim()).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// agents preflight — pipeline verification (AC-19)
// ─────────────────────────────────────────────────────────────────────────────

describe('agents preflight — unknown pipeline exits non-zero', () => {
  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('preflight-unknown-pipeline');
    fakeHome = mktmp('preflight-unknown-pipeline-home');
    realInstall(projDir);
  });

  test('exits non-zero for an unknown pipeline name', () => {
    const result = runCLI([
      'agents', 'preflight',
      '--project', projDir,
      '--pipeline', 'nonexistent-pipeline',
      '--home', fakeHome,
    ]);
    expect(result.status).not.toBe(0);
  });

  test('stderr contains preflight-failed status for unknown pipeline', () => {
    const result = runCLI([
      'agents', 'preflight',
      '--project', projDir,
      '--pipeline', 'nonexistent-pipeline',
      '--home', fakeHome,
    ]);
    expect(result.status).not.toBe(0);
    const errRecord = JSON.parse(result.stderr);
    expect(errRecord.status).toBe('preflight-failed');
  });
});

describe('agents preflight — missing required flags', () => {
  test('missing --project exits non-zero with --project diagnostic', () => {
    const result = runCLI(['agents', 'preflight', '--pipeline', 'implement-feature']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/--project/);
  });

  test('missing --pipeline exits non-zero with --pipeline diagnostic', () => {
    const projDir = mktmp('preflight-nopipeline');
    const result  = runCLI(['agents', 'preflight', '--project', projDir]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/--pipeline/);
  });
});

describe('agents preflight — fully verified install exits 0 (AC-19 happy path)', () => {
  const PIPELINE = 'implement-feature';

  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('preflight-ok');
    fakeHome = mktmp('preflight-ok-home');
    makeInstallVerified(projDir);
  });

  test('exits 0 when all pipeline agents are verified (v0.13.0+ manifest with hashes)', () => {
    const result = runCLI([
      'agents', 'preflight',
      '--project', projDir,
      '--pipeline', PIPELINE,
      '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
  });

  test('stdout contains preflight-ok status with an agents array', () => {
    const result = runCLI([
      'agents', 'preflight',
      '--project', projDir,
      '--pipeline', PIPELINE,
      '--home', fakeHome,
    ]);
    expect(result.status).toBe(0);
    const rec = JSON.parse(result.stdout);
    expect(rec.status).toBe('preflight-ok');
    expect(Array.isArray(rec.agents)).toBe(true);
    expect(rec.agents.length).toBeGreaterThan(0);
    for (const a of rec.agents) {
      expect(a.status).toBe('verified');
    }
  });
});

describe('agents preflight — v0.12.0 manifest hard-stop (AC-19)', () => {
  const PIPELINE = 'implement-feature';
  const REL_PATH = '.claude/agents/developer-backend.md';

  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('preflight-hashless');
    fakeHome = mktmp('preflight-hashless-home');

    // v0.12.0-style manifest without fileHashes → agents resolve to hash-unverifiable
    writeFileAt(projDir, REL_PATH, '---\nname: developer-backend\n---\n');
    writeManifestJSON(projDir, {
      version:          '0.12.0',
      installedAt:      '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files:            [REL_PATH],
    });
  });

  test('exits non-zero for a v0.12.0 manifest (hash-unverifiable is a HARD STOP)', () => {
    const result = runCLI([
      'agents', 'preflight',
      '--project', projDir,
      '--pipeline', PIPELINE,
      '--home', fakeHome,
    ]);
    expect(result.status).not.toBe(0);
  });

  test('stderr preflight-failed record contains at least one hash-unverifiable agent', () => {
    const result = runCLI([
      'agents', 'preflight',
      '--project', projDir,
      '--pipeline', PIPELINE,
      '--home', fakeHome,
    ]);
    expect(result.status).not.toBe(0);
    const errRecord = JSON.parse(result.stderr);
    expect(errRecord.status).toBe('preflight-failed');
    const failedStatuses = errRecord.agents.map(a => a.status);
    expect(failedStatuses).toContain('hash-unverifiable');
  });
});

describe('agents preflight — uninstalled agents hard-stop (AC-19)', () => {
  const PIPELINE = 'implement-feature';

  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('preflight-fail');
    fakeHome = mktmp('preflight-fail-home');
    // Empty manifest: no agents installed
    writeManifestJSON(projDir, {
      version: '0.13.0', installedAt: '2026-01-01T00:00:00.000Z',
      installationMode: 'local', files: [], fileHashes: {},
    });
  });

  test('exits non-zero when pipeline agents are not installed (AC-19)', () => {
    const result = runCLI([
      'agents', 'preflight',
      '--project', projDir,
      '--pipeline', PIPELINE,
      '--home', fakeHome,
    ]);
    expect(result.status).not.toBe(0);
  });

  test('stderr contains preflight-failed with a per-agent result array', () => {
    const result = runCLI([
      'agents', 'preflight',
      '--project', projDir,
      '--pipeline', PIPELINE,
      '--home', fakeHome,
    ]);
    expect(result.status).not.toBe(0);
    const errRecord = JSON.parse(result.stderr);
    expect(errRecord.status).toBe('preflight-failed');
    expect(Array.isArray(errRecord.agents)).toBe(true);
    expect(errRecord.agents.length).toBeGreaterThan(0);
    // All agents are not-installed
    for (const a of errRecord.agents) {
      expect(typeof a.agentId).toBe('string');
      expect(a.agentId.startsWith('gaia.')).toBe(true);
    }
  });
});
