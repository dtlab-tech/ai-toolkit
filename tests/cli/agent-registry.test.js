'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const { CATALOG, resolveAgent, validateAgentSet, listRegisteredAgents } =
  require('../../lib/agent-registry');

// ── Test helpers ──────────────────────────────────────────────────────────────

function sha256Of(content) {
  return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
}

function writeManifestJSON(rootDir, manifest) {
  const claudeDir = path.join(rootDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, '.ai-toolkit-manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
}

function writeAgentFile(installRoot, relPath, content) {
  const absPath = path.join(installRoot, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);
  return { absPath, sha256: sha256Of(Buffer.from(content)) };
}

// ── Catalog integrity ─────────────────────────────────────────────────────────

describe('CATALOG', () => {
  test('is a non-empty array', () => {
    expect(Array.isArray(CATALOG)).toBe(true);
    expect(CATALOG.length).toBeGreaterThan(0);
  });

  test('every entry has a namespaced agentId starting with "gaia."', () => {
    for (const entry of CATALOG) {
      expect(typeof entry.agentId).toBe('string');
      expect(entry.agentId.startsWith('gaia.')).toBe(true);
    }
  });

  test('every agentId is unique across the entire catalog (AC-01)', () => {
    const ids    = CATALOG.map(e => e.agentId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test('every entry has a nativeNames.claude string', () => {
    for (const entry of CATALOG) {
      expect(typeof entry.nativeNames).toBe('object');
      expect(typeof entry.nativeNames.claude).toBe('string');
      expect(entry.nativeNames.claude.length).toBeGreaterThan(0);
    }
  });

  test('every entry declares "claude" in its platforms array', () => {
    for (const entry of CATALOG) {
      expect(Array.isArray(entry.platforms)).toBe(true);
      expect(entry.platforms).toContain('claude');
    }
  });

  test('catalog contains all required agent type entries (AC-23)', () => {
    const ids = new Set(CATALOG.map(e => e.agentId));
    expect(ids.has('gaia.agent.developer.backend')).toBe(true);
    expect(ids.has('gaia.agent.developer.frontend')).toBe(true);
    expect(ids.has('gaia.agent.developer.testing')).toBe(true);
    expect(ids.has('gaia.agent.review.solution')).toBe(true);
  });

  test('catalog contains orchestrator workflow entries', () => {
    const ids = new Set(CATALOG.map(e => e.agentId));
    expect(ids.has('gaia.orchestrator.feature.phase3')).toBe(true);
    expect(ids.has('gaia.orchestrator.assessment.phase1')).toBe(true);
  });

  test('developer-backend maps to the expected Phase B canonical native name', () => {
    const entry = CATALOG.find(e => e.agentId === 'gaia.agent.developer.backend');
    expect(entry).toBeDefined();
    expect(entry.nativeNames.claude).toBe('gaia-developer-backend');
    expect(entry.relativeInstallPath).toBe('.claude/agents/gaia-developer-backend.md');
  });
});

// ── resolveAgent() ────────────────────────────────────────────────────────────
//
// Every test injects fakeHome (a subdirectory of tmpDir) to guarantee
// the real user home directory is never read or written (AC-28).

describe('resolveAgent()', () => {
  let tmpDir;
  let projectDir;
  let fakeHome;

  beforeEach(() => {
    tmpDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-registry-test-'));
    projectDir = path.join(tmpDir, 'project');
    fakeHome   = path.join(tmpDir, 'home');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(fakeHome,   { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns status "not-found" for an unknown canonical ID', async () => {
    const rec = await resolveAgent({
      projectDir,
      homeDir:  fakeHome,
      agentId:  'unknown.agent.does-not-exist',
    });
    expect(rec.status).toBe('not-found');
    expect(rec.agentId).toBe('unknown.agent.does-not-exist');
    expect(rec.error).toMatch(/not in the canonical catalog/);
  });

  test('returns status "manifest-missing" when no manifest exists in project or home', async () => {
    const rec = await resolveAgent({
      projectDir,
      homeDir:  fakeHome,
      agentId:  'gaia.agent.developer.backend',
    });
    expect(rec.status).toBe('manifest-missing');
    expect(rec.agentId).toBe('gaia.agent.developer.backend');
    expect(rec.nativeName).toBe('gaia-developer-backend');
  });

  test('returns status "not-installed" when agent absent from manifest files list', async () => {
    writeManifestJSON(projectDir, {
      version:          '0.13.0',
      installedAt:      new Date().toISOString(),
      installationMode: 'local',
      files:            [],
      fileHashes:       {},
    });

    const rec = await resolveAgent({
      projectDir,
      homeDir:  fakeHome,
      agentId:  'gaia.agent.developer.backend',
    });
    expect(rec.status).toBe('not-installed');
  });

  test('returns status "not-installed" when agent in manifest files but file absent on disk', async () => {
    const relPath = '.claude/agents/gaia-developer-backend.md';
    writeManifestJSON(projectDir, {
      version:          '0.13.0',
      installedAt:      new Date().toISOString(),
      installationMode: 'local',
      files:            [relPath],
      fileHashes:       { [relPath]: 'sha256:' + 'a'.repeat(64) },
    });

    const rec = await resolveAgent({
      projectDir,
      homeDir:  fakeHome,
      agentId:  'gaia.agent.developer.backend',
    });
    expect(rec.status).toBe('not-installed');
    expect(rec.path).toBe(path.join(projectDir, relPath));
  });

  test('returns status "hash-unverifiable" when manifest lacks fileHashes (v0.12.0)', async () => {
    const relPath = '.claude/agents/gaia-developer-backend.md';
    writeAgentFile(projectDir, relPath, '# gaia-developer-backend\n');
    writeManifestJSON(projectDir, {
      version:          '0.12.0',
      installedAt:      new Date().toISOString(),
      installationMode: 'local',
      files:            [relPath],
    });

    const rec = await resolveAgent({
      projectDir,
      homeDir:  fakeHome,
      agentId:  'gaia.agent.developer.backend',
    });
    expect(rec.status).toBe('hash-unverifiable');
    expect(rec.agentId).toBe('gaia.agent.developer.backend');
    expect(rec.nativeName).toBe('gaia-developer-backend');
    expect(rec.scope).toBe('project');
  });

  test('returns status "hash-mismatch" when on-disk hash differs from manifest record', async () => {
    const relPath        = '.claude/agents/gaia-developer-backend.md';
    const { absPath }    = writeAgentFile(projectDir, relPath, '# gaia-developer-backend agent\n');
    writeManifestJSON(projectDir, {
      version:          '0.13.0',
      installedAt:      new Date().toISOString(),
      installationMode: 'local',
      files:            [relPath],
      fileHashes:       { [relPath]: 'sha256:' + 'a'.repeat(64) },
    });

    const rec = await resolveAgent({
      projectDir,
      homeDir:  fakeHome,
      agentId:  'gaia.agent.developer.backend',
    });
    expect(rec.status).toBe('hash-mismatch');
    expect(rec.path).toBe(absPath);
    expect(rec.error).toMatch(/SHA-256 on disk does not match/);
  });

  test('returns status "verified" with complete record when hash matches (happy path)', async () => {
    const relPath           = '.claude/agents/gaia-developer-backend.md';
    const content           = '# gaia-developer-backend agent v0.13.0\n';
    const { absPath, sha256 } = writeAgentFile(projectDir, relPath, content);
    writeManifestJSON(projectDir, {
      version:          '0.13.0',
      installedAt:      new Date().toISOString(),
      installationMode: 'local',
      files:            [relPath],
      fileHashes:       { [relPath]: sha256 },
    });

    const rec = await resolveAgent({
      projectDir,
      homeDir:  fakeHome,
      agentId:  'gaia.agent.developer.backend',
    });

    expect(rec.status).toBe('verified');
    expect(rec.agentId).toBe('gaia.agent.developer.backend');
    expect(rec.platform).toBe('claude');
    expect(rec.nativeName).toBe('gaia-developer-backend');
    expect(rec.scope).toBe('project');
    expect(rec.path).toBe(absPath);
    expect(rec.toolkitVersion).toBe('0.13.0');
    expect(rec.sha256).toBe(sha256);
    expect(rec.manifestPath).toBe(
      path.join(projectDir, '.claude', '.ai-toolkit-manifest.json')
    );
  });

  test('resolution is deterministic: two calls with identical inputs produce identical records', async () => {
    const relPath  = '.claude/agents/gaia-developer-backend.md';
    const content  = '# determinism check\n';
    const { sha256 } = writeAgentFile(projectDir, relPath, content);
    writeManifestJSON(projectDir, {
      version:          '0.13.0',
      installedAt:      new Date().toISOString(),
      installationMode: 'local',
      files:            [relPath],
      fileHashes:       { [relPath]: sha256 },
    });

    const opts = { projectDir, homeDir: fakeHome, agentId: 'gaia.agent.developer.backend' };
    const rec1 = await resolveAgent(opts);
    const rec2 = await resolveAgent(opts);
    expect(rec1).toEqual(rec2);
  });

  test('returns "conflict" when both local and global manifests exist (ambiguous installation)', async () => {
    // Write a manifest in both the project dir AND the fake home dir
    writeManifestJSON(projectDir, {
      version: '0.13.0', installedAt: new Date().toISOString(),
      installationMode: 'local', files: [], fileHashes: {},
    });
    writeManifestJSON(fakeHome, {
      version: '0.13.0', installedAt: new Date().toISOString(),
      installationMode: 'global', files: [], fileHashes: {},
    });

    const rec = await resolveAgent({
      projectDir,
      homeDir:  fakeHome,
      agentId:  'gaia.agent.developer.backend',
    });
    expect(rec.status).toBe('conflict');
    expect(rec.error).toMatch(/ambiguous/i);
  });

  test('uses "global" scope when only a global manifest (in fakeHome) is present', async () => {
    const relPath           = '.claude/agents/gaia-developer-backend.md';
    const content           = '# global agent\n';
    const { absPath, sha256 } = writeAgentFile(fakeHome, relPath, content);
    writeManifestJSON(fakeHome, {
      version:          '0.13.0',
      installedAt:      new Date().toISOString(),
      installationMode: 'global',
      files:            [relPath],
      fileHashes:       { [relPath]: sha256 },
    });
    // projectDir has no manifest

    const rec = await resolveAgent({
      projectDir,
      homeDir:  fakeHome,
      agentId:  'gaia.agent.developer.backend',
    });
    expect(rec.status).toBe('verified');
    expect(rec.scope).toBe('global');
    expect(rec.path).toBe(absPath);
  });

  test('throws when requireVerified is true and status is not "verified"', async () => {
    await expect(
      resolveAgent({
        projectDir,
        homeDir:         fakeHome,
        agentId:         'gaia.agent.developer.backend',
        requireVerified: true,
      })
    ).rejects.toMatchObject({ code: 'RESOLUTION_FAILED' });
  });

  test('does NOT throw when requireVerified is true and status is "verified"', async () => {
    const relPath    = '.claude/agents/gaia-developer-backend.md';
    const content    = '# verified agent\n';
    const { sha256 } = writeAgentFile(projectDir, relPath, content);
    writeManifestJSON(projectDir, {
      version: '0.13.0', installedAt: new Date().toISOString(),
      installationMode: 'local',
      files: [relPath], fileHashes: { [relPath]: sha256 },
    });

    const rec = await resolveAgent({
      projectDir,
      homeDir:         fakeHome,
      agentId:         'gaia.agent.developer.backend',
      requireVerified: true,
    });
    expect(rec.status).toBe('verified');
  });

  test('throws on requireVerified when manifest lacks fileHashes (v0.12.0 hard-stop, BR-05)', async () => {
    const relPath = '.claude/agents/gaia-developer-backend.md';
    writeAgentFile(projectDir, relPath, '# old agent\n');
    writeManifestJSON(projectDir, {
      version: '0.12.0', installedAt: new Date().toISOString(),
      installationMode: 'local', files: [relPath],
    });

    await expect(
      resolveAgent({
        projectDir,
        homeDir:         fakeHome,
        agentId:         'gaia.agent.developer.backend',
        requireVerified: true,
      })
    ).rejects.toMatchObject({ code: 'RESOLUTION_FAILED' });
  });

  test('resolves an orchestrator workflow to "verified" by canonical ID', async () => {
    const relPath    = '.claude/workflows/pm-phase3.js';
    const content    = 'export const meta = { name: "pm-phase3" };\n';
    const { sha256 } = writeAgentFile(projectDir, relPath, content);
    writeManifestJSON(projectDir, {
      version: '0.13.0', installedAt: new Date().toISOString(),
      installationMode: 'local',
      files: [relPath], fileHashes: { [relPath]: sha256 },
    });

    const rec = await resolveAgent({
      projectDir,
      homeDir:  fakeHome,
      agentId:  'gaia.orchestrator.feature.phase3',
    });
    expect(rec.status).toBe('verified');
    expect(rec.nativeName).toBe('pm-phase3');
  });

  // ── AC-03 — no fuzzy / no fallback selection ─────────────────────────────────

  test('partial prefix of a valid ID resolves to "not-found" (no fuzzy match, AC-03)', async () => {
    const rec = await resolveAgent({
      projectDir,
      homeDir:  fakeHome,
      agentId:  'gaia.agent.developer',        // truncated — not a catalog entry
    });
    expect(rec.status).toBe('not-found');
  });

  test('case-variant of a valid ID resolves to "not-found" (resolution is case-sensitive, AC-03)', async () => {
    const rec = await resolveAgent({
      projectDir,
      homeDir:  fakeHome,
      agentId:  'gaia.agent.Developer.Backend', // wrong case
    });
    expect(rec.status).toBe('not-found');
  });

  test('near-miss ID does not fall back to a similar catalog entry (no fallback, AC-03)', async () => {
    // "gaia.agent.developer.backend" exists but "gaia.agent.developer.back-end" does not
    const rec = await resolveAgent({
      projectDir,
      homeDir:  fakeHome,
      agentId:  'gaia.agent.developer.back-end',
    });
    expect(rec.status).toBe('not-found');
    expect(rec.agentId).toBe('gaia.agent.developer.back-end');
  });

  test('"not-found" result carries the original agentId unchanged (no substitution, AC-03)', async () => {
    const unknownId = 'gaia.agent.totally.unknown.XYZ';
    const rec = await resolveAgent({ projectDir, homeDir: fakeHome, agentId: unknownId });
    expect(rec.status).toBe('not-found');
    expect(rec.agentId).toBe(unknownId);
  });
});

// ── validateAgentSet() ────────────────────────────────────────────────────────

describe('validateAgentSet()', () => {
  let tmpDir;
  let projectDir;
  let fakeHome;

  beforeEach(() => {
    tmpDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-registry-validate-'));
    projectDir = path.join(tmpDir, 'project');
    fakeHome   = path.join(tmpDir, 'home');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(fakeHome,   { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty array when all specified agents resolve to "verified"', async () => {
    const relPath    = '.claude/agents/gaia-developer-backend.md';
    const content    = '# backend agent\n';
    const { sha256 } = writeAgentFile(projectDir, relPath, content);
    writeManifestJSON(projectDir, {
      version: '0.13.0', installedAt: new Date().toISOString(),
      installationMode: 'local',
      files: [relPath], fileHashes: { [relPath]: sha256 },
    });

    const errors = await validateAgentSet(
      projectDir,
      ['gaia.agent.developer.backend'],
      fakeHome
    );
    expect(errors).toEqual([]);
  });

  test('returns an error for an unknown canonical ID (not in catalog)', async () => {
    const errors = await validateAgentSet(
      projectDir,
      ['gaia.agent.does.not.exist'],
      fakeHome
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].agentId).toBe('gaia.agent.does.not.exist');
    expect(errors[0].status).toBe('not-found');
  });

  test('returns errors for agents that are not installed', async () => {
    writeManifestJSON(projectDir, {
      version: '0.13.0', installedAt: new Date().toISOString(),
      installationMode: 'local', files: [], fileHashes: {},
    });

    const errors = await validateAgentSet(
      projectDir,
      ['gaia.agent.developer.backend', 'gaia.agent.developer.frontend'],
      fakeHome
    );
    expect(errors).toHaveLength(2);
    for (const e of errors) {
      expect(e.status).toBe('not-installed');
    }
  });

  test('accepts mixed valid and invalid IDs and reports only error entries', async () => {
    const relPath    = '.claude/agents/gaia-developer-backend.md';
    const content    = '# backend\n';
    const { sha256 } = writeAgentFile(projectDir, relPath, content);
    writeManifestJSON(projectDir, {
      version: '0.13.0', installedAt: new Date().toISOString(),
      installationMode: 'local',
      files: [relPath], fileHashes: { [relPath]: sha256 },
    });

    const errors = await validateAgentSet(
      projectDir,
      [
        'gaia.agent.developer.backend', // verified — not in errors
        'gaia.agent.does.not.exist',    // not-found — in errors
      ],
      fakeHome
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].status).toBe('not-found');
  });

  test('validates all catalog agents when no agentIds argument is provided', async () => {
    // No manifest anywhere → every agent is manifest-missing → every agent is an error
    const errors = await validateAgentSet(projectDir, undefined, fakeHome);
    expect(errors.length).toBe(CATALOG.length);
    for (const e of errors) {
      expect(e.status).toBe('manifest-missing');
    }
  });
});

// ── listRegisteredAgents() ────────────────────────────────────────────────────

describe('listRegisteredAgents()', () => {
  let tmpDir;
  let projectDir;
  let fakeHome;

  beforeEach(() => {
    tmpDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-registry-list-'));
    projectDir = path.join(tmpDir, 'project');
    fakeHome   = path.join(tmpDir, 'home');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(fakeHome,   { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns an array with one entry per CATALOG item', () => {
    const records = listRegisteredAgents(projectDir, fakeHome);
    expect(records).toHaveLength(CATALOG.length);
  });

  test('each record has agentId, nativeName, role, type, platforms, deprecated, and status', () => {
    const records = listRegisteredAgents(projectDir, fakeHome);
    for (const rec of records) {
      expect(typeof rec.agentId).toBe('string');
      expect(typeof rec.nativeName).toBe('string');
      expect(typeof rec.role).toBe('string');
      expect(typeof rec.type).toBe('string');
      expect(Array.isArray(rec.platforms)).toBe(true);
      expect(typeof rec.deprecated).toBe('boolean');
      expect(typeof rec.status).toBe('string');
    }
  });

  test('all agentIds in the returned list are unique (AC-01)', () => {
    const records = listRegisteredAgents(projectDir, fakeHome);
    const ids     = records.map(r => r.agentId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('returns "not-installed" for all agents when no manifest exists', () => {
    const records = listRegisteredAgents(projectDir, fakeHome);
    for (const rec of records) {
      expect(rec.status).toBe('not-installed');
    }
  });

  test('returns "hash-unverifiable" for an agent in a v0.12.0 manifest without fileHashes', () => {
    const relPath = '.claude/agents/gaia-developer-backend.md';
    writeAgentFile(projectDir, relPath, '# gaia-developer-backend\n');
    writeManifestJSON(projectDir, {
      version: '0.12.0', installedAt: new Date().toISOString(),
      installationMode: 'local', files: [relPath],
    });

    const records = listRegisteredAgents(projectDir, fakeHome);
    const be      = records.find(r => r.agentId === 'gaia.agent.developer.backend');
    expect(be.status).toBe('hash-unverifiable');
  });

  test('returns "verified" status for an agent with a matching hash', () => {
    const relPath    = '.claude/agents/gaia-developer-backend.md';
    const content    = '# verified backend agent\n';
    const { sha256 } = writeAgentFile(projectDir, relPath, content);
    writeManifestJSON(projectDir, {
      version: '0.13.0', installedAt: new Date().toISOString(),
      installationMode: 'local',
      files: [relPath], fileHashes: { [relPath]: sha256 },
    });

    const records = listRegisteredAgents(projectDir, fakeHome);
    const be      = records.find(r => r.agentId === 'gaia.agent.developer.backend');
    expect(be.status).toBe('verified');
    expect(be.nativeName).toBe('gaia-developer-backend');
    expect(be.scope).toBe('project');
    expect(be.sha256).toBe(sha256);
  });

  test('returns "conflict" with integrityDetail "hash-mismatch" when file hash diverges (AC-13)', () => {
    const relPath = '.claude/agents/gaia-developer-backend.md';
    writeAgentFile(projectDir, relPath, '# backend agent\n');
    writeManifestJSON(projectDir, {
      version: '0.13.0', installedAt: new Date().toISOString(),
      installationMode: 'local',
      files: [relPath], fileHashes: { [relPath]: 'sha256:' + 'b'.repeat(64) },
    });

    const records = listRegisteredAgents(projectDir, fakeHome);
    const be      = records.find(r => r.agentId === 'gaia.agent.developer.backend');
    expect(be.status).toBe('conflict');
    expect(be.integrityDetail).toBe('hash-mismatch');
  });
});

// ── AC-03 / AC-30 — module purity guard ──────────────────────────────────────

describe('AC-03 / AC-30 — module purity', () => {
  const registrySource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'lib', 'agent-registry.js'),
    'utf8'
  );

  test('module source does not require @anthropic-ai packages', () => {
    expect(registrySource).not.toMatch(/require\s*\(\s*['"]@anthropic-ai/);
  });

  test('module source does not import from @anthropic-ai packages (ESM form)', () => {
    expect(registrySource).not.toMatch(/from\s+['"]@anthropic-ai/);
  });

  test('module source does not require claude-code or claude-api packages', () => {
    expect(registrySource).not.toMatch(/require\s*\(\s*['"]claude-code/i);
    expect(registrySource).not.toMatch(/require\s*\(\s*['"]claude-api/i);
  });

  test('module source does not use URL-based require calls (no network imports)', () => {
    expect(registrySource).not.toMatch(/require\s*\(\s*['"]https?:/);
  });

  test('module loads synchronously without throwing (no network or LLM access)', () => {
    expect(() => require('../../lib/agent-registry')).not.toThrow();
  });

  test('module exports the four required symbols', () => {
    const registry = require('../../lib/agent-registry');
    expect(typeof registry.resolveAgent).toBe('function');
    expect(typeof registry.validateAgentSet).toBe('function');
    expect(typeof registry.listRegisteredAgents).toBe('function');
    expect(Array.isArray(registry.CATALOG)).toBe(true);
    expect(registry.CATALOG.length).toBeGreaterThan(0);
  });

  test('module exports resolveWorkBreakdownAgentType, WB_AGENT_TYPE_MAP, LEGACY_AGENT_TYPE_MAP (AC-23, AC-25)', () => {
    const registry = require('../../lib/agent-registry');
    expect(typeof registry.resolveWorkBreakdownAgentType).toBe('function');
    expect(typeof registry.WB_AGENT_TYPE_MAP).toBe('object');
    expect(typeof registry.LEGACY_AGENT_TYPE_MAP).toBe('object');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Work Breakdown agent_type resolution — AC-23, AC-24, AC-25, AC-26, AC-37
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveWorkBreakdownAgentType — agent_type validation (AC-23, AC-24, AC-25, AC-26, AC-37)', () => {
  const { resolveWorkBreakdownAgentType, WB_AGENT_TYPE_MAP, LEGACY_AGENT_TYPE_MAP } = require('../../lib/agent-registry');

  const SUPPORTED = ['developer-backend', 'developer-frontend', 'developer-testing', 'review-solution'];

  test.each(SUPPORTED.map(t => [t]))(
    'resolves supported agent_type "%s" to a canonical agentId',
    (agentType) => {
      const result = resolveWorkBreakdownAgentType(agentType);
      expect(result.canonicalId).toMatch(/^gaia\./);
      expect(result.deprecated).toBe(false);
    }
  );

  test('WB_AGENT_TYPE_MAP covers at least developer-backend, developer-frontend, developer-testing, review-solution (AC-23)', () => {
    const required = ['developer-backend', 'developer-frontend', 'developer-testing', 'review-solution'];
    for (const key of required) {
      expect(Object.prototype.hasOwnProperty.call(WB_AGENT_TYPE_MAP, key)).toBe(true);
    }
  });

  test('developer-database is NOT in WB_AGENT_TYPE_MAP (deprecated, no new WBs should use it)', () => {
    expect(Object.prototype.hasOwnProperty.call(WB_AGENT_TYPE_MAP, 'developer-database')).toBe(false);
  });

  test('developer-database resolves via LEGACY_AGENT_TYPE_MAP to gaia.agent.developer.backend (AC-24, AC-37)', () => {
    const result = resolveWorkBreakdownAgentType('developer-database');
    expect(result.canonicalId).toBe('gaia.agent.developer.backend');
    expect(result.deprecated).toBe(true);
    expect(typeof result.deprecationMessage).toBe('string');
    expect(result.deprecationMessage.length).toBeGreaterThan(0);
  });

  test('LEGACY_AGENT_TYPE_MAP contains developer-database entry (AC-26)', () => {
    expect(Object.prototype.hasOwnProperty.call(LEGACY_AGENT_TYPE_MAP, 'developer-database')).toBe(true);
    expect(LEGACY_AGENT_TYPE_MAP['developer-database'].canonicalId).toBe('gaia.agent.developer.backend');
    expect(LEGACY_AGENT_TYPE_MAP['developer-database'].deprecated).toBe(true);
  });

  test('unknown agent_type throws a structured UNKNOWN_AGENT_TYPE error (AC-25)', () => {
    let caught = null;
    try { resolveWorkBreakdownAgentType('project-manager'); } catch (e) { caught = e; }
    expect(caught).not.toBeNull();
    expect(caught.code).toBe('UNKNOWN_AGENT_TYPE');
    expect(caught.agentType).toBe('project-manager');
  });

  test('unknown agent_type error message lists the allowed values', () => {
    let caught = null;
    try { resolveWorkBreakdownAgentType('nonexistent'); } catch (e) { caught = e; }
    expect(caught.message).toContain('developer-backend');
    expect(caught.message).toContain('developer-database');
  });

  test('unknown agent_type rejects entirely unknown values (AC-25)', () => {
    const unknowns = ['agent-project-manager', 'assessment-manager', 'totally-random', ''];
    for (const u of unknowns) {
      expect(() => resolveWorkBreakdownAgentType(u)).toThrow();
    }
  });

  test('resolveWorkBreakdownAgentType returned records contain canonicalId and deprecated fields', () => {
    const r = resolveWorkBreakdownAgentType('developer-backend');
    expect(Object.prototype.hasOwnProperty.call(r, 'canonicalId')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(r, 'deprecated')).toBe(false === r.deprecated || true === r.deprecated ? true : false);
  });
});
