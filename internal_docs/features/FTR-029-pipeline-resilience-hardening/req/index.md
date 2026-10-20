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

| UC ID | Title | Actor | Priority | File |
|---|---|---|---|---|
| UC-01 | Recover a Schema-Required Response That Omits Optional Fix Flags | `worker()` | Must | [use-cases/UC-01.md](use-cases/UC-01.md) |
| UC-02 | Validate the Acceptance Criteria Table's Column Header Before Parsing | `req-skeleton-check.js` | Must | [use-cases/UC-02.md](use-cases/UC-02.md) |
| UC-03 | Recover an Unclosed Whole-Response Fence Wrap | `worker()` | Must | [use-cases/UC-03.md](use-cases/UC-03.md) |
| UC-04 | Fail Fast on an Invalid Per-Item Generation Result | `pm-phase1` coordinator | Must | [use-cases/UC-04.md](use-cases/UC-04.md) |

> **Legend:** **UC ID** — unique identifier, referenced from Business Rules' `Applies to` and
> Acceptance Criteria's `Related UC` columns. **Title** — short label; full flow is in the linked
> file. **Actor** — who/what initiates or participates. **Priority** — MoSCoW; drives downstream
> Must-coverage checks. **File** — this UC's own detail file.

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
