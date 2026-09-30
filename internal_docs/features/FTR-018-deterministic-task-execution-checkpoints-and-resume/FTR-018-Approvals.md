# Approval Record — FTR-018

## Gate 1 — Document Approvals

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| FTR-018-Requirements.md | ✅ Approved | 2026-09-20 | — |
| FTR-018-Tech-Spec.md | ✅ Approved | 2026-09-20 | Runtime bridge = Percorso C (subprocess claude.exe) |
| FTR-018-Validation-Report.md | ✅ Approved | 2026-09-20 | E-01/E-02 closed 2026-09-21 (see below); no zero-gap claim on implementation acceptance |

## Sub-points closed at Gate 1

| ID | Sub-point | State | Evidence |
|----|-----------|-------|----------|
| OQ-01a (E-01) | Actual `claude.exe --agent` run proof: exit-0 + structured JSON output + deterministic loaded-definition marker + worktree persistence | ~~RESOLVED 2026-09-21~~ → ~~REOPENED 2026-09-22 (PARTIAL)~~ → **RESOLVED 2026-09-28 (binding closed)** | **2026-09-28:** isolated proof executed once (cap $0.03, actual $0.01727565, no retry). Isolation verified **LLM-free** via claude.exe `--debug` ground truth (env-var isolation disproven first). CLI declares load of userSettings `gaia-developer-backend.md` (sha256 `7457e83…`, unchanged before/after; managed ENOENT, plugins 0, single source); agent exit 0, schema-valid `{status,marker}`, sonnet. Binds *verified-hash → loaded-definition* — no model hash, no agent modification. **Residual:** persistence not re-reproduced in this run (Write permission-denied); proven separately by the original Test B. Detail: Review-Actions §E-01; dossier `evidence/E-01-agent-provenance/`. |
| OQ-01b (E-02) | Async dispatch / orphans / dedup | **RESOLVED 2026-09-21 — extended 2026-09-22** | Tree termination via `taskkill /T` (exit 0, subtree confirmed dead, 3/3 runs); resume dedup via PID-liveness + start-time refuses replacement while worker alive, permits only after confirmed terminated. **2026-09-22:** added crash-in-registration-window proof — naive lock-only resume double-dispatches; intent-first + reconcile-by-tag refuses the duplicate. Detail: Review-Actions §E-02; dossier `evidence/E-02-process-supervision/`. |

## Gate 1 — Approval with notes (2026-09-28)

User approval: **"Approvo Gate 1 con note — procedi al Work Breakdown tramite pm-phase2."**
Recorded after the E-01 provenance binding was closed (executed isolated proof, 2026-09-28) and E-02
was qualified Windows-only. The following constraints **MUST be carried explicitly into the Work
Breakdown** and are binding on implementation:

1. **End-to-end chain test (implementation).** E-01 proves the *definition binding*; persistence is
   supported by a *separate* proof. Implementation must include an end-to-end test of the full chain:
   verified agent → assigned worktree → result → Node-side persistence → checkpoint.
2. **Mandatory negative test — no completion on model self-report.** The observed "Write denied but
   agent declared done" case becomes a required negative test: no task may be marked complete on the
   model's declaration alone, without verification of the expected output/artifact.
3. **E-02 is Windows-only qualified.** Other platforms require dedicated proofs before their execution
   is enabled; no implicit cross-platform guarantee.
4. **Small, verifiable tasks.** Single result per task, explicit dependencies. Default
   `maxConcurrency=1`; per-task checkpoint and ledger entries, including for failures and rework.
5. **Ledger integrity.** Preserve ledger history; record only genuinely observable consumption — never
   invent missing values (null/0/not_available stays unavailable).

Scope of this approval: generate and validate the Work Breakdown, then **stop at Gate 2**. No
implementation authorized. Documents are not to be regenerated wholesale; spikes are not to be repeated.

## Gate 2 — Work Breakdown Approval

