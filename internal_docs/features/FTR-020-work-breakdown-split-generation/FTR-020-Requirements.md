# FTR-020 — Functional Requirements

## 1. Purpose and scope

Replace the single-turn, single-file generation of `{PREFIX}-Work-Breakdown.json` with a
two-pass generation (one skeleton call, one call per task) writing a directory-based format
(`wbs/index.json` + `wbs/tasks/{taskId}.md`), and give `wb-validate.js` /
`wb-render.js` a loader that assembles the same in-memory structure from either the new format
or the existing legacy single JSON, so their validation checks and rendering logic run
unmodified.

In scope: `pm-phase2.js` orchestration of skeleton + per-task generation with resume-by-status;
the new directory format and its schema; the assembler loader; `wb-validate.js`'s structural
pre-checks applied to the skeleton before per-task dispatch.

Out of scope: `lib/task-executor/plan.js`, the `gaia-developer-*` agents, `lib/workflow-control.js`'s
`worker()` contract, migration of existing legacy features, parallel per-task dispatch, and the
phase-scope-discipline problem tracked separately in `internal_docs/ideas/`.

Actors: deterministic `pm-phase2` workflow (coordinator), skeleton-generation agent, per-task
detail-generation agent, existing `wb-validate.js`/`wb-render.js` scripts (unmodified past the
new loader), existing semantic validator and Gate 2 (unmodified).

## 2. Use Cases

### UC-01: Generate Work Breakdown Skeleton

| Field | Value |
|---|---|
| Actor | Coordinator and skeleton-generation agent |
| Priority | Must |
| Preconditions | Gate 1 approved; `feature.md`, Requirements, Tech-Spec readable |
| Trigger | `pm-phase2` enters Work Breakdown generation |

One `c.worker()` call (no declared output — the coordinator writes the result itself) returns a
schema-validated JSON skeleton: every phase (`id`, `type`, `title`, `commit`, ordered `taskIds`)
and, per task, only the structural fields needed to fix the dependency graph and AC assignment:
`id`, one-sentence `outcome` stub, `domain`, `agentType`, `dependsOn`, `acceptanceCriteria`,
`estimate`, `outputCount`, `commit`. No verification commands or grouping-rationale prose. The
coordinator writes the response to `wbs/index.json` (schema v3) with every task's
`status` initialized to `"pending"`.

### UC-02: Validate Skeleton Structurally Before Per-Task Dispatch

| Field | Value |
|---|---|
| Actor | Coordinator |
| Priority | Must |
| Preconditions | `index.json` written |
| Trigger | After UC-01 |

Before any per-task call is dispatched, the coordinator runs the subset of `wb-validate.js`'s
checks that are answerable from skeleton fields alone (unique task IDs, required skeleton
fields, task-ID format, domain/agentType whitelist, dependency existence, self-dependency, phase
ID consistency, task/phase cycle detection, phase schedulability, AC existence/scope/Must
coverage, empty-phase detection). A skeleton that fails is rejected; `pm-phase2` reports the
failure and does not proceed to UC-03. Content-quality checks that depend on per-task detail
(empty verification commands, empty commit subject, missing grouping rationale, duration
warning/split bands beyond the skeleton's rough estimate) are deferred to the full post-assembly
run of `wb-validate.js` in UC-05.

### UC-03: Generate One Task's Detail

| Field | Value |
|---|---|
| Actor | Coordinator and per-task detail-generation agent |
| Priority | Must |
| Preconditions | Skeleton passed UC-02; task status is `pending` |
| Trigger | Coordinator iterates skeleton task order |

For each task still `pending`, one `c.worker()` call receives that task's skeleton entry, the
Tech-Spec section relevant to its domain, and the full skeleton's compact task list (`id` +
`title` + `outcome` stub only) as shared context for duplicate-implementation awareness. The
agent returns that task's detail block in the existing rendered "Task Details" format (field
lines + fenced verification commands). The coordinator writes it to
`wbs/tasks/{taskId}.md` and sets the task's `status` to `"generated"` in `index.json`
only after the write succeeds and the file re-parses without error.

### UC-04: Resume Partial Generation

| Field | Value |
|---|---|
| Actor | Coordinator |
| Priority | Must |
| Preconditions | `index.json` exists from a prior, incomplete `pm-phase2` run |
| Trigger | `pm-phase2` is re-run for the same feature |

