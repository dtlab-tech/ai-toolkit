<a id="task-US-02-TASK-TEST-02"></a>
### US-02-TASK-TEST-02

- **Task ID:** US-02-TASK-TEST-02
- **Title:** Test shared foundation mapping and empty keywords in check-size proposal
- **Outcome:** tests/scripts/feature-split-check-size.test.js has passing cases for a depth-0 component moving its child to position 1 as foundation with other children depending on it, and for the no depth-0 match case with a null owner, the explicit foundationNote and empty dependsOn. It also checks that every child has keywords as an empty array.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-03, US-02-TASK-TEST-01
- **Acceptance criteria:** AC-14
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** test check-size foundation mapping and empty keywords

**Implementation notes:**

This adds two `describe` blocks to the existing `tests/scripts/feature-split-check-size.test.js` created by US-02-TASK-TEST-01. It does not create a new file and does not change `feature-split.js`.

**Deviations from the Tech-Spec test design (required by the project conventions and the skeleton):**

- The design sketches Node `node:test` with ESM imports. AGENTS.md mandates Jest with CommonJS: `'use strict'`, `require`, `describe`/`test`/`expect`, and `afterEach` cleanup. Use Jest.
- The design marks foundation (item 14) and keywords (item 15) as `test.todo`. The skeleton requires passing cases. US-02-TASK-BE-03 now defines the mapping (exact case-sensitive Path substring against depth-0 Section 11 items, lowest block index moved to position 1, `foundationNote` text), so the cases can be concrete. Keywords are empty by US-01-TASK-BE-06.

**Excerpt gaps you must confirm before writing assertions.** The Tech-Spec excerpt does not fix these, so check them in `feature-split.js` and in the fixture helper that TEST-01 already wrote. Do not guess silently:

- Proposal key names: the children array (assumed `proposal.children`), each child's `dependsOn` and `keywords` fields, and `proposal.sharedFoundationOwner` / `proposal.foundationNote`. The assumed names below follow BE-03's wording.
- Component table column layout in `spec/index.md`, and which table is "the single component table". Reuse TEST-01's fixture writer rather than inventing a second layout.
- The Section 11 "no dependency" form (assumed `— depends on: none`). Confirm it is accepted by the BE-04 parser.
- Threshold config keys (placeholder names; take them from FTR-035 D-02, as TEST-01 does).

If any of these differ from what BE-01 to BE-03 actually emit, adjust the assertions to match the real output. Do not weaken them.

**Shared helper:** reuse TEST-01's `buildFeature` and `runCheck`. If TEST-01 did not export or define them in this shape, the sketch below shows the required behavior.

```javascript
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'src', 'claude', 'scripts', 'feature-split.js');
const PREFIX = 'FTR-900';
const roots = [];

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

// components: [{ path, ac, uc }]; buildOrder: array of Section 11 lines
function buildFeature({ components, buildOrder }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-size-foundation-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'feature-split.config.json'),
    JSON.stringify({ thresholds: { useCases: 1, acceptanceCriteria: 1, components: 1, estimatedPhases: 1 } }));
  const feature = path.join(root, 'internal_docs', 'features', 'FTR-900-fixture');
  const write = (rel, body) => {
    fs.mkdirSync(path.dirname(path.join(feature, rel)), { recursive: true });
    fs.writeFileSync(path.join(feature, rel), body);
  };
  write('req/index.md', '| AC | Text |\n|---|---|\n| AC-01 | a |\n| AC-02 | b |\n| AC-03 | c |\n| AC-04 | d |\n');
  for (const uc of ['UC-01', 'UC-02', 'UC-03', 'UC-04']) write(`req/use-cases/${uc}.md`, `# ${uc}\n`);
  const rows = components.map(c => `| ${c.path} | ${c.path} | ${c.ac} | ${c.uc} |`).join('\n');
  write('spec/index.md',
    '## Components\n| Component | Path | Addresses | Related UC |\n|---|---|---|---|\n' + rows +
    '\n\n## 11. Build order\n' + buildOrder.join('\n') + '\n');
  return { root, feature };
}

