# Feature Split Foundation: Configuration, New-Feature Test, Proposal, Atomic Apply and Registry

## Feature ID
FTR-035

## Parent epic
FTR-034 (Feature Split for Oversized Features). Position 1 of 3 in the dependency order. Depends on
no sibling. FTR-036 and FTR-037 depend on this feature.

## Summary
Builds the shared base that both size checkpoints of FTR-034 stand on: the single configuration
file and its loader, the single "is this feature new" test, the proposal model with its edit rules,
the atomic creation of an epic and its children, and the registry and epic record that link them.
It adds no prompt to `define-feature` and no hook to the pipeline: those are FTR-036 and FTR-037.
Everything here is a script that other features call, with a fixed JSON contract.

## Problem Statement
The pipeline accepts a feature of any size, and an oversized one (FTR-003 on a client project:
10 use cases, 51 components, 123 tasks, about $127 projected) cannot be split without hand work.
FTR-034 was too large to run as one feature itself: three full pipeline runs of three validation
cycles never converged, and its Work Breakdown contradicted itself on configuration key names, the
build-order format and the contracts between tasks. This feature is the first slice of that split
and fixes those contracts in one place.

## Scope
In scope:
- `src/claude/scripts/feature-split.config.json`: the toolkit default, and the project override
  `feature-split.config.json` at the project root, read by one function.
- `isNewFeature`: the single test shared by both checkpoints.
- The proposal model (children, purposes, order, shared foundation) and its edit rules.
- Atomic creation of an epic record and its child feature folders.
- The feature registry: child entries with `Parent:` and `Depends on:`, the epic entry, standalone
  registration.
- The script `feature-split.js` with the commands `apply` and `register`, and the library functions
  FTR-036 and FTR-037 call.
- Reader tolerance for the new registry lines in the Requirements and Tech-Spec generator agents.

Out of scope:
- Any change to `define-feature` or its skill (FTR-036).
- Any change to `pm-phase1.js` or `implement-feature` (FTR-037).
- Measuring a feature or evaluating grilling answers (FTR-036, FTR-037).
- Automatic execution of children in sequence. A child runs when the user starts it.
- Splitting a feature that is in progress or approved.
- Calibrating the threshold values.

## Core Flow
- **UC-01 — Load configuration.** A caller asks for the configuration. The loader reads the toolkit
  default, overlays the project override if it exists, validates the result and returns it.
- **UC-02 — Decide whether a feature is new.** A caller passes a feature folder. `isNewFeature`
  returns whether the feature has progressed past documentation review.
- **UC-03 — Build and edit a proposal.** A caller builds a proposal from children it supplies. The
  user may edit it. The module enforces the edit rules and warns about the shared foundation.
- **UC-04 — Apply a confirmed split.** A confirmed proposal creates the epic record, one folder and
  `feature.md` per child, and the registry entries, atomically.
- **UC-05 — Register a standalone feature.** A feature that is not split gets one registry entry
  with status `defined`.

## Business Rules
- BR-01: the split is always a proposal. Nothing in this feature applies a proposal that the user
  has not confirmed.
- BR-02: child IDs are new and distinct (the next free FTR-NNN from the union of registry and
  folders). A child never reuses the parent ID or a suffixed form of it.
- BR-03: the shared foundation belongs to the first child in dependency order and every later child
  depends on it.
- BR-04: no threshold or tunable parameter is hard-coded. All are read from the configuration.
- BR-05: the parent epic is a record and is not run as a pipeline.

## Decisions

### Configuration
- **D-01 Format.** JSON. The toolkit has no runtime dependencies and a YAML parser would be the
  first.
- **D-02 Shape and key names.** The file has exactly this shape, for the toolkit default and for the
  project override:
  `{ "thresholds": { "useCases": 8, "acceptanceCriteria": 15, "components": 30, "estimatedPhases": 6 },
  "definitionSignals": { "minActors": 2, "minApplications": 2, "minFlows": 3 }, "minChildren": 2 }`.
  The loader, the default file, the tests and the other two features use these names and no others.
  The values are uncalibrated placeholders; calibrating them is out of scope.
- **D-03 Overlay.** The project override may contain any subset of the keys. Keys it omits keep the
  toolkit default value. A missing override file is not an error.
- **D-04 Failures.** A missing or unreadable toolkit default stops with an explicit error. A
  non-integer or negative value, or a key that is not in the shape of D-02, is a loader error that
  names the key and the file, and the caller stops. The error type is `FeatureSplitError` with the
  fields `code`, `key` and `file`.
- **D-05 Comparison rules.** Checkpoint 2 thresholds: a count is over its threshold when it is
  strictly greater; a count equal to the threshold passes. Checkpoint 1 definition signals: each
  value is the minimum count that raises the flag ("at least N"). The loader exposes both rules as
  two named functions, `isOverThreshold(count, threshold)` and `meetsMinimum(count, minimum)`, so
  no caller restates them.
- **D-06 Distribution.** The default file is installed with the rest of the `scripts` category. The
  installer's only blocked extension is `.test.js`, and the tests live under `tests/scripts/`,
  outside the installed tree. No installer change is needed. A test asserts the file exists in the
  `scripts` source directory, which is what the installer copies, and a second asserts that
  `ai-toolkit --local <empty dir>` places it under `.claude/scripts/`.

### New-feature test
- **D-07 Rule.** `isNewFeature(featureDir)` returns `{ isNew, reason }`. A feature is not new if its
  folder contains `{PREFIX}-Approvals.md`, a `wbs/` directory or an `epic.md`. Generated `req/` and
  `spec/` do not make a feature non-new, and regenerating them with `--force` keeps it new. A
  folder that does not exist yet is new. The test does not look for executor runs: an executor run
  needs a Work Breakdown and an approval record, so the two checks above already cover it, and
  executor runs are stored in the git common directory, not in the feature folder.

