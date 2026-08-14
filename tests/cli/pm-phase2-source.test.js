'use strict';

/**
 * US-03-T01 / US-03-T02 — pm-phase2.js source-structure validation
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
 *   2. Helper functions are async and use agent() for I/O — confirms the correct
 *      implementation pattern, matching pm-phase1.js.
 *
 *   3. Correct agent key is embedded — the key "generate-work-breakdown:phase2" is the key
 *      that pm-phase2 passes to appendLedgerEntry/updateLedgerEntry; a wrong key silently
 *      produces incorrect ledger entries at runtime with no test failure.
 *
 *   4. Append-before / update-after pattern is present — the structural ordering of
 *      appendLedgerEntry() and updateLedgerEntry() relative to the agent() dispatch call
 *      must be correct; inversion produces liveness-signal failures (AC-07, AC-13).
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

// ── Helper function definitions ───────────────────────────────────────────────

describe('pm-phase2.js — ledger helper functions defined at top of file (Tech-Spec §4.3)', () => {
  test('defines appendLedgerEntry as an async function', () => {
    expect(source).toMatch(/async\s+function\s+appendLedgerEntry\s*\(/);
  });

  test('defines updateLedgerEntry as an async function', () => {
    expect(source).toMatch(/async\s+function\s+updateLedgerEntry\s*\(/);
  });

  test('appendLedgerEntry is defined before updateLedgerEntry (correct source order)', () => {
    const appendDefIdx = source.indexOf('async function appendLedgerEntry');
    const updateDefIdx = source.indexOf('async function updateLedgerEntry');

    expect(appendDefIdx).toBeGreaterThan(-1);
    expect(updateDefIdx).toBeGreaterThan(-1);
    expect(appendDefIdx).toBeLessThan(updateDefIdx);
  });

  test('appendLedgerEntry body uses await agent() for file I/O (not fs)', () => {
    const appendDefStart = source.indexOf('async function appendLedgerEntry');
    const updateDefStart = source.indexOf('async function updateLedgerEntry');
    expect(appendDefStart).toBeGreaterThan(-1);
    expect(updateDefStart).toBeGreaterThan(appendDefStart);
    const funcBody = source.slice(appendDefStart, updateDefStart);

    expect(funcBody).toMatch(/\bawait\s+agent\s*\(/);
    expect(funcBody).not.toMatch(/\bfs\s*\.\s*(readFileSync|writeFileSync|existsSync)\b/);
  });

  test('updateLedgerEntry body uses await agent() for file I/O (not fs)', () => {
    const updateDefStart = source.indexOf('async function updateLedgerEntry');
    const parseArgsMarker = source.indexOf('const featurePath');
    expect(updateDefStart).toBeGreaterThan(-1);
    expect(parseArgsMarker).toBeGreaterThan(updateDefStart);
    const funcBody = source.slice(updateDefStart, parseArgsMarker);

    expect(funcBody).toMatch(/\bawait\s+agent\s*\(/);
    expect(funcBody).not.toMatch(/\bfs\s*\.\s*(readFileSync|writeFileSync|existsSync)\b/);
  });
});

// ── Correct agent key (AC-05) ─────────────────────────────────────────────────
// The agent key is passed to appendLedgerEntry and then matched by updateLedgerEntry
// to find and mutate the correct entry.  A wrong key silently creates a dangling
// "running" entry on disk and an orphaned "done" update.

describe('pm-phase2.js — correct agent key embedded in source (AC-05)', () => {
  test('uses agent key "generate-work-breakdown:phase2"', () => {
    expect(source).toContain('generate-work-breakdown:phase2');
  });
});

// ── Append-before / update-after pattern (AC-07, AC-13) ──────────────────────
// The liveness guarantee (status: "running" visible on disk between dispatch calls)
// depends on appendLedgerEntry executing BEFORE the agent() call and
// updateLedgerEntry executing AFTER.

describe('pm-phase2.js — append-before / update-after call ordering (AC-07, AC-13)', () => {
  test('appendLedgerEntry is called at least once (before generate-work-breakdown)', () => {
    const matches = source.match(/\bappendLedgerEntry\s*\(/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  test('updateLedgerEntry is called at least once (after generate-work-breakdown)', () => {
    const matches = source.match(/\bupdateLedgerEntry\s*\(/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  test('updateLedgerEntry call-count is >= appendLedgerEntry call-count (try+catch pattern for fallible dispatches)', () => {
    const appendCount = (source.match(/\bappendLedgerEntry\s*\(/g) || []).length;
    const updateCount = (source.match(/\bupdateLedgerEntry\s*\(/g) || []).length;

    // Fallible activities (wb-validate, semantic, wb-render) each have 2 update call sites
    // (done in try + failed in catch) but only 1 append call site. Skipped entries use only
    // appendLedgerEntry. Both effects make updateCount >= appendCount.
    expect(updateCount).toBeGreaterThanOrEqual(appendCount);
  });

  test('await appendLedgerEntry call site appears before generate-work-breakdown dispatch in source', () => {
    // Use "await appendLedgerEntry(" to match call sites only, not the function definition.
    const appendCallIdx = source.indexOf('await appendLedgerEntry(');
    const dispatchIdx   = source.indexOf("agentType: 'generate-work-breakdown'");

    expect(appendCallIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(appendCallIdx).toBeLessThan(dispatchIdx);
  });

  test('await updateLedgerEntry call site appears after generate-work-breakdown dispatch in source', () => {
    const dispatchIdx  = source.indexOf("agentType: 'generate-work-breakdown'");
    const updateCallIdx = source.indexOf("await updateLedgerEntry(");

    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(updateCallIdx).toBeGreaterThan(-1);
    expect(updateCallIdx).toBeGreaterThan(dispatchIdx);
  });
});

// ── I6: completed_at contract for skipped, running, and done ledger entries ───
//
// appendLedgerEntry used to hardcode `completed_at: null` AFTER the spread, silently
// overwriting caller-supplied values. Skipped entries pass `completed_at: '__TS__'`
// and rely on the agent prompt replacing it with a real UTC timestamp.
//
// Three invariants that prevent regression:
//   1. Defaults-first spread — `{ started_at: '__TS__', completed_at: null, ...entry }` so
//      callers can override both fields.
//   2. Skipped call sites pass `completed_at: '__TS__'` — confirmed by inspecting every
//      `status: 'skipped'` append call site in the source.
//   3. Agent prompt replaces every `__TS__` — not just in started_at — so skipped entries
//      get a real completed_at timestamp at runtime.

describe('pm-phase2.js — I6: completed_at contract for running / skipped / done entries', () => {
  test('appendLedgerEntry uses defaults-first spread so caller-supplied completed_at is preserved', () => {
    // Extract the body of appendLedgerEntry (between its definition and updateLedgerEntry).
    const appendDefStart = source.indexOf('async function appendLedgerEntry');
    const updateDefStart = source.indexOf('async function updateLedgerEntry');
    expect(appendDefStart).toBeGreaterThan(-1);
    expect(updateDefStart).toBeGreaterThan(appendDefStart);
    const funcBody = source.slice(appendDefStart, updateDefStart);

    // The spread must be defaults-first: '{ started_at: ..., completed_at: null, ...entry }'
    // so that caller-supplied completed_at (e.g. '__TS__' for skipped) wins.
    expect(funcBody).toMatch(/\{\s*started_at\s*:\s*'__TS__'\s*,\s*completed_at\s*:\s*null\s*,\s*\.\.\.entry\s*\}/);
  });

  test('all status: "skipped" appendLedgerEntry call sites include completed_at: \'__TS__\'', () => {
    // Find every occurrence of appendLedgerEntry call that includes status: 'skipped'.
    // Each skipped call site must also supply completed_at: '__TS__' so the agent
    // replaces it with a real UTC timestamp.
    const callSiteRegex = /await appendLedgerEntry\([^)]*?(?:\([^)]*\)[^)]*?)*\)/gs;
    const callSites = source.match(callSiteRegex) || [];
    const skippedSites = callSites.filter(site => /status:\s*['"]skipped['"]/.test(site));

    expect(skippedSites.length).toBeGreaterThan(0);
    for (const site of skippedSites) {
      expect(site).toMatch(/completed_at\s*:\s*'__TS__'/);
    }
  });

  test('appendLedgerEntry agent prompt replaces every "__TS__" value (not only started_at)', () => {
    const appendDefStart = source.indexOf('async function appendLedgerEntry');
    const updateDefStart = source.indexOf('async function updateLedgerEntry');
    const funcBody = source.slice(appendDefStart, updateDefStart);

    // The prompt must say "every" or "all" __TS__ — NOT "in started_at" (which would
    // leave completed_at = '__TS__' on disk for skipped entries).
    expect(funcBody).toMatch(/every\s+"__TS__"|all\s+"__TS__"|every\s+['"]__TS__['"]|all\s+['"]__TS__['"]/);
    expect(funcBody).not.toMatch(/"__TS__"\s+in\s+started_at/);
  });
});
