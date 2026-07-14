# Effort Estimate — FTR-001 — Assessment Pipeline Token Estimation

| Metric | Value |
|--------|-------|
| User Stories | 6 (US-01 ÷ US-06) + INFRA (2 tasks) |
| Total tasks | 19 (BE: 19) |
| Implementation phases | 6 |
| Human estimate | ~30h 30min (sequential, no parallelism) |
| Agent estimate | ~70min (parallel dispatch, critical path only) |

## Domain breakdown

| Domain | Tasks | Notes |
|--------|-------|-------|
| BE | 19 | All tasks modify markdown agent/skill definition files |
| DB | 0 | N/A |
| FE | 0 | N/A |
| INFRA | 0 | INFRA-T01/T02 are infrastructure setup but classified BE |
| TEST | 0 | N/A |

## Implementation phases

| Phase | Tasks | Parallelism |
|-------|-------|-------------|
| Phase 1 — Shared Infrastructure | 2 tasks (INFRA-T01, INFRA-T02) | 2 agents in parallel |
| Phase 2 — US-01: Write Token Estimate at Phase 3 | 7 tasks | 1 agent (sequential tasks within US) |
| Phase 3 — US-02: Append Intervention Doc Row | 2 tasks | 1 agent |
| Phase 4 — US-05: Error Handling | 3 tasks | 1 agent |
| Phase 5 — US-04: Remediation Path | 3 tasks | 1 agent |
| Phase 6 — US-03 + US-06: Gate/Finalization | 5 tasks | 2 agents in parallel (US-03 and US-06 independent) |

## Notes

- Human estimate: sum of all 19 task human durations from Work Breakdown (S=~45min, M=~2h, L=~4h average)
- Agent estimate: max task duration per phase, summed across phases (parallel dispatch within each phase)
  - Phase 1: max(5, 3) = 5min
  - Phase 2: max(10, 12, 10, 10, 8, 15, 5) = 15min
  - Phase 3: max(5, 5) = 5min
  - Phase 4: max(5, 5, 3) = 5min
  - Phase 5: max(10, 15, 10) = 15min
  - Phase 6: max(3, 10, 5, 25, 10) = 25min
  - Critical path total: 5+15+5+5+15+25 = **70min**
- The Work Breakdown summary lists 95min agent total (sum of all tasks); 70min is the critical-path parallel estimate
- All tasks are BE domain: the "code" being written is markdown prose in .claude/ agent and skill definition files
- No DB migrations, no frontend, no compiled code — compilation verification = markdown linting only
