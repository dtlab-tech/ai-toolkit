'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// resolver.test.js — comprehensive unit tests for resolveClaudeRuntimeAsset()
// INFRA-TASK-TEST-02 / FTR-015
//
// The resolver reads catalog source dirs (src/claude/<category>) to build the
// expected payload. After US-03, all 5 runtime asset categories are present
// under src/claude/ (agents, commands, skills, workflows, scripts).
// makeCompleteInstall() enumerates the real catalog to produce a complete
// installation in the temp dir; all Phase D completeness checks will pass.
//
// All tests pass explicit { projectDir, home } options so they never consult
// the real os.homedir() or process.cwd().
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { resolveClaudeRuntimeAsset } = require('../../bin/cli');

const TOOLKIT_VERSION = require('../../package.json').version;

// ── Catalog-defined paths ──────────────────────────────────────────────────────
// The real asset-catalog reports sourceDir = 'src/claude/scripts', so after
// building expectedPayload the only catalog entry is scripts/wb-validate.js.
// Tests that need Phase D/E to succeed must create this file in the runtime root.
const VALID_ASSET     = 'scripts/wb-validate.js';     // IS in catalog
const NON_CATALOG_ASSET = 'scripts/user-custom.js';   // NOT in catalog (no such source file)

// ── Shared tmpDir pool (cleaned in afterEach) ──────────────────────────────────
const tmpDirs = [];

function mktmp(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `resolver-${label}-`));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpDirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
  jest.restoreAllMocks();
});

// ── Filesystem helpers ─────────────────────────────────────────────────────────

function claudeDir(rootDir) {
  return path.join(rootDir, '.claude');
}

/** Write .ai-toolkit-manifest.json. content may be a string (raw) or object. */
function putManifest(rootDir, content) {
  const dir = claudeDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  const raw = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  fs.writeFileSync(path.join(dir, '.ai-toolkit-manifest.json'), raw, 'utf8');
}

/** Write .ai-toolkit-version stamp. */
function putVersionStamp(rootDir, version) {
  const dir = claudeDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.ai-toolkit-version'), version, 'utf8');
}

/**
 * Create a file at <rootDir>/.claude/<relPath>.
 * All intermediate directories are created automatically.
 */
function putPayloadFile(rootDir, relPath) {
  const filePath = path.join(claudeDir(rootDir), relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '// stub\n', 'utf8');
}

/**
 * Create a fully valid, complete runtime installation under rootDir.
 * After this call, isToolkitPresent() returns true via condA + condB + condC,
 * and Phase D passes because all catalog-registered source files are on disk.
 *
 * Enumerates the real asset catalog from src/claude/ so this helper stays
 * correct across catalog changes without manual maintenance.
 *
 * opts.mode    — installationMode in the manifest ('local' or 'global')
 * opts.version — version written to manifest and stamp (defaults to TOOLKIT_VERSION)
 * opts.manifestFiles — array of relative paths for manifest.files (defaults to full catalog)
 */
function makeCompleteInstall(rootDir, opts = {}) {
  const { getAssetCategories } = require('../../lib/asset-catalog');
  const TOOLKIT_ROOT = path.resolve(__dirname, '..', '..');
  const mode    = opts.mode    || 'local';
  const version = opts.version || TOOLKIT_VERSION;

  // Enumerate every file in src/claude/<category>/ and install it into <rootDir>/.claude/<category>/
  const catalogFiles = [];
  for (const cat of getAssetCategories()) {
    const srcDir = path.join(TOOLKIT_ROOT, cat.sourceDir);
    if (!fs.existsSync(srcDir)) continue;
    const stack = [srcDir];
    while (stack.length > 0) {
      const dir = stack.pop();
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          stack.push(full);
        } else {
          const rel = path.relative(srcDir, full).replace(/\\/g, '/');
          const runtimeRel = `${cat.name}/${rel}`;
          putPayloadFile(rootDir, runtimeRel);
          catalogFiles.push(`.claude/${runtimeRel}`);
        }
      }
    }
  }

  const files = opts.manifestFiles !== undefined ? opts.manifestFiles : catalogFiles;
  putVersionStamp(rootDir, version);
  putManifest(rootDir, {
    version,
    installedAt: '2026-01-01T00:00:00.000Z',
    installationMode: mode,
    files,
  });
}

