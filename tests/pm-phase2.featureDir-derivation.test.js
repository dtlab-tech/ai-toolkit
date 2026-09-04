'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Regression: pm-phase2.js must derive the feature directory from the feature.md
// path in a SEPARATOR-AGNOSTIC way (POSIX "/" AND Windows "\").
//
// Root cause: the derivation used a POSIX-only regex (/\/[^/]+$/). On a Windows
// path it stripped nothing, leaving "\feature.md" attached, so downstream paths
// became malformed ("…\feature.md/FTR-016-*.json"). It only "worked" because an
// LLM wrapper agent silently repaired the path — exactly the implicit-correction
// dependency FTR-016 exists to eliminate.
//
// pm-phase2.js runs inside the Claude Code Workflow runtime, which exposes no
// `require`, `module`, `fs`, or `path`. The file therefore cannot be require()-d
// or executed in Jest. To test the REAL shipped logic (not a drifting copy) we
// lift the pure `deriveFeatureDir` function out of the source with `new Function`.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const PM_PHASE2_PATH = path.join(__dirname, '..', 'src', 'claude', 'workflows', 'pm-phase2.js');

function loadDeriveFeatureDir() {
  const src = fs.readFileSync(PM_PHASE2_PATH, 'utf8');
  const m = src.match(/function deriveFeatureDir\s*\(\s*featurePath\s*\)\s*\{([\s\S]*?)\n\}/);
  if (!m) throw new Error('deriveFeatureDir(featurePath) not found in pm-phase2.js');
  // eslint-disable-next-line no-new-func -- controlled: our own source, test-only
  return new Function('featurePath', m[1]);
}

let deriveFeatureDir;
beforeAll(() => { deriveFeatureDir = loadDeriveFeatureDir(); });

describe('pm-phase2.js — deriveFeatureDir() behaviour (separator-agnostic)', () => {

  test('POSIX path: strips the /feature.md tail', () => {
    expect(deriveFeatureDir('/home/proj/internal_docs/features/FTR-016-x/feature.md'))
      .toBe('/home/proj/internal_docs/features/FTR-016-x');
  });

  test('Windows path: strips the \\feature.md tail', () => {
    expect(deriveFeatureDir('c:\\ws\\repo\\internal_docs\\features\\FTR-016-x\\feature.md'))
      .toBe('c:\\ws\\repo\\internal_docs\\features\\FTR-016-x');
  });

  test('Windows path with spaces in directory names is preserved', () => {
    expect(deriveFeatureDir('c:\\ws\\my repo\\FTR-016 slug\\feature.md'))
      .toBe('c:\\ws\\my repo\\FTR-016 slug');
  });

  test('POSIX path with spaces in directory names is preserved', () => {
    expect(deriveFeatureDir('/home/my proj/FTR-016 slug/feature.md'))
      .toBe('/home/my proj/FTR-016 slug');
  });

  test('input already given as a directory (Windows) is returned unchanged', () => {
    expect(deriveFeatureDir('c:\\ws\\repo\\FTR-016-x'))
      .toBe('c:\\ws\\repo\\FTR-016-x');
  });

  test('input already given as a directory (POSIX) is returned unchanged', () => {
    expect(deriveFeatureDir('/home/proj/FTR-016-x'))
      .toBe('/home/proj/FTR-016-x');
  });

  test('directory with a trailing separator has the trailing separator stripped', () => {
    expect(deriveFeatureDir('c:\\ws\\repo\\FTR-016-x\\')).toBe('c:\\ws\\repo\\FTR-016-x');
    expect(deriveFeatureDir('/home/proj/FTR-016-x/')).toBe('/home/proj/FTR-016-x');
  });

  test('mixed separators: strips the final feature.md regardless of earlier separators', () => {
    expect(deriveFeatureDir('c:\\ws\\repo/internal_docs\\FTR-016-x/feature.md'))
      .toBe('c:\\ws\\repo/internal_docs\\FTR-016-x');
  });

  test('the derived directory yields a ledger path with NO embedded feature.md segment', () => {
    const dir = deriveFeatureDir('c:\\ws\\repo\\FTR-016-x\\feature.md');
    const ledgerPath = `${dir}/FTR-016-token-ledger.json`;
    expect(ledgerPath).not.toMatch(/feature\.md/);
    expect(ledgerPath).toBe('c:\\ws\\repo\\FTR-016-x/FTR-016-token-ledger.json');
  });
});

describe('pm-phase2.js — deriveFeatureDir source is separator-agnostic (live code, comments ignored)', () => {
  let body;
  beforeAll(() => {
    const src = fs.readFileSync(PM_PHASE2_PATH, 'utf8');
    const m = src.match(/function deriveFeatureDir\s*\(\s*featurePath\s*\)\s*\{([\s\S]*?)\n\}/);
    if (!m) throw new Error('deriveFeatureDir(featurePath) not found in pm-phase2.js');
    body = m[1];
  });

  test('the function body does NOT use the POSIX-only [^/] pattern', () => {
    expect(body).not.toMatch(/\[\^\/\]/);
  });

  test('the function body uses a [/\\] character class covering both separators', () => {
    expect(body).toMatch(/\[\/\\\\\]/);
  });
});
