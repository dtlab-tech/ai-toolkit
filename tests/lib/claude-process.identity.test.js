'use strict';

// Tests for lib/task-executor/claude-process.js verifyAgentIdentity
// (US-03-TASK-BE-02, FTR-018, FTR-017 contract).
//
// SAFETY: every test below invokes the toolkit's OWN `bin/cli.js agents
// resolve --require-verified` as a real, local, deterministic subprocess
// (via process.execPath) against a temporary fixture install. This is
// intentionally NOT mocked — the CLI call is cheap, offline, and carries no
// LLM/API cost. No real claude.exe and no real LLM/API call is ever made.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const AGENT_ID = 'gaia.agent.developer.backend';
const REL_PATH = '.claude/agents/gaia-developer-backend.md';

// verifyAgentIdentity caches resolved identities in a module-level Map with
// no TTL (see lib/task-executor/claude-process.js). Since Jest keeps one
// module instance per test file by default, that cache would otherwise leak
// across unrelated test cases (a later test could "see" an earlier test's
// fixture through the cache). jest.resetModules() + a fresh require before
// every test gives each test its own empty cache, matching a fresh process.
let verifyAgentIdentity;

beforeEach(() => {
  jest.resetModules();
  ({ verifyAgentIdentity } = require('../../lib/task-executor/claude-process'));
});

function sha256Of(content) {
  return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
}

function writeManifestJSON(rootDir, manifest) {
  const claudeDir = path.join(rootDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, '.ai-toolkit-manifest.json'), JSON.stringify(manifest, null, 2));
}

function writeAgentFile(installRoot, relPath, content) {
  const absPath = path.join(installRoot, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);
  return { absPath, sha256: sha256Of(Buffer.from(content)) };
}

// Builds a complete verified fixture install (manifest + agent file with a
// matching recorded hash) under a fresh project/home pair, and returns the
// options verifyAgentIdentity needs to resolve it.
function makeVerifiedFixture(tmpDir, content) {
  const projectDir = path.join(tmpDir, 'project');
  const fakeHome = path.join(tmpDir, 'home');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(fakeHome, { recursive: true });

  const { absPath, sha256 } = writeAgentFile(projectDir, REL_PATH, content);
  writeManifestJSON(projectDir, {
    version: '0.13.0',
    installedAt: new Date().toISOString(),
    installationMode: 'local',
    files: [REL_PATH],
    fileHashes: { [REL_PATH]: sha256 },
  });

  return { projectDir, fakeHome, absPath, sha256 };
}

describe('verifyAgentIdentity: input validation', () => {
  test('throws CLAUDE_PROCESS_VALIDATION_ERROR when projectDir is missing', () => {
    expect(() => verifyAgentIdentity({ agentId: AGENT_ID })).toThrow(
      expect.objectContaining({ code: 'CLAUDE_PROCESS_VALIDATION_ERROR' })
    );
  });

  test('throws CLAUDE_PROCESS_VALIDATION_ERROR when agentId is missing', () => {
    expect(() => verifyAgentIdentity({ projectDir: '/tmp/whatever' })).toThrow(
      expect.objectContaining({ code: 'CLAUDE_PROCESS_VALIDATION_ERROR' })
    );
  });
});

describe('verifyAgentIdentity: fails closed against the real CLI', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-identity-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('throws AGENT_NOT_VERIFIED when no toolkit installation is present', () => {
    const projectDir = path.join(tmpDir, 'project');
    const fakeHome = path.join(tmpDir, 'home');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(fakeHome, { recursive: true });

    expect(() =>
      verifyAgentIdentity({ projectDir, agentId: AGENT_ID, home: fakeHome, bypassCache: true })
    ).toThrow(expect.objectContaining({ code: 'AGENT_NOT_VERIFIED' }));
  });

  test('throws AGENT_NOT_VERIFIED for an unknown canonical agent ID', () => {
    const projectDir = path.join(tmpDir, 'project');
    const fakeHome = path.join(tmpDir, 'home');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(fakeHome, { recursive: true });

    expect(() =>
      verifyAgentIdentity({
        projectDir,
        agentId: 'unknown.agent.does-not-exist',
        home: fakeHome,
        bypassCache: true,
      })
    ).toThrow(expect.objectContaining({ code: 'AGENT_NOT_VERIFIED' }));
  });

  test('throws AGENT_NOT_VERIFIED when the on-disk hash does not match the manifest record', () => {
    const projectDir = path.join(tmpDir, 'project');
    const fakeHome = path.join(tmpDir, 'home');
    fs.mkdirSync(fakeHome, { recursive: true });
    writeAgentFile(projectDir, REL_PATH, '# gaia-developer-backend (tampered)\n');
    writeManifestJSON(projectDir, {
      version: '0.13.0',
      installedAt: new Date().toISOString(),
      installationMode: 'local',
      files: [REL_PATH],
      fileHashes: { [REL_PATH]: 'sha256:' + 'a'.repeat(64) }, // deliberately wrong
    });

    expect(() =>
      verifyAgentIdentity({ projectDir, agentId: AGENT_ID, home: fakeHome, bypassCache: true })
    ).toThrow(expect.objectContaining({ code: 'AGENT_NOT_VERIFIED' }));
  });
});