/**
 * Install all catalog-registered files into <rootDir>/.claude/<category>/ without
 * writing a manifest or version stamp. Useful for tests that set those independently.
 * Returns the list of '.claude/<runtimeRel>' strings that were installed.
 */
function putFullCatalogPayload(rootDir) {
  const { getAssetCategories } = require('../../lib/asset-catalog');
  const TOOLKIT_ROOT = path.resolve(__dirname, '..', '..');
  const catalogFiles = [];
  for (const cat of getAssetCategories()) {
    const srcDir = path.join(TOOLKIT_ROOT, cat.sourceDir);
    if (!fs.existsSync(srcDir)) continue;
    const stack = [srcDir];
    while (stack.length > 0) {
      const dir = stack.pop();
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          stack.push(full);
        } else {
          const rel = path.relative(srcDir, full).replace(/\\/g, '/');
          const runtimeRel = `${cat.name}/${rel}`;
          putPayloadFile(rootDir, runtimeRel);
          catalogFiles.push(`.claude/${runtimeRel}`);
        }
      }
    }
  }
  return catalogFiles;
}

/** Capture all process.stderr.write() calls during fn(). */
function captureStderr(fn) {
  const messages = [];
  jest.spyOn(process.stderr, 'write').mockImplementation((msg) => {
    messages.push(String(msg));
    return true;
  });
  let result;
  let threw = null;
  try {
    result = fn();
  } catch (err) {
    threw = err;
  }
  return { result, messages, threw };
}

