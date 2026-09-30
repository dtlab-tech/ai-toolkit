# Effort Estimate — FTR-018 — Deterministic Task Execution, Checkpoints and Resume

## Summary

| Metric | Value |
|--------|-------|
| User Stories | 9 |
| Total tasks | 46 (BE: 34, FE: 0, DB: 0, INFRA: 5, TEST: 7) |
| Implementation phases | 10 |
| **Agent implementation effort (Σ task durations)** | **9h 46min** (586 min across 46 tasks) |
| Human heuristic baseline | ~77h 30min (sequential, no parallelism) |

> **Reconciliation note (why the two figures differ, and how they are derived).**
> The two numbers above measure different things and are computed by different methods —
> they are *not* two views of one quantity, and neither is derived from the other.
>
> - **Agent implementation effort = the exact sum of the 46 per-task `agentMinutes`**
>   recorded in `FTR-018-Work-Breakdown.json` (bottom-up). Every task is ≤ 20 min, so the
>   sum is **586 min = 9h 46min**. This is the authoritative figure for agent effort.
> - **Human heuristic baseline** is a top-down comparison only: a fixed per-domain rate
>   (BE 120 min, TEST 60 min, INFRA 30 min per task) × task count = 77h 30min. It is a
>   rough "what would a human take" yardstick, **not** a transform of the agent effort.
>
> A previous revision advertised an "agent estimate ≈ 18h 23min" obtained as
> `human ÷ 4`. That figure was a heuristic divisor with no link to the actual task
> durations and is **removed** — 46 tasks each ≤ 20 min cannot sum to 18h 23min. The agent
> effort is now stated only as the real Σ of task durations.

## Overhead — stated separately from the task-duration sum

The 9h 46min above is **implementation and test-authoring effort only** (the sum of task
durations). The following overheads are called out explicitly and are **not folded into**
that sum:

| Overhead | Where it lives | Included in the 9h 46min? |
|----------|----------------|---------------------------|
| Solution review | Embedded inside the US-04 verification/review tasks (US-04-TASK-BE-02/03) and their test task; there are no standalone review tasks | Yes — already counted as those tasks' durations |
| Rework on failed verification/review | Contingent; occurs only when a task fails its checks. Recorded per-attempt in the ledger as it happens | No — not pre-estimated |
| Coordinator orchestration (dispatch, scheduling, checkpoint/commit bookkeeping) | The Node executor's own wall-clock between task dispatches | No — not counted as task effort |
| Real-runtime paid E2E (US-09-TASK-TEST-02) | A single planned, authorized run; token cost depends on feature size and is deliberately excluded from token/effort sums | Duration counted (18 min); token/€ cost excluded (planned, not yet run) |

Because no separate review or rework tasks exist, **agent effort total = the task-duration
sum = 9h 46min**. Rework and orchestration overhead are observed and recorded at execution
time (ledger), never invented up front.

## Per-Phase Breakdown

`Agent effort` is the sum of that phase's per-task `agentMinutes` (bottom-up, authoritative).
`Human heuristic` is the top-down per-domain baseline for comparison only.

| Phase | Title | Tasks | Domains | Agent effort (Σ tasks) | Human heuristic | Actual Agent |
|-------|-------|-------|---------|------------------------|-----------------|--------------|
| INFRA | Shared infrastructure: state protocol, ledger extension, executor skeleton | 3 | BE | 44min | 6h | — |
| US-01 | Parse and validate the approved Work Breakdown | 5 | BE | 1h 1min | 10h | — |
| US-02 | Acquire exclusive lock and prevent duplicate coordinators | 3 | BE | 40min | 6h | — |
| US-03 | Dispatch one implementation agent per task per attempt | 4 | BE | 50min | 8h | — |
| US-04 | Run verifications and review | 4 | BE, TEST | 51min | 7h | — |
| US-05 | Checkpoint, stage, commit, and register SHA | 5 | BE | 1h 1min | 10h | — |
| US-06 | Resume from persisted evidence and reconcile without re-execution | 4 | BE, TEST | 54min | 7h | — |
| US-07 | Sequential execution with one active task | 3 | BE, TEST | 41min | 5h | — |
| US-08 | Parallel execution with N isolated worktrees | 8 | BE, INFRA, TEST | 1h 39min | 12h 30min | — |
| US-09 | Integrate executor into implement-feature and test with real features | 7 | BE, INFRA, TEST | 1h 25min | 6h | — |
| **Total** | | **46** | | **9h 46min** | **~77h 30min** | **—** |

## Notes
- Agent effort is the exact sum of per-task `agentMinutes`; it is bottom-up and internally consistent with the Work Breakdown.
- Human heuristic is a top-down per-domain baseline (BE 120 / TEST 60 / INFRA 30 min per task); it is a comparison yardstick, not a transform of agent effort.
- `default maxConcurrency=1` (Gate 1 constraint): the sequential critical path is close to the full 9h 46min; parallelism (N>1, Windows-qualified) shortens wall-clock but not total effort.
- Actual Agent: filled in by pm-phase3 / the executor after implementation completes, per-task in the ledger (including failures and rework).
