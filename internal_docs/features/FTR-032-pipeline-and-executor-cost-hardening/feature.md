# Pipeline and Executor Cost Hardening

## Feature ID
FTR-032

## Summary
Two independent, real-world-reported cost/latency concerns across two different subsystems,
bundled into one feature because both are instances of the same root pattern — a monolithic or
unconditional LLM dispatch paying for work a cheaper, more targeted step could have avoided or
shrunk: (1) `pm-phase2`'s Work Breakdown skeleton generation is a single, unconditional
`c.worker()` call that must return nearly every structural field (including a real effort
estimate, which requires the model to reason through how it would implement each task) for EVERY
task across the whole feature in one turn — confirmed, by direct code inspection, to be
structurally identical in SHAPE to Requirements/Tech-Spec's own skeleton-then-per-item generation,
but carrying a much heavier per-item payload, a plausible real contributor to repeated
`Stream idle timeout` failures on a large feature; (2) the task executor
(`lib/task-executor/index.js`) dispatches a fully fresh, context-free implementation agent AND a
fully separate fresh review agent for every task unconditionally, even when a task's own
verification commands already pass before any dispatch at all — measured on a real run at ~20
minutes of wall-clock and real token spend to conclude "nothing to do" on a task whose entire
change was a 4-line SQL rename already present in the codebase.

## Problem Statement
Both concerns were reported the same day by `Fincantieri.ISDM.JobScheduler` and
`Fincantieri.CommonLibraries.MFExample`, two different real consumer projects actively using the
pipeline, and independently verified against the current toolkit source before being accepted as
real (not reproduced synthetically first for either).

**Concern 1 — WBS skeleton payload weight (`pm-phase2.js`).** `Fincantieri.CommonLibraries.MFExample`
(FTR-003) reported 3-4 consecutive `"API Error: Stream idle timeout - no chunks received"` failures
on the exact same pipeline step, the `gaia.agent.planner.work-breakdown` skeleton dispatch. Direct
inspection of `pm-phase2.js`/`pm-phase1.js` confirms: Requirements, Tech-Spec, and Work Breakdown
all share the identical shape — one single skeleton `c.worker()` call, then N per-item detail
calls (per-UC, per-component, per-task respectively) — so the often-assumed "WBS is monolithic,
req/spec are per-item" framing is not quite accurate. The real asymmetry is PAYLOAD WEIGHT: the
Requirements/Tech-Spec skeleton calls only need lightweight index-row fields per item (ID, title,
a one-line summary); the WBS skeleton call's own schema (`SKELETON_SCHEMA`) requires, for EVERY
task across the WHOLE feature in one turn: title, outcome, domain, agentType, dependsOn,
acceptanceCriteria, an effort **estimate** (agentMinutes + tokens), outputCount, and a commit
type/subject — nearly every structural field except `groupingRationale`/`verificationCommands`/
`implementationNotes` (already deferred to the per-task detail step). Of these, the effort estimate
is qualitatively different from the rest: producing a genuinely useful agentMinutes/tokens number
per task requires the model to implicitly reason through how it would implement that task, not
merely classify or summarize it — a real, likely dominant contributor to the skeleton call's size
and duration that none of Requirements/Tech-Spec's own skeletons need to do at all.

