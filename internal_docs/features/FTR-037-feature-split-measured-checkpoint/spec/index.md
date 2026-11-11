# Technical Specification — FTR-037 Feature Split Checkpoint 2: Measured Size Check After Tech-Spec

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-037 — Feature Split Checkpoint 2: Measured Size Check After Tech-Spec |
| Version | 1.0 |
| Date | 2026-11-11 |
| Status | Draft |

## 1. Overview

FTR-037 adds a deterministic, file-based size measurement that runs after Requirements and Tech-Spec are generated and before Gate 1. It measures four counts (use cases, acceptance criteria, components, estimated phases) and compares each with its threshold from the FTR-035 configuration. If any count is strictly over its threshold and every count is available, the pipeline stops before Gate 1 and the `implement-feature` main loop presents a split proposal built from the generated documents. The user accepts, edits or rejects it. Acceptance calls FTR-035's `apply`. Rejection continues to Gate 1 unchanged and stores nothing. If any count cannot be measured, the check reports it as unavailable and blocks Gate 1 until the cause is fixed.

The proposal is built by `check-size` with no LLM call. The only field the agent fills is each child's Keywords, in the main loop, before the proposal is shown (T-8).

Systems affected:
- `src/claude/scripts/feature-split.js` (FTR-035 facade, already present): new `check-size` command, its measurement and the deterministic proposal builder.
- `src/claude/workflows/pm-phase1.js`: new hook after the validation loop and before the Gate 1 digest; returns `split_checkpoint`.
- `src/claude/skills/implement-feature/SKILL.md`: new Step 1a in the main loop.
- Static and unit tests under `tests/scripts/` and `tests/workflows/`.

Nothing is written by `check-size`. All writes happen in FTR-035 `apply`, after explicit acceptance.

## 2. Architecture

### 2.1 System Context

- **Pipeline position:** `implement-feature` Step 1 runs `pm-phase1` (Requirements, Tech-Spec, validation loop). The new hook runs `check-size` after the validation loop and before the Gate 1 digest (`docs_digest`) is computed. `implement-feature` Step 1a reads `split_checkpoint.status` and decides whether to continue to Gate 1.
- **Inputs read (read-only):** `req/use-cases/*.md` (use case IDs), `req/index.md` (AC table, including its Related UC column), and `spec/index.md` (Section 9 component rows and the Section 11 build order).
- **Contracts reused from FTR-035 (not changed):** `feature-split.config.json` and `loadConfig`, `isNewFeature`, `isOverThreshold`, `meetsMinimum`, `buildProposal`, `editProposal`, `apply`, `register`, and the registry. Child shape follows FTR-035 D-08: `{ name, purpose, summary, keywords, dependsOn, assigned }`.
- **Hierarchy:** FTR-037 is a child of epic FTR-034 (position 3 of 3) and depends on FTR-035. FTR-036 is a sibling with no dependency. The epic record `internal_docs/features/FTR-034-feature-split-epics/epic.md` exists, so the epic check passes. No requirements or spec are generated for the epic.
- **Shared infrastructure:** `pm-phase1.js` already calls `c.command(['run-asset', 'scripts/...', '--project', c.root, '--', ...])` for `req-skeleton-check.js`, `tech-spec-graph-checks.js` and the assemblers. The new hook uses the same form.

**Resolved decisions for this document.** These close the open points from the prior validation. Items marked PENDING need the user's decision before Gate 1 (see Section 12).

- **T-1 Build-order source (resolves Requirements OQ-1 and the Section 2.1 / Section 12 conflict).** Section 11 is a feature-wide section and is stored in `spec/index.md`. The assembled Tech-Spec is derived from that file. `check-size` reads the build order from `spec/index.md`, Section 11, and does not read the assembled view.

