# FTR-032 — Functional Requirements (Index)

## 1. Introduction

### 1.1 Purpose

Close two independent, real-world-reported cost/latency concerns, both instances of the same root
pattern — a monolithic or unconditional LLM dispatch paying for work a cheaper, more targeted step
could have avoided or shrunk: (1) `pm-phase2`'s Work Breakdown skeleton call carries a much
heavier per-task payload than Requirements/Tech-Spec's own skeleton calls, a plausible real
contributor to repeated `Stream idle timeout` failures on a large feature; (2) the task executor
dispatches a fully fresh implementation agent and a fully separate fresh review agent for every
task unconditionally, even when a task's own verification commands already pass before any
dispatch — measured at ~20 minutes of real cost to conclude "nothing to do" on an already-satisfied
4-line task.

### 1.2 Scope

In scope: `pm-phase2.js`'s `SKELETON_SCHEMA` and per-task detail schema (moving the effort estimate
between them); `lib/task-executor/index.js`'s `_runTaskToResolution`/`dispatchTaskAttempt`/
`runReview` (pre-dispatch verification short-circuit + per-dispatch evidence capture), a new
evidence-writing module mirroring `lib/workflow-worker-evidence.js`'s existing convention.

Out of scope: reworking the fresh-headless-dispatch-per-task architecture itself (no cross-task
context reuse); giving the review dispatch a pre-scoped context derived from the implementation
dispatch's own exploration; changing `maxConcurrency`'s fixed value of 1; any automated analysis
built on top of the new evidence files; reducing `SKELETON_SCHEMA` beyond the one field (effort
estimate) this feature identifies as both safely deferrable and plausibly the dominant per-task
cost driver.

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| `pm-phase2` workflow (coordinator) | Owns Work Breakdown skeleton and per-task detail generation |
| `_runTaskToResolution` (task executor, `lib/task-executor/index.js`) | Owns the per-task dispatch/verify/review/checkpoint loop |
| `dispatchTaskAttempt` / `runReview` (task executor) | Dispatch the implementation agent and the review agent respectively |

## 2. Use Cases

| UC ID | Title | Actor | Priority | File |
|---|---|---|---|---|
| UC-01 | Shrink the WBS Skeleton Call to Index-Row Weight | `pm-phase2` coordinator | Must | [use-cases/UC-01.md](use-cases/UC-01.md) |
| UC-02 | Persist Turn-by-Turn Dispatch Evidence for Implementation/Review | `dispatchTaskAttempt` / `runReview` | Must | [use-cases/UC-02.md](use-cases/UC-02.md) |
| UC-03 | Short-Circuit Dispatch for an Already-Satisfied Task | `_runTaskToResolution` | Must | [use-cases/UC-03.md](use-cases/UC-03.md) |

> **Legend:** **UC ID** — unique identifier, referenced from Business Rules' `Applies to` and
> Acceptance Criteria's `Related UC` columns. **Title** — short label; full flow is in the linked
> file. **Actor** — who/what initiates or participates. **Priority** — MoSCoW; drives downstream
> Must-coverage checks. **File** — this UC's own detail file.

## 3. Business Rules

