# Validation Report — FTR-016

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-016: Deterministic Execution Ledger Foundation |
| Version | 2.1 (Gate-1 review cycle 2 — targeted corrections) |
| Date | 2026-08-27 |
| Status | Draft |

> This report was first regenerated after the Gate-1 review rejected the initial "0 gaps / all clean" claim (§1–§8 below verify the original ten corrections). It has now been **updated in place** (not regenerated) after Gate-1 review **cycle 2** raised four further defects; **§9 verifies those four explicitly** and lists the modified sections + the updated realignment matrix. Per the reviewer's instruction, no "0 gaps" claim is made until: the resolver has a truly invocable facade, the legacy-token semantics are unambiguous, the malformed lock is recoverable, and the `operation_id` format matches its declared guarantee — all four are verified resolved in §9.

## Summary

| Document | Feature claims covered | Contradictions found | Contradictions resolved | Status |
|----------|------------------------|----------------------|-------------------------|--------|
| FTR-016-Requirements.md | 13 / 13 | 0 (post-review) | 8 (see §3) | ✅ Consistent |
| FTR-016-Tech-Spec.md | 13 / 13 | 0 (post-review) | 8 (see §3) | ✅ Consistent |

The two documents are mutually consistent and faithful to the **approved, unchanged** `feature.md`. No scope was widened beyond what `feature.md` authorises; the eight substantive contradictions raised at Gate 1 are each verified resolved below.

---

## 1. Feature-claim coverage (`feature.md` → Requirements → Tech-Spec)

| # | Claim in `feature.md` | Requirements anchor | Tech-Spec anchor | Verdict |
|---|-----------------------|---------------------|------------------|---------|
| 1 | Single canonical module is the only writer | BR-01, AC-01, AC-02 | §1, §3.5, §3.7 (exports), §9 | ✅ |
| 2 | CLI facade `open\|close\|fail\|skip` | UC-01..04, §6.1, AC-03 | §3.4, §3.7 dispatcher | ✅ |
| 3 | Atomic writes (temp+fsync+rename) | BR-06, NFR-01/02, AC-06 | §3.1, §3.5 `_writeLedger` | ✅ |
| 4 | Cross-process lock serialises updates | BR-07, NFR-03/04, UC-09, AC-07 | §3.5, §8 | ✅ |
| 5 | Unknown tokens = `null` only (never 0) | BR-04, §4.1/§4.2, AC-24 | §3.1, §3.3, §3.4 close | ✅ |
| 6 | Fail-closed on any command failure | BR-16, NFR-07, UC-11, AC-19/20 | §3.2, §3.4, §3.6 workflow | ✅ |
| 7 | Deterministic features-root resolution | BR-14, UC-05, AC-14 | §3.7 `resolveFeaturesRoot` | ✅ |
| 8 | Legacy/back-compat preservation | BR-11, NFR-06, AC-12/16 | §3.1, §3.3 fallback, §11 | ✅ |
| 9 | Stale-lock recovery, no corruption | UC-10, BR-07, AC-08 | §3.5 `_isLockStale`, guarded reclaim | ✅ |
| 10 | Malformed-file backup, fail-closed | UC-06, BR-08, AC-09 | §2.3 seq, §3.5 `_backupCorruptFile` | ✅ |
| 11 | Resume idempotency (no duplicate) | UC-07, BR-03/09, AC-10/11 | §3.4 open, §10 cat.1 | ✅ |
| 12 | Rework via new attempt → new op_id | UC-08, BR-10, AC-11 | §3.3, §3.4 | ✅ |
| 13 | Reader null-compatibility (minimal) | NFR-11, AC-18 | §3.6 mapping, §9 SKILL.md | ✅ |

All thirteen feature claims are covered in both documents with traceable anchors.

---

## 2. Gate-1 correction verification (the eight substantive checks)

The Gate-1 review named eight concrete correctness checks. Each is verified against the current text below.

