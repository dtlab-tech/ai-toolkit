'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { computeFileSha256 } = require('../../bin/cli');

describe('computeFileSha256()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns sha256: prefix followed by 64-char lowercase hex digest', () => {
    const filePath = path.join(tmpDir, 'hello.txt');
    fs.writeFileSync(filePath, 'hello world');
    const result = computeFileSha256(filePath);
    expect(result).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test('returns the correct digest for a known input (hello world)', () => {
    const filePath = path.join(tmpDir, 'known.txt');
    fs.writeFileSync(filePath, 'hello world');
    const expected = 'sha256:' + crypto.createHash('sha256').update('hello world').digest('hex');
    expect(computeFileSha256(filePath)).toBe(expected);
  });

  test('returns the correct digest for the empty file (known vector)', () => {
    const filePath = path.join(tmpDir, 'empty.txt');
    fs.writeFileSync(filePath, '');
    expect(computeFileSha256(filePath)).toBe(
      'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  test('is deterministic: two calls on the same file return identical results', () => {
    const filePath = path.join(tmpDir, 'repeat.txt');
    fs.writeFileSync(filePath, 'determinism check');
    expect(computeFileSha256(filePath)).toBe(computeFileSha256(filePath));
  });

  test('returns different digests for files with different content', () => {
    const file1 = path.join(tmpDir, 'a.txt');
    const file2 = path.join(tmpDir, 'b.txt');
    fs.writeFileSync(file1, 'content A');
    fs.writeFileSync(file2, 'content B');
    expect(computeFileSha256(file1)).not.toBe(computeFileSha256(file2));
  });

  test('returns identical digests for files with identical content', () => {
    const file1 = path.join(tmpDir, 'copy1.txt');
    const file2 = path.join(tmpDir, 'copy2.txt');
    const content = 'identical content here';
    fs.writeFileSync(file1, content);
    fs.writeFileSync(file2, content);
    expect(computeFileSha256(file1)).toBe(computeFileSha256(file2));
  });
});
