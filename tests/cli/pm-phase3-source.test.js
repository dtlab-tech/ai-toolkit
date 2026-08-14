'use strict';

/**
 * US-04-T15 (Rework Cycle 1) — pm-phase3.js source-structure validation
 *
 * PROBLEM IDENTIFIED IN REWORK CYCLE 1:
 * The existing pm-phase3-ledger.test.js tests appendLedgerEntry and updateLedgerEntry
 * from bin/cli.js only — not whether pm-phase3.js actually uses those helpers. The
 * production code does NOT define the helper functions or call them; it still uses the
 * old tokenLedger.push() + persist-ledger agent pattern. The test suite was therefore
 * green for code that does not implement the feature.
 *
 * This file provides source-level structural tests that read pm-phase3.js as text and
 * assert the structural properties that the proxy-only tests in pm-phase3-ledger.test.js
 * cannot catch.
 *
 * Testing strategy:
 * pm-phase3.js runs inside the Claude Code Workflow runtime, which does NOT expose
 * Node.js globals such as `require`, `module`, or `fs`. All file I/O must be routed
 * through await agent() calls — the same pattern used by pm-phase2.js. The helpers
 * are therefore async functions that delegate persistence to agent(), not fs.*Sync.
 *
 * Assertions:
 *   1. appendLedgerEntry is defined as an async function using await agent()
 *   2. updateLedgerEntry is defined as an async function using await agent()
 *   3. Helpers are defined before the first call site; use agent(), not fs.*Sync/require
 *   4. Correct agent keys are present for all critical call sites
 *   5. appendLedgerEntry/updateLedgerEntry are called symmetrically (one wrap per agent)
 *   6. The old persist-ledger agent call pattern is removed or not present
 *   7. All agent call sites in executePhase and top-level are wrapped
 *
 * Acceptance Criteria covered:
 *   AC-06: pm-phase3 entries all have status="done", timestamps, positive tokens
 *   AC-07: liveness — running entry is visible on disk between append and update
 *   AC-09: in-memory tokenLedger accumulation preserved
 *   AC-12: appendLedgerEntry and updateLedgerEntry helpers exist at top of file
 *   AC-13: mid-phase JSON is valid (guaranteed by agent()-based atomic writes)
 */

const fs   = require('fs');
const path = require('path');

const PM_PHASE3_PATH = path.join(__dirname, '..', '..', 'src', 'claude', 'workflows', 'pm-phase3.js');

let source;

beforeAll(() => {
  source = fs.readFileSync(PM_PHASE3_PATH, 'utf8');
});

// ── Helper function definitions (AC-12) ───────────────────────────────────────
// AC-12 states: "Two helper functions appendLedgerEntry(featureDir, prefix, entry)
// and updateLedgerEntry(featureDir, prefix, agentKey, updates) exist at the top of
// the file; every agent() call site uses them."

