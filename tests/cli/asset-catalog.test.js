'use strict';

const { ASSET_CATEGORIES, getAssetCategories, getCategoryByName } = require('../../lib/asset-catalog');

const EXPECTED_NAMES = ['agents', 'commands', 'skills', 'workflows', 'scripts'];

// ---------------------------------------------------------------------------
// Export surface
// ---------------------------------------------------------------------------

describe('asset-catalog — exports', () => {
  test('ASSET_CATEGORIES is exported as an array', () => {
    expect(Array.isArray(ASSET_CATEGORIES)).toBe(true);
  });

  test('getAssetCategories is exported as a function', () => {
    expect(typeof getAssetCategories).toBe('function');
  });

  test('getCategoryByName is exported as a function', () => {
    expect(typeof getCategoryByName).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// getAssetCategories()
// ---------------------------------------------------------------------------

describe('getAssetCategories()', () => {
  test('returns an array', () => {
    const result = getAssetCategories();

    expect(Array.isArray(result)).toBe(true);
  });

  test('returns at least 5 categories', () => {
    const result = getAssetCategories();

    expect(result.length).toBeGreaterThanOrEqual(5);
  });

  test('contains all 5 expected category names: agents, commands, skills, workflows, scripts', () => {
    const result = getAssetCategories();
    const names = result.map(cat => cat.name);

    for (const expected of EXPECTED_NAMES) {
      expect(names).toContain(expected);
    }
  });

  test('each category has a name that is a non-empty string', () => {
    const result = getAssetCategories();

    for (const cat of result) {
      expect(typeof cat.name).toBe('string');
      expect(cat.name.length).toBeGreaterThan(0);
    }
  });

  test('each category has a sourceDir string that points into src/claude/', () => {
    const result = getAssetCategories();

    for (const cat of result) {
      expect(typeof cat.sourceDir).toBe('string');
      expect(cat.sourceDir.startsWith('src/claude/')).toBe(true);
    }
  });

  test('each category has a runtimeDir string that points into .claude/', () => {
    const result = getAssetCategories();

    for (const cat of result) {
      expect(typeof cat.runtimeDir).toBe('string');
      expect(cat.runtimeDir.startsWith('.claude/')).toBe(true);
    }
  });

  test('each category has a non-empty description string', () => {
    const result = getAssetCategories();

    for (const cat of result) {
      expect(typeof cat.description).toBe('string');
      expect(cat.description.length).toBeGreaterThan(0);
    }
  });

  test('category names are unique — no duplicates', () => {
    const result = getAssetCategories();
    const names = result.map(cat => cat.name);
    const uniqueNames = new Set(names);

    expect(uniqueNames.size).toBe(names.length);
  });

  test('no path has a trailing slash', () => {
    const result = getAssetCategories();

    for (const cat of result) {
      expect(cat.sourceDir).not.toMatch(/\/$/);
      expect(cat.runtimeDir).not.toMatch(/\/$/);
    }
  });

  test('all paths use forward slashes — no backslashes', () => {
    const result = getAssetCategories();

    for (const cat of result) {
      expect(cat.sourceDir).not.toContain('\\');
      expect(cat.runtimeDir).not.toContain('\\');
    }
  });

  test('returns the same array reference as ASSET_CATEGORIES', () => {
    const result = getAssetCategories();

    expect(result).toBe(ASSET_CATEGORIES);
  });
});

// ---------------------------------------------------------------------------
// getCategoryByName()
// ---------------------------------------------------------------------------

describe('getCategoryByName()', () => {
  test('returns the agents category when called with "agents"', () => {
    const result = getCategoryByName('agents');

    expect(result).toBeDefined();
    expect(result.name).toBe('agents');
    expect(result.sourceDir).toBe('src/claude/agents');
    expect(result.runtimeDir).toBe('.claude/agents');
  });

  test('returns the commands category when called with "commands"', () => {
    const result = getCategoryByName('commands');

    expect(result).toBeDefined();
    expect(result.name).toBe('commands');
    expect(result.sourceDir).toBe('src/claude/commands');
    expect(result.runtimeDir).toBe('.claude/commands');
  });

  test('returns the skills category when called with "skills"', () => {
    const result = getCategoryByName('skills');

    expect(result).toBeDefined();
    expect(result.name).toBe('skills');
    expect(result.sourceDir).toBe('src/claude/skills');
    expect(result.runtimeDir).toBe('.claude/skills');
  });

  test('returns the workflows category when called with "workflows"', () => {
    const result = getCategoryByName('workflows');

    expect(result).toBeDefined();
    expect(result.name).toBe('workflows');
    expect(result.sourceDir).toBe('src/claude/workflows');
    expect(result.runtimeDir).toBe('.claude/workflows');
  });

  test('returns the scripts category when called with "scripts"', () => {
    const result = getCategoryByName('scripts');

    expect(result).toBeDefined();
    expect(result.name).toBe('scripts');
    expect(result.sourceDir).toBe('src/claude/scripts');
    expect(result.runtimeDir).toBe('.claude/scripts');
  });

  test('returns undefined when given a nonexistent category name', () => {
    const result = getCategoryByName('nonexistent');

    expect(result).toBeUndefined();
  });

  test('returns undefined for an empty string', () => {
    const result = getCategoryByName('');

    expect(result).toBeUndefined();
  });

  test('is case-sensitive — "Agents" does not match the "agents" category', () => {
    const result = getCategoryByName('Agents');

    expect(result).toBeUndefined();
  });

  test('returns a category object with the same shape as entries from getAssetCategories()', () => {
    const result = getCategoryByName('agents');
    const fromList = getAssetCategories().find(cat => cat.name === 'agents');

    expect(result).toBe(fromList);
  });
});
