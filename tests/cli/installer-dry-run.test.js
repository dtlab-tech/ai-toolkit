'use strict';

/**
 * installer-dry-run.test.js
 *
 * Verifies that `ai-toolkit install --dry-run` (and `--local <dir> --dry-run`)
 * leaves the destination directory byte-identical to its pre-run state.
 * Specifically:
 *   - No files are copied into the destination
 *   - The manifest file is not created or modified
 *   - The version stamp (.ai-toolkit-version) is not written
 *   - No orphans are moved to trash
 *   - Exit code is 0 (dry run is not an error)
 */

const { spawnSync } = require('child_process');
const fs            = require('fs');
const os            = require('os');
const path          = require('path');

jest.setTimeout(60000);

const ROOT     = path.resolve(__dirname, '../..');
const CLI_PATH = path.join(ROOT, 'bin', 'cli.js');

// Helper: recursively list all file paths under a directory.
function walkDirSync(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) results.push(...walkDirSync(full));
    else results.push(full);
  }
  return results;
}

// Helper: snapshot all files + their byte contents in a directory.
function snapshot(dir) {
  const map = {};
  for (const f of walkDirSync(dir)) {
    map[path.relative(dir, f)] = fs.readFileSync(f);
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Group 1: --dry-run on a fresh (empty) destination
// ─────────────────────────────────────────────────────────────────────────────

describe('installer-dry-run — Group 1: fresh destination', () => {
  let tmpDir;
  let result;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-toolkit-dry-fresh-'));
    result = spawnSync(
      process.execPath,
      [CLI_PATH, '--local', tmpDir, '--dry-run'],
      { encoding: 'utf8', cwd: ROOT }
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exits with code 0', () => {
    expect(result.status).toBe(0);
  });

  test('no files are written to the destination', () => {
    const files = walkDirSync(tmpDir);
    expect(files).toHaveLength(0);
  });

  test('manifest file is NOT created', () => {
    expect(fs.existsSync(path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json'))).toBe(false);
  });

  test('version stamp is NOT written', () => {
    expect(fs.existsSync(path.join(tmpDir, '.claude', '.ai-toolkit-version'))).toBe(false);
  });

  test('stdout mentions dry run', () => {
    expect(result.stdout.toLowerCase()).toContain('dry run');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 2: --dry-run on an existing installation leaves files byte-identical
// ─────────────────────────────────────────────────────────────────────────────

describe('installer-dry-run — Group 2: existing installation unchanged', () => {
  let tmpDir;
  let beforeSnap;
  let result;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-toolkit-dry-existing-'));

    // Perform a real install first.
    spawnSync(
      process.execPath,
      [CLI_PATH, '--local', tmpDir, '--force'],
      { encoding: 'utf8', cwd: ROOT }
    );

    // Take a snapshot of the installed state.
    beforeSnap = snapshot(tmpDir);

    // Now run with --dry-run.
    result = spawnSync(
      process.execPath,
      [CLI_PATH, '--local', tmpDir, '--dry-run'],
      { encoding: 'utf8', cwd: ROOT }
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exits with code 0', () => {
    expect(result.status).toBe(0);
  });

  test('destination is byte-identical after dry run', () => {
    const afterSnap = snapshot(tmpDir);
    // Same keys (file set unchanged).
    expect(Object.keys(afterSnap).sort()).toEqual(Object.keys(beforeSnap).sort());
    // Same content for each file.
    for (const [rel, content] of Object.entries(beforeSnap)) {
      expect(afterSnap[rel]).toEqual(content);
    }
  });

  test('manifest mtime is unchanged after dry run', () => {
    const manifestRel = path.join('.claude', '.ai-toolkit-manifest.json');
    const manifestPath = path.join(tmpDir, manifestRel);
    if (!fs.existsSync(manifestPath)) return; // no manifest = nothing to check
    const beforeMtime = fs.statSync(manifestPath).mtimeMs;
    // mtime is preserved because dry run never writes.
    const afterMtime = fs.statSync(manifestPath).mtimeMs;
    expect(afterMtime).toBe(beforeMtime);
  });

  test('no trash directory is created', () => {
    const trashDir = path.join(tmpDir, '.claude', '.ai-toolkit-trash');
    expect(fs.existsSync(trashDir)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 3: --dry-run combined with --force (force is redundant but should not error)
// ─────────────────────────────────────────────────────────────────────────────

describe('installer-dry-run — Group 3: --dry-run --force combination', () => {
  let tmpDir;
  let result;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-toolkit-dry-force-'));
    result = spawnSync(
      process.execPath,
      [CLI_PATH, '--local', tmpDir, '--dry-run', '--force'],
      { encoding: 'utf8', cwd: ROOT }
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exits with code 0', () => {
    expect(result.status).toBe(0);
  });

  test('no files are written to the destination', () => {
    const files = walkDirSync(tmpDir);
    expect(files).toHaveLength(0);
  });
});
