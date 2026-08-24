'use strict';

/**
 * buildExpectedPayload.test.js — unit tests for the shared distributable
 * payload function (FTR-015 hotfix, P0-1).
 *
 * Verifies that buildExpectedPayload():
 *   1. Returns a Set of absolute paths
 *   2. Excludes TOOLKIT_INTERNAL_ASSETS (install-toolkit.md, install-toolkit skill)
 *   3. Produces the same set of paths as buildCategoryMappings + expandMappings
 *   4. Includes known distributable files (scripts/wb-validate.js)
 */

const fs   = require('fs');
const path = require('path');
const { buildExpectedPayload, buildCategoryMappings, expandMappings, TOOLKIT_INTERNAL_ASSETS } = require('../../bin/cli');
const { getAssetCategories } = require('../../lib/asset-catalog');

const TOOLKIT_ROOT = path.resolve(__dirname, '../..');
const FAKE_ROOT    = path.join(TOOLKIT_ROOT, 'FAKE_CLAUDE_DIR_FOR_TEST');

describe('buildExpectedPayload()', () => {
  test('returns a Set', () => {
    const payload = buildExpectedPayload(FAKE_ROOT);
    expect(payload).toBeInstanceOf(Set);
  });

  test('returns a non-empty Set', () => {
    const payload = buildExpectedPayload(FAKE_ROOT);
    expect(payload.size).toBeGreaterThan(0);
  });

  test('all entries are absolute paths', () => {
    const payload = buildExpectedPayload(FAKE_ROOT);
    for (const f of payload) {
      expect(path.isAbsolute(f)).toBe(true);
    }
  });

  test('includes scripts/wb-validate.js (known distributable file)', () => {
    const payload = buildExpectedPayload(FAKE_ROOT);
    const expected = path.resolve(path.join(FAKE_ROOT, 'scripts', 'wb-validate.js'));
    expect(payload.has(expected)).toBe(true);
  });

  test('excludes agents/install-toolkit.md (TOOLKIT_INTERNAL_ASSETS)', () => {
    const payload = buildExpectedPayload(FAKE_ROOT);
    const excluded = path.resolve(path.join(FAKE_ROOT, 'agents', 'install-toolkit.md'));
    expect(payload.has(excluded)).toBe(false);
  });

  test('excludes all files under skills/install-toolkit/ (TOOLKIT_INTERNAL_ASSETS)', () => {
    const payload = buildExpectedPayload(FAKE_ROOT);
    const skillDir = path.resolve(path.join(FAKE_ROOT, 'skills', 'install-toolkit'));
    for (const f of payload) {
      const normalized = f.replace(/\\/g, '/');
      expect(normalized.startsWith(skillDir.replace(/\\/g, '/') + '/')).toBe(false);
    }
  });

  test('payload matches what buildCategoryMappings + expandMappings produces', () => {
    const srcClaudeDir = path.join(TOOLKIT_ROOT, 'src', 'claude');
    const cats = getAssetCategories();

    const mappings = cats.flatMap(cat =>
      buildCategoryMappings(
        path.join(srcClaudeDir, cat.name),
        path.join(FAKE_ROOT, cat.name),
        cat.name
      )
    );
    const expanded      = expandMappings(mappings);
    const installerPaths = new Set(expanded.map(e => path.resolve(e.dest)));

    const payload = buildExpectedPayload(FAKE_ROOT);

    // Every path in payload must be in installer paths
    for (const f of payload) {
      expect(installerPaths.has(f)).toBe(true);
    }
    // Every installer path must be in payload
    for (const f of installerPaths) {
      expect(payload.has(f)).toBe(true);
    }
  });

  test('changing effectiveRoot changes all path prefixes', () => {
    const root1 = '/tmp/root1/.claude';
    const root2 = '/tmp/root2/.claude';
    const p1 = buildExpectedPayload(root1);
    const p2 = buildExpectedPayload(root2);
    expect(p1.size).toBe(p2.size);
    for (const f of p1) {
      const rel = path.relative(root1, f);
      const counterpart = path.resolve(path.join(root2, rel));
      expect(p2.has(counterpart)).toBe(true);
    }
  });
});
