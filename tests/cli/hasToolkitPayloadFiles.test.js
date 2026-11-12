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

  test('true when a category directory contains a file the toolkit ships', () => {
    const agentsDir = path.join(claudeDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'gaia-define-feature.md'), '# x');
    expect(hasToolkitPayloadFiles(claudeDir)).toBe(true);
  });

  test('false when a category directory contains only files of the project itself', () => {
    const agentsDir = path.join(claudeDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'my-own-agent.md'), '# x');
    expect(hasToolkitPayloadFiles(claudeDir)).toBe(false);
  });

  test('false for a project skill of its own (the case of a project that only has its own skill)', () => {
    const own = path.join(claudeDir, 'skills', 'kb-config');
    fs.mkdirSync(own, { recursive: true });
    fs.writeFileSync(path.join(own, 'SKILL.md'), '# kb');
    fs.writeFileSync(path.join(claudeDir, 'scheduled_tasks.lock'), '');
    expect(hasToolkitPayloadFiles(claudeDir)).toBe(false);
  });

  test('a project file next to a shipped one does not change the answer, and a file with a shipped name counts', () => {
    const own = path.join(claudeDir, 'skills', 'kb-config');
    fs.mkdirSync(own, { recursive: true });
    fs.writeFileSync(path.join(own, 'SKILL.md'), '# kb');
    expect(hasToolkitPayloadFiles(claudeDir)).toBe(false);
    const shipped = path.join(claudeDir, 'skills', 'define-feature');
    fs.mkdirSync(shipped, { recursive: true });
    fs.writeFileSync(path.join(shipped, 'SKILL.md'), '# shipped');
    expect(hasToolkitPayloadFiles(claudeDir)).toBe(true);
  });

  test('true when a nested file the toolkit ships exists under a category directory', () => {
    const nested = path.join(claudeDir, 'skills', 'define-feature');
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
