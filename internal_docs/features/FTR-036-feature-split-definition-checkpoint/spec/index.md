I have what I need. The existing prior-version spec is a useful base, but I'm checking it against the code and the requirements, so the skeleton below changes a few points:

- The `check-definition` record rule must reconcile the requirements' "arrays or RECORD_INVALID" rule with AC-04's "cannot be determined" case.
- The `skipped` path must not write `feature.md`, because a second marker file in an epic folder breaks `apply`'s mode detection.

I'm writing the skeleton now.

# Technical Specification — FTR-036 Feature Split Checkpoint 1: Size Assessment During Definition

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-036 — Feature Split Checkpoint 1: Size Assessment During Definition (parent epic FTR-034) |
| Version | 1.0 |
| Date | 2026-11-09 |
| Status | Draft |

## 1. Overview

FTR-036 adds an early, advisory size checkpoint to `define-feature`. Right after grilling, the agent builds an in-memory grilling record (actors, applications, independently deliverable flows) and runs a new read-only command, `check-definition`, of the existing `feature-split.js` facade. If the feature is new and at least one signal reaches its minimum, the agent proposes a split: child names, one-line purposes, dependency order, shared parts for the first child, the flow list with reasons, and editable Summary and Keywords per child. The user accepts, edits or rejects the proposal in the main loop. Accepting writes and registers the parent `feature.md` and then calls `apply` (FTR-035). Rejecting, or no flag, writes `feature.md` and registers it as a standalone feature. A separate entry point adds one missing last child to an existing epic through `apply` in late mode.

Systems affected:
- `src/claude/scripts/feature-split.js`: new read-only commands `check-definition` and `validate-proposal`.
- `src/claude/agents/gaia-define-feature.md`: Phase 3a, a checkpoint return, the write/register run, and the late-child run.
- `src/claude/skills/define-feature/SKILL.md`: main-loop decision relay and late-child routing.
- Registry (`internal_docs/features/REGISTRY.md`): written only through the FTR-035 `register` and `apply` commands.

No pipeline run (Requirements, Tech-Spec, Work Breakdown) is started at this checkpoint.

Naming: the source document says "`define-feature` agent". In this repository the subagent is `gaia-define-feature` (`src/claude/agents/gaia-define-feature.md`) and the skill is `define-feature`. This specification uses those names.

Decision refinements of feature.md (D-07 and D-08) are recorded in Section 2.3.

## 2. Architecture

### 2.1 System Context

FTR-036 sits between grilling (Phase 3) and document writing (Phase 4) of `gaia-define-feature`, and reuses the FTR-035 foundation as it exists in the code:

- **Configuration**: `src/claude/scripts/feature-split.config.json`, block `definitionSignals`, loaded by `loadConfig`.
- **New-feature test**: `isNewFeature(featureDir)`. A missing folder is new. A folder is not new if it contains `epic.md`, `{PREFIX}-Approvals.md`, or a `wbs/` directory.
- **Signal comparison**: `meetsMinimum(count, minimum)` (at least N, FTR-035 D-05).
- **Proposal model**: `buildProposal`, `editProposal`, `validateProposal`, `foundationWarnings`, `assertProposalShape`.
- **Apply and registry**: `apply --features-root <root> --parent <ID>` (proposal on stdin; `initial` or `late` mode detected from the parent folder), `register --features-root <root> <featureDir> [--keywords ...]`, staged commit with rollback, `writeRegistryAtomic`.
- **Features root**: `ai-toolkit resolve-features-root` (exits 1 with a message on failure). Never hard-coded.
- **Launcher**: `run-asset scripts/feature-split.js --project <root> -- <command> ...`.

Verified facts from the current code that constrain the design:
- `feature-split.js` exposes only `apply` and `register` (the `COMMANDS` map). `check-definition` and `validate-proposal` must be added. The unknown-command message must be updated.
- `apply` in `initial` mode requires a parent folder with `feature.md` and no `epic.md`, a registry entry with status `defined`, and a new feature. The parent must therefore be written and registered before a split is applied (Section 2.3).
- `apply` in `late` mode requires a parent folder with `epic.md` and registry status `epic`. It accepts exactly one child (`LATE_CHILD_COUNT = 1`), places it after the existing child rows, and by default depends on the last row.
- `minChildren` is 2 in the config. A split proposal therefore needs at least two children.
- `apply` and `register` both write the registry themselves; `register` is not called for a late child, because `apply` writes its registry row.