### Check 1 — No out-of-scope activity added (scope not widened)
**Verified.** Tech-Spec §2.1 states the feature "migrates only the ledger writes that exist today." §2.1.1 now enumerates the **complete, closed set** of migrated keys (define-feature `define-feature:define`; pm-phase1 requirements/tech-spec/validate-cycle; pm-phase2 wb-generate/validate/semantic/render; pm-phase3 read-wb-csv, impl groups, developer-testing, review-solution, final-test-run, remediation, pr-and-registry, write-actuals). §2.1 and §2.1.1 explicitly list the untracked activities that stay untracked (`discovery`, `ensure-ledger`, `read-ledger`, `read-pricing`, `process-log`, commits, escalation counters, `am-phase1/2`) and state "The Work Breakdown MUST NOT widen coverage beyond §2.1.1." Requirements §1.2 Out-of-Scope mirrors this list; AC-05 asserts "the tracked-activity set is unchanged from today." Implementation Order steps 4–7 each repeat "No new activities." **No scope creep remains.**

### Check 2 — Single lock algorithm (no competing designs)
**Verified.** Exactly one algorithm is specified: an **O_EXCL lockfile** (`${ledgerPath}.lock`) holding an owner token `{pid, startedAt, nonce}` — Tech-Spec §3.5, §8, Appendix Q-1; Requirements BR-07, UC-10, NFR-03/04. The prior "directory-based vs lockfile" alternative is gone. The retry/deadline wording is now internally consistent everywhere: **retry every 100 ms until a 5 s total deadline** (a total deadline, *not* a "5 retries" count — Tech-Spec §8 explicitly removes the old "5 retries" wording). Stale reclaim is **two-branch, single-algorithm**: (a) a **well-formed lock** is reclaimed only when age > 30 s **AND** owner certainly not alive (`process.kill(pid,0)`); if liveness is undeterminable the lock is left and the writer fails closed; (b) an **empty / malformed / incomplete (orphan) lock** — the crash-in-create-window residue with no recoverable PID — is reclaimed by lock-file **mtime age > 30 s** alone, so it can never block the ledger permanently. Either branch is **guarded before unlink** — by re-checking the **nonce** (well-formed) or a **content + `stat` (ino/mtime/size) fingerprint** (orphan) — so a lock that is still young or whose identity changed is **never removed** (ABA-safe); `_releaseLock` unlinks only when the on-disk nonce matches. **One coherent algorithm, no contradictions.**

### Check 3 — Collision-resistant operation_id
**Verified.** `computeOperationId` (Tech-Spec §3.3) derives a **collision-resistant** id from a **SHA-256 of `[prefix, agent, attempt]` truncated to 128 bits** (32 hex chars, `slice(0, 32)`) — described as **collision-resistant, not guaranteed-unique** — with the readable slug used for human diagnosis only. The invariants section and the note below it state explicitly that keys colliding under naive `:`/`/`→`-` replacement (e.g. `a:b`, `a/b`, `a-b`) still get distinct ids because the hash is over the raw tuple. Requirements §4.2 and AC-25 assert the same, and §10 category 1 plus §10 category 13 add tests for it. **The lossy-sanitisation collision is eliminated.**

### Check 4 — Quoting concretely defined (portable, path-with-spaces safe)
**Verified.** Tech-Spec §3.6 declares the actual transport shell (POSIX-compatible — Git Bash on Windows, `/bin/sh` on POSIX) and gives one concrete escaping function `shellQuotePosix` (single-quote wrap, escape embedded `'` as `'\''`). It rejects NUL/newline, mandates path-with-spaces support, and sanitises `--error` (single line, control chars stripped, length-capped) before transport. It states `JSON.stringify()` is **not** used for shell quoting. Requirements BR-12, NFR-08, AC-17 and Tech-Spec §6 (security) agree. The §3.6 note records that the workflow runtime cannot `require()`, so `pm-phase{1,2,3}.js` inline the identical rule and a test asserts parity. **Quoting is concrete and portable.**

