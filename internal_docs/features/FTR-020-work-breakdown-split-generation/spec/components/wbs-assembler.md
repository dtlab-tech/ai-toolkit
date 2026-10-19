# `src/claude/scripts/wbs-assembler.js` — New

**Related Open Questions:** OQ-03, OQ-04, OQ-05 (see [index.md](../index.md#2-resolution-of-open-questions))
**Related components:** [wb-validate.md](wb-validate.md), [wb-render.md](wb-render.md), [pm-phase2.md](pm-phase2.md)

**Addresses:** AC-04, AC-05, AC-06, AC-07, AC-08, AC-09 (see [req/index.md](../../req/index.md#6-acceptance-criteria))

## Change

Exports `loadWorkBreakdown(inputPath)`: detects single-file (legacy schema v2) vs. directory
(`wbs/`, schema v3) input and returns the same
`{ schemaVersion, feature, phases: [{ id, type, title, commit, tasks: [...] }] }` shape either
way. Exports `parseTaskDetailBlock(text)` / `renderTaskDetailBlock(task)` and, for the phase tier
(OQ-04), `parsePhaseDetailBlock(text)` / `renderPhaseDetailBlock(phase)` — all four independently
reimplemented from `wb-render.js`'s existing field-line/fence conventions, **not** imported from
`lib/task-executor/plan.js`, to avoid touching that module (feature.md Out of Scope).

**`sourceUC` (OQ-05) is deliberately NOT part of the assembled shape.** It is a `req/`
traceability field read directly from `index.json` by whatever builds the coverage matrix (see
`coverage-matrix/index.md` at the feature root) — `wb-validate.js`/`wb-render.js` have no concept of
Use Cases and don't need it; adding it to the assembled `{schemaVersion:2,...}` shape would risk
it leaking into rendered output and violating AC-05's byte-identical guarantee for no reason.

## `loadWorkBreakdown(inputPath)` algorithm

```
function loadWorkBreakdown(inputPath):
  if isDirectory(inputPath):
    index = JSON.parse(readFile(join(inputPath, 'index.json')))
    assertSchemaVersion(index, 3)
    phases = []
    for phaseSkeleton in index.phases:
      // Phase tier (OQ-04): unlike tasks, title/commit are NOT in index.json at all — the
      // phase detail file is the sole source for them, required for every phase, not optional.
      phaseDetailPath = join(inputPath, phaseSkeleton.detailFile)
      if !exists(phaseDetailPath): throw AssemblyError('phase "' + phaseSkeleton.id + '" has no detail file at ' + phaseDetailPath)
      phaseDetail = parsePhaseDetailBlock(readFile(phaseDetailPath))  // { title, commit }
      tasks = []
      for taskId in phaseSkeleton.taskIds:
        skeletonTask = index.tasks[taskId]
        if skeletonTask == null: throw AssemblyError('index.json references unknown task "' + taskId + '"')
        detailPath = join(inputPath, skeletonTask.detailFile)
        if !exists(detailPath): throw AssemblyError('task "' + taskId + '" has no detail file at ' + detailPath)
        detail = parseTaskDetailBlock(readFile(detailPath))  // { verificationCommands, groupingRationale, ... restated fields, ignored }
        tasks.push({
          id: taskId, title: skeletonTask.title, outcome: skeletonTask.outcome,
          domain: skeletonTask.domain, agentType: skeletonTask.agentType,
          dependsOn: skeletonTask.dependsOn, acceptanceCriteria: skeletonTask.acceptanceCriteria,
          estimate: skeletonTask.estimate, outputCount: skeletonTask.outputCount,
          groupingRationale: detail.groupingRationale,       // detail-owned
          commit: skeletonTask.commit,
          verification: { commands: detail.verificationCommands },  // detail-owned
        })
      phases.push({ id: phaseSkeleton.id, type: phaseSkeleton.type, title: phaseDetail.title,
                     commit: phaseDetail.commit, tasks: tasks })
    return { schemaVersion: 2, feature: index.feature, phases: phases }  // <- normalized to the
      // existing in-memory shape wb-validate.js/wb-render.js already consume; schemaVersion is
      // reported as 2 here because that is the *assembled, in-memory* contract version those two
      // scripts' downstream logic was written against — index.json's own on-disk schemaVersion
      // stays 3 and is a separate, unrelated version number (on-disk layout vs. in-memory shape)
  else:
    raw = JSON.parse(readFile(inputPath))
    assertSchemaVersion(raw, 2)
    return raw   // legacy path: unchanged behavior
```

**Field-line scanning must not be a global regex pass over the whole file.** A task's
"Implementation notes" section may legitimately illustrate the block format itself inside a
fenced code example (several tasks in this feature's own `wbs/` fixture do) — a global scan for
`- **Label:** value` would pick up those illustrative lines too and silently overwrite real
values. `parseTaskDetailBlock`/`parsePhaseDetailBlock` must only read the **contiguous run** of
field lines starting immediately after the heading, stopping at the first non-matching line, and
must locate the verification-commands marker by its **last** occurrence in the text, not its
first — this was found empirically during this feature's own definition (see
`templates/task-template.md`'s parsing-contract note for the exact fixed algorithm) and is a
hard requirement, not an optional hardening.

`isDirectory`/`exists`/`readFile` failures all raise a structured error naming the exact path,
per AC-07/NFR-05 — a missing `user-stories/{id}.md` fails the same way as a missing
`tasks/{id}.md`. `parseTaskDetailBlock` and `parsePhaseDetailBlock` both reuse the field-line
regex (`/^- \*\*(.+?):\*\*[ \t]?(.*)$/gm`) convention already proven in
`lib/task-executor/plan.js`'s `_parseTaskFields`; `parseTaskDetailBlock` additionally reuses the
dynamic-fence regex (`/^(`{3,})\r?\n([\s\S]*?)\r?\n\1[ \t]*$/gm`) convention (`_FENCE_RE`) for
verification commands — `parsePhaseDetailBlock` has no fenced section, a phase carries no
executable commands. Both are reimplemented independently in this module (not imported) per
feature.md's Out of Scope decision to leave `plan.js` untouched.

## Consumer usage (`wb-validate.js` and `wb-render.js`)

```js
const { loadWorkBreakdown } = require('./wbs-assembler')
const wb = loadWorkBreakdown(process.argv[2])
```
replacing their current `fs.readFileSync` + `JSON.parse` pair. Everything after that line is
unchanged in both scripts — see [wb-validate.md](wb-validate.md), [wb-render.md](wb-render.md).

## Phase detail block format (OQ-04)

`wbs/user-stories/{phaseId}.md`:
```
<a id="phase-{phaseId}"></a>
### {phaseId}

- **Phase ID:** {phaseId}
- **Type:** {type}
- **Title:** {title}
- **Commit type:** {commit.type}
- **Commit scope:** {commit.scope or —}
- **Commit subject:** {commit.subject}
```
No verification-commands section — a phase has no executable commands of its own, only its
tasks do. `renderPhaseDetailBlock(phase)` / `parsePhaseDetailBlock(text)` produce/consume exactly
this shape. Canonical template: `templates/user-story-template.md`.

## Tests

`wbs-assembler.test.js`: `loadWorkBreakdown()` against (a) the shared dogfooding fixture (see
[index.md §6](../index.md#6-shared-test-fixture)) and (b) an equivalent legacy single JSON file;
assert the two produce deep-equal assembled structures. Also: missing `index.json`, missing a
referenced task file, missing a referenced phase file, malformed task detail block, malformed
phase detail block — each asserts a structured error naming the specific path (AC-07).
`parseTaskDetailBlock`/`renderTaskDetailBlock` round-trip test (render then parse back yields the
original task fields, including verification commands with embedded pipes/backticks) and a
`parsePhaseDetailBlock`/`renderPhaseDetailBlock` round-trip test.
