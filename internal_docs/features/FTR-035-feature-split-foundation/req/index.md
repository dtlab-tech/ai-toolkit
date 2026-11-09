# FTR-035 — Functional Requirements (Index)

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-035 — Feature Split Foundation: Configuration, New-Feature Test, Proposal, Atomic Apply and Registry |
| Version | 1.0 |
| Date | 2026-11-03 |
| Status | Draft |

> **Legend:** **Field** — document metadata item. **Value** — its content for this feature.

## 1. Introduction

### 1.1 Purpose

This document defines the functional requirements of FTR-035, the first of three features that split the oversized-feature epic FTR-034. It covers the shared base both size checkpoints depend on: the single configuration file and its loader, the single "is this feature new" test, the proposal model and its edit rules, the atomic creation of an epic record and its child feature folders, the registry entries that link them, and the read-side tolerance the Requirements and Tech-Spec generators need for the new registry lines. Everything is delivered as scripts with a fixed JSON contract that FTR-036 and FTR-037 call.

### 1.2 Scope

In scope:
- `src/claude/scripts/feature-split.config.json` (toolkit default) and the project override `feature-split.config.json` at the project root, read by one loader function.
- `isNewFeature`, the single new-feature test shared by both checkpoints.
- The proposal model (children, purposes, order, shared foundation) and its edit rules.
- Atomic creation of an epic record (`epic.md`) and its child feature folders.
- The feature registry: child entries with `Parent:` and `Depends on:`, the epic entry, standalone registration.
- The script `feature-split.js` with the commands `apply` and `register`, and the library functions that FTR-036 and FTR-037 call.
- Reader tolerance for the new registry lines in the Requirements and Tech-Spec generator agents (read side only).

Out of scope:
- Any change to `define-feature` or its skill (FTR-036), including the prompt and the `check-definition` command.
- Any change to `pm-phase1.js` or `implement-feature` (FTR-037), including the `check-size` command.
- Measuring a feature or evaluating grilling answers (FTR-036, FTR-037).
- Automatic execution of children in sequence; a child runs when the user starts it.
- Splitting a feature that is in progress or approved.
- Calibrating the threshold values (they are uncalibrated placeholders).

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| Calling feature script | Any caller of the library or of `feature-split.js` (`define-feature` in FTR-036, `pm-phase1`/`implement-feature` in FTR-037). Calls the loader, `isNewFeature`, proposal functions, `apply` and `register`. |
| User | The person who reviews a proposal, may edit it, and confirms it before apply. |
| Requirements and Tech-Spec generator agents | `gaia-generate-requirements` and `gaia-generate-tech-spec`. Read the registry and epic records; read side only. |
| Toolkit installer | Distributes the default configuration file with the `scripts` category. No change to the installer is required. |

> **Legend:** **Actor** — who or what takes part in a use case. **Description** — the role the actor plays in this feature.

## 2. Use Cases

| UC ID | Title | Actor | Priority | File |
|-------|-------|-------|----------|------|
| UC-01 | Load configuration | Calling feature script | Must | [use-cases/UC-01.md](use-cases/UC-01.md) |
| UC-02 | Decide whether a feature is new | Calling feature script | Must | [use-cases/UC-02.md](use-cases/UC-02.md) |
| UC-03 | Build and edit a proposal | Calling feature script; User | Must | [use-cases/UC-03.md](use-cases/UC-03.md) |
| UC-04 | Apply a confirmed split (initial split or late child) | Calling feature script; User (confirms) | Must | [use-cases/UC-04.md](use-cases/UC-04.md) |
| UC-05 | Register a standalone feature | Calling feature script | Must | [use-cases/UC-05.md](use-cases/UC-05.md) |
| UC-06 | Generator agents read registry entries and epic records | Requirements and Tech-Spec generator agents | Must | [use-cases/UC-06.md](use-cases/UC-06.md) |