### Check 5 — Features-root coherent and ambiguity-aware
**Verified.** `resolveFeaturesRoot` (Tech-Spec §3.7) implements the full precedence now (no v1.1 deferral): explicit path → `AGENTS.md` `features_root` convention → gather **all** existing defaults (`internal_docs/features`, `docs/features`) then decide — 0 candidates → error, >1 → **hard-stop ambiguous**, exactly 1 → use it. The prior "return `internal_docs/features` immediately" early-return is gone, so the `docs/features` ambiguity is caught rather than masked. Per correction #7, the resolver lives in **`bin/cli.js`** (exported, tested under `tests/cli/`), explicitly **not** in `lib/execution-ledger.js` (§3.5 note, §3.7 exports comment), and is exposed as the **invocable facade `ai-toolkit resolve-features-root`** (stdout = resolved absolute path only) — not merely an exported JS function. `define-feature` **invokes that command once** and reuses the captured path for both `feature.md` and the ledger `--dir` (UC-05 steps 1–2, §11 step 7). Requirements BR-14, UC-05, AC-14, Q-5 all align. **Coherent and ambiguity-aware; Q-5 no longer contradicts BR-14/AC-14.**

### Check 6 — No `.claude` copies among modified sources
**Verified.** Tech-Spec §9 "Modified Files" is preceded by an explicit statement: "**Only `src/claude/**` sources are edited.**" Installed copies under `.claude/**` and the global home are "generated exclusively by the catalog-driven installer" and "appear in this feature only as installer-test outputs." The modified-files table lists only `bin/cli.js`, `src/claude/workflows/pm-phase{1,2,3}.js`, `src/claude/agents/define-feature.md`, `src/claude/skills/implement-feature/SKILL.md`, and `package.json` (no change). No `.claude/workflows`, `.claude/agents`, or `.claude/skills` entries remain. AC-22 and Requirements §8 "Canonical sources" agree, consistent with FTR-015. **No installed copies are listed as modified sources.**

### Check 7 — UC-04 / BR-02 coherence (skip contract)
**Verified.** The former conflict ("skip must find exactly one" vs "skip creates if absent") is resolved by splitting the contract:
- **BR-02** now governs **`close`/`fail` only**: they *require* an existing entry (0 matches → not-found error; multiple → ambiguous error); they **never create**.
- **BR-17** (new) governs **`skip`**: exactly one match → update; no match → atomically **create** a terminal `skipped` entry with `started_at == completed_at`, supplied `--phase`/`--model`, `phase_delta_tokens: null`; multiple `agent`-fallback matches → ambiguous error. `skip` is the only terminal command that may create.

UC-04 main flow steps 4–5 encode exactly this; Tech-Spec §3.4 skip + the "Contract distinction" callout mirror it; `skip` now requires `--phase`/`--model` (UC-04, §6.1, §3.4, module signature §3.5). AC-23 asserts all three skip branches and re-affirms close/fail never create; AC-21 covers the close/fail not-found error. **UC-04 and BR-02 are now coherent (no self-contradiction).**

### Check 8 — `--tokens 0` rejected for new writes
**Verified.** The CLI rejects `--tokens 0` (and negative / non-integer) as a validation error that writes nothing: Tech-Spec §3.3 input-validation row for `--tokens`, §3.4 close ("Exit Code … non-zero (incl. `--tokens 0`)"), §3.1 field comment ("the writer NEVER emits 0"). Requirements BR-04, §4.1/§4.2 (`integer(≥1) | null`), §6.1 close subcommand, and AC-24 all state the same. The single coherent update rule for a **legacy** entry is specified once and tested: omitted `--tokens` + existing positive → preserve; omitted `--tokens` + existing unavailable (`null`/`0`/`"not_available"`) → normalise to `null` (Tech-Spec §3.4 close logic; Requirements §4.2; §10 category 2). Unavailable-on-read (legacy `0`/`"not_available"`) is still tolerated by readers (NFR-11, AC-18). **No new ambiguous zero can be written.**

---

## 3. Contradictions found and resolved

These are the eight substantive contradictions raised at Gate 1, each now resolved (see §2 for evidence).

