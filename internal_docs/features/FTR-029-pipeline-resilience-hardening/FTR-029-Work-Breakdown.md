# Work Breakdown — FTR-029

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-029 |
| Schema | v2 |
| Generated | 2026-10-20T15:30:53.019Z |

## Summary
| Metric | Value |
|--------|-------|
| Total tasks | 15 |
| Total phases | 5 |
| Within target (≤15 min) | 3 |
| Above target (16–20 min) | 11 |
| Warning (21–30 min) | 1 |
| Split required (>30 min) | 0 |
| Domain distribution | BE: 8, FE: 0, DB: 0, DevOps: 0, INFRA: 0, TEST: 7 |

## User Story Phases

### US-01: Recover a Schema-Required Response That Omits Optional Fix Flags

### Commit
fix(FTR-029): stop discarding a logically-complete validator response over two optional fix-routing booleans

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-01-TASK-BE-01 | Add a bounded, nudge-retried second trigger for a missing-structured-output response | lib/workflow-control.js's worker() attempt loop gains _isMissingStructuredOutput(result, schema) and STRUCTURED_OUTPUT_RETRY_NUDGE; a clean-exit attempt with no usable structured output (even after extractDelimitedStructuredOutput) is retried, bounded by the existing WORKER_MAX_ATTEMPTS/WORKER_RETRY_BACKOFF_MS, with the nudge appended to the next attempt's prompt | BE | 20 | — | 1 cmd — [details](#task-US-01-TASK-BE-01) |
| US-01-TASK-BE-02 | Relax the feature-doc validator's schema to not require the fix-routing booleans | pm-phase1.js's gaia-validate-feature-docs worker call schema drops needsRequirementsFix/needsTechSpecFix from its required array (both remain in properties, still type-checked when present) | BE | 12 | — | 1 cmd — [details](#task-US-01-TASK-BE-02) |
| US-01-TASK-TEST-01 | Cover the missing-structured-output retry and nudge end to end | tests/cli/workflow-worker-contract.test.js has passing tests: a clean-exit attempt with no recoverable structured output is retried with the nudge appended; a response already recoverable via the existing text fallback is NOT retried; exhausting every attempt still throws the existing error | TEST | 20 | US-01-TASK-BE-01 | 1 cmd — [details](#task-US-01-TASK-TEST-01) |
| US-01-TASK-TEST-02 | Cover the relaxed validator schema end to end against the real pm-phase1 dispatch path | tests/integration/workflow-runtime.test.js has passing tests: a clean validator response omitting needsRequirementsFix/needsTechSpecFix still reaches Gate 1; a response that DOES include both fields with the correct type is still validated when present | TEST | 16 | US-01-TASK-BE-02 | 1 cmd — [details](#task-US-01-TASK-TEST-02) |

### US-02: Validate the Acceptance Criteria Table's Column Header Before Parsing

### Commit
feat(FTR-029): validate the AC table's column header before parsing it

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-02-TASK-BE-01 | Add parseTableHeader and checkAcTableHeader | req-assembler.js gains parseTableHeader(lines, start, end), exported alongside findSectionRange/parseTableRows; req-graph-checks.js gains checkAcTableHeader(headerCells), mirroring wb-graph-checks.js's own AC-table header check | BE | 18 | — | 1 cmd — [details](#task-US-02-TASK-BE-01) |
| US-02-TASK-BE-02 | Wire the AC-table header check into req-skeleton-check.js before the positional parse | req-skeleton-check.js calls parseTableHeader/checkAcTableHeader on Section 7's AC table before parseAcTable; a malformed header short-circuits acTable to [] for the run and folds a MALFORMED_AC_TABLE_HEADER error into the existing unified errors[] output | BE | 16 | US-02-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-BE-02) |
| US-02-TASK-BE-03 | Correct the stale 3-column AC example in gaia-generate-requirements.md | gaia-generate-requirements.md's inline Section 7 example is corrected from a 3-column shape (missing Priority) to the real, authoritative 4-column shape, matching gaia-requirements-index-template.md | BE | 8 | — | 1 cmd — [details](#task-US-02-TASK-BE-03) |
| US-02-TASK-TEST-01 | Cover parseTableHeader and checkAcTableHeader with direct unit tests | tests/req-assembler.test.js and tests/req-graph-checks.test.js each gain direct unit tests for the new functions, including the BR-03 no-trailing-Priority tolerance case | TEST | 16 | US-02-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-TEST-01) |
| US-02-TASK-TEST-02 | Cover the end-to-end malformed-AC-header rejection via the real req-skeleton-check.js CLI | tests/req-skeleton-check.test.js has passing fixture-based tests: a malformed (5-column) AC header fails with MALFORMED_AC_TABLE_HEADER and no dangling-reference noise; a 3-column header (no Priority) still passes | TEST | 18 | US-02-TASK-BE-02 | 1 cmd — [details](#task-US-02-TASK-TEST-02) |

### US-03: Recover an Unclosed Whole-Response Fence Wrap

### Commit
fix(FTR-029): recover an unclosed whole-response fence wrap

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-03-TASK-BE-01 | Recover an unclosed whole-response fence wrap in extractMarkdownDocument | lib/workflow-control.js gains _stripUnclosedLeadingFence(text), wired into extractMarkdownDocument as a third recovery strategy, re-validated via the existing _hasUnfencedHeading before use | BE | 18 | — | 1 cmd — [details](#task-US-03-TASK-BE-01) |
| US-03-TASK-TEST-01 | Cover unclosed-fence recovery end to end against the real pm-phase1 dispatch path | tests/cli/workflow-worker-contract.test.js has passing tests: an unclosed fence wrap with a real heading after the opener is recovered; an unclosed fence whose remainder reveals no heading is left unchanged; a CLOSED fence wrap is still recovered (regression) | TEST | 18 | US-03-TASK-BE-01 | 1 cmd — [details](#task-US-03-TASK-TEST-01) |

### US-04: Fail Fast on an Invalid Per-Item Generation Result

### Commit
feat(FTR-029): fail fast on an invalid per-item generation result, with one bounded retry

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-04-TASK-BE-01 | Validate a per-component generation result immediately, with one bounded retry | pm-phase1.js's per-component loop validates each worker's response via isValidComponentDetail immediately after dispatch, before writing to disk; an invalid result is retried once (identical prompt); still-invalid throws a precise error naming the component | BE | 20 | — | 1 cmd — [details](#task-US-04-TASK-BE-01) |
| US-04-TASK-BE-02 | Validate a per-UC generation result immediately, with one bounded retry | pm-phase1.js's per-UC loop validates each worker's response via isValidUseCaseFile immediately after dispatch, before writing to disk; an invalid result is retried once (identical prompt); still-invalid throws a precise error naming the UC | BE | 18 | — | 1 cmd — [details](#task-US-04-TASK-BE-02) |
| US-04-TASK-TEST-01 | Cover fail-fast per-item validation end to end, both loops | tests/integration/workflow-runtime.test.js has passing tests: an invalid component valid on retry is written and used with no error; an invalid component on both attempts throws immediately, naming it, before any later component is dispatched; an invalid use case on both attempts throws immediately, naming it | TEST | 24 | US-04-TASK-BE-01, US-04-TASK-BE-02 | 1 cmd — [details](#task-US-04-TASK-TEST-01) |

### US-05: Full Regression Confirmation

### Commit
test(FTR-029): confirm the full regression suite passes with all four resilience fixes in place

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-05-TASK-TEST-01 | Run the full regression suite and confirm no behavior regressed | Full npm test suite passes with every new AC-01 through AC-12 test green alongside the full pre-existing suite; AC-13 satisfied | TEST | 14 | US-01-TASK-BE-01, US-01-TASK-BE-02, US-02-TASK-BE-02, US-02-TASK-BE-03, US-03-TASK-BE-01, US-04-TASK-BE-01, US-04-TASK-BE-02 | 1 cmd — [details](#task-US-05-TASK-TEST-01) |

## Task Details

> Authoritative per-task detail. Every field is rendered integrally so this document, together with the dispatch CSV, is a complete deliverable requiring no separate JSON. Verification commands are preserved **verbatim** in fenced code blocks — operators such as `||`, shell pipes `|`, and regex alternations (`grep -E 'a|b|c'`) survive byte-for-byte. Each command is an independent fenced block.

<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Add a bounded, nudge-retried second trigger for a missing-structured-output response
- **Outcome:** lib/workflow-control.js's worker() attempt loop gains _isMissingStructuredOutput(result, schema) and STRUCTURED_OUTPUT_RETRY_NUDGE; a clean-exit attempt with no usable structured output (even after extractDelimitedStructuredOutput) is retried, bounded by the existing WORKER_MAX_ATTEMPTS/WORKER_RETRY_BACKOFF_MS, with the nudge appended to the next attempt's prompt
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-03, AC-04
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** workflow-control
- **Commit subject:** retry a schema-required worker once when structured output is missing, with a corrective nudge

**Verification commands:**

```
npm test -- tests/cli/workflow-worker-contract.test.js
```

<a id="task-US-01-TASK-BE-02"></a>
### US-01-TASK-BE-02

- **Task ID:** US-01-TASK-BE-02
- **Title:** Relax the feature-doc validator's schema to not require the fix-routing booleans
- **Outcome:** pm-phase1.js's gaia-validate-feature-docs worker call schema drops needsRequirementsFix/needsTechSpecFix from its required array (both remain in properties, still type-checked when present)
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-01, AC-02
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 14000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** fix
- **Commit scope:** pm-phase1
- **Commit subject:** stop requiring needsRequirementsFix/needsTechSpecFix in the validator's schema

**Verification commands:**

```
npm test
```

<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Cover the missing-structured-output retry and nudge end to end
- **Outcome:** tests/cli/workflow-worker-contract.test.js has passing tests: a clean-exit attempt with no recoverable structured output is retried with the nudge appended; a response already recoverable via the existing text fallback is NOT retried; exhausting every attempt still throws the existing error
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-03, AC-04
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** workflow-control
- **Commit subject:** cover the missing-structured-output retry and corrective nudge

**Verification commands:**

```
npm test -- tests/cli/workflow-worker-contract.test.js -t "missing-structured-output retry"
```

<a id="task-US-01-TASK-TEST-02"></a>
### US-01-TASK-TEST-02

- **Task ID:** US-01-TASK-TEST-02
- **Title:** Cover the relaxed validator schema end to end against the real pm-phase1 dispatch path
- **Outcome:** tests/integration/workflow-runtime.test.js has passing tests: a clean validator response omitting needsRequirementsFix/needsTechSpecFix still reaches Gate 1; a response that DOES include both fields with the correct type is still validated when present
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-02
- **Acceptance criteria:** AC-01, AC-02
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase1
- **Commit subject:** cover the relaxed validator schema end to end

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "FTR-029 — validator schema"
```

<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Add parseTableHeader and checkAcTableHeader
- **Outcome:** req-assembler.js gains parseTableHeader(lines, start, end), exported alongside findSectionRange/parseTableRows; req-graph-checks.js gains checkAcTableHeader(headerCells), mirroring wb-graph-checks.js's own AC-table header check
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-05, AC-06
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 2
- **Grouping rationale:** Both are small, independent pure-function additions that the next task (wiring) needs together — grouped so that task always has both available.
- **Commit type:** feat
- **Commit scope:** req-assembler, req-graph-checks
- **Commit subject:** add AC-table header extraction and validation

**Verification commands:**

```
npm test -- tests/req-assembler.test.js tests/req-graph-checks.test.js
```

<a id="task-US-02-TASK-BE-02"></a>
### US-02-TASK-BE-02

- **Task ID:** US-02-TASK-BE-02
- **Title:** Wire the AC-table header check into req-skeleton-check.js before the positional parse
- **Outcome:** req-skeleton-check.js calls parseTableHeader/checkAcTableHeader on Section 7's AC table before parseAcTable; a malformed header short-circuits acTable to [] for the run and folds a MALFORMED_AC_TABLE_HEADER error into the existing unified errors[] output
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-05, AC-06
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** req-skeleton-check
- **Commit subject:** validate the AC table's column header before parsing it

**Verification commands:**

```
npm test -- tests/req-skeleton-check.test.js
```

<a id="task-US-02-TASK-BE-03"></a>
### US-02-TASK-BE-03

- **Task ID:** US-02-TASK-BE-03
- **Title:** Correct the stale 3-column AC example in gaia-generate-requirements.md
- **Outcome:** gaia-generate-requirements.md's inline Section 7 example is corrected from a 3-column shape (missing Priority) to the real, authoritative 4-column shape, matching gaia-requirements-index-template.md
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-07
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** fix
- **Commit scope:** gaia-generate-requirements
- **Commit subject:** correct the stale 3-column AC table example

**Verification commands:**

```
npm test -- tests/frontmatter/agents.test.js
```

<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Cover parseTableHeader and checkAcTableHeader with direct unit tests
- **Outcome:** tests/req-assembler.test.js and tests/req-graph-checks.test.js each gain direct unit tests for the new functions, including the BR-03 no-trailing-Priority tolerance case
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-05, AC-06
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** req-assembler, req-graph-checks
- **Commit subject:** cover parseTableHeader and checkAcTableHeader

**Verification commands:**

```
npm test -- tests/req-assembler.test.js tests/req-graph-checks.test.js
```

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

**Verification commands:**

```
npm test -- tests/req-skeleton-check.test.js
```

<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Recover an unclosed whole-response fence wrap in extractMarkdownDocument
- **Outcome:** lib/workflow-control.js gains _stripUnclosedLeadingFence(text), wired into extractMarkdownDocument as a third recovery strategy, re-validated via the existing _hasUnfencedHeading before use
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-08, AC-09
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** fix
- **Commit scope:** workflow-control
- **Commit subject:** recover an unclosed whole-response fence wrap

**Verification commands:**

```
npm test -- tests/cli/workflow-worker-contract.test.js
```

<a id="task-US-03-TASK-TEST-01"></a>
### US-03-TASK-TEST-01

- **Task ID:** US-03-TASK-TEST-01
- **Title:** Cover unclosed-fence recovery end to end against the real pm-phase1 dispatch path
- **Outcome:** tests/cli/workflow-worker-contract.test.js has passing tests: an unclosed fence wrap with a real heading after the opener is recovered; an unclosed fence whose remainder reveals no heading is left unchanged; a CLOSED fence wrap is still recovered (regression)
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-08, AC-09
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** workflow-control
- **Commit subject:** cover unclosed-fence recovery and the closed-fence regression

**Verification commands:**

```
npm test -- tests/cli/workflow-worker-contract.test.js -t "unclosed"
```

<a id="task-US-04-TASK-BE-01"></a>
### US-04-TASK-BE-01

- **Task ID:** US-04-TASK-BE-01
- **Title:** Validate a per-component generation result immediately, with one bounded retry
- **Outcome:** pm-phase1.js's per-component loop validates each worker's response via isValidComponentDetail immediately after dispatch, before writing to disk; an invalid result is retried once (identical prompt); still-invalid throws a precise error naming the component
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-10, AC-11
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** pm-phase1
- **Commit subject:** fail fast on an invalid Tech-Spec component, with one bounded retry

**Verification commands:**

```
npm test
```

<a id="task-US-04-TASK-BE-02"></a>
### US-04-TASK-BE-02

- **Task ID:** US-04-TASK-BE-02
- **Title:** Validate a per-UC generation result immediately, with one bounded retry
- **Outcome:** pm-phase1.js's per-UC loop validates each worker's response via isValidUseCaseFile immediately after dispatch, before writing to disk; an invalid result is retried once (identical prompt); still-invalid throws a precise error naming the UC
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-12
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** pm-phase1
- **Commit subject:** fail fast on an invalid Requirements use case, with one bounded retry

**Verification commands:**

```
npm test
```

<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Cover fail-fast per-item validation end to end, both loops
- **Outcome:** tests/integration/workflow-runtime.test.js has passing tests: an invalid component valid on retry is written and used with no error; an invalid component on both attempts throws immediately, naming it, before any later component is dispatched; an invalid use case on both attempts throws immediately, naming it
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-01, US-04-TASK-BE-02
- **Acceptance criteria:** AC-10, AC-11, AC-12
- **Estimate — agent minutes:** 24
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase1
- **Commit subject:** cover fail-fast per-item validation for both the component and use-case loops

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "FTR-029 — fail fast"
```

<a id="task-US-05-TASK-TEST-01"></a>
### US-05-TASK-TEST-01

- **Task ID:** US-05-TASK-TEST-01
- **Title:** Run the full regression suite and confirm no behavior regressed
- **Outcome:** Full npm test suite passes with every new AC-01 through AC-12 test green alongside the full pre-existing suite; AC-13 satisfied
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01, US-01-TASK-BE-02, US-02-TASK-BE-02, US-02-TASK-BE-03, US-03-TASK-BE-01, US-04-TASK-BE-01, US-04-TASK-BE-02
- **Acceptance criteria:** AC-13
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 16000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase1, workflow-control
- **Commit subject:** confirm the full regression suite passes with all four resilience fixes in place

**Verification commands:**

```
npm test
```

## Statistics

| Domain | Count | Target | Above | Warning | Split |
|--------|-------|--------|-------|---------|-------|
| BE | 8 | 2 | 6 | 0 | 0 |
| FE | 0 | 0 | 0 | 0 | 0 |
| DB | 0 | 0 | 0 | 0 | 0 |
| DevOps | 0 | 0 | 0 | 0 | 0 |
| INFRA | 0 | 0 | 0 | 0 | 0 |
| TEST | 7 | 1 | 5 | 1 | 0 |
| **Total** | **15** | **3** | **11** | **1** | **0** |
