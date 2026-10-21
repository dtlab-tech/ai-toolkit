'use strict';

// Windows can transiently reject fs.renameSync with EPERM/EBUSY under concurrent I/O load (e.g.
// antivirus/indexer briefly holding a handle open, or another process reading the destination)
// even though the rename is logically valid and would succeed moments later — a well-documented
// OS characteristic (the same reason packages like write-file-atomic retry this exact case on
// Windows), not a defect in the atomic-write protocol around it. Previously documented in
// docs/task-executor-bootstrap.md as an "operational characteristic, not a code defect" with no
// actual mitigation; confirmed to recur on a real `executor start` run (not just under heavy
// parallel-test-suite I/O), and Windows is the only platform this executor is qualified for (E-02)
// — "just retry by hand" is not an acceptable permanent answer for the one supported platform.
//
// A short, bounded retry absorbs the transient case without masking a genuinely permanent failure
// (a real permission problem, a file locked open for a long time) — those still fail after the
// bound, exactly as before this existed. Every one of this module's 5 call sites (execution-ledger,
// task-executor's store/ownership, workflow-control, workflow-worker-evidence) already implements
// the identical temp-write-then-rename atomic protocol; this is the one place the rename step
// itself gets hardened, instead of duplicating the same retry loop 5 times.
const fs = require('fs');

const RETRY_ERROR_CODES = new Set(['EPERM', 'EBUSY']);
const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [10, 25, 50, 100, 200];

// A true synchronous sleep (every call site here is itself synchronous, mirroring
// fs.renameSync) — Atomics.wait on a SharedArrayBuffer-backed Int32Array is the standard,
// correct way to block the current thread without a CPU-burning busy loop; no external
// dependency, available in every Node version this project supports.
function _sleepSyncMs(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

// Drop-in replacement for fs.renameSync(src, dest) — identical contract (throws on a genuinely
// unrecoverable error, including after exhausting the retry bound), just resilient to the
// specific transient Windows rename race already characterized above.
function renameSyncWithRetry(src, dest) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      fs.renameSync(src, dest);
      return;
    } catch (err) {
      if (!RETRY_ERROR_CODES.has(err.code) || attempt === MAX_ATTEMPTS) throw err;
      _sleepSyncMs(BACKOFF_MS[attempt - 1]);
    }
  }
}

module.exports = { renameSyncWithRetry };