- **T-2 Component count definition — PENDING USER CHOICE.** feature.md D-01 says "the rows of the component table" (singular). BR-05 and AC-07 say a single table, with the union not used. The Section 9 template has two subtables, New files and Modified files, and both belong to the component index. This document cannot satisfy the singular reading and the template at once, so the user must choose one of these options:
  - **(A) Union de-duplicated by Path (current working definition).** Count the data rows of the New files and Modified files subtables of Section 9, excluding header and separator rows, counting a Path that appears in both once. Rows from other tables (Sections 6, 7, 8, 11, 12) are never counted.
  - **(B) New files subtable only.** Count only the New files rows.
  - **(C) Single table.** Change the Section 9 template to one Components table with a change-type column, then count its data rows. This makes BR-05 hold literally.

  Until the user chooses, `check-size` implements option (A). Whichever option is chosen replaces this text, the `feature-split.js` row and the BR-05 / AC-07 wording before Gate 1. A missing `spec/index.md`, a missing Section 9, or a Section 9 with no data rows makes the component count unavailable.

- **T-3 Precedence (resolves the UC-01 open question).** If any count is unavailable, `status` is `"unavailable"`, even when other counts are over their thresholds. The over-threshold counts are still listed in `over`, and no proposal is built or shown (BR-08, AC-05).

- **T-4 Unanswered proposal (resolves UC-03 open question and AC-21).** Nothing is stored before acceptance (BR-09, D-10). If the session stops before the user answers, the pipeline does not reach Gate 1. The next `implement-feature` run re-runs `pm-phase1` and `check-size` and presents the proposal again. This is valid because `check-size` is deterministic over the same documents (NFR-01).

- **T-5 Failed apply (resolves UC-03 open question and AC-20).** FTR-035 D-13 stages all writes in `.split-staging-<run id>` and moves them into place with renames. On any error nothing remains, and the error is reported. The only exception is a failure during rollback itself, which FTR-035 reports with the exact remaining paths. No automatic retry is made. The user fixes the cause and runs `implement-feature` again. Child IDs are allocated fresh on that run (FTR-035 BR-02), so no ID is reused.

- **T-6 Child grouping rule (resolves BR-11, AC-10, AC-15 and the open gap 5 for grouping; feature.md D-08).** The grouping is deterministic and uses only the generated documents:
  1. **Use-case to acceptance-criterion link.** Each AC in `req/index.md` has a Related UC. A component is linked to the ACs in its `Addresses` column (Section 9 row).
  2. **Child count N.** `N = max(minChildren, ceil(count / threshold))` taken over the over-threshold counts among `useCases`, `acceptanceCriteria` and `components`. `estimatedPhases` does not change N. Then `N = min(N, U)`, where U is the number of distinct use cases. If U < minChildren, the result is `"unavailable"` with the reason "cannot form minChildren children from U use cases" (T-3 applies).
  3. **Use-case blocks.** Sort the use cases by numeric ID. Split them into N contiguous blocks. The first `U mod N` blocks get `floor(U/N) + 1` use cases and the rest get `floor(U/N)`. Block k is the k-th block in ID order.
  4. **Component assignment.** A component goes to the block of the lowest-numbered use case among the Related UCs of its `Addresses` ACs. A component with no resolvable AC or UC (`—`, an unknown AC, or an AC with no Related UC) goes to block 1, and its `assigned` text says "no use-case link".
  5. **Child fields.** `name` is `part-<k>` (k is the block index, user-editable, must satisfy D-12). `purpose` is "Use cases <first>..<last> and their components". `summary` equals `purpose` (D-11). `assigned` lists the use-case IDs and the component Paths of that child. `dependsOn` and `keywords` are set by T-7 and T-8.
  6. **Order.** Children are listed in block order, except that the foundation child (T-7) moves to position 1.

  The result is deterministic and heuristic. The user can edit membership through the add, remove and merge operations of D-09.

- **T-7 Shared foundation mapping (resolves BR-10, AC-14 and open gap 5 for depth-0 mapping; feature.md D-07).**
  - Depth-0 items are the Section 11 items with depth 0 (D-02).
  - A component is a depth-0 component when its Path appears as an exact, case-sensitive substring of the text of a depth-0 item. Items that contain no Path map no component.
  - The foundation child is the child holding at least one depth-0 component with the lowest block index. It is moved to position 1, its `dependsOn` is empty, and every other child's `dependsOn` is `[foundation child name]`. `sharedFoundationOwner` is that child's name.
  - If no component is depth-0, `sharedFoundationOwner` is null and `foundationNote` states "No component is matched to a depth-0 build-order item, so no shared foundation is assigned." In that case every child's `dependsOn` is empty.

