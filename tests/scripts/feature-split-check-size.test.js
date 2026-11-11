'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'src', 'claude', 'scripts', 'feature-split.js');
const PREFIX = 'FTR-900';
const FEATURE_NAME = 'FTR-900-fixture';
const tempRoots = [];

function makeProject(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-size-'));
  tempRoots.push(root);
  // Override file at the project root. Values are test-only, not defaults.
  fs.writeFileSync(path.join(root, 'feature-split.config.json'),
    JSON.stringify({ thresholds: { useCases: 10, acceptanceCriteria: 20, components: 10, estimatedPhases: 5 } }));
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
