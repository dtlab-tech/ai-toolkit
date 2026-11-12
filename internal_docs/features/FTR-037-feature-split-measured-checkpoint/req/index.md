# FTR-037 — Functional Requirements (Index)

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-037 — Feature Split Checkpoint 2: Measured Size Check After Tech-Spec |
| Version | 1.0 |
| Date | 2026-11-11 |
| Status | Draft |

> **Legend:** **Field** — the document metadata item. **Value** — its content for this feature.

## 1. Introduction

### 1.1 Purpose

This document defines the functional requirements for the measured size checkpoint of the feature split (parent epic FTR-034, position 3 of 3). After the Requirements and Tech-Spec documents are generated, the pipeline measures four counts (use cases, acceptance criteria, components, estimated phases) and compares each with its configured threshold. If any count is over its threshold, the pipeline stops before Gate 1 and proposes a split computed from the generated documents. The user accepts, edits or rejects the proposal. The document covers the `check-size` command of `feature-split.js`, the hook in `pm-phase1.js`, the proposal step in the `implement-feature` skill, and the static tests that pin them.

### 1.2 Scope

**In scope**
- The `check-size` command of `feature-split.js` and the measurement it performs.
- The hook in `pm-phase1.js` that runs `check-size` after the validation loop and before the Gate 1 digest, and returns the result as `split_checkpoint`.
- The change to the `implement-feature` skill that presents the proposal (Step 1a) and collects accept, edit or reject in the main loop.
- Static tests that pin the hook and the skill text.

**Out of scope**
- Configuration, the new-feature test, the proposal model, apply and registry. These belong to FTR-035 and are referenced here, not redefined.
- The checkpoint 1 assessment in `define-feature` (FTR-036).
- Measuring tasks or applications. They do not exist before Gate 1 and are not thresholds.
- Splitting a feature that is in progress or already approved.

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| Pipeline (`pm-phase1` workflow) | Runs `check-size` after the validation loop, adds the result to its return value, and stops the pipeline before Gate 1 when a split is proposed or a count is unavailable. |
| `implement-feature` main loop | Reads the `split_checkpoint` result (Step 1a), shows the proposal or the unavailable report, collects accept, edit or reject, derives child Keywords, and runs `apply` from FTR-035. |
| User | Accepts, edits or rejects the proposal, and fixes the cause of an unavailable count. |

> **Legend:** **Actor** — the component or person that performs or receives a behaviour in this feature. **Description** — its responsibility within the checkpoint.

## 2. Use Cases

| UC ID | Title | Actor | Priority | File |
|-------|-------|-------|----------|------|
| UC-01 | Measure feature size after Tech-Spec | Pipeline (`pm-phase1`) | Must | [use-cases/UC-01.md](use-cases/UC-01.md) |
| UC-02 | Propose a split before Gate 1 | Pipeline; `implement-feature` main loop; User | Must | [use-cases/UC-02.md](use-cases/UC-02.md) |
| UC-03 | Apply the accepted split or continue unchanged | User; `implement-feature` main loop | Must | [use-cases/UC-03.md](use-cases/UC-03.md) |

