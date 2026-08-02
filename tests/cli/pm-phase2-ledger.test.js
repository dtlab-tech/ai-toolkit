'use strict';

/**
 * US-03-T03 — pm-phase2 ledger tracking
 *
 * Verifies the append-before / update-after ledger pattern that pm-phase2.js
 * uses for the single agent it dispatches:
 *   1. generate-work-breakdown:phase2
 *
 * pm-phase2.js defines async appendLedgerEntry / updateLedgerEntry helpers that
 * route all file I/O through agent() calls (the workflow runtime does not expose
 * the `fs` module).  The helpers share the same read-modify-write contract as the
 * same-named exports in bin/cli.js (same JSON array semantics, same append and
 * last-match-update algorithm).  These tests import from bin/cli.js and therefore
 * exercise the same behavioral contract.
 *
 * Structural properties of pm-phase2.js (that helpers are async, use await agent()
 * instead of fs, and that append-before/update-after call ordering is correct) are
 * verified separately in tests/cli/pm-phase2-source.test.js.
 *
 * Acceptance Criteria covered:
 *   AC-01: ledger entry has correct fields after a successful run
 *   AC-05: generate-work-breakdown entry exists with status="done" and positive tokens
 *   AC-07: liveness — running entry is visible on disk between append and update
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { appendLedgerEntry, updateLedgerEntry } = require('../../bin/cli');

const PREFIX    = 'FTR-TEST';
const AGENT_KEY = 'generate-work-breakdown:phase2';

// ── shared helpers ────────────────────────────────────────────────────────────

function ledgerPath(dir) {
  return path.join(dir, `${PREFIX}-token-ledger.json`);
}

function readLedger(dir) {
  return JSON.parse(fs.readFileSync(ledgerPath(dir), 'utf8'));
}

function writeLedger(dir, contents) {
  fs.writeFileSync(ledgerPath(dir), JSON.stringify(contents, null, 2), 'utf8');
}

/** Build the "running" entry that pm-phase2 appends before the agent call. */
function runningEntry() {
  return {
    agent: AGENT_KEY,
    phase: 'phase2',
    model: 'haiku',
    status: 'running',
    phase_delta_tokens: 0,
    started_at: '2026-07-31T10:14:00Z',
    completed_at: null,
  };
}

/** Build the update that pm-phase2 applies after the agent returns. */
function doneUpdate(tokens) {
  return {
    status: 'done',
    completed_at: '2026-07-31T10:22:30Z',
    phase_delta_tokens: tokens,
  };
}

// ── shared setup ──────────────────────────────────────────────────────────────

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-pm2-ledger-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── append-before: running entry written before the agent call ─────────────────

describe('pm-phase2 — append running entry before generate-work-breakdown', () => {
  test('creates the ledger file when none exists', () => {
    // Arrange: no ledger file (define-feature was not used)

    // Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Assert
    expect(fs.existsSync(ledgerPath(tmpDir))).toBe(true);
  });

  test('written entry has agent key "generate-work-breakdown:phase2"', () => {
    // Arrange + Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Assert
    const ledger = readLedger(tmpDir);
    expect(ledger[0].agent).toBe(AGENT_KEY);
  });

  test('written entry has status="running"', () => {
    // Arrange + Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Assert
    const ledger = readLedger(tmpDir);
    expect(ledger[0].status).toBe('running');
  });

  test('written entry has completed_at=null before the agent returns', () => {
    // Arrange + Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Assert
    const ledger = readLedger(tmpDir);
    expect(ledger[0].completed_at).toBeNull();
  });

  test('written entry has phase_delta_tokens=0 before the agent returns', () => {
    // Arrange + Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Assert
    const ledger = readLedger(tmpDir);
    expect(ledger[0].phase_delta_tokens).toBe(0);
  });

  test('written entry has phase="phase2"', () => {
    // Arrange + Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Assert
    const ledger = readLedger(tmpDir);
    expect(ledger[0].phase).toBe('phase2');
  });

  test('written entry has model="haiku"', () => {
    // Arrange + Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Assert
    const ledger = readLedger(tmpDir);
    expect(ledger[0].model).toBe('haiku');
  });

  test('written entry has a non-null started_at', () => {
    // Arrange + Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Assert
    const ledger = readLedger(tmpDir);
    expect(ledger[0].started_at).not.toBeNull();
    expect(typeof ledger[0].started_at).toBe('string');
  });

  test('produces valid JSON that can be re-parsed', () => {
    // Arrange + Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Assert — file must be parseable (AC-13)
    expect(() => readLedger(tmpDir)).not.toThrow();
  });
});

