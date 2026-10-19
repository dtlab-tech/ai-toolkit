# Work Breakdown — FTR-026

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-026 |
| Schema | v2 |
| Generated | 2026-10-19T09:00:57.861Z |

## Summary
| Metric | Value |
|--------|-------|
| Total tasks | 13 |
| Total phases | 5 |
| Within target (≤15 min) | 5 |
| Above target (16–20 min) | 7 |
| Warning (21–30 min) | 1 |
| Split required (>30 min) | 0 |
| Domain distribution | BE: 7, FE: 0, DB: 0, DevOps: 0, INFRA: 1, TEST: 5 |

## User Story Phases

### US-01: Repoint Deterministic Gates and Script Checks to Split Sources

### Commit
feat(FTR-026): repoint deterministic gates and script checks to split sources

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-01-TASK-BE-01 | Recompute the Gate 1 docs digest from split sources, in-memory | pm-phase2.js gains reqIndexPath/specIndexPath local consts (hasReq/hasSpec-detected, falling back to the legacy monolithic paths); the Gate 1 digest re-check recomputes currentDigest from in-memory req-assembler.js/tech-spec-assembler.js subprocess output instead of c.read(file('Requirements.md'))/c.read(file('Tech-Spec.md')) | BE | 15 | — | 1 cmd — [details](#task-US-01-TASK-BE-01) |
| US-01-TASK-BE-03 | Redesign ac-task-matrix.js's output into a coverage-matrix/ subfolder (JSON+MD) | ac-task-matrix.js's CLI requires a 5th featureDir argument and writes coverage-matrix/index.json (full AC<->Task<->Phase<->Tech-Spec-file relation data) and coverage-matrix/index.md (human-readable, with a Must-AC coverage summary and a link to index.json) under it, replacing the single {PREFIX}-AC-Task-Matrix.md file | BE | 18 | — | 1 cmd — [details](#task-US-01-TASK-BE-03) |
| US-01-TASK-BE-02 | Repoint wb-skeleton-check.js/wb-validate.js/ac-task-matrix.js at split index paths | pm-phase2.js's three c.command() calls to wb-skeleton-check.js, wb-validate.js, and ac-task-matrix.js receive reqIndexPath/specIndexPath instead of file('Requirements.md')/file('Tech-Spec.md'); the ac-task-matrix.js call also passes featureDir as its required 5th argument, and the surrounding activity wrapper/gate2_payload are updated for the new coverage-matrix/index.json+index.md output paths | BE | 18 | US-01-TASK-BE-01, US-01-TASK-BE-03 | 2 cmd — [details](#task-US-01-TASK-BE-02) |
| US-01-TASK-TEST-01 | Cover digest parity, repointed call sites, and the legacy fallback | tests/integration/workflow-runtime.test.js has passing tests asserting: (a) the in-memory digest matches pm-phase1.js's own digest for an unchanged real-split fixture, (b) wb-skeleton-check.js/wb-validate.js receive reqIndexPath for a real-split fixture and ac-task-matrix.js receives reqIndexPath/specIndexPath/featureDir with gate2_payload exposing the new coverage-matrix paths, (c) all of the above fall back to the legacy monolithic paths for a feature fixture with no req//spec/ directories | TEST | 24 | US-01-TASK-BE-01, US-01-TASK-BE-02 | 1 cmd — [details](#task-US-01-TASK-TEST-01) |
| US-01-TASK-TEST-02 | Cover ac-task-matrix.js's coverage-matrix/ JSON+MD output | tests/ac-task-matrix.test.js asserts the CLI writes coverage-matrix/index.json+index.md under the given featureDir (creating the subfolder if needed), that index.json matches buildMatrixJson()'s own shape, that index.md contains the Must-AC coverage summary and a link to index.json, and that omitting featureDir exits 1 with a usage message | TEST | 16 | US-01-TASK-BE-03 | 1 cmd — [details](#task-US-01-TASK-TEST-02) |

### US-02: Validate Work Breakdown Semantics Against the Split Requirements Index

### Commit
feat(FTR-026): repoint the semantic work-breakdown validator to the split Requirements index

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-02-TASK-BE-01 | Read req/index.md in the semantic work-breakdown validator | gaia-validate-work-breakdown-semantic.md's Step 2 reads req/index.md (falling back to {PREFIX}-Requirements.md for a legacy feature); pm-phase2.js's dispatch call's prompt second line changes from file('Requirements.md') to reqIndexPath | BE | 12 | US-01-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-BE-01) |
| US-02-TASK-TEST-01 | Cover the semantic validator split-source prompt path | tests/integration/workflow-runtime.test.js asserts the gaia.agent.planner.validate-work-breakdown mock dispatch receives reqIndexPath for a real-split fixture and the legacy path for a legacy fixture | TEST | 14 | US-02-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-TEST-01) |

### US-03: Generate the Work Breakdown Skeleton From Split Sources

### Commit
feat(FTR-026): generate the Work Breakdown skeleton from split sources

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-03-TASK-BE-01 | Generate the Work Breakdown skeleton from split req//spec/ sources with targeted drilldown | gaia-generate-work-breakdown.md's Step 1 reads req/index.md+spec/index.md first for a real-split feature (falling back to the two monolithic files for a legacy feature), drilling into req/use-cases/*.md/spec/components/*.md only as needed via its existing Read/Glob/Grep tools; steps 2 onward are unchanged | BE | 18 | — | 1 cmd — [details](#task-US-03-TASK-BE-01) |

### US-04: Slice Tech-Spec Content for Per-Task Detail Generation

### Commit
feat(FTR-026): slice Tech-Spec content per task instead of inlining the full spec

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-04-TASK-BE-01 | Compute a per-task Tech-Spec excerpt from AC-matched components | pm-phase2.js gains a local parseComponentsTableLocal(specIndexContent) + buildTaskTechSpecExcerpt(components, task, specDir) pair, wired into the per-task dispatch loop in place of c.read(file('Tech-Spec.md')); a task whose acceptanceCriteria matches a component's Addresses column receives only that component's body, with a full-Components-table fallback when nothing matches | BE | 20 | US-01-TASK-BE-01 | 1 cmd — [details](#task-US-04-TASK-BE-01) |
| US-04-TASK-BE-02 | Describe the AC-matched Tech-Spec excerpt contract in the per-task agent | gaia-generate-work-breakdown-task.md's Input §2 wording changes from "the relevant Tech-Spec excerpt for this task's domain" to naming the actual Addresses-column matching mechanism and documenting the full-Components-table fallback case | BE | 10 | US-04-TASK-BE-01 | 1 cmd — [details](#task-US-04-TASK-BE-02) |
| US-04-TASK-TEST-01 | Cover matched and fallback per-task Tech-Spec excerpts | tests/integration/workflow-runtime.test.js asserts a task whose acceptanceCriteria matches exactly one component's Addresses column receives only that component's body, and a task matching no component receives the full Components table | TEST | 20 | US-04-TASK-BE-01, US-04-TASK-BE-02 | 1 cmd — [details](#task-US-04-TASK-TEST-01) |

### US-05: Remove the Automatic Bridge Step

### Commit
refactor(FTR-026): remove the automatic Requirements/Tech-Spec bridge step

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-05-TASK-INFRA-01 | Remove the now-dead bridge-requirements-tech-spec step | pm-phase2.js's bridge-requirements-tech-spec activity (and the automatic file('Requirements.md')/file('Tech-Spec.md') writes it performed) is deleted entirely; no call site in this file depends on an assembled monolithic file existing on disk for a real-split feature | INFRA | 10 | US-01-TASK-BE-01, US-01-TASK-BE-02, US-02-TASK-BE-01, US-03-TASK-BE-01, US-04-TASK-BE-01 | 1 cmd — [details](#task-US-05-TASK-INFRA-01) |
| US-05-TASK-TEST-01 | Cover bridge-step removal and run the full regression suite | tests/integration/workflow-runtime.test.js asserts 'bridge-requirements-tech-spec' no longer appears in c.tokenLedger's activity list and that no {PREFIX}-Requirements.md/{PREFIX}-Tech-Spec.md file is written for a real-split fixture; full npm test suite passes | TEST | 18 | US-05-TASK-INFRA-01 | 2 cmd — [details](#task-US-05-TASK-TEST-01) |

## Task Details

> Authoritative per-task detail. Every field is rendered integrally so this document, together with the dispatch CSV, is a complete deliverable requiring no separate JSON. Verification commands are preserved **verbatim** in fenced code blocks — operators such as `||`, shell pipes `|`, and regex alternations (`grep -E 'a|b|c'`) survive byte-for-byte. Each command is an independent fenced block.

<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Recompute the Gate 1 docs digest from split sources, in-memory
- **Outcome:** pm-phase2.js gains reqIndexPath/specIndexPath local consts (hasReq/hasSpec-detected, falling back to the legacy monolithic paths); the Gate 1 digest re-check recomputes currentDigest from in-memory req-assembler.js/tech-spec-assembler.js subprocess output instead of c.read(file('Requirements.md'))/c.read(file('Tech-Spec.md'))
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-02
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** pm-phase2
- **Commit subject:** recompute Gate 1 docs digest from split sources in-memory

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "digest"
```

<a id="task-US-01-TASK-BE-03"></a>
### US-01-TASK-BE-03

- **Task ID:** US-01-TASK-BE-03
- **Title:** Redesign ac-task-matrix.js's output into a coverage-matrix/ subfolder (JSON+MD)
- **Outcome:** ac-task-matrix.js's CLI requires a 5th featureDir argument and writes coverage-matrix/index.json (full AC<->Task<->Phase<->Tech-Spec-file relation data) and coverage-matrix/index.md (human-readable, with a Must-AC coverage summary and a link to index.json) under it, replacing the single {PREFIX}-AC-Task-Matrix.md file
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-03, AC-10
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** ac-task-matrix
- **Commit subject:** write coverage-matrix/index.json+index.md under an explicit feature directory

**Verification commands:**

```
npm test -- tests/ac-task-matrix.test.js
```

<a id="task-US-01-TASK-BE-02"></a>
### US-01-TASK-BE-02

- **Task ID:** US-01-TASK-BE-02
- **Title:** Repoint wb-skeleton-check.js/wb-validate.js/ac-task-matrix.js at split index paths
- **Outcome:** pm-phase2.js's three c.command() calls to wb-skeleton-check.js, wb-validate.js, and ac-task-matrix.js receive reqIndexPath/specIndexPath instead of file('Requirements.md')/file('Tech-Spec.md'); the ac-task-matrix.js call also passes featureDir as its required 5th argument, and the surrounding activity wrapper/gate2_payload are updated for the new coverage-matrix/index.json+index.md output paths
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01, US-01-TASK-BE-03
- **Acceptance criteria:** AC-03
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** pm-phase2
- **Commit subject:** repoint wb-skeleton-check/wb-validate/ac-task-matrix at split index paths

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "wb-skeleton-check"
```

```
npm test -- tests/integration/workflow-runtime.test.js -t "ac-task-matrix"
```

<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Cover digest parity, repointed call sites, and the legacy fallback
- **Outcome:** tests/integration/workflow-runtime.test.js has passing tests asserting: (a) the in-memory digest matches pm-phase1.js's own digest for an unchanged real-split fixture, (b) wb-skeleton-check.js/wb-validate.js receive reqIndexPath for a real-split fixture and ac-task-matrix.js receives reqIndexPath/specIndexPath/featureDir with gate2_payload exposing the new coverage-matrix paths, (c) all of the above fall back to the legacy monolithic paths for a feature fixture with no req//spec/ directories
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01, US-01-TASK-BE-02
- **Acceptance criteria:** AC-02, AC-03, AC-07
- **Estimate — agent minutes:** 24
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** Covers three related call sites (digest, wb-skeleton-check/wb-validate, ac-task-matrix) plus their shared legacy-fallback path in one file-focused test task, rather than three near-identical test tasks that would each re-set-up the same two fixtures.
- **Commit type:** test
- **Commit scope:** pm-phase2
- **Commit subject:** cover digest parity, repointed call sites, and legacy fallback

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js
```

<a id="task-US-01-TASK-TEST-02"></a>
### US-01-TASK-TEST-02

- **Task ID:** US-01-TASK-TEST-02
- **Title:** Cover ac-task-matrix.js's coverage-matrix/ JSON+MD output
- **Outcome:** tests/ac-task-matrix.test.js asserts the CLI writes coverage-matrix/index.json+index.md under the given featureDir (creating the subfolder if needed), that index.json matches buildMatrixJson()'s own shape, that index.md contains the Must-AC coverage summary and a link to index.json, and that omitting featureDir exits 1 with a usage message
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-03
- **Acceptance criteria:** AC-03, AC-10
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** ac-task-matrix
- **Commit subject:** cover the coverage-matrix/ JSON+MD output

**Verification commands:**

```
npm test -- tests/ac-task-matrix.test.js
```

<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Read req/index.md in the semantic work-breakdown validator
- **Outcome:** gaia-validate-work-breakdown-semantic.md's Step 2 reads req/index.md (falling back to {PREFIX}-Requirements.md for a legacy feature); pm-phase2.js's dispatch call's prompt second line changes from file('Requirements.md') to reqIndexPath
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-04
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 16000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** pm-phase2
- **Commit subject:** read req/index.md in the semantic work-breakdown validator

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "semantic"
```

<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Cover the semantic validator split-source prompt path
- **Outcome:** tests/integration/workflow-runtime.test.js asserts the gaia.agent.planner.validate-work-breakdown mock dispatch receives reqIndexPath for a real-split fixture and the legacy path for a legacy fixture
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-04, AC-07
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase2
- **Commit subject:** cover the semantic validator split-source prompt path

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js
```

<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Generate the Work Breakdown skeleton from split req//spec/ sources with targeted drilldown
- **Outcome:** gaia-generate-work-breakdown.md's Step 1 reads req/index.md+spec/index.md first for a real-split feature (falling back to the two monolithic files for a legacy feature), drilling into req/use-cases/*.md/spec/components/*.md only as needed via its existing Read/Glob/Grep tools; steps 2 onward are unchanged
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-05
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** gaia-generate-work-breakdown
- **Commit subject:** read split req/spec index files with targeted per-item drilldown

**Verification commands:**

```
echo "prompt-only change — no automated test; see Tech-Spec §10 for rationale"
```

<a id="task-US-04-TASK-BE-01"></a>
### US-04-TASK-BE-01

- **Task ID:** US-04-TASK-BE-01
- **Title:** Compute a per-task Tech-Spec excerpt from AC-matched components
- **Outcome:** pm-phase2.js gains a local parseComponentsTableLocal(specIndexContent) + buildTaskTechSpecExcerpt(components, task, specDir) pair, wired into the per-task dispatch loop in place of c.read(file('Tech-Spec.md')); a task whose acceptanceCriteria matches a component's Addresses column receives only that component's body, with a full-Components-table fallback when nothing matches
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-06
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** pm-phase2
- **Commit subject:** compute a per-task Tech-Spec excerpt from AC-matched components

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "Tech-Spec excerpt"
```

<a id="task-US-04-TASK-BE-02"></a>
### US-04-TASK-BE-02

- **Task ID:** US-04-TASK-BE-02
- **Title:** Describe the AC-matched Tech-Spec excerpt contract in the per-task agent
- **Outcome:** gaia-generate-work-breakdown-task.md's Input §2 wording changes from "the relevant Tech-Spec excerpt for this task's domain" to naming the actual Addresses-column matching mechanism and documenting the full-Components-table fallback case
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-04-TASK-BE-01
- **Acceptance criteria:** AC-06
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** docs
- **Commit scope:** gaia-generate-work-breakdown-task
- **Commit subject:** describe the AC-matched Tech-Spec excerpt contract

**Verification commands:**

```
echo "prompt-only change — no automated test; verified by review against US-04-TASK-BE-01's implementation"
```

<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Cover matched and fallback per-task Tech-Spec excerpts
- **Outcome:** tests/integration/workflow-runtime.test.js asserts a task whose acceptanceCriteria matches exactly one component's Addresses column receives only that component's body, and a task matching no component receives the full Components table
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-01, US-04-TASK-BE-02
- **Acceptance criteria:** AC-06, AC-07
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase2
- **Commit subject:** cover matched and fallback per-task Tech-Spec excerpts

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js
```

<a id="task-US-05-TASK-INFRA-01"></a>
### US-05-TASK-INFRA-01

- **Task ID:** US-05-TASK-INFRA-01
- **Title:** Remove the now-dead bridge-requirements-tech-spec step
- **Outcome:** pm-phase2.js's bridge-requirements-tech-spec activity (and the automatic file('Requirements.md')/file('Tech-Spec.md') writes it performed) is deleted entirely; no call site in this file depends on an assembled monolithic file existing on disk for a real-split feature
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01, US-01-TASK-BE-02, US-02-TASK-BE-01, US-03-TASK-BE-01, US-04-TASK-BE-01
- **Acceptance criteria:** AC-01
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** refactor
- **Commit scope:** pm-phase2
- **Commit subject:** remove the now-dead bridge-requirements-tech-spec step

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "bridge"
```

<a id="task-US-05-TASK-TEST-01"></a>
### US-05-TASK-TEST-01

- **Task ID:** US-05-TASK-TEST-01
- **Title:** Cover bridge-step removal and run the full regression suite
- **Outcome:** tests/integration/workflow-runtime.test.js asserts 'bridge-requirements-tech-spec' no longer appears in c.tokenLedger's activity list and that no {PREFIX}-Requirements.md/{PREFIX}-Tech-Spec.md file is written for a real-split fixture; full npm test suite passes
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-05-TASK-INFRA-01
- **Acceptance criteria:** AC-01, AC-08, AC-09
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase2
- **Commit subject:** cover bridge-step removal and run the full regression suite

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
| BE | 7 | 3 | 4 | 0 | 0 |
| FE | 0 | 0 | 0 | 0 | 0 |
| DB | 0 | 0 | 0 | 0 | 0 |
| DevOps | 0 | 0 | 0 | 0 | 0 |
| INFRA | 1 | 1 | 0 | 0 | 0 |
| TEST | 5 | 1 | 3 | 1 | 0 |
| **Total** | **13** | **5** | **7** | **1** | **0** |
