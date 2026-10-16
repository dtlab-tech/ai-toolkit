<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Unit tests for ac-task-matrix.js's computeCoverage and renderMatrix
- **Outcome:** tests/ac-task-matrix.test.js exists covering: an AC covered by one task, an AC covered by two tasks in two different phases (both phases listed), an unscoped (All UCs) AC, an AC with zero covering tasks (renders em-dash), and row order matching acMap's insertion order
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-01, AC-02, AC-03, AC-04, AC-06
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for ac-task-matrix.js

**Implementation notes:**

Build small, hand-written `wb`/`acMap` fixtures directly (no file I/O), mirroring the style
`tests/wb-graph-checks.test.js` already uses for `checkAcCoverage`:

```js
'use strict';
const { computeCoverage, renderMatrix } = require('../src/claude/scripts/ac-task-matrix');

function wbWith(phases) { return { schemaVersion: 2, feature: 'FTR-TEST', phases }; }
function acMapWith(entries) { return new Map(entries.map(e => [e.id, e])); }

describe('computeCoverage()', () => {
  test('an AC covered by one task in one phase', () => {
    const wb = wbWith([{ id: 'US-01', tasks: [{ id: 'US-01-TASK-BE-01', acceptanceCriteria: ['AC-01'] }] }]);
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Must', allowedUserStories: ['US-01'], unscoped: false }]);
    const coverage = computeCoverage(wb, acMap);
    expect([...coverage.get('AC-01').taskIds]).toEqual(['US-01-TASK-BE-01']);
    expect([...coverage.get('AC-01').phaseIds]).toEqual(['US-01']);
  });

  test('an AC covered by two tasks in two different phases lists both', () => {
    const wb = wbWith([
      { id: 'US-01', tasks: [{ id: 'US-01-TASK-BE-01', acceptanceCriteria: ['AC-01'] }] },
      { id: 'US-02', tasks: [{ id: 'US-02-TASK-BE-01', acceptanceCriteria: ['AC-01'] }] },
    ]);
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Must', allowedUserStories: ['US-01', 'US-02'], unscoped: false }]);
    const coverage = computeCoverage(wb, acMap);
    expect([...coverage.get('AC-01').taskIds].sort()).toEqual(['US-01-TASK-BE-01', 'US-02-TASK-BE-01']);
    expect([...coverage.get('AC-01').phaseIds].sort()).toEqual(['US-01', 'US-02']);
  });

  test('an AC with zero covering tasks yields empty sets, not an error', () => {
    const wb = wbWith([{ id: 'US-01', tasks: [{ id: 'US-01-TASK-BE-01', acceptanceCriteria: [] }] }]);
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Should', allowedUserStories: ['US-01'], unscoped: false }]);
    const coverage = computeCoverage(wb, acMap);
    expect(coverage.get('AC-01').taskIds.size).toBe(0);
  });

  test('a task citing an AC ID absent from acMap is silently skipped (wb-validate.js\'s job, not this one)', () => {
    const wb = wbWith([{ id: 'US-01', tasks: [{ id: 'US-01-TASK-BE-01', acceptanceCriteria: ['AC-99'] }] }]);
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Should', allowedUserStories: ['US-01'], unscoped: false }]);
    expect(() => computeCoverage(wb, acMap)).not.toThrow();
  });
});

describe('renderMatrix()', () => {
  test('rows appear in acMap insertion order', () => {
    const acMap = acMapWith([
      { id: 'AC-02', criterion: 'second', priority: 'Must', allowedUserStories: ['US-01'], unscoped: false },
      { id: 'AC-01', criterion: 'first', priority: 'Must', allowedUserStories: ['US-01'], unscoped: false },
    ]);
    const coverage = new Map([['AC-02', { taskIds: new Set(), phaseIds: new Set() }], ['AC-01', { taskIds: new Set(), phaseIds: new Set() }]]);
    const md = renderMatrix('FTR-TEST', acMap, coverage);
    expect(md.indexOf('AC-02')).toBeLessThan(md.indexOf('AC-01'));
  });

  test('zero coverage renders em-dash in both cells', () => {
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Should', allowedUserStories: ['US-01'], unscoped: false }]);
    const coverage = new Map([['AC-01', { taskIds: new Set(), phaseIds: new Set() }]]);
    const md = renderMatrix('FTR-TEST', acMap, coverage);
    expect(md).toMatch(/\| AC-01 \| x \| Should \| UC-01 \| — \| — \|/);
  });

  test('an unscoped AC renders "All UCs" in the Related UC column', () => {
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Must', allowedUserStories: [], unscoped: true }]);
    const coverage = new Map([['AC-01', { taskIds: new Set(['T-01']), phaseIds: new Set(['US-01']) }]]);
    const md = renderMatrix('FTR-TEST', acMap, coverage);
    expect(md).toContain('| AC-01 | x | Must | All UCs | T-01 | US-01 |');
  });
});
```

**Verification commands:**

```
npx jest --testPathPattern=tests/ac-task-matrix.test.js
```
