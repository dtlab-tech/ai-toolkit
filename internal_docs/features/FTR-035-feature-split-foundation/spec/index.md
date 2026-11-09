# Technical Specification — FTR-035 Feature Split Foundation: Configuration, New-Feature Test, Proposal, Atomic Apply and Registry

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-035 — Feature Split Foundation: Configuration, New-Feature Test, Proposal, Atomic Apply and Registry |
| Version | 1.0 |
| Date | 2026-11-03 |
| Status | Draft |

## 1. Overview

FTR-035 is position 1 of 3 in the feature-split epic FTR-034. It builds the shared base that both size checkpoints stand on, delivered as one script with a fixed JSON contract and a small library:

- one JSON configuration file (toolkit default plus optional project override) and its loader (`loadConfig`, with the comparison functions `isOverThreshold` and `meetsMinimum`);
- one new-feature test, `isNewFeature`;
- a proposal model (`buildProposal`, `editProposal`) with edit rules and a shared-foundation warning;
- atomic creation of an epic record (`epic.md`) and its child feature folders (`apply`, initial split and late child);
- registry entries that link children to their epic (`Parent:`, `Depends on:`) and register standalone features (`register`);
- the facade `feature-split.js` with the stdout and exit contract of NFR-05.

Systems affected: the toolkit scripts category (`src/claude/scripts/`), the two generator agents (read side only), the feature registry, and the feature folders under the features root. No existing script behaviour changes. The installer needs no change: the `scripts` category already copies `.json` and `.js` files and blocks only `.test.js` (D-06).

Decisions fixed at this level so that every component design follows one rule:

- **Epic record location.** No epic folder is created. The parent feature folder keeps its name, holds only `epic.md` after a split, and its child folders are siblings of it under the features root (D-14, AC-21).
- **Apply and BR-03.** `apply` never refuses a shared-foundation violation. It records the warning in the shared-foundation row of `epic.md` and proceeds (BR-03, BR-11, AC-26). Requirements UC-04 step 4 and error flow E2 are to be aligned to this rule (see Section 12).
- **Late child.** A parent folder holding `epic.md` (and no `feature.md`) is a late-child target. `apply` runs in late mode for it (D-16, BR-07, AC-34). Late mode is chosen from the folder content at apply time; no per-child checkpoint input is needed, because apply itself writes `late` (A-03).
- **Registry format.** The on-disk format is the one observed in `internal_docs/features/REGISTRY.md`: heading `## FTR-NNN — Title` (em dash), bold-key lines `**Keywords:**`, `**Status:**`, `**Summary:**`, a `→ [Detail](<relative path>)` line, entries separated by `---`. Children add `**Parent:**` and `**Depends on:**` lines. This is the verified format; it supersedes any assumed format in component designs.

## 2. Architecture

### 2.1 System Context

The toolkit ships scripts under `src/claude/scripts/`. The installer (`bin/cli.js`) copies the `scripts` category to `.claude/scripts/` in a consuming project. Scripts run through `ai-toolkit run-asset scripts/feature-split.js --project <root> -- <command> [options]`. `run-asset` accepts only the `scripts/` category and `.js` files, so `feature-split.js` is the only executable entry point. The configuration JSON is read as data by the loader.

Reference points:
- `bin/cli.js` provides `resolve-features-root`. Every path in this feature is obtained through it (BR-14, D-22). No script hard-codes `docs/features/` or `internal_docs/features/`.
- The workflow-side CLI scripts (`wb-*`, `req-*`, `tech-spec-*`) are the model for a script that prints one JSON object.
- The split-document family (FTR-021, FTR-024, FTR-025, FTR-026) defines the Requirements and Tech-Spec generators that must read the new registry lines.

Callers in later features:
- FTR-036 (`define-feature`): `loadConfig`, `isNewFeature`, `buildProposal`, `editProposal`, `register`, and `apply` for late children; plus its own `check-definition` command.
- FTR-037 (`pm-phase1` / `implement-feature`): `loadConfig`, `isNewFeature`; plus its own `check-size` command.

