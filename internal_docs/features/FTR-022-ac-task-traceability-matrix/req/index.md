# FTR-022 — Functional Requirements (Index)

## 1. Introduction

### 1.1 Purpose

Add a new deterministic renderer, `ac-task-matrix.js`, producing `{PREFIX}-AC-Task-Matrix.md`: a
table mapping every Requirements Acceptance Criterion to the Work Breakdown task(s)/phase(s) that
cover it. No new data, no new validation — purely a rendering of facts `wb-validate.js`'s checks
19–21 already compute and enforce.

### 1.2 Scope

In scope: `ac-task-matrix.js` (new script); extending `wb-graph-checks.js`'s `parseAcTable` to
also capture the `Criterion` text column; wiring one new `c.command()` call into `pm-phase2.js`
immediately after the existing `wb-render.js` call; surfacing the new artifact's path in the Gate
2 payload.

Out of scope: Tech-Spec participation in the matrix (Phase B/D of the broader initiative); any
change to Requirements/Tech-Spec generation itself; any new Gate 2 pass/fail condition; a JSON
sibling artifact; a dedicated UC↔US-only view.

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| `pm-phase2` workflow (coordinator) | Dispatches the new `ac-task-matrix.js` step and surfaces its output in the Gate 2 payload |
| `ac-task-matrix.js` | The new script computing and rendering the matrix |
| `wb-graph-checks.js` / `wbs-assembler.js` | Existing modules this feature reuses (the former extended additively, the latter unmodified) |

## 2. Use Cases

| UC ID | Title | Actor | Priority | File |
|---|---|---|---|---|
| UC-01 | Parse the Requirements Acceptance Criteria Table (with Criterion Text) | `ac-task-matrix.js`, via `wb-graph-checks.js`'s `parseAcTable` | Must | [use-cases/UC-01.md](use-cases/UC-01.md) |
| UC-02 | Compute AC↔Task↔Phase Coverage and Render the Matrix | `ac-task-matrix.js` | Must | [use-cases/UC-02.md](use-cases/UC-02.md) |
| UC-03 | Wire Matrix Generation into pm-phase2.js's Gate 2 Flow | Coordinator (`pm-phase2.js`) | Must | [use-cases/UC-03.md](use-cases/UC-03.md) |

> **Legend:** **UC ID** — unique identifier, referenced from Business Rules' `Applies to` and
> Acceptance Criteria's `Related UC` columns. **Title** — short label; full flow is in the linked
> file. **Actor** — who/what initiates or participates. **Priority** — MoSCoW; drives downstream
> Must-coverage checks. **File** — this UC's own detail file.

## 3. Business Rules

| ID | Rule | Applies to |
|---|---|---|
| BR-01 | `ac-task-matrix.js` never re-validates AC coverage — it assumes `wb-validate.js`'s checks 19–21 already passed, and only renders what they already computed | UC-02 |
| BR-02 | The matrix is never a new Gate 2 blocking condition; its generation step either produces a complete file or the same class of structured abort `parseAcTable`/`loadWorkBreakdown` already raise for a malformed upstream input | UC-02, UC-03 |
| BR-03 | `parseAcTable`'s extension to capture `Criterion` text is additive only — no existing field is removed, renamed, or reinterpreted | UC-01 |
| BR-04 | The matrix works identically for the split `wbs/` directory format and a legacy single-JSON Work Breakdown, via the unmodified `loadWorkBreakdown` | UC-02 |

> **Legend:** **ID** — unique identifier. **Rule** — the constraint itself. **Applies to** —
> which UC(s) this rule constrains, or "All UCs" if universal.

## 4. Data Requirements

`{PREFIX}-AC-Task-Matrix.md`: one Markdown table (AC ID, Criterion, Priority, Related UC,
covering Task ID(s), covering Phase(s)) in Requirements AC-table row order, followed by a legend —
see Tech-Spec for the exact rendering rules (multi-value cell formatting, unscoped-AC handling).

`acMap` entries (`wb-graph-checks.js`, extended): `{ id, criterion, priority,
allowedUserStories, unscoped }` — `criterion` is the only new field.

## 5. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | No new LLM/agent call is introduced — the entire feature is deterministic script logic |
| NFR-02 | `checkAcCoverage`'s three existing checks (19–21) produce byte-identical results before and after `parseAcTable`'s extension |
| NFR-03 | Matrix generation never introduces a new reason for Gate 2 to be blocked |

