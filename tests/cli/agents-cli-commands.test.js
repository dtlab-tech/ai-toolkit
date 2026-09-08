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

// ─────────────────────────────────────────────────────────────────────────────
// doctor agents — output format and status vocabulary (AC-13, AC-14, AC-09, AC-33)
// ─────────────────────────────────────────────────────────────────────────────

describe('doctor agents — exits 0 and writes to stdout (AC-14)', () => {
  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('doctor-ok');
    fakeHome = mktmp('doctor-ok-home');
    realInstall(projDir);
  });

  test('exits 0 with a valid local installation', () => {
    const result = runCLI(['doctor', 'agents', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
  });

  test('exits 0 with no installation present (not-installed agents)', () => {
    const projEmpty = mktmp('doctor-empty');
    const homeEmpty = mktmp('doctor-empty-home');
    const result = runCLI(['doctor', 'agents', '--project', projEmpty, '--home', homeEmpty]);
    expect(result.status).toBe(0);
  });

  test('stdout is non-empty and contains the command header', () => {
    const result = runCLI(['doctor', 'agents', '--project', projDir, '--home', fakeHome]);
    expect(result.stdout).toContain('ai-toolkit doctor agents');
  });

  test('stdout contains a Summary section', () => {
    const result = runCLI(['doctor', 'agents', '--project', projDir, '--home', fakeHome]);
    expect(result.stdout).toContain('Summary:');
  });
});

