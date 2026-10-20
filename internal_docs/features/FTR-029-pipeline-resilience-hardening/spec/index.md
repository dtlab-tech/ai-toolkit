# Technical Specification — Pipeline Resilience Hardening (Round 2)

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-029 |
| Version | 1.0 |
| Date | 2026-10-20 |
| Status | Draft |

## 1. Overview

Four independent resilience fixes, each confirmed against real pipeline failures: (1) relax
`gaia-validate-feature-docs`'s worker schema so a logically-complete response is no longer
discarded over two optional boolean fields, plus a bounded secondary retry for a genuinely
unrecoverable response; (2) validate the Requirements Acceptance-Criteria table's column header
before any positional parsing; (3) recover an unclosed whole-response fence wrap in
`extractMarkdownDocument`; (4) validate a per-component/per-UC generation result immediately after
its own dispatch, with one bounded retry, instead of only on a later invocation or at final
assembly.

## 2. Architecture

### 2.1 System Context

No new system boundary. Changes: `lib/workflow-control.js` (worker dispatch + Markdown recovery),
`req-skeleton-check.js`/`req-graph-checks.js`/`req-assembler.js` (Requirements structural
pre-check), `gaia-generate-requirements.md` (stale example correction), `pm-phase1.js` (per-item
generation loops). No new script, no new CLI command, no new agent, no new installer catalog entry.

### 2.2 Component Diagram

```
Before (today):
  worker(): retries ONLY a transient API error; "no structured output" throws unconditionally
            after the loop, even if the candidate is one optional-field short of valid
  req-skeleton-check.js: parseAcTable's positional destructure runs on ANY table shape
  extractMarkdownDocument: recovers a CLOSED whole-response fence wrap only
  pm-phase1.js: per-component/per-UC loops write whatever the worker returns, unconditionally

After (this feature):
  worker(): schema no longer requires needsRequirementsFix/needsTechSpecFix (properties only);
            ALSO retries once more, with a corrective nudge, if still unrecoverable after that
  req-skeleton-check.js: AC table header validated (ID|Criterion|Related UC) BEFORE parseAcTable
  extractMarkdownDocument: + strips an unclosed leading fence opener, re-validates the remainder
  pm-phase1.js: per-component/per-UC loops validate + bounded-retry immediately after dispatch,
                fail fast and attributably on a second failure
```

### 2.3 Sequence Diagrams

**UC-01, per schema-required `worker()` call:**
```
worker(): dispatch attempt -> clean exit, structured_output empty?
  extractDelimitedStructuredOutput(text, RELAXED schema) -> recovers (needsRequirementsFix/
    needsTechSpecFix absent, no longer required) -> used as-is, no retry (common case now)
  still null -> retry with corrective nudge appended, up to WORKER_MAX_ATTEMPTS
  still null after all attempts -> existing "Worker returned no structured output" error
```

**UC-02, per `req-skeleton-check.js` invocation:**
```
req-skeleton-check.js: parseUseCaseIndexTable -> findSectionRange(7) -> parseTableHeader
  -> checkAcTableHeader(headerCells)
    header malformed -> MALFORMED_AC_TABLE_HEADER error; acTable treated as [] for this run
    header OK -> parseAcTable (unchanged) -> existing graph checks run as today
```

**UC-03, per non-schema `worker()` call:**
```
extractMarkdownDocument(text):
  _hasUnfencedHeading(text)? yes -> return as-is (unchanged)
  _unwrapWholeResponseFence(text) -> closed fence found + reveals heading? -> return it (unchanged)
  _stripUnclosedLeadingFence(text) -> first line opens a fence, NO close anywhere -> strip it
    -> reveals heading? -> return the stripped remainder (NEW)
  none of the above -> return text unchanged (unchanged)
```

