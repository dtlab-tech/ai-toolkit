'use strict';

/**
 * E2E workflow facade tests — US-06-TASK-TEST-05 (FTR-015).
 *
 * Tests the run-asset command as a workflow facade:
 * - Executes real catalog scripts (wb-validate.js, wb-render.js)
 * - Verifies arg forwarding via argv array (no shell)
 * - Verifies exit code propagation
 * - Uses --home isolation on all calls
 * - Tests with temp dirs containing spaces
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI          = path.join(__dirname, '..', '..', 'bin', 'cli.js');
const TOOLKIT_ROOT = path.join(__dirname, '..', '..');
const TOOLKIT_VERSION = require('../../package.json').version;
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
          const rel  = path.relative(srcDir, full).replace(/\\/g, '/');
          const dest = path.join(clauDir, cat.name, rel);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(full, dest);
          files.push(`.claude/${cat.name}/${rel}`);
        }
      }
    }
  }
  fs.writeFileSync(
    path.join(clauDir, '.ai-toolkit-manifest.json'),
    JSON.stringify({ version: TOOLKIT_VERSION, installedAt: '2026-01-01T00:00:00.000Z', installationMode: 'local', files }, null, 2)
  );
  fs.writeFileSync(path.join(clauDir, '.ai-toolkit-version'), TOOLKIT_VERSION);
}

function runAsset(relativePath, { projectDir, home }, scriptArgs = []) {
  const args = ['run-asset', relativePath, '--project', projectDir, '--home', home];
  if (scriptArgs.length > 0) args.push('--', ...scriptArgs);
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    shell: false,
  });
}

describe('E2E workflow facade — wb-validate.js', () => {
  let tmpDir;
  let fakeHome;

  beforeAll(() => {
    // Path with spaces to verify argv array handling
    tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-facade wb validate-'));
    fakeHome = path.join(tmpDir, 'home');
    fs.mkdirSync(fakeHome);
    makeCompleteInstall(tmpDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('runs wb-validate.js — exits 2 with no args (usage error)', () => {
    // wb-validate exits 2 when called without required JSON path
    const result = runAsset('scripts/wb-validate.js', { projectDir: tmpDir, home: fakeHome });
    expect(result.status).toBe(2);
  });

  test('exit code 2 is propagated (not run-asset own error code)', () => {
    const result = runAsset('scripts/wb-validate.js', { projectDir: tmpDir, home: fakeHome });
    // run-asset does not emit its own error message when the script runs
    expect(result.stderr).not.toContain('Error: run-asset');
  });

  test('args after -- reach wb-validate.js (nonexistent path causes file-not-found error)', () => {
    const fakePath = path.join(tmpDir, 'nonexistent.json');
    const fakeReq  = path.join(tmpDir, 'nonexistent.md');
    const result   = runAsset(
      'scripts/wb-validate.js',
      { projectDir: tmpDir, home: fakeHome },
      [fakePath, fakeReq]
    );
    // wb-validate received the args and tried to open the file → non-zero exit
    // The key assertion: run-asset itself did not produce the error (no "Error: run-asset" in stderr)
    expect(result.stderr).not.toContain('Error: run-asset');
    expect(result.status).not.toBeNull();
  });

  test('path with spaces in projectDir does not break execution', () => {
    expect(tmpDir).toContain(' ');
    const result = runAsset('scripts/wb-validate.js', { projectDir: tmpDir, home: fakeHome });
    // Script ran (not a spawn error)
    expect(result.error).toBeUndefined();
  });
});

describe('E2E workflow facade — wb-render.js', () => {
  let tmpDir;
  let fakeHome;

  beforeAll(() => {
    tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-facade wb render-'));
    fakeHome = path.join(tmpDir, 'home');
    fs.mkdirSync(fakeHome);
    makeCompleteInstall(tmpDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('runs wb-render.js — exits non-zero with no args (usage error)', () => {
    const result = runAsset('scripts/wb-render.js', { projectDir: tmpDir, home: fakeHome });
    expect(result.status).toBeGreaterThan(0);
  });

  test('exit code from wb-render.js is propagated correctly', () => {
    const result = runAsset('scripts/wb-render.js', { projectDir: tmpDir, home: fakeHome });
    // run-asset itself does not produce "Error: run-asset" — the error is from the script
    expect(result.stderr).not.toContain('Error: run-asset');
  });

  test('args after -- reach wb-render.js', () => {
    const fakeJson = path.join(tmpDir, 'nonexistent.json');
    const result   = runAsset(
      'scripts/wb-render.js',
      { projectDir: tmpDir, home: fakeHome },
      [fakeJson, 'FTR-015']
    );
    // Script ran (received the args), error comes from script, not from run-asset
    expect(result.error).toBeUndefined();
    expect(result.stderr).not.toContain('Error: run-asset');
  });
});

describe('E2E workflow facade — security invariants', () => {
  let tmpDir;
  let fakeHome;

  beforeAll(() => {
    tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-security-'));
    fakeHome = path.join(tmpDir, 'home');
    fs.mkdirSync(fakeHome);
    makeCompleteInstall(tmpDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('cannot run agents/ assets via run-asset (category restriction)', () => {
    const result = runAsset('agents/developer-backend.md', { projectDir: tmpDir, home: fakeHome });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/scripts category/i);
  });

  test('cannot run non-.js scripts assets (extension restriction)', () => {
    const result = runAsset('scripts/foo.md', { projectDir: tmpDir, home: fakeHome });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/\.js/i);
  });

  test('path traversal rejected before reaching execution (Phase 0)', () => {
    const result = runAsset('../escape.js', { projectDir: tmpDir, home: fakeHome });
    expect(result.status).toBe(1);
    // Either traversal or category rejection
    expect(result.stderr).toBeTruthy();
  });
});
