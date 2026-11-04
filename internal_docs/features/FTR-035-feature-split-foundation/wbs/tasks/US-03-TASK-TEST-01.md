<a id="task-US-03-TASK-TEST-01"></a>
### US-03-TASK-TEST-01

- **Task ID:** US-03-TASK-TEST-01
- **Title:** Add buildProposal tests
- **Outcome:** tests/scripts/feature-split.test.js contains passing tests for buildProposal. They cover the D-08 shape and minChildren from the config, summary equal to purpose with caller keywords kept, invalid or duplicate slug rejection naming the child, too few children, a dependency cycle, and no files written. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-05
- **Acceptance criteria:** AC-14, AC-15, AC-19, AC-20
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add buildProposal tests

**Implementation notes:**

**Placement.** Append one new `describe('buildProposal()', ...)` block to the existing `tests/scripts/feature-split.test.js`. That file is created by INFRA-TASK-TEST-01 and extended by US-01 and US-02 tests, so do not recreate it and do not change the other describe blocks. Add `buildProposal` to the existing destructuring of `require('../../src/claude/scripts/feature-split.js')` only if it is not already there.

**Runner.** The Tech-Spec header assumes `node:test`, but `AGENTS.md` says the project uses Jest (`npm test` runs jest with `--bail`, and the test pattern uses `describe`/`test`/`expect`). Use the runner the existing file already uses. If it is Jest, use the globals below. If it is `node:test`, translate `expect(x).toBe(y)` to `assert.equal`, and `toThrow` to `assert.throws`.

**Signature (decided by US-03-TASK-BE-05).** `buildProposal({ source, children, sharedFoundationOwner, foundationNote, config })` returns `{ proposal, warnings }`. It never reads a config file: `config` is the object returned by `loadConfig`. The tests therefore call `loadConfig({ projectRoot: root })` and pass the result, and a project override (`feature-split.config.json` in `root`) is read by `loadConfig`, not by `buildProposal`. Use the `loadConfig` binding that the file already imports.

**Helpers** (reuse the file's existing `tmpProject`/`sampleProposal` if present; otherwise add these):

```javascript
const listTree = (dir) => fs.readdirSync(dir, { recursive: true }).sort();
const child = (name, extra = {}) => ({
  name,
  purpose: `${name} purpose`,
  keywords: [name.toLowerCase()],
  dependsOn: [],
  assigned: 'UC-01',
  ...extra,
});
```

**Test block:**

```javascript
describe('buildProposal()', () => {
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-build-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  // buildProposal takes a loaded config; a project override is read by loadConfig (US-01-TASK-BE-02)
  const build = (children, extra = {}) =>
    buildProposal({ source: 'definition', children, config: loadConfig({ projectRoot: root }), ...extra });

  test('returns the D-08 proposal shape with minChildren 2 from the default config', () => {
    const { proposal } = build([child('Auth'), child('Billing')]);
    expect(Object.keys(proposal).sort())
      .toEqual(['children', 'foundationNote', 'minChildren', 'source', 'sharedFoundationOwner']);
    expect(proposal.minChildren).toBe(2);
    expect(proposal.source).toBe('definition');
  });

  test('uses minChildren from the loaded config (a project override here) instead of the default', () => {
    fs.writeFileSync(path.join(root, 'feature-split.config.json'), JSON.stringify({ minChildren: 3 }));
    expect(() => build([child('Auth'), child('Billing')])).toThrow(FeatureSplitError);
  });

  test('sets summary equal to purpose and keeps caller keywords', () => {
    const { proposal } = build([
      child('Auth', { purpose: 'Sign-in and sessions', keywords: ['auth', 'login'] }),
      child('Billing'),
    ]);
    expect(proposal.children[0].summary).toBe('Sign-in and sessions');
    expect(proposal.children[0].keywords).toEqual(['auth', 'login']);
  });

  test('rejects a reserved device name and names the child', () => {
    expect(() => build([child('CON'), child('Billing')])).toThrow(FeatureSplitError);
    expect(() => build([child('CON'), child('Billing')])).toThrow(/CON/);
  });

  test('rejects a duplicate slug and names the child', () => {
    expect(() => build([child('Auth'), child('Auth')])).toThrow(FeatureSplitError);
    expect(() => build([child('Auth'), child('Auth')])).toThrow(/Auth/);
  });

  test('rejects a proposal with fewer children than minChildren', () => {
    expect(() => build([child('Auth')])).toThrow(FeatureSplitError);
  });

  test('rejects a dependency cycle', () => {
    expect(() => build([
      child('Auth', { dependsOn: ['Billing'] }),
      child('Billing', { dependsOn: ['Auth'] }),
    ])).toThrow(FeatureSplitError);
  });

  test('writes no files under the project root', () => {
    const before = listTree(root);
    build([child('Auth'), child('Billing')]);
    expect(listTree(root)).toEqual(before);
  });
});
```

**Notes on the cases.** The `CON` case relies on the reserved-name rule in the slug function (INFRA-TASK-BE-03). The cycle case uses names in `dependsOn`, matching the `sampleProposal` fixture. If BE-05 expects slugs there, change the fixture, not the assertion. Every test creates and removes its own temp tree.

**Verification commands:**

```
npm test -- tests/scripts/feature-split.test.js
```

```
npm test
```