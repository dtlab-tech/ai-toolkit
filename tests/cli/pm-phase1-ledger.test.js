'use strict';

/**
 * US-02-T06 — pm-phase1 ledger tracking
 *
 * Verifies the append-before / update-after ledger pattern that pm-phase1.js
 * uses for each of its three agent types:
 *   1. generate-requirements:phase1
 *   2. generate-tech-spec:phase1
 *   3. validate-feature-docs:phase1:cycle{N}
 *
 * Also covers AC-08: ledger file created silently when define-feature was not used.
 *
 * pm-phase1.js runs inside the Claude Code Workflow runtime, which does not expose
 * Node.js globals such as `fs`.  Its ledger helpers route all file I/O through
 * `agent()` calls (matching pm-phase2.js).  These tests exercise `appendLedgerEntry`
 * and `updateLedgerEntry` exported from bin/cli.js — the canonical pure-JS
 * implementations of the same read-modify-write contract, usable in a Node.js
 * test environment.  The algorithmic contract (JSON array append, last-match update,
 * missing-file creation, malformed-JSON recovery) is identical; only the I/O
 * mechanism differs between the workflow helpers (agent()) and the exported helpers
 * (fs).
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { appendLedgerEntry, updateLedgerEntry } = require('../../bin/cli');

const PREFIX = 'FTR-TEST';

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

/** Simulate the pm-phase1 startup step: create empty ledger if absent (US-02-T02). */
function ensureLedger(dir) {
  const p = ledgerPath(dir);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, '[]', 'utf8');
  }
}

/** Build a minimal "running" entry as pm-phase1 does before each agent call. */
function runningEntry(agentKey, model) {
  return {
    agent: agentKey,
    phase: 'phase1',
    model,
    status: 'running',
    phase_delta_tokens: 0,
    started_at: '2026-07-31T10:00:00Z',
    completed_at: null,
  };
}

/** Build the update object pm-phase1 applies after each agent returns. */
function doneUpdate(tokens) {
  return {
    status: 'done',
    completed_at: '2026-07-31T10:05:00Z',
    phase_delta_tokens: tokens,
  };
}

// ── shared setup ──────────────────────────────────────────────────────────────

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-pm1-ledger-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── AC-08: missing ledger file (define-feature was not used) ──────────────────

describe('pm-phase1 startup — ledger file does not exist (AC-08)', () => {
  test('creates an empty ledger file when no file is present', () => {
    // Arrange: no ledger file in tmpDir

    // Act: simulate pm-phase1 startup logic
    ensureLedger(tmpDir);

    // Assert
    expect(fs.existsSync(ledgerPath(tmpDir))).toBe(true);
    const ledger = readLedger(tmpDir);
    expect(Array.isArray(ledger)).toBe(true);
    expect(ledger).toHaveLength(0);
  });

  test('does not overwrite an existing ledger when define-feature was used', () => {
    // Arrange: ledger already seeded by define-feature
    const existingEntry = {
      agent: 'define-feature:define',
      phase: 'define',
      model: 'sonnet',
      status: 'done',
      phase_delta_tokens: 12345,
      started_at: '2026-07-31T09:00:00Z',
      completed_at: '2026-07-31T09:02:00Z',
    };
    writeLedger(tmpDir, [existingEntry]);

    // Act: simulate pm-phase1 startup — ensureLedger must not clobber existing file
    ensureLedger(tmpDir);

    // Assert: define-feature entry is preserved
    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toEqual(existingEntry);
  });

  test('appending first entry after ensureLedger produces a valid one-element ledger', () => {
    // Arrange
    ensureLedger(tmpDir);

    // Act
    const entry = runningEntry('generate-requirements:phase1', 'haiku');
    appendLedgerEntry(tmpDir, PREFIX, entry);

    // Assert
    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toEqual(entry);
  });
});

// ── generate-requirements:phase1 ─────────────────────────────────────────────

