<a id="task-US-04-TASK-TEST-04"></a>
### US-04-TASK-TEST-04

- **Task ID:** US-04-TASK-TEST-04
- **Title:** Add apply rollback fault injection tests
- **Outcome:** tests/scripts/feature-split.test.js has passing tests that inject fs.renameSync failures at the child move, the parent req/ backup move, the feature.md move, the epic.md move and the registry write steps. Each shows the tree and registry restored, including the parent's req/ and spec/ folders byte for byte, with no staging or temp file left. A further test makes a reverse rename fail and asserts ROLLBACK_FAILED lists the remaining paths. A last test makes the staging removal fail after a successful commit and asserts that the split stands and apply returns a warnings entry. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-11
- **Acceptance criteria:** AC-22, AC-23, AC-32
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add apply rollback tests

**Implementation notes:**

Append one `describe` block to `tests/scripts/feature-split.test.js`. The file must already exist from INFRA-TASK-TEST-01 and the earlier US-0x TEST tasks; this task adds only the rollback block and reuses the file's top-level `lib`, `FeatureSplitError` and `sampleProposal` bindings. Dependencies list only US-04-TASK-BE-11, so phase ordering must guarantee the file exists first.

Points to confirm at Gate 1 (these are assumptions, not facts from the excerpt):

1. **Runner conflict.** The Tech-Spec assumes `node:test`. The AGENTS.md convention inlined in the prompt uses Jest (`describe`, `test`, `expect`, `jest.spyOn`, `afterEach`). This block follows the AGENTS.md Jest convention. The host must confirm which runner the file uses.
2. **Fault-injection seam.** The Tech-Spec (gap 7) asks the script to expose an injectable adapter. This plan does not invent one. It relies on `feature-split.js` calling `fs.renameSync(...)` through the shared `fs` module object at call time, not a destructured `renameSync` captured at load. If BE-10 destructures, the spy will not intercept and BE-10 must be changed to call through `fs`.
3. **Fault-point matching.** The predicates below assume the rename order described in BE-10 (child folders, then the parent `feature.md`, then `epic.md`, then `REGISTRY.md` via temp-and-rename). The exact source and destination paths must be checked against BE-10 once it lands.
4. **Error codes for injected faults.** The excerpt does not say which code an injected `EPERM` maps to on the forward path. The forward-fault tests assert only that `apply` rejects and that the tree is restored. Only the reverse-failure test asserts `ROLLBACK_FAILED`.
5. **Registry layout.** The component index specifies `## FTR-NNN — Title` (em dash) with a `→ [Detail](...)` line. The Tech-Spec test design says `## FTR-NNN: Title`. The fixture below follows the component index. Check it against the live `REGISTRY.md`.

Additions decided at the Gate 1 review (2026-11-04): the parent fixture also holds `req/a.md` and `spec/b.md`, and apply moves them into `<staging>/parent-backup/`. Add a fault point for the `req/` backup move, so that the snapshot comparison proves they come back byte for byte. Add one more test: spy on `fs.rmSync` so that removing the staging directory fails only after the registry was written; assert that `apply` resolves (it does not throw), that the children and `epic.md` exist, that the registry was updated, and that the result has a `warnings` array naming the staging path.

Fixture: a non-default features root (`custom-features`) proves no path is hard-coded (D-22). The parent `FTR-007` is the only existing ID, so allocation yields `FTR-008` and `FTR-009`.

