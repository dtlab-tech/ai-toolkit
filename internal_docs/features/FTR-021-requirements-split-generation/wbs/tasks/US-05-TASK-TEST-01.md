<a id="task-US-05-TASK-TEST-01"></a>
### US-05-TASK-TEST-01

- **Task ID:** US-05-TASK-TEST-01
- **Title:** Tests for req-skeleton-check.js exit-code contract
- **Outcome:** tests/req-skeleton-check.test.js exists asserting the 0/1/2 exit-code contract against a handful of fixture index.md files (clean, findings, unparseable)
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-05-TASK-BE-01
- **Acceptance criteria:** AC-08
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add req-skeleton-check.js exit-code contract tests

**Implementation notes:**

Invoke the CLI as a real subprocess (mirrors `wb-skeleton-check.test.js`'s shape), not via
`require`, since the exit code itself is the contract under test:

```js
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, '../src/claude/scripts/req-skeleton-check.js');
const FIXTURES = path.join(__dirname, 'fixtures');

function run(fixtureName) {
  try {
    const stdout = execFileSync('node', [SCRIPT, path.join(FIXTURES, fixtureName)], { encoding: 'utf8' });
    return { exitCode: 0, report: JSON.parse(stdout) };
  } catch (e) {
    return { exitCode: e.status, report: JSON.parse(e.stdout) };
  }
}

test('exits 0 on a clean index.md', () => {
  const { exitCode, report } = run('ftr-021-req-clean/index.md');
  expect(exitCode).toBe(0);
  expect(report.valid).toBe(true);
});

test('exits 1 with findings on a dangling cross-reference', () => {
  const { exitCode, report } = run('ftr-021-req-dangling-ref/index.md');
  expect(exitCode).toBe(1);
  expect(report.errors.some(e => e.category === 'DANGLING_AC_UC_REFERENCE')).toBe(true);
});

test('exits 2 on an unparseable index.md (no Use Cases table)', () => {
  const { exitCode } = run('ftr-021-req-unparseable/index.md');
  expect(exitCode).toBe(2);
});
```

**Verification commands:**

```
npx jest --testPathPattern=tests/req-skeleton-check.test.js
```