describe('pm-phase1 — generate-requirements agent pattern', () => {
  const AGENT_KEY = 'generate-requirements:phase1';

  test('append creates a running entry before the agent call', () => {
    // Arrange
    ensureLedger(tmpDir);

    // Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry(AGENT_KEY, 'haiku'));

    // Assert: entry written with status=running, completed_at=null
    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].agent).toBe(AGENT_KEY);
    expect(ledger[0].status).toBe('running');
    expect(ledger[0].completed_at).toBeNull();
    expect(ledger[0].phase_delta_tokens).toBe(0);
    expect(ledger[0].started_at).toBe('2026-07-31T10:00:00Z');
  });

  test('update transitions the entry to done with token delta after the agent returns', () => {
    // Arrange
    ensureLedger(tmpDir);
    appendLedgerEntry(tmpDir, PREFIX, runningEntry(AGENT_KEY, 'haiku'));

    // Act (simulate agent completing with 5678 tokens)
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, doneUpdate(5678));

    // Assert
    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].status).toBe('done');
    expect(ledger[0].completed_at).toBe('2026-07-31T10:05:00Z');
    expect(ledger[0].phase_delta_tokens).toBe(5678);
  });

  test('immutable fields (agent, phase, model, started_at) are preserved after update', () => {
    // Arrange
    ensureLedger(tmpDir);
    appendLedgerEntry(tmpDir, PREFIX, runningEntry(AGENT_KEY, 'haiku'));

    // Act
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, doneUpdate(5678));

    // Assert: original fields unchanged
    const entry = readLedger(tmpDir)[0];
    expect(entry.agent).toBe(AGENT_KEY);
    expect(entry.phase).toBe('phase1');
    expect(entry.model).toBe('haiku');
    expect(entry.started_at).toBe('2026-07-31T10:00:00Z');
  });
});

// ── generate-tech-spec:phase1 ─────────────────────────────────────────────────

describe('pm-phase1 — generate-tech-spec agent pattern', () => {
  const AGENT_KEY = 'generate-tech-spec:phase1';

  test('append creates a running entry before the agent call', () => {
    // Arrange
    ensureLedger(tmpDir);

    // Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry(AGENT_KEY, 'haiku'));

    // Assert
    const ledger = readLedger(tmpDir);
    expect(ledger[0].agent).toBe(AGENT_KEY);
    expect(ledger[0].status).toBe('running');
    expect(ledger[0].completed_at).toBeNull();
  });

  test('update transitions the entry to done with correct token delta', () => {
    // Arrange
    ensureLedger(tmpDir);
    appendLedgerEntry(tmpDir, PREFIX, runningEntry(AGENT_KEY, 'haiku'));

    // Act
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, doneUpdate(8901));

    // Assert
    const entry = readLedger(tmpDir)[0];
    expect(entry.status).toBe('done');
    expect(entry.phase_delta_tokens).toBe(8901);
  });

  test('tech-spec entry does not affect a preceding requirements entry', () => {
    // Arrange: simulate pm-phase1 running both agents in sequence
    ensureLedger(tmpDir);
    appendLedgerEntry(tmpDir, PREFIX, runningEntry('generate-requirements:phase1', 'haiku'));
    updateLedgerEntry(tmpDir, PREFIX, 'generate-requirements:phase1', doneUpdate(5678));

    // Act: start tech-spec
    appendLedgerEntry(tmpDir, PREFIX, runningEntry(AGENT_KEY, 'haiku'));
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, doneUpdate(8901));

    // Assert: two entries, each correct and independent
    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(2);
    expect(ledger[0].agent).toBe('generate-requirements:phase1');
    expect(ledger[0].phase_delta_tokens).toBe(5678);
    expect(ledger[1].agent).toBe(AGENT_KEY);
    expect(ledger[1].phase_delta_tokens).toBe(8901);
  });
});

