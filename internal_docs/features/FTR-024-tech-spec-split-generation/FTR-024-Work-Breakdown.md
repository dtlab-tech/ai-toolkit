# Work Breakdown — FTR-024

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-024 |
| Schema | v2 |
| Generated | 2026-10-16T13:56:45.270Z |

## Summary
| Metric | Value |
|--------|-------|
| Total tasks | 9 |
| Total phases | 4 |
| Within target (≤15 min) | 2 |
| Above target (16–20 min) | 5 |
| Warning (21–30 min) | 2 |
| Split required (>30 min) | 0 |
| Domain distribution | BE: 5, FE: 0, DB: 0, DevOps: 0, INFRA: 2, TEST: 2 |

## User Story Phases

### US-01: As the coordinator, I want the Tech-Spec skeleton-generation agent to emit every feature-wide section plus the Components index, so that one bounded call fixes the whole component graph before any per-component detail is generated

### Commit
feat(FTR-024): implement US-01 Tech-Spec skeleton agent

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-01-TASK-INFRA-01 | Repurpose gaia-generate-tech-spec.md to emit the skeleton only | src/claude/agents/gaia-generate-tech-spec.md's Output Structure keeps Sections 1, 2, 6, 7, 8, 11, 12 verbatim; Section 9's two File Inventory tables gain a Domain column (BE FE DB DevOps INFRA TEST) between Purpose-or-Change and Addresses, and a Spec column after Addresses; Sections 3, 4, 5, 10 are removed from this agent's own output; Process step updated to describe the reduced, skeleton-only scope | INFRA | 16 | — | 1 cmd — [details](#task-US-01-TASK-INFRA-01) |

### US-03: As the coordinator, I want a per-component detail-generation agent, so that each file's own design is produced by its own bounded call instead of inline inside the skeleton

### Commit
feat(FTR-024): implement US-03 per-component detail agent

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-03-TASK-INFRA-01 | Create gaia-generate-tech-spec-component.md agent and register it in the agent catalog | src/claude/agents/gaia-generate-tech-spec-component.md exists (haiku, no Write tool) taking one component's index-table row plus the compact full component index plus the relevant Requirements/feature.md excerpt as input, returning that component's Change/Algorithm-or-Schema/Tests detail in the component-template.md shape; lib/agent-registry.js's CATALOG gains the matching gaia.agent.planner.tech-spec-component entry (the lesson from FTR-021/022: a new agent not registered here hard-fails the instant it is actually dispatched) | INFRA | 16 | — | 1 cmd — [details](#task-US-03-TASK-INFRA-01) |

### US-05: As the coordinator, I want a loader/renderer that reassembles spec/index.md and spec/components/*.md back into the unchanged 12-section Tech-Spec document, so that every downstream consumer keeps reading {PREFIX}-Tech-Spec.md exactly as before