> **Legend:** **UC ID** — unique identifier, referenced from Business Rules (`Applies to`) and Acceptance Criteria (`Related UC`). **Title** — short label; the full flow is in the linked file. **Actor** — who or what initiates or participates. **Priority** — MoSCoW; drives Must-coverage checks. **File** — the use case's own detail file.

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | The split is always a proposal. Nothing is created (no epic, child folder, or registry entry) without explicit confirmation from the user. | UC-02, UC-03 |
| BR-02 | A feature whose counts are all at or below their thresholds passes without any prompt, and the pipeline continues to Gate 1. | UC-01 |
| BR-03 | A count that cannot be measured is reported as unavailable and never counts as passing. The check stops, and the pipeline does not reach Gate 1 until the cause is fixed. | UC-01, UC-02 |
| BR-04 | The hook never parses the check result unguarded. A missing, failed or non-JSON result is reported as unavailable. | UC-01 |
| BR-05 | Components are the data rows of the single component table in `spec/index.md` (FTR-037 D-01): header and separator rows are excluded, and rows from any other table, including the New/Modified file rows of Tech-Spec Section 9, are not added. Where two sources would give different counts, the single component table governs. A missing, unreadable or empty table makes the component count unavailable. | UC-01 |
| BR-06 | Estimated phases equal the number of dependency levels of the Tech-Spec Section 11 build order, computed per the D-02 format (depth 0 for items with no dependency; otherwise one more than the greatest dependency depth; levels = greatest depth + 1). The build order is stored in `spec/index.md` (Tech-Spec T-1). A dangling dependency, a cycle, or an item without a `depends on:` clause makes the count unavailable. | UC-01 |
| BR-07 | A count is over its threshold when `isOverThreshold` (FTR-035 D-05) says so: strictly greater than the configured threshold. A count equal to its threshold passes. The thresholds are the FTR-035 configuration keys `useCases`, `acceptanceCriteria`, `components` and `estimatedPhases`, with the FTR-035 placeholder defaults 8, 15, 30 and 6 (see Section 4.2). | UC-01 |
| BR-08 | Precedence: if any count is unavailable, the status is `"unavailable"` regardless of counts that are over threshold. No proposal is built or shown in that case. Over-threshold counts are still listed in the result for information. | UC-01, UC-02 |
| BR-09 | On rejection, the pipeline continues to Gate 1 unchanged and stores nothing (no rejection record, no registry change). An unanswered proposal also stores nothing; the next run recomputes the check and any proposal from scratch with fresh IDs. | UC-03 |
| BR-10 | The shared foundation goes to the first child in dependency order, which holds the components at depth 0 of the build order. If there is no distinct depth-0 level, no foundation is assigned and the proposal states that explicitly. How a component is identified as belonging to a depth-0 build-order item is open (see Open Question 2). | UC-02 |
| BR-11 | Each child's draft is built from the parent's generated documents: the use cases and components assigned to that child. The rule that assigns them is open (see Open Question 1). | UC-02 |
| BR-12 | A feature is new unless its folder contains `{PREFIX}-Approvals.md`, a `wbs/` directory, or `epic.md` (FTR-035 D-07). A folder that does not exist yet is new. A feature that is not new is skipped: no counts are measured and the status is `"skipped"`. | UC-01 |
| BR-13 | The editable fields of a proposal are: child names; child purposes; child order; the foundation owner; adding, removing and merging children; the Summary; and the Keywords. Edits follow FTR-035 D-09 to D-11. An edit that leaves fewer children than the FTR-035 `minChildren` setting is refused. Every edit re-presents the proposal and needs an explicit accept before apply (BR-01). Keywords are derived by the agent in the `implement-feature` main loop from the child's title, use cases and components (FTR-037 D-09). | UC-02 |
| BR-14 | A failed apply is rolled back under FTR-035 D-13 staging, so no child folder or registry entry from that apply remains. Retrying means running the feature again: the check runs again and a new proposal with fresh IDs is presented. | UC-03 |

> **Legend:** **ID** — unique identifier. **Rule** — the constraint itself. **Applies to** — which UC(s) the rule constrains, or "All UCs" if universal.

## 4. Data Requirements

### 4.1 Entities

**CheckResult** (the object printed by `check-size` and returned by the hook as `split_checkpoint`):
- `status` — one of `"skipped"`, `"passed"`, `"unavailable"`, `"split-proposed"`.
- `counts` — object with the four measured counts, keyed as defined by FTR-035 D-02 (`useCases`, `acceptanceCriteria`, `components`, `estimatedPhases`). Absent or null when skipped.
- `thresholds` — object with the four configured thresholds, keyed as in `counts`.
- `over` — list of the count keys that are over their threshold (may be empty).
- `unavailable` — list of `{ count, reason }` objects, one per count that could not be measured (may be empty).
- `proposal` — FTR-035 D-08 proposal shape with `source: "measured"`. Present only when `status` is `"split-proposed"`. Its Keywords fields are filled by the agent in the main loop (BR-13), not by `check-size`.

**Measured counts** (derived from the generated documents):
- Use cases: distinct `UC-NN` identifiers across `req/use-cases/*.md`.
- Acceptance criteria: distinct `AC-NN` identifiers in `req/index.md`.
- Components: data rows of the single component table in `spec/index.md` (BR-05).
- Estimated phases: dependency levels of the Tech-Spec Section 11 build order, stored in `spec/index.md` (BR-06).

**Relationships:** a `CheckResult` with `status` `"split-proposed"` contains exactly one `proposal`. A `CheckResult` with `status` `"unavailable"` contains at least one `unavailable` entry and no `proposal` (BR-08).

