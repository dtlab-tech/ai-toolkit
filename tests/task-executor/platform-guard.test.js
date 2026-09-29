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
//
// WHY THIS FILE DOES NOT jest.spyOn dispatchTaskAttempt / createTaskWorktree
// (US-08-TASK-TEST-02):
//
// This task was asked to add more DIRECT proof — alongside the indirect
// reasoning above — by jest.spyOn-ing the real, already-exported
// dispatchTaskAttempt and createTaskWorktree functions from
// lib/task-executor/index.js and asserting execute() never calls either on a
// simulated non-win32 platform. That approach was tried and empirically
// rejected, not assumed away:
//
//   1. dispatchTaskAttempt's one and only call site in the whole file (inside
//      the private helper that drives a single task attempt to resolution,
//      itself called from execute()'s own run loop) invokes it by its bare
//      local identifier — `dispatchTaskAttempt({...})` — never through
//      `module.exports.dispatchTaskAttempt` / `exports.dispatchTaskAttempt`.
//      `jest.spyOn(indexModule, 'dispatchTaskAttempt')` only replaces the
//      property on the *exports object* this test itself required; it cannot
//      rewrite the module-internal local binding the internal call site
//      actually resolves at call time. This is the well-documented CommonJS
//      "spying on an export used internally by its own module" limitation —
//      verified here empirically, not assumed: a throwaway scratch module
//      with the exact same shape as index.js (a local `function inner() {..}`,
//      a local `function outer() { return inner(); }`, both re-exported via
//      `module.exports = { inner, outer }`) was required into a disposable
//      Jest test; `jest.spyOn(mod, 'inner')` followed by calling `mod.outer()`
//      returned the real, correct value from `inner()` AND left the spy's own
//      call count at 0. The spy silently never observes the internal call.
//      A spy on `dispatchTaskAttempt` here would behave identically: it would
//      report "never called" on every execute() invocation, guard-fired or
//      not — which is not evidence of anything, and would be indistinguishable
//      from a passing test even if the platform guard were deleted entirely.
//   2. createTaskWorktree: independent of point 1, this function is not even
//      wired into execute()'s run loop at all yet. Its own doc comment in
//      lib/task-executor/index.js says so explicitly ("It is NOT wired into
//      execute()'s existing sequential main loop ... which stays
//      N=1/single-worktree-free"), and createSlotPool's neighboring comment
//      repeats "execute() never calls this function". Under the only
//      maxConcurrency value this codebase currently supports (1), execute()
//      never calls createTaskWorktree on ANY platform, guard or no guard — a
//      spy on it would read "never called" for every test in this entire
//      suite, not just this one. Zero diagnostic value specific to this test.
//
// A spy-based assertion here would therefore be exactly the kind of test that
// creates a false sense of security: syntactically present, permanently
// green, and structurally incapable of ever catching a regression where the
// guard stopped firing. None was added. Instead, Test 1 below leans harder on
// — and this comment makes fully explicit — the SAME structural/indirect
// reasoning the test already used, spelled out end to end:
//
//   - dispatchTaskAttempt's one call site is reachable ONLY from inside
//     execute()'s run loop, which execute() only reaches after it has
//     already: validated args, derived the plan snapshot, resolved
//     executionRoot, generated a fresh runId, and — critically — successfully
//     called ownership.acquireLease(executionRoot, runId) and then
//     constructed and store.writeState()-persisted the initial run State.
//     Every one of those steps sits AFTER the platform guard in execute()'s
//     own source (the guard is its literal first statement). So
//     "acquireLease was never called" is not merely correlated with
//     "dispatchTaskAttempt was never called" — it is logically PRIOR to it:
//     there is no code path in index.js that reaches the dispatch call site
//     without first acquiring the lease this test already proves was never
//     acquired. No lease, no state, no dispatch — full stop.
//   - createTaskWorktree needs a runId/executionRoot/baseSha that only exist
//     once a run has actually started the same way; but more directly, the
//     physical check `fs.readdirSync(tmpDir)` returning `[]` below is
//     stronger, more direct evidence that no worktree (or anything else) was
//     ever created under tmpDir than a function-call spy could ever be — it
//     inspects the real filesystem side effect a genuine createTaskWorktree
//     call would have to leave behind (a `worktrees/` directory, populated by
//     `git worktree add`), not merely whether some function reference was
//     invoked.

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
    // the guard is the very first thing execute() does. This is conclusive
    // (not merely suggestive) proof that no agent was ever dispatched: per
    // the file-header comment above, dispatchTaskAttempt's only call site in
    // index.js is reachable exclusively from inside execute()'s run loop,
    // which itself is only reached AFTER a successful acquireLease +
    // writeState — both proven never to have happened here.
    expect(acquireLeaseSpy).not.toHaveBeenCalled();
    expect(writeStateSpy).not.toHaveBeenCalled();

    // No run directory (or anything else) was created under tmpDir — direct,
    // physical proof that no worktree was ever created (createTaskWorktree's
    // real side effect is a `worktrees/` directory materialized via `git
    // worktree add`; an empty tmpDir means that never happened), stronger
    // than a call-count spy could be. See the file-header comment above for
    // why a jest.spyOn on dispatchTaskAttempt/createTaskWorktree themselves
    // was deliberately not used instead (it would not intercept the real
    // call path and would silently always pass).
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
