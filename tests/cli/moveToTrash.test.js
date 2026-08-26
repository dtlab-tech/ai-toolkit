'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { moveToTrash } = require('../../bin/cli');

// Helper: recursively list all files under a directory.
function walkDirSync(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) results.push(...walkDirSync(full));
    else results.push(full);
  }
  return results;
}

// Helper: find the trashed copy of a file given its original relative path.
// moveToTrash places it under .claude/.ai-toolkit-trash/<timestamp>/<relPath>,
// so we do a suffix-match walk to stay timestamp-agnostic.
function findInTrash(destRoot, relPath) {
  const trashBase = path.join(destRoot, '.claude', '.ai-toolkit-trash');
  const suffix    = relPath.replace(/\\/g, '/');
  return walkDirSync(trashBase).find(f => f.replace(/\\/g, '/').endsWith(suffix)) || null;
}

describe('moveToTrash()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('moves file to trash directory preserving relative path under a timestamp subdir', () => {
    const relPath = '.claude/skills/old-skill/SKILL.md';
    const sourcePath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'old skill content');

    moveToTrash(tmpDir, relPath);

    const trashFile = findInTrash(tmpDir, relPath);
    expect(trashFile).not.toBeNull();
    expect(fs.readFileSync(trashFile, 'utf8')).toBe('old skill content');
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

    const trashFile = findInTrash(tmpDir, relPath);
    expect(trashFile).not.toBeNull();
  });

  test('silently skips when source file does not exist', () => {
    const relPath = '.claude/agents/nonexistent.md';
    expect(() => moveToTrash(tmpDir, relPath)).not.toThrow();
    const trashBase = path.join(tmpDir, '.claude', '.ai-toolkit-trash');
    expect(walkDirSync(trashBase)).toHaveLength(0);
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

    const trashFile = findInTrash(tmpDir, relPath);
    expect(trashFile).not.toBeNull();
    expect(fs.readFileSync(trashFile, 'utf8')).toBe('agent content');
    expect(fs.existsSync(sourcePath)).toBe(false);
  });
});