- **T-8 Keywords rule (reconciles feature.md D-09 with NFR-01 and the LLM-free check).** `check-size` writes `keywords: []` for each child and makes no LLM call. Before presenting the proposal, the `implement-feature` main loop derives each child's Keywords from its title, its assigned use cases and its assigned components (D-09, D-11). The proposal shown to the user is the one `check-size` printed with only the Keywords field added. Keywords can be edited like any other field. The agent must not change any other field.

### 2.2 Component Diagram

```
[implement-feature SKILL.md, main loop]
     |  (1) run pm-phase1 via the ai-toolkit workflow runner
     v
[pm-phase1.js workflow] --(2) run-asset scripts/feature-split.js -- check-size--> [feature-split.js check-size]
     |                                                                              |
     |                                  reads (read-only) <-------------------------+
     |                                  req/use-cases/*.md, req/index.md,
     |                                  spec/index.md (Section 9 rows + Section 11)
     |  (3) returns split_checkpoint <--------------------------------------------+
     v
[implement-feature Step 1a, main loop]
     |-- passed / skipped ----------> Gate 1 (unchanged)
     |-- unavailable ---------------> plain error stop (no prompt)
     |-- split-proposed ------------> agent fills child Keywords (T-8)
                                       -> present proposal -> accept | edit | reject
                                       accept -> FTR-035 apply (main loop) -> stop for parent
                                       edit   -> FTR-035 editProposal -> present again
                                       reject -> Gate 1 (nothing stored)
```

### 2.3 Sequence Diagrams

**Measure (UC-01)**
```
pm-phase1              feature-split.js check-size                 implement-feature (main loop)
   | validation loop done |                                               |
   |--run-asset check-size (--feature-dir, --prefix)-->|                    |
   |                      | isNewFeature (FTR-035 D-07)                    |
   |                      |   not new -> {status:"skipped"}                |
   |                      | count UCs, ACs, components (T-2), phases (T-1) |
   |                      | any unavailable -> status "unavailable" (exit 1) (T-3)
   |                      | else compare with thresholds (isOverThreshold) |
   |                      |   any over -> status "split-proposed" + buildProposal(source "measured") (T-6, T-7)
   |                      |   none over -> status "passed"                 |
   |<--stdout JSON, or failure--|                                          |
   | guarded parse (BR-04): missing / failed / non-JSON -> unavailable      |
   | return split_checkpoint ------------------------------------------>  Step 1a branches on status
   | docs_digest computed after the hook (check-size writes nothing)
```

**Propose and decide (UC-02, UC-03)**
```
implement-feature (main loop) -> derive child Keywords (T-8) -> user: each over-threshold count beside its threshold;
   each child: name, purpose, Summary, Keywords, dependsOn, assigned use cases and components;
   shared foundation owner, or the explicit note that no depth-0 component exists
user: accept -> FTR-035 apply (stdin JSON, --features-root, --parent) -> stop for parent (no Gate 1)
user: edit   -> FTR-035 editProposal (D-09 to D-12) -> show the edited proposal again -> accept | edit | reject
user: reject -> continue to Gate 1 unchanged; nothing written
apply error  -> FTR-035 rollback -> report error; no child or registry entry remains (T-5)
session ends before an answer -> no state stored; next run starts again (T-4)
```

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

- **Authentication and authorization:** none new. The check runs inside the local toolkit pipeline. Acceptance is an explicit human decision in the `implement-feature` main loop (BR-01).
- **Input validation:** `--prefix` must match `[A-Z]+-[0-9]+`. `--feature-dir` must exist and contain `req/` and `spec/`. Otherwise the affected counts are unavailable with a reason. Both arguments are passed as argv array elements through `c.command([...])`, never concatenated into a shell string.
- **Path handling:** `check-size` reads only the locations listed in Section 2.1 (`req/use-cases/*.md`, `req/index.md`, `spec/index.md`). It does not follow paths outside the feature folder.
- **Read-only check:** `check-size` writes nothing. No folder, epic or registry entry is created before explicit acceptance (NFR-02, AC-13).
- **Result parsing:** the hook parses the result only in a guarded way. A missing, failed or non-JSON result becomes `unavailable` and never throws or passes silently (BR-04, AC-17).
- **Sensitive data:** the check reads and reports only feature artifacts (IDs, titles, counts, Paths). No secrets or credentials are read or logged.
- **CORS:** not applicable (no HTTP surface).