FTR-036 changes no FTR-035 contract. It adds two read-only commands, the Phase 3a and write/register text of the agent, and the decision relay of the skill. It is independent of FTR-037 (checkpoint 2), which still runs later on standalone features.

### 2.2 Component Diagram

```
[User] <--(main-loop conversation)--> [define-feature skill (SKILL.md)]
                                         |  spawns / re-invokes (Task); state is passed in the prompt
                                         v
                              [gaia-define-feature agent]
                                 |  Phase 0-3   grilling (AskUserQuestion, in memory)
                                 |  Phase 3a    --(Bash, JSON stdin)--> [feature-split.js check-definition]   (read-only)
                                 |  edit check  --(Bash, JSON stdin)--> [feature-split.js validate-proposal]  (read-only)
                                 |  Phase 4     feature.md (Write, after absence check)
                                 |  register    --(Bash)--> [feature-split.js register]  --> REGISTRY.md
                                 |  apply       --(Bash, JSON stdin)--> [feature-split.js apply] --> child folders, epic.md, REGISTRY.md

[ai-toolkit resolve-features-root] --> features root (every agent run, every facade call)
```

### 2.3 Sequence Diagrams

**Handoff mechanism (decided).** A subagent cannot hold a decision with the user, and the decision must be taken in the main loop. The mechanism is **return-and-re-invoke with explicit state**:

1. The skill spawns `gaia-define-feature` in mode `define`. The agent runs Phase 0 to Phase 3, then Phase 3a. It writes nothing. It ends its turn with a single structured `CHECKPOINT` block.
2. The skill keeps the block in main-loop context (never on disk), shows the proposal or the keyword prompt, and collects the decision.
3. The skill re-invokes `gaia-define-feature` in mode `write` (or `validate`, or `late-child`) with the decision and the full state block. The agent does not repeat grilling.

Alternatives considered:
- Resume the same subagent with SendMessage: rejected. Resumption of a finished subagent is not guaranteed by the toolchain, and the outcome is less deterministic than an explicit payload.
- Move Phase 3a into the skill: rejected. The grilling answers live in the agent, so the agent would have to be split for the same result.

The `CHECKPOINT` block contains:
- `status` (`skipped`, `not-flagged`, `flagged`), and the check result (`signals`, `flows`, `unevaluated`);
- for `flagged`: the proposal draft (children, purposes, order, shared parts, flows, Summary and Keywords per child);
- the grilling digest (only the answers that Phase 4 and the child parts need, in a fixed compact layout);
- `featureId` (from Phase 1b), `title`, `featuresRoot`, and `featureDir` (not yet created);
- the derived `keywords` and the parent `summary` for standalone or parent registration;
- for an error: `error` code and message.

**Refinements of feature.md decisions (explicit).**
- **Refinement of D-07 (Summary and Keywords for late children).** D-07 derives Keywords from the child's title and assigned grilling answers. The late path (UC-03) has no grilling round, so a late child's Summary and Keywords are derived from the child's one-line purpose and the epic's Summary. The grilling-answer source of D-07 applies only to the split proposal (UC-01, UC-02). The late child's Summary is the purpose as one sentence. Its Keywords are the main terms of the purpose, checked against the epic's Summary. Both are shown as editable items, and a keyword must contain no comma and no line break.
- **Refinement of D-08 (parent registration).** D-08 calls `register` only for a `feature.md` that is not split. An accepted split's parent `feature.md` is also written and registered (status `defined`) before `apply --parent` runs. The reason is the FTR-035 `apply` initial-mode precondition: `checkApplyPreconditions` fails with `PARENT_NOT_REGISTERED` unless the parent has a registry entry, and with `PARENT_STATUS_INVALID` unless its status is `defined`. `apply` then moves the parent to status `epic`. The parent's Keywords are derived as in D-08. `apply` adds the children's keywords to them.

**Main flow (UC-01 and UC-02).**

