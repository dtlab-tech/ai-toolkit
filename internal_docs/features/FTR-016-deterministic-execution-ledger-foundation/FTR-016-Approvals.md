# Approval Record — FTR-016

## Gate 1 — Document Approvals

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| FTR-016-Requirements.md | ✅ Approved | 2026-08-28 | — |
| FTR-016-Tech-Spec.md | ✅ Approved | 2026-08-28 | — |
| FTR-016-Validation-Report.md | ✅ Approved | 2026-08-28 | — |

## Gate 2 — Work Breakdown Approval

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| FTR-016-Work-Breakdown.md | ✅ Approved with notes | 2026-09-03 | 40 tasks, 12 phases, 11 User Stories; 27/27 Must ACs covered; structural + semantic validation passed |

**Approval notes (2026-09-03):** Implementation to start only after two checkpoints — (1) atomic renderer commit `b696c12` *(done)*, (2) documentary checkpoint of Gate 1/Gate 2 artifacts + ledger, with no `FTR-016-Work-Breakdown.json`. Binding implementation mode: **task-by-task, maxConcurrency = 1**, one task ID per agent invocation, no per-phase grouping/commits; per task — verify deps → record start in ledger → execute the single task → run its verification commands separately → on pass record `done` + observed tokens + timestamp → immediately create the task's atomic commit (task changes + ledger update) → only then advance. On failure: record `failed` + cause, stop (HARD STOP), never rewrite ledger history, never substitute unavailable tokens with zero. Ledger bootstrap: keep the current tracking mechanism until the FTR-016 facade task is implemented + verified, then switch to `ai-toolkit ledger …` at a clean task boundary (no retroactive migration). No push/PR/merge without explicit authorization.

## Approval History

| Cycle | Action | Date | Details |
|-------|--------|------|---------|
| 1 | Request changes | 2026-08-28 | 10 corrections to Requirements, Tech-Spec, Validation Report (incl. Validation Report regenerated to v2.0) |
| 2 | Request changes | 2026-08-28 | 5 surgical corrections: invocable `resolve-features-root` + grammar; legacy-token contradiction; lock-creation crash recovery; 128-bit collision-resistant operation_id; Validation Report → v2.1 |
| 3 | Request changes | 2026-08-28 | 6 editorial corrections removing superseded wording (Check 2 orphan branch; Check 3 title + sha256_128; corrections-table row 5; Impl-Order step 1 orphan path; Q-5 invocable command; AC-25 terminology) |
| 4 | Approved | 2026-08-28 | "Approve — proceed to Work Breakdown" — feature.md not modified across all cycles |
| 5 | Request changes (Gate 2) | 2026-09-02 | Verification commands corrupted by sanitizeField — renderer hotfix `b57e06c`; lossless recovery of the semantically-validated JSON |
| 6 | Request changes (Gate 2) | 2026-09-03 | MD must be authoritative (all fields); JSON must be deleted (not a deliverable); split US-05-TASK-TEST-01 into resolution (AC-27) + installer (AC-22) tasks |
| 7 | Approved with notes (Gate 2) | 2026-09-03 | "Approve with notes — start implementation only after the following checkpoints." 40 tasks; renderer commit + documentary checkpoint; binding task-by-task mode (see notes above) |
