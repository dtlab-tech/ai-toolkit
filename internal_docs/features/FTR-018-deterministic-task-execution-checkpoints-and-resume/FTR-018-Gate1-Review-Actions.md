# FTR-018 — Gate 1 Review Actions

Consolidated 2026-09-20. Updated 2026-09-21. Audited and corrected 2026-09-22. **E-01 binding closed 2026-09-28.**
Current status: **E-02 CLOSED** (tree-kill, registered-worker dedup, and the crash-in-the-
registration-window hazard/mitigation — all reproducible at zero cost; **Windows-qualified**).
**E-01 CLOSED**: the provenance binding *verified-hash → loaded-definition* is now established by an
executed isolated proof (2026-09-28), verified LLM-free via claude.exe's `--debug` ground truth (see
§E-01); the only residual limit is that worktree persistence was not re-reproduced in that run (Write
permission-denied; already proven by the original Test B). Gate 1 is still **NOT** treated as
auto-approved — it is re-presented with this result for the user's disposition.
Reproducible evidence lives in `evidence/` (see `evidence/README.md`).
This file is the current action register. Prior narratives and contradictory status tables
are preserved verbatim apart from their historical heading in history/.

Gate 1 was approved by the user on 2026-09-21 ("approvo il Gate 1"). At the user's request the
final open sub-point E-01 (exact verified-agent run proof) was then closed with a budget-capped
run (~$0.022, authorized ceiling ~$0.06). See `FTR-018-Approvals.md` for the approval record.

## Current disposition of the ten original review points

| Point | Disposition | Current evidence / next action |
|---|---|---|
| 1 AC-03 | Document corrected | Corrected criterion preserved; Requirements section 7 |
| 2 Related UC | Parser verified | Actual wb-validate parseAcTable accepts all 16 AC rows and UC mappings |
| 3 CLI/OQ alignment | Document corrected | Both documents define seven commands; OQ-01 OPEN, not falsely resolved |
| 4 Runtime bridge | **CLOSED (evidence)** | Percorso C adopted. E-02 (supervision) CLOSED, Windows-qualified — see §E-02. E-01 (exact identity/context): execution+persistence proven; provenance binding CLOSED 2026-09-28 via executed isolated proof (LLM-free isolation by `--debug` ground truth) — see §E-01. Not an implementation-acceptance sign-off. |
| 5 MD/CSV parsing | Design corrected | Tech Spec section 4; inspected actual Task Details renderer and CSV phase aggregation |
| 6 Ownership | Design corrected, runtime qualification pending | Tech Spec section 5; common-dir lease, no age recovery, conservative guard; E-02 required |
| 7 Ledger | Design corrected | Real ID/signatures inspected; additive finalizeActivity explicitly proposed, not falsely assumed existing |
| 8 Commit/SHA recovery | Design corrected | Tech Spec sections 8–9; intent parent/tree/trailers/ref verification and integration CAS windows |
| 9 Durability/CLI | Design corrected | Sections 5/10; bounded guarantees, seven commands, no force/path overrides |
| 10 Bootstrap | Document corrected | Section 11; supervised task-by-task after approvals; no grouped pm-phase3 or unfinished executor |

“Design corrected” means a documented contract, not implemented/passed tests or gate approval.
No Work Breakdown has been created in this revision.

## E-01 — Exact verified agent and controlled context (CLOSED — binding established 2026-09-28)

