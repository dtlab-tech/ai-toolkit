# Work Breakdown Split Generation and Storage

## Feature ID
FTR-020

## Summary
Replaces the single-shot `{PREFIX}-Work-Breakdown.json` artifact and its single-shot LLM
generation with a directory-based format (`wbs/index.json` + one
`wbs/tasks/{taskId}.md` file per task) produced by **one small skeleton-generation
call plus one generation call per task**, instead of one monolithic call emitting every task's
full content at once. `wb-validate.js` and `wb-render.js` gain a loader that assembles the same
in-memory structure they already operate on from the new directory layout (or, unchanged, from a
legacy single JSON file) — their 23 structural checks and the Markdown/CSV renderer are otherwise
untouched. The final `{PREFIX}-Work-Breakdown.md` / `.csv` deliverables, `lib/task-executor/`
(`plan.js`), the `gaia-developer-*` agents, and the `worker()` single-output contract in
`lib/workflow-control.js` are all unchanged — this feature touches only the generation and
validation/rendering input side of `pm-phase2`.

## Problem Statement
`gaia-generate-work-breakdown` has no `Write` tool; its entire response is persisted verbatim to
`{PREFIX}-Work-Breakdown.json` by `pm-phase2.js`'s `c.worker()` call in a single model turn (see
`lib/workflow-control.js`: `worker()` supports exactly one declared output per call — a
deliberate, cross-pipeline invariant also relied on by `pm-phase1.js` and `am-phase1.js`). A
feature with many tasks therefore requires one long, uninterrupted generation turn covering every
phase and every task's full detail (outcome, verification commands, acceptance criteria,
grouping rationale) at once. `pm-phase1.js` already has an explicit truncation detector for
Requirements/Tech-Spec (commit `0783fe1`); no equivalent exists for the Work Breakdown, and
`wb-validate.js` only catches a gross JSON-parse failure, not a syntactically-closed-but-
incomplete document (e.g. missing later phases). A single failed or truncated turn forces
regenerating the entire breakdown from scratch, and the resulting large JSON is awkward to
review or diff as a single file.

Investigation during feature definition established that **reshaping the output alone does not
fix this**: because `worker()`'s one-call-one-output contract is shared infrastructure, splitting
the *storage* format into many files without also splitting the *generation* into many smaller
dispatches leaves the model still emitting the entire feature's content in one turn — the
truncation exposure would be unchanged. The chosen design therefore splits generation itself: one
bounded "skeleton" call fixes the task graph (IDs, phases, domains, `dependsOn`, `acceptanceCriteria`
assignment, rough estimates) once, up front, in one small response; one call per task then fills
in that task's own detail (outcome, verification commands, grouping rationale), reading the full
skeleton as shared context so it can see what every other task already covers (duplicate-
implementation avoidance) without having to regenerate it.

## Actors
N/A — internal/technical feature

## Core Flow (Happy Path)
This is an internal tooling change; the execution path is described below.

1. `pm-phase2.js` resolves Gate 1 approval exactly as today, then enters Work Breakdown
   generation.
2. **Skeleton pass (one `c.worker()` call, schema-validated JSON response):** a (modified)
   `gaia-generate-work-breakdown` reads `feature.md`, `{PREFIX}-Requirements.md`,
   `{PREFIX}-Tech-Spec.md` and returns a compact JSON skeleton: the full phase list (`id`,
   `type`, `title`, `commit`, ordered `taskIds`) and, per task, only the *structural* fields
   needed to fix the graph: `id`, a one-sentence `outcome` stub, `domain`, `agentType`,
   `dependsOn`, `acceptanceCriteria`, `estimate`, `outputCount`, `commit`. No verification
   commands, no grouping rationale prose. `pm-phase2.js` writes this response to
   `wbs/index.json` itself (via `c.writeOutput`, the same host-only-write path
   `worker()` already uses internally) — `worker()` itself is called with no output declared
   for this step, since the host, not the agent, is making two separate writes across the whole
   flow.
3. `pm-phase2.js` runs the existing dependency/cycle/ID-format/AC-coverage checks (extracted
   from `wb-validate.js`'s checks 3, 5–14, 19–21 — the ones answerable from skeleton fields
   alone) against `index.json` before spending any further tokens. A skeleton that fails these
   checks is rejected and regenerated; no per-task calls are dispatched against a broken graph.
