'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { expandMappings } = require('../../bin/cli');

describe('expandMappings()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty array when src path does not exist', () => {
    const nonExistent = path.join(tmpDir, 'does-not-exist');
    const result = expandMappings([{ src: nonExistent, dest: path.join(tmpDir, 'dest') }]);
    expect(result).toEqual([]);
  });

  test('includes all files in a directory without any exclusion filter (no NEVER_COPY)', () => {
    // After FTR-015 US-05-BE-02, expandMappings has no exclusion list. The catalog
    // positive-list (src/claude/<cat>) is the only guard — purity guard enforces it
    // at the source level, not at copy time.
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'settings.json'), '{}');
    fs.writeFileSync(path.join(srcDir, 'allowed.md'), '# hello');

    const destDir = path.join(tmpDir, 'dest');
    const result = expandMappings([{ src: srcDir, dest: destDir }]);

    const destPaths = result.map(e => path.basename(e.dest));
    expect(destPaths).toContain('settings.json');
    expect(destPaths).toContain('allowed.md');
  });

  test('includes a single-file mapping unconditionally (no NEVER_COPY filter)', () => {
    // File-level mappings pass through without any basename check.
    const settingsFile = path.join(tmpDir, 'settings.json');
    fs.writeFileSync(settingsFile, '{}');
    const dest = path.join(tmpDir, 'dest', 'settings.json');
    const result = expandMappings([{ src: settingsFile, dest }]);
    expect(result).toHaveLength(1);
    expect(result[0].src).toBe(settingsFile);
    expect(result[0].dest).toBe(dest);
  });

  test('expands a directory mapping into individual file pairs with correct dest paths', () => {
    const srcDir = path.join(tmpDir, 'src');
    const subDir = path.join(srcDir, 'sub');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'a.txt'), 'a');
    fs.writeFileSync(path.join(subDir, 'b.txt'), 'b');

    const destDir = path.join(tmpDir, 'dest');
    const result = expandMappings([{ src: srcDir, dest: destDir }]);

    expect(result).toHaveLength(2);

    const destPaths = result.map(e => e.dest.replace(/\\/g, '/'));
    expect(destPaths).toContain(path.join(destDir, 'a.txt').replace(/\\/g, '/'));
    expect(destPaths).toContain(path.join(destDir, 'sub', 'b.txt').replace(/\\/g, '/'));
  });

  test('maps a single-file src to the given dest', () => {
    const srcFile = path.join(tmpDir, 'readme.md');
    fs.writeFileSync(srcFile, '# readme');
    const destFile = path.join(tmpDir, 'out', 'readme.md');

    const result = expandMappings([{ src: srcFile, dest: destFile }]);

    expect(result).toHaveLength(1);
    expect(result[0].src).toBe(srcFile);
    expect(result[0].dest).toBe(destFile);
  });
});