### 2.2 Component Diagram

```
[src/claude/scripts/feature-split.config.json]  --(read as data)-->      [feature-split.js : loadConfig]
[<project root>/feature-split.config.json]      --(optional overlay)--> [feature-split.js : loadConfig]
[feature-split.js : loadConfig] --(config)--> [isNewFeature | isOverThreshold | meetsMinimum | buildProposal | editProposal]
[caller] --(proposal held by caller, nothing written)--> [feature-split.js : buildProposal / editProposal]
[caller] --(confirmed proposal JSON on stdin)--> [feature-split.js : apply]
[feature-split.js : apply] --(.split-staging-<run id>, same-volume renames)--> [features root: child folders; parent folder: epic.md]
[feature-split.js : apply / register] --(REGISTRY.md.tmp-<run id> + rename)--> [features root: REGISTRY.md]
[ai-toolkit resolve-features-root] --(features root)--> [feature-split.js]
[run-asset scripts/feature-split.js] --(args / stdin)--> [feature-split.js] --(one JSON object on stdout)--> [caller]
[gaia-generate-requirements / gaia-generate-tech-spec] --(read only: Parent:, Depends on:, Status; epic.md)--> [features root: REGISTRY.md, parent epic.md]
```

### 2.3 Sequence Diagrams

**Flow A — Load configuration (UC-01)**
```
Caller -> loadConfig(projectRoot)                          (root passed explicitly, A-01)
loadConfig -> toolkit default: read JSON
              missing or unreadable -> CONFIG_MISSING (FeatureSplitError, no fallback)
loadConfig -> <projectRoot>/feature-split.config.json: if absent -> no error, defaults used
              present but unreadable or malformed JSON -> CONFIG_INVALID, key null, file = override path (A-02, AC-05)
loadConfig -> validate each file: exact D-02 keys only; integers >= 0
              violation -> CONFIG_INVALID, key and file named (AC-04)
loadConfig -> merge leaf by leaf (override wins; omitted keys keep the default) -> return config
```

**Flow B — New-feature test (UC-02)**
```
Caller -> isNewFeature(featureDir)
  folder does not exist                              -> { isNew: true, reason: "folder does not exist yet" }
  folder exists but cannot be read                   -> throws FeatureSplitError (CONFIG-free code FEATURE_UNREADABLE); never isNew: true (A-07, AC-13)
  contains {PREFIX}-Approvals.md                     -> { isNew: false, reason names the marker }
  contains wbs/ directory                            -> { isNew: false, reason names the marker }
  contains epic.md                                   -> { isNew: false, reason names the marker }
  none of these (req/ and spec/ ignored)             -> { isNew: true, reason: "no non-new marker found" }
```
If more than one marker is present, the first one found in the order above is named in the reason.

**Flow C — Build and edit a proposal (UC-03)**
```
Caller -> buildProposal(children, source, config)
  checks: names and slugs (INVALID_NAME, DUPLICATE_SLUG); dependsOn names existing siblings (UNKNOWN_DEPENDENCY);
          no cycles, self-reference included (DEPENDENCY_CYCLE); count >= minChildren (TOO_FEW_CHILDREN)
  order:  topological by dependsOn; ties broken by proposal order (BR-06, AC-18)
  owner:  first child in that order unless the caller names another
  warnings (BR-03), not errors:
          owner is not the first child in order, or is null;
          a later child does not depend on the owner, directly or through a chain of dependsOn (transitive)
  returns { proposal, warnings }; writes nothing (AC-20)
Caller -> editProposal(proposal, edits, config)
  applies edits to a copy and re-runs every check above
  any failed check -> refused; the caller's proposal is unchanged (AC-16)
  BR-03 warnings -> accepted and returned, never refused for this reason (D-10, AC-17)
```

**Flow D — Apply a confirmed split (UC-04)**

