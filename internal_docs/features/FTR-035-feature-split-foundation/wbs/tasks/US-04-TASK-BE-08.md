<a id="task-US-04-TASK-BE-08"></a>
### US-04-TASK-BE-08

- **Task ID:** US-04-TASK-BE-08
- **Title:** Add late-mode apply plan builder
- **Outcome:** feature-split.js has a planLate helper that requires exactly one child (LATE_CHILD_COUNT) and skips the minChildren check. It maps dependsOn to existing epic children from epic.md (UNKNOWN_DEPENDENCY otherwise), defaults to the previous last child, assigns the ID, sets the checkpoint to late and refuses with TARGET_EXISTS if the ID already exists.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-04-TASK-BE-05, US-04-TASK-BE-06, US-04-TASK-BE-02
- **Acceptance criteria:** AC-34, AC-24
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add late child apply plan builder

**Implementation notes:**

Scope: add one new internal helper, `planLate`, to `src/claude/scripts/feature-split.js`. It is the late-mode counterpart of `planInitial` (US-04-TASK-BE-07). It does not write files, does not touch the registry, and does not stage anything. Those belong to the commit routine (US-04-TASK-BE-10) and the apply wiring (US-04-TASK-BE-11).

Dependencies it relies on:
- `lastEpicRows(epicText)` from US-04-TASK-BE-05 (`parseEpicRows`). It returns `{ order, id, name, dir, checkpoint, deps, owner }` per child row.
- Mode detection from US-04-TASK-BE-06. Late mode is already chosen by the caller, so `planLate` assumes `epic.md` exists.
- `allocateIds(featuresRoot, registry, count)` from US-02 (`US-04-TASK-BE-02`). It returns the next free `FTR-NNN`, which already skips registry headings and folder prefixes.
- Existing helpers in the file: `normaliseChild`, `validateProposal`, `slugOf`, `findBlock`, `fail`.

Signature and algorithm (real code, not prose):

```javascript
// Late-mode plan: exactly one child appended after the existing epic children.
// Returns plan items shaped like planInitial's items, with checkpoint 'late' and owner false.
function planLate({ featuresRoot, registry, epicText, proposal }) {
  if (proposal.children.length !== 1)
    fail('LATE_CHILD_COUNT', `A late apply takes exactly one child; got ${proposal.children.length}`);

  const child = normaliseChild(proposal.children[0]);
  const declared = child.dependsOn;                    // names of existing epic children

  // Validate the child on its own. minChildren is NOT checked (checkMin: false).
  // dependsOn is cleared first, because its names refer to epic.md rows, not to siblings
  // in this proposal, and validateProposal would reject them as DEPENDS_ON_INVALID.
  validateProposal({ ...proposal, children: [{ ...child, dependsOn: [] }], sharedFoundationOwner: null },
    { checkMin: false });

  const rows = lastEpicRows(epicText);
  if (rows.length === 0)
    fail('PARENT_INVALID', 'epic.md has no child rows to place a late child after');

  const byName = new Map(rows.map(r => [r.name, r]));
  const deps = declared.length
    ? declared.map(n => {
        const row = byName.get(n);
        if (!row) fail('UNKNOWN_DEPENDENCY', `${n} is not a child listed in epic.md`, { key: n });
        return row.id;
      })
    : [rows[rows.length - 1].id];                      // default: the previous last child

  const [id] = allocateIds(featuresRoot, registry, 1);
  const dir = `${id}-${slugOf(child.name)}`;
  if (findBlock(registry, id) || fs.existsSync(path.join(featuresRoot, dir)))
    fail('TARGET_EXISTS', `${id} already exists`, { key: id });

  return [{ ...child, dependsOn: [], id, dir, checkpoint: 'late', deps, owner: false }];
}
```

Key points for the implementer:
- `LATE_CHILD_COUNT` is checked first, before any other work.
- `minChildren` is never checked in late mode. The `checkMin: false` flag is the only way it is skipped.
- `dependsOn` in the proposal holds epic child **names**. It is mapped to epic child **IDs** through `lastEpicRows`. When it is empty, the default is the last row's ID (D-16).
- The ID comes from `allocateIds`, which already skips existing IDs. The `TARGET_EXISTS` check is therefore a defensive guard against a race or a stale registry. It is not the main way duplicates are avoided.
- The helper must not mutate `proposal`, and it must not write any file.

Conflicts with the Tech-Spec excerpt (the skeleton wins for this task, but the host should align the other files):
- The skeleton names `UNKNOWN_DEPENDENCY` and `TARGET_EXISTS`. The design excerpt and the test spec use `DEPENDS_ON_INVALID` and `CHILD_DIR_EXISTS` for the same situations. This task uses the skeleton codes. The conflict must be resolved in the design or the tests before the test task (US-04-TASK-TEST-05) is written.
- The excerpt does not say what happens when an epic has no child rows. `PARENT_INVALID` is used here, which matches the code that US-04-TASK-BE-06 already uses for malformed parent state. This is a choice, not a decision from the spec.
- The excerpt does not say whether a new child name may equal an existing epic child name. This helper does not check it. The host should decide at Gate 1.

Length: this is one helper of about 30 lines. It should take one focused agent run.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
grep -q "function planLate" src/claude/scripts/feature-split.js
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```