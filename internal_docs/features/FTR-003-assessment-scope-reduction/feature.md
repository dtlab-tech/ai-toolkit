# Assessment Pipeline Scope Reduction

## Feature ID
FTR-003

## Summary
Reduce the assessment pipeline to a read-only reporting tool. The `assessment-manager` orchestrator currently executes remediation (Phases 6–7: branch creation, agent dispatch, review, commit, and PR). This feature removes those phases entirely and replaces the Remediation Gate with a Findings Gate that mandates acknowledgement and optional intervention flagging. Remediation becomes the exclusive responsibility of the feature delivery pipeline: each flagged intervention is an input to `/define-feature` → `/implement-feature`. The assessment pipeline's deliverable is the Interventions Index and a signed-off Approvals record; it never writes production code.

## Problem Statement
The current `assessment-manager` conflates two distinct responsibilities: producing an assessment report and executing remediation. This creates three concrete problems. First, it creates false automation expectations — the pipeline can make sweeping code changes on a large codebase immediately after a gate approval, without the planning, task breakdown, or review cycle that feature delivery provides. Second, it makes the feature delivery pipeline redundant for remediation work, undermining the toolkit's own architecture. Third, FTR-001 and FTR-002 both independently flagged Phases 6–7 as "architecturally out of scope" and listed their removal as a prerequisite — the debt is documented and blocking.

## Actors

| Actor | Role | Frequency |
|-------|------|-----------|
| Tech Lead / Project Manager | Reviews findings at the gate, acknowledges the report, flags interventions for feature delivery | After each assessment pipeline run |
| Assessment Manager (orchestrator agent) | Runs assessment agents, produces intervention documents, presents the gate, writes the Approvals record | Every pipeline run |
| assess-codebase skill | Entry point; description must be updated to remove "remediation → review → PR" | Every pipeline run |

## Core Flow (Happy Path)

1. User invokes `/assess-codebase [path] [--scope=...] [--force]`.
2. `assessment-manager` enters Phase 1 (discovery) and Phase 2 (planning). The plan display shows assessment agents, the intervention documentation step, and the gate — no IMPL or PR rows.
3. Phase 3: all discovered assessment agents run in parallel (unchanged).
4. Phase 4: `intervention-documentation-standard` consolidates findings and produces `{PREFIX}-INT-NNN-*.md` files and `{PREFIX}-Interventions-Index.md` (unchanged).
5. Phase 5 — Findings Gate (renamed from Remediation Gate): `assessment-manager` presents the findings summary and asks the user to acknowledge.
   - Step 5a: user confirms they have reviewed the findings (mandatory).
   - Step 5b: user specifies zero or more INT-NNN identifiers to flag for feature delivery (optional; any selection, including none, is valid).
6. `assessment-manager` writes `{PREFIX}-Approvals.md` recording the acknowledgement timestamp and the list of flagged interventions.
7. Phase 6 — Summary: the pipeline ends. The summary shows assessment results, intervention counts, and the list of flagged interventions. There is no PR URL, no remediation stats.

## Out of Scope

- Remediation execution — no branch creation, no agent dispatch for code changes, no commits, no PR creation.
- Automatic batching or prioritisation of flagged interventions — the user's selection is recorded as-is; no ordering or grouping logic is applied by the pipeline.
- Integration between the Approvals record and the feature delivery pipeline — a user who wants to act on a flagged intervention manually runs `/define-feature` referencing the INT-NNN document; the toolkit does not auto-trigger this.
- Changes to assessment agents themselves (Phases 3–4 are unchanged).
- Changes to `docs/procedures/process-log.md` or `docs/procedures/issues-register.md`.
- Any changes to the feature delivery pipeline (`project-manager`, `/implement-feature`).

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| User acknowledges but flags zero interventions | Valid outcome. `{PREFIX}-Approvals.md` is written with an empty flagged list and a note that no interventions were selected for feature delivery. Pipeline ends normally. |
| User specifies an INT-NNN identifier that does not exist in the Interventions Index | `assessment-manager` reports the unknown identifier and re-prompts. It does not proceed until all listed identifiers are valid. |
| Assessment produces zero findings (empty Interventions Index) | Gate is still shown. User acknowledges zero findings. `{PREFIX}-Approvals.md` records acknowledgement with an empty flagged list. |
| Pipeline is aborted after Phase 4 but before the gate completes | `{PREFIX}-Approvals.md` is not written. The assessment output files (INT-NNN docs, Interventions Index, Token Estimate, Effort Estimate) remain as-is. No partial Approvals file is created. |
| `--force` flag is passed | Phases 1–4 re-run from scratch as before. The gate still requires explicit user acknowledgement; it cannot be bypassed by `--force`. |
| User had previously run the pipeline and a `{PREFIX}-Approvals.md` already exists | If `--force` is not passed and the file is fresh, `assessment-manager` skips to summary. If `--force` is passed, the gate is re-presented and the existing Approvals file is overwritten. |