```
User        Skill (main loop)                 Agent (gaia-define-feature)             feature-split.js
 |-- /define-feature ->                                 |                                    |
 |                |-- spawn (mode define) ------------->|                                    |
 |                |                                     |-- Phase 0-3 grilling (User Q&A)    |
 |                |                                     |-- Phase 3a: record in memory       |
 |                |                                     |-- check-definition (stdin) -------->|
 |                |                                     |<-- {status, signals, flows, unevaluated}
 |                |<-- CHECKPOINT block (ends, writes nothing) --|
 |                |                                                                          |
 |   if not-flagged:                                                                         |
 |<-- keyword prompt (derived keywords, editable) --|                                        |
 |-- confirmed keywords ->                                                                   |
 |                |-- re-invoke (mode write, standalone, keywords) -->| Phase 4: feature.md (absence check first)
 |                |                                     |-- register (keywords) ------------->|
 |                |                                                                           |
 |   if skipped: the agent reports the reason (epic, approvals or wbs marker) and stops; no write.
 |                |                                                                           |
 |   if flagged:                                                                             |
 |<-- proposal view + decision prompt (accept / edit / reject, keywords) --|                 |
 |-- edit ->  re-invoke (mode validate) --> validate-proposal -> violations and foundation warnings
 |-- accept ->   re-invoke (mode write, split, proposal)                                     |
 |                |     Phase 4: parent feature.md (absence check first)                  |
 |                |     register parent (status defined) ---------------->|                 |
 |                |     apply --parent <parent-ID> (stdin proposal) ------>|                 |
 |                |     report created child IDs and folders; parent status moves to epic   |
 |-- reject ->    re-invoke (mode write, standalone, confirmed keywords) -> as not-flagged
```

Edit loop: each edit is validated with `validate-proposal`, which wraps FTR-035 `editProposal` and `validateProposal`. It returns violations (the user must correct them before accept is allowed) and foundation warnings (shown; the user may keep or revert the edit). The revised proposal is re-presented. Nothing is written during the loop.

Failure of `apply` on accept: the agent returns an error block. The parent `feature.md` and its `defined` registration remain, because they were written before `apply`. `apply`'s staged commit rolls back the child folders and the parent move when it can. The agent lists any child folder that exists on disk for the planned IDs, and reports any `.split-staging-*` leftover. The skill offers retry (same proposal, only if no leftover exists), edit, or reject (keep the feature as standalone, which needs no further write).

**Skipped path.** `check-definition` returns `skipped` when the feature folder is not new. The agent then reports the reason (`epic.md`, `{PREFIX}-Approvals.md`, or `wbs/`) and stops. It writes nothing. Writing a new `feature.md` into such a folder would create a folder holding both `feature.md` and `epic.md`, which `apply`'s mode detection refuses (`PARENT_INVALID`). The requirements' flow step "skipped moves directly to Phase 4" is therefore not followed literally; this is the decided behaviour.

**Late child (UC-03), a separate entry point.** The user runs `/define-feature --epic <FTR-ID> [purpose]`.

```
User     Skill (main loop)                      Agent (gaia-define-feature, mode late-child)     feature-split.js
 |-- /define-feature --epic FTR-034 ->|
 |                |<-- asks child name and one-line purpose (main loop, one question)
 |                |-- spawn (mode late-child, epic ID, name, purpose) --> resolve-features-root
 |                |                                     |-- epic lookup (exact ID rule)
 |                |                                     |-- status check (registry must be `epic`)
 |                |                                     |-- duplicate check (name vs epic.md rows and folders)
 |                |                                     |-- derive Summary and Keywords (refinement of D-07)
 |                |<-- CHECKPOINT (late proposal: name, purpose, Summary, Keywords, depends on last child)
 |-- accept (or edited, after validate-proposal) -> re-invoke (mode late-child, accept)
 |                |                                     |-- apply --parent <EPIC-ID> (one child, stdin) -->|
 |                |<-- created child ID and folder
 |-- reject -> nothing written; epic unchanged; no standalone fallback
```

Late-child rules (decided):
- **Epic identification.** The user names the epic by its exact FTR-ID (`^[A-Z]+-\d+$`). The agent locates the folder whose name equals the ID or starts with `ID-`, and that folder must contain `epic.md`. The agent does not guess from free text. If no such folder exists, the agent lists the folders that do contain `epic.md`, reports that no epic matched, and creates nothing.
- **Epic status.** The registry status of the epic must be `epic`, which is the status `apply` requires in late mode. Any other status (in progress, approved, or any other) is refused before any proposal is shown, with the status named.
- **Child already exists.** If the child's slug equals an existing `epic.md` child row or an existing folder `*-{slug}`, the agent reports the existing path, does not overwrite it, and stops. Nothing is written.
- **Grilling.** No grilling round runs for a late child. The only question asked is the child's name and one-line purpose.
- **Placement.** The child is placed last, depending on the last row of `epic.md` (the `apply` late-mode default). No `dependsOn` is supplied.
- **Rejection.** A rejected late child leaves the epic unchanged. There is no standalone fallback.
- **Registration.** The late path never calls `register`. `apply` writes the child's registry row itself, and adds the child's keywords to the epic's Keywords.

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