describe('doctor agents — each agent gets exactly one of the six status values (AC-13)', () => {
  const REL_PATH = '.claude/agents/developer-backend.md';

  test('verified install: agents show [OK] status markers', () => {
    const projDir  = mktmp('doctor-verified');
    const fakeHome = mktmp('doctor-verified-home');
    makeInstallVerified(projDir);
    const result = runCLI(['doctor', 'agents', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[OK]');
  });

  test('hash-unverifiable install: agents show [??] markers and hash-unverifiable label', () => {
    const projDir  = mktmp('doctor-hashless');
    const fakeHome = mktmp('doctor-hashless-home');
    writeFileAt(projDir, REL_PATH, '---\nname: developer-backend\n---\n');
    writeManifestJSON(projDir, {
      version:          '0.12.0',
      installedAt:      '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files:            [REL_PATH],
    });
    const result = runCLI(['doctor', 'agents', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[??]');
    expect(result.stdout).toContain('hash-unverifiable');
  });

  test('not-installed: absent agents show [--] markers', () => {
    const projDir  = mktmp('doctor-notinst');
    const fakeHome = mktmp('doctor-notinst-home');
    writeManifestJSON(projDir, {
      version: '0.13.0', installedAt: '2026-01-01T00:00:00.000Z',
      installationMode: 'local', files: [], fileHashes: {},
    });
    const result = runCLI(['doctor', 'agents', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[--]');
    expect(result.stdout).toContain('not-installed');
  });

  test('conflict (both project and global manifest): agents show [!!] markers', () => {
    const projDir  = mktmp('doctor-conflict');
    const fakeHome = mktmp('doctor-conflict-home');
    writeManifestJSON(projDir, {
      version: '0.13.0', installedAt: '2026-01-01T00:00:00.000Z',
      installationMode: 'local', files: [REL_PATH], fileHashes: {},
    });
    writeManifestJSON(fakeHome, {
      version: '0.13.0', installedAt: '2026-01-01T00:00:00.000Z',
      installationMode: 'global', files: [REL_PATH], fileHashes: {},
    });
    const result = runCLI(['doctor', 'agents', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[!!]');
    expect(result.stdout).toContain('conflict');
  });
});

describe('doctor agents — hash-mismatch reported as conflict + detail (AC-13)', () => {
  const REL_PATH = '.claude/agents/developer-backend.md';

  test('tampered file: shows [!!] and hash-mismatch detail', () => {
    const projDir  = mktmp('doctor-hashmismatch');
    const fakeHome = mktmp('doctor-hashmismatch-home');
    const content  = '---\nname: developer-backend\n---\n';
    writeFileAt(projDir, REL_PATH, content + '\n<!-- tampered -->');
    const buf    = Buffer.from(content, 'utf8');
    const sha256 = 'sha256:' + require('crypto').createHash('sha256').update(buf).digest('hex');
    writeManifestJSON(projDir, {
      version:          '0.13.0',
      installedAt:      '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files:            [REL_PATH],
      fileHashes:       { [REL_PATH]: sha256 },
    });
    const result = runCLI(['doctor', 'agents', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[!!]');
    expect(result.stdout).toContain('hash-mismatch');
  });
});

describe('doctor agents — hash-unverifiable remediation message (AC-13)', () => {
  const REL_PATH = '.claude/agents/developer-backend.md';

  test('shows remediation instruction referencing --force', () => {
    const projDir  = mktmp('doctor-remediation');
    const fakeHome = mktmp('doctor-remediation-home');
    writeFileAt(projDir, REL_PATH, '---\nname: developer-backend\n---\n');
    writeManifestJSON(projDir, {
      version: '0.12.0', installedAt: '2026-01-01T00:00:00.000Z',
      installationMode: 'local', files: [REL_PATH],
    });
    const result = runCLI(['doctor', 'agents', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Remediation for hash-unverifiable/);
    expect(result.stdout).toMatch(/--force/);
  });
});

describe('doctor agents — foreign observable agents flagged (AC-09)', () => {
  test('foreign agent file in .claude/agents/ is reported as foreign (not blocking)', () => {
    const projDir  = mktmp('doctor-foreign');
    const fakeHome = mktmp('doctor-foreign-home');
    realInstall(projDir);
    fs.writeFileSync(
      path.join(projDir, '.claude', 'agents', 'my-old-project-manager.md'),
      '# old project manager',
      'utf8'
    );
    const result = runCLI(['doctor', 'agents', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Foreign observable agents');
    expect(result.stdout).toContain('my-old-project-manager');
  });

  test('toolkit catalog agents are never reported as foreign', () => {
    const projDir  = mktmp('doctor-noforeign');
    const fakeHome = mktmp('doctor-noforeign-home');
    makeInstallVerified(projDir);
    const result = runCLI(['doctor', 'agents', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    // If a foreign section appears, it must not list any catalog-native names
    if (result.stdout.includes('Foreign observable agents')) {
      const lines = result.stdout.split('\n');
      const idx   = lines.findIndex(l => l.includes('Foreign observable agents'));
      const foreignLines = lines.slice(idx);
      for (const line of foreignLines) {
        expect(line).not.toMatch(/\bdeveloper-backend\b|\bdeveloper-frontend\b|\bdeveloper-testing\b|\breview-solution\b/);
      }
    }
  });
});

describe('doctor agents — unobservable WARNING emitted without blocking (AC-33)', () => {
  test('exits 0 even with no installation (non-observable entries must not block)', () => {
    const projDir  = mktmp('doctor-unobservable');
    const fakeHome = mktmp('doctor-unobservable-home');
    const result = runCLI(['doctor', 'agents', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
  });
});

describe('doctor agents — read-only: no files modified or created (AC-14)', () => {
  test('no new files created in project dir after doctor agents runs', () => {
    const projDir  = mktmp('doctor-readonly');
    const fakeHome = mktmp('doctor-readonly-home');
    realInstall(projDir);
    const before = walkDirRecursive(projDir);
    runCLI(['doctor', 'agents', '--project', projDir, '--home', fakeHome]);
    const after  = walkDirRecursive(projDir);
    expect(after.sort()).toEqual(before.sort());
  });

  test('no new files created in home dir after doctor agents runs', () => {
    const projDir  = mktmp('doctor-readonly2');
    const fakeHome = mktmp('doctor-readonly2-home');
    writeManifestJSON(fakeHome, {
      version: '0.12.0', installedAt: '2026-01-01T00:00:00.000Z',
      installationMode: 'global', files: [],
    });
    const before = walkDirRecursive(fakeHome);
    runCLI(['doctor', 'agents', '--project', projDir, '--home', fakeHome]);
    const after  = walkDirRecursive(fakeHome);
    expect(after.sort()).toEqual(before.sort());
  });
});

function walkDirRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d)) {
      const full = path.join(d, entry);
      if (fs.statSync(full).isDirectory()) walk(full);
      else results.push(full);
    }
  }
  walk(dir);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// agents cleanup — dry-run classification (AC-15, AC-16)
// ─────────────────────────────────────────────────────────────────────────────

describe('agents cleanup — mutating flags rejected (AC-15)', () => {
  test('--delete flag rejected with non-zero exit', () => {
    const projDir = mktmp('cleanup-delete');
    const result  = runCLI(['agents', 'cleanup', '--project', projDir, '--delete']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/--delete/);
  });

  test('--force flag rejected with non-zero exit', () => {
    const projDir = mktmp('cleanup-force');
    const result  = runCLI(['agents', 'cleanup', '--project', projDir, '--force']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/--force/);
  });

  test('missing --project exits non-zero with --project diagnostic', () => {
    const result = runCLI(['agents', 'cleanup']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/--project/);
  });
});

describe('agents cleanup — no manifest returns dry-run with empty lists (AC-15)', () => {
  test('exits 0 and returns no-manifest status when no toolkit is installed', () => {
    const projDir  = mktmp('cleanup-nomanifest');
    const fakeHome = mktmp('cleanup-nomanifest-home');
    const result   = runCLI(['agents', 'cleanup', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.status).toBe('no-manifest');
    expect(out.candidates).toEqual([]);
    expect(out.missing).toEqual([]);
  });
});

describe('agents cleanup — genuine candidates listed correctly (AC-15, AC-16)', () => {
  const STALE_PATH  = '.claude/agents/old-removed-agent.md';
  const ACTIVE_PATH = '.claude/agents/developer-backend.md';

  test('a manifest entry no longer in current payload and still on disk is a candidate', () => {
    const projDir  = mktmp('cleanup-candidate');
    const fakeHome = mktmp('cleanup-candidate-home');

    // Write both files on disk
    writeFileAt(projDir, STALE_PATH,  '# old agent\n');
    writeFileAt(projDir, ACTIVE_PATH, '---\nname: developer-backend\n---\n');

    // Manifest lists both; but STALE_PATH is NOT in the current toolkit payload
    writeManifestJSON(projDir, {
      version:          '0.13.0',
      installedAt:      '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files:            [STALE_PATH, ACTIVE_PATH],
      fileHashes:       {},
    });

    const result = runCLI(['agents', 'cleanup', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.status).toBe('dry-run');
    // Stale agent must appear as a candidate
    const candidatePaths = out.candidates.map(c => c.path.replace(/\\/g, '/'));
    expect(candidatePaths).toContain(STALE_PATH);
    // Active agent must NOT be a candidate
    expect(candidatePaths).not.toContain(ACTIVE_PATH);
  });
});

describe('agents cleanup — missing manifest entry is never a candidate (AC-16)', () => {
  const MISSING_PATH = '.claude/agents/missing-agent.md';

  test('a manifest entry absent from disk is reported as missing, not a candidate', () => {
    const projDir  = mktmp('cleanup-missing');
    const fakeHome = mktmp('cleanup-missing-home');

    // Manifest lists the file but it does NOT exist on disk
    writeManifestJSON(projDir, {
      version:          '0.13.0',
      installedAt:      '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files:            [MISSING_PATH],
      fileHashes:       {},
    });

    const result = runCLI(['agents', 'cleanup', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    // Must appear in missing, not candidates
    const missingPaths   = out.missing.map(m => m.path.replace(/\\/g, '/'));
    const candidatePaths = out.candidates.map(c => c.path.replace(/\\/g, '/'));
    expect(missingPaths).toContain(MISSING_PATH);
    expect(candidatePaths).not.toContain(MISSING_PATH);
  });
});

describe('agents cleanup — user-owned files never proposed (AC-16)', () => {
  test('a file on disk not in the manifest is never a candidate', () => {
    const projDir    = mktmp('cleanup-userowned');
    const fakeHome   = mktmp('cleanup-userowned-home');
    const userFile   = '.claude/agents/user-custom-agent.md';

    // Write a user file on disk but do NOT list it in the manifest
    writeFileAt(projDir, userFile, '# my custom agent\n');
    writeManifestJSON(projDir, {
      version:          '0.13.0',
      installedAt:      '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files:            [],
      fileHashes:       {},
    });

    const result = runCLI(['agents', 'cleanup', '--project', projDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    const candidatePaths = out.candidates.map(c => c.path.replace(/\\/g, '/'));
    const missingPaths   = out.missing.map(m => m.path.replace(/\\/g, '/'));
    expect(candidatePaths).not.toContain(userFile);
    expect(missingPaths).not.toContain(userFile);
  });
});

describe('agents cleanup — no files touched (AC-15)', () => {
  const STALE_PATH = '.claude/agents/old-removed-agent.md';

  test('dry-run does not delete or modify any file on disk', () => {
    const projDir  = mktmp('cleanup-readonly');
    const fakeHome = mktmp('cleanup-readonly-home');

    writeFileAt(projDir, STALE_PATH, '# old agent\n');
    writeManifestJSON(projDir, {
      version:          '0.13.0',
      installedAt:      '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files:            [STALE_PATH],
      fileHashes:       {},
    });

    const before = walkDirRecursive(projDir);
    runCLI(['agents', 'cleanup', '--project', projDir, '--home', fakeHome]);
    const after  = walkDirRecursive(projDir);

    expect(after.sort()).toEqual(before.sort());
    // Stale file must still exist — dry-run never deletes
    expect(fs.existsSync(path.join(projDir, STALE_PATH))).toBe(true);
  });
});
