'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { computeFileSha256, writeManifest } = require('../../bin/cli');

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

describe('writeManifest()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'));
    fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function readWrittenManifest() {
    const raw = fs.readFileSync(
      path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json'),
      'utf8'
    );
    return JSON.parse(raw);
  }

  test('3-arg call produces a manifest with no fileHashes field (backward-compatible)', () => {
    const fileList = ['.claude/agents/developer-backend.md'];
    writeManifest(tmpDir, fileList, 'local');
    const manifest = readWrittenManifest();
    expect(Array.isArray(manifest.files)).toBe(true);
    expect('fileHashes' in manifest).toBe(false);
  });

  test('3-arg call: files field is a string[] containing the provided paths', () => {
    const fileList = [
      '.claude/agents/developer-backend.md',
      '.claude/workflows/pm-phase1.js',
    ];
    writeManifest(tmpDir, fileList, 'local');
    const manifest = readWrittenManifest();
    expect(manifest.files).toEqual(fileList);
    for (const entry of manifest.files) {
      expect(typeof entry).toBe('string');
    }
  });

  test('4-arg call writes both files: string[] (unchanged shape) and fileHashes object', () => {
    const fileList = ['.claude/agents/developer-backend.md'];
    const fileHashes = { '.claude/agents/developer-backend.md': 'sha256:abc123' };
    writeManifest(tmpDir, fileList, 'local', fileHashes);
    const manifest = readWrittenManifest();
    expect(Array.isArray(manifest.files)).toBe(true);
    expect(manifest.files).toEqual(fileList);
    expect(typeof manifest.fileHashes).toBe('object');
    expect(manifest.fileHashes).toEqual(fileHashes);
  });

  test('4-arg call: files field remains a string[] (each entry is a string)', () => {
    const fileList = [
      '.claude/agents/developer-backend.md',
      '.claude/workflows/pm-phase1.js',
    ];
    const fileHashes = {
      '.claude/agents/developer-backend.md': 'sha256:aaa111',
      '.claude/workflows/pm-phase1.js':      'sha256:bbb222',
    };
    writeManifest(tmpDir, fileList, 'local', fileHashes);
    const manifest = readWrittenManifest();
    for (const entry of manifest.files) {
      expect(typeof entry).toBe('string');
    }
  });

  test('set(files) equals set(keys(fileHashes)) when fileHashes covers every file', () => {
    const fileList = [
      '.claude/agents/developer-backend.md',
      '.claude/workflows/pm-phase1.js',
    ];
    const fileHashes = {
      '.claude/agents/developer-backend.md': 'sha256:aaa111',
      '.claude/workflows/pm-phase1.js':      'sha256:bbb222',
    };
    writeManifest(tmpDir, fileList, 'local', fileHashes);
    const manifest = readWrittenManifest();
    const filesSet     = new Set(manifest.files);
    const hashKeysSet  = new Set(Object.keys(manifest.fileHashes));
    expect(filesSet).toEqual(hashKeysSet);
  });

  test('4-arg call with explicit undefined omits the fileHashes field (same as 3-arg)', () => {
    const fileList = ['.claude/agents/developer-backend.md'];
    writeManifest(tmpDir, fileList, 'local', undefined);
    const manifest = readWrittenManifest();
    expect('fileHashes' in manifest).toBe(false);
  });
});
