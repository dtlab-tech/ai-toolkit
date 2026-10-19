# tests/integration/workflow-runtime.test.js — Modified

## Change

New/updated test cases covering every call site `pm-phase2.js`'s component changes: the Gate 1
digest in-memory recomputation, the three repointed script call sites, the removed bridge step, and
the per-task Tech-Spec excerpt (matched and fallback cases) — each exercised for both a real-split-
source feature fixture and a legacy monolithic-only feature fixture, mirroring the existing
`describe` blocks FTR-025 added for its own bridge-step tests (`'pm-phase2 — bridge step (real
split sources)'` / `'... (legacy, no split sources)'`), which this feature's tests replace/extend
rather than duplicate.

## Algorithm

Test additions, grouped by what they assert:

1. **Gate 1 digest parity:** build a real `req/`+`spec/` fixture, run `pm-phase1`'s own digest
   computation and `pm-phase2`'s new in-memory recomputation against the identical fixture, assert
   equal hashes — same "digest parity" assertion style FTR-025's own Risk #1 mitigation already
   established for the bridge step it replaces.
2. **Script call-site arguments:** spy on `c.command()` (same mock-dispatch mechanism already used
   throughout this file) and assert the `wb-skeleton-check.js`/`wb-validate.js`/`ac-task-matrix.js`
   invocations receive `reqIndexPath`/`specIndexPath` for a real-split fixture, and the legacy
   `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` paths for a legacy fixture.
3. **Semantic validator prompt:** assert the mock dispatch for
   `gaia.agent.planner.validate-work-breakdown` receives `reqIndexPath` as the prompt's second line.
4. **Per-task excerpt — matched case:** a task whose `acceptanceCriteria` includes an AC cited by
   exactly one component's `Addresses` column receives a prompt whose Tech-Spec section contains
   only that component's own body, not any other component's.
5. **Per-task excerpt — fallback case:** a task whose `acceptanceCriteria` matches no component's
   `Addresses` column receives the full Section 9 Components table as its Tech-Spec section instead
   of an empty one.
6. **Bridge step removed:** assert `'bridge-requirements-tech-spec'` no longer appears in
   `c.tokenLedger`'s activity-name list for a real-split-source run, and that no
   `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` file is written to the fixture's feature
   directory by `pm-phase2` at all.
7. **Legacy fallback, end to end:** a feature fixture with monolithic files only, no `req/`/`spec/`,
   still completes `pm-phase2` successfully, with every one of the above call sites receiving the
   legacy monolithic path, unchanged from pre-FTR-026 behavior.

## Tests

This component *is* the test file — no further test file covers it. Existing FTR-025-era tests whose
assertions this feature's changes make obsolete (e.g. any assertion that
`file('Requirements.md')`/`file('Tech-Spec.md')` is passed to `wb-skeleton-check.js`/`wb-validate.js`/
`ac-task-matrix.js` for a real-split-source fixture, or that the `bridge-requirements-tech-spec`
activity exists at all) are updated in place, not left alongside the new ones, to avoid two
contradictory assertions coexisting in the suite.