> **Legend:** **Entity / Measured count** — the data object or count, with its fields or source. **Relationships** — the constraints between its fields.

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| `status` | Must be one of `skipped`, `passed`, `unavailable`, `split-proposed`. Any other value, or a missing value, is treated as `unavailable` (BR-04). |
| `counts.*` | Non-negative integer when available. Absent when the count is in `unavailable`. |
| `thresholds.useCases` | FTR-035 configuration key; placeholder default 8. |
| `thresholds.acceptanceCriteria` | FTR-035 configuration key; placeholder default 15. |
| `thresholds.components` | FTR-035 configuration key; placeholder default 30. |
| `thresholds.estimatedPhases` | FTR-035 configuration key; placeholder default 6. |
| `over` | Contains only count keys whose value is strictly greater than the threshold (BR-07). A value equal to the threshold is not listed. |
| `unavailable[].reason` | Non-empty string naming the cause (missing file, empty table, cycle, dangling dependency, missing `depends on:` clause, or unreadable result). |
| `proposal` | Present only when `status` is `split-proposed`; `source` equals `"measured"`. |
| Build-order item | Must match `N. <text> — depends on: <M[, M…]>` or `N. <text> — depends on: none`. Non-matching items make the phase count unavailable (BR-06). |

> **Legend:** **Field** — the entity field or item the rule applies to. **Rule** — the validation constraint; a violation makes the affected count unavailable or the result treated as unavailable.

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Reliability | Given identical input documents and configuration, `check-size` returns identical counts, status and proposal on every run. `check-size` makes no LLM calls; Keywords are derived later by the agent in the main loop (BR-13). |
| NFR-02 | Safety | No epic, child folder or registry entry is created by this feature unless the user has explicitly accepted a proposal (BR-01). |
| NFR-03 | Robustness | A failed, missing or non-JSON `check-size` result never stops the pipeline with an unhandled error. It is reported as an unavailable check that blocks Gate 1 (BR-03, BR-04). |
| NFR-04 | Maintainability | Thresholds and the new-feature test come from FTR-035 configuration. Changing them requires no change to this feature's code. |
| NFR-05 | Testability | The hook and the skill text are covered by static tests that fail if the `check-size` call, its position (after the validation loop, before the Gate 1 digest) or the Step 1a handling is removed or changed. |

> **Legend:** **ID** — unique identifier. **Category** — the quality attribute. **Requirement** — the testable statement.

## 6. UI Requirements

### 6.1 Pages / Screens

N/A — internal/technical feature. No page or screen is introduced or changed. The only user-facing interaction is a text proposal and a question in the `implement-feature` main loop (see UC-02 and UC-03). Its content is defined in those use cases and in the acceptance criteria.

### 6.2 Navigation Flow

N/A — no pages. The flow between steps is the pipeline sequence: validation loop, then `check-size` (Step 1a), then either Gate 1 or the proposal stop (see UC-01 to UC-03).

## 7. Acceptance Criteria

