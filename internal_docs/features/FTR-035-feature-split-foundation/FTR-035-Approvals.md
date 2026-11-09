# Approval Record — FTR-035

## Gate 1 — Document Approvals

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| internal_docs/features/FTR-035-feature-split-foundation/req/index.md | ✅ Approved | 2026-11-03 | Approved with notes: 16 open validation gaps accepted (see below) |
| internal_docs/features/FTR-035-feature-split-foundation/spec/index.md | ✅ Approved | 2026-11-03 | Approved with notes: 16 open validation gaps accepted (see below) |
| FTR-035-Validation-Report.md | ✅ Approved | 2026-11-03 | 16 open gap(s) after 3 cycles, left for Gate 1 review |

**Docs Digest:** `sha256:9633ffd80e004bc0525dc4b11a00644910807efbea6b1d5f90b45fb42619c270`

## Accepted open validation gaps

The pm-phase1 validation ended with 16 gaps still open after 3 cycles. The reviewer accepted them
with the decisions and documentation debt below. The Work Breakdown must contain tasks that
implement these decisions; they are not reopened.

Decisions (close gaps 3, 4, 9, 10, 11, 12, 13, 15):
- Merged child (gap 3): its purpose is the two purposes joined with " / " and its Keywords are the
  union of both children's Keywords.
- dependsOn after a reorder or a removal (gap 4): an entry that names a removed child is rejected
  with an error. dependsOn is never rewritten automatically.
- Generated req/ and spec/ in the parent folder at an initial split (gap 9): the split is refused
  with PARENT_INVALID, as the Tech-Spec already does. Nothing is removed or moved.
- Meaning of "depends on" in BR-03 (gap 10): transitive. A later child satisfies BR-03 if it
  depends on the shared-foundation owner directly or through a chain of dependsOn. BR-03, UC-03 and
  UC-04 all state this rule.
- Feature ID in register (gap 11): read from the folder name (FTR-NNN-slug), not from the feature
  Summary or Feature ID section.
- Missing or empty Keywords, or a missing feature.md or Summary section, in register (gap 12):
  rejected with FEATURE_INVALID.
- UC-06 open cases (gap 13): no registry entry means the feature is treated as standalone; a
  Parent: line without Depends on: means a child with no recorded dependencies; Status epic without
  an epic.md is an error and the run stops; an unreadable REGISTRY.md is an error and the run stops.
- register on an existing entry (gap 15): an entry with status defined, completed or epic is left
  unchanged and not duplicated, and register exits 0 (as D-21 says). It never returns
  REGISTRY_STATUS for these statuses.

Documentation debt, fixed in implementation, with a test for each (gaps 1, 2, 5, 6, 7, 8, 14, 16):
- Requirements: make UC-01 E4 match AC-05 and drop the resolved open questions of UC-01 and UC-02
  (gaps 1, 2); state in UC-04, each with an error flow and an acceptance criterion, the refusal of a
  parent holding both feature.md and epic.md (PARENT_INVALID), the parent registry-status checks
  (Status defined for an initial split, Status epic for a late child), the refusal of a parent that is
  in progress or approved, and the pre-check for leftover .split-staging-* directories and
  REGISTRY.md.tmp-* files (STAGING_LEFTOVER) (gaps 5, 6, 7, 8).
- Tech-Spec: correct the Requirements references in Section 1 and Section 12 (gap 14), and document
  in components/feature-split.js.md that late mode always places the child last, that a non-empty
  dependsOn only sets the dependency IDs, and the link to BR-07 (gap 16).

## Amendment — 2026-11-04 (reviewer decision, gap 9)

The Gate 1 decision on gap 9 ("the split is refused with PARENT_INVALID if the parent holds generated
req/ and spec/") is replaced. It would make checkpoint 2 impossible, because checkpoint 2 always runs
when req/ and spec/ exist. The reviewer decided, in conversation:

- Applying a split to a parent that holds generated req/ and spec/ is allowed. They do not make the
  parent non-new (BR-15, AC-11).
- During the split, apply moves the parent's req/ and spec/ into a temporary backup inside the
  staging directory (.split-staging-<run id>/parent-backup/). On any failure the rollback restores
  them in place, byte for byte. After a successful split the backup is deleted with the staging
  directory, so the parent folder holds only epic.md (FTR-035 D-14).
- If deleting the staging directory fails after a successful split, the split stands and apply
  returns a warnings entry with the remaining path. It is not rolled back.

The Work Breakdown tasks US-04-TASK-BE-06, BE-10, BE-11, TEST-01 and TEST-04 implement and test this.
Six further inconsistencies found by the semantic validation of the Work Breakdown (error code names,
export checks, test expectations in INFRA-TASK-TEST-01, US-01-TASK-TEST-01 and US-04-TASK-TEST-01/07)
were corrected in the tasks with the same date.

## Gate 2 — Work Breakdown Approval

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| FTR-035-Work-Breakdown.md | ✅ Approved | 2026-11-04 | 55 tasks, 7 phases (approved with notes, see below) |

Approved with notes:

- US-03-TASK-BE-03 (foundationWarnings) must also warn when a later child does not depend on the
  shared-foundation owner, directly or through a chain of dependsOn (the transitive BR-03 rule
  decided at Gate 1, gap 10). The implementer adds it with a test; this is not reopened.
- I accept the corrections made by hand to the Work Breakdown after pm-phase2 produced it (tasks
  recorded in FTR-035-Approvals.md and the amendment of 2026-11-04): the parent req/ and spec/
  backup during a split, the error code set (ROLLBACK_FAILED, STAGING_LEFTOVER), register returning
  the existing status for defined, completed and epic, and the aligned test tasks.
- The first executor runs are a model comparison, not the delivery run: the first tasks are run on
  separate copies of the repository, with different agent models, to measure cost and quality. The
  full run of the 55 tasks starts only after I decide which models to use.

## Approval History

| Cycle | Action | Date | Details |
|-------|--------|------|---------|
| 1 | Approved with notes | 2026-11-03 | "Approve with notes — proceed to Work Breakdown." followed by the notes recorded above, verbatim |
| 2 | Amendment | 2026-11-04 | Gap 9 decision replaced: parent req/ and spec/ are moved into a temporary backup during the split and deleted after it (see the Amendment section) |
| 3 | Gate 2 approved with notes | 2026-11-04 | "Approve with notes — start implementation." followed by the notes recorded in the Gate 2 section, verbatim |

## Amendment 2026-11-06

Correction made by hand to the Work Breakdown during the executor run, after it blocked a task:

- US-04-TASK-BE-02: the third assertion of the second verification command expected `FTR-010`, which is the
  result of the first assertion's input (registry up to FTR-009). For its own input (folder FTR-005, registry
  FTR-002) the correct next ID is `FTR-006`. Both executor attempts returned `FTR-006` and were blocked by the
  wrong expectation. Only the expected value changed.
- US-06-TASK-TEST-01 (2026-11-06): the task's verification commands were written in ```bash fences, but the
  executor's parser only recognises bare ``` fences, so it read garbled commands (a bash syntax error) and
  blocked the task four times with the work itself correct. All three commands are now in bare fences; no command
  changed. (An intermediate edit that made the first one ```bash too did not help and is superseded.)
