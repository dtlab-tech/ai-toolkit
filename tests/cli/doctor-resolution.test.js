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

jest.setTimeout(60000);

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

  test('reports PROBLEMATIC for a partial installation (valid manifest + only one file)', () => {
    // Even with a valid manifest, disk completeness check requires all catalog files.
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    putManifest(tmpProject, manifest(['.claude/agents/test.md'], 'local'));
    putAgentFile(tmpProject, 'test.md', '# test');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.stdout).toContain('PROBLEMATIC');
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

  // ── Disk Completeness section ─────────────────────────────────────────────────

  test('reports INCOMPLETE in Disk Completeness section for a partial install', () => {
    const tmpProject = mktmp('proj');
    const tmpHome    = mktmp('home');

    // Only one agent file — catalog completeness check will fail.
    putManifest(tmpProject, manifest(['.claude/agents/test.md'], 'local'));
    putAgentFile(tmpProject, 'test.md', '# test');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.stdout).toContain('INCOMPLETE');
  });

  test('reports COMPLETE in Disk Completeness section for a fully valid install', () => {
    const tmpProject = mktmp('complete');
    const tmpHome    = mktmp('home-c');

    // Run the real installer so all catalog files are present.
    const { spawnSync } = require('child_process');
    spawnSync(
      process.execPath,
      [cliPath, '--local', tmpProject, '--force'],
      { encoding: 'utf8', cwd: path.join(__dirname, '..', '..') }
    );

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.stdout).toContain('COMPLETE');
    expect(result.stdout).toContain('READY');
  });

  test('action items list missing files when disk is incomplete', () => {
    const tmpProject = mktmp('incomplete');
    const tmpHome    = mktmp('home-i');

    putManifest(tmpProject, manifest(['.claude/agents/test.md'], 'local'));
    putAgentFile(tmpProject, 'test.md', '# test');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);

    expect(result.stdout).toMatch(/missing|incomplete/i);
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

  // ── installationMode consistency (P1-B) ──────────────────────────────────────

  test('reports PROBLEMATIC when manifest.installationMode does not match detected mode', () => {
    // Install real toolkit locally, then overwrite manifest with wrong installationMode.
    const tmpProject = mktmp('mode-mismatch');
    const tmpHome    = mktmp('home-mm');
    spawnSync(
      process.execPath,
      [cliPath, '--local', tmpProject, '--force'],
      { encoding: 'utf8', cwd: path.join(__dirname, '..', '..') }
    );
    // Overwrite installationMode to 'global' while the install is local.
    const manifestPath = path.join(tmpProject, '.claude', '.ai-toolkit-manifest.json');
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    m.installationMode = 'global';
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);
    expect(result.stdout).toContain('PROBLEMATIC');
    expect(result.stdout).toContain('installationMode');
  });

  test('action items mention installationMode mismatch', () => {
    const tmpProject = mktmp('mode-action');
    const tmpHome    = mktmp('home-ma');
    spawnSync(
      process.execPath,
      [cliPath, '--local', tmpProject, '--force'],
      { encoding: 'utf8', cwd: path.join(__dirname, '..', '..') }
    );
    const manifestPath = path.join(tmpProject, '.claude', '.ai-toolkit-manifest.json');
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    m.installationMode = 'global';
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);
    expect(result.stdout).toMatch(/installationMode.*does not match|does not match.*installationMode/i);
  });

  // ── manifest.files completeness (P1-B) ───────────────────────────────────────

  test('reports PROBLEMATIC when manifest.files is empty but disk is complete', () => {
    // Install real toolkit (disk complete), then set manifest.files = [].
    const tmpProject = mktmp('empty-files');
    const tmpHome    = mktmp('home-ef');
    spawnSync(
      process.execPath,
      [cliPath, '--local', tmpProject, '--force'],
      { encoding: 'utf8', cwd: path.join(__dirname, '..', '..') }
    );
    const manifestPath = path.join(tmpProject, '.claude', '.ai-toolkit-manifest.json');
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    m.files = [];
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);
    expect(result.stdout).toContain('PROBLEMATIC');
    expect(result.stdout).toMatch(/manifest\.files|missing.*catalog/i);
  });

  test('reports PROBLEMATIC when a single expected asset is missing from manifest.files', () => {
    // Install real toolkit, then remove one catalog asset from manifest.files.
    const tmpProject = mktmp('single-missing');
    const tmpHome    = mktmp('home-sm');
    spawnSync(
      process.execPath,
      [cliPath, '--local', tmpProject, '--force'],
      { encoding: 'utf8', cwd: path.join(__dirname, '..', '..') }
    );
    const manifestPath = path.join(tmpProject, '.claude', '.ai-toolkit-manifest.json');
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    // Drop the first catalog file from the manifest.files list.
    if (m.files.length > 0) m.files.splice(0, 1);
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);
    expect(result.stdout).toContain('PROBLEMATIC');
  });

  test('reports READY when manifest and disk are fully coherent (real install)', () => {
    // A fresh real install must produce READY without modification.
    const tmpProject = mktmp('coherent');
    const tmpHome    = mktmp('home-coh');
    spawnSync(
      process.execPath,
      [cliPath, '--local', tmpProject, '--force'],
      { encoding: 'utf8', cwd: path.join(__dirname, '..', '..') }
    );

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);
    expect(result.stdout).toContain('READY');
    expect(result.stdout).not.toContain('PROBLEMATIC');
  });

  test('recommendation is not "operational" when status is PROBLEMATIC', () => {
    // A manifest-only install without disk files → PROBLEMATIC.
    const tmpProject = mktmp('not-operational');
    const tmpHome    = mktmp('home-no');
    putManifest(tmpProject, manifest(['.claude/agents/test.md'], 'local'));
    putAgentFile(tmpProject, 'test.md', '# test');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);
    expect(result.stdout).toContain('PROBLEMATIC');
    expect(result.stdout).not.toContain('Installation is operational');
  });

  // ── manifest.files schema validation (P1) ────────────────────────────────────
  // A present manifest whose 'files' field is malformed must be reported as a
  // schema problem (PROBLEMATIC + repair recommendation) and must never crash the
  // doctor with an unhandled exception — the report stays read-only.

  /** Build a manifest with all required fields present but an arbitrary 'files' value. */
  function manifestWithFiles(filesValue) {
    return {
      version:          '1.0.0',
      installedAt:      new Date().toISOString(),
      installationMode: 'local',
      files:            filesValue,
    };
  }

  /** Assert the doctor ran cleanly (exit 0, no stack trace on stderr). */
  function expectNoCrash(result) {
    expect(result.status).toBe(0);
    expect(result.stderr || '').not.toMatch(/TypeError|is not a function|at Object|at runDoctorResolution/);
  }

  test('files as a string → PROBLEMATIC schema error (no crash)', () => {
    const tmpProject = mktmp('files-string');
    const tmpHome    = mktmp('home-fs');
    putManifest(tmpProject, manifestWithFiles('not-an-array'));

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);
    expectNoCrash(result);
    expect(result.stdout).toContain('PROBLEMATIC');
    expect(result.stdout).toMatch(/Manifest schema invalid.*'files'/);
    expect(result.stdout).not.toContain('Installation is operational');
  });

  test('files as an object → PROBLEMATIC schema error (no crash)', () => {
    const tmpProject = mktmp('files-object');
    const tmpHome    = mktmp('home-fo');
    putManifest(tmpProject, manifestWithFiles({ nope: true }));

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);
    expectNoCrash(result);
    expect(result.stdout).toContain('PROBLEMATIC');
    expect(result.stdout).toMatch(/Manifest schema invalid.*'files'/);
  });

  test('files as null → PROBLEMATIC schema error (no crash)', () => {
    const tmpProject = mktmp('files-null');
    const tmpHome    = mktmp('home-fn');
    putManifest(tmpProject, manifestWithFiles(null));

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);
    expectNoCrash(result);
    expect(result.stdout).toContain('PROBLEMATIC');
    expect(result.stdout).toMatch(/Manifest schema invalid.*'files'/);
  });

  test('files array containing a number → PROBLEMATIC schema error (no crash on .replace)', () => {
    const tmpProject = mktmp('files-number');
    const tmpHome    = mktmp('home-fnum');
    putManifest(tmpProject, manifestWithFiles(['.claude/agents/test.md', 123]));
    putAgentFile(tmpProject, 'test.md', '# test');

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);
    expectNoCrash(result);
    expect(result.stdout).toContain('PROBLEMATIC');
    expect(result.stdout).toMatch(/Manifest schema invalid.*files\[1\].*string/);
  });

  test('files array containing an empty string → PROBLEMATIC schema error (no crash)', () => {
    const tmpProject = mktmp('files-empty');
    const tmpHome    = mktmp('home-fe');
    putManifest(tmpProject, manifestWithFiles(['']));

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);
    expectNoCrash(result);
    expect(result.stdout).toContain('PROBLEMATIC');
    expect(result.stdout).toMatch(/Manifest schema invalid.*files\[0\].*empty/);
  });

  test('files array with a path-traversal entry → PROBLEMATIC schema error (no crash)', () => {
    const tmpProject = mktmp('files-traversal');
    const tmpHome    = mktmp('home-ft');
    putManifest(tmpProject, manifestWithFiles(['../../etc/passwd']));

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);
    expectNoCrash(result);
    expect(result.stdout).toContain('PROBLEMATIC');
    expect(result.stdout).toMatch(/Manifest schema invalid.*'\.\.'|escapes the installation root/);
  });

  test('valid, coherent files array (real install) → READY, no schema error', () => {
    const tmpProject = mktmp('files-valid');
    const tmpHome    = mktmp('home-fv');
    spawnSync(
      process.execPath,
      [cliPath, '--local', tmpProject, '--force'],
      { encoding: 'utf8', cwd: path.join(__dirname, '..', '..') }
    );

    const result = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);
    expectNoCrash(result);
    expect(result.stdout).toContain('READY');
    expect(result.stdout).not.toContain('Manifest schema invalid');
  });

  test('fresh install then manifest paths converted / → \\ → PROBLEMATIC, not operational', () => {
    const tmpProject = mktmp('files-backslash');
    const tmpHome    = mktmp('home-fb');
    // 1. Fresh, real local install (produces a coherent forward-slash manifest).
    spawnSync(
      process.execPath,
      [cliPath, '--local', tmpProject, '--force'],
      { encoding: 'utf8', cwd: path.join(__dirname, '..', '..') }
    );

    // Sanity: the untouched install is READY.
    const before = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);
    expect(before.stdout).toContain('READY');

    // 2. Convert every '/' in each manifest 'files' entry to '\'.
    const manifestPath = path.join(tmpProject, '.claude', '.ai-toolkit-manifest.json');
    const manifest     = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files     = manifest.files.map(f => f.replace(/\//g, '\\'));
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    // 3. Doctor must flag the incoherent manifest — never declare it operational.
    const after = cli(['doctor', 'resolution', '--project', tmpProject, '--home', tmpHome]);
    expectNoCrash(after);
    expect(after.stdout).toContain('PROBLEMATIC');
    expect(after.stdout).toMatch(/Manifest schema invalid.*is not canonical/);
    expect(after.stdout).not.toContain('Installation is operational');
  });
});
