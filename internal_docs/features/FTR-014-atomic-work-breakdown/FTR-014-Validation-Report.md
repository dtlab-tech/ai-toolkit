# Validation Report — FTR-014

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-014 — Atomic Work Breakdown |
| Version | 6.0 |
| Date | 2026-08-05 |
| Status | Full re-validation after fifth round of corrections |

## Summary

| Document | Gaps found (this round) | Gaps resolved | Status |
|----------|------------------------|--------------|--------|
| FTR-014-Requirements.md | 0 | — | ✅ Clean (no changes) |
| FTR-014-Tech-Spec.md | 1 | 1 | ✅ Clean |

**feature.md was not modified** in any round. Requirements.md was not modified this round.

---

## Round 5 Gap found and resolved

### FTR-014-Tech-Spec.md

| # | Gap | Resolution |
|---|-----|-----------|
| T5-1 | Six failure paths in wb-validate and wb-render recorded `exit_code: null` even though the command had been executed and the exit code was available: (1) empty stdout after exit 0 or 1; (2) non-JSON stdout after exit 0 or 1; (3) consistency guard exit 0 + valid=false; (4) consistency guard exit 1 + valid=true; (5) renderer markdownPath/csvPath absent after exit 0; (6) renderer markdownExists/csvExists=false after exit 0 | **wb-validate:** declared `let validateExitCode = null` before the try block; set to `validateWrapper.exitCode` immediately after the agent call returns — before any throw; catch now uses `err._exitCode ?? validateExitCode ?? null`, so all post-command failures record the actual exit code. **wb-render:** `renderResult` was already declared outside the try; catch updated to `err._exitCode ?? renderResult?.exitCode ?? null`, covering all path-check and file-existence throws that occur after exit 0. Agent exceptions before the command result is received leave `validateExitCode`/`renderResult` at their null initial values, correctly producing `exit_code: null`. |

---

## Feasibility verification

### Exit code resolution chain — wb-validate

The three-level fallback `err._exitCode ?? validateExitCode ?? null` resolves correctly for every failure mode:

| Failure mode | `validateExitCode` | `err._exitCode` | Recorded `exit_code` |
|---|---|---|---|
| Exit 2 (runtime error) | `2` | `2` (attached to throw) | `2` |
| Unexpected exit (e.g., 99) | `99` | `99` (attached to throw) | `99` |
| Exit 0 or 1, empty stdout | `0` or `1` | not set | `0` or `1` |
| Exit 0 or 1, non-JSON stdout | `0` or `1` | not set (JSON.parse throws a plain Error) | `0` or `1` |
| Exit 0, valid=false (consistency guard) | `0` | not set | `0` |
| Exit 1, valid=true (consistency guard) | `1` | not set | `1` |
| Agent exception before command result | `null` (never set) | not set | `null` |

**Conclusion:** The general rule — "script ran and a command result was received → record the exit code returned, even if 0; exception before the result → null" — is now mechanically enforced by the order of operations: `validateExitCode` is set as the first statement after the agent call, before any conditional throw.

### Exit code resolution chain — wb-render

The two-level fallback `err._exitCode ?? renderResult?.exitCode ?? null`:

| Failure mode | `renderResult?.exitCode` | `err._exitCode` | Recorded `exit_code` |
|---|---|---|---|
| Exit non-zero | actual code | actual code (attached to throw) | actual code |
| Exit 0, markdownPath absent | `0` | not set | `0` |
| Exit 0, csvPath absent | `0` | not set | `0` |
| Exit 0, markdownExists=false | `0` | `0` (attached to throw) | `0` |
| Exit 0, csvExists=false | `0` | `0` (attached to throw) | `0` |
| Agent exception before renderResult received | `null` (`renderResult` still null) | not set | `null` |

**Conclusion:** `renderResult` is declared before the try block with value `null`, so `renderResult?.exitCode` is always safe to evaluate. It is `null` only if the agent threw before the structured output was returned (e.g., timeout, schema mismatch). All post-command failures record the actual exit code.

### Consistency with UC-06, BR-23, AC-21

- **UC-06 step 3** requires: "`failed` entries record actual token delta consumed up to failure, `completed_at`, `error_summary`, and `exit_code` when available"
- **BR-23** defines: "`failed` means technical error — records actual tokens consumed up to the point of failure plus `error_summary` and `exit_code` when available"
- **AC-21** requires: "`failed` entries additionally include `error_summary` and `exit_code` (when available)"

The phrase "when available" in Requirements is now precisely mapped: available means "the command ran and returned a structured result"; not available means "the agent threw before any result was received". The resolution chains in the Tech Spec implement this exactly.

---

## Full exit code test matrix (category 15)

