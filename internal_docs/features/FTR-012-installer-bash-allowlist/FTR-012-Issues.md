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

---

## Review Report — FTR-012 US-02 (Merge Allowlist into Existing Settings)

**Empirical verification**
- Build: N/A — plain JavaScript project, no compile step (AGENTS.md: `npm test` is the primary verification).
- Tests: PASS — 12 suites, 196/196 (`npm test`, jest --bail), including the 3 new US-02-T03 ask-preservation tests and the US-02-T04 malformed-recovery tests. No pre-existing tests broken.
- CLI smoke test: `node bin/cli.js merge-allowlist <tmp>` on a fixture with `env`, custom allow/ask, and conflicting entries → AC-02 (user rules + non-Bash `env` preserved), AC-03/AC-04 (ask-beats-allow both directions), AC-05 (malformed reset), and idempotency all confirmed empirically.

**Verdict: PASS** (0 CRITICAL; tests pass)

Scope note: the US-02 core logic (merge path + malformed recovery in `mergeAllowlist`) was already committed in `803018a`. The uncommitted working tree adds the US-02-T03 tests (in scope) plus an `update-gitignore` CLI handler that belongs to US-05.

### CRITICAL (blocks merge)
none

### WARNING (should fix)

**[WARNING] Reporting accuracy — bin/cli.js:534,551 (`preserved` count, a US-02-T01 deliverable)**
`countBefore = existingAllow.length + existingAsk.length` counts every pre-existing entry as a "preserved rule", including pure canonical duplicates and entries stripped from allow by ask-beats-allow. Confirmed empirically: a first merge of a 4-entry file reported `merged (4 rules preserved)`, then an immediate reinstall reported `merged (35 rules preserved)` — implying 35 user rules were preserved when the file is now almost entirely canonical entries. US-02-T01 specifies the return `{ status: 'merged', preserved: N }` and AC-14 renders it as "merged (N rules preserved)", so this misleading N is a US-02 deliverable defect (previously flagged in INFRA and US-01 reviews, still unfixed).
Direction: Count only existing entries not present in the canonical lists (distinct user rules), or rename the metric so N is not read as "user rules preserved".

### INFO (improvements)

**[INFO] Reset reason not surfaced by CLI — bin/cli.js:504,513,676 vs AC-05**
`mergeAllowlist` returns `{ status: 'reset', reason: 'malformed' }`, but the CLI handler prints only `Allowlist: reset` (the `preserved !== undefined` branch does not cover `reason`). AC-05 / AC-14 call for "reset (file was malformed)". The status line loses the cause.
Direction: Include the `reason` in the reset status line so the installer can report "reset (file was malformed)".

**[INFO] I/O read error mislabeled as malformed — bin/cli.js:135-137, 503-514 (`readSettings` / `mergeAllowlist`)**
An `fs.readFileSync` throw (permission/transient I/O error) returns `{ malformed: true }`, driving the "reset" path, logging "not valid JSON", and overwriting the file. A transient read error is thus mislabeled and can silently clobber a valid `settings.local.json`. Pre-existing across INFRA/US-01; still present in the US-02 merge entry.
Direction: Distinguish read-I/O errors from JSON parse errors; consider not overwriting on a transient read failure.

**[INFO] Out-of-scope handler landed in working tree — bin/cli.js:682-699 (`update-gitignore` CLI entry)**
The uncommitted diff adds an `update-gitignore <dest>` CLI handler. This is US-05 (`.gitignore` management), not US-02. It is harmless and its `updateGitignore()` unit tests pass, but it is not part of the US-02 slice under review.
Direction: Confirm this is intentional pre-work for US-05; otherwise stage it with the US-05 commit rather than the US-02 test additions.

**[INFO] Malformed reset discards non-Bash sections (accepted per AC-05)**
On the reset path, a prior `env`/other top-level keys are lost because the unparseable file cannot be read. Empirically confirmed (`env.KEEP` gone after reset). This matches AC-05's "reset to canonical" intent, so it is not a defect — noted for awareness only.
Direction: None required; document the reset behavior in the AC-13 reference.md section if user data loss on malformed reset is a concern.

---

## FTR-012 US-05 Review — Issues Register

**Verdict: PASS** — 0 CRITICAL. `npm test` 196/196 passed. No build step (JS project; npm test is the verification command per AGENTS.md).

### CRITICAL (blocks merge)
none

### WARNING (should fix)

**[WARNING] Architecture/Traceability — install-toolkit.md:287-304 (Step 7 report)**
US-05-T02 in the Work Breakdown explicitly states "Record status in Step 7 report" for the .gitignore step, but the Step 7 report template has no `.gitignore` status line. The `update-gitignore` CLI returns a meaningful status ('created' / 'appended' / 'already') via stdout ("Gitignore: {status}"), and Step 6b invokes it, yet that result is silently discarded and never surfaced to the user.
Direction: Add a `.gitignore: {gitignore_status}` line to the Step 7 report block, and capture the `Gitignore: ...` stdout in Step 6b to populate it (mirroring how `allowlist_status` is captured). AC-06/AC-07 are functionally satisfied by the code, so this is a reporting/traceability gap, not a correctness bug.

### INFO (improvements)

**[INFO] Error handling — install-toolkit.md:279-283 (Step 6b)**
Step 6b calls `node bin/cli.js update-gitignore "{dest}"` but does not check its exit code. If the write fails (function returns {status:'error'}, CLI exits 1), the installer neither reports nor reacts. Since the allowlist step is documented as advisory/non-blocking this is acceptable, but a one-line "gitignore update failed — add .claude/settings.local.json manually" notice would prevent a silent gap where a user's local settings could later be committed.
Direction: Optionally surface a warning when the update-gitignore exit code is non-zero.

**[INFO] AC-14 status-value mismatch — install-toolkit.md:264-277 (Step 6, adjacent to US-05 edits)**
Outside strict US-05 scope but in the same edited file: AC-14 specifies the Allowlist report values as "written" / "merged (N rules preserved)" / "skipped (user said No)" / "skipped (already up to date)" / "failed — see above". Step 6 instead can set "reset (file was malformed)" (not in AC-14's list) and never sets "skipped (already up to date)".
Direction: Reconcile the Step 6 status strings with AC-14 (either add "skipped (already up to date)" handling and align "reset..." wording, or update AC-14). Track under US-01/US-02 rather than US-05.
