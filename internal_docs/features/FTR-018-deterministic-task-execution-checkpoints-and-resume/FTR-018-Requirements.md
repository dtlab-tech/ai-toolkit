# FTR-018 — Functional Requirements

Version: 2.0 — consolidated 2026-09-20.
Status: REVIEW DRAFT; GATE 1 BLOCKED by runtime qualification E-01/E-02.
Source: approved feature.md (unchanged). The previous draft is retained in history/.
The 16 acceptance-criterion rows below are preserved from the corrected Requirements.
This revision clarifies contracts, not feature scope or gate approval.

## 1. Purpose and scope

Deliver deterministic task-by-task execution, verified checkpoints and evidence-based resume,
first sequentially and then with isolated concurrency. Node owns state, Git, scheduling,
ledger and verification coordination; Claude performs implementation/review.
No requirement to preserve the old workflow agent() transport. Path C is the design candidate,
not an already-qualified runtime.

In scope: approved-plan parsing, exclusive ownership, per-task/attempt lifecycle, immediate
telemetry, verification/review, commits, integration, stop/resume/replan, CLI and packaging.
Out of scope: Codex/Copilot operational adapters, general FTR-019 refactoring, remote backups,
automatic push/PR merge/release/approval, automatic conflict resolution, model-memory recovery.
Technical local integration into the feature branch is permitted by feature AC-16.
No default permission bypass and no implied budget increase.

Actors: user/approver, deterministic coordinator, implementation worker, review worker.
Workers do not write ledger, schedule tasks, create commits or approve their own results.
Ordinary implementation choices remain agent work; control decisions remain deterministic.

## 2. Use Cases

### UC-01: Parse and Validate Approved Work Breakdown

| Field | Value |
|---|---|
| Actor | Coordinator |
| Priority | Must |
| Preconditions | Approved feature/dossier and complete WB MD/CSV |
| Trigger | start or resume validation |

Read without mutations; parse complete MD task details and CSV phase projection; validate
uniqueness, completeness, graph and common-field parity. Preserve verification bytes.
Bind both raw documents and approved context hashes. Produce an in-memory plan; only after
all preconditions and ownership checks may start persist its immutable snapshot.
Malformed or ambiguous content stops with path/task/reason. No LLM repairs and no mandatory
WB JSON. Resume compares original digest rather than accepting changed input.

### UC-02: Acquire Exclusive Lock and Prevent Duplicate Coordinators

| Field | Value |
|---|---|
| Actor | Coordinator |
| Priority | Must |
| Preconditions | Inputs and permissions validated |
| Trigger | start, resume or reconcile |

Use one repo-wide execution lease resolved through the Git common directory. Serialize
ownership changes through a short-lived guard. Persist nonce, host, PID, start identity and
run before worker dispatch. A second coordinator stops. Only confirmed-dead ownership and
inactive workers permit stale recovery; unknown identity or an orphaned recovery guard stops
for operator diagnosis. Age alone never permits removal. Release only the lease owned by
the caller; read-only commands need no mutating lease.

### UC-03: Dispatch One Implementation Agent Per Task Per Attempt

| Field | Value |
|---|---|
| Actor | Coordinator and implementation worker |
| Priority | Must |
| Preconditions | Ready task, ownership, persisted activity, verified runtime/agent |
| Trigger | Deterministic scheduler reservation |

Persist task/run/attempt/base/plan identity, verify ledger activity, resolve and verify the
actual agent definition for the execution directory, then dispatch exactly once.
Persist returned outcome/usage before verification. Record process registration before it
can perform task work. If the worker is live or its state unknown, do not replace it.
Invalid result/auth/budget/permission/identity conditions fail closed with preserved artifacts.
No-op classification requires actual outcome evidence, not a scheduler guess.

### UC-04: Run Verifications and Review; Persist Outcomes

| Field | Value |
|---|---|
| Actor | Coordinator and review worker |
| Priority | Must |
| Preconditions | Implementation result durably recorded |
| Trigger | Implementation finished |

Run every approved targeted verification and record each exit/result before review.
Review is read-only and uses verified agent identity, task/context and exact diff.
Persist review before checkpoint. passed=true and no open blocking findings are required.
One initial implementation and at most one automatic rework; preserve failed attempts.
Once exhausted, stop for approved replan. Verification infrastructure errors do not imply
functional correctness. Implementation/review costs persist even when the task later fails.
A review activity completing successfully does not itself mean the task passed review.

