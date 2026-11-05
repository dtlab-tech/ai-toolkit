<a id="task-US-03-TASK-TEST-02"></a>
### US-03-TASK-TEST-02

- **Task ID:** US-03-TASK-TEST-02
- **Title:** Add dependency order tests
- **Outcome:** tests/scripts/feature-split.test.js contains passing tests showing that buildProposal keeps the proposal's child order and defaults the shared-foundation owner to the first child in dependency order: with no dependsOn it is the first child, and a dependsOn chain overrides the proposal order. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-05
- **Acceptance criteria:** AC-18
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 8000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add dependency order tests

**Implementation notes:**

Append one `describe` block to the existing `tests/scripts/feature-split.test.js`. Do not create a second file and do not change the existing top-level imports. Reuse the `lib` import already in that file.

Open gaps for the host to confirm (the excerpt does not settle them, so this plan does not invent answers):

1. **Runner.** The Tech-Spec service interface assumes `node:test`, but the AGENTS.md conventions use Jest globals (`describe`, `test`, `expect`, `beforeEach`, `afterEach`). The snippet below uses Jest, following AGENTS.md. Match whatever runner the existing file already uses.
2. **`buildProposal` call shape (decided by US-03-TASK-BE-05).** `buildProposal({ source, children, sharedFoundationOwner, foundationNote, config })` with `config` returned by `loadConfig({ projectRoot })`. It never reads a config file.
3. **Child order in the returned proposal (decided).** BE-05 maps the children through `normaliseChild` and does not reorder them, so `proposal.children` keeps the order the caller gave. The dependency order shows only through the default owner, which is the first child in dependency order.
4. **Dependency reference.** The skeleton lists `dependsOn: US-03-TASK-BE-05`, but the dependency-order function is owned by US-03-TASK-BE-02. Restated as given; this is a skeleton question for the host, not something to change here.

Duplicate check: `dependencyOrder` is built by US-03-TASK-BE-02. This is a TEST task, so exercising that behavior is expected.

The tmpDir is used only as `projectRoot`. buildProposal writes no file, so no real `internal_docs/features/` path is touched.

Snippet (inside the existing file):

```javascript
describe('dependency order through buildProposal', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-dep-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const child = (name, dependsOn = []) => ({
    name,
    purpose: `${name} purpose`,
    keywords: [name.toLowerCase()],
    dependsOn,
    assigned: `UC-${name}`,
  });

  const build = (children) => lib.buildProposal({
    source: 'definition', children, config: lib.loadConfig({ projectRoot: tmpDir }),
  });

  test('children with no dependsOn keep their proposal order and the first one is the default owner', () => {
    const { proposal } = build([child('Alpha'), child('Bravo'), child('Charlie')]);
    expect(proposal.children.map(c => c.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(proposal.sharedFoundationOwner).toBe('Alpha');
  });

  test('dependsOn decides the default owner even when the dependent child is listed first', () => {
    const { proposal } = build([child('Billing', ['Auth']), child('Auth'), child('Reports')]);
    // buildProposal does not reorder the children; the dependency order shows through the owner.
    expect(proposal.children.map(c => c.name)).toEqual(['Billing', 'Auth', 'Reports']);
    expect(proposal.sharedFoundationOwner).toBe('Auth');
  });
});
```

**Verification commands:**

```
grep -qF "describe('dependency order through buildProposal'" tests/scripts/feature-split.test.js
```

```
npx jest tests/scripts/feature-split.test.js -t "dependency order"
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```