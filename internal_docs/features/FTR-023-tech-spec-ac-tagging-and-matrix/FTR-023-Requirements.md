# FTR-023 — Functional Requirements (Index)

## 1. Introduction

### 1.1 Purpose

Introduce an explicit AC-reference convention in `{PREFIX}-Tech-Spec.md`'s existing File
Inventory (§9) — every file row gains an `Addresses` column citing the Requirements Acceptance
Criteria it implements — validated by a new deterministic structural check, and extend
`ac-task-matrix.js` (FTR-022) to show that traceability, closing the Requirement → Tech-Spec →
Task chain.

### 1.2 Scope

In scope: `gaia-generate-tech-spec.md` template update (new `Addresses` column); a new
deterministic structural check verifying every `Addresses` reference resolves to a real
Requirements AC ID; `pm-phase1.js` wiring (the check runs immediately before
`gaia-validate-feature-docs`); extending `ac-task-matrix.js` with a new "Addressed by Tech-Spec
File(s)" column.

Out of scope: Tech-Spec split generation into per-component files (Phase D); semantic judgment of
whether a file's content actually implements the AC(s) it cites; requiring every file to cite at
least one AC (`—` remains valid); any change to `{PREFIX}-Requirements.md`'s AC table format or
FTR-021's split `req/` generation; retroactive tagging of existing Tech-Specs.

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| `pm-phase1` workflow (coordinator) | Dispatches the new structural pre-check immediately before `gaia-validate-feature-docs` |
| `gaia-generate-tech-spec` | Modified to tag File Inventory rows with `Addresses` |
| `ac-task-matrix.js` | Extended (FTR-022) to render the new traceability column |

## 2. Use Cases

### UC-01: Tag Tech-Spec File Inventory Rows with Addressed AC IDs

| Field | Value |
|---|---|
| Actor | `gaia-generate-tech-spec` |
| Priority | Must |
| Preconditions | `feature.md` and `{PREFIX}-Requirements.md` are readable |
| Trigger | `gaia-generate-tech-spec` is dispatched (initial generation or a `needsTechSpecFix` revision) |

The agent's §9 File Inventory template gains a third column, `Addresses`, on both the "New
files" and "Modified files" tables. For each file, the agent cites the comma-separated
Requirements AC ID(s) that file's content implements, or `—` if the file has no direct AC
traceability (e.g. a shared helper with no behavior of its own). This is instruction-only — no
change to any other section of the Tech-Spec template.