### UC-05: Checkpoint, Stage, Commit, and Register SHA

| Field | Value |
|---|---|
| Actor | Coordinator |
| Priority | Must |
| Preconditions | Positive verification/review and attributed unchanged diff |
| Trigger | Task ready for consolidation |

Persist complete commit intent; stage only enumerated task paths, compare expected tree;
commit, validate parent/tree/trailers and record SHA. Then finalize task activity.
For parallel work, task completion additionally requires verified integration.
Hooks or external changes invalidate assumptions: stop without reset/clean/stash.
The task control activity closes after checkpoint; individual implementation/review activities
are finalized immediately after their own result. Thus early telemetry is not deferred.
No-op: skip with verified evidence and review, no empty commit.

### UC-06: Resume from Persisted Evidence; Reconcile Without Re-Execution

| Field | Value |
|---|---|
| Actor | User and coordinator |
| Priority | Must |
| Preconditions | Explicit run ID, preserved evidence and no competing live owner |
| Trigger | reconcile, resume or approved replan |

Reconcile exact Git intents, receipts, state and ledger. Do not trust a status flag alone.
Existing valid integrated task: no reimplementation. Missing SHA: locate exact intent-matching
commit without recreating it. Existing result: continue verification rather than implementation.
Dead interrupted attempt: preserve/attribute partial diff before allowed retry.
Unknown/live worker, corrupted state, changed plan or foreign diff: stop.
Reconcile repairs proven gaps only; resume may then continue work. Both are idempotent.
Replan validates a human-approved successor and preserves the original run, attempts and
mapping. It cannot grant its own approval or reset retry history to evade limits.

### UC-07: Run Sequential Execution with One Active Task

| Field | Value |
|---|---|
| Actor | Coordinator |
| Priority | Must |
| Preconditions | maxConcurrency=1 and valid run |
| Trigger | start or resume |

Reserve one task slot through implementation, verification, review and checkpoint.
Default is 1. At most one task is active (zero when waiting/stopped).
Operate in the selected clean feature checkout; classify coordinator artifacts separately.
Cooperative stop prevents new dispatches and preserves completed stage evidence; immediate
stop requests termination and waits for proof. A stop request acknowledgment is not proof
of process termination. Do not start the next task after a blocking failure.

### UC-08: Run Parallel Execution with N Isolated Worktrees

| Field | Value |
|---|---|
| Actor | Coordinator and isolated workers |
| Priority | Must |
| Preconditions | Qualified N>1 runtime, valid run and ownership |
| Trigger | start or resume |

Each attempt has a unique worktree/technical ref; no shared index. Up to N reserved task
slots; one coordinator writes ledger/state. Workers return results, not direct ledger writes.
Integration follows recorded dispatch order, not finish timing; record original/integrated SHA.
Dependencies unlock only after candidate verification, feature-ref advancement and persistence.
On conflict stop new starts and preserve pending commits; running workers may finish safely.
Isolate build/test resources or serialize them. Worktree isolation is not hostile-code sandboxing.
Includes package/local/global distribution tests for the runtime required by this use case.

### UC-09: Execute End-to-End Tests and Runtime Qualification

| Field | Value |
|---|---|
| Actor | Test harness and authorized human operator |
| Priority | Must |
| Preconditions | Isolated fixture or explicitly authorized real-feature environment |
| Trigger | npm test for offline suite; separate authorized command for real runtime |

Offline tests use real executor modules and temporary Git, fake workers through the same
interface, isolated home/config/environment. They never invoke paid models.
Qualification exercises exact definition loading and async process lifecycle on supported OSes.
Fault injection covers each dispatch/receipt/verification/review/commit/integration/state window.
Repeated resume must not duplicate work or measures. Preserve corruption as diagnostic evidence.
After implementation, a separately approved real-feature run on the official entry is required;
its results are not implied by mocks. Document runtime limits and actual observations.

## 3. Business Rules

