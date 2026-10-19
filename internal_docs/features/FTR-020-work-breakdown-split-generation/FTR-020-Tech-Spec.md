# FTR-020 — Technical Specification

## 1. Baseline

- Branch: `develop`. `wb-validate.js` and `wb-render.js` live at `src/claude/scripts/`
  (1051 and 408 lines respectively, schema v2, both standalone top-level scripts with no
  `module.exports`). `gaia-generate-work-breakdown.md` is a sonnet agent with `tools: Read, Glob,
  Grep` (no Write) whose entire response is the JSON file content. `pm-phase2.js`
  (`src/claude/workflows/pm-phase2.js`) orchestrates: `c.worker('gaia.agent.planner.work-breakdown',
  ..., { outputs: [{ path: jsonPath, ... }] })` → `wb-validate.js` via `c.command` →
  `gaia.agent.planner.validate-work-breakdown` semantic check → `wb-render.js` via `c.command` →
  Gate 2 payload.
- `lib/workflow-control.js`'s `worker()` enforces exactly one declared output per call
  (`if (outputs.length > 1) throw new Error(...)`); this is relied on identically by
  `pm-phase1.js` and `am-phase1.js` and is **not modified** by this feature.
- `lib/task-executor/plan.js` (`parseMarkdown`/`parseCSV`/`mapPhases`/`validateDAG`/
  `createPlanSnapshot`/`computeReadyQueue`) parses only the rendered
  `{PREFIX}-Work-Breakdown.md` + `.csv`. It is **not modified**.

## 2. Resolution of Open Questions

### OQ-02 (feature.md): skeleton pre-check reuse strategy

**Decision:** extract the 10 of 23 `wb-validate.js` checks that are answerable from
skeleton-only fields — checks 3 (unique IDs), 5 (ID format), 6 (domain whitelist), 7 (agentType
whitelist), 8 (dependency existence), 9 (self-dependency), 10 (phase ID consistency), 11 (task
cycle), 12/13 (phase dependency projection + cycle), 14 (phase schedulability), 19/20/21 (AC
existence/scope/Must-coverage) — into a new pure-function module,
`src/claude/scripts/wb-graph-checks.js`, exporting one function per check plus
`parseAcTable`/`splitTableRow` (already pure, just relocated). `wb-validate.js` is edited to
`require('./wb-graph-checks')` and call these functions instead of its current inline code for
those specific checks; checks 4, 15, 16, 17, 18, 22, 23 (which need per-task detail: required
field presence including `verification.commands`, duration bands, empty verification/commit/
grouping-rationale content, text-field character validation, empty-phase detection) remain
inline in `wb-validate.js`, unchanged. This is a behavior-preserving extraction: `wb-validate.js`'s
JSON report output and exit codes must be byte-identical before and after, verified by running
the existing test fixtures against both versions (AC-09 test: "renderer/validator regression").
The new skeleton pre-check step in `pm-phase2.js` imports the same `wb-graph-checks.js` functions
directly and calls the ones that apply to the skeleton shape (all 11 of them — the skeleton
carries every field those checks need: `id`, `domain`, `agentType`, `dependsOn`,
`acceptanceCriteria`, phase `id`/`type`).

### OQ-03 (feature.md): skeleton/detail field split

**Decision:** skeleton (`index.json`, per task) owns: `id` (map key), `title`, `outcome`,
`domain`, `agentType`, `dependsOn`, `acceptanceCriteria`, `estimate` (`agentMinutes` + `tokens`),
`outputCount`, `commit`, `status`. Detail (`tasks/{id}.md`) owns: `verification.commands`,
`groupingRationale`. The per-task detail block format (reused verbatim from today's rendered
"Task Details" section) restates every skeleton field too — the per-task generation agent is
instructed to copy them forward unchanged from its given skeleton entry — but the assembler
(§4) always takes `title`/`outcome`/`domain`/`agentType`/`dependsOn`/`acceptanceCriteria`/
`estimate`/`outputCount`/`commit` from `index.json`, never from the task file, so a disagreement
is structurally impossible to act on even if a careless generation restates them differently.
`feature.md`'s Data Model section omitted `title` from the enumerated skeleton fields; this is
corrected here and is the authoritative list.

### OQ-04 (added after Gate 1, user-requested): third tier for phase-level content

