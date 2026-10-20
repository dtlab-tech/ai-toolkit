<a id="task-US-02-TASK-TEST-02"></a>
### US-02-TASK-TEST-02

- **Task ID:** US-02-TASK-TEST-02
- **Title:** Cover the end-to-end malformed-AC-header rejection via the real req-skeleton-check.js CLI
- **Outcome:** tests/req-skeleton-check.test.js has passing fixture-based tests: a malformed (5-column) AC header fails with MALFORMED_AC_TABLE_HEADER and no dangling-reference noise; a 3-column header (no Priority) still passes
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-02
- **Acceptance criteria:** AC-05, AC-06
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** req-skeleton-check
- **Commit subject:** cover the end-to-end malformed AC-header rejection

**Implementation notes:**

Per `spec/components/req-skeleton-check.test.js.md`: add two new fixtures under `tests/fixtures/`
(`ftr-029-req-malformed-ac-header/index.md`, a clean skeleton — reuse `ftr-021-req-clean`'s other
sections — with Section 7's AC table at 5 columns; `ftr-029-req-ac-header-no-priority/index.md`,
same but with Section 7 at exactly 3 columns, no `Priority`), and the two tests shown in that
component's Algorithm section, using this file's own existing `run(fixtureRelPath)` helper.

**Verification commands:**

```
npm test -- tests/req-skeleton-check.test.js
```
