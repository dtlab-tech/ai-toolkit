'use strict';

/**
 * hasToolkitPayloadFiles.test.js — unit tests for the shared condC presence
 * helper (FTR-015 hotfix, P1-A / Standards).
 *
 * hasToolkitPayloadFiles(claudeDir) returns true when at least one catalog
 * category directory inside claudeDir contains one or more files. It underpins
 * isToolkitInstalled and is shared by resolver, doctor, and list-assets.
 *
 * Isolation: each test builds its own temp .claude dir (beforeEach) and removes
 * it (afterEach) — no shared beforeAll state.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { hasToolkitPayloadFiles } = require('../../bin/cli');

let tmpRoot;
let claudeDir;

beforeEach(() => {
  tmpRoot   = fs.mkdtempSync(path.join(os.tmpdir(), 'has-payload-'));
  claudeDir = path.join(tmpRoot, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('hasToolkitPayloadFiles()', () => {
  test('false for an empty .claude directory', () => {
    expect(hasToolkitPayloadFiles(claudeDir)).toBe(false);
  });

  test('false for a non-existent directory', () => {
    expect(hasToolkitPayloadFiles(path.join(tmpRoot, 'nope'))).toBe(false);
  });

  test('false when only a manifest / version stamp exists (no category files)', () => {
    fs.writeFileSync(path.join(claudeDir, '.ai-toolkit-manifest.json'), '{}');
    fs.writeFileSync(path.join(claudeDir, '.ai-toolkit-version'), '1.0.0');
    expect(hasToolkitPayloadFiles(claudeDir)).toBe(false);
  });

  test('false when a category directory exists but is empty', () => {
    fs.mkdirSync(path.join(claudeDir, 'agents'), { recursive: true });
    expect(hasToolkitPayloadFiles(claudeDir)).toBe(false);
  });

  test('true when a category directory contains at least one file', () => {
    const agentsDir = path.join(claudeDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'x.md'), '# x');
    expect(hasToolkitPayloadFiles(claudeDir)).toBe(true);
  });

  test('true when a nested file exists under a category directory', () => {
    const nested = path.join(claudeDir, 'skills', 'my-skill');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, 'SKILL.md'), '# skill');
    expect(hasToolkitPayloadFiles(claudeDir)).toBe(true);
  });

  test('false when files exist only in a non-catalog directory', () => {
    const foreign = path.join(claudeDir, 'not-a-category');
    fs.mkdirSync(foreign, { recursive: true });
    fs.writeFileSync(path.join(foreign, 'file.txt'), 'data');
    expect(hasToolkitPayloadFiles(claudeDir)).toBe(false);
  });
});
