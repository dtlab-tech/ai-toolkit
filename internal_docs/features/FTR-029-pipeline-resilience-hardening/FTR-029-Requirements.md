# FTR-029 — Functional Requirements (Index)

## 1. Introduction

### 1.1 Purpose

Close four independent, real-world-confirmed `pm-phase1` resilience gaps: (1) a schema-required
worker's logically-complete response gets discarded over two optional boolean fields; (2) the
Requirements Acceptance-Criteria table's column shape is never validated before a positional parser
destructures it; (3) an unclosed whole-response fence wrap defeats the existing closed-fence-unwrap
fix; (4) a per-item generation result is never validated until a later invocation or the final
assembly step, by which point every other item in the same run has already been paid for.

### 1.2 Scope

In scope: `lib/workflow-control.js`'s `worker()` (schema relaxation + a bounded secondary retry),
`req-skeleton-check.js`/`req-graph-checks.js`/`req-assembler.js` (AC-table header validation),
`gaia-generate-requirements.md` (stale inline example correction), `lib/workflow-control.js`'s
`extractMarkdownDocument` (unclosed-fence recovery), `pm-phase1.js`'s per-component and per-UC
generation loops (immediate post-generation validity check + bounded retry).

Out of scope: `_isTransientWorkerApiError`'s own detection logic; retrying a genuine schema
violation where a required field IS present but has the wrong type; any externally-configurable
retry-count/backoff setting; repairing an already-broken file from a pre-fix toolkit version
already sitting on disk; porting the new AC-table header check to any other table.

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| `worker()` (host dispatch primitive, `lib/workflow-control.js`) | Dispatches every schema-required and non-schema LLM worker call; owns the attempt/retry loop and structured-output recovery |
| `req-skeleton-check.js` (host script) | Deterministic structural pre-check for `req/index.md`, run before any per-UC dispatch |
| `pm-phase1` workflow (coordinator) | Owns the per-component and per-UC generation loops' resume/validity/retry decisions |

## 2. Use Cases

### UC-01: Recover a Schema-Required Response That Omits Optional Fix Flags

| Field | Value |
|---|---|
| Actor | `worker()` (`lib/workflow-control.js`) |
| Priority | Must |
| Preconditions | A worker call is schema-required (`opts.schema` set) |
| Trigger | The worker's response is a clean exit (`exitCode 0`, `is_error: false`) whose `structured_output` field is empty |

> **Legend:** **Actor** — who/what initiates or participates in this use case. **Priority** —
> MoSCoW (Must/Should/Could). **Preconditions** — what must already be true before this use case
> can start. **Trigger** — the event that starts it.