> **Legend:** **UC ID** — unique identifier, referenced from Business Rules and Acceptance Criteria. **Title** — short label; the full flow is in the linked file. **Actor** — who or what initiates or participates. **Priority** — MoSCoW. **File** — the use case's own detail file.

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | The split is always a proposal. Nothing is applied unless the user has confirmed it. | UC-03, UC-04 |
| BR-02 | Child IDs are new and distinct: the next free FTR-NNN from the union of registry entries and feature folders. A child never reuses the parent ID or a suffixed form of it. | UC-04 |
| BR-03 | The shared foundation belongs to the first child in dependency order, and every later child depends on it. Moving it away is warned, never refused. Apply proceeds and records the warning in the shared-foundation row of `epic.md`. | UC-03, UC-04 |
| BR-04 | No threshold or tunable parameter is hard-coded. All are read from the configuration. | All UCs |
| BR-05 | The parent epic is a record and is never run as a pipeline. | UC-04, UC-06 |
| BR-06 | Dependency order follows the `dependsOn` lists. Where those lists leave two children unordered, proposal order decides between them. | UC-03, UC-04 |
| BR-07 | A missing child of an existing epic (parent folder holds `epic.md`) is created by apply in late mode. It is placed last, depends on the previous last child unless the user states another position, and its checkpoint is `late`. Late mode accepts exactly one child; `minChildren` applies to the initial split only. | UC-04 |
| BR-08 | Apply never overwrites an existing child folder or `feature.md`. `define-feature` refuses an ID whose `feature.md` already exists. | UC-04, UC-05 |
| BR-09 | The epic record is one file, `epic.md`. It lists each child exactly once with its checkpoint (`definition`, `measured` or `late`) and ends with the verbatim original feature text. No `epic.json` exists. After a split the parent's original `feature.md` is not kept separately. | UC-04 |
| BR-10 | No child is registered before `epic.md` exists. The registry is written last, by temp-and-rename, and an existing entry is never duplicated. | UC-04, UC-05 |
| BR-11 | Registry entries keep the existing format. Children carry `Parent:` (epic ID) and `Depends on:` (sibling IDs, or `none` for the first child). The epic entry changes in place to status `epic`. An entry with any other status is left untouched and is never treated as an epic. | UC-04, UC-05, UC-06 |
| BR-12 | Detail links: child and standalone entries link to their `feature.md`; the epic entry links to `epic.md`. | UC-04, UC-05 |
| BR-13 | A standalone feature is registered once with status `defined`. Its Summary is the first sentence of its Summary section; its Keywords are supplied by the caller. | UC-05 |
| BR-14 | Every path is resolved with `ai-toolkit resolve-features-root`. No script hard-codes `docs/features/` or `internal_docs/features/`. | All UCs |
| BR-15 | A feature is not new if its folder holds `{PREFIX}-Approvals.md`, a `wbs/` directory or `epic.md`. Generated `req/` and `spec/` do not make it non-new. A folder that exists but cannot be read is never treated as new. | UC-02 |
| BR-16 | A child name is a non-empty string that yields a valid folder slug, and two children may not share a slug. An edit that would leave fewer than `minChildren` children is refused. | UC-03 |
| BR-17 | A threshold is exceeded only when a count is strictly greater than it (checkpoint 2). A definition signal is raised when a count is at least its minimum (checkpoint 1). Both rules are exposed as named functions. | UC-01 |

> **Legend:** **ID** — unique identifier. **Rule** — the constraint itself. **Applies to** — the UC(s) it constrains, or "All UCs".

## 4. Data Requirements

### 4.1 Entities

- **Configuration.** Fields: `thresholds` with `useCases`, `acceptanceCriteria`, `components`, `estimatedPhases`; `definitionSignals` with `minActors`, `minApplications`, `minFlows`; `minChildren`. All values are integers, not negative. The toolkit default and the project override use this exact shape. The override may contain any subset; omitted keys keep the default. Relationship: the loaded configuration is copied into each proposal as `minChildren`.
- **Proposal.** Fields: `source` (`definition` or `measured`), `children`, `sharedFoundationOwner` (a child name or null), `foundationNote`, `minChildren`. Relationship: contains one or more Child records; the epic record is produced from it by apply.
- **Child.** Fields: `name` (unique slug-yielding string), `purpose` (one line), `summary` (equals the purpose line), `keywords` (caller-supplied), `dependsOn` (list of sibling names), `assigned` (free text describing the parts given to the child). Relationship: each child becomes one folder with one `feature.md` and one registry entry.
- **Epic record (`epic.md`).** One file in the parent folder. Contains a split table (child ID, order, dependencies, shared foundation, checkpoint per child) and the verbatim original feature text as a trailing section. Each child appears exactly once.
- **Registry entry.** Heading, `Keywords`, `Status` (`defined`, `completed` or `epic`), `Summary`, optional `Parent:` and `Depends on:` bold-key lines, and a Detail link. Relationship: a child entry points to its epic ID; the epic entry points to `epic.md`.
- **FeatureSplitError.** Fields: `code`, `key` (may be null), `file` (may be null). Raised by the loader, by the proposal functions and by apply; the caller stops on it.

