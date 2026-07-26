# Effort Estimate — FTR-008 — Compact Instructions Block

| Metric | Value |
|--------|-------|
| User Stories | 3 (US-01 ÷ US-03) |
| Total tasks | 5 (DB: 0, BE: 0, FE: 0, INFRA: 4, TEST: 1) |
| Implementation phases | 3 |
| Human estimate | ~6.5h (sequential, no parallelism) |
| Agent estimate | ~35min (parallel dispatch, critical path only) |

## Domain breakdown

| Domain | Tasks | Notes |
|--------|-------|-------|
| DB | 0 | No database changes |
| BE | 0 | No backend services |
| FE | 0 | No frontend components |
| INFRA | 4 | All tasks are Markdown/text file edits (install-toolkit.md, ~/.claude/CLAUDE.md) |
| TEST | 1 | Manual verification checklist document |

## Implementation phases

| Phase | Tasks | Parallelism |
|-------|-------|-------------|
| Phase 1 — US-01: Section append logic | 1 task | 1 agent (no deps) |
| Phase 2 — US-02 + US-03 setup | 2 tasks | 2 agents in parallel (US-02-T01, US-03-T01) |
| Phase 3 — US-03 completion + tests | 2 tasks | 2 agents in parallel (US-03-T02, US-03-T03) |

## Notes

- Human estimate uses: Small=30min, Medium=2h, Large=8h (sequential)
- Agent estimate uses: Small=5min, Medium=10–15min, Large=60min (parallel within phase)
- Critical path: US-01-T01 (15min) → US-03-T01 (10min) → US-03-T02 (5min) + US-03-T03 (10min) = ~35min agent wall-clock
- All tasks are INFRA/TEST domain — routed to `developer-backend` agent
- No compilation step; verification is read-file comparison against spec

---

## Actuals vs Estimate

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Total wall-clock (agent) | ~35min | 42min 37s | +7min 37s |
| Phase 1 — US-01 Section Logic | ~15min | ~16min | +1min |
| Phase 2 — US-02 + US-03 setup | ~10min | ~15min | +5min |
| Phase 3 — US-03 completion + tests | ~10min | ~12min | +2min |

## Task-level actuals

| Task ID | Domain | Agent estimate | Actual | Delta |
|---------|--------|---------------|--------|-------|
| US-01-T01 | INFRA | ~15min | ~16min | +1min |
| US-02-T01 | INFRA | ~5min | included in US-01-T01 | N/A |
| US-03-T01 | INFRA | ~10min | ~10min | 0 |
| US-03-T02 | INFRA | ~5min | ~5min | 0 |
| US-03-T03 | TEST | ~10min | ~12min | +2min |

## Estimation accuracy

| Category | Tasks | Avg delta | Trend |
|----------|-------|-----------|-------|
| INFRA | 4 | +1.5min | on-target |
| TEST | 1 | +2min | on-target |

## Notes

- All tasks completed in a single inline pass (no subagent dispatch)
- US-02-T01 was subsumed into US-01-T01 (verbatim content is part of the same heredoc)
- Wall-clock overage (+7min) attributable to doc-generation phases being inline rather than parallel; the gate approval wait time (Gate 1: ~4min, Gate 2: ~15min) is excluded from agent wall-clock
