<a id="task-US-05-TASK-TEST-03"></a>
### US-05-TASK-TEST-03

- **Task ID:** US-05-TASK-TEST-03
- **Title:** Add register write-failure test
- **Outcome:** tests/scripts/feature-split.test.js has a passing test that injects an fs.renameSync failure during register. It asserts the previous REGISTRY.md is byte-identical, no temp file remains, nothing is registered, and a FeatureSplitError REGISTRY_IO is reported. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-05-TASK-BE-02
- **Acceptance criteria:** AC-40
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add register write failure test

**Implementation notes:**

Append one new `describe` block to the existing `tests/scripts/feature-split.test.js`. Do not restructure or reorder the existing tests. The test runs in-process against `lib.register` and uses a temporary tree under the OS temp directory. It never touches the real `internal_docs/features/`.

Open points that affect this task (surface them, do not silently resolve them):

1. **Runner and assertion style.** The Tech-Spec excerpt assumes `node:test` and `node:assert/strict`. AGENTS.md shows Jest (`describe`/`test`/`expect`/`afterEach`). Match whatever the existing file header already imports. If the file is ambiguous, stop and report. The snippet below uses Jest style per AGENTS.md. Translate `expect` to `assert` if the file uses `node:assert`.
2. **Injection seam (Change gap 7).** The snippet patches `fs.renameSync` on the shared `fs` module object, so `feature-split.js` must call `fs.renameSync(...)` at call time. If the script destructures it at require time (`const { renameSync } = require('fs')`), the patch has no effect. The test would then fail loudly, because no error is thrown. In that case, stop and request the injectable `fs` adapter from the script component. Do not change the script from this task.
3. **Registry heading format.** The excerpt's BE-04 and BE-05 rows use `## FTR-NNN — Title` (em dash). The Tech-Spec's design body uses a colon. Check the live `REGISTRY.md` before writing the fixture.

Test design:

- Create a fixture features root with a `REGISTRY.md` containing one existing entry (a `defined` entry, so its bytes are non-trivial). Save its exact bytes.
- Create a standalone feature folder `FTR-050-export/` with `feature.md` containing an H1 title and a `## Summary` section.
- Patch `fs.renameSync` so that only a rename whose destination basename is `REGISTRY.md` throws. The temp file (`REGISTRY.md.tmp-<run id>`) is written with `writeFileSync` and is still on disk when the rename fails. The helper must remove it.
- Restore `fs.renameSync` in a `finally` block and in `afterEach`.

```javascript
describe('register write failure (US-05-TASK-TEST-03)', () => {
  let root;
  let realRename;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-register-fail-'));
    realRename = fs.renameSync;
  });

  afterEach(() => {
    fs.renameSync = realRename;
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('a failed registry rename leaves REGISTRY.md byte-identical and reports REGISTRY_IO', () => {
    // Arrange
    const featuresRoot = path.join(root, 'internal_docs', 'features');
    fs.mkdirSync(featuresRoot, { recursive: true });
    const regPath = path.join(featuresRoot, 'REGISTRY.md');
    const before = [
      '## FTR-001 — Existing thing',
      '**Keywords:** existing',
      '**Status:** defined',
      '**Summary:** Already here.',
      '→ [Detail](FTR-001-existing/feature.md)',
      '',
    ].join('\n');
    fs.writeFileSync(regPath, before);

    const featureDir = path.join(featuresRoot, 'FTR-050-export');
    fs.mkdirSync(featureDir);
    fs.writeFileSync(
      path.join(featureDir, 'feature.md'),
      '# Export\n\n## Summary\n\nExports data. More detail follows.\n'
    );

    // Inject: fail only the rename whose destination is REGISTRY.md
    fs.renameSync = (from, to) => {
      if (path.basename(String(to)) === 'REGISTRY.md') {
        const err = new Error('injected EPERM');
        err.code = 'EPERM';
        throw err;
      }
      return realRename(from, to);
    };

    // Act
    let caught;
    try {
      lib.register({ featuresRoot, featureDir, keywords: ['export'] });
    } catch (e) {
      caught = e;
    } finally {
      fs.renameSync = realRename;
    }

    // Assert
    expect(caught).toBeInstanceOf(FeatureSplitError);
    expect(caught.code).toBe('REGISTRY_IO');
    expect(fs.readFileSync(regPath, 'utf8')).toBe(before);
    expect(fs.readFileSync(regPath, 'utf8')).not.toContain('FTR-050');
    const leftovers = fs.readdirSync(featuresRoot).filter(n => n.startsWith('REGISTRY.md.tmp-'));
    expect(leftovers).toEqual([]);
  });
});
```

Rules for the implementer:

- Keep the existing `lib`, `FeatureSplitError`, `fs`, `os`, and `path` imports. Do not add new helpers unless they already exist.
- The test must fail if the script does not remove the temp file or if it writes the registry non-atomically. Do not weaken any assertion to make it pass.
- Do not assert on the exact temp-file name. Assert on the `REGISTRY.md.tmp-` prefix only.

**Verification commands:**

```
grep -qF "describe('register write failure (US-05-TASK-TEST-03)'" tests/scripts/feature-split.test.js
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```

```
npx jest --testPathPattern=tests/scripts/feature-split.test.js -t "REGISTRY_IO"
```