## Data Model

### Entities

**Approvals file** (`{PREFIX}-Approvals.md`) — replaces the old format which had a "Remediation Scope" section with per-intervention approved/deferred status.

```markdown
# Findings Acknowledgement — {PREFIX}

## Assessment Reviewed

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| {PREFIX}-Generic-Assessment.md | Acknowledged | {date} | — |
| {PREFIX}-Interventions-Index.md | Acknowledged | {date} | — |

## Interventions Flagged for Feature Delivery

| Intervention | Flagged | Date | Notes |
|---|---|---|---|
| INT-001 — sql-injection-hardening | Yes | {date} | — |
| INT-002 — god-class-decomposition | Yes | {date} | — |
| INT-003 — di-refactoring | No | {date} | Not selected |
```

- "Flagged: Yes" means the user explicitly named this INT-NNN at the gate.
- "Flagged: No" rows are written for all interventions NOT selected, so the record is complete.
- No "approved/deferred" distinction — that language implies remediation scope, which is gone.

**Plan display** (Phase 2 — updated):

```
Assessment Plan  (prefix: ASSESS-001, target: .)
─────────────────────────────────────────────────────
RUN (parallel):
   generic-software-assessment      → ASSESS-001-Generic-Assessment.md
   layered-architecture-assessment  → ASSESS-001-Layer-Assessment.md
   concurrency-safety-assessment    → ASSESS-001-Concurrency-Assessment.md

QUEUE: intervention-documentation-standard → ASSESS-001-INT-*.md + Interventions-Index.md
GATE:  Review findings → acknowledge + flag interventions
─────────────────────────────────────────────────────
```

No IMPL or PR rows appear in the plan.

**Summary display** (Phase 6 — simplified):

```
Assessment Manager — Run Summary
─────────────────────────────────────────────────────
Target: {codebase path}  |  Prefix: {PREFIX}
─────────────────────────────────────────────────────
Assessment:
  generic-software-assessment    → {PREFIX}-Generic-Assessment.md
  layered-architecture-assessment → {PREFIX}-Layer-Assessment.md
  concurrency-safety-assessment   → {PREFIX}-Concurrency-Assessment.md
─────────────────────────────────────────────────────
Findings:       N CRITICAL | N HIGH | N MEDIUM | N LOW
Interventions:  N proposed | N flagged for feature delivery
─────────────────────────────────────────────────────
Approvals:      {PREFIX}-Approvals.md
Token usage:    {N} tokens  |  Est. cost: $N.NN
Process log:    docs/assessments/{PREFIX}/{PREFIX}-process-log.txt
─────────────────────────────────────────────────────
```

No PR URL. No remediation stats.

### Token Estimate file — remediation placeholder

FTR-001 designed `{PREFIX}-Token-Estimate.md` with a "Remediation — pending gate approval" placeholder section. Since remediation no longer runs, that placeholder must be replaced with a static note:

```
## Remediation
Remediation effort is tracked separately via the feature delivery pipeline (not part of this assessment).
```

This note is written when the file is first created at end of Phase 3, and it never changes.

### Validation Rules

| Field | Rule |
|-------|------|
| Flagged INT-NNN identifiers | Must exist in `{PREFIX}-Interventions-Index.md`; unknown identifiers trigger re-prompt |
| `{PREFIX}-Approvals.md` | Written only after the user completes Step 5a (acknowledgement); never written partially |
| "Flagged: No" rows | Must appear for every intervention in the Interventions Index that was NOT selected |

## Roles and Permissions

