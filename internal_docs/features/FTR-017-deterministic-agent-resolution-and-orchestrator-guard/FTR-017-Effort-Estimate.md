# Effort Estimate — FTR-017 — Deterministic Agent Resolution and Orchestrator Guard

## Summary

| Metric | Value |
|--------|-------|
| User Stories | 13 |
| Total tasks | 58 (BE: 45, FE: 0, DB: 0, INFRA: 0, TEST: 13) |
| Implementation phases | 14 |
| Human estimate | ~51h 40min (sequential, no parallelism) |
| Agent estimate | ~12h 55min (parallel dispatch, critical path only) |

## Per-Phase Breakdown

| Phase | Title | Tasks | Domains | Est. Human | Est. Agent | Actual Human | Actual Agent |
|-------|-------|-------|---------|-----------|-----------|-------------|-------------|
| INFRA | Shared plumbing (SHA-256 hashing and ledger metadata) | 3 | BE | ~2h 28min | ~37min | — | — |
| US-01 | Resolve Toolkit Agent Identity (Diagnostic Mode) | 4 | BE, TEST | ~4h 12min | ~1h 3min | — | — |
| US-02 | Resolve Toolkit Agent Identity (Operational Mode with Verification) | 2 | BE, TEST | ~1h 56min | ~29min | — | — |
| US-03 | Verify Agent Preflight Before Pipeline Start | 2 | BE, TEST | ~1h 56min | ~29min | — | — |
| US-04 | Dispatch Workflow with Tier 1 Guard (Skill-Level Identity Tracking) | 3 | BE, TEST | ~3h 0min | ~45min | — | — |
| US-05 | Dispatch Worker Agent with Tier 2 Guard (Workflow-Level Resolution) | 3 | BE, TEST | ~2h 44min | ~41min | — | — |
| US-06 | Workflow Self-Registration in Execution Ledger (Tier 3) | 2 | BE, TEST | ~1h 56min | ~29min | — | — |
| US-08 | Diagnostic Agent Status Report (doctor agents) | 2 | BE, TEST | ~2h 8min | ~32min | — | — |
| US-09 | Cleanup Stale Toolkit Assets (Dry-Run Only) | 2 | BE, TEST | ~1h 36min | ~24min | — | — |
| US-10 | Handle Agent Name Collision (Observable Scopes) | 2 | BE, TEST | ~2h 0min | ~30min | — | — |
| US-11 | Transition Agent Names (Phase A: Legacy Registration) | 3 | BE, TEST | ~2h 56min | ~44min | — | — |
| US-12 | Transition Agent Names (Phase B: Atomic Per-Agent Rename) | 26 | BE, TEST | ~21h 20min | ~5h 20min | — | — |
| US-13 | Handle Hash Mismatch on Installed File | 2 | BE, TEST | ~1h 32min | ~23min | — | — |
| US-14 | Manage Ledger Metadata Through Dispatch Lifecycle | 2 | BE, TEST | ~1h 56min | ~29min | — | — |
| **Total** | | **58** | | **~51h 40min** | **~12h 55min** | **—** | **—** |

## Notes
- Agent estimate is the sum of each task's `estimate.agentMinutes` from the Work Breakdown JSON (775 min total); per-phase figures are the sum of that phase's task minutes.
- Human estimate applies a 4× factor to the agent minutes (sequential execution with no parallelism).
- US-12 is large because Phase B contains one atomic rename task per toolkit agent (21 renames) plus the legacy-reference removal, legacy `agent_type` mapping, a Phase A completion gate (BR-13), the Phase B completion gate, and the regression-test task; renames are not merged, per the atomic-rename requirement.
- US-06 provides explicit UC-06 (Tier 3 workflow self-registration) coverage; its tasks carry no directly-associated AC (the Requirements AC table maps no AC to UC-06), so they use empty `acceptanceCriteria`, mirroring the INFRA phase.
- Actual Human: filled in if a human developer performed or reviewed the implementation.
- Actual Agent: filled in by pm-phase3 after implementation completes.
