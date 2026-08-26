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

// Dedicated unit tests for buildPayloadFileMappings live in
// tests/cli/buildPayloadFileMappings.test.js. This file focuses on the derived
// buildExpectedPayload view and its equivalence to those mappings.

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
