<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Integration test: pm-phase1 resume-by-existence dispatches only missing use cases
- **Outcome:** tests/pm-phase1-req-resume.test.js exists: a pre-seeded req/ directory with some use-case files already present is run through pm-phase1.js's per-UC loop with a stubbed dispatch counting invocations; asserts exactly the missing UCs dispatch a call, and a legacy (non-req/) feature's existing Requirements.md still passes assertCompleteSections and preserves docsDigest behavior unchanged
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-04
- **Acceptance criteria:** AC-03, AC-08
- **Estimate — agent minutes:** 17
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add pm-phase1 requirements resume-by-existence integration test

**Implementation notes:**

Since `pm-phase1.js` runs under `lib/workflow-runner.js`'s sandboxed `AsyncFunction` and cannot be
`require`d directly, this test mirrors the existing `tests/helpers/pm-phase2-flow.js` pattern
(FTR-020): a hand-synced mirror of the selection predicate, plus a source-text check that the
real script still contains the matching condition, so the mirror cannot silently drift unnoticed.

```js
'use strict';
const fs = require('fs');
const path = require('path');

function selectPendingUcIds(ucTable, reqDir, existsFn) {
  return ucTable.filter(row => !existsFn(`${reqDir}/${row.file}`)).map(row => row.id)
}

const PM_PHASE1_SOURCE = fs.readFileSync(
  path.join(__dirname, '../src/claude/workflows/pm-phase1.js'), 'utf8');

describe('pm-phase1 requirements resume-by-existence: mirror stays in sync with the real script', () => {
  test('pm-phase1.js still contains the exact resume-by-existence condition the mirror replicates', () => {
    expect(PM_PHASE1_SOURCE).toContain("if (c.exists(ucPath)) continue");
  });
});

describe('selectPendingUcIds()', () => {
  test('dispatches only UC IDs whose detail file is missing', () => {
    const ucTable = [
      { id: 'UC-01', file: 'use-cases/UC-01.md' },
      { id: 'UC-02', file: 'use-cases/UC-02.md' },
    ];
    const existing = new Set(['/req/use-cases/UC-01.md']);
    expect(selectPendingUcIds(ucTable, '/req', p => existing.has(p))).toEqual(['UC-02']);
  });

  test('dispatches nothing when every UC file already exists', () => {
    const ucTable = [{ id: 'UC-01', file: 'use-cases/UC-01.md' }];
    expect(selectPendingUcIds(ucTable, '/req', () => true)).toEqual([]);
  });

  test('dispatches every UC on a fresh skeleton (no files yet)', () => {
    const ucTable = [{ id: 'UC-01', file: 'use-cases/UC-01.md' }, { id: 'UC-02', file: 'use-cases/UC-02.md' }];
    expect(selectPendingUcIds(ucTable, '/req', () => false)).toEqual(['UC-01', 'UC-02']);
  });
});

describe('legacy-feature regression (AC-07)', () => {
  test('a feature with only a monolithic Requirements.md still passes assertCompleteSections(9) unchanged', () => {
    // Build a temp feature dir with {PREFIX}-Requirements.md only (no req/ directory), run
    // pm-phase1's existing freshness+assertCompleteSections logic against it (reuse whatever
    // harness tests/pm-phase1.*.test.js already has for this), assert no behavior change.
  });
});
```

**Verification commands:**

```
npx jest --testPathPattern=tests/pm-phase1-req-resume.test.js
```