> **Legend:** **ID** — unique identifier. **Requirement** — a property/constraint the whole
> feature must satisfy; feature-wide by nature, so (unlike Business Rules/AC) there is no
> `Applies to`/`Related UC` column.

## 6. UI Requirements

N/A — internal/technical feature; no UI surface is introduced or changed.

## 7. Acceptance Criteria

| ID | Criterion | Related UC | Priority |
|---|---|---|---|
| AC-01 | Given a feature has passed `wb-validate.js`'s checks (Gate-2-eligible Work Breakdown + Requirements), when `pm-phase2.js` runs, then `{PREFIX}-AC-Task-Matrix.md` is generated containing one row per AC, in the Requirements AC table's own order | UC-02 | Must |
| AC-02 | Given an AC is cited by one or more tasks' `acceptanceCriteria` field, when the matrix is generated, then that AC's row lists every covering task ID and every distinct phase those tasks belong to | UC-02 | Must |
| AC-03 | Given an AC is cited by zero tasks and is not `Must` priority, when the matrix is generated, then that AC's row has an empty "Covering Task(s)" cell and generation does not fail | UC-02 | Must |
| AC-04 | Given a legacy feature's Work Breakdown is a single JSON file (not a `wbs/` directory), when `pm-phase2.js` runs, then the matrix generates identically via the existing `loadWorkBreakdown` loader, with no feature-specific branching | UC-02 | Must |
| AC-05 | Given `wb-validate.js`, `wb-render.js`, `wbs-assembler.js`, `wb-graph-checks.js`'s existing exported check functions, and Gate 2's pass/fail semantics, when this feature is implemented, then none of their existing behavior changes | All UCs | Must |
| AC-06 | Given all changes are delivered, when `npm test` runs, then all tests pass: matrix rendering against a real multi-AC fixture, the unscoped/zero-coverage/legacy-JSON edge cases, and a `parseAcTable` regression test confirming its existing three-field contract is unchanged for every existing caller | All UCs | Must |

> **Legend:** **ID** — unique identifier; the anchor used across the whole
> feature.md↔req↔spec↔Work-Breakdown traceability chain. **Criterion** — a testable
> Given/When/Then statement. **Related UC** — which UC(s) this AC belongs to, or "All UCs".
> **Priority** — MoSCoW; every Must AC must be covered by ≥1 WB task.

## 8. Dependencies and Assumptions

- FTR-014 (available): `wb-validate.js`'s checks 19–21 / `checkAcCoverage` are the authoritative,
  already-enforced source of AC↔Task coverage correctness.
- FTR-020 (available): `wbs-assembler.js`'s `loadWorkBreakdown` is the single loader for both
  split and legacy Work Breakdown input; reused unmodified.
- FTR-021 (available): confirms `{PREFIX}-Requirements.md`'s final assembled shape (including its
  AC table) is unaffected by whether Requirements was generated via the split or legacy path —
  `ac-task-matrix.js` only ever reads the assembled document.
- `npm test` is the only verification command; no separate build step exists.

## 9. Open Questions

Both Open Questions raised in `feature.md` have been resolved by the Tech Spec (§2) — none remain
open at this stage.

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| (none remaining) | — | — | — |

---

## Traceability

This document is the middle link in a three-stage chain: `feature.md` (approved at Gate 1) →
`req/` (this document) → Tech-Spec. Tech-Spec has already resolved both Open Questions this
document's feature.md left pending (parseAcTable extension strategy; rendered column/cell
format) — see `FTR-022-Tech-Spec.md` §2.

## What moved out of this file, and why

Only §2 (Use Cases) split into one file per item — everything else (§1, §3, §4, §5, §6, §7, §8, §9)
stayed here, unsplit, for the same reasons established in FTR-020/021's own worked examples and
real implementations: Business Rules reference multiple UCs each (BR-02 applies to UC-02 and
UC-03), the Acceptance Criteria table's `Related UC` column is the same cross-cutting pattern,
and Data Requirements/NFRs/Dependencies are feature-wide by nature. This feature has only 3 UCs
total — proportionally small — but the splitting principle applies identically regardless of
feature size.
