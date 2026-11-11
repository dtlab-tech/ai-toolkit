# FTR-036 — Functional Requirements (Index)

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-036 — Feature Split Checkpoint 1: Size Assessment During Definition |
| Version | 1.0 |
| Date | 2026-11-09 |
| Status | Draft |

> **Legend:** **Field** — document metadata key. **Value** — its value for this feature.

## 1. Introduction

### 1.1 Purpose

This document defines the functional requirements for the early size checkpoint in `define-feature`. Right after grilling, the agent assesses whether the feature covers several independent flows, actors or applications. If it does, it proposes a split into child features before anything is written. The user accepts, edits or rejects the proposal. The checkpoint is advisory and works only from the grilling answers, so it runs no pipeline stage. It builds on the configuration, new-feature test, proposal model, `apply` command and registry defined by FTR-035, and it is the second position in the FTR-034 epic.

### 1.2 Scope

**In scope**
- A Phase 3a in the `define-feature` agent, between Phase 3 (grilling) and Phase 4 (writing `feature.md`).
- The `check-definition` command of `feature-split.js`.
- The change to the `define-feature` skill that presents the proposal and collects accept, edit or reject in the main loop.
- Registration of a standalone feature when its `feature.md` is written.
- Creation of a late child of an existing epic through `define-feature`.
- Static tests that pin the new text of the agent and the skill.

**Out of scope**
- Configuration, the new-feature test, the proposal model, `apply` and the registry (owned by FTR-035).
- Measuring generated documents (FTR-037, checkpoint 2).
- Splitting a feature that is in progress or approved.

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| User | The person describing the feature during grilling. Accepts, edits or rejects the split proposal. Requests late children of an existing epic. |
| define-feature agent | Runs grilling, Phase 3a, and Phase 4. Builds the grilling record, runs `check-definition`, drafts the proposal, writes `feature.md`, and runs `register`. |
| define-feature skill (main loop) | Presents the proposal to the User and collects the accept, edit or reject decision. Returns control to the agent with explicit state. |
| feature-split.js (system) | Script facade that provides `check-definition` and `apply`. |

> **Legend:** **Actor** — a participant in the use cases. **Description** — its role in this feature.

## 2. Use Cases

| UC ID | Title | Actor | Priority | File |
|-------|-------|-------|----------|------|
| UC-01 | Assess a new feature at definition time | define-feature agent (with User) | Must | [use-cases/UC-01.md](use-cases/UC-01.md) |
| UC-02 | Accept, edit or reject the split proposal | User (via define-feature main loop) | Must | [use-cases/UC-02.md](use-cases/UC-02.md) |
| UC-03 | Create a late child of an existing epic | User (via define-feature) | Should | [use-cases/UC-03.md](use-cases/UC-03.md) |

