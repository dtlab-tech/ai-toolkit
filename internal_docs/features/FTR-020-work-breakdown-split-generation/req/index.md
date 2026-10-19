# FTR-020 — Functional Requirements (Index)

> This is a manual, exploratory split of `FTR-020-Requirements.md` into a directory format,
> produced to decide whether the same architecture used for the Work Breakdown (FTR-020 itself)
> is worth applying to Requirements/Tech-Spec too. Not yet a real format — see the open
> questions at the bottom before treating this as a convention.

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

## 2. Use Cases (index)

| UC ID | Title | Actor | Priority | File |
|---|---|---|---|---|
| UC-01 | Generate Work Breakdown Skeleton | Coordinator and skeleton-generation agent | Must | [use-cases/UC-01.md](use-cases/UC-01.md) |
| UC-02 | Validate Skeleton Structurally Before Per-Task Dispatch | Coordinator | Must | [use-cases/UC-02.md](use-cases/UC-02.md) |
| UC-03 | Generate One Task's Detail | Coordinator and per-task detail-generation agent | Must | [use-cases/UC-03.md](use-cases/UC-03.md) |
| UC-04 | Resume Partial Generation | Coordinator | Must | [use-cases/UC-04.md](use-cases/UC-04.md) |
| UC-05 | Assemble and Validate/Render Unchanged | Coordinator, `wb-validate.js`, `wb-render.js` | Must | [use-cases/UC-05.md](use-cases/UC-05.md) |

> **Legend:** **UC ID** — unique identifier, referenced from the Business Rules' `Applies to` and
> the Acceptance Criteria's `Related UC` columns below. **Title** — short label; the full flow is
> in the linked file, not repeated here. **Actor** — who/what initiates or participates in this
> use case. **Priority** — MoSCoW (Must/Should/Could); drives downstream Must-coverage checks.
> **File** — this UC's own detail file.

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

> **Legend:** **ID** — unique identifier. **Rule** — the constraint statement itself (what must
> always hold, regardless of how a UC is implemented). **Applies to** — which UC(s) this rule
> constrains, or "All UCs" if it's a universal, feature-wide invariant — same convention as the
> Acceptance Criteria table's `Related UC` column below.

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

> **Legend:** **ID** — unique identifier. **Requirement** — a property or constraint the whole
> feature must satisfy, not tied to one UC (that's why there's no `Applies to`/`Related UC`
> column here, unlike Business Rules/AC — an NFR is feature-wide by definition).

## 6. Acceptance Criteria

> Promoted from a "see feature.md" pointer to a real, first-class table — required for the
> bidirectional feature.md↔req↔spec traceability check (see "Traceability" below). Content is
> feature.md's AC-01..09, reworded into the `ID | Criterion | Related UC | Priority` shape
> `wb-graph-checks.js`'s `parseAcTable` already parses (same column contract as FTR-018's
> Requirements.md), with `Related UC` assigned per AC. Must stay byte-identical in substance to
> feature.md's AC table — this is a reformatting, not a redecision.

| ID | Criterion | Related UC | Priority |
|---|---|---|---|
| AC-01 | Given a feature has been through Gate 1, when `pm-phase2` runs, then a skeleton call produces `wbs/index.json` (schema v3) containing every phase and every task's structural fields, with no per-task prose content | UC-01 | Must |
| AC-02 | Given `index.json` passes graph/ID/AC-coverage checks, when `pm-phase2` runs, then exactly one `c.worker()` call is dispatched per task, in skeleton task order, each producing `wbs/tasks/{taskId}.md` | UC-02, UC-03 | Must |
| AC-03 | Given a per-task call fails or times out, when `pm-phase2` is re-run, then only the failed task's call is retried; tasks already `generated` are not regenerated and their files are not overwritten | UC-04 | Must |
| AC-04 | Given every task's detail file exists and parses, when `wb-validate.js` runs, then it assembles the same in-memory structure as it would from an equivalent single JSON, and all 23 existing structural checks run unmodified and produce identical results to the equivalent monolithic input | UC-05 | Must |
| AC-05 | Given the assembled structure passes `wb-validate.js`, when `wb-render.js` runs, then `{PREFIX}-Work-Breakdown.md` and `{PREFIX}-Work-Breakdown.csv` are byte-for-byte identical to what they would be from an equivalent single-JSON schema-v2 input | UC-05 | Must |
| AC-06 | Given a legacy `{PREFIX}-Work-Breakdown.json` (schema v2) is passed to the assembler, when `wb-validate.js` or `wb-render.js` runs, then it is loaded exactly as today; no behavior change for existing features | UC-05 | Must |
| AC-07 | Given `index.json` or a referenced task file is missing or malformed, when the assembler runs, then it aborts with an explicit, structured error identifying the missing/malformed path before any check or render proceeds | UC-05 | Must |
| AC-08 | Given `lib/task-executor/plan.js`, the `gaia-developer-*` agents, and `lib/workflow-control.js`'s `worker()`, when this feature is implemented, then none of these files are modified | All UCs | Must |
| AC-09 | Given all changes are delivered, when `npm test` runs, then all tests pass: index schema validation, per-task file parsing/assembly, resume-skip-generated-tasks logic, parity between split-format and legacy-JSON assembled output, `wb-validate.js`/`wb-render.js` regression against both input formats | All UCs | Must |

