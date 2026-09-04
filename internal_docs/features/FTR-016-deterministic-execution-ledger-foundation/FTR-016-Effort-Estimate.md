# Effort Estimate — FTR-016 — Deterministic Execution Ledger Foundation

## Summary

| Metric | Value |
|--------|-------|
| User Stories | 11 |
| Total tasks | 40 (BE: 26, FE: 0, DB: 0, INFRA: 0, TEST: 14) |
| Implementation phases | 12 |
| Human estimate (sequential) | ~30h 28min (no parallelism) |
| Agent estimate (sequential sum) | ~7h 37min (all tasks, no parallelism) |
| Agent estimate (parallel critical path) | ~5h 17min (wave-scheduled dispatch) |

> All figures are computed **exclusively from `FTR-016-Work-Breakdown.json`** (`estimate.agentMinutes` per task).
> Human minutes = agent minutes × 4 (human:agent productivity factor). Domain distribution counts the
> `domain` field of every task; INFRA-phase tasks carry `BE`/`TEST` domains, so the INFRA *domain* total is 0.

## Per-Phase Breakdown

| Phase | Title | Tasks | Domains | Est. Human | Est. Agent (phase, sequential) |
|-------|-------|-------|---------|-----------|-------------------------------|
| INFRA | Shared ledger-module primitives, CLI dispatcher, and test scaffolds | 10 | BE, TEST | ~7h 24min | ~1h 51min |
| US-01 | Record a Tracked Activity Execution | 4 | BE, TEST | ~3h 28min | ~52min |
| US-02 | Complete a Tracked Activity Successfully | 4 | BE, TEST | ~3h 20min | ~50min |
| US-03 | Record Activity Failure | 5 | BE, TEST | ~3h 48min | ~57min |
| US-04 | Record Activity Skip | 4 | BE, TEST | ~3h 8min | ~47min |
| US-05 | Record Feature Definition Activity | 5 | BE, TEST | ~3h 16min | ~49min |
| US-06 | Handle Corrupt Ledger File | 2 | BE, TEST | ~1h 28min | ~22min |
| US-07 | Resume Execution After Interruption | 1 | TEST | ~44min | ~11min |
| US-08 | Execute a Rework of an Activity | 1 | TEST | ~44min | ~11min |
| US-09 | Concurrently Update Ledger from Multiple Agents | 1 | TEST | ~48min | ~12min |
| US-10 | Recover from Stale Lock | 1 | TEST | ~52min | ~13min |
| US-11 | Verify CLI facade success and reader compatibility | 2 | BE, TEST | ~1h 28min | ~22min |
| **Total** | | **40** | | **~30h 28min** | **~7h 37min** |

## Execution Waves (parallel critical path)

Phases within a wave run concurrently; a phase's tasks run sequentially within the phase. The critical path
is the sum of each wave's longest phase.

| Wave | Phases (concurrent) | Longest phase (agent min) |
|------|---------------------|---------------------------|
| 1 | INFRA | 111 |
| 2 | US-01, US-05, US-06 | 52 (US-01) |
| 3 | US-02, US-08, US-10 | 50 (US-02) |
| 4 | US-03, US-07, US-09, US-11 | 57 (US-03) |
| 5 | US-04 | 47 |
| **Critical path** | | **317 min (~5h 17min)** |

## Notes
- Human estimate assumes sequential execution with no parallelism.
- Agent estimate (sequential sum) is the total of every task's agent-minutes; the parallel critical path
  (5h 17min) is the realistic wall-clock under wave-scheduled dispatch of independent phases.
- Actual Human / Actual Agent are filled in by pm-phase3 after implementation completes.
