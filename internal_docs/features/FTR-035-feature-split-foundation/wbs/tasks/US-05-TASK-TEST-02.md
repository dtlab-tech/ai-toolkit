<a id="task-US-05-TASK-TEST-02"></a>
### US-05-TASK-TEST-02

- **Task ID:** US-05-TASK-TEST-02
- **Title:** Add register idempotence and foreign status tests
- **Outcome:** tests/scripts/feature-split.test.js has passing tests showing a second register run creates no duplicate entry, and that an existing completed or epic entry is returned with its own status, stays byte-identical and gets no duplicate. They also show an existing entry with a status other than defined, completed or epic stays byte-identical, is not treated as an epic, is refused with REGISTRY_STATUS, and gets no duplicate. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-05-TASK-BE-02
- **Acceptance criteria:** AC-38, AC-39
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit subject:** add register idempotence and status tests

**Implementation notes:**

Add one `describe` block to the existing `tests/scripts/feature-split.test.js`, after the register success tests from US-05-TASK-TEST-01. Reuse the file's existing `tmpProject` and `makeFeatureDir` helpers and do not redefine them. Adapt to whatever return shape those helpers actually have. The Tech-Spec gives their signatures but not their return values.

Two conventions need settling before this is accepted:

- **Runner.** AGENTS.md describes Jest globals (`test`, `describe`, `expect`, `beforeEach`/`afterEach`, `'use strict';`). The Tech-Spec assumes `node:test`. This note follows AGENTS.md, which is the project convention. The host should confirm this at Gate 1, because the file's top-level imports depend on it.
- **Registry layout.** The component index and the BE tasks use `## FTR-NNN — Title` with an em dash. Tech-Spec Change gap 6 writes `## FTR-NNN: Title`. The fixtures below use the em-dash form. Check it against the live `REGISTRY.md` before implementation.

Under the design, `register({ featuresRoot, featureDir, keywords })` returns `{ id, status: 'defined' }` on a second run without changing the file. For a `defined` entry it leaves the registry untouched. For an entry with any other status (not `defined`, `completed` or `epic`) it throws `FeatureSplitError` with code `REGISTRY_STATUS` and leaves the entry untouched. The registry lives at `path.join(featuresRoot, 'REGISTRY.md')`.

Test A is the idempotence case. It registers the same feature twice and checks that the second result matches the first, that the registry bytes are unchanged, and that the ID heading appears once.

Test B is the foreign-status case. The fixture registry holds an `in-progress` entry for the same ID. Register must throw `REGISTRY_STATUS`. The registry must stay byte-identical, which also shows the entry was not treated as an epic and was not duplicated.

Test C is the completed and epic case (Gate 1 decision, D-21). For each of `completed` and `epic` (`test.each`) the fixture registry holds an entry with that status for the same ID. Register must resolve with `{ id, status }` carrying that status, must not throw, the registry must stay byte-identical, and the ID heading must appear once.

```javascript
'use strict';

const fs   = require('fs');
const path = require('path');
const lib  = require('../../src/claude/scripts/feature-split.js');

describe('register idempotence and foreign status', () => {
  const FEATURE_MD = '# Login\n\n## Summary\n\nSign-in flow. Uses sessions.\n';

  test('second register run returns defined and leaves the registry byte-identical with one entry', () => {
    // Arrange
    const { featuresRoot } = tmpProject();
    const registryPath = path.join(featuresRoot, 'REGISTRY.md');
    const featureDir = makeFeatureDir(featuresRoot, 'FTR-010-login', { 'feature.md': FEATURE_MD });

    // Act
    const first = lib.register({ featuresRoot, featureDir, keywords: ['auth'] });
    const afterFirst = fs.readFileSync(registryPath, 'utf8');
    const second = lib.register({ featuresRoot, featureDir, keywords: ['auth'] });
    const afterSecond = fs.readFileSync(registryPath, 'utf8');

    // Assert
    expect(first).toEqual({ id: 'FTR-010', status: 'defined' });
    expect(second).toEqual({ id: 'FTR-010', status: 'defined' });
    expect(afterSecond).toBe(afterFirst);
    expect(afterSecond.match(/^## FTR-010 /gm)).toHaveLength(1);
  });

  test('existing entry with a foreign status is left byte-identical, not treated as epic, and not duplicated', () => {
    // Arrange
    const registry = [
      '## FTR-010 — Login',
      '**Keywords:** auth',
      '**Status:** in-progress',
      '**Summary:** Sign-in flow.',
      '→ [Detail](internal_docs/features/FTR-010-login/feature.md)',
      '---',
      '',
    ].join('\n');
    const { featuresRoot } = tmpProject({ registry });
    const registryPath = path.join(featuresRoot, 'REGISTRY.md');
    const featureDir = makeFeatureDir(featuresRoot, 'FTR-010-login', { 'feature.md': FEATURE_MD });
    const before = fs.readFileSync(registryPath, 'utf8');

    // Act
    let caught;
    try {
      lib.register({ featuresRoot, featureDir, keywords: ['auth'] });
    } catch (err) {
      caught = err;
    }

    // Assert
    expect(caught).toBeInstanceOf(lib.FeatureSplitError);
    expect(caught.code).toBe('REGISTRY_STATUS');
    expect(fs.readFileSync(registryPath, 'utf8')).toBe(before);
    expect(before.match(/^## FTR-010 /gm)).toHaveLength(1);
    expect(before).toContain('**Status:** in-progress');
    expect(before).not.toMatch(/\*\*Status:\*\* epic/);
  });
});
```

Length check: the test block is complete and self-contained apart from the existing helpers. Nothing in this task should change `src/claude/scripts/feature-split.js`. If the register implementation does not throw `REGISTRY_STATUS` as BE-02 describes, stop and report the mismatch rather than weakening the assertion.

**Verification commands:**

```
grep -qF "describe('register idempotence and foreign status'" tests/scripts/feature-split.test.js
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```