> **Legend:** **Entity** — a data structure the feature reads or writes. **Fields / Relationship** — its contents and how it links to other entities.

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| `thresholds.*`, `definitionSignals.*`, `minChildren` | Must be integers and not negative. A non-integer or negative value is a loader error naming the key and the file. |
| Configuration keys | Exactly the keys of the D-02 shape. Any other key is a loader error naming the key and the file. |
| Project override file | Absent: no error. Present but malformed or unreadable: loader error naming the file. |
| Toolkit default file | Missing or unreadable: explicit error; the caller stops. |
| `source` | `definition` or `measured`. |
| Child `name` | Non-empty string; must yield a valid folder slug; unique slug within the proposal. |
| Child `dependsOn` | Each entry must be the name of a sibling child in the same proposal. |
| `sharedFoundationOwner` | A child name, or null. |
| Child count (initial split) | At least `minChildren`. |
| Child count (late mode) | Exactly one. |
| Registry `Status` | One of `defined`, `completed`, `epic`. Any other value leaves the entry untouched. |
| Registry `Depends on:` | Sibling IDs, or `none` for the first child. |

> **Legend:** **Field** — the data item or key validated. **Rule** — the condition it must meet; violations produce the error named in the rule.

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Reliability | On any error during apply, no staging directory, child folder, `epic.md` or registry change is left behind, and the error is reported. If rollback itself fails, the run ends in error and reports the exact remaining paths. |
| NFR-02 | Reliability | The registry is written by temp-and-rename. If it cannot be read or written, everything moved into place by the run is removed, nothing is registered, and the error is reported. |
| NFR-03 | Safety | An existing child ID or `feature.md` is never overwritten by apply or by `define-feature`. |
| NFR-04 | Maintainability | No threshold or tunable parameter is hard-coded in any script; the key names of D-02 are the only names used by the loader, the default file, the tests and the two dependent features. |
| NFR-05 | Interface | `feature-split.js` prints exactly one JSON object on stdout. It exits 0 on success and 1 on a `FeatureSplitError` or an operational error. |
| NFR-06 | Compatibility | Registry entries keep the existing format of `internal_docs/features/REGISTRY.md`. The registry is not converted to a table. |
| NFR-07 | Dependencies | No runtime dependency is added. Configuration is JSON. |
| NFR-08 | Distribution | The default configuration file is installed with the `scripts` category. No installer change is required. |

> **Legend:** **ID** — unique identifier. **Category** — the quality attribute. **Requirement** — the testable statement.

## 6. UI Requirements

N/A — internal/technical feature; no UI surface is introduced or changed. The split is shown to the user by the calling feature (FTR-036, FTR-037); this feature defines only the data returned.

### 6.1 Pages / Screens

N/A — no pages or screens are introduced by this feature.

### 6.2 Navigation Flow

N/A — no navigation is introduced by this feature.

## 7. Acceptance Criteria

