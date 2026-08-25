'use strict';

/**
 * isToolkitInstalled.test.js — unit tests for the shared presence-detection
 * function (FTR-015 hotfix, P1-A / Standards).
 *
 * A toolkit installation is PRESENT at claudeDir when ANY of:
 *   condA: .ai-toolkit-manifest.json exists (content may be corrupt)
 *   condB: .ai-toolkit-version exists
 *   condC: at least one catalog category dir contains one or more files
 * settings.json / settings.local.json alone do NOT satisfy any condition.
 *
 * Isolation: each test builds its own temp .claude dir (beforeEach) and removes
 * it (afterEach) — no shared beforeAll state.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { isToolkitInstalled } = require('../../bin/cli');

let tmpRoot;
let claudeDir;

beforeEach(() => {
  tmpRoot   = fs.mkdtempSync(path.join(os.tmpdir(), 'is-installed-'));
  claudeDir = path.join(tmpRoot, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('isToolkitInstalled()', () => {
  test('false for an empty .claude directory', () => {
    expect(isToolkitInstalled(claudeDir)).toBe(false);
  });

  test('false for a non-existent directory', () => {
    expect(isToolkitInstalled(path.join(tmpRoot, 'nope'))).toBe(false);
  });

  test('condA: true when a manifest exists (even if empty/corrupt)', () => {
    fs.writeFileSync(path.join(claudeDir, '.ai-toolkit-manifest.json'), 'not valid json {{');
    expect(isToolkitInstalled(claudeDir)).toBe(true);
  });

  test('condB: true when only a version stamp exists', () => {
    fs.writeFileSync(path.join(claudeDir, '.ai-toolkit-version'), '1.0.0');
    expect(isToolkitInstalled(claudeDir)).toBe(true);
  });

  test('condC: true when only category payload files exist', () => {
    const agentsDir = path.join(claudeDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'x.md'), '# x');
    expect(isToolkitInstalled(claudeDir)).toBe(true);
  });

  test('settings files alone do NOT satisfy any condition', () => {
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');
    fs.writeFileSync(path.join(claudeDir, 'settings.local.json'), '{}');
    expect(isToolkitInstalled(claudeDir)).toBe(false);
  });

  test('true when multiple conditions are satisfied together', () => {
    fs.writeFileSync(path.join(claudeDir, '.ai-toolkit-manifest.json'), '{}');
    fs.writeFileSync(path.join(claudeDir, '.ai-toolkit-version'), '1.0.0');
    const agentsDir = path.join(claudeDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'x.md'), '# x');
    expect(isToolkitInstalled(claudeDir)).toBe(true);
  });
});