// ── validate-feature-docs:phase1:cycle{N} ─────────────────────────────────────

describe('pm-phase1 — validate-feature-docs cycle tracking (AC-04)', () => {
  test('cycle 1 produces a correctly keyed running entry', () => {
    // Arrange
    ensureLedger(tmpDir);
    const cycleKey = 'validate-feature-docs:phase1:cycle1';

    // Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry(cycleKey, 'haiku'));

    // Assert
    const ledger = readLedger(tmpDir);
    expect(ledger[0].agent).toBe(cycleKey);
    expect(ledger[0].status).toBe('running');
    expect(ledger[0].completed_at).toBeNull();
  });

  test('cycle 1 entry transitions to done after update', () => {
    // Arrange
    ensureLedger(tmpDir);
    const cycleKey = 'validate-feature-docs:phase1:cycle1';
    appendLedgerEntry(tmpDir, PREFIX, runningEntry(cycleKey, 'haiku'));

    // Act
    updateLedgerEntry(tmpDir, PREFIX, cycleKey, doneUpdate(2345));

    // Assert
    const entry = readLedger(tmpDir)[0];
    expect(entry.status).toBe('done');
    expect(entry.phase_delta_tokens).toBe(2345);
  });

  test('three validation cycles produce three separate entries with unique keys', () => {
    // Arrange
    ensureLedger(tmpDir);

    // Act: simulate validation loop over 3 cycles
    for (let cycle = 1; cycle <= 3; cycle++) {
      const key = `validate-feature-docs:phase1:cycle${cycle}`;
      appendLedgerEntry(tmpDir, PREFIX, runningEntry(key, 'haiku'));
      updateLedgerEntry(tmpDir, PREFIX, key, doneUpdate(cycle * 1000));
    }

    // Assert: three done entries, each with distinct key and token count
    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(3);
    for (let cycle = 1; cycle <= 3; cycle++) {
      const entry = ledger[cycle - 1];
      expect(entry.agent).toBe(`validate-feature-docs:phase1:cycle${cycle}`);
      expect(entry.status).toBe('done');
      expect(entry.phase_delta_tokens).toBe(cycle * 1000);
    }
  });

  test('updating cycle2 does not modify cycle1 entry', () => {
    // Arrange
    ensureLedger(tmpDir);
    appendLedgerEntry(tmpDir, PREFIX, runningEntry('validate-feature-docs:phase1:cycle1', 'haiku'));
    updateLedgerEntry(tmpDir, PREFIX, 'validate-feature-docs:phase1:cycle1', doneUpdate(2345));
    appendLedgerEntry(tmpDir, PREFIX, runningEntry('validate-feature-docs:phase1:cycle2', 'haiku'));

    // Act
    updateLedgerEntry(tmpDir, PREFIX, 'validate-feature-docs:phase1:cycle2', doneUpdate(3000));

    // Assert: cycle1 entry is untouched
    const ledger = readLedger(tmpDir);
    expect(ledger[0].agent).toBe('validate-feature-docs:phase1:cycle1');
    expect(ledger[0].phase_delta_tokens).toBe(2345);
    expect(ledger[0].status).toBe('done');
  });
});

// ── full pm-phase1 sequence ───────────────────────────────────────────────────

