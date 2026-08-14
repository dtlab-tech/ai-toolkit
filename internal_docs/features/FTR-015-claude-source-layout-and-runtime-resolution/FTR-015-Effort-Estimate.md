# Effort Estimate — FTR-015 — Claude Source Layout and Runtime Resolution

| Metric | Value |
|--------|-------|
| User Stories | 9 (US-01 ÷ US-09) + 1 shared INFRA phase |
| Total tasks | 48 (BE:18, INFRA:11, TEST:19, DB:0, FE:0) |
| Implementation phases | 10 |
| Human estimate | ~8h (sequential, no parallelism) |
| Agent estimate | ~2h 6min (parallel dispatch, critical path per phase) |

## Domain breakdown

| Domain | Tasks | Notes |
|--------|-------|-------|
| DB | 0 | — |
| BE | 18 | Core implementation: asset catalog, resolver, CLI commands, migrations |
| FE | 0 | — |
| INFRA | 11 | Config, packaging, docs, git operations, npm scripts |
| TEST | 19 | Unit, regression, and E2E tests (48 total after removing duplicate tarball test) |

## Implementation phases

| Phase | Tasks | Max parallel agents | Critical-path duration |
|-------|-------|---------------------|------------------------|
| INFRA — Shared infrastructure setup | 4 | 2 (BE-02 and TEST-01 in parallel after BE-01) | 18 min |
| US-01 — Classify .claude/ files | 1 | 1 | 12 min |
| US-02 — Migrate test files to tests/ | 5 | 3 (BE-02, INFRA-01, INFRA-02 in parallel after BE-01) | 12 min |
| US-03 — Migrate runtime assets to src/claude/ | 2 | 1 (sequential) | 8 min |
| US-04 — Update npm packaging | 2 | 1 (sequential) | 14 min |
| US-05 — Asset catalog and installers | 8 | 4 (BE-01..05 and INFRA-01 mixed parallel groups) | 12 min |
| US-06 — Runtime asset resolution and CLI commands | 9 | 5 (BE-01..03 in parallel; TEST-01..05 in parallel) | 15 min |
| US-07 — Doctor resolution diagnostics | 2 | 1 (sequential) | 13 min |
| US-08 — Dev workflow and documentation | 9 | 5 (INFRA-02..06 and BE-01..02 mixed parallel groups) | 12 min |
| US-09 — Migration verification and regression tests | 6 | 5 (TEST-01..04 + TEST-06 in parallel, then TEST-07) | 12 min |

## Notes

- Human estimate sums all 48 task durations sequentially (~480 min total).
- Agent estimate uses the simplified model: max task duration per phase, summed across phases (118 min ≈ 2h unless parallel = ~126 min).
- US-09 reduced from 7 to 6 tasks after removing the duplicate npm-pack-comprehensive test (correction #4); US-04-TASK-TEST-01 merged to be the single comprehensive tarball test.
- No DB or FE tasks. All BE and INFRA tasks handled by developer-backend agent. All TEST tasks handled by developer-testing agent.
- Rework contingency (30% probability, 1 extra developer + 1 review per US): adds ~3 extra invocations in expectation (~1h additional).
- Token estimates in FTR-015-Token-Estimate.md.
