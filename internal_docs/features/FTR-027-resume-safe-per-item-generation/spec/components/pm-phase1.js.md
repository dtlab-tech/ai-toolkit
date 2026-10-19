# src/claude/workflows/pm-phase1.js — Modified

## Change

Two independent additions, both local-duplication-based (this runtime has no `require()`, same
precedent as every other duplicated primitive already in this file):

1. A local `isValidComponentDetail(content)` — duplicates `tech-spec-assembler.js`'s
   `parseComponentDetail`'s own `## Change`/`## Tests` fence-aware heading scan, returning a
   boolean instead of throwing/returning the parsed sections (this call site only needs "is it
   valid", never the parsed content itself). Wired into `anyComponentFileMissing` and the
   per-component loop's `continue` condition.
2. A local `isValidUseCaseFile(content, ucId)` — a new, much simpler check: does the content, after
   stripping leading whitespace, start with `### {ucId}: `. Wired into `anyUcFileMissing` and the
   per-use-case loop's `continue` condition.

## Algorithm

```js
// Duplicates tech-spec-assembler.js's parseComponentDetail's own fence-aware heading scan (see
// that file for the full "why length-aware, not a boolean toggle" rationale) — returns a boolean
// ("is this a structurally valid component file") instead of throwing/returning parsed sections,
// since every call site here only needs the yes/no signal.
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

// New, much looser check for use-case files (BR-03): only the ID fragment must match, never the
// free-text title after the colon.
function isValidUseCaseFile(content, ucId) {
  const escaped = ucId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^###\\s+${escaped}:\\s`).test(content.trimStart())
}

// anyComponentFileMissing (today): components.some(comp => !c.exists(path))
// becomes:
const anyComponentFileMissing = indexContent => parseComponentsTable(indexContent).some(comp => {
  const compPath = `${specDir}/components/${comp.fileSlug}`
  return !c.exists(compPath) || !isValidComponentDetail(c.read(compPath))
})

// anyUcFileMissing (today): ucTable.some(row => !c.exists(path))
// becomes:
const anyUcFileMissing = indexContent => parseUseCaseIndexTable(indexContent).some(row => {
  const ucPath = `${reqDir}/${row.file}`
  return !c.exists(ucPath) || !isValidUseCaseFile(c.read(ucPath), row.id)
})

// Per-component loop (today): if (!regenSkeleton && c.exists(compPath)) continue
// becomes:
if (!regenSkeleton && c.exists(compPath) && isValidComponentDetail(c.read(compPath))) continue

// Per-use-case loop (today): if (!regenSkeleton && c.exists(ucPath)) continue
// becomes:
if (!regenSkeleton && c.exists(ucPath) && isValidUseCaseFile(c.read(ucPath), row.id)) continue
```

Both new local functions are placed near the existing duplicated primitives
(`parseComponentsTable`, `parseUseCaseIndexTable`) earlier in the file, not inline at each call
site, consistent with this file's existing organization.

## Tests

`tests/integration/workflow-runtime.test.js` (see that file's own component): new tests write a
component/use-case file that exists but is missing its `## Change`/`### {UC-ID}: ` requirement,
confirm a resume run regenerates it (not skips it), and confirm the outer gate alone (without
entering the per-item loop at all, i.e. before any other item is touched) already detects the
invalid file the same way it already detects a missing one. A control case confirms a genuinely
valid existing file is still skipped, unchanged from today.
