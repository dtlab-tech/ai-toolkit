<a id="task-US-04-TASK-BE-07"></a>
### US-04-TASK-BE-07

- **Task ID:** US-04-TASK-BE-07
- **Title:** Add initial-mode apply plan builder
- **Outcome:** feature-split.js has a planInitial helper that validates the proposal with validateProposal, computes dependency order and the BR-03 foundation warning without refusing, assigns IDs in dependency order, builds folder names and sibling dependency IDs, and refuses with TARGET_EXISTS if any ID folder, feature.md or registry heading already exists.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-04-TASK-BE-02, US-04-TASK-BE-06, US-03-TASK-BE-02, US-03-TASK-BE-03, US-03-TASK-BE-04
- **Acceptance criteria:** AC-24, AC-25, AC-26
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add initial split apply plan builder

**Implementation notes:**

This task extracts the initial-mode (non-late) planning path from the design's `apply` into a separate internal helper. It adds no writes, no staging and no registry changes. `apply` (US-04-TASK-BE-11) calls it later. Pre-checks (staging scan, registry lookup, `PARENT_NOT_NEW`) are owned by US-04-TASK-BE-06, so this helper assumes the parent is already known to be new. Do not export `planInitial`: it is internal. The public API check requires the public names (`FeatureSplitError`, `loadConfig`, `isNewFeature`, `isOverThreshold`, `meetsMinimum`, `buildProposal`, `editProposal`, and later `apply` and `register`) to be present. It does not require them to be the only exports, because other tasks export helpers that their own tests need (`allocateIds`, `renderEpic`, `parseEpicRows`, `buildRegistryText`).

Helpers used, all defined by earlier tasks and not redefined here: `validateProposal` (US-03-TASK-BE-04), `dependencyOrder` (US-03-TASK-BE-02), `foundationWarnings` (US-03-TASK-BE-03), `allocateIds` (US-04-TASK-BE-02), `slugOf`, `findBlock` and `fail`.

Two points where the sources disagree, to resolve before merging:

1. **Error code.** This skeleton entry fixes the refusal code as `TARGET_EXISTS`. The design excerpt's `apply` code and its test bullet use `CHILD_DIR_EXISTS`. This task follows the skeleton, and US-04-TASK-BE-08 (late mode) also uses `TARGET_EXISTS`, so the task graph is consistent on that name. The Tech-Spec test bullet for "existing child folder" should be aligned to `TARGET_EXISTS`. Flagging this for the host rather than choosing silently.
2. **Slug helper.** The design's `slugOf` returns a string. The INFRA-BE-03 slug rule throws `INVALID_NAME`. Use the INFRA-BE-03 helper. `validateProposal` rejects bad names before the plan is built, so the slug call never receives an invalid name here.

Existence checks use `lstat` and treat only `ENOENT` as "absent". `existsSync` is avoided because it hides permission errors, which would let a refused target look free and then fail during the move.

```javascript
// Internal helper, not exported. Pure planning: reads the features root and never writes.
function targetExists(file) {
  try { fs.lstatSync(file); return true; }
  catch (err) {
    if (err.code === 'ENOENT') return false;
    fail('FEATURE_UNREADABLE', `Cannot inspect ${file} (${err.code})`, { file });
  }
}

function planInitial({ featuresRoot, registry, parentId, proposal }) {
  validateProposal(proposal);                                  // includes the minChildren check (D-09)
  const order = dependencyOrder(proposal.children);            // stable topological order (BE-02)
  const warnings = foundationWarnings(proposal, order);        // BR-03: warn, never refuse
  const ids = allocateIds(featuresRoot, registry, order.length);
  const idOf = new Map(order.map((c, i) => [c.name, ids[i]]));
  const plan = order.map((c, i) => ({
    name: c.name,
    id: ids[i],
    dir: `${ids[i]}-${slugOf(c.name)}`,
    summary: c.summary,
    keywords: c.keywords,
    assigned: c.assigned,
    checkpoint: proposal.source,                               // 'definition' | 'measured'
    deps: c.dependsOn.map(d => idOf.get(d)),                   // sibling IDs; [] for the first child
    owner: c.name === proposal.sharedFoundationOwner,
  }));
  for (const p of plan) {
    const folder = path.join(featuresRoot, p.dir);
    if (targetExists(folder) || targetExists(path.join(folder, 'feature.md')) || findBlock(registry, p.id))
      fail('TARGET_EXISTS', `${p.id} already exists (folder, feature.md or registry heading)`, { file: folder });
  }
  return { parentId, order, plan, warnings };
}
```

Notes on the code above:
- `ids` comes from `allocateIds`, which is always at least one above the highest number in the registry and folders. `TARGET_EXISTS` therefore guards only against races and stale state, so it is rarely hit in normal use.
- The `plan` and `warnings` fields are the input that `apply` uses to build child documents, `epic.md` and registry text. This helper does not build those.
- If the proposal has `sharedFoundationOwner: null`, no plan entry has `owner: true`, and `foundationWarnings` reports the owner as "no child". That is a warning only.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const s=require('fs').readFileSync('src/claude/scripts/feature-split.js','utf8'); process.exit(/function planInitial\(/.test(s)&&/TARGET_EXISTS/.test(s)?0:1)"
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js'); const want=['FeatureSplitError','loadConfig','isNewFeature','isOverThreshold','meetsMinimum','buildProposal','editProposal']; const missing=want.filter(n=>!(n in m)); process.exit(missing.length?1:0)"
```

```
npm test
```