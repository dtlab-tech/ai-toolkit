'use strict';

// Re-resolves the Claude CLI executable when the configured path is gone.
//
// Why: a VS Code extension update deletes the versioned folder that holds claude.exe
// (anthropic.claude-code-2.1.318-... becomes ...-2.1.319-...), so a path that was valid when
// `executor start` was launched can vanish mid-run. docs/task-executor-bootstrap.md section 2
// already defines the discovery procedure; this module is that procedure as code.
//
// Rules kept from the document:
//   - a candidate is trusted only after `<path> --version` exits 0;
//   - exactly one valid candidate may be used without asking; zero or several are NOT guessed:
//     the caller gets the list and stops with a clear environment error.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function _exeName(platform) {
  return platform === 'win32' ? 'claude.exe' : 'claude';
}

function _isFile(p, fsApi) {
  try { return fsApi.statSync(p).isFile(); } catch (_) { return false; }
}

function _listDir(dir, fsApi) {
  try { return fsApi.readdirSync(dir); } catch (_) { return []; }
}

// Version tuple from a folder name such as "anthropic.claude-code-2.1.322-win32-x64".
function _versionOf(name) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(name);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

function _compareVersionsDesc(a, b) {
  const va = _versionOf(a);
  const vb = _versionOf(b);
  for (let i = 0; i < 3; i += 1) {
    if (va[i] !== vb[i]) return vb[i] - va[i];
  }
  return 0;
}

/**
 * Lists the places a Claude CLI executable is known to live, newest extension version first.
 * Does not run anything: existence only.
 *
 * @param {object} [options] - { platform, env, homedir, fsApi } (all injectable for tests).
 * @returns {string[]} distinct absolute paths of existing files.
 */
function listCandidates(options) {
  options = options || {};
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const home = options.homedir || os.homedir();
  const fsApi = options.fsApi || fs;
  const exe = _exeName(platform);
  const found = [];
  const add = function (p) {
    if (_isFile(p, fsApi) && found.indexOf(p) === -1) found.push(p);
  };

  // 1. VS Code-family extension: <home>/.vscode*/extensions/anthropic.claude-code-*/resources/native-binary/claude[.exe]
  _listDir(home, fsApi).filter(function (n) { return /^\.vscode/.test(n); }).forEach(function (editorDir) {
    const extRoot = path.join(home, editorDir, 'extensions');
    _listDir(extRoot, fsApi)
      .filter(function (n) { return /^anthropic\.claude-code-/.test(n); })
      .sort(_compareVersionsDesc)
      .forEach(function (n) { add(path.join(extRoot, n, 'resources', 'native-binary', exe)); });
  });

  // 2. Editor-cached Agent SDK binary: <userdata>/Code/agent-host/sdk-cache/claude/<ver>/<platform>/node_modules/@anthropic-ai/claude-agent-sdk-*/claude[.exe]
  const userData = platform === 'win32'
    ? (env.APPDATA ? path.join(env.APPDATA, 'Code') : null)
    : (platform === 'darwin' ? path.join(home, 'Library', 'Application Support', 'Code') : path.join(home, '.config', 'Code'));
  if (userData) {
    const cacheRoot = path.join(userData, 'agent-host', 'sdk-cache', 'claude');
    _listDir(cacheRoot, fsApi).sort(_compareVersionsDesc).forEach(function (ver) {
      _listDir(path.join(cacheRoot, ver), fsApi).forEach(function (plat) {
        const modules = path.join(cacheRoot, ver, plat, 'node_modules', '@anthropic-ai');
        _listDir(modules, fsApi)
          .filter(function (n) { return /^claude-agent-sdk-/.test(n); })
          .forEach(function (n) { add(path.join(modules, n, exe)); });
      });
    });
  }

  // 3. A standalone install on PATH.
  String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean).forEach(function (dir) {
    add(path.join(dir, exe));
  });

  return found;
}

function _runsAsClaude(candidate, options) {
  if (typeof options.probe === 'function') return options.probe(candidate);
  const res = spawnSync(candidate, ['--version'], { shell: false, encoding: 'utf8', timeout: 20000, windowsHide: true });
  return !res.error && res.status === 0;
}

/**
 * Returns a usable Claude CLI path.
 *   - the configured path, untouched, when it is still a file;
 *   - otherwise the single discovered candidate that answers `--version`;
 *   - otherwise `path: null` and the candidates found, so the caller can ask the user.
 *
 * @returns {{path: string|null, rediscovered: boolean, candidates: string[]}}
 */
function ensureClaudePath(configuredPath, options) {
  options = options || {};
  const fsApi = options.fsApi || fs;
  if (typeof configuredPath === 'string' && configuredPath.length > 0 && _isFile(configuredPath, fsApi)) {
    return { path: configuredPath, rediscovered: false, candidates: [] };
  }
  const candidates = listCandidates(options);
  const working = candidates.filter(function (c) { return _runsAsClaude(c, options); });
  if (working.length === 1) return { path: working[0], rediscovered: true, candidates: candidates };
  return { path: null, rediscovered: false, candidates: candidates };
}

module.exports = { listCandidates, ensureClaudePath };
