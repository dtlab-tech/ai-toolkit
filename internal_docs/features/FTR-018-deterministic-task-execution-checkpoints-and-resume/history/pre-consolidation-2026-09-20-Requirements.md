# Historical snapshot — Functional Requirements (superseded 2026-09-20)

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-018: Deterministic Task Execution, Checkpoints and Resume |
| Version | 1.0 |
| Date | 2026-09-09 |
| Status | Draft |

## 1. Introduction

### 1.1 Purpose

This requirements document specifies the functional behavior of the task execution executor—a deterministic Node.js module that owns the complete lifecycle of task scheduling, agent dispatch, verification coordination, commit sequencing, ledger recording, and reconciliation. The executor replaces the current `pm-phase3` wave-based approach with per-task scheduling, dispatch, checkpointing, and resume primitives. The document establishes acceptance criteria and edge-case handling for sequential execution (`maxConcurrency: 1`) and parallel execution (`maxConcurrency: N > 1`), both with atomic per-task commits and recovery from persisted evidence.

### 1.2 Scope

**In Scope:**
- Per-task scheduling, dispatching, and lifecycle management
- Sequential and concurrent task execution (maxConcurrency: 1 and N > 1)
- Atomic per-task checkpointing and resume from persisted state
- Exclusive lock acquisition and stale-lock recovery
- Backward-compatible ledger extension for task/attempt tracking
- Commit sequence control and post-commit SHA registration
- Isolated worktrees for concurrent execution
- Serial integration of completed attempts
- Fault injection testing and end-to-end validation
- CLI commands: `status`, `resume`, `reconcile`, `replan`
- Runtime bridge spike to prove dispatch, result capture, and cancellation mechanisms

**Out of Scope:**
- Codex and GitHub Copilot operational adapters (contracts only; working adapters deferred)
- Automatic push to remote, merge of branches, or release publication
- Remote backup or recovery from disk loss
- LLM context or memory recovery
- Automatic conflict resolution or discard of unintegrated work
- General architectural rework (reserved for FTR-019)
- Introduction of `Work-Breakdown.json` as a mandatory format
- Hierarchical configuration system beyond `maxConcurrency`
- Full adoption in the assessment pipeline
- The 1.0.0 release (not automatic at FTR-018 close)

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| Executor Module | Pure Node.js module that owns the complete task lifecycle: parsing, scheduling, lock acquisition, agent dispatch, verification, commit, ledger recording, and reconciliation. Does not perform LLM invocations itself; delegates those exclusively to implementation and review agents. |
| Implementation Agent | Claude agent invoked once per task per attempt to perform implementation work. Receives result capture, telemetry, and outcome persistence by the executor. |
| Review Agent | Claude agent invoked to review targeted review tasks. Result and outcome are persisted by executor before checkpoint sequence. |
| Verification Component | Deterministic process that runs targeted verifications on task output. Results are persisted before proceeding to review. |
| Lock Manager | Enforces exclusive access to the current run; prevents duplicate coordinator instances; detects and recovers stale locks. |
| Commit Handler | Controlled staging, committing, and SHA registration per task. Validates ancestry, reachability, and content before marking a task complete. |
| CLI Consumer | User or automation invoking executor commands: `status`, `resume`, `reconcile`, `replan`. |

## 2. Use Cases

### UC-01: Parse and Validate Approved Work Breakdown

| Field | Value |
|-------|-------|
| Actor | Executor Module |
| Preconditions | Approved Work Breakdown exists in Markdown and pipe-separated CSV formats; no Work-Breakdown.json file is required. |
| Trigger | Executor starts; initialization phase runs. |
| Priority | Must |

**Main flow:**
1. Read the approved Markdown Work Breakdown document.
2. Read the approved pipe-separated CSV (columns: `phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type`).
3. Parse and normalize tasks, outcomes, dependencies, and verifications in memory.
4. Validate task/ID uniqueness, DAG acyclicity, field completeness, and parity between Markdown and CSV.
5. Compute stable, documented ordering of ready tasks (all dependencies satisfied by integrated checkpoints or explicitly verified skips).
6. Derive and bind plan snapshot with content digest; treat as read-only.
7. Return normalized plan and task ordering for use by the scheduler.

**Alternative flows:**
- [DAG validation fails] → Stop with structured error identifying the cycle or duplicate IDs; no state mutation.
- [CSV/Markdown parity mismatch] → Stop with structured error identifying the mismatch; propose manual reconciliation.
- [Plan snapshot required but derivation fails] → Stop; snapshot binding is non-idempotent; error is logged.

**Error flows:**
- [Input file not found] → Stop with file-not-found error; no recovery attempted.
- [Parsing error in CSV or Markdown] → Stop with specific parse error; line/column reported.
- [Field missing from required task] → Stop with structured error identifying the task and missing field.

**Postconditions:**
- Normalized plan is returned in memory.
- Task ordering is stable and documented.
- No mutations to any persistent state.
- Plan snapshot (if required) is bound by content digest and persisted as read-only.

---

### UC-02: Acquire Exclusive Lock and Prevent Duplicate Coordinators

| Field | Value |
|-------|-------|
| Actor | Lock Manager |
| Preconditions | Executor is initialized and ready to begin scheduling. |
| Trigger | Executor enters the ready-to-execute state; lock must be held before any dispatch. |
| Priority | Must |

**Main flow:**
1. Construct lock file path (location specified in Tech Spec).
2. Attempt exclusive acquisition of the lock (platform-specific atomic operation).
3. Persist run identity, timestamp, and worker identity in the lock file.
4. Verify lock is held by re-reading; proceed only if re-read succeeds.
5. Hold the lock throughout the run until explicitly released.
6. On cleanup or graceful exit, release the lock.

