'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { moveToTrash } = require('../../bin/cli');

describe('moveToTrash()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('moves file to trash directory preserving relative path', () => {
    const relPath = '.claude/skills/old-skill/SKILL.md';
    const sourcePath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'old skill content');

    moveToTrash(tmpDir, relPath);

    const trashPath = path.join(tmpDir, '.claude', '.ai-toolkit-trash', relPath);
    expect(fs.existsSync(trashPath)).toBe(true);
    expect(fs.readFileSync(trashPath, 'utf8')).toBe('old skill content');
  });

  test('source file no longer exists at original location after move', () => {
    const relPath = '.claude/agents/old-agent.md';
    const sourcePath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'agent body');

    moveToTrash(tmpDir, relPath);

    expect(fs.existsSync(sourcePath)).toBe(false);
  });

  test('creates intermediate trash directories as needed', () => {
    const relPath = '.claude/workflows/deeply/nested/file.js';
    const sourcePath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'workflow content');

    moveToTrash(tmpDir, relPath);

    const trashPath = path.join(tmpDir, '.claude', '.ai-toolkit-trash', relPath);
    expect(fs.existsSync(trashPath)).toBe(true);
  });

  test('silently skips when source file does not exist', () => {
    const relPath = '.claude/agents/nonexistent.md';
    expect(() => moveToTrash(tmpDir, relPath)).not.toThrow();
    const trashPath = path.join(tmpDir, '.claude', '.ai-toolkit-trash', relPath);
    expect(fs.existsSync(trashPath)).toBe(false);
  });

  test('cross-device EXDEV fallback copies and deletes when rename fails', () => {
    const relPath = '.claude/agents/old-agent.md';
    const sourcePath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'agent content');

    const origRename = fs.renameSync;
    fs.renameSync = () => { const err = new Error('EXDEV'); err.code = 'EXDEV'; throw err; };

    try {
      moveToTrash(tmpDir, relPath);
    } finally {
      fs.renameSync = origRename;
    }

    const trashPath = path.join(tmpDir, '.claude', '.ai-toolkit-trash', relPath);
    expect(fs.existsSync(trashPath)).toBe(true);
    expect(fs.readFileSync(trashPath, 'utf8')).toBe('agent content');
    expect(fs.existsSync(sourcePath)).toBe(false);
  });
});
