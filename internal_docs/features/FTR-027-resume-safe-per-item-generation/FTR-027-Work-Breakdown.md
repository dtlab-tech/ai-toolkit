# Work Breakdown — FTR-027

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-027 |
| Schema | v2 |
| Generated | 2026-10-19T20:59:25.923Z |

## Summary
| Metric | Value |
|--------|-------|
| Total tasks | 9 |
| Total phases | 4 |
| Within target (≤15 min) | 2 |
| Above target (16–20 min) | 6 |
| Warning (21–30 min) | 1 |
| Split required (>30 min) | 0 |
| Domain distribution | BE: 3, FE: 0, DB: 0, DevOps: 0, INFRA: 0, TEST: 6 |

## User Story Phases

### US-01: Regenerate an Invalid Tech-Spec Component on Resume

### Commit
fix(FTR-027): regenerate an invalid Tech-Spec component instead of trusting existence alone

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-01-TASK-BE-01 | Add a parseComponentDetail-based validity check to Tech-Spec component resume | pm-phase1.js gains a local isValidComponentDetail(content) (duplicating tech-spec-assembler.js's parseComponentDetail fence-aware ## Change/## Tests scan as a boolean check); anyComponentFileMissing and the per-component loop's resume condition both require it in addition to c.exists() | BE | 18 | — | 1 cmd — [details](#task-US-01-TASK-BE-01) |
| US-01-TASK-TEST-01 | Cover invalid/valid Tech-Spec component resume behavior end to end | tests/integration/workflow-runtime.test.js has passing tests: an invalid-but-present component file is regenerated on resume; a valid one is still skipped; the outer gate alone (before the per-component loop) detects an invalid file the same way it already detects a missing one | TEST | 22 | US-01-TASK-BE-01 | 1 cmd — [details](#task-US-01-TASK-TEST-01) |

### US-02: Regenerate an Invalid Use-Case File on Resume

### Commit
fix(FTR-027): regenerate an invalid Requirements use-case file instead of trusting existence alone

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-02-TASK-BE-01 | Add a heading-match validity check to Requirements use-case resume | pm-phase1.js gains a local isValidUseCaseFile(content, ucId) checking the content starts with '### {ucId}: '; anyUcFileMissing and the per-use-case loop's resume condition both require it in addition to c.exists() | BE | 15 | — | 1 cmd — [details](#task-US-02-TASK-BE-01) |
| US-02-TASK-TEST-01 | Update the pm-phase1-req-resume.test.js mirror and source-text guard | tests/pm-phase1-req-resume.test.js's selectPendingUcIds mirror gains an isValidFn parameter and a new test case; its source-text guard asserts the updated literal condition | TEST | 14 | US-02-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-TEST-01) |
| US-02-TASK-TEST-02 | Cover invalid/valid use-case resume behavior end to end | tests/integration/workflow-runtime.test.js has passing tests: a use-case file starting with the wrong UC heading is regenerated on resume; a correctly-headed one is still skipped | TEST | 16 | US-02-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-TEST-02) |

### US-03: Regenerate an Invalid Work-Breakdown Task on Resume

### Commit
fix(FTR-027): regenerate an invalid Work Breakdown task instead of trusting status alone

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-03-TASK-BE-01 | Add a parseTaskDetailBlock-based validity check to Work Breakdown task resume | pm-phase2.js gains a local hasVerificationCommands(content) (duplicating wbs-assembler.js's _parseVerificationCommands last-marker-wins algorithm as a boolean check); the per-task resume-by-status loop requires it in addition to status === 'generated' && c.exists() | BE | 16 | — | 1 cmd — [details](#task-US-03-TASK-BE-01) |
| US-03-TASK-TEST-01 | Update pm-phase2-flow.js and pm-phase2-wbs-resume.test.js for the task validity condition | tests/helpers/pm-phase2-flow.js's selectPendingTaskIds gains an isValidFn parameter; tests/pm-phase2-wbs-resume.test.js's source-text guard and all call sites are updated, plus a new test case for the invalid-but-generated task | TEST | 16 | US-03-TASK-BE-01 | 1 cmd — [details](#task-US-03-TASK-TEST-01) |
| US-03-TASK-TEST-02 | Cover invalid/valid Work Breakdown task resume behavior end to end | tests/integration/workflow-runtime.test.js has passing tests: a task marked generated with a detail file present but zero verification commands is regenerated on resume; a task with at least one verification command is still skipped | TEST | 18 | US-03-TASK-BE-01 | 1 cmd — [details](#task-US-03-TASK-TEST-02) |

### US-04: Confirm Force/Revision-Cycle Bypass Is Unaffected, and Run the Full Regression

### Commit
test(FTR-027): confirm force/revision-cycle bypass is unaffected by the new validity checks

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-04-TASK-TEST-01 | Confirm force/revision-cycle bypass is unaffected, then run the full regression suite | A new test confirms --force and needsRequirementsFix/needsTechSpecFix still regenerate every item unconditionally despite the new validity checks (AC-08); full npm test suite passes | TEST | 16 | US-01-TASK-BE-01, US-02-TASK-BE-01, US-03-TASK-BE-01 | 2 cmd — [details](#task-US-04-TASK-TEST-01) |

## Task Details

> Authoritative per-task detail. Every field is rendered integrally so this document, together with the dispatch CSV, is a complete deliverable requiring no separate JSON. Verification commands are preserved **verbatim** in fenced code blocks — operators such as `||`, shell pipes `|`, and regex alternations (`grep -E 'a|b|c'`) survive byte-for-byte. Each command is an independent fenced block.

<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Add a parseComponentDetail-based validity check to Tech-Spec component resume
- **Outcome:** pm-phase1.js gains a local isValidComponentDetail(content) (duplicating tech-spec-assembler.js's parseComponentDetail fence-aware ## Change/## Tests scan as a boolean check); anyComponentFileMissing and the per-component loop's resume condition both require it in addition to c.exists()
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-01, AC-02, AC-03
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** fix
- **Commit scope:** pm-phase1
- **Commit subject:** regenerate an invalid Tech-Spec component instead of trusting existence alone

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "Tech-Spec component"
```

<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Cover invalid/valid Tech-Spec component resume behavior end to end
- **Outcome:** tests/integration/workflow-runtime.test.js has passing tests: an invalid-but-present component file is regenerated on resume; a valid one is still skipped; the outer gate alone (before the per-component loop) detects an invalid file the same way it already detects a missing one
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-01, AC-02, AC-03
- **Estimate — agent minutes:** 22
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Covers three closely related resume-behavior assertions (invalid regenerated, valid skipped, outer-gate detection) against the same two-component fixture already established by the neighboring "resume-by-existence dispatches only missing components" test, rather than three separate test tasks that would each re-set-up the identical fixture.
- **Commit type:** test
- **Commit scope:** pm-phase1
- **Commit subject:** cover invalid/valid Tech-Spec component resume behavior

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js
```

<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Add a heading-match validity check to Requirements use-case resume
- **Outcome:** pm-phase1.js gains a local isValidUseCaseFile(content, ucId) checking the content starts with '### {ucId}: '; anyUcFileMissing and the per-use-case loop's resume condition both require it in addition to c.exists()
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-04, AC-05
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** fix
- **Commit scope:** pm-phase1
- **Commit subject:** regenerate an invalid Requirements use-case file instead of trusting existence alone

**Verification commands:**

```
npm test -- tests/pm-phase1-req-resume.test.js
```

<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Update the pm-phase1-req-resume.test.js mirror and source-text guard
- **Outcome:** tests/pm-phase1-req-resume.test.js's selectPendingUcIds mirror gains an isValidFn parameter and a new test case; its source-text guard asserts the updated literal condition
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-04, AC-05
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 16000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase1-req-resume
- **Commit subject:** cover the use-case validity condition in the resume mirror

**Verification commands:**

```
npm test -- tests/pm-phase1-req-resume.test.js
```

<a id="task-US-02-TASK-TEST-02"></a>
### US-02-TASK-TEST-02

- **Task ID:** US-02-TASK-TEST-02
- **Title:** Cover invalid/valid use-case resume behavior end to end
- **Outcome:** tests/integration/workflow-runtime.test.js has passing tests: a use-case file starting with the wrong UC heading is regenerated on resume; a correctly-headed one is still skipped
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-04, AC-05
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase1
- **Commit subject:** cover invalid/valid use-case resume behavior end to end

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js
```

<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Add a parseTaskDetailBlock-based validity check to Work Breakdown task resume
- **Outcome:** pm-phase2.js gains a local hasVerificationCommands(content) (duplicating wbs-assembler.js's _parseVerificationCommands last-marker-wins algorithm as a boolean check); the per-task resume-by-status loop requires it in addition to status === 'generated' && c.exists()
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-06, AC-07
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** fix
- **Commit scope:** pm-phase2
- **Commit subject:** regenerate an invalid Work Breakdown task instead of trusting status alone

**Verification commands:**

```
<command>
```

<a id="task-US-03-TASK-TEST-01"></a>
### US-03-TASK-TEST-01

- **Task ID:** US-03-TASK-TEST-01
- **Title:** Update pm-phase2-flow.js and pm-phase2-wbs-resume.test.js for the task validity condition
- **Outcome:** tests/helpers/pm-phase2-flow.js's selectPendingTaskIds gains an isValidFn parameter; tests/pm-phase2-wbs-resume.test.js's source-text guard and all call sites are updated, plus a new test case for the invalid-but-generated task
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-06, AC-07
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase2-wbs-resume
- **Commit subject:** cover the task validity condition in the resume mirror

**Verification commands:**

```
npm test -- tests/pm-phase2-wbs-resume.test.js
```

<a id="task-US-03-TASK-TEST-02"></a>
### US-03-TASK-TEST-02

- **Task ID:** US-03-TASK-TEST-02
- **Title:** Cover invalid/valid Work Breakdown task resume behavior end to end
- **Outcome:** tests/integration/workflow-runtime.test.js has passing tests: a task marked generated with a detail file present but zero verification commands is regenerated on resume; a task with at least one verification command is still skipped
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-06, AC-07
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase2
- **Commit subject:** cover invalid/valid Work Breakdown task resume behavior end to end

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js
```

<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Confirm force/revision-cycle bypass is unaffected, then run the full regression suite
- **Outcome:** A new test confirms --force and needsRequirementsFix/needsTechSpecFix still regenerate every item unconditionally despite the new validity checks (AC-08); full npm test suite passes
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01, US-02-TASK-BE-01, US-03-TASK-BE-01
- **Acceptance criteria:** AC-08, AC-09
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase1, pm-phase2
- **Commit subject:** confirm force/revision-cycle bypass is unaffected; run the full regression

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js
```

```
npm test
```

## Statistics

| Domain | Count | Target | Above | Warning | Split |
|--------|-------|--------|-------|---------|-------|
| BE | 3 | 1 | 2 | 0 | 0 |
| FE | 0 | 0 | 0 | 0 | 0 |
| DB | 0 | 0 | 0 | 0 | 0 |
| DevOps | 0 | 0 | 0 | 0 | 0 |
| INFRA | 0 | 0 | 0 | 0 | 0 |
| TEST | 6 | 1 | 4 | 1 | 0 |
| **Total** | **9** | **2** | **6** | **1** | **0** |