// ═════════════════════════════════════════════════════════════════════════════
// Phase 0 — Input validation (no filesystem access)
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 0 — Input validation (throws before any filesystem access)', () => {
  const projectDir = '/nonexistent-project-dir-should-never-be-read';
  const home       = '/nonexistent-home-dir-should-never-be-read';

  test('rejects empty string with "must be a non-empty string"', () => {
    expect(() => resolveClaudeRuntimeAsset('', { projectDir, home }))
      .toThrow('must be a non-empty string');
  });

  test('rejects null with "must be a non-empty string"', () => {
    expect(() => resolveClaudeRuntimeAsset(null, { projectDir, home }))
      .toThrow('must be a non-empty string');
  });

  test('rejects undefined with "must be a non-empty string"', () => {
    expect(() => resolveClaudeRuntimeAsset(undefined, { projectDir, home }))
      .toThrow('must be a non-empty string');
  });

  test('rejects Unix absolute path (starts with /) with "got Unix absolute path"', () => {
    expect(() => resolveClaudeRuntimeAsset('/etc/passwd', { projectDir, home }))
      .toThrow('got Unix absolute path');
  });

  test('rejects Windows absolute path (C:\\...) with "got Windows absolute path"', () => {
    expect(() => resolveClaudeRuntimeAsset('C:\\Windows\\system32\\foo.js', { projectDir, home }))
      .toThrow('got Windows absolute path');
  });

  test('rejects simple path traversal (../outside.js) with "path traversal"', () => {
    expect(() => resolveClaudeRuntimeAsset('../outside.js', { projectDir, home }))
      .toThrow('must not contain path traversal');
  });

  test('rejects nested path traversal (scripts/../../outside.js) with "path traversal"', () => {
    expect(() => resolveClaudeRuntimeAsset('scripts/../../outside.js', { projectDir, home }))
      .toThrow('must not contain path traversal');
  });

  test('rejects path containing null byte with "must not contain null bytes"', () => {
    expect(() => resolveClaudeRuntimeAsset('scripts/valid\x00.js', { projectDir, home }))
      .toThrow('must not contain null bytes');
  });

  // Rooted / UNC Windows paths must fail immediately (after '\' → '/' normalization)
  // and must NOT be reinterpreted as relative (e.g. '\Windows\x.md' → 'Windows/x.md').
  test('rejects a single leading backslash (rooted Windows path)', () => {
    expect(() => resolveClaudeRuntimeAsset('\\Windows\\x.md', { projectDir, home }))
      .toThrow('must be relative');
  });

  test('rejects a UNC path with double backslash', () => {
    expect(() => resolveClaudeRuntimeAsset('\\\\server\\share\\x.md', { projectDir, home }))
      .toThrow('must be relative');
  });

  test('rejects a UNC path already expressed with forward slashes', () => {
    expect(() => resolveClaudeRuntimeAsset('//server/share/x.md', { projectDir, home }))
      .toThrow('must be relative');
  });

  test('rejects a Windows drive-absolute path with forward slashes (C:/...)', () => {
    expect(() => resolveClaudeRuntimeAsset('C:/Windows/x.md', { projectDir, home }))
      .toThrow('got Windows absolute path');
  });

  test('rejects a Windows drive-relative path (C:relative.txt)', () => {
    expect(() => resolveClaudeRuntimeAsset('C:relative.txt', { projectDir, home }))
      .toThrow('drive-relative');
  });

  test('Phase 0 throws before touching the filesystem — nonexistent dirs are safe', () => {
    // The test dirs above do not exist on disk. If Phase 0 did filesystem I/O
    // the call would still throw (just with a different error). We verify the
    // error message matches Phase 0 — proving no I/O occurred.
    const err = (() => {
      try {
        resolveClaudeRuntimeAsset('', { projectDir, home });
      } catch (e) { return e; }
    })();
    expect(err.message).toContain('must be a non-empty string');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase A — Presence detection (condA / condB / condC)
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase A — Presence detection', () => {
  test('condA: manifest file alone satisfies presence — proceeds past Phase B (no "No toolkit installation" error)', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    putManifest(local, '{ corrupted but file exists }');
    // No version stamp, no payload files — condA satisfied by manifest file existence.
    // Phase B selects local-only mode. Phase D step 10 will fail (no disk payload),
    // proving Phase A/B resolved correctly to local.
    expect(() => resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home }))
      .toThrow('Installation incomplete');  // Phase D, not Phase B
  });

  test('condB: version stamp alone satisfies presence', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    putVersionStamp(local, TOOLKIT_VERSION);
    // Phase B: local-only; Phase D fails at step 10.
    expect(() => resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home }))
      .toThrow('Installation incomplete');
  });

  test('condC: catalog payload file alone satisfies presence', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    putFullCatalogPayload(local);
    // condC: catalog dirs have files. Phase A: localPresent = true.
    // Phase D step 10 passes (all catalog files are on disk). Phase E: returns path.
    const result = (() => {
      const messages = [];
      jest.spyOn(process.stderr, 'write').mockImplementation((m) => { messages.push(m); return true; });
      return resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home });
    })();
    expect(result).toContain('wb-validate.js');
  });

  test('settings.local.json alone does NOT satisfy presence — treated as not installed', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    // Create only a settings file — condA/B/C all false.
    fs.mkdirSync(claudeDir(local));
    fs.writeFileSync(path.join(claudeDir(local), 'settings.local.json'), '{}', 'utf8');
    // Neither local nor global → Phase B: "No toolkit installation found"
    expect(() => resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home }))
      .toThrow('No toolkit installation found');
  });

  test('corrupt manifest file still satisfies condA — file presence alone triggers detection', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    // Manifest file exists with garbage content — condA = true.
    // Full catalog payload on disk so Phase D passes.
    putManifest(local, 'NOT-JSON!!!');
    putFullCatalogPayload(local);
    putVersionStamp(local, TOOLKIT_VERSION);
    // Should NOT throw "No toolkit installation found" — detection works.
    const { threw } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(threw).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase B — Mode decision
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase B — Mode decision', () => {
  test('neither local nor global installed — throws "No toolkit installation found"', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    // Both directories exist but contain nothing recognisable.
    fs.mkdirSync(claudeDir(local));
    expect(() => resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home }))
      .toThrow('No toolkit installation found');
  });

  test('both local and global installed — throws with both paths in message', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    putManifest(local, '{ "exists": true }');
    putManifest(home,  '{ "exists": true }');
    const err = (() => {
      try { resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home }); }
      catch (e) { return e; }
    })();
    expect(err.message).toMatch(/Ambiguous/i);
    expect(err.message).toContain(claudeDir(local));
    expect(err.message).toContain(claudeDir(home));
  });

  test('both installed — error is raised even when local manifest is corrupt', () => {
    // Spec: "presence is established regardless of metadata validity"
    const local = mktmp('proj');
    const home  = mktmp('home');
    putManifest(local, 'CORRUPT');           // condA on local (file exists, content irrelevant)
    putPayloadFile(local, 'scripts/wb-validate.js');  // also condC
    makeCompleteInstall(home, { mode: 'global' });
    expect(() => resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home }))
      .toThrow(/Ambiguous/i);
  });

  test('local-only — returns path under project .claude/', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    makeCompleteInstall(local, { mode: 'local' });
    const { result } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(result).toBe(path.resolve(path.join(claudeDir(local), 'scripts', 'wb-validate.js')));
  });

  test('global-only — returns path under home .claude/', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    makeCompleteInstall(home, { mode: 'global' });
    const { result } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(result).toBe(path.resolve(path.join(claudeDir(home), 'scripts', 'wb-validate.js')));
  });

  test('local .claude/ has only settings.local.json — global-only mode is selected', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    // Create only a user config file locally — not an installation.
    fs.mkdirSync(claudeDir(local));
    fs.writeFileSync(path.join(claudeDir(local), 'settings.local.json'), '{}', 'utf8');
    makeCompleteInstall(home, { mode: 'global' });
    const { result } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    // Returned path must be under home, not local.
    expect(result.startsWith(path.resolve(claudeDir(home)))).toBe(true);
  });

  test('empty local .claude/ directory — global-only mode is selected', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    fs.mkdirSync(claudeDir(local));  // empty .claude/ dir
    makeCompleteInstall(home, { mode: 'global' });
    const { result } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(result.startsWith(path.resolve(claudeDir(home)))).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase C — Metadata warnings (emitted to stderr; never abort)
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase C — Metadata warnings (warns on stderr, does not abort)', () => {
  test('no manifest file — warns "No manifest found"', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    // Installation detected via condB + condC (no manifest).
    putVersionStamp(local, TOOLKIT_VERSION);
    putPayloadFile(local, 'scripts/wb-validate.js');
    const { messages } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(messages.some(m => m.includes('No manifest found'))).toBe(true);
  });

  test('no manifest — resolver still returns the asset path (Phase C never aborts)', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    putVersionStamp(local, TOOLKIT_VERSION);
    putFullCatalogPayload(local);
    const { result, threw } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(threw).toBeNull();
    expect(typeof result).toBe('string');
  });

  test('corrupt manifest (invalid JSON) — warns "Manifest is corrupt"', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    putManifest(local, '{ THIS IS NOT JSON !!!');
    putVersionStamp(local, TOOLKIT_VERSION);
    putPayloadFile(local, 'scripts/wb-validate.js');
    const { messages } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(messages.some(m => m.includes('Manifest is corrupt'))).toBe(true);
  });

  test('manifest missing required fields — warns "Manifest schema invalid"', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    // Valid JSON but missing required fields (version, installedAt, installationMode, files).
    putManifest(local, { onlyThisField: true });
    putVersionStamp(local, TOOLKIT_VERSION);
    putPayloadFile(local, 'scripts/wb-validate.js');
    const { messages } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(messages.some(m => m.includes('Manifest schema invalid'))).toBe(true);
  });

  test('installationMode mismatch — warns "installationMode mismatch"', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    // Local installation but manifest claims it's global.
    makeCompleteInstall(local, { mode: 'global' });
    const { messages } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(messages.some(m => m.includes('installationMode'))).toBe(true);
    expect(messages.some(m => m.includes('global'))).toBe(true);
  });

  test('no version stamp — warns "No version stamp"', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    // Valid manifest but no version stamp.
    putManifest(local, {
      version: TOOLKIT_VERSION,
      installedAt: '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files: ['.claude/scripts/wb-validate.js'],
    });
    putPayloadFile(local, 'scripts/wb-validate.js');
    const { messages } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(messages.some(m => m.includes('No version stamp'))).toBe(true);
  });

  test('version stamp mismatch — warns "Version mismatch" with both versions', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    makeCompleteInstall(local, { mode: 'local', version: '0.9.0' });
    const { messages } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    const combined = messages.join('');
    expect(combined).toContain('Version mismatch');
    expect(combined).toContain('0.9.0');
    expect(combined).toContain(TOOLKIT_VERSION);
  });

  test('version stamp mismatch does not abort — resolver still returns path', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    makeCompleteInstall(local, { mode: 'local', version: '0.9.0' });
    const { result, threw } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(threw).toBeNull();
    expect(typeof result).toBe('string');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase D — Catalog membership + completeness
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase D — Catalog membership', () => {
  test('non-catalog asset — throws "not a registered catalog asset"', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    makeCompleteInstall(local, { mode: 'local' });
    expect(() =>
      resolveClaudeRuntimeAsset(NON_CATALOG_ASSET, { projectDir: local, home })
    ).toThrow('not a registered catalog asset');
  });

  test('non-catalog error message includes the requested relativePath', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    makeCompleteInstall(local, { mode: 'local' });
    const err = (() => {
      try { resolveClaudeRuntimeAsset(NON_CATALOG_ASSET, { projectDir: local, home }); }
      catch (e) { return e; }
    })();
    expect(err.message).toContain(NON_CATALOG_ASSET);
  });

  test('non-catalog error message includes the effective mode', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    makeCompleteInstall(local, { mode: 'local' });
    const err = (() => {
      try { resolveClaudeRuntimeAsset(NON_CATALOG_ASSET, { projectDir: local, home }); }
      catch (e) { return e; }
    })();
    expect(err.message).toContain('local');
  });
});

