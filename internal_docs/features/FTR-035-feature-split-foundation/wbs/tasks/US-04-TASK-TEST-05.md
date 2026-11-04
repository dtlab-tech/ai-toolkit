<a id="task-US-04-TASK-TEST-05"></a>
### US-04-TASK-TEST-05

- **Task ID:** US-04-TASK-TEST-05
- **Title:** Add late child apply tests
- **Outcome:** tests/scripts/feature-split.test.js has passing tests for a late apply. The child is placed last with checkpoint late and a default dependency on the previous last child. A late proposal with two children is rejected, and minChildren is not applied. The epic Keywords include the new child's Keywords, and the existing child entries and feature.md files are unchanged. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-11
- **Acceptance criteria:** AC-34, AC-35
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add late child apply tests

**Implementation notes:**

**Scope and runner.** Add one `describe('late child apply', …)` block to `tests/scripts/feature-split.test.js`. Do not modify the other describe blocks written by sibling tasks. The Tech-Spec excerpt assumes `node:test`, but AGENTS.md specifies Jest (`describe`/`test`/`expect`, `beforeEach`/`afterEach`, `'use strict'`). Use Jest, since that is the project convention. If the file already uses another runner when this task runs, match the file. Raise this at Gate 1 because it is Change gap 8.

**Mode detection (resolves Change gap 2 for this task only).** BE-06 selects late mode from the parent folder: `epic.md` present and `feature.md` absent. BE-08 sets the checkpoint to `late` itself. The proposal therefore needs no checkpoint flag, and this test does not depend on one. The separate late-detection case stays pending under its own task.

**Acceptance-criteria mapping.** The text of AC-34 and AC-35 is not in the excerpt. The mapping of these cases to those IDs is unconfirmed and must be checked against Requirements at Gate 1.

