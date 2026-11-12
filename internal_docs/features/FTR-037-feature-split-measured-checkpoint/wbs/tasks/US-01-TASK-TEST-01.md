<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Test check-size skipped status and distinct UC and AC counts
- **Outcome:** tests/scripts/feature-split-check-size.test.js exists with a temp-project CLI harness and passing cases for skipped on Approvals.md, wbs/ or epic.md, a non-existent folder treated as new, and distinct UC-NN and AC-NN counting.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-02
- **Acceptance criteria:** AC-01, AC-18
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 14000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** test check-size skipped status and UC and AC counts

**Implementation notes:**

This task creates `tests/scripts/feature-split-check-size.test.js` with a reusable harness and four behaviour groups. TEST-02 and TEST-03 will append cases to the same file, so the helpers stay at the top and each group is its own `describe`.

Deviations from the Tech-Spec excerpt, to resolve when writing:

1. **Runner.** The excerpt assumes `node:test`. AGENTS.md specifies Jest (`npm test` runs Jest, CommonJS, `'use strict'`, `require`). This file uses Jest globals (`describe`, `test`, `expect`) and `require`, not `import`.
2. **Config keys.** The FTR-035 `feature-split.config.json` key names are not in the excerpt. The threshold keys below are placeholders and must be replaced with the FTR-035 D-02 names. The thresholds are explicit test values, not defaults.
3. **Count key names.** The assertions use `counts.useCases` and `counts.acceptanceCriteria`, the names BE-02 uses. Confirm them against FTR-035 D-02 and adjust if they differ.
4. **Skipped representation.** The skipped assertion assumes BE-01 returns `counts` as `null` (or omits it) for `skipped`. If BE-01 uses `{}`, change only that one assertion.
5. **Marker location.** The skip markers (`FTR-900-Approvals.md`, `wbs/`, `epic.md`) are placed directly in the feature folder, as in the design. Confirm against BE-01's `isNewFeature`.

The non-existent-folder case uses a feature path that is never created. Since `check-size` is read-only, it does not create the folder, so it is measured and reports `unavailable` for the missing sources. The test only asserts that it is not `skipped` and that `useCases` is listed as unavailable.

Write the file as follows:

```javascript
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
  // Placeholder keys: replace with FTR-035 D-02 names. Values are test-only, not defaults.
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
    expect(result.counts ?? null).toBeNull();
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
```

Do not add the component or build-order cases here (TEST-02), the threshold or key-set cases (TEST-03), or any `test.todo` placeholders. Do not modify `feature-split.js`. If BE-01 or BE-02 behaves differently from the assumptions above, stop and report the mismatch rather than changing the implementation.

**Verification commands:**

```
npx jest tests/scripts/feature-split-check-size.test.js
```

```
test -f tests/scripts/feature-split-check-size.test.js
```

```
npm test
```