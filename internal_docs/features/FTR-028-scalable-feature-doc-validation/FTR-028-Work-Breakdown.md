# Work Breakdown — FTR-028

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-028 |
| Schema | v2 |
| Generated | 2026-10-20T13:11:18.347Z |

## Summary
| Metric | Value |
|--------|-------|
| Total tasks | 8 |
| Total phases | 4 |
| Within target (≤15 min) | 1 |
| Above target (16–20 min) | 2 |
| Warning (21–30 min) | 5 |
| Split required (>30 min) | 0 |
| Domain distribution | BE: 4, FE: 0, DB: 0, DevOps: 0, INFRA: 0, TEST: 4 |

## User Story Phases

### US-01: Validate Tech-Spec Coverage Using the Skeleton Only

### Commit
fix(FTR-028): bound the feature-doc validator's Tech-Spec input to the skeleton, not the fully assembled document

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-01-TASK-BE-01 | Swap the validator's Tech-Spec input from the fully assembled document to the skeleton | pm-phase1.js's validation-cycle prompt uses c.read(specIndexPath) instead of assembledTechSpec for the Tech-Spec label; gaia-validate-feature-docs.md's Phase 1 step 3 is reworded to describe the skeleton-only contract | BE | 16 | — | 1 cmd — [details](#task-US-01-TASK-BE-01) |
| US-01-TASK-TEST-01 | Cover the skeleton-only validator prompt end to end | tests/integration/workflow-runtime.test.js has passing tests: the validator's dispatch prompt contains no per-component Change/Algorithm/Tests prose; Requirements' own full UC detail is still inlined unchanged; docsDigest still hashes the full assembled documents | TEST | 20 | US-01-TASK-BE-01 | 1 cmd — [details](#task-US-01-TASK-TEST-01) |

### US-02: Enforce AC↔Component Traceability Deterministically

### Commit
feat(FTR-028): enforce AC<->component traceability deterministically, merged before the validator's own contradiction guard

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-02-TASK-BE-01 | Add the deterministic AC<->component traceability check and the merge-before-guard mechanism | pm-phase1.js gains computeAcComponentTraceabilityGaps(reqIndexContent, specIndexContent); the validation cycle merges its findings into result before the valid/findings contradiction guard, recomputing valid/needsTechSpecFix/needsRequirementsFix from the merged set, and appends any new findings to the persisted Validation-Report | BE | 24 | US-01-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-BE-01) |
| US-02-TASK-TEST-01 | Cover deterministic AC<->component traceability and the merge-forces-invalid behavior | tests/integration/workflow-runtime.test.js has passing tests: an AC addressed by zero components produces a finding and forces needsTechSpecFix even when the LLM pass returns valid:true; a component referencing a nonexistent AC-ID is reported by name; no gaps + a clean LLM pass stays valid, unchanged from today | TEST | 22 | US-02-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-TEST-01) |

### US-03: Drill Down on Components for Deep-Technical Claims

