'use strict';

/**
 * US-03-TASK-BE-03 — pm-phase3.js source-structure validation (facade migration)
 *
 * pm-phase3.js runs inside the Claude Code Workflow runtime, which is an external
 * process that does NOT expose Node.js globals such as `fs`, `require`, or `module`.
 * Because of this constraint the file cannot be `require()`-d or executed inside Jest.
 *
 * Source-level analysis is the correct testing strategy for workflow scripts: read the
 * file as text and assert structural properties that proxy-only tests
 * (pm-phase3-ledger.test.js) cannot catch, specifically:
 *
 *   1. No direct `fs` usage — the workflow runtime does not provide the `fs` module.
 *      pm-phase1.js and pm-phase2.js (reviewed PASS) deliberately avoid `fs` entirely
 *      and route all ledger I/O through agent() calls.  pm-phase3.js must follow the
 *      same pattern.
 *
 *   2. Ledger facade commands are used — after the US-03-TASK-BE-03 migration,
 *      pm-phase3.js no longer defines appendLedgerEntry / updateLedgerEntry inline.
 *      Instead each tracked activity wraps its agent() dispatch with two shell-command
 *      agent() calls that invoke the facade: "ai-toolkit ledger open ..." before
 *      dispatch, "ai-toolkit ledger close ..." after.  Activities that fail use
 *      "ai-toolkit ledger fail ..."; skipped activities use "ai-toolkit ledger skip ...".
 *
 *   3. Fail-closed terminal contract (AC-20) — when a close, fail, or skip facade call
 *      returns a non-zero exit status the workflow must hard-stop and report that the
 *      terminal state was not persisted.  The ledgerTerminal() helper checks the exit
 *      code captured by the agent and throws on non-zero.
 *
 *   4. Correct agent keys are embedded — keys like "read-wb-csv:phase3",
 *      "final-test-run", etc. are the keys pm-phase3 passes to the facade.
 *
 *   5. Open-before / close-after pattern is present — the structural ordering of facade
 *      open/close calls relative to the agent() dispatch calls must be correct; inversion
 *      produces liveness-signal failures (AC-07, AC-13).
 *
 * Acceptance Criteria covered:
 *   AC-04: every tracked activity goes through the facade (open + close/fail/skip)
 *   AC-20: terminal facade calls are fail-closed — non-zero exit hard-stops the workflow
 */

const fs   = require('fs');
const path = require('path');

const PM_PHASE3_PATH = path.join(__dirname, '..', '..', 'src', 'claude', 'workflows', 'pm-phase3.js');

let source;

beforeAll(() => {
  source = fs.readFileSync(PM_PHASE3_PATH, 'utf8');
});

// ── Critical: no direct fs usage ──────────────────────────────────────────────
// The workflow runtime does not provide the `fs` module, so any call to
// fs.readFileSync / fs.writeFileSync / fs.existsSync would throw
// `ReferenceError: fs is not defined` at runtime.

