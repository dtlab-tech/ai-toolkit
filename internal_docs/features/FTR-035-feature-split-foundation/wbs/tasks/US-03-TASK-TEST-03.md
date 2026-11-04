<a id="task-US-03-TASK-TEST-03"></a>
### US-03-TASK-TEST-03

- **Task ID:** US-03-TASK-TEST-03
- **Title:** Add editProposal tests
- **Outcome:** tests/scripts/feature-split.test.js contains passing tests for editProposal, called with one op object and returning { proposal, warnings }. They cover a refused edit below minChildren leaving the proposal unchanged, a remove refused while a sibling still depends on the child, an accepted merge whose purpose joins the purposes with ' / ' and whose Keywords are the union, rename updating references, a moved owner returning a BR-03 warning object without refusal, editable purpose and keywords, and no files written. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-06
- **Acceptance criteria:** AC-16, AC-17, AC-19, AC-20
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add editProposal tests

**Implementation notes:**

Append one `describe('editProposal()', ...)` block to the existing `tests/scripts/feature-split.test.js`. Do not create a new file and do not change the existing helpers (`sampleProposal`, `tmpProject`, `makeFeatureDir`) or other describe blocks.

Runner: AGENTS.md specifies Jest (`describe`/`test`/`expect`, `'use strict';`, `fs.mkdtempSync` temp dir cleaned in `afterEach`). The Tech-Spec assumed `node:test`. Follow AGENTS.md. If the existing file already uses `node:test`, stop and report the mismatch instead of mixing runners.

Assumptions that are not in the excerpt. Confirm each against the implementation from US-03-TASK-BE-06 before writing the assertions:
- Edit shape (decided by US-03-TASK-BE-06): `editProposal(proposal, op)` takes one op object with a `type` (`rename` {from, to}, `set` {name, field, value}, `reorder` {names}, `owner` {name}, `add` {child}, `remove` {name}, `merge` {names, into}) and returns `{ proposal, warnings }`. Each warning is an object with `code` and `message`. To apply several edits, call `editProposal` again on the returned `proposal`.
- Refusal: the code assumes a refused edit throws `FeatureSplitError`. It does not assert a specific error `code`.
- The "no files written" check snapshots a temp directory before and after the call, so it does not depend on the helpers.

Code to add:

```js
describe('editProposal()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-split-edit-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const threeChildren = () => sampleProposal({
    children: [
      ...sampleProposal().children,
      { name: 'Reports', purpose: 'Reporting', summary: 'Reporting',
        keywords: ['reports'], dependsOn: ['Billing'], assigned: 'UC-04' },
    ],
  });

  test('refuses removing a child below minChildren and leaves the proposal unchanged', () => {
    const proposal = sampleProposal(); // 2 children, minChildren 2
    const before = structuredClone(proposal);

    expect(() => editProposal(proposal, { type: 'remove', name: 'Billing' })).toThrow(FeatureSplitError);

    expect(proposal).toEqual(before);
  });

  test('refuses removing a child that a sibling still depends on, and never rewrites dependsOn', () => {
    const proposal = threeChildren(); // Reports dependsOn Billing; 3 children, so minChildren is not the cause
    const before = structuredClone(proposal);

    expect(() => editProposal(proposal, { type: 'remove', name: 'Billing' })).toThrow(FeatureSplitError);

    expect(proposal).toEqual(before);
  });

  test('accepts a merge, joins the purposes with " / " and unions the keywords', () => {
    const proposal = threeChildren();
    const billing = proposal.children.find(c => c.name === 'Billing');
    const reports = proposal.children.find(c => c.name === 'Reports');

    const result = editProposal(proposal, { type: 'merge', names: ['Billing', 'Reports'], into: 'Billing' });

    expect(result.proposal.children.map(c => c.name)).toEqual(['Auth', 'Billing']);
    const merged = result.proposal.children.find(c => c.name === 'Billing');
    expect(merged.purpose).toBe(`${billing.purpose} / ${reports.purpose}`);
    expect(merged.summary).toBe(merged.purpose);
    expect([...merged.keywords].sort()).toEqual([...new Set([...billing.keywords, ...reports.keywords])].sort());
  });

  test('rename updates dependsOn references and the shared-foundation owner', () => {
    const proposal = sampleProposal(); // Billing dependsOn Auth; owner is Auth

    const result = editProposal(proposal, { type: 'rename', from: 'Auth', to: 'Identity' });

    const billing = result.proposal.children.find(c => c.name === 'Billing');
    expect(billing.dependsOn).toEqual(['Identity']);
    expect(result.proposal.sharedFoundationOwner).toBe('Identity');
  });

  test('moving the shared-foundation owner returns a BR-03 warning object and is not refused', () => {
    const proposal = sampleProposal(); // owner Auth, Auth is first in dependency order

    const result = editProposal(proposal, { type: 'owner', name: 'Billing' });

    expect(result.proposal.sharedFoundationOwner).toBe('Billing');
    expect(result.warnings.some(w => /BR-03/.test(`${w.code} ${w.message}`))).toBe(true);
  });

  test('purpose and keywords are editable', () => {
    const proposal = sampleProposal();

    const first = editProposal(proposal, { type: 'set', name: 'Auth', field: 'purpose', value: 'Login and MFA' });
    const second = editProposal(first.proposal, { type: 'set', name: 'Auth', field: 'keywords', value: ['auth', 'mfa'] });

    const auth = second.proposal.children.find(c => c.name === 'Auth');
    expect(auth.purpose).toBe('Login and MFA');
    expect(auth.keywords).toEqual(['auth', 'mfa']);
  });

  test('writes no files under the project tree', () => {
    fs.writeFileSync(path.join(tmpDir, 'marker.txt'), 'x');
    const snapshot = () => fs.readdirSync(tmpDir, { recursive: true }).sort();
    const before = snapshot();

    editProposal(sampleProposal(), { type: 'set', name: 'Auth', field: 'purpose', value: 'New' });

    expect(snapshot()).toEqual(before);
  });
});
```

Notes on the cases:
- `threeChildren()` is needed because the 2-child sample cannot accept a merge at `minChildren: 2`.
- The rename case checks that both the `dependsOn` reference and `sharedFoundationOwner` follow the new name.
- The "no files written" case only proves that nothing changed under `tmpDir`. It does not cover the real project tree. The Tech-Spec's spy on `isNewFeature` (edited proposals are not re-measured) is not in this task's outcome, so it is not added here.

Verification commands:

**Verification commands:**

```
npx jest tests/scripts/feature-split.test.js -t "editProposal"
```

```
npm test
```