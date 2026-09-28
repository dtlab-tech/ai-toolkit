# Deterministic Task Execution, Checkpoints and Resume

## Feature ID
FTR-018

## Summary
The current `pm-phase3` workflow groups tasks by agent type and executes them in waves per
phase, embedding LLM calls for operations that are inherently deterministic. A shutdown mid-run
leaves work and telemetry unreconciled; phase-level commits and ledger entries exist but do not
provide a per-task checkpoint or reconciliation protocol, so recovery requires re-executing tasks
that may already be partially complete. FTR-018 makes the
**task** the indivisible unit of scheduling, agent dispatch, verification, checkpoint, and
recovery. A single deterministic Node.js module owns the full lifecycle — plan parsing,
scheduling, lock acquisition, agent dispatch, verification coordination, commit sequencing,
ledger recording, and reconciliation — while implementation and review agents remain focused
exclusively on their evaluation work. The feature delivers sequential execution
(`maxConcurrency: 1`) first, then truly isolated parallel execution (`maxConcurrency: N > 1`),
both with atomic per-task commits, checkpointing, and resume from persisted evidence. The
runtime bridge between Node.js and the Claude workflow runtime is treated as an open technical
question to be proven by a mandatory spike before any implementation begins. The feature does
not include Codex/Copilot operational adapters, automatic pushes or merges, remote backups,
LLM memory recovery, automatic conflict resolution, or any general architectural rework
(reserved for FTR-019). The 1.0.0 release is not an automatic consequence of FTR-018 closing.

## Problem Statement
`pm-phase3` contains `buildGroups(tasks)`, which groups tasks by `agent_type`, and
`executePhase(implPhase)`, which executes `impl_groups → test_groups → review → rework →
commit` per wave/phase. This means:

- Multiple tasks are bundled into a single agent invocation, making individual task attribution
  of telemetry, timing, and outcomes impossible.
- Deterministic operations (scheduling, sequencing, staging, commit) are delegated to or
  interleaved with LLM invocations, introducing non-determinism where none is required.
- A shutdown at any point leaves no per-task checkpoint or reconciliation protocol. Phase-level
  commits and ledger entries exist but do not reliably identify which individual tasks completed
  and which have partial work that is safe to resume. In practice, the next run re-executes
  tasks that may already have been fully or partially done.
- Partial commits, uncommitted diffs, and unregistered ledger entries accumulate without a
  defined reconciliation protocol.

The required outcome: one implementation agent invocation per task per attempt; scheduling,
transitions, locks, persistence, staging, commit, and reconciliation owned entirely by
deterministic Node.js code; resume driven by verified persisted evidence, not chat memory or
re-execution of completed work.

## Actors
N/A — internal/technical feature

## Core Flow (Happy Path)

This feature is delivered in nine ordered implementation increments. Each increment is
decomposed in the Work Breakdown into tasks with a single verifiable output. The increments
must be implemented and verified in sequence; no increment may be presumed complete before its
acceptance criteria pass.

### Increment 1 — Baseline verification and runtime bridge spike

The executor cannot be implemented without knowing which mechanism is available to bridge
Node.js and the Claude workflow runtime. This increment is split into two parts.

**Pre-Gate 1 — feasibility proof (limited, authorized):**

1. Read and record the exact branch, SHA, and package version of the baseline (FTR-014,
   FTR-015, FTR-016, FTR-017 contracts, `pm-phase3.js` current state).
2. Implement and run a minimal, scoped spike: real dispatch, result capture, telemetry, and
   cancellation through a mechanism confirmed to be available in the runtime. The spike is
   limited to feasibility evidence only and does not produce production code. If the spike
   requires real executions or changes not yet authorized under the current gate, specific
   authorization must be requested before proceeding — no bypass of gate approvals.
3. If no supported bridge is found, stop with documented evidence and a required decision.
   No silent fallback to `project-manager` or the old `pm-phase3` path is permitted.
