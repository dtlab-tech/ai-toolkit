'use strict';

// Unit tests for createSlotPool (US-08-TASK-BE-02, FTR-018):
// lib/task-executor/index.js's N-limit concurrency control / slot
// reservation primitive. This is a standalone primitive — NOT wired into
// execute()'s existing sequential main loop (US-07-TASK-BE-01), which stays
// N=1/unchanged. These tests exercise createSlotPool directly, never
// through execute().
//
// Pure in-memory data-structure test: no git, no subprocess spawning, no
// tmpDir setup/teardown needed.

const { createSlotPool } = require('../../lib/task-executor/index');

describe('createSlotPool() construction', () => {
  test('rejects maxConcurrency = 0', () => {
    expect(() => createSlotPool(0)).toThrow(/positive safe integer/);
  });

  test('rejects negative maxConcurrency', () => {
    try {
      createSlotPool(-1);
      throw new Error('expected createSlotPool to throw');
    } catch (err) {
      expect(err.code).toBe('SLOT_POOL_VALIDATION_ERROR');
    }
  });

  test('rejects non-integer maxConcurrency', () => {
    expect(() => createSlotPool(1.5)).toThrow(/positive safe integer/);
  });

  test('rejects non-safe-integer maxConcurrency', () => {
    expect(() => createSlotPool(Number.MAX_SAFE_INTEGER + 10)).toThrow(/positive safe integer/);
  });

  test('rejects non-number maxConcurrency', () => {
    expect(() => createSlotPool('3')).toThrow(/positive safe integer/);
    expect(() => createSlotPool(null)).toThrow(/positive safe integer/);
    expect(() => createSlotPool(undefined)).toThrow(/positive safe integer/);
  });

  test('accepts a valid positive integer and exposes it as maxConcurrency', () => {
    const pool = createSlotPool(3);
    expect(pool.maxConcurrency).toBe(3);
  });
});

describe('createSlotPool() acquire/release semantics', () => {
  test('N slots can be acquired, and each returns a distinct truthy token', () => {
    const pool = createSlotPool(3);
    const t1 = pool.tryAcquire();
    const t2 = pool.tryAcquire();
    const t3 = pool.tryAcquire();

    expect(t1).toBeTruthy();
    expect(t2).toBeTruthy();
    expect(t3).toBeTruthy();
    expect(new Set([t1, t2, t3]).size).toBe(3);
    expect(pool.activeCount()).toBe(3);
    expect(pool.remainingCapacity()).toBe(0);
  });

  test('the (N+1)th acquire fails (returns null) while all N slots are held', () => {
    const pool = createSlotPool(2);
    expect(pool.tryAcquire()).toBeTruthy();
    expect(pool.tryAcquire()).toBeTruthy();

    const overflow = pool.tryAcquire();
    expect(overflow).toBeNull();
    // A failed acquire must not mutate state.
    expect(pool.activeCount()).toBe(2);
    expect(pool.remainingCapacity()).toBe(0);
  });

  test('releasing one slot frees exactly one unit of capacity, and a subsequent acquire then succeeds', () => {
    const pool = createSlotPool(2);
    const t1 = pool.tryAcquire();
    const t2 = pool.tryAcquire();
    expect(pool.tryAcquire()).toBeNull(); // full

    pool.release(t1);
    expect(pool.activeCount()).toBe(1);
    expect(pool.remainingCapacity()).toBe(1);

    const t3 = pool.tryAcquire();
    expect(t3).toBeTruthy();
    expect(pool.activeCount()).toBe(2);
    expect(pool.remainingCapacity()).toBe(0);

    // t2 is still held and independent of t1/t3's lifecycle.
    pool.release(t2);
    expect(pool.activeCount()).toBe(1);
    pool.release(t3);
    expect(pool.activeCount()).toBe(0);
    expect(pool.remainingCapacity()).toBe(2);
  });

  test('double-release of the same token is rejected with SLOT_NOT_HELD', () => {
    const pool = createSlotPool(1);
    const token = pool.tryAcquire();
    pool.release(token);

    try {
      pool.release(token);
      throw new Error('expected release() to throw on double-release');
    } catch (err) {
      expect(err.code).toBe('SLOT_NOT_HELD');
    }
    // Must not have gone negative or otherwise corrupted state.
    expect(pool.activeCount()).toBe(0);
    expect(pool.remainingCapacity()).toBe(1);
  });

  test('releasing an unknown/bogus token is rejected with SLOT_NOT_HELD, never silently accepted', () => {
    const pool = createSlotPool(1);
    expect(() => pool.release('not-a-real-token')).toThrow(/SLOT_NOT_HELD|not a currently held slot/);
    try {
      pool.release('not-a-real-token');
    } catch (err) {
      expect(err.code).toBe('SLOT_NOT_HELD');
    }
    expect(pool.activeCount()).toBe(0);
  });

  test('releasing a token acquired from a DIFFERENT pool instance is rejected', () => {
    const poolA = createSlotPool(1);
    const poolB = createSlotPool(1);
    const tokenFromA = poolA.tryAcquire();

    expect(() => poolB.release(tokenFromA)).toThrow();
    try {
      poolB.release(tokenFromA);
    } catch (err) {
      expect(err.code).toBe('SLOT_NOT_HELD');
    }
    // poolA's own slot is untouched by the failed cross-pool release attempt.
    expect(poolA.activeCount()).toBe(1);
  });

  test('release() rejects non-string tokens (e.g. null/undefined/number) as SLOT_NOT_HELD', () => {
    const pool = createSlotPool(1);
    pool.tryAcquire();
    [null, undefined, 42, {}].forEach((bogus) => {
      try {
        pool.release(bogus);
        throw new Error('expected release() to throw for bogus token ' + String(bogus));
      } catch (err) {
        expect(err.code).toBe('SLOT_NOT_HELD');
      }
    });
    expect(pool.activeCount()).toBe(1);
  });

  test('activeCount/remainingCapacity report accurately through a full acquire/release cycle', () => {
    const pool = createSlotPool(3);
    expect(pool.activeCount()).toBe(0);
    expect(pool.remainingCapacity()).toBe(3);

    const t1 = pool.tryAcquire();
    expect(pool.activeCount()).toBe(1);
    expect(pool.remainingCapacity()).toBe(2);

    const t2 = pool.tryAcquire();
    expect(pool.activeCount()).toBe(2);
    expect(pool.remainingCapacity()).toBe(1);

    const t3 = pool.tryAcquire();
    expect(pool.activeCount()).toBe(3);
    expect(pool.remainingCapacity()).toBe(0);

    expect(pool.tryAcquire()).toBeNull();
    expect(pool.activeCount()).toBe(3);
    expect(pool.remainingCapacity()).toBe(0);

    pool.release(t2);
    expect(pool.activeCount()).toBe(2);
    expect(pool.remainingCapacity()).toBe(1);

    pool.release(t1);
    pool.release(t3);
    expect(pool.activeCount()).toBe(0);
    expect(pool.remainingCapacity()).toBe(3);
  });

  test('inspection calls never mutate state (calling activeCount/remainingCapacity repeatedly is a no-op)', () => {
    const pool = createSlotPool(2);
    pool.tryAcquire();
    for (let i = 0; i < 5; i++) {
      expect(pool.activeCount()).toBe(1);
      expect(pool.remainingCapacity()).toBe(1);
    }
  });
});
