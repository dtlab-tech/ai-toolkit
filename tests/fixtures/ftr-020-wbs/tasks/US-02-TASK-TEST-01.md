<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Regression test: wb-validate.js output byte-identical before/after extraction
- **Outcome:** tests/wb-validate.extraction-regression.test.js exists running wb-validate.js against the existing checks-1-7/8-10/11/12-14/15-18/19-21/22-23 fixtures and asserting identical JSON report and exit code to the pre-extraction baseline
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01, US-02-TASK-BE-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add wb-validate.js extraction regression test

**Implementation notes:**

Every existing `tests/wb-validate.checks-*.test.js` file already writes a fixture JSON to a temp
file and asserts on `wb-validate.js`'s CLI output (via `execFileSync` or similar) — this task does
not replace those tests, it adds one more that specifically targets the risk the extraction
(US-02-TASK-BE-01/BE-02) introduces: that moving code around silently changed behavior.

```js
const { execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os');

// Reuse the SAME fixture-building helpers each tests/wb-validate.checks-*.test.js already
// defines (or export them from a shared tests/fixtures/wb-validate-fixtures.js if duplicated
// across files) rather than inventing new fixture JSON here.
const FIXTURES = [
  require('./fixtures/checks-1-7-valid.json'),
  require('./fixtures/checks-8-10-cycle.json'),
  // ...one entry per existing checks-*.test.js fixture...
];

describe('wb-validate.js extraction regression', () => {
  test.each(FIXTURES)('fixture %#: report matches the pre-extraction baseline', (fixture) => {
    const tmp = path.join(os.tmpdir(), `wb-validate-regression-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(fixture));
    const result = require('child_process').spawnSync('node',
      ['src/claude/scripts/wb-validate.js', tmp], { encoding: 'utf8' });
    const report = JSON.parse(result.stdout);
    // Compare against the SAME expectations each checks-*.test.js file already encodes —
    // import or re-derive them, don't hand-roll a new "expected" object here.
    expect(report.valid).toBe(fixture.expectedValid);
    expect(report.errors.map(e => e.category)).toEqual(fixture.expectedErrorCategories);
  });
});
```
If the existing `checks-*.test.js` files don't already expose their fixtures as importable
modules, that's a small prerequisite refactor within this task (extract the inline fixture object
literals to `tests/fixtures/*.json` or a shared helper) — not a new design decision, just making
already-duplicated test data reusable.

**Verification commands:**

```
npx jest --testPathPattern=tests/wb-validate.extraction-regression.test.js
```
