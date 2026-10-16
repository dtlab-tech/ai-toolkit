# FTR-024 — Functional Requirements (Index)

## 1. Introduction

### 1.1 Purpose

Replace the single-turn, single-file generation of `{PREFIX}-Tech-Spec.md` with a two-pass
generation (one skeleton call, one call per component) writing a directory-based format
(`spec/index.md` + `spec/components/{fileSlug}.md`), assembled back into the unchanged
12-section document by a new `tech-spec-assembler.js`. This is Phase D of the
traceability-matrix initiative, completing the split-generation architecture across all three
planning documents.

### 1.2 Scope

In scope: `pm-phase1.js` orchestration of skeleton + per-component generation with
resume-by-existence; the new directory format; the assembler; reusing
`tech-spec-graph-checks.js`'s existing `parseFileInventoryEntries`/`checkAddressesResolve`
(unmodified, pointed at the skeleton) as the pre-dispatch structural check.

Out of scope: any change to `gaia-generate-work-breakdown`, `wb-validate.js`/`wb-render.js`/
`wbs-assembler.js`, `ac-task-matrix.js`, or `tech-spec-graph-checks.js`'s own exported functions;
migrating existing legacy monolithic Tech-Specs; a new generated coverage artifact beyond what
`ac-task-matrix.js` already produces; per-component generation parallelism.

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| `pm-phase1` workflow (coordinator) | Dispatches skeleton + per-component generation with resume-by-existence |
| `gaia-generate-tech-spec` (modified) | Produces the skeleton only |
| `gaia-generate-tech-spec-component` (new) | Produces one component's own detail |
| `tech-spec-graph-checks.js` (reused, unmodified) | Structural pre-check, now also pointed at the skeleton |
| `tech-spec-assembler.js` (new) | Reconstructs the assembled 12-section document |

## 2. Use Cases

### UC-01: Generate Tech-Spec Skeleton

| Field | Value |
|---|---|
| Actor | Coordinator and skeleton-generation agent |
| Priority | Must |
| Preconditions | `feature.md`, `{PREFIX}-Requirements.md` readable |
| Trigger | `pm-phase1` enters Tech-Spec generation |

