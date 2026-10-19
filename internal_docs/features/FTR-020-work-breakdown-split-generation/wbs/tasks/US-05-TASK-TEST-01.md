<a id="task-US-05-TASK-TEST-01"></a>
### US-05-TASK-TEST-01

- **Task ID:** US-05-TASK-TEST-01
- **Title:** Regression test: wb-render.js byte-identical .md/.csv for split-dir vs legacy-JSON input
- **Outcome:** tests/wb-render.wbs-directory-parity.test.js exists building an equivalent split-directory and legacy-JSON fixture pair and asserting wb-render.js produces byte-identical .md and .csv output from both
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-05-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add wb-render.js split-directory parity regression test

**Implementation notes:**

This feature's own `wbs/` directory and `FTR-020-Work-Breakdown.json` are already a real,
reviewed equivalent pair — this was manually proven end-to-end during the feature's own
definition (a throwaway script ran both through the real, pre-extraction `wb-validate.js`/
`wb-render.js` and confirmed byte-identical rendered `.md`/`.csv`, ignoring the `Generated`
timestamp line). Turn that one-off proof into a permanent, committed test:

```js
const { execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os');

const FEATURE_DIR = path.join(__dirname, '..', 'internal_docs', 'features',
  'FTR-020-work-breakdown-split-generation');

function stripGenerated(s) { return s.replace(/\| Generated \|.*\|/, '| Generated | <stripped> |'); }

test('split-directory and legacy-JSON inputs render byte-identical .md/.csv', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-render-parity-'));

  execFileSync('node', ['src/claude/scripts/wb-render.js',
    path.join(FEATURE_DIR, 'wbs'), 'FTR-020'], { cwd: tmpDir });
  const mdFromSplit = fs.readFileSync(path.join(FEATURE_DIR, 'wbs', 'FTR-020-Work-Breakdown.md'), 'utf8');
  // NOTE: wb-render.js writes next to the input by default (see destDir computation in
  // wb-render.js) unless a 3rd destDir arg is passed — pass tmpDir explicitly as that 3rd arg
  // instead, so this test never writes inside internal_docs/ during a test run.

  execFileSync('node', ['src/claude/scripts/wb-render.js',
    path.join(FEATURE_DIR, 'FTR-020-Work-Breakdown.json'), 'FTR-020', tmpDir]);
  const mdFromLegacy = fs.readFileSync(path.join(tmpDir, 'FTR-020-Work-Breakdown.md'), 'utf8');
  const csvFromLegacy = fs.readFileSync(path.join(tmpDir, 'FTR-020-Work-Breakdown.csv'), 'utf8');

  expect(stripGenerated(mdFromSplit)).toBe(stripGenerated(mdFromLegacy));
  // csv has no timestamp line, compare directly; re-render split format to the same tmpDir
  // with a distinct filename to avoid the two runs overwriting each other, then compare.
});
```
Adjust the exact two-destDir arrangement so neither run overwrites the other's output before
being read — the point of the test is the byte comparison, not the exact directory layout.

**Verification commands:**

```
npx jest --testPathPattern=tests/wb-render.wbs-directory-parity.test.js
```