| Document | Status | Date | Notes |
|----------|--------|------|-------|
| FTR-018-Work-Breakdown.md / .json / .csv | ✅ Approved with notes | 2026-09-28 | 46 tasks, 10 phases; structural validator (wb-validate.js): valid, 0 errors, 0 warnings; semantic validator (gaia-validate-work-breakdown-semantic): valid, 0 blocking findings |

User approval: **"Approvo Gate 2 con note — avvia l'implementazione di FTR-018."**
Recorded after two targeted-change cycles (Gate 2 request-changes on AC-14 scope/US-09-TASK-INFRA-03
bundling, then this approval). The following constraints are **binding on implementation**:

1. **Supervised, task-by-task, sequential bootstrap (`maxConcurrency=1`).** The incomplete executor
   must not be used to implement itself. Tasks are dispatched in dependency order, not grouped by
   `agentType`.
2. **Per-task ledger + checkpoint discipline.** For every task: register start in the ledger; persist
   results and observable consumption as soon as available; run verification commands and review
   before commit; atomic commit only on a positive outcome. Failed attempts and rework are preserved
   in the ledger, with a motivated `null` for unavailable measurements (never invented).
3. **No per-task confirmation.** Proceed through the approved Work Breakdown without asking approval
   for each task. Stop only for a real blocker, a scope change, an unauthorized destructive operation,
   or a decision requiring the user's judgment.
4. **Pre-existing changes are preserved, not absorbed.** Changes that predate this feature are not
   included in feature commits. The approved FTR-018 artifacts are committed separately so they are
   not left untracked-only.
5. **Ordinary automated tests proceed freely.** The real-Claude-runtime E2E test
   (`US-09-TASK-TEST-02`) requires a **separate** explicit authorization stating max budget and call
   count before it runs — the prior $0.03 authorization was scoped to the Gate-1 E-01 spike only and
   does not cover this task.
6. **No push, PR, merge, or release** without explicit user authorization.

Scope of this approval: implement FTR-018 per the approved Work Breakdown, respecting the above.

## Approval History

| Cycle | Action | Date | Details |
|-------|--------|------|---------|
| 1 | Request changes | 2026-09-18 | 10 review points (first remediation round) — all addressed |
| 2 | Request changes | 2026-09-19 | 5 targeted-change points (proof, async dispatch, single operational path, residual removal, ledger summary) |
| 3 | Approved | 2026-09-20 | "approvo il Gate 1" — approved with OQ-01a run-proof carried as an open, non-blocking sub-point |
| 4 | Approved with notes | 2026-09-28 | Gate 1 approved after E-01 binding closed + E-02 Windows-qualified; 5 binding constraints recorded above; proceed to pm-phase2 Work Breakdown, stop at Gate 2 |
| 5 | Request changes (Gate 2) | 2026-09-28 | AC-14 scope fix (option b), split US-09-TASK-INFRA-03, Windows-only behavioral guard, estimate reconciliation — applied via targeted edits, re-validated (0 blocking) |
| 6 | Approved with notes (Gate 2) | 2026-09-28 | "Approvo Gate 2 con note — avvia l'implementazione di FTR-018"; 6 binding constraints recorded above; implementation authorized, real-Claude-runtime test and push/PR/merge/release still require separate authorization |
| 7 | Real-runtime E2E authorization | 2026-09-30 | 45/46 tasks complete; user authorized US-09-TASK-TEST-02 (real Claude runtime, previously reserved by Gate 2 constraint #5) with an explicit cap: **maximum $0.10 USD, maximum 3 real agent calls**. This is a separate, narrower authorization from the Gate-1 E-01 spike ($0.03, 1 call) and does not extend to any further real-runtime test beyond this one bounded run. |
| 8 | Real-runtime E2E — budget overshoot finding, re-authorization | 2026-09-30 | First real call under cycle 7's authorization spent **$0.069205** (per-call `--max-budget-usd 0.03` flag did not hard-stop spend at the cap; overshot by ~2.3×) and failed (`budget_exhausted`, task incomplete). Reported to the user immediately, before any further real call. User authorized a **replacement (not cumulative) cap: maximum $0.20 USD total, 1 further real implementation call, no real review call this attempt**. |