> **Legend:** **ID** — unique identifier; this is the anchor ID used across the whole
> feature.md↔req↔spec↔Work-Breakdown traceability chain (cited by WB tasks via
> `acceptanceCriteria`, and by `spec/` components via `Addresses:`). **Criterion** — a testable
> Given/When/Then statement. **Related UC** — which UC(s) this AC belongs to, or "All UCs";
> parsed structurally by `wb-graph-checks.js`'s `parseAcTable` (not just descriptive prose — this
> column is machine-read). **Priority** — MoSCoW; every Must AC must be covered by ≥1 WB task
> and ≥1 `spec/` component, both checked deterministically (see "Traceability" below).

## Traceability

This document is the middle link in a three-stage chain: `feature.md` (approved at Gate 1) →
`req/` (this document) → `spec/` (Tech-Spec). Validation of that chain is bidirectional:
**forward** — every `feature.md` AC must appear here, and every Must AC here must be addressed
by at least one `spec/components/*.md` (via its `Addresses:` field) — catches omissions;
**backward** — every AC a `spec/` component claims to address must actually exist in this table,
and every AC here must trace back to `feature.md` — catches drift/invented requirements. See
`spec/index.md`'s own "Traceability" section for the other half of the chain, and
`coverage-matrix/index.md` (feature root) for the worked example that pivots both directions into one
AC-per-row view.

**Governance decision:** this check does not become a new, separate gate. It folds into the
existing gates as a two-stage validation, mirroring the Work Breakdown's own
`wb-validate.js`→semantic-validator pattern one level up: **Gate 1** runs this document's
coverage check (deterministic, structural — feature.md↔req↔spec) followed by a semantic check
(LLM judgment: does `spec/` actually address what it claims to, not just cite the right ID);
**Gate 2** runs the equivalent coverage+semantic check one link further, against the Work
Breakdown (see `spec/index.md`'s Traceability section). Neither gate proceeds to
content-level/semantic review before its own coverage check resolves with no errors.

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

---

## What moved out of this file, and why

Only §2 (Use Cases) split into one file per item — everything else (§1, §3, §4, §5, §6, §7)
stayed here, unsplit, because none of it is naturally owned by a single UC:

- **§3 Business Rules** reference multiple UCs each (see the `Applies to` column) — BR-07
  applies to all five. Splitting them per-UC would mean either duplicating a rule across several
  UC files, or arbitrarily picking one "owner" UC for a rule that genuinely isn't owned by one.
- **§4 Data Requirements**, **§5 NFRs**, **§7 Dependencies** are feature-wide by nature — a
  schema, a non-functional property, or an external dependency doesn't belong to one UC any more
  than `wb-graph-checks.js` belongs to one Work Breakdown task.
- **§6 Acceptance Criteria** — each AC row declares its own `Related UC` column, exactly like
  Business Rules — the identical cross-cutting problem, not a new one. (Earlier draft of this
  document deferred to `feature.md`'s AC table instead of authoring its own, as a lightweight
  shortcut — promoted to a real table once the bidirectional traceability design was agreed,
  since that check needs a real table to diff against, not a pointer.)

This mirrors the Work Breakdown decision almost exactly: phase `title`/`commit` were the only
genuinely per-item content there too — everything structural stayed in `index.json`.
