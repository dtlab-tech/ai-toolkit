'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// doctor-resolution.test.js — unit tests for the `doctor resolution` CLI command
// US-07-TASK-BE-01 / FTR-015
//
// Strategy: spawn `node bin/cli.js doctor resolution --project <tmpProject>
//   --home <tmpHome>` for each scenario and assert on the captured stdout.
//
// Isolation: every test receives isolated tmpProject and tmpHome directories
// so the real ~/.claude/ is never consulted. All temporary directories are
// removed in afterEach.
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const cliPath = path.join(__dirname, '..', '..', 'bin', 'cli.js');

// ── CLI runner ─────────────────────────────────────────────────────────────────
// Uses process.execPath so the correct Node binary is invoked on all platforms.
function cli(argv) {
  return spawnSync(process.execPath, [cliPath, ...argv], { encoding: 'utf8' });
}

// ── Temp-dir pool ──────────────────────────────────────────────────────────────
const tmpDirs = [];

function mktmp(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dr-${label}-`));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpDirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

// ── Filesystem helpers ─────────────────────────────────────────────────────────

/** Write .ai-toolkit-manifest.json to <rootDir>/.claude/. content may be object or raw string. */
function putManifest(rootDir, content) {
  const claudeDir = path.join(rootDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  const raw = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  fs.writeFileSync(path.join(claudeDir, '.ai-toolkit-manifest.json'), raw, 'utf8');
}

/** Write .ai-toolkit-version stamp to <rootDir>/.claude/. */
function putVersionStamp(rootDir, version) {
  const claudeDir = path.join(rootDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, '.ai-toolkit-version'), version, 'utf8');
}

/** Create a file under <rootDir>/.claude/agents/<agentName>. */
function putAgentFile(rootDir, agentName, content) {
  const agentsDir = path.join(rootDir, '.claude', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(path.join(agentsDir, agentName), content || `# ${agentName}`, 'utf8');
}