**Concern 2 — unconditional full dispatch for an already-satisfied task (`lib/task-executor/`).**
`Fincantieri.ISDM.JobScheduler` (FTR-012, toolkit v0.22.0) reported, with real token-ledger
timestamps: `INFRA-TASK-DB-01` — a task whose entire job (a 4-line SQL rename) was already present
in the codebase, correctly concluded `skipped` by the executor's own existing no-op-checkpoint
logic — still cost ~15 minutes for the implementation dispatch and ~5 minutes for the review
dispatch, ~20 minutes total, to arrive at "nothing to do." The task's own verification commands
(one small `dotnet build` plus two `grep` checks) measured directly at ~5-10 seconds combined —
the 20 minutes is not verification time, it is two independently-dispatched, fully fresh headless
agent processes (implementation, then a separate from-scratch review) each re-exploring task
context and current repository state before either concludes anything. Confirmed by code
inspection: `_runTaskToResolution` currently has no pre-dispatch check at all — the EXISTING
`'skipped'` terminal status (added for a different, already-fixed bug: a deliverable already
committed by a prior attempt or prerequisite task) is only ever reached AFTER both a full
implementation dispatch and a full review dispatch have already succeeded and verification finds
nothing new to stage. With `maxConcurrency` fixed at 1 by the platform's own current design, this
projects to multiple hours of wall-clock for a feature whose total real code diff may be a few
hundred lines. The reporting peer separately noted the executor persists no turn-by-turn evidence
for implementation/review dispatches (unlike `pm-phase1`/`pm-phase2`'s own worker-evidence files),
making this specific cost impossible to root-cause further from the outside today.

## Actors
N/A — internal/technical feature

## Core Flow (Happy Path)
Two independent concerns, realized as three UCs (the second concern splits into two): neither
concern depends on the other.

1. **UC-01 — Shrink the WBS skeleton call back to index-row weight.** The per-task effort estimate
   (`agentMinutes`/`tokens`) moves out of `SKELETON_SCHEMA` entirely — it gates no structural
   validation (`wb-skeleton-check.js`/`wb-graph-checks.js`'s checks run on IDs, `dependsOn`, phase
   membership, AC references; none of them read `estimate`) and gates no rendering decision ahead of
   the per-task loop (`wb-validate.js`'s own duration-band checks and `c.estimates()`, the only
   consumers, already run AFTER every per-task detail call completes, per `pm-phase2.js`'s existing
   flow — confirmed by `wb-validate.js`'s own comment: it "needs per-task estimate detail, not just
   the skeleton shape"). Crucially, the per-task DETAIL call's own template
   (`gaia-task-template.md`) ALREADY asks the model to produce a real `estimate` in every call —
   today the host silently discards it (`wbs-assembler.js`'s `parseTaskDetailBlock` only reads back
   `groupingRationale`/verification commands from that response; `loadWorkBreakdown` takes
   `estimate` from the skeleton-derived data instead). This fix requires no new prompt text and no
   new field the model must produce anywhere — it only changes WHICH of the two already-produced
   copies the host trusts: `parseTaskDetailBlock` starts also reading back `estimate`, and
   `loadWorkBreakdown`'s per-task mapping uses it instead of the skeleton's. Every other skeleton
   field stays at skeleton level, either because it is genuinely cheap (an ID, an enum, a short
   string) or because a real downstream check needs it before any per-task dispatch (e.g.
   `acceptanceCriteria` for AC-coverage validation, `dependsOn` for DAG validation) — this is a
   scoped reduction, not a redesign of the skeleton/detail boundary itself.
2. **UC-02 — Turn-by-turn dispatch evidence for implementation/review (`lib/task-executor/`).**
   Each implementation and review dispatch persists its own raw transcript/response to an evidence
   file under the run's own execution-root directory, mirroring the existing
   `lib/workflow-worker-evidence.js` convention `pm-phase1`/`pm-phase2` already use for their own
   worker calls — so a human or a future investigation can inspect exactly what a dispatch actually
   did without re-running anything. This UC only adds capture; it does not itself interpret,
   summarize, or attribute the time/cost a transcript shows.
3. **UC-03 — Pre-dispatch verification short-circuit for an already-satisfied task.** Before a
   task's FIRST attempt is dispatched, if that task declares one or more verification commands,
   they are run once against the current project directory exactly as `runVerifications` already
   does post-dispatch. If every command already passes, the task is marked `'skipped'` directly —
   the SAME terminal status/meaning the existing post-hoc no-op-checkpoint path already uses —
   without ever dispatching the implementation agent OR the review agent for that attempt. A task
   declaring zero verification commands is never eligible for this short-circuit (there is nothing
   to confirm "already satisfied" against) and always proceeds to a normal dispatch, unchanged from
   today.

## Out of Scope
- Reworking the fresh-headless-dispatch-per-task architecture itself (no cross-task context reuse,
  no shared agent session across the sequential chain) — this is a deliberate tradeoff for
  resumability/crash-safety established by FTR-018, not something this feature reopens. Noted as
  an Open Question below, explicitly deferred pending real evidence UC-02's own instrumentation can
  provide in the future.
- Giving the review dispatch a pre-scoped/tighter context derived from the implementation
  dispatch's own exploration — same reasoning as above; deferred, not designed here.
- Any change to `maxConcurrency` being fixed at 1 for the platform's current qualification — out of
  scope for both subsystems touched here.
- UC-02's evidence files feeding any automated analysis, dashboard, or cost-attribution report —
  this feature only captures the raw material; interpreting it is future work.
- Removing or renaming the existing `estimate` field from the per-task DETAIL schema, the rendered
  Work Breakdown documents, or `c.estimates()`'s own consumption of it — UC-01 only changes WHEN
  (which call) produces that value, never its presence, meaning, or shape downstream.
- Any change to `wb-skeleton-check.js`/`wb-graph-checks.js`'s existing structural checks beyond
  whatever minimal schema-shape adjustment UC-01 itself requires.
- Porting UC-03's pre-dispatch short-circuit to the review step independently (e.g. skipping
  review alone while still dispatching implementation) — the short-circuit is all-or-nothing per
  attempt, matching the existing all-or-nothing meaning of `'skipped'`.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| A task's skeleton-level fields (title/outcome/domain/agentType/dependsOn/acceptanceCriteria/outputCount/commit) are generated as today | No behavior change from UC-01 |
| A task's effort estimate is now READ from the per-task DETAIL call's existing response (the model already produces it there today) instead of from the skeleton | `c.estimates()`'s own input is unaffected — it already runs after every per-task detail call completes |
| A resumed run whose skeleton was generated by a PRE-UC-01 toolkit version (estimate already present in an on-disk `index.json`) | Read as-is; UC-01 only changes what a NEW skeleton generation call asks for, not how an existing on-disk skeleton is read |
| An implementation or review dispatch fails/times out before producing a final response | UC-02's evidence capture persists whatever was received up to that point — a partial/empty transcript is not itself an error |
| A task declares one or more verification commands, and ALL of them already pass before the first attempt | UC-03 short-circuits: marked `'skipped'`, neither implementation nor review is ever dispatched for that attempt |
| A task declares one or more verification commands, and AT LEAST ONE fails before the first attempt | No short-circuit — proceeds to a normal first dispatch, unchanged from today |
| A task declares ZERO verification commands | Never eligible for the short-circuit (nothing to confirm "already satisfied" against) — always proceeds to a normal dispatch |
| A task's SECOND or later attempt (a retry after a prior failed attempt within the same task) | The short-circuit only runs before the FIRST attempt of a task — a retry always proceeds to a normal dispatch, since a prior failed attempt already proves verification did not already pass at task start |
| The pre-dispatch verification run itself throws (e.g. a verification command's own tooling is broken) | Propagates unmodified, exactly as a post-dispatch verification failure would today — never silently swallowed into "proceed with dispatch anyway" |
| `--force`/a revision cycle re-enters WBS skeleton generation | Unaffected by UC-01 beyond the schema-shape change itself |

## Data Model
N/A for UC-01 (shrinks an existing schema, introduces no new on-disk artifact) and UC-03 (adds a
pre-dispatch check reusing the existing `'skipped'` status, no new field). UC-02 introduces one new
on-disk evidence file per implementation/review dispatch attempt, under the run's own
execution-root directory (exact path/filename convention mirrors `lib/workflow-worker-evidence.js`
— resolved in Tech-Spec).

## Roles and Permissions
N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A WBS skeleton generation call | Dispatched | Its schema no longer requires `estimate` (agentMinutes/tokens) per task | Must |
| AC-02 | A per-task WBS detail generation call's response (already containing a real `estimate` in its template-filled field block, unchanged) | Parsed via `wbs-assembler.js`'s `parseTaskDetailBlock` | `estimate` (agentMinutes/tokens) is now read back from that response, alongside the existing `groupingRationale`/verification commands | Must |
| AC-03 | A feature generated end-to-end with UC-01 applied | `c.estimates()` runs | It reports the same shape/semantics of effort totals as before UC-01 — no change visible in `{PREFIX}-Effort-Estimate.md`/`{PREFIX}-Token-Estimate.md` | Must |
| AC-04 | `wb-skeleton-check.js`/`wb-graph-checks.js`'s existing structural checks | Run against a skeleton produced under UC-01's shrunk schema | All pass exactly as they do today — none of them depended on `estimate` | Must |
| AC-05 | A real implementation or review dispatch | Completes (success, failure, or timeout) | A raw transcript/response evidence file is persisted for that specific dispatch attempt, readable independently of the run's own in-progress state | Must |
| AC-06 | A task with one or more verification commands, all already passing before its first attempt | `_runTaskToResolution` begins that task's first attempt | Neither the implementation agent nor the review agent is ever dispatched; the task is marked `'skipped'` | Must |
| AC-07 | A task with one or more verification commands, at least one failing before its first attempt | `_runTaskToResolution` begins that task's first attempt | A normal implementation dispatch proceeds, unchanged from today | Must |
| AC-08 | A task with zero verification commands | `_runTaskToResolution` begins that task's first attempt | Never short-circuited — a normal implementation dispatch proceeds, unchanged from today | Must |
| AC-09 | A task's second or later attempt (a retry) | `_runTaskToResolution` begins that attempt | Never short-circuited, regardless of current verification state — proceeds to a normal dispatch | Must |
| AC-10 | A real run exercising UC-03's short-circuit on at least one task and a normal dispatch on at least one other | Measured | The short-circuited task's wall-clock/token cost is near-zero (verification-only) compared to the normally-dispatched task | Must |
| AC-11 | All changes are delivered | `npm test` runs | All tests pass: new regression tests for AC-01 through AC-10, and a full-suite regression | Must |

## MVP vs Deferred

### MVP (must ship)
- UC-01: remove `estimate` from the WBS skeleton schema; start reading it back from the per-task
  detail call's existing response instead of discarding it.
- UC-02: persist a raw transcript/evidence file per implementation/review dispatch attempt.
- UC-03: pre-dispatch verification short-circuit for an already-satisfied task's first attempt.
- Automated tests per AC-11.

### Deferred (next iteration, only if real evidence justifies it)
- Any cross-task context reuse or session persistence across the sequential dispatch chain.
- A tighter, pre-scoped review context derived from the implementation dispatch's own exploration.
- Automated analysis/attribution tooling built on top of UC-02's raw evidence files.
- Extending UC-03's short-circuit logic to the review step independently of implementation.
- Reducing the SKELETON_SCHEMA further beyond the one field (`estimate`) this feature identifies as
  both safely deferrable and plausibly the dominant per-task cost driver.

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Exact on-disk path/filename convention for UC-02's new per-dispatch evidence files | **Open — resolve in Tech-Spec** | Lean toward mirroring `lib/workflow-worker-evidence.js`'s existing convention as closely as possible, under the run's own execution-root directory, keyed by taskId/attemptNumber/dispatch-kind (implementation vs. review) |
| 2 | Whether UC-03's short-circuit should record a distinct reason/activity-log entry from the EXISTING post-hoc no-op `'skipped'` path, so operators/cost-reporting can tell "never dispatched" apart from "dispatched, turned out already done" | **Open — resolve in Tech-Spec** | Lean toward yes (a `reason` field on the ledger/state entry) — same terminal task status either way, but materially different cost, worth distinguishing for anyone reading the run's own history later |
| 3 | Whether cross-task context reuse or a tighter review context (both explicitly Out of Scope here) should become a FUTURE feature once UC-02's evidence makes root-causing the remaining cost tractable | **Open — not resolved in this feature** | Explicitly deferred; revisit once real evidence from UC-02 exists |

## Dependencies and Assumptions
- FTR-018 (deterministic task executor — `lib/task-executor/`, the fresh-headless-dispatch-per-task
  design UC-03 adds a pre-check in front of, unchanged itself), FTR-020/FTR-026 (split-source-native
  WBS pipeline — `pm-phase2.js`'s skeleton/detail call shape UC-01 adjusts), FTR-028
  (`lib/workflow-worker-evidence.js` — the existing convention UC-02 mirrors) — all available, all
  reused, none replaced.
- Both concerns are grounded in real, independently-verified reports from two different consumer
  projects the same day (`Fincantieri.CommonLibraries.MFExample` FTR-003 for UC-01;
  `Fincantieri.ISDM.JobScheduler` FTR-012, toolkit v0.22.0, for UC-02/UC-03) — not hypothetical
  performance concerns.
- `pm-phase2.js` remains a sandboxed workflow script with no `require()`; UC-01's schema change
  there is a pure JSON-Schema edit (drop `estimate` from `SKELETON_SCHEMA`/`materializeIndex`'s
  copy), while the actual read-back happens in `src/claude/scripts/wbs-assembler.js` (a normal
  Node module, real `require()` available) — `parseTaskDetailBlock` and `loadWorkBreakdown`'s
  per-task mapping, used identically by `wb-render.js`, `wb-validate.js`, and the task executor's
  own `_loadPlanDocs` fallback (FTR-030), so this one change propagates everywhere consistently.
- `lib/task-executor/` modules are normal Node modules (real `require()` available) — UC-02/UC-03
  are additive changes to `_runTaskToResolution`/`dispatchTaskAttempt`/`runReview`, not a rewrite of
  either.
- `npm test` is the only verification command; no separate build step exists.
- This feature does not change `maxConcurrency`'s current fixed value of 1, nor any platform
  qualification constraint established by FTR-018/US-08.