- **No hard-coded paths.** The features root comes only from `ai-toolkit resolve-features-root`. If it fails (non-zero exit), the agent stops, reports the error in the main loop, and writes nothing. It does not continue with a guessed path (BR-07, AC-06).
- **Input validation.** `--feature-id` must match `^[A-Z]+-\d+$` before any path is built. `--features-root` must be an existing directory. The grilling record is parsed as JSON on stdin and must have the D-03 shape (Section 8 and the record rules in the component design). A record that cannot be parsed, or whose shape is wrong, exits 1 with `RECORD_INVALID`. The agent then stops and reports it. It never treats a failed check as `not-flagged` (BR-08, AC-05).
- **Unevaluated signals.** A signal is `unevaluated` only when its value is `null` in the record, meaning the agent could not determine it. Any other value that is not an array of the required shape is `RECORD_INVALID`. This reconciles the requirements' "arrays or RECORD_INVALID" rule with AC-04. An unevaluated signal never raises the flag (BR-02), and the agent names it to the user.
- **Shell safety.** Record and proposal values are data only. They travel on stdin and are never interpolated into command-line arguments.
- **Ambiguous folder match.** `check-definition` resolves the feature folder from the ID with the rule `name === ID` or `name starts with ID-`. If more than one folder matches, it fails instead of choosing one.
- **No overwrite (BR-04).** Before `feature.md` is written, the agent checks absence (`test ! -e`) and writes only when the file is absent. The check-then-write window is a residual race, recorded in Section 12.
- **Confirmation before any write (BR-01, BR-03, NFR-01).** In mode `define`, the agent writes nothing. Its feature folder is created (`mkdir`, without `-p`, so an existing folder fails), and its ledger entry is opened, only in mode `write`, after the decision. `check-definition`, `validate-proposal` and `resolve-features-root` are read-only.
- **Grilling record privacy (BR-03, NFR-02).** The record and the grilling digest stay in memory and in the main-loop prompt. They are never written to disk, to temporary files, or to logs beyond counts and names in the check result.
- **Registry integrity.** The registry is written only through `register` and `apply`, both of which use `writeRegistryAtomic` (temp file and rename). A leftover `.split-staging-*` or registry temp file blocks later applies (`STAGING_LEFTOVER`).
- **Authentication and authorization.** Not applicable. This is a local developer toolchain with no network surface. The user is the sole approver of every write.
- **CORS.** Not applicable.

## 7. Database Changes

Not applicable. There is no database. Persistent state is file-based:
- `feature.md` for standalone features and for the parent of a split (written once, never overwritten).
- Child `feature.md` files and `epic.md`, written only by `apply` through the existing staged commit and rollback.
- `internal_docs/features/REGISTRY.md`, written only through `register` and `apply`.

No new schema, index, seed data or migration. The grilling record, the check result, and the proposal are never persisted.

## 8. Configuration

- **New environment variables:** none.
- **Existing configuration, values resolved:** `src/claude/scripts/feature-split.config.json` already holds `definitionSignals`: `minActors` 2, `minApplications` 2, `minFlows` 3. This feature keeps those values and does not change the file. A flag therefore needs two actors, two applications, or three flows. `minChildren` is 2, which a split proposal must meet. `loadConfig` reads the optional project override.
- **Feature flags:** none. The checkpoint always runs. The skip for non-new features is the built-in `isNewFeature` test.
- **Tool dependencies:** `ai-toolkit resolve-features-root`, `ai-toolkit ledger` and `run-asset` must be available to the agent's Bash tool.

## 9. File Inventory

Complete list of files to create or modify:

### New files
| Path | Purpose | Addresses | Domain | Spec |
|------|---------|-----------|--------|------|
| tests/cli/define-feature-checkpoint-text.test.js | Static tests that pin the Phase 3a, proposal, write/register, late-child and decision-relay text of the agent and skill, so that they cannot be removed silently (NFR-06) | AC-06, AC-07, AC-08, AC-10, AC-11, AC-12, AC-13 | TEST | [components/define-feature-checkpoint-text.test.js.md](components/define-feature-checkpoint-text.test.js.md) |