4. The spike outcome closes OQ-01 and is a prerequisite for Gate 1 approval.

**Post-Gate 2 — productive implementation:**

5. Verify `lib/agent-registry.js` `resolveAgent` contract and `nativeName` resolution before
   every dispatch — this is a non-negotiable FTR-017 carry-over.
6. Implement the production dispatch bridge, result capture, telemetry, and cancellation
   mechanism using the approach proven in the spike.

### Increment 2 — Approved-plan parser and pure scheduler

1. Parse the approved Work Breakdown from existing deliverables: the Markdown document and the
   current pipe-separated CSV. No `Work-Breakdown.json` file is introduced as a required or
   LLM-regeneratable format.
2. Normalize tasks, outcomes, dependencies, and verifications deterministically in memory.
3. Validate before any mutation: task/ID uniqueness, DAG acyclicity, field completeness,
   parity between Markdown and CSV.
4. Compute a stable, documented ordering of ready tasks (all dependencies satisfied by
   integrated checkpoints or explicitly verified skips).
5. If a persisted plan snapshot is needed for resume, derive it from the approved documents,
   bind it with a content digest, and make it read-only — not a separately editable source.
6. Verify Gate 1 and Gate 2 approval and identify the exact repository, feature, and approved
   plan before any state mutation.

### Increment 3 — Persistent protocol, backward-compatible ledger, lock, and read-only diagnostics

1. Define the executor's internal state protocol: fields, transitions, atomic write semantics,
   and flush requirements. Position the state file relative to commits and the central writer.
2. Extend the execution ledger (FTR-016/017 contract) backward-compatibly. Map task/attempt
   lifecycle transitions onto existing `open`/`close`/`fail`/`skip` operations. Define and
   document a migration if schema changes are required; no operation may be non-idempotent.
3. Implement exclusive lock acquisition and release. The lock must be held against a second
   instance of the toolkit. Stale lock recovery requires confirmed evidence that the previous
   owner is no longer active; no automatic override on timeout alone.
4. Implement read-only status reporting: the `status` command inspects persisted state and
   reports it without mutation.
5. Before dispatch, persist and re-read: run identity, task identity, attempt identity, base
   SHA, plan reference, worker identity, and initial state. If persistence fails, the agent is
   not invoked.

### Increment 4 — Sequential task execution with verifications, review, and telemetry

1. For each ready task (dependency-satisfied, not checkpointed): acquire lock, open ledger
   entry, resolve agent `nativeName` via `agents resolve --require-verified`, dispatch one
   implementation agent invocation.
2. As soon as the agent returns: persist implementation outcome and measures before starting
   verifications or review. Token values unknown at this point are `null` with a stated reason;
   `0` only when the value is known to be zero. Separate elapsed time from active time; do not
   attribute shutdown duration to agent work. For concurrent attempts, use individually
   observable measurements per attempt; do not derive per-attempt deltas from a global total
   — if individual measurement is not possible, record `null` with a stated reason.
3. Run targeted verifications; persist verification outcome before proceeding to review.
4. Run targeted review; persist review outcome before the checkpoint sequence.
5. Preserve every attempt record, including failed and reworked attempts.
6. Default retry policy: one initial attempt, one automatic rework; after both, stop and
   propose a replan. Recovery of an already-created commit is not a new implementation attempt.
7. Cooperative stop: accept a stop signal, complete no new dispatches, consolidate received
   results. Immediate stop/interrupt: preserve files, record attempt as interrupted.
8. A process already active is never duplicated by a resume.

### Increment 5 — Controlled commit and commit/ledger window reconciliation

Commit sequence per task:

1. Implementation complete, verifications pass, review complete with no open blocking findings.
2. Persist checkpoint-prepared state (intenzione + required references) before the commit.
3. Controlled staging: only files attributable to this task. No `git add .`, no foreign
   modifications, no stash, no reset/clean, no force push.