### Commit
feat(FTR-024): implement US-05 tech-spec assembler

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-05-TASK-BE-01 | Create tech-spec-assembler.js | src/claude/scripts/tech-spec-assembler.js exists exporting loadTechSpec(inputPath) (file input returns content unchanged; directory input reads spec/index.md, parses the Components table including its Domain/Spec columns, reads each component file, and reconstructs the 12-section document: Section 9 reduced back to 3 columns, Sections 3/4/5 populated per Domain routing under per-component subheadings, Section 10 built from every component's own Tests subsection), plus a require.main CLI entry point | BE | 24 | — | 1 cmd — [details](#task-US-05-TASK-BE-01) |
| US-05-TASK-TEST-01 | Unit tests for tech-spec-assembler.js | tests/tech-spec-assembler.test.js exists covering: a hand-built spec/ fixture with at least one BE, one FE, and one unclassified-domain component (asserting all 12 sections present, Section 9 reduced to 3 columns, Sections 3/4/5 populated per Domain routing, Section 10 containing every component's Tests subsection in order), the legacy monolithic-file path, missing index.md, missing a referenced component file, and an empty Components table | TEST | 20 | US-05-TASK-BE-01 | 1 cmd — [details](#task-US-05-TASK-TEST-01) |

### US-04: As the coordinator, I want pm-phase1.js to orchestrate the skeleton and per-component passes with resume-by-existence, so that Tech-Spec generation, assembly, and the existing validation/tech-spec-ac-check/Gate-1 flow compose unchanged

### Commit
feat(FTR-024): implement US-04 pm-phase1.js orchestration

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-04-TASK-BE-01 | Implement skeleton-call step with fileSlug collision disambiguation in pm-phase1.js | pm-phase1.js's new generateTechSpec(forceAll) dispatches gaia.agent.planner.tech-spec (no declared worker() output) only when spec/index.md is missing, stale relative to feature.md, or forceAll is set; the coordinator deterministically disambiguates any duplicate fileSlug across the skeleton's Components table (prepending path segments until unique) before writing spec/index.md via c.writeOutput | BE | 18 | US-01-TASK-INFRA-01 | 1 cmd — [details](#task-US-04-TASK-BE-01) |
| US-04-TASK-BE-02 | Move and repoint the structural pre-check at the Tech-Spec skeleton | generateTechSpec() runs tech-spec-graph-checks.js (unmodified) via c.command(['run-asset', ...]) against spec/index.md immediately after the skeleton-call step and before any per-component dispatch; the existing tech-spec-ac-check activity block (FTR-023) is moved from its old post-generation position into this earlier, pre-dispatch position | BE | 14 | US-04-TASK-BE-01 | 1 cmd — [details](#task-US-04-TASK-BE-02) |
| US-04-TASK-BE-03 | Implement per-component generation loop with resume-by-existence in pm-phase1.js | generateTechSpec() parses spec/index.md's Components table, and for each row whose spec/components/{fileSlug} does not already exist (or unconditionally if the skeleton was just regenerated), dispatches gaia.agent.planner.tech-spec-component via buildComponentPrompt() and writes the response via c.writeOutput; rows whose file already exists (and the skeleton was not regenerated) are skipped without dispatch | BE | 20 | US-03-TASK-INFRA-01, US-04-TASK-BE-02 | 1 cmd — [details](#task-US-04-TASK-BE-03) |
| US-04-TASK-BE-04 | Wire generateTechSpec() to assemble via tech-spec-assembler.js and replace the old techSpec() call sites | generateTechSpec() calls tech-spec-assembler.js via c.command(['run-asset', ...]) against the spec/ directory and writes the assembled document to file('Tech-Spec') via c.writeOutput; the old techSpec = () => c.worker(specId, featurePath, { outputs: [...] }) binding is removed, and both its call sites (initial generation, needsTechSpecFix branch) now call generateTechSpec(force) / generateTechSpec(true) respectively, mirroring generateRequirements's exact pattern | BE | 14 | US-05-TASK-BE-01, US-04-TASK-BE-03 | 1 cmd — [details](#task-US-04-TASK-BE-04) |
| US-04-TASK-TEST-01 | Integration tests: pm-phase1 Tech-Spec resume-by-existence, fileSlug collisions, and existing-suite regression | tests/integration/workflow-runtime.test.js's shared Tech-Spec mock fixture is updated to the new skeleton+per-component contract and every existing Tech-Spec-related pm-phase1 test (truncation, needsTechSpecFix, tech-spec-ac-check dangling-reference rejection) passes against the new path; new tests assert resume-by-existence dispatches only missing components, and that two components with colliding basenames receive distinct, deterministically-disambiguated fileSlug values | TEST | 22 | US-04-TASK-BE-04 | 1 cmd — [details](#task-US-04-TASK-TEST-01) |

## Task Details

> Authoritative per-task detail. Every field is rendered integrally so this document, together with the dispatch CSV, is a complete deliverable requiring no separate JSON. Verification commands are preserved **verbatim** in fenced code blocks — operators such as `||`, shell pipes `|`, and regex alternations (`grep -E 'a|b|c'`) survive byte-for-byte. Each command is an independent fenced block.

<a id="task-US-01-TASK-INFRA-01"></a>
### US-01-TASK-INFRA-01

- **Task ID:** US-01-TASK-INFRA-01
- **Title:** Repurpose gaia-generate-tech-spec.md to emit the skeleton only
- **Outcome:** src/claude/agents/gaia-generate-tech-spec.md's Output Structure keeps Sections 1, 2, 6, 7, 8, 11, 12 verbatim; Section 9's two File Inventory tables gain a Domain column (BE|FE|DB|DevOps|INFRA|TEST) between Purpose-or-Change and Addresses, and a Spec column after Addresses; Sections 3, 4, 5, 10 are removed from this agent's own output; Process step updated to describe the reduced, skeleton-only scope
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-01
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** repurpose gaia-generate-tech-spec.md to emit skeleton only

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter
```

<a id="task-US-03-TASK-INFRA-01"></a>
### US-03-TASK-INFRA-01

- **Task ID:** US-03-TASK-INFRA-01
- **Title:** Create gaia-generate-tech-spec-component.md agent and register it in the agent catalog
- **Outcome:** src/claude/agents/gaia-generate-tech-spec-component.md exists (haiku, no Write tool) taking one component's index-table row plus the compact full component index plus the relevant Requirements/feature.md excerpt as input, returning that component's Change/Algorithm-or-Schema/Tests detail in the component-template.md shape; lib/agent-registry.js's CATALOG gains the matching gaia.agent.planner.tech-spec-component entry (the lesson from FTR-021/022: a new agent not registered here hard-fails the instant it is actually dispatched)
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-02
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** The new agent file and its registry entry are one task because an agent that exists but isn't registered fails at the first real dispatch, not at review time — treating them as separable risks shipping one without the other, exactly the gap found twice before in this lineage (FTR-021, FTR-022).
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add gaia-generate-tech-spec-component.md per-component detail agent

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter
```

<a id="task-US-05-TASK-BE-01"></a>
### US-05-TASK-BE-01

- **Task ID:** US-05-TASK-BE-01
- **Title:** Create tech-spec-assembler.js
- **Outcome:** src/claude/scripts/tech-spec-assembler.js exists exporting loadTechSpec(inputPath) (file input returns content unchanged; directory input reads spec/index.md, parses the Components table including its Domain/Spec columns, reads each component file, and reconstructs the 12-section document: Section 9 reduced back to 3 columns, Sections 3/4/5 populated per Domain routing under per-component subheadings, Section 10 built from every component's own Tests subsection), plus a require.main CLI entry point
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-04, AC-06
- **Estimate — agent minutes:** 24
- **Estimate — tokens:** 38000
- **Output count:** 1
- **Grouping rationale:** The table parser, the per-component detail parser, and the section-routing/splice logic have no independent meaning on their own — `loadTechSpec` is not callable until all three exist together, the same reasoning every prior assembler task in this lineage applied to its own single-module scope.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add tech-spec-assembler.js with directory/legacy loader and domain-routed section rebuild

**Verification commands:**

```
node --check src/claude/scripts/tech-spec-assembler.js
```

<a id="task-US-05-TASK-TEST-01"></a>
### US-05-TASK-TEST-01

- **Task ID:** US-05-TASK-TEST-01
- **Title:** Unit tests for tech-spec-assembler.js
- **Outcome:** tests/tech-spec-assembler.test.js exists covering: a hand-built spec/ fixture with at least one BE, one FE, and one unclassified-domain component (asserting all 12 sections present, Section 9 reduced to 3 columns, Sections 3/4/5 populated per Domain routing, Section 10 containing every component's Tests subsection in order), the legacy monolithic-file path, missing index.md, missing a referenced component file, and an empty Components table
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-05-TASK-BE-01
- **Acceptance criteria:** AC-04, AC-05, AC-06, AC-08
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for tech-spec-assembler.js

**Verification commands:**

```
npx jest --testPathPattern=tests/tech-spec-assembler.test.js
```

<a id="task-US-04-TASK-BE-01"></a>
### US-04-TASK-BE-01

- **Task ID:** US-04-TASK-BE-01
- **Title:** Implement skeleton-call step with fileSlug collision disambiguation in pm-phase1.js
- **Outcome:** pm-phase1.js's new generateTechSpec(forceAll) dispatches gaia.agent.planner.tech-spec (no declared worker() output) only when spec/index.md is missing, stale relative to feature.md, or forceAll is set; the coordinator deterministically disambiguates any duplicate fileSlug across the skeleton's Components table (prepending path segments until unique) before writing spec/index.md via c.writeOutput
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-INFRA-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add skeleton-call step with fileSlug disambiguation to pm-phase1.js

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```

<a id="task-US-04-TASK-BE-02"></a>
### US-04-TASK-BE-02

- **Task ID:** US-04-TASK-BE-02
- **Title:** Move and repoint the structural pre-check at the Tech-Spec skeleton
- **Outcome:** generateTechSpec() runs tech-spec-graph-checks.js (unmodified) via c.command(['run-asset', ...]) against spec/index.md immediately after the skeleton-call step and before any per-component dispatch; the existing tech-spec-ac-check activity block (FTR-023) is moved from its old post-generation position into this earlier, pre-dispatch position
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-04-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** repoint tech-spec-ac-check at the Tech-Spec skeleton, before per-component dispatch

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```

<a id="task-US-04-TASK-BE-03"></a>
### US-04-TASK-BE-03

- **Task ID:** US-04-TASK-BE-03
- **Title:** Implement per-component generation loop with resume-by-existence in pm-phase1.js
- **Outcome:** generateTechSpec() parses spec/index.md's Components table, and for each row whose spec/components/{fileSlug} does not already exist (or unconditionally if the skeleton was just regenerated), dispatches gaia.agent.planner.tech-spec-component via buildComponentPrompt() and writes the response via c.writeOutput; rows whose file already exists (and the skeleton was not regenerated) are skipped without dispatch
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-INFRA-01, US-04-TASK-BE-02
- **Acceptance criteria:** AC-03
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add per-component generation loop with resume-by-existence to pm-phase1.js

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```

<a id="task-US-04-TASK-BE-04"></a>
### US-04-TASK-BE-04

- **Task ID:** US-04-TASK-BE-04
- **Title:** Wire generateTechSpec() to assemble via tech-spec-assembler.js and replace the old techSpec() call sites
- **Outcome:** generateTechSpec() calls tech-spec-assembler.js via c.command(['run-asset', ...]) against the spec/ directory and writes the assembled document to file('Tech-Spec') via c.writeOutput; the old techSpec = () => c.worker(specId, featurePath, { outputs: [...] }) binding is removed, and both its call sites (initial generation, needsTechSpecFix branch) now call generateTechSpec(force) / generateTechSpec(true) respectively, mirroring generateRequirements's exact pattern
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-05-TASK-BE-01, US-04-TASK-BE-03
- **Acceptance criteria:** AC-07
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** wire pm-phase1.js Tech-Spec generation to assemble via tech-spec-assembler.js

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```

<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Integration tests: pm-phase1 Tech-Spec resume-by-existence, fileSlug collisions, and existing-suite regression
- **Outcome:** tests/integration/workflow-runtime.test.js's shared Tech-Spec mock fixture is updated to the new skeleton+per-component contract and every existing Tech-Spec-related pm-phase1 test (truncation, needsTechSpecFix, tech-spec-ac-check dangling-reference rejection) passes against the new path; new tests assert resume-by-existence dispatches only missing components, and that two components with colliding basenames receive distinct, deterministically-disambiguated fileSlug values
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-04
- **Acceptance criteria:** AC-03, AC-08
- **Estimate — agent minutes:** 22
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** Fixing the shared pm-phase1 mock fixtures (the fallout this exact wiring pattern caused twice before, in FTR-021 and FTR-023) and adding the two new resume/collision tests are inseparable: the new tests cannot run against the old fixture shape, and verifying the fixture fix means re-running the whole existing Tech-Spec-related suite, not a separable sub-task.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add pm-phase1 tech-spec resume and fileSlug-collision integration tests

**Verification commands:**

```
npx jest --testPathPattern=tests/integration/workflow-runtime.test.js
```

## Statistics

| Domain | Count | Target | Above | Warning | Split |
|--------|-------|--------|-------|---------|-------|
| BE | 5 | 2 | 2 | 1 | 0 |
| FE | 0 | 0 | 0 | 0 | 0 |
| DB | 0 | 0 | 0 | 0 | 0 |
| DevOps | 0 | 0 | 0 | 0 | 0 |
| INFRA | 2 | 0 | 2 | 0 | 0 |
| TEST | 2 | 0 | 1 | 1 | 0 |
| **Total** | **9** | **2** | **5** | **2** | **0** |
