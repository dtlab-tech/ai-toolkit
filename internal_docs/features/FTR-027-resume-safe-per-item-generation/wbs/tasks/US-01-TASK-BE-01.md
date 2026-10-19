<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Add a parseComponentDetail-based validity check to Tech-Spec component resume
- **Outcome:** pm-phase1.js gains a local isValidComponentDetail(content) (duplicating tech-spec-assembler.js's parseComponentDetail fence-aware ## Change/## Tests scan as a boolean check); anyComponentFileMissing and the per-component loop's resume condition both require it in addition to c.exists()
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-01, AC-02, AC-03
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** fix
- **Commit scope:** pm-phase1
- **Commit subject:** regenerate an invalid Tech-Spec component instead of trusting existence alone

**Implementation notes:**

Add near the existing duplicated primitives (`parseComponentsTable`) in
`src/claude/workflows/pm-phase1.js`:

```js
// Duplicates tech-spec-assembler.js's parseComponentDetail's own fence-aware heading scan —
// returns a boolean instead of throwing/returning parsed sections, since every call site here
// only needs the yes/no signal.
function _nonFencedHeadingIndexesLocal(lines, predicate) {
  let fenceLen = 0
  const indexes = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(`{3,})/)
    if (m) {
      const runLen = m[1].length
      if (fenceLen === 0) fenceLen = runLen
      else if (runLen >= fenceLen) fenceLen = 0
      continue
    }
    if (fenceLen !== 0) continue
    if (predicate(lines[i])) indexes.push(i)
  }
  return indexes
}
function isValidComponentDetail(content) {
  const lines = content.split('\n')
  const changeIdx = _nonFencedHeadingIndexesLocal(lines, l => l.trim() === '## Change')[0] ?? -1
  const testsIdx = _nonFencedHeadingIndexesLocal(lines, l => l.trim() === '## Tests')[0] ?? -1
  return changeIdx !== -1 && testsIdx !== -1
}
```

Then update BOTH call sites (search for the existing lines, do not duplicate the function body a
second time):

```js
// anyComponentFileMissing — before:
const anyComponentFileMissing = indexContent => parseComponentsTable(indexContent).some(comp => !c.exists(`${specDir}/components/${comp.fileSlug}`))
// after:
const anyComponentFileMissing = indexContent => parseComponentsTable(indexContent).some(comp => {
  const compPath = `${specDir}/components/${comp.fileSlug}`
  return !c.exists(compPath) || !isValidComponentDetail(c.read(compPath))
})

// Per-component loop — before:
if (!regenSkeleton && c.exists(compPath)) continue // resume: skip, no dispatch
// after:
if (!regenSkeleton && c.exists(compPath) && isValidComponentDetail(c.read(compPath))) continue // resume: skip, no dispatch
```

No change to `tech-spec-assembler.js` itself — this is a local, duplicated re-implementation of its
exact same algorithm, same precedent as every other duplicated primitive in this file.

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "Tech-Spec component"
```
