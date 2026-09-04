'use strict';

/**
 * US-02-T06 (Rework Cycle 1) — pm-phase1.js source-structure validation
 *
 * pm-phase1.js runs inside the Claude Code Workflow runtime, which is an external
 * process that does NOT expose Node.js globals such as `fs`, `require`, or `module`.
 * Because of this constraint the file cannot be `require()`-d or executed inside Jest.
 *
 * Source-level analysis is the correct testing strategy for workflow scripts: read the
 * file as text and assert structural properties that proxy-only tests (pm-phase1-ledger.test.js)
 * cannot catch, specifically:
 *
 *   1. No direct `fs` usage — the original critical bug (ReferenceError: fs is not defined
 *      at runtime) that was found in the code review of the initial US-02 submission.
 *      pm-phase2.js (the sibling, implemented identically) never references `fs`; both
 *      helpers route all file I/O through `agent()` calls.
 *
 *   2. Helper functions are defined and use agent() for I/O — confirms the correct
 *      implementation pattern, matching pm-phase2.js.
 *
 *   3. Correct agent keys are embedded — keys like "generate-requirements:phase1" and
 *      "validate-feature-docs:phase1:cycle" are the keys that pm-phase1 passes to
 *      appendLedgerEntry/updateLedgerEntry; wrong keys silently produce incorrect ledger
 *      entries at runtime with no test failure.
 *
 *   4. Append-before / update-after pattern is present — the structural ordering of
 *      appendLedgerEntry() and updateLedgerEntry() relative to agent() dispatch calls
 *      must be correct; inversion produces liveness-signal failures (AC-07, AC-13).
 *
 *   5. Ensure-ledger startup step is present (AC-08) — pm-phase1 must create the ledger
 *      file if define-feature was not used; missing this step causes a crash on the first
 *      append attempt when no ledger file exists.
 */

const fs   = require('fs');
const path = require('path');

const PM_PHASE1_PATH = path.join(__dirname, '..', '..', 'src', 'claude', 'workflows', 'pm-phase1.js');

let source;

beforeAll(() => {
  source = fs.readFileSync(PM_PHASE1_PATH, 'utf8');
});

// ── Critical: no direct fs usage ──────────────────────────────────────────────
// The original US-02 submission used fs.readFileSync / fs.writeFileSync directly
// inside the helper functions.  The workflow runtime does not provide the `fs`
// module, so every call would throw `ReferenceError: fs is not defined` at runtime.
// pm-phase2.js (implemented for the same feature) deliberately avoids `fs` entirely
// and routes all ledger I/O through agent() calls.  pm-phase1.js must follow the
// same pattern.

