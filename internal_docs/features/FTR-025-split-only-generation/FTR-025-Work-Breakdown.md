# Work Breakdown — FTR-025

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-025 |
| Schema | v2 |
| Generated | 2026-10-16T21:01:53.896Z |

## Summary
| Metric | Value |
|--------|-------|
| Total tasks | 13 |
| Total phases | 4 |
| Within target (≤15 min) | 6 |
| Above target (16–20 min) | 4 |
| Warning (21–30 min) | 3 |
| Split required (>30 min) | 0 |
| Domain distribution | BE: 5, FE: 0, DB: 0, DevOps: 0, INFRA: 5, TEST: 3 |

## User Story Phases

### US-01: As the coordinator, I want Requirements/Tech-Spec generation to stop writing an assembled file and validate/digest from in-memory assembled content instead, so that the split sources become the only thing generation ever produces

### Commit
feat(FTR-025): stop pm-phase1.js from writing assembled Requirements/Tech-Spec; validate and digest in-memory

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-01-TASK-BE-01 | Stop writing assembled Requirements/Tech-Spec; repoint regen/truncation/AC-check gates | pm-phase1.js's generateRequirements()/generateTechSpec() no longer call c.writeOutput(file('Requirements'/'Tech-Spec'), assembled...); the top-level regen-freshness gates become fresh(reqIndexPath)/fresh(specIndexPath, [featurePath, reqIndexPath]); assertCompleteSections reads reqIndexPath/specIndexPath; tech-spec-ac-check's Requirements argument becomes reqIndexPath | BE | 20 | — | 2 cmd — [details](#task-US-01-TASK-BE-01) |
| US-01-TASK-BE-02 | Compute in-memory assembly for the Gate 1 validator prompt and docsDigest | pm-phase1.js gains assembleRequirements()/assembleTechSpec() helpers (same req-assembler.js/tech-spec-assembler.js subprocess calls, never written to disk); the Gate 1 validator's prompt is built as featurePath + inlined 'Requirements:'/'Tech-Spec:' labeled text instead of just featurePath; docsDigest = c.hash(assembledRequirements + NUL + assembledTechSpec); both are recomputed after any needsRequirementsFix/needsTechSpecFix revision cycle | BE | 22 | US-01-TASK-BE-01 | 2 cmd — [details](#task-US-01-TASK-BE-02) |
| US-01-TASK-INFRA-01 | Update gaia-validate-feature-docs for the inlined-prompt contract | gaia-validate-feature-docs.md's Phase 1 is rewritten: the agent is told Requirements/Tech-Spec text is supplied inlined in its prompt under 'Requirements:'/'Tech-Spec:' labels, and explicitly instructed not to attempt to locate or Read {PREFIX}-Requirements.md/{PREFIX}-Tech-Spec.md on disk; the missing-input failure wording changes from 'input document is missing' to 'inlined document's text is empty or missing', same valid:false outcome; Phase 3's subsection headings are softened to 'against the inlined Requirements/Tech-Spec text' | INFRA | 12 | US-01-TASK-BE-02 | 1 cmd — [details](#task-US-01-TASK-INFRA-01) |
| US-01-TASK-INFRA-02 | Repoint gaia-generate-tech-spec's traceability read at req/index.md | gaia-generate-tech-spec.md's Process step 2 changes from 'Read {PREFIX}-Requirements.md if it exists (for traceability)' to 'Read req/index.md if it exists (for traceability)'; the Guidelines' AC-citation rule is updated the same way, from '{PREFIX}-Requirements.md's own AC table' to 'req/index.md's own AC table' | INFRA | 8 | — | 1 cmd — [details](#task-US-01-TASK-INFRA-02) |
| US-01-TASK-TEST-01 | Integration tests: pm-phase1 split-only generation and inlined-prompt validation | tests/integration/workflow-runtime.test.js: every existing Requirements/Tech-Spec-related pm-phase1 test is updated to never expect an assembled file on disk; new tests assert no {PREFIX}-Requirements.md/{PREFIX}-Tech-Spec.md exists after a clean pm-phase1 run, that the validator's received prompt contains the inlined Requirements/Tech-Spec text, that docs_digest stays sha256-formatted/deterministic/content-sensitive over the split sources, and that a needsRequirementsFix/needsTechSpecFix cycle re-assembles before the next validator dispatch | TEST | 24 | US-01-TASK-BE-01, US-01-TASK-BE-02, US-01-TASK-INFRA-01, US-01-TASK-INFRA-02 | 1 cmd — [details](#task-US-01-TASK-TEST-01) |

### US-02: As a toolkit operator, I want a single on-demand command to assemble any of the split documents into one file, so that I can decide for myself when a combined view is worth having

### Commit
feat(FTR-025): add assemble-docs.js and /assemble-docs for on-demand single-file views

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-02-TASK-BE-01 | Create assemble-docs.js | src/claude/scripts/assemble-docs.js exists exporting assembleReq/assembleSpec/assembleWbs(featureDir, prefix), requiring req-assembler.js's loadRequirements and tech-spec-assembler.js's loadTechSpec directly (in-process, no subprocess) and shelling out to wb-render.js for wbs (CLI-only); a require.main CLI entry point takes <feature-dir> <prefix> [req spec wbs all], defaulting to all, exits 1 for a missing/unknown argument and 2 (naming the exact expected path) when a requested split source directory doesn't exist | BE | 18 | — | 1 cmd — [details](#task-US-02-TASK-BE-01) |
| US-02-TASK-INFRA-01 | Create the /assemble-docs command | src/claude/commands/assemble-docs.md exists, mirroring check-docs.md/feature-status.md's shape: locates the feature folder from $ARGUMENTS, extracts the prefix, determines 'which' from the second argument (default all), runs node .claude/scripts/assemble-docs.js <feature-dir> <prefix> <which> via Bash, and reports exactly what was written or surfaces the script's error verbatim | INFRA | 8 | US-02-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-INFRA-01) |
| US-02-TASK-TEST-01 | Unit tests for assemble-docs.js | tests/assemble-docs.test.js exists covering: assembleReq/assembleSpec/assembleWbs against real split fixtures producing output identical to calling the underlying assemblers/wb-render.js directly; CLI 'all' writing all five files; CLI with an unknown 'which' exiting 1; CLI for req/spec/wbs against a feature directory missing the matching split directory exiting 2 and naming the exact expected path; missing required CLI arguments exiting 1 | TEST | 18 | US-02-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-TEST-01) |