4. Commit with task identity, run/attempt identity, and plan reference in a correlatable form.
5. Persist the resulting SHA after the commit. The SHA cannot be embedded in the commit itself;
   the Tech Spec must define a durable post-commit registration path that avoids recursive
   commits and does not leave the working tree in a permanently ambiguous state.
6. Close the ledger entry only after the SHA is registered.

Reconciliation: do not trust commit trailers alone. Verify identity, base/ancestry,
reachability on the correct branch, plan reference, and expected content. Commit hook failure
means no task concluded; duplicate commits or conflicting evidence cause a stop, not an
arbitrary choice.

At startup, classify separately: pipeline-permitted artifacts and user modifications. User
modifications require a stop, not automatic cleanup.

### Increment 6 — Stop, resume, retry, and authorized replan

1. `resume` / `reconcile` commands are mutative, explicitly invoked, and idempotent.
2. Resume behavior follows the evidence table in Edge Cases and Error Scenarios; no scenario
   re-implements a task with a valid integrated checkpoint.
3. Partial worktrees and unintegrated commits are preserved, not cleaned up.
4. Plan or configuration modification during a run: stop with a reconciliation prompt. Replan
   requires a new approval cycle; history is preserved.
5. No resume may depend on the chat transcript.
6. Cleanup covers only resources created by the current run, already integrated and confirmed;
   never forced removal of unintegrated work.

### Increment 7 — Isolated worktrees and N-limit, serial integration, concurrent recovery

1. For `maxConcurrency: N > 1`: each attempt runs in its own isolated worktree on its own
   technical branch. No two workers share a worktree.
2. At most N attempts are concurrent. One coordinator writes shared state and integrates
   commits in a stable serial sequence.
3. A parallel task does not unblock its dependents before integration is verified on the
   feature branch. Record original SHA and integrated SHA separately.
4. Integration conflicts or failures stop new starts and preserve all work/branches. No
   automatic resolution or discard.
5. Build outputs and shared test resources are either isolated per worktree or serialized.
   Worktree isolation does not by itself sandbox writes outside the assigned worktree; limits
   must be explicitly stated and tested.
6. Concurrent token attribution: deltas from overlapping attempts are not summed into a single
   global delta.

### Increment 8 — Integration into implement-feature, distribution, and documentation

1. Replace the `pm-phase3` grouping/wave path with the new executor in the official
   `implement-feature` pipeline.
2. Update `bin/cli.js`, the installer, and the asset catalog so that the executor module and
   associated CLI commands are distributed in local and global installs.
3. Test files, fixtures, and temporary directories are never distributed.
4. Document the bootstrap path: how FTR-018 itself is executed given that the new executor
   is not yet available during its own delivery.
5. Document public commands, configuration options, exit codes, and the read-only vs mutative
   behavioral contract.

### Increment 9 — End-to-end testing with fault injection and a real feature

1. Run a controlled end-to-end test with a real feature (not a synthetic fixture) and the
   official Claude implement-feature path.
2. Apply fault injection at each checkpoint boundary: before/after dispatch, before/after
   verification, before/after checkpoint-prepared, before/after commit, before/after final
   write. Verify no false completions and no loss of work present on disk at the fault point.
3. Document any token limits, cancellation behavior, or runtime bridge constraints encountered.
   No constraint may be hidden by LLM-free mocks that would pass in CI but fail with a real
   runtime.
4. This increment is a prerequisite for the FTR-019 architectural review.

## Out of Scope

- Codex and GitHub Copilot operational adapters (contractual interfaces and fixtures are in
  scope for the runtime bridge spike; working adapters are not).
- Full adoption of the new executor in the assessment pipeline, except changes strictly
  required for compatibility.
- Automatic push to remote, merge of branches, release publication, or approval of gates.
- Remote backup or recovery from disk loss.
- LLM context or memory recovery.
- Automatic conflict resolution or automatic discard of unintegrated work.
- v2 multiplatform reorganization (deferred to a later release after FTR-019 and 1.0.0
  collaudo).