function runCheck(root, feature) {
  try {
    const out = execFileSync(process.execPath,
      [SCRIPT, '--project', root, 'check-size', '--feature-dir', feature, '--prefix', PREFIX],
      { encoding: 'utf8' });
    return { code: 0, result: JSON.parse(out) };
  } catch (e) {
    return { code: e.status, result: JSON.parse(e.stdout) };
  }
}
```

**Test block 1: depth-0 component becomes foundation at position 1.** The component `src/shared/util.js` is depth-0 and links to UC-04, the last block, so its child starts at the end and must be moved to position 1.

```javascript
describe('check-size shared foundation mapping (BE-03)', () => {
  const components = [
    { path: 'src/shared/util.js', ac: 'AC-04', uc: 'UC-04' },
    { path: 'src/a.js', ac: 'AC-01', uc: 'UC-01' },
    { path: 'src/b.js', ac: 'AC-02', uc: 'UC-02' },
    { path: 'src/c.js', ac: 'AC-03', uc: 'UC-03' },
  ];
  const buildOrder = [
    '1. Create src/shared/util.js — depends on: none',
    '2. Create src/a.js — depends on: 1',
    '3. Create src/b.js — depends on: 1',
    '4. Create src/c.js — depends on: 1',
  ];

  test('moves the depth-0 component child to position 1 and makes it the foundation owner', () => {
    const { root, feature } = buildFeature({ components, buildOrder });
    const { code, result } = runCheck(root, feature);
    expect(code).toBe(0);
    expect(result.status).toBe('split-proposed');
    const { children, sharedFoundationOwner } = result.proposal;
    expect(children.length).toBeGreaterThan(1);
    expect(children[0].assigned.components).toContain('src/shared/util.js');
    expect(sharedFoundationOwner).toBe(children[0].name);
  });

  test('every child other than the foundation depends on the foundation owner', () => {
    const { root, feature } = buildFeature({ components, buildOrder });
    const { result } = runCheck(root, feature);
    const { children, sharedFoundationOwner } = result.proposal;
    expect(children[0].dependsOn).toEqual([]);
    for (const child of children.slice(1)) {
      expect(child.dependsOn).toEqual([sharedFoundationOwner]);
    }
  });
});
```

**Test block 2: no depth-0 match.** No component Path appears in a depth-0 item, so the owner is null and the note is explicit.

```javascript
describe('check-size with no depth-0 component match (BE-03)', () => {
  const components = [
    { path: 'src/a.js', ac: 'AC-01', uc: 'UC-01' },
    { path: 'src/b.js', ac: 'AC-02', uc: 'UC-02' },
    { path: 'src/c.js', ac: 'AC-03', uc: 'UC-03' },
  ];
  const buildOrder = [
    '1. Scaffold repository layout — depends on: none',
    '2. Create src/a.js — depends on: 1',
    '3. Create src/b.js — depends on: 1',
    '4. Create src/c.js — depends on: 1',
  ];

  test('sets sharedFoundationOwner to null and every dependsOn to empty', () => {
    const { root, feature } = buildFeature({ components, buildOrder });
    const { result } = runCheck(root, feature);
    expect(result.status).toBe('split-proposed');
    expect(result.proposal.sharedFoundationOwner).toBeNull();
    for (const child of result.proposal.children) {
      expect(child.dependsOn).toEqual([]);
    }
  });

  test('states explicitly that no shared foundation is assigned', () => {
    const { root, feature } = buildFeature({ components, buildOrder });
    const { result } = runCheck(root, feature);
    expect(result.proposal.foundationNote).toMatch(/no shared foundation/i);
  });
});
```

**Test block 3: empty keywords.** Add this in the same file. It runs against the depth-0 fixture from block 1.

```javascript
describe('check-size proposal keywords (BE-06 / US-01-TASK-BE-06)', () => {
  test('every child has keywords as an empty array', () => {
    const { root, feature } = buildFeature({
      components: [
        { path: 'src/shared/util.js', ac: 'AC-04', uc: 'UC-04' },
        { path: 'src/a.js', ac: 'AC-01', uc: 'UC-01' },
      ],
      buildOrder: [
        '1. Create src/shared/util.js — depends on: none',
        '2. Create src/a.js — depends on: 1',
      ],
    });
    const { result } = runCheck(root, feature);
    expect(result.proposal.children.length).toBeGreaterThan(0);
    for (const child of result.proposal.children) {
      expect(Array.isArray(child.keywords)).toBe(true);
      expect(child.keywords).toEqual([]);
    }
  });
});
```

**Estimate basis:** one file, three small fixtures, and the field-name confirmation step. The estimate assumes the helper from TEST-01 is reused. If the proposal shape differs substantially from the assumptions above, the estimate rises but stays within the 15-minute band.

**Cases moved here from US-01-TASK-TEST-03.** `split-proposed` only exists once the grouping (US-02-TASK-BE-01, BE-02) and foundation (BE-03) rules are built, so these three cases belong to this task. Add them to the same file, with the helpers (`makeProject`, `filesFor`, `runCheck`, `hashTree`) that US-01-TASK-TEST-03 defines:

```javascript
  test('one count above its threshold gives split-proposed with a measured proposal', () => {
    const { root, feature } = makeProject({
      thresholds: { useCases: 1, acceptanceCriteria: 5, components: 5, estimatedPhases: 5 },
      files: filesFor({ ucCount: 2, acCount: 2, componentRows: 2, chain: 2 }),
    });
    const { result, code } = runCheck(root, feature);
    expect(result.status).toBe('split-proposed');
    expect(result.over).toEqual(['useCases']);
    expect(result.proposal.source).toBe('measured');
    expect(result.proposal.children.every(c => Array.isArray(c.keywords) && c.keywords.length === 0)).toBe(true);
    expect(code).toBe(0);
  });

  test('the printed key set of a split-proposed result includes proposal', () => {
    const splitFixture = makeProject({
      thresholds: { useCases: 1, acceptanceCriteria: 5, components: 5, estimatedPhases: 5 },
      files: filesFor({ ucCount: 2, acCount: 2, componentRows: 2, chain: 2 }),
    });
    const split = runCheck(splitFixture.root, splitFixture.feature).result;
    expect(Object.keys(split).sort())
      .toEqual(['counts', 'over', 'proposal', 'status', 'thresholds', 'unavailable']);
  });

  test('a split-proposed run leaves every file in the feature folder unchanged', () => {
    const { root, feature } = makeProject({
      thresholds: { useCases: 1, acceptanceCriteria: 5, components: 5, estimatedPhases: 5 },
      files: filesFor({ ucCount: 2, acCount: 2, componentRows: 2, chain: 2 }),
    });
    const before = hashTree(feature);
    const { result } = runCheck(root, feature);
    expect(result.status).toBe('split-proposed');
    expect(hashTree(feature)).toEqual(before);
  });
```

**Describe title (required).** Name the describe block of this task exactly `check-size shared foundation mapping (BE-03)` so that the first verification command can find it. The test file may already exist (an earlier task created it), so a check on the file alone is satisfied before this task is done.

**Verification commands:**

```
grep -qF "describe('check-size shared foundation mapping (BE-03)'" tests/scripts/feature-split-check-size.test.js
```

```
npx jest tests/scripts/feature-split-check-size.test.js --testNamePattern="foundation|no shared foundation|empty array"
```

```
npx jest tests/scripts/feature-split-check-size.test.js
```

```
npm test
```