# Effort Estimate — FTR-009 — Rewrite Orchestrators as Workflow Scripts

| Metric | Value |
|--------|-------|
| User Stories | 4 (US-01 ÷ US-04) |
| Total tasks | 15 (DB:0, BE:11, FE:0, INFRA:4, TEST:0) |
| Implementation phases | 5 |
| Human estimate | ~34h (sequential, no parallelism) |
| Agent estimate | ~2h 6min (parallel dispatch, critical path only) |

## Domain breakdown

| Domain | Tasks | Notes |
|--------|-------|-------|
| DB | 0 | — |
| BE | 11 | Workflow scripts (5) + skill rewrites (2) + install updates (2) + INFRA-T01 |
| FE | 0 | — |
| INFRA | 4 | Directory creation + file deletions |
| TEST | 0 | Verification is manual/integration per AC list |

## Implementation phases

| Phase | Tasks | Parallelism |
|-------|-------|-------------|
| Phase 1 — Shared Infrastructure | 1 task (INFRA-T01) | 1 agent |
| Phase 2 — Workflow Scripts (pm-phase1/2, am-phase1/2) | 4 tasks | 4 agents in parallel |
| Phase 3 — pm-phase3.js | 1 task | 1 agent |
| Phase 4 — Skills and Install Files | 4 tasks | 4 agents in parallel |
| Phase 5 — Delete Orchestrator Files | 2 tasks | 1 agent (sequential, trivial) |

## Notes

- Human estimate uses: S = 30min average (range 5min–1h), M = 3h average, L = 10h average.
- Agent estimate: critical path only — INFRA-T01 (2min) + US-01-T01 (45min) + US-01-T03 (60min) + US-03-T01 (15min) + US-04-T01 (1min) = 123min ≈ 2h 3min.
- No DB, FE, or TEST tasks — this is a pure tooling/configuration change.
- The large tasks (US-01-T01, US-01-T03) reflect complex orchestration logic that must faithfully port the existing PM pipeline behaviour into JavaScript.