Mode is selected from the parent folder's content:
- **Initial split:** the parent folder holds `feature.md` and no `epic.md`.
- **Late child (D-16):** the parent folder holds `epic.md` and no `feature.md`. The proposal must contain exactly one child (`LATE_CHILD_COUNT`). `minChildren` and `source` do not apply.
- Both files present, or neither present: `PARENT_INVALID`, nothing written. (A split never produces the first state; no mode is guessed.)

Steps, in order:
```
0. Pre-check: resolve the features root (E9). Look for leftovers in the features root:
   .split-staging-* directories and REGISTRY.md.tmp-* files. Any found -> STAGING_LEFTOVER, listing the
   paths; nothing is written. Leftovers are never removed automatically (Section 12, stale-staging decision).
1. Read the proposal JSON from stdin; check its D-08 shape (invalid JSON or wrong shape -> INVALID_PROPOSAL).
2. Determine the mode from the parent folder (rules above).
   Initial mode only:
   - isNewFeature(parent) must report isNew: true; otherwise PARENT_INVALID (splitting an in-progress or
     approved feature is out of scope, feature.md Scope);
   - the parent folder must not hold req/ or spec/ until Open point 1 (Section 12) is decided; interim
     behaviour: PARENT_INVALID, nothing written.
3. Parent registry entry: it must exist (no entry -> PARENT_INVALID, nothing staged; AC-33, A-08).
   Initial mode: its Status must be `defined` (otherwise REGISTRY_STATUS). Late mode: its Status must be `epic`.
4. Validate names, slugs (against the proposal and, in late mode, the children listed in epic.md), dependsOn,
   cycles. Initial mode: count >= minChildren (TOO_FEW_CHILDREN). Late mode: dependsOn names must be children
   listed in epic.md (UNKNOWN_DEPENDENCY otherwise).
5. Compute the dependency order (topological, proposal-order tie-break, AC-18). Run the BR-03 check exactly as in
   Flow C. A violation is a warning recorded in the shared-foundation row of epic.md; it does NOT stop the run
   (BR-11, AC-26). Apply uses the warnings from this check; it does not re-measure.
6. Assign IDs (BR-02, AC-25). Next free ID = the highest FTR-NNN number over the union of registry headings and
   folder names under the features root, plus 1, assigned in dependency order (three-digit padding as existing
   IDs). Each ID is distinct from the other children and from the parent ID. If any assigned ID already exists
   as a folder, feature.md or registry heading -> TARGET_EXISTS, nothing written (AC-24).
7. Stage under <features root>/.split-staging-<run id>/ (run id = random hex, created with the directory):
   - one folder per child, named <ID>-<slug>, containing feature.md with: title, summary (the purpose line),
     parent epic ID, dependency position, sibling dependencies (IDs, or "none" for the first child), assigned
     parts (D-15, AC-28). Shared-foundation content is written only to the first child in dependency order;
   - initial mode: epic.md containing the split table (below) and, as the trailing section, the verbatim
     original feature.md text. A copy of the original feature.md is staged as the rollback copy only;
   - late mode: the existing epic.md copied with the new child row inserted directly after the last child row,
     the foundation row and every existing row unchanged; the existing epic.md is staged as the rollback copy.
8. Move into place with same-volume renames only:
   a. each staged child folder -> <features root>/<ID>-<slug>/ (siblings of the parent folder);
   b. initial mode: the parent's feature.md -> staging (rename, not delete);
      late mode: the existing epic.md -> staging (rename);
   c. the staged epic.md -> parent folder.
   No epic folder is created. The parent folder keeps its name and holds only epic.md afterwards (D-14).
9. Registry, last (D-21, BR-10). Read <features root>/REGISTRY.md (missing -> created). Build the new content in
   memory, then write REGISTRY.md.tmp-<run id> and rename it over REGISTRY.md:
   - each new child: a new entry appended after the last entry with heading `## <ID> — <title>`, Keywords (caller
     supplied via the proposal), `**Status:** defined`, Summary (purpose line), `**Parent:** <epic ID>`,
     `**Depends on:** <sibling IDs or none>`, and `→ [Detail](<parent folder>/<child folder>/feature.md)`;
     an entry whose ID already exists is not added again (AC-29, AC-31);
   - initial mode: the parent's entry is changed in place (not duplicated) to `**Status:** epic`; its Summary is
     the first sentence of the parent's Summary; its Keywords are the union of the children's Keywords; its Detail
     is `→ [Detail](<parent folder>/epic.md)` (Section 12, resolved epic Detail target; AC-30);
   - late mode: the epic entry's Summary is unchanged; its Keywords are recomputed as the union of the Keywords of
     all children listed in epic.md, read from their registry entries (AC-35). The existing child entries are
     unchanged.
   A failure to read or write the registry -> REGISTRY_IO and the rollback below (AC-32).
