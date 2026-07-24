# Effort Estimate — FTR-007 — Explicit Per-Agent Model Assignment

| Metric | Value |
|--------|-------|
| User Stories | 2 (US-01 ÷ US-02) |
| Total tasks | 3 (DB:0, BE:0, FE:0, INFRA:2, TEST:1) |
| Implementation phases | 2 |
| Human estimate | ~3h (sequential, no parallelism) |
| Agent estimate | ~13min (parallel dispatch, critical path only) |

## Domain breakdown

| Domain | Tasks | Notes |
|--------|-------|-------|
| DB | 0 | No runtime data model. |
| BE | 0 | No application backend. |
| FE | 0 | No UI. |
| INFRA | 2 | Two configuration-edit tasks (14 sonnet agents; 1 opus agent). |
| TEST | 1 | Acceptance verification via shell commands (AC-01..AC-06). |

## Implementation phases

| Phase | Tasks | Parallelism |
|-------|-------|-------------|
| Phase 1 — US-01 apply model assignment | 2 tasks (US-01-T01, US-01-T02) | 2 INFRA edits in parallel (independent files) |
| Phase 2 — US-02 verify | 1 task (US-02-T01) | Single TEST task, gates on Phase 1 |

## Notes

- Human estimate sums task durations sequentially with complexity mapping (S=~0.5h effective here, M=~1.5h): US-01-T01 (M) 1.5h + US-01-T02 (S) 0.25h + US-02-T01 (S) 0.5h ≈ 2.25h; rounded to ~3h to include review overhead.
- Agent estimate uses critical path: Phase 1 max(8min, 2min) = 8min + Phase 2 5min = ~13min. (Human/agent totals in the WB summary use ~15min including review dispatch.)
- This is a configuration-only feature; there is no build/compile step for runtime code. "Verification" = the acceptance grep/diff commands.
- Agent-concurrency assumption: US-01-T01 and US-01-T02 dispatched to the same backend developer as one batch (both INFRA, same file family), so real wall-clock ≈ single-agent Phase 1 duration.

---

## Actuals vs Estimate

> All tasks executed inline by the orchestrator within a single run (2026-07-24). Times below are wall-clock from process-log timestamps; the doc-generation and gate phases dominate wall-clock, while the code edits themselves were near-instant.

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Total wall-clock (agent) | ~13min | ~49min (incl. 2 approval gates waiting on user) | +36min |
| Phase 1 — US-01 apply model assignment | ~8min | <1min (batch edit of 15 files) | −7min |
| Phase 2 — US-02 verify | ~5min | <1min (grep/diff acceptance run) | −4min |

## Task-level actuals

| Task ID | Domain | Agent estimate | Actual | Delta |
|---------|--------|---------------|--------|-------|
| US-01-T01 | INFRA | ~8min | <1min | −7min |
| US-01-T02 | INFRA | ~2min | <1min | −1min |
| US-02-T01 | TEST | ~5min | <1min | −4min |

## Estimation accuracy

| Category | Tasks | Avg delta | Trend |
|----------|-------|-----------|-------|
| INFRA | 2 | −4min | under-target (faster) |
| TEST | 1 | −4min | under-target (faster) |

## Notes

- The pure edit + verify work was far faster than estimated: awk-based single-line frontmatter insertion across 15 files plus grep/diff verification completed in seconds. The estimates assumed conservative per-file manual editing.
- Total wall-clock is dominated by the two mandatory approval gates (user turn-around), not by execution — as expected for a hard-stop-gated pipeline.
- No rework cycles (review PASSED first pass, 0 issues).
