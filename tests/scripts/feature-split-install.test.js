'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// Installer run spawns the full local install; allow more than the Jest default.
jest.setTimeout(60000);

const REPO_ROOT     = path.join(__dirname, '..', '..');
const SOURCE_CONFIG = path.join(REPO_ROOT, 'src', 'claude', 'scripts', 'feature-split.config.json');
const CLI_BIN       = path.join(REPO_ROOT, 'bin', 'cli.js');

describe('feature-split.config.json distribution (D-06)', () => {
  let targetDir;
  let runResult;

  beforeAll(() => {
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft035-install-'));
    runResult = spawnSync(process.execPath, [CLI_BIN, '--local', targetDir], { encoding: 'utf8' });
  });

  afterAll(() => {
    fs.rmSync(targetDir, { recursive: true, force: true });
  });

  test('default config exists as a regular file in src/claude/scripts', () => {
    // Arrange: SOURCE_CONFIG resolved above. Act: stat it. Assert: it is a file.
    expect(fs.statSync(SOURCE_CONFIG).isFile()).toBe(true);
  });

  test('ai-toolkit --local on an empty directory exits with status 0', () => {
    // Arrange/Act: installer run in beforeAll. Assert: clean exit.
    expect(runResult.status).toBe(0);
  });

  test('installed config is placed at .claude/scripts/feature-split.config.json', () => {
    // Arrange: installed path. Act: check existence. Assert: file present.
    const installed = path.join(targetDir, '.claude', 'scripts', 'feature-split.config.json');
    expect(fs.existsSync(installed)).toBe(true);
  });

  test('installed config is byte-identical to the source config', () => {
    // Arrange: source and installed paths. Act: read both as buffers. Assert: equal bytes.
    const installed = path.join(targetDir, '.claude', 'scripts', 'feature-split.config.json');
    expect(fs.readFileSync(installed).equals(fs.readFileSync(SOURCE_CONFIG))).toBe(true);
  });
});