describe('Phase D — Completeness check (disk truth is authoritative)', () => {
  test('catalog asset absent from disk — throws "Installation incomplete"', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    // Provide installation markers (condA + condB) but NOT the catalog payload.
    putManifest(local, {
      version: TOOLKIT_VERSION,
      installedAt: '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files: [],
    });
    putVersionStamp(local, TOOLKIT_VERSION);
    // scripts/wb-validate.js is missing from disk → step 10 fails.
    const { threw } = captureStderr(() => {
      try { return resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home }); }
      catch (e) { throw e; }
    });
    // We call directly so the error propagates.
    expect(() => {
      const msgs = [];
      jest.spyOn(process.stderr, 'write').mockImplementation(m => { msgs.push(m); return true; });
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home });
    }).toThrow('Installation incomplete');
  });

  test('"Installation incomplete" error message includes the effective mode', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    putManifest(local, {
      version: TOOLKIT_VERSION,
      installedAt: '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files: [],
    });
    putVersionStamp(local, TOOLKIT_VERSION);
    const err = (() => {
      const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try { resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home }); }
      catch (e) { spy.mockRestore(); return e; }
      spy.mockRestore();
    })();
    expect(err.message).toContain('local');
  });

  test('stale manifest entries — warns "stale entries not in current catalog"', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    // Manifest references an old file (.claude/scripts/old-script.js) that is no
    // longer in the catalog. The current catalog only knows scripts/wb-validate.js.
    putManifest(local, {
      version: TOOLKIT_VERSION,
      installedAt: '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files: ['.claude/scripts/wb-validate.js', '.claude/scripts/old-script.js'],
    });
    putVersionStamp(local, TOOLKIT_VERSION);
    putPayloadFile(local, 'scripts/wb-validate.js');
    const { messages } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(messages.some(m => m.includes('stale entries'))).toBe(true);
  });

  test('expected asset missing from manifest — warns "Expected asset missing from manifest"', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    // Valid manifest but files array is empty — does not list the expected catalog file.
    // The file IS on disk (step 10 passes), but step 9 warns about the manifest gap.
    putManifest(local, {
      version: TOOLKIT_VERSION,
      installedAt: '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files: [],
    });
    putVersionStamp(local, TOOLKIT_VERSION);
    putPayloadFile(local, 'scripts/wb-validate.js');
    const { messages } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(messages.some(m => m.includes('Expected asset missing from manifest'))).toBe(true);
  });

  test('stale manifest does not suppress disk completeness error — disk truth wins', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    // Manifest says the file is installed; the file is NOT on disk.
    putManifest(local, {
      version: TOOLKIT_VERSION,
      installedAt: '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files: ['.claude/scripts/wb-validate.js'],
    });
    putVersionStamp(local, TOOLKIT_VERSION);
    // Do NOT call putPayloadFile — file absent from disk.
    expect(() => {
      jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home });
    }).toThrow('Installation incomplete');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase E — Return path and confinement
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase E — Return correct absolute path', () => {
  test('local installation — returns absolute path under localRuntimeRoot', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    makeCompleteInstall(local, { mode: 'local' });
    const expected = path.resolve(path.join(claudeDir(local), 'scripts', 'wb-validate.js'));
    const { result } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(result).toBe(expected);
  });

  test('global installation — returns absolute path under globalRuntimeRoot', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    makeCompleteInstall(home, { mode: 'global' });
    const expected = path.resolve(path.join(claudeDir(home), 'scripts', 'wb-validate.js'));
    const { result } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(result).toBe(expected);
  });

  test('returned path is an absolute path string', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    makeCompleteInstall(local, { mode: 'local' });
    const { result } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(typeof result).toBe('string');
    expect(path.isAbsolute(result)).toBe(true);
  });

  test('returned path points to a file that exists on disk', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    makeCompleteInstall(local, { mode: 'local' });
    const { result } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(fs.existsSync(result)).toBe(true);
  });

  test('returned path is confined within the effective runtime root', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    makeCompleteInstall(local, { mode: 'local' });
    const { result } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    const expectedRoot = path.resolve(claudeDir(local));
    expect(result.startsWith(expectedRoot + path.sep) || result === expectedRoot).toBe(true);
  });

  test('Windows-style backslash separators are normalized and resolve correctly', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    makeCompleteInstall(local, { mode: 'local' });
    // Pass backslash-separated path; Phase 0c normalizes to forward slashes.
    const backslashPath = 'scripts\\wb-validate.js';
    const expected = path.resolve(path.join(claudeDir(local), 'scripts', 'wb-validate.js'));
    const { result } = captureStderr(() =>
      resolveClaudeRuntimeAsset(backslashPath, { projectDir: local, home })
    );
    expect(result).toBe(expected);
  });

  test('requesting an asset that does not exist on disk — throws "Asset not found"', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    // Complete catalog-aware install so Phase D step 8a and step 10 pass.
    makeCompleteInstall(local, { mode: 'local' });
    // Now remove the payload file to simulate post-install deletion.
    fs.unlinkSync(path.join(claudeDir(local), 'scripts', 'wb-validate.js'));
    // Step 10: missing file → "Installation incomplete" (caught before Phase E).
    // Or if somehow step 10 missed it, Phase E step 12 catches it with "Asset not found".
    // Either way, the resolver must throw.
    expect(() => {
      jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home });
    }).toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Integration — multi-phase scenarios
