# FTR-026 — Functional Requirements (Index)

## 1. Introduction

### 1.1 Purpose

Remove `pm-phase2.js`'s automatic `bridge-requirements-tech-spec` step (added by FTR-025 as a
transitional shim) by making every one of its own downstream consumers — scripts and agents alike —
read the split `req/`/`spec/` sources directly, instead of the assembled
`{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` files. This completes FTR-025's intent: the
assembled monolithic view becomes purely an optional, on-demand user action (`assemble-docs.js`),
never an automatic side effect or load-bearing input anywhere in the pipeline, and removes the
single largest structural token-cost offender in the pipeline — the per-task detail worker's full
Tech-Spec inline.

### 1.2 Scope

In scope: `pm-phase2.js`'s Gate 1 digest re-check; its `wb-skeleton-check.js`/`wb-validate.js`/
`ac-task-matrix.js` call sites; `gaia-validate-work-breakdown-semantic.md`'s and
`gaia-generate-work-breakdown.md`'s Requirements/Tech-Spec reading contracts; the per-task detail
worker's Tech-Spec consumption (`buildTaskPrompt`/`gaia-generate-work-breakdown-task.md`); deletion
of the now-dead `bridge-requirements-tech-spec` activity.

Out of scope: `assemble-docs.js`/`/assemble-docs` itself (unchanged); `pm-phase3`/task-executor and
`gaia-developer-backend/frontend/testing.md`'s own Tech-Spec consumption during implementation;
migrating pre-existing legacy monolithic-only features to the split format; any change to
`docsDigest`'s hash algorithm, Gate 1/Gate 2 approval mechanics, or `parseAcTable`/
`parseFileInventoryEntries`'s own parsing logic.

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| `pm-phase2` workflow (coordinator) | Repoints its own deterministic gates/checks at split sources; no longer writes an assembled file |
| `gaia-validate-work-breakdown-semantic` (modified) | Reads `req/index.md` directly, not the assembled Requirements file |
| `gaia-generate-work-breakdown` (modified) | Reads `req/index.md`+`spec/index.md` as primary entry points, drilling into per-item files as needed |
| `gaia-generate-work-breakdown-task` (modified) | Obtains only the Tech-Spec content relevant to its own task, never the entire assembled spec |

## 2. Use Cases

### UC-01: Repoint Deterministic Gates and Script Checks to Split Sources

| Field | Value |
|---|---|
| Actor | `pm-phase2` coordinator |
| Priority | Must |
| Preconditions | A feature has `req/index.md`/`spec/index.md` (real split sources); Gate 1 is approved |
| Trigger | `pm-phase2.js` runs (fresh or resumed) |

> **Legend:** **Actor** — who/what initiates or participates in this use case. **Priority** —
> MoSCoW (Must/Should/Could). **Preconditions** — what must already be true before this use case
> can start. **Trigger** — the event that starts it.

Covers every call site in `pm-phase2.js` whose only need from the assembled file is something
already proven split-source-safe — no agent, no prompt, purely deterministic path arguments.