10. Remove the staging directory and any remaining temp file. Print
    { "epic": "<parent ID>", "children": [{ "id": "<ID>", "dir": "<absolute path>" }], "registry": true } and exit 0.
```

Split table in epic.md (initial mode and maintained in late mode):

| Order | ID | Name | Depends on | Checkpoint | Note |
|-------|----|------|-----------|-----------|------|
| 1 | FTR-NNN | <child name> | none | definition / measured / late | |
| … | … | … | … | … | |
| — | — | Shared foundation | owner: FTR-NNN | — | BR-03 warning text, or "none" |

Rollback (E7, E8), applied to every failure after step 7:
```
- move each child folder already moved into place back to staging
- initial mode: move the parent's feature.md copy from staging back into the parent folder; remove the new epic.md
- late mode: remove the new epic.md; move the saved epic.md back into the parent folder
- remove REGISTRY.md.tmp-<run id> if it exists; REGISTRY.md is not changed
- remove the staging directory
- if any step in this sequence fails: end in ROLLBACK_FAILED and report every path that remains (NFR-01, AC-23)
```

**Flow E — Register a standalone feature (UC-05)**
```
Caller -> register --features-root <root> <feature-dir> --keywords <list>
  feature.md missing, or no Summary section              -> error REGISTRY_IO-free code INVALID_PROPOSAL-free: FEATURE_INVALID; registry untouched
  epic.md present in the feature folder                  -> PARENT_INVALID (epics are registered by apply)
  registry has an entry for the ID with Status defined   -> no change; output { id, status: "defined" } (AC-38)
  registry has an entry for the ID with any other status -> REGISTRY_STATUS; entry untouched; no duplicate (AC-39)
  no entry                                               -> append one entry (Status defined, Summary = first sentence
                                                            of the Summary section, caller Keywords, Detail to feature.md,
                                                            no Parent:/Depends on: lines); write REGISTRY.md.tmp-<run id>
                                                            then rename (AC-37, AC-40); output { id, status: "defined" }
  REGISTRY.md missing                                    -> created (AC-42)
