'use strict';

/**
 * catalog-equivalence.test.js
 *
 * Regression guard: verifies that the asset catalog and the on-disk source tree
 * are consistent with each other and with what the installer produces.
 *
 * Specifically:
 *   1. Every catalog entry has a non-empty sourceDir on disk.
 *   2. Every file in every sourceDir is reachable via expandMappings() for a local install.
 *   3. The installer produces manifest entries that 1-to-1 correspond to catalog source files.
 *   4. No catalog sourceDir contains test files (purity guard equivalence).
 */

const { spawnSync } = require('child_process');
const fs            = require('fs');
const os            = require('os');
const path          = require('path');
const { getAssetCategories }             = require('../../lib/asset-catalog');
const { expandMappings, TOOLKIT_INTERNAL_ASSETS } = require('../../bin/cli');

const TOOLKIT_ROOT = path.resolve(__dirname, '../..');

jest.setTimeout(60000);

// Helper: recursively list all file paths under a directory.
function walkDirSync(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) results.push(...walkDirSync(full));
    else results.push(full);
  }
  return results;
}

const CATEGORIES = getAssetCategories();

// ─────────────────────────────────────────────────────────────────────────────
// Group 1: Source directories exist
// ─────────────────────────────────────────────────────────────────────────────

describe('catalog-equivalence — Group 1: source directories exist', () => {
  for (const cat of CATEGORIES) {
    const srcDir = path.join(TOOLKIT_ROOT, cat.sourceDir);
    test(`${cat.name}: sourceDir exists at ${cat.sourceDir}`, () => {
      expect(fs.existsSync(srcDir)).toBe(true);
    });

    test(`${cat.name}: sourceDir is a directory`, () => {
      expect(fs.statSync(srcDir).isDirectory()).toBe(true);
    });

    test(`${cat.name}: sourceDir is non-empty`, () => {
      const files = walkDirSync(srcDir);
      expect(files.length).toBeGreaterThan(0);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 2: expandMappings() accounts for every source file
// ─────────────────────────────────────────────────────────────────────────────

describe('catalog-equivalence — Group 2: expandMappings accounts for all source files', () => {
  let mappedSrcs;

  beforeAll(() => {
    const destDir = path.join(os.tmpdir(), 'ai-toolkit-eq-fake-dest');
    const mappings = CATEGORIES.map(cat => ({
      src:  path.join(TOOLKIT_ROOT, cat.sourceDir),
      dest: path.join(destDir, '.claude', cat.name),
    }));
    mappedSrcs = new Set(expandMappings(mappings).map(e => e.src));
  });

  for (const cat of CATEGORIES) {
    const srcDir = path.join(TOOLKIT_ROOT, cat.sourceDir);
    test(`${cat.name}: every source file is included in expandMappings output`, () => {
      const sourceFiles = walkDirSync(srcDir);
      for (const f of sourceFiles) {
        expect(mappedSrcs.has(f)).toBe(true);
      }
    });

    test(`${cat.name}: no extra files are added beyond the source tree`, () => {
      const sourceFiles = new Set(walkDirSync(srcDir));
      for (const mapped of mappedSrcs) {
        if (mapped.startsWith(srcDir + path.sep) || mapped === srcDir) {
          expect(sourceFiles.has(mapped)).toBe(true);
        }
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 3: Installed manifest matches catalog source files
// ─────────────────────────────────────────────────────────────────────────────

describe('catalog-equivalence — Group 3: installed manifest matches catalog source files', () => {
  let tmpDir;
  let manifest;
  let sourcePaths; // all files from catalog sourceDirs

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-toolkit-cat-eq-'));
    spawnSync(
      process.execPath,
      [path.join(TOOLKIT_ROOT, 'bin', 'cli.js'), '--local', tmpDir, '--force'],
      { encoding: 'utf8', cwd: TOOLKIT_ROOT }
    );

    const manifestPath = path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json');
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Collect all files from all catalog source directories, excluding toolkit-internal
    // assets that are intentionally not distributed to consumer projects.
    sourcePaths = new Set();
    for (const cat of CATEGORIES) {
      const srcDir = path.join(TOOLKIT_ROOT, cat.sourceDir);
      const internalItems = TOOLKIT_INTERNAL_ASSETS[cat.name] || new Set();
      for (const f of walkDirSync(srcDir)) {
        // Skip files/dirs whose top-level item name is in the internal set.
        const topItem = path.relative(srcDir, f).split(path.sep)[0];
        if (internalItems.has(topItem)) continue;
        const rel = path.relative(srcDir, f).replace(/\\/g, '/');
        sourcePaths.add(`.claude/${cat.name}/${rel}`);
      }
    }
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('manifest was written', () => {
    expect(manifest).not.toBeNull();
    expect(Array.isArray(manifest.files)).toBe(true);
  });

  test('every catalog source file appears in the manifest', () => {
    const manifestSet = new Set(manifest.files);
    const missing = [...sourcePaths].filter(p => !manifestSet.has(p));
    expect(missing).toHaveLength(0);
  });

  test('manifest contains no entries outside catalog categories', () => {
    // Manifest entries for installed assets should all be under .claude/<category>/.
    const validPrefixes = CATEGORIES.map(cat => `.claude/${cat.name}/`);
    const docsOrRoot    = (f) =>
      f.startsWith('docs/') ||
      f.startsWith('CLAUDE') ||
      validPrefixes.some(prefix => f.startsWith(prefix));
    const unexpected = manifest.files.filter(f => !docsOrRoot(f));
    expect(unexpected).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 4: No test files in catalog source directories (purity equivalence)
// ─────────────────────────────────────────────────────────────────────────────

describe('catalog-equivalence — Group 4: no test files in catalog source directories', () => {
  for (const cat of CATEGORIES) {
    const srcDir = path.join(TOOLKIT_ROOT, cat.sourceDir);

    test(`${cat.name}: no *.test.js files in sourceDir`, () => {
      const testFiles = walkDirSync(srcDir).filter(f => f.endsWith('.test.js'));
      expect(testFiles).toHaveLength(0);
    });

    test(`${cat.name}: no tests/ subdirectory in sourceDir`, () => {
      expect(fs.existsSync(path.join(srcDir, 'tests'))).toBe(false);
    });
  }
});
