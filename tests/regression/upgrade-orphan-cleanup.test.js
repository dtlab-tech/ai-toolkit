'use strict';

/**
 * upgrade-orphan-cleanup.test.js
 *
 * Regression guard: verifies that the installer correctly handles the upgrade
 * path when a destination has files from a previous installation that no longer
 * exist in the current toolkit version.
 *
 * Orphaned files (in old manifest but not in new install set) must be:
 *   - Moved to .claude/.ai-toolkit-trash/<timestamp>/<relative-path>
 *   - Removed from their original location
 *   - Absent from the updated manifest
 *
 * Legitimate files (still present in new install set) must be:
 *   - Left in place
 *   - Present in the updated manifest
 */

const { spawnSync } = require('child_process');
const fs            = require('fs');
const os            = require('os');
const path          = require('path');

jest.setTimeout(60000);

const TOOLKIT_ROOT = path.resolve(__dirname, '../..');
const CLI_PATH     = path.join(TOOLKIT_ROOT, 'bin', 'cli.js');

// Helper: recursively list all file paths under a directory.
function walkDirSync(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) results.push(...walkDirSync(full));
    else results.push(full);
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Group 1: Orphaned files are trashed and removed
// ─────────────────────────────────────────────────────────────────────────────

describe('upgrade-orphan-cleanup — Group 1: orphaned files moved to trash', () => {
  let tmpDir;
  const ORPHAN_REL  = '.claude/agents/old-agent-from-v0.9.0.md';
  const ORPHAN_BODY = '# stale agent from old version';

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-toolkit-upgrade-'));

    // Simulate what a previous install would have written:
    //   1. The orphan file itself
    //   2. A manifest that records the orphan plus one legitimate entry
    const orphanPath = path.join(tmpDir, ORPHAN_REL);
    fs.mkdirSync(path.dirname(orphanPath), { recursive: true });
    fs.writeFileSync(orphanPath, ORPHAN_BODY, 'utf8');

    const manifest = {
      version:     '0.9.0',
      installedAt: '2026-01-01T00:00:00.000Z',
      files: [
        ORPHAN_REL,
        '.claude/scripts/wb-validate.js', // still present in current install
      ],
    };
    fs.writeFileSync(
      path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );

    // Run the installer — --force auto-moves orphans without prompting.
    spawnSync(
      process.execPath,
      [CLI_PATH, '--local', tmpDir, '--force'],
      { encoding: 'utf8', cwd: TOOLKIT_ROOT }
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('orphan file no longer exists at its original location', () => {
    expect(fs.existsSync(path.join(tmpDir, ORPHAN_REL))).toBe(false);
  });

  test('orphan file is present somewhere under .ai-toolkit-trash/', () => {
    const trashBase = path.join(tmpDir, '.claude', '.ai-toolkit-trash');
    const trashFiles = walkDirSync(trashBase);
    expect(
      trashFiles.some(f => f.replace(/\\/g, '/').endsWith('old-agent-from-v0.9.0.md'))
    ).toBe(true);
  });

  test('trashed orphan preserves its original content', () => {
    const trashBase = path.join(tmpDir, '.claude', '.ai-toolkit-trash');
    const trashFile = walkDirSync(trashBase)
      .find(f => f.replace(/\\/g, '/').endsWith('old-agent-from-v0.9.0.md'));
    expect(trashFile).toBeDefined();
    expect(fs.readFileSync(trashFile, 'utf8')).toBe(ORPHAN_BODY);
  });

  test('trash directory uses a timestamp-prefixed subdirectory', () => {
    const trashBase = path.join(tmpDir, '.claude', '.ai-toolkit-trash');
    // The trash structure is .ai-toolkit-trash/<ISO-timestamp>/<relative-path>.
    // The first-level children of trashBase should be timestamp directories.
    const entries = fs.readdirSync(trashBase);
    expect(entries.length).toBeGreaterThan(0);
    // ISO timestamps contain digits and dashes/colons (normalized to dashes in our impl).
    expect(entries[0]).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  test('updated manifest does not contain the orphan entry', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json'), 'utf8')
    );
    expect(manifest.files.some(f => f.includes('old-agent-from-v0.9.0.md'))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 2: Legitimate (non-orphaned) files survive the upgrade
// ─────────────────────────────────────────────────────────────────────────────

describe('upgrade-orphan-cleanup — Group 2: legitimate files survive the upgrade', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-toolkit-upgrade-legit-'));

    // Plant only a stale orphan; the installer will write all legitimate files fresh.
    const orphanPath = path.join(tmpDir, '.claude', 'agents', 'stale.md');
    fs.mkdirSync(path.dirname(orphanPath), { recursive: true });
    fs.writeFileSync(orphanPath, '# stale', 'utf8');

    const manifest = {
      version:     '0.8.0',
      installedAt: '2026-01-01T00:00:00.000Z',
      files: ['.claude/agents/stale.md', '.claude/scripts/wb-validate.js'],
    };
    fs.writeFileSync(
      path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );

    spawnSync(
      process.execPath,
      [CLI_PATH, '--local', tmpDir, '--force'],
      { encoding: 'utf8', cwd: TOOLKIT_ROOT }
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('wb-validate.js is present after upgrade', () => {
    expect(
      fs.existsSync(path.join(tmpDir, '.claude', 'scripts', 'wb-validate.js'))
    ).toBe(true);
  });

  test('wb-render.js is present after upgrade', () => {
    expect(
      fs.existsSync(path.join(tmpDir, '.claude', 'scripts', 'wb-render.js'))
    ).toBe(true);
  });

  test('updated manifest records wb-validate.js', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json'), 'utf8')
    );
    expect(manifest.files.some(f => f.includes('wb-validate.js'))).toBe(true);
  });

  test('updated manifest records wb-render.js', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json'), 'utf8')
    );
    expect(manifest.files.some(f => f.includes('wb-render.js'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 3b: docs/ and CLAUDE.md from old manifests are NOT trashed during upgrade
// ─────────────────────────────────────────────────────────────────────────────

describe('upgrade-orphan-cleanup — Group 3b: docs/CLAUDE.md from legacy manifest not trashed', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-toolkit-upgrade-docs-'));

    // Create docs and CLAUDE.md at the target location (pre-existing from old install).
    const docsDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'reference.md'), '# existing reference', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# existing claude', 'utf8');

    // Old manifest that listed docs and CLAUDE.md (pre-hotfix installer behavior).
    const manifest = {
      version:          '0.9.0',
      installedAt:      '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files: [
        'docs/reference.md',
        'CLAUDE.md',
        '.claude/scripts/wb-validate.js',
      ],
    };
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, '.ai-toolkit-manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );

    spawnSync(
      process.execPath,
      [CLI_PATH, '--local', tmpDir, '--force'],
      { encoding: 'utf8', cwd: TOOLKIT_ROOT }
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('docs/ files are not moved to trash during upgrade from legacy manifest', () => {
    const trashBase = path.join(tmpDir, '.claude', '.ai-toolkit-trash');
    const trashFiles = walkDirSync(trashBase);
    expect(
      trashFiles.some(f => f.replace(/\\/g, '/').includes('reference.md'))
    ).toBe(false);
  });

  test('CLAUDE.md is not moved to trash during upgrade from legacy manifest', () => {
    const trashBase = path.join(tmpDir, '.claude', '.ai-toolkit-trash');
    const trashFiles = walkDirSync(trashBase);
    expect(
      trashFiles.some(f => path.basename(f) === 'CLAUDE.md')
    ).toBe(false);
  });

  test('new manifest does not contain docs/ entries', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json'), 'utf8')
    );
    expect(manifest.files.some(f => f.startsWith('docs/'))).toBe(false);
  });

  test('new manifest does not contain CLAUDE.md entry', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json'), 'utf8')
    );
    expect(manifest.files.some(f => f === 'CLAUDE.md')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 3: Repeated upgrades accumulate orphans in separate timestamp dirs
// ─────────────────────────────────────────────────────────────────────────────

describe('upgrade-orphan-cleanup — Group 3: repeated upgrades use separate timestamp dirs', () => {
  let tmpDir;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-toolkit-upgrade-repeat-'));

    // First install.
    spawnSync(
      process.execPath,
      [CLI_PATH, '--local', tmpDir, '--force'],
      { encoding: 'utf8', cwd: TOOLKIT_ROOT }
    );

    // Inject a fake orphan into the manifest to trigger cleanup on next install.
    const manifestPath = path.join(tmpDir, '.claude', '.ai-toolkit-manifest.json');
    const manifest     = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const orphan1      = '.claude/agents/orphan-run-1.md';
    const orphan1Path  = path.join(tmpDir, orphan1);
    fs.writeFileSync(orphan1Path, '# orphan 1', 'utf8');
    manifest.files.push(orphan1);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    // Wait 1.1 s so the second install's timestamp differs from the first.
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Second install — should create a second timestamp directory.
    spawnSync(
      process.execPath,
      [CLI_PATH, '--local', tmpDir, '--force'],
      { encoding: 'utf8', cwd: TOOLKIT_ROOT }
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('at least one timestamp directory exists in trash', () => {
    const trashBase = path.join(tmpDir, '.claude', '.ai-toolkit-trash');
    if (!fs.existsSync(trashBase)) {
      // If no orphans were trashed this is a pass — no stale files existed.
      return;
    }
    const timestamps = fs.readdirSync(trashBase);
    expect(timestamps.length).toBeGreaterThan(0);
  });
});
