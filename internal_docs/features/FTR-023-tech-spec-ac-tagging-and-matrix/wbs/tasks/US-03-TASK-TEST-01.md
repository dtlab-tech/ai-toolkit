<a id="task-US-03-TASK-TEST-01"></a>
### US-03-TASK-TEST-01

- **Task ID:** US-03-TASK-TEST-01
- **Title:** Unit tests for computeTechSpecCoverage and the extended renderMatrix column
- **Outcome:** tests/ac-task-matrix.test.js (extended) covers: an AC addressed by one file, an AC addressed by two files, an AC addressed by zero files, and renderMatrix called both with and without the 4th techSpecCoverage argument, confirming the backward-compatible default renders em-dash
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-05, AC-07
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for ac-task-matrix.js's Tech-Spec coverage extension

**Implementation notes:**

Add to the existing `tests/ac-task-matrix.test.js` (from FTR-022) — import
`computeTechSpecCoverage` alongside the existing `computeCoverage`/`renderMatrix` imports:

```js
describe('computeTechSpecCoverage()', () => {
  test('an AC addressed by one file', () => {
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Must', allowedUserStories: ['US-01'], unscoped: false }]);
    const coverage = computeTechSpecCoverage([{ filePath: 'a.js', acIds: ['AC-01'] }], acMap);
    expect([...coverage.get('AC-01')]).toEqual(['a.js']);
  });

  test('an AC addressed by two files', () => {
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Must', allowedUserStories: ['US-01'], unscoped: false }]);
    const coverage = computeTechSpecCoverage(
      [{ filePath: 'a.js', acIds: ['AC-01'] }, { filePath: 'b.js', acIds: ['AC-01'] }], acMap);
    expect([...coverage.get('AC-01')].sort()).toEqual(['a.js', 'b.js']);
  });

  test('an AC addressed by zero files yields an empty set', () => {
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Should', allowedUserStories: ['US-01'], unscoped: false }]);
    const coverage = computeTechSpecCoverage([{ filePath: 'a.js', acIds: [] }], acMap);
    expect(coverage.get('AC-01').size).toBe(0);
  });

  test('a file citing an AC ID absent from acMap is silently skipped', () => {
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Should', allowedUserStories: ['US-01'], unscoped: false }]);
    expect(() => computeTechSpecCoverage([{ filePath: 'a.js', acIds: ['AC-99'] }], acMap)).not.toThrow();
  });
});

describe('renderMatrix() — Tech-Spec column (FTR-023)', () => {
  test('without a 4th argument, the new column renders em-dash (backward compatible)', () => {
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Should', allowedUserStories: ['US-01'], unscoped: false }]);
    const coverage = new Map([['AC-01', { taskIds: new Set(), phaseIds: new Set() }]]);
    const md = renderMatrix('FTR-TEST', acMap, coverage); // no 4th arg
    expect(md).toMatch(/\| AC-01 \| x \| Should \| UC-01 \| — \| — \| — \|/);
  });

  test('with techSpecCoverage, the new column lists the addressing file(s)', () => {
    const acMap = acMapWith([{ id: 'AC-01', criterion: 'x', priority: 'Should', allowedUserStories: ['US-01'], unscoped: false }]);
    const coverage = new Map([['AC-01', { taskIds: new Set(), phaseIds: new Set() }]]);
    const techSpecCoverage = new Map([['AC-01', new Set(['a.js'])]]);
    const md = renderMatrix('FTR-TEST', acMap, coverage, techSpecCoverage);
    expect(md).toContain('| AC-01 | x | Should | UC-01 | a.js | — | — |');
  });
});
```

Note the header-row/column-count change: every existing `renderMatrix()` test from FTR-022
(`tests/ac-task-matrix.test.js`'s own pre-existing tests) that matches against a full row string
(e.g. the "zero coverage renders em-dash" and "unscoped AC" tests) must be updated for the new
7-column row shape (`| AC ID | Criterion | Priority | Related UC | Addressed by Tech-Spec
File(s) | Covering Task(s) | Covering Phase(s) |`) — an extra `| — |` (or the real value) is now
expected between the "Related UC" and "Covering Task(s)" cells in every existing assertion
string. Update them in place; do not leave the old 6-column expectations alongside the new ones.

**Verification commands:**

```
npx jest --testPathPattern=tests/ac-task-matrix.test.js
```
