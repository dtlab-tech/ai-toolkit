<a id="task-INFRA-TASK-TEST-02"></a>
### INFRA-TASK-TEST-02

- **Task ID:** INFRA-TASK-TEST-02
- **Title:** Unit test check-definition errors and facade dispatch
- **Outcome:** tests/scripts/feature-split.test.js asserts that RECORD_INVALID is raised for non-JSON, null, array and string stdin. It asserts that FEATURE_INVALID is raised for malformed ids. It also asserts that main dispatches check-definition with exit code 0 and that the unknown-command message lists the new command. Existing apply and register tests are unchanged.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** INFRA-TASK-TEST-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** cover check-definition errors and dispatch

**Implementation notes:**

This task only adds a new `describe` block to `tests/scripts/feature-split.test.js`. It does not change `src/claude/scripts/feature-split.js`, and it does not change any existing `apply` or `register` test. The behaviour under test is built by INFRA-TASK-BE-01 (`parseGrillingRecord` throws `RECORD_INVALID`) and INFRA-TASK-BE-02 (the `check-definition` command, feature-id validation, and the unknown-command message). This is expected overlap for a TEST task, not a duplicate implementation.

Gaps in the inputs. The Tech-Spec excerpt does not give the exact name of the existing helper that drives `main()` with argv and stdin, the shape of the D-03 record, or the exit code for `FEATURE_INVALID`. The spec does fix the exit code for `RECORD_INVALID` (exit 1, code in the output). Before writing, read the existing helper and fixture builder that INFRA-TASK-TEST-01 added to this file, and reuse them. Do not add a second helper that does the same job. The snippets below assume a helper named `runMain(argv, stdinText)` that returns `{ code, stdout, stderr }`, and a `validRecord()` fixture builder. Rename them to match the file. If the file does not have these, stop and report it rather than inventing a different harness.

Steps:
1. Append one new `describe('check-definition errors and dispatch', ...)` block at the end of the file. Do not edit other blocks.
2. In it, create a features root in `os.tmpdir()` with `fs.mkdtempSync`, and a new feature folder `FTR-900-sample`. Remove it in `afterEach`.
3. For each non-object stdin (`not json`, `null`, `[]`, `"text"`), run `check-definition --features-root <root> --feature-id FTR-900` and assert `code` is 1 and the output contains `RECORD_INVALID`. A `null` record is a whole-record shape error, not an unevaluated signal (`null` per signal means unevaluated only inside a valid object), so it must raise `RECORD_INVALID`.
4. For malformed ids (`ftr-900`, `FTR900`, `../FTR-900`, `FTR-9x`), run with a valid record and assert the exit code is non-zero and the output contains `FEATURE_INVALID`. Assert the features root is unchanged (no folder created).
5. Dispatch: with a valid record and the new-feature folder, assert `code` is 0 and that `stdout` parses as JSON with a `status` field. Separately, run `main(['no-such-command'])` and assert the stderr or output contains `check-definition`.

Example shape (adapt the helper names to the file):

```javascript
describe('check-definition errors and dispatch', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-test-'));
    fs.mkdirSync(path.join(root, 'FTR-900-sample'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test.each([
    ['non-JSON text', 'not json'],
    ['null', 'null'],
    ['an array', '[]'],
    ['a string', '"text"'],
  ])('raises RECORD_INVALID for %s on stdin', (_label, stdin) => {
    const r = runMain(['check-definition', '--features-root', root, '--feature-id', 'FTR-900'], stdin);
    expect(r.code).toBe(1);
    expect(r.stderr + r.stdout).toContain('RECORD_INVALID');
  });

  test.each(['ftr-900', 'FTR900', '../FTR-900', 'FTR-9x'])(
    'raises FEATURE_INVALID for malformed id %s', (id) => {
      const r = runMain(['check-definition', '--features-root', root, '--feature-id', id],
        JSON.stringify(validRecord()));
      expect(r.code).not.toBe(0);
      expect(r.stderr + r.stdout).toContain('FEATURE_INVALID');
      expect(fs.readdirSync(root)).toEqual(['FTR-900-sample']);
    });

  test('dispatches check-definition with exit code 0 for a valid record', () => {
    const r = runMain(['check-definition', '--features-root', root, '--feature-id', 'FTR-900'],
      JSON.stringify(validRecord()));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveProperty('status');
  });

  test('unknown-command message lists check-definition', () => {
    const r = runMain(['no-such-command'], '');
    expect(r.code).not.toBe(0);
    expect(r.stderr + r.stdout).toContain('check-definition');
  });
});
```

Notes on the assertions:
- Asserting on `stderr + stdout` keeps the test valid whether the code reports the error on either stream. If the file's convention is one stream only, tighten it to that stream.
- The features-root snapshot check after `FEATURE_INVALID` backs the Section 6 rule that no path is built from a malformed id.
- Keep one behaviour per `test()`. `test.each` is acceptable because each row is the same behaviour with a different input.

**Describe title (required).** Name the describe block of this task exactly `check-definition errors and facade dispatch` so that the first verification command can find it.

**Verification commands:**

```
grep -qF "describe('check-definition errors and facade dispatch'" tests/scripts/feature-split.test.js
```

```
npx jest tests/scripts/feature-split.test.js
```

```
npm test
```