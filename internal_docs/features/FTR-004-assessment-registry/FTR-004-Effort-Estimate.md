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
