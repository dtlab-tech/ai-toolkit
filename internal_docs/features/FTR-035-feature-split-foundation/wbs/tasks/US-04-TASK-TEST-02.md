<a id="task-US-04-TASK-TEST-02"></a>
### US-04-TASK-TEST-02

- **Task ID:** US-04-TASK-TEST-02
- **Title:** Add apply registry entry tests
- **Outcome:** tests/scripts/feature-split.test.js has passing tests for the registry after apply. They cover child Parent, Depends on (none for the first child) and Detail, the parent entry changed in place to epic with its Summary, Keywords union and epic.md Detail, an entry with another status left byte-identical, and epic.md existing when the registry is written. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-11
- **Acceptance criteria:** AC-29, AC-30, AC-31, AC-39
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add apply registry entry tests

**Implementation notes:**

This task only adds a `describe` block to `tests/scripts/feature-split.test.js`. It does not change `feature-split.js`. It exercises `apply({ featuresRoot, parentId, proposal })` from US-04-TASK-BE-11, which is the expected duplicate: this is a TEST task, so exercising the built behavior is correct.

Open items the host should resolve before implementation (these are not decided by this file):

1. **Runner conflict.** The Tech-Spec assumes `node:test` and `node:assert`. `AGENTS.md` specifies Jest (`describe`, `test`, `expect`, `beforeEach`, `afterEach`, run by `npm test`). The block below uses Jest globals to match the project convention. Reconcile this with the header that INFRA-TASK-TEST-01 already created in the same file. Do not mix runners in one file.
2. **Registry heading separator.** The component index uses `## FTR-NNN — Title` (em dash). Design D-18 uses `## FTR-NNN: Title` (colon). The fixture below uses the em dash. Check it against the live `REGISTRY.md` (Tech-Spec gap 6).
3. **Field format is assumed.** The fixture assumes `**Key:** value` lines, keywords separated by `, `, and a `→ [Detail](<path>)` line. The parent folder name `FTR-010-login` is also assumed.
4. **Keywords union is ambiguous.** The skeleton says "union of Keywords", and the design says "union of child Keywords". The parent fixture keyword (`auth`) is a subset of the children's union (`auth`, `billing`), so the assertion holds under either reading.
5. **AC-to-case mapping.** The text of AC-29, AC-30, AC-31 and AC-39 is not in the excerpt. The host must confirm this mapping against Requirements (Tech-Spec gap 1).
6. **Spy seam.** The `epic.md` timing test spies on `fs.renameSync` through the module object. This works only if `feature-split.js` calls `fs.renameSync` at call time and does not destructure it at require time. Coordinate with BE-10 and the injectable-`fs` seam (Tech-Spec gap 7).

Fixture and helpers (append after the existing helpers and `sampleProposal`):

```js
const { apply } = lib;

function entryBlock(text, id) {
  const start = text.indexOf(`## ${id} `);
  if (start < 0) return null;
  const lineEnd = text.indexOf('\n', start);
  const m = text.slice(lineEnd).search(/\n(## FTR-|---)/);
  return m < 0 ? text.slice(start) : text.slice(start, lineEnd + m);
}

function readField(block, key) {
  const m = block.match(new RegExp(`\\*\\*${key}:\\*\\* (.*)`));
  return m ? m[1].trim() : undefined;
}

describe('apply registry entries', () => {
  const PARENT = 'FTR-010';
  const PARENT_DIR = 'FTR-010-login';
  const OTHER_ENTRY = [
    '## FTR-005 — Unrelated work',
    '**Keywords:** misc',
    '**Status:** in-progress',
    '**Summary:** Unrelated work.',
  ].join('\n');
  const PARENT_ENTRY = [
    `## ${PARENT} — Login`,
    '**Keywords:** auth',
    '**Status:** defined',
    '**Summary:** Sign-in and sessions for users. Billing follows.',
    `→ [Detail](${PARENT_DIR}/feature.md)`,
  ].join('\n');

  let root;
  let featuresRoot;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-apply-reg-'));
    featuresRoot = path.join(root, 'custom-features'); // non-default root (D-22)
    fs.mkdirSync(path.join(featuresRoot, PARENT_DIR), { recursive: true });
    fs.writeFileSync(path.join(featuresRoot, PARENT_DIR, 'feature.md'),
      '# Login\n\n## Summary\n\nOriginal text.\n');
    fs.writeFileSync(path.join(featuresRoot, 'REGISTRY.md'),
      ['# Feature Registry', '', PARENT_ENTRY, '', '---', '', OTHER_ENTRY, ''].join('\n'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const runApply = () =>
    apply({ featuresRoot, parentId: PARENT, proposal: sampleProposal() });
  const readRegistry = () =>
    fs.readFileSync(path.join(featuresRoot, 'REGISTRY.md'), 'utf8');

  test('each child entry records Parent, Depends on and a Detail link', () => {
    const res = runApply();
    const reg = readRegistry();
    const [authId, billingId] = res.children.map(c => c.id);
    const auth = entryBlock(reg, authId);
    const billing = entryBlock(reg, billingId);

    expect(readField(auth, 'Parent')).toBe(PARENT);
    expect(readField(auth, 'Depends on')).toBe('none');
    expect(auth).toMatch(/\[Detail\]\(.*feature\.md\)/);

    expect(readField(billing, 'Parent')).toBe(PARENT);
    expect(readField(billing, 'Depends on')).toBe(authId);
    expect(billing).toMatch(/\[Detail\]\(.*feature\.md\)/);
  });

  test('parent entry is changed in place to epic with first-sentence Summary, Keywords union and epic.md Detail', () => {
    runApply();
    const reg = readRegistry();
    expect(reg.match(new RegExp(`^## ${PARENT} `, 'gm'))).toHaveLength(1);

    const epic = entryBlock(reg, PARENT);
    expect(readField(epic, 'Status')).toBe('epic');
    expect(readField(epic, 'Summary')).toBe('Sign-in and sessions for users.');
    expect(readField(epic, 'Keywords').split(/,\s*/).sort()).toEqual(['auth', 'billing']);
    expect(epic).toMatch(/\[Detail\]\(.*epic\.md\)/);
    expect(reg.indexOf(`## ${PARENT} `)).toBeLessThan(reg.indexOf('## FTR-005 '));
  });

  test('an entry with another status is left byte-identical', () => {
    runApply();
    expect(readRegistry()).toContain(OTHER_ENTRY);
  });

  test('epic.md exists in the parent folder at the moment REGISTRY.md is written', () => {
    const realRename = fs.renameSync;
    const epicPresentAtRegistryWrite = [];
    const spy = jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (path.basename(to) === 'REGISTRY.md') {
        epicPresentAtRegistryWrite.push(
          fs.existsSync(path.join(featuresRoot, PARENT_DIR, 'epic.md')));
      }
      return realRename(from, to);
    });
    try {
      runApply();
    } finally {
      spy.mockRestore();
    }
    expect(epicPresentAtRegistryWrite).toEqual([true]);
  });
});
```

Run `npm test` after appending. If the `REGISTRY.md` format check (item 2) or the runner check (item 1) fails, stop and report rather than adjusting the assertions to match output.

**Verification commands:**

```
npx jest tests/scripts/feature-split.test.js -t "apply registry entries"
```

```
npm test
```