| ID | Criterion | Related UC | Priority |
|----|-----------|-------------|----------|
| AC-01 | Given a feature whose folder contains `{PREFIX}-Approvals.md`, a `wbs/` directory or `epic.md` (not new under FTR-035 D-07), when `check-size` runs, then the status is `"skipped"`, no counts are measured, and the pipeline continues to Gate 1. | UC-01 | Must |
| AC-02 | Given a new feature with all four counts at or below their thresholds, when `check-size` runs, then the status is `"passed"`, no prompt is shown, and the pipeline continues to Gate 1. | UC-01 | Must |
| AC-03 | Given a new feature with at least one count strictly over its threshold (for example 9 use cases against the default 8) and all counts available, when `check-size` runs, then the status is `"split-proposed"`, the pipeline stops before Gate 1, and the proposal shows each over-threshold count beside its threshold. | UC-01, UC-02 | Must |
| AC-04 | Given a count equal to its threshold (for example exactly 8 use cases) and no other count over threshold, when `check-size` runs, then that count passes and the status is `"passed"`. | UC-01 | Must |
| AC-05 | Given one count unavailable and another count over its threshold, when `check-size` runs, then the status is `"unavailable"`, no proposal is present or shown, the over-threshold count is still listed in `over`, and the pipeline stops before Gate 1. | UC-01, UC-02 | Must |
| AC-06 | Given a count that is unavailable, when the check result is reported, then the report is a plain error in the main loop naming the count and the reason, and it is not an approval prompt. | UC-02 | Must |
| AC-07 | Given `spec/index.md` with one component table of N data rows (header and separator excluded), when components are measured, then the component count is N. Given no component table, an empty table, or an unreadable file, then the component count is unavailable with a reason. | UC-01 | Must |
| AC-08 | Given a build order whose items form levels 0, 1 and 2 (for example A with no dependency, B depends on A, C depends on A and B), when estimated phases are measured, then the count is 3. | UC-01 | Must |
| AC-09 | Given a build order with a dangling dependency, a cycle, or an item without a `depends on:` clause, when estimated phases are measured, then the count is unavailable with a reason. | UC-01 | Must |
| AC-10 | Given a count is over threshold, when the proposal is presented, then the proposal is derived from the generated documents and lists which use cases and components go to which child. The assignment rule is open (Open Question 1). | UC-02 | Must |
| AC-11 | Given the proposal is shown, when the user accepts, then `apply` from FTR-035 runs and the pipeline stops for the parent without reaching Gate 1. | UC-03 | Must |
| AC-12 | Given the proposal is shown, when the user rejects, then the pipeline continues to Gate 1 unchanged, and no rejection record and no registry change is stored. | UC-03 | Must |
| AC-13 | Given no proposal has been explicitly accepted, when the pipeline runs, then no epic, child folder or registry entry is created by this feature. | UC-02, UC-03 | Must |
| AC-14 | Given a build order with a distinct depth-0 level, when the proposal is built, then the first child in dependency order holds the depth-0 components as the shared foundation. Given no distinct depth-0 level, then no foundation is assigned and the proposal says so explicitly. The component-to-item mapping is open (Open Question 2). | UC-02 | Should |
| AC-15 | Given the proposal is built, when each child is described, then its draft lists exactly the use cases and components assigned to it, taken from the parent's generated documents. | UC-02 | Should |
| AC-16 | Given the user edits any field listed in BR-13 (child names, purposes, order, foundation owner, add, remove or merge of children, Summary, Keywords), when the edit is applied, then the edited proposal is shown again and is applied only after an explicit accept. Given an edit that leaves fewer than `minChildren` children, then the edit is refused. | UC-02 | Must |
| AC-17 | Given `check-size` returns a missing, failed or non-JSON result, when the hook processes it, then the check is reported as unavailable, the hook does not raise an unhandled error, and the pipeline does not reach Gate 1. | UC-01 | Must |
| AC-18 | Given `check-size` is invoked, then it is run through `run-asset scripts/feature-split.js --project <root> -- check-size --feature-dir <dir> --prefix <FTR-ID>` and prints the keys `status`, `counts`, `thresholds`, `over`, `unavailable` and, for `split-proposed` only, `proposal`. | UC-01 | Must |
| AC-19 | Given `implement-feature` Step 1a receives `passed` or `skipped`, then it continues to Gate 1 without a prompt. Given `unavailable`, it shows each unavailable count as a plain stop. Given `split-proposed`, it presents the proposal. | UC-02 | Must |
| AC-20 | Given an apply that fails partway, when the failure is reported, then FTR-035 D-13 staging and rollback leave no child folder or registry entry from that apply (BR-14). A retry runs the feature again and presents a new proposal with fresh IDs. | UC-03 | Should |
| AC-21 | Given a proposal the user has not yet answered, when the session stops, then the pipeline does not proceed to Gate 1 and stores nothing. The next run re-runs `check-size` and presents a fresh proposal with fresh IDs (BR-09). | UC-03 | Should |
| AC-22 | Given the static test suite, when it runs, then it fails if the hook does not call `check-size` after the validation loop and before the Gate 1 digest, or if the Step 1a handling in the skill is removed. | UC-01, UC-02 | Must |

> **Legend:** **ID** — unique identifier; the anchor used across the feature's traceability chain. **Criterion** — a testable Given/When/Then statement. **Related UC** — which UC(s) the criterion belongs to. **Priority** — MoSCoW; every Must criterion must be covered by at least one Work Breakdown task.

## 8. Dependencies and Assumptions

