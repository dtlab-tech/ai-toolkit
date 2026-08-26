'use strict';

/**
 * validateRuntimeRelativePath.test.js — unit tests for the shared runtime-path
 * safety + canonicalization primitive (FTR-015 hotfix, P1 canonicalization).
 *
 * validateRuntimeRelativePath(value, options) is the single source of truth for
 * path safety used by BOTH resolveClaudeRuntimeAsset() (lenient) and
 * validateManifestFilesField() (strict via requireCanonical). It performs no
 * filesystem access unless a confinement `root` is supplied, and even then only
 * resolves paths logically.
 */

const path = require('path');
const { validateRuntimeRelativePath } = require('../../bin/cli');

describe('validateRuntimeRelativePath() — hard safety rules (both callers)', () => {
  test('rejects null', () => {
    const r = validateRuntimeRelativePath(null);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('not-string');
    expect(r.reason).toMatch(/non-empty string/);
  });

  test('rejects undefined', () => {
    const r = validateRuntimeRelativePath(undefined);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('not-string');
  });

  test('rejects a number', () => {
    const r = validateRuntimeRelativePath(123);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('not-string');
    expect(r.reason).toMatch(/found number/);
  });

  test('rejects an empty string', () => {
    const r = validateRuntimeRelativePath('');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('empty');
    expect(r.reason).toMatch(/empty/);
  });

  test('rejects a null byte', () => {
    const r = validateRuntimeRelativePath('agents/foo\x00.md');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('null-byte');
  });

  test('rejects a whitespace-only string', () => {
    const r = validateRuntimeRelativePath('   ');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('whitespace-only');
  });

  test('rejects leading whitespace', () => {
    const r = validateRuntimeRelativePath(' agents/foo.md');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('surrounding-whitespace');
  });

  test('rejects trailing whitespace', () => {
    const r = validateRuntimeRelativePath('agents/foo.md ');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('surrounding-whitespace');
  });

  test('rejects a Unix absolute path', () => {
    const r = validateRuntimeRelativePath('/etc/passwd');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('absolute-unix');
    expect(r.reason).toMatch(/Unix absolute/);
  });

  test('rejects a Windows absolute path (C:\\...)', () => {
    const r = validateRuntimeRelativePath('C:\\Windows\\system32\\foo.js');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('absolute-windows');
    expect(r.reason).toMatch(/Windows absolute/);
  });

  test('rejects a Windows absolute path with forward slash (C:/...)', () => {
    const r = validateRuntimeRelativePath('C:/Windows/foo.js');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('absolute-windows');
  });

  test('rejects a drive-relative path (C:relative.txt)', () => {
    const r = validateRuntimeRelativePath('C:relative.txt');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('drive-relative');
    expect(r.reason).toMatch(/drive-relative/);
  });

  test('rejects a simple .. traversal', () => {
    const r = validateRuntimeRelativePath('../outside.js');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('traversal');
  });

  test('rejects a nested .. traversal', () => {
    const r = validateRuntimeRelativePath('scripts/../../outside.js');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('traversal');
  });

  test('rejects a .. hidden behind backslashes', () => {
    const r = validateRuntimeRelativePath('scripts\\..\\..\\outside.js');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('traversal');
  });

  test('rejects a value that canonicalizes to empty (".")', () => {
    const r = validateRuntimeRelativePath('.');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('empty-after-canonical');
  });
});

describe('validateRuntimeRelativePath() — canonical computation', () => {
  test('accepts a canonical path and reports no difference', () => {
    const r = validateRuntimeRelativePath('.claude/agents/a.md');
    expect(r.ok).toBe(true);
    expect(r.canonical).toBe('.claude/agents/a.md');
    expect(r.canonicalDiffers).toBe(false);
  });

  test('normalizes backslashes into the canonical form', () => {
    const r = validateRuntimeRelativePath('.claude\\agents\\a.md');
    expect(r.ok).toBe(true);
    expect(r.canonical).toBe('.claude/agents/a.md');
    expect(r.canonicalDiffers).toBe(true);
  });

  test('strips a leading ./ prefix', () => {
    const r = validateRuntimeRelativePath('./.claude/agents/a.md');
    expect(r.ok).toBe(true);
    expect(r.canonical).toBe('.claude/agents/a.md');
    expect(r.canonicalDiffers).toBe(true);
  });

  test('collapses double separators', () => {
    const r = validateRuntimeRelativePath('.claude//agents/a.md');
    expect(r.ok).toBe(true);
    expect(r.canonical).toBe('.claude/agents/a.md');
    expect(r.canonicalDiffers).toBe(true);
  });

  test('drops a trailing slash', () => {
    const r = validateRuntimeRelativePath('.claude/agents/');
    expect(r.ok).toBe(true);
    expect(r.canonical).toBe('.claude/agents');
    expect(r.canonicalDiffers).toBe(true);
  });
});

describe('validateRuntimeRelativePath() — requireCanonical (manifest policy)', () => {
  const withCanonical = v => validateRuntimeRelativePath(v, { requireCanonical: true });

  test('accepts an already-canonical path', () => {
    const r = withCanonical('.claude/agents/a.md');
    expect(r.ok).toBe(true);
  });

  test('rejects backslashes as non-canonical', () => {
    const r = withCanonical('.claude\\agents\\a.md');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('non-canonical');
    expect(r.canonical).toBe('.claude/agents/a.md');
    expect(r.reason).toMatch(/expected '\.claude\/agents\/a\.md'/);
  });

  test('rejects ./ prefix as non-canonical', () => {
    const r = withCanonical('./.claude/agents/a.md');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('non-canonical');
  });

  test('rejects double separators as non-canonical', () => {
    const r = withCanonical('.claude//agents/a.md');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('non-canonical');
  });

  test('rejects a trailing slash as non-canonical', () => {
    const r = withCanonical('.claude/agents/');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('non-canonical');
  });
});

describe('validateRuntimeRelativePath() — confinement (root option)', () => {
  const root = path.resolve('/tmp/install-root');

  test('accepts a path confined within root', () => {
    const r = validateRuntimeRelativePath('.claude/agents/a.md', { root });
    expect(r.ok).toBe(true);
    expect(path.resolve(r.resolved)).toBe(path.resolve(root, '.claude/agents/a.md'));
  });

  test('a .. traversal is rejected before confinement is even considered', () => {
    const r = validateRuntimeRelativePath('../../etc/passwd', { root });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('traversal');
  });
});
