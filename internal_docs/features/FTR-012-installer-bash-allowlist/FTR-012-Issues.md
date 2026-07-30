# Issues Register — FTR-012

## Review Report — FTR-012 (scope: INFRA)

**Empirical verification**
- Build: N/A — plain JavaScript project, no compile step (per AGENTS.md, `npm test` is the primary verification).
- Tests: PASS — 12 suites, 193/193 tests pass, including the new `tests/cli/mergeAllowlist.test.js`. No pre-existing tests broken.

**Verdict: PASS** (0 CRITICAL; tests pass)

INFRA deliverables (INFRA-T01..T04) are all present in `C:\ws\Fincantieri.CommonLibraries.AIToolkit\bin\cli.js`:
- INFRA-T01: `CANONICAL_ALLOW` / `CANONICAL_ASK` (lines 75-91) match AC-11/AC-12 exactly; `commandToPermission` (line 96).
- INFRA-T02: `normalizeSettings` (line 102) — defensively handles null, non-object, and array inputs.
- INFRA-T03: `mergeArrays` (line 113, dedup union) and `applyAskBeatsAllow` (line 121).
- INFRA-T04: `readSettings` (line 131) / `writeSettings` (line 150) with missing/malformed/ok discrimination.
- Hard constraint satisfied: all new functions exported via the `else` branch of the `if (require.main === module)` guard (lines 694-718); no unconditional `module.exports`.

---

### CRITICAL (blocks merge)
none

### WARNING (should fix)

**[WARNING] Correctness — bin/cli.js:96 (`commandToPermission`)**
No-argument commands are formatted uniformly as `Bash(<cmd>:*)` (e.g. `Bash(pwd:*)`, and bare `Bash(ls:*)` / `Bash(git status:*)`). AC-11 explicitly offered the alternative `Bash(pwd)` "for no-argument commands", which signals doubt that the `:*` arg-wildcard matches a bare invocation with no arguments. If `Bash(pwd:*)` does not match a plain `pwd`, the pipeline will still prompt on exactly the trivial commands this feature exists to auto-approve — the stated real incident was a bare `ls`. Tests only assert string formatting; they cannot confirm runtime permission-matching behavior.
Direction: Empirically confirm in a real Claude Code session that `Bash(pwd:*)` / `Bash(ls:*)` pre-approve the bare, no-argument command. If they do not, emit `Bash(<cmd>)` (no `:*`) for no-argument commands as AC-11 suggests.

### INFO (improvements)

**[INFO] Reporting accuracy — bin/cli.js:135-137, 502-513 (`readSettings` / `mergeAllowlist`)**
A filesystem read failure (`fs.readFileSync` throw) returns `{ malformed: true }`, which drives the "reset (file was malformed)" path and logs "not valid JSON". An I/O/permission error is thus mislabeled as malformed JSON and silently overwrites the file.
Direction: Distinguish read-I/O errors from JSON parse errors so the status/warning reflects the real cause (and consider not overwriting on a transient read error).

**[INFO] Metric semantics — bin/cli.js:534,551 (`preserved` count)**
`countBefore = existingAllow.length + existingAsk.length` counts every existing entry as a "preserved rule", including entries that are also canonical (duplicates) and entries stripped from allow by ask-beats-allow. The AC-14 report line "merged (N rules preserved)" may therefore overstate distinct user-added rules.
Direction: If the report intends distinct user rules, count only existing entries not present in the canonical lists.

**[INFO] Feature completeness (out of INFRA scope)**
`AC-13` (docs/reference.md "Bash Permission Allowlist" section) and `AC-14` (install-toolkit SKILL.md Step 6 opt-in + Step 7 status line) are not implemented — `git diff` shows only `bin/cli.js` changed, and no "allowlist" reference exists in `docs/` or `.claude/`. These belong to the doc task and US-05-T02, not INFRA, so they do not block this INFRA phase, but the overall FTR-012 feature cannot be considered done until they land.
Direction: Ensure the US-05 and documentation tasks are reviewed/implemented before the feature branch merges.