```javascript
const REGISTRY_WITH_PARENT = [
  '## FTR-007 — Checkout',
  '',
  '**Keywords:** checkout, payments',
  '**Status:** defined',
  '**Summary:** Checkout flow. Covers cart and payment.',
  '→ [Detail](FTR-007-checkout/feature.md)',
  '',
  '---',
  '',
].join('\n');

describe('apply rollback fault injection', () => {
  const { apply } = lib;
  const realRenameSync = fs.renameSync;
  let root, featuresRoot, parentDir;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'split-rollback-'));
    featuresRoot = path.join(root, 'custom-features');
    parentDir = path.join(featuresRoot, 'FTR-007-checkout');
    fs.mkdirSync(parentDir, { recursive: true });
    fs.writeFileSync(path.join(parentDir, 'feature.md'), '# Checkout\n\nOriginal text.\n');
    fs.mkdirSync(path.join(parentDir, 'req'));
    fs.writeFileSync(path.join(parentDir, 'req', 'a.md'), 'generated requirements\n');
    fs.mkdirSync(path.join(parentDir, 'spec'));
    fs.writeFileSync(path.join(parentDir, 'spec', 'b.md'), 'generated tech spec\n');
    fs.writeFileSync(path.join(featuresRoot, 'REGISTRY.md'), REGISTRY_WITH_PARENT);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  // Map every file (content) and directory (null) under dir, keyed by relative path.
  function snapshot(dir) {
    const out = {};
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        const rel = path.relative(dir, p);
        if (e.isDirectory()) { out[rel + '/'] = null; walk(p); }
        else out[rel] = fs.readFileSync(p, 'utf8');
      }
    };
    walk(dir);
    return out;
  }

  function injectRenameFailure(shouldFail) {
    jest.spyOn(fs, 'renameSync').mockImplementation((src, dest) => {
      if (shouldFail(String(src), String(dest))) {
        const err = new Error('injected EPERM');
        err.code = 'EPERM';
        throw err;
      }
      return realRenameSync(src, dest);
    });
  }

  const faultPoints = [
    ['child move', (s, d) => d.startsWith(featuresRoot) && path.basename(d).startsWith('FTR-008')],
    ['req backup move', (s) => s === path.join(parentDir, 'req')],
    ['feature.md move', (s) => s === path.join(parentDir, 'feature.md')],
    ['epic.md move', (s, d) => path.basename(d) === 'epic.md'],
    ['registry write', (s, d) => path.basename(d) === 'REGISTRY.md'],
  ];

  test.each(faultPoints)('restores tree and registry with no staging or temp file when the %s rename fails', async (_name, shouldFail) => {
    const before = snapshot(featuresRoot);
    injectRenameFailure(shouldFail);

    await expect(
      apply({ featuresRoot, parentId: 'FTR-007', proposal: sampleProposal() })
    ).rejects.toThrow();

    jest.restoreAllMocks();
    expect(snapshot(featuresRoot)).toEqual(before);
    expect(
      fs.readdirSync(featuresRoot).filter(n => /\.split-staging-|REGISTRY\.md\.tmp-/.test(n))
    ).toEqual([]);
  });

  test('reports ROLLBACK_FAILED listing the remaining paths when a reverse rename fails', async () => {
    let epicMoveFailed = false;
    injectRenameFailure((s, d) => {
      if (path.basename(d) === 'epic.md') { epicMoveFailed = true; return true; }
      // Once the forward move has failed, the reverse of the moved child also fails.
      return epicMoveFailed && s.startsWith(featuresRoot) && path.basename(s).startsWith('FTR-008');
    });

    const err = await apply({ featuresRoot, parentId: 'FTR-007', proposal: sampleProposal() }).catch(e => e);

    jest.restoreAllMocks();
    const remaining = fs.readdirSync(featuresRoot).filter(n => n.startsWith('FTR-008'));
    expect(err).toBeInstanceOf(FeatureSplitError);
    expect(err.code).toBe('ROLLBACK_FAILED');
    expect(remaining.length).toBeGreaterThan(0);
    for (const name of remaining) {
      expect(err.message).toContain(name);
    }
  });
});
```

Length note: this block is roughly 90 lines and adds five tests. Everything else in the file is owned by earlier tasks.

**Verification commands:**

```
grep -qF "describe('apply rollback fault injection'" tests/scripts/feature-split.test.js
```

```
npx jest tests/scripts/feature-split.test.js --testNamePattern "apply rollback fault injection"
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```