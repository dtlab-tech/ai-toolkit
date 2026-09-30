# FTR-018 — Documentation Validation Report

Revision 2.3 — 2026-09-28. **Result: E-02 CLOSED (Windows-qualified); E-01 provenance binding CLOSED.**
The E-01 isolated proof was executed once under explicit user authorization (hard cap $0.03, actual
$0.01727565, no retry). Isolation was verified **without any LLM call** using claude.exe's own
`--debug` output as ground truth — env-var isolation (HOME/USERPROFILE/CLAUDE_CONFIG_DIR) was first
*disproven*. The CLI declares it loads the userSettings definition
`C:\Users\Tomada D\.claude\agents\gaia-developer-backend.md` (sha256 `7457e83…`, unchanged before and
after; managed agents dir ENOENT, plugin agents 0, no competing project copy ⇒ single source); the
agent executed with schema-valid structured output on sonnet. This binds *verified-hash →
loaded-definition* without a model-declared hash and without modifying the installed agent.
**Residual limit:** worktree persistence was NOT reproduced in this run (the Write tool was
permission-denied in the isolated temp cwd; the model still returned `status:done` — model
self-report ≠ persistence). Persistence remains proven by the original Test B and is orthogonal to
the binding. Gate 1 is **not** auto-approved: this report does not claim executable acceptance of the
feature — the 16 ACs remain design-covered contracts to be proven by the Work Breakdown tasks
(T01–T12) during implementation. E-02 is closed **for Windows only** (POSIX kill(-pgid) designed, not
tested). Reproducible evidence is retained under `evidence/`.

Prior revision 2.1 (2026-09-21) claimed both blockers closed; revision 2.2 (2026-09-22) reopened E-01
as PARTIAL (binding open). This revision closes the E-01 binding on new executed evidence.

## Scope and method

Reviewed approved feature.md, corrected Requirements, real renderer/validator/ledger interfaces
and preserved historical spike narratives. Consolidated the contradictory drafts; no production
code was changed. This is a documentation/source-contract check, not a completed implementation
review or an independent agent certification.

The prior report is retained in history/pre-consolidation-2026-09-20-Validation-Report.md.
Its PASS claims are superseded by this report.

## Checks performed

- Actual parseAcTable and splitTableRow from src/claude/scripts/wb-validate.js were executed
  against Requirements v2.0 in an isolated VM context, stopping before the script CLI entry.
  No reimplemented Markdown parser was used. Result: 16 AC entries accepted, UC refs parsed.
  This does NOT prove Work Breakdown coverage: no WB exists or is approved for FTR-018.
- All 16 corrected Requirements AC rows preserved verbatim from the pre-consolidation file.
- Approved feature.md SHA-256 before/after:
  af691efd39466328da250d7d750324c9986c46b21d2e2cca28ea88a254d0262f — unchanged.
- Renderer source checked: Task Details includes full fields and lossless command fences;
  CSV depends_on is aggregated external phase dependencies, not task edges.
- Ledger source checked: real computeOperationId and open/close/fail/skip signatures;
  terminal replay and failure-token limitations are documented, not assumed away.
- Historical ledger entries preserved; only documentation activities for this revision added.
- No paid Claude calls, SDK installation, auth change, commit, push or gate approval performed.

One initial parser harness invocation failed on strict-mode assignment to an undeclared result
variable; after declaring it in the VM context, the actual parser completed. This was a harness
error, not a Requirements parse failure. No product file was modified to make validation pass.

## Acceptance traceability (design coverage, NOT executable acceptance)

| AC | Use case | Tech Spec sections | Validation status |
|---|---|---|---|
| AC-01 | UC-03 | 1, 7 | Defined; runtime bridge: E-02 closed (Windows), E-01 binding closed (2026-09-28); T01/T07 at implementation |
| AC-02 | UC-01 | 4 | Source-aligned design; T01/T02/T03 required |
| AC-03 | UC-03 | 5, 6, 7 | Defined; runtime provenance/ownership tests required |
| AC-04 | UC-04 | 6 | Defined additive ledger contract; T06 required |
| AC-05 | UC-05 | 8 | Defined; T08/T09/T10 required |
| AC-06 | UC-07 | 4, 8 | Defined; sequential capacity means at most one |
| AC-07 | UC-08 | 4, 7, 8 | Defined; E-02 closed; T04 at implementation |
| AC-08 | UC-02, UC-08 | 5 | Defined; T05 required |
| AC-09 | UC-06 | 6, 8, 9 | Defined; T06/T08/T09/T11 required |
| AC-10 | UC-09 | 5, 11 | Fault matrix defined; not run |
| AC-11 | UC-06, UC-08 | 5, 7, 8, 9 | E-02 closed; T-level tests at implementation |
| AC-12 | UC-06 | 4, 5, 9 | Defined; T02/T10/T11 required |
| AC-13 | UC-09 | 11 | Offline/paid test separation explicit |
| AC-14 | UC-08 | 3, 11 | Package/catalog distinction explicit; T12 required |
| AC-15 | UC-09 | 2, 11 | Post-implementation real-feature evidence not yet available |
| AC-16 | All UCs | 1, 8, 10 | Local integration only; no delivery merge/approval |