> **Legend:** **UC ID** — unique identifier, referenced from Business Rules and Acceptance Criteria. **Title** — short label; the full flow is in the linked file. **Actor** — who initiates or participates. **Priority** — MoSCoW. UC-03 is Should because the checkpoint itself (UC-01, UC-02) is the Must path, and late children are deferrable (see Section 9, item 1). **File** — the use case's own detail file.

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | The split is always a proposal. Nothing is created without explicit user confirmation. | UC-01, UC-02, UC-03 |
| BR-02 | A signal that cannot be evaluated from the grilling answers does not raise the flag. The agent names each signal it could not evaluate. | UC-01 |
| BR-03 | The checkpoint writes nothing to disk before the user confirms. The grilling record is never written to disk. | UC-01, UC-02, UC-03 |
| BR-04 | `define-feature` never overwrites an existing `feature.md` (FTR-035 D-17). | UC-01, UC-02, UC-03 |
| BR-05 | The feature is flagged as a probable epic when the grilling answers show at least `minActors` = 2 actors, or at least `minApplications` = 2 applications, or at least `minFlows` = 3 independently deliverable flows. The values are the defaults from the Tech-Spec (Section 8) and are read from `definitionSignals` (FTR-035 D-05). Comparison uses `meetsMinimum`. | UC-01 |
| BR-06 | The new-feature test runs first. If the feature folder contains `epic.md`, `{PREFIX}-Approvals.md`, or a `wbs/` directory, the feature is not new and `check-definition` returns status `"skipped"`. No signal is evaluated and no proposal is shown. | UC-01 |
| BR-07 | The features root is obtained only from `ai-toolkit resolve-features-root` and is never hard-coded. If that call fails, the agent stops, reports the failure, and writes nothing. | UC-01, UC-02, UC-03 |
| BR-08 | If the grilling record is not parseable or does not match the D-03 shape (`RECORD_INVALID`), the agent stops, reports the error, and writes nothing. | UC-01 |
| BR-09 | For an accepted split, the parent `feature.md` is written and registered with status defined before `apply --parent` is called. FTR-035's `apply` in initial mode requires a defined parent. | UC-02 |
| BR-10 | If `apply` fails partway, the agent reports the children already created, and offers retry, edit or reject. While a `.split-staging-*` leftover exists, later applies are blocked. | UC-02 |
| BR-11 | A late child (UC-03) is refused unless the target epic's registry status is `epic`. No grilling round runs for it, there is no standalone fallback on rejection, and `register` is not called for it. | UC-03 |
| BR-12 | The target epic is found by an exact FTR-ID match on a folder that contains `epic.md`. If no epic matches, the agent lists the candidate epics and creates nothing. If the child's `feature.md` already exists, the agent reports and stops. | UC-03 |
| BR-13 | Splitting a feature that is in progress or approved is out of scope. The checkpoint never triggers such a split. | All UCs |

> **Legend:** **ID** — unique identifier. **Rule** — the constraint itself. **Applies to** — the UC(s) it constrains, or "All UCs".

## 4. Data Requirements

### 4.1 Entities

**Grilling record** (in memory only, never persisted)
- `actors`: list of actor names from grilling.
- `applications`: list of application names from grilling.
- `flows`: list of objects `{ name, reason }`. Each flow is a user-visible capability that can be delivered on its own, with a one-line reason.
- Passed to `check-definition` as JSON on stdin (D-03). Constraint: never written to disk.

**Check result** (returned by `check-definition`)
- `status`: one of `"skipped"` (feature not new), `"not-flagged"`, or `"flagged"`.
- `signals`: each count (actors, applications, flows) compared with its minimum.
- `flows`: the flow list from the record, as in D-02.
- `unevaluated`: names of any signals that could not be evaluated.

**Split proposal** (in memory until confirmed)
- Child name and one-line purpose for each child.
- Dependency order between children.
- Shared parts, assigned to the first child.
- Per child: `Summary` and `Keywords`, both shown as editable items.
- Flow list with reasons.

**Standalone registration** (for a feature that is not split)
- `Summary`: the first sentence of the feature's Summary section.
- `Keywords`: derived from the title and main terms, shown to the user, and editable.
- Written through `register` (FTR-035 D-25).

**Late child** (UC-03)
- Child `feature.md`, placed last under the target epic, depending on the previous last child.
- `Summary` and `Keywords` derived from the child's purpose and the epic's Summary (explicit refinement of D-07; see Section 8).
- No registration call (BR-11).

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| Grilling record (root) | Must be JSON with `actors`, `applications` and `flows` arrays. Otherwise `RECORD_INVALID`, with stop, report and write nothing (BR-08). |
| `flows[].name` and `flows[].reason` | Strings. `reason` is one line. |
| `--feature-id` | Must match the pattern `[A-Z]+-[0-9]+`. |
| `--features-root` | Taken only from `ai-toolkit resolve-features-root` (BR-07). |
| Signal minimums | Positive integers read from `definitionSignals`; defaults `minActors` 2, `minApplications` 2, `minFlows` 3 (BR-05). |
| Feature not new | Any of `epic.md`, `{PREFIX}-Approvals.md`, or a `wbs/` directory present in the feature folder yields status `"skipped"` (BR-06). |
| `Summary` (standalone) | The first sentence of the feature's Summary section. |
| `Keywords` | Derived, shown to the user, and editable before registration. |
| Target epic (UC-03) | Exact FTR-ID match on a folder containing `epic.md`, with registry status `epic` (BR-11, BR-12). |

