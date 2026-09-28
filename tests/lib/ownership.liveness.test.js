'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { acquireLease, checkOwnerLiveness } = require('../../lib/task-executor/ownership');

const IS_WINDOWS = process.platform === 'win32';
// Windows-only real process-liveness assertions (per the Gate-1 E-02 qualification: only
// Windows has a proven liveness mechanism). On non-Windows CI runners these are skipped
// rather than faked, so we never assert on an unproven code path.
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

describe('ownership: checkOwnerLiveness', () => {
  let tmpDir;
  let executionRoot;
  const spawnedPids = [];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownership-liveness-test-'));
    executionRoot = path.join(tmpDir, 'ai-toolkit', 'execution');
  });

  afterEach(async () => {
    while (spawnedPids.length) {
      const pid = spawnedPids.pop();
      if (isAlive(pid)) await killAndWait(pid);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('throws LEASE_VALIDATION_ERROR when lease is not a non-empty object', () => {
    expect(() => checkOwnerLiveness(null)).toThrow(/lease must be a non-empty object/);
    expect(() => checkOwnerLiveness(undefined)).toThrow(/lease must be a non-empty object/);
    expect(() => checkOwnerLiveness('not-an-object')).toThrow(/lease must be a non-empty object/);
  });

  test('returns alive: unknown when the lease host does not match the current host', () => {
    const lease = { host: 'some-other-host', pid: process.pid, startTime: '123' };
    const result = checkOwnerLiveness(lease, { host: 'this-host' });

    expect(result.alive).toBe('unknown');
    expect(result.reason).toMatch(/does not match current host/);
  });

  test('returns alive: unknown on a non-Windows platform, without attempting a POSIX check', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });
    try {
      const lease = { host: os.hostname(), pid: process.pid, startTime: '123' };
      const result = checkOwnerLiveness(lease);

      expect(result.alive).toBe('unknown');
      expect(result.reason).toMatch(/only qualified on Windows/);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  test('returns alive: unknown when lease.pid is missing or not a valid process id', () => {
    const host = os.hostname();
    expect(checkOwnerLiveness({ host, pid: undefined, startTime: '123' }).alive).toBe('unknown');
    expect(checkOwnerLiveness({ host, pid: 'not-a-pid', startTime: '123' }).alive).toBe('unknown');
    expect(checkOwnerLiveness({ host, pid: -1, startTime: '123' }).alive).toBe('unknown');
    expect(checkOwnerLiveness({ host, pid: 1.5, startTime: '123' }).alive).toBe('unknown');
  });

  test('returns alive: unknown when the lease has no recorded startTime (legacy lease shape)', () => {
    const lease = { host: os.hostname(), pid: process.pid };
    const result = checkOwnerLiveness(lease);

    expect(result.alive).toBe('unknown');
    expect(result.reason).toMatch(/no recorded startTime/);
  });

  itWindowsOnly('returns alive: true for the current process using the startTime acquireLease captured', () => {
    const lease = acquireLease(executionRoot, 'run-self');

    expect(typeof lease.startTime).toBe('string');
    expect(lease.startTime.length).toBeGreaterThan(0);

    const result = checkOwnerLiveness(lease);
    expect(result.alive).toBe(true);
    expect(result.reason).toMatch(/identity confirmed/);
  });

  itWindowsOnly('returns alive: false with confirmed-dead evidence once the recorded process has terminated', async () => {
    const child = spawn(process.execPath, ['-e', "setTimeout(()=>{}, 120000)"], { stdio: 'ignore' });
    spawnedPids.push(child.pid);
    await sleep(300); // let the OS finish registering the process before we query it

    const lease = acquireLease(executionRoot, 'run-child', { pid: child.pid });
    expect(typeof lease.startTime).toBe('string');

    await killAndWait(child.pid);

    const result = checkOwnerLiveness(lease);
    expect(result.alive).toBe(false);
    expect(result.reason).toMatch(/no process with pid .* exists/);
  }, 20000);

  itWindowsOnly('returns alive: false (never true) when pid exists but its start time does not match — a recycled pid', async () => {
    const child = spawn(process.execPath, ['-e', "setTimeout(()=>{}, 120000)"], { stdio: 'ignore' });
    spawnedPids.push(child.pid);
    await sleep(300);

    const lease = acquireLease(executionRoot, 'run-recycle', { pid: child.pid });
    expect(typeof lease.startTime).toBe('string');

    // Simulate a PID-recycle scenario: the pid is alive, but belongs to a different process
    // than the one recorded (a well-formed but definitely-wrong file-time-UTC value).
    const impostorLease = Object.assign({}, lease, { startTime: '999999999999999999' });

    const result = checkOwnerLiveness(impostorLease);
    expect(result.alive).toBe(false);
    expect(result.reason).toMatch(/different process reusing a recycled pid/);
  }, 20000);

  test('never coerces alive: unknown into a truthy/falsy reclaim signal', () => {
    // Guards against a regression where callers might do `if (checkOwnerLiveness(...).alive)`
    // and accidentally treat 'unknown' (a truthy non-empty string) the same as `true`, or
    // `!alive` treating it the same as `false`. Both must be explicitly compared to the
    // literal boolean values, never to truthiness alone — this test documents that contract.
    const result = checkOwnerLiveness({ host: 'other-host', pid: process.pid, startTime: '1' }, { host: 'this-host' });
    expect(result.alive).not.toBe(true);
    expect(result.alive).not.toBe(false);
    expect(result.alive).toBe('unknown');
  });
});