1. **Gate 1 digest re-check.** Today's `c.hash(c.read(file('Requirements.md')) + '\u0000' +
   c.read(file('Tech-Spec.md')))` is replaced with the same two `req-assembler.js`/
   `tech-spec-assembler.js` subprocess calls `pm-phase1.js` already makes to produce its own
   `docsDigest`, run here in-memory, never written to disk. The resulting digest must still match
   the one computed by `pm-phase1.js` at approval time for an unchanged `req/`/`spec/` — it is the
   same deterministic computation, just not persisted.
2. **`wb-skeleton-check.js` and `wb-validate.js`.** Both currently receive `file('Requirements.md')`
   as their Requirements argument, used by only one call: `wb-graph-checks.js`'s `parseAcTable()`.
   That function already parses `req/index.md` directly without modification (proven by
   `tech-spec-ac-check`'s own FTR-025 repointing) — only the call-site argument changes to
   `reqIndexPath`.
3. **`ac-task-matrix.js`.** Currently receives `file('Requirements.md')`/`file('Tech-Spec.md')`.
   Both of its own parsers (`parseAcTable()`, `tech-spec-graph-checks.js`'s
   `parseFileInventoryEntries()`) read the Addresses column positionally (3rd cell), which is
   identical in both the split index's 5-column Components table and the assembled file's
   3-column shape — the call-site arguments change to `reqIndexPath`/`specIndexPath`, with zero
   change to either parser. `ac-task-matrix.js` itself also changes its own output (BR-09, AC-10):
   instead of one loose `{PREFIX}-AC-Task-Matrix.md` at the feature root (whose location would
   otherwise silently move once its Requirements argument becomes `reqIndexPath`, since today's
   output path is derived from `path.dirname(requirementsPath)`), it writes a dedicated
   `coverage-matrix/` subfolder under an explicitly-given feature directory, containing both
   `index.json` (the full AC↔Task↔Phase↔Tech-Spec-file relation data, machine-readable) and
   `index.md` (a human-readable rendering with summary add-ons the bare table didn't have).
4. A legacy feature (monolithic files only, no `req/`/`spec/`) is unaffected: each of the three call
   sites above falls back to reading the existing monolithic file directly, exactly as before this
   feature.

**Related Business Rules:** BR-01, BR-02, BR-03, BR-07, BR-08, BR-09

**Related Acceptance Criteria:** AC-01, AC-02, AC-03, AC-07, AC-08, AC-09, AC-10

### UC-02: Validate Work Breakdown Semantics Against the Split Requirements Index

| Field | Value |
|---|---|
| Actor | `gaia-validate-work-breakdown-semantic` |
| Priority | Must |
| Preconditions | A feature has `req/index.md` (real split source); a Work Breakdown skeleton/detail set exists under `wbs/` |
| Trigger | `pm-phase2.js` dispatches the semantic Work Breakdown validator worker |

> **Legend:** **Actor** — who/what initiates or participates in this use case. **Priority** —
> MoSCoW (Must/Should/Could). **Preconditions** — what must already be true before this use case
> can start. **Trigger** — the event that starts it.

Today, `pm-phase2.js` dispatches this worker with a prompt that is just two file paths
(`` `${wbsDir}\n${file('Requirements.md')}` ``); the agent itself Reads `{PREFIX}-Requirements.md`
fully from disk via its own Read tool before producing a verdict. This use case repoints that read.

1. `gaia-validate-work-breakdown-semantic.md`'s own instructions are rewritten: wherever it currently
   says to Read `{PREFIX}-Requirements.md` for "User Story descriptions and Acceptance Criteria
   text", it instead Reads `req/index.md` — the same content (the Use Cases table, Business Rules
   table, and Acceptance Criteria table) already lives there untouched by the per-UC split
   (FTR-021).
2. `pm-phase2.js`'s own dispatch call changes its prompt from pointing at `file('Requirements.md')`
   to pointing at `reqIndexPath` — a one-line change; the worker call's shape (two newline-joined
   paths) is otherwise unchanged.
3. If the agent's own validation logic needs a specific UC's full flow text (not just the index's
   summary tables), it Reads the corresponding `req/use-cases/{UC-ID}.md` file directly — it already
   has Read/Glob/Grep tool access, so no new tool grant is needed.
4. A legacy feature (monolithic file only, no `req/`) falls back to `pm-phase2.js` passing the
   existing `{PREFIX}-Requirements.md` path, unchanged from today.

**Related Business Rules:** BR-03, BR-07, BR-08

**Related Acceptance Criteria:** AC-01, AC-04, AC-07, AC-08, AC-09

### UC-03: Generate the Work Breakdown Skeleton From Split Sources

| Field | Value |
|---|---|
| Actor | `gaia-generate-work-breakdown` |
| Priority | Must |
| Preconditions | A feature has `req/index.md`+`spec/index.md` (real split sources); Gate 1 is approved |
| Trigger | `pm-phase2.js` dispatches the Work Breakdown skeleton-generation worker (no `wbs/index.json` yet) |

> **Legend:** **Actor** — who/what initiates or participates in this use case. **Priority** —
> MoSCoW (Must/Should/Could). **Preconditions** — what must already be true before this use case
> can start. **Trigger** — the event that starts it.

Today, this agent's Step 1 mandates reading both `{PREFIX}-Requirements.md` and
`{PREFIX}-Tech-Spec.md` fully. This is the one call in the whole pipeline that plausibly needs the
broadest context (it builds the entire phase/task graph), so this use case does not try to starve it
of information — it changes *how* that information is obtained, from one mandatory full-file read
to a targeted, self-directed one.

1. `gaia-generate-work-breakdown.md`'s Step 1 is rewritten: it Reads `req/index.md` and
   `spec/index.md` first — both are small, authoritative summary documents (Use Cases/Business
   Rules/Acceptance Criteria tables; the Components table with Domain/Addresses/Spec routing).
2. For any phase/task decision that needs a UC's full flow text or a component's full
   Change/Algorithm/Tests detail beyond what the index tables summarize, the agent uses its existing
   Glob/Grep/Read tool access to open the specific `req/use-cases/{UC-ID}.md` or
   `spec/components/{file-slug}.md` file it actually needs — never a blanket read of every per-item
   file "just in case".
3. If the agent cannot determine which per-item files are relevant to a given phase from the index
   alone, it falls back to reading every file under `req/use-cases/`/`spec/components/` rather than
   proceeding with incomplete context (BR-04) — this is an explicit fallback, not the common path.
4. A legacy feature (monolithic files only, no `req/`/`spec/`) is unaffected: the agent Reads the
   existing `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` files exactly as today.

**Related Business Rules:** BR-03, BR-04, BR-07, BR-08

**Related Acceptance Criteria:** AC-01, AC-05, AC-07, AC-08, AC-09

### UC-04: Slice Tech-Spec Content for Per-Task Detail Generation

| Field | Value |
|---|---|
| Actor | `gaia-generate-work-breakdown-task` |
| Priority | Must |
| Preconditions | A Work Breakdown skeleton exists (`wbs/index.json`); a feature has `spec/index.md`+`spec/components/*.md` (real split source) |
| Trigger | `pm-phase2.js` dispatches the per-task detail-generation worker for a task whose status is not yet `generated` |

> **Legend:** **Actor** — who/what initiates or participates in this use case. **Priority** —
> MoSCoW (Must/Should/Could). **Preconditions** — what must already be true before this use case
> can start. **Trigger** — the event that starts it.

This is the feature's primary motivation. Today, `buildTaskPrompt()` inlines the **entire** assembled
Tech-Spec text into **every single task's** prompt — cost scales as
`task count × full Tech-Spec size`, the single largest structural token cost in the Work Breakdown
pipeline, and the most likely cause of a "prompt too long" failure on a large feature.

1. `buildTaskPrompt()` stops accepting/inlining a full Tech-Spec text argument. The per-task worker
   (`gaia-generate-work-breakdown-task.md`) is instead granted Read/Glob/Grep access to `spec/`
   (if it does not already have it) and told to read `spec/index.md` first — the small, authoritative
   Domain/Addresses/Spec routing table — to identify which component(s) are relevant to its own
   task.
2. The agent then Reads only the specific `spec/components/{file-slug}.md` file(s) it identified as
   relevant (by its own task's `domain` and/or the file paths implicated by its own
   `acceptanceCriteria`/`outcome`) — never the full component set.
3. If the agent's own lookup finds no clearly relevant component for its task (an edge case — e.g. a
   cross-cutting task with no single obvious file), it falls back to reading `spec/index.md`'s full
   Components table and uses its own judgment, rather than proceeding with zero Tech-Spec context at
   all (BR-05).
4. The task-skeleton-entry restatement and sibling-task-list sections of the prompt are otherwise
   unchanged (BR-06) — only the Tech-Spec-content portion of the prompt changes.
5. A legacy feature (monolithic file only, no `spec/`) falls back to the existing behavior: the full
   assembled Tech-Spec text is inlined into the prompt exactly as today.

**Related Business Rules:** BR-03, BR-05, BR-06, BR-07, BR-08

**Related Acceptance Criteria:** AC-01, AC-06, AC-07, AC-08, AC-09

## 3. Business Rules

| ID | Rule | Applies to |
|---|---|---|
| BR-01 | `wb-graph-checks.js`'s `parseAcTable()` and `tech-spec-graph-checks.js`'s `parseFileInventoryEntries()` are unmodified — only their callers' path arguments change, from an assembled file to the corresponding split index file | UC-01 |
| BR-02 | `pm-phase2.js`'s Gate 1 digest re-check recomputes the identical digest value in-memory from `req/`/`spec/`, with no file read of an assembled document | UC-01 |
| BR-03 | Each repointed call site (script or agent) preserves the legacy monolithic-file fallback for a feature with no `req/`/`spec/` directories — no assembly attempted, no error | All UCs |
| BR-04 | `gaia-generate-work-breakdown`'s targeted reads must not silently omit Requirements/Tech-Spec content relevant to a correct phase/task decision — a missing per-item file falls back to the index's own summary tables, never to proceeding with no context | UC-03 |
| BR-05 | The per-task Tech-Spec slicing mechanism never leaves a task's detail worker with zero Tech-Spec context — if its own targeted lookup finds nothing relevant, it falls back to `spec/index.md`'s full Components table | UC-04 |
| BR-06 | `gaia-generate-work-breakdown-task.md`'s task-skeleton-entry and sibling-task-list prompt content are unchanged by this feature — only its Tech-Spec consumption mechanism changes | UC-04 |
| BR-07 | Once UC-01 through UC-04 no longer depend on the assembled monolithic file, `pm-phase2.js`'s `bridge-requirements-tech-spec` activity is removed entirely — no automatic write of `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` occurs anywhere in the pipeline | All UCs |
| BR-08 | `assemble-docs.js`/`/assemble-docs`, `pm-phase3`/task-executor, and `gaia-developer-backend/frontend/testing.md` are not modified by this feature | All UCs |
| BR-09 | `ac-task-matrix.js` writes its output as two files inside a dedicated `coverage-matrix/` subfolder of the feature directory — `coverage-matrix/index.json` (machine-readable: the full AC↔Task↔Phase↔Tech-Spec-file relation data) and `coverage-matrix/index.md` (human-readable rendering, plus summary add-ons not in today's bare table) — never a single loose `{PREFIX}-AC-Task-Matrix.md` at the feature root | UC-01 |

> **Legend:** **ID** — unique identifier. **Rule** — the constraint itself. **Applies to** —
> which UC(s) this rule constrains, or "All UCs" if universal.

## 4. Data Requirements

One new on-disk artifact: `coverage-matrix/index.json`+`coverage-matrix/index.md` (BR-09), replacing
today's single `{PREFIX}-AC-Task-Matrix.md`. `req/index.md`/`req/use-cases/*.md` and `spec/index.md`/
`spec/components/*.md` (FTR-021/FTR-024) are themselves unchanged by this feature — only which call
sites read them directly, instead of an assembled intermediary, changes.

### 4.1 Entities

**`coverage-matrix/index.json`** — one JSON object: `{ prefix, generatedAt, acceptanceCriteria: [{ id,
criterion, priority, unscoped, relatedUCs, techSpecFiles, taskIds, phaseIds }] }`, one array entry per
Requirements Acceptance Criterion, in table order. Every field is already computed in-memory by
`ac-task-matrix.js`'s existing `computeCoverage`/`computeTechSpecCoverage`/`parseAcTable` — this is a
serialization of existing data, not a new computation.

### 4.2 Validation Rules

N/A — no new validation rule; existing `parseAcTable`/`parseFileInventoryEntries` validation is
reused unmodified. The JSON/MD pair is a rendering of already-validated data, never itself a
validation gate.

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Correctness | Must not loosen any existing freshness/staleness/digest correctness compared to today's assembled-file-based checks |
| NFR-02 | Performance | In-memory digest recomputation adds no LLM token cost — it is a deterministic subprocess call reusing the existing, unmodified assembler scripts |
| NFR-03 | Performance | The per-task Tech-Spec slicing mechanism must reduce per-task prompt token cost relative to today's full-Tech-Spec inline, for any feature whose `spec/` has more than one component |
| NFR-04 | Performance | `gaia-generate-work-breakdown`'s targeted-read approach must not increase its own total token cost versus today's single full-file reads, for the common case of a small-to-medium feature |

## 6. UI Requirements

N/A — internal/technical feature; no UI surface is introduced or changed.

## 7. Acceptance Criteria

| ID | Criterion | Related UC | Priority |
|---|---|---|---|
| AC-01 | Given a feature has real `req/`+`spec/` directories, when `pm-phase2` runs, then no `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` file is written by `pm-phase2.js` itself | All UCs | Must |
| AC-02 | Given `pm-phase2`'s Gate 1 digest re-check runs, when split sources are unchanged since Gate 1 approval, then it recomputes the identical digest value in-memory from `req/`/`spec/`, with no file read of an assembled document | UC-01 | Must |
| AC-03 | Given `wb-skeleton-check.js`/`wb-validate.js`/`ac-task-matrix.js` are invoked from `pm-phase2.js`, when they run, then each receives the split index file path(s) (`reqIndexPath`/`specIndexPath`); `wb-skeleton-check.js`/`wb-validate.js` need no code change, `ac-task-matrix.js` is told its output directory explicitly so its output location is unaffected | UC-01 | Must |
| AC-04 | Given `gaia-validate-work-breakdown-semantic` runs, when semantic Work Breakdown validation is dispatched, then it reads `req/index.md`, not `{PREFIX}-Requirements.md` | UC-02 | Must |
| AC-05 | Given `gaia-generate-work-breakdown` runs, when skeleton generation is dispatched, then it reads `req/index.md`+`spec/index.md` as primary entry points, drilling into specific per-item files only as needed, never mandated to Read either full assembled file | UC-03 | Must |
| AC-06 | Given a per-task detail worker runs for a given task, when `gaia-generate-work-breakdown-task` is dispatched, then it is not handed the entire assembled Tech-Spec text; it obtains only the Tech-Spec content relevant to its own task | UC-04 | Must |
| AC-07 | Given a legacy feature has monolithic files only, no `req/`/`spec/` directories, when any repointed call site (script or agent) runs, then it falls back to the existing monolithic file, unchanged from pre-FTR-026 behavior | All UCs | Must |
| AC-08 | Given a user wants a single combined document, when they run `/assemble-docs`, then behavior is unchanged from FTR-025 | All UCs | Must |
| AC-09 | Given all changes are delivered, when `npm test` runs, then all tests pass: the `bridge-requirements-tech-spec` step is removed, every repointed call site has a passing test for both the split-source and legacy-fallback paths, and a full-suite regression | All UCs | Must |
| AC-10 | Given `ac-task-matrix.js` runs, when it writes its output, then it writes both `coverage-matrix/index.json` (machine-readable relation data) and `coverage-matrix/index.md` (human-readable, with summary add-ons beyond the bare table) under the feature directory, not a single loose file at the feature root | UC-01 | Must |

> **Legend:** **ID** — unique identifier; the anchor used across the whole
> feature.md↔req↔spec↔Work-Breakdown traceability chain. **Criterion** — a testable
> Given/When/Then statement. **Related UC** — which UC(s) this AC belongs to, or "All UCs".
> **Priority** — MoSCoW; every Must AC must be covered by ≥1 WB task.

## 8. Dependencies and Assumptions

- FTR-020/FTR-021/FTR-024/FTR-025 (available): the split-generation architecture, assemblers, and
  the `bridge-requirements-tech-spec` step this feature removes, all reused/modified as described.
- `parseAcTable()` (`wb-graph-checks.js`) and `parseFileInventoryEntries()`
  (`tech-spec-graph-checks.js`) are already proven split-source-safe — this feature changes no code
  in either function, only callers' arguments.
- `npm test` is the only verification command; no separate build step exists.
- Open Questions 1–3 raised in `feature.md` (per-task Tech-Spec slicing mechanism, whether the Gate 1
  digest recomputation needs its own `c.activity()`, token-cost comparison for the skeleton agent's
  targeted reads) must be closed by the Tech Spec before Gate 1.

## 9. Open Questions

Open Questions 1–3 raised in `feature.md` are resolved by the Tech Spec — see
`FTR-026-Tech-Spec.md`'s Components for the exact decisions.

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| (none remaining) | — | — | — |

---

## Traceability

This document is the middle link in a three-stage chain: `feature.md` (approved at Gate 1) →
`req/` (this document) → Tech-Spec. Tech-Spec resolves all three Open Questions this document's
feature.md left pending — most importantly OQ-1, the per-task Tech-Spec slicing mechanism (UC-04),
which is this feature's primary motivation.

## What moved out of this file, and why

Only §2 (Use Cases) split into one file per item — everything else stayed here, unsplit, for the
same reasons established in every prior feature in this lineage: Business Rules reference multiple
UCs each, the Acceptance Criteria table's `Related UC` column is the same cross-cutting pattern, and
Data Requirements/NFRs/Dependencies are feature-wide by nature.