| Scenario | `validateExitCode` / `renderResult?.exitCode` | `err._exitCode` | Ledger `exit_code` | Ledger status |
|---|---|---|---|---|
| wb-validate exit 0, valid=true | 0 | — | — | `done` |
| wb-validate exit 1, valid=false | 1 | — | — | `done` |
| wb-validate exit 2 | 2 | 2 | 2 | `failed` |
| wb-validate exit 99 | 99 | 99 | 99 | `failed` |
| wb-validate exit 0, empty stdout | 0 | — | 0 | `failed` |
| wb-validate exit 1, empty stdout | 1 | — | 1 | `failed` |
| wb-validate exit 0, non-JSON stdout | 0 | — | 0 | `failed` |
| wb-validate exit 0, valid=false | 0 | — | 0 | `failed` |
| wb-validate exit 1, valid=true | 1 | — | 1 | `failed` |
| wb-validate agent exception (no result) | null | — | null | `failed` |
| wb-render exit non-zero | actual | actual | actual | `failed` |
| wb-render exit 0, markdownPath absent | 0 | — | 0 | `failed` |
| wb-render exit 0, csvPath absent | 0 | — | 0 | `failed` |
| wb-render exit 0, markdownExists=false | 0 | 0 | 0 | `failed` |
| wb-render exit 0, csvExists=false | 0 | 0 | 0 | `failed` |
| wb-render agent exception (no result) | null | — | null | `failed` |
| Semantic technical failure | n/a | — | null | `failed` |

---

## Consistency cross-check (complete)

| Claim | Requirements | Tech Spec | Consistent? |
|-------|-------------|-----------|-------------|
| AC-22 `Related UC` = `All UCs` | AC-22 | parser contract Section 3.2 step 7 | ✅ |
| `failed` entries record actual tokens | UC-06, BR-23, AC-21 | `budget.spent() - beforeX` in all catch blocks | ✅ |
| `skipped` entries record zero tokens | UC-06, BR-23 | `phase_delta_tokens: 0` in all skipped appends | ✅ |
| `failed` entries include `error_summary` | UC-06, AC-21 | `normalizeError(err)` in all catch blocks | ✅ |
| `exit_code` set when script ran and returned result | UC-06, BR-23, AC-21 | `err._exitCode ?? validateExitCode ?? null` / `err._exitCode ?? renderResult?.exitCode ?? null` | ✅ |
| `exit_code: null` only when agent threw before result | UC-06, BR-23 | `validateExitCode`/`renderResult` remain null only if agent exception before structured output | ✅ |
| wb-validate exit 2 → ledger `failed`, exit_code 2 | UC-02 error flows | throw with `_exitCode`; `validateExitCode = 2` | ✅ |
| wb-validate exit 1 → ledger `done`, Gate 2 blocked | UC-02, UC-05 | exit code routing; `wbValidatorPassed = false` | ✅ |
| wb-validate consistency guard exit 0 → exit_code 0 | UC-06 | `validateExitCode = 0`; fallback in catch | ✅ |
| wb-validate consistency guard exit 1 → exit_code 1 | UC-06 | `validateExitCode = 1`; fallback in catch | ✅ |
| wb-render exit 0 + missing file → exit_code 0 | UC-04, UC-05 | `renderResult?.exitCode = 0`; fallback in catch | ✅ |
| Renderer failure blocks Gate 2 | UC-05, BR-20, AC-20 | `renderFailed` in `gate2_blocked`; blocking reason in main loop | ✅ |
| Semantic findings (blocking) → render proceeds | UC-03, UC-04, AC-20 | `canRender = wbValidatorPassed && !semanticFailed` | ✅ |
| Semantic technical failure → render skipped | UC-03, AC-19 | `semanticFailed = true` in catch; `canRender = false` | ✅ |

---

## File and test inventory

### New files (7 — unchanged)

| Path | Purpose |
|---|---|
| `.claude/agents/validate-work-breakdown-semantic.md` | Sonnet LLM agent for semantic validation |
| `.claude/scripts/wb-validate.js` | Deterministic structural validator (Node.js CLI) |
| `.claude/scripts/wb-render.js` | Deterministic Markdown and CSV renderer (Node.js CLI) |
| `tests/cli/wb-validate.test.js` | Unit tests for structural validator (17 test categories) |
| `tests/cli/wb-render.test.js` | Unit tests for renderer (6 test categories) |
| `tests/cli/wb-csv-regression.test.js` | CSV regression test against pm-phase3 parser |
| `tests/cli/install-toolkit.test.js` | Installer test: all 3 install modes |

### Modified files (5 — unchanged)

| Path | Change |
|---|---|
| `.claude/workflows/pm-phase2.js` | `validateExitCode` outside try; `err._exitCode ?? validateExitCode ?? null` in validate catch; `err._exitCode ?? renderResult?.exitCode ?? null` in render catch |
| `.claude/agents/generate-work-breakdown.md` | Produce schema v2 JSON |
| `.claude/skills/implement-feature/SKILL.md` | Gate 2 presentation with all blocking reasons |
| `.claude/agents/install-toolkit.md` | Add `.claude/scripts/` to copied directories |
| `bin/cli.js` | Add `.claude/scripts/` to global install mapping |

---

## Notes on unchanged documents

- **feature.md**: Not modified in any round.
- **Requirements.md**: Not modified in rounds 4 or 5; all claims verified consistent with Tech Spec.
- **pm-phase3**: Not modified.

---

## Validation date

2026-08-05
