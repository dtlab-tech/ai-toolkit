'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { acquireLease, releaseLease, readLease } = require('../../lib/task-executor/ownership');

describe('ownership: repo-wide execution lease protocol', () => {
  let tmpDir;
  let executionRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownership-test-'));
    executionRoot = path.join(tmpDir, 'ai-toolkit', 'execution');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('acquireLease', () => {
    test('creates owner.json and persists nonce, host, pid, runId, generation', () => {
      const lease = acquireLease(executionRoot, 'run-1');

      expect(typeof lease.nonce).toBe('string');
      expect(lease.nonce.length).toBeGreaterThan(0);
      expect(lease.host).toBe(os.hostname());
      expect(lease.pid).toBe(process.pid);
      expect(lease.runId).toBe('run-1');
      expect(lease.generation).toBe(0);
      expect(typeof lease.acquiredAt).toBe('string');

      const onDisk = JSON.parse(fs.readFileSync(path.join(executionRoot, 'owner.json'), 'utf8'));
      expect(onDisk).toEqual(lease);
    });

    test('creates executionRoot directory when it does not yet exist', () => {
      expect(fs.existsSync(executionRoot)).toBe(false);
      acquireLease(executionRoot, 'run-1');
      expect(fs.existsSync(path.join(executionRoot, 'owner.json'))).toBe(true);
    });

    test('second acquireLease call fails closed with LEASE_HELD and does not overwrite the lease', () => {
      const first = acquireLease(executionRoot, 'run-1');

      let caught;
      try {
        acquireLease(executionRoot, 'run-2');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeDefined();
      expect(caught.code).toBe('LEASE_HELD');
      expect(caught.existingLease.runId).toBe('run-1');

      const onDisk = JSON.parse(fs.readFileSync(path.join(executionRoot, 'owner.json'), 'utf8'));
      expect(onDisk).toEqual(first); // untouched by the failed second acquire
    });

    test('two different runIds requesting a lease concurrently: exactly one succeeds', () => {
      const results = [];
      [() => acquireLease(executionRoot, 'run-a'), () => acquireLease(executionRoot, 'run-b')]
        .forEach((attempt) => {
          try {
            results.push({ ok: true, lease: attempt() });
          } catch (err) {
            results.push({ ok: false, code: err.code });
          }
        });

      const succeeded = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);
      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0].code).toBe('LEASE_HELD');
    });

    test('rejects a missing or empty runId', () => {
      expect(() => acquireLease(executionRoot, '')).toThrow(/runId/);
      expect(() => acquireLease(executionRoot, undefined)).toThrow(/runId/);
    });
  });

  describe('releaseLease', () => {
    test('releases a lease held by the caller\'s own runId/nonce and removes owner.json', () => {
      const lease = acquireLease(executionRoot, 'run-1');
      const result = releaseLease(executionRoot, lease.runId, lease.nonce);

      expect(result).toBe(true);
      expect(fs.existsSync(path.join(executionRoot, 'owner.json'))).toBe(false);
    });

    test('allows re-acquiring the lease after a clean release', () => {
      const first = acquireLease(executionRoot, 'run-1');
      releaseLease(executionRoot, first.runId, first.nonce);

      const second = acquireLease(executionRoot, 'run-2');
      expect(second.runId).toBe('run-2');
      expect(second.nonce).not.toBe(first.nonce);
    });

    test('throws LEASE_NOT_OWNER and does not remove the lease when runId does not match', () => {
      const lease = acquireLease(executionRoot, 'run-1');

      expect(() => releaseLease(executionRoot, 'run-2', lease.nonce)).toThrow(/does not hold/);
      expect(fs.existsSync(path.join(executionRoot, 'owner.json'))).toBe(true);
    });

    test('throws LEASE_NOT_OWNER and does not remove the lease when nonce does not match', () => {
      const lease = acquireLease(executionRoot, 'run-1');

      let caught;
      try {
        releaseLease(executionRoot, lease.runId, 'not-the-real-nonce');
      } catch (err) {
        caught = err;
      }

      expect(caught.code).toBe('LEASE_NOT_OWNER');
      expect(fs.existsSync(path.join(executionRoot, 'owner.json'))).toBe(true);
    });

    test('throws LEASE_NOT_FOUND when no lease is currently held', () => {
      let caught;
      try {
        releaseLease(executionRoot, 'run-1', 'some-nonce');
      } catch (err) {
        caught = err;
      }
      expect(caught.code).toBe('LEASE_NOT_FOUND');
    });
  });

  describe('readLease', () => {
    test('returns null when no lease is held', () => {
      expect(readLease(executionRoot)).toBeNull();
    });

    test('returns the current lease contents without mutating anything', () => {
      const lease = acquireLease(executionRoot, 'run-1');

      const read1 = readLease(executionRoot);
      const read2 = readLease(executionRoot);

      expect(read1).toEqual(lease);
      expect(read2).toEqual(lease); // read-only: repeated reads are stable
      expect(fs.existsSync(path.join(executionRoot, 'owner.json'))).toBe(true);
    });

    test('returns null again after the lease is released', () => {
      const lease = acquireLease(executionRoot, 'run-1');
      releaseLease(executionRoot, lease.runId, lease.nonce);
      expect(readLease(executionRoot)).toBeNull();
    });
  });
});
