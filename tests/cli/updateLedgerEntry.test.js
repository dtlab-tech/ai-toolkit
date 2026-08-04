'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { updateLedgerEntry } = require('../../bin/cli');

const PREFIX = 'FTR-013';

function ledgerPath(dir) {
  return path.join(dir, `${PREFIX}-token-ledger.json`);
}

function readLedger(dir) {
  return JSON.parse(fs.readFileSync(ledgerPath(dir), 'utf8'));
}

function writeLedger(dir, ledger) {
  fs.writeFileSync(ledgerPath(dir), JSON.stringify(ledger, null, 2), 'utf8');
}

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-ledger-update-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── happy path: update existing entry ────────────────────────────────────────

describe('updateLedgerEntry() — entry exists', () => {
  test('updates status, completed_at, and phase_delta_tokens of the matched entry', () => {
    const initial = [
      {
        agent: 'generate-requirements:phase1',
        phase: 'phase1',
        model: 'haiku',
        status: 'running',
        phase_delta_tokens: 0,
        started_at: '2026-07-31T10:00:00Z',
        completed_at: null,
      },
    ];
    writeLedger(tmpDir, initial);

    updateLedgerEntry(tmpDir, PREFIX, 'generate-requirements:phase1', {
      status: 'done',
      completed_at: '2026-07-31T10:05:00Z',
      phase_delta_tokens: 4321,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].status).toBe('done');
    expect(ledger[0].completed_at).toBe('2026-07-31T10:05:00Z');
    expect(ledger[0].phase_delta_tokens).toBe(4321);
  });

  test('preserves fields not mentioned in updates', () => {
    const initial = [
      {
        agent: 'generate-tech-spec:phase1',
        phase: 'phase1',
        model: 'haiku',
        status: 'running',
        phase_delta_tokens: 0,
        started_at: '2026-07-31T10:10:00Z',
        completed_at: null,
      },
    ];
    writeLedger(tmpDir, initial);

    updateLedgerEntry(tmpDir, PREFIX, 'generate-tech-spec:phase1', {
      status: 'done',
      completed_at: '2026-07-31T10:15:00Z',
      phase_delta_tokens: 7890,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger[0].agent).toBe('generate-tech-spec:phase1');
    expect(ledger[0].phase).toBe('phase1');
    expect(ledger[0].model).toBe('haiku');
    expect(ledger[0].started_at).toBe('2026-07-31T10:10:00Z');
  });

  test('updates only the matched entry and leaves other entries unchanged', () => {
    const initial = [
      { agent: 'a:phase1', phase: 'phase1', model: 'haiku', status: 'done', phase_delta_tokens: 100, started_at: '2026-07-31T09:00:00Z', completed_at: '2026-07-31T09:01:00Z' },
      { agent: 'b:phase1', phase: 'phase1', model: 'haiku', status: 'running', phase_delta_tokens: 0, started_at: '2026-07-31T09:01:01Z', completed_at: null },
      { agent: 'c:phase2', phase: 'phase2', model: 'haiku', status: 'done', phase_delta_tokens: 200, started_at: '2026-07-31T09:05:00Z', completed_at: '2026-07-31T09:06:00Z' },
    ];
    writeLedger(tmpDir, initial);

    updateLedgerEntry(tmpDir, PREFIX, 'b:phase1', {
      status: 'done',
      completed_at: '2026-07-31T09:03:00Z',
      phase_delta_tokens: 150,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(3);
    expect(ledger[0]).toEqual(initial[0]);
    expect(ledger[1].status).toBe('done');
    expect(ledger[1].phase_delta_tokens).toBe(150);
    expect(ledger[2]).toEqual(initial[2]);
  });
});

// ── last-match semantics (duplicate keys) ─────────────────────────────────────

describe('updateLedgerEntry() — duplicate agent keys', () => {
  test('updates the last entry when the agent key appears more than once', () => {
    const initial = [
      { agent: 'validate-feature-docs:phase1:cycle1', phase: 'phase1', model: 'haiku', status: 'done', phase_delta_tokens: 50, started_at: '2026-07-31T10:00:00Z', completed_at: '2026-07-31T10:01:00Z' },
      { agent: 'validate-feature-docs:phase1:cycle1', phase: 'phase1', model: 'haiku', status: 'running', phase_delta_tokens: 0, started_at: '2026-07-31T10:02:00Z', completed_at: null },
    ];
    writeLedger(tmpDir, initial);

    updateLedgerEntry(tmpDir, PREFIX, 'validate-feature-docs:phase1:cycle1', {
      status: 'done',
      completed_at: '2026-07-31T10:04:00Z',
      phase_delta_tokens: 80,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(2);
    // First entry must be untouched
    expect(ledger[0].phase_delta_tokens).toBe(50);
    expect(ledger[0].completed_at).toBe('2026-07-31T10:01:00Z');
    // Last entry is the one updated
    expect(ledger[1].status).toBe('done');
    expect(ledger[1].phase_delta_tokens).toBe(80);
    expect(ledger[1].completed_at).toBe('2026-07-31T10:04:00Z');
  });
});

// ── silent no-ops ─────────────────────────────────────────────────────────────

describe('updateLedgerEntry() — silent no-ops', () => {
  test('does nothing when the ledger file does not exist', () => {
    expect(() =>
      updateLedgerEntry(tmpDir, PREFIX, 'nonexistent:phase1', { status: 'done', completed_at: '2026-07-31T10:00:00Z', phase_delta_tokens: 0 })
    ).not.toThrow();
    expect(fs.existsSync(ledgerPath(tmpDir))).toBe(false);
  });

  test('does not throw when agent key is not found in an existing ledger', () => {
    writeLedger(tmpDir, [
      { agent: 'existing-agent:phase1', phase: 'phase1', model: 'haiku', status: 'done', phase_delta_tokens: 100, started_at: '2026-07-31T10:00:00Z', completed_at: '2026-07-31T10:01:00Z' },
    ]);

    expect(() =>
      updateLedgerEntry(tmpDir, PREFIX, 'missing-agent:phase1', { status: 'done', completed_at: '2026-07-31T10:05:00Z', phase_delta_tokens: 0 })
    ).not.toThrow();
  });

  test('leaves existing entries intact when agent key is not found', () => {
    const initial = [
      { agent: 'existing-agent:phase1', phase: 'phase1', model: 'haiku', status: 'done', phase_delta_tokens: 100, started_at: '2026-07-31T10:00:00Z', completed_at: '2026-07-31T10:01:00Z' },
    ];
    writeLedger(tmpDir, initial);

    updateLedgerEntry(tmpDir, PREFIX, 'missing-agent:phase1', { status: 'done', completed_at: '2026-07-31T10:05:00Z', phase_delta_tokens: 0 });

    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toEqual(initial[0]);
  });

  test('does not throw on malformed JSON in existing file', () => {
    fs.writeFileSync(ledgerPath(tmpDir), '{ not valid json', 'utf8');
    expect(() =>
      updateLedgerEntry(tmpDir, PREFIX, 'some-agent:phase1', { status: 'done', completed_at: '2026-07-31T10:00:00Z', phase_delta_tokens: 0 })
    ).not.toThrow();
  });
});

// ── failed status ─────────────────────────────────────────────────────────────

describe('updateLedgerEntry() — failed status', () => {
  test('can set status to "failed"', () => {
    writeLedger(tmpDir, [
      { agent: 'developer-backend:US-01', phase: 'phase3', model: 'sonnet', status: 'running', phase_delta_tokens: 0, started_at: '2026-07-31T11:00:00Z', completed_at: null },
    ]);

    updateLedgerEntry(tmpDir, PREFIX, 'developer-backend:US-01', {
      status: 'failed',
      completed_at: '2026-07-31T11:05:00Z',
      phase_delta_tokens: 3000,
    });

    const ledger = readLedger(tmpDir);
    expect(ledger[0].status).toBe('failed');
    expect(ledger[0].phase_delta_tokens).toBe(3000);
  });
});
