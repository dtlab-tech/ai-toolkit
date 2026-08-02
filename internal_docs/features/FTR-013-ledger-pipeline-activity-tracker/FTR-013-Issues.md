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