| ID | Criterion | Related UC | Priority |
|----|-----------|-------------|----------|
| AC-01 | Given no project override exists and the toolkit default is readable, when `loadConfig(projectRoot)` is called, then it returns the D-02 shape with the default values and no error. | UC-01 | Must |
| AC-02 | Given a project override containing a subset of the D-02 keys, when it is loaded, then each omitted key keeps its toolkit default value. | UC-01 | Must |
| AC-03 | Given the project root has no `feature-split.config.json`, when the configuration is loaded, then no error is raised and the defaults are returned. | UC-01 | Must |
| AC-04 | Given the override contains a non-integer value, a negative value, or a key outside the D-02 shape, when it is loaded, then a `FeatureSplitError` is thrown whose `key` names the offending key and whose `file` names the override, and the caller stops. | UC-01 | Must |
| AC-05 | Given the override is malformed JSON or cannot be read, when it is loaded, then a `FeatureSplitError` is thrown with `file` set to the override path and `key` null, and no default-only result is returned. | UC-01 | Must |
| AC-06 | Given the toolkit default is missing or unreadable, when the configuration is loaded, then an explicit `FeatureSplitError` is thrown and the caller stops. | UC-01 | Must |
| AC-07 | Given a project root argument, when `loadConfig` runs, then the override is read only from `<projectRoot>/feature-split.config.json`. | UC-01 | Must |
| AC-08 | Given a count and a threshold, when `isOverThreshold(count, threshold)` is called, then it is true only if the count is strictly greater; given a count and a minimum, when `meetsMinimum(count, minimum)` is called, then it is true if the count is equal to or greater than the minimum. | UC-01 | Must |
| AC-09 | Given `ai-toolkit --local <empty dir>` is run, when the install completes, then `.claude/scripts/feature-split.config.json` exists, and the file exists in the `scripts` source directory that the installer copies. | UC-01 | Must |
| AC-10 | Given a feature folder containing `{PREFIX}-Approvals.md`, a `wbs/` directory or `epic.md`, when `isNewFeature(featureDir)` runs, then it returns `{ isNew: false, reason }`. | UC-02 | Must |
| AC-11 | Given a feature folder containing only generated `req/` and `spec/` (including after regeneration with `--force`), when `isNewFeature` runs, then it returns `isNew: true`. | UC-02 | Must |
| AC-12 | Given a feature folder path that does not exist, when `isNewFeature` runs, then it returns `isNew: true`. | UC-02 | Must |
| AC-13 | Given an existing feature folder that cannot be read, when `isNewFeature` runs, then it throws a `FeatureSplitError` and never returns `isNew: true`. | UC-02 | Must |
| AC-14 | Given children supplied to `buildProposal`, when the proposal is built, then it has exactly the D-08 shape, `source` is `definition` or `measured`, and `minChildren` equals the configured value. | UC-03 | Must |
| AC-15 | Given a child name that is empty, yields no valid folder slug, or shares a slug with another child, when the proposal is built or edited, then the child is rejected with a message naming the child. | UC-03 | Must |
| AC-16 | Given a proposal with exactly `minChildren` children, when a user edit would leave fewer, then `editProposal` refuses it and returns the proposal unchanged. | UC-03 | Must |
| AC-17 | Given the user moves `sharedFoundationOwner` away from the first child in dependency order, when `editProposal` runs, then the edit is applied and a warning is returned stating that BR-03 is broken and its consequence; the edit is not refused. | UC-03 | Must |
| AC-18 | Given children whose `dependsOn` lists leave them unordered relative to each other, when the dependency order is computed, then they keep their relative proposal order. | UC-03 | Must |
| AC-19 | Given a built or edited child, when shown in the proposal, then its Summary equals its one-line purpose and its Keywords are the caller-supplied values, and both can be edited. | UC-03 | Must |
| AC-20 | Given a proposal the user has not confirmed, when a caller builds or edits it, then no file, folder or registry entry is written. | UC-03 | Must |
| AC-21 | Given a confirmed proposal and a parent folder with no `epic.md`, when apply completes, then `epic.md`, one folder and `feature.md` per child, and the registry entries all exist. | UC-04 | Must |
| AC-22 | Given any error occurs during apply, when apply stops, then no staging directory, child folder, `epic.md` or registry change remains, and the error is reported. | UC-04 | Must |
| AC-23 | Given a rollback that itself fails, when apply ends, then the run ends in error and reports the exact remaining paths. | UC-04 | Must |
| AC-24 | Given a child ID whose folder or `feature.md` already exists, when apply runs, then it refuses with an error and the existing files are unchanged. | UC-04 | Must |
| AC-25 | Given children are assigned IDs, when apply runs, then each ID is the next free FTR-NNN from the union of registry entries and feature folders, is distinct from the other children and from the parent ID, and has no suffixed form. | UC-04 | Must |
| AC-26 | Given the shared foundation is not on the first child in dependency order, when apply runs, then apply proceeds and the shared-foundation row of `epic.md` records the BR-03 warning. | UC-04 | Must |
| AC-27 | Given apply completes, when `epic.md` is read, then its split table lists each child exactly once with order, dependencies, shared foundation and checkpoint (`definition`, `measured` or `late`), followed by the verbatim original feature text; no `epic.json` exists. | UC-04 | Must |
| AC-28 | Given apply completes, when a child's `feature.md` is read, then it contains the title, a summary taken from its purpose line, the parent epic ID, its dependency position and sibling dependencies, and its assigned parts; shared-foundation content appears only in the first child's file. | UC-04 | Must |
| AC-29 | Given apply completes, when a child's registry entry is read, then it has `Parent:` set to the epic ID, `Depends on:` set to sibling IDs (or `none` for the first child), Keywords, Status `defined`, a Summary, and a Detail link to its `feature.md`. | UC-04 | Must |
| AC-30 | Given apply completes, when the parent's registry entry is read, then it has been changed in place (not duplicated) to status `epic`, its Summary is the first sentence of the original Summary, its Keywords are the union of the children's Keywords, and its Detail links to `epic.md`. | UC-04 | Must |
| AC-31 | Given apply has written the files, when the registry is written, then it is written last by temp-and-rename, and no child is registered before `epic.md` exists. | UC-04 | Must |
| AC-32 | Given the registry cannot be read or written during apply, when apply stops, then all content moved into place by the run is removed, nothing is registered, and the error is reported. | UC-04 | Must |
| AC-33 | Given the parent folder has no registry entry, when apply runs, then it refuses before anything is staged and writes nothing. | UC-04 | Must |
| AC-34 | Given the parent folder holds `epic.md` and apply is called with `--parent` for one new child, when apply completes, then the child is placed last, depends on the previous last child unless the user states another position, is recorded in `epic.md` once with checkpoint `late`, and the minimum child count is not applied. | UC-04 | Must |
| AC-35 | Given a late child has been applied, when the registry and folders are read, then the epic entry's Keywords include the late child's Keywords and the existing children's entries and `feature.md` files are unchanged. | UC-04 | Must |
| AC-36 | Given apply succeeds, when `feature-split.js apply` finishes, then stdout is exactly one JSON object `{ epic, children: [{ id, dir }], registry: true }` and the exit code is 0; on a `FeatureSplitError` or operational error, the exit code is 1. | UC-04 | Must |
| AC-37 | Given a feature that is not split, when `register` runs with its folder and Keywords, then exactly one registry entry is created with Status `defined`, Summary equal to the first sentence of its Summary section, the supplied Keywords, and a Detail link to its `feature.md`; output is `{ id, status: "defined" }`. | UC-05 | Must |
| AC-38 | Given a registry entry already exists for the ID, when `register` runs again, then no duplicate entry is created. | UC-05 | Must |
| AC-39 | Given an existing registry entry for the ID whose status is neither `defined`, `completed` nor `epic`, when `register` or apply targets that ID, then the entry is left untouched, is not treated as an epic, and no duplicate is created. | UC-04, UC-05 | Must |
| AC-40 | Given the registry cannot be written during `register`, when the write fails, then the previous registry file is intact, nothing is registered, and the error is reported. | UC-05 | Must |
| AC-41 | Given a `feature.md` already exists for an ID, when apply or `register` is asked to create that ID, then the call refuses with an explicit error and the file is unchanged. | UC-04, UC-05 | Must |
| AC-42 | Given the registry file does not exist, when apply or `register` runs, then the registry is created. | UC-04, UC-05 | Must |
| AC-43 | Given a registry entry without `Parent:` or `Depends on:` lines, when a Requirements or Tech-Spec generator reads it, then it is treated as a standalone feature without error. | UC-06 | Must |
| AC-44 | Given a registry entry with status `epic`, when a generator reads it, then it is recognised as an epic record and is not run as a pipeline. | UC-06 | Must |
| AC-45 | Given a feature folder that holds `epic.md`, when a generator reads it, then it recognises `epic.md` as the parent record and does not generate requirements or a tech-spec for the epic itself. | UC-06 | Must |
| AC-46 | Given a registry entry with a status other than `defined`, `completed` or `epic`, when a generator reads it, then the entry is skipped and is not treated as an epic. | UC-06 | Must |

