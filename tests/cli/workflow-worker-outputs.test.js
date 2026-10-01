'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveOutputPath } = require('../../lib/workflow-worker-outputs');

describe('resolveOutputPath()', () => {
  let root;
  // realpath.native, matching how createControl()/feature() canonicalize root and every
  // featureDir-derived output.path in real usage — resolveOutputPath() itself assumes
  // both are already in the same form (see its own file-level comment for why).
  beforeEach(() => { root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-worker-outputs-'))); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('resolves a normal nested deliverable to its canonical absolute path', () => {
    fs.mkdirSync(path.join(root, 'FTR-099-slug'), { recursive: true });
    expect(resolveOutputPath(root, { path: 'FTR-099-slug/FTR-099-Requirements.md' }))
      .toBe(path.join(root, 'FTR-099-slug', 'FTR-099-Requirements.md'));
  });

  test.each(['.git/config', '.claude/settings.json', '.codex/config.toml'])(
    'tool-config directories can never become a worker output target: %s', name => {
      expect(() => resolveOutputPath(root, { path: name })).toThrow('Unsupported');
    });

  test('a declared output cannot escape the project root', () => {
    expect(() => resolveOutputPath(root, { path: '../outside.md' })).toThrow('inside the project');
  });

  test('a target reached through a symlinked directory is rejected', () => {
    const real = path.join(root, 'real-dir'); fs.mkdirSync(real);
    const link = path.join(root, 'linked-dir');
    try { fs.symlinkSync(real, link, 'junction'); }
    catch (error) { if (error.code === 'EPERM') return; throw error; } // unprivileged CI: skip silently
    expect(() => resolveOutputPath(root, { path: 'linked-dir/file.md' })).toThrow('symlink');
  });
});
