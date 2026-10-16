# AC↔Task Traceability Matrix

## Feature ID
FTR-022

## Summary
Adds a new deterministic renderer, `ac-task-matrix.js`, that produces
`{PREFIX}-AC-Task-Matrix.md` — a human-readable table mapping every Acceptance Criterion in
`{PREFIX}-Requirements.md` to the Work Breakdown task(s) and phase(s) that cover it. No new
generation, no new validation, no new data: every fact in the matrix is already computed and
already enforced by `wb-validate.js`'s existing checks 19–21 (`checkAcCoverage` in
`wb-graph-checks.js`) — this feature only makes that already-validated traceability visible as a
rendered artifact, the same way `wb-render.js` turns already-validated JSON into
`{PREFIX}-Work-Breakdown.md`/`.csv`. Wired into `pm-phase2.js` immediately after the existing
`wb-render.js` call, so it ships alongside the Work Breakdown at Gate 2, with zero new LLM calls.

## Problem Statement
Today, "is every Acceptance Criterion actually covered by a task" is enforced (checks 19–21
reject an uncovered Must AC or a misscoped task reference) but never *shown* — the only way to
see which task(s) satisfy a given AC, or to review coverage at a glance across a whole feature, is
to manually cross-reference `{PREFIX}-Requirements.md`'s AC table against every task's
`acceptanceCriteria` field in the Work Breakdown. This is exactly the kind of manual
cross-referencing this toolkit's whole split-generation lineage (FTR-020, FTR-021) exists to
eliminate — except here, unlike those two, the underlying data and its correctness are already
guaranteed; only the *view* is missing. This is Phase A of the traceability-matrix initiative
(`internal_docs/ideas/requirements-techspec-split-and-traceability-matrix.md`), deliberately
scoped as the cheapest, most foundational increment: it introduces no new document format, no new
agent, and no new validation rule.

## Actors
N/A — internal/technical feature

## Core Flow (Happy Path)
This is an internal tooling change; the execution path is described below.

1. `pm-phase2.js` reaches its existing post-render step (today: immediately after the
   `wb-render.js` call that produces `{PREFIX}-Work-Breakdown.md`/`.csv`).
2. A new `c.command(['run-asset', 'scripts/ac-task-matrix.js', '--project', c.root, '--', wbsDir,
   file('Requirements.md'), prefix])` call runs `ac-task-matrix.js`, which:
   - Parses `{PREFIX}-Requirements.md`'s `## 7. Acceptance Criteria` table (reusing
     `wb-graph-checks.js`'s existing `parseAcTable`, extended to also capture the `Criterion` text
     column alongside the fields it already captures — `priority`, `allowedUserStories`,
     `unscoped` — for display; see Tech-Spec OQ-1).
   - Loads the Work Breakdown via the existing `wbs-assembler.js`'s `loadWorkBreakdown`
     (unmodified — works identically for the split `wbs/` directory and a legacy single JSON
     file).
   - For every AC in the table, finds every task whose `acceptanceCriteria` array cites it, and
     that task's owning phase (same data `checkAcCoverage` already traverses, read-only).
   - Renders one Markdown table — AC ID, Criterion, Priority, Related UC, covering Task ID(s),
     covering Phase(s) — plus a legend, to `{PREFIX}-AC-Task-Matrix.md`.
3. `pm-phase2.js` reads the file back (same "never trust an unread write" pattern the existing
   `wb-render.js`/`wb-validate.js` calls already follow) and includes its path in the Gate 2
   payload, alongside the existing `renderer_result`.
4. Gate 2 itself is unaffected: this feature introduces no new pass/fail condition. A feature that
   already passes `wb-validate.js`'s checks 19–21 always produces a complete matrix; there is no
   scenario where the matrix itself blocks Gate 2.

## Out of Scope
- Tech-Spec participation in the matrix (Phase B/D of the broader initiative — Tech-Spec has no
  AC/UC tagging convention yet to pivot on).
- Requirements/Tech-Spec split generation changes (already shipped as FTR-021/pending FTR for
  Tech-Spec) — this feature only *reads* `{PREFIX}-Requirements.md`, already-assembled,
  unmodified.
- Any new validation rule or Gate 2 blocking condition — the matrix is purely a rendering of
  facts `wb-validate.js` already enforces; it never introduces a new reason to fail Gate 2.
- A JSON sibling artifact (`{PREFIX}-AC-Task-Matrix.json`) — deferred unless a concrete downstream
  consumer needs machine-readable access; nothing today reads this data except a human reviewer.
- UC↔US (phase) traceability beyond what's already implied by listing each covering task's phase
  — a dedicated UC↔US view is not part of this feature.
