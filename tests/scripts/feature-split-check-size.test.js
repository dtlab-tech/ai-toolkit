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

describe('check-size child grouping', () => {
  // Thresholds of 1 make every count over its threshold; NO_LIMIT keeps a count under its threshold.
  const GROUP_THRESHOLDS = { useCases: 1, acceptanceCriteria: 1, components: 1, estimatedPhases: 10 };
  const NO_LIMIT = 100;
  const groupRoots = [];

  afterEach(() => {
    for (const dir of groupRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  const twoDigit = (n) => String(n).padStart(2, '0');
  const acId = (n) => `AC-${twoDigit(n)}`;
  const ucIds = (count) => Array.from({ length: count }, (_, i) => `UC-${twoDigit(i + 1)}`);
  // AC k relates to the use case at index (k - 1) mod ucCount, so every use case has at least one AC when acCount >= ucCount.
  const acRowsFor = (acCount, ucs) => Array.from({ length: acCount }, (_, i) => [acId(i + 1), ucs[i % ucs.length]]);
  const componentRowsFor = (count) => Array.from({ length: count }, (_, i) => [`src/c${i + 1}.js`, acId(i + 1)]);

  // acRows: [[AC-NN, 'UC-NN, ...'], ...]; componentRows: [[Path, 'AC-NN, ...'], ...]. Returns the project root and feature folder.
  function makeGroupingProject({ thresholds = GROUP_THRESHOLDS, minChildren = 2, useCases, acRows, componentRows }) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-size-group-'));
    groupRoots.push(root);
    fs.writeFileSync(path.join(root, 'feature-split.config.json'), JSON.stringify({ thresholds, minChildren }));
    const feature = path.join(root, 'internal_docs', 'features', FEATURE_NAME);
    fs.mkdirSync(path.join(feature, 'req', 'use-cases'), { recursive: true });
    fs.mkdirSync(path.join(feature, 'spec'), { recursive: true });
    for (const uc of useCases) fs.writeFileSync(path.join(feature, 'req', 'use-cases', `${uc}.md`), `# ${uc}\n`);
    fs.writeFileSync(path.join(feature, 'req', 'index.md'), [
      '| ID | Criterion | Related UC |', '|---|---|---|',
      ...acRows.map(([ac, ucs]) => `| ${ac} | Criterion | ${ucs} |`),
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(feature, 'spec', 'index.md'), [
      '## 9. File Inventory', '', '### New files', '| Path | Purpose | Addresses | Domain | Spec |', '|---|---|---|---|---|',
      ...componentRows.map(([p, addr]) => `| ${p} | purpose | ${addr} | BE | x |`), '',
      '## 11. Build order', '', '1. Core — depends on: none', '2. Edge — depends on: 1', '',
    ].join('\n'));
    return { root, feature };
  }

  // Runs check-size and returns the printed output, the exit code and the parsed result, including on exit code 1.
  function check(root, feature) {
    try {
      const stdout = execFileSync(process.execPath,
        [SCRIPT, '--project', root, 'check-size', '--feature-dir', feature, '--prefix', PREFIX],
        { encoding: 'utf8' });
      return { stdout, code: 0, result: JSON.parse(stdout) };
    } catch (err) {
      return { stdout: err.stdout, code: err.status, result: JSON.parse(err.stdout) };
    }
  }

  // The assigned text reads "Use cases: UC-01, UC-02. Components: ...". Returns the use-case IDs listed for a child.
  const useCasesOf = (child) => child.assigned.match(/Use cases: ([^.]*)\./)[1].split(', ');

  describe('child count', () => {
    test('a use-case count above its threshold gives the ceiling of count divided by threshold', () => {
      // 5 use cases with a threshold of 2: ceil(5 / 2) = 3 children.
      const useCases = ucIds(5);
      const { root, feature } = makeGroupingProject({
        thresholds: { useCases: 2, acceptanceCriteria: NO_LIMIT, components: NO_LIMIT, estimatedPhases: 10 },
        useCases, acRows: acRowsFor(5, useCases), componentRows: componentRowsFor(5),
      });
      expect(check(root, feature).result.proposal.children).toHaveLength(3);
    });

    test('the largest ratio across the over-threshold counts sets the child count', () => {
      // Use cases: ceil(6 / 5) = 2. Acceptance criteria: ceil(9 / 2) = 5. The largest, 5, is below the cap of 6.
      const useCases = ucIds(6);
      const { root, feature } = makeGroupingProject({
        thresholds: { useCases: 5, acceptanceCriteria: 2, components: NO_LIMIT, estimatedPhases: 10 },
        useCases, acRows: acRowsFor(9, useCases), componentRows: componentRowsFor(6),
      });
      expect(check(root, feature).result.proposal.children).toHaveLength(5);
    });

    test('a child count below minChildren is raised to minChildren', () => {
      // ceil(3 / 2) = 2 is below minChildren 3, so 3 children are formed (the cap is 3 use cases).
      const useCases = ucIds(3);
      const { root, feature } = makeGroupingProject({
        thresholds: { useCases: 2, acceptanceCriteria: NO_LIMIT, components: NO_LIMIT, estimatedPhases: 10 },
        minChildren: 3, useCases, acRows: acRowsFor(3, useCases), componentRows: componentRowsFor(3),
      });
      expect(check(root, feature).result.proposal.children).toHaveLength(3);
    });

    test('a child count above the distinct use-case count is capped at that count', () => {
      // ceil(10 / 1) = 10 acceptance criteria would give 10 children, but only 3 use cases exist.
      const useCases = ucIds(3);
      const { root, feature } = makeGroupingProject({
        thresholds: { useCases: NO_LIMIT, acceptanceCriteria: 1, components: NO_LIMIT, estimatedPhases: 10 },
        useCases, acRows: acRowsFor(10, useCases), componentRows: componentRowsFor(3),
      });
      expect(check(root, feature).result.proposal.children).toHaveLength(3);
    });

    test('two use cases with minChildren 2 always give exactly two children', () => {
      const useCases = ucIds(2);
      const { root, feature } = makeGroupingProject({
        useCases, acRows: acRowsFor(2, useCases), componentRows: componentRowsFor(2),
      });
      expect(check(root, feature).result.proposal.children).toHaveLength(2);
    });
  });

  describe('use-case blocks', () => {
    test('every use case appears in exactly one block, in sorted order', () => {
      const useCases = ucIds(5);
      const { root, feature } = makeGroupingProject({
        thresholds: { useCases: 2, acceptanceCriteria: NO_LIMIT, components: NO_LIMIT, estimatedPhases: 10 },
        useCases, acRows: acRowsFor(5, useCases), componentRows: componentRowsFor(5),
      });
      const blocks = check(root, feature).result.proposal.children.map(useCasesOf);
      expect(blocks.flat()).toEqual(useCases);
    });

    test('the first blocks take one extra use case when the count does not divide evenly', () => {
      // 5 use cases in 3 blocks: sizes 2, 2, 1.
      const useCases = ucIds(5);
      const { root, feature } = makeGroupingProject({
        thresholds: { useCases: 2, acceptanceCriteria: NO_LIMIT, components: NO_LIMIT, estimatedPhases: 10 },
        useCases, acRows: acRowsFor(5, useCases), componentRows: componentRowsFor(5),
      });
      const sizes = check(root, feature).result.proposal.children.map(c => useCasesOf(c).length);
      expect(sizes).toEqual([2, 2, 1]);
    });
  });

  describe('component assignment', () => {
    const useCases = ['UC-01', 'UC-02'];

    test('a component goes to the block of the lowest use case reachable through its Addresses', () => {
      // AC-01 relates to UC-02 and AC-02 relates to UC-01, so src/mixed.js reaches UC-01 and belongs to part-1.
      const acRows = [['AC-01', 'UC-02'], ['AC-02', 'UC-01'], ['AC-03', 'UC-02']];
      const componentRows = [['src/mixed.js', 'AC-01, AC-02'], ['src/late.js', 'AC-03']];
      const { root, feature } = makeGroupingProject({ useCases, acRows, componentRows });
      const [part1] = check(root, feature).result.proposal.children;
      expect(part1.assigned).toContain('src/mixed.js');
    });

    test('a component whose only linked use case is in the second block goes to the second block', () => {
      const acRows = [['AC-01', 'UC-02'], ['AC-02', 'UC-01'], ['AC-03', 'UC-02']];
      const componentRows = [['src/mixed.js', 'AC-01, AC-02'], ['src/late.js', 'AC-03']];
      const { root, feature } = makeGroupingProject({ useCases, acRows, componentRows });
      const [, part2] = check(root, feature).result.proposal.children;
      expect(part2.assigned).toContain('src/late.js');
    });

    test('a component with no use-case link is placed in block 1', () => {
      const acRows = [['AC-01', 'UC-01'], ['AC-02', 'UC-02']];
      const componentRows = [['src/orphan.js', 'AC-99']];
      const { root, feature } = makeGroupingProject({ useCases, acRows, componentRows });
      const [part1] = check(root, feature).result.proposal.children;
      expect(part1.assigned).toContain('src/orphan.js');
    });

    test('a component with no use-case link is not placed in block 2', () => {
      const acRows = [['AC-01', 'UC-01'], ['AC-02', 'UC-02']];
      const componentRows = [['src/orphan.js', 'AC-99']];
      const { root, feature } = makeGroupingProject({ useCases, acRows, componentRows });
      const [, part2] = check(root, feature).result.proposal.children;
      expect(part2.assigned).not.toContain('src/orphan.js');
    });

    test('a component with no use-case link carries a no use-case link note', () => {
      const acRows = [['AC-01', 'UC-01'], ['AC-02', 'UC-02']];
      const componentRows = [['src/orphan.js', 'AC-99']];
      const { root, feature } = makeGroupingProject({ useCases, acRows, componentRows });
      const [part1] = check(root, feature).result.proposal.children;
      expect(part1.assigned).toMatch(/no use-case link/i);
    });
  });

  describe('child fields', () => {
    const acRows = [['AC-01', 'UC-01'], ['AC-02', 'UC-02']];
    const componentRows = [['src/x.js', 'AC-01'], ['src/y.js', 'AC-02']];

    test('children are named part-1 and part-2 in order', () => {
      const { root, feature } = makeGroupingProject({ useCases: ['UC-01', 'UC-02'], acRows, componentRows });
      const [p1, p2] = check(root, feature).result.proposal.children;
      expect([p1.name, p2.name]).toEqual(['part-1', 'part-2']);
    });

    test('a child purpose names the use-case range of its block', () => {
      const { root, feature } = makeGroupingProject({ useCases: ['UC-01', 'UC-02'], acRows, componentRows });
      const [p1] = check(root, feature).result.proposal.children;
      expect(p1.purpose).toBe('Use cases UC-01..UC-01 and their components');
    });

    test('a child summary equals its purpose', () => {
      const { root, feature } = makeGroupingProject({ useCases: ['UC-01', 'UC-02'], acRows, componentRows });
      const [p1] = check(root, feature).result.proposal.children;
      expect(p1.summary).toBe(p1.purpose);
    });

    test('a child assigned field is text that lists its use cases and components', () => {
      const { root, feature } = makeGroupingProject({ useCases: ['UC-01', 'UC-02'], acRows, componentRows });
      const [p1] = check(root, feature).result.proposal.children;
      expect(p1.assigned).toBe('Use cases: UC-01. Components: src/x.js.');
    });
  });

  describe('unavailable when use cases are fewer than minChildren', () => {
    // Threshold 0 makes useCases over threshold, so the proposal path runs and then fails on the single use case.
    const OVER_ON_USE_CASES = { useCases: 0, acceptanceCriteria: 1, components: 1, estimatedPhases: 10 };
    const build = () => makeGroupingProject({
      thresholds: OVER_ON_USE_CASES, useCases: ['UC-01'],
      acRows: [['AC-01', 'UC-01']], componentRows: [['src/x.js', 'AC-01']],
    });

    test('reports status unavailable', () => {
      const { root, feature } = build();
      expect(check(root, feature).result.status).toBe('unavailable');
    });

    test('exits with code 1', () => {
      const { root, feature } = build();
      expect(check(root, feature).code).toBe(1);
    });

    test('carries no proposal', () => {
      const { root, feature } = build();
      expect(check(root, feature).result).not.toHaveProperty('proposal');
    });

    test('names minChildren as the reason', () => {
      const { root, feature } = build();
      const entry = check(root, feature).result.unavailable.find(u => u.count === 'proposal');
      expect(entry.reason).toMatch(/minChildren/);
    });
  });

  describe('repeat run', () => {
    test('a second run over the same project prints identical output', () => {
      const useCases = ucIds(5);
      const { root, feature } = makeGroupingProject({
        thresholds: { useCases: 2, acceptanceCriteria: NO_LIMIT, components: NO_LIMIT, estimatedPhases: 10 },
        useCases, acRows: acRowsFor(5, useCases), componentRows: componentRowsFor(5),
      });
      const first = check(root, feature);
      const second = check(root, feature);
      expect(second.stdout).toBe(first.stdout);
    });
  });
});

// Thresholds of 1 for useCases make it over threshold; the other counts stay far below their thresholds.
const FOUNDATION_THRESHOLDS = { useCases: 1, acceptanceCriteria: 100, components: 100, estimatedPhases: 100 };

describe('check-size shared foundation mapping (BE-03)', () => {
  // Three use cases, one per child: ceil(3 / 1) = 3 children, capped at the 3 use cases. AC-NN links one to one to UC-NN.
  function foundationProject(components, buildOrder) {
    const files = {};
    for (const uc of ['UC-01', 'UC-02', 'UC-03']) files[`req/use-cases/${uc}.md`] = `# ${uc}\n`;
    files['req/index.md'] = [
      '| ID | Criterion | Related UC |', '|---|---|---|',
      '| AC-01 | Criterion | UC-01 |', '| AC-02 | Criterion | UC-02 |', '| AC-03 | Criterion | UC-03 |', '',
    ].join('\n');
    files['spec/index.md'] = [
      '## 9. File Inventory', '', '### New files', '| Path | Purpose | Addresses | Domain | Spec |', '|---|---|---|---|---|',
      ...components.map(([p, ac]) => `| ${p} | purpose | ${ac} | BE | x |`), '',
      '## 11. Build order', '', ...buildOrder, '',
    ].join('\n');
    return makeProject(files, FOUNDATION_THRESHOLDS);
  }

  const proposalOf = (components, buildOrder) => {
    const { root, feature } = foundationProject(components, buildOrder);
    return runCheck(root, feature).result.proposal;
  };

  // src/core.js is in the third use-case block (part-3) and is the only path in a depth-0 item (item 1), so part-3 holds the foundation.
  const COMPONENTS_WITH_CORE = [['src/ui.js', 'AC-01'], ['src/api.js', 'AC-02'], ['src/core.js', 'AC-03']];
  const ORDER_WITH_CORE = [
    '1. Build src/core.js — depends on: none', '2. Wire src/ui.js — depends on: 1', '3. Wire src/api.js — depends on: 1',
  ];

  // No component path appears in a depth-0 item (item 1 is "Scaffold the project"), so no child holds the foundation.
  const COMPONENTS_NO_MATCH = [['src/ui.js', 'AC-01'], ['src/api.js', 'AC-02'], ['src/db.js', 'AC-03']];
  const ORDER_NO_MATCH = [
    '1. Scaffold the project — depends on: none', '2. Wire src/ui.js — depends on: 1', '3. Wire src/api.js — depends on: 1',
  ];

  describe('a depth-0 component match', () => {
    test('a depth-0 component moves its child to position 1 as the shared foundation', () => {
      const proposal = proposalOf(COMPONENTS_WITH_CORE, ORDER_WITH_CORE);
      expect(proposal.children[0].name).toBe('part-3');
    });

    test('the shared foundation owner is the child that holds the depth-0 component', () => {
      const proposal = proposalOf(COMPONENTS_WITH_CORE, ORDER_WITH_CORE);
      expect(proposal.sharedFoundationOwner).toBe('part-3');
    });

    test('the other children depend on the shared foundation child', () => {
      const proposal = proposalOf(COMPONENTS_WITH_CORE, ORDER_WITH_CORE);
      expect(proposal.children.slice(1).map(c => c.dependsOn)).toEqual([['part-3'], ['part-3']]);
    });

    test('the shared foundation child has no dependsOn', () => {
      const proposal = proposalOf(COMPONENTS_WITH_CORE, ORDER_WITH_CORE);
      expect(proposal.children[0].dependsOn).toEqual([]);
    });

    test('a depth-0 match leaves the foundationNote empty', () => {
      const proposal = proposalOf(COMPONENTS_WITH_CORE, ORDER_WITH_CORE);
      expect(proposal.foundationNote).toBe('');
    });

    test('every child has keywords as an empty array', () => {
      const proposal = proposalOf(COMPONENTS_WITH_CORE, ORDER_WITH_CORE);
      expect(proposal.children.map(c => c.keywords)).toEqual([[], [], []]);
    });
  });

  describe('no depth-0 match', () => {
    test('with no depth-0 match, no shared foundation owner is assigned', () => {
      const proposal = proposalOf(COMPONENTS_NO_MATCH, ORDER_NO_MATCH);
      expect(proposal.sharedFoundationOwner).toBeNull();
    });

    test('with no depth-0 match, the foundationNote states that no shared foundation was assigned', () => {
      const proposal = proposalOf(COMPONENTS_NO_MATCH, ORDER_NO_MATCH);
      expect(proposal.foundationNote)
        .toBe('no shared foundation assigned: no component matches depth-0 build-order items');
    });

    test('with no depth-0 match, every child has an empty dependsOn', () => {
      const proposal = proposalOf(COMPONENTS_NO_MATCH, ORDER_NO_MATCH);
      expect(proposal.children.map(c => c.dependsOn)).toEqual([[], [], []]);
    });

    test('with no depth-0 match, children keep their use-case order', () => {
      const proposal = proposalOf(COMPONENTS_NO_MATCH, ORDER_NO_MATCH);
      expect(proposal.children.map(c => c.name)).toEqual(['part-1', 'part-2', 'part-3']);
    });

    test('with no depth-0 match, every child has keywords as an empty array', () => {
      const proposal = proposalOf(COMPONENTS_NO_MATCH, ORDER_NO_MATCH);
      expect(proposal.children.map(c => c.keywords)).toEqual([[], [], []]);
    });
  });
});

describe('check-size split-proposed (moved from US-01-TASK-TEST-03)', () => {
  // One count (useCases, 3) above its threshold (1); the other counts are below theirs.
  function overThresholdProject() {
    const files = {};
    for (const uc of ['UC-01', 'UC-02', 'UC-03']) files[`req/use-cases/${uc}.md`] = `# ${uc}\n`;
    files['req/index.md'] = [
      '| ID | Criterion | Related UC |', '|---|---|---|',
      '| AC-01 | Criterion | UC-01 |', '| AC-02 | Criterion | UC-02 |', '| AC-03 | Criterion | UC-03 |', '',
    ].join('\n');
    files['spec/index.md'] = [
      '## 9. File Inventory', '', '### New files', '| Path | Purpose | Addresses | Domain | Spec |', '|---|---|---|---|---|',
      '| src/ui.js | purpose | AC-01 | BE | x |', '| src/api.js | purpose | AC-02 | BE | x |',
      '| src/core.js | purpose | AC-03 | BE | x |', '',
      '## 11. Build order', '', '1. Build src/core.js — depends on: none', '2. Wire src/ui.js — depends on: 1',
      '3. Wire src/api.js — depends on: 1', '',
    ].join('\n');
    return makeProject(files, FOUNDATION_THRESHOLDS);
  }

  test('one count above its threshold gives status split-proposed', () => {
    const { root, feature } = overThresholdProject();
    expect(runCheck(root, feature).result.status).toBe('split-proposed');
  });

  test('a split-proposed run names only the count above its threshold', () => {
    const { root, feature } = overThresholdProject();
    expect(runCheck(root, feature).result.over).toEqual(['useCases']);
  });

  test('a split-proposed run exits with code 0', () => {
    const { root, feature } = overThresholdProject();
    expect(runCheck(root, feature).code).toBe(0);
  });

  test('a split-proposed run reports the proposal source as measured', () => {
    const { root, feature } = overThresholdProject();
    expect(runCheck(root, feature).result.proposal.source).toBe('measured');
  });

  test('a split-proposed run gives every child empty keywords', () => {
    const { root, feature } = overThresholdProject();
    const { children } = runCheck(root, feature).result.proposal;
    expect(children.map(c => c.keywords)).toEqual([[], [], []]);
  });

  test('a split-proposed run prints exactly the keys status, counts, thresholds, over, unavailable and proposal', () => {
    const { root, feature } = overThresholdProject();
    const { result } = runCheck(root, feature);
    expect(Object.keys(result).sort()).toEqual(['counts', 'over', 'proposal', 'status', 'thresholds', 'unavailable']);
  });

  test('a split-proposed run leaves the project tree byte-for-byte unchanged', () => {
    const { root, feature } = overThresholdProject();
    const before = hashTree(root);
    runCheck(root, feature);
    expect(hashTree(root)).toEqual(before);
  });
});

describe('check-size build-order clause (review of the whole branch)', () => {
  test('a clause with "and" or a range is unavailable, never a silently shorter list', () => {
    for (const clause of ['1 and 1', '2–9 and 1', '1-3']) {
      const { root, feature } = makeProject({ 'spec/index.md': specWithOrder(['1. A — depends on: nothing', `2. B — depends on: ${clause}`]) });
      const { result, code } = runCheck(root, feature);
      expect(result.status).toBe('unavailable');
      expect(code).toBe(1);
      expect(phasesEntry(result).reason).toMatch(/text after its "depends on:" list/);
    }
  });

  test('a hyphen or an en dash before the clause and "Depends on" with a capital are accepted', () => {
    const { root, feature } = makeProject({ 'spec/index.md': specWithOrder(['1. A - Depends on: nothing', '2. B – depends on: 1']) });
    expect(runCheck(root, feature).result.counts[PHASES]).toBe(2);
  });

  test('a note introduced by a parenthesis or by punctuation after the list is accepted', () => {
    const { root, feature } = makeProject({ 'spec/index.md': specWithOrder([
      '1. A — depends on: nothing', '2. B — depends on: 1 (see the note below)', '3. C — depends on: none. Needs a decision first.']) });
    expect(runCheck(root, feature).result.counts[PHASES]).toBe(2);
  });
});
