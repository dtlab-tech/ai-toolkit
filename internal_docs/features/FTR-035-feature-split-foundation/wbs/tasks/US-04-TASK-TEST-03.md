<a id="task-US-04-TASK-TEST-03"></a>
### US-04-TASK-TEST-03

- **Task ID:** US-04-TASK-TEST-03
- **Title:** Add apply refusal and foundation warning tests
- **Outcome:** tests/scripts/feature-split.test.js has passing tests showing apply writes nothing and reports an error for a parent with no registry entry, an existing child folder or feature.md that stays unchanged, a leftover staging directory, and invalid proposals. It also has a test that a foundation not on the first child proceeds and records the BR-03 warning in epic.md. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-11
- **Acceptance criteria:** AC-24, AC-26, AC-33, AC-39, AC-41
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add apply refusal tests

**Implementation notes:**

This task appends one `describe` block to `tests/scripts/feature-split.test.js`. It does not rewrite the file, which earlier tasks (INFRA-TASK-TEST-01, US-01 to US-04 TEST tasks) create and extend. Reuse the fixture helpers those tasks define (`tmpProject`, `makeFeatureDir`, `sampleProposal`). The duplicate-implementation check passes: this is a TEST task, so exercising the behaviour built by US-04-TASK-BE-06, BE-07, BE-08 and BE-11 is the expected outcome.

Test runner: AGENTS.md describes Jest (`describe`/`test`/`expect`, `npm test` runs jest with `--bail`). The Service Interface in the Tech-Spec assumes `node:test`. The code below follows AGENTS.md. If the host confirms `node:test` instead, replace `expect` with `assert.strict` and `test.each` with a loop.

Each test uses its own temp tree under `os.tmpdir()`, created in `beforeEach` and removed in `afterEach`. Nothing touches `internal_docs/features/`.

Helpers to add inside the new describe block:

