# Approval Record — FTR-037

## Gate 1 — Document Approvals

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| internal_docs/features/FTR-037-feature-split-measured-checkpoint/req/index.md | ✅ Approved | 2026-11-11 | Approved with notes (see below) |
| internal_docs/features/FTR-037-feature-split-measured-checkpoint/spec/index.md | ✅ Approved | 2026-11-11 | Approved with notes (see below) |
| FTR-037-Validation-Report.md | ✅ Approved | 2026-11-11 | 7 open gaps accepted with the decisions below |

**Docs Digest:** `sha256:574996283ecfcb12231dbc76d9d95f8e7f406bc4bd4726334d195095ac6dd91f`

Approved with notes. The user accepted the 7 open validation gaps with the decisions proposed, to be applied during implementation and not reopened:

1. The child grouping rule (contiguous use-case blocks in ID order) and the component-to-depth-0 build-order mapping (exact Path substring match against a depth-0 Section 11 item) of Tech-Spec T-6 and T-7 are recorded in the Requirements as BR-10, BR-11, AC-10, AC-14 and AC-15; Open Questions 1 and 2 are closed.
2. The case where U < minChildren returns status "unavailable"; it is added to the UC-01 and UC-02 error flows, to BR-03 and to the Section 4.2 reason list.
3. The UC-01 precondition follows BR-12: a feature folder that does not exist yet is new.
4. An acceptance criterion in Given/When/Then format covers the derivation of each child's Keywords (title, use cases, components) and of its Summary.
5. An acceptance criterion covers feature.md D-06: the proposal prompt and the apply call run in the implement-feature main loop and never inside the pm-phase1 workflow.
6. The stale open-question text in the UC-01, UC-02 and UC-03 postconditions is removed or marked resolved.
7. The Tech-Spec follows feature.md D-01 and Requirements BR-05 and AC-07: one component table, the New and Modified file rows are not added; option (A) and the pending choice between A, B and C are removed from the Tech-Spec. feature.md and the Requirements do not change on this point.

## Approval History

| Cycle | Action | Date | Details |
|-------|--------|------|---------|
| 1 | Approved with notes | 2026-11-11 | "Approve with notes — proceed to Work Breakdown. Accept the 7 open validation gaps with the decisions proposed, to be applied during implementation, not reopened:" followed by the 7 decisions recorded above, verbatim |

## Amendment 2026-11-11 — hand corrections to the Work Breakdown

pm-phase2 produced 29 tasks in 3 phases (US-01 12, US-02 10, US-03 7). It stopped twice before Gate 2, and the Work Breakdown was corrected by hand, task by task. No Requirements or Tech-Spec text was changed.

- Structural validation: US-01-TASK-BE-01 wrote `Verification commands:` without the bold marker, so the parser found no command. The marker is fixed. The code of the task also tested `!isNewFeature(...)`, but `isNewFeature` returns `{ isNew, reason }` and never a boolean, so a feature that is not new would never have been skipped; it now reads `.isNew`.
- Semantic validation, 4 findings:

| Finding | Decision |
|---------|----------|
| US-01-TASK-BE-08 calls `parseSplitCheck(stdout, exitCode)` but BE-07 defines `parseSplitCheck(result)` | BE-08 passes the whole result object |
| US-01-TASK-TEST-03 expects `split-proposed`, which only exists after the grouping and foundation rules of US-02-TASK-BE-01 to BE-03 | The three split-proposed cases move to US-02-TASK-TEST-02; TEST-03 keeps passed, unavailable precedence, exit codes and the key set for passed |
| US-02-TASK-BE-01 has no child count formula ("stop if not found") | The formula is Tech-Spec T-6 step 2 (recorded in the Requirements by Gate 1 decision 1): N = max(minChildren, ceil(count / threshold)) over the over-threshold counts, then min(N, U) |
| US-02-TASK-BE-07 duplicates the accept and reject outcomes that US-03-TASK-BE-01, BE-02 and BE-05 own | Kept as one sentence per outcome plus the no-write guarantees (AC-13); the details are explicitly left to the US-03 tasks |

- Also by hand: US-01-TASK-BE-06 referred to the open gaps that Gate 1 decision 1 closed (scope note rewritten); one verification command that fails until the deliverable exists was added as the first command of 18 tasks whose commands were only `node --check`, `npx jest` or `npm test` (they would have been skipped as "already satisfied"), with the exact describe title the test tasks must use; US-01-TASK-TEST-02 states that T-2 is decided (Gate 1 decision 7: one component table); all verification commands use bare code fences.

## Gate 2 — Work Breakdown Approval

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| wbs/ (29 tasks, 3 phases: US-01 12, US-02 10, US-03 7) | ✅ Approved | 2026-11-11 | "Approve with notes — start implementation", on the Work Breakdown as corrected by hand (see the Amendment of 2026-11-11) |

Approved with notes:

- The Gate 1 decisions stay as recorded: the Requirements and the Tech-Spec text are not rewritten, the tasks implement the decisions (one component table, the T-6 child count formula, unavailable when U < minChildren, parent values and Keywords as decided).
- The split-proposed test cases live in US-02-TASK-TEST-02, because split-proposed needs the grouping and foundation rules of US-02-TASK-BE-01 to BE-03.
- A phase closed by the already-satisfied check, or a task blocked by an environment error, gets a whole-branch review at the end; a stop for a missing claude.exe or a blocked ai-toolkit must not consume task attempts.

## Approval History (Gate 2)

| Cycle | Action | Date | Details |
|-------|--------|------|---------|
| 2 | Approved with notes | 2026-11-11 | "Approve with notes — start implementation, on the Work Breakdown as corrected by hand (see the Amendment of 2026-11-11 in FTR-037-Approvals.md). Notes:" followed by the 3 notes recorded above, verbatim |
