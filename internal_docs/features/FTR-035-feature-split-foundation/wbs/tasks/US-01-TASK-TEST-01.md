<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Add loadConfig tests to feature-split test file
- **Outcome:** tests/scripts/feature-split.test.js contains passing tests for loadConfig. They cover defaults only, subset overlay, absent override, invalid values and unknown keys, a malformed override (CONFIG_INVALID_JSON) and an unreadable override (CONFIG_OVERRIDE_UNREADABLE), each naming the file with a null key, and reading the override from the projectRoot argument. The missing toolkit default (AC-06) is covered by US-01-TASK-BE-01, not here. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-02, INFRA-TASK-TEST-01
- **Acceptance criteria:** AC-01, AC-02, AC-03, AC-04, AC-05, AC-07
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add loadConfig tests

**Implementation notes:**

Scope: append one `describe('loadConfig', ...)` block to the existing `tests/scripts/feature-split.test.js` created by INFRA-TASK-TEST-01. Do not duplicate its imports. Add `lib` (or the destructured `loadConfig` and `FeatureSplitError`) only if it is not already present.

Runner: AGENTS.md specifies Jest (`describe`, `test`, `expect`, `test.skip`, `beforeEach`/`afterEach`). The Tech-Spec assumed `node:test`. Use whichever runner the existing file from INFRA-TASK-TEST-01 already uses. If the file uses `node:test`, convert the same cases to `test(name, { skip: reason }, fn)` and `assert`. Do not mix the two.

Decided at the Gate 1 review (2026-11-04):
- **Missing toolkit default** is not tested in this task. It needs an injectable default path that `loadConfig` does not have, and AC-06 is covered by US-01-TASK-BE-01. Do not add a skipped test for it.
- **Malformed or unreadable override** are decided (A-02, AC-05): `loadConfig` raises `FeatureSplitError` with code `CONFIG_INVALID_JSON` or `CONFIG_OVERRIDE_UNREADABLE`, `file` set to the override path and `key` null (US-01-TASK-BE-01). Test both.

Fixture: each test uses its own temp dir from `fs.mkdtempSync(os.tmpdir())`, removed in `afterEach`.

```javascript
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const lib  = require('../../src/claude/scripts/feature-split.js');
const { loadConfig, FeatureSplitError } = lib;

const DEFAULTS = {
  thresholds: { useCases: 8, acceptanceCriteria: 15, components: 30, estimatedPhases: 6 },
  definitionSignals: { minActors: 2, minApplications: 2, minFlows: 3 },
  minChildren: 2,
};

describe('loadConfig', () => {
  let root;
  let otherRoot;
  const OVERRIDE = () => path.join(root, 'feature-split.config.json');
  const writeOverride = (obj) => fs.writeFileSync(OVERRIDE(), JSON.stringify(obj));
  const captureError = (fn) => { try { fn(); } catch (e) { return e; } return undefined; };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-cfg-'));
    otherRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-cfg-other-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(otherRoot, { recursive: true, force: true });
  });

  test('returns exactly the D-02 default shape when no override exists', () => {
    expect(loadConfig({ projectRoot: root })).toEqual(DEFAULTS);
  });

  test('keeps every default key that a subset override does not mention', () => {
    writeOverride({ thresholds: { useCases: 5 } });
    const cfg = loadConfig({ projectRoot: root });
    expect(cfg.thresholds).toEqual({ useCases: 5, acceptanceCriteria: 15, components: 30, estimatedPhases: 6 });
    expect(cfg.definitionSignals).toEqual(DEFAULTS.definitionSignals);
    expect(cfg.minChildren).toBe(2);
  });

  test('treats an absent override file as no error', () => {
    expect(fs.existsSync(OVERRIDE())).toBe(false);
    expect(() => loadConfig({ projectRoot: root })).not.toThrow();
  });

  test('throws FeatureSplitError naming the key for a non-integer threshold', () => {
    writeOverride({ thresholds: { useCases: 1.5 } });
    const err = captureError(() => loadConfig({ projectRoot: root }));
    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.key).toBe('thresholds.useCases');
    expect(err.file).toEqual(expect.any(String));
  });

  test('throws FeatureSplitError naming the key for a string threshold', () => {
    writeOverride({ thresholds: { useCases: '8' } });
    const err = captureError(() => loadConfig({ projectRoot: root }));
    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.key).toBe('thresholds.useCases');
  });

  test('throws FeatureSplitError naming the key for a negative value', () => {
    writeOverride({ minChildren: -1 });
    const err = captureError(() => loadConfig({ projectRoot: root }));
    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.key).toBe('minChildren');
  });

  test('throws FeatureSplitError naming the key for an unknown key', () => {
    writeOverride({ thresholds: { foo: 1 } });
    const err = captureError(() => loadConfig({ projectRoot: root }));
    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.key).toBe('thresholds.foo');
  });

  test('rejects a malformed JSON override with CONFIG_INVALID_JSON naming the file and a null key', () => {
    fs.writeFileSync(OVERRIDE(), '{ not json');
    const err = captureError(() => loadConfig({ projectRoot: root }));
    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.code).toBe('CONFIG_INVALID_JSON');
    expect(err.file).toBe(OVERRIDE());
    expect(err.key).toBeNull();
  });

  test('rejects an unreadable override with CONFIG_OVERRIDE_UNREADABLE naming the file and a null key', () => {
    fs.mkdirSync(OVERRIDE());                    // a directory where the file should be: reading it fails
    const err = captureError(() => loadConfig({ projectRoot: root }));
    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.code).toBe('CONFIG_OVERRIDE_UNREADABLE');
    expect(err.file).toBe(OVERRIDE());
    expect(err.key).toBeNull();
  });

  test('reads the override only from the projectRoot argument', () => {
    writeOverride({ minChildren: 4 });
    expect(loadConfig({ projectRoot: root }).minChildren).toBe(4);
    expect(loadConfig({ projectRoot: otherRoot })).toEqual(DEFAULTS);
  });
});
```

Notes on the code above:
- The default values are the INFRA-TASK-INFRA-01 values (useCases 8, acceptanceCriteria 15, components 30, estimatedPhases 6; minActors 2, minApplications 2, minFlows 3; minChildren 2).
- The value cases assert `key` only. The two file-level cases (malformed and unreadable override) assert `code`, `file` and a null `key`, as decided in A-02 and AC-05.
- If the existing file already defines a fixture helper, reuse it rather than adding a second one.

**Verification commands:**

```
grep -qF "describe('loadConfig'" tests/scripts/feature-split.test.js
```

```
npx jest tests/scripts/feature-split.test.js -t loadConfig
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```