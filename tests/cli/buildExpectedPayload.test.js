'use strict';

/**
 * buildExpectedPayload.test.js — unit tests for buildPayloadFileMappings and
 * buildExpectedPayload (FTR-015 hotfix, P0-1 / P1-A).
 *
 * buildPayloadFileMappings(effectiveRoot) is the single canonical source used
 * by the installer, resolver, doctor, and list-assets.
 * buildExpectedPayload(effectiveRoot) is the dest-path Set derived from it.
 */

const fs   = require('fs');
const path = require('path');
const {
  buildPayloadFileMappings,
  buildExpectedPayload,
  TOOLKIT_INTERNAL_ASSETS,
} = require('../../bin/cli');

const TOOLKIT_ROOT = path.resolve(__dirname, '../..');
const FAKE_ROOT    = path.join(TOOLKIT_ROOT, 'FAKE_CLAUDE_DIR_FOR_TEST');

// ── buildPayloadFileMappings ──────────────────────────────────────────────────

describe('buildPayloadFileMappings()', () => {
  test('returns a non-empty array', () => {
    const mappings = buildPayloadFileMappings(FAKE_ROOT);
    expect(Array.isArray(mappings)).toBe(true);
    expect(mappings.length).toBeGreaterThan(0);
  });

  test('every entry has string src and dest properties', () => {
    const mappings = buildPayloadFileMappings(FAKE_ROOT);
    for (const m of mappings) {
      expect(typeof m.src).toBe('string');
      expect(typeof m.dest).toBe('string');
    }
  });

  test('every src is an absolute path to an existing file', () => {
    const mappings = buildPayloadFileMappings(FAKE_ROOT);
    for (const m of mappings) {
      expect(path.isAbsolute(m.src)).toBe(true);
      expect(fs.existsSync(m.src)).toBe(true);
      expect(fs.statSync(m.src).isFile()).toBe(true);
    }
  });

  test('every dest is an absolute path under effectiveRoot', () => {
    const mappings = buildPayloadFileMappings(FAKE_ROOT);
    const root     = path.resolve(FAKE_ROOT);
    for (const m of mappings) {
      expect(path.isAbsolute(m.dest)).toBe(true);
      expect(m.dest.startsWith(root)).toBe(true);
    }
  });

  test('includes src/claude/scripts/wb-validate.js → FAKE_ROOT/scripts/wb-validate.js', () => {
    const mappings = buildPayloadFileMappings(FAKE_ROOT);
    const expectedDest = path.join(FAKE_ROOT, 'scripts', 'wb-validate.js');
    const match = mappings.find(m => path.resolve(m.dest) === path.resolve(expectedDest));
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
    expect(
      mappings.some(m => path.resolve(m.dest).startsWith(skillDir + path.sep))
    ).toBe(false);
  });

  test('changing effectiveRoot changes all dest paths but not src paths', () => {
    const root1 = '/tmp/root1/.claude';
    const root2 = '/tmp/root2/.claude';
    const m1 = buildPayloadFileMappings(root1);
    const m2 = buildPayloadFileMappings(root2);
    expect(m1.length).toBe(m2.length);
    // src paths are identical (same source files)
    const srcs1 = m1.map(m => m.src).sort();
    const srcs2 = m2.map(m => m.src).sort();
    expect(srcs1).toEqual(srcs2);
    // dest paths differ by root
    for (let i = 0; i < m1.length; i++) {
      expect(m1[i].dest).not.toBe(m2[i].dest);
    }
  });
});

// ── buildExpectedPayload (derived from buildPayloadFileMappings) ──────────────

describe('buildExpectedPayload()', () => {
  test('returns a Set', () => {
    expect(buildExpectedPayload(FAKE_ROOT)).toBeInstanceOf(Set);
  });

  test('returns a non-empty Set', () => {
    expect(buildExpectedPayload(FAKE_ROOT).size).toBeGreaterThan(0);
  });

  test('all entries are absolute paths', () => {
    for (const f of buildExpectedPayload(FAKE_ROOT)) {
      expect(path.isAbsolute(f)).toBe(true);
    }
  });

  test('includes scripts/wb-validate.js (known distributable file)', () => {
    const payload  = buildExpectedPayload(FAKE_ROOT);
    const expected = path.resolve(path.join(FAKE_ROOT, 'scripts', 'wb-validate.js'));
    expect(payload.has(expected)).toBe(true);
  });

  test('excludes agents/install-toolkit.md (TOOLKIT_INTERNAL_ASSETS)', () => {
    const payload  = buildExpectedPayload(FAKE_ROOT);
    const excluded = path.resolve(path.join(FAKE_ROOT, 'agents', 'install-toolkit.md'));
    expect(payload.has(excluded)).toBe(false);
  });

  test('excludes all files under skills/install-toolkit/ (TOOLKIT_INTERNAL_ASSETS)', () => {
    const payload  = buildExpectedPayload(FAKE_ROOT);
    const skillDir = path.resolve(path.join(FAKE_ROOT, 'skills', 'install-toolkit'));
    for (const f of payload) {
      expect(f.startsWith(skillDir + path.sep)).toBe(false);
    }
  });

  test('payload equals the dest-path Set of buildPayloadFileMappings', () => {
    const mappings     = buildPayloadFileMappings(FAKE_ROOT);
    const mappingDests = new Set(mappings.map(m => path.resolve(m.dest)));
    const payload      = buildExpectedPayload(FAKE_ROOT);
    expect(payload).toEqual(mappingDests);
  });

  test('changing effectiveRoot changes all path prefixes', () => {
    const root1 = '/tmp/root1/.claude';
    const root2 = '/tmp/root2/.claude';
    const p1    = buildExpectedPayload(root1);
    const p2    = buildExpectedPayload(root2);
    expect(p1.size).toBe(p2.size);
    for (const f of p1) {
      const rel         = path.relative(root1, f);
      const counterpart = path.resolve(path.join(root2, rel));
      expect(p2.has(counterpart)).toBe(true);
    }
  });
});
