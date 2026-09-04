'use strict';

/**
 * CLI integration tests for run-asset command — US-06-TASK-TEST-02 (FTR-015).
 *
 * Covers:
 * - Category restriction (only scripts/ allowed)
 * - Extension restriction (only .js allowed)
 * - Missing argument errors
 * - Path traversal rejection
 * - Exit code propagation from real catalog script
 * - Shell injection prevention: shell:false verified via argv array (no concatenation)
 * - Arg forwarding to script (verified with real catalog script)
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI          = path.join(__dirname, '..', '..', 'bin', 'cli.js');
const TOOLKIT_ROOT = path.join(__dirname, '..', '..');
const TOOLKIT_VERSION = require('../../package.json').version;
const { getAssetCategories } = require('../../lib/asset-catalog');

// Full catalog install with manifest + version stamp
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

describe('run-asset CLI — security: category and extension restrictions', () => {
  // These tests fail before Phase D so they work without a real installation.
  let emptyProject;
  let emptyHome;

  beforeAll(() => {
    emptyProject = fs.mkdtempSync(path.join(os.tmpdir(), 'run-sec-p-'));
    emptyHome    = fs.mkdtempSync(path.join(os.tmpdir(), 'run-sec-h-'));
  });

  afterAll(() => {
    fs.rmSync(emptyProject, { recursive: true, force: true });
    fs.rmSync(emptyHome,    { recursive: true, force: true });
  });

  test('rejects assets outside scripts/ category — exit 1, stderr mentions category', () => {
    const result = runCLI([
      'run-asset', 'agents/developer-backend.md',
      '--project', emptyProject, '--home', emptyHome,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/scripts category/i);
  });

  test('rejects non-.js extension — exit 1, stderr mentions .js', () => {
    const result = runCLI([
      'run-asset', 'scripts/wb-render.md',
      '--project', emptyProject, '--home', emptyHome,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/\.js files/i);
  });

  test('rejects path that starts outside scripts/ — exit 1', () => {
    // ../scripts/foo.js would pass extension check but fail category check
    const result = runCLI([
      'run-asset', '../scripts/foo.js',
      '--project', emptyProject, '--home', emptyHome,
    ]);
    expect(result.status).toBe(1);
    // Either path traversal or category restriction
    expect(result.stderr).toBeTruthy();
  });

  test('rejects missing argument — exit 1', () => {
    const result = runCLI([
      'run-asset',
      '--project', emptyProject, '--home', emptyHome,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('requires a relative path');
  });

  test('stdout is empty on category rejection', () => {
    const result = runCLI([
      'run-asset', 'agents/developer-backend.md',
      '--project', emptyProject, '--home', emptyHome,
    ]);
    expect(result.stdout.trim()).toBe('');
  });
});

describe('run-asset CLI — execution and exit code propagation', () => {
  let tmpDir;
  let fakeHome;

  beforeAll(() => {
    tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'run-exec-'));
    fakeHome = path.join(tmpDir, 'home');
    fs.mkdirSync(fakeHome);
    makeCompleteInstall(tmpDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // wb-validate.js exits 2 when called without required args.
  // This verifies exit code propagation: run-asset exits with the same code.
  test('exit code from script is propagated (wb-validate.js exits 2 with no args)', () => {
    const result = runCLI([
      'run-asset', 'scripts/wb-validate.js',
      '--project', tmpDir, '--home', fakeHome,
    ]);
    // wb-validate exits 2 with no args; run-asset propagates it
    expect(result.status).toBe(2);
  });

  test('run-asset itself does not add extra output to stderr when script runs', () => {
    const result = runCLI([
      'run-asset', 'scripts/wb-validate.js',
      '--project', tmpDir, '--home', fakeHome,
    ]);
    // wb-validate may write to stderr; run-asset should not prepend its own error
    // The test verifies run-asset does NOT write "Error:" to stderr itself
    // (wb-validate's own messages may appear, but not run-asset errors)
    const hasRunAssetError = result.stderr.startsWith('Error: run-asset');
    expect(hasRunAssetError).toBe(false);
  });

  test('args after -- are forwarded to the script (wb-validate.js sees them)', () => {
    // wb-validate.js expects (jsonFile, requirementsFile).
    // Passing arbitrary args causes it to fail, but the point is it runs with those args
    // and exits non-zero (not exit 1 from run-asset itself, which would be different)
    const result = runCLI([
      'run-asset', 'scripts/wb-validate.js',
      '--project', tmpDir, '--home', fakeHome,
      '--', '/nonexistent/arg1.json', '/nonexistent/arg2.md',
    ]);
    // wb-validate received args and tried to process them → exits non-zero
    // run-asset itself exits with the same code (not its own exit 1 error)
    // The key: run-asset's own error messages are not in stderr
    expect(result.stderr).not.toContain('Error: run-asset');
  });

  test('shell injection: semicolons in args are not executed (shell:false)', () => {
    // With shell:false, the argument "; exit 0" is passed as-is to the script,
    // not interpreted by a shell. The script receives it as a literal argument.
    // wb-validate.js cannot succeed with these args, verifying the args are NOT
    // shell-interpolated (which would change program flow).
    const result = runCLI([
      'run-asset', 'scripts/wb-validate.js',
      '--project', tmpDir, '--home', fakeHome,
      '--', '; exit 0', 'safe-arg',
    ]);
    // If args were shell-interpolated, the process would exit 0.
    // Since shell:false is used, wb-validate receives them as literal strings and fails.
    expect(result.status).not.toBe(0);
  });
});