| # | Contradiction (as found at Gate 1) | Resolution | Where fixed |
|---|-------------------------------------|-----------|-------------|
| 1 | Scope creep: §2.1 / File Inventory / Impl Order implied coverage of untracked activities | Migrate only existing writes; exhaustive closed key set added; "MUST NOT widen" guardrail | TS §2.1, §2.1.1, §11; REQ §1.2, AC-05 |
| 2 | Skip contract self-conflict (BR-02 "exactly one" vs UC-04 "create if absent") | Split: BR-02 = close/fail require existing; BR-17 = skip create-or-update; skip requires `--phase`/`--model` | REQ BR-02, BR-17, UC-04, AC-23; TS §3.4 |
| 3 | Ambiguous new zero tokens | CLI rejects `--tokens 0`/neg/non-int; `≥1 \| null`; single legacy-update rule | REQ BR-04, §4.2, AC-24; TS §3.3, §3.4 |
| 4 | Two lock algorithms / "5 retries" vs "5 s timeout" | One O_EXCL algorithm; owner token; 100 ms retry to 5 s total deadline; ABA-guarded reclaim | REQ BR-07, UC-10; TS §3.5, §8, Q-1 |
| 5 | operation_id collisions under `:`/`/`→`-` | 128-bit tuple hash provides collision resistance; the slug is cosmetic | REQ §4.2, AC-25; TS §3.3 |
| 6 | Non-portable `JSON.stringify()` quoting | Declared POSIX transport shell; `shellQuotePosix`; reject NUL/newline; sanitise `--error` | REQ BR-12, AC-17; TS §3.6, §6 |
| 7 | Features-root: Q-5 deferral vs BR-14/AC-14; premature early-return; resolver in wrong module | Full precedence now; gather-all-candidates + ambiguity hard-stop; resolver in `bin/cli.js` not ledger module; `featureDir` resolved once | REQ BR-14, UC-05, AC-14, Q-5; TS §3.5 note, §3.7 |
| 8 | `.claude` installed copies listed as modified sources | Only `src/claude/**` edited; installed copies = installer-test outputs only | TS §9; REQ §8, AC-22 |

Plus correction #9 (tests aligned to repo conventions): new pure functions in `bin/cli.js` (`resolveFeaturesRoot`, `shellQuotePosix`, arg parser/dispatcher) are exported and tested under `tests/cli/ledger-cli.test.js` per AGENTS.md, distinct from the module suite `tests/lib/execution-ledger.test.js` — Requirements NFR-12; Tech-Spec §9, §10 categories 12–13, §11 steps 2–3.

---

## 4. Traceability verification

- **Use Cases → Tech-Spec:** all 11 UCs (UC-01..11) map to at least one Tech-Spec section (§3.4 endpoints, §2.3 sequences, §3.5 helpers, §3.7 resolution). ✅
- **Business Rules → design:** all 17 BRs (BR-01..17, including the new BR-17) are reflected in Tech-Spec (module structure, field handling, lock behaviour, skip contract, features-root). ✅
- **Acceptance Criteria → Tech-Spec:** all 25 ACs (AC-01..25, including new AC-23/24/25) align with §3.3/§3.4/§3.5/§3.7 and §10 tests. ✅
- **Open Questions:** all 5 (Q-1..Q-5) are resolved in-scope for FTR-016 in both documents; none deferred to v1.1. ✅
- **Out-of-scope alignment:** Requirements §1.2 out-of-scope list matches Tech-Spec §2.1 exclusions and the "future features" note in both summaries. ✅

---

## 5. Residual items for reviewer awareness (not defects)

These are **documented-by-design** decisions, not gaps — surfaced so the reviewer can ratify them at the gate:

1. **v1 residual — agent-dispatched CLI.** Workflows still invoke `ai-toolkit ledger …` through an agent's Bash tool rather than a direct runtime call (the workflow runtime cannot `require()`). Fail-closed verification of the structured result + exit code is mandated (BR-16, UC-11, §3.6). Removing dispatch dependency is explicitly out of scope (Requirements §1.2, "Known Limitations"; Tech-Spec §12 risk row). Consequence: the inline `shellQuotePosix` in `pm-phase{1,2,3}.js` duplicates the `bin/cli.js` reference copy; a parity test is required (§3.6 note, §10 category 13).
2. **Windows directory-fsync durability.** Temp-file fsync always precedes the atomic rename; directory fsync is POSIX-only. On Windows, directory-entry crash-durability of the rename metadata is best-effort — atomicity is unaffected (Tech-Spec §3.1, §8, Q-4; Requirements NFR-02, §8 platform notes). Documented residual, accepted for v1.