- General architectural rework or refactoring of existing modules beyond what FTR-018 requires
  (reserved for FTR-019).
- Introduction of `Work-Breakdown.json` as a mandatory or LLM-regeneratable format.
- Hierarchical configuration system (only the explicit `maxConcurrency` source defined in
  Tech Spec is in scope).
- The 1.0.0 release (not an automatic bump at FTR-018 close).

## Edge Cases and Error Scenarios

### Resume evidence table

| Evidence at resume | Required behavior |
|--------------------|-------------------|
| Valid checkpoint, integrated | Do not re-implement the task |
| Commit created, final registration missing | Reconcile without new commit or new agent invocation |
| Verifications complete, commit absent | Revalidate evidence; complete checkpoint if verifiably safe |
| Attempt interrupted with partial diff | Preserve diff; verify attribution before resuming |
| Commit present in worktree but not integrated | Resume integration path, not implementation |
| Task concluded but commit missing or unreachable on feature branch | Stop with structured diagnosis |
| Branch/plan changed, foreign diff in worktree, or state corrupted | Stop without data loss |

### Operational error scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| Persistence fails before dispatch | Agent not invoked; run aborted; no partial state written |
| `agents resolve --require-verified` returns non-zero | Dispatch blocked; structured error; pipeline stops |
| Ledger `open` fails before dispatch | Agent not invoked; fail-closed |
| Commit hook failure | Task not concluded; no SHA registered; attempt preserved |
| Plan or config modified during a run | Stop; authorized reconciliation required; no automatic reinterpretation |
| Two coordinators attempt the same task | Lock exclusion; second coordinator stops with diagnosis; no duplicated work |
| Lock stale, previous owner status unknown | No recovery until confirmed evidence of inactivity |
| Integration conflict | Stop new starts; preserve work and branches; no automatic resolution |
| Integration failure (non-conflict) | Stop new starts; preserve work; diagnosis required |
| Unknown metadata key passed to ledger | Rejected before any write; non-zero exit |
| Token count unknown at recording time | Recorded as `null` with stated reason; never `0` |
| State file corrupted or unreadable | Stop non-destructively; no data deleted |
| Runtime bridge not available after spike | Stop with documented evidence; no silent fallback to old pm-phase3 or project-manager |
| A currently active process detected on resume | Not duplicated; resume waits or reports conflict |
| Empty-modification task | Skip with explicit evidence and verifications; no empty commit |

## Data Model
N/A — internal/technical feature (no domain entities created or managed by end users)

The executor introduces internal technical state. Schema, field definitions, atomic write
semantics, flush requirements, and durability guarantees are specified in the Tech Spec. Key
constraints carried from the source:

- If a plan snapshot is persisted for resume, it must be derived from the approved MD/CSV
  documents, bound by a content digest to those documents, and treated as read-only — not a
  second editable source.
- The existing execution ledger (FTR-016/017) is extended backward-compatibly; it is not
  replaced and not duplicated. No second token counter is introduced.
- A technical journal (if introduced) must have distinct ownership and must not duplicate
  ledger activities or actuals.
- `maxConcurrency` accepts only positive integers; the default is 1. Invalid values (zero,
  negative, non-integer, or absent when required) are rejected before any state mutation or
  dispatch. The configured limit is the maximum number of concurrent attempts; it does not
  represent the number of workers momentarily busy. The requested value and the effective value
  are persisted separately; the effective value is never silently reduced below the requested
  value.
- The SHA of a completed task commit and the SHA of its integration commit are recorded
  separately.