All nine UCs and 22 BRs have a design home: UC-01/BR-02/03 section 4; UC-02/BR-04/12
section 5; UC-03/BR-01/05/06/22 sections 6–7; UC-04/BR-07/08/09/19 section 6;
UC-05/BR-10/11/15/21 sections 5/8; UC-06/BR-13/14/16 section 9;
UC-07/08/BR-20 sections 4/8/10; UC-09/BR-18 section 11; BR-17 sections 1/8/10.
The nine increments remain ordered design/delivery stages, not approved WB tasks.

## Gate-1 blockers — status (audited 2026-09-22)

| ID | Blocker | Status | Evidence |
|---|---|---|---|
| E-01 | Exact definition/context loading + completed verified-agent result | **CLOSED — binding established 2026-09-28** | Isolated proof executed once (cap $0.03, actual $0.01727565, no retry). Isolation verified **without LLM** via claude.exe `--debug` ground truth (env-var isolation disproven). CLI declares load of userSettings `gaia-developer-backend.md` (sha256 `7457e83…`, unchanged before/after; managed dir ENOENT, plugins 0, single source); agent exit 0, `is_error:false`, schema-valid `{status,marker}`, sonnet. Binds *verified-hash → loaded-definition* with no model hash, no agent modification. **Residual limit:** persistence NOT reproduced in this run (Write permission-denied in isolated cwd; model still said done). Persistence proven separately by original Test B. Artifacts: `iso-e01-run.js`, `iso-discovery.js`, `positive-source-naming.log`, `run-paid-debug-*.log`, `iso-run-result-*.json`. See Review-Actions §E-01. |
| E-02 | Async supervision / no duplicate live worker | **CLOSED — Windows-qualified, extended 2026-09-22** | Deterministic spikes (`evidence/E-02-process-supervision/`, reproduced 2026-09-22): tree-kill (`taskkill /T`, exit 0); registered-worker dedup; **and** crash-in-registration-window — naive lock-only resume double-dispatches, intent-first + reconcile-by-tag refuses the duplicate. **Qualified for Windows only**; POSIX `kill(-pgid)` is designed but not tested here. See Review-Actions §E-02. |

OQ-01 is **RESOLVED** (Percorso C): E-02 evidence complete (Windows-qualified); E-01 provenance
binding closed on executed evidence (persistence caveat noted above). OQ-02/03/04/06 have defined design
decisions. OQ-05's OS-supervision qualification is covered by E-02 (Windows proven; POSIX
`kill(-pgid)` folded into Tech Spec risks/increments). These are design/runtime-bridge closures,
NOT implementation-acceptance tests — the AC-level tests (T01–T12) run during implementation and
must not be labelled green before then.

## Important clarified decisions

- External Node orchestrator, not a workflow sandbox with hidden LLM I/O.
- Bootstrap is supervised task-by-task after Gates 1/2, not grouped pm-phase3.
- Read-only status/diagnose versus mutative start/stop/resume/reconcile/replan; no force flags.
- Receipt-to-ledger projection has one counted source and explicit additive terminal interface.
- Ownership recovery is conservative; unknown liveness never authorizes dispatch.
- Commit and integration use persisted parent/tree/identity intents; SHA registration is outside
  the commit itself. Git visibility and task completion remain distinct.
- Power-loss claims limited to qualified storage protocol; no guarantee for destroyed/unflushed media.

## Disposition

Gate 1 is **NOT auto-approved**. Both runtime blockers are now closed on evidence: E-02 is closed
(Windows-qualified), and the E-01 provenance binding is closed (executed isolated proof, 2026-09-28),
with the persistence-in-this-run caveat documented. This report does NOT authorize implementation,
merge or release, and makes no zero-gap claim about implementation-time acceptance (T01–T12).
pm-phase2 (Work Breakdown) remains the next bounded pipeline action and would spend budget —
dispatched only on the user's explicit go-ahead, and only after the user records Gate 1 disposition.
