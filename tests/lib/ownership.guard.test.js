'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const {
  acquireLease,
  readLease,
  reclaimLease,
  createOwnershipGuard,
} = require('../../lib/task-executor/ownership');

const IS_WINDOWS = process.platform === 'win32';
// Real dead-process reclaim assertions require a qualified liveness mechanism
// (Windows-only, per the Gate-1 E-02 qualification — see ownership.liveness.test.js).
// On non-Windows CI runners these are skipped rather than faked.
const itWindowsOnly = IS_WINDOWS ? test : test.skip;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

async function killAndWait(pid) {
  if (IS_WINDOWS) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { process.kill(pid, 'SIGKILL'); } catch (_) {}
  }
  for (let i = 0; i < 50 && isAlive(pid); i++) await sleep(100);
}

describe('ownership: createOwnershipGuard', () => {
  let tmpDir;
  let executionRoot;
  const spawnedPids = [];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownership-guard-test-'));
    executionRoot = path.join(tmpDir, 'ai-toolkit', 'execution');
  });

  afterEach(async () => {
    while (spawnedPids.length) {
      const pid = spawnedPids.pop();
      if (isAlive(pid)) await killAndWait(pid);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function guardDirPath() {
    return path.join(executionRoot, 'ownership-guard');
  }

  test('transition() runs fn and returns its value when the guard is free', () => {
    const guard = createOwnershipGuard(executionRoot);
    const result = guard.transition(() => 'ok');
    expect(result).toBe('ok');
  });

  test('a second concurrent transition fails closed with GUARD_HELD while the first is active', () => {
    const guard = createOwnershipGuard(executionRoot);
    let innerCaught;

    guard.transition(() => {
      const otherGuard = createOwnershipGuard(executionRoot);
      try {
        otherGuard.transition(() => {
          throw new Error('must not run — guard should already be held');
        });
      } catch (err) {
        innerCaught = err;
      }
    });

    expect(innerCaught).toBeDefined();
    expect(innerCaught.code).toBe('GUARD_HELD');
  });

  test('the guard directory is cleaned up after a successful transition', () => {
    const guard = createOwnershipGuard(executionRoot);
    guard.transition(() => {
      expect(fs.existsSync(guardDirPath())).toBe(true);
    });
    expect(fs.existsSync(guardDirPath())).toBe(false);
  });

  test('the guard directory is cleaned up even when the wrapped operation throws', () => {
    const guard = createOwnershipGuard(executionRoot);

    expect(() => {
      guard.transition(() => {
        throw new Error('boom');
      });
    }).toThrow('boom');

    expect(fs.existsSync(guardDirPath())).toBe(false);
  });

  test('after a failed transition, a new transition can acquire the guard again', () => {
    const guard = createOwnershipGuard(executionRoot);

    expect(() => guard.transition(() => { throw new Error('boom'); })).toThrow('boom');

    const result = guard.transition(() => 'recovered');
    expect(result).toBe('recovered');
  });
});

describe('ownership: reclaimLease', () => {
  let tmpDir;
  let executionRoot;
  const spawnedPids = [];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownership-reclaim-test-'));
    executionRoot = path.join(tmpDir, 'ai-toolkit', 'execution');
  });

  afterEach(async () => {
    while (spawnedPids.length) {
      const pid = spawnedPids.pop();
      if (isAlive(pid)) await killAndWait(pid);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('reclaimLease delegates to a normal acquire when no lease exists', () => {
    const lease = reclaimLease(executionRoot, 'run-first');

    expect(lease.runId).toBe('run-first');
    expect(lease.generation).toBe(0);
    expect(readLease(executionRoot)).toEqual(lease);
  });

  // Real alive:true requires checkOwnerLiveness's real, Windows-only OS liveness
  // query (E-02 qualification) — on any other platform it always returns
  // 'unknown' by design, so this specific "confirmed alive" scenario cannot be
  // produced for real elsewhere. The 'unknown' refusal path is covered
  // cross-platform by the next test below.
  itWindowsOnly('refuses to reclaim when checkOwnerLiveness would report alive: true (the current process)', () => {
    const original = acquireLease(executionRoot, 'run-live');

    let caught;
    try {
      reclaimLease(executionRoot, 'run-reclaimer');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught.code).toBe('LEASE_STILL_LIVE');
    expect(readLease(executionRoot)).toEqual(original); // untouched
  });

  test('refuses to reclaim when liveness is unknown (host mismatch)', () => {
    const original = acquireLease(executionRoot, 'run-remote', { host: 'some-other-host' });

    let caught;
    try {
      reclaimLease(executionRoot, 'run-reclaimer');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught.code).toBe('LEASE_LIVENESS_UNKNOWN');
    expect(readLease(executionRoot)).toEqual(original); // untouched
  });

  itWindowsOnly('reclaims and increments generation once the recorded process is confirmed terminated', async () => {
    const child = spawn(process.execPath, ['-e', "setTimeout(()=>{}, 120000)"], { stdio: 'ignore' });
    spawnedPids.push(child.pid);
    await sleep(300); // let the OS finish registering the process before we query it

    const original = acquireLease(executionRoot, 'run-dead', { pid: child.pid });
    expect(original.generation).toBe(0);

    await killAndWait(child.pid);

    const reclaimed = reclaimLease(executionRoot, 'run-reclaimer');

    expect(reclaimed.runId).toBe('run-reclaimer');
    expect(reclaimed.generation).toBe(original.generation + 1);
    expect(reclaimed.nonce).not.toBe(original.nonce);
    expect(readLease(executionRoot)).toEqual(reclaimed);
  }, 20000);
});

describe('ownership: releaseDeadLease (the operator\'s way out of a lease left by a dead run)', () => {
  const { releaseDeadLease } = require('../../lib/task-executor/ownership');
  let tmpDir;
  let executionRoot;
  const spawnedPids = [];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownership-release-dead-test-'));
    executionRoot = path.join(tmpDir, 'ai-toolkit', 'execution');
  });

  afterEach(async () => {
    while (spawnedPids.length) {
      const pid = spawnedPids.pop();
      if (isAlive(pid)) await killAndWait(pid);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('no lease: nothing is released and nothing fails', () => {
    expect(releaseDeadLease(executionRoot)).toEqual({ released: false, lease: null, reason: 'no lease is held' });
  });

  test('refuses an owner whose liveness cannot be confirmed (host mismatch) and leaves the lease untouched', () => {
    const original = acquireLease(executionRoot, 'run-remote', { host: 'some-other-host' });
    let caught;
    try { releaseDeadLease(executionRoot); } catch (err) { caught = err; }
    expect(caught.code).toBe('LEASE_LIVENESS_UNKNOWN');
    expect(readLease(executionRoot)).toEqual(original);
  });

  itWindowsOnly('refuses a live owner (the current process) and leaves the lease untouched', () => {
    const original = acquireLease(executionRoot, 'run-live');
    let caught;
    try { releaseDeadLease(executionRoot); } catch (err) { caught = err; }
    expect(caught.code).toBe('LEASE_STILL_LIVE');
    expect(readLease(executionRoot)).toEqual(original);
  });

  itWindowsOnly('releases the lease once the recorded process is confirmed terminated, so a new run can acquire it', async () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 120000)'], { stdio: 'ignore' });
    spawnedPids.push(child.pid);
    await sleep(300);
    acquireLease(executionRoot, 'run-dead', { pid: child.pid });
    await killAndWait(child.pid);

    const res = releaseDeadLease(executionRoot);

    expect(res.released).toBe(true);
    expect(res.lease.runId).toBe('run-dead');
    expect(readLease(executionRoot)).toBeNull();
    expect(acquireLease(executionRoot, 'run-next').runId).toBe('run-next');
  }, 20000);

  test('a LEASE_HELD error tells the operator how to release a dead run\'s lease', () => {
    acquireLease(executionRoot, 'run-a');
    let caught;
    try { acquireLease(executionRoot, 'run-b'); } catch (err) { caught = err; }
    expect(caught.code).toBe('LEASE_HELD');
    expect(caught.message).toMatch(/ai-toolkit executor release-lease --project/);
  });
});