> **Legend:** **ID** — unique identifier, the anchor for traceability to the feature, the Work Breakdown and the Tech-Spec. **Criterion** — a testable Given/When/Then statement. **Related UC** — the UC(s) it belongs to. **Priority** — MoSCoW.

## 8. Dependencies and Assumptions

**External dependencies**
- FTR-021, FTR-024, FTR-025, FTR-026: split documents, their assemblers, and the generators that this feature teaches to read the new registry lines.
- FTR-034 (parent epic, status `epic`): its registry entry already exists, with its Detail pointing to `FTR-034-feature-split-epics/epic.md`.
- FTR-036 and FTR-037 depend on this feature. Their registry entries already exist (`Parent: FTR-034`, `Depends on: FTR-035`, status `defined`), and they call this feature's facade and library.
- Registry file: `internal_docs/features/REGISTRY.md`. Verified present. Observed entry format: heading `## FTR-NNN — Title`, bold keys `**Keywords:**`, `**Status:**`, `**Summary:**`, optional `**Parent:**` and `**Depends on:**`, and a `→ [Detail](path)` line. Entries are separated by `---`.
- `ai-toolkit resolve-features-root` for every path (BR-14).
- The Requirements and Tech-Spec generator agents (`gaia-generate-requirements`, `gaia-generate-tech-spec`), changed on the read side only.
- The toolkit installer, unchanged (NFR-08).

