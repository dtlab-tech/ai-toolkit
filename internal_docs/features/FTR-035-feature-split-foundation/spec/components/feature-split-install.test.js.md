# tests/scripts/feature-split-install.test.js — New

## Change

New test file that checks the distribution rule in D-06: the default `feature-split.config.json` ships with the `scripts` category and is installed by the existing installer, with no installer change. It contains two checks. The first asserts that the source file exists at `src/claude/scripts/feature-split.config.json`, the directory the installer copies from. The second runs the installer against an empty temporary directory with `ai-toolkit --local <dir>` and asserts that the config lands at `.claude/scripts/feature-split.config.json` with identical bytes. The file imports no product code and does not validate config values; those belong to `tests/scripts/feature-split.test.js` (UC-01). The file is outside the installed tree (`tests/`), so it is not shipped. Open gaps for the host, none of which feature.md decides: (a) the excerpt does not give the installer entry point or how `ai-toolkit` is invoked from a Node test on Windows, so the helper below assumes a spawn of the package's bin entry and must be confirmed; (b) the test runner and module system are not stated, so the code assumes `node:test` with ESM and must be checked against the existing `tests/scripts/*.test.js`; (c) the text of AC-09 is not in the excerpt, so the mapping to this file is taken from D-06.

## Algorithm

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourceConfig = path.join(repoRoot, 'src', 'claude', 'scripts', 'feature-split.config.json');

let targetDir;
let runResult;

before(() => {
  // Empty, freshly created directory: the installer must populate it.
  targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft035-install-'));
  // Assumed invocation of the package bin; confirm the entry point (see Change, gap a).
  runResult = spawnSync('ai-toolkit', ['--local', targetDir], { encoding: 'utf8', shell: true });
});

after(() => {
  fs.rmSync(targetDir, { recursive: true, force: true });
});

test('default config exists in the scripts source directory the installer copies from', () => {
  const stat = fs.statSync(sourceConfig);
  assert.ok(stat.isFile(), `expected a regular file at ${sourceConfig}`);
});

test('ai-toolkit --local <empty dir> exits 0', () => {
  assert.equal(runResult.status, 0,
    `installer failed\nstdout: ${runResult.stdout}\nstderr: ${runResult.stderr}`);
});

test('installed config is placed under .claude/scripts/ and is byte-identical to the source', () => {
  const installed = path.join(targetDir, '.claude', 'scripts', 'feature-split.config.json');
  assert.ok(fs.existsSync(installed), `missing ${installed}`);
  assert.deepEqual(fs.readFileSync(installed), fs.readFileSync(sourceConfig));
});

test('no .test.js file is installed under .claude/scripts/', () => {
  const dir = path.join(targetDir, '.claude', 'scripts');
  const testFiles = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => name.endsWith('.test.js'))
    : [];
  assert.deepEqual(testFiles, []);
});
```

## Tests

- **File:** `tests/scripts/feature-split-install.test.js` (new). It is the only test file this component requires. It is run with the same command as the other `tests/scripts/` files.
- **Key cases:**
  1. The default config is a regular file at `src/claude/scripts/feature-split.config.json`. This covers the source side of D-06.
  2. Running `ai-toolkit --local <empty dir>` exits with status 0. A non-zero exit fails the test and prints the installer's stdout and stderr.
  3. The config is installed at `<dir>/.claude/scripts/feature-split.config.json` and its bytes match the source. This covers the second half of D-06.
  4. No `*.test.js` file appears under `.claude/scripts/` after install. This confirms that test files stay outside the installed tree, as D-06 requires.
- **Setup and teardown:** the target is a fresh directory from `fs.mkdtempSync` under the OS temp directory. It is removed recursively in `after`, so the test leaves nothing behind.
- **Not covered here:** config values, overlay behaviour and error types are tested in `tests/scripts/feature-split.test.js`. This file asserts only placement and distribution.