> **Legend:** **Field** — the data element or input. **Rule** — the validation constraint and its failure behaviour.

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Performance | `check-definition` runs on the grilling answers only and invokes no pipeline stage (Requirements, Tech-Spec, Work Breakdown, or any generation step). |
| NFR-02 | Security | The grilling record is held in memory and is never written to disk (D-03). |
| NFR-03 | Reliability | No file is written before the user confirms the proposal or the late-child creation (BR-03). |
| NFR-04 | Reliability | A failed `apply` leaves the user able to see the children already created, and blocks later applies while a `.split-staging-*` leftover exists (BR-10). |
| NFR-05 | Usability | The proposal lists each flow by name with a one-line reason, so the user can verify the flow count (D-02). |
| NFR-06 | Maintainability | Static tests pin the new text of the `define-feature` agent and skill, so regressions in the checkpoint wording are detected. |
| NFR-07 | Compatibility | Paths are always resolved through `ai-toolkit resolve-features-root`. No path is hard-coded (D-10). |

> **Legend:** **ID** — unique identifier. **Category** — the quality attribute. **Requirement** — the testable statement.

## 6. UI Requirements

This is a conversational checkpoint in the `define-feature` flow. No web or graphical screen is introduced. The subsections below describe the conversational surface.

### 6.1 Pages / Screens

**Split proposal view** (rendered in the main loop when the check returns `"flagged"`)
- Purpose: show the probable split and collect the user's decision.
- Layout: a header naming the feature, a list of children (name, one-line purpose, Summary and Keywords as editable items), the dependency order, the shared parts assigned to the first child, and the flow list with a one-line reason per flow.
- Components: the proposal text, the editable items, and the decision prompt offering accept, edit or reject.
- Interactions: the user accepts, edits any editable item, or rejects. Edits follow FTR-035 D-09 and D-10, including the foundation warning.

**Standalone registration view** (shown when the check returns `"not-flagged"` or the user rejects)
- Purpose: show the derived Keywords and the Summary for the standalone feature before registration.
- Components: the Summary sentence, the Keywords list, and an editable field for each.
- Interactions: the user edits or confirms before `feature.md` is written.

**Late-child prompt** (UC-03)
- Purpose: identify the target epic and the missing child.
- Components: the list of candidate epics when no exact match is found, and the child draft for confirmation.

### 6.2 Navigation Flow

1. The User describes the feature, and `define-feature` runs grilling (Phase 3).
2. The agent builds the grilling record in memory and runs `check-definition` (Phase 3a).
3. If the status is `"skipped"`, the flow moves directly to Phase 4 without a proposal.
4. If the status is `"not-flagged"`, the feature is written as standalone and registered (Phase 4).
5. If the status is `"flagged"`, the agent returns the proposal to the main loop. The main loop presents it and collects accept, edit or reject, then re-invokes the agent with explicit state (see Section 8).
6. On accept, the parent `feature.md` is written and registered, and then `apply --parent` creates the children (UC-02).
7. On reject, the feature continues as standalone and is written and registered (UC-02).
8. A late child is requested separately, and the flow goes to UC-03 without grilling.

## 7. Acceptance Criteria