```js
// Walks a directory and returns { relativePath: content | null } for every entry.
// Directories map to null. Used to prove apply wrote nothing.
function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const rel = path.relative(dir, p).split(path.sep).join('/');
      if (e.isDirectory()) { out[rel] = null; walk(p); }
      else out[rel] = fs.readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}

// Returns the thrown error, or fails the test if nothing was thrown.
function errorOf(fn) {
  try { fn(); } catch (e) { return e; }
  throw new Error('expected apply to throw');
}

// Creates <featuresRoot>/REGISTRY.md with one 'defined' parent entry (D-18 layout, em dash heading).
function seedParent(featuresRoot, id = 'FTR-001') {
  fs.mkdirSync(path.join(featuresRoot, id), { recursive: true });
  fs.writeFileSync(path.join(featuresRoot, id, 'feature.md'), '# Parent\n\n## Summary\n\nParent summary.\n');
  fs.writeFileSync(path.join(featuresRoot, 'REGISTRY.md'),
    `## ${id} — Parent\n**Keywords:** parent\n**Status:** defined\n**Summary:** Parent summary.\n→ [Detail](${id}/feature.md)\n---\n`);
}
```

Refusal cases (each asserts the snapshot is unchanged):

```js
describe('apply refusal', () => {
  let featuresRoot;
  beforeEach(() => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-refuse-'));
    featuresRoot = path.join(base, 'features');
    fs.mkdirSync(featuresRoot);
    seedParent(featuresRoot);
  });
  afterEach(() => fs.rmSync(path.dirname(featuresRoot), { recursive: true, force: true }));

  test('refuses a parent with no registry entry and writes nothing', () => {
    fs.writeFileSync(path.join(featuresRoot, 'REGISTRY.md'), '');
    const before = snapshot(featuresRoot);
    const err = errorOf(() => lib.apply({ featuresRoot, parentId: 'FTR-001', proposal: sampleProposal() }));
    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(snapshot(featuresRoot)).toEqual(before);
  });

  test('refuses when a leftover .split-staging-* directory exists and writes nothing', () => {
    fs.mkdirSync(path.join(featuresRoot, '.split-staging-old'));
    const before = snapshot(featuresRoot);
    const err = errorOf(() => lib.apply({ featuresRoot, parentId: 'FTR-001', proposal: sampleProposal() }));
    expect(err).toMatchObject({ code: 'STAGING_LEFTOVER' });
    expect(snapshot(featuresRoot)).toEqual(before);
  });

  test.each([
    ['one child (below minChildren)', { children: [sampleProposal().children[0]] }],
    ['a dependency cycle', { children: [
      { ...sampleProposal().children[0], dependsOn: ['Billing'] },
      { ...sampleProposal().children[1], dependsOn: ['Auth'] },
    ] }],
    ['a malformed shape', { children: 'not-an-array' }],
  ])('refuses an invalid proposal (%s) and writes nothing', (_label, overrides) => {
    const before = snapshot(featuresRoot);
    const err = errorOf(() => lib.apply({
      featuresRoot, parentId: 'FTR-001', proposal: sampleProposal(overrides),
    }));
    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(snapshot(featuresRoot)).toEqual(before);
  });

  test('leaves an existing child folder and its feature.md byte-identical', () => {
    // SEE GAP 2 BELOW: this case cannot be triggered through allocateIds as written.
    // Keep it as a test.todo until the host confirms a seam (see Gaps).
  });
});
```

Foundation warning case (this one can pass as written):

```js
describe('apply foundation warning', () => {
  test('proceeds when the foundation owner is not the first child and records BR-03 in epic.md', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-br03-'));
    try {
      const featuresRoot = path.join(base, 'features');
      fs.mkdirSync(featuresRoot);
      seedParent(featuresRoot);
      // Auth is first in dependency order; Billing (dependsOn Auth) owns the foundation.
      const result = lib.apply({
        featuresRoot, parentId: 'FTR-001',
        proposal: sampleProposal({ sharedFoundationOwner: 'Billing' }),
      });
      expect(result.registry).toBe(true);
      const epic = fs.readFileSync(path.join(featuresRoot, 'FTR-001', 'epic.md'), 'utf8');
      expect(epic).toMatch(/BR-03/);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
```

Gaps the host must resolve at Gate 1. These are the reasons the notes cannot yet be fully executed:

1. **Existing child folder and feature.md (AC-26 / D-13, D-17).** `allocateIds` (BE-02) picks an ID one above the highest number in the union of registry headings and folder names. A pre-existing `FTR-002` folder therefore pushes the new child to `FTR-003`, so `TARGET_EXISTS` is never reached through public inputs. The test needs a seam, such as an injectable `allocateIds` or a planner option, or it must be reframed. Until then, leave it as `test.todo` and report it. Do not weaken the assertion.
2. **Error codes not in the excerpt.** The code for "parent has no registry entry" (BE-06) and for `validateProposal` failures (BE-04) is not named. The tests above assert only `FeatureSplitError` or `STAGING_LEFTOVER`/`INVALID_PROPOSAL`. Add exact codes once the script component fixes them.
3. **`apply` export.** BE-11 exports `apply`, but the D-23 export list in the Tech-Spec has exactly seven names and omits it. Confirm that `apply` is exported, or switch these tests to the facade.
4. **Registry layout.** The Tech-Spec index line uses `## FTR-NNN — Title` (em dash). The Change section's gap 6 says `FTR-NNN: Title` (colon). The fixture follows the index line. Check it against the live `REGISTRY.md` before implementing.
5. **Initial-mode "req/spec refusal" (BE-06).** The meaning is unclear. Confirm whether a parent folder holding `req/` and `spec/` is refused in initial mode. The fixture above contains only `feature.md`, so it is unaffected either way.
6. **Acceptance-criteria mapping.** The AC text is not in the excerpt. The host must confirm that AC-24, AC-26, AC-33, AC-39 and AC-41 match the cases above.

Verification must pass once gaps 1 and 3 are closed. Until then, the foundation test and the non-seam refusal cases can run, and the existing-child test stays as a todo.

**Verification commands:**

```
npx jest tests/scripts/feature-split.test.js -t "apply refusal|apply foundation warning"
```

```
npm test
```