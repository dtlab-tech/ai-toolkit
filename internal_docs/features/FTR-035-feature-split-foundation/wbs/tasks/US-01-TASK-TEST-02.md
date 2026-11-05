<a id="task-US-01-TASK-TEST-02"></a>
### US-01-TASK-TEST-02

- **Task ID:** US-01-TASK-TEST-02
- **Title:** Add comparison function tests to feature-split test file
- **Outcome:** tests/scripts/feature-split.test.js contains passing tests for the isOverThreshold boundary (30,30 false; 31,30 true) and the meetsMinimum boundary (2,2 true; 1,2 false). npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-03, INFRA-TASK-TEST-01
- **Acceptance criteria:** AC-08
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 8000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add threshold comparison tests

**Implementation notes:**

Scope: append one `describe` block with four boundary tests to `tests/scripts/feature-split.test.js`. The file already exists (created by INFRA-TASK-TEST-01). Do not modify or remove existing tests in it.

1. **Imports.** `isOverThreshold` and `meetsMinimum` come from `src/claude/scripts/feature-split.js` (exported by US-01-TASK-BE-03). If the file already destructures `lib` or these names at the top, reuse that binding. Do not add a second `require` of the same module.

2. **Runner conflict (Change gap 8).** The Tech-Spec assumes `node:test` + `node:assert`. The AGENTS.md convention inlined in the prompt shows Jest (`describe`/`test`/`expect`, `'use strict'`). Before writing, open the existing file and match the runner it already uses. If it uses Jest, use `expect`. If it uses `node:test`, use `assert.strictEqual`. If the file mixes both, stop and report it. Do not convert existing tests to a different runner.

3. **Scope of the cases.** These are pure functions with no filesystem access, so no fixtures or temp directories are needed. Each `test()` asserts one boundary, as the AGENTS.md rules require.

4. **Code to add** (Jest form shown; use the `assert` form if the file uses `node:test`):

```javascript
describe('threshold comparison boundaries', () => {
  test('isOverThreshold returns false when count equals the threshold (30, 30)', () => {
    expect(isOverThreshold(30, 30)).toBe(false);
  });

  test('isOverThreshold returns true when count is one above the threshold (31, 30)', () => {
    expect(isOverThreshold(31, 30)).toBe(true);
  });

  test('meetsMinimum returns true when count equals the minimum (2, 2)', () => {
    expect(meetsMinimum(2, 2)).toBe(true);
  });

  test('meetsMinimum returns false when count is below the minimum (1, 2)', () => {
    expect(meetsMinimum(1, 2)).toBe(false);
  });
});
```

5. **Overlap with US-01-TASK-TEST-01.** That sibling task edits the same file (loadConfig tests) and is not listed in this task's dependencies. Append your block at the end of the file, in its own `describe`, so a merge with that task is a simple append-append conflict at most. If the file has changed since it was read, re-read it before writing.

6. **Stop condition.** If `isOverThreshold` or `meetsMinimum` is not exported by `feature-split.js` at the time of implementation, US-01-TASK-BE-03 has not landed. Stop and report it; do not stub the functions in the test file.

**Verification commands:**

```
npm test -- --testPathPattern=feature-split.test
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```