Confirmed against three independent real evidence files (two from `Fincantieri.CommonLibraries.
MFExample` FTR-003, one from `Fincantieri.ISDM.JobScheduler` FTR-012 after upgrading specifically to
test whether FTR-028 alone would fix it — it did not): `gaia-validate-feature-docs` consistently
replies with prose followed by a ` ```json ` fence containing a complete, well-formed JSON object
for `valid`/`findings`/`report`, but omitting `needsRequirementsFix`/`needsTechSpecFix` — a
reasonable model choice when there is nothing to fix. The existing `extractDelimitedStructuredOutput`
fallback already finds this candidate, but `validateSchema` rejects it every time for the identical
reason: both fields are in the schema's `required` array. This is not non-deterministic flakiness —
it is a deterministic schema/model-output mismatch, verified directly by running the real extraction
code against the raw evidence text with the two fields removed from `required`: it recovers
successfully, with zero other change, since the host's own merge logic already treats an absent
boolean as falsy (`result.needsRequirementsFix || ...`).

1. **Schema relaxation (primary fix).** `gaia-validate-feature-docs`'s worker call
   (`pm-phase1.js`) stops requiring `needsRequirementsFix`/`needsTechSpecFix` — both remain declared
   in the schema's `properties` (still type-checked when present), removed only from `required`.
   This alone resolves all three real evidence cases on the FIRST attempt, no retry needed.
2. **Bounded secondary retry (defense in depth).** For a genuinely different failure shape not yet
   evidenced (e.g. `report` itself missing, or no JSON embedded anywhere), `worker()`'s attempt loop
   gains a second retry trigger alongside the existing transient-API-error check: when `opts.schema`
   is set and a clean-exit attempt still has no usable structured output after
   `extractDelimitedStructuredOutput` (even with the relaxed schema), the condition is treated the
   same way a transient API error already is — retried, bounded by the same existing
   `WORKER_MAX_ATTEMPTS`/`WORKER_RETRY_BACKOFF_MS`.
3. **Corrective nudge on this specific retry.** Unlike the transient-API-error retry (which resends
   the identical prompt), a retry triggered by missing structured output appends one corrective
   sentence to the next attempt's prompt, instructing the model to return its answer via the
   structured channel rather than prose/a fence.
4. **Still bounded, still fails closed.** If every attempt is exhausted without usable structured
   output, the existing `"Worker returned no structured output"` error is thrown, unchanged.
5. **Never retries a present-but-wrong-type field.** A response whose JSON candidate HAS
   `needsRequirementsFix`/`needsTechSpecFix` but with the wrong type (e.g. a string, not a boolean)
   still fails `validateSchema`'s type check — relaxing `required` does not relax type-checking for
   a value that is present. This remains a deterministic content defect, not retried.

**Related Business Rules:** BR-01, BR-02

**Related Acceptance Criteria:** AC-01, AC-02, AC-03, AC-04

### UC-02: Validate the Acceptance Criteria Table's Column Header Before Parsing

| Field | Value |
|---|---|
| Actor | `req-skeleton-check.js` |
| Priority | Must |
| Preconditions | `req/index.md` exists and has a "## 7. Acceptance Criteria" section |
| Trigger | `pm-phase1.js` dispatches `req-skeleton-check.js` before any per-UC generation call |

> **Legend:** **Actor** — who/what initiates or participates in this use case. **Priority** —
> MoSCoW (Must/Should/Could). **Preconditions** — what must already be true before this use case
> can start. **Trigger** — the event that starts it.

A real pipeline run (`Fincantieri.ISDM.JobScheduler`, FTR-012) produced an Acceptance Criteria table
with 5 columns (`ID | Given | When | Then | Priority`) instead of the required 4
(`ID | Criterion | Related UC | Priority`). `pm-phase1.js`'s `parseAcTableRelatedUc` and
`req-assembler.js`'s `parseAcTable` both destructure columns positionally with no check that the
table has the right shape first — the extra column shifted every cell, so "Related UC" silently
held "When [...]" text. This was not a silently-wasted-cost failure (the resulting dangling
reference was caught before any per-UC token was spent), but the diagnosis was wrong and costly to
trace back to the real defect.

1. **Header extraction.** A new `parseTableHeader(lines, start, end)` function
   (`req-assembler.js`, alongside the existing `findSectionRange`/`parseTableRows`) returns the raw
   header-row cells for a given section range — the one piece of information `parseTableRows`
   already discards (it drops the header and separator rows by design, returning only data rows).
2. **Header validation.** A new `checkAcTableHeader(headerCells)` function (`req-graph-checks.js`,
   alongside the existing pure, I/O-free check functions) requires the first 3 cells to be exactly
   `ID`, `Criterion`, `Related UC` in that order — mirroring `wb-graph-checks.js`'s own existing
   check for the Work-Breakdown-side AC table exactly (same column names, same order, same
   "at least 3 columns" tolerance for a missing trailing `Priority`).
3. **Wired in before the positional parse.** `req-skeleton-check.js` calls `parseTableHeader` +
   `checkAcTableHeader` on Section 7's AC table BEFORE calling `parseAcTable`. If the header check
   fails, `acTable` is treated as empty for the rest of this run (never positionally destructured on
   garbage data) and the header error is folded into the same `errors[]` array the script already
   produces — a new `MALFORMED_AC_TABLE_HEADER` category, correctly attributed, instead of a
   misleading downstream `DANGLING_AC_UC_REFERENCE`.
4. **Stale example corrected.** `gaia-generate-requirements.md`'s own inline "Output Structure"
   example (3 columns, missing `Priority` entirely) is updated to match the real, authoritative
   4-column template (`gaia-requirements-index-template.md`) that also gets inlined into the same
   prompt — removing a confirmed, real inconsistency as defense in depth (not claimed to be the
   sole cause of the specific 5-column case, which neither document shows literally).

**Related Business Rules:** BR-03, BR-04

**Related Acceptance Criteria:** AC-05, AC-06, AC-07

### UC-03: Recover an Unclosed Whole-Response Fence Wrap

| Field | Value |
|---|---|
| Actor | `worker()` (`lib/workflow-control.js`, via `extractMarkdownDocument`) |
| Priority | Must |
| Preconditions | A worker call is non-schema (`!opts.schema`) and its response text is a string |
| Trigger | The response's first non-blank line is a fence-open marker with no matching close anywhere in the rest of the text |

> **Legend:** **Actor** — who/what initiates or participates in this use case. **Priority** —
> MoSCoW (Must/Should/Could). **Preconditions** — what must already be true before this use case
> can start. **Trigger** — the event that starts it.

A real pipeline run produced a Tech-Spec component file wholly wrapped in a stray ` ```markdown `
fence that is never closed — the model's turn simply ends without a matching close. The existing
closed-fence-unwrap fix (v0.19.2, commit 358e484) requires finding a closing fence line of matching
backtick length at/near the end of the text; with none present, it correctly finds nothing to
recover and passes the text through unchanged. The SAME fence-depth tracking that makes the unwrap
safe also means the fence-aware heading scan never returns to "outside a fence" for the rest of the
document, so the real `## Change`/`## Tests` headings stay permanently hidden.