| Role | Permissions |
|------|-------------|
| assessment-manager (agent) | Read all assessment output files; write `{PREFIX}-Approvals.md`; write summary to stdout |
| Human user / Tech Lead | Review findings; acknowledge at gate; specify INT-NNN flags |
| assess-codebase skill | Entry point only; no file writes (same as current) |

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A full assessment pipeline run completes | The user acknowledges findings at the gate | `{PREFIX}-Approvals.md` is written containing an acknowledgement record and a row for every intervention (Flagged: Yes or No); no branch is created, no code is changed, no PR is created | Must |
| AC-02 | The user flags zero interventions at the gate | The pipeline ends | `{PREFIX}-Approvals.md` records acknowledgement with all interventions as "Flagged: No"; the summary shows "0 flagged for feature delivery"; the pipeline exits normally | Must |
| AC-03 | The user flags N specific INT-NNN identifiers | The pipeline ends | `{PREFIX}-Approvals.md` records exactly those N as "Flagged: Yes" and the remainder as "Flagged: No" | Must |
| AC-04 | The user enters an INT-NNN that does not exist in the Interventions Index | Step 5b is processed | `assessment-manager` rejects the entry, reports the unknown identifier, and re-prompts without proceeding | Must |
| AC-05 | The plan display is shown in Phase 2 | Any assessment run | The plan block contains no IMPL or PR rows; it ends with `GATE: Review findings → acknowledge + flag interventions` | Must |
| AC-06 | The summary is shown at pipeline end | Any assessment run | The summary contains no PR URL, no remediation execution stats, and no branch reference | Must |
| AC-07 | The `{PREFIX}-Token-Estimate.md` file is written at end of Phase 3 | Per FTR-001 | The file contains no "Remediation — pending gate approval" placeholder; instead it contains the static note: "Remediation effort is tracked separately via the feature delivery pipeline (not part of this assessment)." | Must |
| AC-08 | The `assess-codebase` skill description is read | Any time | The description no longer mentions "remediation → review → PR"; it accurately describes the pipeline as ending at the findings gate | Must |
| AC-09 | `docs/procedures/assessment-approval-gate.md` is referenced by any agent | Any time | The file has been renamed to `docs/procedures/assessment-findings-gate.md` and all references in `assessment-manager.md` point to the new name | Must |
| AC-10 | Assessment produces zero findings | Gate is presented | The gate still requires user acknowledgement; `{PREFIX}-Approvals.md` is written with zero interventions | Must |

## MVP vs Deferred

### MVP (must ship)

- Remove Phase 6 (Remediation Implementation) from `assessment-manager.md` entirely
- Remove Phase 7 (Pull Request) from `assessment-manager.md` entirely
- Rename Phase 5 from "Remediation Gate" to "Findings Gate" and rewrite gate mechanics (mandatory acknowledgement + optional INT-NNN flagging)
- Rename Phase 8 (Summary) to Phase 6; strip PR URL and remediation stats; add "interventions flagged" count
- Update Phase 2 plan display: remove IMPL and PR rows; update GATE label
- Update `assessment-manager.md` dependency graph: remove remediation loop and PR box
- Update `assessment-manager.md` guidelines: remove all remediation-specific rules; add "assessment pipeline is read-only" rule
- Update `assessment-manager.md` description frontmatter: remove "dispatches developer agents", "remediation" references
- Rename `docs/procedures/assessment-approval-gate.md` to `docs/procedures/assessment-findings-gate.md` and rewrite its contents (new gate options, new Approvals file format)
- Update all references to the old gate procedure name in `assessment-manager.md`
- Update `assess-codebase` skill description frontmatter: remove "remediation → review → PR"
- Replace the FTR-001 token estimate remediation placeholder with the static note (in `assessment-manager.md` logic for Phase 3)

### Deferred (next iteration)

- A command or skill that converts a flagged INT-NNN directly into a feature definition session (`/define-feature` pre-loaded with INT-NNN content)
- Bulk flagging options at the gate (e.g., "flag all CRITICAL") — current MVP requires explicit INT-NNN listing
- Machine-readable Approvals output (JSON) for integration with backlog tools

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | FTR-001 and FTR-002 are not yet implemented. Should this feature be marked as a prerequisite blocker for those, or should all three be implemented together in one pass? | Affects implementation ordering and whether a single work breakdown can cover all three |

## Dependencies and Assumptions

- FTR-001 (`{PREFIX}-Token-Estimate.md`) and FTR-002 (`{PREFIX}-Effort-Estimate.md`) are related but independent features. FTR-003 changes the token estimate placeholder (AC-07) which was originally designed by FTR-001; when FTR-001 is implemented, it must use the FTR-003 design (static note, not placeholder).
- The feature delivery pipeline (`project-manager`, `/implement-feature`) is unchanged by this feature. The Approvals record is a human-readable handoff document; no automation connects it to the feature delivery pipeline.
- `docs/procedures/process-log.md` and `docs/procedures/issues-register.md` are not changed.
- Assessment agents (Phase 3) and `intervention-documentation-standard` (Phase 4) are not changed.
- The renamed gate procedure file (`assessment-findings-gate.md`) replaces `assessment-approval-gate.md` in full — the old file is deleted, not kept alongside the new one.
- The `assess-codebase` skill's functional behaviour (spawning `assessment-manager` with arguments) is unchanged; only the frontmatter description is updated.
