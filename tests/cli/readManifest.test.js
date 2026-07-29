'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { readManifest } = require('../../bin/cli');

describe('readManifest()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns { files: [] } when no manifest file exists', () => {
    const result = readManifest(tmpDir);
    expect(result).toEqual({ files: [] });
  });

  test('returns parsed object when manifest is valid JSON', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir);
    const manifest = {
      version: '0.7.0',
      installedAt: '2026-07-29T10:00:00.000Z',
      files: ['.claude/agents/foo.md', '.claude/skills/bar/SKILL.md'],
    };
    fs.writeFileSync(
      path.join(claudeDir, '.ai-toolkit-manifest.json'),
      JSON.stringify(manifest),
      'utf8'
    );

    const result = readManifest(tmpDir);
    expect(result.version).toBe('0.7.0');
    expect(result.installedAt).toBe('2026-07-29T10:00:00.000Z');
    expect(result.files).toEqual(['.claude/agents/foo.md', '.claude/skills/bar/SKILL.md']);
  });

  test('returns { files: [] } when manifest is corrupt JSON', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(
      path.join(claudeDir, '.ai-toolkit-manifest.json'),
      '{ this is not json !!!',
      'utf8'
    );

    const result = readManifest(tmpDir);
    expect(result).toEqual({ files: [] });
  });

  test('logs a warning when manifest is corrupt JSON', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(
      path.join(claudeDir, '.ai-toolkit-manifest.json'),
      '{ this is not json !!!',
      'utf8'
    );

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      readManifest(tmpDir);
      // The warning message is wrapped in dim() ANSI escape codes; verify the key text is present
      const calls = consoleSpy.mock.calls.map(args => args.join(' '));
      const hasWarning = calls.some(msg => msg.includes('Previous manifest is corrupt'));
      expect(hasWarning).toBe(true);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  test('normalizes backslash paths to forward slashes on read', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir);
    const manifest = {
      version: '0.7.0',
      installedAt: '2026-07-29T10:00:00.000Z',
      files: ['.claude\\agents\\foo.md', '.claude\\skills\\bar\\SKILL.md'],
    };
    fs.writeFileSync(
      path.join(claudeDir, '.ai-toolkit-manifest.json'),
      JSON.stringify(manifest),
      'utf8'
    );

    const result = readManifest(tmpDir);
    expect(result.files).toEqual(['.claude/agents/foo.md', '.claude/skills/bar/SKILL.md']);
  });
});
