# Effort Estimate — FTR-002 — Assessment Pipeline Effort Estimation

| Metric | Value |
|--------|-------|
| User Stories | 4 (US-01 ÷ US-04) |
| Total tasks | 19 (INFRA: 1, BE: 18) |
| Implementation phases | 5 |
| Human estimate | ~26h 30min (sequential, no parallelism) |
| Agent estimate | ~2h 20min (parallel dispatch, critical path only) |

> Note: The Work Breakdown summary section (Section 1) reports 10 tasks; the task tables in Section 3 list 19 tasks (1 INFRA + 6+7+2+3 across US-01–US-04). Estimates here are derived from the Section 3 task-level detail, which is authoritative.

## Domain breakdown

| Domain | Tasks | Notes |
|--------|-------|-------|
| INFRA | 1 | Read and understand assessment-manager.md structure; no code changes |
| BE | 18 | All edits target .claude/agents/assessment-manager.md (agent definition changes) |
| FE | 0 | Not applicable — no UI components |
| TEST | 0 | No automated test tasks; manual verification described in Tech-Spec §10 (deferred per WB Open Point 5) |

## Implementation phases

| Phase | Tasks | Parallelism |
|-------|-------|-------------|
| Phase 1 — Shared Infrastructure | 1 task (INFRA-T01) | 1 agent sequential |
| Phase 2 — US-01: Write Effort Estimate File at Phase 3 | 6 tasks (US-01-T01 to T06) | 1 developer-backend agent; tasks executed in dependency order within the call |
| Phase 3 — US-02: Append Intervention Row and Finalize Remediation at Phase 4 | 7 tasks (US-02-T01 to T07) | 1 developer-backend agent |
| Phase 4 — US-03: Display Remediation Effort Summary at Gate | 2 tasks (US-03-T01 to T02) | 1 developer-backend agent |
| Phase 5 — US-04: Remove Phases 6/7 and Replace with Summary | 3 tasks (US-04-T01 to T03) | 1 developer-backend agent; runs in parallel with Phases 2–4 (depends on Phase 1 only) |

## Task-level detail

| Task ID | Domain | Complexity | Human Est. | Agent Est. | Description |
|---------|--------|------------|-----------|-----------|-------------|
| INFRA-T01 | INFRA | S | 30min | 5min | Read assessment-manager.md, map Phase 3/4/5/6/7 structure |
| US-01-T01 | BE | M | 2h | 10min | Implement process log timestamp reading logic |
| US-01-T02 | BE | S | 1h | 5min | Implement batch wall-clock computation |
| US-01-T03 | BE | S | 1h | 5min | Implement est_duration logic (N/A on first run) |
| US-01-T04 | BE | S | 45min | 5min | Implement delta computation for Phase 3 agents |
| US-01-T05 | BE | M | 3h | 15min | Create Effort Estimate file template with Phase 3 section |
| US-01-T06 | BE | S | 1h | 5min | Implement Phase 3 file write and process log entry |
| US-02-T01 | BE | S | 1h | 5min | Extract intervention-documentation-standard timestamps |
| US-02-T02 | BE | S | 1h | 5min | Append intervention-documentation-standard row |
| US-02-T03 | BE | S | 1h | 5min | Update assessment phase subtotal table |
| US-02-T04 | BE | M | 1h 30min | 8min | Read Interventions Index and extract severity counts |
| US-02-T05 | BE | S | 1h | 5min | Compute per-severity remediation effort subtotals |
| US-02-T06 | BE | M | 2h | 10min | Build and insert remediation section |
| US-02-T07 | BE | S | 1h | 5min | Validate and log Phase 4 completion |
| US-03-T01 | BE | S | 45min | 5min | Extract remediation section from Effort Estimate file |
| US-03-T02 | BE | M | 2h | 10min | Present remediation effort summary in gate display |
| US-04-T01 | BE | M | 2h | 10min | Locate and remove Phase 6 (Remediation Implementation) |
| US-04-T02 | BE | S | 1h | 5min | Locate and remove Phase 7 (Pull Request Creation) |
| US-04-T03 | BE | M | 3h | 15min | Create and insert Phase 6 Summary section |

## Notes

- Complexity scale used by WB agent: S=small (<1h), M=medium (1–4h), L=large (4–8h). Human estimates are granular (not the simplified 2h/4h/8h rule), derived from WB task descriptions.
- Agent estimate uses critical path: INFRA (5min) → US-01 dev+review (45+10=55min) → US-02 dev+review (43+10=53min) → US-03 dev+review (15+10=25min) = 138min ≈ 2h 20min. US-04 (30+10=40min) runs in parallel after Phase 1 and does not extend the critical path.
- All tasks target a single file: `.claude/agents/assessment-manager.md`. No new source files are created.
- No rework cycles are planned; the rework contingency is captured in the token estimate (30% probability, 1 extra dev+review per US).
- TEST tasks are deferred; no automated test suite is required for agent definition changes.
