'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { readInstalledVersion } = require('../../bin/cli');

describe('readInstalledVersion()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns null when the version file does not exist', () => {
    const result = readInstalledVersion(tmpDir);
    expect(result).toBeNull();
  });

  test('returns the trimmed version string when the file exists', () => {
    // readInstalledVersion looks for .claude/.ai-toolkit-version inside destRoot
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(path.join(claudeDir, '.ai-toolkit-version'), '0.1.3\n');

    const result = readInstalledVersion(tmpDir);
    expect(result).toBe('0.1.3');
  });

  test('trims leading and trailing whitespace from the version string', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(path.join(claudeDir, '.ai-toolkit-version'), '  1.2.3  \n');

    const result = readInstalledVersion(tmpDir);
    expect(result).toBe('1.2.3');
  });
});
