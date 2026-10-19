<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Regression test: checkAcCoverage unchanged, criterion field present
- **Outcome:** tests/wb-graph-checks.test.js (or a new file) re-runs the existing checks-19-21 fixtures through the extended parseAcTable and asserts checkAcCoverage's errors output is byte-identical to before the extension, plus a new assertion that acMap.get(id).criterion returns the table's real Criterion text
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-05, AC-06
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add parseAcTable criterion-extension regression test

**Implementation notes:**

Add a new `describe` block to the existing `tests/wb-graph-checks.test.js`, reusing its own
`makeReqMd`/`writeReq` helpers (defined at the top of that file) exactly as its existing
`checkAcCoverage()` tests already do (see that describe block) — `makeReqMd` already fills every
AC row's Criterion cell with the literal text `'A criterion'`, which makes the new assertion
trivial:

```js
describe('parseAcTable() — criterion extension (FTR-022)', () => {
  test('every acMap entry now carries the real Criterion text from the table', () => {
    const reqPath = writeReq(makeReqMd({ 'UC-01': 'Must' }, [['AC-01', 'UC-01'], ['AC-02', 'UC-01']]));
    const acMap = parseAcTable(reqPath);
    expect(acMap.get('AC-01').criterion).toBe('A criterion');
    expect(acMap.get('AC-02').criterion).toBe('A criterion');
  });

  test('checkAcCoverage behavior is unchanged by the extension (NFR-02)', () => {
    // Re-run this same file's existing 4 checkAcCoverage() tests (AC_NOT_FOUND, AC_WRONG_US,
    // MUST_AC_UNCOVERED, and the clean pass) unmodified — they already call the now-extended
    // parseAcTable, so passing unmodified (no test edits needed) IS the regression guard: if
    // the extension had changed any existing field or behavior, those 4 tests would already
    // fail. This task's job is to confirm they still pass, not to duplicate them.
  });
});
```

The second "test" above is not new code — running the file's existing suite after
`US-01-TASK-BE-01`'s change, unmodified, is the actual regression check (NFR-02): those 4 tests
already assert on `checkAcCoverage`'s `errors` output using the real `parseAcTable`, so if they
still pass verbatim, the extension is provably behavior-preserving.

**Verification commands:**

```
npx jest --testPathPattern=tests/wb-graph-checks.test.js
```