| ID | Criterion | Related UC | Priority |
|----|-----------|-------------|----------|
| AC-01 | Given grilling answers with 2 actors, 0 applications and 0 flows, and a feature folder with none of `epic.md`, `{PREFIX}-Approvals.md` or `wbs/`, when `check-definition` runs, then the status is `"flagged"` and the actor signal shows 2 against a minimum of 2. | UC-01 | Must |
| AC-02 | Given grilling answers with 1 actor, 1 application and 2 flows, when `check-definition` runs, then the status is `"not-flagged"`, no proposal is shown, and the feature is written and registered as standalone. | UC-01 | Must |
| AC-03 | Given a feature folder containing `epic.md`, `{PREFIX}-Approvals.md` or a `wbs/` directory, when `check-definition` runs, then the status is `"skipped"`, no signal is evaluated, and no proposal is shown. | UC-01 | Must |
| AC-04 | Given grilling answers in which the application count cannot be determined, when `check-definition` runs, then `applications` is listed under `unevaluated`, the flag is not raised by that signal, and the agent names that signal to the user. | UC-01 | Must |
| AC-05 | Given a grilling record that is not parseable JSON or does not match the required shape, when `check-definition` runs, then the agent stops, reports `RECORD_INVALID`, and writes nothing to disk. | UC-01 | Must |
| AC-06 | Given that `ai-toolkit resolve-features-root` fails, when the checkpoint starts, then the agent stops, reports the failure, and writes nothing to disk. | UC-01 | Must |
| AC-07 | Given a `"flagged"` result, when the proposal is shown, then it lists each child name, a one-line purpose per child, the dependency order, the shared parts assigned to the first child, each flow by name with a one-line reason, and Summary and Keywords as editable items. | UC-01 | Must |
| AC-08 | Given the checkpoint is in progress, when it finishes or stops at any point before confirmation, then no file containing the grilling record exists on disk. | All UCs | Must |
| AC-09 | Given the proposal is shown, when the user rejects it, then the feature continues as standalone, its `feature.md` is written and registered, and checkpoint 2 (FTR-037) remains available for it later. | UC-02 | Must |
| AC-10 | Given the user accepts the proposal, when the agent proceeds, then the parent `feature.md` is written and registered with status defined before `apply --parent` runs, and the children are created by `apply`. | UC-02 | Must |
| AC-11 | Given the user edits the proposal, when the edits are applied, then they follow FTR-035 D-09 and D-10 (including the foundation warning), and the edited proposal is shown for explicit confirmation before any file is written. | UC-02 | Must |
| AC-12 | Given `apply` fails partway, when the agent reports, then it lists the children already created, offers retry, edit or reject, and blocks later applies while a `.split-staging-*` leftover exists. | UC-02 | Must |
| AC-13 | Given the user requests a late child of epic FTR-034 and the epic folder containing `epic.md` matches exactly, when `define-feature` runs, then no grilling round runs and the child is created with `apply`, placed last, and depending on the previous last child. | UC-03 | Should |
| AC-14 | Given a requested epic FTR-ID that matches no folder containing `epic.md`, when `define-feature` runs, then the agent lists the candidate epics and creates nothing. | UC-03 | Should |
| AC-15 | Given the child's `feature.md` already exists, when `define-feature` runs for the late child, then the agent reports and stops, and does not overwrite the file (BR-04). | UC-03 | Should |
| AC-16 | Given the target epic's registry status is `"in progress"` or `"approved"` (not `epic`), when a late child is requested, then the agent refuses and creates nothing. | UC-03 | Should |
| AC-17 | Given the user rejects a late child, when the rejection is handled, then no standalone `feature.md` is written for it. | UC-03 | Should |
| AC-18 | Given a late child is created, when the creation completes, then `register` is not called for it. | UC-03 | Should |
| AC-19 | Given a late child is created, when its `Summary` and `Keywords` are derived, then they come from the child's purpose and the epic's Summary, not from grilling answers. | UC-03 | Should |

> **Legend:** **ID** — unique identifier, the anchor for the traceability chain. **Criterion** — a testable Given/When/Then statement. **Related UC** — the UC(s) it belongs to, or "All UCs". **Priority** — MoSCoW; every Must criterion must be covered by at least one Work Breakdown task.

## 8. Dependencies and Assumptions

**External dependencies**
- FTR-035: configuration (`definitionSignals`), the new-feature test, the proposal model, `apply` (including its initial-mode precondition), the registry and `register` (D-25), and the `feature-split.js` facade.
- FTR-034 (parent epic): this feature is position 2 of 3. FTR-037 is independent and runs later for rejected features.
- The `define-feature` agent and its grilling flow.
- The `ai-toolkit` CLI, providing `resolve-features-root`.
- The `run-asset` launcher, used to invoke `scripts/feature-split.js`.

**Assumptions**
- The features root and feature folders are resolvable through `resolve-features-root`.
- Grilling answers supply actors, applications and flows in the D-03 shape.
- The signal minimums default to 2, 2 and 3 unless the configuration overrides them.
- Phase 3a runs inside the `define-feature` agent, while the proposal interaction runs in the main loop. The handoff is return-and-re-invoke with explicit state (Tech-Spec Section 2.3).