**Fixture (local to the describe block, so no other helper's signature is assumed).** Build a temp tree in `beforeEach` and delete it in `afterEach`:

- `<tmp>/internal_docs/features/FTR-010/epic.md`: a split table with rows FTR-011 (order 1, checkpoint `definition`) and FTR-012 (order 2, depends on FTR-011, checkpoint `definition`).
- `<featuresRoot>/FTR-011-auth/feature.md` and `<featuresRoot>/FTR-012-billing/feature.md`. Child folders sit beside the parent folder, not inside it (D-14).
- `<featuresRoot>/REGISTRY.md`: an `## FTR-010 — Parent` entry with `**Status:** epic` and `**Keywords:** auth, billing`, followed by FTR-011 and FTR-012 entries with `**Parent:** FTR-010`, separated by `---`.

The table columns and registry field layout are assumptions. Check them against the output of INFRA-TASK-BE-04 and US-04-TASK-BE-01/BE-05 before running.

**Helpers:**

```javascript
// Reads the child rows of the split table in epic.md.
function childRows(epicText) {
  return epicText.split('\n')
    .map(l => l.match(/^\|\s*(\d+)\s*\|\s*(FTR-\d{3})\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/))
    .filter(Boolean)
    .map(m => ({ order: Number(m[1]), id: m[2], deps: m[4].trim(), checkpoint: m[5].trim() }));
}

// Byte-level snapshot of every file under a directory.
function snapshot(dir) {
  const out = {};
  for (const f of fs.readdirSync(dir)) out[f] = fs.readFileSync(path.join(dir, f));
  return out;
}

// One late child; minChildren is 2 to prove the late path ignores it.
const lateProposal = (overrides = {}) => ({
  source: 'definition',
  children: [{ name: 'Reporting', purpose: 'Usage reports', summary: 'Usage reports',
    keywords: ['reporting'], dependsOn: [], assigned: 'UC-09' }],
  sharedFoundationOwner: 'Reporting',
  foundationNote: '',
  minChildren: 2,
  ...overrides,
});
```

**Test cases** (each uses one `test()` with one behavior):

```javascript
test('places the new late child last with checkpoint late', () => {
  const result = apply({ featuresRoot, parentId: 'FTR-010', proposal: lateProposal() });
  expect(result.children).toEqual([{ id: 'FTR-013', dir: expect.any(String) }]);
  const rows = childRows(fs.readFileSync(path.join(featuresRoot, 'FTR-010', 'epic.md'), 'utf8'));
  expect(rows.map(r => r.id)).toEqual(['FTR-011', 'FTR-012', 'FTR-013']);
  expect(rows[2].checkpoint).toBe('late');
});

test('defaults the late child dependency to the previous last child', () => {
  apply({ featuresRoot, parentId: 'FTR-010', proposal: lateProposal() });
  const rows = childRows(fs.readFileSync(path.join(featuresRoot, 'FTR-010', 'epic.md'), 'utf8'));
  expect(rows[2].deps).toBe('FTR-012');
});

test('rejects a late proposal with two children and writes nothing', () => {
  const before = snapshot(path.join(featuresRoot, 'FTR-010'));
  const two = lateProposal({ children: [
    ...lateProposal().children,
    { name: 'Alerts', purpose: 'Alerts', summary: 'Alerts', keywords: [], dependsOn: [], assigned: 'UC-10' },
  ] });
  let caught;
  try { apply({ featuresRoot, parentId: 'FTR-010', proposal: two }); } catch (e) { caught = e; }
  expect(caught).toBeInstanceOf(FeatureSplitError);
  expect(caught.code).toBe('LATE_CHILD_COUNT');
  expect(snapshot(path.join(featuresRoot, 'FTR-010'))).toEqual(before);
  expect(fs.readdirSync(featuresRoot).some(d => d.startsWith('FTR-013'))).toBe(false);
});

test('does not apply minChildren to a single late child', () => {
  const result = apply({ featuresRoot, parentId: 'FTR-010', proposal: lateProposal({ minChildren: 2 }) });
  expect(result.registry).toBe(true);
});

test('adds the new child Keywords to the epic registry Keywords', () => {
  apply({ featuresRoot, parentId: 'FTR-010', proposal: lateProposal() });
  const reg = fs.readFileSync(path.join(featuresRoot, 'REGISTRY.md'), 'utf8');
  const epicKeywords = reg.match(/## FTR-010[\s\S]*?\*\*Keywords:\*\*([^\n]*)/)[1];
  expect(epicKeywords).toMatch(/reporting/);
  expect(epicKeywords).toMatch(/auth/);
  expect(epicKeywords).toMatch(/billing/);
});

test('leaves existing child registry entries and feature.md files unchanged', () => {
  const regBefore = fs.readFileSync(path.join(featuresRoot, 'REGISTRY.md'), 'utf8');
  const entry = t => t.match(/## FTR-01[12][\s\S]*?(?=\n---)/g);
  const authBefore = fs.readFileSync(path.join(featuresRoot, 'FTR-011-auth', 'feature.md'));
  const billBefore = fs.readFileSync(path.join(featuresRoot, 'FTR-012-billing', 'feature.md'));
  apply({ featuresRoot, parentId: 'FTR-010', proposal: lateProposal() });
  const regAfter = fs.readFileSync(path.join(featuresRoot, 'REGISTRY.md'), 'utf8');
  expect(entry(regAfter)).toEqual(entry(regBefore));
  expect(fs.readFileSync(path.join(featuresRoot, 'FTR-011-auth', 'feature.md'))).toEqual(authBefore);
  expect(fs.readFileSync(path.join(featuresRoot, 'FTR-012-billing', 'feature.md'))).toEqual(billBefore);
});
```

Field names on the proposal (`sharedFoundationOwner`, `foundationNote`) follow the D-08 shape in the excerpt. If BE-04's shape check rejects an owner on a late proposal, adjust `lateProposal` in this file only and say so in the commit.

**Notes for the implementer:**

- Do not assert on the exact folder name pattern for the new child. Use `path.basename(result.children[0].dir).startsWith('FTR-013')`, if a folder assertion is needed.
- Do not depend on the `Depends on` line format for the FTR-013 registry entry. This task checks the epic row only.
- Each `test()` is a separate scenario. Do not combine the two-child rejection with the single-child success.
- The pending cases from the Change section (malformed override, late-child detection, epic Detail target) are not part of this task.

**Verification commands:**

```
npx jest tests/scripts/feature-split.test.js -t "late child apply"
```

```
npm test
```