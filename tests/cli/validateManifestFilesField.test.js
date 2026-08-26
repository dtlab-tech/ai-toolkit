'use strict';

/**
 * validateManifestFilesField.test.js — unit tests for the doctor's manifest
 * 'files' schema validator (FTR-015 hotfix, P1 canonicalization).
 *
 * validateManifestFilesField(files, destRoot) returns an array of human-readable
 * error strings (empty === valid). It delegates per-entry safety and canonical
 * checks to validateRuntimeRelativePath with requireCanonical:true, so any
 * non-canonical entry is reported rather than silently normalized.
 */

const path = require('path');
const { validateManifestFilesField } = require('../../bin/cli');

const ROOT = path.resolve('/tmp/install-root');

/** Assert exactly one error is produced and return it. */
function onlyError(files) {
  const errs = validateManifestFilesField(files, ROOT);
  expect(errs).toHaveLength(1);
  return errs[0];
}

describe('validateManifestFilesField() — non-array field', () => {
  test('a string field is rejected', () => {
    const errs = validateManifestFilesField('not-an-array', ROOT);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/'files' must be an array \(found string\)/);
  });

  test('an object field is rejected', () => {
    const errs = validateManifestFilesField({ nope: true }, ROOT);
    expect(errs[0]).toMatch(/'files' must be an array \(found object\)/);
  });

  test('null is rejected', () => {
    const errs = validateManifestFilesField(null, ROOT);
    expect(errs[0]).toMatch(/'files' must be an array \(found null\)/);
  });
});

describe('validateManifestFilesField() — per-entry rejections', () => {
  test('accepts a fully valid canonical array', () => {
    const errs = validateManifestFilesField(
      ['.claude/agents/a.md', '.claude/skills/s/SKILL.md', '.claude/scripts/x.js'],
      ROOT
    );
    expect(errs).toEqual([]);
  });

  test('a number among valid entries is flagged by index', () => {
    const errs = validateManifestFilesField(['.claude/agents/a.md', 123], ROOT);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/files\[1\].*string/);
  });

  test('an empty string is rejected', () => {
    expect(onlyError([''])).toMatch(/files\[0\].*empty/);
  });

  test('a whitespace-only string is rejected', () => {
    expect(onlyError(['   '])).toMatch(/files\[0\]/);
  });

  test('leading/trailing whitespace is rejected', () => {
    expect(onlyError([' .claude/agents/a.md'])).toMatch(/files\[0\]/);
  });

  test('a backslash path is rejected as non-canonical', () => {
    const e = onlyError(['.claude\\agents\\a.md']);
    expect(e).toMatch(/files\[0\].*is not canonical/);
    expect(e).toMatch(/expected '\.claude\/agents\/a\.md'/);
  });

  test('a ./ prefix is rejected as non-canonical', () => {
    expect(onlyError(['./.claude/agents/a.md'])).toMatch(/files\[0\].*is not canonical/);
  });

  test('double separators are rejected as non-canonical', () => {
    expect(onlyError(['.claude//agents/a.md'])).toMatch(/files\[0\].*is not canonical/);
  });

  test('a trailing slash is rejected as non-canonical', () => {
    expect(onlyError(['.claude/agents/'])).toMatch(/files\[0\].*is not canonical/);
  });

  test('a drive-relative path (C:relative.txt) is rejected', () => {
    expect(onlyError(['C:relative.txt'])).toMatch(/files\[0\].*drive-relative/);
  });

  test('a Windows absolute path is rejected', () => {
    expect(onlyError(['C:\\Windows\\foo.txt'])).toMatch(/files\[0\].*Windows absolute/);
  });

  test('a Unix absolute path is rejected', () => {
    expect(onlyError(['/etc/passwd'])).toMatch(/files\[0\].*Unix absolute/);
  });

  test('a "." segment (lone dot) is rejected', () => {
    expect(onlyError(['.'])).toMatch(/files\[0\]/);
  });

  test('a ".." segment is rejected as traversal', () => {
    expect(onlyError(['../../etc/passwd'])).toMatch(/files\[0\].*'\.\.'/);
  });

  test('a null byte is rejected', () => {
    expect(onlyError(['.claude/agents/a\x00.md'])).toMatch(/files\[0\].*null byte/);
  });

  test('an out-of-root absolute entry is rejected via the absolute branch', () => {
    // An out-of-root value can only be absolute or use '..'; both are rejected by
    // the syntactic checks before confinement, so the diagnostic reports the
    // absolute path — not a confinement ('escapes the installation root') error.
    expect(onlyError(['/outside/root/file.md'])).toMatch(/files\[0\].*Unix absolute/);
  });

  test('a rooted Windows entry (\\Windows\\x.md) is rejected as absolute', () => {
    expect(onlyError(['\\Windows\\x.md'])).toMatch(/files\[0\].*Unix absolute/);
  });

  test('a UNC entry (\\\\server\\share) is rejected as absolute', () => {
    expect(onlyError(['\\\\server\\share\\x.md'])).toMatch(/files\[0\].*Unix absolute/);
  });

  test('reports only the single invalid entry in an otherwise valid array', () => {
    const errs = validateManifestFilesField(
      ['.claude/agents/a.md', '.claude\\skills\\bad.md', '.claude/scripts/x.js'],
      ROOT
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/files\[1\].*is not canonical/);
  });
});
