# Technical Specification — Scalable Feature-Doc Validation

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-028 |
| Version | 1.0 |
| Date | 2026-10-20 |
| Status | Draft |

## 1. Overview

Caps `gaia-validate-feature-docs`'s own prompt size to the Tech-Spec skeleton (`spec/index.md`),
eliminating the unbounded growth driver that caused a real production run (58 components, 552,863
prompt tokens) to hard-fail with no recoverable structured output. Coverage is preserved, not
weakened, via two new mechanisms: a deterministic, host-only AC↔component traceability check
(zero LLM cost, immune to scale), and a narrowly-scoped drill-down pass that reads only the
specific component files a flagged claim actually needs, batched to stay bounded even if many
components are flagged at once. `docsDigest` (Gate 1's approval binding) is untouched — it always
hashes the full, unreduced assembled documents.

## 2. Architecture

### 2.1 System Context

No new system boundary. This feature changes one validation step inside an existing workflow
script (`pm-phase1.js`), rewords one existing agent's contract
(`gaia-validate-feature-docs.md`), adds one new narrowly-scoped agent
(`gaia-validate-tech-spec-component-detail.md`) with its own `lib/agent-registry.js` entry, and
extends one existing integration test file. No new script, no new CLI command, no new installer
catalog entry (agents install by directory glob, not individual listing).

### 2.2 Component Diagram

```
Before (today):
  pm-phase1.js: assembledTechSpec = tech-spec-assembler.js's loadTechSpec()  (full per-component bodies spliced in)
  pm-phase1.js: validator prompt  = featurePath + assembledRequirements + assembledTechSpec
                |
                +-- prompt size grows with per-component DESIGN PROSE length, unbounded (552k tokens, real incident)

After (this feature):
  pm-phase1.js: validator prompt Tech-Spec text = raw spec/index.md (skeleton only, one row/component)
  pm-phase1.js: assembledTechSpec STILL computed, unchanged, but ONLY for docsDigest (Gate 1 binding)
  pm-phase1.js: + deterministic AC<->component traceability check (zero LLM, every cycle)
  pm-phase1.js: + needsComponentDetail entries -> deduped by fileSlug -> batched (<=K) -> drill-down worker call(s)
                |
                +-- validator prompt size bounded by component COUNT; deep-technical coverage recovered narrowly
```

### 2.3 Sequence Diagrams

**Main validation cycle (UC-01, UC-02, UC-03), per `pm-phase1.js` validation step:**
```
pm-phase1.js: build prompt = featurePath + assembledRequirements + read(specIndexPath)  [skeleton only]
pm-phase1.js: dispatch gaia-validate-feature-docs -> { valid, findings, needsRequirementsFix,
              needsTechSpecFix, report, needsComponentDetail }
pm-phase1.js: computeAcComponentTraceabilityGaps(reqIndexContent, specIndexContent) -> structuralFindings[]
pm-phase1.js: for each needsComponentDetail entry:
                fileSlug exists in spec/index.md's component table?
                  no  -> drop; append "Tech-Spec: ..." finding about the bad reference
                  yes -> group into claimsByFileSlug
pm-phase1.js: batch claimsByFileSlug's keys into groups of <= K
pm-phase1.js: for each batch -> dispatch gaia-validate-tech-spec-component-detail -> { findings[] }
pm-phase1.js: mergedFindings = findings ++ structuralFindings ++ drillDownFindings (all batches)
pm-phase1.js: mergedValid = valid && structuralFindings.length === 0 && drillDownFindings.length === 0
pm-phase1.js: mergedNeedsTechSpecFix = needsTechSpecFix || any new finding is "Tech-Spec: "-prefixed
pm-phase1.js: mergedNeedsRequirementsFix = needsRequirementsFix || any new finding is "Requirements: "-prefixed
pm-phase1.js: contradiction guard now evaluates mergedValid/mergedFindings (was: valid/findings)
pm-phase1.js: write augmented report (original report + any appended findings sections) to Validation-Report.md
pm-phase1.js: docsDigest = hash(assembledRequirements + '\u0000' + assembledTechSpec)  [UNCHANGED — full docs]
```

**Drill-down batch dispatch (UC-03), per batch:**
```
pm-phase1.js: prompt = for each {fileSlug, claims[]} in batch:
                "Claim: {claim}\nComponent file: {absolute path to spec/components/{fileSlug}}"
gaia-validate-tech-spec-component-detail: Read each named file only
gaia-validate-tech-spec-component-detail: for each claim -> confirmed by file content?
                                            no -> emit "Tech-Spec: ..." finding
                                            yes -> no finding
gaia-validate-tech-spec-component-detail: return { findings: string[] }
```

## 3. Backend

_Per-component detail — see Section 9's Components table and each component's own design file
(generated separately, one call per component). Do not write any content here._

## 4. Frontend

_Per-component detail — see Section 9's Components table and each component's own design file
(generated separately, one call per component). Do not write any content here._

## 5. External Integrations

_Per-component detail — see Section 9's Components table and each component's own design file
(generated separately, one call per component). Do not write any content here._

## 6. Security Considerations

The new drill-down agent (`gaia-validate-tech-spec-component-detail`) is given only Read/Glob/Grep
tools (matching `gaia-validate-feature-docs`'s own tool profile) and Reads only absolute paths the
host computes itself from already-validated `fileSlug` values under the feature's own
`spec/components/` directory — never a path derived from unvalidated agent output, and never a
toolkit-external template path (so the headless-worker permission issue fixed separately, commit
35d08e9, does not apply: no `print-asset`/host-inlining is needed for this agent). No new external
I/O, no new input-validation boundary beyond the existing `fileSlug`-existence check (BR-05).

## 7. Database Changes

None.

## 8. Configuration

None — the batch size `K` is a code-level constant (default 8, see
`components/pm-phase1.js.md`), not an environment variable or settings-file option (Open Question
4: no real evidence yet justifies making it externally tunable).

## 9. File Inventory

### New files
| Path | Purpose | Addresses | Domain | Spec |
|------|---------|-----------|--------|------|
| src/claude/agents/gaia-validate-tech-spec-component-detail.md | Narrow drill-down agent: Reads only the named component file(s) in its own batch and confirms/denies a small set of claims against their real content | AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12 | BE | [components/gaia-validate-tech-spec-component-detail.md.md](components/gaia-validate-tech-spec-component-detail.md.md) |
| tests/pm-phase1-ac-traceability.test.js | Added during implementation (not originally planned): a direct, deterministic unit test of `computeAcComponentTraceabilityGaps()` via a hand-synced mirror + source-text guard — covers the "component references a nonexistent AC-ID" direction, discovered unreachable end to end (see `components/workflow-runtime.test.js.md`'s own Implementation Note) | AC-02 | TEST | [components/pm-phase1-ac-traceability.test.js.md](components/pm-phase1-ac-traceability.test.js.md) |

### Modified files
| Path | Change description | Addresses | Domain | Spec |
|------|-------------------|-----------|--------|------|
| src/claude/workflows/pm-phase1.js | Swap the Tech-Spec text fed to the validator's prompt from `assembledTechSpec` to the raw skeleton; add `needsComponentDetail` to the worker schema; add the deterministic AC↔component traceability check; add `fileSlug`-validation, dedup, batching, and drill-down dispatch; merge all finding sources before the contradiction guard | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13 | BE | [components/pm-phase1.js.md](components/pm-phase1.js.md) |
| src/claude/agents/gaia-validate-feature-docs.md | Phase 1 reworded to describe the skeleton-only Tech-Spec input; Phase 3's Tech-Spec check table reworded to match (Purpose/Addresses/Domain columns only); Implementation-Order traceability bullet removed (superseded); schema/Phase 7 gain `needsComponentDetail` with instructions on when to use it | AC-01, AC-05, AC-06 | BE | [components/gaia-validate-feature-docs.md.md](components/gaia-validate-feature-docs.md.md) |
| lib/agent-registry.js | New registry entry for `gaia.agent.planner.validate-tech-spec-component-detail` (mirrors the existing `validate-feature-docs`/`validate-work-breakdown` entries' shape exactly) | AC-07 | BE | [components/agent-registry.js.md](components/agent-registry.js.md) |
| tests/integration/workflow-runtime.test.js | New tests: skeleton-only prompt content (no component body text); deterministic traceability check (orphan AC, hallucinated AC reference, both directions); drill-down dispatch (valid fileSlug, hallucinated fileSlug, dedup, batching at K+1 components); merge-before-guard forcing `needsTechSpecFix` when the LLM pass alone reported clean | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13 | TEST | [components/workflow-runtime.test.js.md](components/workflow-runtime.test.js.md) |

Column order matters: `Addresses` MUST stay the 3rd column — `tech-spec-graph-checks.js`'s
existing, unmodified, positional parser (FTR-023) always reads `cells[2]` as "Addresses". `Domain`
and `Spec` are trailing columns, safely ignored by that parser. Do not reorder them.

## 10. Testing Strategy

_Per-component detail — see each component's own design file's own Tests section (generated
separately, one call per component). Do not write any content here._

## 11. Implementation Order

1. `lib/agent-registry.js` — depends on: nothing (pure data addition; needed before `pm-phase1.js`
   can successfully dispatch the new agent)
2. `src/claude/agents/gaia-validate-tech-spec-component-detail.md` — depends on: nothing (new file;
   independent of 1, both needed before `pm-phase1.js` can dispatch it end-to-end)
3. `src/claude/agents/gaia-validate-feature-docs.md` — depends on: nothing (reworded independently;
   `pm-phase1.js` must match its new schema contract, so land together or before `pm-phase1.js`)
4. `src/claude/workflows/pm-phase1.js` — depends on: 1, 2, 3 (dispatches both agents under their
   final contracts)
5. `tests/integration/workflow-runtime.test.js` — depends on: 1, 2, 3, 4

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| The main validator over-uses `needsComponentDetail`, flagging most/all components for drill-down (a confused or overly cautious model response) | Many drill-down batches dispatched in one cycle — more LLM cost/wall-clock than today's single call, though never a single unbounded call | Accepted: batching at `K` already guarantees no SINGLE call explodes; total batches scale with flagged-component count, which is still bounded by the feature's own component count — strictly worse than the common case, never worse than a crash |
| The main validator names a `fileSlug` that exists but is NOT actually relevant to the claim (a bad guess, not a hallucination) | The drill-down agent reports the claim as unconfirmed (since the named file doesn't address it), producing a finding that may force an unnecessary revision cycle | Accepted: this fails safe (an extra revision cycle, not a silent false-clean pass) and is bounded by the existing 3-cycle limit; no worse than today's single-pass agent misjudging coverage |
| Losing per-component design-body visibility in the MAIN pass could silently drop a genuine gap if the model never recognizes it needs `needsComponentDetail` at all (under-flagging, not over-flagging) | A real coverage gap goes unnoticed, same failure mode the Out-of-Scope "granularity trade-off" already accepted in `feature.md` | Accepted per `feature.md`'s own Out-of-Scope: no real incident has shown this specific failure yet; `gaia-generate-tech-spec-component.md`'s own template contract remains the primary authority for per-component technical completeness, not this validator |
| A new agent (`gaia-validate-tech-spec-component-detail`) shipped without its `lib/agent-registry.js` entry — the exact FTR-021/FTR-024 bug class | `pm-phase1.js`'s dispatch would fail at `resolveAgent`/`resolve(id)` with an unresolvable agent ID | Mitigated structurally: Implementation Order step 1 lands the registry entry BEFORE `pm-phase1.js` ever references the new `agentId`, and `tests/integration/workflow-runtime.test.js`'s new tests exercise the real dispatch path end-to-end, not a mocked one |

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Exact attribution prefix for an orphan-AC finding | **Resolved** | Always `"Tech-Spec: ..."` — see `components/pm-phase1.js.md`'s `computeAcComponentTraceabilityGaps` |
| 2 | Should the deterministic check also flag a dangling File-Inventory Spec link? | **Resolved** | Deferred out of this feature's MVP-of-scope-as-shipped: FTR-027's own component-validity gate already covers this earlier in the pipeline (before the validator ever runs), and `--force` still re-enters that same gate on the next cycle — adding a second, redundant check here was judged not worth the extra surface for a gap FTR-027 already closes upstream |
| 3 | Where does the new deterministic-check function live? | **Resolved** | Inline in `pm-phase1.js`, next to `parseComponentsTable`/`parseAcTableRelatedUc` — see `components/pm-phase1.js.md` |
| 4 | Default batch size `K`? | **Resolved** | Fixed code constant, `K = 8`, not externally configurable — no real evidence yet justifies tuning |
| 5 | Does the drill-down agent receive `feature.path` for extra context? | **Resolved** | No — claim text + component file paths only, mirroring `gaia-generate-tech-spec-component`'s own narrow-input precedent |
| 6 | New agent registration | **Resolved** | `lib/agent-registry.js` entry required (Implementation Order step 1); `lib/asset-catalog.js` needs no change (directory-glob install) |

## Dependencies and Assumptions

- FTR-020/FTR-024/FTR-025/FTR-026/FTR-027 (available): the split-generation architecture, skeleton/
  detail separation, and existing per-item validity mechanisms — all reused, none replaced.
- `tech-spec-assembler.js`'s `loadTechSpec()`/`assembleTechSpec()` and `req-assembler.js`'s
  `loadRequirements()` stay unmodified and are imported by neither this feature's new code nor
  `pm-phase1.js`'s existing `assembleRequirements()`/`assembleTechSpec()` helpers (both call them
  via `run-asset`, as today).
- `lib/agent-registry.js`'s existing per-entry shape is reused unmodified; the new entry follows
  the existing precedent of `minimumToolkitVersion: '0.13.0'` on every entry regardless of when it
  was actually added.
- `npm test` is the only verification command; no separate build step exists.
- Directly motivated by a real, reproduced production incident
  (`Fincantieri.CommonLibraries.MFExample`, FTR-003) — not a hypothetical scalability concern.
