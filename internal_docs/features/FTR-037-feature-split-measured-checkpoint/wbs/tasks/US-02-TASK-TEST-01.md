<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Test deterministic child grouping and component assignment in check-size
- **Outcome:** tests/scripts/feature-split-check-size.test.js has passing cases for the child count formula, contiguous use-case block sizes, component assignment through Addresses to the lowest Related UC, the no use-case link fallback to block 1, the child name, purpose and assigned fields, and the unavailable result when use cases are fewer than minChildren. A repeat run gives identical output.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-02, US-01-TASK-TEST-03
- **Acceptance criteria:** AC-10, AC-15
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 25000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** test check-size child grouping and component assignment

**Implementation notes:**

Scope: append one new `describe('check-size child grouping', ...)` block to `tests/scripts/feature-split-check-size.test.js`, created by US-01-TASK-TEST-01. Keep the existing blocks. Use this task's own helpers (named below) so the block does not depend on sibling helper signatures.

Framework: the Tech-Spec excerpt sketches `node:test` with ESM imports. AGENTS.md specifies Jest with CommonJS (`'use strict'`, `require`, `describe`/`test`/`expect`, `afterEach` cleanup, one behaviour per `test()`). This plan follows AGENTS.md. Run the file with `npx jest`, not `node --test`.

Items the excerpt does not define. Confirm each against the named source before writing, and change fixture strings to match if they differ:
- **Child count formula (BE-01):** the excerpt does not give the formula for N. The tests therefore pin N only where the bounds determine it: N is at least minChildren and at most the distinct use-case count. With 2 use cases and minChildren 2, N must be 2.
- **Config keys (FTR-035 D-02):** `minChildren` and the threshold key names (`useCases`, `acceptanceCriteria`, `components`, `estimatedPhases`) are assumed.
- **Table layouts (BE-02, BE-03):** the req/index.md AC table (`AC`, `Related UC` columns) and the spec/index.md component table (`Path`, `Status`, `Domain`, `Addresses` columns) are assumed.
- **`assigned` keys (BE-02):** the excerpt says "assigned list of use-case IDs and component Paths" without key names. This plan assumes `assigned.useCases` and `assigned.components`.
- **Build order marker (BE-04):** independent items are written `depends on: none`. Confirm that BE-04 accepts this form.
- **No-link note text (BE-02):** the excerpt says "no use-case link note" without wording. The test matches `/no use-case link/i`.
- **Unavailable count name:** the excerpt does not say which count is named when use cases are fewer than minChildren, so the test asserts only status, exit code, absent proposal and a non-empty `unavailable` array.

Helpers (add to the file once, under these names):

```javascript
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'src', 'claude', 'scripts', 'feature-split.js');
const PREFIX = 'FTR-900';
const LOW = { useCases: 1, acceptanceCriteria: 1, components: 1, estimatedPhases: 10 };
const created = [];

afterEach(() => {
  for (const root of created.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function makeGroupingProject({ thresholds = LOW, minChildren = 2, useCases, acRows, componentRows }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-size-group-'));
  created.push(root);
  fs.writeFileSync(path.join(root, 'feature-split.config.json'),
    JSON.stringify({ thresholds, minChildren }));
  const feature = path.join(root, 'internal_docs', 'features', 'FTR-900-fixture');
  fs.mkdirSync(path.join(feature, 'req', 'use-cases'), { recursive: true });
  fs.mkdirSync(path.join(feature, 'spec'), { recursive: true });
  for (const uc of useCases) {
    fs.writeFileSync(path.join(feature, 'req', 'use-cases', `${uc}.md`), `# ${uc}\n`);
  }
  fs.writeFileSync(path.join(feature, 'req', 'index.md'), [
    '| AC | Related UC | Text |', '|---|---|---|',
    ...acRows.map(([ac, uc]) => `| ${ac} | ${uc} | text |`),
  ].join('\n'));
  fs.writeFileSync(path.join(feature, 'spec', 'index.md'), [
    '| Path | Status | Domain | Addresses |', '|---|---|---|---|',
    ...componentRows.map(([p, addr]) => `| ${p} | New | BE | ${addr} |`),
    '', '## 11. Build order',
    '1. Core — depends on: none',
    '2. Edge — depends on: 1',
  ].join('\n'));
  return feature;
}

