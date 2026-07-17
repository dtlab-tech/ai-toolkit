# Effort Estimate — FTR-004 — Assessment Registry

| Metric | Value |
|--------|-------|
| User Stories | 6 (US-01 ÷ US-06) |
| Total tasks | 19 (INFRA: 2, BE: 11, TEST: 6) |
| Implementation phases | 3 |
| Human estimate | ~51h (sequential, no parallelism) |
| Agent estimate | ~2h 55min (parallel dispatch, critical path only) |

## Domain breakdown

| Domain | Tasks | Notes |
|--------|-------|-------|
| INFRA | 2 | Format contract documentation in assessment-manager.md |
| BE | 11 | Core extraction, row build, create/append logic, process log, Phase 6 summary |
| FE | 0 | No frontend work |
| TEST | 6 | Unit and integration tests for all acceptance criteria |

## Implementation phases

| Phase | Tasks | Parallelism |
|-------|-------|-------------|
| Phase 1 — Shared Infrastructure | 2 INFRA tasks | 1 agent (parallel tasks within) |
| Phase 2 — Core Registry Write | 11 BE tasks | 2 agents in parallel (US-01 batch, US-02 batch) |
| Phase 3 — Edge Cases and Testing | 6 TEST tasks + 1 BE task | 3 agents in parallel (US-03 BE, testing batch, manual verification) |

## Notes

- Tasks are complexity S (simple, ~1-2h human) and M (medium, ~2-3h human); no L tasks.
- Agent estimate is based on critical path: INFRA → extraction → build → create/append → summary → testing chain.
- Phase 1 and Phase 2 US-01/US-02 tasks are mostly independent and can be dispatched to parallel agents.
- The main implementation target is `.claude/agents/assessment-manager.md` (Phase 6 section); no compiled code, no build verification needed.
- TEST tasks in this toolkit produce test specification files or document manual verification steps.

---

## Actuals vs Estimate

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Total wall-clock (agent) | ~2h 55min | ~35min | -2h 20min |
| Phase 1 — Shared Infrastructure | ~20min | 1min 32s | -18min |
| Phase 2 — Core Registry Write | ~1h 35min | 4min 11s | -1h 31min |
| Phase 3 — Edge Cases and Testing | ~1h | ~5min + 4min 55s rework | -50min |

## Task-level actuals

| Task ID | Domain | Agent estimate | Actual | Delta |
|---------|--------|---------------|--------|-------|
| INFRA-T01, INFRA-T02 | INFRA | ~20min | 1min 32s | -18min |
| US-01-T01 – US-01-T06, US-02-T01 – US-02-T05 | BE | ~90min | 4min 11s | -86min |
| US-03-T01 | BE | ~10min | included in Phase 3 batch | — |
| US-01-T07 – US-01-T10, US-02-T06, US-03-T02, US-04-T01, US-05-T01, US-06-T01 – US-06-T03 | TEST | ~105min | ~5min + 4min 55s rework | -95min |
| assessment-manager rework (WARNINGs) | BE | — (contingency) | ~3min | — |
| test spec rework (CRITICALs) | TEST | — (contingency) | 4min 55s | — |

## Estimation accuracy

| Category | Tasks | Avg delta | Trend |
|----------|-------|-----------|-------|
| INFRA | 2 | -18min | under-target |
| BE | 11 | -90min | under-target |
| TEST | 6 | -90min | under-target |

## Notes

All tasks ran significantly faster than the human sequential estimates because AI agents parallelize work and operate without context-switching overhead. The agent estimate of ~2h 55min was itself overstated — the actual critical path wall-clock was ~35 minutes. The main sources of additional time were the rework cycles: assessment-manager WARNING fixes (~3min) and test spec CRITICAL fixes (~5min), both within the 2-cycle rework limit. No tasks were blocked or escalated.
