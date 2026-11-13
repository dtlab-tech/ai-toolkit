'use strict';

// executor release-lease: the library entry point, on a real git repository.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ownership = require('../../lib/task-executor/ownership');
const { releaseLease } = require('../../lib/task-executor/index');

const itWindowsOnly = process.platform === 'win32' ? test : test.skip;
jest.setTimeout(30000);

function git(dir, args) {
  const res = spawnSync('git', args, { cwd: dir, shell: false, encoding: 'utf8', windowsHide: true });
  if (res.status !== 0) throw new Error('git ' + args.join(' ') + ' failed: ' + res.stderr);
  return res.stdout.trim();
}

describe('releaseLease', () => {
  let tmp;
  let repo;
  let executionRoot;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-lease-test-'));
    repo = path.join(tmp, 'repo');
    fs.mkdirSync(repo);
    git(repo, ['init', '-q']);
    executionRoot = path.join(path.resolve(repo, git(repo, ['rev-parse', '--git-common-dir'])), 'ai-toolkit', 'execution');
  });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('no lease held: released false, nothing thrown', async () => {
    const res = await releaseLease({ project: repo });
    expect(res.released).toBe(false);
    expect(res.runId).toBeNull();
  });

  test('a lease whose owner cannot be verified is refused and kept', async () => {
    const lease = ownership.acquireLease(executionRoot, 'run-remote', { host: 'some-other-host' });
    await expect(releaseLease({ project: repo })).rejects.toMatchObject({ code: 'LEASE_LIVENESS_UNKNOWN' });
    expect(ownership.readLease(executionRoot)).toEqual(lease);
  });

  itWindowsOnly('the lease of a dead run is released and a new run can acquire it', async () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 120000)'], { stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 300));
    ownership.acquireLease(executionRoot, 'run-dead', { pid: child.pid });
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    await new Promise((r) => setTimeout(r, 500));

    const res = await releaseLease({ project: repo });

    expect(res.released).toBe(true);
    expect(res.runId).toBe('run-dead');
    expect(res.runState).toBeNull();   // no run state was written for this fake run
    expect(ownership.readLease(executionRoot)).toBeNull();
    expect(ownership.acquireLease(executionRoot, 'run-next').runId).toBe('run-next');
  });
});