The coordinator reads existing `index.json` task statuses and dispatches UC-03 only for tasks
still `pending`. Tasks already `generated` are not regenerated and their detail files are not
overwritten. A task whose detail file is missing despite a `generated` status is treated as
`pending` (status alone is not trusted without the file).

### UC-05: Assemble and Validate/Render Unchanged

| Field | Value |
|---|---|
| Actor | Coordinator, `wb-validate.js`, `wb-render.js` |
| Priority | Must |
| Preconditions | All tasks `generated` |
| Trigger | After UC-03/UC-04 complete |

A new loader function reads `index.json` and every `tasks/*.md` file (or, for a legacy feature,
the single `{PREFIX}-Work-Breakdown.json`), parses each task detail block with the same
field/fence rules already used by `wb-render.js`'s rendering conventions, and reconstructs the
exact `{ schemaVersion, feature, phases: [{ ..., tasks: [...] }] }` shape both scripts already
consume. `wb-validate.js`'s full 23 checks and `wb-render.js`'s `renderMarkdown`/`renderCsv` then
run with no change to their own logic. Semantic validation, Gate 2 payload assembly, and Gate 2
itself proceed exactly as today.

## 3. Business Rules

| ID | Rule | Applies to |
|---|---|---|
| BR-01 | The skeleton call fixes task IDs, phases, domains, `dependsOn`, and `acceptanceCriteria` assignment once; no later call may introduce a new task ID or change these fields | UC-01, UC-03 |
| BR-02 | No per-task call is dispatched until the skeleton passes its structural pre-checks | UC-01, UC-02 |
| BR-03 | A task's `status` becomes `"generated"` only after its detail file is written and re-parses without error | UC-03 |
| BR-04 | Resume never regenerates a task whose detail file exists and is valid | UC-04 |
| BR-05 | The assembler produces an identical in-memory structure whether the input is the split format or the legacy single JSON | UC-05 |
| BR-06 | `wb-validate.js`'s 23 checks and `wb-render.js`'s rendering functions are not modified by this feature | UC-05 |
| BR-07 | `lib/task-executor/plan.js`, the `gaia-developer-*` agents, and `lib/workflow-control.js`'s `worker()` contract are not modified | All UCs |
| BR-08 | Missing or malformed `index.json` or a referenced task file aborts with a structured error before any check or render proceeds | UC-05 |

## 4. Data Requirements

`wbs/index.json` (schema v3): `schemaVersion`, `feature`, ordered `phases[]`
(`id`, `type`, `title`, `commit`, ordered `taskIds[]`), and a `tasks` map keyed by task ID holding
every structural field (`domain`, `agentType`, `dependsOn`, `acceptanceCriteria`, `estimate`,
`outputCount`, `groupingRationale`, `commit`, `detailFile`, `status`).

`wbs/tasks/{taskId}.md`: exactly the existing rendered detail-block format (field lines
plus fenced, byte-preserved verification commands) — no new format introduced.

No change to the assembled in-memory structure's own shape (`phases[].tasks[]` with the full
task fields `wb-validate.js`/`wb-render.js` already expect).

## 5. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | A single failed per-task call does not require regenerating any other task |
| NFR-02 | `wb-validate.js` and `wb-render.js` produce identical output for an equivalent split-format and legacy-single-JSON input |
| NFR-03 | No change to `lib/task-executor/plan.js`, `gaia-developer-*` agents, or `lib/workflow-control.js`'s `worker()` contract |
| NFR-04 | Structural pre-checks run against the skeleton before any per-task token is spent |
| NFR-05 | Errors from the assembler identify the specific missing or malformed file |

## 6. Acceptance Criteria

See `feature.md` AC-01 through AC-09 — unchanged and carried verbatim as this feature's
authoritative acceptance criteria table (not duplicated here to avoid drift between the two
documents).

## 7. Dependencies and Assumptions

- FTR-014 (available): `wb-validate.js` (23 checks) and `wb-render.js` (`renderMarkdown`/
  `renderCsv`) are the baseline this feature assembles into, unmodified past the new loader.
- FTR-018 (available): `lib/task-executor/plan.js` parses only the rendered `.md`/`.csv`; not
  touched by this feature.
- `lib/workflow-control.js`'s `worker()` one-output-per-call contract is fixed; the two-pass
  design exists specifically to avoid requiring any change to it.
- `npm test` is the only verification command; no separate build step exists.
- Open Questions 2 and 3 from `feature.md` (exact reuse strategy for `wb-validate.js`'s check
  functions against skeleton-only input, and the precise skeleton/detail field split) must be
  closed by the Tech Spec before Gate 1.
