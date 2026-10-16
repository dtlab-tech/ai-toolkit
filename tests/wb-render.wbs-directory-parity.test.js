'use strict';

// FTR-020 AC-05: wb-render.js must produce byte-for-byte identical .md/.csv output whether
// fed the new split wbs/ directory format or the equivalent legacy single-JSON file. Uses
// the real FTR-020 dogfooding fixture (tests/fixtures/ftr-020-wbs/ + ftr-020-wb-legacy.json)
// as its own real-world example, rather than hand-building a synthetic pair.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RENDER = path.resolve(__dirname, '../src/claude/scripts/wb-render.js');
const FIXTURES = path.resolve(__dirname, 'fixtures');
const WBS_DIR = path.join(FIXTURES, 'ftr-020-wbs');
const LEGACY_JSON = path.join(FIXTURES, 'ftr-020-wb-legacy.json');

function stripGenerated(s) {
  return s.replace(/\| Generated \|.*\|/, '| Generated | <stripped> |');
}

describe('wb-render.js — split-directory vs. legacy-JSON parity (AC-05)', () => {
  test('rendered .md is byte-identical (ignoring the Generated timestamp) from both input formats', () => {
    const splitOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-render-parity-split-'));
    const legacyOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-render-parity-legacy-'));
    try {
      execFileSync('node', [RENDER, WBS_DIR, 'FTR-020', splitOutDir]);
      execFileSync('node', [RENDER, LEGACY_JSON, 'FTR-020', legacyOutDir]);

      const mdFromSplit = fs.readFileSync(path.join(splitOutDir, 'FTR-020-Work-Breakdown.md'), 'utf8');
      const mdFromLegacy = fs.readFileSync(path.join(legacyOutDir, 'FTR-020-Work-Breakdown.md'), 'utf8');
      expect(stripGenerated(mdFromSplit)).toBe(stripGenerated(mdFromLegacy));
    } finally {
      fs.rmSync(splitOutDir, { recursive: true, force: true });
      fs.rmSync(legacyOutDir, { recursive: true, force: true });
    }
  });

  test('rendered .csv is byte-identical from both input formats', () => {
    const splitOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-render-parity-split-'));
    const legacyOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-render-parity-legacy-'));
    try {
      execFileSync('node', [RENDER, WBS_DIR, 'FTR-020', splitOutDir]);
      execFileSync('node', [RENDER, LEGACY_JSON, 'FTR-020', legacyOutDir]);

      const csvFromSplit = fs.readFileSync(path.join(splitOutDir, 'FTR-020-Work-Breakdown.csv'), 'utf8');
      const csvFromLegacy = fs.readFileSync(path.join(legacyOutDir, 'FTR-020-Work-Breakdown.csv'), 'utf8');
      expect(csvFromSplit).toBe(csvFromLegacy);
    } finally {
      fs.rmSync(splitOutDir, { recursive: true, force: true });
      fs.rmSync(legacyOutDir, { recursive: true, force: true });
    }
  });
});