1. **New recovery strategy.** `extractMarkdownDocument` (`lib/workflow-control.js`) gains a second
   strategy alongside the existing closed-fence-unwrap: a new `_stripUnclosedLeadingFence(text)`
   checks whether the first non-blank line is a fence-open marker of backtick length N, and whether
   NO line anywhere in the rest of the text closes a fence of that same length. If both hold, the
   opener is the only defect — strip just that one line and return the remainder.
2. **Always re-validated, never a blind guess.** The same "always re-validate the candidate" rule
   the existing unwrap already follows: the stripped candidate is only used if
   `_hasUnfencedHeading` confirms it now reveals a real heading. If stripping reveals no heading
   (e.g. the response legitimately starts with an unrelated code block that happens to never close,
   a genuinely different defect), the original text is returned unchanged, same as today.
3. **Fixed at the one choke point, not duplicated.** This fix lives entirely in
   `extractMarkdownDocument`, which every non-schema worker response already passes through BEFORE
   the host ever writes it to disk. No change is needed to `tech-spec-assembler.js`'s or
   `pm-phase1.js`'s own read-time fence scans — a file this fix touches is never written broken in
   the first place, so those scans never need to interpret an unclosed fence on a NEW file. An
   already-broken file from a pre-fix toolkit version is unaffected by this change (out of scope,
   per `feature.md`) — it is already handled by FTR-027's resume-validity mechanism on a later run.

**Related Business Rules:** BR-05, BR-06

**Related Acceptance Criteria:** AC-08, AC-09

### UC-04: Fail Fast on an Invalid Per-Item Generation Result

| Field | Value |
|---|---|
| Actor | `pm-phase1` coordinator |
| Priority | Must |
| Preconditions | A per-component or per-UC generation worker call has just returned |
| Trigger | `pm-phase1.js`'s per-component loop (`generateTechSpec`) or per-UC loop (`generateRequirements`) processes a dispatch result |

