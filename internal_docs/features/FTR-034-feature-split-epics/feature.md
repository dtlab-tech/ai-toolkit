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
- A configuration file holding the thresholds (for example: use cases, acceptance criteria,
  components, phases, tasks, applications touched) and other parameters, loaded from one place
  and overridable per project.
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

## Open Questions
- JSON or YAML for the configuration file. The toolkit has no runtime dependencies today, so JSON
  keeps that intact. The recommendation is JSON; a YAML parser would be the first external
  dependency.
- Whether checkpoint 2 should also run for features that are not new (for example a re-run of
  Requirements on an existing feature). Current assumption: no, see out of scope.

## Dependencies
- The `define-feature` agent and its grilling flow.
- The Requirements and Tech-Spec generation stages, which provide the counts for checkpoint 2.
- The feature registry (`internal_docs/features/REGISTRY.md`), read by the Requirements and
  Tech-Spec agents to find related features. Realigned in this session before this feature started.
