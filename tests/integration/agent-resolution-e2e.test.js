'use strict';

/**
 * Tier 1 dispatch guard — end-to-end integration tests.
 * US-04-TASK-TEST-01 (FTR-017).
 *
 * Verifies the CLI command chain that implement-feature/SKILL.md instructs,
 * without invoking any real LLM pipeline. Tests the contractual behaviour of:
 *   - ledger open --metadata-json (AC-06): identity metadata persisted before dispatch
 *   - fail-closed guard (AC-20): second open on same entry returns non-zero
 *   - missing pm-phase3 hard stop (AC-08): agents resolve --require-verified exits non-zero
 *   - post-return ledger close/fail (AC-22): errors after dispatch are not swallowed
 */

const crypto   = require('crypto');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const { spawnSync } = require('child_process');

const CLI          = path.join(__dirname, '..', '..', 'bin', 'cli.js');
const TOOLKIT_ROOT = path.join(__dirname, '..', '..');

jest.setTimeout(60000);

function runCLI(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', shell: false });
}

const tmpDirs = [];
function mktmp(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `tier1-e2e-${label}-`));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

// ─────────────────────────────────────────────────────────────────────────────
// Ledger open with --metadata-json (AC-06)
// ─────────────────────────────────────────────────────────────────────────────

describe('ledger open --metadata-json — identity metadata persisted before dispatch (AC-06)', () => {
  const PREFIX  = 'FTR-099';
  const AGENT   = 'pm-phase3:dispatch';
  const META    = {
    agentId:         'gaia.orchestrator.feature.phase3',
    nativeAgentName: 'pm-phase3',
    platform:        'claude',
    toolkitVersion:  '0.13.0',
    resolutionScope: 'project',
    definitionHash:  'sha256:' + 'a'.repeat(64),
  };

  let ledgerDir;

  beforeEach(() => {
    ledgerDir = mktmp('ledger-meta');
  });

  test('exits 0 when metadata keys are all whitelisted', () => {
    const result = runCLI([
      'ledger', 'open',
      '--prefix', PREFIX,
      '--agent',  AGENT,
      '--phase',  'phase3',
      '--dir',    ledgerDir,
      '--metadata-json', JSON.stringify(META),
    ]);
    expect(result.status).toBe(0);
  });

  test('ledger entry exists on disk after open with metadata', () => {
    runCLI([
      'ledger', 'open',
      '--prefix', PREFIX, '--agent', AGENT, '--phase', 'phase3',
      '--dir', ledgerDir, '--metadata-json', JSON.stringify(META),
    ]);
    const ledgerPath = path.join(ledgerDir, PREFIX + '-token-ledger.json');
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const entries = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    expect(entries.length).toBe(1);
    expect(entries[0].status).toBe('running');
  });

  test('exits non-zero when --metadata-json contains a non-whitelisted key', () => {
    const badMeta = Object.assign({}, META, { secretKey: 'should-be-rejected' });
    const result  = runCLI([
      'ledger', 'open',
      '--prefix', PREFIX, '--agent', AGENT, '--phase', 'phase3',
      '--dir', ledgerDir, '--metadata-json', JSON.stringify(badMeta),
    ]);
    expect(result.status).not.toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fail-closed guard: conflicting metadata on re-open returns non-zero (AC-20)
// ─────────────────────────────────────────────────────────────────────────────

describe('fail-closed guard — metadata conflict rejects a re-open (AC-20)', () => {
  const PREFIX  = 'FTR-099';
  const AGENT   = 'pm-phase3:dispatch';
  const META_A  = { agentId: 'gaia.orchestrator.feature.phase3', platform: 'claude' };
  const META_B  = { agentId: 'gaia.orchestrator.feature.phase3', platform: 'codex' };  // different

  let ledgerDir;

  beforeEach(() => {
    ledgerDir = mktmp('ledger-failclosed');
    // First open with metadata A — should succeed
    runCLI([
      'ledger', 'open',
      '--prefix', PREFIX, '--agent', AGENT, '--phase', 'phase3',
      '--dir', ledgerDir,
      '--metadata-json', JSON.stringify(META_A),
    ]);
  });

  test('re-open with conflicting metadata exits non-zero (METADATA_CONFLICT)', () => {
    const result = runCLI([
      'ledger', 'open',
      '--prefix', PREFIX, '--agent', AGENT, '--phase', 'phase3',
      '--dir', ledgerDir,
      '--metadata-json', JSON.stringify(META_B),  // different value → conflict
    ]);
    expect(result.status).not.toBe(0);
  });

  test('idempotent re-open with identical metadata exits 0 (same-metadata no-op)', () => {
    const result = runCLI([
      'ledger', 'open',
      '--prefix', PREFIX, '--agent', AGENT, '--phase', 'phase3',
      '--dir', ledgerDir,
      '--metadata-json', JSON.stringify(META_A),  // same → no-op
    ]);
    expect(result.status).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Missing pm-phase3 hard stop (AC-08): agents resolve --require-verified exits
// non-zero when no installation present
// ─────────────────────────────────────────────────────────────────────────────

describe('missing pm-phase3 hard stop — resolve --require-verified fails (AC-08)', () => {
  let projDir;
  let fakeHome;

  beforeEach(() => {
    projDir  = mktmp('phase3-absent-project');
    fakeHome = mktmp('phase3-absent-home');
    // No manifest → pm-phase3 cannot be verified
  });

  test('exits non-zero when pm-phase3 is not installed', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', 'gaia.orchestrator.feature.phase3',
      '--home', fakeHome,
      '--require-verified',
    ]);
    expect(result.status).not.toBe(0);
  });

  test('structured error on stderr has status != verified (no dispatch should follow)', () => {
    const result = runCLI([
      'agents', 'resolve',
      '--project', projDir,
      '--id', 'gaia.orchestrator.feature.phase3',
      '--home', fakeHome,
      '--require-verified',
    ]);
    expect(result.status).not.toBe(0);
    const errRecord = JSON.parse(result.stderr);
    expect(errRecord.status).not.toBe('verified');
    expect(errRecord.agentId).toBe('gaia.orchestrator.feature.phase3');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Post-return ledger close/fail not swallowed (AC-22)
// ─────────────────────────────────────────────────────────────────────────────

describe('post-return ledger close — not swallowed on success (AC-22)', () => {
  const PREFIX = 'FTR-099';
  const AGENT  = 'pm-phase3:dispatch';

  let ledgerDir;

  beforeEach(() => {
    ledgerDir = mktmp('ledger-close-ok');
    runCLI([
      'ledger', 'open',
      '--prefix', PREFIX, '--agent', AGENT, '--phase', 'phase3',
      '--dir', ledgerDir,
    ]);
  });

  test('ledger close exits 0 on a running entry', () => {
    const result = runCLI([
      'ledger', 'close',
      '--prefix', PREFIX, '--agent', AGENT,
      '--dir', ledgerDir,
    ]);
    expect(result.status).toBe(0);
  });

  test('ledger close exits non-zero when entry does not exist (error is surfaced, not swallowed)', () => {
    // Close a different agent that was never opened → should fail (no entry found)
    const result = runCLI([
      'ledger', 'close',
      '--prefix', PREFIX, '--agent', 'pm-phase99:dispatch',  // never opened
      '--dir', ledgerDir,
    ]);
    expect(result.status).not.toBe(0);
  });
});

describe('post-return ledger fail — not swallowed (AC-22)', () => {
  const PREFIX = 'FTR-099';
  const AGENT  = 'pm-phase3:dispatch';

  let ledgerDir;

  beforeEach(() => {
    ledgerDir = mktmp('ledger-fail-ac22');
    runCLI([
      'ledger', 'open',
      '--prefix', PREFIX, '--agent', AGENT, '--phase', 'phase3',
      '--dir', ledgerDir,
    ]);
  });

  test('ledger fail exits 0 on a running entry', () => {
    const result = runCLI([
      'ledger', 'fail',
      '--prefix', PREFIX, '--agent', AGENT,
      '--error', 'pm-phase3 workflow error',
      '--dir', ledgerDir,
    ]);
    expect(result.status).toBe(0);
  });

  test('ledger fail exits non-zero when entry does not exist (error is surfaced, not swallowed)', () => {
    // Fail a different agent that was never opened → should fail (no entry found)
    const result = runCLI([
      'ledger', 'fail',
      '--prefix', PREFIX, '--agent', 'pm-phase99:dispatch',  // never opened
      '--error', 'late error',
      '--dir', ledgerDir,
    ]);
    expect(result.status).not.toBe(0);
  });
});