### Proposal
- **D-08 Shape.** A proposal is
  `{ source, children, sharedFoundationOwner, foundationNote, minChildren }` where `source` is
  `"definition"` or `"measured"`, each child is
  `{ name, purpose, summary, keywords, dependsOn, assigned }`, `dependsOn` lists sibling names,
  `assigned` is free text describing the parts given to the child, and `sharedFoundationOwner` is a
  child name or null. `minChildren` is copied from the configuration.
- **D-09 Edits.** The user may edit child names, purposes, order and the shared-foundation
  assignment, and may add, remove or merge children, as long as at least `minChildren` remain. An
  edit that would leave fewer is refused. An edited proposal is not re-measured: once confirmed it
  is applied as edited.
- **D-10 Foundation warning.** If the user moves the shared foundation away from the first child,
  the module returns a warning that BR-03 is broken and states the consequence. The edit is never
  refused for this reason.
- **D-11 Summary and Keywords.** A child's Summary is its one-line purpose. Its Keywords are supplied
  by the caller from the child's title and assigned content. Both appear in the proposal and can be
  edited like any other field.
- **D-12 Names.** A child name must be a non-empty string that yields a valid folder slug. Names that
  do not are rejected with a message. Two children may not have the same slug.

### Apply and epic record
- **D-13 Atomic creation.** Everything is written to a staging directory first, a dot-prefixed
  directory directly under the features root named `.split-staging-<run id>`, and moved into place
  with single renames on the same volume. On any error nothing is left behind and the error is
  reported. The one exception is a filesystem failure during the rollback itself: the run then ends
  in error and reports the exact paths that remain. An existing child ID is an error, never
  overwritten. The staging directory is removed when the run ends.
- **D-14 Epic record.** The epic record is one file, `epic.md`, with the split table (children,
  order, dependencies, shared foundation, and the checkpoint that produced each child: `definition`,
  `measured` or `late`) and the verbatim original feature text as a trailing section. It lists each
  child exactly once. There is no `epic.json`. After a split the parent folder holds only
  `epic.md`; the parent's original `feature.md` is not kept separately.
- **D-15 Child draft.** Each child's `feature.md` has its title, a summary from its purpose line, the
  parent epic ID, its dependency position and sibling dependencies, and the parts assigned to it.
  Shared-foundation content goes to the first child.
- **D-16 Late child.** A missing child of an existing epic is created by `define-feature` with the
  same `apply` command. It is placed last in the dependency order and depends on the previous last
  child, unless the user states another position. Its checkpoint value in `epic.md` is `late`.
- **D-17 Re-defining an existing ID.** `define-feature` on a feature ID whose `feature.md` already
  exists refuses with an explicit error and never overwrites it.

### Registry
- **D-18 Format.** Entries keep the existing format of `internal_docs/features/REGISTRY.md`
  (heading, `Keywords`, `Status`, `Summary`, `Detail`). Children gain two bold-key lines: `Parent:`
  (the epic ID) and `Depends on:` (sibling IDs, or `none` for the first child). `Status` is one of
  `defined`, `completed`, `epic`. An entry with any other status is left untouched and is not treated
  as an epic. The registry is not converted to a table. `Detail` is a generated link to the entry's
  `feature.md`.
- **D-19 Epic entry.** The epic's entry is changed in place to status `epic` (not duplicated). Its
  Summary is the first sentence of the original Summary and its Keywords are the union of its
  children's Keywords.
- **D-20 Standalone entry.** A feature that is not split is registered when its `feature.md` is
  written, with status `defined`. Its Summary is the first sentence of its Summary section, and its
  Keywords are supplied by the caller (`define-feature` derives them and shows them for editing).
- **D-21 Write.** The registry is written last, with a temp-and-rename step. No child is registered
  before `epic.md` exists. If the registry cannot be read or written, everything moved into place by
  the run is removed, nothing is registered, and the error is reported. A missing registry is
  created. A re-run does not duplicate an existing entry.
- **D-22 Features root.** Every path is resolved with `ai-toolkit resolve-features-root`. No script
  hard-codes `docs/features/` or `internal_docs/features/`.

### Interface contract for the other two features
- **D-23 Facade.** `feature-split.js` is run through `run-asset scripts/feature-split.js --project
  <root> -- <command> [options]`. It prints one JSON object on stdout and exits 0 on success, 1 on a
  `FeatureSplitError` or an operational error. FTR-035 provides `apply` and `register`.
  FTR-036 adds `check-definition`. FTR-037 adds `check-size`. The library exports `loadConfig`,
  `isNewFeature`, `isOverThreshold`, `meetsMinimum`, `buildProposal`, `editProposal` and
  `FeatureSplitError`.
- **D-24 `apply`.** Reads a confirmed proposal as JSON on stdin and takes `--features-root` and
  `--parent <FTR-ID>`. It prints `{ epic, children: [{ id, dir }], registry: true }`.
- **D-25 `register`.** Takes `--features-root`, a feature directory and Keywords, and prints
  `{ id, status: "defined" }`.

## Open Questions
- None.

## Dependencies
- FTR-021, FTR-024, FTR-025, FTR-026 (split documents and their assemblers; the generators this
  feature teaches to read the new registry lines).
- The feature registry `internal_docs/features/REGISTRY.md` and `ai-toolkit resolve-features-root`.
- The Requirements and Tech-Spec generator agents (`gaia-generate-requirements`,
  `gaia-generate-tech-spec`), changed on the read side only.
