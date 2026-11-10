# Approval Record — FTR-036

## Gate 1 — Document Approvals

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| internal_docs/features/FTR-036-feature-split-definition-checkpoint/req/index.md | ✅ Approved | 2026-11-09 | Approved with notes (see below) |
| internal_docs/features/FTR-036-feature-split-definition-checkpoint/spec/index.md | ✅ Approved | 2026-11-09 | Approved with notes (see below) |
| FTR-036-Validation-Report.md | ✅ Approved | 2026-11-09 | 7 open gaps accepted with the decisions below |

**Docs Digest:** `sha256:ab716d0dbbbcac885900b9d07e691e1a67b98c9ffba26887f29a22ef37b4bc32`

Approved with notes. The user accepted the 7 open validation gaps with the decisions proposed by the validator, to be applied during implementation and not reopened:

1. A skipped feature (status skipped, feature not new) stops and writes nothing; the Requirements flow, postconditions and AC-03 follow the Tech-Spec.
2. check-definition is delivered by FTR-036, not by FTR-035; the UC-01 precondition names FTR-036.
3. In the grilling record a null count marks a signal as unevaluated; any other non-array value is RECORD_INVALID.
4. validate-proposal is added to the in-scope list and to the UC-02 edit flow.
5. The epic folder matches when its name equals the ID or starts with the ID followed by a hyphen, and it must contain epic.md.
6. The duplicate-child test is: slug equal to an epic.md child row, or an existing folder ending in -slug; AC-15 is tested that way.
7. The registry and folder state after a rejected failed apply, and the cleanup action, are defined in the Tech-Spec so the UC-02 reject postcondition can be verified.

## Approval History

| Cycle | Action | Date | Details |
|-------|--------|------|---------|
| 1 | Approved with notes | 2026-11-09 | "Approve with notes — proceed to Work Breakdown. Accept the 7 open validation gaps with the decisions proposed by the validator, to be applied during implementation, not reopened:" followed by the 7 decisions recorded above, verbatim |

## Amendment 2026-11-09 — hand corrections to the Work Breakdown

pm-phase2 produced 29 tasks in 4 phases (INFRA, US-01, US-02, US-03) and stopped at the semantic validation with 6 findings (no repair loop for them). The Work Breakdown was corrected by hand, task by task, before Gate 2. No Requirements or Tech-Spec text was changed.

| Finding | Decision |
|---------|----------|
| INFRA-TASK-TEST-01 expects flow trimming and boolean signals that INFRA-TASK-BE-01 does not return | Trimming test dropped; signal assertions use `.met` of `{ count, minimum, met }` |
| US-01-TASK-BE-03: skipped should continue to Phase 4 | **Kept as written**: the finding contradicts Gate 1 decision 1 (a skipped feature stops and writes nothing; the Requirements follow the Tech-Spec) |
| US-01-TASK-BE-05 covers work owned by other tasks | Narrowed to the `Mode: define` line, the proposal relay and view, the unevaluated note, the in-memory record and the root and RECORD_INVALID stops |
| US-02-TASK-BE-05 and BE-07: retry, edit and reject re-enter a branch whose guard refuses when feature.md exists | Explicit `decision: retry`; retry, an accept after an edit and reject after a failed apply skip the BR-04 guard and never rewrite the parent or call register again |
| US-03-TASK-BE-01 covers L4–L7 owned by BE-02 and BE-03 | Insert limited to L1–L3 and the mode preamble; the epic is matched by a folder named by the ID or by the ID and a hyphen (Gate 1 decision 5) |

Also by hand: one verification command that fails until the deliverable exists was added as the first command of the 10 tasks whose commands were only `npm test` or `npx jest` (they would have been skipped as "already satisfied"), with the exact describe title the test tasks must use; all verification commands use bare code fences, the only kind the executor parses.

## Gate 2 — Work Breakdown Approval

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| wbs/ (29 tasks, 4 phases: INFRA 6, US-01 7, US-02 9, US-03 7) | ✅ Approved | 2026-11-09 | "Approve — start implementation", on the Work Breakdown as corrected by hand (see the Amendment of 2026-11-09) |

## Approval History (Gate 2)

| Cycle | Action | Date | Details |
|-------|--------|------|---------|
| 2 | Approved | 2026-11-09 | "Approve — start implementation" |

## Amendment 2026-11-10

- US-01-TASK-BE-02: its ordering check used `indexOf('Phase 4')`, which matches an earlier mention in the body text (US-01-TASK-BE-01 wrote "see Mode write in Phase 4" before Phase 3a), so the check failed twice on correct work and blocked the task. The check now looks for the headings (`## Phase 3`, `## Phase 3a`, `## Phase 4`). Only that command changed; the task's work was verified and committed by hand before the run restarted.
- US-02-TASK-TEST-01 (2026-11-10): its verification (`test -f` on a file that US-01 had already created, then the whole test file, then `npm test`) was already satisfied, so the executor skipped the task without writing the tests it asks for. A first command that fails until the task's describe block exists was added, with the exact describe title; the task is redone. The check I ran on the Work Breakdown on 2026-11-09 judged each command against the tree of that day and missed this dependency on an earlier task's output.