### Modified files
| Path | Change description | Addresses | Domain | Spec |
|------|-------------------|-----------|--------|------|
| src/claude/scripts/feature-split.js | Add read-only `check-definition` (record on stdin; `--features-root`, `--feature-id`; returns `{ status, signals, flows, unevaluated }`; uses `isNewFeature` and `meetsMinimum`; `null` means unevaluated, any other malformed value means `RECORD_INVALID`). Add read-only `validate-proposal` (wraps `editProposal` and `validateProposal`; returns the revised proposal, violations and foundation warnings). Add both to the `COMMANDS` map, update the unknown-command message, and export the new functions. | AC-01, AC-02, AC-03, AC-04, AC-05, AC-08, AC-11 | BE | [components/feature-split.js.md](components/feature-split.js.md) |
| src/claude/agents/gaia-define-feature.md | Defer `mkdir` and ledger open from Phase 1d to mode `write`. Add Phase 3a and the `CHECKPOINT` return. Add modes `validate`, `write` (Phase 4 with absence check, `register` for standalone or parent, `apply` for split) and `late-child` (epic identification, status and duplicate checks, derived Summary and Keywords, `apply` late mode). Skipped folders stop and report. | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19 | BE | [components/gaia-define-feature.md.md](components/gaia-define-feature.md.md) |
| src/claude/skills/define-feature/SKILL.md | Relay the `CHECKPOINT` block in the main loop. Show the proposal and the keyword prompt. Collect accept, edit or reject, and the confirmed keywords. Re-invoke the agent in the matching mode. Offer retry, edit or reject after a failed `apply`. Route `--epic <FTR-ID>` to late-child mode and ask the child name and purpose in the main loop. | AC-06, AC-07, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-16, AC-17 | BE | [components/SKILL.md.md](components/SKILL.md.md) |
| tests/scripts/feature-split.test.js | Unit tests for `check-definition` and `validate-proposal` through `main()`: skipped for non-new features, not-flagged below minimums, flagged on each signal, `null` signal does not raise the flag and is listed in `unevaluated`, malformed record gives `RECORD_INVALID`, ambiguous ID fails, the record is never written to disk, and edits return foundation warnings. | AC-01, AC-02, AC-03, AC-04, AC-05, AC-08, AC-11 | TEST | [components/feature-split.test.js.md](components/feature-split.test.js.md) |

## 10. Testing Strategy

_Per-component detail — see each component's own design file's own Tests section (generated
separately, one call per component). Do not write any content here._

## 11. Implementation Order