**Explicit refinements of FTR-036 decisions**
- **Refinement of D-07 (Summary and Keywords for late children).** The late path (UC-03) has no grilling round, so a late child's Summary and Keywords are derived from the child's purpose and the epic's Summary. D-07's grilling-answer source applies only to the split proposal (UC-01, UC-02).
- **Refinement of D-08 (parent registration).** D-08 requires `register` only for a `feature.md` that is not split. An accepted split's parent `feature.md` is also written and registered (status defined) before `apply --parent`, because FTR-035's `apply` in initial mode requires a defined parent. This refinement follows the FTR-035 apply initial-mode precondition.

> **Legend:** Each bullet names a dependency, an assumption, or an explicit refinement of an earlier decision. Refinements are labelled with the decision they refine.

## 9. Open Questions

No question remains open for this requirements document. The points below were open in the previous version and are resolved here, so that this document, feature.md and the Tech-Spec agree.

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| 1 | What is the priority of UC-03 (late child)? | Affects Must-coverage checks and the Work Breakdown. | Resolved: **Should**. The checkpoint path (UC-01, UC-02) is Must. Late children are deferrable. |
| 2 | Which values are the signal minimums? | Determines when a feature is flagged. | Resolved: `minActors` 2, `minApplications` 2, `minFlows` 3 (BR-05, Tech-Spec Section 8). |
| 3 | What defines "not new" (the new-feature test)? | Determines whether the check is skipped. | Resolved: `isNewFeature` returns not-new, giving status `"skipped"`, when `epic.md`, `{PREFIX}-Approvals.md` or a `wbs/` directory is present (BR-06, Tech-Spec Section 12). |
| 4 | What happens when `resolve-features-root` fails or the grilling record is unparseable (`RECORD_INVALID`)? | Determines whether anything is written. | Resolved: stop, report, write nothing (BR-07, BR-08, Tech-Spec Section 6). |
| 5 | Does a grilling round run for a late child? | Determines the late-child path. | Resolved: no grilling round (BR-11, Tech-Spec Section 2.3). |
| 6 | May a late child be added to an in-progress or approved epic? | Determines refusal behaviour. | Resolved: refuse unless the registry status is `epic` (BR-11, Tech-Spec Section 2.3). |
| 7 | Does a rejected late child fall back to standalone? | Determines whether a file is written on rejection. | Resolved: no standalone fallback (BR-11, Tech-Spec Section 2.3). |
| 8 | Is `register` used for a late child? | Determines registration behaviour for late children. | Resolved: no `register` call (BR-11, Tech-Spec Section 2.3). |
| 9 | How is the target epic identified, and what happens when none matches or when the child's `feature.md` exists? | Determines UC-03's main flow. | Resolved: exact FTR-ID match on a folder with `epic.md`; list candidate epics and create nothing when none matches; report and stop when the child's `feature.md` exists (BR-12, Tech-Spec Section 2.3). |
| 10 | How does the main loop hand off to the agent? | Determines the re-invocation design. | Resolved: return-and-re-invoke with explicit state (Tech-Spec Section 2.3). |
| 11 | Is the accepted split's parent registered before `apply`? | Determines the UC-02 flow and postconditions. | Resolved: yes. The parent `feature.md` is written and registered (status defined) before `apply --parent` (BR-09, refinement of D-08, Tech-Spec Sections 2.3 and 12). |
| 12 | What happens when `apply` fails partway? | Determines recovery behaviour. | Resolved: report the children created, offer retry, edit or reject, and block later applies while a `.split-staging-*` leftover exists (BR-10, Tech-Spec Section 12). |
| 13 | Which source derives a late child's Summary and Keywords, since there is no grilling round? | Determines the late-child registration content. | Resolved: the child's purpose and the epic's Summary (refinement of D-07, see Section 8). |

> **Legend:** **#** — item number. **Question** — the point that was open. **Impact** — what depends on it. **Suggested resolution** — the decision adopted in this document, with its source.