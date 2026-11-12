<a id="task-US-01-TASK-TEST-02"></a>
### US-01-TASK-TEST-02

- **Task ID:** US-01-TASK-TEST-02
- **Title:** Test check-size component rows and build-order phase counting
- **Outcome:** tests/scripts/feature-split-check-size.test.js has passing cases for component table row counting, including empty and missing table unavailable, build-order level counts for chain and diamond shapes, and unavailable reasons for dangling dependency, cycle and missing depends on clause.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-TEST-01, US-01-TASK-BE-03, US-01-TASK-BE-04
- **Acceptance criteria:** AC-07, AC-08, AC-09
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 14000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** test check-size component and build-order measurement

**Implementation notes:**

This task appends new `describe` blocks to `tests/scripts/feature-split-check-size.test.js`, which US-01-TASK-TEST-01 creates. Reuse TEST-01's temp-project harness. If TEST-01's harness differs from the copy below, keep TEST-01's version and drop this copy. Do not create a second file.

Runner conventions: AGENTS.md specifies Jest with CommonJS (`'use strict'`, `require`, `describe`/`test`/`expect`, `afterEach` cleanup). The Tech-Spec excerpt assumed `node:test` with ESM imports. AGENTS.md is authoritative, so this plan uses Jest. The excerpt's `runCheck` shape is kept.

Scope of this task: it asserts only the component row count and the build-order phase count. It does not assert the other counts, the threshold logic, or output keys (those belong to TEST-03).

Assumptions that must be confirmed against BE-03 and BE-04 before the tests are final. If any is wrong, change the fixture text, not the assertions:
1. The output key for the component count (`COMPONENTS`) and for the phase count (`PHASES`). The Tech-Spec test list uses `phases` in one place and `estimatedPhases` in BE-04, so the key is taken as `estimatedPhases`.
2. The Section 11 heading (`## 11. Build order`) and the dependency reference syntax (`depends on: 1`, `depends on: none`).
3. The component tables. A table counts when it has a `Path` column: the real Section 9 has `Path | Purpose | Addresses | Domain | Spec` (New files) and `Path | Change description | Addresses | Domain | Spec` (Modified files); the fixtures below use `Component | Path | Domain | Addresses`. Tables without a `Path` column never count.
4. T-2 is decided (Gate 1 decision 7, revised by the user on 2026-11-12 to option A): the component count is the union of the data rows of the tables with a `Path` column, a Path that appears in two tables counted once. The tests below pin the union, the de-duplication by Path and the scoping to Section 9.

Shared harness (append after TEST-01's imports and helpers, or reuse them):

```javascript
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'src', 'claude', 'scripts', 'feature-split.js');
const COMPONENTS = 'components';       // assumed key — confirm against BE-03
const PHASES = 'estimatedPhases';      // assumed key — confirm against BE-04
const THRESHOLDS = { useCases: 10, acceptanceCriteria: 10, components: 10, estimatedPhases: 10 };

const roots = [];
afterEach(() => { while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true }); });

function makeProject(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-size-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'feature-split.config.json'), JSON.stringify({ thresholds: THRESHOLDS }));
  const feature = path.join(root, 'internal_docs', 'features', 'FTR-900-fixture');
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(feature, rel)), { recursive: true });
    fs.writeFileSync(path.join(feature, rel), body);
  }
  return { root, feature };
}

function runCheck(root, feature) {
  let out;
  let code = 0;
  try {
    out = execFileSync(process.execPath,
      [SCRIPT, '--project', root, 'check-size', '--feature-dir', feature, '--prefix', 'FTR-900'],
      { encoding: 'utf8' });
  } catch (e) { out = e.stdout; code = e.status; }
  return { result: JSON.parse(out), code };
}

function componentTable(n) {
  const rows = Array.from({ length: n }, (_, i) => `| C${i} | src/x${i}.js | BE | AC-01 |`);
  return ['| Component | Path | Domain | Addresses |', '|---|---|---|---|', ...rows].join('\n');
}

function specWithOrder(orderLines) {
  return ['# Spec', '', '## Components', '', componentTable(1), '',
    '## 11. Build order', '', ...orderLines, ''].join('\n');
}

const phasesEntry = (result) => result.unavailable.find(u => u.count === PHASES);
```

Component row tests:

```javascript
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

  test('marks components unavailable when spec/index.md does not exist', () => {
    const { root, feature } = makeProject({ 'req/index.md': '# Req\n' });
    const { result } = runCheck(root, feature);
    const entry = result.unavailable.find(u => u.count === COMPONENTS);
    expect(entry).toBeDefined();
    expect(entry.reason.length).toBeGreaterThan(0);
  });
});
```

Build-order tests:

```javascript
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
```

Notes on the tests: the diamond case uses `depends on: 2, 3` (a comma-separated list), which is also an assumption to confirm against BE-04. Every test gets its own temp project, which `afterEach` removes. The static `tests/` path is resolved from `__dirname`, so the run does not depend on the working directory.

**Describe title (required).** Name the describe block of this task exactly `check-size component row count` so that the first verification command can find it. The test file may already exist (an earlier task created it), so a check on the file alone is satisfied before this task is done.

**Verification commands:**

```
grep -qF "describe('check-size component row count'" tests/scripts/feature-split-check-size.test.js
```

```
npx jest tests/scripts/feature-split-check-size.test.js --verbose
```

```
npm test
```