```
First sentence = the text up to the first period followed by whitespace.

**Interface contract (feature-wide)**
- Stdout: exactly one JSON object. Success: exit 0 with the command's object. Failure: exit 1 with `{ "error": { "code", "key", "file", "message" } }` (NFR-05, AC-36).
- Error codes used in this feature: `CONFIG_MISSING`, `CONFIG_INVALID`, `FEATURE_UNREADABLE`, `FEATURE_INVALID`, `INVALID_PROPOSAL`, `INVALID_NAME`, `DUPLICATE_SLUG`, `TOO_FEW_CHILDREN`, `LATE_CHILD_COUNT`, `UNKNOWN_DEPENDENCY`, `DEPENDENCY_CYCLE`, `PARENT_INVALID`, `TARGET_EXISTS`, `REGISTRY_STATUS`, `REGISTRY_IO`, `STAGING_LEFTOVER`, `ROLLBACK_FAILED`.
- Library exports: `loadConfig`, `isNewFeature`, `isOverThreshold`, `meetsMinimum`, `buildProposal`, `editProposal`, `FeatureSplitError` (fields `code`, `key`, `file`).
- Commands in this feature: `apply` and `register`. `check-definition` (FTR-036) and `check-size` (FTR-037) are not part of this feature.

## 3. Backend

_Per-component detail — see Section 9's Components table and each component's own design file
(generated separately, one call per component). Do not write any content here._

## 4. Frontend

_Per-component detail — see Section 9's Components table and each component's own design file
(generated separately, one call per component). Do not write any content here._

## 5. External Integrations

_Per-component detail — see Section 9's Components table and each component's own design file
(generated separately, one call per component). Do not write any content here._

## 6. Security Considerations

- **Path safety.** Child names become folder slugs under the features root. A slug must reject path separators, `..`, empty strings, and Windows reserved device names (CON, PRN, AUX, NUL, COM1–9, LPT1–9). Only the slug is joined into a path; the raw name is never joined (D-12, AC-15).
- **Trusted inputs.** The proposal arrives as JSON on stdin and parameters come from the caller. The script never passes them to a shell and never evaluates them. Parse failures are refused before any write (INVALID_PROPOSAL).
- **Overwrite protection.** No existing `feature.md`, child folder or `epic.md` is overwritten. Renames onto an existing target are refused (TARGET_EXISTS, D-13, D-17, BR-08). `define-feature`'s own D-17 refusal is wired by FTR-036 (A-11).
- **Sensitive data.** The original feature text, which may hold internal requirements, is copied verbatim into `epic.md`. It stays inside the features root and is handled like the original `feature.md`. Nothing is sent over a network.
- **Project override trust.** The override is read only from `<projectRoot>/feature-split.config.json` (AC-07). It is validated against the D-02 shape. Unknown keys, non-integer or negative values, and malformed JSON are refused with the key and file named (D-04), so a malformed override cannot change behaviour silently.
- **Input validation boundaries.** Thresholds and `minChildren` are integers >= 0. `dependsOn` entries must name existing siblings (or existing epic children in late mode). The dependency graph must be acyclic. These checks run in both `buildProposal`/`editProposal` and `apply`, so a stale or hand-edited proposal cannot bypass them.
- **Registry integrity.** `REGISTRY.md` is rewritten only through a temp file and a rename, so a failed write never leaves a half-written registry.
- **CORS.** Not applicable: local script, no HTTP surface.

## 7. Database Changes

No database is involved. The persistent changes are files:

- **Parent folder:** after an initial split it holds only `epic.md` (the original `feature.md` is not kept; the rollback copy lives only in staging until the run succeeds) (D-14, BR-09).
- **Child folders:** `<ID>-<slug>/feature.md`, siblings of the parent folder (D-15).
- **Registry (`REGISTRY.md`):** entries keep the existing format. Children add `**Parent:**` and `**Depends on:**` lines. The parent entry changes in place to `**Status:** epic` (D-18, D-19). The registry stays a list of entries, not a table (NFR-06).
- **Indexes:** none. The registry is read and rewritten in full, which is adequate for its size.
- **Seed data:** none.
- **Migration strategy:** none. Existing entries are untouched and existing features are not split retroactively. Entries without `Parent:` or `Depends on:` are standalone (read-side tolerance in the generators).

## 8. Configuration

- **Toolkit default:** `src/claude/scripts/feature-split.config.json` in the D-02 shape:
  `{ "thresholds": { "useCases": 8, "acceptanceCriteria": 15, "components": 30, "estimatedPhases": 6 }, "definitionSignals": { "minActors": 2, "minApplications": 2, "minFlows": 3 }, "minChildren": 2 }`.
  These are uncalibrated placeholders; calibration is out of scope (BR-04).
- **Project override:** `feature-split.config.json` at the project root. Optional. Any subset of the D-02 keys is allowed (D-03).
- **Environment variables:** none.
- **App settings:** none. The file is installed with the `scripts` category; no installer change (NFR-08, D-06).
- **Feature flags:** none.
- **Paths:** the features root and the registry location come from `ai-toolkit resolve-features-root` (D-22). Nothing is configured here.

## 9. File Inventory

Complete list of files to create or modify:

### New files
| Path | Purpose | Addresses | Domain | Spec |
|------|---------|-----------|--------|------|
| src/claude/scripts/feature-split.config.json | Toolkit default configuration in the D-02 shape; read by the loader and installed with the scripts category | AC-01, AC-02, AC-09 | INFRA | [components/feature-split.config.json.md](components/feature-split.config.json.md) |
| src/claude/scripts/feature-split.js | Loader and FeatureSplitError, comparison functions, isNewFeature, buildProposal and editProposal with edit rules and BR-03 warnings, apply (initial and late mode, staging, renames, epic.md, registry, rollback), register, and the facade with the JSON stdout and exit contract. Registry lines follow the verified REGISTRY.md format (`## FTR-NNN — Title`, `**Key:**` lines, `→ [Detail](...)`) | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-31, AC-32, AC-33, AC-34, AC-35, AC-36, AC-37, AC-38, AC-39, AC-40, AC-41, AC-42 | BE | [components/feature-split.js.md](components/feature-split.js.md) |
| tests/scripts/feature-split.test.js | Unit and integration tests for the loader, isNewFeature, proposal rules, apply (initial, late, rollback, staging leftovers) and register; asserts the facade's stdout and exit contract | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-31, AC-32, AC-33, AC-34, AC-35, AC-36, AC-37, AC-38, AC-39, AC-40, AC-41, AC-42 | TEST | [components/feature-split.test.js.md](components/feature-split.test.js.md) |
| tests/scripts/feature-split-install.test.js | Asserts the default file exists in the scripts source directory and that `ai-toolkit --local <empty dir>` places it under `.claude/scripts/` | AC-09 | TEST | [components/feature-split-install.test.js.md](components/feature-split-install.test.js.md) |
| tests/frontmatter/registry-reader-tolerance.test.js | Reader-tolerance test for the two generator agents: asserts each agent's reader rules cover standalone entries (no Parent:/Depends on:), the `epic` status and `epic.md` recognition, and skipping of other statuses. Follows the existing frontmatter test pattern (jest, `tests/frontmatter/`, `testMatch: **/tests/**/*.test.js`) | AC-43, AC-44, AC-45, AC-46 | TEST | [components/registry-reader-tolerance.test.js.md](components/registry-reader-tolerance.test.js.md) |