// ── update-after: entry transitions to done after the agent returns ────────────

describe('pm-phase2 — update entry to done after generate-work-breakdown returns (AC-05)', () => {
  test('status transitions from "running" to "done"', () => {
    // Arrange
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Act — simulate agent completing with 6789 tokens
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, doneUpdate(6789));

    // Assert
    const ledger = readLedger(tmpDir);
    expect(ledger[0].status).toBe('done');
  });

  test('completed_at is set to a non-null value after update', () => {
    // Arrange
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Act
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, doneUpdate(6789));

    // Assert
    const ledger = readLedger(tmpDir);
    expect(ledger[0].completed_at).not.toBeNull();
    expect(typeof ledger[0].completed_at).toBe('string');
  });

  test('phase_delta_tokens is set to the actual token count after update', () => {
    // Arrange
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Act
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, doneUpdate(6789));

    // Assert
    const ledger = readLedger(tmpDir);
    expect(ledger[0].phase_delta_tokens).toBe(6789);
  });

  test('immutable fields (agent, phase, model, started_at) are preserved after update', () => {
    // Arrange
    const entry = runningEntry();
    appendLedgerEntry(tmpDir, PREFIX, entry);

    // Act
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, doneUpdate(6789));

    // Assert: fields set at append time must not change
    const updated = readLedger(tmpDir)[0];
    expect(updated.agent).toBe(AGENT_KEY);
    expect(updated.phase).toBe('phase2');
    expect(updated.model).toBe('haiku');
    expect(updated.started_at).toBe(entry.started_at);
  });

  test('ledger remains a single-entry array after append + update (AC-05)', () => {
    // Arrange
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Act
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, doneUpdate(6789));

    // Assert
    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(1);
  });

  test('completed_at differs from started_at (duration > 0ms)', () => {
    // Arrange
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Act
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, doneUpdate(6789));

    // Assert: a real agent cannot complete at the exact same instant it starts
    const entry = readLedger(tmpDir)[0];
    expect(entry.started_at).not.toBe(entry.completed_at);
    expect(new Date(entry.completed_at) > new Date(entry.started_at)).toBe(true);
  });

  test('positive token delta is preserved exactly as written (AC-05)', () => {
    // Arrange
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Act — use a distinct non-round number to confirm no rounding
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, doneUpdate(12_347));

    // Assert
    const entry = readLedger(tmpDir)[0];
    expect(entry.phase_delta_tokens).toBe(12_347);
  });

  test('ledger file is valid JSON after finalization', () => {
    // Arrange
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, doneUpdate(6789));

    // Assert
    expect(() => readLedger(tmpDir)).not.toThrow();
  });
});

// ── liveness signal: running entry visible on disk between append and update ───

describe('pm-phase2 — liveness signal (AC-07)', () => {
  test('running entry is visible on disk between append and update calls', () => {
    // Arrange

    // Act — ONLY append, do not update yet (simulates mid-agent-execution snapshot)
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Assert: file on disk shows running entry with null completed_at
    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].status).toBe('running');
    expect(ledger[0].completed_at).toBeNull();
    expect(ledger[0].started_at).not.toBeNull();
  });

  test('running entry is valid JSON (parseable) before the agent completes', () => {
    // Arrange + Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Assert: file can be parsed without error (AC-13)
    expect(() => readLedger(tmpDir)).not.toThrow();
  });
});

// ── pre-seeded ledger (define-feature was used) ───────────────────────────────