- Migrating `coverage-matrix/`'s broader (feature.md↔req↔spec↔WB) ambitions from FTR-020's
  worked example — that is explicitly Phase D's territory, once Tech-Spec has a tagging
  convention to pivot on.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| An AC has zero covering tasks and is not `Must` priority | Listed in the matrix with an empty "Covering Task(s)" cell — not an error; `Should`/`Could` ACs are not required to be covered by `wb-validate.js` itself |
| An AC has zero covering tasks and IS `Must` priority | Cannot occur in a feature that reached this step — `wb-validate.js` check 21 already rejects this before Gate 2 generation proceeds this far |
| `{PREFIX}-Requirements.md` is missing or has no `## 7. Acceptance Criteria` section | `ac-task-matrix.js` aborts with the same structured error `parseAcTable` already raises for this case (exit code 2) — this can only happen if something upstream already broke, since `wb-validate.js` itself requires this path to run its own AC checks |
| The Work Breakdown's `wbs/` directory or legacy JSON is missing/malformed | Aborts with the same structured error `loadWorkBreakdown` already raises — this script never duplicates that error-handling, only calls it |
| An AC is marked `unscoped` (`Related UC` = "All UCs") | "Related UC" column renders as `All UCs`; "covering Phase(s)" lists every distinct phase of every covering task, since an unscoped AC has no single expected phase to validate against |

## Data Model
N/A — internal/technical feature

### `{PREFIX}-AC-Task-Matrix.md`
One Markdown table, one row per AC (table order = `{PREFIX}-Requirements.md`'s own AC table
order), followed by a legend. See Tech-Spec for the exact column set and rendering rules.

## Roles and Permissions
N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A feature has passed `wb-validate.js`'s checks (Gate-2-eligible Work Breakdown + Requirements) | `pm-phase2.js` runs | `{PREFIX}-AC-Task-Matrix.md` is generated containing one row per AC, in the Requirements AC table's own order | Must |
| AC-02 | An AC is cited by one or more tasks' `acceptanceCriteria` field | The matrix is generated | That AC's row lists every covering task ID and every distinct phase those tasks belong to | Must |
| AC-03 | An AC is cited by zero tasks and is not `Must` priority | The matrix is generated | That AC's row has an empty "Covering Task(s)" cell; generation does not fail | Must |
| AC-04 | A legacy feature's Work Breakdown is a single JSON file (not a `wbs/` directory) | `pm-phase2.js` runs | The matrix generates identically via the existing `loadWorkBreakdown` loader, with no feature-specific branching | Must |
| AC-05 | `wb-validate.js`, `wb-render.js`, `wbs-assembler.js`, `wb-graph-checks.js`'s existing exported check functions, and Gate 2's pass/fail semantics | This feature is implemented | None of their existing behavior changes — `parseAcTable`'s extension (Tech-Spec OQ-1) is additive only | Must |
| AC-06 | All changes are delivered | `npm test` runs | All tests pass: matrix rendering against a real multi-AC fixture, the unscoped/zero-coverage/legacy-JSON edge cases, and a `parseAcTable` regression test confirming its existing three-field contract is unchanged for every existing caller | Must |

## MVP vs Deferred

### MVP (must ship)
- `ac-task-matrix.js`: new deterministic script, reusing `wb-graph-checks.js`'s `parseAcTable`
  (extended) and `wbs-assembler.js`'s `loadWorkBreakdown` (unmodified)
- `pm-phase2.js` wiring: one new `c.command()` call after the existing `wb-render.js` step, its
  output path surfaced in the Gate 2 payload
- Automated tests per AC-06

### Deferred (next iteration)
- JSON sibling artifact
- Tech-Spec participation (Phase B/D)
- Any UC↔US-only view

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Should `parseAcTable` (in `wb-graph-checks.js`) be extended in place to also capture the `Criterion` text column, or should `ac-task-matrix.js` parse that column independently (a second, narrower reader over the same table)? | Affects whether an already-tested, shared module gets touched; must preserve `checkAcCoverage`'s existing behavior either way |
| 2 | Exact column set and ordering for the rendered table, and how multiple covering tasks/phases are formatted in one cell (comma-separated? one per line?) | Purely a rendering-format decision, to be fixed once in the Tech-Spec and templates, not re-decided per feature |

## Dependencies and Assumptions
- FTR-014 (available): `wb-validate.js`'s checks 19–21 (`checkAcCoverage`) are the authoritative
  source of AC↔Task coverage correctness; this feature only renders what they already guarantee.
- FTR-020 (available): `wbs-assembler.js`'s `loadWorkBreakdown` is the single loader for both the
  split `wbs/` format and legacy single-JSON input; reused unmodified.
- `{PREFIX}-Requirements.md`'s AC table format (`ID | Criterion | Related UC` columns, optionally
  a fourth `Priority` column) is the same contract `parseAcTable` already parses — unaffected by
  whether Requirements was generated via FTR-021's split path or the legacy single-call path,
  since both assemble to the same final document shape.
- `npm test` is the only verification command; no separate build step exists.