**Decision:** add `user-stories/{phaseId}.md`, one file per phase, mirroring the user's original
`features/`/`user-stories/`/`tasks/` three-tier example — including its literal directory name
(`user-stories/`, not `phases/`), even though this directory also holds the one `INFRA.md` entry,
which is not itself a user story; `id`/`type` on the skeleton side still distinguish it. Unlike
the task split (which exists to
shrink per-turn generation volume and bound truncation blast radius), phases are **not**
generated incrementally — the one skeleton call already decides every phase's `title` and
`commit` in the same turn it decides the task graph. So this tier is added for **structural
symmetry and future extensibility** (room for a real per-phase narrative field later), not for
truncation mitigation, and that distinction matters for the field split: `id` and `type` stay in
`index.json` because `wb-graph-checks.js`'s checks (ID-format-vs-phase-type, phase cycle/
schedulability) need them before any file beyond `index.json` is read, and there is no
generation-order reason to defer them. `title` and `commit` move entirely to the phase detail
file — `index.json`'s phase entries carry only `{ id, type, detailFile, taskIds }}`, no content.
This was verified end-to-end (assemble → real `wb-validate.js` → real `wb-render.js`) to still
produce byte-identical rendered `.md`/`.csv` output, the same way the two-tier design was
verified before it.

## 3. New and Modified Files

| File | Change |
|---|---|
| `src/claude/scripts/wb-graph-checks.js` | **New.** Pure functions for the 11 skeleton-answerable checks (listed in OQ-02), each taking a plain `{ phases, tasks }`-shaped structure (or, for AC checks, also an `acMap` from `parseAcTable`) and returning an array of error/warning objects in the same shape `wb-validate.js` already pushes into its `report.errors`/`report.warnings`. No file I/O, no `process.exit` — pure and independently unit-testable. |
| `src/claude/scripts/wb-validate.js` | **Modified** (behavior-preserving extraction only): checks 3, 5–14, 19–21 replaced with calls into `wb-graph-checks.js`; checks 4, 15–18, 22, 23 unchanged in place. Top-of-file JSON read/parse replaced by a call to the new assembler loader (§4), so it accepts either a single JSON file path or a `wbs/` directory path. CLI argv contract unchanged (`argv[2]` = path, `argv[3]` = optional requirements path). |
| `src/claude/scripts/wb-render.js` | **Modified** (surgical): top-of-file JSON read/parse (lines ~20–48) replaced by the same assembler loader call. `renderMarkdown`/`renderCsv`/`computePhaseDependsOn`/`sanitizeField`/`fencedCommandBlock`/`taskAnchor` **unchanged**. CLI argv contract unchanged. |
| `src/claude/scripts/wbs-assembler.js` | **New.** Exports `loadWorkBreakdown(inputPath)` (§4): detects single-file (legacy schema v2) vs. directory (`wbs/`, schema v3) input and returns the same `{ schemaVersion, feature, phases: [{ id, type, title, commit, tasks: [...] }] }` shape either way. Exports `parseTaskDetailBlock(text)` / `renderTaskDetailBlock(task)` and, for the phase tier (OQ-04), `parsePhaseDetailBlock(text)` / `renderPhaseDetailBlock(phase)` — all four independently reimplemented from `wb-render.js`'s existing field-line/fence conventions, **not** imported from `lib/task-executor/plan.js`, to avoid touching that module (feature.md Out of Scope). |
| `src/claude/agents/gaia-generate-work-breakdown.md` | **Modified.** Repurposed to the skeleton pass only: Step 7 ("Return the JSON Output") now describes the schema-v3 skeleton shape (§5) instead of the full schema-v2 task objects; Atomicity Contract, task ID format, dependency/AC-assignment guidance all retained unchanged (still decided in this one call). Verification-command and grouping-rationale guidance moved to the new per-task agent. |
| `src/claude/agents/gaia-generate-work-breakdown-task.md` | **New.** One-task-scoped sonnet agent: input is one skeleton task entry + relevant Tech-Spec section + the compact full-skeleton task list; output is one task detail block in the existing rendered format (§5). No Write tool — same host-writes-the-response convention as every other `worker()`-dispatched agent. |
| `src/claude/workflows/pm-phase2.js` | **Modified.** New control flow (§6): skeleton call (no declared `worker()` output; coordinator writes `index.json` itself via `c.writeOutput`) → `wb-graph-checks.js` pre-checks → per-task loop (resume-by-status) → assembly via `wbs-assembler.js` (implicit, through the modified `wb-validate.js`/`wb-render.js` CLI calls — `pm-phase2.js` itself keeps passing a path, now the `wbs` directory, to `c.command`) → existing semantic validation, rendering, Gate 2 payload unchanged. |