## Roles and Permissions
N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | Any Work Breakdown is processed by the new executor | An implementation phase runs | Each task is dispatched to exactly one implementation agent per attempt; no grouping by agent type occurs at dispatch time; each attempt maps to exactly one agent invocation | Must |
| AC-02 | The executor receives a Work Breakdown plan | Scheduling runs | Task ordering is stable, deterministic, and documented; dependencies are satisfied only after a valid integrated checkpoint or an explicitly verified skip; invalid input (non-DAG dependency graph, duplicate task IDs, missing fields, MD/CSV parity mismatch) is rejected with a structured error before any write or dispatch | Must |
| AC-03 | The executor is about to dispatch an implementation agent | Pre-dispatch checks run | Dispatch is blocked and the agent is not invoked if any of the following conditions are not met: (a) ledger identity written and re-read successfully, (b) exclusive lock is held, (c) agent provenance passes `agents resolve --require-verified` (FTR-017 contract); a structured error is emitted identifying the blocking condition | Must |
| AC-04 | The new executor runs alongside the existing ledger (FTR-016/017) | Any task is recorded | All existing ledger entries and token actuals are preserved and readable by current consumers without modification; no second token counter or parallel ledger is introduced; token values unknown at recording time are persisted as `null` with a stated reason, never as `0` | Must |
| AC-05 | A task implementation and its verifications complete | The checkpoint sequence runs | The task is marked concluded only after: targeted verifications pass, targeted review completes with no open blocking findings, checkpoint-prepared state is persisted and re-read, staging covers only task-attributable files, commit is registered with ancestry verified on the correct branch, and SHA is durably recorded; a no-modification task is skipped with explicit evidence and verifications — no empty commit is created | Must |
| AC-06 | `maxConcurrency` is 1 | Execution runs | Exactly one task is active at a time in the shared worktree; attainment and working-tree index are controlled sequentially with no interleaving between tasks | Must |
| AC-07 | `maxConcurrency` is N > 1 | Execution runs | Each attempt runs in its own isolated worktree on its own branch; at most N attempts are concurrent; no two workers share a worktree; integration of completed attempts is serial and stable; a task's dependents are not unblocked before integration is verified on the feature branch; original SHA and integrated SHA are recorded separately | Must |
| AC-08 | Two instances of the executor run against the same feature simultaneously | Both attempt to take the same task | Exclusive lock exclusion prevents both coordinators from taking the same task; the second coordinator stops with a structured diagnosis and does not duplicate work, commits, or ledger entries | Must |
| AC-09 | Resume is invoked one or more times on the same interrupted run | Each resume invocation | No agent is re-invoked for a task with a valid integrated checkpoint; no duplicate commits or integrations are created; no measurements already persisted are overwritten or duplicated; the command is idempotent across repeated invocations | Must |
| AC-10 | Fault injection is applied at each checkpoint boundary: before/after dispatch, before/after verification, before/after checkpoint-prepared, before/after commit, and before/after final write | Each fault point is exercised | No task is falsely marked complete after a fault; work present on disk at the fault point is preserved; the executor can resume from surviving persisted state; no persisted measurement is lost | Must |
| AC-11 | Recovery runs after: (a) parallel commits not yet integrated, (b) a stale lock from a confirmed-inactive coordinator, (c) an integration conflict | Each recovery scenario | Work and branches are preserved; stale locks are recovered only after confirmed evidence of owner inactivity; conflicts stop new starts without automatic resolution or discard of any branch | Must |
| AC-12 | At startup, the executor detects: (a) corrupted or unreadable state, (b) plan change since the last recorded run state, or (c) foreign file modifications in the working tree | Any of these conditions is present | The executor stops non-destructively with a structured diagnostic; no data is deleted, overwritten, or silently discarded; plan or configuration modification during a run requires an authorized reconciliation and re-approval cycle before the run continues | Must |
| AC-13 | The test suite runs | Any test executes | Tests use real executor module code, a temporary Git repository initialized for the test, and stub/fake worker implementations accessed through the same public interface as real agents; the scheduler is not re-implemented inside the tests; no test reads from or writes to the real user home directory, the real global toolkit installation, or real user Git configuration | Must |
| AC-14 | The toolkit is installed locally or globally | The installed payload is inspected | The executor module and its associated CLI commands are present; test files, fixtures, and temporary directories created during testing are absent from the distributed payload | Must |
| AC-15 | FTR-018 is complete and ready for FTR-019 review | A manual verification run is performed on the official implement-feature path | At least one end-to-end controlled run with a real feature and the real Claude runtime is documented; any token limits, cancellation constraints, or runtime bridge limitations encountered are explicitly declared in the documentation; no constraint is concealed by LLM-free mocks that pass in CI but would fail with the real runtime | Must |
| AC-16 | The new executor runs any task to completion or stop | Execution concludes | No automatic push to a remote repository, no merge of a pull request or of any branch into develop or main, no release publication, and no approval of any gate is performed; controlled technical integration of worktree commits into the feature branch per the approved checkpoint protocol (Increment 7) is explicitly permitted; all other cross-branch actions remain exclusively under user control | Must |

