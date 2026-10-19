# FTR-027 — Functional Requirements (Index)

## 1. Introduction

### 1.1 Purpose

Harden `pm-phase1.js`'s and `pm-phase2.js`'s existing resume-by-existence/resume-by-status
mechanisms so a retry after a worker failure regenerates an existing-but-structurally-invalid
per-item file (a Tech-Spec component, a Requirements use case, or a Work Breakdown task) instead
of treating mere file presence as proof of validity and skipping it forever.

### 1.2 Scope

In scope: `pm-phase1.js`'s per-component and per-use-case resume conditions (and the outer regen
gate's own missing-file checks); `pm-phase2.js`'s per-task resume condition. Reuses
`tech-spec-assembler.js`'s `parseComponentDetail()` and `wbs-assembler.js`'s
`parseTaskDetailBlock()` unmodified as the authoritative validity definitions; adds one new
heading-match invariant for use-case files, where no stricter existing contract exists to reuse.

Out of scope: any new checkpoint/ownership-token architecture; any change to how a worker failure
is itself reported or retried; any new structural contract for use-case files beyond the
`### {UC-ID}: ` heading match; `--force`/revision-cycle behavior (both already bypass resume
entirely and are unaffected).

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| `pm-phase1` workflow (coordinator) | Decides, per use case/component, whether an existing file is valid enough to skip regenerating |
| `pm-phase2` workflow (coordinator) | Decides, per task, whether an existing `generated`-status file is valid enough to skip regenerating |

## 2. Use Cases

| UC ID | Title | Actor | Priority | File |
|---|---|---|---|---|
| UC-01 | Regenerate an Invalid Tech-Spec Component on Resume | `pm-phase1` coordinator | Must | [use-cases/UC-01.md](use-cases/UC-01.md) |
| UC-02 | Regenerate an Invalid Use-Case File on Resume | `pm-phase1` coordinator | Must | [use-cases/UC-02.md](use-cases/UC-02.md) |
| UC-03 | Regenerate an Invalid Work-Breakdown Task on Resume | `pm-phase2` coordinator | Must | [use-cases/UC-03.md](use-cases/UC-03.md) |

> **Legend:** **UC ID** — unique identifier, referenced from Business Rules' `Applies to` and
> Acceptance Criteria's `Related UC` columns. **Title** — short label; full flow is in the linked
> file. **Actor** — who/what initiates or participates. **Priority** — MoSCoW; drives downstream
> Must-coverage checks. **File** — this UC's own detail file.

## 3. Business Rules

| ID | Rule | Applies to |
|---|---|---|
| BR-01 | `tech-spec-assembler.js`'s `parseComponentDetail()` is reused unmodified as the sole validity definition for a Tech-Spec component file — no new parsing contract is invented | UC-01 |
| BR-02 | The outer regen gate (which already notices a MISSING component file and triggers a resume pass before the per-component loop is even entered) is extended with the identical validity condition, not only the per-component loop itself | UC-01 |
| BR-03 | A use-case file's validity check requires only that its content starts with the expected `### {UC-ID}: ` heading for that row's own ID — the free-text title after the colon is never compared, since it is legitimately prose the agent may phrase differently across a retry | UC-02 |
| BR-04 | `wbs-assembler.js`'s `parseTaskDetailBlock()` is reused unmodified; a task file is valid only if its parsed `verificationCommands` array is non-empty, per the task template's own documented "Must be non-empty" contract | UC-03 |
| BR-05 | `--force` and any `needsRequirementsFix`/`needsTechSpecFix` revision cycle are unaffected — both already bypass resume-by-existence entirely, regenerating every item unconditionally | All UCs |
| BR-06 | No item type gains a new parsing/template contract because of this feature — every validity check reuses a function or invariant that is already authoritative for that item type elsewhere in the pipeline | All UCs |

> **Legend:** **ID** — unique identifier. **Rule** — the constraint itself. **Applies to** —
> which UC(s) this rule constrains, or "All UCs" if universal.

## 4. Data Requirements

No new persisted data shape or on-disk artifact. This feature only changes the CONDITION under
which `pm-phase1.js`/`pm-phase2.js` treat an existing per-item file as already-valid.

### 4.1 Entities

N/A — no new entity.

### 4.2 Validation Rules