4. **Per-task detail pass (one `c.worker()` call per task, in the order tasks are listed across
   the skeleton's phases):** a new `gaia-generate-work-breakdown-task` agent receives one task's
   skeleton entry, the relevant Tech-Spec section, and the full skeleton task list (id + title +
   outcome stub only, compact) for cross-task awareness. It returns that task's detail block —
   the same `- **Task ID:** ... **Verification commands:** ...` format already rendered today
   inside `{PREFIX}-Work-Breakdown.md`'s "Task Details" section — which `pm-phase2.js` writes to
   `wbs/tasks/{taskId}.md` via `c.writeOutput`.
   - A failed or timed-out call for one task is retried for that task alone; tasks already
     written are not regenerated. `index.json` records a `status` (`pending` | `generated`) per
     task so a re-run of `pm-phase2` after a partial failure only dispatches the tasks still
     `pending`.
5. Once every task's file exists, **assembly**: a new small loader function (used by both
   `wb-validate.js` and `wb-render.js`) reads `index.json` + every `tasks/*.md` file, parses each
   task detail block with the same field/fence-parsing rules already proven in
   `scripts/wb-render.js` (`fencedCommandBlock`/`taskAnchor` conventions), and reconstructs the
   exact in-memory `{ schemaVersion, feature, phases: [{ ..., tasks: [...] }] }` shape the
   existing code already works with. **No change to the body of either script's logic** past
   that point: `wb-validate.js`'s 23 structural checks and `wb-render.js`'s `renderMarkdown` /
   `renderCsv` run unmodified.
6. `pm-phase2.js`'s existing semantic validation (`gaia-validate-work-breakdown-semantic`),
   rendering, Gate 2 payload assembly, and Gate 2 itself proceed exactly as today, reading the
   now-assembled structure. `{PREFIX}-Work-Breakdown.md` / `.csv` are byte-for-byte what they
   would have been from an equivalent single-JSON input.
7. `lib/task-executor/` (`plan.js`), the `gaia-developer-*` agents, and every other downstream
   consumer are unaffected: they never read `index.json` or `tasks/*.md` — only the rendered
   `.md` / `.csv`, exactly as before this feature.

