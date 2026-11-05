'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const LIB = require('../../src/claude/scripts/feature-split');
const FACADE = path.join(__dirname, '..', '..', 'src', 'claude', 'scripts', 'feature-split.js');
const {
  FeatureSplitError,
  loadConfig,
  slug,
  firstSentence,
  readRegistry,
  writeRegistryAtomic,
  assertNoStagingLeftovers,
  findStagingLeftovers,
} = LIB;

/** Runs fn and returns the thrown value, or fails the test if nothing is thrown. */
function thrownBy(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected the function to throw');
}

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-test-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('FeatureSplitError', () => {
  test('exposes code, key and file from the constructor details', () => {
    const err = new FeatureSplitError('CONFIG_INVALID', 'bad value', {
      key: 'thresholds.useCases',
      file: 'feature-split.config.json',
    });

    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('CONFIG_INVALID');
    expect(err.key).toBe('thresholds.useCases');
    expect(err.file).toBe('feature-split.config.json');
  });

  test('defaults key and file to null when details are omitted', () => {
    const err = new FeatureSplitError('REGISTRY_IO', 'cannot read');

    expect(err.key).toBeNull();
    expect(err.file).toBeNull();
  });
});

describe('slug rule', () => {
  test('rejects an empty name with INVALID_NAME', () => {
    const err = thrownBy(() => slug('   '));

    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.code).toBe('INVALID_NAME');
  });

  test('rejects a name containing a path separator with INVALID_NAME', () => {
    const err = thrownBy(() => slug('a/b'));

    expect(err.code).toBe('INVALID_NAME');
  });

  test('rejects a name containing ".." with INVALID_NAME', () => {
    const err = thrownBy(() => slug('../escape'));

    expect(err.code).toBe('INVALID_NAME');
  });

  test('rejects a Windows reserved device name with INVALID_NAME', () => {
    const err = thrownBy(() => slug('CON'));

    expect(err.code).toBe('INVALID_NAME');
  });

  test('rejects a reserved device name even with an extension', () => {
    const err = thrownBy(() => slug('lpt9.txt'));

    expect(err.code).toBe('INVALID_NAME');
  });

  test('lowercases and hyphenates a valid name', () => {
    expect(slug('Auth Sessions')).toBe('auth-sessions');
  });
});

describe('firstSentence()', () => {
  test('returns text up to and including the first period followed by whitespace', () => {
    expect(firstSentence('Does one thing. Then another.')).toBe('Does one thing.');
  });

  test('does not split on a period that is not followed by whitespace', () => {
    expect(firstSentence('Version 1.2 is out. Next.')).toBe('Version 1.2 is out.');
  });

  test('returns the whole text when there is no sentence-ending period', () => {
    expect(firstSentence('No terminator here')).toBe('No terminator here');
  });
});

describe('registry read', () => {
  test('returns an empty registry when REGISTRY.md is missing', () => {
    const registry = readRegistry(root);

    expect(registry.exists).toBe(false);
    expect(registry.entries).toEqual([]);
  });

  test('returns an empty registry with exists true when REGISTRY.md has no entries', () => {
    fs.writeFileSync(path.join(root, 'REGISTRY.md'), '# Registry\n', 'utf8');

    const registry = readRegistry(root);

    expect(registry.exists).toBe(true);
    expect(registry.entries).toEqual([]);
  });

  test('parses the id and title from the entry heading', () => {
    writeRegistry(root, sampleEntry());

    const [entry] = readRegistry(root).entries;

    expect(entry.id).toBe('FTR-001');
    expect(entry.title).toBe('Sample feature');
  });

  test('parses the Keywords field into a list', () => {
    writeRegistry(root, sampleEntry());

    const [entry] = readRegistry(root).entries;

    expect(entry.keywords).toEqual(['auth', 'login']);
  });

  test('parses the Status field', () => {
    writeRegistry(root, sampleEntry());

    const [entry] = readRegistry(root).entries;

    expect(entry.status).toBe('defined');
  });

  test('parses the Summary field', () => {
    writeRegistry(root, sampleEntry());

    const [entry] = readRegistry(root).entries;

    expect(entry.summary).toBe('Does one thing.');
  });

  test('parses the Parent field', () => {
    writeRegistry(root, sampleEntry());

    const [entry] = readRegistry(root).entries;

    expect(entry.parent).toBe('FTR-000');
  });

  test('parses the Depends on field into a list', () => {
    writeRegistry(root, sampleEntry());

    const [entry] = readRegistry(root).entries;

    expect(entry.dependsOn).toEqual(['FTR-002', 'FTR-003']);
  });

  test('parses the Detail link target', () => {
    writeRegistry(root, sampleEntry());

    const [entry] = readRegistry(root).entries;

    expect(entry.detail).toBe('FTR-001-sample/feature.md');
  });

  test('throws REGISTRY_IO when REGISTRY.md exists but cannot be read', () => {
    // A directory at the registry path makes readFileSync fail with a non-ENOENT error.
    fs.mkdirSync(path.join(root, 'REGISTRY.md'));

    const err = thrownBy(() => readRegistry(root));

    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.code).toBe('REGISTRY_IO');
  });
});

