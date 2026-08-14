'use strict';

/**
 * Regression test: npm pack tarball contents after FTR-015 src/claude/ migration.
 *
 * Verifies:
 * - src/claude/ assets are included (all 5 categories non-empty)
 * - bin/ is included
 * - .claude/ runtime dirs are excluded
 * - tests/, internal_docs/ are excluded
 * - *.test.js files are excluded
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function getPackedFiles() {
  const result = spawnSync('npm', ['pack', '--dry-run'], {
    cwd: ROOT,
    shell: true,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`npm pack --dry-run failed:\n${result.stderr}`);
  }
  // Parse lines like: "npm notice <size> <path>"
  const lines = (result.stdout + result.stderr).split('\n');
  const files = [];
  for (const line of lines) {
    const m = line.match(/^npm notice\s+[\d.]+[kKmMbB]+\s+(.+)$/);
    if (m) {
      files.push(m[1].trim());
    }
  }
  return files;
}

let packedFiles;

beforeAll(() => {
  packedFiles = getPackedFiles();
});

describe('src/claude/ categories present in tarball', () => {
  const EXPECTED_CATEGORIES = ['agents', 'commands', 'skills', 'workflows', 'scripts'];

  for (const category of EXPECTED_CATEGORIES) {
    test(`src/claude/${category}/ contains at least one file`, () => {
      const found = packedFiles.filter(f => f.startsWith(`src/claude/${category}/`));
      expect(found.length).toBeGreaterThan(0);
    });
  }
});

describe('bin/ is present in tarball', () => {
  test('bin/cli.js is included', () => {
    expect(packedFiles).toContain('bin/cli.js');
  });
});

describe('.claude/ runtime dirs are excluded', () => {
  const RUNTIME_DIRS = ['agents', 'commands', 'skills', 'workflows', 'scripts'];

  for (const dir of RUNTIME_DIRS) {
    test(`.claude/${dir}/ files are NOT included`, () => {
      const found = packedFiles.filter(f => f.startsWith(`.claude/${dir}/`));
      expect(found).toHaveLength(0);
    });
  }
});

describe('development directories are excluded', () => {
  test('tests/ is NOT included', () => {
    const found = packedFiles.filter(f => f.startsWith('tests/'));
    expect(found).toHaveLength(0);
  });

  test('internal_docs/ is NOT included', () => {
    const found = packedFiles.filter(f => f.startsWith('internal_docs/'));
    expect(found).toHaveLength(0);
  });

  test('*.test.js files are NOT included', () => {
    const found = packedFiles.filter(f => f.endsWith('.test.js'));
    expect(found).toHaveLength(0);
  });
});

describe('src/claude/ is non-empty overall', () => {
  test('at least 10 files under src/claude/', () => {
    const found = packedFiles.filter(f => f.startsWith('src/claude/'));
    expect(found.length).toBeGreaterThanOrEqual(10);
  });
});
