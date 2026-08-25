'use strict';

/**
 * buildPayloadFileMappings.test.js — unit tests for the single canonical source
 * of the distributable payload (FTR-015 hotfix, P1-A).
 *
 * buildPayloadFileMappings(effectiveRoot) returns Array<{src, dest}> file-level
 * mappings, with TOOLKIT_INTERNAL_ASSETS excluded. The installer, resolver,
 * doctor, and list-assets all derive their view of the payload from this.
 */

const fs   = require('fs');
const path = require('path');
const { buildPayloadFileMappings, TOOLKIT_INTERNAL_ASSETS } = require('../../bin/cli');

const TOOLKIT_ROOT = path.resolve(__dirname, '../..');
const FAKE_ROOT    = path.join(TOOLKIT_ROOT, 'FAKE_CLAUDE_DIR_FOR_TEST');

describe('buildPayloadFileMappings()', () => {
  test('TOOLKIT_INTERNAL_ASSETS is exported and shaped as category → Set', () => {
    expect(TOOLKIT_INTERNAL_ASSETS).toBeDefined();
    expect(TOOLKIT_INTERNAL_ASSETS.agents).toBeInstanceOf(Set);
    expect(TOOLKIT_INTERNAL_ASSETS.skills).toBeInstanceOf(Set);
  });

  test('returns a non-empty array', () => {
    const mappings = buildPayloadFileMappings(FAKE_ROOT);
    expect(Array.isArray(mappings)).toBe(true);
    expect(mappings.length).toBeGreaterThan(0);
  });

  test('every entry has string src and dest properties', () => {
    for (const m of buildPayloadFileMappings(FAKE_ROOT)) {
      expect(typeof m.src).toBe('string');
      expect(typeof m.dest).toBe('string');
    }
  });

  test('every src is an absolute path to an existing file', () => {
    for (const m of buildPayloadFileMappings(FAKE_ROOT)) {
      expect(path.isAbsolute(m.src)).toBe(true);
      expect(fs.existsSync(m.src)).toBe(true);
      expect(fs.statSync(m.src).isFile()).toBe(true);
    }
  });

  test('every dest is an absolute path under effectiveRoot', () => {
    const root = path.resolve(FAKE_ROOT);
    for (const m of buildPayloadFileMappings(FAKE_ROOT)) {
      expect(path.isAbsolute(m.dest)).toBe(true);
      expect(m.dest.startsWith(root)).toBe(true);
    }
  });

  test('includes src/claude/scripts/wb-validate.js → FAKE_ROOT/scripts/wb-validate.js', () => {
    const mappings     = buildPayloadFileMappings(FAKE_ROOT);
    const expectedDest = path.join(FAKE_ROOT, 'scripts', 'wb-validate.js');
    const match        = mappings.find(m => path.resolve(m.dest) === path.resolve(expectedDest));
    expect(match).toBeDefined();
    expect(path.resolve(match.src)).toBe(
      path.resolve(path.join(TOOLKIT_ROOT, 'src', 'claude', 'scripts', 'wb-validate.js'))
    );
  });

  test('excludes agents/install-toolkit.md (TOOLKIT_INTERNAL_ASSETS)', () => {
    const mappings = buildPayloadFileMappings(FAKE_ROOT);
    const excluded = path.resolve(path.join(FAKE_ROOT, 'agents', 'install-toolkit.md'));
    expect(mappings.some(m => path.resolve(m.dest) === excluded)).toBe(false);
  });

  test('excludes all files under skills/install-toolkit/ (TOOLKIT_INTERNAL_ASSETS)', () => {
    const mappings = buildPayloadFileMappings(FAKE_ROOT);
    const skillDir = path.resolve(path.join(FAKE_ROOT, 'skills', 'install-toolkit'));
    expect(mappings.some(m => path.resolve(m.dest).startsWith(skillDir + path.sep))).toBe(false);
  });

  test('changing effectiveRoot changes all dest paths but not src paths', () => {
    const m1 = buildPayloadFileMappings('/tmp/root1/.claude');
    const m2 = buildPayloadFileMappings('/tmp/root2/.claude');
    expect(m1.length).toBe(m2.length);
    expect(m1.map(m => m.src).sort()).toEqual(m2.map(m => m.src).sort());
    for (let i = 0; i < m1.length; i++) {
      expect(m1[i].dest).not.toBe(m2[i].dest);
    }
  });
});