| ID | Rule | Applies to |
|---|---|---|
| BR-01 | The WBS skeleton schema (`SKELETON_SCHEMA`) no longer requires `estimate` (agentMinutes/tokens) per task; no new field or prompt text is added to the per-task detail call — its own template already asks for `estimate` today | UC-01 |
| BR-02 | `wbs-assembler.js`'s `parseTaskDetailBlock` starts reading `estimate` back from the per-task detail response (alongside the existing `groupingRationale`/verification commands); `loadWorkBreakdown`'s per-task mapping uses that value instead of the skeleton-derived one | UC-01 |
| BR-03 | Every OTHER skeleton-level field (title, outcome, domain, agentType, dependsOn, acceptanceCriteria, outputCount, commit) stays unchanged — only the effort estimate's SOURCE moves, not any other field | UC-01 |
| BR-04 | `c.estimates()`'s own input/output shape is unaffected by UC-01 — it already runs after every per-task detail call completes, per `pm-phase2.js`'s existing flow; `wb-validate.js`'s own duration-band checks (check 15) already operate on the assembled structure, confirmed by that file's own comment that it "needs per-task estimate detail, not just the skeleton shape" | UC-01 |
| BR-05 | Each implementation and review dispatch attempt persists its own raw transcript/response to a new evidence file, independent of whether that attempt succeeds, fails, or times out | UC-02 |
| BR-06 | UC-02's evidence capture is additive only — it never changes an existing dispatch's inputs, retries, or outcome | UC-02 |
| BR-07 | A task's pre-dispatch verification short-circuit runs ONLY before that task's FIRST attempt, and ONLY when the task declares one or more verification commands | UC-03 |
| BR-08 | If every one of a task's verification commands already passes before its first attempt, the task is marked `'skipped'` — the SAME terminal status the existing post-hoc no-op-checkpoint path already uses — without ever dispatching the implementation agent or the review agent for that attempt | UC-03 |
| BR-09 | A task declaring zero verification commands is never eligible for UC-03's short-circuit; a task's second or later attempt (a retry) is never eligible either | UC-03 |

> **Legend:** **ID** — unique identifier. **Rule** — the constraint itself. **Applies to** —
> which UC(s) this rule constrains, or "All UCs" if universal.

## 4. Data Requirements

UC-02 introduces one new category of on-disk artifact: a per-dispatch-attempt evidence file
(implementation and review, one each per attempt), under the run's own execution-root directory.
UC-01/UC-03 introduce no new on-disk artifact — UC-01 moves an existing field between two existing
schemas; UC-03 reuses the existing `'skipped'` task status.

### 4.1 Entities

| Entity | Description |
|--------|-------------|
| Dispatch evidence file (UC-02) | One per implementation/review dispatch attempt; raw transcript/response, keyed by taskId/attemptNumber/dispatch-kind. Exact path convention resolved in Tech-Spec, mirroring `lib/workflow-worker-evidence.js`'s existing one |

### 4.2 Validation Rules

| Rule | Enforced by |
|------|-------------|
| A WBS skeleton generation result must satisfy the shrunk schema (no `estimate` required) | `pm-phase2.js`'s skeleton dispatch + `wb-skeleton-check.js` (unaffected — never read `estimate`) |
| A per-task WBS detail generation result must now satisfy a schema requiring `estimate` | `pm-phase2.js`'s per-task detail dispatch |
| A task's pre-dispatch short-circuit only fires when verification commands exist AND all currently pass | `_runTaskToResolution` (UC-03, BR-06/BR-07/BR-08) |

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Cost | A WBS skeleton generation call's per-task payload must no longer require the model to produce an effort estimate for every task in the same turn |
| NFR-02 | Observability | Every real implementation/review dispatch attempt must leave behind an inspectable evidence artifact, independent of that attempt's own success/failure |
| NFR-03 | Cost | A task whose verification commands already pass before its first attempt must incur no implementation or review dispatch cost at all |
| NFR-04 | Compatibility | No existing, passing test fixture/mocked worker response may be broken by UC-01's schema change, UC-02's additive evidence capture, or UC-03's pre-dispatch check |
| NFR-05 | Safety | UC-03's short-circuit must never apply to a task's retry (second or later attempt), and must never apply to a task with zero verification commands |

## 6. UI Requirements

N/A — internal/technical feature; no UI surface is introduced or changed.

## 7. Acceptance Criteria

