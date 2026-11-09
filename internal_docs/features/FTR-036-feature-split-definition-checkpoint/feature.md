# Feature Split Checkpoint 1: Size Assessment During Definition

## Feature ID
FTR-036

## Parent epic
FTR-034 (Feature Split for Oversized Features). Position 2 of 3 in the dependency order. Depends on
FTR-035. Independent of FTR-037.

## Summary
Right after `define-feature` finishes grilling the user, the agent assesses whether the feature
covers several independent flows, actors or applications. If it does, the agent proposes a split
into child features before writing anything, and the user accepts, edits or rejects it. This is the
cheap, advisory checkpoint: it works from the grilling answers only, so it costs no pipeline run.
A feature that is not split is registered as a standalone feature when its `feature.md` is written.

## Problem Statement
Oversized features are discovered late, after Requirements and Tech-Spec have been generated and
paid for. Many can be seen earlier, at the point where the user describes them. This feature adds
that early signal and the proposal step, using the configuration, new-feature test, proposal model,
apply command and registry from FTR-035.

## Scope
In scope:
- A Phase 3a in the `define-feature` agent, between Phase 3 (grilling) and Phase 4 (writing
  `feature.md`).
- The script command `check-definition` of `feature-split.js`.
- The change to the `define-feature` skill that presents the proposal and collects accept, edit or
  reject in the main loop.
- Registration of a standalone feature when its `feature.md` is written.
- Creation of a late child of an existing epic with `define-feature`.
- Static tests that pin the new text of the agent and the skill.

Out of scope:
- Configuration, the new-feature test, the proposal model, apply and registry (FTR-035).
- Measuring generated documents (FTR-037).
- Splitting a feature that is in progress or approved.

## Core Flow
- **UC-01 — Assess a new feature at definition time.** After grilling, `define-feature` builds the
  in-memory grilling record and runs `check-definition`. If the feature is not new, the check is
  skipped. If no signal reaches its minimum, nothing is shown and the feature is registered as
  standalone when written. If a signal is met, the agent proposes a split: child names, a one-line
  purpose for each, the dependency order, and which shared parts belong to the first child.
- **UC-02 — Accept, edit or reject.** The user accepts, edits or rejects the proposal in the main
  loop. Accepting runs `apply` from FTR-035. Rejecting continues as a standalone feature.
- **UC-03 — Create a late child.** The user asks `define-feature` for a missing child of an existing
  epic. The agent creates it with `apply`, placed last, depending on the previous last child.

## Business Rules
- BR-01: the split is always a proposal; nothing is created without explicit confirmation.
- BR-02: a signal that cannot be evaluated from the grilling answers does not raise the flag, and the
  agent says which signal it could not evaluate.
- BR-03: the checkpoint writes nothing to disk before the user confirms.
- BR-04: `define-feature` never overwrites an existing `feature.md` (FTR-035 D-17).

## Decisions
These decisions refine the contracts of FTR-035 and do not change them.

- **D-01 Signals.** The feature is flagged as a probable epic if the grilling answers show at least
  `definitionSignals.minActors` actors, or at least `definitionSignals.minApplications`
  applications, or at least `definitionSignals.minFlows` independently deliverable flows, compared
  with `meetsMinimum` (FTR-035 D-05).
- **D-02 Flows.** The agent counts the independently deliverable flows itself. A flow is a
  user-visible capability that can be delivered on its own, listed at the same level of detail as
  actors and applications. The proposal lists each flow by name with a one-line reason. No algorithm
  is defined; the visible list is the control.
- **D-03 Grilling record.** The grilling answers reach `check-definition` as JSON on stdin:
  `{ "actors": [], "applications": [], "flows": [{ "name": "", "reason": "" }] }`. It is held in
  memory and never written to disk.
- **D-04 `check-definition`.** Run as `run-asset scripts/feature-split.js --project <root> --
  check-definition --features-root <path> --feature-id <FTR-ID>` with the record on stdin. It prints
  `{ status, signals, flows, unevaluated }` where `status` is `"skipped"` (feature not new),
  `"not-flagged"` or `"flagged"`, `signals` holds each count against its minimum, `flows` is the list
  of D-02, and `unevaluated` names any signal that could not be evaluated.
- **D-05 Rejection.** If the user rejects, the feature continues as a standalone feature and
  checkpoint 2 (FTR-037) still runs for it later.
- **D-06 Editing.** Edits follow FTR-035 D-09 and D-10, including the foundation warning.
- **D-07 Summary and Keywords.** The agent derives each child's Keywords from the child's title and
  assigned grilling answers. The proposal shows Summary and Keywords as editable items.
- **D-08 Standalone registration.** When the agent writes a `feature.md` that is not split, it runs
  `register` (FTR-035 D-25). The Summary is the first sentence of the feature's Summary section. The
  agent derives the Keywords from the title and the main terms, shows them to the user, and lets the
  user edit them.
- **D-09 Child drafts.** At this checkpoint the parts assigned to each child are the relevant
  grilling answers.
- **D-10 Features root.** The agent resolves it with `ai-toolkit resolve-features-root` and never
  hard-codes a path.

## Open Questions
- None.

## Dependencies
- FTR-035 (configuration, new-feature test, proposal, apply, registry and the `feature-split.js`
  facade).
- The `define-feature` agent and its grilling flow.
