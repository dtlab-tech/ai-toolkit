# Feature Split for Oversized Features (Epics)

## Feature ID
FTR-034

## Summary
Today the pipeline accepts any size of feature without question. A feature that is really an epic
(several independently deliverable slices bundled together) runs end to end as one unit, and its
cost and failure surface grow with its size. This feature adds a split step: when a feature is
identified as an epic, the pipeline proposes splitting it into several child features, each with
its own ID and its own pipeline run, and only the user decides whether to accept the split.

Two checkpoints detect oversized features:

1. **During `define-feature` (advisory, cheap).** Right after grilling, the agent assesses whether
   the feature covers several independent flows, actors or applications. If so, it proposes a
   split with draft boundaries before anything is written.
2. **After Requirements and Tech-Spec are generated (measured, reliable).** The real counts exist
   at this point (use cases, acceptance criteria, components, estimated phases). If they exceed
   the thresholds, the pipeline proposes the split and waits for the user. Nothing is split
   automatically.

Thresholds and other tunable parameters live in one configuration file, not in code.

## Problem Statement
Two real features on this toolkit show the problem.

- `Fincantieri.CommonLibraries.MFExample` FTR-003 (i18n for the shell, Demo and Fleet
  micro-frontends): 10 use cases, 12 acceptance criteria, 51 Tech-Spec components across three
  applications, 123 tasks in 11 phases. Cost of the runs measured so far was $108 on the earlier
  versions, and a projected complete run on the current version is about $127 (a projection from
  measured per-call costs, not a measured run). Two-thirds of the cost of the first full run was
  spent on the already-fixed version, so it is structural and not caused by bugs. It repeatedly hit the 30-minute
  worker ceiling on the largest steps (per-phase generation and whole-breakdown semantic
  validation), each time fixed by splitting one step, not the feature.
- `Fincantieri.ISDM.JobScheduler` FTR-013 (SQL schema migrations): 7 use cases, 4 phases, 50
  tasks, 23 components, $22 total. Coherent and of sensible size. It must not be split.

Manual analysis of FTR-003 shows it could be split into five features with a clear dependency
order (shell language foundations, shell rendering and formatting, embedded micro-apps,
backend locale propagation, backend translated errors). The split is recoverable only by hand
today, and a future operator would have no signal that it is needed.

## Scope
In scope:
- A size assessment step inside `define-feature` (checkpoint 1) that proposes a split with draft
  child boundaries, and requires explicit user confirmation.
- A size check after Requirements and Tech-Spec generation (checkpoint 2) that proposes a split
  and waits for the user. No automatic split.
- A configuration file holding the thresholds (use cases, acceptance criteria, components,
  estimated phases) and other parameters, loaded from one place and overridable per project.
  Task and application counts are not thresholds: they do not exist before Gate 1 (see Decisions).
- Child feature IDs: new, distinct IDs (FTR-NNN), never suffixes of the parent. Each child records
  the parent epic and its position in the dependency order.
- A feature registry kept current. Every created feature, including children, is registered.
- A visible link between parent and children, so the epic and its slices can be reviewed together.

Out of scope:
- Splitting a feature that is already in progress or already approved. This feature applies to
  new features only.
- Automatic execution of child features in sequence. Each child runs through the normal pipeline
  when the user starts it, following the declared dependency order.
- Changing the existing pipeline stages (Requirements, Tech-Spec, Work Breakdown, Gates) beyond the
  two checkpoints.
- The threshold values themselves. They are defined in the configuration file and calibrated on
  real runs after the mechanism exists.

## Core Flow
- **UC-01 — Assess size during definition.** After grilling, `define-feature` evaluates the
  feature against the configured definition-time signals. If it looks like an epic, it proposes a
  split: child names, a one-line purpose for each, the dependency order, and which shared parts
  belong to the first child. The user accepts, edits or rejects the proposal. Accepting creates one
  feature folder per child, each with a `feature.md`, and a parent epic folder that records the
  split.
- **UC-02 — Check size after Tech-Spec.** After Requirements and Tech-Spec are generated, the
  pipeline measures the real counts against the configured thresholds. If any is exceeded, it stops
  before the Gate 1 presentation and proposes the same kind of split, computed from the generated
  documents (which use cases and components go to which child). The user accepts, edits or rejects.
  On acceptance, the child features are created, and the parent's generated documents are reused as
  the source for their drafts. On rejection, the pipeline continues unchanged.
