<a id="task-INFRA-TASK-TEST-01"></a>
### INFRA-TASK-TEST-01

- **Task ID:** INFRA-TASK-TEST-01
- **Title:** Unit tests for wb-graph-checks.js functions
- **Outcome:** tests/wb-graph-checks.test.js exists covering all 11 exported functions directly, reusing fixtures from tests/wb-validate.checks-1-7.test.js, tests/wb-validate.checks-8-10.test.js, tests/wb-validate.checks-11.test.js, tests/wb-validate.checks-12-14.test.js, and tests/wb-validate.checks-19-21.test.js
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 25000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for wb-graph-checks.js

**Implementation notes:**

For each function, test one passing case and one failing case directly against the function —
no CLI invocation, no `process.exit`, just plain `require()` and assert on the returned array.
Reuse the `{ phases: [...] }` fixture objects already defined inline in the existing
`tests/wb-validate.checks-*.test.js` files (they build small hand-written phase/task structures
per check — copy those literal fixtures rather than inventing new ones, so this test suite stays
provably equivalent to what the pre-extraction `wb-validate.js` was already verified against).

```js
'use strict';
const { checkUniqueTaskIds, checkTaskIdFormat, /* ...all 11... */ ERRORS } =
  require('../src/claude/scripts/wb-graph-checks');

describe('checkUniqueTaskIds()', () => {
  test('passes when all task IDs are unique', () => {
    const { errors } = checkUniqueTaskIds({ phases: [
      { id: 'INFRA', tasks: [{ id: 'INFRA-TASK-BE-01' }] },
      { id: 'US-01', tasks: [{ id: 'US-01-TASK-BE-01' }] },
    ] });
    expect(errors).toHaveLength(0);
  });

  test('flags a task ID that appears in two phases', () => {
    const { errors } = checkUniqueTaskIds({ phases: [
      { id: 'INFRA', tasks: [{ id: 'DUP-ID' }] },
      { id: 'US-01', tasks: [{ id: 'DUP-ID' }] },
    ] });
    expect(errors).toHaveLength(1);
    expect(errors[0].category).toBe(ERRORS.UNIQUE_ID_VIOLATION);
  });
});
```

Repeat this pattern for the other 10 functions (`checkTaskCycle`/`checkPhaseDependencyAndCycle`
need a slightly bigger fixture — at least 3 tasks/phases to express a real cycle; reuse the exact
cyclic fixture already in `tests/wb-validate.checks-11.test.js`). For `checkAcCoverage`, build the
`acMap` fixture the same way `tests/wb-validate.checks-19-21.test.js` does (a `Map` with
`{ id, priority, allowedUserStories, unscoped }` entries) rather than calling the real
`parseAcTable` against a file — that keeps this test suite independent of file I/O.

**Verification commands:**

```
npx jest --testPathPattern=tests/wb-graph-checks.test.js
```
