# FTR-021 — Functional Requirements

## 1. Purpose and scope

Replace the single-turn, single-file generation of `{PREFIX}-Requirements.md` with a two-pass
generation (one skeleton call, one call per use case) writing a directory-based format
(`req/index.md` + `req/use-cases/{UC-ID}.md`), and give `pm-phase1.js` a loader/renderer that
assembles `{PREFIX}-Requirements.md` from the new directory layout — in the exact 9-section shape
`gaia-generate-requirements` already produces today — so downstream consumers are unaffected.

In scope: `pm-phase1.js` orchestration of skeleton + per-UC generation with resume-by-existence;
the new directory format; the assembler/loader; a new structural self-consistency pre-check
applied to the skeleton before per-UC dispatch.

Out of scope: `gaia-generate-tech-spec`, `gaia-validate-feature-docs`, `gaia-generate-work-breakdown`,
`lib/workflow-control.js`'s `worker()` contract, migration of existing legacy features, parallel
per-UC dispatch, the feature.md↔req↔spec coverage/traceability check (separate future feature,
tracked in `internal_docs/ideas/requirements-techspec-split-and-traceability-matrix.md`), and
Tech-Spec split generation (separate future feature).

Actors: deterministic `pm-phase1` workflow (coordinator), skeleton-generation agent, per-use-case
detail-generation agent, existing `gaia-generate-tech-spec`/`gaia-validate-feature-docs` (unmodified).

## 2. Use Cases

### UC-01: Generate Requirements Skeleton

| Field | Value |
|---|---|
| Actor | Coordinator and skeleton-generation agent |
| Priority | Must |
| Preconditions | `feature.md` exists and is readable |
| Trigger | `pm-phase1` enters Requirements generation |

One `c.worker()` call (no declared output — the coordinator writes the result itself, mirroring
FTR-020's skeleton step) returns `req/index.md`'s full content: Section 1 (Introduction:
Purpose/Scope/Actors), Section 2's use-case index table only (UC ID, Title, Actor, Priority,
File — no flow body), Section 3 (Business Rules), Section 4 (Data Requirements), Section 5
(NFRs), Section 6 (UI Requirements), Section 7 (Acceptance Criteria — every AC with its final
`Related UC` assignment), Section 8 (Dependencies and Assumptions), Section 9 (Open Questions).
The coordinator writes the response to `req/index.md`.

### UC-02: Validate Skeleton Structurally Before Per-UC Dispatch

| Field | Value |
|---|---|
| Actor | Coordinator |
| Priority | Must |
| Preconditions | `req/index.md` written |
| Trigger | After UC-01 |

Before any per-UC call is dispatched, the coordinator runs a self-consistency check against
`index.md`'s own use-case table: unique UC IDs, well-formed UC ID pattern, every `Related UC`
reference in the AC table and every `Applies to` reference in the Business Rules table pointing
at a UC ID that exists in the table, and table↔directory parity (every table row will get a file,
no orphan file is expected). A skeleton that fails is rejected; `pm-phase1` reports the failure
and does not proceed to UC-03. This is a structural integrity check on `req/` alone — it is not
the feature.md↔req coverage/traceability check (separate, future feature).

### UC-03: Generate One Use Case's Detail

| Field | Value |
|---|---|
| Actor | Coordinator and per-use-case detail-generation agent |
| Priority | Must |
| Preconditions | Skeleton passed UC-02; `req/use-cases/{UC-ID}.md` does not yet exist |
| Trigger | Coordinator iterates the skeleton's use-case index table |

For each UC whose detail file does not yet exist, one `c.worker()` call receives that UC's
index-table row (ID, title, actor, priority) and the compact full use-case index (ID + title +
actor only, for every other UC) as shared context, plus `feature.md`. The agent returns that UC's
detail: the field table (Actor, Preconditions, Trigger, Priority) plus Main flow / Alternative
flows / Error flows / Postconditions — exactly the structure `gaia-generate-requirements` already
produces today inside Section 2. The coordinator writes it to `req/use-cases/{UC-ID}.md`.

### UC-04: Resume Partial Generation

| Field | Value |
|---|---|
| Actor | Coordinator |
| Priority | Must |
| Preconditions | `req/index.md` exists from a prior, incomplete `pm-phase1` run |
| Trigger | `pm-phase1` is re-run for the same feature |

The coordinator reads the existing `index.md` use-case table and dispatches UC-03 only for UC IDs
whose `req/use-cases/{UC-ID}.md` does not already exist. A UC whose file already exists is
treated as done and is never regenerated or overwritten — there is no separate `status` field to
consult (see §4, Data Requirements, and Open Question 1 in `feature.md`).

### UC-05: Assemble Unchanged