describe('pm-phase2 — ledger pre-seeded by define-feature and pm-phase1', () => {
  test('existing entries are preserved when pm-phase2 appends its entry', () => {
    // Arrange: ledger contains define-feature and two phase1 entries
    const priorEntries = [
      {
        agent: 'define-feature:define',
        phase: 'define',
        model: 'sonnet',
        status: 'done',
        phase_delta_tokens: 12345,
        started_at: '2026-07-31T09:00:00Z',
        completed_at: '2026-07-31T09:02:00Z',
      },
      {
        agent: 'generate-requirements:phase1',
        phase: 'phase1',
        model: 'haiku',
        status: 'done',
        phase_delta_tokens: 5678,
        started_at: '2026-07-31T09:02:01Z',
        completed_at: '2026-07-31T09:05:00Z',
      },
      {
        agent: 'generate-tech-spec:phase1',
        phase: 'phase1',
        model: 'haiku',
        status: 'done',
        phase_delta_tokens: 8901,
        started_at: '2026-07-31T09:05:01Z',
        completed_at: '2026-07-31T09:12:00Z',
      },
    ];
    writeLedger(tmpDir, priorEntries);

    // Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, doneUpdate(6789));

    // Assert: all prior entries are untouched
    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(4);
    expect(ledger[0]).toEqual(priorEntries[0]);
    expect(ledger[1]).toEqual(priorEntries[1]);
    expect(ledger[2]).toEqual(priorEntries[2]);
  });

  test('pm-phase2 entry is appended at the end of the existing ledger', () => {
    // Arrange
    const priorEntries = [
      {
        agent: 'validate-feature-docs:phase1:cycle1',
        phase: 'phase1',
        model: 'haiku',
        status: 'done',
        phase_delta_tokens: 2345,
        started_at: '2026-07-31T09:12:01Z',
        completed_at: '2026-07-31T09:14:00Z',
      },
    ];
    writeLedger(tmpDir, priorEntries);

    // Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, doneUpdate(6789));

    // Assert: pm-phase2 entry is last
    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(2);
    expect(ledger[1].agent).toBe(AGENT_KEY);
    expect(ledger[1].status).toBe('done');
    expect(ledger[1].phase_delta_tokens).toBe(6789);
  });
});

// ── no prior ledger (define-feature was not used) ─────────────────────────────

describe('pm-phase2 — ledger created from scratch when define-feature was not used', () => {
  test('appending to a non-existent ledger produces a single-entry array', () => {
    // Arrange: no ledger file

    // Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());

    // Assert: file created, one entry
    const ledger = readLedger(tmpDir);
    expect(Array.isArray(ledger)).toBe(true);
    expect(ledger).toHaveLength(1);
  });

  test('full append + update cycle on a fresh ledger produces a valid done entry (AC-05)', () => {
    // Arrange: no ledger file

    // Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry());
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, doneUpdate(6789));

    // Assert
    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].agent).toBe(AGENT_KEY);
    expect(ledger[0].status).toBe('done');
    expect(ledger[0].phase).toBe('phase2');
    expect(ledger[0].model).toBe('haiku');
    expect(ledger[0].phase_delta_tokens).toBe(6789);
    expect(ledger[0].started_at).not.toBeNull();
    expect(ledger[0].completed_at).not.toBeNull();
  });
});

// ── full append + update round-trip (AC-01) ───────────────────────────────────

describe('pm-phase2 — full append + update round-trip (AC-01)', () => {
  test('entry has all required fields set correctly after a complete cycle', () => {
    // Arrange
    const started_at   = '2026-07-31T10:14:01Z';
    const completed_at = '2026-07-31T10:22:30Z';
    const tokens       = 6789;

    // Act
    appendLedgerEntry(tmpDir, PREFIX, {
      agent: AGENT_KEY,
      phase: 'phase2',
      model: 'haiku',
      status: 'running',
      phase_delta_tokens: 0,
      started_at,
      completed_at: null,
    });
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, {
      status: 'done',
      completed_at,
      phase_delta_tokens: tokens,
    });

    // Assert — exact final shape
    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toEqual({
      agent: AGENT_KEY,
      phase: 'phase2',
      model: 'haiku',
      status: 'done',
      phase_delta_tokens: tokens,
      started_at,
      completed_at,
    });
  });
});