1. `check-definition` and `validate-proposal` (read-only) and their `COMMANDS` wiring in `src/claude/scripts/feature-split.js` — depends on: nothing
2. Unit tests for both commands through `main()` in `tests/scripts/feature-split.test.js` — depends on: 1
3. Phase 1d deferral, Phase 3a, `CHECKPOINT` return, and modes `validate` and `write` in `src/claude/agents/gaia-define-feature.md` — depends on: 1
4. Decision relay, re-invocation, keyword prompt, and accept/edit/reject handling in `src/claude/skills/define-feature/SKILL.md` — depends on: 3
5. Late-child mode (UC-03, priority Should) in the agent and the skill — depends on: 3, 4
6. Static text tests in `tests/cli/define-feature-checkpoint-text.test.js` — depends on: 3, 4, 5
7. Run `npm test` and confirm the suite passes — depends on: 2, 6

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Main-loop handoff (closed).** Mechanism chosen: return-and-re-invoke with explicit state (Section 2.3). Alternatives (SendMessage resume, Phase 3a in the skill) rejected for the reasons given there. | Without this choice the proposal decision and the skill relay cannot be built. | Recorded as decided. The state block stays in main-loop context and is never written to disk. |
| **Parent must be registered before `apply` (refinement of D-08).** `apply` in initial mode requires a `feature.md` and a `defined` registry entry (FTR-035 `checkApplyPreconditions`). | An accepted split that follows UC-02 literally, with no standalone registration first, fails with `PARENT_NOT_REGISTERED`. | Accept writes the parent `feature.md` and registers it as `defined` first, then runs `apply --parent`. `apply` moves the parent to `epic`. The requirements' UC-02 wording must be aligned with this (BR-09). |
| **Skipped folder is a stop, not a write (interpretation of requirements 6.2 step 3).** A non-new folder cannot take a new `feature.md`. | Writing one would make the folder hold both `feature.md` and `epic.md`, which `apply` refuses. | The agent reports the reason and stops (Section 2.3). Requirements 6.2 step 3 should be read the same way. |
| **Phase 1d moved to mode `write` (BR-03, AC-08).** Phase 1d currently creates the folder and opens the ledger before grilling. | Both write to disk before the user confirms, breaching AC-08 and NFR-01. | Phase 1d moves to mode `write`, after the decision. Grilling tokens are then not recorded in the ledger. This trade-off is accepted. |
| **Feature ID race.** Phase 1b numbers come from a folder scan, so two sessions can pick the same number. | Duplicate IDs or overwritten files. | In mode `write`, re-scan. If the ID changed, the agent stops and reports it. Create the folder with `mkdir` (no `-p`). `apply` allocates child IDs with `allocateIds` and checks `TARGET_EXISTS`. |
| **Check-then-write race on `feature.md`.** The absence check and the write are not atomic. | A rare overwrite of a `feature.md` created in the window. | Accepted residual risk. The absence check runs immediately before the write. |
| **Partial `apply` failure (requirements UC-02 open point, resolved here).** `apply` uses a staging folder and rollback. If rollback fails, a `.split-staging-*` leftover remains and `checkApplyPreconditions` blocks later applies. | Blocked applies until manual cleanup. | The agent reports the children already created (folders on disk for the planned IDs), offers retry, edit or reject, and does not retry while a leftover exists. The leftover is reported with the cleanup instruction. The parent is already registered, so reject needs no further write. |
| **`register` fails after `feature.md` is written.** The standalone feature exists on disk but is not registered. | Feature missing from the registry. | `register` is idempotent: an existing `defined` entry is returned unchanged. The agent offers a retry of `register` only. |
| **Unevaluated signal treated as a count.** AC-04 needs a signal that cannot be determined, while the requirements root rule requires arrays. | A signal could be silently read as zero. | `null` means unevaluated and is named to the user (BR-02). Any other non-array value is `RECORD_INVALID`. The requirements' record-validation row should be aligned with this exception. |
| **`check-definition` command missing at runtime.** The command does not exist yet. | Phase 3a fails at runtime. | Work item 1 adds it to `COMMANDS` and updates the error message. Work item 2 tests it through `main()`. |
| **Flow counting is subjective (D-02).** No algorithm is defined. | Inconsistent flag decisions between runs. | The proposal lists each flow by name with a one-line reason. The check result echoes the flow list so the user can correct the count. |
| **Scope addition: `validate-proposal`.** It is not named in feature.md, which lists only `check-definition`. | Scope creep if not recorded. | Edits must follow FTR-035 D-09 and D-10 (D-06), and the agent needs a read-only way to validate them. The command wraps the existing `editProposal` and `validateProposal`. It is recorded here as a necessary addition. |
| **Grilling digest size.** Re-invocation carries grilling answers in the prompt. | Higher token use; very long grillings could hit prompt limits. | Carry only the answers Phase 4 and the child parts need, in a fixed compact layout. Test the block size in the text tests. |
| **Late-child boundary (requirements UC-03 open points, resolved here).** Exact FTR-ID; refuse unless status is `epic`; report and stop on a duplicate; no grilling round; no standalone fallback; no `register`. | Without these rules UC-03 has no defined behaviour. | The rules in Section 2.3 are binding. UC-03 priority stays Should, so it ships last. |
| **Features root failure (requirements open point, resolved here).** | A missing root would lead to writes in a guessed location. | Stop, report, write nothing (Section 6). |
| **Signal minimums and skip test (requirements open points, resolved here).** Minimums are `minActors` 2, `minApplications` 2, `minFlows` 3, from the current config. Skipped is the `isNewFeature` not-new result. | The flag threshold and the skip rule are otherwise untestable. | Values adopted as configured (Section 8). The skip rule is the `isNewFeature` code. |
| **Shared basename `SKILL.md` and `feature-split.js` split by domain.** | Component design-file collisions. | `Spec` links are provisional. The host may rewrite them. |
| **Edits that break the proposal (D-09, D-10).** | An invalid proposal reaches `apply`. | `validate-proposal` runs on every edit. Accept is blocked while violations remain. `apply` still checks the proposal shape. |