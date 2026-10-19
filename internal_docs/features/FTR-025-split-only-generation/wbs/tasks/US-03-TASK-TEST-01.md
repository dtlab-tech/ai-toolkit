<a id="task-US-03-TASK-TEST-01"></a>
### US-03-TASK-TEST-01

- **Task ID:** US-03-TASK-TEST-01
- **Title:** Integration tests: pm-phase2 bridge step and wb-render removal
- **Outcome:** tests/integration/workflow-runtime.test.js: new tests assert pm-phase2 writes fresh Requirements/Tech-Spec from real req/+spec/ fixtures before its own Gate 1 digest check, that a legacy feature (monolithic files only, no req/spec/) leaves the bridge step a no-op, and that pm-phase2 no longer calls wb-render.js nor produces Work-Breakdown.md/.csv as a side effect
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-01, US-03-TASK-BE-02
- **Acceptance criteria:** AC-11
- **Estimate — agent minutes:** 22
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add pm-phase2 bridge-step and wb-render-removal integration tests

**Implementation notes:**

Three test groups: (1) a feature with real `req/`+`spec/` fixtures and an approved Gate 1 (digest
computed the same way `pm-phase1.js` now computes it, per US-01) — run `pm-phase2`, assert
`{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` now exist and match
`loadRequirements`/`loadTechSpec`'s own output, and that `wb-skeleton-check.js`/`wb-validate.js`/
the semantic validator/`ac-task-matrix.js`/`gaia-generate-work-breakdown` all still receive and
use them unmodified; (2) a legacy-feature fixture (pre-existing monolithic files, no `req/`/`spec/`)
— assert the pre-existing files are untouched (same content) and no assembler subprocess was
invoked; (3) assert the mock dispatch/command spy never receives a `wb-render.js` invocation and
`{PREFIX}-Work-Breakdown.md`/`.csv` are not created, and that `gate2_payload` no longer carries
`renderer_result`/`renderer_failed`.

**Verification commands:**

```
npx jest --testPathPattern=tests/integration/workflow-runtime.test.js
```
