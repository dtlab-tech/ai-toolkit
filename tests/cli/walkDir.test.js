'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { walkDir } = require('../../bin/cli');

describe('walkDir()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns an empty array for an empty directory', () => {
    const result = walkDir(tmpDir);
    expect(result).toEqual([]);
  });

  test('returns all leaf files in a nested directory tree', () => {
    // Structure:
    //   tmpDir/
    //     a.txt
    //     sub/
    //       b.txt
    //       deep/
    //         c.txt
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'a');
    fs.mkdirSync(path.join(tmpDir, 'sub'));
    fs.writeFileSync(path.join(tmpDir, 'sub', 'b.txt'), 'b');
    fs.mkdirSync(path.join(tmpDir, 'sub', 'deep'));
    fs.writeFileSync(path.join(tmpDir, 'sub', 'deep', 'c.txt'), 'c');

    const result = walkDir(tmpDir);
    expect(result).toHaveLength(3);

    const normalized = result.map(p => p.replace(/\\/g, '/'));
    expect(normalized).toContain(path.join(tmpDir, 'a.txt').replace(/\\/g, '/'));
    expect(normalized).toContain(path.join(tmpDir, 'sub', 'b.txt').replace(/\\/g, '/'));
    expect(normalized).toContain(path.join(tmpDir, 'sub', 'deep', 'c.txt').replace(/\\/g, '/'));
  });

  test('does not include directory paths — only file paths', () => {
    fs.mkdirSync(path.join(tmpDir, 'emptySubDir'));
    fs.mkdirSync(path.join(tmpDir, 'populatedSubDir'));
    fs.writeFileSync(path.join(tmpDir, 'populatedSubDir', 'file.txt'), 'content');

    const result = walkDir(tmpDir);

    // Only the file, not the directories, should appear
    for (const entry of result) {
      expect(fs.statSync(entry).isFile()).toBe(true);
    }
    expect(result).toHaveLength(1);
  });
});
