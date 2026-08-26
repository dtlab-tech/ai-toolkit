'use strict';

/**
 * verify-install.test.js — tests for the `verify-install` CLI command (FTR-015 hotfix, P1-5).
 *
 * verify-install reads <home>/.claude/.ai-toolkit-version and compares it with
 * the version declared in package.json.
 *
 * Contract:
 *   - Exit 0 + stdout "PASS" when stamp equals package.json version
 *   - Exit 1 + stderr when stamp is missing
 *   - Exit 1 + stderr when stamp is empty
 *   - Exit 1 + stderr when stamp differs from package.json version
 */

const { spawnSync } = require('child_process');
const fs            = require('fs');
const os            = require('os');
const path          = require('path');

const TOOLKIT_ROOT    = path.resolve(__dirname, '../..');
const CLI_PATH        = path.join(TOOLKIT_ROOT, 'bin', 'cli.js');
const TOOLKIT_VERSION = require('../../package.json').version;

function runVerifyInstall(homeDir) {
  return spawnSync(
    process.execPath,
    [CLI_PATH, 'verify-install', '--home', homeDir],
    { encoding: 'utf8', cwd: TOOLKIT_ROOT }
  );
}

function writeStamp(homeDir, content) {
  const claudeDir = path.join(homeDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, '.ai-toolkit-version'), content, 'utf8');
}

describe('verify-install CLI command', () => {
  let tmpHome;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-install-'));
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('exit 0 and stdout contains PASS when stamp matches package.json version', () => {
    writeStamp(tmpHome, TOOLKIT_VERSION);
    const result = runVerifyInstall(tmpHome);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS');
    expect(result.stderr).toBe('');
  });

  test('exit 0 stdout contains the installed version string', () => {
    writeStamp(tmpHome, TOOLKIT_VERSION);
    const result = runVerifyInstall(tmpHome);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(TOOLKIT_VERSION);
  });

  test('exit 1 when no version stamp file exists', () => {
    // No .ai-toolkit-version written
    const result = runVerifyInstall(tmpHome);
    expect(result.status).toBe(1);
    expect(result.stderr).toBeTruthy();
    expect(result.stdout).toBe('');
  });

  test('exit 1 stderr mentions "no version stamp" when stamp is missing', () => {
    const result = runVerifyInstall(tmpHome);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/no version stamp/i);
  });

  test('exit 1 when stamp is empty', () => {
    writeStamp(tmpHome, '');
    const result = runVerifyInstall(tmpHome);
    expect(result.status).toBe(1);
    expect(result.stderr).toBeTruthy();
    expect(result.stdout).toBe('');
  });

  test('exit 1 stderr mentions "empty" when stamp is empty', () => {
    writeStamp(tmpHome, '');
    const result = runVerifyInstall(tmpHome);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/empty/i);
  });

  test('exit 1 when stamp differs from package.json version', () => {
    writeStamp(tmpHome, '0.0.0-stale');
    const result = runVerifyInstall(tmpHome);
    expect(result.status).toBe(1);
    expect(result.stderr).toBeTruthy();
    expect(result.stdout).toBe('');
  });

  test('exit 1 stderr mentions both installed and expected versions on mismatch', () => {
    writeStamp(tmpHome, '0.0.0-stale');
    const result = runVerifyInstall(tmpHome);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('0.0.0-stale');
    expect(result.stderr).toContain(TOOLKIT_VERSION);
  });

  test('exit 1 stderr mentions mismatch keyword', () => {
    writeStamp(tmpHome, '0.0.0-stale');
    const result = runVerifyInstall(tmpHome);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/mismatch/i);
  });

  test('exit 0 works when stamp has trailing newline (trim handled)', () => {
    writeStamp(tmpHome, TOOLKIT_VERSION + '\n');
    const result = runVerifyInstall(tmpHome);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS');
  });
});
