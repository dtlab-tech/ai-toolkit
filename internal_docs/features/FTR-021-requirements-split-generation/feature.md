# Requirements Split Generation and Storage

## Feature ID
FTR-021

## Summary
Replaces the single-shot `{PREFIX}-Requirements.md` artifact and its single-shot LLM generation
with a directory-based format (`req/index.md` + one `req/use-cases/{UC-ID}.md` file per use
case) produced by **one skeleton-generation call plus one generation call per use case**, instead
of one monolithic call emitting the whole 9-section document (including every use case's full
flow) at once. `pm-phase1.js` gains a loader/renderer that assembles `{PREFIX}-Requirements.md`
from the new directory layout — byte-identical in shape to what today's single call would have
produced — so `gaia-generate-tech-spec`, `gaia-validate-feature-docs`, the existing 9-section
truncation check, the Gate 1 `docsDigest`, and `gaia-generate-work-breakdown` are all unaffected.
This is the same architecture already implemented for the Work Breakdown (FTR-020), applied one
step earlier in the pipeline.

## Problem Statement
`gaia-generate-requirements` has no `Write` tool; its entire response is persisted verbatim to
`{PREFIX}-Requirements.md` by `pm-phase1.js`'s `c.worker()` call in a single model turn. A feature
with many use cases therefore requires one long, uninterrupted generation turn covering all 9
sections — including every use case's full Main flow / Alternative flows / Error flows /
Postconditions — at once. `pm-phase1.js` already has an explicit truncation detector
(`assertCompleteSections`, checking for 9 numbered `## N. ` headings; commit `0783fe1`), but it
can only detect that a turn was cut off, not prevent the cause: one call still has to emit
everything. This is the exact same failure class FTR-020 already fixed for the Work Breakdown —
execution errors, overly long messages, and failed validations on complex features — just one
pipeline step earlier, and it was explicitly flagged as worth doing while FTR-020 was still in
its design/worked-example stage (`req/` under FTR-020's own folder).

As with FTR-020, reshaping storage alone would not fix this: `worker()`'s one-call-one-output
contract (`lib/workflow-control.js`) is shared infrastructure used by `pm-phase1.js` for both
Requirements and Tech-Spec. The design therefore splits generation itself, mirroring FTR-020's
proven split: one bounded "skeleton" call fixes everything that is NOT owned by a single use case
(the use-case index table, Business Rules, Data Requirements, NFRs, the Acceptance Criteria
table, Dependencies, Open Questions) in one small response; one call per use case then fills in
that use case's own full flow detail, reading the skeleton's use-case index (ID + title + actor
+ priority only, compact) for cross-use-case awareness.

## Actors
N/A — internal/technical feature

## Core Flow (Happy Path)
This is an internal tooling change to `pm-phase1.js`; the execution path is described below.

1. `pm-phase1.js` resolves the feature path exactly as today, then enters Requirements
   generation.
2. **Skeleton pass (one `c.worker()` call, no declared output — the host writes the result
   itself, mirroring FTR-020's skeleton step):** a modified `gaia-generate-requirements` reads
   `feature.md` and returns `req/index.md`'s full content: every section except the per-UC flow
   bodies — Section 1 (Introduction: Purpose/Scope/Actors), 3 (Business Rules), 4 (Data
   Requirements), 5 (NFRs), 6 (UI Requirements), 7 (Acceptance Criteria — every AC, each with its
   final `Related UC` assignment), 8 (Dependencies and Assumptions), 9 (Open Questions), and
   Section 2's use-case index table (UC ID, Title, Actor, Priority, File) — with no use case's
   flow body inline. `pm-phase1.js` writes this response to `req/index.md` via `c.writeOutput`.
3. `pm-phase1.js` runs a small set of structural self-consistency checks against `index.md`'s own
   use-case table (unique UC IDs, well-formed IDs, every `Related UC`/`Applies to` reference
   pointing at a UC ID that exists in the table) before dispatching any per-UC call. A skeleton
   that fails these checks is rejected and regenerated.
4. **Per-use-case detail pass (one `c.worker()` call per UC, in index-table order):** a new
   `gaia-generate-requirements-use-case` agent receives one UC's index-table row and the compact
   full use-case index (ID + title + actor only) for cross-UC awareness, plus `feature.md`. It
   returns that UC's detail — the field table (Actor, Preconditions, Trigger, Priority) plus Main
   flow / Alternative flows / Error flows / Postconditions, exactly the structure
   `gaia-generate-requirements` already produces today inside Section 2 — which `pm-phase1.js`
   writes to `req/use-cases/{UC-ID}.md` via `c.writeOutput`.
   - A failed or timed-out call for one UC is retried for that UC alone; UC files that already
     exist and parse successfully are not regenerated on a re-run (resume is file-existence-based
     — see Data Model; there is no separate `status` field to go stale, unlike FTR-020's
     `index.json`, because `index.md`'s own use-case table is the only source of truth for which
     UC IDs must exist, and "the file exists and parses" is sufe to confirm an id is done).
5. Once every UC file exists, **assembly**: a new loader/renderer function reads `index.md` +
   every `use-cases/*.md` file and reconstructs `{PREFIX}-Requirements.md` in the exact 9-section
   shape `gaia-generate-requirements` already produces today (Section 2 built by concatenating
   each UC file's content, under its own `### UC-XX: ...` heading, in index-table order). No
   change to that document's shape — this feature reuses it verbatim, assembled instead of
   generated in one turn.
6. `pm-phase1.js`'s existing `assertCompleteSections` check, `docsDigest` computation, Tech-Spec
   generation, and the 3-cycle `gaia-validate-feature-docs` loop proceed exactly as today, reading
   the now-assembled `{PREFIX}-Requirements.md`.
7. `gaia-generate-tech-spec`, `gaia-validate-feature-docs`, and `gaia-generate-work-breakdown` are
   unaffected: they never read `req/index.md` or `req/use-cases/*.md` — only the assembled
   `{PREFIX}-Requirements.md`, exactly as before this feature.

## Out of Scope
- Any change to `gaia-generate-tech-spec`, `gaia-validate-feature-docs`, or
  `gaia-generate-work-breakdown` — they continue to read the assembled
  `{PREFIX}-Requirements.md`.
- Any change to `lib/workflow-control.js`'s `worker()` single-output contract.
- The feature.md↔req↔spec bidirectional traceability/coverage check folded into Gate 1 — already
  governance-decided (see `internal_docs/ideas/requirements-techspec-split-and-traceability-matrix.md`)
  but scoped as its own separate, future incremental feature. This feature's self-consistency
  checks (step 3 above) are a structural integrity check on `req/` alone, not that coverage check.
- Tech-Spec split generation (the `spec/` equivalent) — a separate future feature; this one only
  covers Requirements.
- Migration tooling for existing features whose `{PREFIX}-Requirements.md` already exists as a
  monolithic file with no `req/` directory — they are not converted; the split path only applies
  the next time Requirements is (re)generated for a feature.
- Per-use-case generation parallelism — the MVP dispatches use-case calls sequentially, exactly
  like FTR-020's per-task calls.
- A shared assembler library between `req/` and `wbs/` — kept independent to avoid coupling two
  otherwise-unrelated pipeline phases, even at the cost of structural similarity/duplication
  between the two loader implementations.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| Skeleton fails structural self-consistency checks (duplicate/malformed UC ID, dangling `Related UC`/`Applies to` reference) | Skeleton is rejected and regenerated; no per-UC calls dispatched |
| One per-UC call fails or times out | Only that UC is retried; UC files that already exist and parse are not regenerated |
| `pm-phase1` is re-run after a partial per-UC failure | UC files already present on disk are skipped; only missing ones are dispatched |
| A per-UC response is malformed (missing a required field, wrong heading) | That call fails the same way a `worker()` content-validation failure fails today; retried per the rule above |
| `req/index.md` is missing or unreadable when the assembler runs | Assembler aborts with an explicit error, same class as today's missing-Requirements abort |
| A `req/use-cases/{UC-ID}.md` referenced by `index.md`'s table is missing | Assembler aborts with an explicit error naming the missing UC ID |
| A legacy feature has only a monolithic `{PREFIX}-Requirements.md` and no `req/` directory | Assembler/loader is not invoked for it; existing freshness/validation logic reads the monolithic file exactly as today — no regeneration forced |
| The assembled `{PREFIX}-Requirements.md` is still missing one of the 9 sections after assembly | `assertCompleteSections` catches it exactly as it does today for a truncated single-call response |

## Data Model
N/A — internal/technical feature

### `req/index.md`
Markdown, not JSON (unlike FTR-020's `wbs/index.json`) — this feature's "skeleton" content is
prose and tables, not a dependency graph needing deterministic graph checks, so there is no
equivalent structural JSON file. Holds every section of today's single document except the
per-UC flow bodies — Sections 1, 3, 4, 5, 6, 7, 8, 9 — plus Section 2's use-case index table
(`UC ID | Title | Actor | Priority | File`). This table is the single source of truth for which
UC IDs must exist; `req/use-cases/` directory contents must match it exactly (checked by the
step-3 self-consistency check).

### `req/use-cases/{UC-ID}.md`
Exactly the use-case content already rendered today inside `{PREFIX}-Requirements.md`'s Section
2 for one use case: the field table (Actor, Preconditions, Trigger, Priority) plus Main flow /
Alternative flows / Error flows / Postconditions. No change to that format — this feature reuses
it as a standalone per-file unit instead of one block among many in a single document.

### Resume tracking
No separate `status` field (unlike FTR-020's `index.json.tasks[id].status`) — a UC is considered
done when `req/use-cases/{UC-ID}.md` exists and parses successfully; `index.md`'s own table is
the complete list of UC IDs that must exist. Tech-Spec to confirm this is sufficient (see Open
Questions).

## Roles and Permissions
N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A feature has `feature.md` | `pm-phase1` runs Requirements generation | A skeleton call produces `req/index.md` containing every section except per-UC flow bodies (Sections 1, 3, 4, 5, 6, 7, 8, 9) and a complete use-case index table (every UC's ID/Title/Actor/Priority/File), with no per-UC flow content inline | Must |
| AC-02 | `req/index.md`'s use-case table passes the self-consistency check | `pm-phase1` runs | Exactly one `c.worker()` call is dispatched per UC, in index-table order, each producing `req/use-cases/{UC-ID}.md` | Must |
| AC-03 | A per-UC call fails or times out | `pm-phase1` is re-run | Only the failed UC's call is retried; UC files that already exist and parse are not regenerated or overwritten | Must |
| AC-04 | Every UC file exists and parses | The assembler runs | It reconstructs `{PREFIX}-Requirements.md` in the exact 9-section shape `gaia-generate-requirements` produces today, byte-equivalent in structure to an equivalent single-call input | Must |
| AC-05 | `req/index.md` or a referenced UC file is missing or malformed | The assembler runs | It aborts with an explicit, structured error identifying the missing/malformed path, before Tech-Spec generation proceeds | Must |
| AC-06 | `gaia-generate-tech-spec`, `gaia-validate-feature-docs`, `gaia-generate-work-breakdown`, and `lib/workflow-control.js`'s `worker()` | This feature is implemented | None of these are modified | Must |
| AC-07 | A legacy feature has a monolithic `{PREFIX}-Requirements.md` with no `req/` directory | `pm-phase1` runs for that feature | It is read exactly as today; no behavior change, no forced regeneration | Must |
| AC-08 | All changes are delivered | `npm test` runs | All tests pass: index/UC parsing, assembly parity against a known single-call-shaped Requirements fixture, resume-skip-existing-UC logic, structural self-consistency checks, `pm-phase1.js` regression | Must |

## MVP vs Deferred

### MVP (must ship)
- `req/index.md` (Sections 1, 3, 4, 5, 6, 7, 9 + use-case index table)
- `req/use-cases/{UC-ID}.md` per-use-case detail files, reusing the existing rendered use-case
  format verbatim
- Skeleton-generation agent call (one call, produces `index.md`'s full content)
- Per-use-case detail-generation agent call (one call per UC, sequential, with the compact
  use-case index as shared context)
- `pm-phase1.js` orchestration: skeleton call → structural self-consistency pre-checks → per-UC
  calls with resume-by-file-existence → assembly → existing `assertCompleteSections` →
  existing Tech-Spec generation → existing validation loop → existing Gate 1
- Assembler/loader (new) producing `{PREFIX}-Requirements.md`, supporting both the new split
  format and the legacy monolithic-file case
- Automated tests per AC-08

### Deferred (next iteration)
- Parallelizing per-UC generation calls
- Migrating existing legacy monolithic features to the split format
- The feature.md↔req coverage/traceability check folding into Gate 1 (separate future feature)
- Tech-Spec split generation (separate future feature)

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Is file-existence-only resume tracking (no `status` field) actually sufficient, or does a race/partial-write scenario (e.g. a UC file written but truncated mid-write) need a lightweight companion marker the way FTR-020's `index.json.tasks[id].status` did? | Affects whether `req/` needs any structured sidecar file at all, or stays pure Markdown |
| 2 | Should the self-consistency check (step 3) be a new standalone script (`req-graph-checks.js`, mirroring FTR-020's `wb-graph-checks.js`) or inlined directly in `pm-phase1.js`? | `pm-phase1.js` runs under the same no-`require()` `lib/workflow-runner.js` AsyncFunction sandbox FTR-020 discovered for `pm-phase2.js` — any reusable check logic must go through `c.command(['run-asset', ...])` regardless, so this is purely an organization choice, not a feasibility one |
| 3 | Exact assembler module boundary: one `req-assembler.js` (mirroring `wbs-assembler.js`'s CLI-mode pattern) or logic embedded directly where `pm-phase1.js` currently reads `file('Requirements')`? | Affects how much of FTR-020's assembler shape is reusable as a direct pattern vs needing independent design |

## Dependencies and Assumptions
- FTR-020 (available, implemented on `develop`): proved the skeleton+per-item generation split
  architecture, the `require.main === module` CLI-mode pattern for scripts invoked via
  `c.command(['run-asset', ...])`, and — critically — that **workflow scripts run in a sandboxed
  `AsyncFunction` with no `require()` in scope** (`lib/workflow-runner.js`), which applies
  identically to `pm-phase1.js` since it runs on the same runtime. Any new script this feature
  introduces must expose a CLI entry point, not be designed assuming in-process `require`.
- `pm-phase1.js`'s existing `assertCompleteSections` (9-section truncation check), `docsDigest`
  computation (binds Gate 1 approval to exact Requirements+Tech-Spec byte content), and 3-cycle
  `gaia-validate-feature-docs` loop are the baseline this feature must not break.
- `gaia-generate-tech-spec`, `gaia-validate-feature-docs`, and `gaia-generate-work-breakdown` all
  read `{PREFIX}-Requirements.md` only — none read `req/` directly; this feature's assembler must
  keep producing that file unchanged in shape.
- `lib/workflow-control.js`'s `worker()` one-output-per-call contract is treated as fixed, exactly
  as in FTR-020.
- `npm test` is the only verification command; no separate build step exists.
