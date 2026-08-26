'use strict';

/**
 * Tests for validatePurityGuard() — US-05-TASK-TEST-02 (FTR-015).
 *
 * Verifies:
 * - Guard blocks *.test.js files
 * - Guard blocks directories named tests, fixtures, mocks, helpers
 * - Guard allows normal .js, .md, .json files
 * - Guard allows normal subdirectory names
 * - Guard returns empty array for a clean source dir
 * - Guard returns violation strings for each violation found
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { validatePurityGuard } = require('../../bin/cli');

describe('validatePurityGuard()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'purity-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty array for empty source dir', () => {
    const result = validatePurityGuard(tmpDir);
    expect(result).toEqual([]);
  });

  test('returns empty array for clean source dir with normal files', () => {
    fs.writeFileSync(path.join(tmpDir, 'agent.md'), '# Agent');
    fs.writeFileSync(path.join(tmpDir, 'script.js'), '// script');
    fs.mkdirSync(path.join(tmpDir, 'agents'));
    fs.writeFileSync(path.join(tmpDir, 'agents', 'worker.md'), '# Worker');
    const result = validatePurityGuard(tmpDir);
    expect(result).toEqual([]);
  });

  test('blocks a *.test.js file at root level', () => {
    fs.writeFileSync(path.join(tmpDir, 'foo.test.js'), '// test');
    const result = validatePurityGuard(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('foo.test.js');
    expect(result[0]).toMatch(/Blocked file/);
  });

  test('blocks a *.test.js file in a subdirectory', () => {
    fs.mkdirSync(path.join(tmpDir, 'scripts'));
    fs.writeFileSync(path.join(tmpDir, 'scripts', 'wb-render.test.js'), '// test');
    const result = validatePurityGuard(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('wb-render.test.js');
    expect(result[0]).toMatch(/Blocked file/);
  });

  test('blocks a directory named "tests"', () => {
    fs.mkdirSync(path.join(tmpDir, 'tests'));
    fs.writeFileSync(path.join(tmpDir, 'tests', 'foo.test.js'), '// test');
    const result = validatePurityGuard(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('tests');
    expect(result[0]).toMatch(/Blocked directory/);
  });

  test('blocks a directory named "fixtures"', () => {
    fs.mkdirSync(path.join(tmpDir, 'fixtures'));
    const result = validatePurityGuard(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/Blocked directory/);
    expect(result[0]).toContain('fixtures');
  });

  test('blocks a directory named "mocks"', () => {
    fs.mkdirSync(path.join(tmpDir, 'mocks'));
    const result = validatePurityGuard(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/Blocked directory/);
    expect(result[0]).toContain('mocks');
  });

  test('blocks a directory named "helpers"', () => {
    fs.mkdirSync(path.join(tmpDir, 'helpers'));
    const result = validatePurityGuard(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/Blocked directory/);
    expect(result[0]).toContain('helpers');
  });

  test('does not recurse into blocked directory', () => {
    // If helpers/ is blocked, files inside it count as 1 violation (the dir), not multiple
    fs.mkdirSync(path.join(tmpDir, 'helpers'));
    fs.writeFileSync(path.join(tmpDir, 'helpers', 'util.js'), '// util');
    fs.writeFileSync(path.join(tmpDir, 'helpers', 'extra.test.js'), '// test');
    const result = validatePurityGuard(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/Blocked directory/);
  });

  test('reports multiple violations independently', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.test.js'), '// a');
    fs.writeFileSync(path.join(tmpDir, 'b.test.js'), '// b');
    fs.mkdirSync(path.join(tmpDir, 'fixtures'));
    const result = validatePurityGuard(tmpDir);
    expect(result).toHaveLength(3);
    const blockedFiles = result.filter(v => v.includes('.test.js'));
    const blockedDirs  = result.filter(v => v.includes('fixtures'));
    expect(blockedFiles).toHaveLength(2);
    expect(blockedDirs).toHaveLength(1);
  });

  test('returns empty array for non-existent source dir', () => {
    const missing = path.join(tmpDir, 'does-not-exist');
    const result = validatePurityGuard(missing);
    expect(result).toEqual([]);
  });

  test('does not block normal subdirectory names', () => {
    const ALLOWED = ['agents', 'commands', 'skills', 'workflows', 'scripts'];
    for (const name of ALLOWED) {
      fs.mkdirSync(path.join(tmpDir, name), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, name, 'item.md'), '# item');
    }
    const result = validatePurityGuard(tmpDir);
    expect(result).toEqual([]);
  });
});
