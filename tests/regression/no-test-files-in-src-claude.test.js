'use strict';

/**
 * Regression test: no test files or fixture dirs under src/claude/ — US-09-TASK-TEST-03 (FTR-015).
 *
 * src/claude/ is the versioned source of all runtime assets. It must remain pure:
 * no *.test.js files, no tests/, fixtures/, mocks/, helpers/ directories.
 *
 * This mirrors the validatePurityGuard() check (US-05-TASK-BE-03) but runs
 * as a standing CI regression to catch accidental contamination.
 */

const fs   = require('fs');
const path = require('path');

const SRC_CLAUDE = path.resolve(__dirname, '..', '..', 'src', 'claude');

const BLOCKED_DIRS = new Set(['tests', 'fixtures', 'mocks', 'helpers']);
const BLOCKED_EXTS = ['.test.js'];

function collectViolations(dir, violations = []) {
  if (!fs.existsSync(dir)) return violations;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    let stat;
    try { stat = fs.statSync(full); } catch (_) { continue; }
    if (stat.isDirectory()) {
      if (BLOCKED_DIRS.has(entry)) {
        violations.push({ type: 'blocked-dir', path: full });
      } else {
        collectViolations(full, violations);
      }
    } else {
      if (BLOCKED_EXTS.some(ext => entry.endsWith(ext))) {
        violations.push({ type: 'blocked-file', path: full });
      }
    }
  }
  return violations;
}

describe('src/claude/ purity — no test files or fixture directories', () => {
  let violations;

  beforeAll(() => {
    violations = collectViolations(SRC_CLAUDE);
  });

  test('src/claude/ contains no *.test.js files', () => {
    const testFiles = violations.filter(v => v.type === 'blocked-file');
    expect(testFiles).toHaveLength(0);
    if (testFiles.length > 0) {
      // Print paths to help debug
      console.error('Found test files:', testFiles.map(v => v.path));
    }
  });

  test('src/claude/ contains no blocked directories (tests/, fixtures/, mocks/, helpers/)', () => {
    const blockedDirs = violations.filter(v => v.type === 'blocked-dir');
    expect(blockedDirs).toHaveLength(0);
    if (blockedDirs.length > 0) {
      console.error('Found blocked directories:', blockedDirs.map(v => v.path));
    }
  });

  test('src/claude/ directory exists and is non-empty', () => {
    expect(fs.existsSync(SRC_CLAUDE)).toBe(true);
    const entries = fs.readdirSync(SRC_CLAUDE);
    expect(entries.length).toBeGreaterThan(0);
  });
});
