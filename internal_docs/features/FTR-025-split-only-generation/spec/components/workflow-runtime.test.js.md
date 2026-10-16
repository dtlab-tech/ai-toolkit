# tests/integration/workflow-runtime.test.js — Modified

## Change

Updates every existing `pm-phase1`/`pm-phase2` test whose fixtures or assertions assumed
`{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` are written automatically, plus new tests for
the behavior this feature introduces. The existing dispatch mocks (`phase1Dispatch`,
`techSpecSkeletonDoc`, etc.) stay structurally the same — only what the host does with their
output changes.

## Service Interface

Test-level changes (not production code — described as behavioral assertions, since this file has
no exported interface of its own):

- **Existing tests updated:** every assertion of the shape
  `fs.readFileSync(path.join(f.dir, 'FTR-099-Requirements.md'), ...)` or
  `fs.existsSync(path.join(f.dir, 'FTR-099-Tech-Spec.md'))` immediately after a `pm-phase1` run is
  removed or inverted (`.not.toBe(true)`) — these files are no longer written by `pm-phase1`.
  Assertions that previously read the assembled file's *content* to check a property (e.g. section
  completeness) are redirected to read `req/index.md`/`spec/index.md` instead, where the same
  content is now authoritative.
- **New: "pm-phase1 never writes the assembled Requirements/Tech-Spec files"** — a full clean run,
  then assert neither file exists on disk.
- **New: "the Gate 1 validator's prompt contains the inlined Requirements/Tech-Spec text"** —
  mock dispatch for `gaia-validate-feature-docs` inspects `options.prompt` for the expected
  `Requirements:`/`Tech-Spec:` labeled content matching the real split-source fixtures.
- **New: "docs_digest is unchanged in format and still content-sensitive"** — extends the existing
  `docs_digest` test (`/^sha256:[a-f0-9]{64}$/`, deterministic, changes with content) to confirm it
  is now computed from split-source content, by editing a `req/use-cases/UC-01.md` fixture file
  directly (not the removed assembled file) and confirming the digest changes.
- **New: "pm-phase2 bridges Requirements/Tech-Spec from split sources before its own Gate 1 check"**
  — a feature with real `req/`+`spec/` fixtures and an approved Gate 1 (digest computed the same
  way `pm-phase1` now computes it) — run `pm-phase2`, assert `{PREFIX}-Requirements.md`/
  `{PREFIX}-Tech-Spec.md` now exist and match what `loadRequirements`/`loadTechSpec` would produce,
  and that `wb-skeleton-check.js`/`wb-validate.js`/the semantic validator/`ac-task-matrix.js`/
  `gaia-generate-work-breakdown` all still receive and successfully use them.
- **New: "pm-phase2 bridge step is a no-op for a legacy feature"** — pre-existing monolithic
  `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` fixtures, no `req/`/`spec/` directories; run
  `pm-phase2`; assert the pre-existing files are untouched (same mtime/content) and no assembler
  subprocess was invoked for them.
- **New: "pm-phase2 no longer calls wb-render.js automatically"** — assert the mock
  dispatch/command spy never receives a `wb-render.js` invocation, and
  `{PREFIX}-Work-Breakdown.md`/`.csv` are not created as a side effect of a `pm-phase2` run; assert
  `gate2_payload` no longer has `renderer_result`/`renderer_failed` keys.

## Tests

This component *is* the test file — see Service Interface above for the full list; each bullet is
itself one or more `test(...)` blocks to add/modify.