---

## Review Report — FTR-012 US-01 (Fresh Installation with Allowlist Opt-In)

**Empirical verification**
- Build: N/A — plain JavaScript project, no compile step (AGENTS.md: `npm test` is primary verification).
- Tests: PASS — 12 suites, 193/193 pass (`npm test`, jest --bail), including `tests/cli/mergeAllowlist.test.js`. No pre-existing tests broken.
- CLI smoke test: `node bin/cli.js merge-allowlist <tmp>` -> written/exit 0; rerun -> merged/exit 0; missing arg -> error/exit 1. Output JSON matches canonical lists.

**Verdict: PASS** (0 CRITICAL; tests pass)

### CRITICAL (blocks merge)
none

### WARNING (should fix)

**[WARNING] Reporting accuracy — bin/cli.js:534,551,676 (`preserved` count surfaced by the US-01-T02 CLI entry point)**
`countBefore = existingAllow.length + existingAsk.length` counts every pre-existing entry as a "preserved rule", including entries that are pure canonical duplicates and entries stripped from allow by ask-beats-allow. On a plain reinstall with zero custom user rules the CLI prints `Allowlist: merged (33 rules preserved)` (26 allow + 7 ask), implying 33 user rules were preserved when none were user-authored. AC-14's "merged (N rules preserved)" report line will therefore overstate distinct user-added rules — and this message is emitted by the US-01 CLI handler, so it is in scope here.
Direction: Count only existing entries not already present in the canonical lists (distinct user rules), or rename the metric so the reported N is not read as "user rules preserved".

**[WARNING] Runtime matching risk — bin/cli.js:96 (`commandToPermission`, consumed by mergeAllowlist)**
No-argument commands are emitted uniformly as `Bash(<cmd>:*)` (e.g. `Bash(pwd:*)`, `Bash(ls:*)`). AC-11 explicitly permitted the alternative `Bash(pwd)` "for no-argument commands", signalling doubt that the `:*` arg-wildcard matches a bare invocation. The feature's stated raison d'être is a real incident where a bare `ls` stalled pm-phase3; if `Bash(ls:*)` does not pre-approve a plain `ls`, the feature fails at exactly the case it exists to solve. The tests assert only string formatting (`/^Bash\(.+:\*\)$/`), which cannot confirm runtime permission matching.
Direction: Empirically confirm in a real Claude Code session that `Bash(ls:*)` / `Bash(pwd:*)` pre-approve the bare, no-argument command. If they do not, emit `Bash(<cmd>)` (no `:*`) for no-argument commands as AC-11 allows.

### INFO (improvements)

**[INFO] I/O error mislabeled as malformed — bin/cli.js:135-137, 500-513 (`readSettings` / `mergeAllowlist`)**
An `fs.readFileSync` throw (permission/transient I/O error) returns `{ malformed: true }`, driving the "reset (file was malformed)" path and logging "not valid JSON", then overwriting the file. A transient read error is thus mislabeled and can silently clobber a valid `settings.local.json`.
Direction: Distinguish read-I/O errors from JSON parse errors; consider not overwriting on a transient read failure.

**[INFO] AC-08 / opt-in integration not yet coded (out of US-01 code scope)**
The install-toolkit Step 6 opt-in prompt ("Yes — write allowlist" / "No — skip") and the AC-08 "skipped (user said No)" report path are not implemented — no `allowlist` / `settings.local.json` / `merge-allowlist` references exist in `.claude/skills` or `docs`, and the install-toolkit skill is unchanged vs `main`. This belongs to US-05-T02 and the AC-13 doc task, so it does not fail this US-01 code review, but the overall FTR-012 feature is not done until it lands.
Direction: Ensure US-05-T02 (install-toolkit Step 6/Step 7 integration) and the AC-13 reference.md section are implemented and reviewed before the feature branch merges.