describe('registry write', () => {
  test('replaces REGISTRY.md with the new content', () => {
    fs.writeFileSync(path.join(root, 'REGISTRY.md'), 'old\n', 'utf8');

    writeRegistryAtomic(root, 'abc123', 'new\n');

    expect(fs.readFileSync(path.join(root, 'REGISTRY.md'), 'utf8')).toBe('new\n');
  });

  test('leaves no REGISTRY.md.tmp-<run id> file after a successful write', () => {
    writeRegistryAtomic(root, 'abc123', 'new\n');

    expect(fs.existsSync(path.join(root, 'REGISTRY.md.tmp-abc123'))).toBe(false);
  });

  test('keeps the previous registry intact and throws REGISTRY_IO when the temp file cannot be created', () => {
    fs.writeFileSync(path.join(root, 'REGISTRY.md'), 'previous\n', 'utf8');
    // Occupying the temp path makes the exclusive-create write fail.
    fs.mkdirSync(path.join(root, 'REGISTRY.md.tmp-abc123'));

    const err = thrownBy(() => writeRegistryAtomic(root, 'abc123', 'new\n'));

    expect(err.code).toBe('REGISTRY_IO');
    expect(fs.readFileSync(path.join(root, 'REGISTRY.md'), 'utf8')).toBe('previous\n');
  });

  test('throws REGISTRY_IO when the features root directory does not exist', () => {
    const missing = path.join(root, 'does-not-exist');

    const err = thrownBy(() => writeRegistryAtomic(missing, 'abc123', 'new\n'));

    expect(err.code).toBe('REGISTRY_IO');
  });
});

describe('staging leftover scan', () => {
  test('returns no leftovers for a clean features root', () => {
    expect(findStagingLeftovers(root)).toEqual([]);
  });

  test('throws STAGING_LEFTOVER listing a planted .split-staging-* directory and REGISTRY.md.tmp-* file', () => {
    const stagingDir = path.join(root, '.split-staging-abc');
    const tempFile = path.join(root, 'REGISTRY.md.tmp-abc');
    fs.mkdirSync(stagingDir);
    fs.writeFileSync(tempFile, 'partial', 'utf8');

    const err = thrownBy(() => assertNoStagingLeftovers(root));

    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.code).toBe('STAGING_LEFTOVER');
    expect(err.message).toContain(stagingDir);
    expect(err.message).toContain(tempFile);
  });

  test('removes nothing when leftovers are found', () => {
    const stagingDir = path.join(root, '.split-staging-abc');
    const tempFile = path.join(root, 'REGISTRY.md.tmp-abc');
    fs.mkdirSync(stagingDir);
    fs.writeFileSync(tempFile, 'partial', 'utf8');

    thrownBy(() => assertNoStagingLeftovers(root));

    expect(fs.existsSync(stagingDir)).toBe(true);
    expect(fs.existsSync(tempFile)).toBe(true);
  });

  test('does not throw when no staging paths are present', () => {
    fs.mkdirSync(path.join(root, 'FTR-001-sample'));

    expect(() => assertNoStagingLeftovers(root)).not.toThrow();
  });
});

describe('facade stdout and exit code contract', () => {
  test('an unknown command exits with status 1', () => {
    const result = runFacade(['no-such-command']);

    expect(result.status).toBe(1);
  });

  test('an unknown command prints exactly one JSON object on stdout', () => {
    const result = runFacade(['no-such-command']);

    const lines = result.stdout.trim().split(/\r?\n/);
    expect(lines).toHaveLength(1);
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });

  test('a failure prints an error object with code, key, file and message', () => {
    const result = runFacade(['no-such-command']);

    const out = JSON.parse(result.stdout);
    expect(Object.keys(out)).toEqual(['error']);
    expect(Object.keys(out.error).sort()).toEqual(['code', 'file', 'key', 'message']);
    expect(out.error.code).toEqual(expect.any(String));
    expect(out.error.message).toEqual(expect.any(String));
  });
});

