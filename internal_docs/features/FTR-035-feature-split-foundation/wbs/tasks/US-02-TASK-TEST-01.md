<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Add isNewFeature marker and missing-folder tests
- **Outcome:** tests/scripts/feature-split.test.js contains passing tests for isNewFeature. They cover Approvals.md, wbs directory and epic.md each returning isNew false with a non-empty reason, a folder with only req/ and spec/ (including rewritten files) returning isNew true, and a missing folder returning isNew true. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01, INFRA-TASK-TEST-01
- **Acceptance criteria:** AC-10, AC-11, AC-12
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 6000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add isNewFeature marker tests

**Implementation notes:**

Scope: this task only adds an `isNewFeature()` describe block to `tests/scripts/feature-split.test.js`, which INFRA-TASK-TEST-01 already created. It does not change `src/claude/scripts/feature-split.js`. The unreadable-folder (EACCES) case belongs to US-02-TASK-TEST-02 and is not covered here. The test file is a duplicate-implementation-safe target: the behaviour under test was built by US-02-TASK-BE-01, and this task only verifies it, so the sibling overlap is expected.

Runner conflict to resolve: the Tech-Spec excerpt assumes `node:test`, but AGENTS.md (the authoritative source for verification conventions) specifies Jest (`describe`/`test`/`expect`, `beforeEach`/`afterEach`, `npm test` runs Jest). This block follows AGENTS.md. If INFRA-TASK-TEST-01 already wrote the file with `node:test`, convert only this block to the Jest style, or stop and report the mismatch to the host.

Prefix assumption: `isNewFeature(featureDir)` takes no prefix argument, and the Tech-Spec does not say how `{PREFIX}` is derived from the folder. This block assumes the prefix is the folder's basename (for example `FTR-035`), so the marker is `FTR-035-Approvals.md`. Confirm this against the BE-01 implementation before committing. If the prefix comes from elsewhere, change only the fixture file name.

Imports: add `isNewFeature` to the existing require of `../../src/claude/scripts/feature-split.js` if it is not already there. Do not add a second require.

Fixture rule: every case creates its own `tmpRoot` with `fs.mkdtempSync` and removes it in `afterEach`. Never touch `internal_docs/features/`.

Concrete block to append:

```javascript
describe('isNewFeature()', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-newfeat-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  // Folder basename is the feature prefix, e.g. FTR-035 -> FTR-035-Approvals.md
  const makeFeatureDir = (id) => {
    const dir = path.join(tmpRoot, id);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };

  test.each([
    ['an Approvals.md marker file', (dir, id) =>
      fs.writeFileSync(path.join(dir, `${id}-Approvals.md`), '# approvals')],
    ['a wbs/ directory', (dir) =>
      fs.mkdirSync(path.join(dir, 'wbs'))],
    ['an epic.md file', (dir) =>
      fs.writeFileSync(path.join(dir, 'epic.md'), '# epic')],
  ])('returns isNew false with a non-empty reason when the folder holds %s', (_label, addMarker) => {
    const id = 'FTR-035';
    const dir = makeFeatureDir(id);
    addMarker(dir, id);

    const result = isNewFeature(dir);

    expect(result.isNew).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test('returns isNew true when the folder holds only req/ and spec/', () => {
    const dir = makeFeatureDir('FTR-035');
    fs.mkdirSync(path.join(dir, 'req'));
    fs.mkdirSync(path.join(dir, 'spec'));

    const result = isNewFeature(dir);

    expect(result.isNew).toBe(true);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test('returns isNew true when req/ and spec/ files were rewritten by a forced regeneration', () => {
    const dir = makeFeatureDir('FTR-035');
    const reqFile = path.join(dir, 'req', 'FTR-035-Requirements.md');
    const specFile = path.join(dir, 'spec', 'index.md');
    fs.mkdirSync(path.dirname(reqFile));
    fs.mkdirSync(path.dirname(specFile));
    fs.writeFileSync(reqFile, 'first generation');
    fs.writeFileSync(specFile, 'first generation');
    fs.writeFileSync(reqFile, 'forced regeneration');
    fs.writeFileSync(specFile, 'forced regeneration');

    const result = isNewFeature(dir);

    expect(result.isNew).toBe(true);
  });

  test('returns isNew true when the feature folder does not exist', () => {
    const missing = path.join(tmpRoot, 'FTR-999');

    const result = isNewFeature(missing);

    expect(result.isNew).toBe(true);
    expect(result.reason.length).toBeGreaterThan(0);
  });
});
```

Notes on the block: the `test.each` table keeps the three marker cases as one parameterised behaviour, which matches "one logical behavior per test" only loosely, but it keeps the three cases in a single place. Keep the reason assertions, since the Tech-Spec requires a non-empty reason for both the true and false results. The rewritten-files case must stay a real rewrite (write, then overwrite the same paths), so it actually proves that content does not count as a marker.

Acceptance check: the excerpt gives no AC text, so the mapping of AC-10, AC-11 and AC-12 to these cases should be confirmed against Requirements at Gate 1.

**Verification commands:**

```
npx jest tests/scripts/feature-split.test.js -t "isNewFeature"
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```