### US-03: As the pm-phase2 coordinator, I want to transparently bridge the split sources into the monolithic shape my own unmodified internals still need, so that the pipeline keeps working with no new required manual step

### Commit
feat(FTR-025): add pm-phase2.js's transparent Requirements/Tech-Spec bridge; remove automatic wb-render.js call

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-03-TASK-BE-01 | Add pm-phase2.js's Requirements/Tech-Spec bridge step | pm-phase2.js gains a new c.activity('bridge-requirements-tech-spec', ...) at its own entry, before the existing Gate 1 approval check: if req/ or spec/ exists for this feature, it assembles (same req-assembler.js/tech-spec-assembler.js subprocess calls) and writes {PREFIX}-Requirements.md/{PREFIX}-Tech-Spec.md; if neither split directory exists, it leaves any pre-existing legacy monolithic files untouched and does nothing | BE | 20 | US-01-TASK-BE-01 | 2 cmd — [details](#task-US-03-TASK-BE-01) |
| US-03-TASK-BE-02 | Remove pm-phase2.js's automatic wb-render.js call | pm-phase2.js's c.activity('wb-render', ...) block is removed entirely; {PREFIX}-Work-Breakdown.md/.csv are no longer produced as a side effect of a pm-phase2 run; gate2_payload drops its renderer_result/renderer_failed keys (confirmed nothing downstream reads them) | BE | 10 | US-03-TASK-BE-01 | 2 cmd — [details](#task-US-03-TASK-BE-02) |
| US-03-TASK-TEST-01 | Integration tests: pm-phase2 bridge step and wb-render removal | tests/integration/workflow-runtime.test.js: new tests assert pm-phase2 writes fresh Requirements/Tech-Spec from real req/+spec/ fixtures before its own Gate 1 digest check, that a legacy feature (monolithic files only, no req/spec/) leaves the bridge step a no-op, and that pm-phase2 no longer calls wb-render.js nor produces Work-Breakdown.md/.csv as a side effect | TEST | 22 | US-03-TASK-BE-01, US-03-TASK-BE-02 | 1 cmd — [details](#task-US-03-TASK-TEST-01) |

### US-04: Documentation: Gate 1 presentation and feature-status updates

### Commit
docs(FTR-025): update implement-feature/SKILL.md and feature-status.md for the new split-by-default artifact set

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-04-TASK-INFRA-01 | Update implement-feature/SKILL.md's Gate 1 presentation | SKILL.md's Step 2 presentation block uses {requirements.path}/{tech_spec.path} (now req/index.md/spec/index.md) instead of the literal monolithic filenames, adds a line pointing at the new /assemble-docs command, and the Approvals.md template's Gate 1 table rows are updated to the same paths; docs_digest and pm-phase2.js's Gate 1 regex check (heading/approval-marker/digest-line only) are unaffected | INFRA | 10 | US-01-TASK-BE-02, US-03-TASK-BE-02 | 1 cmd — [details](#task-US-04-TASK-INFRA-01) |
| US-04-TASK-INFRA-02 | Update feature-status.md's artifact-presence check | feature-status.md's step 2 checks Requirements/Tech-Spec/Work-Breakdown presence as 'either split shape (req/index.md, spec/index.md, wbs/index.json) or the assembled file', noting which shape was found, instead of assuming the monolithic files always exist | INFRA | 8 | US-01-TASK-BE-01 | 1 cmd — [details](#task-US-04-TASK-INFRA-02) |

## Task Details

> Authoritative per-task detail. Every field is rendered integrally so this document, together with the dispatch CSV, is a complete deliverable requiring no separate JSON. Verification commands are preserved **verbatim** in fenced code blocks — operators such as `||`, shell pipes `|`, and regex alternations (`grep -E 'a|b|c'`) survive byte-for-byte. Each command is an independent fenced block.

<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Stop writing assembled Requirements/Tech-Spec; repoint regen/truncation/AC-check gates
- **Outcome:** pm-phase1.js's generateRequirements()/generateTechSpec() no longer call c.writeOutput(file('Requirements'/'Tech-Spec'), assembled...); the top-level regen-freshness gates become fresh(reqIndexPath)/fresh(specIndexPath, [featurePath, reqIndexPath]); assertCompleteSections reads reqIndexPath/specIndexPath; tech-spec-ac-check's Requirements argument becomes reqIndexPath
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-01, AC-02
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** repoint pm-phase1.js's regen/truncation/AC-check gates at split index files

**Verification commands:**

```
npx jest --testPathPattern=tests/cli/pm-phase1-source.test.js
```

```
node --check src/claude/workflows/pm-phase1.js
```

<a id="task-US-01-TASK-BE-02"></a>
### US-01-TASK-BE-02

- **Task ID:** US-01-TASK-BE-02
- **Title:** Compute in-memory assembly for the Gate 1 validator prompt and docsDigest
- **Outcome:** pm-phase1.js gains assembleRequirements()/assembleTechSpec() helpers (same req-assembler.js/tech-spec-assembler.js subprocess calls, never written to disk); the Gate 1 validator's prompt is built as featurePath + inlined 'Requirements:'/'Tech-Spec:' labeled text instead of just featurePath; docsDigest = c.hash(assembledRequirements + NUL + assembledTechSpec); both are recomputed after any needsRequirementsFix/needsTechSpecFix revision cycle
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-03, AC-04
- **Estimate — agent minutes:** 22
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** compute Requirements/Tech-Spec assembly in-memory for Gate 1 validation and docsDigest

**Verification commands:**

```
npx jest --testPathPattern=tests/cli/pm-phase1-source.test.js
```

```
node --check src/claude/workflows/pm-phase1.js
```

<a id="task-US-01-TASK-INFRA-01"></a>
### US-01-TASK-INFRA-01

- **Task ID:** US-01-TASK-INFRA-01
- **Title:** Update gaia-validate-feature-docs for the inlined-prompt contract
- **Outcome:** gaia-validate-feature-docs.md's Phase 1 is rewritten: the agent is told Requirements/Tech-Spec text is supplied inlined in its prompt under 'Requirements:'/'Tech-Spec:' labels, and explicitly instructed not to attempt to locate or Read {PREFIX}-Requirements.md/{PREFIX}-Tech-Spec.md on disk; the missing-input failure wording changes from 'input document is missing' to 'inlined document's text is empty or missing', same valid:false outcome; Phase 3's subsection headings are softened to 'against the inlined Requirements/Tech-Spec text'
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-02
- **Acceptance criteria:** AC-03
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 16000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** update gaia-validate-feature-docs for the inlined Requirements/Tech-Spec prompt contract

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter/agents.test.js
```

<a id="task-US-01-TASK-INFRA-02"></a>
### US-01-TASK-INFRA-02

- **Task ID:** US-01-TASK-INFRA-02
- **Title:** Repoint gaia-generate-tech-spec's traceability read at req/index.md
- **Outcome:** gaia-generate-tech-spec.md's Process step 2 changes from 'Read {PREFIX}-Requirements.md if it exists (for traceability)' to 'Read req/index.md if it exists (for traceability)'; the Guidelines' AC-citation rule is updated the same way, from '{PREFIX}-Requirements.md's own AC table' to 'req/index.md's own AC table'
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-09
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 10000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** repoint gaia-generate-tech-spec's traceability read at req/index.md

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter/agents.test.js
```

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

**Verification commands:**

```
npx jest --testPathPattern=tests/integration/workflow-runtime.test.js
```

<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Create assemble-docs.js
- **Outcome:** src/claude/scripts/assemble-docs.js exists exporting assembleReq/assembleSpec/assembleWbs(featureDir, prefix), requiring req-assembler.js's loadRequirements and tech-spec-assembler.js's loadTechSpec directly (in-process, no subprocess) and shelling out to wb-render.js for wbs (CLI-only); a require.main CLI entry point takes <feature-dir> <prefix> [req|spec|wbs|all], defaulting to all, exits 1 for a missing/unknown argument and 2 (naming the exact expected path) when a requested split source directory doesn't exist
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-07
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add assemble-docs.js for on-demand single-file Requirements/Tech-Spec/Work-Breakdown views

**Verification commands:**

```
node --check src/claude/scripts/assemble-docs.js
```

<a id="task-US-02-TASK-INFRA-01"></a>
### US-02-TASK-INFRA-01

- **Task ID:** US-02-TASK-INFRA-01
- **Title:** Create the /assemble-docs command
- **Outcome:** src/claude/commands/assemble-docs.md exists, mirroring check-docs.md/feature-status.md's shape: locates the feature folder from $ARGUMENTS, extracts the prefix, determines 'which' from the second argument (default all), runs node .claude/scripts/assemble-docs.js <feature-dir> <prefix> <which> via Bash, and reports exactly what was written or surfaces the script's error verbatim
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-07
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 8000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add /assemble-docs command wrapping assemble-docs.js

**Verification commands:**

```
npx jest --testPathPattern=tests/cli/asset-catalog.test.js
```

<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Unit tests for assemble-docs.js
- **Outcome:** tests/assemble-docs.test.js exists covering: assembleReq/assembleSpec/assembleWbs against real split fixtures producing output identical to calling the underlying assemblers/wb-render.js directly; CLI 'all' writing all five files; CLI with an unknown 'which' exiting 1; CLI for req/spec/wbs against a feature directory missing the matching split directory exiting 2 and naming the exact expected path; missing required CLI arguments exiting 1
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-07, AC-11
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for assemble-docs.js

**Verification commands:**

```
npx jest --testPathPattern=tests/assemble-docs.test.js
```

<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Add pm-phase2.js's Requirements/Tech-Spec bridge step
- **Outcome:** pm-phase2.js gains a new c.activity('bridge-requirements-tech-spec', ...) at its own entry, before the existing Gate 1 approval check: if req/ or spec/ exists for this feature, it assembles (same req-assembler.js/tech-spec-assembler.js subprocess calls) and writes {PREFIX}-Requirements.md/{PREFIX}-Tech-Spec.md; if neither split directory exists, it leaves any pre-existing legacy monolithic files untouched and does nothing
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-05, AC-06
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add pm-phase2.js bridge step assembling Requirements/Tech-Spec from split sources

**Verification commands:**

```
npx jest --testPathPattern=tests/cli/pm-phase2-source.test.js
```

```
node --check src/claude/workflows/pm-phase2.js
```

<a id="task-US-03-TASK-BE-02"></a>
### US-03-TASK-BE-02

- **Task ID:** US-03-TASK-BE-02
- **Title:** Remove pm-phase2.js's automatic wb-render.js call
- **Outcome:** pm-phase2.js's c.activity('wb-render', ...) block is removed entirely; {PREFIX}-Work-Breakdown.md/.csv are no longer produced as a side effect of a pm-phase2 run; gate2_payload drops its renderer_result/renderer_failed keys (confirmed nothing downstream reads them)
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-08
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** remove pm-phase2.js's automatic wb-render.js call

**Verification commands:**

```
npx jest --testPathPattern=tests/cli/pm-phase2-source.test.js
```

```
node --check src/claude/workflows/pm-phase2.js
```

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

**Verification commands:**

```
npx jest --testPathPattern=tests/integration/workflow-runtime.test.js
```

<a id="task-US-04-TASK-INFRA-01"></a>
### US-04-TASK-INFRA-01

- **Task ID:** US-04-TASK-INFRA-01
- **Title:** Update implement-feature/SKILL.md's Gate 1 presentation
- **Outcome:** SKILL.md's Step 2 presentation block uses {requirements.path}/{tech_spec.path} (now req/index.md/spec/index.md) instead of the literal monolithic filenames, adds a line pointing at the new /assemble-docs command, and the Approvals.md template's Gate 1 table rows are updated to the same paths; docs_digest and pm-phase2.js's Gate 1 regex check (heading/approval-marker/digest-line only) are unaffected
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-02, US-03-TASK-BE-02
- **Acceptance criteria:** AC-10
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 10000
- **Output count:** 1
- **Grouping rationale:** Depends on both US-01 (requirements.path/tech_spec.path's new value) and US-03 (the pipeline's post-Gate-1 behavior this step describes) — bundled as one small task since both dependencies must already be resolved before this wording can be written accurately, and editing the same short section twice (once per dependency) would be artificial churn.
- **Commit type:** docs
- **Commit scope:** —
- **Commit subject:** update implement-feature SKILL.md for the new split-by-default artifact set

**Verification commands:**

```
npx jest --testPathPattern=tests/integration/workflow-runtime.test.js
```

<a id="task-US-04-TASK-INFRA-02"></a>
### US-04-TASK-INFRA-02

- **Task ID:** US-04-TASK-INFRA-02
- **Title:** Update feature-status.md's artifact-presence check
- **Outcome:** feature-status.md's step 2 checks Requirements/Tech-Spec/Work-Breakdown presence as 'either split shape (req/index.md, spec/index.md, wbs/index.json) or the assembled file', noting which shape was found, instead of assuming the monolithic files always exist
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-10
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 8000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** docs
- **Commit scope:** —
- **Commit subject:** update feature-status.md for the new split-by-default artifact set

**Verification commands:**

```
npx jest --testPathPattern=tests/cli/asset-catalog.test.js
```

## Statistics

| Domain | Count | Target | Above | Warning | Split |
|--------|-------|--------|-------|---------|-------|
| BE | 5 | 1 | 3 | 1 | 0 |
| FE | 0 | 0 | 0 | 0 | 0 |
| DB | 0 | 0 | 0 | 0 | 0 |
| DevOps | 0 | 0 | 0 | 0 | 0 |
| INFRA | 5 | 5 | 0 | 0 | 0 |
| TEST | 3 | 0 | 1 | 2 | 0 |
| **Total** | **13** | **6** | **4** | **3** | **0** |
