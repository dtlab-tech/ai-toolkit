'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { renameSyncWithRetry } = require('../../lib/atomic-rename');

describe('renameSyncWithRetry()', () => {
  let tmpDir, src, dest, renameSpy;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-rename-test-'));
    src = path.join(tmpDir, 'src.tmp');
    dest = path.join(tmpDir, 'dest.json');
    fs.writeFileSync(src, 'content');
  });
  afterEach(() => {
    if (renameSpy) renameSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('succeeds immediately on a clean rename, identical to fs.renameSync', () => {
    renameSyncWithRetry(src, dest);
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.readFileSync(dest, 'utf8')).toBe('content');
  });

  test('retries a transient EPERM and succeeds once the condition clears', () => {
    const realRename = fs.renameSync.bind(fs);
    let calls = 0;
    renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation((...args) => {
      calls += 1;
      if (calls < 3) { const err = new Error('EPERM'); err.code = 'EPERM'; throw err; }
      return realRename(...args);
    });
    renameSyncWithRetry(src, dest);
    expect(calls).toBe(3);
    expect(fs.existsSync(dest)).toBe(true);
  });

  test('retries a transient EBUSY the same way as EPERM', () => {
    const realRename = fs.renameSync.bind(fs);
    let calls = 0;
    renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation((...args) => {
      calls += 1;
      if (calls < 2) { const err = new Error('EBUSY'); err.code = 'EBUSY'; throw err; }
      return realRename(...args);
    });
    renameSyncWithRetry(src, dest);
    expect(calls).toBe(2);
  });

  test('throws immediately on a non-retriable error code, no retry attempted', () => {
    let calls = 0;
    renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
      calls += 1;
      const err = new Error('ENOENT'); err.code = 'ENOENT'; throw err;
    });
    expect(() => renameSyncWithRetry(src, dest)).toThrow('ENOENT');
    expect(calls).toBe(1);
  });

  test('throws the original error after exhausting all retry attempts for a persistent EPERM', () => {
    let calls = 0;
    renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
      calls += 1;
      const err = new Error('EPERM: operation not permitted, rename'); err.code = 'EPERM'; throw err;
    });
    expect(() => renameSyncWithRetry(src, dest)).toThrow('EPERM');
    expect(calls).toBe(5); // bounded — never retries forever
  });
});
