# Approval Record — FTR-017

## Gate 1 — Document Approvals

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| FTR-017-Requirements.md | ✅ Approved | 2026-09-04 | Revised to fold Given/When/Then into the wb-validate AC format; 42 ACs, ledger lifecycle, local/global manifest resolution, diagnostic contract corrected |
| FTR-017-Tech-Spec.md | ✅ Approved | 2026-09-04 | Realigned to real FTR-015/FTR-016 contracts (readManifest/writeManifest signatures, ledger path, hash re-read, cleanup, static/E2E tests) |
| FTR-017-Validation-Report.md | ✅ Approved | 2026-09-04 | Regenerated (real verification): 42 AC/UC mapping, wb-validate parser evidence, dispatch/self lifecycle, local/global resolution, Requirements↔Tech-Spec consistency, gap-by-gap resolution |

**Approval note (2026-09-04):** feature.md approved earlier and frozen (not modified across the Gate-1 revision cycles). Requirements/Tech-Spec/Validation-Report confirmed aligned to the approved feature.md and to the real FTR-015 and FTR-016 contracts. AC table independently verified to parse under `wb-validate.js` (42 Must ACs recognized, no format/token errors). Proceed to Work Breakdown generation + validation only; STOP at Gate 2 before any implementation.

## Gate 2 — Work Breakdown Approval

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| FTR-017-Work-Breakdown.md | ✅ Approved with notes | 2026-09-04 | 58 tasks, 14 phases, 13 User Stories; wb-validate valid:true / 0 errors; semantic valid:true / 0 findings; 42/42 ACs, 14/14 Must UCs, BR-13 enforced via checkpoint dependency |

**Approval note (2026-09-04) — Gate 2 "Approvo con note — avvia l'implementazione". Binding execution conditions:**
- Task-by-task, `maxConcurrency: 1`, respecting dependencies; NO grouping by agent type.
- Per task: open a ledger activity BEFORE the work; verify the output; update status; atomic commit of ONLY the relevant files. Record observable time and tokens; unavailable values stay `null` (no estimates passed off as actuals).
- Preserve ALL ledger history, including failures and rework.
- The 21 Phase-B renames start ONLY after the Phase-A completion checkpoint (US-12-TASK-BE-25) is done and green.
- Do NOT modify the approved documents (feature.md, Requirements, Tech-Spec, Validation-Report, Work-Breakdown) and do NOT expand scope autonomously.
- Proceed without asking confirmation for each change/task; stop only at defined gates, for real blockers, or for out-of-scope decisions.
- NO push, PR, or merge without subsequent authorization.
- The 22-minute task (US-01-TASK-BE-01) duration warning is accepted with the stated rationale (indivisible resolution core).

## Approval History

| Cycle | Action | Date | Details |
|-------|--------|------|---------|
| 1 | Request changes (Gate 1) | 2026-09-04 | 10 blocking corrections to Requirements/Tech-Spec/Validation-Report: AC table format for wb-validate, ledger lifecycle + self-entry, local/global manifest resolution, diagnostic contract vs AC-05, cleanup algorithm, real manifest APIs, hash re-read, pointed Tech-Spec fixes, assessment/static-test scope, real Validation Report |
| 2 | Approved (Gate 1) | 2026-09-04 | "Approvo — procedi al Work Breakdown." Documents aligned to approved feature.md and to real FTR-015/FTR-016 contracts; no open blockers |
| 3 | Request changes (Gate 2) | 2026-09-04 | Work Breakdown remediation #1: 98 wb-validate errors (75 ac_wrong_us via UC↔AC phase realignment, 21 missing groupingRationale, 2 uncovered Must ACs); 32→55 tasks |
| 4 | Request changes (Gate 2) | 2026-09-04 | Work Breakdown remediation #2: restore UC-06 self-registration (new US-06) + UC-07 traceability; enforce BR-13 via Phase-A checkpoint dependency; replace 17 invalid `npx tsc --noEmit` with node --check + behavioral tests; 55→58 tasks |
| 5 | Approved with notes (Gate 2) | 2026-09-04 | "Approvo con note — avvia l'implementazione." Binding task-by-task execution conditions (see note above) |
