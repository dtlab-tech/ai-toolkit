'use strict';

/**
 * Regression tests for Level 2 CLI robustness fixes found during the
 * solution-wide self-review:
 *   1. `install --global --home <path>` alias used to silently drop --home
 *      and install into the real OS home directory instead.
 *   2. Any uncaught subcommand error (e.g. `workflow run <unknown>`) used to
 *      surface as a raw unhandled promise rejection instead of a clean
 *      one-line error + exit 1.
 *   3. `doctor <unknown-subcommand>` gave no diagnostic specific to the
 *      unrecognized subcommand — just the generic install-usage help text.
 *   4. `resolve-features-root`'s documented `options.featuresRoot` override
 *      was unreachable from the CLI — no flag ever threaded it through.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', 'bin', 'cli.js');

jest.setTimeout(30000);

function runCLI(args, opts) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', shell: false, ...opts });
}

function mktmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-'));
}

describe('install --global --home alias honors --home (regression)', () => {
  test('`install --global --home <dir>` installs into <dir>, not the real OS home', () => {
    const fakeHome = mktmp('cli-robust-install-alias');
    const result = runCLI(['install', '--global', '--home', fakeHome, '--force', '--dry-run']);
    expect(result.status).toBe(0);
    // Dry run plan must list paths rooted under fakeHome, never the real homedir.
    expect(result.stdout).toContain(fakeHome.replace(/\\/g, path.sep));
    expect(result.stdout).not.toContain(os.homedir());
  });

  test('`install --global --home <dir>` and the direct `--global --home <dir>` form target the same path', () => {
    const fakeHome = mktmp('cli-robust-install-alias-parity');
    const viaAlias  = runCLI(['install', '--global', '--home', fakeHome, '--force', '--dry-run']);
    const viaDirect = runCLI(['--global', '--home', fakeHome, '--force', '--dry-run']);
    expect(viaAlias.status).toBe(0);
    expect(viaDirect.status).toBe(0);
    expect(viaAlias.stdout).toContain(fakeHome.replace(/\\/g, path.sep));
    expect(viaDirect.stdout).toContain(fakeHome.replace(/\\/g, path.sep));
  });
});

describe('uncaught subcommand errors produce a clean exit instead of an unhandled rejection (regression)', () => {
  test('`workflow run <unknown-workflow>` exits 1 with a clean message, not a raw stack dump', () => {
    const projectDir = mktmp('cli-robust-workflow-crash');
    const result = runCLI(['workflow', 'run', 'definitely-not-a-real-workflow',
      '--project', projectDir, '--claude-path', 'claude', '--', 'x']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Unsupported workflow/);
    // No unhandled-rejection banner — Node emits this verbatim when a
    // rejected promise from main() is never caught.
    expect(result.stderr).not.toMatch(/UnhandledPromiseRejection/);
  });
});

describe('doctor <unknown-subcommand> gives a specific diagnostic (regression)', () => {
  test('`doctor bogus` reports the unrecognized subcommand by name, not the generic help screen', () => {
    const result = runCLI(['doctor', 'bogus']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Unknown doctor subcommand: bogus/);
  });

  test('`doctor` with no subcommand also reports a specific diagnostic', () => {
    const result = runCLI(['doctor']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Unknown doctor subcommand: \(none\)/);
  });
});

describe('resolve-features-root --features-root override is reachable from the CLI (regression)', () => {
  test('--features-root <path> wins over any AGENTS.md convention or default directory', () => {
    const projectDir = mktmp('cli-robust-features-root');
    const overrideDir = path.join(projectDir, 'custom-features-location');
    const result = runCLI(['resolve-features-root', '--features-root', 'custom-features-location'],
      { cwd: projectDir });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(overrideDir);
  });
});
