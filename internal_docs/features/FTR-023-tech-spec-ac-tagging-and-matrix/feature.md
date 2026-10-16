# Tech-Spec AC Tagging and Coverage Matrix

## Feature ID
FTR-023

## Summary
Introduces an explicit AC-reference convention in `{PREFIX}-Tech-Spec.md`'s existing File
Inventory (§9): every new/modified file row gains an `Addresses` column citing the Requirements
Acceptance Criteria it implements. A new deterministic check verifies every such reference
resolves to a real AC ID (the same "structural check before semantic check" pattern
`wb-validate.js`→semantic-validator and `req-skeleton-check.js` already established), wired into
`pm-phase1.js`'s existing validation flow. `ac-task-matrix.js` (FTR-022) is extended with one more
column — "Addressed by Tech-Spec File(s)" — so the matrix finally closes the loop: Requirement →
Tech-Spec file → Work Breakdown task, all in one view. This is Phase B of the traceability-matrix
initiative (`internal_docs/ideas/requirements-techspec-split-and-traceability-matrix.md`),
following Phase A (FTR-022, AC↔Task only).

## Problem Statement
Today, nothing in `{PREFIX}-Tech-Spec.md` declares *which* Requirement(s) a given file or
component addresses — `gaia-validate-feature-docs`'s existing Tech-Spec coverage check only
verifies that *some* API endpoint/data-model/file-inventory entry exists for each `feature.md`
claim (semantic, LLM judgment), not that it is traceable back to a specific AC by ID. This means
FTR-022's AC↔Task matrix (Requirement → Task) and `feature.md`'s own AC table are the only two
ends of the traceability chain available today — Tech-Spec, the middle link, is invisible to it.
Without an explicit, ID-based tagging convention, closing that gap would require either semantic
re-reading of the whole Tech-Spec on every check (expensive, the problem this toolkit's whole
split/matrix lineage exists to avoid) or guessing from prose. The fix is the same one WB tasks
already have via `acceptanceCriteria`: an explicit, structurally-checkable field.

## Actors
N/A — internal/technical feature

## Core Flow (Happy Path)
This is an internal tooling change; the execution path is described below.

1. `gaia-generate-tech-spec` (modified) produces §9's File Inventory tables with one new column,
   `Addresses`, on both the "New files" and "Modified files" tables: a comma-separated list of
   Requirements AC IDs that file's content implements, or `—` for files with no direct AC
   traceability (e.g. a shared helper with no behavior of its own).
2. `pm-phase1.js`, immediately before dispatching `gaia-validate-feature-docs` (the existing
   semantic coverage check), runs a new deterministic structural pre-check: parse §9's two tables,
   collect every `Addresses` cell's AC-ID references, and confirm each resolves to a real AC ID in
   `{PREFIX}-Requirements.md`'s own AC table (reusing `wb-graph-checks.js`'s `parseAcTable`,
   unmodified — the same AC table FTR-022 already reads). A dangling reference fails this step
   before any further LLM-based validation is spent on a structurally broken document, mirroring
   `req-skeleton-check.js`'s role ahead of per-use-case generation.
3. `ac-task-matrix.js` (FTR-022) is extended: a new function builds `acId -> Set<filePath>` from
   §9's `Addresses` cells (same parse as step 2, reused not duplicated), and `renderMatrix` gains
   one more column, "Addressed by Tech-Spec File(s)", positioned between "Related UC" and
   "Covering Task(s)" — completing the Requirement → Tech-Spec → Task chain in one row per AC.
4. Gate 1 is otherwise unaffected: a Tech-Spec with no dangling `Addresses` reference (including
   one where every row is `—`) passes this step identically to today, with no new blocking
   condition for a correctly-tagged document.

## Out of Scope
- Tech-Spec split generation into per-component files (Phase D) — this feature only adds a
  tagging *column* to the existing monolithic §9 tables; it does not split Tech-Spec itself.
- Semantic judgment of whether a file's content actually, correctly implements the AC(s) it cites
  — this feature is a structural (ID-resolves-to-a-real-AC) check only, the same scope boundary
  `wb-validate.js`'s checks 19–21 already draw for WB tasks' own `acceptanceCriteria` field.
- Requiring every file to cite at least one AC — `—` (no direct traceability) remains a valid,
  unflagged value, matching how WB's own INFRA/shared-setup tasks are allowed an empty
  `acceptanceCriteria` list today.
- Any change to `{PREFIX}-Requirements.md`'s own AC table format or FTR-021's split `req/`
  generation — this feature only reads the existing AC table, unmodified.
- Migrating existing (pre-this-feature) Tech-Spec documents to add `Addresses` columns
  retroactively — only newly (re)generated Tech-Specs get the new column.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| A file inventory row's `Addresses` cell is `—` | Valid, not an error — no AC traceability claimed for that file |
| A file inventory row's `Addresses` cell cites an AC ID absent from the Requirements AC table | The new structural pre-check fails before `gaia-validate-feature-docs` is dispatched, naming the specific file and the dangling AC ID |
| `{PREFIX}-Tech-Spec.md`'s §9 File Inventory section or one of its two tables is missing | The pre-check aborts with a structured error identifying the missing section/table — same class of error `req-skeleton-check.js`/`parseAcTable` already raise for an analogous gap |
| `{PREFIX}-Requirements.md` has no AC table (or is missing) | The pre-check aborts the same way `parseAcTable` already does for this case today |
| The matrix's new "Addressed by Tech-Spec File(s)" column has zero files for an AC | Renders `—`, same convention as an empty "Covering Task(s)" cell (FTR-022) |
| A needsTechSpecFix validation-loop re-run regenerates Tech-Spec | The structural pre-check re-runs against the newly regenerated document before the next `gaia-validate-feature-docs` cycle, exactly like today's existing checks re-run on every cycle |

