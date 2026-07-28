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

  test('skips files whose basename is in NEVER_COPY (e.g. settings.json)', () => {
    // Create a directory with settings.json and a regular file
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'settings.json'), '{}');
    fs.writeFileSync(path.join(srcDir, 'allowed.md'), '# hello');

    const destDir = path.join(tmpDir, 'dest');
    const result = expandMappings([{ src: srcDir, dest: destDir }]);

    const destPaths = result.map(e => path.basename(e.dest));
    expect(destPaths).not.toContain('settings.json');
    expect(destPaths).toContain('allowed.md');
  });

  test('skips a file-level mapping when src basename is settings.json', () => {
    const settingsFile = path.join(tmpDir, 'settings.json');
    fs.writeFileSync(settingsFile, '{}');
    const result = expandMappings([{ src: settingsFile, dest: path.join(tmpDir, 'dest', 'settings.json') }]);
    expect(result).toEqual([]);
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
