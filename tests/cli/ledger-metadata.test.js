'use strict';

/**
 * Ledger metadata safety invariant tests.
 * US-14-TASK-TEST-01 (FTR-017).
 *
 * Contracts verified (AC-21, AC-41):
 *  1. Named metadata flags (--agent-id, --native-name, --toolkit-version, --scope, --hash)
 *     are accepted by ledger open and stored with the correct whitelisted keys.
 *  2. Reserved fields (operation_id, status, etc.) cannot be set via --metadata-json.
 *  3. Unknown metadata keys are rejected before any write.
 *  4. Idempotent re-open with identical metadata is a no-op (status resets to running, no error).
 *  5. Idempotent re-open with different metadata exits non-zero with no write.
 *  6. close/fail preserve metadata and update only status/timestamps/error.
 *  7. Old entries survive open/close/fail on a different operation without data loss.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI          = path.join(__dirname, '..', '..', 'bin', 'cli.js');
const TOOLKIT_ROOT = path.join(__dirname, '..', '..');

jest.setTimeout(30000);

function runCLI(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', shell: false });
}

const tmpDirs = [];
function mktmp(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ledger-meta-${label}-`));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

function readLedger(dir, prefix) {
  const p = path.join(dir, prefix + '-token-ledger.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  // Ledger file is a bare array of entries
  return { entries: Array.isArray(raw) ? raw : raw.entries };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Named metadata flags are stored with correct whitelisted keys
// ─────────────────────────────────────────────────────────────────────────────

describe('ledger metadata — named flags stored with correct keys (AC-21)', () => {
  test('--agent-id is stored as agentId', () => {
    const dir = mktmp('agent-id');
    const r = runCLI(['ledger', 'open', '--prefix', 'TST-001', '--agent', 'test:agent', '--phase', 'phase3', '--dir', dir, '--agent-id', 'gaia.agent.developer.backend']);
    expect(r.status).toBe(0);
    const { entry } = JSON.parse(r.stdout);
    expect(entry.agentId).toBe('gaia.agent.developer.backend');
  });

  test('--native-name is stored as nativeAgentName', () => {
    const dir = mktmp('native-name');
    const r = runCLI(['ledger', 'open', '--prefix', 'TST-001', '--agent', 'test:agent', '--phase', 'phase3', '--dir', dir, '--native-name', 'developer-backend']);
    expect(r.status).toBe(0);
    const { entry } = JSON.parse(r.stdout);
    expect(entry.nativeAgentName).toBe('developer-backend');
  });

  test('--toolkit-version is stored as toolkitVersion', () => {
    const dir = mktmp('tk-version');
    const r = runCLI(['ledger', 'open', '--prefix', 'TST-001', '--agent', 'test:agent', '--phase', 'phase3', '--dir', dir, '--toolkit-version', '0.13.0']);
    expect(r.status).toBe(0);
    const { entry } = JSON.parse(r.stdout);
    expect(entry.toolkitVersion).toBe('0.13.0');
  });

  test('--scope is stored as resolutionScope', () => {
    const dir = mktmp('scope');
    const r = runCLI(['ledger', 'open', '--prefix', 'TST-001', '--agent', 'test:agent', '--phase', 'phase3', '--dir', dir, '--scope', 'project']);
    expect(r.status).toBe(0);
    const { entry } = JSON.parse(r.stdout);
    expect(entry.resolutionScope).toBe('project');
  });

  test('--hash is stored as definitionHash', () => {
    const dir = mktmp('hash');
    const r = runCLI(['ledger', 'open', '--prefix', 'TST-001', '--agent', 'test:agent', '--phase', 'phase3', '--dir', dir, '--hash', 'sha256:abc123']);
    expect(r.status).toBe(0);
    const { entry } = JSON.parse(r.stdout);
    expect(entry.definitionHash).toBe('sha256:abc123');
  });

  test('all named flags together are stored correctly', () => {
    const dir = mktmp('all-flags');
    const r = runCLI([
      'ledger', 'open',
      '--prefix', 'TST-001',
      '--agent', 'test:agent',
      '--phase', 'phase3',
      '--dir', dir,
      '--agent-id', 'gaia.agent.developer.backend',
      '--native-name', 'developer-backend',
      '--toolkit-version', '0.13.0',
      '--scope', 'project',
      '--hash', 'sha256:deadbeef',
    ]);
    expect(r.status).toBe(0);
    const { entry } = JSON.parse(r.stdout);
    expect(entry.agentId).toBe('gaia.agent.developer.backend');
    expect(entry.nativeAgentName).toBe('developer-backend');
    expect(entry.toolkitVersion).toBe('0.13.0');
    expect(entry.resolutionScope).toBe('project');
    expect(entry.definitionHash).toBe('sha256:deadbeef');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Reserved fields rejected via --metadata-json (AC-41)
// ─────────────────────────────────────────────────────────────────────────────

describe('ledger metadata — reserved fields rejected before any write (AC-41)', () => {
  const RESERVED = ['operation_id', 'status', 'started_at', 'completed_at', 'phase_delta_tokens', 'error'];

  test.each(RESERVED.map(k => [k]))(
    'metadata key "%s" is rejected (reserved) and no ledger file is written',
    (key) => {
      const dir = mktmp('reserved-' + key);
      const r = runCLI([
        'ledger', 'open',
        '--prefix', 'TST-001',
        '--agent', 'test:agent',
        '--phase', 'phase3',
        '--dir', dir,
        '--metadata-json', JSON.stringify({ [key]: 'any-value' }),
      ]);
      expect(r.status).not.toBe(0);
      // No ledger file written (fail-closed: validation before I/O)
      expect(fs.existsSync(path.join(dir, 'TST-001-token-ledger.json'))).toBe(false);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Unknown metadata keys rejected before any write (AC-41)
// ─────────────────────────────────────────────────────────────────────────────

describe('ledger metadata — unknown key rejected before any write (AC-41)', () => {
  test('--metadata-json with an unknown key exits non-zero', () => {
    const dir = mktmp('unknown-key');
    const r = runCLI([
      'ledger', 'open',
      '--prefix', 'TST-001',
      '--agent', 'test:agent',
      '--phase', 'phase3',
      '--dir', dir,
      '--metadata-json', JSON.stringify({ unknownKey: 'value' }),
    ]);
    expect(r.status).not.toBe(0);
  });

  test('unknown key rejection produces no ledger file (fail-closed)', () => {
    const dir = mktmp('unknown-key-nowrite');
    runCLI([
      'ledger', 'open',
      '--prefix', 'TST-001',
      '--agent', 'test:agent',
      '--phase', 'phase3',
      '--dir', dir,
      '--metadata-json', JSON.stringify({ unknownKey: 'value' }),
    ]);
    expect(fs.existsSync(path.join(dir, 'TST-001-token-ledger.json'))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Idempotent re-open with identical metadata is a no-op (AC-21)
// ─────────────────────────────────────────────────────────────────────────────

describe('ledger metadata — idempotent re-open with same metadata is a no-op (AC-21)', () => {
  test('re-open with identical metadata succeeds and does not change stored metadata', () => {
    const dir = mktmp('idempotent');
    const flags = [
      'ledger', 'open',
      '--prefix', 'TST-001', '--agent', 'test:agent', '--phase', 'phase3', '--dir', dir,
      '--agent-id', 'gaia.agent.developer.backend',
    ];
    const r1 = runCLI(flags);
    expect(r1.status).toBe(0);
    // Re-open with the same metadata
    const r2 = runCLI(flags);
    expect(r2.status).toBe(0);
    const { entry } = JSON.parse(r2.stdout);
    expect(entry.agentId).toBe('gaia.agent.developer.backend');
    expect(entry.status).toBe('running');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Idempotent re-open with different metadata exits non-zero with no write (AC-21)
// ─────────────────────────────────────────────────────────────────────────────

describe('ledger metadata — re-open with different metadata exits non-zero with no write (AC-21)', () => {
  test('re-open with conflicting metadata exits non-zero', () => {
    const dir = mktmp('conflict');
    runCLI(['ledger', 'open', '--prefix', 'TST-001', '--agent', 'test:agent', '--phase', 'phase3', '--dir', dir, '--agent-id', 'gaia.agent.developer.backend']);
    const r2 = runCLI(['ledger', 'open', '--prefix', 'TST-001', '--agent', 'test:agent', '--phase', 'phase3', '--dir', dir, '--agent-id', 'gaia.agent.developer.frontend']);
    expect(r2.status).not.toBe(0);
  });

  test('conflicting re-open does not overwrite stored metadata', () => {
    const dir = mktmp('conflict-nowrite');
    runCLI(['ledger', 'open', '--prefix', 'TST-001', '--agent', 'test:agent', '--phase', 'phase3', '--dir', dir, '--agent-id', 'gaia.agent.developer.backend']);
    runCLI(['ledger', 'open', '--prefix', 'TST-001', '--agent', 'test:agent', '--phase', 'phase3', '--dir', dir, '--agent-id', 'gaia.agent.developer.frontend']);
    const { entries } = readLedger(dir, 'TST-001');
    expect(entries[0].agentId).toBe('gaia.agent.developer.backend');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. close/fail preserve metadata and update only status/timestamps/error (AC-21)
// ─────────────────────────────────────────────────────────────────────────────

describe('ledger metadata — close/fail preserve metadata fields (AC-21)', () => {
  test('close preserves all stored metadata fields', () => {
    const dir = mktmp('close-preserve');
    runCLI(['ledger', 'open', '--prefix', 'TST-001', '--agent', 'test:agent', '--phase', 'phase3', '--dir', dir,
      '--agent-id', 'gaia.agent.developer.backend',
      '--native-name', 'developer-backend',
      '--toolkit-version', '0.13.0',
    ]);
    const rc = runCLI(['ledger', 'close', '--prefix', 'TST-001', '--agent', 'test:agent', '--dir', dir]);
    expect(rc.status).toBe(0);
    const { entries } = readLedger(dir, 'TST-001');
    const e = entries[0];
    expect(e.status).toBe('done');
    expect(e.agentId).toBe('gaia.agent.developer.backend');
    expect(e.nativeAgentName).toBe('developer-backend');
    expect(e.toolkitVersion).toBe('0.13.0');
  });

  test('fail preserves all stored metadata fields', () => {
    const dir = mktmp('fail-preserve');
    runCLI(['ledger', 'open', '--prefix', 'TST-001', '--agent', 'test:agent', '--phase', 'phase3', '--dir', dir,
      '--scope', 'project',
      '--hash', 'sha256:abc',
    ]);
    const rf = runCLI(['ledger', 'fail', '--prefix', 'TST-001', '--agent', 'test:agent', '--dir', dir, '--error', 'test failure']);
    expect(rf.status).toBe(0);
    const { entries } = readLedger(dir, 'TST-001');
    const e = entries[0];
    expect(e.status).toBe('failed');
    expect(e.resolutionScope).toBe('project');
    expect(e.definitionHash).toBe('sha256:abc');
    expect(e.error).toBe('test failure');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Old entries survive updates without data loss (AC-21)
// ─────────────────────────────────────────────────────────────────────────────

describe('ledger metadata — old entries survive operations on other entries (AC-21)', () => {
  test('opening a second entry does not corrupt the first entry metadata', () => {
    const dir = mktmp('no-loss');
    runCLI(['ledger', 'open', '--prefix', 'TST-001', '--agent', 'agent-a', '--phase', 'phase3', '--dir', dir, '--agent-id', 'gaia.agent.developer.backend']);
    runCLI(['ledger', 'open', '--prefix', 'TST-001', '--agent', 'agent-b', '--phase', 'phase3', '--dir', dir, '--agent-id', 'gaia.agent.developer.frontend']);
    const { entries } = readLedger(dir, 'TST-001');
    const a = entries.find(e => e.agent === 'agent-a');
    const b = entries.find(e => e.agent === 'agent-b');
    expect(a.agentId).toBe('gaia.agent.developer.backend');
    expect(b.agentId).toBe('gaia.agent.developer.frontend');
  });
});
