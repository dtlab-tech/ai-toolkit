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

  test('refuses to reclaim when checkOwnerLiveness would report alive: true (the current process)', () => {
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