function check(root, feature) {
  let stdout;
  let code = 0;
  try {
    stdout = execFileSync(process.execPath,
      [SCRIPT, '--project', root, 'check-size', '--feature-dir', feature, '--prefix', PREFIX],
      { encoding: 'utf8' });
  } catch (e) {
    stdout = e.stdout;
    code = e.status;
  }
  return { stdout, code, result: JSON.parse(stdout) };
}
```

Each test builds its own project with `makeGroupingProject`, then calls `check(root, feature)`. The `root` is the first value returned by `makeGroupingProject`'s temp directory, so store it or return it. The sketch above returns only `feature`; if you need `root`, return `{ root, feature }` instead.

Representative tests (the full block follows the same pattern):

```javascript
describe('check-size child grouping', () => {
  const UC5 = ['UC-01', 'UC-02', 'UC-03', 'UC-04', 'UC-05'];
  const AC5 = UC5.map((uc, i) => [`AC-0${i + 1}`, uc]);
  const COMP5 = [['src/a.js', 'AC-01'], ['src/b.js', 'AC-02'], ['src/c.js', 'AC-03'],
                 ['src/d.js', 'AC-04'], ['src/e.js', 'AC-05']];

  test('child count is at least minChildren and at most the distinct use-case count', () => {
    const { root, feature } = makeGroupingProject({ useCases: UC5, acRows: AC5, componentRows: COMP5 });
    const { result } = check(root, feature);
    expect(result.status).toBe('split-proposed');
    expect(result.proposal.children.length).toBeGreaterThanOrEqual(2);
    expect(result.proposal.children.length).toBeLessThanOrEqual(5);
  });

  test('two use cases with minChildren 2 always give exactly two children', () => {
    const useCases = ['UC-01', 'UC-02'];
    const acRows = [['AC-01', 'UC-01'], ['AC-02', 'UC-02']];
    const componentRows = [['src/x.js', 'AC-01'], ['src/y.js', 'AC-02']];
    const { root, feature } = makeGroupingProject({ useCases, acRows, componentRows });
    const { result } = check(root, feature);
    expect(result.proposal.children).toHaveLength(2);
  });

  test('use-case blocks are contiguous, sorted, and the first remainder blocks are one larger', () => {
    const { root, feature } = makeGroupingProject({ useCases: UC5, acRows: AC5, componentRows: COMP5 });
    const { result } = check(root, feature);
    const n = result.proposal.children.length;
    const blocks = result.proposal.children.map(c => c.assigned.useCases);
    const expectedSizes = Array.from({ length: n },
      (_, k) => Math.floor(5 / n) + (k < 5 % n ? 1 : 0));
    expect(blocks.map(b => b.length)).toEqual(expectedSizes);
    expect(blocks.flat()).toEqual(UC5);
  });

  test('a component is assigned to the block of the lowest Related UC reachable through its Addresses', () => {
    // AC-01 relates to UC-02, AC-02 relates to UC-01: lowest reachable UC is UC-01 -> part-1
    const useCases = ['UC-01', 'UC-02'];
    const acRows = [['AC-01', 'UC-02'], ['AC-02', 'UC-01'], ['AC-03', 'UC-02']];
    const componentRows = [['src/mixed.js', 'AC-01, AC-02'], ['src/late.js', 'AC-03']];
    const { root, feature } = makeGroupingProject({ useCases, acRows, componentRows });
    const { result } = check(root, feature);
    expect(result.proposal.children[0].assigned.components).toContain('src/mixed.js');
    expect(result.proposal.children[1].assigned.components).toContain('src/late.js');
  });

  test('a component with no resolvable use-case link goes to block 1 with a no use-case link note', () => {
    const useCases = ['UC-01', 'UC-02'];
    const acRows = [['AC-01', 'UC-01'], ['AC-02', 'UC-02']];
    const componentRows = [['src/orphan.js', 'AC-99']];
    const { root, feature } = makeGroupingProject({ useCases, acRows, componentRows });
    const { result } = check(root, feature);
    expect(result.proposal.children[0].assigned.components).toContain('src/orphan.js');
    expect(JSON.stringify(result.proposal.children[0])).toMatch(/no use-case link/i);
  });

  test('children are named part-1, part-2 with purpose, summary and assigned fields', () => {
    const useCases = ['UC-01', 'UC-02'];
    const acRows = [['AC-01', 'UC-01'], ['AC-02', 'UC-02']];
    const componentRows = [['src/x.js', 'AC-01'], ['src/y.js', 'AC-02']];
    const { root, feature } = makeGroupingProject({ useCases, acRows, componentRows });
    const { result } = check(root, feature);
    const [p1, p2] = result.proposal.children;
    expect(p1.name).toBe('part-1');
    expect(p2.name).toBe('part-2');
    expect(p1.purpose).toMatch(/Use cases UC-01/);
    expect(p1.summary).toMatch(/their components/);
    expect(p2.summary).toMatch(/UC-02/);
    expect(Array.isArray(p1.assigned.useCases)).toBe(true);
    expect(Array.isArray(p1.assigned.components)).toBe(true);
  });

  test('one use case with minChildren 2 is unavailable with exit code 1 and no proposal', () => {
    const { root, feature } = makeGroupingProject({
      thresholds: { useCases: 0, acceptanceCriteria: 0, components: 0, estimatedPhases: 10 },
      useCases: ['UC-01'],
      acRows: [['AC-01', 'UC-01']],
      componentRows: [['src/x.js', 'AC-01']],
    });
    const { result, code } = check(root, feature);
    expect(result.status).toBe('unavailable');
    expect(code).toBe(1);
    expect(result.proposal).toBeUndefined();
    expect(result.unavailable.length).toBeGreaterThan(0);
  });

  test('a repeat run over the same fixture prints identical output', () => {
    const { root, feature } = makeGroupingProject({ useCases: UC5, acRows: AC5, componentRows: COMP5 });
    const first = check(root, feature);
    const second = check(root, feature);
    expect(second.stdout).toBe(first.stdout);
  });
});
```

Note on the `root` value: `makeGroupingProject` as sketched returns only `feature`. Change its return to `{ root, feature }` so the tests above destructure correctly.

Verification plan: the block must pass alone and as part of the full suite. Confirm that the test file contains no `node:test` import and no ESM `import` statements.

**Describe title (required).** Name the describe block of this task exactly `check-size child grouping` so that the first verification command can find it. The test file may already exist (an earlier task created it), so a check on the file alone is satisfied before this task is done.

**Verification commands:**

```
grep -qF "describe('check-size child grouping'" tests/scripts/feature-split-check-size.test.js
```

```
npx jest tests/scripts/feature-split-check-size.test.js
```

```
npm test
```