> **Legend:** **Actor** — who/what initiates or participates in this use case. **Priority** —
> MoSCoW (Must/Should/Could). **Preconditions** — what must already be true before this use case
> can start. **Trigger** — the event that starts it.

A real pipeline run hit a second Tech-Spec component defect (`## Test Cases` instead of the
required literal `## Tests` heading). `isValidComponentDetail()` already exists and is already
authoritative for "is this component file valid" — but today it is only ever consulted for a resume
decision on a LATER invocation, or via the outer regen gate before a run even starts. Nothing checks
the file immediately after its OWN generation call, in the same loop iteration. By the time
`assembleTechSpec()` finally notices (at the end of the run), every other component in that run
(~60 in the reporting project) has already been generated and paid for.

1. **Immediate validation.** Both the per-component loop (`generateTechSpec`) and the per-UC loop
   (`generateRequirements`) validate their worker's response — reusing the exact same
   `isValidComponentDetail`/`isValidUseCaseFile` functions FTR-027 already made authoritative for
   this purpose — immediately after the dispatch returns, BEFORE writing anything to disk and
   BEFORE the loop moves to the next item.
2. **One bounded retry.** An invalid result is retried once (a small, fixed constant — not
   externally configurable, per `feature.md`'s own "no evidence yet justifies tuning" precedent)
   with the identical prompt, mirroring the existing transient-API-error retry's own convention of
   resending unchanged.
3. **Fail fast, attributably, on a second failure.** If the retried result is still invalid, the
   loop throws immediately — naming the specific component (path/fileSlug) or use case (ID) — before
   any later item in the same run is ever dispatched. This stops the run's spend at the exact item
   that failed, instead of silently continuing through every remaining item and only discovering
   the problem at final assembly.
4. **No change to resume-by-existence itself.** FTR-027's own resume-validity check (skip an
   existing, valid file; regenerate an existing-but-invalid one on the NEXT invocation) is
   unaffected — this use case only adds a validity check and bounded retry WITHIN the same dispatch
   that just generated a new result, closing the gap for the CURRENT run, not changing what happens
   across runs.

**Related Business Rules:** BR-07, BR-08

**Related Acceptance Criteria:** AC-10, AC-11, AC-12

## 3. Business Rules

| ID | Rule | Applies to |
|---|---|---|
| BR-01 | `needsRequirementsFix`/`needsTechSpecFix` are declared in the validator's schema `properties` (still type-checked when present) but removed from its top-level `required` array; the host's existing merge logic already treats an absent value as falsy | UC-01 |
| BR-02 | A schema-required worker is retried, with a corrective nudge appended to the prompt, ONLY when a clean-exit attempt still has no usable structured output after the existing `extractDelimitedStructuredOutput` fallback — never for a present-but-wrong-type field, and never beyond the existing `WORKER_MAX_ATTEMPTS` bound | UC-01 |
| BR-03 | The Acceptance Criteria table's first 3 columns must be exactly `ID`, `Criterion`, `Related UC` in that order; a 4th `Priority` column is expected but its absence is not this check's concern | UC-02 |
| BR-04 | A malformed AC-table header is reported as its own distinct, correctly-attributed error, and short-circuits the positional parse entirely (an empty AC table is used for the remaining graph checks) rather than letting a positional destructure run on garbage and produce a misleading secondary error | UC-02 |
| BR-05 | An unclosed whole-response fence (an opening fence marker with no matching close anywhere in the rest of the text) is recognized only when it is the FIRST non-blank line — stripping it is re-validated the same "never a blind guess" way the existing closed-fence-unwrap already is | UC-03 |
| BR-06 | UC-03's fix applies at the one choke point every non-schema worker response already passes through, before the host ever writes the result to disk — no duplicate logic is added to `tech-spec-assembler.js`'s or `pm-phase1.js`'s own read-time fence scans | UC-03 |
| BR-07 | A per-component/per-UC generation result is validated immediately after its own dispatch, before being written to disk and before the loop moves to the next item; an invalid result is retried once (bounded, fixed constant) with the identical prompt | UC-04 |
| BR-08 | An item still invalid after its bounded retry stops the loop immediately with a precise, attributable error naming that specific item — no further item in the same run is dispatched | UC-04 |

