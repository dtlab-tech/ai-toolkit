'use strict';

const fs     = require('fs');
const path   = require('path');
const matter = require('gray-matter');

const SKILLS_DIR = path.join(__dirname, '..', '..', '.claude', 'skills');

/**
 * Recursively find all SKILL.md files under a directory.
 * Returns objects with { file (relative path from SKILLS_DIR), fullPath }.
 */
function findSkillFiles(dir, baseDir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      results.push(...findSkillFiles(full, baseDir));
    } else if (entry === 'SKILL.md') {
      results.push({
        file: path.relative(baseDir, full).replace(/\\/g, '/'),
        fullPath: full,
      });
    }
  }
  return results;
}

// Build the test table synchronously so describe.each can consume it.
const skillFiles = findSkillFiles(SKILLS_DIR, SKILLS_DIR);

describe('Skill SKILL.md frontmatter validation', () => {
  test('discovers at least one SKILL.md file', () => {
    expect(skillFiles.length).toBeGreaterThan(0);
  });

  describe.each(skillFiles)('$file', ({ file, fullPath }) => {
    let parsed;

    beforeAll(() => {
      const raw = fs.readFileSync(fullPath, 'utf8');
      parsed = matter(raw);
    });

    test('has a non-empty "description" field', () => {
      const value = parsed.data.description;
      expect(
        typeof value === 'string' && value.trim().length > 0
      ).toBe(true); // failure: check skills/<file> — missing or empty 'description' field
    });

    test('has a non-empty "argument-hint" if present', () => {
      const hint = parsed.data['argument-hint'];
      if (hint !== undefined) {
        expect(typeof hint === 'string' && hint.trim().length > 0).toBe(true);
      }
      // argument-hint is optional — test passes automatically when absent
    });
  });
});
