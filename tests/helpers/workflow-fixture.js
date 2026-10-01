'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { CATALOG } = require('../../lib/agent-registry');
function fixture() {
  // realpath.native: os.tmpdir() is often an 8.3 short-form path (e.g. a Windows
  // username with a space aliases to C:\Users\SHORTN~1\...); createControl()
  // normalizes its own root the same way, so the fixture must match or every
  // evidence/cwd assertion below would compare a short-form path against a
  // long-form one.
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'workflow control ')));
  const home = path.join(root, 'empty-home');
  fs.mkdirSync(home);
  const files = [], fileHashes = {};
  const install = (relative, content) => {
    const dest = path.join(root, relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, content);
    files.push(relative); fileHashes[relative] = 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
  };
  const source = path.join(__dirname, '../../src/claude');
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, item.name);
      if (item.isDirectory()) walk(p);
      else install('.claude/' + path.relative(source, p).replace(/\\/g, '/'), fs.readFileSync(p));
    }
  }
  walk(source);
  fs.writeFileSync(path.join(root, '.claude/.ai-toolkit-version'), require('../../package.json').version);
  fs.writeFileSync(path.join(root, '.claude/.ai-toolkit-manifest.json'), JSON.stringify({ version: require('../../package.json').version, installedAt: new Date().toISOString(), installationMode: 'local', files, fileHashes }));
  const dir = path.join(root, 'FTR-099-space & quotes'); fs.mkdirSync(dir);
  const feature = path.join(dir, 'feature.md'); fs.writeFileSync(feature, '# Test feature\n');
  return { root, home, dir, feature, options: { projectDir: root, home, diagnosticsDir: path.join(root, 'worker-evidence') },
    entries: () => JSON.parse(fs.readFileSync(path.join(dir, 'FTR-099-token-ledger.json'), 'utf8')),
    clean: () => fs.rmSync(root, { recursive: true, force: true }) };
}
module.exports = { fixture };
