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

// ── Helper function definitions ───────────────────────────────────────────────

describe('pm-phase1.js — ledger helper functions defined at top of file (Tech-Spec §4.2)', () => {
  test('defines appendLedgerEntry as an async function', () => {
    // Arrange/Act/Assert: helper must be defined in the workflow script
    expect(source).toMatch(/async\s+function\s+appendLedgerEntry\s*\(/);
  });

  test('defines updateLedgerEntry as an async function', () => {
    // Arrange/Act/Assert
    expect(source).toMatch(/async\s+function\s+updateLedgerEntry\s*\(/);
  });

  test('appendLedgerEntry is defined before updateLedgerEntry (correct source order)', () => {
    // Arrange
    const appendDefIdx = source.indexOf('async function appendLedgerEntry');
    const updateDefIdx = source.indexOf('async function updateLedgerEntry');

    // Assert: append helper precedes update helper
    expect(appendDefIdx).toBeGreaterThan(-1);
    expect(updateDefIdx).toBeGreaterThan(-1);
    expect(appendDefIdx).toBeLessThan(updateDefIdx);
  });

  test('appendLedgerEntry body uses await agent() for file I/O (not fs)', () => {
    // Arrange: extract the appendLedgerEntry function body up to the next function definition
    const appendDefStart = source.indexOf('async function appendLedgerEntry');
    const updateDefStart = source.indexOf('async function updateLedgerEntry');
    expect(appendDefStart).toBeGreaterThan(-1);
    expect(updateDefStart).toBeGreaterThan(appendDefStart);
    const funcBody = source.slice(appendDefStart, updateDefStart);

    // Assert: function delegates to agent(), not to fs
    expect(funcBody).toMatch(/\bawait\s+agent\s*\(/);
    expect(funcBody).not.toMatch(/\bfs\s*\.\s*(readFileSync|writeFileSync|existsSync)\b/);
  });

  test('updateLedgerEntry body uses await agent() for file I/O (not fs)', () => {
    // Arrange: extract updateLedgerEntry body up to the parse-args block
    const updateDefStart = source.indexOf('async function updateLedgerEntry');
    // The helper block ends at the parse-args section (marked by featurePath / args parsing)
    const parseArgsMarker = source.indexOf('const featurePath');
    expect(updateDefStart).toBeGreaterThan(-1);
    expect(parseArgsMarker).toBeGreaterThan(updateDefStart);
    const funcBody = source.slice(updateDefStart, parseArgsMarker);

    // Assert: function delegates to agent()
    expect(funcBody).toMatch(/\bawait\s+agent\s*\(/);
    expect(funcBody).not.toMatch(/\bfs\s*\.\s*(readFileSync|writeFileSync|existsSync)\b/);
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

// ── Append-before / update-after pattern (AC-07, AC-13) ──────────────────────
// The liveness guarantee (status: "running" visible on disk between dispatch calls)
// depends on appendLedgerEntry executing BEFORE the agent() call and
// updateLedgerEntry executing AFTER.  Source-level ordering verification is the
// only practical check available without running the workflow runtime.

describe('pm-phase1.js — append-before / update-after pattern in source (AC-07, AC-13)', () => {
  test('appendLedgerEntry is called at least three times (one per agent type)', () => {
    // Arrange/Act: count call-sites of appendLedgerEntry
    const matches = source.match(/\bappendLedgerEntry\s*\(/g);

    // Assert: generate-requirements, generate-tech-spec, validate-feature-docs (loop) = min 3
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  test('updateLedgerEntry is called at least three times (one per agent type)', () => {
    // Arrange/Act: count call-sites of updateLedgerEntry
    const matches = source.match(/\bupdateLedgerEntry\s*\(/g);

    // Assert: generate-requirements, generate-tech-spec, validate-feature-docs (loop) = min 3
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  test('appendLedgerEntry call-count equals updateLedgerEntry call-count (symmetric wrapping)', () => {
    // Arrange/Act
    const appendCount = (source.match(/\bappendLedgerEntry\s*\(/g) || []).length;
    const updateCount = (source.match(/\bupdateLedgerEntry\s*\(/g) || []).length;

    // Assert: every append has a corresponding update
    expect(appendCount).toBe(updateCount);
  });

  test('first await appendLedgerEntry call site appears before generate-requirements dispatch in source', () => {
    // Arrange: find the first call site (not the function definition).
    // Use "await appendLedgerEntry(" which only matches call sites, not the definition.
    const appendIdx = source.indexOf('await appendLedgerEntry(');
    // The generate-requirements dispatch is identified by its agentType label
    const dispatchIdx = source.indexOf("agentType: 'generate-requirements'");

    // Assert: append call precedes dispatch
    expect(appendIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(appendIdx).toBeLessThan(dispatchIdx);
  });

  test('first await updateLedgerEntry call site appears after generate-requirements dispatch in source', () => {
    // Arrange: find call sites (not definitions) using the await keyword
    const dispatchIdx = source.indexOf("agentType: 'generate-requirements'");
    const updateIdx   = source.indexOf('await updateLedgerEntry(');

    // Assert: update call follows dispatch
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(dispatchIdx);
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

  test('ensure-ledger step appears before the first appendLedgerEntry call site', () => {
    // Arrange: use 'await appendLedgerEntry(' to match only call sites (not the function
    // definition itself, which appears at the top of the file before the ensure step)
    const ensureIdx = source.indexOf('ensure-ledger');
    const appendIdx = source.indexOf('await appendLedgerEntry(');

    // Assert: ledger is guaranteed to exist before pm-phase1 appends to it
    expect(ensureIdx).toBeGreaterThan(-1);
    expect(appendIdx).toBeGreaterThan(-1);
    expect(ensureIdx).toBeLessThan(appendIdx);
  });
});