| ID | Rule | Applies to |
|---|---|---|
| BR-01 | One implementation invocation per task/attempt, no agent-type grouping | UC-03 |
| BR-02 | Dependencies require integrated checkpoint or verified skip | UC-01, UC-08 |
| BR-03 | Stable scheduler decisions for identical plan/state/readiness inputs | UC-01 |
| BR-04 | One coordinator owns the repository execution lease | UC-02 |
| BR-05 | Persistence, ownership and provenance all required before dispatch | UC-03 |
| BR-06 | Record implementation outcome/usage before next stage | UC-03 |
| BR-07 | Unknown tokens null with reason; never invented zero | UC-04 |
| BR-08 | Individual usage only; elapsed and active time distinct; no downtime attribution | UC-04 |
| BR-09 | Verification persisted before review; review persisted before checkpoint | UC-04 |
| BR-10 | Completion requires positive checks/review, verified checkpoint and integration if parallel | UC-05 |
| BR-11 | Verified no-op skips without empty commit | UC-05 |
| BR-12 | No stale recovery by age or uncertain liveness | UC-02 |
| BR-13 | Repeated resume does not duplicate verified completed work | UC-06 |
| BR-14 | Preserve partial work and unintegrated refs; no forced cleanup | UC-06 |
| BR-15 | Foreign modifications stop execution, never silently staged or deleted | UC-05, UC-06 |
| BR-16 | Changed bound plan/config requires human-approved successor | UC-06 |
| BR-17 | No automatic remote push, delivery merge, release or approval | All UCs |
| BR-18 | Delivery bootstrap supervised task-by-task, not unfinished executor or grouped pm-phase3 | UC-09 |
| BR-19 | One ledger/token source, backward-compatible additive interface if needed | UC-04 |
| BR-20 | N positive safe integer, default 1, requested=effective or explicit rejection | UC-07, UC-08 |
| BR-21 | Acknowledged persistence follows qualified flush protocol; no absolute hardware guarantee | UC-05, UC-09 |
| BR-22 | Live/unknown worker never duplicated by resume | UC-03, UC-06 |

## 4. Data Requirements

Run identity: UUID, feature ID/ref, repository/common-dir identity, base/expected SHA, protocol
version, immutable plan/context/config hashes, requested/effective N, state generation and
owner identity. No arbitrary state/lock path override.

Task/attempt: IDs, dependencies, stage, attempt number, worktree/ref, worker process identity,
result/verification/review receipt references, checkpoint/integration intent and SHA pair.
Historical attempts remain intact. The mutable run records progress without overwriting
terminal attempt evidence.

Activity: real ledger operation_id from FTR-016 function; unique run/task/kind agent key,
attempt and provenance metadata. Task-control and implementation/review are distinct activities.
An immutable receipt enables exactly-once projection into the ledger, not a second summed total.
New additive finalization interface, reason field and compatibility tests are specified in
Tech Spec section 6; existing callers/IDs and historical records remain supported.

Ownership: host, PID, process start identity, random nonce and generation; unknown liveness
blocks recovery. State and worker evidence live outside the versioned checkout.
Corruption never becomes empty default state. Plan snapshots are derived, not editable deliverables.

## 5. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | No partial acknowledged state transition; detect incomplete/corrupt writes |
| NFR-02 | Idempotent protocol replay including ledger terminal writes and ref advancement |
| NFR-03 | Deterministic scheduling and state decisions, no LLM control logic |
| NFR-04 | Isolated task worktrees/index plus explicit shared-resource policy |
| NFR-05 | Traceable task, activity, result, attempt, commit and error identities |
| NFR-06 | Persist promptly within qualified local-filesystem guarantees; disk loss/unflushed data excluded |
| NFR-07 | Non-destructive failure and preserved evidence |
| NFR-08 | Consistent seven-command interface, structured outputs and exit codes |
| NFR-09 | Current ledger consumers remain compatible; one token total |
| NFR-10 | No model invocations for deterministic operations |
| NFR-11 | Plan processing handles hundreds of tasks; ready queue avoids repeated full graph reconstruction |
| NFR-12 | Failure never corrupts other work; new dispatch stops on blocking error, active work preserved |
| NFR-13 | Conservative ownership recovery with process identity, not age |
| NFR-14 | Errors identify condition, evidence and safe next action without secret disclosure |

## 6. CLI Requirements

