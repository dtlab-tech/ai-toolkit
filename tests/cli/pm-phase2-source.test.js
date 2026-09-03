'use strict';

/**
 * US-02-TASK-BE-03 (Migration) — pm-phase2.js source-structure validation
 *
 * pm-phase2.js runs inside the Claude Code Workflow runtime, which is an external
 * process that does NOT expose Node.js globals such as `fs`, `require`, or `module`.
 * Because of this constraint the file cannot be `require()`-d or executed inside Jest.
 *
 * Source-level analysis is the correct testing strategy for workflow scripts: read the
 * file as text and assert structural properties that proxy-only tests (pm-phase2-ledger.test.js)
 * cannot catch, specifically:
 *
 *   1. No direct `fs` usage — the workflow runtime does not provide the `fs` module, so any
 *      call to fs.readFileSync / fs.writeFileSync / fs.existsSync would throw
 *      `ReferenceError: fs is not defined` at runtime.  pm-phase1.js (the sibling, reviewed
 *      PASS) deliberately avoids `fs` entirely and routes all ledger I/O through agent() calls.
 *      pm-phase2.js must follow the same pattern.
 *
 *   2. Ledger facade commands are used — after the US-02-TASK-BE-03 migration, pm-phase2.js
 *      no longer defines appendLedgerEntry / updateLedgerEntry inline.  Instead each tracked
 *      activity wraps its agent() dispatch with two shell-command agent() calls that invoke the
 *      facade: "ai-toolkit ledger open ..." before dispatch, "ai-toolkit ledger close ..." after.
 *
 *   3. Correct agent keys are embedded — keys like "generate-work-breakdown:phase2",
 *      "wb-validate:phase2", etc. are the keys that pm-phase2 passes to the facade; wrong keys
 *      silently produce incorrect ledger entries at runtime with no test failure.
 *
 *   4. Open-before / close-after pattern is present — the structural ordering of facade open/close
 *      calls relative to the agent() dispatch calls must be correct; inversion produces
 *      liveness-signal failures (AC-07, AC-13).
 */

const fs   = require('fs');
const path = require('path');

const PM_PHASE2_PATH = path.join(__dirname, '..', '..', 'src', 'claude', 'workflows', 'pm-phase2.js');

let source;

beforeAll(() => {
  source = fs.readFileSync(PM_PHASE2_PATH, 'utf8');
});

// ── Critical: no direct fs usage ──────────────────────────────────────────────
// The original US-03 submission used fs.readFileSync / fs.writeFileSync directly
// inside the helper functions.  The workflow runtime does not provide the `fs`
// module, so every call throws `ReferenceError: fs is not defined` at runtime.
// pm-phase1.js (reviewed PASS) deliberately avoids `fs` entirely and routes all
// ledger I/O through agent() calls.  pm-phase2.js must follow the same pattern.

