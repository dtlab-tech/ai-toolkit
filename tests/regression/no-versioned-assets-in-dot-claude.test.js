'use strict';

/**
 * Regression test: no versioned runtime assets under .claude/ — US-09-TASK-TEST-02 (FTR-015).
 *
 * After the FTR-015 migration, all versioned runtime assets live in src/claude/.
 * The .claude/ directory in the toolkit repo is for personal runtime config only
 * (settings.json, settings.local.json, .ai-toolkit-version, .ai-toolkit-manifest.json).
 *
 * This test verifies that the asset category directories do NOT exist or are EMPTY
 * under .claude/ at the toolkit root. This prevents accidental re-introduction of
 * versioned assets in .claude/ which would break the installer and resolver.
 */

const fs   = require('fs');
const path = require('path');
const { getAssetCategories } = require('../../lib/asset-catalog');

const REPO_ROOT   = path.resolve(__dirname, '..', '..');
const DOT_CLAUDE  = path.join(REPO_ROOT, '.claude');

const ASSET_CATEGORY_NAMES = getAssetCategories().map(c => c.name);

describe('No versioned runtime assets in .claude/', () => {
  for (const categoryName of ASSET_CATEGORY_NAMES) {
    test(`.claude/${categoryName}/ does not exist or is empty`, () => {
      const categoryDir = path.join(DOT_CLAUDE, categoryName);
      if (!fs.existsSync(categoryDir)) {
        // Directory doesn't exist at all — correct
        return;
      }
      // Directory exists — it must be empty (no files inside, possibly .gitkeep only)
      const allFiles = walkDir(categoryDir);
      const nonGitkeepFiles = allFiles.filter(f => path.basename(f) !== '.gitkeep');
      expect(nonGitkeepFiles).toHaveLength(0);
    });
  }
});

function walkDir(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}