Seven commands: start, status, diagnose, stop, reconcile, resume, replan.
Exact flags/exits are owned by Tech Spec section 10 and must be used unchanged in implementation
and user documentation. Common explicit project selector; explicit run ID except start,
which takes feature path and immutable configuration.
status/diagnose read-only. stop acknowledges a request; status proves eventual stop.
reconcile never dispatches; resume reconciles then continues. replan validates approval,
preserves history and does not automatically start the successor.
No --force variants or state/lock path overrides. No silent concurrency reduction.
Config comes only from explicit start flags and defaults stated in Tech Spec. Real invocation
budget/timeout are explicit; start cannot implicitly authorize spend or change auth provider.

## 7. Acceptance Criteria

| ID | Criterion | Related UC | Priority |
|---|---|---|---|
| AC-01 | Given any Work Breakdown is processed by the new executor, when an implementation phase runs, then each task is dispatched to exactly one implementation agent per attempt; no grouping by agent type occurs at dispatch time; each attempt maps to exactly one agent invocation. | UC-03 | Must |
| AC-02 | Given the executor receives a Work Breakdown plan, when scheduling runs, then task ordering is stable, deterministic, and documented; dependencies are satisfied only after a valid integrated checkpoint or an explicitly verified skip; invalid input (non-DAG dependency graph, duplicate task IDs, missing fields, MD/CSV parity mismatch) is rejected with a structured error before any write or dispatch. | UC-01 | Must |
| AC-03 | Given the executor is about to dispatch an implementation agent, when pre-dispatch checks run, then dispatch is blocked and the agent is not invoked if any of the following preconditions is NOT satisfied: (a) ledger identity has been written and re-read successfully, (b) exclusive lock is held, (c) agent provenance passes `agents resolve --require-verified` (FTR-017 contract); a structured error is emitted identifying the blocking condition. | UC-03 | Must |
| AC-04 | Given the new executor runs alongside the existing ledger (FTR-016/017), when any task is recorded, then all existing ledger entries and token actuals are preserved and readable by current consumers without modification; no second token counter or parallel ledger is introduced; token values unknown at recording time are persisted as `null` with a stated reason, never as `0`. | UC-04 | Must |
| AC-05 | Given a task implementation and its verifications complete, when the checkpoint sequence runs, then the task is marked concluded only after: targeted verifications pass, targeted review completes with no open blocking findings, checkpoint-prepared state is persisted and re-read, staging covers only task-attributable files, commit is registered with ancestry verified on the correct branch, and SHA is durably recorded; a no-modification task is skipped with explicit evidence and verifications — no empty commit is created. | UC-05 | Must |
| AC-06 | Given `maxConcurrency` is 1, when execution runs, then exactly one task is active at a time in the shared worktree; attainment and working-tree index are controlled sequentially with no interleaving between tasks. | UC-07 | Must |
| AC-07 | Given `maxConcurrency` is N > 1, when execution runs, then each attempt runs in its own isolated worktree on its own branch; at most N attempts are concurrent; no two workers share a worktree; integration of completed attempts is serial and stable; a task's dependents are not unblocked before integration is verified on the feature branch; original SHA and integrated SHA are recorded separately. | UC-08 | Must |
| AC-08 | Given two instances of the executor run against the same feature simultaneously, when both attempt to take the same task, then exclusive lock exclusion prevents both coordinators from taking the same task; the second coordinator stops with a structured diagnosis and does not duplicate work, commits, or ledger entries. | UC-02, UC-08 | Must |
| AC-09 | Given resume is invoked one or more times on the same interrupted run, when each resume invocation occurs, then no agent is re-invoked for a task with a valid integrated checkpoint; no duplicate commits or integrations are created; no measurements already persisted are overwritten or duplicated; the command is idempotent across repeated invocations. | UC-06 | Must |
| AC-10 | Given fault injection is applied at each checkpoint boundary (before/after dispatch, before/after verification, before/after checkpoint-prepared, before/after commit, before/after final write), when each fault point is exercised, then no task is falsely marked complete after a fault; work present on disk at the fault point is preserved; the executor can resume from surviving persisted state; no persisted measurement is lost. | UC-09 | Must |
| AC-11 | Given recovery runs after (a) parallel commits not yet integrated, (b) a stale lock from a confirmed-inactive coordinator, (c) an integration conflict, when each recovery scenario occurs, then work and branches are preserved; stale locks are recovered only after confirmed evidence of owner inactivity; conflicts stop new starts without automatic resolution or discard of any branch. | UC-06, UC-08 | Must |
| AC-12 | Given at startup the executor detects (a) corrupted or unreadable state, (b) plan change since the last recorded run state, or (c) foreign file modifications in the working tree, when any of these conditions is present, then the executor stops non-destructively with a structured diagnostic; no data is deleted, overwritten, or silently discarded; plan or configuration modification during a run requires an authorized reconciliation and re-approval cycle before the run continues. | UC-06 | Must |
| AC-13 | Given the test suite runs, when any test executes, then tests use real executor module code, a temporary Git repository initialized for the test, and stub/fake worker implementations accessed through the same public interface as real agents; the scheduler is not re-implemented inside the tests; no test reads from or writes to the real user home directory, the real global toolkit installation, or real user Git configuration. | UC-09 | Must |
| AC-14 | Given the toolkit is installed locally or globally, when the installed payload is inspected, then the executor module and its associated CLI commands are present; test files, fixtures, and temporary directories created during testing are absent from the distributed payload. | UC-08 | Must |
| AC-15 | Given FTR-018 is complete and ready for FTR-019 review, when a manual verification run is performed on the official implement-feature path, then at least one end-to-end controlled run with a real feature and the real Claude runtime is documented; any token limits, cancellation constraints, or runtime bridge limitations encountered are explicitly declared in the documentation; no constraint is concealed by LLM-free mocks that pass in CI but would fail with the real runtime. | UC-09 | Must |
| AC-16 | Given the new executor runs any task to completion or stop, when execution concludes, then no automatic push to a remote repository, no merge of a pull request or of any branch into develop or main, no release publication, and no approval of any gate is performed; controlled technical integration of worktree commits into the feature branch per the approved checkpoint protocol (Increment 7) is explicitly permitted; all other cross-branch actions remain exclusively under user control. | All UCs | Must |