- **UC-03 — Register and link.** Every created feature, child or standalone, is added to the
  feature registry with its keywords and status. Each child records its parent epic and its
  dependencies on sibling children.

## Business Rules
- BR-01: the split is always a proposal. The pipeline never splits without explicit user
  confirmation, at either checkpoint.
- BR-02: child feature IDs are new and distinct (the next free FTR-NNN). A child never reuses the
  parent's ID or a suffixed form of it.
- BR-03: the shared foundation of an epic (for example an infrastructure phase needed by every
  slice) belongs to the first child in the dependency order, and every later child depends on it.
- BR-04: thresholds and other tunable parameters are read from one configuration file. No threshold
  is hard-coded in agents or scripts.
- BR-05: a feature below every threshold passes both checkpoints without any prompt, so small
  features do not pay for this check.
- BR-06: the parent epic is kept as a record of the split and is not run as a pipeline itself.

## Data Requirements
- A new configuration file in the toolkit with default thresholds and parameters. It may be
  overridden by a project-level file with the same structure, loaded from a single function.
- An epic record listing its child features, their order and their dependencies.
- The feature registry gains the parent and dependency fields for each entry.

## Decisions
Settled with the user on 2026-10-28, closing the gaps the first validation pass reported.

- **D-01 Configuration format.** JSON. The toolkit has no runtime dependencies, and a YAML parser
  would be the first.
- **D-02 Checkpoint 2 measures.** Only counts that exist after Requirements and Tech-Spec:
  use cases, acceptance criteria, components, estimated phases. Task count and applications
  touched are not measured at checkpoint 2 and are not thresholds. Tasks exist only after the
  Work Breakdown, which is after Gate 1.
- **D-03 Configuration and measurement failures.** A missing project override file falls back to
  the toolkit defaults. A missing or unreadable toolkit default file stops the check with an
  explicit error. A count that cannot be measured (for example a missing section in `req/` or
  `spec/`) is reported as `unavailable` and never counts as passing, and the check stops and
  reports it rather than continuing silently.
- **D-04 Rejection at checkpoint 1.** If the user rejects the proposed split, the feature
  continues as a standalone feature and checkpoint 2 still runs for it.
- **D-05 Atomic creation.** Epic and children are written to a staging area first and moved into
  place only when all of them succeed. The move from staging is a single rename on the same
  volume. On any error nothing is left behind and the error is reported. The one exception is a
  filesystem failure during the rollback itself: the run then ends in error and reports the exact
  paths that remain, and does not claim that nothing was left behind. A child ID that already exists is an error, never overwritten. A missing registry is
  created. A child is never registered before its epic record exists.
- **D-06 Re-run.** Both checkpoints recompute from the current content on every run, so user
  edits and regeneration are picked up. A feature with an epic record is not new (D-07), so neither
  checkpoint runs for it again: missing children of an existing epic are created with
  `/define-feature`, and a child ID that already exists is an error (D-05). A child created at
  checkpoint 1 goes through checkpoint 2 on its own run as a feature in its own right.
- **D-07 "New feature" rule.** A feature is *new* when it has not progressed past documentation
  review. It is **not** new, and neither checkpoint runs, if any of these exists for it: an
  approval record (`{PREFIX}-Approvals.md`), a Work Breakdown (`wbs/`), an executor run, or an epic
  record. Generated `req/` and `spec/` do not make a feature non-new: they are the input of
  checkpoint 2, and regenerating them (including `--force`) on a feature with none of the above
  keeps it new. The same single function answers the question for both checkpoints, in the
  size-check module. At checkpoint 1 the feature folder does not exist yet, so the feature is new
  by definition unless the user is re-defining an existing feature ID, in which case the same test
  applies to that folder.
- **D-08 Definition-time signals (checkpoint 1).** The feature is flagged as a probable epic if
  the grilling answers show at least two actors, or at least two applications, or at least three
  independently deliverable flows. These three values live in the configuration file.
- **D-09 Project override location.** `feature-split.config.json` at the project root, same
  structure as the toolkit default, loaded by the single config-loading function.
