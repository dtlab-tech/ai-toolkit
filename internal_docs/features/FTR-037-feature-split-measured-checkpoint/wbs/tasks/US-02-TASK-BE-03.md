<a id="task-US-02-TASK-BE-03"></a>
### US-02-TASK-BE-03

- **Task ID:** US-02-TASK-BE-03
- **Title:** Map depth-0 components to the shared foundation child
- **Outcome:** check-size matches component Paths as exact case-sensitive substrings of depth-0 Section 11 items and moves the child with the lowest block index holding a depth-0 component to position 1. That child is set as sharedFoundationOwner and every other child gets it as dependsOn. When no component matches, sharedFoundationOwner is null, every dependsOn is empty, and foundationNote states that no shared foundation is assigned.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-02, US-01-TASK-BE-04
- **Acceptance criteria:** AC-14
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** map depth-0 components to shared foundation child in proposal

**Implementation notes:**

Target file: `src/claude/scripts/feature-split.js`. This task replaces the open-gap-1 stub in `buildProposal` with a real mapping. It does not change `groupChildren`, which is owned by US-02-TASK-BE-02.

**Superseded design point.** The Tech-Spec excerpt says the depth-0 component set cannot be computed and that `buildProposal` throws until the mapping is defined (open gap 1). The skeleton outcome now fixes the rule: exact, case-sensitive substring match of each component Path against depth-0 Section 11 item text. Follow the outcome. Do not keep the throw.

**Step 1: keep item text in `parseBuildOrder` (modify).** Group 2 of the existing `ITEM` regex is the item text, without the number prefix or the `— depends on:` clause. Store it next to the dependencies.

Before:
```js
items.set(Number(m[1]), deps);
```
After:
```js
items.set(Number(m[1]), { deps, text: m[2] });
```
`depths()` must then read `items.get(n).deps` instead of `items.get(n)`. Update every use in `depths()`, including the `deps.length` check and the `deps.map(depth)` call.

**Step 2: depth-0 texts.** An item is depth 0 exactly when its dependency list is empty. That is the same as depth 0 in `depths()`, so no second traversal is needed. `checkSize` already runs `depths()` first, which rejects dangling dependencies and cycles, so this helper can rely on a valid graph.

```js
function depth0ItemTexts(lines) {
  const items = parseBuildOrder(lines);            // Map<n, { deps, text }>
  return [...items.values()]
    .filter(i => i.deps.length === 0)
    .map(i => i.text);
}
```

**Step 3: foundation mapping.** Replace the existing `foundationChild` lines in `buildProposal`. `children` must already be in block order (part-1 first), as produced by `groupChildren`. Each child's Paths are read from its assigned component list (`child.assigned.components` in the BE-02 shape; align the field name with BE-02 when implementing).

```js
function mapFoundation(children, depth0Texts) {
  const holds = c => childComponents(c).some(p => p && depth0Texts.some(t => t.includes(p)));
  const holders = children.filter(holds);          // block order preserved
  if (holders.length === 0) {
    for (const c of children) c.dependsOn = [];
    return { children,
             sharedFoundationOwner: null,
             foundationNote: 'no shared foundation assigned: no component matches depth-0 build-order items' };
  }
  const owner = holders[0];                        // lowest block index holding a depth-0 component
  const ordered = [owner, ...children.filter(c => c !== owner)];   // move owner to position 1
  for (const c of ordered) c.dependsOn = c === owner ? [] : [owner.name];
  return { children: ordered, sharedFoundationOwner: owner.name, foundationNote: undefined };
}
```

Inside `buildProposal`, the `depth0` and `foundationChild` lines are replaced by:

```js
const depth0Texts = depth0ItemTexts(readSection11(featureDir));
const mapped = mapFoundation(children, depth0Texts);
return {
  source: 'measured',
  overCounts: over,
  children: mapped.children.map(c => ({ ...c, keywords: [] })),
  sharedFoundationOwner: mapped.sharedFoundationOwner,
  foundationNote: mapped.foundationNote
};
```

**Rules pinned by this design:**
- Matching is `String.prototype.includes` with no trimming or case folding. A Path that is a substring of depth-0 item text matches. Empty Paths never match.
- Only depth-0 items are searched. A Path that appears only in a depth-1 or deeper item does not match.
- The owner's `dependsOn` is `[]`. Every other child's `dependsOn` is exactly `[owner]`.
- Ordering: the owner moves to index 0. The other children keep their block order.
- The `foundationNote` text in the no-match branch contains the required phrase "no shared foundation assigned". On a match, `foundationNote` is `undefined`, so the key is omitted from JSON.

**Ambiguities to flag, not invent around:**
- The outcome says "moves ... to position 1" but does not say whether child names are renumbered. This design keeps names unchanged (for example, `part-2` may appear first). If renumbering is wanted, it must be decided in the skeleton.
- The dependency value (`owner.name` versus an `id`) must match what BE-02 uses as the child reference. Align it when implementing.

**Size:** about 35 changed lines in one file. Well within the atomic band.

**Verification commands:**

```
grep -q "function depth0ItemTexts(" src/claude/scripts/feature-split.js && grep -q "function mapFoundation(" src/claude/scripts/feature-split.js
```

```
node --check src/claude/scripts/feature-split.js
```

```
npm test -- --testPathPattern=feature-split-check-size
```