# Effort Estimate — FTR-005 — Assessment Intervention Commands

| Metric | Value |
|--------|-------|
| User Stories | 2 (US-01 ÷ US-02) |
| Total tasks | 2 (DB:0, BE:0, FE:0, INFRA:2, TEST:0) |
| Implementation phases | 1 |
| Human estimate | ~4h (sequential, no parallelism) |
| Agent estimate | ~30min (parallel dispatch, critical path only) |

## Domain breakdown

| Domain | Tasks | Notes |
|--------|-------|-------|
| DB | 0 | No database changes |
| BE | 0 | No backend code |
| FE | 0 | No frontend code |
| INFRA | 2 | Both command files; classified INFRA as they are tooling/configuration files |
| TEST | 0 | Verification via manual AC walkthrough (no automated test files) |

## Implementation phases

| Phase | Tasks | Parallelism |
|-------|-------|-------------|
| Phase 1 — Command Implementation | 2 tasks (US-01-T01, US-02-T01) | 2 agents in parallel |

## Agent wall-clock actuals

| Agent | Estimated | Actual | Notes |
|-------|-----------|--------|-------|
| generate-requirements | ~5min | 2m 42s | ✅ |
| generate-tech-spec | ~5min | 1m 55s | ✅ |
| validate-feature-docs | ~5min | 0m 49s | ✅ |
| generate-work-breakdown | ~5min | 2h 7m 38s | ⚠️ anomalous — PM relay chain overhead |
| developer-backend (×2) | ~15min | 0 | not run — main loop implemented directly |
| review-solution | ~10min | 17m 9s | ✅ |
| PM orchestrator total | ~30min | ~4h | ⚠️ run_in_background bug caused 5 relay chains |

## Pipeline wall-clock total

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Agent critical path | ~30min | ~4h |
| Human wait (gate approvals) | — | ~30min |

## Notes

- Both tasks are M-complexity (2h human / 15min agent each).
- No sequential dependency between the two tasks — both can run in parallel in Phase 1.
- Agent estimate is 15min per task × 1 (parallel) + ~5min per review × 2 = ~25min total critical path; rounded to 30min.
- Human estimate is 2h + 2h (sequential) = 4h.
- No INFRA-TXX setup tasks are required (no shared infrastructure).
- **Variance:** generate-work-breakdown anomalously took 2h 7m (likely PM relay chain waiting for Gate 2 user input). PM orchestrator massively overran due to `run_in_background: true` spawning 5 relay chains; fixed in Gate Protocol (CLAUDE.md).
