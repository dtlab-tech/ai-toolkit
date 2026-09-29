'use strict';

// Tests for the platform qualification guard (US-08-TASK-BE-05, FTR-018):
// lib/task-executor/index.js's execute() must refuse to run at all on any
// platform other than win32, before ANY other work happens — before
// argument validation, before deriving executionRoot, before touching the
// plan/snapshot, before acquiring the ownership lease, before creating any
// worktree. This enforces this feature's own Gate-1 approval (binding
// constraint #3): "E-02 is Windows-only qualified. Other platforms require
// dedicated proofs before their execution is enabled; no implicit
// cross-platform guarantee."
//
// SAFETY / SCOPE:
//   - Test 1 overrides process.platform to a non-'win32' value using the
//     same Object.defineProperty technique already established by
//     tests/lib/ownership.liveness.test.js's own non-Windows-path test
//     ("returns alive: unknown on a non-Windows platform, without
//     attempting a POSIX check") — process.platform is normally read-only,
//     so this is the established, safe way to override and restore it.
//   - Test 1 never requires a real git repo or real feature files: it
//     asserts the guard fires before any of that would ever be read, using
//     a bare tmpDir (no `git init`) and a feature.md path that does not
//     exist on disk.
//   - Test 2 is a real, quick smoke check gated itWindowsOnly (mirrors every
//     other real-process-behavior test in this suite, e.g. tests/lib/
//     ownership.liveness.test.js, tests/task-executor/stop.test.js): it only
//     runs when process.platform is ACTUALLY 'win32' (never overridden), and
//     proves the guard does not false-positive on the qualified platform by
//     triggering some OTHER, already-existing validation error
//     (DISPATCH_VALIDATION_ERROR for a missing args.project) instead of
//     PLATFORM_NOT_QUALIFIED.

const fs = require('fs');
const os = require('os');
const path = require('path');

const ownership = require('../../lib/task-executor/ownership');
const store = require('../../lib/task-executor/store');
const { execute } = require('../../lib/task-executor/index');

const IS_WINDOWS = process.platform === 'win32';
const itWindowsOnly = IS_WINDOWS ? test : test.skip;

describe('execute(): platform qualification guard', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-guard-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('rejects immediately with PLATFORM_NOT_QUALIFIED on a non-win32 platform, before touching disk or acquiring the lease', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });

    const acquireLeaseSpy = jest.spyOn(ownership, 'acquireLease');
    const writeStateSpy = jest.spyOn(store, 'writeState');

    try {
      // Neither path exists on disk, and tmpDir is not even a git repo — the
      // guard must fire before either is ever read.
      await expect(
        execute({
          project: tmpDir,
          feature: path.join(tmpDir, 'does-not-exist', 'feature.md'),
        })
      ).rejects.toMatchObject({ code: 'PLATFORM_NOT_QUALIFIED' });
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }

    // No ownership lease was ever acquired, no run state was ever written —
    // the guard is the very first thing execute() does.
    expect(acquireLeaseSpy).not.toHaveBeenCalled();
    expect(writeStateSpy).not.toHaveBeenCalled();

    // No run directory (or anything else) was created under tmpDir.
    expect(fs.readdirSync(tmpDir)).toEqual([]);

    acquireLeaseSpy.mockRestore();
    writeStateSpy.mockRestore();
  });

  itWindowsOnly(
    'does NOT throw PLATFORM_NOT_QUALIFIED on the real, qualified platform (win32) — proceeds into normal argument validation instead',
    async () => {
      // No args.project/args.feature at all: proves the guard let execution
      // proceed past the platform check into the existing argument
      // validation, which fails closed with its own, different error code.
      await expect(execute({})).rejects.toMatchObject({ code: 'DISPATCH_VALIDATION_ERROR' });
    }
  );
});
