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
