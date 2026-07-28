'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { fileHash } = require('../../bin/cli');

describe('fileHash()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns a 32-character MD5 hex string for a known file', () => {
    const filePath = path.join(tmpDir, 'hello.txt');
    fs.writeFileSync(filePath, 'hello world');
    const hash = fileHash(filePath);
    // MD5 of "hello world" is 5eb63bbbe01eeed093cb22bb8f5acdc3
    expect(hash).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3');
    expect(hash).toHaveLength(32);
  });

  test('returns different hashes for files with different content', () => {
    const file1 = path.join(tmpDir, 'a.txt');
    const file2 = path.join(tmpDir, 'b.txt');
    fs.writeFileSync(file1, 'content A');
    fs.writeFileSync(file2, 'content B');
    expect(fileHash(file1)).not.toBe(fileHash(file2));
  });

  test('returns identical hashes for files with identical content', () => {
    const file1 = path.join(tmpDir, 'copy1.txt');
    const file2 = path.join(tmpDir, 'copy2.txt');
    const content = 'identical content here';
    fs.writeFileSync(file1, content);
    fs.writeFileSync(file2, content);
    expect(fileHash(file1)).toBe(fileHash(file2));
  });
});