Neither item blocks Gate 1; both are inherited constraints from the approved `feature.md` scope.

---

## 6. Gaps found

None outstanding. The eight substantive contradictions from Gate 1 cycle 1 are resolved (§2, §3); the **four** cycle-2 defects are resolved and verified in **§9**; the two residual items in §5 are documented-by-design decisions, not gaps.

## 7. Remaining gaps

None. This "None" is asserted **only because** the four cycle-2 conditions are met (§9): invocable resolver facade, unambiguous legacy-token rule, recoverable malformed lock, and a 128-bit `operation_id` consistent with its collision-resistance claim.

## 8. Validation method

Line-by-line cross-read of the corrected `FTR-016-Requirements.md` and `FTR-016-Tech-Spec.md` against the approved `feature.md`, plus targeted grep verification that no superseded wording survives (checked and confirmed absent: "up to 5 times" / "5 retries", "directory-based" lock, `JSON.stringify()`-as-quoting, "Defer to v1.1", "both approaches", `Integer ≥ 0` for written tokens, `sanitized(agent)` operation_id, `slice(0, 16)`, `.claude/workflows|agents|skills` as modified sources). `feature.md` was **not** modified.

---

## 9. Gate-1 review cycle 2 — targeted corrections (this revision)

Four further defects were raised at cycle 2. Each is verified resolved below; the documents were **edited surgically** (not regenerated).

### Check 9 — Resolver is actually invocable (not just an exported JS function)
**Verified.** A deterministic command **`ai-toolkit resolve-features-root [--project <dir>] [--features-root <dir>]`** now exposes `resolveFeaturesRoot` (Tech-Spec §3.7 "CLI command" subsection; Requirements §6.1 command table). Contract is explicit and testable: **stdout = the resolved absolute path only**, stderr = diagnostics, exit 0 on success, non-zero + **empty stdout** on missing/invalid/ambiguous. `define-feature` invokes it **once**, captures the stdout path, and reuses that literal value for both `feature.md` and the ledger `--dir` with **no second resolution in the prompt** (UC-05 steps 1–2; §9 File Inventory define-feature row; §11 step 7). A **deterministic `features_root` grammar** is defined (accepted column-0 key, quotes/inline-`#` stripped, commented/blank lines ignored, **multiple uncommented declarations → error**, empty/NUL/newline/non-existent → error, absent → fall through) with tests in `tests/cli/ledger-cli.test.js` (§10 category 12; AC-27; BR-14). **A Markdown agent can now invoke the resolver.**

### Check 10 — Legacy-token semantics are unambiguous (category 2 vs 11 conflict removed)
**Verified.** The single coherent rule is now stated identically wherever it appears: on the **`close` target** entry, `--tokens` omitted → legacy `0`/`"not_available"` **normalised to `null`**, positive preserved (Tech-Spec §3.4 close logic, §10 category 2; Requirements §4.2). Tech-Spec §10 **category 11 is rewritten**: "preserved, not converted" now explicitly scopes to **untouched entries and non-owned fields**, while the target's own `phase_delta_tokens` follows the category-2 normalisation rule — the two categories are declared consistent, not contradictory. Requirements **BR-11** carries the same nuance (`phase_delta_tokens` is an owned field on the target; "preserve legacy" governs untouched entries and non-owned fields). **No incompatible expectations remain.**

### Check 11 — Malformed lock is recoverable (crash in the create-then-write window)
**Verified.** The O_EXCL create now **writes the owner token and fsyncs it immediately** before any other work, narrowing the window (Tech-Spec §3.5 `_acquireLock`, §8, UC-10 step 1). For the residue that remains, an **empty / malformed / incomplete (orphan) lock** — which has no recoverable PID — is classified purely by the lock file's **mtime age**: older than the orphan threshold (30 s) → reclaimable; younger → wait, never force-deleted (Tech-Spec §3.5 `_isLockStale` now takes `lockStat` and returns `live|reclaimable|wait`; §8 orphan threshold). Guarded reclaim uses a **content + `stat` (ino/mtime/size) ABA check** for orphans (vs nonce for well-formed locks) (Tech-Spec §3.5 guarded-reclaim note, §10 category 7; UC-10 step 5). The guarantee that **a malformed lock never blocks the ledger permanently** is asserted in BR-07, UC-10 postconditions, AC-26, and a dedicated crash-immediately-after-create test (Tech-Spec §10 category 7; Requirements NFR-12). **The malformed lock is recoverable.**