N/A — no new validation rule; `parseComponentDetail()`/`parseTaskDetailBlock()` are reused
unmodified, and the use-case heading-match check is a new invariant check, not a new validation
rule enforced elsewhere.

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Performance | The validity check itself must introduce no new LLM/agent dispatch — a deterministic, zero-token parse of an already-on-disk file |
| NFR-02 | Correctness | Must not regress today's "skip when valid" behavior for any of the three item types |
| NFR-03 | Correctness | Must not change any assembled document's final shape — only which items get regenerated before assembly |

## 6. UI Requirements

N/A — internal/technical feature; no UI surface is introduced or changed.

## 7. Acceptance Criteria

| ID | Criterion | Related UC | Priority |
|----|-----------|-------------|----------|
| AC-01 | Given a `spec/components/{fileSlug}.md` file exists but fails `parseComponentDetail()`, when `pm-phase1`'s Tech-Spec generation runs its resume path, then the component is regenerated, not skipped | UC-01 | Must |
| AC-02 | Given a `spec/components/{fileSlug}.md` file exists and parses successfully, when `pm-phase1`'s Tech-Spec generation runs its resume path, then the component is skipped, unchanged from today | UC-01 | Must |
| AC-03 | Given a `spec/components/{fileSlug}.md` file is invalid, when `pm-phase1` is entered fresh (not mid-loop), then the outer regen gate notices the invalid file and triggers a resume pass for it, the same way it already does for a missing file | UC-01 | Must |
| AC-04 | Given a `req/use-cases/{UC-ID}.md` file exists but does not start with that row's own `### {UC-ID}: ` heading, when `pm-phase1`'s Requirements generation runs its resume path, then the use case is regenerated, not skipped | UC-02 | Must |
| AC-05 | Given a `req/use-cases/{UC-ID}.md` file exists and starts with the correct heading, when `pm-phase1`'s Requirements generation runs its resume path, then the use case is skipped, unchanged from today | UC-02 | Must |
| AC-06 | Given a `wbs/tasks/{TASK_ID}.md` file exists with status `generated` but `parseTaskDetailBlock()` finds zero verification commands, when `pm-phase2`'s per-task generation runs, then the task is regenerated, not skipped | UC-03 | Must |
| AC-07 | Given a `wbs/tasks/{TASK_ID}.md` file exists with status `generated` and at least one verification command, when `pm-phase2`'s per-task generation runs, then the task is skipped, unchanged from today | UC-03 | Must |
| AC-08 | Given `--force` is passed, or a `needsRequirementsFix`/`needsTechSpecFix` revision cycle is active, when any of the three generation loops run, then every item is regenerated unconditionally, exactly as today | All UCs | Must |
| AC-09 | Given all changes are delivered, when `npm test` runs, then all tests pass: new regression tests for AC-01 through AC-07, and a full-suite regression | All UCs | Must |

> **Legend:** **ID** — unique identifier; the anchor used across the whole
> feature.md↔req↔spec↔Work-Breakdown traceability chain. **Criterion** — a testable
> Given/When/Then statement. **Related UC** — which UC(s) this AC belongs to, or "All UCs".
> **Priority** — MoSCoW; every Must AC must be covered by ≥1 WB task.

## 8. Dependencies and Assumptions

- FTR-020/FTR-021/FTR-024/FTR-025/FTR-026 (available): the split-generation architecture and its
  existing resume-by-existence/resume-by-status mechanisms, reused and extended, never replaced.
- `tech-spec-assembler.js`'s `parseComponentDetail` and `wbs-assembler.js`'s `parseTaskDetailBlock`
  are treated as fixed, authoritative validity definitions for their respective item types.
- `npm test` is the only verification command; no separate build step exists.
- Directly motivated by a real, reproduced production incident
  (`Fincantieri.CommonLibraries.MFExample`, FTR-003), not a hypothetical resilience improvement.

## 9. Open Questions

Open Questions 1–2 raised in `feature.md` are resolved by the Tech Spec — see
`FTR-027-Tech-Spec.md`'s Components for the exact decisions.

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| (none remaining) | — | — | — |

---

## Traceability

This document is the middle link in a three-stage chain: `feature.md` (approved at Gate 1) →
`req/` (this document) → Tech-Spec. Tech-Spec resolves both Open Questions this document's
feature.md left pending.

## What moved out of this file, and why

Only §2 (Use Cases) split into one file per item — everything else stayed here, unsplit, for the
same reasons established in every prior feature in this lineage: Business Rules reference multiple
UCs each where relevant, and Data Requirements/NFRs/Dependencies are feature-wide by nature.