describe('verifyAgentIdentity: verified happy path against the real CLI', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-identity-happy-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns the resolved identity (nativeName/sha256/path/manifestPath/toolkitVersion/scope)', () => {
    const { projectDir, fakeHome, absPath, sha256 } = makeVerifiedFixture(
      tmpDir,
      '# gaia-developer-backend agent v0.13.0\n'
    );

    const identity = verifyAgentIdentity({
      projectDir,
      agentId: AGENT_ID,
      home: fakeHome,
      bypassCache: true,
    });

    expect(identity.agentId).toBe(AGENT_ID);
    expect(identity.nativeName).toBe('gaia-developer-backend');
    expect(identity.sha256).toBe(sha256);
    expect(identity.path).toBe(absPath);
    expect(identity.manifestPath).toBe(path.join(projectDir, '.claude', '.ai-toolkit-manifest.json'));
    expect(identity.toolkitVersion).toBe('0.13.0');
    expect(identity.scope).toBe('project');
  });
});

describe('verifyAgentIdentity: caching behavior', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-identity-cache-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('a cached identity is reused without needing the CLI/manifest to still be resolvable', () => {
    const { projectDir, fakeHome } = makeVerifiedFixture(tmpDir, '# gaia-developer-backend agent\n');

    // Prime the cache with a real, successful resolution.
    const first = verifyAgentIdentity({ projectDir, agentId: AGENT_ID, home: fakeHome });

    // Remove the manifest so a fresh CLI resolution would now fail — proves
    // the second call is served from cache, not by re-shelling-out.
    fs.rmSync(path.join(projectDir, '.claude', '.ai-toolkit-manifest.json'));

    const second = verifyAgentIdentity({ projectDir, agentId: AGENT_ID, home: fakeHome });
    expect(second).toEqual(first);
  });

  test('bypassCache forces a fresh CLI resolution that fails once the manifest is gone', () => {
    const { projectDir, fakeHome } = makeVerifiedFixture(tmpDir, '# gaia-developer-backend agent\n');

    verifyAgentIdentity({ projectDir, agentId: AGENT_ID, home: fakeHome });
    fs.rmSync(path.join(projectDir, '.claude', '.ai-toolkit-manifest.json'));

    expect(() =>
      verifyAgentIdentity({ projectDir, agentId: AGENT_ID, home: fakeHome, bypassCache: true })
    ).toThrow(expect.objectContaining({ code: 'AGENT_NOT_VERIFIED' }));
  });

  test('DEFINITION_HASH_MISMATCH: a cached identity is rejected once the file is modified after resolution (TOCTOU)', () => {
    const { projectDir, fakeHome, absPath } = makeVerifiedFixture(
      tmpDir,
      '# gaia-developer-backend agent (original)\n'
    );

    // Prime the cache with a real, successful resolution.
    verifyAgentIdentity({ projectDir, agentId: AGENT_ID, home: fakeHome });

    // Simulate a TOCTOU: the file on disk changes after resolution, without
    // updating the manifest hash.
    fs.writeFileSync(absPath, '# gaia-developer-backend agent (modified after resolution)\n');

    expect(() => verifyAgentIdentity({ projectDir, agentId: AGENT_ID, home: fakeHome })).toThrow(
      expect.objectContaining({ code: 'DEFINITION_HASH_MISMATCH' })
    );
  });
});


describe('control-plane identity regressions', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'identity-scope-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
  test.each(['gaia.orchestrator.feature.phase1', 'gaia.orchestrator.feature.phase3', 'pm-phase1', 'pm-phase3'])('rejects workflow identities before worker dispatch: %s', agentId => {
    expect(() => verifyAgentIdentity({ projectDir: dir, agentId })).toThrow(expect.objectContaining({ code: 'AGENT_NOT_VERIFIED' }));
  });
  test('a verified identity in one project cannot authorize an uninstalled second project', () => {
    const fixture = makeVerifiedFixture(dir, '# verified first project\n');
    verifyAgentIdentity({ projectDir: fixture.projectDir, home: fixture.fakeHome, agentId: AGENT_ID });
    const second = path.join(dir, 'second'); fs.mkdirSync(second);
    expect(() => verifyAgentIdentity({ projectDir: second, home: fixture.fakeHome, agentId: AGENT_ID })).toThrow(expect.objectContaining({ code: 'AGENT_NOT_VERIFIED' }));
  });
});
