# Procedure: Effort Estimation

Write `{PREFIX}-Effort-Estimate.md` in the feature directory after Work Breakdown is generated (before the WB approval gate). Append actuals at the end of the pipeline.

## Estimate template

```markdown
# Effort Estimate — {PREFIX} — {Feature Title}

| Metric | Value |
|--------|-------|
| User Stories | N (US-01 ÷ US-NN) |
| Total tasks | N (DB:N, BE:N, FE:N, INFRA:N, TEST:N) |
| Implementation phases | N |
| Human estimate | ~Nh (sequential, no parallelism) |
| Agent estimate | ~Nh Nmin (parallel dispatch, critical path only) |

## Domain breakdown

| Domain | Tasks | Notes |
|--------|-------|-------|
| DB | N | ... |
| BE | N | ... |
| FE | N | ... |
| INFRA | N | ... |
| TEST | N | ... |

## Implementation phases

| Phase | Tasks | Parallelism |
|-------|-------|-------------|
| Phase 1 — {name} | N tasks | N agents in parallel |
| Phase 2 — {name} | N tasks | N agents in parallel |

## Notes

Estimation assumptions (average task duration, agent concurrency limits, etc.).
```

## Estimation rules

- **Human estimate**: sum all task durations sequentially. Complexity: simple=2h, medium=4h, complex=8h
- **Agent estimate**: critical path only — max task duration per phase, summed across phases (parallel dispatch within phase)

## Actuals template (appended at pipeline end)

```markdown
---

## Actuals vs Estimate

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Total wall-clock (agent) | ~Xh Ymin | Xh Ymin | ±Zmin |
| Phase 1 — {name} | ~Xmin | Xmin | ±Zmin |
| Phase 2 — {name} | ~Xmin | Xmin | ±Zmin |

## Task-level actuals

| Task ID | Domain | Agent estimate | Actual | Delta |
|---------|--------|---------------|--------|-------|
| INFRA-T01 | INFRA | ~Xmin | Ymin | ±Zmin |
| US-01-T01 | BE | ~Xmin | Ymin | ±Zmin |

## Estimation accuracy

| Category | Tasks | Avg delta | Trend |
|----------|-------|-----------|-------|
| DB | N | ±Xmin | over/under/on-target |
| BE | N | ±Xmin | over/under/on-target |
| FE | N | ±Xmin | over/under/on-target |
| INFRA | N | ±Xmin | over/under/on-target |
| TEST | N | ±Xmin | over/under/on-target |

## Notes

Which tasks took longer than expected and why.
```

## Actuals rules

- Round times to the nearest minute
- Delta: negative = faster than estimated, positive = slower
- Trend: over-target if avg delta > +15%, under-target if < -15%, otherwise on-target
- Include total time across all rework attempts for reworked tasks
- If the process log has gaps, note them and exclude affected tasks from accuracy stats
