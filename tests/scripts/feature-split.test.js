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
  isOverThreshold,
  meetsMinimum,
  isNewFeature,
  buildProposal,
  apply,
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

describe('threshold comparison boundaries', () => {
  describe('isOverThreshold() — strictly greater than threshold', () => {
    test('returns false when count equals the threshold', () => {
      expect(isOverThreshold(30, 30)).toBe(false);
    });

    test('returns true when count is one above the threshold', () => {
      expect(isOverThreshold(31, 30)).toBe(true);
    });
  });

  describe('meetsMinimum() — at least the minimum', () => {
    test('returns true when count equals the minimum', () => {
      expect(meetsMinimum(2, 2)).toBe(true);
    });

    test('returns false when count is one below the minimum', () => {
      expect(meetsMinimum(1, 2)).toBe(false);
    });
  });
});

describe('isNewFeature()', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-newfeat-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  // Folder basename is the feature prefix, e.g. FTR-035 -> FTR-035-Approvals.md
  const makeFeatureDir = (id) => {
    const dir = path.join(tmpRoot, id);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };

  test.each([
    ['an Approvals.md marker file', (dir, id) =>
      fs.writeFileSync(path.join(dir, `${id}-Approvals.md`), '# approvals')],
    ['a wbs/ directory', (dir) =>
      fs.mkdirSync(path.join(dir, 'wbs'))],
    ['an epic.md file', (dir) =>
      fs.writeFileSync(path.join(dir, 'epic.md'), '# epic')],
  ])('returns isNew false with a non-empty reason when the folder holds %s', (_label, addMarker) => {
    const id = 'FTR-035';
    const dir = makeFeatureDir(id);
    addMarker(dir, id);

    const result = isNewFeature(dir);

    expect(result.isNew).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test('returns isNew true with a non-empty reason when the folder holds only req/ and spec/', () => {
    const dir = makeFeatureDir('FTR-035');
    fs.mkdirSync(path.join(dir, 'req'));
    fs.mkdirSync(path.join(dir, 'spec'));

    const result = isNewFeature(dir);

    expect(result.isNew).toBe(true);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test('returns isNew true when req/ and spec/ files were rewritten by a forced regeneration', () => {
    const dir = makeFeatureDir('FTR-035');
    const reqFile = path.join(dir, 'req', 'FTR-035-Requirements.md');
    const specFile = path.join(dir, 'spec', 'index.md');
    fs.mkdirSync(path.dirname(reqFile));
    fs.mkdirSync(path.dirname(specFile));
    fs.writeFileSync(reqFile, 'first generation');
    fs.writeFileSync(specFile, 'first generation');
    fs.writeFileSync(reqFile, 'forced regeneration');
    fs.writeFileSync(specFile, 'forced regeneration');

    const result = isNewFeature(dir);

    expect(result.isNew).toBe(true);
  });

  test('returns isNew true with a non-empty reason when the feature folder does not exist', () => {
    const missing = path.join(tmpRoot, 'FTR-999');

    const result = isNewFeature(missing);

    expect(result.isNew).toBe(true);
    expect(result.reason.length).toBeGreaterThan(0);
  });
});

describe('isNewFeature() on an existing but unreadable folder', () => {
  let tmpRoot;
  let featureDir;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-test-'));
    featureDir = path.join(tmpRoot, 'FTR-901-locked');
    fs.mkdirSync(path.join(featureDir, 'req'), { recursive: true });
    fs.writeFileSync(path.join(featureDir, 'req', 'requirements.md'), '# req');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('throws FEATURE_UNREADABLE and never returns isNew true when reading the folder fails with EACCES', () => {
    const realReaddirSync = fs.readdirSync;
    const target = path.resolve(featureDir);
    jest.spyOn(fs, 'readdirSync').mockImplementation((p, ...rest) => {
      if (path.resolve(String(p)) === target) {
        const err = new Error(`EACCES: permission denied, scandir '${p}'`);
        err.code = 'EACCES';
        throw err;
      }
      return realReaddirSync(p, ...rest);
    });

    let thrown = null;
    let result;
    try {
      result = isNewFeature(featureDir);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(FeatureSplitError);
    expect(thrown.code).toBe('FEATURE_UNREADABLE');
    expect(result).toBeUndefined();
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

describe('foundationWarnings()', () => {
  const chain = [
    { name: 'Auth', dependsOn: [] },
    { name: 'Billing', dependsOn: ['Auth'] },
    { name: 'Reports', dependsOn: ['Billing'] },
  ];

  test('returns no warning when the owner is the first child and every later child depends on it', () => {
    expect(LIB.foundationWarnings({ sharedFoundationOwner: 'Auth' }, chain)).toEqual([]);
  });

  test('returns a FOUNDATION_NOT_FIRST warning naming BR-03 when the owner is not the first child', () => {
    const warnings = LIB.foundationWarnings({ sharedFoundationOwner: 'Billing' }, chain);
    expect(warnings.map(w => w.code)).toEqual(['FOUNDATION_NOT_FIRST']);
    expect(warnings[0].message).toMatch(/BR-03/);
  });

  test('returns a FOUNDATION_NOT_FIRST warning when the owner is null', () => {
    const warnings = LIB.foundationWarnings({ sharedFoundationOwner: null }, chain);
    expect(warnings.map(w => w.code)).toEqual(['FOUNDATION_NOT_FIRST']);
  });

  test('returns an empty list when there are no children and never throws', () => {
    expect(LIB.foundationWarnings({ sharedFoundationOwner: 'Auth' }, [])).toEqual([]);
    expect(LIB.foundationWarnings({ sharedFoundationOwner: 'Auth' }, undefined)).toEqual([]);
  });

  test('returns no warning for an owner that is first even when later children have no dependsOn', () => {
    const order = [{ name: 'Auth', dependsOn: [] }, { name: 'Billing', dependsOn: [] }];
    expect(LIB.foundationWarnings({ sharedFoundationOwner: 'Auth' }, order)).toEqual([]);
  });
});

describe('buildProposal()', () => {
  const listTree = (dir) => fs.readdirSync(dir, { recursive: true }).sort();
  const child = (name, extra = {}) => ({
    name,
    purpose: `${name} purpose`,
    keywords: [name.toLowerCase()],
    dependsOn: [],
    assigned: 'UC-01',
    ...extra,
  });
  // buildProposal takes a loaded config; a project override is read by loadConfig, not by buildProposal.
  const build = (children, extra = {}) =>
    buildProposal({ source: 'definition', children, config: loadConfig({ projectRoot: root }), ...extra });

  test('returns the D-08 proposal shape with minChildren 2 from the default config', () => {
    const { proposal } = build([child('Auth'), child('Billing')]);

    expect(Object.keys(proposal).sort())
      .toEqual(['children', 'foundationNote', 'minChildren', 'sharedFoundationOwner', 'source']);
    expect(proposal.minChildren).toBe(2);
    expect(proposal.source).toBe('definition');
  });

  test('uses minChildren from the loaded project override instead of the default', () => {
    fs.writeFileSync(path.join(root, 'feature-split.config.json'), JSON.stringify({ minChildren: 3 }));

    const err = thrownBy(() => build([child('Auth'), child('Billing')]));

    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.code).toBe('TOO_FEW_CHILDREN');
  });

  test('sets summary equal to purpose and keeps the caller keywords', () => {
    const { proposal } = build([
      child('Auth', { purpose: 'Sign-in and sessions', keywords: ['auth', 'login'] }),
      child('Billing'),
    ]);

    expect(proposal.children[0].summary).toBe('Sign-in and sessions');
    expect(proposal.children[0].keywords).toEqual(['auth', 'login']);
  });

  test('rejects a reserved device name and names the child in the message', () => {
    const err = thrownBy(() => build([child('CON'), child('Billing')]));

    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.code).toBe('CHILD_NAME_INVALID');
    expect(err.message).toMatch(/CON/);
  });

  test('rejects a duplicate slug and names the child in the message', () => {
    const err = thrownBy(() => build([child('Auth'), child('Auth')]));

    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.code).toBe('CHILD_NAME_DUPLICATE');
    expect(err.message).toMatch(/Auth/);
  });

  test('rejects a proposal with fewer children than minChildren', () => {
    const err = thrownBy(() => build([child('Auth')]));

    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.code).toBe('TOO_FEW_CHILDREN');
  });

  test('rejects a dependency cycle', () => {
    const err = thrownBy(() => build([
      child('Auth', { dependsOn: ['Billing'] }),
      child('Billing', { dependsOn: ['Auth'] }),
    ]));

    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.code).toBe('PROPOSAL_CYCLE');
  });

  test('writes no files under the project root', () => {
    const before = listTree(root);

    build([child('Auth'), child('Billing')]);

    expect(listTree(root)).toEqual(before);
  });
});

describe('dependency order through buildProposal', () => {
  const child = (name, dependsOn = []) => ({
    name,
    purpose: `${name} purpose`,
    keywords: [name.toLowerCase()],
    dependsOn,
    assigned: `UC-${name}`,
  });
  const build = (children) => buildProposal({
    source: 'definition',
    children,
    config: loadConfig({ projectRoot: root }),
  });

  test('children with no dependsOn keep their proposal order', () => {
    const { proposal } = build([child('Alpha'), child('Bravo'), child('Charlie')]);

    expect(proposal.children.map(c => c.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  test('the first child in proposal order is the default shared-foundation owner when no dependsOn is set', () => {
    const { proposal } = build([child('Alpha'), child('Bravo'), child('Charlie')]);

    expect(proposal.sharedFoundationOwner).toBe('Alpha');
  });

  test('a dependsOn chain reorders children ahead of a dependent child listed first', () => {
    const { proposal } = build([child('Billing', ['Auth']), child('Auth'), child('Reports')]);

    expect(proposal.children.map(c => c.name)).toEqual(['Auth', 'Billing', 'Reports']);
  });

  test('a dependsOn chain makes the dependency root the default shared-foundation owner', () => {
    const { proposal } = build([child('Billing', ['Auth']), child('Auth'), child('Reports')]);

    expect(proposal.sharedFoundationOwner).toBe('Auth');
  });
});

describe('editProposal()', () => {
  const child = (name, extra = {}) => ({
    name,
    purpose: `${name} purpose`,
    keywords: [name.toLowerCase()],
    dependsOn: [],
    assigned: `UC-${name}`,
    ...extra,
  });
  const build = (children) => LIB.buildProposal({
    source: 'definition',
    children,
    config: loadConfig({ projectRoot: root }),
  }).proposal;
  // Auth <- Billing <- Reports; Auth owns the shared foundation.
  const twoChildren = () => build([child('Auth'), child('Billing', { dependsOn: ['Auth'] })]);
  const threeChildren = () => build([
    child('Auth'),
    child('Billing', { dependsOn: ['Auth'] }),
    child('Reports', { dependsOn: ['Billing'] }),
  ]);
  const findChild = (proposal, name) => proposal.children.find(c => c.name === name);

  test('refuses removing a child that leaves fewer than minChildren and leaves the proposal unchanged', () => {
    const proposal = twoChildren();
    const before = structuredClone(proposal);

    expect(() => LIB.editProposal(proposal, { type: 'remove', name: 'Billing' }))
      .toThrow(FeatureSplitError);
    expect(proposal).toEqual(before);
  });

  test('refuses removing a child that a sibling still depends on and leaves the proposal unchanged', () => {
    const proposal = threeChildren();
    const before = structuredClone(proposal);

    expect(() => LIB.editProposal(proposal, { type: 'remove', name: 'Billing' }))
      .toThrow(FeatureSplitError);
    expect(proposal).toEqual(before);
  });

  test('accepts a merge, joins the purposes with " / " and makes the keywords the union', () => {
    const proposal = threeChildren();
    const billing = findChild(proposal, 'Billing');
    const reports = findChild(proposal, 'Reports');

    const { proposal: merged } = LIB.editProposal(proposal, {
      type: 'merge', names: ['Billing', 'Reports'], into: 'Billing',
    });

    const result = findChild(merged, 'Billing');
    expect(merged.children.map(c => c.name)).toEqual(['Auth', 'Billing']);
    expect(result.purpose).toBe(`${billing.purpose} / ${reports.purpose}`);
    expect([...result.keywords].sort())
      .toEqual([...new Set([...billing.keywords, ...reports.keywords])].sort());
  });

  test('rename updates the dependsOn references and the shared-foundation owner', () => {
    const proposal = twoChildren();

    const { proposal: renamed } = LIB.editProposal(proposal, { type: 'rename', from: 'Auth', to: 'Identity' });

    expect(findChild(renamed, 'Billing').dependsOn).toEqual(['Identity']);
    expect(renamed.sharedFoundationOwner).toBe('Identity');
  });

  test('moving the shared-foundation owner is not refused and returns a BR-03 warning object', () => {
    const proposal = threeChildren();

    const { proposal: moved, warnings } = LIB.editProposal(proposal, { type: 'owner', name: 'Billing' });

    expect(moved.sharedFoundationOwner).toBe('Billing');
    expect(warnings).toEqual([
      expect.objectContaining({
        code: 'FOUNDATION_NOT_FIRST',
        message: expect.stringMatching(/BR-03/),
      }),
    ]);
  });

  test('purpose and keywords are editable with set', () => {
    const proposal = twoChildren();

    const first = LIB.editProposal(proposal, { type: 'set', name: 'Auth', field: 'purpose', value: 'Login and MFA' });
    const second = LIB.editProposal(first.proposal, {
      type: 'set', name: 'Auth', field: 'keywords', value: ['auth', 'mfa'],
    });

    const auth = findChild(second.proposal, 'Auth');
    expect(auth.purpose).toBe('Login and MFA');
    expect(auth.keywords).toEqual(['auth', 'mfa']);
  });

  test('writes no files and leaves the project tree unchanged', () => {
    fs.writeFileSync(path.join(root, 'marker.txt'), 'x', 'utf8');
    const snapshot = () => fs.readdirSync(root, { recursive: true }).sort();
    const writers = ['writeFileSync', 'appendFileSync', 'mkdirSync', 'renameSync', 'rmSync', 'unlinkSync', 'copyFileSync']
      .map(name => jest.spyOn(fs, name));
    const before = snapshot();

    let writeCalls;
    try {
      LIB.editProposal(twoChildren(), { type: 'set', name: 'Auth', field: 'purpose', value: 'New' });
    } finally {
      // Read the call counts before restoring: mockRestore clears recorded calls.
      writeCalls = writers.map(spy => spy.mock.calls.length);
      writers.forEach(spy => spy.mockRestore());
    }

    expect(snapshot()).toEqual(before);
    expect(writeCalls).toEqual(writers.map(() => 0));
  });
});

describe('initial apply success', () => {
  const PARENT_ID = 'FTR-005';
  const PARENT_DIR = 'FTR-005-parent';
  const ORIGINAL = '# Parent\n\nSummary here. More.\n\n## Scope\n\nParent scope text.\n';
  const REGISTRY_TEXT = [
    '# Feature Registry',
    '',
    '## FTR-005 — Parent',
    '**Keywords:** parent',
    '**Status:** defined',
    '**Summary:** Summary here. More.',
    '→ [Detail](FTR-005-parent/feature.md)',
    '---',
    '',
    '## FTR-004 — Unrelated',
    '**Keywords:** other',
    '**Status:** completed',
    '**Summary:** Unrelated feature.',
    '→ [Detail](FTR-004-unrelated/feature.md)',
    '---',
    '',
  ].join('\n');

  function sampleProposal(overrides = {}) {
    return {
      source: 'definition',
      children: [
        { name: 'Auth', purpose: 'Sign-in and sessions', keywords: ['auth'], dependsOn: [], assigned: 'UC-01, UC-02' },
        { name: 'Billing', purpose: 'Invoices', keywords: ['billing'], dependsOn: ['Auth'], assigned: 'UC-03' },
      ],
      sharedFoundationOwner: 'Auth',
      foundationNote: 'Shared models',
      minChildren: 2,
      ...overrides,
    };
  }

  // Builds featuresRoot with a defined parent (feature.md, req/, spec/), a registry,
  // and a stray folder FTR-007-old that must push allocation past 7.
  function setupInitialFixture() {
    const featuresRoot = path.join(root, 'features');
    const parent = path.join(featuresRoot, PARENT_DIR);
    fs.mkdirSync(path.join(parent, 'req'), { recursive: true });
    fs.mkdirSync(path.join(parent, 'spec'), { recursive: true });
    fs.mkdirSync(path.join(featuresRoot, 'FTR-007-old'));
    fs.writeFileSync(path.join(parent, 'feature.md'), ORIGINAL);
    fs.writeFileSync(path.join(parent, 'req', 'index.md'), '# Requirements\n');
    fs.writeFileSync(path.join(parent, 'spec', 'index.md'), '# Tech spec\n');
    fs.writeFileSync(path.join(featuresRoot, 'REGISTRY.md'), REGISTRY_TEXT);
    return { featuresRoot, parent };
  }

  function runInitialApply(featuresRoot, proposal = sampleProposal()) {
    return apply({ featuresRoot, parentId: PARENT_ID, proposal, runId: 'aabbccdd' });
  }

  // Matches only the row whose ID cell is the child ID; "Depends on" cells also name IDs.
  function splitRowsFor(epic, id) {
    const idCell = new RegExp(`^\\|\\s*\\d+\\s*\\|\\s*${id}\\s*\\|`);
    return epic.split('\n').filter((line) => idCell.test(line));
  }

  test('epic.md lists each child exactly once in the split table', () => {
    const { featuresRoot, parent } = setupInitialFixture();
    const result = runInitialApply(featuresRoot);
    const epic = fs.readFileSync(path.join(parent, 'epic.md'), 'utf8');

    for (const child of result.children) {
      expect(splitRowsFor(epic, child.id)).toHaveLength(1);
    }
  });

  test('epic.md records the definition checkpoint on each child row', () => {
    const { featuresRoot, parent } = setupInitialFixture();
    const result = runInitialApply(featuresRoot);
    const epic = fs.readFileSync(path.join(parent, 'epic.md'), 'utf8');

    for (const child of result.children) {
      expect(splitRowsFor(epic, child.id)[0]).toMatch(/\|\s*definition\s*\|/);
    }
  });

  test('epic.md ends with the original feature text verbatim', () => {
    const { featuresRoot, parent } = setupInitialFixture();
    runInitialApply(featuresRoot);
    const epic = fs.readFileSync(path.join(parent, 'epic.md'), 'utf8');

    expect(epic.endsWith(ORIGINAL)).toBe(true);
  });

  test('does not write epic.json next to epic.md', () => {
    const { featuresRoot, parent } = setupInitialFixture();
    runInitialApply(featuresRoot);

    expect(fs.existsSync(path.join(parent, 'epic.json'))).toBe(false);
  });

  test('creates each child folder as a sibling under featuresRoot', () => {
    const { featuresRoot } = setupInitialFixture();
    const result = runInitialApply(featuresRoot);

    for (const child of result.children) {
      expect(fs.existsSync(path.join(featuresRoot, child.dir, 'feature.md'))).toBe(true);
    }
  });

  test('child feature.md carries its ID, parent epic and purpose-based summary', () => {
    const { featuresRoot } = setupInitialFixture();
    const [auth] = runInitialApply(featuresRoot).children;
    const text = fs.readFileSync(path.join(featuresRoot, auth.dir, 'feature.md'), 'utf8');

    expect(text).toContain('# Auth');
    expect(text).toContain(`## Feature ID\n${auth.id}`);
    expect(text).toContain(PARENT_ID);
    expect(text).toContain('Sign-in and sessions');
  });

  test('later child feature.md lists the earlier child as its only dependency', () => {
    const { featuresRoot } = setupInitialFixture();
    const [, billing] = runInitialApply(featuresRoot).children;
    const text = fs.readFileSync(path.join(featuresRoot, billing.dir, 'feature.md'), 'utf8');

    expect(text).toContain('Depends on: FTR-008');
  });

  test('shared foundation content appears in the first child feature.md only', () => {
    const { featuresRoot } = setupInitialFixture();
    const [auth, billing] = runInitialApply(featuresRoot).children;
    const authText = fs.readFileSync(path.join(featuresRoot, auth.dir, 'feature.md'), 'utf8');
    const billingText = fs.readFileSync(path.join(featuresRoot, billing.dir, 'feature.md'), 'utf8');

    expect(authText).toContain('Shared models');
    expect(billingText).not.toContain('Shared models');
  });

  test('allocates the next IDs after the highest registry heading and folder prefix', () => {
    const { featuresRoot } = setupInitialFixture();
    const result = runInitialApply(featuresRoot);

    expect(result.children.map((c) => c.id)).toEqual(['FTR-008', 'FTR-009']);
  });

  test('registers each new child in REGISTRY.md under its allocated ID', () => {
    const { featuresRoot } = setupInitialFixture();
    runInitialApply(featuresRoot);
    const registry = fs.readFileSync(path.join(featuresRoot, 'REGISTRY.md'), 'utf8');

    expect(registry).toContain('## FTR-008 — Auth');
    expect(registry).toContain('## FTR-009 — Billing');
  });

  test('parent folder ends with epic.md only after req/ and spec/ are moved and removed', () => {
    const { featuresRoot, parent } = setupInitialFixture();
    runInitialApply(featuresRoot);

    expect(fs.readdirSync(parent)).toEqual(['epic.md']);
  });

  test('leaves no staging directory under featuresRoot after a successful apply', () => {
    const { featuresRoot } = setupInitialFixture();
    runInitialApply(featuresRoot);

    expect(findStagingLeftovers(featuresRoot)).toEqual([]);
  });
});

describe('apply registry entries', () => {
  const PARENT = 'FTR-010';
  const PARENT_DIR = 'FTR-010-login';
  const OTHER_ENTRY = [
    '## FTR-005 — Unrelated work',
    '**Keywords:** misc',
    '**Status:** in-progress',
    '**Summary:** Unrelated work.',
    '→ [Detail](FTR-005-unrelated/feature.md)',
  ].join('\n');
  const PARENT_ENTRY = [
    `## ${PARENT} — Login`,
    '**Keywords:** auth',
    '**Status:** defined',
    '**Summary:** Sign-in and sessions for users. Billing follows.',
    `→ [Detail](${PARENT_DIR}/feature.md)`,
  ].join('\n');

  let featuresRoot;

  function sampleProposal() {
    return {
      source: 'definition',
      children: [
        { name: 'Auth', purpose: 'Sign-in and sessions', keywords: ['auth'], dependsOn: [], assigned: 'UC-01' },
        { name: 'Billing', purpose: 'Invoices', keywords: ['billing'], dependsOn: ['Auth'], assigned: 'UC-02' },
      ],
      sharedFoundationOwner: 'Auth',
      foundationNote: 'Shared models',
      minChildren: 2,
    };
  }

  // Returns the registry block for one ID: from its heading up to the next heading or separator.
  function entryBlock(text, id) {
    const start = text.indexOf(`## ${id} `);
    if (start < 0) return null;
    const lineEnd = text.indexOf('\n', start);
    const next = text.slice(lineEnd).search(/\n(## FTR-|---)/);
    return next < 0 ? text.slice(start) : text.slice(start, lineEnd + next);
  }

  function readField(block, key) {
    const match = block.match(new RegExp(`\\*\\*${key}:\\*\\* (.*)`));
    return match ? match[1].trim() : undefined;
  }

  beforeEach(() => {
    featuresRoot = path.join(root, 'custom-features');
    fs.mkdirSync(path.join(featuresRoot, PARENT_DIR), { recursive: true });
    fs.writeFileSync(path.join(featuresRoot, PARENT_DIR, 'feature.md'),
      '# Login\n\n## Summary\n\nOriginal text.\n');
    fs.writeFileSync(path.join(featuresRoot, 'REGISTRY.md'),
      ['# Feature Registry', '', PARENT_ENTRY, '', '---', '', OTHER_ENTRY, ''].join('\n'));
  });

  function runApply() {
    return apply({ featuresRoot, parentId: PARENT, proposal: sampleProposal(), runId: 'aabbccdd' });
  }

  function readRegistry() {
    return fs.readFileSync(path.join(featuresRoot, 'REGISTRY.md'), 'utf8');
  }

  test('child entry records Parent, Depends on none and a Detail link for the first child', () => {
    const result = runApply();
    const auth = entryBlock(readRegistry(), result.children[0].id);

    expect(readField(auth, 'Parent')).toBe(PARENT);
    expect(readField(auth, 'Depends on')).toBe('none');
    expect(auth).toMatch(/\[Detail\]\(.*feature\.md\)/);
  });

  test('later child entry records Parent, the earlier child ID as Depends on and a Detail link', () => {
    const result = runApply();
    const [authId, billingId] = result.children.map((c) => c.id);
    const billing = entryBlock(readRegistry(), billingId);

    expect(readField(billing, 'Parent')).toBe(PARENT);
    expect(readField(billing, 'Depends on')).toBe(authId);
    expect(billing).toMatch(/\[Detail\]\(.*feature\.md\)/);
  });

  test('parent entry is changed in place to status epic', () => {
    runApply();
    const epic = entryBlock(readRegistry(), PARENT);

    expect(readField(epic, 'Status')).toBe('epic');
  });

  test('parent entry keeps a single heading and sits before the unrelated entry', () => {
    runApply();
    const registry = readRegistry();

    expect(registry.match(new RegExp(`^## ${PARENT} `, 'gm'))).toHaveLength(1);
    expect(registry.indexOf(`## ${PARENT} `)).toBeLessThan(registry.indexOf('## FTR-005 '));
  });

  test('parent entry Summary is the first sentence of the original Summary', () => {
    runApply();
    const epic = entryBlock(readRegistry(), PARENT);

    expect(readField(epic, 'Summary')).toBe('Sign-in and sessions for users.');
  });

  test('parent entry Keywords is the union of the child keywords', () => {
    runApply();
    const epic = entryBlock(readRegistry(), PARENT);

    expect(readField(epic, 'Keywords').split(/,\s*/).sort()).toEqual(['auth', 'billing']);
  });

  test('parent entry Detail links to epic.md in the parent folder', () => {
    runApply();
    const epic = entryBlock(readRegistry(), PARENT);

    expect(epic).toMatch(/\[Detail\]\(.*epic\.md\)/);
  });

  test('an entry with another status is left byte-identical', () => {
    runApply();

    expect(readRegistry()).toContain(OTHER_ENTRY);
  });

  test('epic.md exists in the parent folder at the moment REGISTRY.md is written', () => {
    const realRename = fs.renameSync;
    const epicPresentAtRegistryWrite = [];
    const spy = jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (path.basename(to) === 'REGISTRY.md') {
        epicPresentAtRegistryWrite.push(
          fs.existsSync(path.join(featuresRoot, PARENT_DIR, 'epic.md')));
      }
      return realRename(from, to);
    });
    try {
      runApply();
    } finally {
      spy.mockRestore();
    }

    expect(epicPresentAtRegistryWrite).toEqual([true]);
  });
});