> **Resolution (2026-09-28) — provenance binding CLOSED.** The isolated proof was executed once under
> explicit user authorization (hard cap $0.03, actual **$0.01727565**, no retry). Isolation was
> demonstrated **without any LLM call**: environment-variable isolation was first *disproven*
> (`iso-discovery.js` — HOME/USERPROFILE/HOMEDRIVE/CLAUDE_CONFIG_DIR all fail to remove the real agents
> on Windows), then replaced by claude.exe's own `--debug` output as ground truth. The CLI declares it
> loads `C:\Users\Tomada D\.claude\agents\gaia-developer-backend.md` (userSettings; explicit line
> "Skipping duplicate … already loaded from userSettings"); the managed agents dir is ENOENT, plugin
> agents = 0, and no competing project copy exists ⇒ **exactly one reachable definition**. Its sha256
> == `7457e83…f11` **before and after** the run (unmodified). The agent executed: exit 0,
> `is_error:false`, schema-valid `{"status":"done","marker":"E01ISO-1790178069710"}`, model sonnet
> (`claude-sonnet-4-6`). This binds *verified-hash → loaded-definition* using the CLI's ground truth —
> **no model-declared hash, no modification of the installed agent**. Artifacts: `iso-e01-run.js`,
> `iso-discovery.js`, `positive-source-naming.log`, `run-verify-debug-*.log`, `run-paid-debug-*.log`,
> `run-paid-stdout-*.json`, `iso-run-result-*.json` in the dossier.
>
> **Residual limit (this run):** worktree **persistence was NOT reproduced** — the Write tool was
> **permission-denied** (isolated cwd outside the `//c/ws/**` allow-rule scope; `acceptEdits` does not
> auto-approve in non-interactive `--print`; `run-paid-debug-*.log`: "Write tool permission denied").
> The model nonetheless returned `status:done` — evidence that model self-report ≠ persistence.
> Persistence stays proven by the original Test B (`out-B.json` + `worktree-oq01a-proof.txt`); it is
> orthogonal to the binding and (by the user's choice) was not re-run.

> **Correction (2026-09-22).** A code audit of the commands as run (transcript-reconstructed in
> `evidence/E-01-agent-provenance/commands-as-run.sh`) found that Test B passed only the agent
> **name** (`--agent gaia-developer-backend`), so `claude.exe` **re-resolved** it from its own
> search path. The Node `resolveAgent()` hash check (→ `7457e83…`) was a **separate** resolution;
> the two matched in bytes only because all on-disk copies were byte-identical. **No verified bytes
> were passed to the process.** The steps below therefore prove the **selection mechanism**,
> **execution**, and **worktree persistence**, but do **NOT** bind *verified-hash → loaded-definition*.
> That binding is **OPEN**. An isolated proof (single reachable definition; Node/filesystem evidence;
> ≤ $0.03) is specified in `evidence/E-01-agent-provenance/README.md` and has **not** been executed.
> A model-declared hash is inadmissible, and signing the definition would change its hash — neither
> is used. Evidence artifacts are retained in the dossier (moved out of `%TEMP%`).

The historical objection stands and was honoured: cache-usage/thinking differences do NOT
identify the loaded definition. The proof below establishes the loaded definition by an
**independently observable output marker**, not by token inference, and links the full chain
verified definition/hash → actual selection → worktree → result → persistence.

Reproducible evidence (scripts and outputs retained under `%TEMP%/oq01a-spike/`):

| # | Required step | Result | Evidence |
|---|---|---|---|
| 1 | Record executable/OS/Node/auth profile | Done | claude.exe **v2.1.260**; provider **foundry** (from `modelUsage`); models `claude-haiku-4-5`, `claude-sonnet-4-6`; Windows 11; agent-registry.js run under project Node |
| 2 | Isolated temp runtime + worktree; no real settings modified | Done | throwaway `git init` repo + `git worktree add` in `%TEMP%`; real repo/installs untouched; `.git` in worktree is a file pointer (exercises `.git-as-file` handling) |
| 3 | Resolve registry; retain nativeName, path, SHA-256 | Done | `resolveAgent()` with isolated `homeDir` (AC-28) → `status: verified`, nativeName `gaia-developer-backend`, scope `project`, `sha256:7457e83a…f11` |
| 4 | Establish loading by independently observable evidence — no self-attestation / cache inference | Done | **Test A (differential sentinel):** two inline agents via `--agents`; `--agent proof-alpha` → output `OQ01A-ALPHA-<nonce>` (not BETA); `--agent proof-beta` → `OQ01A-BETA-<nonce>` (not ALPHA). Marker in output proves the selected definition's system prompt was loaded; no cross-contamination; not a default. |
| 5 | One small task, schema-valid result, persisted from the worktree | Done | **Test B:** `--agent gaia-developer-backend` (worktree copy hash == verified `7457e83`), `--tools Write`, `--json-schema`, `--output-format json` → **exit 0**, `{"status":"done","marker":"<nonce>"}` (schema-valid), declared **model: sonnet** honoured. File `oq01a-proof.txt` persisted in the worktree (content == nonce), git-tracked on branch `oq01a`. |
| 6 | Exercise local/global selection + conflicting foreign-definition fixture | Done | All 20 defs **byte-identical** local vs global (`diff -rq` clean) → loaded-definition contamination impossible; `resolveAgent` fail-closes to `conflict` on dual-install. **Tamper fixture:** appended bytes to an isolated copy → `resolveAgent` returns `hash-mismatch` and `--require-verified` **throws** (dispatch blocked). |
| 7 | Retain scripts/commands/hashes/outputs; record usage or null+reason | Done | Retained. Observable usage: Test A $0.0033 + $0.0038, Test B $0.0153 → **11,680 tokens / $0.0224 total**, provider foundry. Recorded as ledger entry `oq01a-runproof:pre-gate1` (tokens 11680). |

Budget: run performed under an explicit user-authorized ceiling (~$0.06) using the hard cap
`--max-budget-usd` per invocation; actual spend $0.0224. No budget increased beyond authorization,
no new provider, no real settings modified.

## E-02 — Asynchronous process supervision (CLOSED — Windows-qualified; 2026-09-21, extended 2026-09-22)

> **Platform scope.** All E-02 evidence was produced and reproduced on **Windows 11** with
> `taskkill /PID <pid> /T /F`, PowerShell `Get-Process StartTime`, and `Get-CimInstance Win32_Process`
> command-line tags. The guarantees are qualified to **Windows and the scenarios actually tested**
> (tree-kill, registered-worker dedup, crash-in-registration-window). The POSIX equivalent
> (`kill(-pgid)` / process-group termination) is designed and folded into the Tech Spec but is
> **not** tested here — it must not be assumed green on Linux/macOS without its own proof.

> **Supplement (2026-09-22).** The original checks covered tree-kill and dedup for a worker
> **already registered** in `task.lock`. A new deterministic proof
> (`evidence/E-02-process-supervision/harness-registration-window.js` + `OUTPUT-registration-window.txt`)
> adds the **crash-in-the-registration-window** case: a coordinator crash after spawn but before
> durable registration. It shows a naive lock-only resume double-dispatches (2 live workers),
> while **intent-first + reconcile-by-tag** finds the orphan and refuses the duplicate. Design
> consequence: the executor must persist a tagged dispatch **intent before spawning** and reconcile
> by tag on resume — "no lock" must never be read as "no worker". All E-02 scripts are deterministic
> (no LLM); the tree-kill/dedup harness was re-run on 2026-09-22 with identical outcomes.

Qualified with a fake worker/child (no paid calls), reproducible under `%TEMP%/oq01b-spike/`.
The design does NOT rely on `spawnSync` SIGTERM; it mandates async `spawn` + explicit process-tree
termination and identity-confirmed dedup.

| Required check | Result | Evidence |
|---|---|---|
| Worker + descendants termination when coordinator kills the worker | **Explicit tree-kill required** | Worker spawns a grandchild; `taskkill /PID <worker> /T /F` → exit 0, grandchild confirmed dead (both `process.kill(pid,0)` and `tasklist`). Naive `child.kill('SIGTERM')` also terminated the grandchild here (3/3 runs) but that is environment-dependent and **not** guaranteed by the Windows API — the design therefore mandates explicit tree-kill (`taskkill /T`; POSIX process-group kill). |
| Repeated resume while worker is live/unknown → no replacement | Done | Lock `worker_id = host:pid:startTime`. Resume decision refuses replacement while the recorded PID is alive **and** start-time matches: `DO-NOT-REPLACE (worker live)`. |
| Identity-confirmed termination → recovery only after confirmed dead | Done | Only after the worker is confirmed terminated does the decision flip to `SAFE-TO-REPLACE`. No replacement attempt is started before confirmed termination (matches the user's rule). |
| PID reuse / recycling | Detected | Start-time (`Get-Process StartTime.ToFileTimeUtc`) is part of `worker_id`; a live PID with a different start-time is treated as a recycled PID → not the original worker. |

Async choice recorded: production uses async `spawn` (non-blocking) — required for stop,
observability and N>1 — with a tracked child PID and OS-appropriate tree termination. `spawnSync`
is retained only for the deterministic single-shot proof (E-01). N>1 out-of-order integration and
a supported-platform statement for Linux (POSIX `kill(-pgid)`) are folded into the Tech Spec risks
and increments; the Windows mechanism (`taskkill /T`) is proven here.

## Preserved historical evidence

See history/pre-consolidation-2026-09-20-Review-Actions.md for reported spike outputs.
The historical deductions “no orphan” and “correct definition proven by token count” were NOT
accepted as evidence and have been **superseded**: the definition-loading claim is now proven by
an observable output marker (E-01 Test A), and the no-orphan claim by explicit tree-kill (E-02),
not by token counts. Foundry provider presence is not proof of exact billing or universal flag
compatibility; the tested version/profile is pinned (claude.exe v2.1.260, provider foundry) and
authentication was not switched.

## Ledger summary (corrected — 2026-09-21)

Corrects the earlier erroneous "13 entries, all done" claim. The history is preserved, not rewritten;
failures remain failures and new activities are recorded as separate entries.

Current state of `FTR-018-token-ledger.json`: **19 entries — 16 done, 3 failed, 0 skipped.**
(2026-09-22 audit added two deterministic, no-LLM entries — `e01-provenance-audit:post-gate1` and
`e02-registration-window:post-gate1`, both done/null. 2026-09-28 added one paid entry —
`e01-isolated-provenance-proof:post-gate1`, done, ~1,191 tokens / $0.01727565 — for the executed
E-01 isolated proof. No prior entry was modified.)

- **3 failed (preserved, unchanged):** `pm-phase1:dispatch` (stalled attempt 6/6), `pm-phase1:self`
  (runtime timeout, self-entry never closed), `generate-tech-spec:phase1` first attempt (6×180s timeout).
  The tech-spec was later produced by a **separate** successful entry (`generate-tech-spec:phase1`,
  99,435 tokens) — the failure was not overwritten.
- **Composition of the 12→16 growth:** the 12-entry state cited at rejection was followed by two
  documentation activities on 2026-09-20 (`documentation-consolidation`, `documentation-validation`,
  done/null) and two pre-gate spikes (`oq01a-runproof:pre-gate1` done/11,680 tokens;
  `oq01b-process-spike:pre-gate1` done/null — deterministic, no LLM, motivated null).
- No failed entry was converted to done.

## Next action and stop condition

**Gate 1 is NOT auto-approved.** As of 2026-09-28: E-02 is CLOSED (Windows-qualified, incl. the
registration-window case); the E-01 provenance binding is CLOSED via the executed isolated proof
(LLM-free isolation by claude.exe `--debug` ground truth; hash unchanged before/after; single source),
with the sole residual being that worktree persistence was not re-reproduced in that run (Write
permission-denied; already proven by the original Test B). Both runtime blockers are therefore closed
on evidence, but this is **not** an implementation-acceptance sign-off. The user must record the Gate 1
disposition explicitly. pm-phase2 (Work Breakdown) remains the next pipeline step and would spend
budget — it must be dispatched with `run_in_background: false` and only on the user's explicit
go-ahead. No Work Breakdown has been created. No fallback LLM-controlled I/O, automatic approval,
implementation, push or merge.