**Related Business Rules:** BR-01 (see [index.md](../index.md#3-business-rules))

**Related Acceptance Criteria:** AC-01, AC-06, AC-07 (see [index.md](../index.md#7-acceptance-criteria))

### UC-02: Validate Tech-Spec AC References Resolve

| Field | Value |
|---|---|
| Actor | Coordinator (`pm-phase1.js`) |
| Priority | Must |
| Preconditions | `{PREFIX}-Tech-Spec.md` and `{PREFIX}-Requirements.md` both exist |
| Trigger | Immediately before `pm-phase1.js` dispatches `gaia-validate-feature-docs` |

A new deterministic structural check parses §9's two File Inventory tables, collects every
`Addresses` cell's AC-ID references (skipping `—` cells), and confirms each resolves to a real AC
ID in `{PREFIX}-Requirements.md`'s AC table (via `wb-graph-checks.js`'s existing `parseAcTable`,
unmodified). A dangling reference fails this step — naming the specific file and AC ID — before
any `gaia-validate-feature-docs` token is spent validating a structurally broken document. This
check introduces no judgment about whether a file's content actually implements what it cites
(BR-03) — only that the ID exists.

**Related Business Rules:** BR-01, BR-02, BR-03, BR-04 (see [index.md](../index.md#3-business-rules))

**Related Acceptance Criteria:** AC-02, AC-03, AC-04, AC-06, AC-07 (see [index.md](../index.md#7-acceptance-criteria))

### UC-03: Extend the AC-Task Matrix with Tech-Spec Coverage

| Field | Value |
|---|---|
| Actor | `ac-task-matrix.js` |
| Priority | Must |
| Preconditions | A correctly-tagged `{PREFIX}-Tech-Spec.md` exists; UC-02 has already passed |
| Trigger | `ac-task-matrix.js` is invoked (unchanged trigger point: `pm-phase2.js`'s Gate 2 flow, FTR-022) |

`ac-task-matrix.js` gains a new function that reuses the same File-Inventory parsing UC-02's
structural check uses (BR-04 — never a second, independent parser) to build `acId ->
Set<filePath>`. `renderMatrix` gains one more column, "Addressed by Tech-Spec File(s)",
positioned between "Related UC" and "Covering Task(s)" — completing the Requirement → Tech-Spec
→ Task chain in a single row per AC. An AC with zero addressing files renders `—`, the same
convention FTR-022 already uses for zero-coverage tasks.

**Related Business Rules:** BR-02, BR-04 (see [index.md](../index.md#3-business-rules))

**Related Acceptance Criteria:** AC-05, AC-06, AC-07 (see [index.md](../index.md#7-acceptance-criteria))

## 3. Business Rules

| ID | Rule | Applies to |
|---|---|---|
| BR-01 | An `Addresses` cell of `—` is always valid — no file is required to cite an AC | UC-01, UC-02 |
| BR-02 | The structural pre-check (UC-02) never duplicates `wb-graph-checks.js`'s `parseAcTable` — it is the single authoritative source for which AC IDs exist | UC-02, UC-03 |
| BR-03 | The pre-check introduces no new Gate 1 blocking condition beyond "every `Addresses` reference resolves" — it never judges whether a file's content actually implements what it cites | UC-02 |
| BR-04 | The matrix extension (UC-03) reuses the same File-Inventory parsing the structural check (UC-02) uses — never a second, independent parser | UC-02, UC-03 |

> **Legend:** **ID** — unique identifier. **Rule** — the constraint itself. **Applies to** —
> which UC(s) this rule constrains, or "All UCs" if universal.

## 4. Data Requirements

`{PREFIX}-Tech-Spec.md` §9 File Inventory: both "New files" and "Modified files" tables gain a
third column, `Addresses` (comma-separated AC IDs, or `—`).

`{PREFIX}-AC-Task-Matrix.md`: gains one column, "Addressed by Tech-Spec File(s)", between
"Related UC" and "Covering Task(s)" — see Tech-Spec for the exact parser/render changes.

## 5. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | No new LLM/agent call is introduced beyond the existing `gaia-generate-tech-spec` dispatch — the structural check and the matrix extension are deterministic script logic |
| NFR-02 | The structural pre-check runs before `gaia-validate-feature-docs` is dispatched, so a structurally broken Tech-Spec never spends a semantic-validation turn |
| NFR-03 | A correctly-tagged Tech-Spec (including one where every row is `—`) passes the pre-check identically to a Tech-Spec with real AC references |

## 6. UI Requirements

N/A — internal/technical feature; no UI surface is introduced or changed.

## 7. Acceptance Criteria

| ID | Criterion | Related UC | Priority |
|---|---|---|---|
| AC-01 | Given a feature's Tech-Spec is (re)generated, when `gaia-generate-tech-spec` runs, then §9's two File Inventory tables each include an `Addresses` column, populated with real AC IDs or `—` | UC-01 | Must |
| AC-02 | Given every `Addresses` reference in a Tech-Spec resolves to a real Requirements AC ID, when `pm-phase1.js` runs its new structural pre-check, then the check passes and `gaia-validate-feature-docs` is dispatched as today | UC-02 | Must |
| AC-03 | Given at least one `Addresses` reference cites an AC ID absent from the Requirements AC table, when `pm-phase1.js` runs its new structural pre-check, then it fails before `gaia-validate-feature-docs` is dispatched, naming the specific file and dangling AC ID | UC-02 | Must |
| AC-04 | Given a file inventory row's `Addresses` cell is `—`, when the structural pre-check runs, then it passes — `—` is a valid value, not an error | UC-02 | Must |
| AC-05 | Given a feature has passed Gate 2 and has a correctly-tagged Tech-Spec, when `ac-task-matrix.js` runs, then the rendered matrix's new column lists every Tech-Spec file whose `Addresses` cites that AC, or `—` if none | UC-03 | Must |
| AC-06 | Given `wb-validate.js`, `wb-render.js`, `wbs-assembler.js`, `wb-graph-checks.js`'s existing exported functions, `req-assembler.js`/`req-skeleton-check.js`, and Gate 1/Gate 2's existing pass/fail semantics, when this feature is implemented, then none of their existing behavior changes | All UCs | Must |
| AC-07 | Given all changes are delivered, when `npm test` runs, then all tests pass: `Addresses`-column parsing, the dangling-reference structural check (clean/broken/`—`-only cases), the extended matrix column, and a `pm-phase1.js` integration test confirming the new pre-check runs before `gaia-validate-feature-docs` | All UCs | Must |

> **Legend:** **ID** — unique identifier; the anchor used across the whole
> feature.md↔req↔spec↔Work-Breakdown traceability chain. **Criterion** — a testable
> Given/When/Then statement. **Related UC** — which UC(s) this AC belongs to, or "All UCs".
> **Priority** — MoSCoW; every Must AC must be covered by ≥1 WB task.

## 8. Dependencies and Assumptions

- FTR-020 (available): `wbs-assembler.js`'s directory/legacy loader pattern; not touched by this
  feature.
- FTR-021 (available): `req-assembler.js`'s table-parsing conventions, reusable as a pattern for
  the new Tech-Spec File Inventory parser.
- FTR-022 (available): `wb-graph-checks.js`'s `parseAcTable` (unmodified) is the authoritative
  Requirements AC source; `ac-task-matrix.js`'s `computeCoverage`/`renderMatrix` are the functions
  this feature extends.
- Governance decision already recorded (the traceability-matrix idea doc): this kind of coverage
  check folds into existing gates (here, Gate 1) as a coverage-then-semantic two-stage
  validation; it does not become a new, separate gate.
- `npm test` is the only verification command; no separate build step exists.

## 9. Open Questions

Open Questions 1, 2, and 3 raised in `feature.md` (standalone-vs-shared check module;
table-parser reuse strategy; exact matrix-extension mechanism) have been resolved by the Tech
Spec (§2) — none remain open at this stage.

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| (none remaining) | — | — | — |

---

## Traceability

This document is the middle link in a three-stage chain: `feature.md` (approved at Gate 1) →
`req/` (this document) → Tech-Spec. Tech-Spec has already resolved all three Open Questions this
document's feature.md left pending — see `FTR-023-Tech-Spec.md` §2.

## What moved out of this file, and why

Only §2 (Use Cases) split into one file per item — everything else (§1, §3, §4, §5, §6, §7, §8, §9)
stayed here, unsplit, for the same reasons established in every prior feature in this lineage:
Business Rules reference multiple UCs each, the Acceptance Criteria table's `Related UC` column
is the same cross-cutting pattern, and Data Requirements/NFRs/Dependencies are feature-wide by
nature. This feature has only 3 UCs — proportionally small — but the splitting principle applies
identically regardless of feature size.