**UC-04, per per-component/per-UC loop iteration:**
```
pm-phase1.js: dispatch worker -> isValidComponentDetail(detail) / isValidUseCaseFile(detail, id)?
  valid -> write to disk, continue to next item (unchanged happy path)
  invalid -> retry once (identical prompt) -> valid this time? -> write, continue
                                            -> still invalid -> throw, naming the specific item
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

None — internal toolkit workflow change, no new external surface, no new input-validation
boundary beyond UC-02's own structural check (which only ever makes an existing positional parse
MORE strict, never less).

## 7. Database Changes

None.

## 8. Configuration

None — UC-01's secondary retry and UC-04's bounded retry are both fixed code constants (not
environment variables or settings-file options), per `feature.md`'s own "no real evidence yet
justifies external tuning" precedent.

## 9. File Inventory

### New files
None — this feature only changes existing decision logic, existing parsers, and existing agent
documentation.

### Modified files
| Path | Change description | Addresses | Domain | Spec |
|------|-------------------|-----------|--------|------|
| lib/workflow-control.js | `gaia-validate-feature-docs`'s schema-required worker handling gains a bounded secondary retry (missing-structured-output trigger + corrective nudge); `extractMarkdownDocument` gains `_stripUnclosedLeadingFence` for an unclosed whole-response fence wrap | AC-03, AC-04, AC-08, AC-09 | BE | [components/workflow-control.js.md](components/workflow-control.js.md) |
| src/claude/workflows/pm-phase1.js | `gaia-validate-feature-docs`'s worker schema drops `needsRequirementsFix`/`needsTechSpecFix` from `required`; per-component and per-UC generation loops validate immediately after dispatch with one bounded retry, failing fast and attributably on a second failure | AC-01, AC-02, AC-10, AC-11, AC-12 | BE | [components/pm-phase1.js.md](components/pm-phase1.js.md) |
| src/claude/scripts/req-assembler.js | New `parseTableHeader(lines, start, end)`, exported alongside the existing `findSectionRange`/`parseTableRows` | AC-05, AC-06 | BE | [components/req-assembler.js.md](components/req-assembler.js.md) |
| src/claude/scripts/req-graph-checks.js | New `checkAcTableHeader(headerCells)` pure check function, mirroring `wb-graph-checks.js`'s existing AC-table header check | AC-05, AC-06 | BE | [components/req-graph-checks.js.md](components/req-graph-checks.js.md) |
| src/claude/scripts/req-skeleton-check.js | Calls `parseTableHeader`/`checkAcTableHeader` on the AC table BEFORE `parseAcTable`'s positional destructure; folds the result into the existing unified `errors[]` output | AC-05, AC-06 | BE | [components/req-skeleton-check.js.md](components/req-skeleton-check.js.md) |
| tests/req-assembler.test.js | New direct unit test for `parseTableHeader` | AC-05, AC-06 | TEST | [components/req-assembler.test.js.md](components/req-assembler.test.js.md) |
| tests/req-graph-checks.test.js | New direct unit test for `checkAcTableHeader` | AC-05, AC-06 | TEST | [components/req-graph-checks.test.js.md](components/req-graph-checks.test.js.md) |
| src/claude/agents/gaia-generate-requirements.md | Inline AC-table example corrected from a stale 3-column shape to the real, authoritative 4-column template | AC-07 | BE | [components/gaia-generate-requirements.md.md](components/gaia-generate-requirements.md.md) |
| tests/integration/workflow-runtime.test.js | New tests for AC-01 through AC-04 (schema relaxation + secondary retry), AC-10 through AC-12 (fail-fast per-item validation) | AC-01, AC-02, AC-03, AC-04, AC-10, AC-11, AC-12 | TEST | [components/workflow-runtime.test.js.md](components/workflow-runtime.test.js.md) |
| tests/cli/workflow-worker-contract.test.js | New tests for AC-08/AC-09 (unclosed-fence recovery) directly against `extractMarkdownDocument`'s own existing describe block | AC-08, AC-09 | TEST | [components/workflow-worker-contract.test.js.md](components/workflow-worker-contract.test.js.md) |
| tests/req-skeleton-check.test.js | New/updated tests for AC-05, AC-06 against the real `req-skeleton-check.js` CLI (or its real exported functions, whichever this file's own existing convention already uses) | AC-05, AC-06 | TEST | [components/req-skeleton-check.test.js.md](components/req-skeleton-check.test.js.md) |

Column order matters: `Addresses` MUST stay the 3rd column — `tech-spec-graph-checks.js`'s
existing, unmodified, positional parser (FTR-023) always reads `cells[2]` as "Addresses". `Domain`
and `Spec` are trailing columns, safely ignored by that parser. Do not reorder them.

## 10. Testing Strategy

_Per-component detail — see each component's own design file's own Tests section (generated
separately, one call per component). Do not write any content here._

## 11. Implementation Order

1. `src/claude/scripts/req-assembler.js` — depends on: nothing (`parseTableHeader` is a pure
   addition alongside existing exports)
2. `src/claude/scripts/req-graph-checks.js` — depends on: nothing (`checkAcTableHeader` is a pure,
   standalone function; independent of 1, both needed before 3)
3. `src/claude/scripts/req-skeleton-check.js` — depends on: 1, 2
4. `src/claude/agents/gaia-generate-requirements.md` — depends on: nothing (independent prompt-text
   correction)
5. `lib/workflow-control.js` — depends on: nothing (both its own changes — the secondary retry and
   the unclosed-fence recovery — are independent of the Requirements-side work above)
6. `src/claude/workflows/pm-phase1.js` — depends on: 5 (the schema relaxation is a change to a
   literal this file owns, but conceptually completes UC-01 which 5's retry mechanism also serves)
7. `tests/req-assembler.test.js` — depends on: 1
8. `tests/req-graph-checks.test.js` — depends on: 2
9. `tests/req-skeleton-check.test.js` — depends on: 1, 2, 3
10. `tests/cli/workflow-worker-contract.test.js` — depends on: 5
11. `tests/integration/workflow-runtime.test.js` — depends on: 5, 6

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Relaxing `needsRequirementsFix`/`needsTechSpecFix` out of `required` could mask a genuinely confused model response that omits them for a WRONG reason (not "nothing to fix") | A response treated as having nothing to fix when it actually does | Accepted: `valid`/`findings` are still required and still the authoritative signal; a model reporting `valid: false` with real findings but omitting the fix-routing booleans already falls back safely — the host's `||`-based merge treats an absent flag as `false`, and if NEITHER flag ends up true while gaps remain, the pre-existing "reported gaps on cycle N but flagged neither document for revision" error already fires, unchanged |
| UC-04's bounded retry doubles the worst-case LLM cost for an occasionally-flaky single item | A feature with many already-invalid-on-first-try items could cost up to 2x for those items | Accepted: bounded to exactly 1 retry (not unbounded), and only pays this cost for an item that was ALREADY going to fail the run entirely today — strictly cheaper than today's "every other item gets generated first, THEN the whole run fails anyway" |
| UC-03's unclosed-fence stripping could, in a pathological case, strip a LEGITIMATE leading fence that was never meant to wrap the whole response | Content loss if the real document's own first line coincidentally is an unclosed fence | Mitigated: the stripped candidate is only used if it reveals a real heading (`_hasUnfencedHeading`) — a real Requirements/Tech-Spec/task document always starts with a `#`/`##` heading, never a bare code block, so this re-validation gate makes a false-positive strip exceedingly unlikely in practice, consistent with every other recovery function in this file already accepting this same trade-off |

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Exact wording of UC-01's secondary corrective-nudge sentence | **Resolved** | See `components/workflow-control.js.md`'s own Algorithm section for the literal text |
| 2 | Should UC-04's bounded retry re-send the IDENTICAL prompt, or also append a corrective nudge? | **Resolved** | Identical prompt — matches today's existing transient-API-error retry convention; no evidence yet that a nudge is needed for this failure mode |
| 3 | Where does UC-02's header-check function live? | **Resolved** | `req-graph-checks.js`, consistent with where every other structural check for this document already lives |

## Dependencies and Assumptions

- FTR-023, FTR-025, FTR-027, FTR-028 (available): reused unmodified as described in `req/index.md`'s
  own Dependencies section.
- `lib/workflow-control.js`, `req-skeleton-check.js`, `req-graph-checks.js`, and `req-assembler.js`
  are normal Node modules; `pm-phase1.js` remains a sandboxed workflow script with no `require()` —
  its own changes are inline, no new duplicated logic needed.
- `npm test` is the only verification command; no separate build step exists.
- UC-01 is grounded in three independent real evidence files, two of which were directly inspected
  (raw JSON read, the exact extraction code run against the raw text) during this feature's own
  Requirements/Tech-Spec authoring — not reproduced synthetically first.
