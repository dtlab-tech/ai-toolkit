'use strict';

/**
 * US-01-T03 — define-feature ledger initialization and finalization
 *
 * define-feature.md writes the ledger in two phases:
 *   Phase 1c — initial running entry (Write tool with raw JSON)
 *   Phase 4b — finalization (Read → mutate → Write, setting status="done")
 *
 * These tests verify the correct shape, content, and JSON validity of the
 * ledger at each stage, using appendLedgerEntry / updateLedgerEntry as proxies
 * for the Write-tool operations the agent performs.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { appendLedgerEntry, updateLedgerEntry } = require('../../bin/cli');

const PREFIX = 'FTR-DEFINE';
const AGENT_KEY = 'define-feature:define';

const ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function ledgerPath(dir) {
  return path.join(dir, `${PREFIX}-token-ledger.json`);
}

function readLedger(dir) {
  return JSON.parse(fs.readFileSync(ledgerPath(dir), 'utf8'));
}

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-define-ledger-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Phase 1c: initial running entry ──────────────────────────────────────────

describe('define-feature initialization (Phase 1c)', () => {
  test('creates a ledger file with a single entry when none exists', () => {
    // Arrange — no ledger file exists (feature directory freshly created)
    const started_at = '2026-08-01T09:00:00Z';

    // Act — simulate the Write-tool operation define-feature performs in Phase 1c
    appendLedgerEntry(tmpDir, PREFIX, {
      agent: AGENT_KEY,
      phase: 'define',
      model: 'sonnet',
      status: 'running',
      phase_delta_tokens: 0,
      started_at,
      completed_at: null,
    });

    // Assert
    expect(fs.existsSync(ledgerPath(tmpDir))).toBe(true);
    const ledger = readLedger(tmpDir);
    expect(Array.isArray(ledger)).toBe(true);
    expect(ledger).toHaveLength(1);
  });

  test('initial entry has agent key "define-feature:define"', () => {
    appendLedgerEntry(tmpDir, PREFIX, {
      agent: AGENT_KEY,
      phase: 'define',
      model: 'sonnet',
      status: 'running',
      phase_delta_tokens: 0,
      started_at: '2026-08-01T09:00:00Z',
      completed_at: null,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger[0].agent).toBe(AGENT_KEY);
  });

  test('initial entry has status="running" and completed_at=null', () => {
    appendLedgerEntry(tmpDir, PREFIX, {
      agent: AGENT_KEY,
      phase: 'define',
      model: 'sonnet',
      status: 'running',
      phase_delta_tokens: 0,
      started_at: '2026-08-01T09:00:00Z',
      completed_at: null,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger[0].status).toBe('running');
    expect(ledger[0].completed_at).toBeNull();
  });

  test('initial entry has phase_delta_tokens=0 (tokens not yet known)', () => {
    appendLedgerEntry(tmpDir, PREFIX, {
      agent: AGENT_KEY,
      phase: 'define',
      model: 'sonnet',
      status: 'running',
      phase_delta_tokens: 0,
      started_at: '2026-08-01T09:00:00Z',
      completed_at: null,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger[0].phase_delta_tokens).toBe(0);
  });

  test('initial entry has phase="define" and model="sonnet"', () => {
    appendLedgerEntry(tmpDir, PREFIX, {
      agent: AGENT_KEY,
      phase: 'define',
      model: 'sonnet',
      status: 'running',
      phase_delta_tokens: 0,
      started_at: '2026-08-01T09:00:00Z',
      completed_at: null,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger[0].phase).toBe('define');
    expect(ledger[0].model).toBe('sonnet');
  });

  test('initial entry has a non-null started_at', () => {
    appendLedgerEntry(tmpDir, PREFIX, {
      agent: AGENT_KEY,
      phase: 'define',
      model: 'sonnet',
      status: 'running',
      phase_delta_tokens: 0,
      started_at: '2026-08-01T09:00:00Z',
      completed_at: null,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger[0].started_at).not.toBeNull();
    expect(typeof ledger[0].started_at).toBe('string');
  });

  test('initial entry started_at is a valid ISO 8601 UTC timestamp', () => {
    const started_at = '2026-08-01T09:00:00Z';

    appendLedgerEntry(tmpDir, PREFIX, {
      agent: AGENT_KEY,
      phase: 'define',
      model: 'sonnet',
      status: 'running',
      phase_delta_tokens: 0,
      started_at,
      completed_at: null,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger[0].started_at).toMatch(ISO_REGEX);
  });

  test('written file is valid JSON that can be re-parsed without error', () => {
    appendLedgerEntry(tmpDir, PREFIX, {
      agent: AGENT_KEY,
      phase: 'define',
      model: 'sonnet',
      status: 'running',
      phase_delta_tokens: 0,
      started_at: '2026-08-01T09:00:00Z',
      completed_at: null,
    });

    expect(() => readLedger(tmpDir)).not.toThrow();
  });

  // define-feature Phase 1c writes raw JSON via the Write tool, not via
  // appendLedgerEntry. Verify that such a raw write produces a parseable ledger.
  test('direct raw-JSON write (simulating the agent Write tool) produces valid ledger', () => {
    // Arrange — this is the exact format define-feature.md Phase 1c writes
    const started_at = '2026-08-01T09:00:00Z';
    const rawJson = JSON.stringify(
      [
        {
          agent: AGENT_KEY,
          phase: 'define',
          model: 'sonnet',
          status: 'running',
          phase_delta_tokens: 0,
          started_at,
          completed_at: null,
        },
      ],
      null,
      2
    );

    // Act
    fs.writeFileSync(ledgerPath(tmpDir), rawJson, 'utf8');

    // Assert — readable and has correct structure
    const ledger = readLedger(tmpDir);
    expect(Array.isArray(ledger)).toBe(true);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].agent).toBe(AGENT_KEY);
    expect(ledger[0].status).toBe('running');
    expect(ledger[0].completed_at).toBeNull();
  });
});

// ── Phase 4b: finalization ────────────────────────────────────────────────────

describe('define-feature finalization (Phase 4b)', () => {
  function createRunningEntry() {
    appendLedgerEntry(tmpDir, PREFIX, {
      agent: AGENT_KEY,
      phase: 'define',
      model: 'sonnet',
      status: 'running',
      phase_delta_tokens: 0,
      started_at: '2026-08-01T09:00:00Z',
      completed_at: null,
    });
  }

  test('updates status from "running" to "done"', () => {
    // Arrange
    createRunningEntry();

    // Act — simulate define-feature Phase 4b update
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, {
      status: 'done',
      completed_at: '2026-08-01T09:04:30Z',
      phase_delta_tokens: 0,
    });

    // Assert
    const ledger = readLedger(tmpDir);
    expect(ledger[0].status).toBe('done');
  });

  test('sets a non-null completed_at after finalization', () => {
    createRunningEntry();

    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, {
      status: 'done',
      completed_at: '2026-08-01T09:04:30Z',
      phase_delta_tokens: 0,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger[0].completed_at).not.toBeNull();
    expect(typeof ledger[0].completed_at).toBe('string');
  });

  test('completed_at is a valid ISO 8601 UTC timestamp', () => {
    createRunningEntry();
    const completed_at = '2026-08-01T09:04:30Z';

    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, {
      status: 'done',
      completed_at,
      phase_delta_tokens: 0,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger[0].completed_at).toMatch(ISO_REGEX);
  });

  test('phase_delta_tokens remains 0 (define-feature cannot measure tokens directly)', () => {
    createRunningEntry();

    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, {
      status: 'done',
      completed_at: '2026-08-01T09:04:30Z',
      phase_delta_tokens: 0,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger[0].phase_delta_tokens).toBe(0);
  });

  test('preserves the original started_at from initialization', () => {
    const started_at = '2026-08-01T09:00:00Z';
    appendLedgerEntry(tmpDir, PREFIX, {
      agent: AGENT_KEY,
      phase: 'define',
      model: 'sonnet',
      status: 'running',
      phase_delta_tokens: 0,
      started_at,
      completed_at: null,
    });

    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, {
      status: 'done',
      completed_at: '2026-08-01T09:04:30Z',
      phase_delta_tokens: 0,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger[0].started_at).toBe(started_at);
  });

  test('preserves agent, phase, and model fields after finalization', () => {
    createRunningEntry();

    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, {
      status: 'done',
      completed_at: '2026-08-01T09:04:30Z',
      phase_delta_tokens: 0,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger[0].agent).toBe(AGENT_KEY);
    expect(ledger[0].phase).toBe('define');
    expect(ledger[0].model).toBe('sonnet');
  });

  test('ledger remains a single-entry array after finalization', () => {
    createRunningEntry();

    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, {
      status: 'done',
      completed_at: '2026-08-01T09:04:30Z',
      phase_delta_tokens: 0,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(1);
  });

  test('ledger file is still valid JSON after finalization', () => {
    createRunningEntry();

    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, {
      status: 'done',
      completed_at: '2026-08-01T09:04:30Z',
      phase_delta_tokens: 0,
    });

    expect(() => readLedger(tmpDir)).not.toThrow();
  });
});

// ── Full workflow: initialization → finalization ──────────────────────────────

describe('define-feature complete workflow (Phase 1c → Phase 4b)', () => {
  test('entry transitions from running to done without data loss', () => {
    // Arrange
    const started_at = '2026-08-01T09:00:00Z';
    const completed_at = '2026-08-01T09:04:30Z';

    // Act — Phase 1c
    appendLedgerEntry(tmpDir, PREFIX, {
      agent: AGENT_KEY,
      phase: 'define',
      model: 'sonnet',
      status: 'running',
      phase_delta_tokens: 0,
      started_at,
      completed_at: null,
    });

    const runningLedger = readLedger(tmpDir);
    expect(runningLedger[0].status).toBe('running');
    expect(runningLedger[0].completed_at).toBeNull();

    // Act — Phase 4b
    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, {
      status: 'done',
      completed_at,
      phase_delta_tokens: 0,
    });

    // Assert — final state
    const finalLedger = readLedger(tmpDir);
    expect(finalLedger).toHaveLength(1);
    expect(finalLedger[0]).toEqual({
      agent: AGENT_KEY,
      phase: 'define',
      model: 'sonnet',
      status: 'done',
      phase_delta_tokens: 0,
      started_at,
      completed_at,
    });
  });

  test('completed_at differs from started_at (duration > 0)', () => {
    const started_at  = '2026-08-01T09:00:00Z';
    const completed_at = '2026-08-01T09:04:30Z';

    appendLedgerEntry(tmpDir, PREFIX, {
      agent: AGENT_KEY,
      phase: 'define',
      model: 'sonnet',
      status: 'running',
      phase_delta_tokens: 0,
      started_at,
      completed_at: null,
    });

    updateLedgerEntry(tmpDir, PREFIX, AGENT_KEY, {
      status: 'done',
      completed_at,
      phase_delta_tokens: 0,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger[0].started_at).not.toBe(ledger[0].completed_at);
    expect(new Date(ledger[0].completed_at) > new Date(ledger[0].started_at)).toBe(true);
  });
});
