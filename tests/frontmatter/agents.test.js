'use strict';

const fs     = require('fs');
const path   = require('path');
const matter = require('gray-matter');

const AGENTS_DIR   = path.join(__dirname, '..', '..', 'src', 'claude', 'agents');
const VALID_MODELS = new Set(['haiku', 'sonnet', 'opus']);

// Build the test table synchronously so describe.each can consume it.
const agentFiles = fs.existsSync(AGENTS_DIR)
  ? fs.readdirSync(AGENTS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => ({ file: f, fullPath: path.join(AGENTS_DIR, f) }))
  : [];

describe('Agent .md frontmatter validation', () => {
  test('discovers at least one agent .md file', () => {
    expect(agentFiles.length).toBeGreaterThan(0);
  });

  describe.each(agentFiles)('$file', ({ file, fullPath }) => {
    let parsed;

    beforeAll(() => {
      const raw = fs.readFileSync(fullPath, 'utf8');
      parsed = matter(raw);
    });

    test('has a non-empty "name" field', () => {
      const value = parsed.data.name;
      expect(
        typeof value === 'string' && value.trim().length > 0
      ).toBe(true); // failure message: check agents/<file> — missing or empty 'name' field
    });

    test('has a non-empty "description" field', () => {
      const value = parsed.data.description;
      expect(
        typeof value === 'string' && value.trim().length > 0
      ).toBe(true); // failure message: check agents/<file> — missing or empty 'description' field
    });

    test('has a valid "model" field (haiku, sonnet, or opus)', () => {
      const value = parsed.data.model;
      expect(VALID_MODELS.has(value)).toBe(true); // failure: check agents/<file> — model must be haiku|sonnet|opus
    });

    test('has a non-empty "argument-hint" if present', () => {
      const hint = parsed.data['argument-hint'];
      if (hint !== undefined) {
        expect(typeof hint === 'string' && hint.trim().length > 0).toBe(true);
      }
      // argument-hint is optional — test passes automatically when absent
    });

    test('"name" field matches filename without .md extension', () => {
      const expectedName = file.replace(/\.md$/, '');
      expect(parsed.data.name).toBe(expectedName);
      // failure: check agents/<file> — name field must equal filename without extension
    });
  });
});
