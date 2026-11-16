'use strict';

// claude-locator: re-resolves the Claude executable when the configured path is gone.
// Everything runs on an in-memory file tree: no real file system, no real process.

const path = require('path');
const { listCandidates, ensureClaudePath } = require('../../lib/task-executor/claude-locator');

const HOME = path.join(path.sep, 'home', 'u');

// A fake fs over a set of absolute file paths: statSync/readdirSync derive directories from them.
function fakeFs(files) {
  const all = files.map((f) => path.normalize(f));
  const isFile = (p) => all.includes(path.normalize(p));
  const childrenOf = (dir) => {
    const d = path.normalize(dir) + path.sep;
    const names = new Set();
    all.forEach((f) => { if (f.startsWith(d)) names.add(f.slice(d.length).split(path.sep)[0]); });
    return [...names];
  };
  return {
    statSync(p) {
      if (isFile(p)) return { isFile: () => true };
      if (childrenOf(p).length > 0) return { isFile: () => false };
      const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e;
    },
    readdirSync(p) {
      const kids = childrenOf(p);
      if (kids.length === 0) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return kids;
    },
  };
}

const ext = (version) => path.join(HOME, '.vscode', 'extensions', 'anthropic.claude-code-' + version + '-linux-x64', 'resources', 'native-binary', 'claude');

describe('listCandidates', () => {
  test('finds the VS Code extension binary, newest version first', () => {
    const fsApi = fakeFs([ext('2.1.9'), ext('2.1.322'), ext('2.1.100')]);
    const found = listCandidates({ platform: 'linux', env: {}, homedir: HOME, fsApi });
    expect(found).toEqual([ext('2.1.322'), ext('2.1.100'), ext('2.1.9')]);
  });

  test('finds a standalone install on PATH and does not repeat a path', () => {
    const bin = path.join(path.sep, 'usr', 'local', 'bin', 'claude');
    const fsApi = fakeFs([bin]);
    const dir = path.dirname(bin);
    const found = listCandidates({ platform: 'linux', env: { PATH: dir + path.delimiter + dir }, homedir: HOME, fsApi });
    expect(found).toEqual([bin]);
  });

  test('finds the editor-cached Agent SDK binary', () => {
    const sdk = path.join(HOME, '.config', 'Code', 'agent-host', 'sdk-cache', 'claude', '0.3.220', 'linux-x64', 'node_modules', '@anthropic-ai', 'claude-agent-sdk-linux-x64', 'claude');
    const found = listCandidates({ platform: 'linux', env: {}, homedir: HOME, fsApi: fakeFs([sdk]) });
    expect(found).toEqual([sdk]);
  });

  test('finds nothing on an empty machine', () => {
    expect(listCandidates({ platform: 'linux', env: {}, homedir: HOME, fsApi: fakeFs([]) })).toEqual([]);
  });
});

describe('ensureClaudePath', () => {
  test('a configured path that is still a file is returned untouched and nothing is probed', () => {
    const probe = jest.fn();
    const configured = ext('2.1.322');
    const res = ensureClaudePath(configured, { platform: 'linux', env: {}, homedir: HOME, fsApi: fakeFs([configured]), probe });
    expect(res).toEqual({ path: configured, rediscovered: false, candidates: [] });
    expect(probe).not.toHaveBeenCalled();
  });

  test('the extension was updated: the old folder is gone and the single new binary is used', () => {
    const res = ensureClaudePath(ext('2.1.318'), { platform: 'linux', env: {}, homedir: HOME, fsApi: fakeFs([ext('2.1.319')]), probe: () => true });
    expect(res.path).toBe(ext('2.1.319'));
    expect(res.rediscovered).toBe(true);
  });

  test('a candidate that does not answer --version is not trusted', () => {
    const res = ensureClaudePath(undefined, { platform: 'linux', env: {}, homedir: HOME, fsApi: fakeFs([ext('2.1.319')]), probe: () => false });
    expect(res.path).toBeNull();
    expect(res.candidates).toEqual([ext('2.1.319')]);
  });

  test('two working candidates are not guessed: the caller gets the list', () => {
    const res = ensureClaudePath('/gone/claude', { platform: 'linux', env: {}, homedir: HOME, fsApi: fakeFs([ext('2.1.319'), ext('2.1.320')]), probe: () => true });
    expect(res.path).toBeNull();
    expect(res.rediscovered).toBe(false);
    expect(res.candidates).toHaveLength(2);
  });

  test('nothing found returns no path and an empty list', () => {
    const res = ensureClaudePath('/gone/claude', { platform: 'linux', env: {}, homedir: HOME, fsApi: fakeFs([]), probe: () => true });
    expect(res).toEqual({ path: null, rediscovered: false, candidates: [] });
  });
});
