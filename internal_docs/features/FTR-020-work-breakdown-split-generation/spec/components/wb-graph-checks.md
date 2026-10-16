# `src/claude/scripts/wb-graph-checks.js` — New

**Related Open Questions:** OQ-02 (see [index.md](../index.md#2-resolution-of-open-questions))

**Addresses:** AC-02, AC-08, AC-09 (see [req/index.md](../../req/index.md#6-acceptance-criteria))

## Change

Pure functions for the 11 skeleton-answerable checks, each taking a plain `{ phases, tasks }`-
shaped structure (or, for AC checks, also an `acMap` from `parseAcTable`) and returning an array
of error/warning objects in the same shape `wb-validate.js` already pushes into its
`report.errors`/`report.warnings`. No file I/O, no `process.exit` — pure and independently
unit-testable.

## Decision (OQ-02): extraction strategy

Extract the 10 of 23 `wb-validate.js` checks that are answerable from skeleton-only fields —
checks 3 (unique IDs), 5 (ID format), 6 (domain whitelist), 7 (agentType whitelist),
8 (dependency existence), 9 (self-dependency), 10 (phase ID consistency), 11 (task cycle),
12/13 (phase dependency projection + cycle), 14 (phase schedulability), 19/20/21 (AC
existence/scope/Must-coverage) — into this module, exporting one function per check plus
`parseAcTable`/`splitTableRow` (already pure, just relocated). `wb-validate.js` is edited to
`require('./wb-graph-checks')` and call these functions instead of its current inline code for
those specific checks; checks 4, 15, 16, 17, 18, 22, 23 (which need per-task detail: required
field presence including `verification.commands`, duration bands, empty verification/commit/
grouping-rationale content, text-field character validation, empty-phase detection) remain
inline in `wb-validate.js`, unchanged. This is a behavior-preserving extraction:
`wb-validate.js`'s JSON report output and exit codes must be byte-identical before and after,
verified by running the existing test fixtures against both versions (see Tests below).

The new skeleton pre-check step in `pm-phase2.js` (see
[pm-phase2.md](pm-phase2.md)) imports the same functions directly and calls the ones that apply
to the skeleton shape (all 11 of them — the skeleton carries every field those checks need:
`id`, `domain`, `agentType`, `dependsOn`, `acceptanceCriteria`, phase `id`/`type`).

## Tests

`wb-graph-checks.test.js`: each of the 11 extracted functions, unit-tested directly against both
a skeleton-shaped and a full-task-shaped input (same inputs `wb-validate.test.js` presumably
already uses for checks 3/5–14/19–21 — reuse those fixtures).
