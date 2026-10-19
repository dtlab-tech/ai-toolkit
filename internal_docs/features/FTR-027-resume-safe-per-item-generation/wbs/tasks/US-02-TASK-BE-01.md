<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Add a heading-match validity check to Requirements use-case resume
- **Outcome:** pm-phase1.js gains a local isValidUseCaseFile(content, ucId) checking the content starts with '### {ucId}: '; anyUcFileMissing and the per-use-case loop's resume condition both require it in addition to c.exists()
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-04, AC-05
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** fix
- **Commit scope:** pm-phase1
- **Commit subject:** regenerate an invalid Requirements use-case file instead of trusting existence alone

**Implementation notes:**

Add near the existing `parseUseCaseIndexTable` in
`src/claude/workflows/pm-phase1.js`:

```js
// Only the ID fragment must match — never the free-text title after the colon, which is prose
// the agent may legitimately phrase differently across a retry.
function isValidUseCaseFile(content, ucId) {
  const escaped = ucId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^###\\s+${escaped}:\\s`).test(content.trimStart())
}
```

Update BOTH call sites:

```js
// anyUcFileMissing — before:
const anyUcFileMissing = indexContent => parseUseCaseIndexTable(indexContent).some(row => !c.exists(`${reqDir}/${row.file}`))
// after:
const anyUcFileMissing = indexContent => parseUseCaseIndexTable(indexContent).some(row => {
  const ucPath = `${reqDir}/${row.file}`
  return !c.exists(ucPath) || !isValidUseCaseFile(c.read(ucPath), row.id)
})

// Per-use-case loop — before:
if (!regenSkeleton && c.exists(ucPath)) continue // resume: skip, no dispatch
// after:
if (!regenSkeleton && c.exists(ucPath) && isValidUseCaseFile(c.read(ucPath), row.id)) continue // resume: skip, no dispatch
```

**Verification commands:**

```
npm test -- tests/pm-phase1-req-resume.test.js
```
