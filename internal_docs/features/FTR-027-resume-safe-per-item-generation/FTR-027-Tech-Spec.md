# Technical Specification — Resume-Safe Per-Item Generation

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-027 |
| Version | 1.0 |
| Date | 2026-10-19 |
| Status | Draft |

## 1. Overview

Hardens the existing resume-by-existence (`pm-phase1.js`) and resume-by-status (`pm-phase2.js`)
mechanisms so each one also checks structural validity, not just file presence, before treating a
per-item file as already-done. Three item types, three already-authoritative validity definitions
reused unmodified: Tech-Spec components (`tech-spec-assembler.js`'s `parseComponentDetail`),
Requirements use cases (a new, minimal `### {UC-ID}: ` heading-match invariant — no stricter
contract exists to reuse for this intentionally free-form document type), and Work Breakdown tasks
(`wbs-assembler.js`'s `parseTaskDetailBlock`, checking for a non-empty `verificationCommands`
array). Directly motivated by a reproduced production incident where a single malformed component
file caused every retry of a ~56-component Tech-Spec generation to fail identically, with no way
for the pipeline to recover on its own.

## 2. Architecture

### 2.1 System Context

No new system boundary. This feature changes internal decision logic inside two existing workflow
scripts (`pm-phase1.js`, `pm-phase2.js`) and adds/updates tests in three existing test files plus
one shared test helper — no new script, no new command, no new agent.

### 2.2 Component Diagram

```
Before (today):
  pm-phase1.js: outer gate checks anyUcFileMissing/anyComponentFileMissing (presence only)
  pm-phase1.js: per-item loops check c.exists(path) (presence only)
  pm-phase2.js: per-task loop checks status === 'generated' && c.exists(path) (presence only)
                |
                +--a structurally invalid-but-present file is skipped forever, never regenerated

After (this feature):
  pm-phase1.js: anyComponentFileMissing  -> also tries parseComponentDetail(); throws counts as missing
  pm-phase1.js: anyUcFileMissing         -> also checks the ### {UC-ID}: heading; mismatch counts as missing
  pm-phase1.js: per-component loop       -> same parseComponentDetail() check before skipping
  pm-phase1.js: per-use-case loop        -> same heading check before skipping
  pm-phase2.js: per-task loop            -> also requires parseTaskDetailBlock().verificationCommands.length > 0
                |
                +--an invalid-but-present file is treated exactly like a missing one: regenerated
```

### 2.3 Sequence Diagrams

**Tech-Spec component resume (UC-01), per `pm-phase1.js` entry:**
```
pm-phase1.js: specIndexPath fresh and complete? (unchanged skeletonStale check)
pm-phase1.js: for each component row -> parseComponentDetail(read(compPath)) throws OR file missing?
  any true -> regenSkeleton-independent outer gate treats Tech-Spec generation as needed
pm-phase1.js: generateTechSpec() per-component loop -> same per-row check -> dispatch only invalid/missing rows
```

**Requirements use-case resume (UC-02), per `pm-phase1.js` entry:**
```
pm-phase1.js: for each UC row -> read(ucPath) starts with "### {UC-ID}: "? OR file missing?
  any false -> outer gate treats Requirements generation as needed
pm-phase1.js: generateRequirements() per-use-case loop -> same per-row check -> dispatch only invalid/missing rows
```

**Work Breakdown task resume (UC-03), per `pm-phase2.js` per-task loop:**
```
pm-phase2.js: for each task -> status === 'generated' AND exists(detailPath) AND
              parseTaskDetailBlock(read(detailPath)).verificationCommands.length > 0 ?
  all true  -> skip, no dispatch
  any false -> dispatch (regenerate)
```

## 3. Backend

### src/claude/workflows/pm-phase1.js

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

### src/claude/workflows/pm-phase2.js

## Algorithm

```js
// Duplicates wbs-assembler.js's _parseVerificationCommands algorithm (last occurrence of the
// marker wins, same reasoning as that file's own comment) — returns a boolean ("does this file
// have at least one verification command") instead of the parsed array, since this call site only
// needs the yes/no signal.
const FENCE_RE_LOCAL = /```[^\n]*\n([\s\S]*?)```/g
function hasVerificationCommands(content) {
  const marker = '**Verification commands:**'
  const idx = content.lastIndexOf(marker)
  if (idx === -1) return false
  const verifPart = content.slice(idx + marker.length)
  FENCE_RE_LOCAL.lastIndex = 0
  return FENCE_RE_LOCAL.test(verifPart)
}

// Per-task loop (today): if (task.status === 'generated' && c.exists(detailPath)) continue
// becomes:
if (task.status === 'generated' && c.exists(detailPath) && hasVerificationCommands(c.read(detailPath))) continue
```

Placed near the top of the file alongside the other duplicated primitives (the template-engine
functions, `parseComponentsTableLocal`), not inline at the loop.

## 4. Frontend

_No components in this category._

## 5. External Integrations

### tests/pm-phase1-req-resume.test.js

## Algorithm

```js
// Source-text guard — updated literal:
expect(PM_PHASE1_SOURCE).toContain(
  'if (!regenSkeleton && c.exists(ucPath) && isValidUseCaseFile(c.read(ucPath), row.id)) continue')

// Mirror function — gains an isValidFn parameter:
function selectPendingUcIds(ucTable, reqDir, existsFn, regenSkeleton, isValidFn) {
  return ucTable.filter(row => {
    const path = `${reqDir}/${row.file}`
    return !(!regenSkeleton && existsFn(path) && isValidFn(path, row.id))
  }).map(row => row.id)
}
```

New test cases, alongside the existing four:
```js
test('a UC file that exists but fails the validity check is treated as pending, not trusted on existence alone', () => {
  const ucTable = [{ id: 'UC-01', file: 'use-cases/UC-01.md' }, { id: 'UC-02', file: 'use-cases/UC-02.md' }]
  const existing = new Set(['/req/use-cases/UC-01.md', '/req/use-cases/UC-02.md'])
  const isValidFn = (path) => path.endsWith('UC-01.md') // UC-02's file exists but is "invalid"
  expect(selectPendingUcIds(ucTable, '/req', p => existing.has(p), false, isValidFn)).toEqual(['UC-02'])
})
```

### tests/helpers/pm-phase2-flow.js

## Algorithm

```js
function selectPendingTaskIds(index, wbsDir, existsFn, isValidFn) {
  const pending = []
  for (const phase of index.phases) {
    for (const taskId of phase.taskIds) {
      const task = index.tasks[taskId]
      const detailPath = `${wbsDir}/${task.detailFile}`
      if (task.status === 'generated' && existsFn(detailPath) && isValidFn(detailPath)) continue
      pending.push(taskId)
    }
  }
  return pending
}
```

Existing callers that don't care about validity (none currently, besides the one updated alongside
this change — see `pm-phase2-wbs-resume.test.js`'s own component) would need to pass an
always-true `isValidFn`; there are none left unaddressed, since this helper has exactly one caller
in this test suite.

### tests/pm-phase2-wbs-resume.test.js

## Algorithm

```js
// Source-text guard — updated literal:
expect(PM_PHASE2_SOURCE).toContain(
  "task.status === 'generated' && c.exists(detailPath) && hasVerificationCommands(c.read(detailPath))")

// Every existing selectPendingTaskIds(...) call site gains a 4th argument — by default an
// always-true isValidFn, so the four pre-existing tests keep asserting exactly what they did
// before this feature (this feature only ADDS a new failure mode, it doesn't change the meaning
// of "exists" for the pre-existing tests):
const alwaysValid = () => true
selectPendingTaskIds(index, '/wbs', p => existing.has(p), alwaysValid)

// New test case:
test('a "generated" task whose file exists but has no verification commands is treated as pending', () => {
  const index = makeIndex({ 'T-01': 'generated', 'T-02': 'generated' })
  const existing = new Set(['/wbs/tasks/T-01.md', '/wbs/tasks/T-02.md'])
  const isValidFn = (path) => path.endsWith('T-01.md') // T-02's file exists but has no commands
  const pending = selectPendingTaskIds(index, '/wbs', p => existing.has(p), isValidFn)
  expect(pending).toEqual(['T-02'])
})
```

### tests/integration/workflow-runtime.test.js

## Algorithm

```js
describe('FTR-027 — resume regenerates an invalid-but-present item instead of trusting existence alone', () => {
  test('a Tech-Spec component missing its ## Change section is regenerated, not skipped', async () => {
    // Seed a real split feature: spec/index.md fresh, one component file written WITHOUT a
    // "## Change" heading (simulating the real production incident's fence-wrap corruption, now
    // separately fixed at the source — this test guards the independent resume-safety net).
    // ... existing two-component skeleton/dispatch fixture, reused from the neighboring
    // "resume-by-existence dispatches only missing components" test ...
    fs.writeFileSync(path.join(f.dir, 'spec', 'components', 'a.js.md'), '# a.js — New\n\nNo Change heading here.\n')
    const dispatchFn = jest.fn(dispatch)
    const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn })
    const componentCalls = dispatchFn.mock.calls.map(([o]) => o)
      .filter(o => o.args[o.args.indexOf('--agent') + 1] === 'gaia-generate-tech-spec-component')
    expect(componentCalls.some(c => c.prompt.includes('Path: a.js'))).toBe(true) // regenerated, not skipped
    expect(result.validation.summary).toContain('clean')
  })

  test('a valid Tech-Spec component is still skipped on resume (no regression)', async () => {
    // ... same fixture, a.js.md left as a genuinely valid component file ...
    // asserts componentCalls does NOT include a.js
  })

  test('the outer gate alone detects an invalid component file before any per-item dispatch', async () => {
    // Writes an invalid a.js.md, asserts gaia-generate-tech-spec itself is NOT re-dispatched
    // (skeleton still fresh) while gaia-generate-tech-spec-component IS, for exactly a.js —
    // proving the outer anyComponentFileMissing-style gate, not just the inner loop, caught it.
  })

  test('a use-case file starting with the wrong UC heading is regenerated, not skipped', async () => {
    fs.writeFileSync(path.join(f.dir, 'req', 'use-cases', 'UC-01.md'), '### UC-02: Wrong use case\n\nGarbled.\n')
    // asserts gaia-generate-requirements-use-case is dispatched again for UC-01
  })

  test('a valid use-case file is still skipped on resume (no regression)', async () => {
    // asserts a correctly-headed UC-01.md is NOT re-dispatched
  })

  test('a Work Breakdown task marked generated with zero verification commands is regenerated', async () => {
    // Writes a task detail file with a "**Verification commands:**" marker but no fenced command
    // block after it, status already "generated" in index.json; asserts
    // gaia-generate-work-breakdown-task is dispatched again for that task, not skipped.
  })

  test('a valid Work Breakdown task (at least one verification command) is still skipped (no regression)', async () => {
    // existing taskDetailDoc() fixture already includes one fenced command — asserts it is NOT
    // re-dispatched on a second run with status already "generated".
  })
})
```

## 6. Security Considerations

None — internal toolkit workflow change, no new external surface, no new input validation
boundary. Every validity check reads only files already inside the feature's own folder.

## 7. Database Changes

None.

## 8. Configuration

None — no new environment variables, app settings, or feature flags.

## 9. File Inventory

### New files
| Path | Purpose-or-Change | Addresses |
|---|---|---|


### Modified files
| Path | Purpose-or-Change | Addresses |
|---|---|---|
| src/claude/workflows/pm-phase1.js | Add `parseComponentDetail`-based validity check to the Tech-Spec per-component loop and `anyComponentFileMissing` outer gate; add a new `### {UC-ID}: ` heading-match validity check to the Requirements per-use-case loop and `anyUcFileMissing` outer gate | AC-01, AC-02, AC-03, AC-04, AC-05, AC-08 |
| src/claude/workflows/pm-phase2.js | Add a `parseTaskDetailBlock`-based validity check (non-empty `verificationCommands`) to the per-task resume-by-status loop | AC-06, AC-07, AC-08 |
| tests/pm-phase1-req-resume.test.js | Update the mirror predicate and source-text guard for the new use-case validity condition | AC-04, AC-05, AC-09 |
| tests/helpers/pm-phase2-flow.js | Update `selectPendingTaskIds`'s mirror predicate to accept and apply a validity check | AC-06, AC-07, AC-09 |
| tests/pm-phase2-wbs-resume.test.js | Update the source-text guard and call site for the new task validity condition | AC-06, AC-07, AC-09 |
| tests/integration/workflow-runtime.test.js | New end-to-end tests: an invalid-but-present component/use-case/task file is regenerated on resume; a valid one is still skipped; the outer gate reacts to an invalid component/use-case file the same way it already reacts to a missing one | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08 |

## 10. Testing Strategy

### src/claude/workflows/pm-phase1.js

`tests/integration/workflow-runtime.test.js` (see that file's own component): new tests write a
component/use-case file that exists but is missing its `## Change`/`### {UC-ID}: ` requirement,
confirm a resume run regenerates it (not skips it), and confirm the outer gate alone (without
entering the per-item loop at all, i.e. before any other item is touched) already detects the
invalid file the same way it already detects a missing one. A control case confirms a genuinely
valid existing file is still skipped, unchanged from today.

### src/claude/workflows/pm-phase2.js

`tests/integration/workflow-runtime.test.js` (see that file's own component): a new test marks a
task `generated` with its detail file present but containing zero verification commands, confirms
a resume run regenerates it (dispatches the worker again), and a control case confirms a task with
at least one verification command is still skipped, unchanged from today.

### tests/pm-phase1-req-resume.test.js

This component *is* the test file — no further test file covers it.

### tests/helpers/pm-phase2-flow.js

No dedicated test file — this is a shared test helper, exercised by
`tests/pm-phase2-wbs-resume.test.js`'s own test cases (see that file's component).

### tests/pm-phase2-wbs-resume.test.js

This component *is* the test file — no further test file covers it.

### tests/integration/workflow-runtime.test.js

This component *is* the test file — no further test file covers it.

## 11. Implementation Order

1. `src/claude/workflows/pm-phase1.js` — depends on: nothing (reuses `tech-spec-assembler.js`'s
   `parseComponentDetail`, already unmodified and available)
2. `src/claude/workflows/pm-phase2.js` — depends on: nothing (reuses `wbs-assembler.js`'s
   `parseTaskDetailBlock`, already unmodified and available; independent of 1)
3. `tests/pm-phase1-req-resume.test.js` — depends on: 1 (mirrors its new condition)
4. `tests/helpers/pm-phase2-flow.js` — depends on: 2 (mirrors its new condition)
5. `tests/pm-phase2-wbs-resume.test.js` — depends on: 2, 4
6. `tests/integration/workflow-runtime.test.js` — depends on: 1, 2

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| The component/task validity checks run `parseComponentDetail()`/`parseTaskDetailBlock()` against every existing file on every single pipeline entry (not just once) — a cost concern for a large feature (~56 components) | Repeated re-parsing on every resume attempt, though still zero-LLM-cost and cheap relative to a worker dispatch | Accepted: each parse is a local, synchronous, in-memory string operation on an already-small file (a few KB) — negligible next to the cost of even one avoided LLM re-dispatch, which is the entire point of this feature |
| The use-case heading-match check could reject a use-case file whose title legitimately differs from the skeleton's own Title column (e.g. the agent rephrased it slightly) | A false "invalid" regeneration, wasting one dispatch even though the file was fine | The check only compares the ID fragment (`### {UC-ID}: `), never the free-text title after the colon — exactly designed to avoid this false positive (BR-03) |
| `parseComponentDetail()` throwing is used as a boolean signal (valid/invalid) inside a hot per-item loop/outer gate, where today's code never needed try/catch around this call | A real parsing error unrelated to this feature (e.g. a corrupted `spec/index.md` that `parseComponentsTable` itself would already have failed on, upstream of this check) could be silently reinterpreted as "just regenerate this one component" instead of surfacing as a distinct upstream problem | Not a real risk in practice: `parseComponentDetail()` only ever parses one already-resolved component FILE's content (never `spec/index.md` itself), and its only two failure modes are exactly "missing ## Change" / "missing ## Tests" — both of which this feature explicitly wants to treat as "regenerate" |

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Should the outer regen gate's `anyComponentFileMissing`/`anyUcFileMissing` helpers be renamed to reflect that they now also check validity? | **Resolved** | Keep the existing names unchanged — "missing" is treated as the general concept of "not currently available to skip regenerating", and renaming would touch every existing call site for a purely cosmetic reason; a code comment at each definition documents the expanded meaning instead |
| 2 | Exact scope of the use-case heading-match check — ID-only, or tolerant of title variation? | **Resolved** | ID-only, per BR-03/the Risks row above: `/^###\s+{UC-ID}:\s/` (escaped for regex) matched against the file's own leading content, never comparing the title text that follows |

## Dependencies and Assumptions

- FTR-020/FTR-021/FTR-024/FTR-025/FTR-026 (available): the split-generation architecture and its
  existing resume-by-existence/resume-by-status mechanisms, reused and extended, never replaced.
- `tech-spec-assembler.js`'s `parseComponentDetail` and `wbs-assembler.js`'s `parseTaskDetailBlock`
  are treated as fixed, authoritative validity definitions for their respective item types — this
  feature imports/requires neither (both scripts' functions are already reachable the same way
  `pm-phase1.js`/`pm-phase2.js` already duplicate other primitives from them, per this codebase's
  own "sandboxed runtime has no `require`" precedent — these checks are implemented as local,
  duplicated logic matching each function's own algorithm, not an actual cross-file call).
- `npm test` is the only verification command; no separate build step exists.
