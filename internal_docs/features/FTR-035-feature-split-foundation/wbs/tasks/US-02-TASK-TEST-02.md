<a id="task-US-02-TASK-TEST-02"></a>
### US-02-TASK-TEST-02

- **Task ID:** US-02-TASK-TEST-02
- **Title:** Add isNewFeature unreadable-folder test
- **Outcome:** tests/scripts/feature-split.test.js contains a passing test that makes reading an existing feature folder fail with EACCES and asserts FeatureSplitError FEATURE_UNREADABLE is thrown and isNew true is never returned. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01, INFRA-TASK-TEST-01
- **Acceptance criteria:** AC-13
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 6000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add isNewFeature unreadable folder test

**Implementation notes:**

This task appends one `describe` block to `tests/scripts/feature-split.test.js`. It exercises the behavior that US-02-TASK-BE-01 already built in `src/claude/scripts/feature-split.js` (`isNewFeature` throws `FEATURE_UNREADABLE` for an existing folder it cannot read). No implementation is added. Duplicate check: no sibling task builds this behavior a second time, so the TEST domain is expected here.

Two points must be settled before writing the test:

1. **Runner conflict (raise at Gate 1).** The Tech-Spec assumes `node:test`, but the project conventions in AGENTS.md specify Jest (`describe`/`test`/`expect`, `npm test` runs Jest with `--bail`). The snippet below follows the AGENTS.md Jest pattern. If the host confirms `node:test`, translate `expect` to `assert` and `jest.spyOn` to `mock.method` from `node:test`. Do not mix the two styles in the same file.

2. **Which fs call to fail.** `EACCES` cannot be reproduced reliably with `chmod` on Windows (the platform here is win32), so the test injects the error by spying on the `fs` call that `isNewFeature` uses to read the folder. BE-01 must call `fs.readdirSync(featureDir)` through the `fs` module object at call time (not a destructured reference), because the spy only intercepts property lookups. If BE-01 reads the folder via `statSync`/`accessSync`/`existsSync` instead, change the spied method name to match. The implementer must check the BE-01 source before running the test. The spy only fails the one target path and delegates every other call to the real function, so fixture setup and temp-dir cleanup are unaffected.

The test creates an existing folder that holds only `req/` (so the folder is real and would otherwise be `isNew: true`). With the spy in place, the test asserts that the call throws `FeatureSplitError` with `code === 'FEATURE_UNREADABLE'` and that no return value was produced.

```javascript
describe('isNewFeature() on an existing but unreadable folder', () => {
  let tmpRoot;
  let featureDir;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-test-'));
    featureDir = path.join(tmpRoot, 'FTR-901-locked');
    fs.mkdirSync(path.join(featureDir, 'req'), { recursive: true });
    fs.writeFileSync(path.join(featureDir, 'req', 'requirements.md'), '# req');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('throws FEATURE_UNREADABLE and never returns isNew true when reading the folder fails with EACCES', () => {
    const realReaddirSync = fs.readdirSync;
    const target = path.resolve(featureDir);
    jest.spyOn(fs, 'readdirSync').mockImplementation((p, ...rest) => {
      if (path.resolve(String(p)) === target) {
        const err = new Error(`EACCES: permission denied, scandir '${p}'`);
        err.code = 'EACCES';
        throw err;
      }
      return realReaddirSync(p, ...rest);
    });

    let thrown = null;
    let result;
    try {
      result = isNewFeature(featureDir);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(FeatureSplitError);
    expect(thrown.code).toBe('FEATURE_UNREADABLE');
    expect(result).toBeUndefined();
  });
});
```

Length and scope: this is a single test in a single file. It does not change any production code. If the test fails because BE-01 does not throw `FEATURE_UNREADABLE` for an `EACCES` read, the failure is in BE-01 and must be reported rather than worked around in the test.

**Verification commands:**

```
grep -qF "describe('isNewFeature() on an existing but unreadable folder'" tests/scripts/feature-split.test.js
```

```
npx jest tests/scripts/feature-split.test.js -t "EACCES"
```

```
npm test
```