### Modified files
| Path | Change description | Addresses | Domain | Spec |
|------|-------------------|-----------|--------|------|
| src/claude/agents/gaia-generate-requirements.md | Read-side only: reader rules for the `Parent:` and `Depends on:` lines; entries without them are standalone; `Status: epic` is recognised as the epic record; the parent `epic.md` in the feature folder is recognised as the parent record and is not generated as a pipeline feature; entries with any other status are skipped and not treated as epics; the `Detail` line is ignored. No change to generated output | AC-43, AC-44, AC-45, AC-46 | BE | [components/gaia-generate-requirements.md.md](components/gaia-generate-requirements.md.md) |
| src/claude/agents/gaia-generate-tech-spec.md | Read-side only: the same reader rules as the Requirements generator (standalone entries, `Status: epic`, parent `epic.md` recognised as the parent record, other statuses skipped, `Detail` ignored). No change to generated output | AC-43, AC-44, AC-45, AC-46 | BE | [components/gaia-generate-tech-spec.md.md](components/gaia-generate-tech-spec.md.md) |

## 10. Testing Strategy

_Per-component detail — see each component's own design file's own Tests section (generated
separately, one call per component). Do not write any content here._

## 11. Implementation Order

1. `src/claude/scripts/feature-split.config.json` (toolkit default) — depends on: nothing
2. Loader, `FeatureSplitError`, `isOverThreshold`, `meetsMinimum` in `feature-split.js` — depends on: 1
3. `isNewFeature` (including the unreadable-folder error) — depends on: 2
4. `buildProposal` and `editProposal` (checks, dependency order, BR-03 warnings) — depends on: 2
5. Registry read, temp-and-rename write, first-sentence Summary, slug rule, leftover-staging scan — depends on: 2
6. `apply` initial mode (pre-checks, staging, renames, epic.md, registry, rollback, cleanup) — depends on: 4, 5
7. `apply` late mode (single-child row insert, dependency rule, union Keywords) — depends on: 6
8. `register` (standalone entry, refusals, idempotent re-run) — depends on: 5
9. Facade commands `apply` and `register` with the stdout and exit contract — depends on: 6, 7, 8
10. `tests/scripts/feature-split.test.js` and `tests/scripts/feature-split-install.test.js` (written alongside steps 2–9; run `npm test`) — depends on: 2–9 and 1
11. Read-side tolerance in `gaia-generate-requirements.md` and `gaia-generate-tech-spec.md` (format fixed by this spec) — depends on: nothing
12. `tests/frontmatter/registry-reader-tolerance.test.js` and `npm test` — depends on: 11