- **D-10 End state after apply (BR-06).** After a split is applied the parent folder holds only
  the epic record, is marked `epic` in the registry, and the pipeline stops for the parent. The
  user then starts the first child.

### Decisions closing the first validation report
Taken on 2026-10-28 with recommended defaults, after verifying the repo facts they depend on.

- **D-11 Measurement sources (checkpoint 2).** Use cases = distinct `UC-NN` identifiers across
  `req/use-cases/*.md`. Acceptance criteria = distinct `AC-NN` identifiers in `req/index.md`.
  Components = rows of the component table in `spec/index.md`. Estimated phases = number of
  dependency levels (topological depth) of the build order in Tech-Spec Section 11. If a source
  file or table is missing or empty, that count is `unavailable` (D-03). The measurement is keyed to
  the missing section or file, not only to an empty `req/` folder.
- **D-12 `unavailable` report form.** A plain error message in the main loop, naming each
  unavailable count and the reason. It is not a gate and not an approval prompt. The pipeline stops
  before Gate 1 until the cause is fixed and the check is run again.
- **D-13 Insufficient grilling answers (checkpoint 1).** If a definition-time signal cannot be
  evaluated from the grilling answers, `define-feature` does not propose a split on the strength
  of it and says explicitly which signal could not be evaluated. Checkpoint 2 still runs.
- **D-14 Editing a proposal.** The user may edit child names, purposes, order and the
  shared-foundation assignment, and may add, remove or merge children, as long as at least
  `minChildren` (default 2) remain. An edited proposal is not re-measured: after the user confirms
  it, it is applied as edited. This is the single rule for edits and re-validation.
- **D-15 Child draft `feature.md`.** Each child's draft contains its title, a summary from its
  purpose line, the parent epic ID, its dependency position and sibling dependencies, and the
  parts of the parent assigned to it. At checkpoint 1 these are the relevant grilling answers. At
  checkpoint 2 they are the assigned use cases and components. Shared-foundation content goes to
  the first child (BR-03).
- **D-16 Invalid configuration values.** Thresholds must be non-negative integers. A non-integer
  or negative value, or an unknown key in the project override, is a loader error naming the key
  and the file. The check stops, as in D-03.
- **D-17 Registry failure.** The registry is written last, with a temp-and-rename step. If the
  registry cannot be read or the write fails, everything moved into place by this run is removed,
  nothing is registered, and the error is reported.
- **D-18 Epic record.** The epic record is a single file, `epic.md`, with the split table
  (children, order, dependencies, shared foundation, the checkpoint that produced the split) and
  the verbatim original feature text as a trailing section. It lists each child exactly once.
  There is no `epic.json`. The parent's original `feature.md` is not kept separately.
- **D-19 Registry entry format.** Entries keep the existing per-entry format of
  `internal_docs/features/REGISTRY.md` (heading, `Keywords`, `Status`, `Summary`, `Detail`), with
  two new bold-key lines: `Parent:` (the epic ID, for children) and `Depends on:` (sibling IDs, for
  children). The `Status` vocabulary becomes `defined`, `completed` and `epic`. The registry is not
  converted to a table.
- **D-20 Features root.** `define-feature` and apply both resolve the features root with
  `ai-toolkit resolve-features-root` and never hard-code `docs/features/` or
  `internal_docs/features/`. The `define-feature` agent definition and skill are modified for
  checkpoint 1, so they belong in the Tech-Spec file inventory.
- **D-21 Distribution.** `src/claude/scripts/feature-split.config.json` is installed with the
  rest of the `scripts` category: the installer's only blocked extension is `.test.js`, and the
  new tests live under `tests/scripts/`, outside the installed tree. No installer change is
  needed. A test confirms the default file is present after install.
- **D-22 Scope and dependencies.** Automatic execution of children in sequence is out of scope
  and is restated in the Requirements. The feature depends on FTR-026 in addition to FTR-021,
  FTR-024 and FTR-025.

### Decisions closing the second validation report
Confirmed by the user on 2026-10-29.

