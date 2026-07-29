'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { writeManifest } = require('../../bin/cli');

const TOOLKIT_VERSION = require('../../package.json').version;

describe('writeManifest()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function readWrittenManifest() {
    const manifestPath = path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json');
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }

  test('creates .claude directory if it does not exist', () => {
    writeManifest(tmpDir, []);
    const claudeDir = path.join(tmpDir, '.claude');
    expect(fs.existsSync(claudeDir)).toBe(true);
  });

  test('writes a valid JSON manifest file', () => {
    writeManifest(tmpDir, []);
    const manifestPath = path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(() => JSON.parse(fs.readFileSync(manifestPath, 'utf8'))).not.toThrow();
  });

  test('manifest contains version matching package.json', () => {
    writeManifest(tmpDir, []);
    const result = readWrittenManifest();
    expect(result.version).toBe(TOOLKIT_VERSION);
  });

  test('manifest contains installedAt as a valid ISO 8601 timestamp', () => {
    const before = Date.now();
    writeManifest(tmpDir, []);
    const after = Date.now();

    const result = readWrittenManifest();
    expect(typeof result.installedAt).toBe('string');
    const ts = new Date(result.installedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  test('manifest files array contains all provided paths', () => {
    const fileList = ['.claude/agents/foo.md', '.claude/skills/bar/SKILL.md'];
    writeManifest(tmpDir, fileList);
    const result = readWrittenManifest();
    expect(result.files).toEqual(fileList);
  });

  test('normalizes backslash paths to forward slashes in manifest files array', () => {
    const fileList = ['.claude\\agents\\foo.md', '.claude\\skills\\bar\\SKILL.md'];
    writeManifest(tmpDir, fileList);
    const result = readWrittenManifest();
    expect(result.files).toEqual(['.claude/agents/foo.md', '.claude/skills/bar/SKILL.md']);
  });

  test('excludes paths whose absolute location is inside the trash directory (local install)', () => {
    // Local install: regular entries have .claude/ prefix; trash entries resolve to
    // <destRoot>/.claude/.ai-toolkit-trash/.claude/agents/old.md
    const trashRel = '.claude/.ai-toolkit-trash/.claude/agents/old.md';
    const keepRel  = '.claude/agents/new.md';
    writeManifest(tmpDir, [trashRel, keepRel]);
    const result = readWrittenManifest();
    expect(result.files).toContain(keepRel);
    expect(result.files).not.toContain(trashRel);
  });

  test('excludes global-install trash entries using absolute path comparison, not string prefix on rel', () => {
    // Global install (destRoot = ~/.claude): regular entries have NO .claude/ prefix
    // (e.g. "agents/foo.md"). Trash entries are ".claude/.ai-toolkit-trash/agents/old.md".
    // AC-12 requires absolute path comparison so global-mode regular entries are never
    // accidentally filtered by a naive string-prefix check on the relative path.
    const trashRel  = '.claude/.ai-toolkit-trash/agents/old.md';
    const keepRel   = 'agents/new.md';
    writeManifest(tmpDir, [trashRel, keepRel]);
    const result = readWrittenManifest();
    expect(result.files).toContain(keepRel);
    expect(result.files).not.toContain(trashRel);
  });

  test('overwrites an existing manifest on second call', () => {
    writeManifest(tmpDir, ['.claude/agents/old.md']);
    writeManifest(tmpDir, ['.claude/agents/new.md']);
    const result = readWrittenManifest();
    expect(result.files).toEqual(['.claude/agents/new.md']);
  });

  test('writes manifest even when fileList is empty', () => {
    writeManifest(tmpDir, []);
    const result = readWrittenManifest();
    expect(result.files).toEqual([]);
  });
});