### Check 12 — `operation_id` format matches its declared guarantee
**Verified.** The digest truncation is widened from 64-bit `slice(0,16)` to **128-bit `slice(0,32)`** (Tech-Spec §3.3 `computeOperationId`, with all examples updated to 32 hex chars in §2.2/§3.1/§3.2). The property is now described as **"collision-resistant, not guaranteed-unique"** everywhere (Tech-Spec §3.3 invariants + Appendix Q-3; Requirements §4.2, Q-3) — the false absolute-uniqueness claim is gone. Tests on `a:b`, `a/b`, `a-b` are retained (Tech-Spec §10 category 1; Requirements AC-25). **The format is coherent with its stated guarantee.**

### Modified sections (cycle 2 — surgical edits only)

| Document | Sections edited |
|----------|-----------------|
| `FTR-016-Tech-Spec.md` | §2.2 (op_id example), §3.1 (op_id example + format note), §3.2 (op_id example), §3.3 (`computeOperationId` 128-bit + invariants + slug note), §3.4 (unchanged text, referenced), §3.5 (`_acquireLock`, `_isLockStale`, guarded-reclaim note), §3.7 (invocation point + new `resolve-features-root` command + `features_root` grammar), §8 (immediate token write, orphan threshold), §9 File Inventory (`bin/cli.js`, `define-feature.md`), §10 (cat.1 note, cat.7 orphan tests, cat.11 legacy-token, cat.12 grammar+command), §11 (steps 2 & 7), Appendix Q-1 & Q-3 |
| `FTR-016-Requirements.md` | §1.2 In-Scope (resolve command), UC-05 (steps 1–2), UC-10 (orphan flow + postconditions), §4.2 (op_id 128-bit), §6.1 (new `resolve-features-root` command), BR-07 (orphan lock), BR-11 (legacy-token nuance), BR-14 (command + grammar), AC-14 (invocation), AC-25 (`a-b`), **new AC-26** (malformed lock), **new AC-27** (resolve command), NFR-12 (tests), Q-3 & Q-5 |
| `FTR-016-Validation-Report.md` | Header (v2.1), §6, §7, §8 (grep list), **new §9** (this section) |
| `feature.md` | **Not modified** |

### Updated realignment matrix (cycle 2 checks → anchors)

| # | Cycle-2 defect | Resolution | Requirements anchors | Tech-Spec anchors |
|---|----------------|-----------|----------------------|-------------------|
| 9 | Resolver not invocable by a Markdown agent | `ai-toolkit resolve-features-root` command (stdout = path only) + deterministic `features_root` grammar; `define-feature` calls once | §1.2, UC-05, §6.1, BR-14, AC-14, AC-27, NFR-12, Q-5 | §3.7 (command + grammar), §9, §10 cat.12, §11 steps 2 & 7 |
| 10 | Legacy-token category 2 vs 11 conflict | Single rule: target token normalises to `null`; untouched entries/non-owned fields preserved | §4.2, BR-11 | §3.4 close, §10 cat.2 & cat.11 |
| 11 | Malformed lock could block permanently | Immediate token fsync; orphan reclaim by file-mtime age; content+`stat` ABA guard | UC-10, BR-07, AC-26, NFR-12 | §3.5 (`_acquireLock`, `_isLockStale`, reclaim note), §8, §10 cat.7, Q-1 |
| 12 | 64-bit op_id vs "always distinct" claim | 128-bit truncation; "collision-resistant, not guaranteed-unique" | §4.2, AC-25, Q-3 | §3.3, §2.2/§3.1/§3.2 examples, Q-3 |

## Validation date
2026-08-27