## MVP vs Deferred

### MVP (must ship in FTR-018)

- Increment 1: baseline verification, runtime bridge spike with real dispatch/result/telemetry,
  stop if bridge is unavailable.
- Increment 2: approved-plan parser (MD + CSV), pure in-memory scheduler with deterministic
  ordering, Gate validation, plan snapshot bound by digest.
- Increment 3: persistent executor state protocol, backward-compatible ledger extension,
  exclusive lock with stale-lock recovery, read-only status command.
- Increment 4: sequential single-task dispatch with targeted verifications, review, telemetry,
  and retry/rework policy (initial attempt + one rework; then stop).
- Increment 5: controlled commit sequence, post-commit SHA registration, commit/ledger
  reconciliation, startup classification of pipeline artifacts vs user modifications.
- Increment 6: stop/resume/reconcile commands (mutative, explicit, idempotent), evidence-driven
  resume behavior per the edge-cases table, no-cleanup-of-unintegrated-work invariant.
- Increment 7: isolated worktrees for `maxConcurrency: N > 1`, serial integration, concurrent
  recovery, build/test resource isolation or serialization.
- Increment 8: integration into the official `implement-feature` pipeline path, distribution
  via installer, CLI documentation.
- Increment 9: end-to-end test with fault injection and a real feature; prerequisite for
  FTR-019.

### Deferred (explicitly later)

- FTR-019: architectural review, consolidation, and approved refactoring.
- 1.0.0 release collaudo (follows FTR-019, not automatic at FTR-018 close).
- v2 multiplatform migration.
- Full Codex and Copilot operational adapters (runtime bridge spike may produce interface
  contracts; working adapters are not in scope).
- Full adoption of the new executor in the assessment pipeline (`am-phase1.js`, `am-phase2.js`).
- Hierarchical or project-level configuration system beyond the `maxConcurrency` source
  defined in Tech Spec.
- Automated plan repair or consumer-project update tooling.

## Open Questions

The following decisions are open and must be closed by the Tech Spec before Gate 1.
They must not be delegated to developer agents during implementation and must not be
resolved by inventing new runtime capabilities.

| # | Question | Impact |
|---|----------|--------|
| OQ-01 | Which mechanism is actually supported for bridging Node.js and the Claude workflow runtime? What are the supported dispatch, result-capture, and cancellation APIs? Are there observable constraints on token usage or invocation timing? | Must be answered by a limited, authorized feasibility spike before Gate 1; productive implementation proceeds only after Gate 2. If the spike requires real executions or changes not yet authorized, specific authorization must be requested — no bypass of gate approvals. If no supported mechanism is found, the entire executor design must be revisited before Gate 1. |
| OQ-02 | What is the schema of the executor's internal state protocol? Which fields are required? What atomic-write and flush guarantees are achievable on Windows and Linux? Does a rename-based atomic write provide sufficient durability guarantees for this use case, or is additional journaling required? | Blocks Increment 3; drives durability and resume correctness |
| OQ-03 | How are task/attempt lifecycle transitions mapped onto FTR-016/017 ledger `open`/`close`/`fail`/`skip` operations? Is a migration of the ledger schema needed? If so, what backward-compatible migration path ensures existing consumers continue to work? | Blocks Increment 3; must not break FTR-016/017 consumers |
| OQ-04 | How is the approved plan parsed losslessly from MD and CSV? What is the canonical identity of the plan snapshot, and how is it verifiably bound (via content digest) to the approved Markdown and CSV documents? | Blocks Increment 2; determines resume safety and replan detection |
| OQ-05 | Where is the executor state file positioned relative to commits and the central writer? What is the lock file format and location? How is stale-lock detection implemented without false positives? What is the policy for integration failure (stop new starts vs. abort current run)? | Blocks Increment 3; drives concurrent coordinator safety |
| OQ-06 | What are the public CLI commands, their exact signatures, configuration source for `maxConcurrency`, exit codes, and the precise boundary between read-only (status, diagnose) and mutative (resume, reconcile, replan) operations? | Blocks Increment 8; determines the integration surface into `implement-feature` |