> **Legend:** **ID** — unique identifier. **Rule** — the constraint itself. **Applies to** —
> which UC(s) this rule constrains, or "All UCs" if universal.

## 4. Data Requirements

No new persisted data shape or on-disk artifact. `req-skeleton-check.js`'s own JSON output gains
one new possible error `category` (`MALFORMED_AC_TABLE_HEADER`) in its existing `errors[]` array
shape — no new top-level field.

### 4.1 Entities

N/A — no new entity.

### 4.2 Validation Rules

| Rule | Enforced by |
|------|-------------|
| The AC table's first 3 columns must be exactly `ID`, `Criterion`, `Related UC` in order | `req-skeleton-check.js`, before `parseAcTable`'s positional destructure ever runs (BR-03/BR-04) |
| A per-component/per-UC generation result must pass its own type's existing validity check before being written to disk | `pm-phase1.js`'s per-component/per-UC loops (BR-07/BR-08) |

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Reliability | A schema-required worker whose JSON candidate includes `valid`/`findings`/`report` but omits `needsRequirementsFix`/`needsTechSpecFix` must be recoverable without any retry at all |
| NFR-02 | Cost | UC-04's bounded retry and UC-01's secondary nudge-retry must each be a small, fixed constant — no unbounded or externally-configurable retry count |
| NFR-03 | Resilience | An invalid per-component/per-UC generation result must stop the SAME run at the item that failed, never silently continuing to spend on every remaining item in that run |
| NFR-04 | Compatibility | No existing, passing test fixture/mocked worker response may be broken by the schema relaxation (UC-01) or the fence-recovery addition (UC-03) |

## 6. UI Requirements

N/A — internal/technical feature; no UI surface is introduced or changed.

## 7. Acceptance Criteria

| ID | Criterion | Related UC | Priority |
|----|-----------|-------------|----------|
| AC-01 | Given `gaia-validate-feature-docs`'s worker schema no longer requires `needsRequirementsFix`/`needsTechSpecFix`, when a response's JSON candidate omits both fields but includes `valid`/`findings`/`report`, then `extractDelimitedStructuredOutput` recovers it on the first attempt | UC-01 | Must |
| AC-02 | Given a response's JSON candidate DOES include `needsRequirementsFix`/`needsTechSpecFix` with the correct boolean type, when `worker()` processes that attempt, then behavior is unchanged from today — the fields are still validated when present | UC-01 | Must |
| AC-03 | Given a schema-required worker's attempt ends in free text with no recoverable structured output even after the relaxed schema, when `worker()` processes that attempt, then the next attempt (bounded by `WORKER_MAX_ATTEMPTS`) retries with a corrective nudge appended to the prompt | UC-01 | Must |
| AC-04 | Given every attempt exhausts `WORKER_MAX_ATTEMPTS` still without usable structured output, when `worker()` finishes its attempt loop, then the existing `"Worker returned no structured output"` error is thrown | UC-01 | Must |
| AC-05 | Given `req/index.md`'s Acceptance Criteria table has first 3 columns other than exactly `ID`, `Criterion`, `Related UC` in order, when `req-skeleton-check.js` runs, then it fails immediately with a precise column-shape error, never reaching `parseAcTable`'s positional destructure | UC-02 | Must |
| AC-06 | Given `req/index.md`'s Acceptance Criteria table has the correct 4-column header, when `req-skeleton-check.js` runs, then behavior is unchanged from today | UC-02 | Must |
| AC-07 | Given `gaia-generate-requirements.md`'s own inline AC example, when inspected, then it matches the real, authoritative 4-column template, no longer a stale 3-column duplicate | UC-02 | Must |
| AC-08 | Given a non-schema worker's response has a whole-response fence wrap that opens but never closes, with a real heading after the opener, when `extractMarkdownDocument` processes it, then the opener is stripped and the remainder (containing the real heading) is returned | UC-03 | Must |
| AC-09 | Given a non-schema worker's response has a CLOSED whole-response fence wrap, when `extractMarkdownDocument` processes it, then behavior is unchanged from today | UC-03 | Must |
| AC-10 | Given a per-component generation result fails `isValidComponentDetail` on its first attempt but passes on an immediate retry, when `pm-phase1.js`'s per-component loop runs, then the retried result is written and no error surfaces | UC-04 | Must |
| AC-11 | Given a per-component generation result fails `isValidComponentDetail` on both attempts, when `pm-phase1.js`'s per-component loop runs, then the loop throws immediately, naming the specific component, before any later component is dispatched | UC-04 | Must |
| AC-12 | Given a per-UC generation result fails `isValidUseCaseFile` on both attempts, when `pm-phase1.js`'s per-UC loop runs, then the loop throws immediately, naming the specific UC, before any later UC is dispatched | UC-04 | Must |
| AC-13 | Given all changes are delivered, when `npm test` runs, then all tests pass: new regression tests for AC-01 through AC-12, and a full-suite regression | All UCs | Must |

