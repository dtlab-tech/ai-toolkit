'use strict';

/**
 * CLI integration test scaffold for ledger subcommands — INFRA-TASK-TEST-02 (FTR-016).
 *
 * Concern blocks:
 *   1. subcommand dispatch      — handleLedgerCommand routes open/close/fail/skip to the right handler
 *   2. argument validation      — parseLedgerArgs rejects malformed --prefix, --agent, --attempt, --tokens
 *   3. features-root resolution — resolve-features-root CLI output contract and AGENTS.md grammar parser
 *   4. fail-closed behavior     — every I/O failure exits non-zero; nothing written on error
 *   5. installer propagation    — installer catalog includes all ledger-related CLI assets
 *
 * Per-user-story test tasks (US-01-TASK-TEST-01 … US-05-TASK-TEST-02) will populate
 * each describe block. Do NOT add real fixture setup or spawn logic here — add it in
 * the per-US task files, or in a shared helper module they require.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// NOTE: bin/cli.js is guarded by `if (require.main === module)` so requiring it here
// is side-effect-free; pure functions are exported via the else branch.
// Per-user-story tasks will destructure specific exports (e.g. parseLedgerArgs,
// resolveFeaturesRoot, shellQuotePosix) from this require.
const CLI = path.join(__dirname, '..', '..', 'bin', 'cli.js');

// Sanity-check that the module loads without side effects.
// eslint-disable-next-line no-unused-vars
const cliExports = require('../../bin/cli');

// ── Convenience helper (placeholder — per-US tasks replace with real spawn calls) ──
// function runCLI(args) {
//   const { spawnSync } = require('child_process');
//   return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', shell: false });
// }

describe('ledger CLI', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Subcommand dispatch
  //    handleLedgerCommand parses the first positional argument and routes to
  //    the correct per-subcommand handler (open, close, fail, skip).
  // ─────────────────────────────────────────────────────────────────────────
  describe('subcommand dispatch', () => {
    it.todo('unknown subcommand exits non-zero with a usage diagnostic on stderr');
    it.todo('missing subcommand (no positional) exits non-zero with a usage diagnostic');
    it.todo('"ledger open" routes to the open handler (exit 0 on success)');
    it.todo('"ledger close" routes to the close handler (exit 0 on success)');
    it.todo('"ledger fail" routes to the fail handler (exit 0 on success)');
    it.todo('"ledger skip" routes to the skip handler (exit 0 on success)');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Argument validation
  //    parseLedgerArgs validates the shared ledger flags and throws on malformed
  //    input before any I/O is attempted.
  // ─────────────────────────────────────────────────────────────────────────
  describe('argument validation', () => {
    it.todo('malformed --prefix (contains spaces or special characters) exits non-zero');
    it.todo('empty --agent value exits non-zero with a validation error');
    it.todo('non-integer --attempt value exits non-zero with a validation error');
    it('rejects --tokens zero and writes nothing', () => {
      // Arrange: fresh directory with no ledger file
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'led-cli-'));
      try {
        // Act: spawn the CLI close subcommand with --tokens 0
        const result = spawnSync(
          process.execPath,
          [
            CLI, 'ledger', 'close',
            '--dir',     tmpDir,
            '--prefix',  'FTR-999',
            '--agent',   'a',
            '--tokens',  '0',
            '--attempt', '1',
          ],
          { encoding: 'utf8' }
        );

        // Assert: exit is non-zero (validation rejects before any write)
        expect(result.status).not.toBe(0);

        // Assert: nothing was written (ledger file must not exist)
        const ledgerFile = path.join(tmpDir, 'FTR-999-token-ledger.json');
        expect(fs.existsSync(ledgerFile)).toBe(false);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('rejects --tokens negative and writes nothing', () => {
      // Arrange: fresh directory with no ledger file
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'led-cli-'));
      try {
        // Act: spawn the CLI close subcommand with --tokens -5
        const result = spawnSync(
          process.execPath,
          [
            CLI, 'ledger', 'close',
            '--dir',     tmpDir,
            '--prefix',  'FTR-999',
            '--agent',   'a',
            '--tokens',  '-5',
            '--attempt', '1',
          ],
          { encoding: 'utf8' }
        );

        // Assert: exit is non-zero (validation rejects before any write)
        expect(result.status).not.toBe(0);

        // Assert: nothing was written (ledger file must not exist)
        const ledgerFile = path.join(tmpDir, 'FTR-999-token-ledger.json');
        expect(fs.existsSync(ledgerFile)).toBe(false);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
    it.todo('--tokens of a non-integer string exits non-zero and writes nothing');
    it.todo('well-formed argument vector returns a parsed object with coerced integer fields');
    it.todo('omitting --tokens is accepted and records null for phase_delta_tokens');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Features-root resolution
  //    resolve-features-root CLI output contract and the AGENTS.md grammar
  //    parser that backs it (resolveFeaturesRoot).
  // ─────────────────────────────────────────────────────────────────────────
  describe('features-root resolution', () => {
    it.todo('resolved path is printed to stdout only (no trailing content) on success');
    it.todo('exit 0 when exactly one valid features root is found');
    it.todo('stdout is empty and stderr contains a diagnostic when no root is found');
    it.todo('stdout is empty and stderr contains a diagnostic for an ambiguous root');
    it.todo('stdout is empty and stderr contains a diagnostic for a multiply-declared root');
    it.todo('commented-out lines in AGENTS.md are ignored by the grammar parser');
    it.todo('inline comments in AGENTS.md are stripped by the grammar parser');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Fail-closed behavior
  //    Every I/O or lock failure must exit non-zero so callers hard-stop.
  //    No entry is written or mutated on error.
  // ─────────────────────────────────────────────────────────────────────────
  describe('fail-closed behavior', () => {
    it.todo('open failure (lock contention) exits non-zero and writes no entry');

    it('open failure exits non-zero when the ledger file is corrupt', () => {
      // Arrange: write a corrupt (non-JSON) ledger file so open() will throw on parse
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'led-cli-'));
      try {
        const prefix      = 'FTR-999';
        const ledgerFile  = path.join(tmpDir, prefix + '-token-ledger.json');
        fs.writeFileSync(ledgerFile, '{ not json', 'utf8');

        // Act: invoke the CLI subcommand via a child process
        const result = spawnSync(
          process.execPath,
          [
            CLI, 'ledger', 'open',
            '--dir',     tmpDir,
            '--prefix',  prefix,
            '--agent',   'test-agent',
            '--phase',   'phase1',
            '--model',   'haiku',
            '--attempt', '1',
          ],
          { encoding: 'utf8' }
        );

        // Assert: the process must exit non-zero (fail-closed) so the workflow hard-stops
        expect(result.status).not.toBe(0);

        // Assert: the corrupt file is NOT replaced by a fresh running entry
        const stillCorrupt = fs.readFileSync(ledgerFile, 'utf8');
        expect(stillCorrupt).toBe('{ not json');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it.todo('close failure for a never-opened operation_id exits non-zero');
    it('fail failure for a never-opened operation_id exits non-zero', () => {
      // Arrange: fresh directory with no ledger entry for the operation
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'led-cli-'));
      try {
        // Act: invoke the CLI fail subcommand for an operation that was never opened
        const result = spawnSync(
          process.execPath,
          [
            CLI, 'ledger', 'fail',
            '--dir',     tmpDir,
            '--prefix',  'FTR-999',
            '--agent',   'ghost',
            '--error',   'x',
            '--attempt', '1',
          ],
          { encoding: 'utf8' }
        );

        // Assert: exit is non-zero (fail-closed; never-opened operation must hard-stop)
        expect(result.status).not.toBe(0);

        // Assert: nothing was written (ledger file must not exist)
        const ledgerFile = path.join(tmpDir, 'FTR-999-token-ledger.json');
        expect(fs.existsSync(ledgerFile)).toBe(false);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
    it('skip with ambiguous agent fallback exits non-zero without mutating the ledger', () => {
      // Arrange: fresh directory; open two entries for the same agent under different attempts
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'led-cli-'));
      try {
        const prefix     = 'FTR-999';
        const ledgerFile = path.join(tmpDir, prefix + '-token-ledger.json');

        spawnSync(
          process.execPath,
          [
            CLI, 'ledger', 'open',
            '--dir',     tmpDir,
            '--prefix',  prefix,
            '--agent',   'amb-agent',
            '--phase',   'phase1',
            '--model',   'haiku',
            '--attempt', '1',
          ],
          { encoding: 'utf8' }
        );

        spawnSync(
          process.execPath,
          [
            CLI, 'ledger', 'open',
            '--dir',     tmpDir,
            '--prefix',  prefix,
            '--agent',   'amb-agent',
            '--phase',   'phase1',
            '--model',   'haiku',
            '--attempt', '2',
          ],
          { encoding: 'utf8' }
        );

        // Capture the ledger content before the ambiguous skip attempt
        const contentBefore = fs.readFileSync(ledgerFile, 'utf8');

        // Act: skip with a non-matching attempt (99 — no exact operation_id match)
        // so the agent-name fallback finds 2 entries and the CLI must exit non-zero
        const result = spawnSync(
          process.execPath,
          [
            CLI, 'ledger', 'skip',
            '--dir',     tmpDir,
            '--prefix',  prefix,
            '--agent',   'amb-agent',
            '--phase',   'phase1',
            '--model',   'haiku',
            '--attempt', '99',
          ],
          { encoding: 'utf8' }
        );

        // Assert: exit is non-zero (ambiguous fallback must hard-stop)
        expect(result.status).not.toBe(0);

        // Assert: ledger file is byte-for-byte unchanged (no mutation on ambiguous)
        const contentAfter = fs.readFileSync(ledgerFile, 'utf8');
        expect(contentAfter).toBe(contentBefore);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
    it.todo('no failure is silently downgraded to exit 0 or a best-effort write');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Installer propagation
  //    The installer must include all ledger-related CLI assets in the
  //    catalog/manifest so they reach a destination project via packaging alone.
  // ─────────────────────────────────────────────────────────────────────────
  describe('installer propagation', () => {
    it.todo('pm-phase1.js is included in the installer catalog payload');
    it.todo('pm-phase2.js is included in the installer catalog payload');
    it.todo('pm-phase3.js is included in the installer catalog payload');
    it.todo('define-feature.md is included in the installer catalog payload');
    it.todo('no duplicate copies of ledger assets exist (catalog is the single source)');
  });
});