**Alternative flows:**
- [Lock already held by active process] → Report conflict; stop new coordinator; do not proceed.
- [Lock held but previous owner inactive (stale lock)] → Requires confirmed evidence of inactivity before recovery (see AC-11).

**Error flows:**
- [Lock acquisition fails] → Stop before any dispatch; no retry without user intervention.
- [Lock file is corrupted or unreadable] → Stop; do not attempt automatic cleanup or override.
- [Re-read of lock does not match written identity] → Stop; file system may be inconsistent.

**Postconditions:**
- Exclusive lock is held.
- Lock file is readable and contains run identity, timestamp, and worker ID.
- No second coordinator can proceed while this lock is held.

---

### UC-03: Dispatch One Implementation Agent Per Task Per Attempt

| Field | Value |
|-------|-------|
| Actor | Executor Module, Implementation Agent |
| Preconditions | Task dependencies are satisfied; lock is held; ledger identity is persisted and re-read; agent `nativeName` is verified via `agents resolve --require-verified`. |
| Trigger | Scheduler selects a ready task and dispatches it. |
| Priority | Must |

**Main flow:**
1. Verify pre-dispatch conditions: ledger written/re-read, lock held, agent verification passed.
2. Persist run identity, task identity, attempt identity, base SHA, plan reference, and worker identity.
3. Resolve agent `nativeName` via `agents resolve --require-verified` (FTR-017 contract).
4. Dispatch exactly one implementation agent invocation with task context.
5. Capture agent result and telemetry immediately upon return.
6. Persist implementation outcome and measurements before starting verifications.
7. Record token values; unknown values are `null` with stated reason, never `0`.
8. Separate elapsed time from active time; do not attribute shutdown duration to agent work.

**Alternative flows:**
- [Task is a no-modification task] → Skip implementation; proceed directly to verification and review; mark with explicit evidence.
- [Concurrent attempt] → Use individually observable measurements per attempt, not derived deltas from global total.

**Error flows:**
- [Pre-dispatch persistence fails] → Do not invoke agent; abort run; no partial state written.
- [`agents resolve --require-verified` returns non-zero] → Dispatch blocked; structured error emitted; pipeline stops.
- [Ledger `open` fails] → Agent not invoked; fail-closed.
- [Agent result cannot be captured] → Record attempt as interrupted; preserve partial diff; do not mark complete.

**Postconditions:**
- Exactly one agent invocation occurs for this task/attempt pair.
- Implementation outcome, telemetry, and measurements are persisted.
- Token values are recorded with explicit `null` markers where unknown.
- Attempt record is created and is retrievable for resume/reconciliation.

---

### UC-04: Run Verifications and Review; Persist Outcomes

| Field | Value |
|-------|-------|
| Actor | Executor Module, Verification Component, Review Agent |
| Preconditions | Implementation dispatch is complete and outcome is persisted. |
| Trigger | After implementation outcome is captured. |
| Priority | Must |

**Main flow:**
1. Run targeted verifications on implementation output.
2. Persist verification outcome before proceeding to review.
3. If verifications fail, determine if automatic rework is allowed (default: one initial attempt + one rework).
4. If no automatic rework is available, stop and mark for manual reconciliation.
5. If automatic rework is allowed, return to implementation dispatch (new attempt).
6. If verifications pass, run targeted review.
7. Persist review outcome before checkpoint sequence.

**Alternative flows:**
- [Verification detects open blocking findings] → Attempt rework if allowed; otherwise propose replan.
- [Review returns with open blocking findings] → Block checkpoint; do not proceed to commit.
- [Parallel attempts: multiple review outcomes] → Preserve all outcomes; serial integration determines which attempt commits.

**Error flows:**
- [Verification framework fails to run] → Record as interrupted; preserve diff and measurements; stop until manual intervention.
- [Review result cannot be persisted] → Checkpoint blocked; state left in known condition; manual reconciliation required.

**Postconditions:**
- Verification outcome is persisted and re-readable.
- Review outcome is persisted and re-readable.
- All attempt records (initial, rework) are preserved.
- No task marked complete if review has open blocking findings.

---

### UC-05: Checkpoint, Stage, Commit, and Register SHA

| Field | Value |
|-------|-------|
| Actor | Executor Module, Commit Handler |
| Preconditions | Implementation complete, verifications pass, review complete with no open blocking findings. |
| Trigger | After review outcome is persisted and validated. |
| Priority | Must |

**Main flow:**
1. Persist checkpoint-prepared state (intention + required references) and re-read for durability.
2. Perform controlled staging: only files attributable to this task.
3. Validate no foreign modifications, no `git add .`, no stash, no reset/clean, no force push.
4. Commit with task identity, run/attempt identity, and plan reference in correlatable form.
5. Verify commit ancestry and reachability on the correct branch.
6. Extract and durably register the resulting commit SHA (platform-specific post-commit path).
7. Persist the registered SHA in executor state and re-read.
8. Close ledger entry only after SHA is registered and verified.

**Alternative flows:**
- [No modification task] → Skip staging and commit; record explicit evidence; verify via acceptance criteria AC-05; no empty commit created.
- [Parallel execution with integration conflict] → Preserve work and branches; stop new starts; require manual resolution (no automatic conflict resolution).

