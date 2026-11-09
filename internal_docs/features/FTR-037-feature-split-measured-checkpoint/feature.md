# Feature Split Checkpoint 2: Measured Size Check After Tech-Spec

## Feature ID
FTR-037

## Parent epic
FTR-034 (Feature Split for Oversized Features). Position 3 of 3 in the dependency order. Depends on
FTR-035. Independent of FTR-036.

## Summary
After Requirements and Tech-Spec are generated, the pipeline measures the real counts (use cases,
acceptance criteria, components, estimated phases) against the configured thresholds. If any is over
its threshold it stops before Gate 1 and proposes a split computed from the generated documents. The
user accepts, edits or rejects it. This is the reliable checkpoint: it works from measured data, and
it catches an epic that checkpoint 1 did not flag.

## Problem Statement
A feature can look small at definition time and grow once its use cases and components are written
out. Its cost and failure surface grow with it: FTR-034 itself had 41 acceptance criteria, 38
components and 9 dependency levels, and three full pipeline runs never converged. The pipeline has
no way to notice that or to propose a split. This feature adds the measurement and the proposal,
using the contracts of FTR-035.

## Scope
In scope:
- The script command `check-size` of `feature-split.js` and the measurement it runs.
- The hook in `pm-phase1.js` that runs `check-size` after the validation loop and before the Gate 1
  digest, and returns its result.
- The change to the `implement-feature` skill that presents the proposal and collects accept, edit or
  reject in the main loop.
- Static tests that pin the hook and the skill text.

Out of scope:
- Configuration, the new-feature test, the proposal model, apply and registry (FTR-035).
- The checkpoint 1 assessment in `define-feature` (FTR-036).
- Measuring tasks or applications: they do not exist before Gate 1 and are not thresholds.
- Splitting a feature that is in progress or approved.

## Core Flow
- **UC-01 — Measure.** After the validation loop, `pm-phase1` runs `check-size` on the feature
  folder. A feature that is not new is skipped. Otherwise the four counts are measured and compared
  with the thresholds.
- **UC-02 — Propose.** If any count is over its threshold, the pipeline stops before Gate 1 and
  `implement-feature` presents a proposal built from the generated documents (which use cases and
  components go to which child), with each over-threshold count beside its threshold. The user
  accepts, edits or rejects.
- **UC-03 — Apply or continue.** Accepting runs `apply` from FTR-035, and the pipeline stops for the
  parent. Rejecting continues to Gate 1 unchanged and stores no rejection.

## Business Rules
- BR-01: the split is always a proposal; nothing is created without explicit confirmation.
- BR-02: a feature at or below every threshold passes without any prompt.
- BR-03: a count that cannot be measured is reported as unavailable and never counts as passing. The
  check stops and the pipeline does not reach Gate 1 until the cause is fixed.
- BR-04: the hook never parses the check result unguarded: a missing, failed or non-JSON result is
  reported as unavailable.

## Decisions
These decisions refine the contracts of FTR-035 and do not change them.

- **D-01 Counts.** Use cases are the distinct `UC-NN` identifiers across `req/use-cases/*.md`.
  Acceptance criteria are the distinct `AC-NN` identifiers in `req/index.md`. Components are the
  rows of the component table in `spec/index.md`. Estimated phases are the number of dependency
  levels (topological depth) of the build order in Tech-Spec Section 11.
- **D-02 Build-order format.** Section 11 is a numbered list. Each item is `N. <text> — depends on:
  <M[, M…]>` or `N. <text> — depends on: none`. The depth of an item is 0 when it depends on
  nothing and otherwise one more than the greatest depth among its dependencies. The number of
  levels is the greatest depth plus one. A dangling dependency or a cycle makes the count
  unavailable. An item with no `depends on:` clause makes it unavailable too.
- **D-03 Comparison.** A count is over its threshold when `isOverThreshold` (FTR-035 D-05) says so.
  A count equal to the threshold passes.
- **D-04 Unavailable.** A source file or table that is missing or empty makes that count
  unavailable. The report is a plain error in the main loop naming each unavailable count and the
  reason. It is not a gate and not an approval prompt.
- **D-05 `check-size`.** Run as `run-asset scripts/feature-split.js --project <root> -- check-size
  --feature-dir <dir> --prefix <FTR-ID>`. It prints
  `{ status, counts, thresholds, over, unavailable, proposal }` where `status` is `"skipped"`
  (feature not new), `"passed"`, `"unavailable"` (exit 1) or `"split-proposed"`. `counts` and
  `thresholds` use the key names of FTR-035 D-02. `over` lists the counts over their threshold.
  `unavailable` lists `{ count, reason }`. `proposal` is the FTR-035 D-08 shape with
  `source: "measured"`, present only for `"split-proposed"`.
- **D-06 Pipeline result.** `pm-phase1` adds the check result to its return value as
  `split_checkpoint`, with the same shape as D-05. It runs the check through `run-asset` with the
  `c.command` form already used in the file. The prompt and the `apply` call run in the
  `implement-feature` main loop, never inside the workflow.
- **D-07 Shared foundation.** It goes to the first child in dependency order, which is the child
  holding the components at depth 0 of the build order. If the build order has no distinct depth-0
  level, no foundation is assigned and the proposal states that explicitly.
- **D-08 Child drafts.** At this checkpoint the parts assigned to each child are the use cases and
  components given to it. The parent's generated documents are reused as the source for its draft.
- **D-09 Edits and Summary.** Edits, Summary and Keywords follow FTR-035 D-09 to D-11. The agent
  derives each child's Keywords from its title, use cases and components.
- **D-10 Rejection.** On rejection the pipeline continues to Gate 1 unchanged and stores nothing.
- **D-11 Reading the result.** `implement-feature` Step 1a sits between `pm-phase1` and Gate 1. It
  continues to Gate 1 on `passed` or `skipped`, shows each unavailable count as a plain stop, and on
  `split-proposed` presents the proposal.

## Open Questions
- None.

## Dependencies
- FTR-035 (configuration, new-feature test, proposal, apply, registry and the `feature-split.js`
  facade).
- The Requirements and Tech-Spec generation stages, which produce the counts.
- `pm-phase1.js` and the `implement-feature` skill.
