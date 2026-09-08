'use strict';

/**
 * CLI integration tests for `agents list` and `agents resolve` commands.
 * US-01-TASK-BE-02 (FTR-017).
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
 *
 * Isolation: every test uses fresh temp directories; never touches the real ~/.
 * Installs are produced by the real CLI installer rather than a parallel
 * reimplementation of the catalog/traversal logic.
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
