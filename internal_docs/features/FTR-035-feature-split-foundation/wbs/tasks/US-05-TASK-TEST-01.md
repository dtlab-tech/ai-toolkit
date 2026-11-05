<a id="task-US-05-TASK-TEST-01"></a>
### US-05-TASK-TEST-01

- **Task ID:** US-05-TASK-TEST-01
- **Title:** Add register success and registry-creation tests
- **Outcome:** tests/scripts/feature-split.test.js has passing tests, using temp fixtures, for register. One test shows a standalone feature gets exactly one defined entry with the first-sentence Summary, the supplied Keywords, a Detail link to feature.md, and no Parent or Depends on lines, and that the result is { id, status: 'defined' }. Another shows a missing REGISTRY.md is created. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-05-TASK-BE-02
- **Acceptance criteria:** AC-37, AC-42
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add register success and registry creation tests

**Implementation notes:**

This task only appends a `describe('register()')` block to the existing `tests/scripts/feature-split.test.js`. It must not overwrite the file, which earlier tasks (INFRA-TASK-TEST-01 and the US-01 to US-04 test tasks) have already populated. The `register` export is implemented by US-05-TASK-BE-02, which is a dependency, so the test targets the behaviour that task specifies.

**Open points to surface at Gate 1 (not resolved by this task):**

1. **Test runner.** The Tech-Spec's Service Interface assumes `node:test` and `node:assert`. The project's AGENTS.md conventions use Jest (`describe`/`test`/`expect` globals, and `npm test` runs Jest). This block follows the AGENTS.md Jest pattern because `npm test` is the gate. The host must confirm the runner before this file is accepted.
2. **Registry heading separator.** The component index and BE-04 specify `## FTR-NNN — Title` (em dash). Tech-Spec gap 6 says fixtures use `## FTR-NNN: Title`. This block uses the em dash. It must be checked against the live `REGISTRY.md` before implementation.
3. **Keywords argument type.** `register({ featuresRoot, featureDir, keywords })` does not state whether `keywords` is an array or a string. This block passes an array. If BE-02 takes a string, change the call only.

**Fixture rules:**

- Use `fs.mkdtempSync` under `os.tmpdir()` and remove the tree in `afterEach`.
- Use a non-default features root name (`docs-features`), so no path is hard-coded.
- The feature folder is `FTR-040-widget-export`, so the ID comes from the folder prefix.
- `feature.md` has an H1 title, a `## Summary` whose first sentence is `Exports widgets to CSV.`, and a second sentence that must not appear in the entry.

**Test block to add (Jest style):**

```javascript
const { register } = require('../../src/claude/scripts/feature-split.js');

describe('register()', () => {
  let root;
  const FEATURES = 'docs-features';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-register-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function setup(registryText) {
    const featuresRoot = path.join(root, FEATURES);
    const featureDir = path.join(featuresRoot, 'FTR-040-widget-export');
    fs.mkdirSync(featureDir, { recursive: true });
    fs.writeFileSync(
      path.join(featureDir, 'feature.md'),
      '# Widget export\n\n## Summary\n\nExports widgets to CSV. Supports filters by date.\n\n## Scope\n\nOut of scope: PDF.\n'
    );
    if (registryText !== undefined) {
      fs.writeFileSync(path.join(featuresRoot, 'REGISTRY.md'), registryText);
    }
    return { featuresRoot, featureDir };
  }

  // Returns the chunk of the registry that starts with "## <id> ", or null.
  function entryFor(text, id) {
    return text.split(/^(?=## )/m).find(c => c.startsWith(`## ${id} `)) ?? null;
  }

  test('appends exactly one defined entry with first-sentence Summary, supplied Keywords, Detail link, and no Parent or Depends on', () => {
    const { featuresRoot, featureDir } = setup('# Feature registry\n');

    const result = register({ featuresRoot, featureDir, keywords: ['csv', 'export'] });

    expect(result).toEqual({ id: 'FTR-040', status: 'defined' });
    const text = fs.readFileSync(path.join(featuresRoot, 'REGISTRY.md'), 'utf8');
    expect(text.match(/^## FTR-040 /gm)).toHaveLength(1);
    const entry = entryFor(text, 'FTR-040');
    expect(entry).toContain('## FTR-040 — Widget export');
    expect(entry).toMatch(/\*\*Status:\*\* defined/);
    expect(entry).toContain('**Summary:** Exports widgets to CSV.');
    expect(entry).not.toContain('Supports filters');
    expect(entry).toMatch(/\*\*Keywords:\*\* .*csv.*export/);
    expect(entry).toContain('→ [Detail](');
    expect(entry).toContain('feature.md)');
    expect(entry).not.toMatch(/\*\*Parent:\*\*/);
    expect(entry).not.toMatch(/\*\*Depends on:\*\*/);
  });

  test('creates REGISTRY.md when it does not exist and registers the feature in it', () => {
    const { featuresRoot, featureDir } = setup(undefined);
    const registryPath = path.join(featuresRoot, 'REGISTRY.md');
    expect(fs.existsSync(registryPath)).toBe(false);

    register({ featuresRoot, featureDir, keywords: ['csv'] });

    expect(fs.existsSync(registryPath)).toBe(true);
    expect(entryFor(fs.readFileSync(registryPath, 'utf8'), 'FTR-040')).not.toBeNull();
  });
});
```

**Verification:** `npm test` must pass with the new block. The two `test()` blocks above are the only new cases in this task. The pending and other-area cases belong to other tasks and must not be added here.

**Verification commands:**

```
grep -qF "describe('register()'" tests/scripts/feature-split.test.js
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```

```
npx jest tests/scripts/feature-split.test.js -t "register"
```