## 7. Database Changes

- **No database changes.** The feature is entirely file-based.
- **Read sources:** `req/use-cases/*.md`, `req/index.md` (AC table with Related UC), `spec/index.md` (Section 9 component rows and Section 11 build order).
- **Write targets:** none from this feature. Registry, epic and child folder writes belong to FTR-035 `apply` and happen only after acceptance.
- **Indexes, seed data and migrations:** not applicable.

## 8. Configuration

- **New environment variables:** none.
- **Thresholds (FTR-035 D-02, read through `loadConfig`):** `thresholds.useCases` = 8, `thresholds.acceptanceCriteria` = 15, `thresholds.components` = 30, `thresholds.estimatedPhases` = 6. These are uncalibrated placeholders that FTR-035 ships. A count is over its threshold only when it is strictly greater (`isOverThreshold`, D-05). A count equal to its threshold passes. A project override in `feature-split.config.json` at the project root may replace any subset of these values (D-03). Calibration is outside this feature.
- **`minChildren`:** 2 (FTR-035 D-02). It is copied into each proposal, bounds the child count (T-6), and limits the edits in Step 1a (D-09).
- **New-feature test (FTR-035 D-07, `isNewFeature(featureDir)`):** the feature is **not new** when its folder contains `{PREFIX}-Approvals.md`, a `wbs/` directory, or an `epic.md`. A folder that does not exist yet is new. Generated `req/` and `spec/` folders do not make a feature non-new. When `isNewFeature` reports not new, `check-size` returns `status: "skipped"`.
- **Feature flags:** none. The checkpoint runs for every new feature.
- **App settings changes:** none.

## 9. File Inventory

Complete list of files to create or modify:

### New files
| Path | Purpose | Addresses | Domain | Spec |
|------|---------|-----------|--------|------|
| tests/scripts/feature-split-check-size.test.js | Unit tests for `check-size`: distinct UC-NN and AC-NN counting, component row count (T-2, pending choice), build-order depth and unavailable cases, threshold equality, skipped and passed statuses, unavailable precedence, output keys, deterministic child grouping (T-6), foundation mapping (T-7) | AC-01, AC-02, AC-03, AC-04, AC-05, AC-07, AC-08, AC-09, AC-14, AC-15, AC-18 | TEST | [components/feature-split-check-size.test.js.md](components/feature-split-check-size.test.js.md) |
| tests/workflows/split-checkpoint-static.test.js | Static tests that pin the `pm-phase1` hook (`check-size` call after the validation loop, before the Gate 1 digest), the `split_checkpoint` return, the guarded parse, and the `implement-feature` Step 1a branches, Keywords step (T-8), proposal presentation and main-loop placement | AC-03, AC-05, AC-06, AC-17, AC-18, AC-19, AC-22 | TEST | [components/split-checkpoint-static.test.js.md](components/split-checkpoint-static.test.js.md) |