describe('loadConfig', () => {
  const DEFAULTS = {
    thresholds: { useCases: 8, acceptanceCriteria: 15, components: 30, estimatedPhases: 6 },
    definitionSignals: { minActors: 2, minApplications: 2, minFlows: 3 },
    minChildren: 2,
  };
  let otherRoot;

  const overridePath = () => path.join(root, 'feature-split.config.json');
  const writeOverride = (obj) => fs.writeFileSync(overridePath(), JSON.stringify(obj), 'utf8');

  beforeEach(() => {
    otherRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-cfg-other-'));
  });

  afterEach(() => {
    fs.rmSync(otherRoot, { recursive: true, force: true });
  });

  test('returns exactly the default shape when no override exists', () => {
    expect(loadConfig({ projectRoot: root })).toEqual(DEFAULTS);
  });

  test('keeps every default that a subset override does not mention', () => {
    writeOverride({ thresholds: { useCases: 5 } });

    const cfg = loadConfig({ projectRoot: root });

    expect(cfg.thresholds).toEqual({ useCases: 5, acceptanceCriteria: 15, components: 30, estimatedPhases: 6 });
    expect(cfg.definitionSignals).toEqual(DEFAULTS.definitionSignals);
    expect(cfg.minChildren).toBe(2);
  });

  test('treats an absent override file as no error', () => {
    expect(fs.existsSync(overridePath())).toBe(false);

    expect(() => loadConfig({ projectRoot: root })).not.toThrow();
  });

  test('throws CONFIG_INVALID_VALUE naming the key for a non-integer threshold', () => {
    writeOverride({ thresholds: { useCases: 1.5 } });

    const err = thrownBy(() => loadConfig({ projectRoot: root }));

    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.code).toBe('CONFIG_INVALID_VALUE');
    expect(err.key).toBe('thresholds.useCases');
  });

  test('throws CONFIG_INVALID_VALUE naming the key for a string threshold', () => {
    writeOverride({ thresholds: { useCases: '8' } });

    const err = thrownBy(() => loadConfig({ projectRoot: root }));

    expect(err.code).toBe('CONFIG_INVALID_VALUE');
    expect(err.key).toBe('thresholds.useCases');
  });

  test('throws CONFIG_INVALID_VALUE naming the key for a negative minChildren', () => {
    writeOverride({ minChildren: -1 });

    const err = thrownBy(() => loadConfig({ projectRoot: root }));

    expect(err.code).toBe('CONFIG_INVALID_VALUE');
    expect(err.key).toBe('minChildren');
  });

  test('throws CONFIG_UNKNOWN_KEY naming the key for an unknown nested key', () => {
    writeOverride({ thresholds: { foo: 1 } });

    const err = thrownBy(() => loadConfig({ projectRoot: root }));

    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.code).toBe('CONFIG_UNKNOWN_KEY');
    expect(err.key).toBe('thresholds.foo');
  });

  test('rejects a malformed override with CONFIG_INVALID_JSON, naming the file and a null key', () => {
    fs.writeFileSync(overridePath(), '{ not json', 'utf8');

    const err = thrownBy(() => loadConfig({ projectRoot: root }));

    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.code).toBe('CONFIG_INVALID_JSON');
    expect(err.file).toBe(overridePath());
    expect(err.key).toBeNull();
  });

  test('rejects an unreadable override with CONFIG_OVERRIDE_UNREADABLE, naming the file and a null key', () => {
    // A directory at the override path makes readFileSync fail with a non-ENOENT error.
    fs.mkdirSync(overridePath());

    const err = thrownBy(() => loadConfig({ projectRoot: root }));

    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.code).toBe('CONFIG_OVERRIDE_UNREADABLE');
    expect(err.file).toBe(overridePath());
    expect(err.key).toBeNull();
  });

  test('reads the override only from the projectRoot argument', () => {
    writeOverride({ minChildren: 4 });

    expect(loadConfig({ projectRoot: root }).minChildren).toBe(4);
    expect(loadConfig({ projectRoot: otherRoot })).toEqual(DEFAULTS);
  });
});

// ---------- helpers ----------

function runFacade(args) {
  return spawnSync(process.execPath, [FACADE, ...args], { encoding: 'utf8' });
}

function sampleEntry() {
  return [
    '## FTR-001 — Sample feature',
    '**Keywords:** auth, login',
    '**Status:** defined',
    '**Summary:** Does one thing.',
    '**Parent:** FTR-000',
    '**Depends on:** FTR-002, FTR-003',
    '→ [Detail](FTR-001-sample/feature.md)',
    '---',
    '',
  ].join('\n');
}

function writeRegistry(dir, content) {
  fs.writeFileSync(path.join(dir, 'REGISTRY.md'), content, 'utf8');
}
