<a id="task-US-01-TASK-TEST-03"></a>
### US-01-TASK-TEST-03

- **Task ID:** US-01-TASK-TEST-03
- **Title:** Test check-sizeط threshold boundary, status precedence and output keys
- **Outcome:** tests/scripts/feature-split-check-size.test.js has passing cases for a count equal to its threshold passing, unavailable taking precedence over over-threshold with no proposal and over still listed, exit codes, a read-only folder hash check, and the printed key set for passed. The split-proposed cases (one count above its threshold, the key set with proposal, a read-only folder check after split-proposed) are tested by US-02-TASK-TEST-02, because BE-06 only builds a proposal once the grouping and foundation rules of US-02-TASK-BE-01 to BE-03 exist.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-TEST-02, US-01-TASK-BE-06
- **Acceptance criteria:** AC-02, AC-03, AC-04, AC-05, AC-18
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 14000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** test check-size thresholds, precedence and output shape

**Implementation notes:**

This task adds cases to `tests/scripts/feature-split-check-size.test.js`, which TEST-01 creates and TEST-02 extends. Reuse their helpers if they exist. Do not create a second file.

Framework: AGENTS.md specifies Jest (CommonJS, `describe`/`test`/`expect`, `'use strict';`). The Tech-Spec excerpt assumes `node:test` with ESM imports, and that assumption is superseded by AGENTS.md. Follow AGENTS.md.

Not confirmed from the excerpt, so check them against the real code and FTR-035 before writing assertions:
- The exact FTR-035 D-02 threshold key names (the config file is `feature-split.config.json` with a `thresholds` object, as a placeholder).
- The count key names (`useCases`, `acceptanceCriteria`, `components`, `estimatedPhases`) as emitted by BE-02 to BE-04.
- The exact component-table and Section 11 build-order markup that BE-03 and BE-04 parse. Build fixtures to match those parsers, not to a guessed format.

If any of these cannot be confirmed from the code, say so in the test file header rather than guessing.

Harness: `runCheck` uses `spawnSync` so exit codes for non-zero runs (exit 1 on unavailable) are read directly, not via a thrown error.

```javascript
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'src', 'claude', 'scripts', 'feature-split.js');
const created = [];

function makeProject({ thresholds, files }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-size-'));
  created.push(root);
  fs.writeFileSync(path.join(root, 'feature-split.config.json'), JSON.stringify({ thresholds }));
  const feature = path.join(root, 'internal_docs', 'features', 'FTR-900-fixture');
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(feature, rel)), { recursive: true });
    fs.writeFileSync(path.join(feature, rel), body);
  }
  return { root, feature };
}

function runCheck(root, feature) {
  const r = spawnSync(process.execPath,
    [SCRIPT, '--project', root, 'check-size', '--feature-dir', feature, '--prefix', 'FTR-900'],
    { encoding: 'utf8' });
  return { result: JSON.parse(r.stdout), code: r.status };
}

function hashTree(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
    }
  };
  walk(dir);
  return out;
}

afterEach(() => {
  while (created.length) fs.rmSync(created.pop(), { recursive: true, force: true });
});
```

Fixture builder: `filesFor({ ucCount, acCount, componentRows, chain })` writes `req/use-cases/UC-01.md` … with one distinct `UC-NN` per file, `req/index.md` with `acCount` distinct `AC-NN` rows, `spec/index.md` with `componentRows` rows in the single component table, and a Section 11 build order matching BE-04's `N. text — depends on:` form. Each test sets `thresholds` explicitly. Do not rely on default thresholds.

Test cases to add (each its own `test()`, one behaviour each):

```javascript
describe('check-size threshold boundary and precedence', () => {
  test('a count equal to its threshold is not over and the check passes', () => {
    const { root, feature } = makeProject({
      thresholds: { useCases: 2, acceptanceCriteria: 2, components: 2, estimatedPhases: 2 },
      files: filesFor({ ucCount: 2, acCount: 2, componentRows: 2, chain: 2 }),
    });
    const { result, code } = runCheck(root, feature);
    expect(result.status).toBe('passed');
    expect(result.over).toEqual([]);
    expect(code).toBe(0);
    expect(result).not.toHaveProperty('proposal');
  });

  test('unavailable takes precedence over over-threshold, with no proposal and over still listed', () => {
    const files = filesFor({ ucCount: 3, acCount: 2, componentRows: 2, chain: 2 });
    delete files['req/index.md']; // makes acceptanceCriteria unavailable
    const { root, feature } = makeProject({
      thresholds: { useCases: 1, acceptanceCriteria: 1, components: 5, estimatedPhases: 5 },
      files,
    });
    const { result, code } = runCheck(root, feature);
    expect(result.status).toBe('unavailable');
    expect(code).toBe(1);
    expect(result).not.toHaveProperty('proposal');
    expect(result.over).toContain('useCases');
    expect(result.unavailable).toEqual([
      expect.objectContaining({ count: 'acceptanceCriteria', reason: expect.any(String) }),
    ]);
  });

  test('the printed key set is exactly the documented keys for passed', () => {
    const passedFixture = makeProject({
      thresholds: { useCases: 5, acceptanceCriteria: 5, components: 5, estimatedPhases: 5 },
      files: filesFor({ ucCount: 1, acCount: 1, componentRows: 1, chain: 1 }),
    });
    const passed = runCheck(passedFixture.root, passedFixture.feature).result;
    expect(Object.keys(passed).sort()).toEqual(['counts', 'over', 'status', 'thresholds', 'unavailable']);
  });

  test('a passed run leaves every file in the feature folder unchanged', () => {
    const { root, feature } = makeProject({
      thresholds: { useCases: 5, acceptanceCriteria: 5, components: 5, estimatedPhases: 5 },
      files: filesFor({ ucCount: 1, acCount: 1, componentRows: 1, chain: 1 }),
    });
    const before = hashTree(feature);
    const { result } = runCheck(root, feature);
    expect(result.status).toBe('passed');
    expect(hashTree(feature)).toEqual(before);
  });
});
```

Notes on the tests above:
- The "exit codes" requirement is covered by the `code` assertions: 0 for `passed`, 1 for `unavailable` (the code of `split-proposed` is asserted by US-02-TASK-TEST-02). `skipped` exit 0 is covered by TEST-01.
- The key-set test asserts `thresholds` and `counts` key names only through the existing config keys; confirm the exact FTR-035 names and adjust the literals if they differ.
- Mapping to AC-02 to AC-05 and AC-18 is by subject (threshold comparison, status precedence, proposal shape, read-only behaviour, output shape), not by AC wording, which the excerpt does not contain. Confirm against the Requirements.
- Do not assert any Keywords values beyond the empty array from BE-06. Do not add `test.todo` entries here; those belong to TEST-02 and the open gaps.

Stop and report if BE-06's proposal shape (`proposal.children`, per-child `keywords`) differs from what the test assumes.

**Describe title (required).** Name the describe block of this task exactly `check-size threshold boundary and precedence` so that the first verification command can find it. The test file may already exist (an earlier task created it), so a check on the file alone is satisfied before this task is done.

**Verification commands:**

```
grep -qF "describe('check-size threshold boundary and precedence'" tests/scripts/feature-split-check-size.test.js
```

```
npx jest tests/scripts/feature-split-check-size.test.js
```

```
npm test
```