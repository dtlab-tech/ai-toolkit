# Issues Register — FTR-013

## Review Report — FTR-013 INFRA scope

### Empirical verification
- Build: N/A — plain JavaScript project, AGENTS.md states there is no compile/build step; `npm test` is the primary verification command.
- Tests: PASS — `npm test` → 214/214 passed, 14 suites. New suites `tests/cli/appendLedgerEntry.test.js` and `tests/cli/updateLedgerEntry.test.js` pass; no regressions.

### Verdict: PASS
0 CRITICAL findings and the test suite succeeds.

---

### CRITICAL (blocks merge)
none

---

### WARNING (should fix / confirm before downstream US tasks)

[WARNING] Architecture & Scope — bin/cli.js:564-614 and .claude/workflows/*.js
The approved Tech-Spec places these helpers as LOCAL functions inside each workflow script. Tech-Spec §4.2/§4.3/§4.4 explicitly state "Add helper functions ... at the top of the file (local functions, not imported)", and the §9 File Inventory lists only define-feature.md and pm-phase1/2/3.js as modified files — bin/cli.js is NOT listed as a target. feature.md's "Deferred" section further says extracting the helpers as shared utilities is deferred and per-file duplication is the MVP. The INFRA implementation instead put both helpers in bin/cli.js and exported them (jumping ahead to the deferred shared-util design). This is defensible (it makes them unit-testable and DRY) but it is an unratified deviation from the Gate-2-approved plan.
Interop risk: workflow scripts are ESM modules (`export const meta = ...`) run by the Claude Code Workflow runtime. It is unproven that they can `require('../../bin/cli')` (CommonJS) from that runtime. If they cannot, the downstream tasks (US-02-T01 / US-03-T01 / US-04-T01, which all say "Add ... helper functions to pm-phaseN.js") will have to re-duplicate the functions inline, leaving the bin/cli.js copy as dead, untested-in-context code and creating two divergent sources of truth.
Direction: Before starting US-02/03/04, empirically confirm whether a workflow script can consume `bin/cli.js` exports at runtime. If yes, update the Tech-Spec §9 File Inventory to record bin/cli.js as the single source and have the workflow scripts import it (do not duplicate). If no, follow the Tech-Spec as written (inline local functions per file) and treat the bin/cli.js copy as a tested reference implementation only. Either way, reconcile the plan so there is one authoritative location.

---

### INFO (improvements)

[INFO] Quality — bin/cli.js:564,593
Tech-Spec §3.4 declares both helpers as `async function` and every workflow call site uses `await appendLedgerEntry(...)` / `await updateLedgerEntry(...)`. The implementation is synchronous (uses `fs.*Sync`). `await` on a non-promise is harmless, so this works today, but the sync/async signature mismatch may surprise a maintainer wiring up the call sites.
Direction: Either keep sync and drop `await` in the workflow call sites, or document that these are intentionally synchronous. No functional change required.

[INFO] Robustness — bin/cli.js:579,613
Both helpers write with a single `fs.writeFileSync(...)`. The Tech-Spec and feature.md repeatedly call this "atomic", but a lone writeFileSync is not crash-atomic (a process kill mid-write can leave a truncated file), and Open Question #1 in feature.md flags concurrent writes during pm-phase3 parallel waves as untested. For true atomicity a write-to-temp-then-rename pattern is needed.
Direction: Acceptable for MVP (feature explicitly defers concurrency hardening). If AC-13 (valid JSON mid-phase) proves flaky under parallel waves, switch to temp-file + `fs.renameSync`. No action required for INFRA scope.

[INFO] Validation — bin/cli.js:564-614
Tech-Spec §3.3 lists field-level constraints (agent non-empty; phase/model/status enums; phase_delta_tokens non-negative integer; running ⇒ completed_at null; done/failed ⇒ both timestamps non-null). The helpers enforce none of these — they write whatever the caller passes. This is a reasonable design for low-level write primitives (callers construct entries), but the §3.3 rules are then unenforced anywhere.
Direction: Fine to leave enforcement to the callers, but note that no layer validates the schema; consider a lightweight assertion if malformed entries appear during integration testing.

---

## Review Report — FTR-013 US-02 (pm-phase1.js ledger tracking)

**Empirical verification**
- Build: N/A (plain JS project; AGENTS.md: "no separate compile/build step")
- Tests: PASS — `npm test` = 352/352 passed, 20 suites green
- Dual-copy: PASS — global `pm-phase1.js` byte-identical to repo copy
- Runtime constraint: PASS — no `fs`/`require`/`import` in the workflow script

**Verdict: PASS** (0 CRITICAL)

---

### CRITICAL (blocks merge)
none

### WARNING (should fix)

**[WARNING] Correctness / Token attribution — .claude/workflows/pm-phase1.js:211,214**
The validation revision re-runs of `generate-requirements` and `generate-tech-spec` (invoked inside the cycle loop when gaps are found) are real agent invocations that consume tokens, but they are NOT wrapped with append/update ledger entries and are NOT pushed to the in-memory `tokenLedger`. AC-01 requires "one entry per agent invocation across all four phases," and these revision invocations produce unattributed token cost that will silently under-count phase-1 actuals whenever a validation cycle triggers a doc regeneration.
Direction: Either wrap these two revision `agent()` calls with the same append/update pattern (e.g. keys `generate-requirements:phase1:revision{N}`), or add a short code comment + feature-doc note explicitly declaring revision re-runs out of ledger scope so the omission is a documented decision rather than a silent gap.

### INFO (improvements)

**[INFO] Telemetry label — .claude/workflows/pm-phase1.js:19,28**
The `appendLedgerEntry`/`updateLedgerEntry` helpers hardcode `phase: 'Requirements'` in the meta `agent()` options, even when the helper is called during the Tech-Spec and Validation phases. This mislabels the helper's own token telemetry against the Requirements phase. Cosmetic (does not affect the ledger contents written to disk).
Direction: Pass the current phase name into the helpers, or drop the phase option, so helper telemetry is attributed to the correct phase.

**[INFO] Test coverage of the real helpers — tests/cli/pm-phase1-ledger.test.js**
The ledger behavior test exercises the `bin/cli.js` fs-based helpers as a proxy; the actual `agent()`-based helpers inside `pm-phase1.js` are only verified via source-structure regex assertions (pm-phase1-source.test.js), never executed. This is an inherent limitation of the workflow runtime (acknowledged in the test header), but it means a semantic drift between the prompt text of the workflow helpers and the fs proxy would go undetected.
Direction: Acceptable for now given the runtime constraint. Consider a future shared, importable helper module (already listed as Deferred in feature.md) so one implementation is both used at runtime and unit-tested.

**[INFO] I/O-via-agent() call volume — .claude/workflows/pm-phase1.js:14-30**
Each append and update is a separate haiku `agent()` round-trip, so a clean phase-1 run issues ~6 extra agent calls purely for ledger bookkeeping (plus ensure-ledger). This is the pattern inherited from pm-phase2.js and is a deliberate design choice, not a US-02 defect. Noted for future consolidation.

---

## Review Report — FTR-013 US-01 (define-feature ledger init/finalize)

### Empirical verification
- Build: N/A — plain JavaScript project; AGENTS.md states there is no compile/build step. `npm test` is the primary verification command.
- Tests: PASS — full suite 251/251 across 16 suites. US-01 suite `tests/cli/defineLedger.test.js` in isolation: 19/19 passed.
- Dual-copy: `C:/Users/Tomada D/.claude/agents/define-feature.md` is byte-identical to the repo copy (AC-11 satisfied for define-feature.md).

### Verdict: PASS
0 CRITICAL findings and the test suite succeeds.

---

### CRITICAL (blocks merge)
none

---

### WARNING (should fix)

[WARNING] Test coverage / false confidence — tests/cli/defineLedger.test.js (whole file)
The test is titled "US-01-T03 — define-feature ledger initialization and finalization" but it does NOT test the agent. It calls `appendLedgerEntry` / `updateLedgerEntry` "as proxies for the Write-tool operations the agent performs" (its own header comment, lines 10-13). The `define-feature.md` agent never calls those helpers — it writes raw JSON via the Write tool (Phase 1c) and Read→Write (Phase 4b) and contains zero references to the helpers or bin/cli (grep count = 0). Those helper functions are already fully covered by `tests/cli/appendLedgerEntry.test.js` and `tests/cli/updateLedgerEntry.test.js`, so 18 of the 19 tests here are duplicate coverage of code the agent does not exercise. Only one test (line 179, "direct raw-JSON write") actually validates the format the agent emits. Net effect: the story's ACs (AC-02) are asserted green while nothing verifies the markdown instructions are correct — e.g. that the embedded JSON templates parse, that field names/order match, or that Phase 4b's Read→mutate→Write preserves started_at.
Direction: Either (a) reduce the suite to assertions against the exact raw-JSON strings embedded in define-feature.md Phase 1c/4b (parse them, assert shape), or (b) explicitly document that agent behavior is only verifiable via the US-04-T16 integration test and mark this suite as a schema-shape smoke test. Do not present helper re-tests as agent coverage.

[WARNING] Acceptance-criteria conflict — .claude/agents/define-feature.md:353-382 vs feature.md AC-01
US-01 is assigned AC-01 and AC-02 (Work-Breakdown line 48). AC-01 requires "positive phase_delta_tokens for each" entry across all phases. The agent hard-codes `phase_delta_tokens: 0` at both init and finalization and explicitly states "token measurement is not available to the agent directly" (line 367); the test even asserts it "remains 0" (lines 270-281). Therefore the define-feature entry can never satisfy AC-01. This also means the feature's headline Problem #1 ("Token cost attribution for the first two phases is permanently lost") is NOT solved for the define phase — timing is captured, token cost is still recorded as 0. AC-02 (status=done + non-null completed_at) is satisfied, so the story is partially delivered, but an in-scope AC is provably unmeetable by design.
Direction: Reconcile the ACs with reality — either amend AC-01 to exempt agent-driven entries that cannot self-measure tokens (and note token attribution for define/phase1/phase2 remains a gap), or specify a mechanism for the define phase to obtain its token delta. At minimum record this as a known limitation in FTR-013-Issues.md so downstream US-04 aggregation does not assume a positive value.

[WARNING] Premature side effects on abort — .claude/agents/define-feature.md:99-132
Phase 1c creates the feature directory (`mkdir -p`) and writes a `status: "running"` ledger BEFORE any grilling (Phase 2) or the user's final confirmation. If the user abandons or aborts during grilling, an empty feature directory plus a ledger stuck at `status: "running", completed_at: null` is left orphaned on disk. Per the feature's own resume semantics a lingering "running" entry is the signal for "interrupted here", so a later resume/bootstrap could misinterpret an abandoned definition as an in-progress pipeline. Note the pre-existing Phase 0e draft-confirmation happens before slug/PREFIX are finalized, so moving directory creation earlier trades one ordering risk for another.
Direction: Consider deferring directory + ledger creation until after the user confirms the feature name/slug (end of Phase 1b / start of Phase 2), or document that an orphaned "running" define entry is expected and how resume should treat a define-only ledger with no downstream phases.

---

### INFO (improvements)

[INFO] Stale committed artifact — internal_docs/features/FTR-013-.../FTR-013-token-ledger.json
The committed ledger in the feature dir uses the OLD schema (only `agent`, `model`, `phase_delta_tokens`; no `status`/`started_at`/`completed_at`) — it is the INFRA phase's own run ledger, not a product of US-01. Harmless to US-01 correctness but it contradicts the new schema this very feature introduces and could confuse a reader inspecting the feature's outputs.
Direction: Regenerate or remove before final PR so the shipped example reflects the new entry shape.

[INFO] Path convention — .claude/agents/define-feature.md:104,257
The agent writes to `docs/features/{PREFIX}-{slug}` while this repo stores features under `internal_docs/features/`. This is pre-existing (the whole agent uses `docs/features/`) and correct for consuming projects where define-feature is installed, so not introduced by US-01 — flagged only so it is not mistaken for a regression.
Direction: No action for US-01. If a single canonical path is desired, address it as a separate agent-wide change.

[INFO] Sync/async mismatch carried from INFRA — bin/cli.js:564,593
Helpers are synchronous (`fs.*Sync`) while the Tech-Spec declares them `async`. US-01's agent uses neither (it uses the Write tool), so this does not affect US-01, but the note from the INFRA review still stands for the workflow-based stories.
Direction: Track under the existing INFRA WARNING; no US-01 action.

---

## Review Report — FTR-013 US-03 (Track Phase 2 Agent Invocations, pm-phase2.js)

### Empirical verification
- Build: N/A — plain JS project, no compile step (per AGENTS.md; `npm test` is the verification command)
- Scoped tests (pm-phase2): PASS — 40/40 passed — `npx jest pm-phase2` (pm-phase2-ledger.test.js + pm-phase2-source.test.js)
- Full suite: FAIL — 22 failed / 378 passed (400 total) — ALL failures isolated to `tests/cli/pm-phase3-source.test.js` (US-04 scope; pm-phase3.js is unmodified on this branch)

### Verdict: PASS (US-03 scope only)
0 CRITICAL findings within US-03 scope. The feature branch is not mergeable until US-04 completes (see W1 below).

---

### CRITICAL (blocks merge)
none (within US-03 scope)

---

### WARNING (should fix)

**[W1] Branch-level test failure — tests/cli/pm-phase3-source.test.js — 22 failing tests**
The overall `npm test` is RED. Every failure is in the US-04 pm-phase3 source-structure suite (asserts appendLedgerEntry/updateLedgerEntry wrapping inside executePhase, review-solution wrapping, etc.). pm-phase3.js has NOT been modified on this branch, so US-04 is unimplemented. US-03 is independently complete, but the feature branch as a whole cannot merge to main (CI runs the full Jest suite on every PR) until US-04 lands and turns the suite green.
Direction: Complete US-04 (pm-phase3.js helper functions + per-agent-call append/update wrapping + persist-ledger removal) before opening the FTR-013 PR. Do not merge US-03 in isolation on a branch that leaves `npm test` red.

---

### INFO (improvements)

**[I1] Duplicated helpers — pm-phase2.js:14-30 vs bin/cli.js:564-614**
appendLedgerEntry/updateLedgerEntry exist in three forms: the CommonJS versions in bin/cli.js (fs-based, tested) and inline agent()-based copies in pm-phase1.js / pm-phase2.js. This divergence is already acknowledged in FTR-013-Issues.md (interop risk: workflow ESM runtime cannot require the CJS bin/cli.js) and explicitly deferred in the feature.md "Deferred" list. No action for MVP; revisit as shared-utility extraction.

**[I2] Per-entry agent() round-trips — pm-phase2.js**
Each append/update is a separate haiku agent() call, adding ~2 bookkeeping round-trips to phase 2. Already documented as a deliberate design choice in FTR-013-Issues.md. Noted for future consolidation.

**[I3] Modified artifact FTR-013-token-ledger.json is runtime output**
The modified artifact FTR-013-token-ledger.json is runtime output (actuals written by the in-progress pipeline run), not US-03 source code. Out of review scope; no concern.

---

## Review Report — FTR-013 US-02 (pm-phase1.js Phase 1 ledger tracking)

**Empirical verification**
- Build: N/A — plain JS project; AGENTS.md: "no separate compile/build step"; `npm test` is the verification command.
- Scoped tests (US-02): PASS — 55/55 (pm-phase1-source.test.js, pm-phase1-ledger.test.js, appendLedgerEntry.test.js, updateLedgerEntry.test.js).
- Full suite: FAIL — 22 failed / 378 passed (400 total). ALL failures isolated to `tests/cli/pm-phase3-source.test.js` (US-04 scope; pm-phase3.js unmodified on this branch).
- Dual-copy (AC-11): PASS — global `pm-phase1.js` byte-identical to repo copy.
- Runtime constraint: PASS — no `fs`/`require`/`import`; all I/O via `agent()`.

**Verdict: PASS (US-02 scope only)** — 0 CRITICAL in scope.

---

### CRITICAL (blocks merge)
none (within US-02 scope)

---

### WARNING (should fix)

**[W1] Branch-level test failure — tests/cli/pm-phase3-source.test.js — 22 failing tests**
The overall `npm test` is RED. Per the review protocol, a PASS at the branch level requires the full suite to succeed. Every failure is in the US-04 pm-phase3 source-structure suite (asserts appendLedgerEntry/updateLedgerEntry wrapping inside executePhase, review-solution wrapping, etc.). pm-phase3.js has NOT been modified on this branch, so US-04 is unimplemented. US-02 is independently complete, but the feature branch as a whole cannot merge to main (CI runs the full Jest suite on every PR to main per AGENTS.md/FTR-010) until US-04 lands and turns the suite green.
Direction: Complete US-04 before opening the FTR-013 PR. Do not merge on a branch that leaves `npm test` red.

**[W2] Correctness / Token attribution — .claude/workflows/pm-phase1.js:210-215**
The validation revision re-runs of `generate-requirements` and `generate-tech-spec` (invoked inside the cycle loop when `resultText.includes('Requirements')` / `'Tech-Spec'`) are real token-consuming agent() invocations, but they are NOT wrapped with append/update ledger entries and NOT pushed to the in-memory `tokenLedger`. AC-01 requires "one entry per agent invocation across all four phases," so these revision invocations produce unattributed token cost that silently under-counts phase-1 actuals whenever a validation cycle triggers a doc regeneration. Already recorded in FTR-013-Issues.md:61-63 but not remediated.
Direction: Either wrap these two revision agent() calls with the append/update pattern (e.g. keys `generate-requirements:phase1:revision{N}`), or add a code comment + feature-doc note explicitly declaring revision re-runs out of ledger scope so the omission is a documented decision, not a silent gap.

---

### INFO (improvements)

**[I1] Telemetry phase label — .claude/workflows/pm-phase1.js:19,28**
`appendLedgerEntry`/`updateLedgerEntry` hardcode `phase: 'Requirements'` in the helper's own `agent()` options, even when called during Tech-Spec and Validation phases. This mislabels the helper's own token telemetry against the Requirements phase. Cosmetic — does not affect ledger contents written to disk.
Direction: Pass the current phase name into the helpers or drop the phase option.

**[I2] Test coverage is proxy-only — tests/cli/pm-phase1-ledger.test.js**
The ledger behavior test exercises the bin/cli.js fs-based helpers as a proxy; the actual agent()-based helpers inside pm-phase1.js are only verified via source-structure regex (pm-phase1-source.test.js), never executed. Inherent limitation of the workflow runtime (acknowledged in the test header), but semantic drift between the workflow helpers' prompt text and the fs proxy would go undetected.
Direction: Acceptable given the runtime constraint. Consider the Deferred shared importable helper module so one implementation is both run at runtime and unit-tested.

**[I3] Bookkeeping agent() round-trips — .claude/workflows/pm-phase1.js:14-30**
Each append/update is a separate haiku agent() round-trip; a clean phase-1 run issues ~6 extra agent calls plus ensure-ledger purely for ledger bookkeeping. Inherited design choice from pm-phase2.js, not a US-02 defect. Noted for future consolidation.

---

## Review Report — FTR-013 US-01 (Initialize and Track Ledger in define-feature Agent)

### Empirical verification
- Build: N/A (plain JS, no compile step per AGENTS.md)
- Tests: PASS — `npm test` 373/373 passed; `defineLedger` suite 24/24 passed
- cli.js loads clean; `appendLedgerEntry` / `updateLedgerEntry` exported via require.main guard
- Global copy sync (AC-11): `define-feature.md` repo vs `C:/Users/Tomada D/.claude/agents/` — IDENTICAL

### Verdict: PASS (0 CRITICAL)

### CRITICAL
none

### WARNING

[WARNING] Test coverage — tests/cli/defineLedger.test.js
The US-01-T03 tests exercise the INFRA helpers `appendLedgerEntry`/`updateLedgerEntry` as *proxies* for the Write-tool operations that define-feature.md actually performs (the test file header states this explicitly). The agent's real Phase 1c behavior writes raw JSON via the Write tool, not via these helpers, so the prose instructions themselves are not executed by any test. Only one test (line 179, "direct raw-JSON write") approximates the real path. Net effect: US-01-T03 largely re-tests INFRA-T01/T02 rather than the define-feature contract. This is inherent to testing a prose agent spec, but the coverage claim for US-01 is weaker than it appears.
Direction: Acceptable for MVP given a prose agent cannot be unit-executed. Consider a structural test asserting the exact JSON schema/keys embedded in define-feature.md Phase 1c/4b code fences stay in sync with the entry shape the helpers produce, so drift in the agent prose is caught.

[WARNING] AC alignment — define-feature entry phase_delta_tokens is permanently 0
Phase 4b (define-feature.md lines 364-367) instructs leaving `phase_delta_tokens: 0` because the agent cannot measure tokens. AC-02 (define-specific: status=done + non-null completed_at) is satisfied. However AC-01 requires "positive phase_delta_tokens for each" entry across all four phases — the define entry can never meet this. This is an acknowledged limitation in the spec/implementation, not a regression, but AC-01 as literally worded is unsatisfiable for the define row.
Direction: No code change required for US-01. Flag for the acceptance sign-off that AC-01's "positive tokens for every entry" carve-outs the define-feature row (0 tokens is expected and documented). If token attribution for define is ever needed, it must come from the orchestrator, not the agent.

### INFO

[INFO] Path convention — define-feature.md hardcodes docs/features/
define-feature.md (lines 3, 85-89, 104, 257, 262) writes feature dirs and the new ledger to `docs/features/{PREFIX}-{slug}/`, but this project's actual features (including FTR-013) live under `internal_docs/features/`. Phase 0c even lists both "(whichever exists)". This inconsistency predates US-01 (present in ca84538~1), so it is not introduced by this story — but US-01 added the ledger write to the same hardcoded `docs/features/` path, meaning in a repo that uses `internal_docs/features/` the ledger would land in a different tree than the feature docs.
Direction: Out of scope for US-01. Track separately: make the output root a single derived value (respecting `internal_docs/features/` when that is the house style) so the ledger co-locates with feature.md.

[INFO] Comment banner typo risk in bin/cli.js (INFRA, not US-01)
Grep initially rendered comment lines 582/588/616 with a leading backslash; Read confirmed they are valid `//` comments and node loads cli.js cleanly. No action — noted only to document the artifact was investigated and ruled out.

---

## Review Report — FTR-013 US-03 (pm-phase2.js Phase 2 ledger tracking)

### Empirical verification
- Build: N/A — plain JS project, no compile step (AGENTS.md; `npm test` is the verification command)
- Full suite: PASS — `npm test` = 373/373 passed, 21 suites green
- Scoped tests (pm-phase2): PASS — 40/40 (`npx jest pm-phase2`: pm-phase2-ledger.test.js + pm-phase2-source.test.js)
- Dual-copy (AC-11): PASS — global `pm-phase2.js` byte-identical to repo copy
- Runtime constraint: PASS — no `fs`/`require`/`import`; all ledger I/O via `agent()`
- Model consistency: PASS — ledger hardcodes `model: 'haiku'`, matches declared model in `generate-work-breakdown.md`
- Budget ordering: PASS — `beforeWB` captured after `appendLedgerEntry`, so bookkeeping round-trip is excluded from `wbTokens`

### Verdict: PASS (0 CRITICAL)

---

### CRITICAL (blocks merge)
none

---

### WARNING (should fix)

**[W1] Interrupted-path leaves no "failed" status — .claude/workflows/pm-phase2.js:59-69**
If the `generate-work-breakdown` `agent()` call throws, `updateLedgerEntry(...'done'...)` never runs and the entry is left `status: "running"`. Per the feature's resume semantics this is the intended "interrupted here" signal, but unlike pm-phase3's design (feature.md step 13: "On failure: update status: failed") there is no try/catch to distinguish a genuine crash from an in-progress run in phase 2. Acceptable for MVP (US-03 tasks do not call for failure handling), but the omission is undocumented for phase 2.
Direction: Either wrap the dispatch in try/catch to set `status: "failed"` on error (mirroring the phase3 contract), or add a one-line comment declaring phase-2 failure handling intentionally deferred so the gap is a documented decision.

---

### INFO (improvements)

**[I1] Proxy-only test coverage — tests/cli/pm-phase2-ledger.test.js**
The behavior suite exercises the `bin/cli.js` fs-based helpers as a proxy; the actual `agent()`-based helpers inside pm-phase2.js are only verified by source-structure regex (pm-phase2-source.test.js), never executed. Inherent to the workflow runtime, but prompt-text drift between the workflow helpers and the fs proxy would go undetected. Already acknowledged in the test header. Consider the Deferred shared importable helper module so one implementation is both run at runtime and unit-tested.

**[I2] Duplicated helpers — pm-phase2.js:14-30 vs pm-phase1.js:14-30 vs bin/cli.js:564-614**
Three copies of appendLedgerEntry/updateLedgerEntry (two agent()-based inline copies + one fs-based tested copy). Already documented in FTR-013-Issues.md and explicitly deferred in feature.md. No action for MVP.

**[I3] Per-entry agent() round-trips — pm-phase2.js**
Each append/update is a separate haiku `agent()` call, adding ~2 bookkeeping round-trips to phase 2. Deliberate design choice, documented. Noted for future consolidation.

**[I4] Commit hygiene — commit 7d6f9bb**
The US-03 commit to pm-phase2.js is only a 2-line comment; the functional append/update wrapping actually landed in ca84538 (labelled "US-01"). The same US-03 commit also preemptively added tests/cli/pm-phase3-source.test.js (US-04 scope), which was red until US-04 landed. Full suite is green at HEAD now, so no residual impact — flagged only for traceability.

**[I5] Prior branch-red warning resolved**
The W1 recorded in earlier US-03/US-02 reviews (full `npm test` red due to unimplemented pm-phase3) is now RESOLVED: US-04 has been committed and the suite is green (373/373) at HEAD.
