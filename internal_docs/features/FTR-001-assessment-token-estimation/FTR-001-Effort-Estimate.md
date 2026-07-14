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

---

## Actuals vs Estimate

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Total wall-clock (agent) | ~70min | ~2h 30min | +80min |
| Phase 1 — Shared Infrastructure | ~5min | 1m 34s | −4min |
| Phase 2 — US-01 | ~15min | ~110min | +95min |
| Phase 3 — US-02 + US-05 | ~10min | 5m 34s | −4min |
| Phase 4 — US-04 | ~15min | 3m 01s | −12min |
| Phase 5 — US-03 + US-06 | ~25min | 11m 50s | −13min |
| Review + rework | not estimated | ~103min | — |

## Task-level actuals

| Task ID | Domain | Agent estimate | Actual | Delta |
|---------|--------|---------------|--------|-------|
| INFRA-T01, T02 | BE | ~8min | 1m 34s | −6min |
| US-01 (T01–T07) | BE | ~52min | ~110min | +58min |
| US-02, US-05 | BE | ~10min | 5m 34s | −4min |
| US-04 | BE | ~35min | 3m 01s | −32min |
| US-03, US-06 | BE | ~25min | 11m 50s | −13min |
| review-solution | — | not estimated | ~78min | — |
| developer-backend rework | — | not estimated | 8min | — |
| review-solution rework | — | not estimated | ~17min | — |

## Estimation accuracy

| Category | Tasks | Avg delta | Trend |
|----------|-------|-----------|-------|
| BE implementation | 5 batches | −11min | under-target |
| Review + rework | 2 batches | not estimated | — |

## Notes

- US-01 (7 tasks in assessment-manager.md) took significantly longer than estimated (~110min vs ~52min) because the agent wrote a large, detailed Phase 3 section with a full embedded file template, requiring more iterations than typical markdown edits.
- US-04 and US-03+US-06 were faster than estimated because the groundwork laid in US-01 and US-02 meant less prose to write.
- Review cycle was the largest unplanned cost (78min + 17min re-review). The review found 2 CRITICALs that required a rework cycle, which adds 8min + 17min.
- The 70min critical-path estimate did not account for review and rework cycles; total wall-clock was approximately 2h 30min including those.