**Error flows:**
- [Commit hook fails] → Task not concluded; no SHA registered; attempt preserved; can be resumed or reworked.
- [Staging failure] → Stop; preserve worktree; no reset or cleanup without user intervention.
- [SHA extraction fails] → Commit exists but is not integrated; preserved for manual recovery; execution stops.
- [Ledger close fails] → SHA is registered but ledger entry is open; reconciliation required on resume.

**Postconditions:**
- If no modification: explicit skip evidence and verifications recorded; no commit created.
- If modifications present: commit created, SHA extracted and durably registered.
- Ledger entry closed only if SHA is successfully registered.
- All previous attempt records preserved.

---

### UC-06: Resume from Persisted Evidence; Reconcile Without Re-Execution

| Field | Value |
|-------|-------|
| Actor | Executor Module, CLI Consumer |
| Preconditions | A previous run was interrupted or stopped; persisted state exists on disk. |
| Trigger | User invokes `executor resume` or `executor reconcile` command. |
| Priority | Must |

**Main flow:**
1. Read persisted executor state and plan reference.
2. Classify artifacts: pipeline-permitted (committed, staged, persisted state) vs user modifications (foreign diffs).
3. If user modifications detected: stop with reconciliation prompt; require authorized decision before continuing.
4. Validate plan: if modified since last run state, stop and require replan/reapproval.
5. For each task: apply resume evidence table (see Edge Cases and Error Scenarios).
6. If valid checkpoint exists and is integrated: skip re-implementation; move to next task.
7. If commit created but final registration missing: reconcile without new commit or agent invocation.
8. If verifications complete but commit absent: revalidate evidence; complete checkpoint if safe.
9. If attempt interrupted with partial diff: preserve diff; verify attribution before resuming.
10. If commit in worktree but not integrated: resume integration path, not implementation.
11. If branch/plan changed or state corrupted: stop with structured diagnosis; no data loss.
12. Mark each resolved task as resumed; do not re-execute.
13. Continue with next ready task.

**Alternative flows:**
- [Stale lock detected] → Check for confirmed evidence of owner inactivity; only proceed if confirmed (see AC-11).
- [A currently active process is detected] → Report conflict; do not proceed until active process completes or is confirmed inactive.
- [Empty-modification task detected] → Skip with explicit evidence; no empty commit created.

**Error flows:**
- [State file corrupted or unreadable] → Stop non-destructively; no data deleted; user must manually inspect state.
- [Resume command executed twice on same state] → Idempotent behavior: no duplicate commits, no re-invocations, no measurement overwrites.
- [Ledger entry missing for a completed task] → Reconcile the missing ledger entry; do not lose or overwrite existing data.

**Postconditions:**
- No agent is re-invoked for a task with a valid integrated checkpoint.
- No duplicate commits or integrations are created.
- No persisted measurement is overwritten or duplicated.
- Unintegrated work and branches are preserved.
- Resume command is idempotent across repeated invocations.

---

### UC-07: Run Sequential Execution with One Active Task

| Field | Value |
|-------|-------|
| Actor | Executor Module, Scheduler |
| Preconditions | `maxConcurrency: 1` is configured; lock is held; plan is validated. |
| Trigger | Execution phase begins. |
| Priority | Must |

**Main flow:**
1. Compute task ordering from dependency graph.
2. For each ready task (all dependencies satisfied):
   a. Acquire lock (already held).
   b. Open ledger entry.
   c. Dispatch one implementation agent.
   d. Persist outcome, run verifications, persist result.
   e. Run review, persist outcome.
   f. If no blocking findings: checkpoint, stage, commit, register SHA, close ledger entry.
   g. If blocking findings: rework or stop per retry policy.
3. Exactly one task is active at a time in the shared worktree.
4. Attainment (git index, working tree) is controlled sequentially with no interleaving.
5. Continue until all ready tasks are complete or a stop signal is received.

**Alternative flows:**
- [Cooperative stop signal received] → Complete no new dispatches; consolidate received results; checkpoint pending work; exit gracefully.
- [Immediate stop/interrupt] → Preserve files; record attempt as interrupted; do not force cleanup.

**Error flows:**
- [Task prerequisite not satisfied] → Skip task; mark as blocked; do not dispatch.
- [Verification fails; automatic rework exhausted] → Stop and propose manual replan; do not proceed to next task.

**Postconditions:**
- All completed tasks are integrated and committed.
- All pending tasks are preserved with persisted state.
- Ledger reflects the status of each task.
- Run can be resumed at any interruption point.

---

### UC-08: Run Parallel Execution with N Isolated Worktrees

| Field | Value |
|-------|-------|
| Actor | Executor Module, Scheduler, Coordinator |
| Preconditions | `maxConcurrency: N > 1` is configured; lock is held; plan is validated. |
| Trigger | Execution phase begins. |
| Priority | Must |

**Main flow:**
1. Validate `maxConcurrency`: positive integer; default is 1; invalid values rejected before state mutation.
2. Create N isolated worktrees, each on its own technical branch.
3. For each ready task:
   a. Assign task to one of N worker slots (up to N concurrent attempts).
   b. Each worker acquires its own isolated worktree.
   c. Worker opens ledger entry, resolves agent, dispatches implementation agent in its worktree.
   d. Worker persists outcome, runs verifications, runs review in its worktree.
   e. If verifications pass and review has no blocking findings: worker prepares commit in its worktree.
4. Coordinator (single shared resource) integrates completed attempts sequentially:
   a. Validate completed attempt: ancestry, reachability, content, plan reference.
   b. Merge attempt's branch into feature branch.
   c. Register merged SHA in executor state.
   d. Close ledger entry.
   e. Record original SHA and integrated SHA separately.