describe('pm-phase1 — full phase1 sequence (generate-requirements + tech-spec + 1 validation cycle)', () => {
  test('ledger contains three done entries in correct order after a clean phase1 run', () => {
    // Arrange: start with no ledger (define-feature was not used)

    // Act: simulate pm-phase1 startup + three agent calls
    ensureLedger(tmpDir);

    appendLedgerEntry(tmpDir, PREFIX, runningEntry('generate-requirements:phase1', 'haiku'));
    updateLedgerEntry(tmpDir, PREFIX, 'generate-requirements:phase1', doneUpdate(5000));

    appendLedgerEntry(tmpDir, PREFIX, runningEntry('generate-tech-spec:phase1', 'haiku'));
    updateLedgerEntry(tmpDir, PREFIX, 'generate-tech-spec:phase1', doneUpdate(9000));

    appendLedgerEntry(tmpDir, PREFIX, runningEntry('validate-feature-docs:phase1:cycle1', 'haiku'));
    updateLedgerEntry(tmpDir, PREFIX, 'validate-feature-docs:phase1:cycle1', doneUpdate(2000));

    // Assert: three entries, all done, in insertion order
    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(3);

    expect(ledger[0].agent).toBe('generate-requirements:phase1');
    expect(ledger[0].status).toBe('done');
    expect(ledger[0].phase_delta_tokens).toBe(5000);

    expect(ledger[1].agent).toBe('generate-tech-spec:phase1');
    expect(ledger[1].status).toBe('done');
    expect(ledger[1].phase_delta_tokens).toBe(9000);

    expect(ledger[2].agent).toBe('validate-feature-docs:phase1:cycle1');
    expect(ledger[2].status).toBe('done');
    expect(ledger[2].phase_delta_tokens).toBe(2000);
  });

  test('preceding define-feature entry is preserved when pm-phase1 appends to an existing ledger', () => {
    // Arrange: ledger pre-seeded by define-feature
    const defineEntry = {
      agent: 'define-feature:define',
      phase: 'define',
      model: 'sonnet',
      status: 'done',
      phase_delta_tokens: 12345,
      started_at: '2026-07-31T09:00:00Z',
      completed_at: '2026-07-31T09:02:00Z',
    };
    writeLedger(tmpDir, [defineEntry]);

    // Act: pm-phase1 appends its first agent
    appendLedgerEntry(tmpDir, PREFIX, runningEntry('generate-requirements:phase1', 'haiku'));
    updateLedgerEntry(tmpDir, PREFIX, 'generate-requirements:phase1', doneUpdate(5000));

    // Assert: define-feature entry at index 0 is intact
    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(2);
    expect(ledger[0]).toEqual(defineEntry);
    expect(ledger[1].agent).toBe('generate-requirements:phase1');
    expect(ledger[1].status).toBe('done');
  });

  test('all entries across the full phase1 sequence have the phase field set to phase1', () => {
    // Arrange
    ensureLedger(tmpDir);

    // Act
    const agents = [
      'generate-requirements:phase1',
      'generate-tech-spec:phase1',
      'validate-feature-docs:phase1:cycle1',
    ];
    for (const key of agents) {
      appendLedgerEntry(tmpDir, PREFIX, runningEntry(key, 'haiku'));
      updateLedgerEntry(tmpDir, PREFIX, key, doneUpdate(1000));
    }

    // Assert: every entry has phase='phase1'
    const ledger = readLedger(tmpDir);
    for (const entry of ledger) {
      expect(entry.phase).toBe('phase1');
    }
  });
});

// ── liveness signal: running entry visible before update ─────────────────────

describe('pm-phase1 — liveness signal (AC-07)', () => {
  test('running entry is visible on disk between append and update calls', () => {
    // Arrange
    ensureLedger(tmpDir);

    // Act — ONLY append, do not update yet (simulates mid-agent-execution snapshot)
    appendLedgerEntry(tmpDir, PREFIX, runningEntry('generate-requirements:phase1', 'haiku'));

    // Assert: file on disk shows running entry with null completed_at
    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].status).toBe('running');
    expect(ledger[0].completed_at).toBeNull();
    expect(ledger[0].started_at).not.toBeNull();
  });

  test('running entry is valid JSON (parseable) before the agent completes', () => {
    // Arrange
    ensureLedger(tmpDir);

    // Act
    appendLedgerEntry(tmpDir, PREFIX, runningEntry('generate-tech-spec:phase1', 'haiku'));

    // Assert: file can be parsed without error
    expect(() => readLedger(tmpDir)).not.toThrow();
  });
});
