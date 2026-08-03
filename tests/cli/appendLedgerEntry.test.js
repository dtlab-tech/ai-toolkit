'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { appendLedgerEntry } = require('../../bin/cli');

const PREFIX = 'FTR-013';

function ledgerPath(dir) {
  return path.join(dir, `${PREFIX}-token-ledger.json`);
}

function readLedger(dir) {
  return JSON.parse(fs.readFileSync(ledgerPath(dir), 'utf8'));
}

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-ledger-append-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── creates file when absent ──────────────────────────────────────────────────

describe('appendLedgerEntry() — file does not exist', () => {
  test('creates the ledger file with a single-element array', () => {
    const entry = {
      agent: 'generate-requirements:phase1',
      phase: 'phase1',
      model: 'haiku',
      status: 'running',
      phase_delta_tokens: 0,
      started_at: '2026-07-31T10:00:00Z',
      completed_at: null,
    };

    appendLedgerEntry(tmpDir, PREFIX, entry);

    expect(fs.existsSync(ledgerPath(tmpDir))).toBe(true);
    const ledger = readLedger(tmpDir);
    expect(Array.isArray(ledger)).toBe(true);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toEqual(entry);
  });

  test('produces valid JSON that can be re-parsed', () => {
    appendLedgerEntry(tmpDir, PREFIX, { agent: 'test:phase1', phase: 'phase1', model: 'haiku', status: 'running', phase_delta_tokens: 0, started_at: '2026-07-31T10:00:00Z', completed_at: null });
    expect(() => readLedger(tmpDir)).not.toThrow();
  });
});

// ── appends to existing file ──────────────────────────────────────────────────

describe('appendLedgerEntry() — file already exists', () => {
  test('appends new entry to an existing single-entry ledger', () => {
    const first = { agent: 'define-feature:define', phase: 'define', model: 'sonnet', status: 'done', phase_delta_tokens: 100, started_at: '2026-07-31T09:00:00Z', completed_at: '2026-07-31T09:01:00Z' };
    fs.writeFileSync(ledgerPath(tmpDir), JSON.stringify([first], null, 2), 'utf8');

    const second = { agent: 'generate-requirements:phase1', phase: 'phase1', model: 'haiku', status: 'running', phase_delta_tokens: 0, started_at: '2026-07-31T09:02:00Z', completed_at: null };
    appendLedgerEntry(tmpDir, PREFIX, second);

    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(2);
    expect(ledger[0]).toEqual(first);
    expect(ledger[1]).toEqual(second);
  });

  test('preserves all existing entries when appending', () => {
    const existing = [
      { agent: 'a:phase1', phase: 'phase1', model: 'haiku', status: 'done', phase_delta_tokens: 50, started_at: '2026-07-31T09:00:00Z', completed_at: '2026-07-31T09:01:00Z' },
      { agent: 'b:phase1', phase: 'phase1', model: 'haiku', status: 'done', phase_delta_tokens: 75, started_at: '2026-07-31T09:01:01Z', completed_at: '2026-07-31T09:02:00Z' },
    ];
    fs.writeFileSync(ledgerPath(tmpDir), JSON.stringify(existing, null, 2), 'utf8');

    const newEntry = { agent: 'c:phase2', phase: 'phase2', model: 'haiku', status: 'running', phase_delta_tokens: 0, started_at: '2026-07-31T09:03:00Z', completed_at: null };
    appendLedgerEntry(tmpDir, PREFIX, newEntry);

    const ledger = readLedger(tmpDir);
    expect(ledger).toHaveLength(3);
    expect(ledger[0]).toEqual(existing[0]);
    expect(ledger[1]).toEqual(existing[1]);
    expect(ledger[2]).toEqual(newEntry);
  });
});

// ── malformed JSON recovery ───────────────────────────────────────────────────

describe('appendLedgerEntry() — malformed JSON in existing file', () => {
  test('overwrites malformed file with a single-entry array containing the new entry', () => {
    fs.writeFileSync(ledgerPath(tmpDir), '{ this is not json!!!', 'utf8');

    const entry = { agent: 'test:phase1', phase: 'phase1', model: 'haiku', status: 'running', phase_delta_tokens: 0, started_at: '2026-07-31T10:00:00Z', completed_at: null };
    appendLedgerEntry(tmpDir, PREFIX, entry);

    const ledger = readLedger(tmpDir);
    expect(Array.isArray(ledger)).toBe(true);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toEqual(entry);
  });

  test('does not throw on malformed JSON', () => {
    fs.writeFileSync(ledgerPath(tmpDir), 'not valid json', 'utf8');
    const entry = { agent: 'test:phase1', phase: 'phase1', model: 'haiku', status: 'running', phase_delta_tokens: 0, started_at: null, completed_at: null };
    expect(() => appendLedgerEntry(tmpDir, PREFIX, entry)).not.toThrow();
  });
});

// ── status field written correctly ───────────────────────────────────────────

describe('appendLedgerEntry() — running entry shape', () => {
  test('written entry has status="running" and completed_at=null', () => {
    const entry = {
      agent: 'developer-backend:US-01',
      phase: 'phase3',
      model: 'sonnet',
      status: 'running',
      phase_delta_tokens: 0,
      started_at: '2026-07-31T12:00:00Z',
      completed_at: null,
    };
    appendLedgerEntry(tmpDir, PREFIX, entry);
    const ledger = readLedger(tmpDir);
    expect(ledger[0].status).toBe('running');
    expect(ledger[0].completed_at).toBeNull();
    expect(ledger[0].phase_delta_tokens).toBe(0);
  });
});