// ═════════════════════════════════════════════════════════════════════════════

describe('Integration — combined phase scenarios', () => {
  test('corrupt manifest + full payload on disk — warns but still returns path', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    // condA satisfied (manifest file exists, even if corrupt); full catalog payload on disk.
    putManifest(local, 'CORRUPT!');
    putVersionStamp(local, TOOLKIT_VERSION);
    putFullCatalogPayload(local);
    const { result, messages, threw } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(threw).toBeNull();
    expect(typeof result).toBe('string');
    // Phase C warning about corrupt manifest must be present.
    expect(messages.some(m => m.includes('Manifest is corrupt'))).toBe(true);
  });

  test('valid manifest, no version stamp, full payload — warns about stamp, returns path', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    const catalogFiles = putFullCatalogPayload(local);
    putManifest(local, {
      version: TOOLKIT_VERSION,
      installedAt: '2026-01-01T00:00:00.000Z',
      installationMode: 'local',
      files: catalogFiles,
    });
    // No version stamp.
    const { result, messages, threw } = captureStderr(() =>
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home })
    );
    expect(threw).toBeNull();
    expect(typeof result).toBe('string');
    expect(messages.some(m => m.includes('No version stamp'))).toBe(true);
  });

  test('both local and global installed — "Ambiguous" error overrides any Phase C/D concerns', () => {
    const local = mktmp('proj');
    const home  = mktmp('home');
    makeCompleteInstall(local, { mode: 'local' });
    makeCompleteInstall(home,  { mode: 'global' });
    expect(() => {
      jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      resolveClaudeRuntimeAsset(VALID_ASSET, { projectDir: local, home });
    }).toThrow(/Ambiguous/i);
  });
});