/** Build a valid manifest object (installationMode = 'local' by default). */
function manifest(files, mode, version) {
  return {
    version:          version || '1.0.0',
    installedAt:      new Date().toISOString(),
    installationMode: mode || 'local',
    files:            files || [],
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('doctor resolution', () => {
  // ── Exit code ────────────────────────────────────────────────────────────────

  test('exits 0 when a single valid local installation is present', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putManifest(tmpProject, manifest(['.claude/agents/test.md'], 'local'));
    putAgentFile(tmpProject, 'test.md', '# test');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.status).toBe(0);
  });

  test('exits 0 even when both installations are present (AMBIGUOUS)', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putManifest(tmpProject, manifest([], 'local'));
    putManifest(tmpHome,    manifest([], 'global'));

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.status).toBe(0);
  });

  test('exits 0 when no installation is present', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.status).toBe(0);
  });

  // ── Mode detection ───────────────────────────────────────────────────────────

  test('reports local-only mode when only local installation is present', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putManifest(tmpProject, manifest(['.claude/agents/test.md'], 'local'));
    putAgentFile(tmpProject, 'test.md', '# test');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.stdout).toContain('local-only');
    expect(result.stdout).toContain('VALID');
  });

  test('reports global-only mode when only global installation is present', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putManifest(tmpHome, manifest(['.claude/agents/test.md'], 'global'));
    putAgentFile(tmpHome, 'test.md', '# test');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.stdout).toContain('global-only');
    expect(result.stdout).toContain('VALID');
  });

  test('reports both mode and AMBIGUOUS when both installations are present', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putManifest(tmpProject, manifest(['.claude/agents/test.md'], 'local'));
    putManifest(tmpHome,    manifest(['.claude/agents/test.md'], 'global'));
    putAgentFile(tmpProject, 'test.md', '# test');
    putAgentFile(tmpHome,    'test.md', '# test');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.stdout).toContain('both');
    expect(result.stdout).toContain('AMBIGUOUS');
  });

  test('reports none mode and NOT INSTALLED when no installation is present', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.stdout).toContain('none');
    expect(result.stdout).toContain('NOT INSTALLED');
  });

  // ── Presence via non-manifest signals ────────────────────────────────────────

  test('detects local installation via version stamp alone (no manifest)', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putVersionStamp(tmpProject, '1.0.0');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('local-only');
  });

  test('detects local installation via payload files alone (no manifest, no stamp)', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putAgentFile(tmpProject, 'something.md', '# agent');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('local-only');
  });

  // ── Installation Detection section ───────────────────────────────────────────

  test('shows local runtime path in Installation Detection section', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putManifest(tmpProject, manifest([], 'local'));

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.stdout).toContain('Local runtime present');
    expect(result.stdout).toContain(tmpProject);
  });

  test('shows global runtime path in Installation Detection section', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putManifest(tmpHome, manifest([], 'global'));

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.stdout).toContain('Global runtime present');
    expect(result.stdout).toContain(tmpHome);
  });

  // ── Manifest Consistency section ─────────────────────────────────────────────

  test('gracefully reports manifest as missing when only version stamp is present', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putVersionStamp(tmpProject, '1.0.0');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('missing');
  });

  test('gracefully reports manifest as corrupt when manifest contains invalid JSON', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putManifest(tmpProject, 'THIS IS NOT { VALID } JSON {{');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('corrupt');
  });

  test('reports manifest file count when manifest is present and valid', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putManifest(tmpProject, manifest(['.claude/agents/a.md', '.claude/agents/b.md'], 'local'));
    putAgentFile(tmpProject, 'a.md', '# a');
    putAgentFile(tmpProject, 'b.md', '# b');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Files:  2');
  });

  // ── Residual Assets section ──────────────────────────────────────────────────

  test('reports CLEAN when all category files are tracked in the manifest', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putManifest(tmpProject, manifest(['.claude/agents/test.md'], 'local'));
    putAgentFile(tmpProject, 'test.md', '# test');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('CLEAN');
  });

  test('reports WARNING and lists untracked files when residual assets are found', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    // Manifest tracks nothing; agent file exists → it is a residual
    putManifest(tmpProject, manifest([], 'local'));
    putAgentFile(tmpProject, 'orphan.md', '# orphan');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('WARNING');
    expect(result.stdout).toContain('orphan.md');
  });

  test('cannot determine residuals when manifest is missing', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putVersionStamp(tmpProject, '1.0.0');
    putAgentFile(tmpProject, 'some.md', '# some');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('cannot check residuals');
  });

  // ── Summary section ──────────────────────────────────────────────────────────

  test('reports READY in summary for a valid single-installation setup', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putManifest(tmpProject, manifest(['.claude/agents/test.md'], 'local'));
    putAgentFile(tmpProject, 'test.md', '# test');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.stdout).toContain('READY');
  });

  test('reports PROBLEMATIC in summary when both installations are present', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putManifest(tmpProject, manifest([], 'local'));
    putManifest(tmpHome,    manifest([], 'global'));

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.stdout).toContain('PROBLEMATIC');
  });

  test('reports PROBLEMATIC in summary when no installation is present', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.stdout).toContain('PROBLEMATIC');
  });

  // ── Toolkit Source section ───────────────────────────────────────────────────

  test('shows toolkit source directory in output', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    // Output includes "src" and "claude" from the source directory path
    expect(result.stdout).toContain('src');
    expect(result.stdout).toContain('claude');
  });

  // ── --home isolation ─────────────────────────────────────────────────────────

  test('--home override: real os.homedir() is not consulted', () => {
    const tmpProject   = mktmp('proj');
    const emptyTmpHome = mktmp('home');

    // Install globally only in a controlled tmpHome (not real ~/.claude/)
    putManifest(emptyTmpHome, manifest(['.claude/agents/g.md'], 'global'));
    putAgentFile(emptyTmpHome, 'g.md', '# global');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', emptyTmpHome]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('global-only');
    // Local should report not found
    expect(result.stdout).toContain('not found');
  });

  // ── Duplicate files section ──────────────────────────────────────────────────

  test('shows Duplicate Files section when both installations are present', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putManifest(tmpProject, manifest(['.claude/agents/shared.md'], 'local'));
    putManifest(tmpHome,    manifest(['.claude/agents/shared.md'], 'global'));
    putAgentFile(tmpProject, 'shared.md', '# same content');
    putAgentFile(tmpHome,    'shared.md', '# same content');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Duplicate Files');
    expect(result.stdout).toContain('shared.md');
  });

  // ── Action Items section ─────────────────────────────────────────────────────

  test('action items suggest running installer when no installation is found', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.stdout).toContain('No installation found');
  });

  test('action items warn about ambiguity when both installations are present', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putManifest(tmpProject, manifest([], 'local'));
    putManifest(tmpHome,    manifest([], 'global'));

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.stdout).toContain('ambiguity');
  });

  // ── Version stamp reporting ──────────────────────────────────────────────────

  test('reports local version stamp when present', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putManifest(tmpProject, manifest([], 'local'));
    putVersionStamp(tmpProject, '9.9.9');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('9.9.9');
  });
});