### Modified files
| Path | Change description | Addresses | Domain | Spec |
|------|-------------------|-----------|--------|------|
| src/claude/scripts/feature-split.js | Add the `check-size` command (D-05 output). Steps: `isNewFeature` gives `skipped`; measure UC-NN, AC-NN, component rows (T-2, pending choice) and build-order levels (D-02, T-1); compare with `loadConfig` thresholds through `isOverThreshold`; any unavailable count gives `unavailable` with exit 1, no proposal, and `over` still listed (T-3); otherwise `passed`, or `split-proposed` with a `buildProposal` measured proposal built by the deterministic grouping (T-6), foundation mapping (T-7) and empty `keywords` (T-8). Read-only, no LLM, errors as `FeatureSplitError`. | AC-01, AC-02, AC-03, AC-04, AC-05, AC-07, AC-08, AC-09, AC-10, AC-13, AC-14, AC-15, AC-16, AC-18 | BE | [components/feature-split.js.md](components/feature-split.js.md) |
| src/claude/workflows/pm-phase1.js | Add the hook after the validation loop and before the `docsDigest` computation: run `check-size` through `c.command(['run-asset', 'scripts/feature-split.js', '--project', c.root, '--', 'check-size', '--feature-dir', ..., '--prefix', ...])`; parse the result with a guard (missing, failed or non-JSON gives `unavailable`); add `split_checkpoint` to the returned object. The hook never prompts and never calls `apply`. | AC-03, AC-05, AC-17, AC-18, AC-22 | BE | [components/pm-phase1.js.md](components/pm-phase1.js.md) |
| src/claude/skills/implement-feature/SKILL.md | Add Step 1a between Step 1 and Step 2 (Gate 1). Branches on `split_checkpoint.status`: `passed` or `skipped` continues to Gate 1 with no prompt; `unavailable` shows each unavailable count and its reason as a plain error and stops (no prompt, AC-06); `split-proposed` derives each child's Keywords (T-8), then presents the proposal (each over-threshold count beside its threshold; per child: name, purpose, Summary, Keywords, dependsOn, assigned use cases and components; foundation owner or the "no depth-0 component" note) and asks accept, edit or reject. Edit: the user may change child names, purposes, order and foundation owner, and add, remove or merge children (refused below `minChildren`), plus Summary and Keywords (D-09 to D-12, via `editProposal`); the edited proposal is shown again and is applied only after a fresh explicit accept. Accept: send the confirmed JSON to `feature-split.js apply --features-root <root> --parent <FTR-ID>`; on success stop for the parent and print the epic and children, with no Gate 1; on failure report the error, state that no child or registry entry remains (T-5), and stop. Reject: continue to Gate 1 and write nothing. Unanswered: stop and store nothing (T-4). | AC-03, AC-06, AC-10, AC-11, AC-12, AC-14, AC-15, AC-16, AC-19, AC-20, AC-21 | BE | [components/SKILL.md.md](components/SKILL.md.md) |

## 10. Testing Strategy

_Per-component detail — see each component's own design file's own Tests section (generated
separately, one call per component). Do not write any content here._

## 11. Implementation Order

