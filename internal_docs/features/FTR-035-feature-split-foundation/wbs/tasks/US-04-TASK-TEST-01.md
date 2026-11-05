<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Add initial split apply success tests
- **Outcome:** tests/scripts/feature-split.test.js has passing tests, using temp fixtures, for an initial apply. They cover epic.md (split table once per child, checkpoint, verbatim trailing original text, no epic.json), child folders and feature.md content including foundation only in the first child, ID allocation across registry and folders, and the parent folder ending with epic.md only after its generated req/ and spec/ were moved into the backup and removed with staging. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-11
- **Acceptance criteria:** AC-21, AC-25, AC-27, AC-28, AC-42
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add initial split apply tests

**Implementation notes:**

Scope: add a `describe('initial apply success', ...)` block to the existing `tests/scripts/feature-split.test.js`. Do not change the library. Every case builds its own temp tree with `fs.mkdtempSync(os.tmpdir())` and removes it in a `finally`, so no real `internal_docs/features/` is touched.

Points to settle while writing the file:

1. **Missing-registry case (decided: dropped).** `apply` refuses when the parent has no registry entry (US-04-TASK-BE-06, AC-33), so a missing registry cannot be created by `apply`. Creating a missing registry belongs to `register` (AC-42). Do not write this case.
2. **Test runner conflict.** The design uses `node:test` with `node:assert/strict`. The AGENTS.md excerpt shows Jest globals (`describe`, `test`, `beforeEach`, `expect`). Match whichever runner the existing file already uses (created by INFRA-TASK-TEST-01 and US-01/US-02 tests). The snippet below assumes `node:test`.
3. **Registry heading format.** BE-04 and the Tech-Spec component line say `## FTR-NNN — Title` (em dash). The design's gap 6 says `## FTR-NNN: Title`. Use the em dash form and check it against the live `REGISTRY.md` before relying on it.
4. **AC text is not in the excerpt.** The mapping of AC-21, AC-25, AC-27, AC-28 and AC-42 to these cases must be confirmed against Requirements.

Assumptions to confirm during implementation:

- Child folders are created as siblings under `featuresRoot`, and the parent folder keeps only `epic.md`. Use `result.children[i].dir` to locate each child folder rather than building the name.
- Children are numbered in dependency order (Auth before Billing, since Billing depends on Auth), so `sampleProposal()` yields `FTR-008` (Auth) and `FTR-009` (Billing) when the registry holds `FTR-005` and a folder `FTR-007-old` exists.
- Initial checkpoint equals the proposal `source`, so it is `definition` for `sampleProposal()`.

Shared helpers and first case:

```js
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { apply } = require('../../src/claude/scripts/feature-split.js');

function withFixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'split-apply-'));
  try { return fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

// Registry layout per BE-04 (em dash heading). Verify against live REGISTRY.md (blocker 3).
function registryEntry(id, title, status, summary) {
  return [
    `## ${id} — ${title}`,
    `**Keywords:** parent`,
    `**Status:** ${status}`,
    `**Summary:** ${summary}`,
    `→ [Detail](${id}-parent/feature.md)`,
    '---', '',
  ].join('\n');
}

function setupParent(featuresRoot, original) {
  const parent = path.join(featuresRoot, 'FTR-005-parent');
  fs.mkdirSync(path.join(parent, 'req'), { recursive: true });
  fs.writeFileSync(path.join(parent, 'feature.md'), original);
  return parent;
}

describe('initial apply success', () => {
  test('epic.md lists each child exactly once in its split table with checkpoint definition', () => withFixture((root) => {
    const featuresRoot = path.join(root, 'features');
    fs.mkdirSync(featuresRoot, { recursive: true });
    const original = '# Parent\n\nSummary here. More.\n';
    const parent = setupParent(featuresRoot, original);
    fs.writeFileSync(path.join(featuresRoot, 'REGISTRY.md'), registryEntry('FTR-005', 'Parent', 'defined', 'Summary here. More.'));

    const result = apply({ featuresRoot, parentId: 'FTR-005', proposal: sampleProposal() });
    const epic = fs.readFileSync(path.join(parent, 'epic.md'), 'utf8');

    for (const child of result.children) {
      const rows = epic.split('\n').filter((line) => line.includes(child.id));
      assert.equal(rows.length, 1, `${child.id} must appear once in the split table`);
      assert.match(rows[0], /definition/);
    }
    assert.ok(epic.endsWith(original), 'original feature text must be the trailing section, verbatim');
    assert.equal(fs.existsSync(path.join(parent, 'epic.json')), false);
  }));
});
```

Remaining cases to write in the same block, each with its own fixture:

- **Child folders and foundation:** the first child (Auth, `FTR-008`) `feature.md` contains `Shared models`. The second (Billing, `FTR-009`) does not. Each `feature.md` contains its purpose-based summary and parent ID `FTR-005`.
- **ID allocation:** registry holds `FTR-005`, and a folder `FTR-007-old` exists under `featuresRoot`. Assert `result.children.map(c => c.id)` deep-equals `['FTR-008', 'FTR-009']`.
- **Parent folder contents (decided):** after apply, `fs.readdirSync(parent)` deep-equals `['epic.md']`. The fixture parent holds `req/` and `spec/` with at least one file each, which apply moves into the backup and deletes with staging. Also assert that no `.split-staging-*` directory remains in `featuresRoot`.
- **Facade-independent return shape:** `result` deep-equals `{ epic: 'FTR-005', children: [...], registry: true }` with `epic` matching the parent ID. Confirm the exact `epic` value shape.

Do not write `describe`/`test` bodies that only check `result` is truthy.

**Verification commands:**

```
grep -qF "describe('initial apply success'" tests/scripts/feature-split.test.js
```

```
node --check tests/scripts/feature-split.test.js
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```