One `c.worker()` call (no declared output — the coordinator writes the result itself) returns
`spec/index.md`'s full content: every feature-wide section (Overview, Architecture, Security
Considerations, Database Changes, Configuration, Implementation Order, Risks & Mitigations, any
Open Question resolution touching more than one component) plus a complete Components index
table — one row per file the feature creates or modifies, with `Path`, `Purpose-or-Change`,
`Addresses` (AC IDs), and `Spec` (link to that component's own detail file). No component's own
`Change`/`Algorithm`/`Schema`/`Tests` content is produced in this call.

**Related Business Rules:** BR-01, BR-02, BR-05 (see [index.md](../index.md#3-business-rules))

**Related Acceptance Criteria:** AC-01, AC-07, AC-08 (see [index.md](../index.md#7-acceptance-criteria))

### UC-02: Validate Skeleton Structurally Before Per-Component Dispatch

| Field | Value |
|---|---|
| Actor | Coordinator, `tech-spec-graph-checks.js` |
| Priority | Must |
| Preconditions | `spec/index.md` written |
| Trigger | After UC-01 |

Before any per-component call is dispatched, the coordinator runs `tech-spec-graph-checks.js`'s
existing `parseFileInventoryEntries`/`checkAddressesResolve` — unmodified — pointed at
`spec/index.md` instead of the assembled document. Since these functions only read Section 9's
two subtables, locating them via the same `## 9.` heading/`###` subsection convention, this works
against the skeleton exactly as it works against a fully assembled Tech-Spec today, as long as
`spec/index.md` preserves that exact heading/table shape. A skeleton whose Components table cites
a dangling AC ID is rejected; the coordinator reports the failure and does not proceed to UC-03.

**Related Business Rules:** BR-01, BR-02 (see [index.md](../index.md#3-business-rules))

**Related Acceptance Criteria:** AC-02 (see [index.md](../index.md#7-acceptance-criteria))

### UC-03: Generate One Component's Detail

| Field | Value |
|---|---|
| Actor | Coordinator and per-component detail-generation agent |
| Priority | Must |
| Preconditions | Skeleton passed UC-02; component's detail file does not yet exist |
| Trigger | Coordinator iterates the skeleton's Components index table |

For each component whose detail file does not yet exist, one `c.worker()` call receives that
component's index-table row (path, change type, `Addresses`) and the compact full component index
(path + change type only, for every other component — cross-component awareness, e.g. "does
another component already define this DTO?"), plus the relevant Requirements/feature.md excerpt.
The agent returns that component's detail: `Change` (what changes and why), whichever of the
monolithic template's Backend/Frontend/External-Integration subsections actually apply to this
one file (real code/schema, not prose), and `Tests` (the specific test file(s) and cases for this
component — every component gets its own `Tests` section, nothing stays centralized, per the
empirical finding from the FTR-020 worked example). The coordinator writes it to
`spec/components/{fileSlug}.md`.

**Related Business Rules:** BR-01, BR-03 (see [index.md](../index.md#3-business-rules))

**Related Acceptance Criteria:** AC-02 (see [index.md](../index.md#7-acceptance-criteria))

### UC-04: Resume Partial Generation

| Field | Value |
|---|---|
| Actor | Coordinator |
| Priority | Must |
| Preconditions | `spec/index.md` exists from a prior, incomplete `pm-phase1` run |
| Trigger | `pm-phase1` is re-run for the same feature |

The coordinator reads the existing `spec/index.md` Components table and dispatches UC-03 only for
components whose `spec/components/{fileSlug}.md` does not already exist. A component whose file
already exists is treated as done and is never regenerated or overwritten — there is no separate
`status` field to consult, mirroring FTR-021's own resolution for the same question (file
existence is both necessary and sufficient).

**Related Business Rules:** BR-03 (see [index.md](../index.md#3-business-rules))

**Related Acceptance Criteria:** AC-03 (see [index.md](../index.md#7-acceptance-criteria))

### UC-05: Assemble Unchanged

| Field | Value |
|---|---|
| Actor | Coordinator, `tech-spec-assembler.js` |
| Priority | Must |
| Preconditions | All components' detail files present |
| Trigger | After UC-03/UC-04 complete |

A new loader/renderer reads `spec/index.md` and every `components/*.md` file (or, for a legacy
feature with no `spec/` directory, the single existing `{PREFIX}-Tech-Spec.md`), and
reconstructs `{PREFIX}-Tech-Spec.md`'s 12 sections in order — Section 9 rebuilt from the
skeleton's own Components table (authoritative, restated — not re-derived — from each component
file, mirroring FTR-020's own OQ-03 "skeleton fields are authoritative" rule); Sections 3/4/5/10's
per-component content concatenated from each component file, in index-table order, under the
appropriate subsection heading. `pm-phase1.js`'s existing `assertCompleteSections`, `docsDigest`
computation, the 3-cycle validation loop, and FTR-023's `tech-spec-ac-check` then run with no
change to their own logic.

**Related Business Rules:** BR-04, BR-05, BR-06 (see [index.md](../index.md#3-business-rules))

**Related Acceptance Criteria:** AC-04, AC-05, AC-06, AC-07, AC-08 (see [index.md](../index.md#7-acceptance-criteria))

## 3. Business Rules

| ID | Rule | Applies to |
|---|---|---|
| BR-01 | The skeleton call fixes every component's path, change type, and `Addresses` AC list once; no later call may introduce a new component or change these fields | UC-01, UC-03 |
| BR-02 | No per-component call is dispatched until the skeleton passes its structural pre-check | UC-01, UC-02 |
| BR-03 | A component is considered done when its detail file exists and parses successfully — no separate `status` field, mirroring FTR-021's own resolution for the same question | UC-03, UC-04 |
| BR-04 | The assembler reconstructs the exact 12-section `{PREFIX}-Tech-Spec.md` shape whether the input is the split format or a legacy monolithic file | UC-05 |
| BR-05 | `gaia-generate-work-breakdown`, `wb-validate.js`/`wb-render.js`/`wbs-assembler.js`, `ac-task-matrix.js`, `tech-spec-graph-checks.js`'s own exported functions, and `lib/workflow-control.js`'s `worker()` are not modified by this feature, except one new call site pointed at a different path | All UCs |
| BR-06 | Missing or malformed `spec/index.md` or a referenced component file aborts with a structured error before the validation loop proceeds | UC-05 |

> **Legend:** **ID** — unique identifier. **Rule** — the constraint itself. **Applies to** —
> which UC(s) this rule constrains, or "All UCs" if universal.

## 4. Data Requirements

`spec/index.md`: Sections 1, 2, 6, 7, 8, 11, 12 of today's single document, plus Section 9's
Components index table (`Path | Purpose-or-Change | Addresses | Spec`).

`spec/components/{fileSlug}.md`: that component's own `Change` description, the relevant
Backend/Frontend/External-Integration subsection content, and its own `Tests` section.

No separate resume-status file: a component's presence on disk, successfully parsed, is both
necessary and sufficient to mark it done.

## 5. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | A single failed per-component call does not require regenerating any other component |
| NFR-02 | The assembler produces a `{PREFIX}-Tech-Spec.md` structurally equivalent to what an equivalent single-call generation would have produced |
| NFR-03 | No change to `gaia-generate-work-breakdown`, `wb-validate.js`/`wb-render.js`/`wbs-assembler.js`, `ac-task-matrix.js`, or `lib/workflow-control.js`'s `worker()` contract |
| NFR-04 | The structural pre-check runs against the skeleton before any per-component token is spent |
| NFR-05 | Errors from the assembler identify the specific missing or malformed file |

## 6. UI Requirements

N/A — internal/technical feature; no UI surface is introduced or changed.

## 7. Acceptance Criteria

| ID | Criterion | Related UC | Priority |
|---|---|---|---|
| AC-01 | Given a feature has `feature.md` and `{PREFIX}-Requirements.md`, when `pm-phase1` runs Tech-Spec generation, then a skeleton call produces `spec/index.md` containing every feature-wide section and a complete Components index table, with no per-component detail content inline | UC-01 | Must |
| AC-02 | Given `spec/index.md`'s Components table passes the reused structural pre-check, when `pm-phase1` runs, then exactly one `c.worker()` call is dispatched per component, in index-table order, each producing `spec/components/{fileSlug}.md` | UC-02, UC-03 | Must |
| AC-03 | Given a per-component call fails or times out, when `pm-phase1` is re-run, then only the failed component's call is retried; components already generated are not regenerated or overwritten | UC-04 | Must |
| AC-04 | Given every component's detail file exists and parses, when `tech-spec-assembler.js` runs, then it reconstructs `{PREFIX}-Tech-Spec.md` in the exact 12-section shape `gaia-generate-tech-spec` produces today | UC-05 | Must |
| AC-05 | Given `spec/index.md` or a referenced component file is missing or malformed, when the assembler runs, then it aborts with an explicit, structured error identifying the missing/malformed path, before the validation loop proceeds | UC-05 | Must |
| AC-06 | Given a legacy feature has a monolithic `{PREFIX}-Tech-Spec.md` with no `spec/` directory, when `pm-phase1` runs for that feature, then it is read exactly as today; no behavior change, no forced regeneration | UC-05 | Must |
| AC-07 | Given `gaia-generate-work-breakdown`, `wb-validate.js`/`wb-render.js`/`wbs-assembler.js`, `ac-task-matrix.js`, `tech-spec-graph-checks.js`'s exported functions, and `lib/workflow-control.js`'s `worker()`, when this feature is implemented, then none of these are modified, except `tech-spec-graph-checks.js`'s one new call site | All UCs | Must |
| AC-08 | Given all changes are delivered, when `npm test` runs, then all tests pass: skeleton/component parsing and assembly, resume-skip-existing-component logic, parity between split-format and legacy-single-file assembled output, and a `pm-phase1.js` regression confirming `assertCompleteSections`/`docsDigest`/`tech-spec-ac-check` all still pass against the assembled document | All UCs | Must |

> **Legend:** **ID** — unique identifier; the anchor used across the whole
> feature.md↔req↔spec↔Work-Breakdown traceability chain. **Criterion** — a testable
> Given/When/Then statement. **Related UC** — which UC(s) this AC belongs to, or "All UCs".
> **Priority** — MoSCoW; every Must AC must be covered by ≥1 WB task.

## 8. Dependencies and Assumptions

- FTR-020 (available): proved the skeleton+per-item split architecture; its own worked example
  (`spec/` in its feature folder) is this feature's primary design input.
- FTR-021 (available): `req-assembler.js`'s `findSectionRange`/`parseTableRows` (exported) are the
  direct template for `tech-spec-assembler.js`.
- FTR-022/FTR-023 (available): `ac-task-matrix.js` and `tech-spec-graph-checks.js` must keep
  working unmodified (or with only a new call-site path) against the assembled document.
- `lib/workflow-control.js`'s `worker()` one-output-per-call contract is fixed.
- `npm test` is the only verification command; no separate build step exists.
- Open Questions 1, 2, and 3 from `feature.md` (section-to-skeleton/component mapping against the
  real 12-section template; whether `tech-spec-graph-checks.js` needs any change to run against
  the skeleton; the file-slug naming convention) must be closed by the Tech Spec before Gate 1.

## 9. Open Questions

Both Open Questions raised in `feature.md` have been resolved by the Tech Spec (§2) — none remain
open at this stage.

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| (none remaining) | — | — | — |

---

## Traceability

This document is the middle link in a three-stage chain: `feature.md` (approved at Gate 1) →
`req/` (this document) → Tech-Spec. Tech-Spec has already resolved all three Open Questions this
document's feature.md left pending — see `FTR-024-Tech-Spec.md` §2.

## What moved out of this file, and why

Only §2 (Use Cases) split into one file per item — everything else stayed here, unsplit, for the
same reasons established in every prior feature in this lineage: Business Rules reference
multiple UCs each, the Acceptance Criteria table's `Related UC` column is the same cross-cutting
pattern, and Data Requirements/NFRs/Dependencies are feature-wide by nature.