**External dependencies**
- FTR-035 (Feature Split Foundation, status `defined`, `Depends on: none`). Provides the configuration and thresholds, the new-feature test (D-07), `isOverThreshold` (D-05), the count keys (D-02), the proposal shape (D-08), the edit rules (D-09 to D-11), staging and rollback (D-13), atomic apply, registry entries, and the `feature-split.js` facade.
- Parent epic FTR-034 (status `epic`). Its epic record exists at `internal_docs/features/FTR-034-feature-split-epics/epic.md`, so the epic check passes. This feature's folder holds no `epic.md`, so it is not a parent record.
- This feature's registry entry: `Parent: FTR-034`, `Depends on: FTR-035`.
- Sibling FTR-036 (checkpoint 1, `Parent: FTR-034`, `Depends on: FTR-035`). It shares the feature-split keywords but has no dependency with FTR-037 in either direction. It is not a relevance source for these requirements.
- Standalone entries relevant to the split inputs: FTR-021 (`req/index.md` and `req/use-cases/` layout), FTR-024 (`spec/index.md` and per-component files), FTR-025 (monolithic documents are assembled on demand, not persisted, so the counts read the split sources), FTR-026 (downstream consumers read the split sources). Context only for the hook: FTR-009, FTR-013, FTR-016 and FTR-029 (`pm-phase1`).
- The Requirements and Tech-Spec generation stages, which produce the counted documents.
- `pm-phase1.js` (workflow hook) and the `implement-feature` skill (Step 1a).
- `run-asset` and the `c.command` call form already used in `pm-phase1.js`.

**Assumptions**
- The new-feature test (BR-12), the threshold keys and placeholder defaults (BR-07, Section 4.2) and the edit rules are those of FTR-035. This document restates them so the criteria can be checked; FTR-035 remains the owner.
- The Tech-Spec's T-2 definition (union of New and Modified rows of Section 9, de-duplicated by Path) is not adopted. FTR-037 D-01 and BR-05 define components as rows of the single component table. The Tech-Spec must be aligned to this; the Requirements do not change.
- The build order is stored in `spec/index.md` (Tech-Spec T-1), so both the component count and the phase count read a single source file.
- Keywords are produced by the agent in the `implement-feature` main loop after `check-size` returns (FTR-037 D-09, D-11). `check-size` remains deterministic and LLM-free (NFR-01). The proposal the user sees is the one `check-size` printed, with the agent-derived Keywords added before it is presented.
- BR-08 follows from D-04, D-05 and D-11: `unavailable` is a distinct status, and a proposal is produced only when every count is available.
- BR-03 means an unavailable count blocks Gate 1 until the cause is fixed. It is not a prompt, and the user is not asked to approve it.
- The partial-apply and unanswered-proposal paths are resolved (BR-09, BR-14; AC-20, AC-21): staging and rollback under FTR-035 D-13, and a fresh run with fresh IDs. No state is stored between runs (FTR-037 D-10).
- Registry check: no malformed `Parent:` or `Depends on:` values were found for FTR-034, FTR-035, FTR-036 or FTR-037.

**Prior validation gaps: resolution in this version**
- Component definition (BR-05 and AC-07 versus Tech-Spec T-2): resolved by D-01, single table, no union.
- Keywords source and proposal contents: resolved by D-09, D-11 and the assumption above.
- Editable proposal fields: resolved by BR-13 and AC-16.
- Build-order storage location: resolved as `spec/index.md` (BR-06).
- Default thresholds: resolved as the FTR-035 keys and placeholder values (BR-07, Section 4.2).
- New-feature test: restated (BR-12, AC-01).
- Partial apply cleanup and retry, and unanswered-proposal resume: resolved (BR-09, BR-14, AC-20, AC-21).
- Child grouping rule and depth-0 component mapping: not defined by FTR-037 and not resolvable here. They remain open (Open Questions 1 and 2).

## 9. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| 1 | Which rule assigns each use case and each component to a child? FTR-037 D-08 says each child gets "the use cases and components given to it" but does not define the assignment. | BR-11, AC-10 and AC-15 cannot be checked against a defined grouping rule, and the child drafts cannot be generated deterministically. | Open — deferred. Candidate: group by build-order levels with a deterministic tie-break, then let the user edit membership (BR-13). Decide before Gate 1. |
| 2 | How is a component identified as belonging to a depth-0 build-order item? FTR-037 D-07 requires "the components at depth 0" but the mapping from a component to a build-order item is undefined. | BR-10, AC-14 cannot be verified, and the shared foundation cannot be assigned. | Open — deferred. Candidate: a component is depth 0 when a depth-0 Section 11 item names it, with a stated matching rule. Decide before Gate 1. |

> **Legend:** **#** — question number. **Question** — the ambiguity or missing decision. **Impact** — what cannot be verified or built if it stays unresolved. **Suggested resolution** — the proposed decision, or "open — deferred".