- **D-23 Threshold comparison.** This rule applies to the checkpoint 2 count thresholds only (use
  cases, acceptance criteria, components, estimated phases). A count is over its threshold when it
  is strictly greater than the configured value; a count equal to the threshold passes. The
  checkpoint 1 definition-time signals (D-08) are not thresholds of this kind: each configured
  value is the minimum count that raises the flag ("at least N"). Both rules are stated once, in
  the configuration section, and every document uses them. The Summary's wording "exceeds" refers
  to the checkpoint 2 rule.
- **D-24 Independent flows (checkpoint 1).** The agent counts the independently deliverable flows
  itself from the grilling answers. A flow is a user-visible capability that can be delivered on
  its own, listed at the same level of detail as actors and applications. It lists each flow by
  name with a one-line reason, and the proposal shows that list to the user. No algorithm is
  defined; the visible list is the control.
- **D-25 Child registry Keywords and Summary.** The Summary is the child's one-line purpose from
  the proposal. The Keywords are derived by the agent from the child's title and its assigned use
  cases and components. Both are shown in the proposal and can be edited by the user (D-14).
- **D-26 Editing the shared foundation.** If the user moves the shared foundation away from the
  first child, the agent warns that this breaks BR-03 and states the consequence, but the user can
  confirm anyway. This refines D-14: an edit is never refused, only warned about.
- **D-27 Requirements and Tech-Spec content.** Section 1.2 (out of scope) lists that task count
  and applications touched are not measured at checkpoint 2 and are not thresholds (D-02). D-20
  (features root) is a functional requirement, not only a dependency. The Tech-Spec file inventory
  lists the existing static tests that must change (`tests/cli/pm-phase1-source.test.js`,
  `tests/regression/static-guards.test.js`) and the `AGENTS.md` update. Each use case has one
  Related block.
- **D-28 Standalone registration and proposal content.** A feature that is not split is registered
  at the end of `define-feature`, when its `feature.md` is written, with status `defined`. Each
  child's Summary and Keywords (D-25) appear in the checkpoint 2 proposal (UC-02 main flow) and
  among its editable items, as at checkpoint 1.
- **D-29 Required acceptance criteria.** The Requirements include an acceptance criterion for
  each of: registration of a standalone feature, creation of a missing registry, creation of a
  missing child of an existing epic with `/define-feature`, and `--force` regeneration keeping a
  feature new (D-07). Every acceptance criterion is addressed by at least one Tech-Spec component.

### Decisions closing the third validation report
Confirmed by the user on 2026-11-02.

- **D-30 Default thresholds.** The initial checkpoint 2 defaults are 8 use cases, 15 acceptance
  criteria, 30 components and 6 estimated phases (D-23: over means strictly greater). They are
  explicitly uncalibrated placeholders recorded as the initial configuration; calibration on real
  runs stays out of scope (Section Scope). This closes the Requirements open question on default
  values.
- **D-31 Grilling-answer record.** At checkpoint 1 the grilling answers reach the signal
  evaluation as an in-memory structure `{ actors: [], applications: [], flows: [{ name, reason }] }`
  passed to the evaluation function. It is never written to disk.
- **D-32 Staging path.** Staging is a dot-prefixed directory directly under the features root,
  named `.split-staging-<run id>`. It is removed when the run ends, successfully or on error (D-05).
- **D-33 Shared foundation without a clear first level.** The shared foundation goes to the first
  child in dependency order, which is the child holding the components at depth 0 of the Tech-Spec
  build order (Section 11). If the build order has no distinct depth-0 level, no foundation is
  assigned and the proposal states that explicitly (BR-03).
- **D-34 Legacy statuses.** No registry entry uses an `in-progress` status (checked in
  `internal_docs/features/REGISTRY.md`). The statuses this feature writes are `defined`, `completed`
  and `epic`. Any other status already present is left untouched and is treated as not an epic.
- **D-35 Epic registry entry.** The epic's Summary is the first sentence of the original
  `feature.md` Summary. Its Keywords are the union of its children's Keywords. This replaces the
  "source to be stated" open points; D-25 still governs the children.

## Open Questions
- None.

## Dependencies
- The `define-feature` agent and its grilling flow.
- The Requirements and Tech-Spec generation stages, which provide the counts for checkpoint 2.
- The feature registry (`internal_docs/features/REGISTRY.md`), read by the Requirements and
  Tech-Spec agents to find related features. Realigned in this session before this feature started.