describe('pm-phase1.js — no direct Node.js fs usage (workflow runtime constraint)', () => {
  test('does not call require("fs")', () => {
    // Arrange: source is read in beforeAll
    // Act/Assert: no CommonJS import of the fs module
    expect(source).not.toMatch(/require\s*\(\s*['"]fs['"]\s*\)/);
  });

  test('does not use an ESM "import fs" statement', () => {
    // Arrange/Act/Assert: no ESM import of fs
    expect(source).not.toMatch(/\bimport\s+\w*\s*\bfs\b/);
  });

  test('does not call fs.readFileSync directly', () => {
    // Arrange/Act/Assert: no direct read call; I/O must go through agent()
    expect(source).not.toMatch(/\bfs\s*\.\s*readFileSync\b/);
  });

  test('does not call fs.writeFileSync directly', () => {
    // Arrange/Act/Assert: no direct write call; I/O must go through agent()
    expect(source).not.toMatch(/\bfs\s*\.\s*writeFileSync\b/);
  });

  test('does not call fs.existsSync directly', () => {
    // Arrange/Act/Assert: no direct existence check; all checks go through agent()
    expect(source).not.toMatch(/\bfs\s*\.\s*existsSync\b/);
  });
});

// ── Ledger facade commands present (Tech-Spec §4.2) ───────────────────────────
// After the migration to the ai-toolkit ledger CLI facade, pm-phase1.js no longer
// defines appendLedgerEntry / updateLedgerEntry inline.  Instead each tracked activity
// wraps its agent() dispatch with two shell-command agent() calls that invoke the
// facade: "ai-toolkit ledger open ..." before dispatch, "ai-toolkit ledger close ..."
// after.  These tests verify the facade is wired up and the old helpers are gone.

describe('pm-phase1.js — ledger facade commands used (Tech-Spec §4.2)', () => {
  test('uses "ai-toolkit ledger open" command (not an inline appendLedgerEntry helper)', () => {
    // Arrange/Act/Assert: facade open command must be present in the workflow source
    expect(source).toContain('ai-toolkit ledger open');
  });

  test('uses "ai-toolkit ledger close" command (not an inline updateLedgerEntry helper)', () => {
    // Arrange/Act/Assert: facade close command must be present in the workflow source
    expect(source).toContain('ai-toolkit ledger close');
  });

  test('does not define appendLedgerEntry as an async function (removed in facade migration)', () => {
    // Arrange/Act/Assert: the inline helper must no longer exist in the source
    expect(source).not.toMatch(/async\s+function\s+appendLedgerEntry/);
  });

  test('does not define updateLedgerEntry as an async function (removed in facade migration)', () => {
    // Arrange/Act/Assert
    expect(source).not.toMatch(/async\s+function\s+updateLedgerEntry/);
  });
});

// ── Correct agent keys (AC-03, AC-04) ─────────────────────────────────────────
// The agent key is passed to appendLedgerEntry and then matched by updateLedgerEntry
// to find and mutate the correct entry.  A wrong key silently creates a dangling
// "running" entry on disk and an orphaned "done" update — both invisible to tests
// that only exercise bin/cli.js.

describe('pm-phase1.js — correct agent keys embedded in source (AC-03, AC-04)', () => {
  test('uses agent key "generate-requirements:phase1" (AC-03)', () => {
    // Arrange/Act/Assert
    expect(source).toContain('generate-requirements:phase1');
  });

  test('uses agent key "generate-tech-spec:phase1"', () => {
    // Arrange/Act/Assert
    expect(source).toContain('generate-tech-spec:phase1');
  });

  test('uses validation cycle key pattern "validate-feature-docs:phase1:cycle" (AC-04)', () => {
    // Arrange/Act/Assert: the key includes cycle number — only the prefix is checked here
    // because the cycle suffix is dynamic (`cycle${cycle}`)
    expect(source).toMatch(/validate-feature-docs:phase1:cycle/);
  });
});

// ── Facade open-before / close-after pattern (AC-07, AC-13) ──────────────────
// The liveness guarantee (status: "running" visible on disk between dispatch calls)
// now depends on "ai-toolkit ledger open ..." executing BEFORE the agent() dispatch
// and "ai-toolkit ledger close ..." executing AFTER.  Symmetric wrapping (equal open
// and close counts) ensures no dangling "running" entries are left on disk.

describe('pm-phase1.js — facade open-before / close-after pattern in source (AC-07, AC-13)', () => {
  test('"ai-toolkit ledger open" appears at least three times (one per tracked activity)', () => {
    // Arrange/Act: count facade open call-sites
    const matches = source.match(/ai-toolkit ledger open/g);

    // Assert: generate-requirements, generate-tech-spec, validate-feature-docs (loop) = min 3
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  test('"ai-toolkit ledger close" appears at least three times (one per tracked activity)', () => {
    // Arrange/Act: count facade close call-sites
    const matches = source.match(/ai-toolkit ledger close/g);

    // Assert: generate-requirements, generate-tech-spec, validate-feature-docs (loop) = min 3
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  test('open call-count equals close call-count (symmetric wrapping)', () => {
    // Arrange/Act
    const openCount  = (source.match(/ai-toolkit ledger open/g)  || []).length;
    const closeCount = (source.match(/ai-toolkit ledger close/g) || []).length;

    // Assert: every open has a corresponding close — no dangling "running" entries
    expect(openCount).toBe(closeCount);
  });

  test('first "ai-toolkit ledger open" call site appears before generate-requirements dispatch in source', () => {
    // Arrange: find the first facade open invocation
    const openIdx     = source.indexOf('ai-toolkit ledger open');
    // The generate-requirements dispatch is identified by its agentType label
    const dispatchIdx = source.indexOf("agentType: 'generate-requirements'");

    // Assert: open precedes dispatch (liveness: status "running" visible before agent fires)
    expect(openIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(openIdx).toBeLessThan(dispatchIdx);
  });

  test('first "ai-toolkit ledger close" call site appears after generate-requirements dispatch in source', () => {
    // Arrange: find the dispatch marker and then the first facade close invocation
    const dispatchIdx = source.indexOf("agentType: 'generate-requirements'");
    const closeIdx    = source.indexOf('ai-toolkit ledger close');

    // Assert: close follows dispatch (liveness: status updated only after agent completes)
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(dispatchIdx);
  });
});

// ── Ensure-ledger startup (AC-08) ─────────────────────────────────────────────
// When define-feature was not used, no ledger file exists when pm-phase1 starts.
// The ensure-ledger step must create the file (or verify its existence) before the
// first appendLedgerEntry call.  A missing startup step causes the first append to
// fail silently or produce a single-element array instead of building on existing
// entries.

describe('pm-phase1.js — ensure-ledger startup step present (AC-08)', () => {
  test('source contains an "ensure-ledger" agent label', () => {
    // Arrange/Act/Assert: the ensure step is identified by its agent label
    expect(source).toContain('ensure-ledger');
  });

  test('ensure-ledger step appears in source before the Requirements phase block', () => {
    // Arrange: ensure-ledger must be set up during Discovery, before Requirements
    const ensureIdx   = source.indexOf('ensure-ledger');
    // The Requirements phase is opened by the phase() call
    const reqPhaseIdx = source.indexOf("phase('Requirements')");

    // Assert: startup precedes phase transition
    expect(ensureIdx).toBeGreaterThan(-1);
    expect(reqPhaseIdx).toBeGreaterThan(-1);
    expect(ensureIdx).toBeLessThan(reqPhaseIdx);
  });

  test('ensure-ledger step appears before the first "ai-toolkit ledger open" call site', () => {
    // Arrange: the ensure step must run before any ledger entry is opened
    const ensureIdx = source.indexOf('ensure-ledger');
    const openIdx   = source.indexOf('ai-toolkit ledger open');

    // Assert: ledger file is guaranteed to exist before pm-phase1 opens its first entry
    expect(ensureIdx).toBeGreaterThan(-1);
    expect(openIdx).toBeGreaterThan(-1);
    expect(ensureIdx).toBeLessThan(openIdx);
  });
});