**Assumptions and decisions made to resolve open gaps (each to be confirmed at Gate 1)**
- A-01: `loadConfig` receives the project root as an explicit argument; the facade passes it from `--project`. The loader never infers the root from the working directory.
- A-02: A malformed or unreadable project override is a `FeatureSplitError` naming the file, following the D-04 policy. It is never silently replaced by defaults.
- A-03: Late mode is determined at apply time: when the parent folder holds `epic.md`, every child created by that apply has checkpoint `late`. The proposal's `source` is recorded but does not set the checkpoint in late mode.
- A-04: Late mode accepts exactly one child. `minChildren` applies to the initial split only.
- A-05: The dependency-order tie-break is proposal order (BR-06).
- A-06: The shared-foundation warning does not stop apply. It is recorded in the shared-foundation row of `epic.md` (BR-03).
- A-07: An existing feature folder that cannot be read is an error and is never treated as new (BR-15).
- A-08: If the parent has no registry entry, apply refuses before staging anything (AC-33).
- A-09: The epic entry's Detail links to `epic.md`, as the existing FTR-034 entry does. This follows from D-14, under which the parent `feature.md` is not kept.
- A-10: The registry location is `internal_docs/features/REGISTRY.md` (verified). `feature.md` states "Open Questions: None"; it must be updated at Gate 1 to list the items in Section 9.
- A-11: The `define-feature` refusal for an existing `feature.md` (BR-08, AC-41) is wired by FTR-036. This feature's library and apply refuse existing IDs themselves.
- A-12: The writer format is unchanged. UC-06 is the only read-side change.

> **Legend:** Bullet lists; each item is one dependency or assumption. Items marked A-NN are referenced from the use cases and must be confirmed or replaced at Gate 1.

## 9. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| 1 | When a feature with generated `req/` and `spec/` folders is split, should those folders be removed, moved into the epic folder, or should the split be refused? D-14 requires the parent folder to hold only `epic.md`, but deleting generated documents is not decided. | Destructive if wrong; determines whether apply can run on a feature with generated documents, and what UC-04 and its ACs must state. | Decide at Gate 1. Options: (a) remove them; (b) move them into the epic folder; (c) refuse the split while they exist. No AC is added until the decision is recorded. |
| 2 | When `register` is called for an ID whose entry already exists with a status other than `defined`, what does it print? | The calling feature (FTR-036) cannot tell whether the entry was registered or left alone. | Print `{ id, status: <existing status> }` with exit 0, and confirm at Gate 1. |

> **Legend:** **#** — question number. **Question** — what is unresolved. **Impact** — consequence if left open. **Suggested resolution** — the proposed decision, or "open — deferred".