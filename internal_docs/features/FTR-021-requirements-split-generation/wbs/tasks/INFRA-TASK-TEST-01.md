<a id="task-INFRA-TASK-TEST-01"></a>
### INFRA-TASK-TEST-01

- **Task ID:** INFRA-TASK-TEST-01
- **Title:** Unit tests for req-graph-checks.js functions
- **Outcome:** tests/req-graph-checks.test.js exists covering all 4 exported functions against both clean and deliberately-broken inputs
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** AC-08
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for req-graph-checks.js

**Implementation notes:**

One passing case and one (or more) failing case per function, directly against the function —
no file I/O, mirroring `wb-graph-checks.test.js`'s own style:

```js
'use strict';
const { checkUniqueUcIds, checkUcIdFormat, checkUcTableFileParity, checkCrossReferencesResolve } =
  require('../src/claude/scripts/req-graph-checks');

describe('checkUniqueUcIds()', () => {
  test('passes when all UC IDs are unique', () => {
    expect(checkUniqueUcIds({ ucIds: ['UC-01', 'UC-02'] })).toHaveLength(0);
  });
  test('flags a UC ID that appears twice', () => {
    const errors = checkUniqueUcIds({ ucIds: ['UC-01', 'UC-01'] });
    expect(errors).toHaveLength(1);
    expect(errors[0].category).toBe('DUPLICATE_UC_ID');
  });
});

describe('checkUcIdFormat()', () => {
  test.each(['UC-01', 'UC-99'])('accepts well-formed id %s', id => {
    expect(checkUcIdFormat({ ucIds: [id] })).toHaveLength(0);
  });
  test.each(['UC-1', 'UC1', 'uc-01', 'USE-CASE-01'])('rejects malformed id %s', id => {
    expect(checkUcIdFormat({ ucIds: [id] })).toHaveLength(1);
  });
});

describe('checkUcTableFileParity()', () => {
  test('flags a table row with no file and a file with no table row', () => {
    const errors = checkUcTableFileParity({ ucIds: ['UC-01', 'UC-02'] }, ['UC-01', 'UC-03']);
    expect(errors.map(e => e.category).sort()).toEqual(
      ['UC_FILE_WITHOUT_TABLE_ROW', 'UC_TABLE_ROW_WITHOUT_FILE']);
  });
});

describe('checkCrossReferencesResolve()', () => {
  test('passes when every AC/BR reference resolves, including "All UCs"', () => {
    const errors = checkCrossReferencesResolve({
      ucIds: ['UC-01', 'UC-02'],
      acTable: [{ id: 'AC-01', relatedUc: 'UC-01' }, { id: 'AC-02', relatedUc: 'All UCs' }],
      businessRules: [{ id: 'BR-01', appliesTo: 'UC-01, UC-02' }],
    });
    expect(errors).toHaveLength(0);
  });
  test('flags a dangling AC and a dangling Business Rule reference', () => {
    const errors = checkCrossReferencesResolve({
      ucIds: ['UC-01'],
      acTable: [{ id: 'AC-01', relatedUc: 'UC-99' }],
      businessRules: [{ id: 'BR-01', appliesTo: 'UC-99' }],
    });
    expect(errors.map(e => e.category).sort()).toEqual(
      ['DANGLING_AC_UC_REFERENCE', 'DANGLING_BR_UC_REFERENCE']);
  });
});
```

**Verification commands:**

```
npx jest --testPathPattern=tests/req-graph-checks.test.js
```
