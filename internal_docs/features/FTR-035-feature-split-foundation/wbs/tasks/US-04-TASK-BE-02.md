<a id="task-US-04-TASK-BE-02"></a>
### US-04-TASK-BE-02

- **Task ID:** US-04-TASK-BE-02
- **Title:** Add next-free child ID allocation helper
- **Outcome:** feature-split.js has an allocateIds helper that returns the requested number of FTR-NNN IDs, one above the highest number found in the union of registry headings and feature folder names, with three-digit padding.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-04
- **Acceptance criteria:** AC-25
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 8000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add child ID allocation helper

**Implementation notes:**

Add one function to `src/claude/scripts/feature-split.js`, in the UC-04 apply section directly after `newRunId` and before `findParentDir`. The design already gives the algorithm; the code below is the concrete form.

```javascript
// BR-02: next free IDs from the union of registry headings and feature folder prefixes.
function allocateIds(featuresRoot, registry, count) {
  const used = registry.blocks.map(b => b.id).filter(Boolean);
  const dirs = fs.readdirSync(featuresRoot)
    .map(n => (n.match(/^(FTR-\d+)/) || [])[1])
    .filter(Boolean);
  let next = Math.max(0, ...[...used, ...dirs].map(id => parseInt(id.slice(4), 10))) + 1;
  return Array.from({ length: count }, () => `FTR-${String(next++).padStart(3, '0')}`);
}
```

Points to check while implementing:

- **Input shape.** `registry` is the parsed registry object with `blocks[].id`, as in the design's `parseRegistry`. The helper relies on the parsed shape produced by INFRA-TASK-BE-04. If BE-04 returns a different shape, adapt the one `map` line to that shape. Do not change the outcome.
- **Heading format.** Only the `FTR-NNN` id is read from each heading, so the helper works with either heading separator (`:` as the design assumes, or `—` as the Tech-Spec excerpt says is verified). The separator is decided in the parser, not here.
- **Folder names.** Only the leading `FTR-\d+` prefix of each folder name counts, so `FTR-035-auth` yields 35.
- **Padding.** `padStart(3, '0')` gives `FTR-001` for 1. Numbers above 999 are not truncated.
- **Edge cases.** An empty registry and empty folder root give `FTR-001`. `count` of 0 returns `[]`. The caller (`apply`) passes a count of at least 1 and is responsible for validating it.
- **Export.** The design's export list does not include `allocateIds`. Add it to `module.exports` so the verification below can call it directly. This is an addition beyond the design list and should be flagged in review.
- **No other change.** Do not touch `apply`. Wiring is done by US-04-TASK-BE-11.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');const {allocateIds}=require('./src/claude/scripts/feature-split.js');const root=fs.mkdtempSync(path.join(os.tmpdir(),'alloc-'));fs.mkdirSync(path.join(root,'FTR-005-x'));assert.deepStrictEqual(allocateIds(root,{blocks:[{id:'FTR-009'}]},2),['FTR-010','FTR-011']);assert.deepStrictEqual(allocateIds(fs.mkdtempSync(path.join(os.tmpdir(),'alloc-')),{blocks:[]},1),['FTR-001']);assert.deepStrictEqual(allocateIds(root,{blocks:[{id:'FTR-002'}]},1),['FTR-010']);console.log('allocateIds ok');"
```