5. A task's dependents are not unblocked before integration is verified on the feature branch.
6. No two workers share a worktree; no interleaving of worktree modifications.
7. Build outputs and shared test resources are isolated per worktree or serialized.
8. Concurrent token attribution: deltas from overlapping attempts are not summed; individual measurements per attempt are preserved.

**Alternative flows:**
- [Integration conflict] → Stop new starts; preserve work and branches; require manual resolution (no automatic resolution).
- [Integration failure (non-conflict)] → Stop new starts; preserve work; diagnosis and manual intervention required.
- [Worker process terminates abnormally] → Attempt marked as interrupted; work preserved in worktree; can be resumed or cleaned.

**Error flows:**
- [A task's dependency is still integrating] → Do not unblock dependent; wait for integration to complete and be verified.
- [`maxConcurrency` modified during run] → Stop; prompt for authorized reconciliation and re-approval.
- [Lock conflict (two coordinators)] → Second coordinator stops with structured diagnosis; no duplicated work.

**Postconditions:**
- All completed attempts are integrated in stable sequence.
- Original and integrated SHAs are recorded separately.
- Ledger reflects per-attempt status.
- All work and branches are preserved on error.
- Run can be resumed with evidence of which attempts are integrated and which are pending.

---

### UC-09: Execute End-to-End Test with Fault Injection and Real Feature

| Field | Value |
|-------|-------|
| Actor | Test Suite, Real Executor, Real Feature |
| Preconditions | Executor is complete through Increment 7; test framework supports fault injection; real feature and real Claude runtime are available. |
| Trigger | Test suite is invoked (e.g., `npm test`). |
| Priority | Must |

**Main flow:**
1. Initialize a temporary Git repository for the test (not the real user home directory).
2. Load the real feature Work Breakdown (Markdown + CSV).
3. Configure fault injection to fire at each checkpoint boundary:
   - Before/after dispatch
   - Before/after verification
   - Before/after checkpoint-prepared state
   - Before/after commit
   - Before/after final write
4. For each fault point:
   a. Run the executor and allow it to reach the fault point.
   b. Inject the fault (e.g., kill process, corrupt state file, fail write).
   c. Observe the execution state at the moment of injection.
   d. Restart the executor via `resume` command.
   e. Verify no false completions (task is not marked done if fault occurred before full commit/registration).
   f. Verify all work present on disk at the fault point is preserved.
   g. Verify the executor can resume from surviving persisted state.
   h. Verify no persisted measurement is lost.
5. Document any token limits, cancellation constraints, or runtime bridge limitations encountered.
6. Record that no constraint is concealed by LLM-free mocks that would pass CI but fail with the real runtime.

**Alternative flows:**
- [Real runtime unable to perform a required dispatch/result/cancellation operation] → Documented in test output; no false pass in CI.
- [Token limits encountered] → Recorded and included in documentation; not hidden by truncation or mocking.

**Error flows:**
- [Test fixture setup fails] → Test aborted; not counted as a pass.
- [Fault injection mechanism fails] → Test logged; manual inspection required.

**Postconditions:**
- At least one end-to-end controlled run is documented.
- All fault injection points are exercised.
- No constraint is concealed by mocks.
- Executor can resume from each fault scenario without data loss.
- Test output is retained for FTR-019 architectural review.

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | Each task must be dispatched to exactly one implementation agent per attempt; no grouping by agent type occurs at dispatch time. | UC-03, AC-01 |
| BR-02 | Dependencies must be satisfied only by a valid integrated checkpoint or an explicitly verified skip; a task cannot proceed until its dependencies are confirmed complete. | UC-01, UC-07, UC-08 |
| BR-03 | Task ordering must be stable and deterministic; any scheduler run on the same plan must produce the same task order. | UC-01 |
| BR-04 | An exclusive lock must be held at all times while the executor is running; a second coordinator must not be allowed to proceed if the lock is already held. | UC-02, BR-12 |
| BR-05 | Pre-dispatch checks must all pass before an agent is invoked: (a) ledger identity written and re-read, (b) exclusive lock held, (c) agent provenance verified via `agents resolve --require-verified`. If any check fails, dispatch is blocked and a structured error is emitted. | UC-03, AC-03 |
| BR-06 | Implementation outcome and measurements must be persisted immediately after the agent returns, before verifications or review begin. | UC-03, AC-04 |
| BR-07 | Token values unknown at recording time must be persisted as `null` with a stated reason; `0` is only used when the value is known to be zero. Never record unknown values as `0`. | UC-03, UC-04, AC-04 |
| BR-08 | Elapsed time and active time must be tracked separately; shutdown duration must not be attributed to agent work. For concurrent attempts, individual per-attempt measurements must be preserved; per-attempt deltas must not be derived from a global total. | UC-03, UC-04 |
| BR-09 | Verification outcome must be persisted before review begins; review outcome must be persisted before checkpoint sequence begins. | UC-04 |
| BR-10 | A task is marked concluded only after: (a) targeted verifications pass, (b) targeted review completes with no open blocking findings, (c) checkpoint-prepared state is persisted and re-read, (d) staging covers only task-attributable files, (e) commit is registered with ancestry verified on the correct branch, (f) SHA is durably recorded. | UC-05, AC-05 |
| BR-11 | A no-modification task must be skipped with explicit evidence and verifications performed; no empty commit is created. | UC-04, UC-05, AC-05 |
| BR-12 | Stale lock recovery requires confirmed evidence that the previous owner is no longer active; no automatic override on timeout alone. | UC-02, UC-06, AC-11 |
| BR-13 | A valid integrated checkpoint must not trigger re-implementation on resume; resume is idempotent across repeated invocations. | UC-06, AC-09 |
| BR-14 | Partial commits or unintegrated work must be preserved on error; cleanup covers only resources created by the current run and already integrated and confirmed. | UC-06, AC-11 |
| BR-15 | User modifications (foreign diffs in worktree) must cause the executor to stop with a reconciliation prompt; no automatic cleanup or forced removal. | UC-06, AC-12 |
| BR-16 | Plan modification during a run must cause the executor to stop and require authorized reconciliation and re-approval before continuing. | UC-06, AC-12 |
| BR-17 | No automatic push to remote, merge to develop/main, release publication, or approval of gates is performed by the executor. Controlled technical integration per the checkpoint protocol is explicitly permitted. | AC-16 |
| BR-18 | The executor must not be automatically bootstrapped during FTR-018 delivery; the bootstrap path for delivering FTR-018 itself must be documented. | FTR-018 scope |
| BR-19 | The existing FTR-016/017 ledger and token counter must not be replaced, duplicated, or extended with a second counter. All task/attempt transitions are mapped onto existing `open`/`close`/`fail`/`skip` operations; backward compatibility is preserved. | UC-04, AC-04 |
| BR-20 | `maxConcurrency` must be a positive integer; invalid values (zero, negative, non-integer, or absent when required) must be rejected before any state mutation or dispatch. The configured limit is the maximum number of concurrent attempts; requested and effective values are persisted separately. | UC-08 |
| BR-21 | Atomic commit semantics for state file writes: rename-based atomic writes or equivalent durability must be used to prevent inconsistent state on crash or power loss. | OQ-02 |
| BR-22 | A currently active process must never be duplicated by a resume; if an active process is detected, resume must report the conflict and not proceed. | UC-04, AC-04 |

## 4. Data Requirements

### 4.1 Entities

#### Executor State (Internal)

**Description:** Persisted state that tracks the complete lifecycle of an executor run.

**Fields:**
- `run_id` (UUID, required): Unique identifier for this execution run.
- `feature_id` (string, required): Feature or project being executed (e.g., "FTR-018").
- `feature_branch` (string, required): Target branch for commits (e.g., "feature/FTR-018").
- `base_sha` (string, required): SHA of the base commit before execution began.
- `plan_reference` (object, required): Canonical plan identity and content digest.
  - `plan_digest` (string, required): Content digest (e.g., SHA-256) of the approved Markdown and CSV.
  - `markdown_source` (string, required): Path or fingerprint of the Markdown document.
  - `csv_source` (string, required): Path or fingerprint of the CSV document.
- `plan_snapshot` (object, optional): Normalized plan if persisted for resume (read-only, bound by digest).
- `state_version` (string, required): Schema version of this state record (e.g., "1.0.0").
- `created_at` (ISO 8601 timestamp, required): When this state was created.
- `updated_at` (ISO 8601 timestamp, required): When this state was last modified.
- `worker_id` (string, required): Identity of the worker/coordinator owning this run.
- `lock_acquired_at` (ISO 8601 timestamp, required): When the exclusive lock was acquired.
- `max_concurrency` (positive integer, required): Configured concurrency limit.
- `max_concurrency_effective` (positive integer, required): Effective concurrency limit (may differ if reduced by system constraints).
- `tasks` (array of task records, required): Ordered list of tasks in this run.
  - Each task record includes: `task_id`, `phase_id`, `domain`, `agent_type`, `depends_on`, `status`, `attempts` array.
- `task_status_map` (object, required): Mapping of task_id → current status for quick lookup.
- `integration_sequence` (array, optional): For parallel runs, the stable sequence in which commits were integrated.

**Constraints:**
- State file must be immutable once a task is marked complete and integrated.
- Plan snapshot, if present, must be read-only and bound by digest to the approved documents.
- State must be written atomically (rename-based or equivalent).
- State file location is specified in the Tech Spec and is stable across runs.

**Relationships:**
- References FTR-016/017 ledger entries via `ledger_id`.
- References Git commits via SHA.
- References agent resolutions via `nativeName` (FTR-017 contract).

#### Task Attempt Record (Internal)

**Description:** A single execution attempt of a task.

**Fields:**
- `attempt_id` (UUID, required): Unique identifier for this attempt.
- `task_id` (string, required): The task being attempted.
- `attempt_number` (positive integer, required): Sequence within the task (1 = initial, 2 = rework, etc.).
- `status` (enum, required): One of `pending`, `dispatched`, `implementation_complete`, `verification_complete`, `review_complete`, `committed`, `integrated`, `failed`, `interrupted`, `skipped`.
- `started_at` (ISO 8601 timestamp, required): When this attempt was dispatched.
- `ended_at` (ISO 8601 timestamp, optional): When this attempt concluded (success or failure).
- `implementation_outcome` (object, optional): Result returned by the implementation agent.
  - `success` (boolean, required): True if agent completed successfully.
  - `output` (string, optional): Task output or work performed.
  - `errors` (array of strings, optional): Any errors reported by agent.
- `implementation_telemetry` (object, optional): Measurements from implementation.
  - `tokens_input` (integer or null, required): Input tokens used; `null` if unknown.
  - `tokens_output` (integer or null, required): Output tokens used; `null` if unknown.
  - `input_reason` (string, optional): If `tokens_input` is `null`, explanation.
  - `output_reason` (string, optional): If `tokens_output` is `null`, explanation.
  - `elapsed_time_ms` (integer, required): Total elapsed time from dispatch to return.
  - `active_time_ms` (integer or null, required): Time spent actively in agent; `null` if unmeasurable.
  - `active_time_reason` (string, optional): If `active_time_ms` is `null`, explanation.
- `verification_outcome` (object, optional): Result of targeted verification.
  - `passed` (boolean, required): True if all targeted verifications passed.
  - `details` (string, optional): Detailed verification results.
  - `blocking_findings` (array, optional): Critical issues that prevent progress.
- `review_outcome` (object, optional): Result of targeted review.
  - `passed` (boolean, required): True if review found no blocking findings.
  - `findings` (array, optional): Non-blocking findings (suggestions).
  - `blocking_findings` (array, optional): Critical findings blocking progress.
  - `reviewer_notes` (string, optional): Reviewer comments.
- `commit_info` (object, optional): Commit details after successful checkpoint.
  - `original_sha` (string, optional): SHA of task's commit in its worktree (before integration).
  - `integrated_sha` (string, optional): SHA after integration onto feature branch (parallel only).
  - `commit_timestamp` (ISO 8601 timestamp, optional): When commit was created.
  - `commit_message` (string, optional): Full commit message with task identity and plan reference.
- `ledger_entry_id` (UUID, optional): Reference to FTR-016/017 ledger entry.
- `worktree_path` (string, optional): For parallel execution, path to isolated worktree.
- `technical_branch` (string, optional): For parallel execution, name of the per-attempt branch.

**Constraints:**
- Attempt records are immutable once marked `integrated`.
- A task with a valid `integrated` attempt must not generate new attempts on resume.
- Telemetry fields for tokens must never be recorded as `0` if the value is unknown; `null` is mandatory with a stated reason.

**Relationships:**
- Belongs to a task (many attempts per task).
- References FTR-016/017 ledger via `ledger_entry_id`.
- References Git worktree via `worktree_path`.

#### Lock File (Internal)

**Description:** Exclusive lock preventing concurrent executor instances.

**Fields:**
- `acquired_at` (ISO 8601 timestamp, required): When the lock was acquired.
- `run_id` (UUID, required): ID of the run holding the lock.
- `worker_id` (string, required): Identity of the worker/coordinator holding the lock.
- `lock_version` (string, required): Lock format version.

**Constraints:**
- Lock must be held via atomic file operation (platform-specific).
- Lock file path is stable and specified in Tech Spec.
- Stale lock recovery requires confirmed evidence of owner inactivity.

**Relationships:**
- References the current run via `run_id`.

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| `run_id` | Must be a valid UUID; must be unique across all runs. |
| `feature_id` | Must match the pattern `[A-Z]+-[0-9]+` (e.g., FTR-018). |
| `feature_branch` | Must be a valid Git branch name; must exist on local repository. |
| `base_sha` | Must be a valid Git SHA; must be reachable on the feature branch. |
| `plan_digest` | Must match the computed digest of the Markdown and CSV documents; changes trigger a replan. |
| `state_version` | Must match the executor's expected schema version; incompatible versions trigger an error. |
| `worker_id` | Must be a non-empty string; must be consistent within a run. |
| `max_concurrency` | Must be a positive integer; default is 1; invalid values rejected before state mutation. |
| `task_id` | Must be unique within the approved plan; must match the pattern defined in FTR-014. |
| `attempt_number` | Must be a positive integer; must be sequential within a task (no gaps). |
| `status` | Must be one of the defined enum values; transitions must follow the documented state machine. |
| `tokens_input` | Must be a non-negative integer or `null` (with stated reason); never `0` if unknown. |
| `tokens_output` | Must be a non-negative integer or `null` (with stated reason); never `0` if unknown. |
| `original_sha` | Must be a valid Git SHA; must be reachable in the task's worktree. |
| `integrated_sha` | Must be a valid Git SHA; must be reachable on the feature branch; must have original_sha as an ancestor. |
| `dependency_satisfied` | A task's dependencies are satisfied if each dependency is either: (a) marked `integrated`, or (b) explicitly verified as skipped. |

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Atomicity | All state file writes must use atomic operations (rename-based or equivalent) to ensure consistency on crash or power loss. |
| NFR-02 | Idempotency | Resume and reconcile commands must be idempotent; repeated invocations on the same state must produce the same outcome without duplication. |
| NFR-03 | Determinism | Scheduling, sequencing, lock acquisition, and commit staging must be deterministic and require no LLM invocations. |
| NFR-04 | Isolation | Concurrent worktrees must not share state; no two workers may modify the same worktree simultaneously. |
| NFR-05 | Observability | All state transitions, dispatch events, verification results, commit operations, and error conditions must be logged or persisted for post-execution diagnostics. |
| NFR-06 | Durability | All attempt records, measurements, and commit SHAs must be persisted durably on stable storage; no loss of data on executor shutdown or crash. |
| NFR-07 | Graceful Degradation | On errors, executor must preserve all work, branches, and state; no forced cleanup or automatic resolution of conflicts. |
| NFR-08 | CLI Usability | CLI commands must have clear exit codes, concise error messages identifying the blocking condition, and unambiguous success indication. |
| NFR-09 | Backward Compatibility | Ledger extension must not break existing FTR-016/017 consumers; no second token counter introduced. |
| NFR-10 | Performance | Sequential execution (`maxConcurrency: 1`) must incur minimal overhead beyond agent dispatch time; parallel execution must not introduce significant coordinator contention. |
| NFR-11 | Scalability | The executor must be able to handle plans with hundreds of tasks without quadratic scheduling overhead. |
| NFR-12 | Fault Isolation | Failure of a single task must not corrupt global state or prevent other tasks from completing; failure containment is at task/attempt scope. |
| NFR-13 | Lock Recovery | Stale lock recovery must not proceed without confirmed evidence of previous owner inactivity; automatic timeout-based override is prohibited. |
| NFR-14 | Error Reporting | All error conditions must include: (a) the triggering condition, (b) the state at failure, (c) the recommended recovery action. Errors must not be silent or generic. |

## 6. UI Requirements

### 6.1 CLI Commands

The executor exposes the following public commands via `ai-toolkit executor <command>`:

#### `status`

**Purpose:** Read-only inspection of persisted run state without mutation.

**Signature:**
```
ai-toolkit executor status [--run-id <uuid>] [--verbose]
```

**Output:**
- Current status of all tasks and attempts.
- Integrated vs. pending commits.
- Lock status and owner.
- Ledger summary.
- No state is modified.

---

#### `resume`

**Purpose:** Resume a stopped or interrupted run; idempotent and mutative.

**Signature:**
```
ai-toolkit executor resume [--run-id <uuid>] [--max-concurrency <N>]
```

**Behavior:**
1. Read persisted state.
2. Classify worktree artifacts (pipeline-permitted vs. user modifications).
3. If user modifications: stop with reconciliation prompt.
4. If plan modified: stop and require replan authorization.
5. Apply resume evidence table (see Edge Cases section).
6. Continue execution from the point of interruption.

**Output:**
- Diagnostic of resumed state.
- Summary of tasks to be resumed vs. completed.
- Warnings or errors blocking resumption.

---

#### `reconcile`

**Purpose:** Reconcile persisted state with Git repository; resolve missing ledger entries or SHAs.

**Signature:**
```
ai-toolkit executor reconcile [--run-id <uuid>] [--force-integrate-pending]
```

**Behavior:**
1. Verify existing commits are reachable on the feature branch.
2. Verify ledger entries match integrated commits.
3. Register missing SHAs if commit evidence is sufficient.
4. If force-integrate-pending: attempt to integrate any pending commits (user risk).

**Output:**
- Reconciliation summary: tasks reconciled, ledger entries repaired.
- Any unresolved conflicts requiring manual intervention.

---

#### `replan`

**Purpose:** Abandon the current run and authorize a new plan.

**Signature:**
```
ai-toolkit executor replan [--run-id <uuid>] --force-abandon
```

**Behavior:**
1. Verify user authorization (--force-abandon required).
2. Mark current run as abandoned (no data deleted).
3. Provide path to create a new run with a new approved Work Breakdown.

**Output:**
- Confirmation that old run state is preserved.
- Instructions for starting a new run.

---

### 6.2 Configuration

**Source:** Explicitly specified in Tech Spec; no hierarchical configuration system in scope.

**Parameters:**
- `maxConcurrency` (positive integer, default: 1): Maximum concurrent execution attempts.
- `stateFilePath` (string, optional): Override location of executor state file (advanced).
- `lockFilePath` (string, optional): Override location of lock file (advanced).

---

### 6.3 Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success; all operations completed as expected. |
| 1 | General error; details in stderr. |
| 2 | User modifications or plan changes detected; reconciliation required. |
| 3 | Lock conflict or active process detected; cannot proceed. |
| 4 | State corrupted or unreadable; manual intervention required. |
| 5 | Agent dispatch or verification failed; recovery required. |
| 6 | Configuration error (invalid `maxConcurrency`, etc.); operation aborted. |

## 7. Acceptance Criteria

| ID | Criterion | Related UC | Priority |
|----|-----------|-----------|----------|
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

## 8. Dependencies & Assumptions

### External Dependencies

| Dependency | Version/Ref | Status | Impact |
|------------|-------------|--------|--------|
| FTR-014 | Work Breakdown tasks, dependencies, verifications defined in approved MD + CSV | Available | Executor reads these as canonical sources; no JSON format required. |
| FTR-015 | `lib/asset-catalog.js`, `resolveClaudeRuntimeAsset()`, manifest, `installationMode` | Available | Distribution and asset resolution for Increment 8. |
| FTR-016 | `lib/execution-ledger.js`, `ai-toolkit ledger open\|close\|fail\|skip` CLI | Available, commit df54a91 | Executor extends ledger backward-compatibly; no second counter introduced. |
| FTR-017 | `lib/agent-registry.js`, `resolveAgent()`, `validateAgentSet()`, all 15 agents renamed to `gaia-*` | Available, branch develop, HEAD 5e4e64d | `agents resolve --require-verified` contract is non-negotiable; only `nativeName` is passed to dispatch. |
| Node.js Runtime | v16+ (or project minimum) | Required | Executor is pure Node.js; no external interpreters. |
| Git | v2.0+ | Required | Worktree, branch, commit, merge operations. |
| Claude CLI (claude.exe) — Percorso C | v2.1.260, non-interactive `--print --output-format json` | **Resolved (OQ-01)** | Runtime bridge for agent dispatch and result capture. Node.js coordinator invokes `claude.exe` subprocess with `--agent <nativeName>` and `--json-schema`. No new dependency: uses existing `third_party/foundry` auth. |

### Assumptions

| # | Assumption | Rationale | Impact |
|---|-----------|-----------|--------|
| A-01 | Approved Work Breakdown (MD + CSV) is the canonical source for tasks and dependencies. | Eliminates maintenance of a second source of truth; reduces surface for inconsistency. | Executor must parse MD and CSV losslessly; no JSON format is mandatory. |
| A-02 | FTR-017 `agents resolve --require-verified` contract is stable and will not change during FTR-018 implementation. | Ensures agent verification is a known, testable operation. | Dispatch cannot proceed if agent verification fails; executor must fail-closed. |
| A-03 | `pm-phase3.js` is not used as the bootstrap executor for FTR-018 delivery itself. | FTR-018 executor is not yet available during its own development. | Bootstrap path must be documented; delivery is not automatic. |
| A-04 | User has authority to approve a new plan or reconciliation if plan is modified during a run. | Prevents silent reinterpretation of approved plans. | Executor must stop and prompt; no automatic replan. |
| A-05 | All Git operations (commit, merge, branch creation) use the local repository only. No push to remote. | Keeps all work safe on local disk until user explicitly pushes. | Executor is not responsible for remote sync; cross-branch integration is local-only. |
| A-06 | Worktree isolation on Windows and Linux is sufficient for the test suite. | Parallel execution does not require OS-level containerization. | Build outputs and shared resources must be isolated per worktree or serialized. |
| A-07 | Token measurement is observable from the Claude runtime bridge (Increment 1 result). | Telemetry must be complete and attributable per attempt. | If individual per-attempt token measurement is impossible, recorded as `null` with stated reason. |
| A-08 | Runtime bridge spike (Percorso C) completed before Gate 1 (2026-09-18). OQ-01 RESOLVED. | OQ-01 was a hard prerequisite for all productive implementation. | Executor design confirmed: Node.js coordinator + `claude.exe --print` subprocess. Productive implementation proceeds after Gate 2. |

## 9. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|----------------------|
| OQ-01 | Which mechanism is actually supported for bridging Node.js and the Claude workflow runtime? What are the supported dispatch, result-capture, and cancellation APIs? Are there observable constraints on token usage or invocation timing? | **RESOLVED (2026-09-18) — Percorso C:** Node.js coordinator uses `spawnSync(claude.exe, ['--print', '--output-format', 'json', '--json-schema', <schema>, '--model', <model>, '--max-budget-usd', <budget>, '--agent', <nativeName>, '--permission-mode', 'auto', '--permission-prompts', 'none', <prompt>], {cwd: worktreeDir, encoding: 'utf8', timeout: <ms>})`. Exit 0 confirmed with structured JSON output and full usage data. `--agent gaia-developer-backend` loads correct agent definition (cacheCreationInputTokens: 19,537, thinking activated — distinct from default session). Timeout → SIGTERM (subprocess terminated, no orphan). Auth: `third_party/foundry` (Azure existing subscription, no new service). Limits: `--bare` mode NOT compatible with foundry auth; budget must be appropriate per task type; agent discovery requires nativeName from FTR-017 `resolveAgent`. Full evidence: `FTR-018-Gate1-Review-Actions.md` Point 4. | Closed by pre-Gate 1 spike (2026-09-17/18). Productive implementation proceeds only after Gate 2. |
| OQ-02 | What is the schema of the executor's internal state protocol? Which fields are required? What atomic-write and flush guarantees are achievable on Windows and Linux? Does a rename-based atomic write provide sufficient durability guarantees for this use case, or is additional journaling required? | **Blocks Increment 3.** Determines correctness of resume and checkpoint durability. | Document exact state schema in Tech Spec. Evaluate platform-specific atomic write semantics (rename on POSIX, ReplaceFileW on Windows). If durability risk is identified, define journaling or additional recovery mechanism. |
| OQ-03 | How are task/attempt lifecycle transitions mapped onto FTR-016/017 ledger `open`/`close`/`fail`/`skip` operations? Is a migration of the ledger schema needed? If so, what backward-compatible migration path ensures existing consumers continue to work? | **Blocks Increment 3.** Determines ledger backward compatibility and token counter integrity. | Tech Spec must document the full mapping from task/attempt lifecycle to ledger operations. If schema changes are necessary, define migration procedure that does not break FTR-016/017 consumers. Test migration on real ledger data. |
| OQ-04 | How is the approved plan parsed losslessly from MD and CSV? What is the canonical identity of the plan snapshot, and how is it verifiably bound (via content digest) to the approved Markdown and CSV documents? | **Blocks Increment 2.** Determines resume safety and replan detection accuracy. | Tech Spec must define parser logic, content digest algorithm (SHA-256 or equivalent), and how snapshot binding is verified. Test parser on real approved Work Breakdowns (including edge cases: empty tasks, cycles, missing fields). |
| OQ-05 | Where is the executor state file positioned relative to commits and the central writer? What is the lock file format and location? How is stale-lock detection implemented without false positives? What is the policy for integration failure (stop new starts vs. abort current run)? | **Blocks Increment 3.** Determines coordinator safety, stale lock recovery correctness, and failure semantics for parallel runs. | Tech Spec must specify state file path (e.g., `.git/executor-state.json`), lock file path (e.g., `.git/executor.lock`), stale-lock timeout (if any) with clear evidence of inactivity before override, and explicit policy: integration failures stop new starts; no automatic retry or abort. |
| OQ-06 | What are the public CLI commands, their exact signatures, configuration source for `maxConcurrency`, exit codes, and the precise boundary between read-only (status, diagnose) and mutative (resume, reconcile, replan) operations? | **Blocks Increment 8.** Determines integration surface and user UX. | Tech Spec must document all CLI commands with exact signatures, default values, and error handling. Specify `maxConcurrency` source (environment variable, config file, CLI flag, or combination). Document all exit codes and their meanings. Make clear which commands are read-only vs. mutative. |

---

**Document generated:** 2026-09-09  
**Source:** `internal_docs/features/FTR-018-deterministic-task-execution-checkpoints-and-resume/feature.md`  
**Requirements Status:** Ready for stakeholder review and development handoff.