describe('pm-phase2.js — no direct Node.js fs usage (workflow runtime constraint)', () => {
  test('does not call require("fs")', () => {
    expect(source).not.toMatch(/require\s*\(\s*['"]fs['"]\s*\)/);
  });

  test('does not use an ESM "import fs" statement', () => {
    expect(source).not.toMatch(/\bimport\s+\w*\s*\bfs\b/);
  });

  test('does not call fs.readFileSync directly', () => {
    expect(source).not.toMatch(/\bfs\s*\.\s*readFileSync\b/);
  });

  test('does not call fs.writeFileSync directly', () => {
    expect(source).not.toMatch(/\bfs\s*\.\s*writeFileSync\b/);
  });

  test('does not call fs.existsSync directly', () => {
    expect(source).not.toMatch(/\bfs\s*\.\s*existsSync\b/);
  });
});

// ── Ledger facade commands present (Tech-Spec §4.2) ───────────────────────────
// After the migration to the ai-toolkit ledger CLI facade, pm-phase2.js no longer
// defines appendLedgerEntry / updateLedgerEntry inline.  Instead each tracked activity
// wraps its agent() dispatch with two shell-command agent() calls that invoke the
// facade: "ai-toolkit ledger open ..." before dispatch, "ai-toolkit ledger close ..."
// after.  These tests verify the facade is wired up and the old helpers are gone.

describe('pm-phase2.js — ledger facade commands used (Tech-Spec §4.2)', () => {
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
    // Arrange/Act/Assert: the inline helper must no longer exist in the source
    expect(source).not.toMatch(/async\s+function\s+updateLedgerEntry/);
  });
});

// ── Correct agent keys (AC-05) ────────────────────────────────────────────────
// The agent key is passed to "ai-toolkit ledger open" and matched by "ai-toolkit
// ledger close" to find and mutate the correct entry.  A wrong key silently creates
// a dangling "running" entry on disk and an orphaned "done" update — both invisible
// to tests that only exercise bin/cli.js.

describe('pm-phase2.js — correct agent keys embedded in source (AC-05)', () => {
  test('uses agent key "generate-work-breakdown:phase2"', () => {
    // Arrange/Act/Assert
    expect(source).toContain('generate-work-breakdown:phase2');
  });

  test('uses agent key "wb-validate:phase2"', () => {
    // Arrange/Act/Assert
    expect(source).toContain('wb-validate:phase2');
  });

  test('uses agent key "validate-work-breakdown-semantic:phase2"', () => {
    // Arrange/Act/Assert
    expect(source).toContain('validate-work-breakdown-semantic:phase2');
  });

  test('uses agent key "wb-render:phase2"', () => {
    // Arrange/Act/Assert
    expect(source).toContain('wb-render:phase2');
  });
});

// ── Facade open-before / close-after pattern (AC-07, AC-13) ──────────────────
// The liveness guarantee (status: "running" visible on disk between dispatch calls)
// now depends on "ai-toolkit ledger open ..." executing BEFORE the agent() dispatch
// and "ai-toolkit ledger close ..." executing AFTER.  Symmetric wrapping (equal open
// and close counts) ensures no dangling "running" entries are left on disk.

describe('pm-phase2.js — facade open-before / close-after pattern in source (AC-07, AC-13)', () => {
  test('"ai-toolkit ledger open" appears at least once (one per tracked running activity)', () => {
    // Arrange/Act: count facade open call-sites
    const matches = source.match(/ai-toolkit ledger open/g);

    // Assert: generate-work-breakdown, wb-validate, and conditionally semantic/render
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  test('"ai-toolkit ledger close" appears at least once (one per tracked running activity)', () => {
    // Arrange/Act: count facade close call-sites
    const matches = source.match(/ai-toolkit ledger close/g);

    // Assert: generate-work-breakdown, wb-validate, and conditionally semantic/render
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  test('open call-count equals close call-count (symmetric wrapping)', () => {
    // Arrange/Act
    const openCount  = (source.match(/ai-toolkit ledger open/g)  || []).length;
    const closeCount = (source.match(/ai-toolkit ledger close/g) || []).length;

    // Assert: every open has a corresponding close — no dangling "running" entries
    expect(openCount).toBe(closeCount);
  });

  test('first "ai-toolkit ledger open" call site appears before generate-work-breakdown dispatch in source', () => {
    // Arrange: find the first facade open invocation
    const openIdx     = source.indexOf('ai-toolkit ledger open');
    // The generate-work-breakdown dispatch is identified by its agentType label
    const dispatchIdx = source.indexOf("agentType: 'generate-work-breakdown'");

    // Assert: open precedes dispatch (liveness: status "running" visible before agent fires)
    expect(openIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(openIdx).toBeLessThan(dispatchIdx);
  });

  test('first "ai-toolkit ledger close" call site appears after generate-work-breakdown dispatch in source', () => {
    // Arrange: find the dispatch marker and then the first facade close invocation
    const dispatchIdx = source.indexOf("agentType: 'generate-work-breakdown'");
    const closeIdx    = source.indexOf('ai-toolkit ledger close');

    // Assert: close follows dispatch (liveness: status updated only after agent completes)
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(dispatchIdx);
  });
});
