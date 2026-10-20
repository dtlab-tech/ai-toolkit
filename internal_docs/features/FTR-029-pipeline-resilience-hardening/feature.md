# Pipeline Resilience Hardening (Round 2)

## Feature ID
FTR-029

## Summary
Four independent, real-world-reported `pm-phase1` resilience gaps, each confirmed against the
current (v0.21.0) code AND, for issue 1, against the actual raw evidence files from THREE real
failed runs across two unrelated projects, including one AFTER upgrading to v0.21.0 specifically to
test whether FTR-028 alone would fix it (it did not) — not guessed: (1) `gaia-validate-feature-docs` never uses the native structured-output
channel for this agent, consistently falling back to a prose preamble plus a ` ```json ` fence —
recoverable by the existing text-fallback extractor, EXCEPT that the schema requires
`needsRequirementsFix`/`needsTechSpecFix` unconditionally, and the model (reasonably) omits both
whenever there is nothing to fix, so every recovery attempt fails on the SAME missing-field
validation error, deterministically, every time; (2) the Requirements
Acceptance-Criteria table's column shape is never validated before a positional parser destructures
it, so a malformed table silently misattributes data into the wrong fields; (3) a model that opens
a whole-response code fence but never closes it defeats both the existing closed-fence-unwrap fix
and the fence-aware heading scan; (4) a per-component/per-UC generation result is never validated
immediately after its own dispatch — only on a LATER pipeline invocation's resume check, or at
final assembly, by which point every other item in the same run has already been generated (paid
for). All four were found via real reports from a separate, unrelated project
(`Fincantieri.ISDM.JobScheduler`) running a real `pm-phase1` pipeline, investigated against the
actual toolkit source, not reproduced synthetically first.

## Problem Statement
A real pipeline run against `Fincantieri.ISDM.JobScheduler`'s `FTR-012-dataupdaterqueue-sql-api-tracking`
feature (toolkit v0.20.0) hit issues 2-4 in one invocation. Issue 1 was independently reproduced
THREE times: twice against a different real project (`Fincantieri.CommonLibraries.MFExample`,
FTR-003) on v0.21.0, with the raw worker evidence JSON directly inspected (not just a description of
the symptom), and a THIRD time by `Fincantieri.ISDM.JobScheduler` itself, after upgrading from
v0.20.0 to v0.21.0 specifically to test whether FTR-028's prompt reduction alone would close it —
it did not (context shrank from ~142K to ~100K tokens; the identical failure class recurred):

1. `gaia-validate-feature-docs` (haiku), after FTR-028's skeleton-only prompt reduction, no longer
   crashes at extreme scale (confirmed: one real run dropped from 552K to ~132K prompt tokens), but
   a DIFFERENT, pre-existing defect surfaced identically on ALL THREE real cases inspected:
   `exitCode 0`, `is_error: false` — the model never uses the native `--json-schema` tool-call
   channel at all, instead replying with prose (one case: "The validation is complete. Here is my
   structured output:") followed by a ` ```json ` fence containing an ALMOST-complete JSON object
   (`valid`, `findings`, `report` present and well-formed). `lib/workflow-control.js`'s existing
   `extractDelimitedStructuredOutput` fallback DOES already try exactly this convention (a
   ` ```json ` fence) and DOES find it — but `validateSchema` then rejects EVERY candidate for the
   identical reason every time: `Missing structured field: needsRequirementsFix`. The model's JSON
   omits `needsRequirementsFix`/`needsTechSpecFix` — a reasonable choice when `valid` is already
   decided and there is nothing to fix — but the schema's `required` array mandates both fields
   unconditionally, so a logically complete, schema-compatible-in-spirit response is discarded
   every time. This precisely explains the reported symptom ("3 consecutive attempts, identical
   failure — not retry luck, structural", and later "not primarily a context-size problem"): it is
   not non-deterministic model flakiness, it is a deterministic schema/model-output mismatch.
   Verified directly: relaxing the schema (dropping those two fields from `required`, matching the
   precedent FTR-028 already set for `needsComponentDetail`) recovers a valid payload from BOTH
   inspected evidence files with zero other code change — the host's own merge logic
   (`result.needsRequirementsFix || ...`) already treats an absent boolean as falsy.
2. `gaia.agent.planner.requirements` (haiku) produced the Acceptance Criteria table with 5 columns
   (`ID | Given | When | Then | Priority`) instead of the required 4
   (`ID | Criterion | Related UC | Priority`). `pm-phase1.js`'s `parseAcTableRelatedUc` and
   `req-assembler.js`'s `parseAcTable` both destructure columns **positionally**, with no check
   that the table actually has the right shape first — the extra column shifted every subsequent
   cell, so "Related UC" silently held "When [...]" text. This was NOT a silent, wasted-cost
   failure — `req-skeleton-check.js` (run before any per-UC dispatch) correctly caught the
   resulting dangling-reference symptom and hard-failed — but the diagnosis was wrong
   (`DANGLING_AC_UC_REFERENCE` for every AC, not "malformed AC table header"), costing real
   debugging time to trace back to the actual defect.
3. `gaia.agent.planner.tech-spec-component` (haiku) produced one component file wholly wrapped in
   a stray ` ```markdown ` fence that is **never closed** — the model's turn simply ends without a
   matching close. `lib/workflow-control.js`'s existing closed-fence-unwrap fix (v0.19.2,
   commit 358e484) requires finding a closing fence line of matching backtick length at/near the
   end of the text; with none present, it correctly finds nothing to recover and passes the text
   through unchanged. The SAME fence-depth tracking that makes the unwrap safe also means the
   fence-aware heading scan (`tech-spec-assembler.js`'s `_nonFencedHeadingIndexes`,
   `pm-phase1.js`'s own local copy) never returns to "outside a fence" for the rest of the
   document, so the real `## Change`/`## Tests` headings are permanently hidden.
4. A second component file used `## Test Cases` instead of the required literal `## Tests` heading
   — a different, simpler content defect, but with the same consequence: `pm-phase1.js`'s
   per-component loop writes whatever the worker returns and moves on to the next component
   unconditionally. `isValidComponentDetail()` already exists and is already authoritative for
   "is this component file valid" — but today it is only ever consulted for a resume decision on a
   LATER invocation (`pm-phase1.js:441`) or via the outer regen gate before this run even starts.
   Nothing checks the file immediately after ITS OWN generation call, in the same loop iteration.
   By the time `assembleTechSpec()` finally notices (at the end of the run), every other component
   in that run (~60 in the reporting project) has already been generated and paid for.

## Actors
N/A — internal/technical feature

## Core Flow (Happy Path)
Four independent fixes, each scoped to its own file(s); none depend on each other.

1. **UC-01 — Relax the validator's schema so a logically-complete response is no longer discarded,
   with a bounded secondary retry as defense in depth.** `gaia-validate-feature-docs`'s worker call
   (`pm-phase1.js`) stops requiring `needsRequirementsFix`/`needsTechSpecFix` in its JSON schema's
   `required` array — both stay declared in `properties` (so a PRESENT value is still type-checked),
   mirroring the exact precedent FTR-028 already set for `needsComponentDetail`. The host's existing
   merge code already treats an absent value as falsy (`result.needsRequirementsFix || ...`), so no
   further change is needed there. This alone recovers both real evidence cases. As a SECONDARY,
   bounded defense for a genuinely different failure shape (e.g. `report` itself missing, or no
   JSON embedded anywhere), `worker()`'s attempt loop also gains a second retry trigger alongside
   the existing transient-API-error check: when `opts.schema` is set and an attempt's response is a
   clean exit but STILL has no usable `structured_output` even after `extractDelimitedStructuredOutput`
   (i.e. the relaxed schema didn't help), the next attempt's prompt gets one corrective sentence
   appended. Still bounded by the existing `WORKER_MAX_ATTEMPTS` (3) and `WORKER_RETRY_BACKOFF_MS`; a
   genuine schema violation on a PRESENT-but-wrong-type payload is still not retried (a deterministic
   content defect, not addressed here).
2. **UC-02 — Validate the Acceptance Criteria table's column header before parsing it.**
   `req-skeleton-check.js` (already dispatched by `pm-phase1.js` before any per-UC call, exactly
   where this needs to run) gains a header-shape check mirroring the one `wb-graph-checks.js`
   already has for the Work-Breakdown-side AC table: the first 3 columns must be exactly `ID`,
   `Criterion`, `Related UC` in that order, or the check fails immediately with a precise, correctly
   attributed error — before `parseAcTable`'s positional destructure ever runs across data rows.
   `gaia-generate-requirements.md`'s own inline "Output Structure" example (a stale, 3-column
   example missing the `Priority` column entirely) is also corrected to match the real,
   authoritative template (`gaia-requirements-index-template.md`) — removing a confirmed, real
   inconsistency between what the agent's own doc shows and what gets inlined into its prompt, as
   defense in depth (not claimed to be the sole cause of this specific 5-column case, which neither
   document shows literally).
3. **UC-03 — Recover an unclosed whole-response fence wrap.** `extractMarkdownDocument`
   (`lib/workflow-control.js`) gains a second recovery strategy alongside the existing
   closed-fence-unwrap: if the first non-blank line is a fence-open marker of length N and NO line
   anywhere in the rest of the text closes a fence of that same length, the opener is the only
   defect — strip just that one line and re-validate the remainder for an unfenced heading (the
   same "always re-validate the candidate, never a blind guess" discipline the existing unwrap
   already follows). This fixes it at the one choke point every non-schema worker response already
   passes through, BEFORE the host ever writes the file to disk — no change needed to
   `tech-spec-assembler.js`'s or `pm-phase1.js`'s own read-time fence scans, since a file this fix
   touches is never written broken in the first place.
4. **UC-04 — Fail fast on an invalid per-item generation result, with one bounded retry.**
   `pm-phase1.js`'s per-component loop (`generateTechSpec`) and per-UC loop (`generateRequirements`)
   both validate their worker's response (`isValidComponentDetail`/`isValidUseCaseFile`) immediately
   after it returns, BEFORE writing it to disk and BEFORE moving to the next item. An invalid result
   is retried once (bounded, small fixed constant) with the identical prompt; if still invalid, the
   loop throws a precise, attributable error naming the specific item — stopping the run right
   there instead of silently continuing to spend on every remaining item.

## Out of Scope
- Any change to `_isTransientWorkerApiError`'s own detection logic — unchanged, still the sole
  trigger for the existing retry-identical-prompt behavior.
- Retrying a genuine schema violation where `structured_output` IS present but fails
  `validateSchema` — still treated as a deterministic content defect, not retried (UC-01's own
  boundary).
- Any new externally-configurable retry-count/backoff setting — both new retry bounds (UC-01's
  nudge retry, UC-04's per-item retry) are fixed, small constants, consistent with FTR-028's own
  "no real evidence yet justifies external tuning" precedent.
- Reinterpreting or repairing an ALREADY-broken file sitting on disk from a pre-fix toolkit version
  — UC-03/UC-04 only prevent a NEW broken file from being written; an existing one is already
  handled by FTR-027's resume-validity mechanism (regenerated on the next invocation) or, if
  needed, a manual repair script (same precedent as the FTR-028 follow-up's repair tool).
- Porting the new AC-table header check to any OTHER table (Business Rules, Use Case index) —
  scoped to the one table a real defect was reported against.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| `gaia-validate-feature-docs` replies with prose + a ` ```json ` fence that omits `needsRequirementsFix`/`needsTechSpecFix` (the real, confirmed case) | Recovered on the FIRST attempt via the relaxed schema — no retry needed at all |
| A schema-required worker's attempt ends in free text with no recoverable JSON anywhere, even after the relaxed schema | Retried once with a corrective nudge appended to the prompt |
| A schema-required worker's attempt ends in free text, but a delimited JSON blob IS recoverable via the existing fallback (with or without the relaxed fields) | Not retried — the fallback already recovers it |
| A schema-required worker still fails to produce structured output after the nudge retry, up to `WORKER_MAX_ATTEMPTS` | Same existing `"Worker returned no structured output"` error as today, now only after exhausting the bound |
| A genuine transient API error on attempt 1, followed by a missing-structured-output response on attempt 2 | Both conditions are independently retriable within the same bounded loop; attempt 3 is the last |
| A response's JSON candidate IS present for `needsRequirementsFix`/`needsTechSpecFix` but has the WRONG type (e.g. a string instead of boolean) | Still rejected by `validateSchema`'s type check — relaxing `required` does not relax type-checking for a value that IS present |
| An AC table with the correct 4-column header | No behavior change — unchanged from today |
| An AC table missing `Priority` (3 columns: `ID \| Criterion \| Related UC`) | Still accepted — the check only requires the first 3 column names/order to match; a missing trailing column is not this check's concern |
| An AC table with 5 columns (`ID \| Given \| When \| Then \| Priority`) | Rejected immediately with a precise "AC table columns must be..." error, before any per-UC dispatch |
| A non-schema worker's response has a closed whole-response fence wrap | Unchanged — the existing v0.19.2 unwrap already handles this |
| A non-schema worker's response has an UNCLOSED whole-response fence wrap, real headings after it | New: the opener is stripped, the remainder is used as-is |
| A non-schema worker's response legitimately starts with a real, intentional fenced code block that happens to never close (a genuine, different defect, not a whole-response wrap) | Edge case, accepted risk: stripping the opener and finding no heading in the remainder means the original text is returned unchanged (same as today) — only a response that ALSO reveals a real heading after stripping is affected |
| A per-component/per-UC generation result is invalid on the first attempt, valid on an immediate retry | Retried once, written and used as if it had been valid the first time — no error surfaces |
| A per-component/per-UC generation result is invalid on both attempts | The loop throws immediately, naming the specific item, before any later item in the same run is dispatched |
| `--force`/a revision cycle re-enters the same loops | Unaffected — the new validity check and retry apply identically on every entry, same as the existing resume-validity check already does |

## Data Model
N/A — internal/technical feature. No new on-disk artifact; UC-01/UC-03 affect in-memory worker
response handling, UC-02 adds a new deterministic check with no persisted schema of its own
(reports the same `errors[]` shape `req-skeleton-check.js` already uses), UC-04 changes the
CONDITION under which a per-item generation result gets written at all.

## Roles and Permissions
N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | `gaia-validate-feature-docs`'s worker schema no longer requires `needsRequirementsFix`/`needsTechSpecFix` | A response's JSON candidate omits both fields but includes `valid`/`findings`/`report` | `extractDelimitedStructuredOutput` recovers it on the FIRST attempt — reproduced against both real evidence files from the reported incident | Must |
| AC-02 | A response's JSON candidate DOES include `needsRequirementsFix`/`needsTechSpecFix` with the correct boolean type | `worker()` processes that attempt | Unchanged from today — the fields are still validated when present | Must |
| AC-03 | A schema-required worker's attempt ends in free text with no recoverable structured output, even after the relaxed schema | `worker()` processes that attempt | The next attempt (bounded by `WORKER_MAX_ATTEMPTS`) retries with a corrective nudge appended to the prompt | Must |
| AC-03b | Every attempt exhausts `WORKER_MAX_ATTEMPTS` still without usable structured output | `worker()` finishes its attempt loop | The same existing `"Worker returned no structured output"` error is thrown | Must |
| AC-04 | `req/index.md`'s Acceptance Criteria table has first 3 columns other than exactly `ID`, `Criterion`, `Related UC` in order | `req-skeleton-check.js` runs (before any per-UC dispatch) | It fails immediately with a precise column-shape error, never reaching `parseAcTable`'s positional destructure | Must |
| AC-05 | `req/index.md`'s Acceptance Criteria table has the correct 4-column header | `req-skeleton-check.js` runs | No behavior change from today | Must |
| AC-06 | `gaia-generate-requirements.md`'s own inline AC example | Inspected | It matches the real, authoritative 4-column template, no longer a 3-column stale duplicate | Must |
| AC-07 | A non-schema worker's response has a whole-response fence wrap that opens but never closes, with a real heading after the opener | `extractMarkdownDocument` processes it | The opener is stripped and the remainder (containing the real heading) is returned | Must |
| AC-08 | A non-schema worker's response has a CLOSED whole-response fence wrap | `extractMarkdownDocument` processes it | Unchanged from today (the existing v0.19.2 behavior) | Must |
| AC-09 | A per-component generation result fails `isValidComponentDetail` on its first attempt but passes on an immediate retry | `pm-phase1.js`'s per-component loop runs | The retried result is written; no error surfaces | Must |
| AC-10 | A per-component generation result fails `isValidComponentDetail` on both attempts | `pm-phase1.js`'s per-component loop runs | The loop throws immediately, naming the specific component, before any later component is dispatched | Must |
| AC-11 | A per-UC generation result fails `isValidUseCaseFile` on both attempts | `pm-phase1.js`'s per-UC loop runs | The loop throws immediately, naming the specific UC, before any later UC is dispatched | Must |
| AC-12 | All changes are delivered | `npm test` runs | All tests pass: new regression tests for AC-01 through AC-11, and a full-suite regression | Must |

## MVP vs Deferred

### MVP (must ship — all four issues, no deferred follow-up phase)
- UC-01: schema-missing-structured-output retry with corrective nudge (`lib/workflow-control.js`).
- UC-02: AC-table header validation (`req-skeleton-check.js`/`req-graph-checks.js`) + the agent
  doc's own stale-example correction (`gaia-generate-requirements.md`).
- UC-03: unclosed-fence recovery (`lib/workflow-control.js`).
- UC-04: immediate post-generation validity check + bounded retry, both loops (`pm-phase1.js`).
- Automated tests per AC-12.

### Deferred (next iteration, only if real evidence justifies it)
- Porting UC-02's header check to other Requirements/Tech-Spec tables.
- A general, externally-configurable retry-policy mechanism spanning all four new bounded retries.
- Reconciling/repairing already-broken files from a pre-fix toolkit version still sitting on disk
  in any consumer project.

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Exact wording of UC-01's SECONDARY corrective-nudge sentence (only reached if the relaxed schema still doesn't recover a payload) | **Open — resolve in Tech-Spec** | Lean toward a short, direct instruction naming the structured-output requirement explicitly, appended (not replacing) the original prompt |
| 2 | Should UC-04's bounded retry re-send the IDENTICAL prompt, or also append a corrective nudge (mirroring UC-01)? | **Open — resolve in Tech-Spec** | Lean toward identical prompt for the first retry (simplest, matches today's existing transient-API-error retry convention) — no evidence yet that a nudge is needed for THIS failure mode specifically |
| 3 | Where exactly does UC-02's header-check function live — a new function in `req-graph-checks.js` (matching its own "pure function, no I/O" convention), or inline in `req-skeleton-check.js`? | **Open — resolve in Tech-Spec** | Lean toward `req-graph-checks.js`, consistent with where every other structural check for this document already lives |

## Dependencies and Assumptions
- FTR-023 (`wb-graph-checks.js`'s AC-table header check), FTR-025 (`extractDelimitedStructuredOutput`,
  the closed-fence-unwrap fix), FTR-027 (resume-validity checks, reused unmodified as the
  authoritative "is this item valid" definition for UC-04), FTR-028 (skeleton-only validator prompt
  + the `needsComponentDetail`-optional-in-schema precedent UC-01 directly extends) — all
  available, all reused, none replaced.
- UC-01 is grounded in THREE independent real evidence cases now (two from the original
  `MFExample` FTR-003 report, a third from `Fincantieri.ISDM.JobScheduler` after upgrading to
  v0.21.0 specifically to test whether FTR-028's prompt reduction alone would fix it — it did not;
  all three show the identical missing-field pattern). Model choice (`haiku`) for
  `gaia-validate-feature-docs` is NOT changed by this feature — the root cause is schema strictness
  mismatched with a logically-reasonable model omission, not a model-capability gap evidenced by
  this data.
- `lib/workflow-control.js`, `req-skeleton-check.js`, and `req-graph-checks.js` are normal Node
  modules (real `require()` available); `pm-phase1.js` remains a sandboxed workflow script with no
  `require()` — UC-04's changes are inline, no new duplication needed since it only adds a bounded
  retry loop and a throw around calls/checks already present in that file.
- `npm test` is the only verification command; no separate build step exists.
- Directly motivated by a real, reproduced pipeline run against a different real project
  (`Fincantieri.ISDM.JobScheduler`, toolkit v0.20.0) — not a hypothetical resilience concern.