### Commit
feat(FTR-028): dispatch batched component-detail drill-down calls and fold their findings into the merge

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-03-TASK-BE-01 | Register the new component-detail drill-down agent and extend the validator's schema | lib/agent-registry.js gains the gaia.agent.planner.validate-tech-spec-component-detail entry; a new src/claude/agents/gaia-validate-tech-spec-component-detail.md defines the narrow drill-down agent; gaia-validate-feature-docs.md's Phase 3/schema/Phase 7 gain needsComponentDetail with guidance on when to use it; pm-phase1.js's main validator worker schema literal gains the matching needsComponentDetail field | BE | 22 | — | 1 cmd — [details](#task-US-03-TASK-BE-01) |
| US-03-TASK-BE-02 | Add fileSlug validation, dedup/batching, and drill-down dispatch to the validation cycle | pm-phase1.js gains prepareDrillDownBatches/buildDrillDownPrompt/DRILL_DOWN_BATCH_SIZE; needsComponentDetail entries are validated against spec/index.md's own component table, deduplicated by fileSlug, batched at K=8, and dispatched one gaia-validate-tech-spec-component-detail call per batch; the merge logic from US-02 is extended to also fold in drill-down and bad-fileSlug findings | BE | 28 | US-02-TASK-BE-01, US-03-TASK-BE-01 | 1 cmd — [details](#task-US-03-TASK-BE-02) |
| US-03-TASK-TEST-01 | Cover component-detail drill-down dispatch, validation, dedup, and batching end to end | tests/integration/workflow-runtime.test.js has passing tests: a valid fileSlug dispatches a drill-down call reading only that file; a hallucinated fileSlug is dropped and reported, never dispatched; two claims on the same fileSlug collapse into one batch slot; more unique flagged components than K produce multiple bounded calls; zero needsComponentDetail entries dispatch zero drill-down calls; a drill-down finding forces needsTechSpecFix even when the main pass reported clean | TEST | 28 | US-03-TASK-BE-02 | 1 cmd — [details](#task-US-03-TASK-TEST-01) |

### US-04: Full Regression Confirmation

### Commit
test(FTR-028): confirm the full regression suite passes with the scalable validator in place

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-04-TASK-TEST-01 | Run the full regression suite and confirm no behavior regressed | Full npm test suite passes with every new AC-01 through AC-13 test green alongside the full pre-existing suite (FTR-020 through FTR-027's own tests unaffected); AC-14 satisfied | TEST | 14 | US-01-TASK-BE-01, US-02-TASK-BE-01, US-03-TASK-BE-02 | 1 cmd — [details](#task-US-04-TASK-TEST-01) |

## Task Details

> Authoritative per-task detail. Every field is rendered integrally so this document, together with the dispatch CSV, is a complete deliverable requiring no separate JSON. Verification commands are preserved **verbatim** in fenced code blocks — operators such as `||`, shell pipes `|`, and regex alternations (`grep -E 'a|b|c'`) survive byte-for-byte. Each command is an independent fenced block.

<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Swap the validator's Tech-Spec input from the fully assembled document to the skeleton
- **Outcome:** pm-phase1.js's validation-cycle prompt uses c.read(specIndexPath) instead of assembledTechSpec for the Tech-Spec label; gaia-validate-feature-docs.md's Phase 1 step 3 is reworded to describe the skeleton-only contract
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-01
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 20000
- **Output count:** 2
- **Grouping rationale:** The prompt-construction change and its agent-contract wording are the same conceptual edit (what Tech-Spec text this call receives) split across two files that must agree — grouped in one task so they land atomically.
- **Commit type:** fix
- **Commit scope:** pm-phase1
- **Commit subject:** bound the feature-doc validator's Tech-Spec input to the skeleton, not the fully assembled document

**Verification commands:**

```
npm test -- tests/frontmatter/agents.test.js
```

<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Cover the skeleton-only validator prompt end to end
- **Outcome:** tests/integration/workflow-runtime.test.js has passing tests: the validator's dispatch prompt contains no per-component Change/Algorithm/Tests prose; Requirements' own full UC detail is still inlined unchanged; docsDigest still hashes the full assembled documents
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-01, AC-05, AC-13
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase1
- **Commit subject:** cover the skeleton-only validator prompt and unaffected docsDigest

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "FTR-028 — validator prompt uses the Tech-Spec skeleton only"
```

<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Add the deterministic AC<->component traceability check and the merge-before-guard mechanism
- **Outcome:** pm-phase1.js gains computeAcComponentTraceabilityGaps(reqIndexContent, specIndexContent); the validation cycle merges its findings into result before the valid/findings contradiction guard, recomputing valid/needsTechSpecFix/needsRequirementsFix from the merged set, and appends any new findings to the persisted Validation-Report
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-02, AC-03, AC-04, AC-05
- **Estimate — agent minutes:** 24
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** The deterministic check and the merge mechanism it requires are one indivisible unit — the check alone has no effect on the validation cycle's outcome without the merge wired in, and the merge mechanism has no finding source to merge without the check.
- **Commit type:** feat
- **Commit scope:** pm-phase1
- **Commit subject:** enforce AC<->component traceability deterministically, merged before the validator's own contradiction guard

**Verification commands:**

```
npm test
```

<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Cover deterministic AC<->component traceability and the merge-forces-invalid behavior
- **Outcome:** tests/integration/workflow-runtime.test.js has passing tests: an AC addressed by zero components produces a finding and forces needsTechSpecFix even when the LLM pass returns valid:true; a component referencing a nonexistent AC-ID is reported by name; no gaps + a clean LLM pass stays valid, unchanged from today
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-02, AC-03, AC-04, AC-05
- **Estimate — agent minutes:** 22
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase1
- **Commit subject:** cover deterministic AC<->component traceability and the merge-before-guard behavior

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "FTR-028 — deterministic AC<->component traceability"
```

<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Register the new component-detail drill-down agent and extend the validator's schema
- **Outcome:** lib/agent-registry.js gains the gaia.agent.planner.validate-tech-spec-component-detail entry; a new src/claude/agents/gaia-validate-tech-spec-component-detail.md defines the narrow drill-down agent; gaia-validate-feature-docs.md's Phase 3/schema/Phase 7 gain needsComponentDetail with guidance on when to use it; pm-phase1.js's main validator worker schema literal gains the matching needsComponentDetail field
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-06
- **Estimate — agent minutes:** 22
- **Estimate — tokens:** 28000
- **Output count:** 3
- **Grouping rationale:** Registration (registry entry), the new agent's own definition, and the schema contract both sides of a dispatch must agree on are one coupled unit — landing any subset alone would leave an unresolvable agent ID or a schema mismatch.
- **Commit type:** feat
- **Commit scope:** agent-registry, pm-phase1
- **Commit subject:** register the new component-detail drill-down agent and extend the validator's schema

**Verification commands:**

```
npm test -- tests/frontmatter/agents.test.js
```

<a id="task-US-03-TASK-BE-02"></a>
### US-03-TASK-BE-02

- **Task ID:** US-03-TASK-BE-02
- **Title:** Add fileSlug validation, dedup/batching, and drill-down dispatch to the validation cycle
- **Outcome:** pm-phase1.js gains prepareDrillDownBatches/buildDrillDownPrompt/DRILL_DOWN_BATCH_SIZE; needsComponentDetail entries are validated against spec/index.md's own component table, deduplicated by fileSlug, batched at K=8, and dispatched one gaia-validate-tech-spec-component-detail call per batch; the merge logic from US-02 is extended to also fold in drill-down and bad-fileSlug findings
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01, US-03-TASK-BE-01
- **Acceptance criteria:** AC-07, AC-08, AC-09, AC-10, AC-11, AC-12
- **Estimate — agent minutes:** 28
- **Estimate — tokens:** 34000
- **Output count:** 1
- **Grouping rationale:** The batching/dedup/validation logic and the dispatch loop that consumes it are one indivisible unit — batching with nothing to dispatch to, or dispatch without validated/batched input, are each meaningless alone.
- **Commit type:** feat
- **Commit scope:** pm-phase1
- **Commit subject:** dispatch batched component-detail drill-down calls and fold their findings into the merge

**Verification commands:**

```
npm test
```

<a id="task-US-03-TASK-TEST-01"></a>
### US-03-TASK-TEST-01

- **Task ID:** US-03-TASK-TEST-01
- **Title:** Cover component-detail drill-down dispatch, validation, dedup, and batching end to end
- **Outcome:** tests/integration/workflow-runtime.test.js has passing tests: a valid fileSlug dispatches a drill-down call reading only that file; a hallucinated fileSlug is dropped and reported, never dispatched; two claims on the same fileSlug collapse into one batch slot; more unique flagged components than K produce multiple bounded calls; zero needsComponentDetail entries dispatch zero drill-down calls; a drill-down finding forces needsTechSpecFix even when the main pass reported clean
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-02
- **Acceptance criteria:** AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12
- **Estimate — agent minutes:** 28
- **Estimate — tokens:** 36000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase1
- **Commit subject:** cover component-detail drill-down dispatch, validation, dedup, and batching

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "FTR-028 — component-detail drill-down"
```

<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Run the full regression suite and confirm no behavior regressed
- **Outcome:** Full npm test suite passes with every new AC-01 through AC-13 test green alongside the full pre-existing suite (FTR-020 through FTR-027's own tests unaffected); AC-14 satisfied
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01, US-02-TASK-BE-01, US-03-TASK-BE-02
- **Acceptance criteria:** AC-14
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 16000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase1
- **Commit subject:** confirm the full regression suite passes with the scalable validator in place

**Verification commands:**

```
npm test
```

## Statistics

| Domain | Count | Target | Above | Warning | Split |
|--------|-------|--------|-------|---------|-------|
| BE | 4 | 0 | 1 | 3 | 0 |
| FE | 0 | 0 | 0 | 0 | 0 |
| DB | 0 | 0 | 0 | 0 | 0 |
| DevOps | 0 | 0 | 0 | 0 | 0 |
| INFRA | 0 | 0 | 0 | 0 | 0 |
| TEST | 4 | 1 | 1 | 2 | 0 |
| **Total** | **8** | **1** | **2** | **5** | **0** |