| Field | Value |
|---|---|
| Actor | Coordinator |
| Priority | Must |
| Preconditions | All UC files present |
| Trigger | After UC-03/UC-04 complete |

A new loader/renderer reads `index.md` and every `use-cases/*.md` file (or, for a legacy feature
with no `req/` directory, the single existing `{PREFIX}-Requirements.md`), and reconstructs
`{PREFIX}-Requirements.md`'s 9 sections in order — Section 2 built by concatenating each UC
file's content under its own `### UC-XX: ...` heading, in index-table order. `pm-phase1.js`'s
existing `assertCompleteSections`, `docsDigest` computation, Tech-Spec generation, and the
3-cycle `gaia-validate-feature-docs` loop then run with no change to their own logic.

## 3. Business Rules

| ID | Rule | Applies to |
|---|---|---|
| BR-01 | The skeleton call fixes UC IDs, titles, actors, priorities, and every AC's `Related UC` assignment once; no later call may introduce a new UC ID or change these fields | UC-01, UC-03 |
| BR-02 | No per-UC call is dispatched until the skeleton passes its structural self-consistency check | UC-01, UC-02 |
| BR-03 | A UC is considered done when its detail file exists and parses successfully — there is no separate `status` field | UC-03, UC-04 |
| BR-04 | Resume never regenerates a UC whose detail file already exists | UC-04 |
| BR-05 | The assembler reconstructs the exact 9-section `{PREFIX}-Requirements.md` shape whether the input is the split format or (for a legacy feature) the existing monolithic file | UC-05 |
| BR-06 | `gaia-generate-tech-spec`, `gaia-validate-feature-docs`, and `gaia-generate-work-breakdown` are not modified by this feature | All UCs |
| BR-07 | `lib/workflow-control.js`'s `worker()` contract is not modified | All UCs |
| BR-08 | Missing or malformed `index.md` or a referenced UC file aborts with a structured error before Tech-Spec generation proceeds | UC-05 |

## 4. Data Requirements

`req/index.md`: Markdown (not JSON — there is no dependency graph here the way FTR-020's
`wbs/index.json` had to encode). Holds Sections 1, 3, 4, 5, 6, 7, 8, 9 of today's single document
plus Section 2's use-case index table (`UC ID | Title | Actor | Priority | File`). This table is
the authoritative list of UC IDs that must exist.

`req/use-cases/{UC-ID}.md`: exactly the use-case content already rendered today inside
`{PREFIX}-Requirements.md`'s Section 2 for one use case (field table + Main flow / Alternative
flows / Error flows / Postconditions) — no new format introduced.

No separate resume-status file: a UC's presence on disk, successfully parsed, is both necessary
and sufficient to mark it done (see UC-04, BR-03).

## 5. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | A single failed per-UC call does not require regenerating any other UC |
| NFR-02 | The assembler produces a `{PREFIX}-Requirements.md` structurally equivalent (same 9 sections, same per-UC content) to what an equivalent single-call generation would have produced |
| NFR-03 | No change to `gaia-generate-tech-spec`, `gaia-validate-feature-docs`, `gaia-generate-work-breakdown`, or `lib/workflow-control.js`'s `worker()` contract |
| NFR-04 | Structural self-consistency checks run against the skeleton before any per-UC token is spent |
| NFR-05 | Errors from the assembler identify the specific missing or malformed file |

## 6. Acceptance Criteria

See `feature.md` AC-01 through AC-08 — unchanged and carried verbatim as this feature's
authoritative acceptance criteria table (not duplicated here to avoid drift between the two
documents).

## 7. Dependencies and Assumptions

- FTR-020 (available, implemented on `develop`): proved the skeleton+per-item generation split
  architecture and the `require.main === module` CLI-mode pattern for scripts invoked via
  `c.command(['run-asset', ...])` — necessary here too, since `pm-phase1.js` runs on the same
  `lib/workflow-runner.js` sandboxed-`AsyncFunction` runtime (no `require()` in scope) FTR-020
  discovered for `pm-phase2.js`.
- `pm-phase1.js`'s existing `assertCompleteSections` (9-section truncation check), `docsDigest`
  computation, and 3-cycle `gaia-validate-feature-docs` loop are the baseline this feature must
  not break.
- `gaia-generate-tech-spec`, `gaia-validate-feature-docs`, and `gaia-generate-work-breakdown` all
  read `{PREFIX}-Requirements.md` only; not touched by this feature.
- `lib/workflow-control.js`'s `worker()` one-output-per-call contract is fixed.
- `npm test` is the only verification command; no separate build step exists.
- Open Questions 1, 2, and 3 from `feature.md` (resume-tracking sufficiency, self-consistency
  check module boundary, assembler module boundary) must be closed by the Tech Spec before
  Gate 1.