## Dependencies and Assumptions

- **FTR-014 (available):** Work Breakdown tasks, dependencies, and verifications are defined
  in the approved Work Breakdown artifact (Markdown + pipe-separated CSV). The CSV column
  format (`phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type`)
  is stable. FTR-018 reads these deliverables as-is; it does not introduce a new mandatory
  format.

- **FTR-015 (available):** `lib/asset-catalog.js`, `resolveClaudeRuntimeAsset()`, the manifest
  written by `writeManifest()`, and `installationMode` (`"local" | "global"`) are present and
  stable. The installer and distribution mechanism are used by Increment 8.

- **FTR-016 (available, commit df54a91):** `lib/execution-ledger.js` and the `ai-toolkit
  ledger open|close|fail|skip` CLI facade are stable. FTR-018 extends the ledger
  backward-compatibly; no second counter is introduced and no ledger entry is overwritten.

- **FTR-017 (available, branch develop, HEAD 5e4e64d, all 15 agents renamed to `gaia-*`):**
  `lib/agent-registry.js` with `resolveAgent({ projectDir, agentId, platform, requireVerified })`
  returning a resolution record (`agentId`, `platform`, `nativeName`, `scope`, `path`,
  `toolkitVersion`, `manifestPath`, `sha256`, `status`) and `validateAgentSet()` /
  `listRegisteredAgents()` are present. `resolveAgent` is not importable from workflow `.js`
  files (no `require` in the Claude workflow runtime); it must be invoked via `ai-toolkit
  agents resolve --require-verified`. FTR-018 preserves this contract unconditionally. The
  verified `nativeName` is the only identity passed to the dispatch mechanism.

- **Runtime bridge:** The mechanism for dispatching a Claude agent from a Node.js module and
  capturing its result, telemetry, and cancellation signal is **not confirmed** as of the
  definition date (2026-09-09). It is the primary subject of Increment 1. If no supported
  mechanism is found, no further increment proceeds without a documented decision from the
  user.

- **`pm-phase3.js` state:** The file exists at `src/claude/workflows/pm-phase3.js` and
  contains `buildGroups(tasks)` and `executePhase(implPhase)`. It is the target being
  replaced; it is not used as the bootstrap executor for FTR-018 itself. The bootstrap path
  for delivering FTR-018 must be documented in the Tech Spec.

- **`package.json` version 0.12.0:** Recorded as the observed baseline. It does not imply
  a released version; the Tech Spec must record the exact branch, SHA, and version before
  implementation begins. No version bump or realignment is implied by this feature.

- **`npm test` is the verification command** after any change. No separate compile step.
  Tests in `tests/cli/` and `tests/frontmatter/` run automatically against new or modified
  files; new pure functions in `bin/cli.js` must be exported via the `require.main` guard
  and covered by a unit test.

- **No LLM in scheduling, transitions, or checkpoint logic.** The executor module is pure
  Node.js. LLM invocations are exclusively for implementation and review agents.