## Data Model
N/A — internal/technical feature

### `{PREFIX}-Tech-Spec.md` §9 File Inventory (extended)

```markdown
### New files
| Path | Purpose | Addresses |
|------|---------|-----------|
| ... | ... | AC-01, AC-03 |

### Modified files
| Path | Change description | Addresses |
|------|-------------------|-----------|
| ... | ... | — |
```

### `{PREFIX}-AC-Task-Matrix.md` (extended, FTR-022's own format)

Gains one column between "Related UC" and "Covering Task(s)": "Addressed by Tech-Spec File(s)" —
see Tech-Spec for the exact parser/render changes.

## Roles and Permissions
N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A feature's Tech-Spec is (re)generated | `gaia-generate-tech-spec` runs | §9's two File Inventory tables each include an `Addresses` column, populated with real AC IDs or `—` | Must |
| AC-02 | Every `Addresses` reference in a Tech-Spec resolves to a real Requirements AC ID | `pm-phase1.js` runs its new structural pre-check | The check passes and `gaia-validate-feature-docs` is dispatched as today | Must |
| AC-03 | At least one `Addresses` reference cites an AC ID absent from the Requirements AC table | `pm-phase1.js` runs its new structural pre-check | It fails before `gaia-validate-feature-docs` is dispatched, naming the specific file and dangling AC ID | Must |
| AC-04 | A file inventory row's `Addresses` cell is `—` | The structural pre-check runs | It passes — `—` is a valid value, not an error | Must |
| AC-05 | A feature has passed Gate 2 (Work Breakdown generated) and has a correctly-tagged Tech-Spec | `ac-task-matrix.js` runs | The rendered matrix's new column lists every Tech-Spec file whose `Addresses` cites that AC, or `—` if none | Must |
| AC-06 | `wb-validate.js`, `wb-render.js`, `wbs-assembler.js`, `wb-graph-checks.js`'s existing exported functions, `req-assembler.js`/`req-skeleton-check.js`, and Gate 1/Gate 2's existing pass/fail semantics | This feature is implemented | None of their existing behavior changes | Must |
| AC-07 | All changes are delivered | `npm test` runs | All tests pass: `Addresses`-column parsing, the dangling-reference structural check (clean/broken/`—`-only cases), the extended matrix column, and a `pm-phase1.js` integration test confirming the new pre-check runs before `gaia-validate-feature-docs` | Must |

## MVP vs Deferred

### MVP (must ship)
- `gaia-generate-tech-spec.md` template update: `Addresses` column on both File Inventory tables
- New deterministic structural check (exact module boundary — Tech-Spec OQ-1) verifying every
  `Addresses` reference resolves to a real Requirements AC ID
- `pm-phase1.js` wiring: the new check runs immediately before `gaia-validate-feature-docs`
- `ac-task-matrix.js` extension: new column, new parse function reused (not duplicated) by both
  the structural check and the matrix renderer
- Automated tests per AC-07

### Deferred (next iteration)
- Tech-Spec split generation (Phase D)
- Semantic ("does this file really implement what it claims") judgment of `Addresses` references
- Retroactive tagging of existing Tech-Specs

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Should the new structural check live in a new standalone script (e.g. `tech-spec-graph-checks.js`, mirroring `req-graph-checks.js`/`wb-graph-checks.js`), or as new exported functions added to an existing module? | Organizational only — must still be invoked via `c.command(['run-asset', ...])` from `pm-phase1.js` regardless, per the no-`require()` workflow-runtime constraint already established in FTR-020/021 |
| 2 | Should the File-Inventory-table parser be a new function, or should it reuse/extend `req-assembler.js`'s generic "parse the first Markdown table after a heading" helper (`parseTableRows`) despite it living in a module conceptually about Requirements, not Tech-Spec? | Affects whether this feature introduces a second independent table-parsing implementation or extends an existing generic one |
| 3 | Exact extension mechanism for `ac-task-matrix.js`: does `computeCoverage`/`renderMatrix` take a third, optional argument (Tech-Spec file-to-AC mapping), or does a new function wrap the existing ones? | Affects whether FTR-022's two exported functions keep their existing 2-argument signatures (a compatibility question, since nothing outside this script calls them today — low risk either way) |

## Dependencies and Assumptions
- FTR-020 (available): `wbs-assembler.js`'s directory/legacy loader pattern; not touched by this
  feature.
- FTR-021 (available): `req-assembler.js`'s table-parsing conventions, reusable as a pattern (OQ-2)
  for the new Tech-Spec File Inventory parser.
- FTR-022 (available): `wb-graph-checks.js`'s `parseAcTable` (unmodified) is the authoritative
  Requirements AC source both the new structural check and the extended matrix read from;
  `ac-task-matrix.js`'s `computeCoverage`/`renderMatrix` are the functions this feature extends.
- Governance decision already recorded (`internal_docs/ideas/requirements-techspec-split-and-traceability-matrix.md`):
  this kind of coverage check folds into existing gates (here, Gate 1) as a
  coverage-then-semantic two-stage validation; it does not become a new, separate gate.
- `npm test` is the only verification command; no separate build step exists.
- Open Questions 1, 2, and 3 must be closed by the Tech Spec before Gate 1.