Notes for the component designs (fixed at feature level here, not to be re-decided):
- `feature-split.js` carries the late-child dependency rule (step 7), the epic-entry Summary and Keywords rules (step 9), the rule that shared-foundation content goes only to the first child, and the leftover-staging refusal (step 0 of Flow D).
- Both generator components must state explicitly that they recognise the parent `epic.md` (AC-45).

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Stale staging and temp files (decision).** A crash, or a rollback that reports remaining paths, leaves `.split-staging-<run id>` or `REGISTRY.md.tmp-<run id>` in the features root. A leftover cannot be told apart from a concurrent run, so automatic removal is unsafe. | Stray files under the features root; a later apply could be confused by them. | Detection: every `apply` checks the features root for `.split-staging-*` and `REGISTRY.md.tmp-*` before anything else (Flow D step 0). Reporting: any leftover -> `STAGING_LEFTOVER` with the exact paths, nothing written. Removal: manual, by the user, after checking that no run is active; this is documented in the error message. `register` is unaffected. This replaces the earlier "removed on the next successful run" rule, which contradicted D-13 and NFR-01. |
| **Generated `req/` and `spec/` in the parent folder at an initial split (open point 1, for Gate 1).** D-14 requires the parent folder to hold only `epic.md`, but deleting generated documents is destructive, and Requirements Section 9 Q1 is unresolved. Checkpoint 2 (FTR-037) is likely to run on features that already have `req/` and `spec/`. | Option (c) would block checkpoint 2 for such features. Options (a) remove and (b) move both need a decision. | Interim behaviour, safe and reversible: initial-mode apply refuses with `PARENT_INVALID` when `req/` or `spec/` exists, and writes nothing (Flow D step 2). Gate 1 chooses (a), (b) or (c). Until then no AC covers the branch. Option (b) is the likeliest candidate to keep checkpoint 2 usable and is the one to test first. |
| **UC-04 step 2 and the late-child rule conflict with the spec (Requirements alignment).** UC-04 precondition and E3 refuse a parent holding `epic.md`, while D-16, BR-07 and AC-34 require late children through `apply`. UC-04 step 2 treats "epic.md present" as late mode, which leaves "both files present" undefined. | Implementation would follow one text at random; a late child could be refused. | This spec implements late mode for `epic.md` present and `feature.md` absent (A-03, AC-34). Both files present is refused with `PARENT_INVALID`. UC-04 precondition, step 2, E3 and A1 must be updated to match before Gate 1. |
| **UC-04 step 4 and error flow E2 refuse a BR-03 violation, but BR-03, BR-11 and AC-26 require apply to proceed with a recorded warning.** | Two Must requirements conflict. | This spec follows BR-11 and AC-26: apply proceeds and records the warning in the shared-foundation row of `epic.md`. UC-04 step 4 and E2 must be aligned at Gate 1. The BR-03 check counts a later child as a violation when it does not depend on the owner, directly or through a chain of `dependsOn`. This "transitive" reading must be recorded in BR-03 at Gate 1. |
| **Registry `register` status conflict (Requirements Section 9 Q2, open).** Tech-Spec chose an error for statuses other than `defined`; Requirements suggests printing the existing status with exit 0. | The calling feature (FTR-036) cannot tell which outcome it gets. | This spec implements `REGISTRY_STATUS` with exit 1 and no change to the entry. If Gate 1 selects print-and-exit-0, only Flow E and the `register` tests change. |
| **Registry location.** Requirements Section 9 Q1 is open, while feature.md and Requirements A-10 state `internal_docs/features/REGISTRY.md` as fact. | Wrong registry written if the location is wrong. | The location is verified: the registry is `<features root>/REGISTRY.md`, and the features root is always resolved by `ai-toolkit resolve-features-root` (D-22). In this repository that resolves to `internal_docs/features/REGISTRY.md`, which holds entries in the format of Flow D step 9. Gate 1 closes the Requirements question with this answer and aligns feature.md's Open Questions (currently "None"). |
| **Epic entry Detail target.** D-18 says Detail links to `feature.md`, but the parent `feature.md` is removed by a split (D-14). | Dead link in the registry if left as written. | The epic entry's Detail links to `<parent folder>/epic.md` (A-09, Flow D step 9). AC-30 (epic Detail) is the anchor for this rule. Requirements AC-25 must be restated to allow `epic.md` as the Detail target of the epic entry. |
| **Registry format assumption in component designs.** A component file assumed `## FTR-NNN: Title` with `**Key:**` lines. The live file uses `## FTR-NNN — Title` (em dash). | A component written from the wrong format would produce entries that do not match the existing registry. | The verified format is fixed in Section 1 and Flow D step 9: heading `## FTR-NNN — Title`, `**Key:**` bold lines, `→ [Detail](<relative path>)`, entries separated by `---`. The component design for `feature-split.js` must use it. |
| **Generator tolerance tests are not in the Section 9 file list.** The tolerance rules were previously covered by an unnamed "frontmatter test suite". | Tolerance could regress without a failing test. | Named: `tests/frontmatter/registry-reader-tolerance.test.js` (Section 9, new file, AC-43–AC-46). `feature-split.test.js` does not cover generator behaviour. |
| **Generator behaviour for undefined cases (UC-06 open cases a–d).** No registry entry for the feature; `Parent:` without `Depends on:`; `Status: epic` with no `epic.md`; registry unreadable. | The generators could misclassify a feature or stop unexpectedly. | Interim behaviour for the generator components: (a) no entry -> standalone; (b) `Parent:` without `Depends on:` -> child with no recorded dependencies; (c) `Status: epic` without `epic.md` -> error, generation stops; (d) unreadable registry -> error, generation stops. These go to Gate 1 as Requirements decisions. |
| **Unreadable feature folder in `isNewFeature` (UC-02 open question).** | An unreadable folder must never be treated as new. | Decided here: `FEATURE_UNREADABLE` is thrown (A-07, AC-13). Requirements UC-02 and an AC must record this at Gate 1. |
| **Concurrent runs.** Two `apply` or `register` runs could pick the same next ID or race on `REGISTRY.md`. | Duplicate or lost registry updates. | Target existence is checked before any write (step 6), and renames onto an existing target are refused. Splits are a single-user action, so no lock is added. Accepted residual risk. |
| **Windows file locks** (an editor or antivirus holding `REGISTRY.md`) make the temp-and-rename step fail after folders have been moved in. | Apply fails midway and triggers rollback. | Rollback removes everything moved in and leaves the registry unchanged (NFR-02, AC-32). The error is reported and the caller can retry. |
| **Dependency ties** (several children with empty `dependsOn`). | Two runs with the same proposal could pick different first children. | Ties are broken by proposal order in both `buildProposal` and `apply` (BR-06, AC-18). The order is deterministic for a given proposal. |
| **Thresholds are uncalibrated placeholders.** | Wrong checkpoint decisions in FTR-036 and FTR-037. | Thresholds live only in the configuration (BR-04). Calibration is out of scope and is a follow-up. |