# tests/pm-phase1-ac-traceability.test.js — New

## Change

Added during implementation, not originally planned at Tech-Spec time: a direct, deterministic
unit test of `computeAcComponentTraceabilityGaps()` (pm-phase1.js), using the same "hand-synced
mirror + source-text guard" pattern already established by `tests/pm-phase1-req-resume.test.js`
(the sandboxed workflow runtime has no `require()`, so the real function cannot be imported
directly). Covers both traceability directions — orphan AC, and a component referencing a
nonexistent AC-ID — the latter discovered, while writing the end-to-end integration test, to be
unreachable through a real pipeline run: `tech-spec-ac-check` (FTR-023) already hard-rejects a
dangling AC reference at Tech-Spec generation time, before the validation step this feature
modifies is ever reached.

## Algorithm

A local `computeAcComponentTraceabilityGaps(acIdsList, components)` mirrors the real function's
exact algorithm (AC-ID `Set`, per-component `addresses` split/trim/filter, both-direction finding
construction), plus a source-text guard asserting `pm-phase1.js` still contains the function's
real signature and both finding-construction lines, and the merge's
`const mergedValid = mergedFindings.length === 0` line — so the mirror and the real merge-logic
refinement (see `components/pm-phase1.js.md`'s own "Implementation refinement" note) cannot
silently drift from the real script unnoticed.

Six cases: an orphan AC with no addressing component; a component addressing a nonexistent AC;
both conditions firing together; a dash (`—`) Addresses value never treated as a real reference;
a fully-matched one-to-one case producing zero findings; two components addressing the same AC
producing no (duplicate) orphan finding.

## Tests

This component *is* the test file — no further test file covers it.