1. Add the `check-size` command and measurement (counts, build-order levels, unavailable handling with precedence, deterministic measured proposal with grouping T-6, foundation mapping T-7 and empty Keywords T-8) to `feature-split.js` — depends on: none. Requires the user's T-2 choice first.
2. Add the `check-size` unit tests in `tests/scripts/feature-split-check-size.test.js` — depends on: 1
3. Add the `pm-phase1` hook after the validation loop and before the Gate 1 digest, with the guarded parse and the `split_checkpoint` return — depends on: 1
4. Add `implement-feature` Step 1a (branches, Keywords derivation, proposal presentation, accept, edit, reject, apply and error flows in the main loop) to `SKILL.md` — depends on: 3
5. Add the static tests for the hook position and the Step 1a text in `tests/workflows/split-checkpoint-static.test.js` — depends on: 3, 4

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Component definition is not chosen** (T-2, PENDING). feature.md D-01 says a singular component table. BR-05 and AC-07 say a single table with no union. Section 9 has two subtables. | High: the component count can change and flip the threshold. | Open point for the user before Gate 1, with options A, B and C in T-2. Until then, `check-size` implements option A. The chosen option must update T-2, the `feature-split.js` row, and BR-05 / AC-07 in `req/index.md`. This document cannot edit `req/index.md`. |
| **FTR-035 is `defined`, not completed.** `feature-split.js` and `feature-split.config.json` already exist in `src/claude/scripts/`, but FTR-037 depends on their contracts (`loadConfig`, `isNewFeature`, `isOverThreshold`, `meetsMinimum`, `buildProposal`, `editProposal`, `apply`). | High: `check-size` and the proposal cannot be built or tested end to end if the contracts differ. | Before step 1, verify the exports against FTR-035 D-02, D-05, D-07, D-08 and D-13. Do not change those contracts. Build only on the existing exports. |
| **Grouping rule is heuristic** (T-6). Child count, contiguous use-case blocks and AC-to-UC component links are proposed here, not taken from feature.md. | Medium: the proposal may group parts in a way the user rejects. | The rule is deterministic and testable (AC-10, AC-15). The user can edit membership through add, remove and merge (D-09). The user should confirm the rule before Gate 1. |
| **Depth-0 mapping is path-based** (T-7). A component counts as depth 0 only when its Path appears exactly in a depth-0 Section 11 item. | Medium: a foundation may be missed if the build order names components differently, and the proposal then states that no foundation exists. | The explicit note makes the case visible. The Section 11 format rule (D-02) and the static tests keep the names consistent. |
| **Only one use case group can be formed** (T-6 step 2). If U < minChildren, no split can be formed. | Medium: an over-threshold feature with too few use cases blocks Gate 1 with an unavailable status. | The reason is stated in the result, and the user fixes the Requirements or thresholds. Covered by a unit test in the `check-size` suite. |
| **Threshold values are uncalibrated placeholders** (8, 15, 30, 6; FTR-035 D-02). | Medium: the over-threshold results depend on values not yet calibrated. | Values are read from configuration only. Tests inject their own thresholds. Calibration is outside FTR-035 and FTR-037. |
| **Build-order parse errors** (dangling dependency, cycle, missing `depends on:` clause). | Medium: the phase count becomes unavailable and blocks Gate 1 until the Section 11 list is fixed. | Section 11 uses only the D-02 numbered format, with one item per line and no unnumbered list items. Covered by AC-09 tests. |
| **Hook result malformed or missing** (BR-04, AC-17). | Medium: a silent pass would skip the checkpoint. | Guarded parse in the hook. Missing, failed or non-JSON output maps to `unavailable`. Gate 1 is not reached. Covered by static tests. |
| **Mutation during check** could invalidate the Gate 1 `docs_digest`. | Medium: the digest would not bind the reviewed bytes. | `check-size` is read-only. The hook runs before the digest is computed (AC-22 static test pins the order). |
| **Failed apply leaves partial state** (UC-03, AC-20). | High: unwanted folders or registry entries. | FTR-035 D-13 staging and rollback (T-5). The Step 1a error flow stops and reports. A retry is a new `implement-feature` run with fresh IDs. |
| **Unanswered proposal** (UC-03, AC-21). | Low: the user must rerun to see the proposal again. | Nothing is stored, so nothing needs cleanup (T-4). The rerun recomputes the same proposal from the same documents. |
| **Acceptance writes before user confirmation** (NFR-02, BR-01). | High: unwanted folders or registry entries. | `apply` is called only from the main loop after an explicit accept (AC-11). Reject and the unanswered path write nothing (AC-12, AC-21). |
| **Requirements alignment owned elsewhere.** The Requirements still need: BR-05 and AC-07 (T-2); BR-06 and Open Question 1 (record T-1); the default thresholds (Open Question 2, restated from Section 8); the new-feature test (Open Question 3, restated from D-07); UC-02 editable fields (Open Question 4, restated from BR-13); UC-03 and AC-20 / AC-21 (Open Questions 5 and 6, resolved by T-4 and T-5); and the Keywords source (UC-02 step 3a, resolved by T-8). | Medium: AC-07, AC-08, AC-09 and AC-16 cannot be verified against fixed text until the owner records them. | The requirements owner records these resolutions in `req/`. This document does not edit `req/`. |
| **Conflict with FTR-029** (pipeline resilience hardening) on `pm-phase1.js`. | Low to medium: merge conflicts or changed error handling. | Keep the insertion local between the validation loop and the digest. Coordinate with FTR-029. |
| **Sibling FTR-036** (checkpoint 1) shares the size contracts. | Low: duplicated threshold logic if the two diverge. | Both use only the FTR-035 `loadConfig`, `isOverThreshold` and `meetsMinimum`. FTR-037 does not change any file that FTR-036 owns. |
| **Parent epic FTR-034** must not receive a spec or child list from this feature. | Low. | The epic is a parent record only. Its children are not listed as components. Registry changes happen only through FTR-035 `apply` after acceptance. |
| **Test discovery** for the new `tests/scripts/` and `tests/workflows/` directories. | Low: tests silently not run. | Verified: `jest.config.js` uses `testMatch: ['**/tests/**/*.test.js']`, which covers both directories. `npm test` must pass. |