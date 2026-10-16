<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Integration tests: pm-phase1 split-only generation and inlined-prompt validation
- **Outcome:** tests/integration/workflow-runtime.test.js: every existing Requirements/Tech-Spec-related pm-phase1 test is updated to never expect an assembled file on disk; new tests assert no {PREFIX}-Requirements.md/{PREFIX}-Tech-Spec.md exists after a clean pm-phase1 run, that the validator's received prompt contains the inlined Requirements/Tech-Spec text, that docs_digest stays sha256-formatted/deterministic/content-sensitive over the split sources, and that a needsRequirementsFix/needsTechSpecFix cycle re-assembles before the next validator dispatch
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01, US-01-TASK-BE-02, US-01-TASK-INFRA-01, US-01-TASK-INFRA-02
- **Acceptance criteria:** AC-11
- **Estimate — agent minutes:** 24
- **Estimate — tokens:** 34000
- **Output count:** 1
- **Grouping rationale:** Fixing the existing shared pm-phase1 fixtures/assertions (every test that currently checks for the assembled file's existence/content) and adding the new inlined-prompt/digest/no-assembled-file tests are inseparable: the new tests cannot run against the old fixture assumptions, and verifying the fix means re-running the whole existing Requirements/Tech-Spec-related suite, not a separable sub-task — the same fixture-fallout pattern FTR-021/FTR-023/FTR-024 each hit when wiring a new generation path into pm-phase1.js.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add pm-phase1 split-only generation and inlined-validation integration tests

**Implementation notes:**

Budget for fixing the shared fixtures first (every assertion reading `file('Requirements'/'Tech-Spec')`
after a `pm-phase1` run), then add: (1) a test asserting neither assembled file exists after a
clean full run; (2) a test inspecting the mock dispatch's received `options.prompt` for
`gaia-validate-feature-docs` to confirm it contains `Requirements:`/`Tech-Spec:` labeled inlined
content matching the real split fixtures; (3) an extension of the existing `docs_digest` test
confirming it still matches `/^sha256:[a-f0-9]{64}$/`, is deterministic, and changes when a
`req/use-cases/UC-01.md` fixture file is edited directly (not the now-removed assembled file); (4)
a test driving a `needsRequirementsFix` cycle and asserting the second validator dispatch's inlined
Requirements text reflects the regenerated content, not the stale first-pass text.

**Verification commands:**

```
npx jest --testPathPattern=tests/integration/workflow-runtime.test.js
```
