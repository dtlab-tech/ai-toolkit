# Effort Estimate — FTR-012 — Installer Bash Allowlist

## Summary

| Metric | Value |
|--------|-------|
| User Stories | 5 |
| Total tasks | 17 (BE:9, INFRA:4, TEST:4) |
| Implementation phases | 6 |
| Human estimate | ~22.5h (sequential, no parallelism) |
| Agent estimate | ~95min (parallel dispatch, critical path only) |

## Per-Phase Breakdown

| Phase | Title | Tasks | Domains | Est. Human | Est. Agent | Actual Human | Actual Agent |
|-------|-------|-------|---------|-----------|-----------|-------------|-------------|
| 1 | Shared Infrastructure | 4 | INFRA | ~5.5h | ~37min | — | done (agent) |
| 2 | US-01: Fresh Installation with Allowlist Opt-In | 5 | BE, INFRA, TEST | ~7h 20min | ~51min | — | done (agent) |
| 3 | US-02: Merge Allowlist into Existing Settings | 4 | BE, TEST | ~6h | ~40min | — | done (agent) |
| 4 | US-03: Ask-Beats-Allow Conflict Resolution | 2 | BE, TEST | ~4.5h | ~25min | — | done (agent) |
| 5 | US-04: Reinstall with Idempotent Merge | 1 | TEST | ~1.5h | ~10min | — | done (agent) |
| 6 | US-05: .gitignore Creation and Idempotent Update | 3 | BE, INFRA, TEST | ~3.5h | ~25min | — | done (agent) |
| **Total** | | **17** | | **~22.5h** | **~95min** | **—** | **6/6 done** |

## Notes
- Human estimate assumes sequential execution with no parallelism.
- Agent estimate assumes parallel dispatch of independent tasks within each phase (critical path only).
- Actual Human: filled in if a human developer performed or reviewed the implementation.
- Actual Agent: filled in by pm-phase3 after implementation completes.

---

## Implementation Summary

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Implementation phases | 6 | 6 |
| Issues fixed | — | 0 |
| Issues deferred | — | 0 |
