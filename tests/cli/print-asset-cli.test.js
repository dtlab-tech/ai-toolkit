'use strict';

/**
 * CLI integration tests for print-asset command.
 *
 * Covers:
 * - Subpath restriction (only scripts/templates/ allowed)
 * - Extension restriction (only .md allowed)
 * - Missing argument errors
 * - Content propagation from a real catalog template (verbatim, not re-encoded)
 * - Consistency with resolve-asset's own path resolution for the same relativePath
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI          = path.join(__dirname, '..', '..', 'bin', 'cli.js');
const TOOLKIT_ROOT = path.join(__dirname, '..', '..');
const TOOLKIT_VERSION = require('../../package.json').version;
const { getAssetCategories } = require('../../lib/asset-catalog');

// Full catalog install with manifest + version stamp — same helper shape as run-asset-cli.test.js.
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
          const rel      = path.relative(srcDir, full).replace(/\\/g, '/');
          const destPath = path.join(clauDir, cat.name, rel);
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(full, destPath);
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

function runCLI(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    shell: false,
  });
}

describe('print-asset CLI — security: subpath and extension restrictions', () => {
  let emptyProject;
  let emptyHome;

  beforeAll(() => {
    emptyProject = fs.mkdtempSync(path.join(os.tmpdir(), 'print-sec-p-'));
    emptyHome    = fs.mkdtempSync(path.join(os.tmpdir(), 'print-sec-h-'));
  });

  afterAll(() => {
    fs.rmSync(emptyProject, { recursive: true, force: true });
    fs.rmSync(emptyHome,    { recursive: true, force: true });
  });

  test('rejects assets outside scripts/templates/ — exit 1, stderr mentions scripts/templates/', () => {
    const result = runCLI([
      'print-asset', 'scripts/wb-validate.js',
      '--project', emptyProject, '--home', emptyHome,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/scripts\/templates\//);
  });

  test('rejects agents/ assets — exit 1', () => {
    const result = runCLI([
      'print-asset', 'agents/gaia-developer-backend.md',
      '--project', emptyProject, '--home', emptyHome,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/scripts\/templates\//);
  });

  test('rejects non-.md extension under scripts/templates/ — exit 1, stderr mentions .md', () => {
    const result = runCLI([
      'print-asset', 'scripts/templates/not-a-template.js',
      '--project', emptyProject, '--home', emptyHome,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/\.md files/i);
  });

  test('rejects missing argument — exit 1', () => {
    const result = runCLI([
      'print-asset',
      '--project', emptyProject, '--home', emptyHome,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('requires a relative path');
  });

  test('stdout is empty on restriction rejection', () => {
    const result = runCLI([
      'print-asset', 'agents/gaia-developer-backend.md',
      '--project', emptyProject, '--home', emptyHome,
    ]);
    expect(result.stdout).toBe('');
  });
});

describe('print-asset CLI — content propagation', () => {
  let tmpDir;
  let fakeHome;

  beforeAll(() => {
    tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'print-exec-'));
    fakeHome = path.join(tmpDir, 'home');
    fs.mkdirSync(fakeHome);
    makeCompleteInstall(tmpDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('prints the real template file content verbatim', () => {
    const relPath = 'scripts/templates/gaia-requirements-index-template.md';
    const expected = fs.readFileSync(path.join(TOOLKIT_ROOT, 'src/claude', relPath), 'utf8');
    const result = runCLI(['print-asset', relPath, '--project', tmpDir, '--home', fakeHome]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(expected);
  });

  test('exits 1 with "Asset not found" for a template that does not exist', () => {
    const result = runCLI([
      'print-asset', 'scripts/templates/does-not-exist.md',
      '--project', tmpDir, '--home', fakeHome,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/not a registered catalog asset|not found/i);
  });

  test('resolves the same install (home vs local) resolve-asset itself would pick', () => {
    // print-asset and resolve-asset share resolveClaudeRuntimeAsset — the same relativePath
    // must resolve under the same effective root for both commands.
    const relPath = 'scripts/templates/gaia-component-template.md';
    const resolved = runCLI(['resolve-asset', relPath, '--project', tmpDir, '--home', fakeHome]);
    expect(resolved.status).toBe(0);
    const resolvedPath = resolved.stdout.trim();
    const printed = runCLI(['print-asset', relPath, '--project', tmpDir, '--home', fakeHome]);
    expect(printed.status).toBe(0);
    expect(printed.stdout).toBe(fs.readFileSync(resolvedPath, 'utf8'));
  });
});