> **Legend:** **ID** — unique identifier; the anchor used across the whole
> feature.md↔req↔spec↔Work-Breakdown traceability chain. **Criterion** — a testable
> Given/When/Then statement. **Related UC** — which UC(s) this AC belongs to, or "All UCs".
> **Priority** — MoSCoW; every Must AC must be covered by ≥1 WB task.

## 8. Dependencies and Assumptions

- FTR-023 (`wb-graph-checks.js`'s AC-table header check, mirrored for the Requirements side),
  FTR-025 (`extractDelimitedStructuredOutput`, the closed-fence-unwrap fix), FTR-027 (resume-validity
  checks, reused unmodified as the authoritative "is this item valid" definition), FTR-028
  (skeleton-only validator prompt + the `needsComponentDetail`-optional-in-schema precedent UC-01
  directly extends) — all available, all reused, none replaced.
- UC-01 is grounded in three independent real evidence cases across two unrelated projects
  (`Fincantieri.CommonLibraries.MFExample` FTR-003, twice; `Fincantieri.ISDM.JobScheduler`
  FTR-012, once, after upgrading specifically to test whether FTR-028 alone would fix it — it did
  not). Model choice (`haiku`) for `gaia-validate-feature-docs` is unchanged by this feature.
- `lib/workflow-control.js`, `req-skeleton-check.js`, `req-graph-checks.js`, and `req-assembler.js`
  are normal Node modules; `pm-phase1.js` remains a sandboxed workflow script with no `require()`.
- `npm test` is the only verification command; no separate build step exists.

## 9. Open Questions

Open Questions 1-3 raised in `feature.md` are resolved by the Tech Spec — see
`FTR-029-Tech-Spec.md`'s Components for the exact decisions.

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| (none remaining) | — | — | — |

---

## Traceability

This document is the middle link in a three-stage chain: `feature.md` (approved at Gate 1) →
`req/` (this document) → Tech-Spec. Tech-Spec resolves all 3 Open Questions this document's
feature.md left pending.

## What moved out of this file, and why

Only §2 (Use Cases) split into one file per item — everything else stayed here, unsplit, for the
same reasons established in every prior feature in this lineage: Business Rules reference multiple
UCs each where relevant, and Data Requirements/NFRs/Dependencies are feature-wide by nature.