describe('pm-phase3.js — no direct Node.js fs usage (workflow runtime constraint)', () => {
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

// ── Ledger facade commands present (AC-04) ────────────────────────────────────
// After the migration to the ai-toolkit ledger CLI facade, pm-phase3.js no longer
// defines appendLedgerEntry / updateLedgerEntry inline.  Instead each tracked activity
// wraps its agent() dispatch with shell-command agent() calls that invoke the facade.

describe('pm-phase3.js — ledger facade commands used (AC-04)', () => {
  test('uses "ai-toolkit ledger open" command', () => {
    // Arrange/Act/Assert: facade open command must be present in the workflow source
    expect(source).toContain('ai-toolkit ledger open');
  });

  test('uses "ai-toolkit ledger close" command', () => {
    // Arrange/Act/Assert: facade close command must be present in the workflow source
    expect(source).toContain('ai-toolkit ledger close');
  });

  test('uses "ai-toolkit ledger fail" command (AC-04, AC-20)', () => {
    // Arrange/Act/Assert: facade fail command must be present for error paths
    expect(source).toContain('ai-toolkit ledger fail');
  });

  test('does not define appendLedgerEntry as an async function (removed in facade migration)', () => {
    // Arrange/Act/Assert: the inline helper must no longer exist in the source
    expect(source).not.toMatch(/async\s+function\s+appendLedgerEntry/);
  });

  test('does not define updateLedgerEntry as an async function (removed in facade migration)', () => {
    // Arrange/Act/Assert: the inline helper must no longer exist in the source
    expect(source).not.toMatch(/async\s+function\s+updateLedgerEntry/);
  });

  test('does not call appendLedgerEntry anywhere in the source', () => {
    // Arrange/Act/Assert: no residual call sites
    expect(source).not.toMatch(/\bappendLedgerEntry\s*\(/);
  });

  test('does not call updateLedgerEntry anywhere in the source', () => {
    // Arrange/Act/Assert: no residual call sites
    expect(source).not.toMatch(/\bupdateLedgerEntry\s*\(/);
  });
});

// ── Fail-closed terminal contract (AC-20) — unique to pm-phase3 ──────────────
// pm-phase3 adds a fail-closed contract: when a close, fail, or skip facade call
// returns a non-zero exit status the workflow hard-stops because the terminal state
// was not persisted.  The ledgerTerminal() helper implements this contract.

describe('pm-phase3.js — fail-closed terminal contract present (AC-20)', () => {
  test('defines a ledgerTerminal helper function', () => {
    // Arrange/Act/Assert: the helper that enforces the contract must be defined
    expect(source).toMatch(/function\s+ledgerTerminal\s*\(/);
  });

  test('ledgerTerminal captures the exit code (exitCode) from the shell command', () => {
    // Arrange: locate the ledgerTerminal function body
    const fnStart = source.indexOf('function ledgerTerminal');
    expect(fnStart).toBeGreaterThan(-1);
    // The next function / block after ledgerTerminal is the parse-args section
    const afterFn = source.indexOf('const argStr', fnStart);
    expect(afterFn).toBeGreaterThan(fnStart);
    const fnBody = source.slice(fnStart, afterFn);

    // Assert: the body captures exitCode
    expect(fnBody).toMatch(/exitCode/);
  });

  test('ledgerTerminal stores exit code in a "status" variable', () => {
    // Arrange
    const fnStart = source.indexOf('function ledgerTerminal');
    const afterFn = source.indexOf('const argStr', fnStart);
    const fnBody  = source.slice(fnStart, afterFn);

    // Assert: a local `status` variable holds the exit code
    expect(fnBody).toMatch(/\bstatus\b/);
  });

  test('ledgerTerminal throws a HARD STOP error on non-zero status', () => {
    // Arrange
    const fnStart = source.indexOf('function ledgerTerminal');
    const afterFn = source.indexOf('const argStr', fnStart);
    const fnBody  = source.slice(fnStart, afterFn);

    // Assert: the function throws with a HARD STOP message when status !== 0
    expect(fnBody).toMatch(/HARD STOP/);
    expect(fnBody).toMatch(/throw\s+new\s+Error/);
  });

  test('ledgerTerminal is async (uses await agent())', () => {
    // Arrange/Act/Assert: the helper must be async to use await
    expect(source).toMatch(/async\s+function\s+ledgerTerminal\s*\(/);
  });
});

// ── Correct agent keys embedded in source (AC-04) ─────────────────────────────
// Agent keys are passed to "ai-toolkit ledger open" and matched by "ai-toolkit
// ledger close/fail" to find and mutate the correct entry.  A wrong key silently
// creates a dangling entry.

describe('pm-phase3.js — correct agent keys present in source (AC-04)', () => {
  test('uses agent key "read-wb-csv:phase3"', () => {
    // Arrange/Act/Assert
    expect(source).toContain('read-wb-csv:phase3');
  });

  test('uses "final-test-run" as an agent key for the final test phase', () => {
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

  test('uses "finalize-process-log" as an agent label', () => {
    expect(source).toMatch(/['"](?:process-log|finalize-process-log)['"]/);
  });
});

// ── Facade open-before / close-after pattern (AC-07, AC-13) ──────────────────
// The liveness guarantee (status: "running" visible on disk between dispatch calls)
// now depends on "ai-toolkit ledger open ..." executing BEFORE the agent() dispatch
// and "ai-toolkit ledger close ..." executing AFTER.

describe('pm-phase3.js — facade open-before / close-after pattern in source (AC-07, AC-13)', () => {
  test('"ai-toolkit ledger open" appears at least once', () => {
    // Arrange/Act: count facade open call-sites
    const matches = source.match(/ai-toolkit ledger open/g);

    // Assert: at least one per tracked activity
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  test('"ai-toolkit ledger close" appears at least once', () => {
    // Arrange/Act: count facade close call-sites
    const matches = source.match(/ai-toolkit ledger close/g);

    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  test('"ai-toolkit ledger fail" appears at least once (error path coverage)', () => {
    // Arrange/Act
    const matches = source.match(/ai-toolkit ledger fail/g);

    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  test('first "ai-toolkit ledger open" call site appears before read-wb-csv dispatch in source', () => {
    // Arrange: find the first facade open invocation
    const openIdx     = source.indexOf('ai-toolkit ledger open');
    // The read-wb-csv dispatch is identified by its label
    const dispatchIdx = source.indexOf("label: 'read-wb-csv'");

    // Assert: open precedes dispatch (liveness: status "running" visible before agent fires)
    expect(openIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(openIdx).toBeLessThan(dispatchIdx);
  });

  test('first "ai-toolkit ledger close" call site appears after read-wb-csv dispatch in source', () => {
    // Arrange: find the dispatch marker and then the first facade close invocation
    const dispatchIdx = source.indexOf("label: 'read-wb-csv'");
    const closeIdx    = source.indexOf('ai-toolkit ledger close');

    // Assert: close follows dispatch (liveness: status updated only after agent completes)
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(dispatchIdx);
  });
});

// ── ledger skip present for skipped activities ────────────────────────────────
// The remediation skip branch uses "ai-toolkit ledger skip" so the ledger reflects
// the terminal state correctly even when the activity is not executed.

describe('pm-phase3.js — ai-toolkit ledger skip used for skipped activities', () => {
  test('"ai-toolkit ledger skip" is present in source', () => {
    // Arrange/Act/Assert: skip command must be present for the remediation else branch
    expect(source).toContain('ai-toolkit ledger skip');
  });
});

// ── in-memory tokenLedger preserved (AC-09) ───────────────────────────────────
// The in-memory tokenLedger array must still be populated alongside disk writes.
// This array feeds the Actuals phase aggregation (roleTotals, roleRows).

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

// ── executePhase uses facade calls (AC-04, AC-07) ────────────────────────────
// The critical inner loop wraps must be present in executePhase.
// These wrap the developer-backend/frontend/testing and review-solution calls.

describe('pm-phase3.js — executePhase agent calls use facade (AC-04, AC-07)', () => {
  test('executePhase function is defined in source', () => {
    // Arrange/Act/Assert: executePhase must still exist
    expect(source).toMatch(/const\s+executePhase\s*=\s*async/);
  });

  test('"ai-toolkit ledger open" is called inside the executePhase function body', () => {
    // Arrange: locate executePhase and find its extent
    const executePhaseStart = source.indexOf('const executePhase = async');
    expect(executePhaseStart).toBeGreaterThan(-1);

    // executePhase ends at the wave execution loop
    const wavesLoopIdx = source.indexOf('for (const wave of waves)');
    expect(wavesLoopIdx).toBeGreaterThan(executePhaseStart);

    const executePhaseBody = source.slice(executePhaseStart, wavesLoopIdx);

    // Assert: at least one facade open call inside executePhase
    expect(executePhaseBody).toContain('ai-toolkit ledger open');
  });

  test('"ai-toolkit ledger close" is called inside the executePhase function body', () => {
    // Arrange
    const executePhaseStart = source.indexOf('const executePhase = async');
    const wavesLoopIdx      = source.indexOf('for (const wave of waves)');
    const executePhaseBody  = source.slice(executePhaseStart, wavesLoopIdx);

    // Assert: at least one facade close call inside executePhase
    expect(executePhaseBody).toContain('ai-toolkit ledger close');
  });

  test('"ai-toolkit ledger fail" is called inside the executePhase function body (error path)', () => {
    // Arrange
    const executePhaseStart = source.indexOf('const executePhase = async');
    const wavesLoopIdx      = source.indexOf('for (const wave of waves)');
    const executePhaseBody  = source.slice(executePhaseStart, wavesLoopIdx);

    // Assert: at least one facade fail call inside executePhase for dispatch error paths
    expect(executePhaseBody).toContain('ai-toolkit ledger fail');
  });

  test('review-solution agent call is inside executePhase and has ledger open before it', () => {
    // Arrange
    const executePhaseStart = source.indexOf('const executePhase = async');
    const wavesLoopIdx      = source.indexOf('for (const wave of waves)');
    const executePhaseBody  = source.slice(executePhaseStart, wavesLoopIdx);

    // Assert: review-solution agent is dispatched inside executePhase
    expect(executePhaseBody).toMatch(/agentType:\s*'review-solution'/);

    // Assert: ledger open appears before review-solution dispatch in the body
    const openInBody   = executePhaseBody.indexOf('ai-toolkit ledger open');
    const reviewInBody = executePhaseBody.indexOf("agentType: 'review-solution'");
    expect(openInBody).toBeGreaterThan(-1);
    expect(reviewInBody).toBeGreaterThan(-1);
    expect(openInBody).toBeLessThan(reviewInBody);
  });
});

// ── old persist-ledger pattern removed ────────────────────────────────────────
// The old label 'persist-ledger' must no longer appear as an agent call.

describe('pm-phase3.js — old persist-ledger agent call is removed', () => {
  test('no persist-ledger agent call label present', () => {
    // Arrange/Act/Assert
    expect(source).not.toMatch(/label:\s*['"`]persist-ledger/);
  });
});

// ── Null-compatibility: token unavailability guard (AC-18) ────────────────────
// null/0/not_available token values must be treated as data unavailable and
// never coerced into an observable real zero passed to ledger close --tokens 0.
// The tokensAvailable() helper enforces this; the resume-clobber guard uses it
// instead of a raw `=== 0` check so cached agents cannot overwrite positive
// on-disk values.

describe('pm-phase3.js — null-compatibility token guard present (AC-18)', () => {
  test('"tokens || 0" coercion pattern is absent from source', () => {
    // Arrange/Act/Assert: no raw || 0 coercion on token values
    expect(source).not.toContain('tokens || 0');
  });

  test('source contains an unavailability marker (null/0/not_available => unavailable)', () => {
    // Arrange/Act/Assert: the marker that documents null/0/not_available intent must be present
    expect(source).toMatch(/null.*unavailable|data.*unavailable|not_available/);
  });

  test('tokensAvailable helper function is defined', () => {
    // Arrange/Act/Assert: the guard function that prevents zero/null emission must exist
    expect(source).toMatch(/function\s+tokensAvailable\s*\(/);
  });

  test('tokensAvailable guards the resume-clobber branch in Actuals', () => {
    // Arrange: locate the Actuals recovery block
    const actualsIdx = source.indexOf('Fallback: merge in any ledger entries');
    expect(actualsIdx).toBeGreaterThan(-1);

    // The block ends before totalPhase3Tokens
    const totalIdx = source.indexOf('totalPhase3Tokens', actualsIdx);
    expect(totalIdx).toBeGreaterThan(actualsIdx);

    const recoveryBlock = source.slice(actualsIdx, totalIdx);

    // Assert: tokensAvailable is used in the resume-clobber guard (not raw === 0)
    expect(recoveryBlock).toContain('tokensAvailable');
    expect(recoveryBlock).not.toContain('phase_delta_tokens === 0 &&');
  });
});