describe('pm-phase3.js — appendLedgerEntry and updateLedgerEntry defined (AC-12)', () => {
  test('defines appendLedgerEntry function', () => {
    // Arrange: source is read in beforeAll
    // Act/Assert: the helper must be explicitly defined in pm-phase3.js
    expect(source).toMatch(/function\s+appendLedgerEntry\s*\(/);
  });

  test('defines updateLedgerEntry function', () => {
    // Arrange/Act/Assert: the update helper must also be explicitly defined
    expect(source).toMatch(/function\s+updateLedgerEntry\s*\(/);
  });

  test('appendLedgerEntry is defined before updateLedgerEntry in source order', () => {
    // Arrange: locate both function definition sites
    const appendIdx = source.indexOf('function appendLedgerEntry');
    const updateIdx = source.indexOf('function updateLedgerEntry');

    // Assert: append precedes update (canonical ordering from bin/cli.js and pm-phase2.js)
    expect(appendIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(appendIdx).toBeLessThan(updateIdx);
  });

  test('helper functions are defined before the meta export (before the main script body)', () => {
    // Arrange: helpers must appear near the top — before parse/implementation logic
    const appendDefIdx = source.indexOf('function appendLedgerEntry');
    // The meta declaration marks the true script start; helpers must come before featureDir parsing
    const featureDirIdx = source.indexOf("const featureDir");

    // Assert: helpers defined before featureDir extraction
    expect(appendDefIdx).toBeGreaterThan(-1);
    expect(featureDirIdx).toBeGreaterThan(-1);
    expect(appendDefIdx).toBeLessThan(featureDirIdx);
  });
});

// ── Helpers use agent() for file I/O (not fs.*Sync) ──────────────────────────
// The Workflow runtime does not expose fs or require. All ledger persistence is
// routed through await agent() — the same pattern used by pm-phase2.js.

describe('pm-phase3.js — helper functions use agent() for file I/O (not fs.*Sync)', () => {
  test('appendLedgerEntry body uses await agent()', () => {
    const appendStart = source.indexOf('async function appendLedgerEntry');
    const updateStart = source.indexOf('async function updateLedgerEntry');
    expect(appendStart).toBeGreaterThan(-1);
    expect(updateStart).toBeGreaterThan(appendStart);
    const funcBody = source.slice(appendStart, updateStart);

    expect(funcBody).toMatch(/\bawait\s+agent\s*\(/);
  });

  test('updateLedgerEntry body uses await agent()', () => {
    const updateStart     = source.indexOf('async function updateLedgerEntry');
    const parseArgsMarker = source.indexOf('const featureDir');
    expect(updateStart).toBeGreaterThan(-1);
    expect(parseArgsMarker).toBeGreaterThan(updateStart);
    const funcBody = source.slice(updateStart, parseArgsMarker);

    expect(funcBody).toMatch(/\bawait\s+agent\s*\(/);
  });

  test('appendLedgerEntry body uses label "append-ledger"', () => {
    const appendStart = source.indexOf('async function appendLedgerEntry');
    const updateStart = source.indexOf('async function updateLedgerEntry');
    const funcBody = source.slice(appendStart, updateStart);

    expect(funcBody).toMatch(/label:\s*['"]append-ledger['"]/);
  });

  test('updateLedgerEntry body uses label "update-ledger"', () => {
    const updateStart     = source.indexOf('async function updateLedgerEntry');
    const parseArgsMarker = source.indexOf('const featureDir');
    const funcBody = source.slice(updateStart, parseArgsMarker);

    expect(funcBody).toMatch(/label:\s*['"]update-ledger['"]/);
  });

  test('appendLedgerEntry body does not use fs.*Sync', () => {
    const appendStart = source.indexOf('async function appendLedgerEntry');
    const updateStart = source.indexOf('async function updateLedgerEntry');
    const funcBody = source.slice(appendStart, updateStart);

    expect(funcBody).not.toMatch(/\bfs\s*\.\s*\w+Sync\b/);
  });

  test('updateLedgerEntry body does not use fs.*Sync', () => {
    const updateStart     = source.indexOf('async function updateLedgerEntry');
    const parseArgsMarker = source.indexOf('const featureDir');
    const funcBody = source.slice(updateStart, parseArgsMarker);

    expect(funcBody).not.toMatch(/\bfs\s*\.\s*\w+Sync\b/);
  });

  test('appendLedgerEntry body does not use require()', () => {
    const appendStart = source.indexOf('async function appendLedgerEntry');
    const updateStart = source.indexOf('async function updateLedgerEntry');
    const funcBody = source.slice(appendStart, updateStart);

    expect(funcBody).not.toMatch(/\brequire\s*\(/);
  });

  test('updateLedgerEntry body does not use require()', () => {
    const updateStart     = source.indexOf('async function updateLedgerEntry');
    const parseArgsMarker = source.indexOf('const featureDir');
    const funcBody = source.slice(updateStart, parseArgsMarker);

    expect(funcBody).not.toMatch(/\brequire\s*\(/);
  });
});

// ── Helpers are async ────────────────────────────────────────────────────────
// The Workflow runtime requires await agent() for file I/O. Helpers must be
// declared async to support await inside them.

describe('pm-phase3.js — helper functions are async', () => {
  test('appendLedgerEntry is defined as an async function', () => {
    expect(source).toMatch(/async\s+function\s+appendLedgerEntry\s*\(/);
  });

  test('updateLedgerEntry is defined as an async function', () => {
    expect(source).toMatch(/async\s+function\s+updateLedgerEntry\s*\(/);
  });
});

// ── Correct agent keys embedded in source ────────────────────────────────────
// Agent keys are passed to appendLedgerEntry/updateLedgerEntry as the third argument.
// A wrong key silently creates a dangling "running" entry and an orphaned "done" update.

describe('pm-phase3.js — correct agent keys present in source (AC-06, AC-12)', () => {
  test('uses agent key "read-wb-csv:phase3"', () => {
    // The read-wb-csv call must be tracked with this exact key
    expect(source).toContain('read-wb-csv:phase3');
  });

  test('uses "final-test-run" as an agent key for the final test phase', () => {
    // AC-06: final-test-run must produce a ledger entry
    expect(source).toContain('final-test-run');
  });

  test('uses "remediation" as an agent key', () => {
    expect(source).toContain('remediation');
  });

  test('uses "pr-and-registry" as an agent key', () => {
    expect(source).toContain('pr-and-registry');
  });

  test('uses "write-actuals" as an agent key', () => {
    expect(source).toContain('write-actuals');
  });

  test('uses "process-log" or "finalize-process-log" as an agent key', () => {
    // The process-log step may be keyed as "process-log" or "finalize-process-log"
    expect(source).toMatch(/['"](?:process-log|finalize-process-log)['"]/);
  });
});

// ── Append-before / update-after call sites ──────────────────────────────────
// appendLedgerEntry must be called BEFORE each agent() dispatch.
// updateLedgerEntry must be called AFTER each agent() dispatch.
// The count of append calls should equal or be close to the count of update calls.

describe('pm-phase3.js — append-before / update-after call sites present (AC-07, AC-13)', () => {
  test('appendLedgerEntry is called at least 5 times (covering the main top-level agents)', () => {
    // Arrange/Act: count call-sites of appendLedgerEntry (not the definition)
    const matches = source.match(/\bappendLedgerEntry\s*\(/g);

    // Assert: read-wb-csv, final-test-run, remediation, pr-and-registry, write-actuals
    // = at minimum 5 top-level wraps; executePhase adds more
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });

  test('updateLedgerEntry is called at least 5 times (matching append call sites)', () => {
    // Arrange/Act: count call-sites of updateLedgerEntry (not the definition)
    const matches = source.match(/\bupdateLedgerEntry\s*\(/g);

    // Assert: symmetric with append
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });

  test('appendLedgerEntry call-count equals updateLedgerEntry call-count and both are nonzero (symmetric wrapping)', () => {
    // Arrange/Act
    const appendCount = (source.match(/\bappendLedgerEntry\s*\(/g) || []).length;
    const updateCount = (source.match(/\bupdateLedgerEntry\s*\(/g) || []).length;

    // Assert: every append must have a corresponding update; and both must be > 0
    // (if both are 0 the helpers are not implemented at all — that must also fail)
    expect(appendCount).toBeGreaterThanOrEqual(1);
    expect(appendCount).toBe(updateCount);
  });

  test('first appendLedgerEntry call site appears before read-wb-csv agent dispatch', () => {
    // Arrange: "append before" means the append call appears before the agent dispatch
    // The read-wb-csv dispatch is identified by its label in the agent options
    const appendIdx  = source.indexOf("appendLedgerEntry(");
    // Locate the first agent label that dispatches read-wb-csv
    const dispatchIdx = source.indexOf("label: 'read-wb-csv'");

    // Assert: first append precedes the read-wb-csv dispatch
    expect(appendIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(appendIdx).toBeLessThan(dispatchIdx);
  });

  test('updateLedgerEntry call site for read-wb-csv appears after the agent dispatch', () => {
    // Arrange
    const dispatchIdx = source.indexOf("label: 'read-wb-csv'");
    // Use "await updateLedgerEntry(" to find call sites only, not the function definition
    const updateIdx   = source.indexOf("await updateLedgerEntry(");

    // Assert: update follows dispatch
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(dispatchIdx);
  });
});

// ── old persist-ledger pattern removed (US-04-T11) ────────────────────────────
// The old pattern writes the full in-memory tokenLedger array via a haiku agent call
// at the end of each executePhase cycle.  This is replaced by the new append/update
// pattern.  The old label 'persist-ledger' must no longer appear as an agent call.

describe('pm-phase3.js — old persist-ledger agent call is removed (US-04-T11)', () => {
  test('no persist-ledger agent call label present (static or template literal)', () => {
    // Arrange/Act: the old per-phase persist-ledger agent call used this label in two forms:
    //   label: 'persist-ledger:...'  (static string)
    //   label: `persist-ledger:...`  (template literal)
    // Both must be absent after the persist-ledger pattern is replaced with append/update.
    expect(source).not.toMatch(/label:\s*['"`]persist-ledger/);
  });
});

// ── in-memory tokenLedger preserved for Actuals (AC-09) ──────────────────────
// The in-memory tokenLedger array must still be populated alongside disk writes.
// This array feeds the Actuals phase aggregation (roleTotals, roleRows).
// Removing it would break backward compatibility.

describe('pm-phase3.js — in-memory tokenLedger array preserved (AC-09)', () => {
  test('tokenLedger array is still declared', () => {
    // Arrange/Act/Assert: the array declaration must remain for Actuals aggregation
    expect(source).toMatch(/const\s+tokenLedger\s*=\s*\[\]/);
  });

  test('tokenLedger.push() is still called (Actuals aggregation preserved)', () => {
    // Arrange/Act: the Actuals phase reads from the in-memory ledger to compute roleTotals
    // Assert: the push call must still be present alongside the disk writes
    expect(source).toMatch(/tokenLedger\s*\.\s*push\s*\(/);
  });
});

// ── executePhase wrapping — impl groups, test groups, review-solution ─────────
// The critical inner loop wraps must be present in executePhase.
// These wrap the developer-backend/frontend/testing and review-solution calls.

describe('pm-phase3.js — executePhase agent calls are wrapped (AC-06, AC-12)', () => {
  test('executePhase function is defined in source', () => {
    // Arrange/Act/Assert: executePhase must still exist (it orchestrates per-phase work)
    expect(source).toMatch(/const\s+executePhase\s*=\s*async/);
  });

  test('appendLedgerEntry is called inside the executePhase function body', () => {
    // Arrange: locate executePhase and find its extent
    const executePhaseStart = source.indexOf('const executePhase = async');
    expect(executePhaseStart).toBeGreaterThan(-1);

    // executePhase ends at the wave execution loop
    const wavesLoopIdx = source.indexOf('for (const wave of waves)');
    expect(wavesLoopIdx).toBeGreaterThan(executePhaseStart);

    const executePhaseBody = source.slice(executePhaseStart, wavesLoopIdx);

    // Assert: at least one appendLedgerEntry call inside executePhase
    expect(executePhaseBody).toMatch(/\bappendLedgerEntry\s*\(/);
  });

  test('updateLedgerEntry is called inside the executePhase function body', () => {
    // Arrange
    const executePhaseStart = source.indexOf('const executePhase = async');
    const wavesLoopIdx      = source.indexOf('for (const wave of waves)');
    const executePhaseBody  = source.slice(executePhaseStart, wavesLoopIdx);

    // Assert: at least one updateLedgerEntry call inside executePhase
    expect(executePhaseBody).toMatch(/\bupdateLedgerEntry\s*\(/);
  });

  test('review-solution agent call is inside executePhase and has ledger wrapping', () => {
    // Arrange
    const executePhaseStart = source.indexOf('const executePhase = async');
    const wavesLoopIdx      = source.indexOf('for (const wave of waves)');
    const executePhaseBody  = source.slice(executePhaseStart, wavesLoopIdx);

    // Assert: review-solution agent is dispatched inside executePhase
    expect(executePhaseBody).toMatch(/agentType:\s*'review-solution'/);

    // Assert: appendLedgerEntry is called before the review-solution dispatch in the body
    const appendInBody  = executePhaseBody.indexOf('appendLedgerEntry(');
    const reviewInBody  = executePhaseBody.indexOf("agentType: 'review-solution'");
    expect(appendInBody).toBeGreaterThan(-1);
    expect(reviewInBody).toBeGreaterThan(-1);
    expect(appendInBody).toBeLessThan(reviewInBody);
  });
});