| ID | Criterion | Related UC | Priority |
|----|-----------|-------------|----------|
| AC-01 | Given a WBS skeleton generation call, when dispatched, then its schema no longer requires `estimate` (agentMinutes/tokens) per task | UC-01 | Must |
| AC-02 | Given a per-task WBS detail generation call's response (already containing a real `estimate` in its template-filled field block, unchanged), when parsed via `wbs-assembler.js`'s `parseTaskDetailBlock`, then `estimate` (agentMinutes/tokens) is now read back from it, alongside the existing `groupingRationale`/verification commands | UC-01 | Must |
| AC-03 | Given a feature generated end-to-end with UC-01 applied, when `c.estimates()` runs, then it reports the same shape/semantics of effort totals as before UC-01 | UC-01 | Must |
| AC-04 | Given `wb-skeleton-check.js`/`wb-graph-checks.js`'s existing structural checks, when run against a skeleton produced under UC-01's shrunk schema, then all pass exactly as they do today | UC-01 | Must |
| AC-05 | Given a real implementation or review dispatch, when it completes (success, failure, or timeout), then a raw transcript/response evidence file is persisted for that specific dispatch attempt, readable independently of the run's own in-progress state | UC-02 | Must |
| AC-06 | Given a task with one or more verification commands, all already passing before its first attempt, when `_runTaskToResolution` begins that attempt, then neither the implementation agent nor the review agent is ever dispatched, and the task is marked `'skipped'` | UC-03 | Must |
| AC-07 | Given a task with one or more verification commands, at least one failing before its first attempt, when `_runTaskToResolution` begins that attempt, then a normal implementation dispatch proceeds, unchanged from today | UC-03 | Must |
| AC-08 | Given a task with zero verification commands, when `_runTaskToResolution` begins its first attempt, then it is never short-circuited — a normal implementation dispatch proceeds | UC-03 | Must |
| AC-09 | Given a task's second or later attempt, when `_runTaskToResolution` begins that attempt, then it is never short-circuited regardless of current verification state | UC-03 | Must |
| AC-10 | Given a real run exercising UC-03's short-circuit on at least one task and a normal dispatch on at least one other, when measured, then the short-circuited task's wall-clock/token cost is near-zero compared to the normally-dispatched task | UC-03 | Must |
| AC-11 | Given all changes are delivered, when `npm test` runs, then all tests pass: new regression tests for AC-01 through AC-10, and a full-suite regression | All UCs | Must |

> **Legend:** **ID** — unique identifier; the anchor used across the whole
> feature.md↔req↔spec↔Work-Breakdown traceability chain. **Criterion** — a testable
> Given/When/Then statement. **Related UC** — which UC(s) this AC belongs to, or "All UCs".
> **Priority** — MoSCoW; every Must AC must be covered by ≥1 WB task.

## 8. Dependencies and Assumptions

- FTR-018 (deterministic task executor — the fresh-headless-dispatch-per-task design UC-03 adds a
  pre-check in front of, unchanged itself), FTR-020/FTR-026 (split-source-native WBS pipeline —
  `pm-phase2.js`'s skeleton/detail call shape UC-01 adjusts), FTR-028
  (`lib/workflow-worker-evidence.js` — the existing convention UC-02 mirrors) — all available, all
  reused, none replaced.
- Both concerns are grounded in real, independently-verified reports from two different consumer
  projects the same day (`Fincantieri.CommonLibraries.MFExample` FTR-003 for UC-01, with a
  follow-up confirming 6/6 consecutive failures across two separate invocations on the same real
  feature; `Fincantieri.ISDM.JobScheduler` FTR-012, toolkit v0.22.0, for UC-02/UC-03) — not
  hypothetical performance concerns.
- `pm-phase2.js` remains a sandboxed workflow script with no `require()`; UC-01's schema change is
  a pure JSON-Schema edit plus moving a few lines of prompt-building/materialization logic between
  the two existing call sites.
- `lib/task-executor/` modules are normal Node modules (real `require()` available); UC-02/UC-03
  are additive changes to existing functions, not a rewrite of either.
- `npm test` is the only verification command; no separate build step exists.

## 9. Open Questions

Open Questions 1-3 raised in `feature.md` are resolved by the Tech Spec — see
`FTR-032-Tech-Spec.md`'s Components for the exact decisions.

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| (none remaining) | — | — | — |

---

## Traceability

This document is the middle link in a three-stage chain: `feature.md` (approved at Gate 1) →
`req/` (this document) → Tech-Spec. Tech-Spec resolves the 3 Open Questions `feature.md` left
pending.

## What moved out of this file, and why

Only §2 (Use Cases) split into one file per item — everything else stayed here, unsplit, for the
same reasons established in every prior feature in this lineage: Business Rules reference multiple
UCs each where relevant, and Data Requirements/NFRs/Dependencies are feature-wide by nature.
