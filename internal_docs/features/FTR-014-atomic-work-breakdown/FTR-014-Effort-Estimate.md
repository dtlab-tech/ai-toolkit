# Effort Estimate — FTR-014 — Atomic Work Breakdown

## Summary

| Metric | Value |
|--------|-------|
| User Stories | 7 |
| Total tasks | 62 (BE: 32, INFRA: 12, TEST: 18) |
| Implementation phases | 8 |
| Human estimate | ~61h 25min |
| Total agent effort | ~564min (~9h 24min) |
| Estimated elapsed critical path | ~452min (~7h 32min) |
| **Actual agent effort (observable)** | **~288min (~4h 48min, partial — 17 inline tasks)** |

## Per-Phase Breakdown

| Phase | Title | Tasks | Domains | Est. Human | Est. Agent | Actual Human | Actual Agent |
|-------|-------|-------|---------|-----------|-----------|-------------|-------------|
| 1 | Shared Infrastructure | 8 | INFRA | ~2h 45min | ~53min | — | ~31min |
| 2 | US-01: Update generate-work-breakdown | 3 | INFRA, BE, TEST | ~2h 30min | ~25min | — | ~18min |
| 3 | US-02: Implement wb-validate.js | 21 | BE, TEST | ~24h 15min | ~201min | — | ~127min (T14 not_available) |
| 4 | US-03: Create semantic validator agent | 4 | INFRA, BE, TEST | ~5h | ~47min | — | ~15min (T02–T03 inline) |
| 5 | US-04: Implement wb-render.js | 8 | BE, TEST | ~9h 45min | ~84min | — | ~53min |
| 6 | US-05: Update pm-phase2 and Gate 2 | 9 | BE, INFRA, TEST | ~9h 10min | ~80min | — | ~25min (T02–T06 inline) |
| 7 | US-06: FTR-013 ledger tracking | 4 | BE, TEST | ~4h | ~34min | — | ~7min (T01–T03 inline) |
| 8 | US-07: Installer distribution | 5 | INFRA, BE, TEST | ~4h | ~40min | — | ~12min (T02, T04–T05 inline) |
| **Total** | | **62** | | **~61h 25min** | **~564min** | **—** | **~288min (partial)** |

## Notes
- Human estimate: sum of the individual human estimates of all 62 tasks, totaling 3,685 minutes (~61h 25min).
- Total agent effort: sum of all individual task agent estimates, totaling 564 minutes (~9h 24min), independently of execution scheduling or parallelism.
- Estimated elapsed critical path: 452 minutes (~7h 32min), assuming maximum parallelism permitted by phase and task dependencies: INFRA(53) → US-02(201) → US-04(84) → US-05(80) → US-06(34).
- Phase 3 (US-02, 21 tasks) is the critical path bottleneck at ~201 agent-minutes.
- Phases 4 (US-03) and 5 (US-04) run in parallel after Phase 3 completes (~47min and ~84min respectively).
- Phase 8 (US-07, 40min): can start at 53+201+84=338min; finishes at 378min — before US-06 completes (452min); not on critical path.
- Actual Human: filled in if a human developer performed or reviewed the implementation.
- Actual Agent: wall-clock time spent by agents executing implementation tasks (sum of sequential task durations from ledger timestamps). Partial — 17 tasks were executed inline in the main conversation loop with no measurable subagent duration; these are labelled "inline" and excluded from the observable total. US-02/T14 timestamp spans overnight and is not_available.
- Actual agent total (288min) is substantially below the estimate (564min) because many tasks were completed inline (no subagent overhead) and agent execution was faster than the conservative per-task estimate.