## 4. `wbs-assembler.js` — `loadWorkBreakdown(inputPath)`

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
fenced code example (several tasks in this feature's own `wbs/` fixture do) — a global
scan for `- **Label:** value` would pick up those illustrative lines too and silently overwrite
real values. `parseTaskDetailBlock`/`parsePhaseDetailBlock` must only read the **contiguous run**
of field lines starting immediately after the heading, stopping at the first non-matching line,
and must locate the verification-commands marker by its **last** occurrence in the text, not its
first — this was found empirically during this feature's own definition (see
`INFRA-TASK-BE-02`'s task file for the exact fixed algorithm) and is a hard requirement, not an
optional hardening.

`isDirectory`/`exists`/`readFile` failures all raise a structured error naming the exact path,
per AC-07/NFR-05 — a missing `user-stories/{id}.md` fails the same way as a missing `tasks/{id}.md`.
`parseTaskDetailBlock` and `parsePhaseDetailBlock` both reuse the field-line regex
(`/^- \*\*(.+?):\*\*[ \t]?(.*)$/gm`) convention already proven in `lib/task-executor/plan.js`'s
`_parseTaskFields`; `parseTaskDetailBlock` additionally reuses the dynamic-fence regex
(`/^(`{3,})\r?\n([\s\S]*?)\r?\n\1[ \t]*$/gm`) convention (`_FENCE_RE`) for verification commands —
`parsePhaseDetailBlock` has no fenced section, a phase carries no executable commands. Both are
reimplemented independently in `wbs-assembler.js` (not imported) per feature.md's Out of Scope
decision to leave `plan.js` untouched.

`wb-validate.js` and `wb-render.js` each add, at the top:
```js
const { loadWorkBreakdown } = require('./wbs-assembler')
const wb = loadWorkBreakdown(process.argv[2])
```
replacing their current `fs.readFileSync` + `JSON.parse` pair. Everything after that line is
unchanged in both scripts.

## 5. Schemas

**Canonical templates:** `templates/task-template.md` and `templates/user-story-template.md`
(this feature's own folder) are the authoritative, generic reference for the two block formats
below — not a restatement of them. `US-01-TASK-INFRA-01` (`gaia-generate-work-breakdown.md`),
`US-03-TASK-INFRA-01` (`gaia-generate-work-breakdown-task.md`), and `INFRA-TASK-BE-02`
(`renderTaskDetailBlock`/`renderPhaseDetailBlock`) must all conform to these templates exactly —
if a future change to the block format is needed, change the template first, then propagate.

### Skeleton call — `c.worker()` JSON schema (passed as `opts.schema`)

```json
{
  "type": "object",
  "required": ["schemaVersion", "feature", "phases", "tasks"],
  "properties": {
    "schemaVersion": { "const": 3 },
    "feature": { "type": "string" },
    "phases": { "type": "array", "items": {
      "type": "object",
      "required": ["id", "type", "title", "commit", "taskIds"],
      "properties": {
        "id": { "type": "string" }, "type": { "enum": ["infrastructure", "user-story"] },
        "title": { "type": "string" },
        "commit": { "type": "object", "required": ["type", "subject"],
          "properties": { "type": { "type": "string" }, "subject": { "type": "string" } } },
        "taskIds": { "type": "array", "items": { "type": "string" } }
      } } },
    "tasks": { "type": "object", "additionalProperties": {
      "type": "object",
      "required": ["title", "outcome", "domain", "agentType", "dependsOn",
                   "acceptanceCriteria", "estimate", "outputCount", "commit"],
      "properties": {
        "title": { "type": "string" }, "outcome": { "type": "string" },
        "domain": { "enum": ["BE", "FE", "DB", "DevOps", "INFRA", "TEST"] },
        "agentType": { "enum": ["developer-backend", "developer-frontend",
                                 "developer-testing", "review-solution"] },
        "dependsOn": { "type": "array", "items": { "type": "string" } },
        "acceptanceCriteria": { "type": "array", "items": { "type": "string" } },
        "estimate": { "type": "object", "required": ["agentMinutes", "tokens"],
          "properties": { "agentMinutes": { "type": "integer" }, "tokens": { "type": "integer" } } },
        "outputCount": { "type": "integer" },
        "commit": { "type": "object", "required": ["type", "subject"],
          "properties": { "type": { "type": "string" }, "subject": { "type": "string" } } }
      } } }
  }
}
```

The model's response still includes `title`/`commit` per phase (it is the only call that ever
decides them), but the coordinator does **not** copy them into `index.json` verbatim. Instead,
`materializeIndex()` (§6) splits the response:
- `index.json`'s `phases[*]` entries keep only `{ id, type, detailFile, taskIds }` — `detailFile`
  set to `"user-stories/" + phaseId + ".md"` (OQ-04: phase `title`/`commit` have no generation-order
  reason to live in the index, unlike the task fields that gate pre-dispatch structural checks).
- `title`/`commit` are passed to `renderPhaseDetailBlock()` (§4) and written immediately to
  `user-stories/{phaseId}.md` — immediately, not lazily, because phase content is fully known the
  moment the skeleton call returns; there is no separate per-phase generation pass.
- `index.json`'s `tasks[*]` entries get `detailFile` set to `"tasks/" + taskId + ".md"` and
  `status` set to `"pending"` for every task (added by the coordinator, not requested from the
  model — deterministic derivations of the task ID, not generation decisions).

### Phase detail block — `wbs/user-stories/{phaseId}.md` (OQ-04, third tier)

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
tasks do. `renderPhaseDetailBlock(phase)` / `parsePhaseDetailBlock(text)` in `wbs-assembler.js`
produce/consume exactly this shape.

### Per-task call — no schema (plain-text response, same convention as today's full generator)

Output is the existing rendered block, unchanged format:
```
<a id="task-{taskId}"></a>
### {taskId}

- **Task ID:** {taskId}
- **Title:** {title}
- **Outcome:** {outcome}
- **Domain:** {domain}
- **Agent type:** {agentType}
- **Dependencies:** {dependsOn joined or —}
- **Acceptance criteria:** {acceptanceCriteria joined or —}
- **Estimate — agent minutes:** {agentMinutes}
- **Estimate — tokens:** {tokens}
- **Output count:** {outputCount}
- **Grouping rationale:** {groupingRationale or —}
- **Commit type:** {commit.type}
- **Commit scope:** {commit.scope or —}
- **Commit subject:** {commit.subject}

**Verification commands:**

{one fenced block per command}
```
The per-task agent is given its skeleton entry pre-filled for every field except
`groupingRationale` and the verification commands section, and is instructed to restate the
given values verbatim (not re-derive them) — see OQ-03 resolution.

## 6. `pm-phase2.js` Control Flow (replaces current lines 33–58)

```js
// Deliberately NOT file('wbs') — file() always prepends '{prefix}-' (every other artifact,
// e.g. file('Requirements.md') -> '{prefix}-Requirements.md', is a single file named after its
// own content, so the prefix disambiguates it; this is a directory nested inside the feature's
// own already-prefixed folder, so repeating the prefix on the directory name is redundant.
const wbsDir = `${featureDir}/wbs`                  // {featureDir}/wbs/
const indexPath = `${wbsDir}/index.json`

// 1. Skeleton (no declared worker() output — host writes every file itself)
let index
if (!c.exists(indexPath)) {
  const skeleton = await c.worker('gaia.agent.planner.work-breakdown', featurePath, {
    schema: SKELETON_SCHEMA,
  })
  // materializeIndex: (a) strips title/commit out of each phase and writes them to
  // user-stories/{id}.md via renderPhaseDetailBlock (OQ-04 — phase content is fully known now,
  // written immediately, not lazily); (b) adds detailFile + status:"pending" per task.
  index = materializeIndex(skeleton)
  for (const phase of index.phases) {
    c.writeOutput(`${wbsDir}/${phase.detailFile}`, renderPhaseDetailBlock(skeleton.phases.find(p => p.id === phase.id)))
  }
  c.writeOutput(indexPath, JSON.stringify(index, null, 2))
} else {
  index = c.json(indexPath)                          // resume: reuse existing skeleton as-is
}

// 2. Structural pre-checks (wb-graph-checks.js, same functions wb-validate.js now imports)
const graphErrors = runGraphChecks(index, c.read(file('Requirements.md')))
if (graphErrors.length) throw new Error('Work breakdown skeleton failed structural checks: ' + JSON.stringify(graphErrors))

// 3. Per-task generation, resume-by-status, sequential
for (const phase of index.phases) {
  for (const taskId of phase.taskIds) {
    const task = index.tasks[taskId]
    const detailPath = `${wbsDir}/${task.detailFile}`
    if (task.status === 'generated' && c.exists(detailPath)) continue   // UC-04
    const detail = await c.worker('gaia.agent.planner.work-breakdown-task',
      buildTaskPrompt(index, taskId, file('Tech-Spec.md')), { label: `work-breakdown-task:${taskId}` })
    c.writeOutput(detailPath, detail)
    task.status = 'generated'
    c.writeOutput(indexPath, JSON.stringify(index, null, 2))   // persist status after each task (NFR-01)
  }
}

// 4. Assembly + existing pipeline, unchanged past this point except the path passed in
const report = await c.activity('wb-validate', async () => {
  const res = c.command(['run-asset', 'scripts/wb-validate.js', '--project', c.root,
    '--', wbsDir, file('Requirements.md')], [0, 1])
  ...  // unchanged body
})
// ... semantic validation, wb-render.js (passed wbsDir instead of jsonPath), Gate 2 payload: unchanged
```

`materializeIndex`/`runGraphChecks`/`buildTaskPrompt` are small new pure helper functions local to
`pm-phase2.js` (or a co-located `pm-phase2-wbs.js` helper module if the workflow script file
would otherwise grow unreasonably large — implementation detail, not a contract surface).

## 7. Legacy Compatibility

A feature whose `{PREFIX}-Work-Breakdown.json` already exists (pre-FTR-020) is never migrated.
`loadWorkBreakdown()` dispatches purely on whether the given path is a file or a directory, so
re-running `wb-validate.js`/`wb-render.js` by hand against an old feature's existing JSON file
continues to work identically (AC-06). New features created after this ships always get the
directory form from `pm-phase2.js`.

## 8. Test Plan (AC-09)

- `wb-graph-checks.test.js`: each of the 11 extracted functions, unit-tested directly against
  both a skeleton-shaped and a full-task-shaped input (same inputs `wb-validate.test.js`
  presumably already uses for checks 3/5–14/19–21 — reuse those fixtures).
- `wb-validate.regression.test.js`: run `wb-validate.js` against the existing test fixtures
  before/after the extraction; assert byte-identical JSON report and exit code (OQ-02's
  behavior-preservation requirement).
- `wbs-assembler.test.js`: `loadWorkBreakdown()` against (a) a hand-built `wbs/`
  directory — the `wbs/` fixture produced during this feature's own definition is reused
  here (see feature-dogfooding note below) — and (b) an equivalent legacy single JSON file;
  assert the two produce deep-equal assembled structures. Also: missing `index.json`, missing a
  referenced task file, missing a referenced **phase** file, malformed task detail block,
  malformed phase detail block — each asserts a structured error naming the specific path
  (AC-07). `parseTaskDetailBlock`/`renderTaskDetailBlock` round-trip test (render then parse back
  yields the original task fields, including verification commands with embedded
  pipes/backticks) and a `parsePhaseDetailBlock`/`renderPhaseDetailBlock` round-trip test.
- `pm-phase2-wbs-resume.test.js`: a skeleton with some tasks already `status: "generated"` and
  existing detail files is re-run; assert only `pending` tasks dispatch a `worker()` call
  (mock/stub dispatch, counting invocations) (AC-03).
- `wb-render.regression.test.js`: render from a `wbs/` directory and from an equivalent
  legacy JSON; assert byte-identical `.md`/`.csv` output (AC-05).

**Feature-dogfooding fixture:** `internal_docs/features/FTR-020-work-breakdown-split-generation/wbs/`
is a real, hand-authored split-format directory (16 tasks, 6 phases, both tiers) produced during
this feature's own definition and already verified — by a throwaway script, before any
production code existed — to assemble and round-trip through the real (pre-extraction)
`wb-validate.js`/`wb-render.js` with byte-identical rendered output to the equivalent legacy
`FTR-020-Work-Breakdown.json`. Copy it into the test fixtures directory instead of hand-building
an equivalent one from scratch for `wbs-assembler.test.js`/`wb-render.wbs-directory-parity.test.js`.