Interpretation: "exactly one active task" in AC-06 means the sequential capacity invariant,
not a requirement to keep a task running when paused or no task is ready. AC-13 applies to
automated tests; the real-runtime acceptance in AC-15 is separately authorized.
AC-14 includes runtime distribution under UC-08. All original 16 AC rows remain unchanged.

## 8. Dependencies and Assumptions

Baseline inspected: develop at 5e4e64d9ba2730fa14007b7f4f07373e86c6da85; package 0.12.0.
FTR-014 renderer: Task Details authoritative; CSV dependencies are phase-level projections.
FTR-015: catalog and existing package distribution. FTR-016/017: real ledger/registry modules,
not JSONL. Node 20 and current repository Jest are the development baseline.
Git and Claude CLI versions must be pinned by runtime qualification; no invented minimum.
Historical CLI spike reports 2.1.260 and Foundry auth. It does not establish all qualification
conditions, no-orphan behavior or billing guarantees.
No new authentication provider, SDK dependency or spending authorization is assumed.
Worktree/cwd alone is not security containment.

## 9. Open Questions and Gate Status

| OQ | Disposition | Gate consequence |
|---|---|---|
| OQ-01 | Path C async CLI selected for design; exact identity/context and process supervision E-01/E-02 still OPEN | Gate 1 blocked |
| OQ-02 | Versioned persistence protocol and filesystem envelope in Tech Spec section 5 | Design defined; implementation qualification remains |
| OQ-03 | Additive finalizeActivity and real ledger identity in section 6 | Design defined; compatibility tests required |
| OQ-04 | Complete MD + CSV projection/digest in section 4 | Design defined; actual-renderer fixtures required |
| OQ-05 | Common-dir ownership protocol in section 5; OS supervision evidence in E-02 | Design defined; E-02 remains a blocker |
| OQ-06 | Seven commands and config/exits in section 10 | Design defined; no implementation claimed |

Gate 1 is not approved. No Work Breakdown or productive implementation is authorized.
Only E-01/E-02 qualification remains before the next design-approval request; failure to qualify
requires an explicit user decision, not another zero-gap claim or scope relaxation.

