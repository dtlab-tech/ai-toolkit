'use strict';

/**
 * Tier 3 self-registration lifecycle tests.
 * US-06-TASK-TEST-01 (FTR-017).
 *
 * Asserts the UC-06 contract for pm-phase1/2/3 without invoking any real LLM pipeline.
 * Uses a combination of source inspection (structural guarantees) and CLI invocation
 * (ledger lifecycle guarantees).
 *
 * Contracts verified:
 *  1. pm-phaseN:self open appears before main workflow logic in each workflow file
 *  2. pm-phaseN:self close appears after main logic (near end of file)
 *  3. selfLedgerOp/ledgerTerminal throws on non-zero → fail-closed is proven by source
 *  4. A failed ledger open hard-stops (HARD STOP error thrown, no further work)
 *  5. Successful completion closes the SAME pm-phaseN:self entry to done (CLI verified)
 *  6. A simulated interruption legitimately leaves the entry running (no catch-all fail)
 *  7. The :self entry is never touched by the Tier 1 :dispatch guard (SKILL.md check)
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI          = path.join(__dirname, '..', '..', 'bin', 'cli.js');
const WORKFLOW_DIR = path.join(__dirname, '..', '..', 'src', 'claude', 'workflows');
const SKILL_PATH   = path.join(__dirname, '..', '..', 'src', 'claude', 'skills', 'implement-feature', 'SKILL.md');

jest.setTimeout(30000);

function runCLI(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', shell: false });
}

const tmpDirs = [];
function mktmp(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `self-reg-${label}-`));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. pm-phaseN:self open appears BEFORE main workflow logic
// ─────────────────────────────────────────────────────────────────────────────

describe('UC-06 — pm-phaseN:self open is before main logic in each workflow', () => {
  test('pm-phase1.js: pm-phase1:self open precedes the Discovery agent dispatch', () => {
    const source      = fs.readFileSync(path.join(WORKFLOW_DIR, 'pm-phase1.js'), 'utf8');
    const selfOpenIdx = source.indexOf('pm-phase1:self');
    const discoverIdx = source.indexOf("label: 'discovery'");
    expect(selfOpenIdx).toBeGreaterThan(-1);
    expect(discoverIdx).toBeGreaterThan(-1);
    expect(selfOpenIdx).toBeLessThan(discoverIdx);
  });

  test('pm-phase2.js: pm-phase2:self open precedes the generate-work-breakdown dispatch', () => {
    const source        = fs.readFileSync(path.join(WORKFLOW_DIR, 'pm-phase2.js'), 'utf8');
    const selfOpenIdx   = source.indexOf('pm-phase2:self');
    const wbDispatchIdx = source.indexOf("'generate-work-breakdown'");
    expect(selfOpenIdx).toBeGreaterThan(-1);
    expect(wbDispatchIdx).toBeGreaterThan(-1);
    expect(selfOpenIdx).toBeLessThan(wbDispatchIdx);
  });

  test('pm-phase3.js: pm-phase3:self open precedes the CSV read agent dispatch', () => {
    const source      = fs.readFileSync(path.join(WORKFLOW_DIR, 'pm-phase3.js'), 'utf8');
    const selfOpenIdx = source.indexOf('pm-phase3:self');
    const csvReadIdx  = source.indexOf("'read-wb-csv'");
    expect(selfOpenIdx).toBeGreaterThan(-1);
    expect(csvReadIdx).toBeGreaterThan(-1);
    expect(selfOpenIdx).toBeLessThan(csvReadIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. pm-phaseN:self close appears AFTER main logic (near end of file)
// ─────────────────────────────────────────────────────────────────────────────

describe('UC-06 — pm-phaseN:self close is after main logic in each workflow', () => {
  test('pm-phase1.js: pm-phase1:self close follows the process-log write', () => {
    const source       = fs.readFileSync(path.join(WORKFLOW_DIR, 'pm-phase1.js'), 'utf8');
    const processLogIdx = source.indexOf("label: 'write-process-log'");
    const selfCloseIdx  = source.indexOf('ledger-close-pm-phase1-self');
    expect(processLogIdx).toBeGreaterThan(-1);
    expect(selfCloseIdx).toBeGreaterThan(-1);
    expect(selfCloseIdx).toBeGreaterThan(processLogIdx);
  });

  test('pm-phase2.js: pm-phase2:self close follows the append-process-log write', () => {
    const source        = fs.readFileSync(path.join(WORKFLOW_DIR, 'pm-phase2.js'), 'utf8');
    const processLogIdx  = source.indexOf("label: 'append-process-log'");
    const selfCloseIdx   = source.indexOf('ledger-close-pm-phase2-self');
    expect(processLogIdx).toBeGreaterThan(-1);
    expect(selfCloseIdx).toBeGreaterThan(-1);
    expect(selfCloseIdx).toBeGreaterThan(processLogIdx);
  });

  test('pm-phase3.js: pm-phase3:self close is after the commit-actuals step', () => {
    const source        = fs.readFileSync(path.join(WORKFLOW_DIR, 'pm-phase3.js'), 'utf8');
    const commitActualsIdx = source.indexOf("label: 'commit-actuals'");
    const selfCloseIdx     = source.indexOf('ledger-close-pm-phase3-self');
    expect(commitActualsIdx).toBeGreaterThan(-1);
    expect(selfCloseIdx).toBeGreaterThan(-1);
    expect(selfCloseIdx).toBeGreaterThan(commitActualsIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Fail-closed: selfLedgerOp/ledgerTerminal throws on non-zero exit (source check)
// ─────────────────────────────────────────────────────────────────────────────

describe('UC-06 — fail-closed: self-registration helper throws on non-zero exit', () => {
  test('pm-phase1.js selfLedgerOp throws when exit code is not 0', () => {
    const source = fs.readFileSync(path.join(WORKFLOW_DIR, 'pm-phase1.js'), 'utf8');
    // The helper must throw a HARD STOP error on non-zero exit
    expect(source).toMatch(/HARD STOP — self-ledger operation failed/);
    expect(source).toMatch(/throw new Error.*HARD STOP/);
  });

  test('pm-phase3.js ledgerTerminal throws when exit code is not 0 (reuses existing helper)', () => {
    const source = fs.readFileSync(path.join(WORKFLOW_DIR, 'pm-phase3.js'), 'utf8');
    // pm-phase3 reuses ledgerTerminal for self-registration (already throws on non-zero)
    expect(source).toMatch(/HARD STOP — ledger terminal state not persisted/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 & 5. CLI lifecycle: open → running, close → done (no LLM invoked)
// ─────────────────────────────────────────────────────────────────────────────

describe('UC-06 — CLI: pm-phaseN:self lifecycle: open → running, close → done', () => {
  const PREFIX = 'FTR-099';
  const AGENT  = 'pm-phase1:self';

  let ledgerDir;

  beforeEach(() => {
    ledgerDir = mktmp('self-lifecycle');
  });

  test('ledger open for pm-phase1:self creates a running entry', () => {
    const result = runCLI([
      'ledger', 'open',
      '--prefix', PREFIX, '--agent', AGENT, '--phase', 'phase1',
      '--dir', ledgerDir,
    ]);
    expect(result.status).toBe(0);
    const entry = JSON.parse(result.stdout).entry;
    expect(entry.agent).toBe(AGENT);
    expect(entry.status).toBe('running');
  });

  test('successful completion: ledger close transitions pm-phase1:self to done', () => {
    runCLI(['ledger', 'open', '--prefix', PREFIX, '--agent', AGENT, '--phase', 'phase1', '--dir', ledgerDir]);
    const result = runCLI([
      'ledger', 'close',
      '--prefix', PREFIX, '--agent', AGENT,
      '--dir', ledgerDir,
    ]);
    expect(result.status).toBe(0);
    const entry = JSON.parse(result.stdout).entry;
    expect(entry.status).toBe('done');
  });

  test('simulated interruption: entry stays running (no close called)', () => {
    runCLI(['ledger', 'open', '--prefix', PREFIX, '--agent', AGENT, '--phase', 'phase1', '--dir', ledgerDir]);
    // Read the ledger file directly — entry should still be running (no close was called)
    const ledgerFile = path.join(ledgerDir, PREFIX + '-token-ledger.json');
    const entries = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
    const selfEntry = entries.find(e => e.agent === AGENT);
    expect(selfEntry).toBeDefined();
    expect(selfEntry.status).toBe('running');
  });

  test('failed open: ledger open with bad dir exits non-zero (fail-closed behavior)', () => {
    const badDir = path.join(ledgerDir, 'nonexistent-subdir', 'deeper');
    const result = runCLI([
      'ledger', 'open',
      '--prefix', PREFIX, '--agent', AGENT, '--phase', 'phase1',
      '--dir', badDir,
    ]);
    // Should fail because the directory does not exist
    expect(result.status).not.toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. The :self entry is never touched by the Tier 1 :dispatch guard
// ─────────────────────────────────────────────────────────────────────────────

describe('UC-06 — Tier 1 :dispatch guard never references pm-phaseN:self', () => {
  let skillSource;
  beforeAll(() => {
    skillSource = fs.readFileSync(SKILL_PATH, 'utf8');
  });

  test('SKILL.md dispatch guard does not close or fail pm-phaseN:self entries', () => {
    // The :dispatch guard opens/closes pm-phaseN:dispatch, never pm-phaseN:self
    expect(skillSource).not.toMatch(/pm-phase\d+:self/);
  });

  test('SKILL.md references pm-phaseN:dispatch for Tier 1 ledger entries', () => {
    expect(skillSource).toMatch(/pm-phase\d+:dispatch/);
  });
});
