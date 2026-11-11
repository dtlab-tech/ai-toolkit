'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'src', 'claude', 'scripts', 'feature-split.js');
const PREFIX = 'FTR-900';
const FEATURE_NAME = 'FTR-900-fixture';
const tempRoots = [];

const DEFAULT_TEST_THRESHOLDS = { useCases: 10, acceptanceCriteria: 20, components: 10, estimatedPhases: 5 };

function makeProject(files = {}, thresholds = DEFAULT_TEST_THRESHOLDS) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-size-'));
  tempRoots.push(root);
  // Override file at the project root. Values are test-only, not defaults.
  fs.writeFileSync(path.join(root, 'feature-split.config.json'), JSON.stringify({ thresholds }));
  const feature = path.join(root, 'internal_docs', 'features', FEATURE_NAME);
  fs.mkdirSync(feature, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(feature, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return { root, feature };
}

function runCheck(root, feature) {
  try {
    const stdout = execFileSync(process.execPath,
      [SCRIPT, '--project', root, 'check-size', '--feature-dir', feature, '--prefix', PREFIX],
      { encoding: 'utf8' });
    return { result: JSON.parse(stdout), code: 0 };
  } catch (err) {
    return { result: JSON.parse(err.stdout), code: err.status };
  }
}

afterEach(() => {
  for (const dir of tempRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('check-size: a feature that is not new is skipped', () => {
  test.each([
    ['FTR-900-Approvals.md exists', { 'FTR-900-Approvals.md': '# approvals' }],
    ['wbs/ directory exists', { 'wbs/.gitkeep': '' }],
    ['epic.md exists', { 'epic.md': '# epic' }],
  ])('reports status skipped with exit code 0 when %s', (_label, files) => {
    const { root, feature } = makeProject(files);
    const { result, code } = runCheck(root, feature);
    expect(code).toBe(0);
    expect(result.status).toBe('skipped');
    expect(result.counts).toEqual({});
  });
});

describe('check-size: a feature folder that does not exist is new', () => {
  test('measures counts instead of reporting skipped', () => {
    const { root } = makeProject({});
    const missing = path.join(root, 'internal_docs', 'features', 'FTR-900-missing');
    const { result } = runCheck(root, missing);
    expect(result.status).not.toBe('skipped');
    expect(result.unavailable.map(u => u.count)).toContain('useCases');
  });
});

describe('check-size: useCases counts distinct UC-NN identifiers', () => {
  test('counts a UC listed in two files once and ignores text that is not UC-NN', () => {
    const { root, feature } = makeProject({
      'req/use-cases/UC-01-login.md': '# UC-01 Login\nSee UC-02 for logout.\n',
      'req/use-cases/UC-02-logout.md': '# UC-02 Logout\nRelated: UC-03. Ignore UC-1 and ABC-07.\n',
      'req/use-cases/UC-03-reset.md': '# UC-03 Reset\n',
    });
    const { result } = runCheck(root, feature);
    expect(result.counts.useCases).toBe(3);
  });
});

describe('check-size: acceptanceCriteria counts distinct AC-NN identifiers in req/index.md', () => {
  test('counts a repeated AC row once', () => {
    const { root, feature } = makeProject({
      'req/index.md': [
        '| ID | Criterion |',
        '| --- | --- |',
        '| AC-01 | First |',
        '| AC-02 | Second |',
        '| AC-01 | First, repeated |',
        '',
      ].join('\n'),
    });
    const { result } = runCheck(root, feature);
    expect(result.counts.acceptanceCriteria).toBe(2);
  });
});

// Shared fixture builders for the component and build-order groups below.
const COMPONENTS = 'components';
const PHASES = 'estimatedPhases';

function componentTable(n) {
  const rows = Array.from({ length: n }, (_, i) => `| C${i} | src/x${i}.js | BE | AC-01 |`);
  return ['| Component | Path | Domain | Addresses |', '|---|---|---|---|', ...rows].join('\n');
}

function specWithOrder(orderLines) {
  return ['# Spec', '', '## Components', '', componentTable(1), '',
    '## 11. Build order', '', ...orderLines, ''].join('\n');
}

const phasesEntry = (result) => result.unavailable.find(u => u.count === PHASES);

describe('check-size component row count', () => {
  test('counts the three data rows of the component table and ignores rows of another table', () => {
    const spec = ['## Components', '', componentTable(3), '',
      '## Other', '', '| X | Y |', '|---|---|', '| 1 | 2 |', '| 3 | 4 |', ''].join('\n');
    const { root, feature } = makeProject({ 'spec/index.md': spec });
    const { result } = runCheck(root, feature);
    expect(result.counts[COMPONENTS]).toBe(3);
  });

  test('counts the rows of the New files and Modified files tables of Section 9 together', () => {
    const spec = ['## 9. File Inventory', '', '### New files', '| Path | Purpose | Addresses | Domain | Spec |', '|---|---|---|---|---|',
      '| src/a.js | a | AC-01 | BE | x |', '| src/b.js | b | AC-02 | BE | x |', '',
      '### Modified files', '| Path | Change description | Addresses | Domain | Spec |', '|---|---|---|---|---|',
      '| src/c.js | c | AC-03 | BE | x |', ''].join('\n');
    const { root, feature } = makeProject({ 'spec/index.md': spec });
    expect(runCheck(root, feature).result.counts[COMPONENTS]).toBe(3);
  });

  test('a Path that appears in both tables is counted once', () => {
    const spec = ['## 9. File Inventory', '', '### New files', '| Path | Purpose | Addresses | Domain | Spec |', '|---|---|---|---|---|',
      '| src/a.js | a | AC-01 | BE | x |', '',
      '### Modified files', '| Path | Change description | Addresses | Domain | Spec |', '|---|---|---|---|---|',
      '| src/a.js | again | AC-01 | BE | x |', '| src/b.js | b | AC-02 | BE | x |', ''].join('\n');
    const { root, feature } = makeProject({ 'spec/index.md': spec });
    expect(runCheck(root, feature).result.counts[COMPONENTS]).toBe(2);
  });

  test('a table with a Path column outside Section 9 is not counted when Section 9 exists', () => {
    const spec = ['## 7. Notes', '', '| Path | Note |', '|---|---|', '| docs/x.md | y |', '',
      '## 9. File Inventory', '', '### New files', '| Path | Purpose | Addresses | Domain | Spec |', '|---|---|---|---|---|',
      '| src/a.js | a | AC-01 | BE | x |', '', '## 10. Next', ''].join('\n');
    const { root, feature } = makeProject({ 'spec/index.md': spec });
    expect(runCheck(root, feature).result.counts[COMPONENTS]).toBe(1);
  });

  test('marks components unavailable when the component table has a header but no data rows', () => {
    const { root, feature } = makeProject({ 'spec/index.md': `## Components\n\n${componentTable(0)}\n` });
    const { result, code } = runCheck(root, feature);
    expect(result.status).toBe('unavailable');
    expect(code).toBe(1);
    expect(result.unavailable.map(u => u.count)).toContain(COMPONENTS);
  });

  test('marks components unavailable when the spec has no table with a Path column', () => {
    const { root, feature } = makeProject({ 'spec/index.md': '## Components\n\nNo table is written yet.\n' });
    const { result } = runCheck(root, feature);
    const entry = result.unavailable.find(u => u.count === COMPONENTS);
    expect(entry).toBeDefined();
    expect(entry.reason.length).toBeGreaterThan(0);
  });

  test('marks components unavailable when spec/index.md does not exist', () => {
    const { root, feature } = makeProject({ 'req/index.md': '# Req\n' });
    const { result } = runCheck(root, feature);
    const entry = result.unavailable.find(u => u.count === COMPONENTS);
    expect(entry).toBeDefined();
    expect(entry.reason.length).toBeGreaterThan(0);
  });
});

describe('check-size estimated phases from build order', () => {
  test('independent items give one phase', () => {
    const { root, feature } = makeProject({ 'spec/index.md': specWithOrder([
      '1. A — depends on: none', '2. B — depends on: none', '3. C — depends on: none']) });
    expect(runCheck(root, feature).result.counts[PHASES]).toBe(1);
  });

  test('the template wording "depends on: nothing" and a note after the clause are accepted', () => {
    const { root, feature } = makeProject({ 'spec/index.md': specWithOrder([
      '1. A — depends on: nothing', '2. B — depends on: 1', '3. C — depends on: none. Requires a decision first.']) });
    expect(runCheck(root, feature).result.counts[PHASES]).toBe(2);
  });

  test('a chain of three items gives three phases', () => {
    const { root, feature } = makeProject({ 'spec/index.md': specWithOrder([
      '1. A — depends on: none', '2. B — depends on: 1', '3. C — depends on: 2']) });
    expect(runCheck(root, feature).result.counts[PHASES]).toBe(3);
  });

  test('a diamond gives three phases', () => {
    const { root, feature } = makeProject({ 'spec/index.md': specWithOrder([
      '1. A — depends on: none', '2. B — depends on: 1', '3. C — depends on: 1', '4. D — depends on: 2, 3']) });
    expect(runCheck(root, feature).result.counts[PHASES]).toBe(3);
  });

  test('marks phases unavailable with a reason on a dangling dependency', () => {
    const { root, feature } = makeProject({ 'spec/index.md': specWithOrder([
      '1. A — depends on: none', '2. B — depends on: 9']) });
    const entry = phasesEntry(runCheck(root, feature).result);
    expect(entry).toBeDefined();
    expect(entry.reason.length).toBeGreaterThan(0);
  });

  test('marks phases unavailable with a reason on a cycle', () => {
    const { root, feature } = makeProject({ 'spec/index.md': specWithOrder([
      '1. A — depends on: 2', '2. B — depends on: 1']) });
    const entry = phasesEntry(runCheck(root, feature).result);
    expect(entry).toBeDefined();
    expect(entry.reason.length).toBeGreaterThan(0);
  });

  test('marks phases unavailable with a reason when an item has no depends on clause', () => {
    const { root, feature } = makeProject({ 'spec/index.md': specWithOrder([
      '1. A — depends on: none', '2. B']) });
    const entry = phasesEntry(runCheck(root, feature).result);
    expect(entry).toBeDefined();
    expect(entry.reason.length).toBeGreaterThan(0);
  });
});

// Fixture builder for the boundary and precedence group. Every count it writes is distinct and parses through the
// same markup the measures read: UC-NN files, an AC-NN table in req/index.md, a Path-column component table, and a
// Section 11 build order where item k depends on item k-1 (a chain of N items gives N phases).
const pad = (n) => String(n).padStart(2, '0');

function filesFor({ ucCount, acCount, componentRows, chain }) {
  const files = {};
  for (let i = 1; i <= ucCount; i++) files[`req/use-cases/UC-${pad(i)}.md`] = `# UC-${pad(i)}\n`;
  const acRows = Array.from({ length: acCount }, (_, i) => `| AC-${pad(i + 1)} | Criterion ${i + 1} |`);
  files['req/index.md'] = ['| ID | Criterion |', '|---|---|', ...acRows, ''].join('\n');
  const order = Array.from({ length: chain }, (_, i) =>
    i === 0 ? '1. Item 1 — depends on: none' : `${i + 1}. Item ${i + 1} — depends on: ${i}`);
  files['spec/index.md'] = ['## Components', '', componentTable(componentRows), '',
    '## 11. Build order', '', ...order, ''].join('\n');
  return files;
}

// Hashes every file under a directory so a test can prove the check left the tree untouched.
function hashTree(dir) {
  const out = {};
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[path.relative(dir, full)] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  };
  walk(dir);
  return out;
}

describe('check-size threshold boundary and precedence', () => {
  const EVEN = { useCases: 2, acceptanceCriteria: 2, components: 2, estimatedPhases: 2 };

  test('a count equal to its threshold is not over', () => {
    const { root, feature } = makeProject(filesFor({ ucCount: 2, acCount: 2, componentRows: 2, chain: 2 }), EVEN);
    expect(runCheck(root, feature).result.over).toEqual([]);
  });

  test('a run where every count equals its threshold reports status passed', () => {
    const { root, feature } = makeProject(filesFor({ ucCount: 2, acCount: 2, componentRows: 2, chain: 2 }), EVEN);
    expect(runCheck(root, feature).result.status).toBe('passed');
  });

  test('a passed run exits with code 0', () => {
    const { root, feature } = makeProject(filesFor({ ucCount: 2, acCount: 2, componentRows: 2, chain: 2 }), EVEN);
    expect(runCheck(root, feature).code).toBe(0);
  });

  test('a passed run carries no proposal', () => {
    const { root, feature } = makeProject(filesFor({ ucCount: 2, acCount: 2, componentRows: 2, chain: 2 }), EVEN);
    expect(runCheck(root, feature).result).not.toHaveProperty('proposal');
  });

  test('unavailable takes precedence over an over-threshold count', () => {
    const files = filesFor({ ucCount: 3, acCount: 2, componentRows: 2, chain: 2 });
    delete files['req/index.md']; // acceptanceCriteria becomes unavailable
    const { root, feature } = makeProject(files, { useCases: 1, acceptanceCriteria: 1, components: 5, estimatedPhases: 5 });
    expect(runCheck(root, feature).result.status).toBe('unavailable');
  });

  test('an unavailable run exits with code 1', () => {
    const files = filesFor({ ucCount: 3, acCount: 2, componentRows: 2, chain: 2 });
    delete files['req/index.md'];
    const { root, feature } = makeProject(files, { useCases: 1, acceptanceCriteria: 1, components: 5, estimatedPhases: 5 });
    expect(runCheck(root, feature).code).toBe(1);
  });

  test('an unavailable run carries no proposal even when a count is over', () => {
    const files = filesFor({ ucCount: 3, acCount: 2, componentRows: 2, chain: 2 });
    delete files['req/index.md'];
    const { root, feature } = makeProject(files, { useCases: 1, acceptanceCriteria: 1, components: 5, estimatedPhases: 5 });
    expect(runCheck(root, feature).result).not.toHaveProperty('proposal');
  });

  test('an unavailable run still lists the over-threshold count', () => {
    const files = filesFor({ ucCount: 3, acCount: 2, componentRows: 2, chain: 2 });
    delete files['req/index.md'];
    const { root, feature } = makeProject(files, { useCases: 1, acceptanceCriteria: 1, components: 5, estimatedPhases: 5 });
    expect(runCheck(root, feature).result.over).toEqual(['useCases']);
  });

  test('an unavailable run names the unavailable count with a reason', () => {
    const files = filesFor({ ucCount: 3, acCount: 2, componentRows: 2, chain: 2 });
    delete files['req/index.md'];
    const { root, feature } = makeProject(files, { useCases: 1, acceptanceCriteria: 1, components: 5, estimatedPhases: 5 });
    const entry = runCheck(root, feature).result.unavailable.find(u => u.count === 'acceptanceCriteria');
    expect(entry).toBeDefined();
    expect(entry.reason.length).toBeGreaterThan(0);
  });

  test('the printed key set for a passed run is exactly status, counts, thresholds, over and unavailable', () => {
    const { root, feature } = makeProject(filesFor({ ucCount: 1, acCount: 1, componentRows: 1, chain: 1 }),
      { useCases: 5, acceptanceCriteria: 5, components: 5, estimatedPhases: 5 });
    const { result } = runCheck(root, feature);
    expect(Object.keys(result).sort()).toEqual(['counts', 'over', 'status', 'thresholds', 'unavailable']);
  });

  test('a passed run leaves the project tree byte-for-byte unchanged', () => {
    const { root, feature } = makeProject(filesFor({ ucCount: 1, acCount: 1, componentRows: 1, chain: 1 }),
      { useCases: 5, acceptanceCriteria: 5, components: 5, estimatedPhases: 5 });
    const before = hashTree(root);
    runCheck(root, feature);
    expect(hashTree(root)).toEqual(before);
  });
});
