<a id="task-US-02-TASK-BE-02"></a>
### US-02-TASK-BE-02

- **Task ID:** US-02-TASK-BE-02
- **Title:** Assign components to child blocks and fill child fields
- **Outcome:** groupChildren assigns each spec/index.md component to the block of the lowest-numbered use case reachable through its Addresses ACs and their Related UC. A component with no resolvable link goes to block 1 with a no use-case link note. Each child gets name part-k, a purpose and summary of the form Use cases first..last and their components, and an assigned list of use-case IDs and component Paths.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-10, AC-15
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** assign components and fill child fields in measured proposal

**Implementation notes:**

Scope and gaps in the given excerpt (read first):

- The excerpt does not say how the `Addresses` column of the component table in `spec/index.md` is formatted, or where the AC-to-Related-UC link is stored (`req/index.md` is assumed). Confirm both before writing the parsers. If the AC-to-UC link source is missing entirely, throw `Unavailable("AC to use-case link source missing")` so the count is reported as unavailable. Do not silently send every component to block 1, because that would hide a source defect.
- The excerpt does not name the child's field for use cases and components. `buildProposal` reads `c.components`, and the SKILL text reads `child.use_cases`. This task uses `useCases` and `components`, matching `buildProposal`. Record the choice in a code comment so the SKILL text can be aligned later.
- The "no use-case link note" has no named field in the skeleton. This task stores it in a per-child `notes` array.
- The block input comes from US-02-TASK-BE-01 (contiguous, numerically sorted use-case blocks with 1-based `index`). The exact return shape of that function is not in this excerpt. The code below assumes `blocks = [{ index, useCases: ['UC-01', ...] }]`. Align it with BE-01 before coding.
- This task implements the grouping rule. Open gap 2 in the `feature-split.js` design (the `groupChildren` throw) is closed by it. The gap test in the check-size test file must be removed by the TEST tasks, not here.

Changes to `src/claude/scripts/feature-split.js`:

1. Keep `groupChildren` from BE-01 for the child count and use-case blocks. Add the component assignment and child field fill after the blocks are computed.
2. Do not rename children after BE-03 moves the foundation child. `name` and `id` keep the block number `k`. BE-03 changes only the position.

Algorithm (pseudocode, to be translated to the module's style):

```js
function assignComponents({ featureDir, blocks }) {
  // blocks: [{ index: k, useCases: ['UC-01', ...] }] from groupChildren (BE-01), k is 1-based
  const blockOfUc = new Map();
  for (const b of blocks) for (const uc of b.useCases) blockOfUc.set(uc, b.index);

  const acToUcs = readAcRelatedUcs(featureDir);   // Map<'AC-NN', string[]>, source to confirm
  const rows = readComponentRows(featureDir);     // [{ path, addresses: ['AC-NN', ...] }], single table

  const buckets = new Map(blocks.map(b => [b.index, { components: [], notes: [] }]));
  for (const row of rows) {
    const linked = row.addresses
      .flatMap(ac => acToUcs.get(ac) ?? [])
      .filter(uc => blockOfUc.has(uc));          // a dangling UC id does not count as a link
    if (linked.length === 0) {
      buckets.get(1).components.push(row.path);
      buckets.get(1).notes.push(`${row.path}: no use-case link; assigned to block 1`);
      continue;
    }
    const lowest = [...linked].sort(byNumericUcId)[0];   // lowest-numbered reachable UC
    buckets.get(blockOfUc.get(lowest)).components.push(row.path);
  }
  return blocks.map(b => fillChild(b, buckets.get(b.index)));
}

function fillChild(block, bucket) {
  const first = block.useCases[0];
  const last = block.useCases[block.useCases.length - 1];
  const text = `Use cases ${first}..${last} and their components`; // skeleton form, literal
  return {
    id: block.index,
    name: `part-${block.index}`,
    purpose: text,
    summary: text,                 // editable later by the user (SKILL, Step 1a)
    useCases: [...block.useCases],
    components: [...bucket.components],
    notes: [...bucket.notes],
  };
}
```

Notes on this code:

- A block can end up with no components. The child is still emitted with `components: []`. The SKILL text already refuses to accept such a child unedited, so this is not an error here.
- Components are kept in spec order within each bucket, so output is deterministic (required by US-01-TASK-TEST-01's repeat-run check).
- `byNumericUcId` compares the number after `UC-`, not the string, so `UC-10` sorts after `UC-9`.

Verification must confirm that the module still loads and that the existing suite passes. The unit-level behaviour is covered by the TEST tasks.

**Verification commands:**

```
grep -q "function assignComponents(" src/claude/scripts/feature-split.js && grep -q "function fillChild(" src/claude/scripts/feature-split.js
```

```
node --check src/claude/scripts/feature-split.js
```

```
npm test
```