## Out of Scope
- Any change to `lib/task-executor/plan.js` or the task executor's `.md`/`.csv` consumption
  contract (FTR-018's deliberately-settled format).
- Any change to `gaia-developer-backend`/`-frontend`/`-testing`/`review-solution` — they
  continue to read the rendered `{PREFIX}-Work-Breakdown.md`.
- Any change to `lib/workflow-control.js`'s `worker()` single-output contract — it is shared by
  `pm-phase1.js` and `am-phase1.js` and is not touched by this feature.
- Migration tooling for existing features whose `{PREFIX}-Work-Breakdown.json` (schema v2,
  single file) already exists — the assembler supports both formats; existing features are not
  converted.
- Resolving `internal_docs/ideas/work-breakdown-phase-scope-discipline.md` (the duplicate-
  implementation / phase-overload problem). The skeleton pass giving each per-task call sibling
  visibility may incidentally help, but this feature makes no acceptance claim about it.
- A splitter/parser shared library extracted from `plan.js` — to avoid touching FTR-018's module,
  the new assembler's parsing logic is implemented independently in the validate/render path, even
  at the cost of some duplication with `plan.js`'s private parsing functions.
- Per-task generation parallelism (`c.parallel`) — the MVP dispatches task calls sequentially;
  parallelizing them is a candidate follow-on, not required here.
- Configurable skeleton-vs-detail field split — the field list in Core Flow step 2 is fixed for
  this feature.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| Skeleton JSON fails structural checks (bad IDs, cycle, dangling dep, AC misassignment) | Skeleton is rejected and regenerated; no per-task calls dispatched |
| One per-task call fails or times out | Only that task is retried; already-`generated` tasks are not regenerated |
| `pm-phase2` is re-run after a partial per-task failure | Tasks with `status: "generated"` in `index.json` are skipped; only `pending` tasks are dispatched |
| A per-task response is malformed (missing a required detail field, bad fence) | That task's call fails the same way a `worker()` content-validation failure fails today; retried per the rule above |
| `index.json` is missing or unreadable when `wb-validate.js`/`wb-render.js` run | Assembler aborts with an explicit error, same class as today's "not valid JSON" abort |
| A `tasks/{taskId}.md` referenced by `index.json` is missing | Assembler aborts with an explicit error naming the missing task ID |
| A legacy `{PREFIX}-Work-Breakdown.json` (schema v2, single file) is passed to `wb-validate.js`/`wb-render.js` | Assembler detects the single-file legacy format and loads it exactly as today; no behavior change for old features |
| Two tasks in different per-task calls claim the same ID | Cannot occur — IDs are fixed once, by the skeleton pass; per-task calls cannot introduce new IDs |
| A per-task call's detail disagrees with its own skeleton's structural fields (e.g. different `domain`) | Assembler uses the skeleton's structural fields as authoritative for graph/domain/agentType/dependsOn/acceptanceCriteria/estimate/commit; the task file supplies only `title`, `outcome`, verification commands, and `groupingRationale` prose — there is no field to disagree on |

## Data Model
N/A — internal/technical feature

### `wbs/index.json` (schema v3)

> Updated post-Gate-1: `title`/`commit` moved out to the phase detail file (OQ-04, third tier —
> see Tech-Spec) and `sourceUC` was added (process decision, see Tech-Spec OQ-05) to make a
> phase's originating Use Case(s) an explicit field instead of an implied naming convention —
> found necessary because not every phase maps to exactly one UC (e.g. an orchestration phase
> spanning several UCs' mechanics needs an array, a shared-infrastructure phase needs `[]`).

```json
{
  "schemaVersion": 3,
  "feature": "FTR-NNN",
  "phases": [
    {
      "id": "INFRA",
      "type": "infrastructure",
      "sourceUC": [],
      "detailFile": "user-stories/INFRA.md",
      "taskIds": ["INFRA-TASK-BE-01"]
    }
  ],
  "tasks": {
    "INFRA-TASK-BE-01": {
      "domain": "BE",
      "agentType": "developer-backend",
      "dependsOn": [],
      "acceptanceCriteria": [],
      "estimate": { "agentMinutes": 8, "tokens": 15000 },
      "outputCount": 1,
      "groupingRationale": null,
      "commit": { "type": "feat", "subject": "add shared infrastructure" },
      "detailFile": "tasks/INFRA-TASK-BE-01.md",
      "status": "pending"
    }
  }
}
```

`tasks` is keyed by task ID for O(1) status lookups during resume; `phases[].taskIds` preserves
the authoritative ordering `wb-render.js` and the stable-ordering checks already depend on.
`status` transitions `pending` → `generated` only after that task's detail file is written and
parses successfully.

### `wbs/tasks/{taskId}.md`

Exactly the detail block format already rendered today inside `{PREFIX}-Work-Breakdown.md`'s
"Task Details" section (see `scripts/wb-render.js`'s `renderMarkdown`): the `- **Field:** value`
lines plus fenced, byte-preserved verification commands. No change to that format — this feature
reuses it as a standalone per-file unit instead of one block among many in a single document.

### `wbs/user-stories/{phaseId}.md` (third tier, added post-Gate-1 at user request)

One file per phase, holding `title` and `commit` (the only two phase-level fields with real
content) in the same field-line convention as the task detail block, minus the
verification-commands section. `index.json`'s phase entries carry only `{ id, type, detailFile,
taskIds }` — no content. Unlike the task split, this tier exists for structural symmetry with a
three-tier `features/`/`user-stories/`/`tasks/` convention and future extensibility, not for
truncation mitigation: all phase content is decided in the same single skeleton call regardless.
See Tech-Spec OQ-04 for the full rationale and the field-split reasoning.

## Roles and Permissions
N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A feature has been through Gate 1 | `pm-phase2` runs | A skeleton call produces `wbs/index.json` (schema v3) containing every phase and every task's structural fields, with no per-task prose content | Must |
| AC-02 | `index.json` passes graph/ID/AC-coverage checks | `pm-phase2` runs | Exactly one `c.worker()` call is dispatched per task, in skeleton task order, each producing `wbs/tasks/{taskId}.md` | Must |
| AC-03 | A per-task call fails or times out | `pm-phase2` is re-run | Only the failed task's call is retried; tasks already `generated` are not regenerated and their files are not overwritten | Must |
| AC-04 | Every task's detail file exists and parses | `wb-validate.js` runs | It assembles the same in-memory structure as it would from an equivalent single JSON, and all 23 existing structural checks run unmodified and produce identical results to the equivalent monolithic input | Must |
| AC-05 | The assembled structure passes `wb-validate.js` | `wb-render.js` runs | `{PREFIX}-Work-Breakdown.md` and `{PREFIX}-Work-Breakdown.csv` are byte-for-byte identical to what they would be from an equivalent single-JSON schema-v2 input | Must |
| AC-06 | A legacy `{PREFIX}-Work-Breakdown.json` (schema v2) is passed to the assembler | `wb-validate.js` or `wb-render.js` runs | It is loaded exactly as today; no behavior change for existing features | Must |
| AC-07 | `index.json` or a referenced task file is missing or malformed | The assembler runs | It aborts with an explicit, structured error identifying the missing/malformed path before any check or render proceeds | Must |
| AC-08 | `lib/task-executor/plan.js`, the `gaia-developer-*` agents, and `lib/workflow-control.js`'s `worker()` | This feature is implemented | None of these files are modified | Must |
| AC-09 | All changes are delivered | `npm test` runs | All tests pass: index schema validation, per-task file parsing/assembly, resume-skip-generated-tasks logic, parity between split-format and legacy-JSON assembled output, `wb-validate.js`/`wb-render.js` regression against both input formats | Must |

## MVP vs Deferred

### MVP (must ship)
- `wbs/index.json` schema v3 (skeleton: phases + per-task structural fields + status)
- `wbs/tasks/{taskId}.md` per-task detail files, reusing the existing rendered detail
  block format verbatim
- Skeleton-generation agent call (one call, schema-validated JSON response)
- Per-task detail-generation agent call (one call per task, sequential, each including the
  compact full-skeleton task list as shared context)
- `pm-phase2.js` orchestration: skeleton call → structural pre-checks → per-task calls with
  resume-by-status → assembly → existing `wb-validate.js` → existing semantic validation →
  existing `wb-render.js` → existing Gate 2
- Assembler loader (new) consumed by both `wb-validate.js` and `wb-render.js`, supporting both
  the new split format and the legacy single-JSON schema v2 format
- Automated tests per AC-09

### Deferred (next iteration)
- Parallelizing per-task generation calls
- Migrating existing legacy single-JSON features to the split format
- A shared parse/render library extracted from `plan.js` (kept independent in this feature to
  avoid touching FTR-018's module)
- Addressing `work-breakdown-phase-scope-discipline.md`
- Configurable skeleton/detail field split

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Should per-task calls run sequentially or via `c.parallel`? | Resolved | **Sequential for MVP** — simplest or resume semantics; parallelism deferred |
| 2 | Should the skeleton pass's structural pre-checks reuse `wb-validate.js`'s check functions directly, or a lighter-weight subset reimplemented against the skeleton shape? | **Open — must be resolved in Tech-Spec** | Reusing `wb-validate.js` would require it to accept a skeleton-only (no per-task detail) shape, which is not today's contract |
| 3 | Where exactly does the skeleton/detail field split line fall (e.g. does `estimate.tokens` belong in skeleton or detail)? | **Open — must be resolved in Tech-Spec** | Must keep the skeleton small while giving every `wb-validate.js` structural check (not content-quality checks 16-18, which are detail-dependent) everything it needs pre-detail |

## Dependencies and Assumptions
- FTR-014 (available): schema v2 single-JSON format, `wb-validate.js`'s 23 checks, and
  `wb-render.js`'s rendering logic are the baseline this feature assembles into, unmodified past
  the new loader.
- FTR-018 (available): `lib/task-executor/plan.js` parses only the rendered `.md`/`.csv`; this
  feature does not touch it and does not change that contract.
- `lib/workflow-control.js`'s `worker()` one-output-per-call contract (current, shared by
  `pm-phase1.js`/`am-phase1.js`) is treated as fixed; this feature's design was chosen
  specifically to avoid requiring any change to it.
- `npm test` is the only verification command; no separate build step exists.
