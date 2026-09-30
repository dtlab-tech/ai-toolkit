# Historical snapshot — Technical Specification (superseded 2026-09-20)

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-018: Deterministic Task Execution, Checkpoints and Resume |
| Version | 1.0 |
| Date | 2026-09-10 |
| Status | Draft |

---

## 1. Overview

FTR-018 replaces the current `pm-phase3` wave-based task grouping and execution model with a deterministic, per-task scheduler and executor. The new executor:

- Makes **the task** the indivisible unit of scheduling, dispatch, verification, checkpoint, and recovery
- Owns the **complete lifecycle** deterministically in pure Node.js: parsing, scheduling, lock acquisition, agent dispatch, verification coordination, commit sequencing, ledger recording, and reconciliation
- Delegates **LLM invocations exclusively** to implementation and review agents
- Provides **atomic per-task commits** with durable post-commit SHA registration and reconciliation
- Supports **sequential execution** (`maxConcurrency: 1`) with single worktree, and **parallel execution** (`maxConcurrency: N > 1`) with isolated worktrees, serial integration, and concurrent recovery
- Enables **resume from persisted evidence** without re-executing completed tasks or duplicating commits

The executor is a deterministic Node.js module (accessed via CLI facade and workflow scripts) that bridges the gap between the Claude workflow runtime and the feature delivery pipeline. It does not replace the FTR-016/017 ledger; instead, it extends it backward-compatibly by mapping per-task/attempt lifecycle transitions onto existing `open`/`close`/`fail`/`skip` operations.

**Systems affected:**
- Feature implementation pipeline (`implement-feature` skill)
- Task scheduling and execution lifecycle
- Ledger telemetry recording (FTR-016/017)
- Agent resolution and dispatch (FTR-017)
- Work Breakdown parsing and interpretation (FTR-014)
- Git worktree and commit management (local only)

---

## 2. Architecture

### 2.1 System Context

```
┌───────────────────────────────────────────────────────────────────┐
│ implement-feature skill (CLI / main loop)                         │
│  ├─ pm-phase1 (planning, workflow)                                │
│  ├─ pm-phase2 (work breakdown, workflow)                          │
│  └─ ai-toolkit executor start [args]   ← direct CLI, NOT workflow │
└──────────────────────────────────┬───────────────────────────────┘
                                   │ spawns subprocess per task
                                   ▼
   ┌───────────────────────────────────────────────────────┐
   │ Executor Core (pure Node.js module)                   │
   │  ├─ lib/task-executor.js (main orchestrator)          │
   │  ├─ lib/plan-parser.js (MD + CSV → normalized plan)   │
   │  ├─ lib/task-scheduler.js (DAG + dependency logic)    │
   │  ├─ lib/lock-manager.js (exclusive access)            │
   │  ├─ lib/state-manager.js (durable task state)         │
   │  ├─ lib/commit-handler.js (staging, commit, SHA)      │
   │  └─ lib/resume-reconciler.js (evidence-driven resume) │
   └──────────┬──────────────────────────────────────────┘
              │
              ├─ Uses (via CLI facade, not direct require):
              │  ├─ lib/agent-registry.js (FTR-017: agents resolve --require-verified)
              │  ├─ lib/execution-ledger.js (FTR-016: ledger open/close/fail/skip)
              │  ├─ lib/asset-catalog.js (FTR-015: asset resolution)
              │  └─ lib/plan-parser.js (FTR-014 format understanding)
              │
              └─ Operates on:
                 ├─ Local Git repository (worktree, branches, commits)
                 ├─ Feature directory (feature.md, Work-Breakdown.md/.csv)
                 ├─ Persisted state file (.git/executor-state.json)
                 ├─ Exclusive lock file (.git/executor.lock)
                 └─ Token ledger (feature-dir/{PREFIX}-token-ledger.json)
```

### 2.2 Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                   task-executor.js (workflow)                    │
│                   (invoked by implement-feature)                │
└──────────────────┬────────────────────────────────────────────┘
                   │
          ┌────────┴────────┬─────────────────┬──────────────┐
          ▼                 ▼                 ▼              ▼
    ┌──────────────┐ ┌──────────────┐ ┌────────────┐ ┌───────────┐
    │plan-parser   │ │task-scheduler│ │lock-manager│ │state-mgr  │
    ├──────────────┤ ├──────────────┤ ├────────────┤ ├───────────┤
    │Parse MD+CSV  │ │DAG ordering  │ │Exclusive   │ │Durable    │
    │Validate      │ │Dependency    │ │access      │ │writes     │
    │Normalize     │ │Ready tasks   │ │Stale lock  │ │Checkpoints│
    │Bind digest   │ │Priority      │ │recovery    │ │Attempt    │
    └──────────────┘ └──────────────┘ └────────────┘ │records    │
                                                      └───────────┘
          │                 │                 │              │
          └────────┬────────┴─────────────────┴──────────────┘
                   ▼
    ┌─────────────────────────────────────────────────────────┐
    │              commit-handler.js                          │
    │  ┌──────────────────────────────────────────────────┐   │
    │  │ Controlled staging → commit → SHA register      │   │
    │  │ Verify ancestry on target branch                │   │
    │  │ Reconcile commit/ledger window                  │   │
    │  └──────────────────────────────────────────────────┘   │
    └─────────────────────────────────────────────────────────┘
          │
          └───────┬──────────┬─────────────┬────────────┐
                  ▼          ▼             ▼            ▼
          ┌────────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐
          │agent-reg   │ │ledger   │ │worktree  │ │Git ops   │
          │(CLI facade)│ │(CLI)    │ │isolation │ │(local)   │
          └────────────┘ └─────────┘ └──────────┘ └──────────┘
```

### 2.3 Task Lifecycle State Machine

```
    START
      │
      ▼
  ┌─────────────┐
  │   PENDING   │  (ready, dependencies satisfied, not yet dispatched)
  └──────┬──────┘
         │
         ├─ (pre-dispatch checks fail)
         └──────────────────────┐
                                ▼
                          ┌──────────────┐
                          │   BLOCKED    │  (dispatch blocked; no attempt)
                          └──────────────┘
         │
         │ (pre-dispatch checks pass)
         ▼
  ┌────────────────────────┐
  │   DISPATCHED           │  (agent invoked, waiting for result)
  └──────┬─────────────────┘
         │
         ├─────────┬─────────┬─────────────────────┐
         │         │         │                     │
    (agent │   (timeout) (error) (success)        │
    success│         │         │          (interrupted)
    only)  │         │         │                   │
         ▼         ▼         ▼                    ▼
  ┌──────────┐ ┌──────┐ ┌─────────┐         ┌─────────────┐
  │ IMPL_    │ │FAILED│ │FAILED   │         │INTERRUPTED  │
  │COMPLETE  │ └──────┘ └─────────┘         └─────────────┘
  └────┬─────┘  (no retry)  │
       │                    │
       ▼                    │ (on resume: check evidence, rework if allowed)
  ┌─────────────┐           │
  │VERIFICATION_│ ◄─────────┘
  │COMPLETE     │
  └────┬────────┘
       │
       ├─ (verifications fail, rework allowed)
       │  └─────────────────────────────┐
       │                                │
       │  (rework cycle ≤ 2)            │
       │  └────────────────────┐        │
       │                       ▼        │
       │                 (re-dispatch) ─┘
       │
       ├─ (verifications fail, no rework)
       │  └─────────────────────────────┐
       │                                ▼
       │                          ┌──────────────┐
       │                          │   STOPPED    │  (needs manual reconciliation)
       │                          └──────────────┘
       │
       ▼
  ┌──────────────┐
  │ REVIEW_      │
  │ COMPLETE     │
  └────┬─────────┘
       │
       ├─ (review has blocking findings)
       │  └─────────────────────────────┐
       │                                ▼
       │                          ┌──────────────┐
       │                          │   BLOCKED    │  (cannot commit)
       │                          └──────────────┘
       │
       ▼
  ┌──────────────────┐
  │ CHECKPOINT_      │  (pre-commit state persisted, re-read for durability)
  │ PREPARED         │
  └────┬─────────────┘
       │
       ├─ (commit fails, hook error)
       │  └────────────────────────────────┐
       │                                   ▼
       │                             ┌──────────────┐
       │                             │   FAILED     │
       │                             └──────────────┘
       │
       ▼
  ┌──────────────┐
  │ COMMITTED    │  (commit created, SHA extracted)
  └────┬─────────┘
       │
       ▼
  ┌──────────────┐
  │ SHA_         │  (SHA registered in state, ledger entry closed)
  │ REGISTERED   │
  └────┬─────────┘
       │
       ├─ (sequential: move to next task)
       │
       ├─ (parallel: coordinator integrates this attempt)
       └────────────┐
                    ▼
              ┌──────────────┐
              │ INTEGRATED   │  (commit merged onto feature branch, verified)
              └──────────────┘
                    │
                    └─ (dependents now ready if this was a blocker)
```

---

## 3. Runtime Bridge Solution (OQ-01 — RESOLVED via Percorso C)

### 3.1 Bridge Mechanism

The pre-Gate 1 feasibility spike (2026-09-17/18) has proven the following mechanism is available and compatible with the current `third_party/foundry` Azure authentication:

**Mechanism:** Node.js coordinator invokes `claude.exe` as a subprocess using `spawnSync` (or `spawn` for long-running tasks), in non-interactive `--print` mode, with structured JSON output and an explicit JSON schema.

**Rejected alternatives:**
- **Percorso A** (`agent()` in workflow sandbox): rejected — the Claude workflow runtime is an isolated ECMAScript sandbox with no access to `process`, `require()`, `import()`, or file system. All I/O would pass through `agent(haiku)` calls, violating the requirement for LLM-free deterministic operations.
- **Percorso B** (new CLI dispatch mechanism): rejected — would require SDK modifications not available in v2.1.260.

### 3.2 API Contract (Percorso C)

```javascript
const { spawnSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');

const CLAUDE = 'C:/Users/.../claude.exe';  // resolved at runtime from PATH or config

const result = spawnSync(
  CLAUDE,
  [
    '--print',                          // non-interactive mode
    '--output-format', 'json',          // structured JSON output
    '--json-schema', JSON.stringify(schema),  // validated response schema
    '--model', agentModel,              // e.g., 'haiku', 'sonnet'
    '--max-budget-usd', budgetUsd,      // e.g., '0.20'
    '--agent', nativeName,              // verified nativeName from FTR-017 resolveAgent
    '--permission-mode', 'auto',
    '--permission-prompts', 'none',
    taskPrompt
  ],
  {
    cwd: worktreeDir,     // isolated worktree directory
    encoding: 'utf8',
    timeout: timeoutMs,   // kills subprocess on timeout (SIGTERM)
    windowsHide: true
  }
);
// On success: result.status === 0
// On timeout: result.status === null, result.error.code === 'ETIMEDOUT', result.signal === 'SIGTERM'
// On budget exhausted: result.status === 1, JSON contains terminal_reason: 'budget_exhausted'
```

**Output structure (parsed from `result.stdout`):**
```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "terminal_reason": "completed",
  "total_cost_usd": 0.033,
  "usage": {
    "input_tokens": 10,
    "cache_creation_input_tokens": 19537,
    "output_tokens": 209
  },
  "modelUsage": {
    "claude-haiku-4-5-...": {
      "inputTokens": 913, "outputTokens": 637,
      "cacheCreationInputTokens": 19537, "thinkingTokens": 321,
      "costUSD": 0.028, "provider": "foundry"
    }
  },
  "structured_output": { /* JSON validated against schema */ },
  "session_id": "<uuid>",
  "duration_ms": 10373
}
```

**Token telemetry:** Available directly from `modelUsage` in the JSON output — no inference from deltas needed. `inputTokens`, `outputTokens`, `cacheCreationInputTokens`, `thinkingTokens` per model.

**Authentication:** Uses existing `third_party/foundry` (Microsoft Azure) OAuth credentials. No new service activation, no `ANTHROPIC_API_KEY` required.

### 3.3 Agent Selection and Verification

1. Resolve agent via FTR-017 `resolveAgent()` → `{ nativeName, sha256, scope, toolkitVersion, path }`
2. Verify definition hash: `sha256(readFileSync(resolved.path)) === resolved.sha256`
3. Pass `--agent {nativeName}` to `claude.exe` — the CLI loads the agent definition from `~/.claude/agents/` or the project's `.claude/agents/`

**Evidence that `--agent` loads the correct definition:**
- Test with `--agent gaia-developer-backend`: `cacheCreationInputTokens` = 19,537 (distinct from default session's 24,918 — confirms a different system prompt was loaded)
- `thinkingTokens: 321` — thinking activated, characteristic of gaia agent frontmatter
- Agent processed the request before budget exhaustion (exit 1 = `budget_exhausted`, not `agent_not_found`)

### 3.4 Cancellation and Timeout Semantics

- **Timeout:** `spawnSync` `timeout` option sends SIGTERM to the subprocess on expiry
- **Verified behavior:** `result.status === null`, `result.error.code === 'ETIMEDOUT'`, `result.signal === 'SIGTERM'` — subprocess is terminated; no orphaned process
- **Executor policy:** Record attempt as `interrupted` if `result.status !== 0` and `result.error.code === 'ETIMEDOUT'`
- **Resume deduplication:** For async dispatch (`spawn`), PID is available from `childProcess.pid` immediately after spawn. Store PID + process start-time in state. On resume, check liveness: `process.kill(pid, 0)` (ESRCH → dead; no error or EPERM → alive). Never dispatch a new worker if the old worker's PID is still alive.

### 3.5 Known Limits (to document in Tech Spec and surface in tests)

| Constraint | Description |
|-----------|-------------|
| `--bare` mode | Requires `ANTHROPIC_API_KEY` — NOT compatible with `third_party/foundry` OAuth. Do not use. |
| Budget | Must be set appropriately per task type (implementation: $0.20–$1.00; review: $0.10–$0.50). `$0.02` is insufficient for real tasks. |
| Agent discovery | `--agent` requires the nativeName to be in `~/.claude/agents/` (global) or the project `.claude/agents/`. FTR-017 `resolveAgent` must run first to obtain the verified nativeName. |
| Sync vs async | `spawnSync` blocks the coordinator for the full task duration. For long-running tasks, use `spawn` (async) and track PID. |
| Windows path | `claude.exe` path must be resolved at runtime from a configured path or `PATH` lookup. Do not hardcode. |

### 3.6 Implications for Executor Architecture

The executor is a **pure Node.js module** with full access to `require()`, `fs`, `child_process`, and all Node.js APIs. It does NOT run inside the Claude workflow sandbox.

**Production operational path (after FTR-018 is complete):**
```
implement-feature skill
  → ai-toolkit executor start --feature-path <path> --max-concurrency N
      (direct CLI call; no workflow; no agent() invocation)
    → for each task: spawnSync/spawn(claude.exe --agent <nativeName> ...)
```

**Bootstrap path for FTR-018 delivery only (while executor does not yet exist):**
```
implement-feature skill → pm-phase1 → pm-phase2 → pm-phase3
  → pm-phase3 dispatches gaia-developer-backend / gaia-developer-frontend
    per task (one task per agent() call, task-by-task, NOT wave grouping)
```

These are two distinct, non-overlapping paths. The bootstrap path (pm-phase3) is used exclusively during FTR-018 delivery. The production path replaces pm-phase3 for all subsequent features.

There is no hybrid path where the production executor is invoked from inside pm-phase3 via `agent(haiku)`. The executor is delivered by pm-phase3; it does not run during its own delivery.

---

## 4. Executor Module Architecture

### 4.1 Core Modules

The executor is implemented across multiple Node.js modules in `lib/` and invoked as a workflow script from Claude Code. The workflow script (`task-executor.js` or equivalent) is the entry point and orchestrates the executor core.

**Module responsibilities:**

| Module | File | Responsibility |
|--------|------|-----------------|
| Main Orchestrator | `src/claude/workflows/task-executor.js` | Entry point; coordinates phases (parse, schedule, lock, execute per task, integrate, finalize) |
| Plan Parser | `lib/task-executor/plan-parser.js` | Parse MD + CSV; validate; compute content digest; bind plan snapshot |
| Task Scheduler | `lib/task-executor/task-scheduler.js` | Topological sort; ready-task computation; deterministic ordering |
| Lock Manager | `lib/task-executor/lock-manager.js` | Exclusive access; stale-lock detection and recovery |
| State Manager | `lib/task-executor/state-manager.js` | Durable state I/O; atomic writes; attempt record tracking |
| Commit Handler | `lib/task-executor/commit-handler.js` | Staging validation; commit creation; post-commit SHA registration |
| Resume Reconciler | `lib/task-executor/resume-reconciler.js` | Evidence-driven resume; idempotency checks; no re-execution logic |
| CLI Facade | `bin/executor-cli.js` | Expose `ai-toolkit executor <command>` (status, resume, reconcile, replan) |

### 4.2 Module Dependencies

```
task-executor.js (workflow entry point)
  ├─ plan-parser.js (parse MD + CSV, no agent calls)
  ├─ task-scheduler.js (DAG processing, no agent calls)
  ├─ lock-manager.js (file I/O, no agent calls)
  ├─ state-manager.js (JSON I/O, atomic writes)
  ├─ commit-handler.js (Git operations, verify ancestry)
  ├─ resume-reconciler.js (evidence inspection)
  │
  ├─ Via CLI facade:
  │  ├─ ai-toolkit agents resolve --require-verified (FTR-017)
  │  ├─ ai-toolkit ledger open|close|fail|skip (FTR-016)
  │  └─ ai-toolkit <other utilities>
  │
  └─ Via spawnSync/spawn(claude.exe) subprocess (Percorso C):
     ├─ Implementation agents (gaia-developer-{backend,frontend,testing})
     ├─ Review agents (gaia-review-solution)
     └─ Verification components (deterministic, no LLM, no subprocess)
```

---

## 5. Internal State Protocol (OQ-02 — CLOSED)

### 5.1 State File Schema

**Location:** `.git/executor-state-{run_id}.json` (or `.git/executor-state.json` for single-run mode)

**Path construction:** Base is `.git/` in the repository root. Lock and state files are co-located to ensure atomic multi-file operations are possible.

**Atomic write semantics:**
- Write to a temporary file: `.git/.executor-state-{run_id}.tmp-{pid}-{timestamp}`
- `fs.fsyncSync()` to ensure data reaches stable storage
- `fs.renameSync()` to atomically replace the target (POSIX rename is atomic; Windows `ReplaceFileW` is used in Node.js for atomic replace)
- If rename fails with EEXIST/EPERM on Windows, delete target and retry (matching FTR-016 ledger pattern)

**Durability guarantee:** Rename-based atomic writes (`fs.renameSync`) provide consistency at the file-system level: either the old file or the new file is visible; no partial writes are observable. This is sufficient for this use case because:
- State writes happen only when a task completes a checkpoint boundary (after commit)
- A crash between commit and state write leaves the commit on disk; resume will detect and reconcile it
- A crash during rename leaves either old or new state; the executor detects stale state and reconciles

**Explicit limits (not promised by this design):**
- Power loss without filesystem journal flush: on some configurations (e.g., ext4 `data=writeback`, network filesystems), a rename may appear to succeed but the data may not reach stable storage before power loss. The executor does NOT add extra `fsync()` calls beyond Node.js defaults; this is an accepted risk on such configurations.
- Concurrent coordinator on a network share: lock file exclusion relies on `open('wx')` being atomic on the underlying filesystem; network filesystems (NFS, SMB) may not provide this guarantee. The executor is designed for local filesystems only.
- Windows atomic replace: `fs.renameSync` on Windows uses `MoveFileEx` with `MOVEFILE_REPLACE_EXISTING`, which is not atomic if the target is on a different volume. The executor requires source and target to be on the same volume (standard for `.git/` temp files).

**Schema version:** `1.0.0` (future migrations increment this)

### 5.2 State File Structure

```json
{
  "state_version": "1.0.0",
  "run_id": "<uuid>",
  "feature_id": "FTR-018",
  "feature_branch": "feature/FTR-018-slug",
  "base_sha": "<git-sha>",
  "created_at": "<ISO-8601>",
  "updated_at": "<ISO-8601>",
  "worker_id": "<hostname-or-coordinator-id>",
  "lock_acquired_at": "<ISO-8601>",
  "max_concurrency": 1,
  "max_concurrency_effective": 1,
  "plan_reference": {
    "plan_digest": "<sha256-hex>",
    "markdown_source": "internal_docs/features/FTR-018-deterministic-task-execution-checkpoints-and-resume/feature.md",
    "csv_source": "internal_docs/features/FTR-018-deterministic-task-execution-checkpoints-and-resume/FTR-018-Work-Breakdown.csv",
    "digest_algorithm": "sha256"
  },
  "plan_snapshot": {
    "version": "1.0.0",
    "tasks": [
      {
        "task_id": "BE-01",
        "phase_id": "Phase1",
        "title": "Implement plan parser",
        "domain": "BE",
        "agent_type": "developer-backend",
        "depends_on": [],
        "worktree_path": null
      }
    ],
    "dependencies": {
      "BE-02": ["BE-01"],
      ...
    },
    "ready_order": ["BE-01", ...]
  },
  "execution_state": {
    "status": "running",
    "phase": "implementation",
    "tasks_completed": 0,
    "tasks_total": 15,
    "tasks": {
      "BE-01": {
        "task_id": "BE-01",
        "status": "integrated",
        "attempts": [
          {
            "attempt_id": "<uuid>",
            "attempt_number": 1,
            "status": "integrated",
            "started_at": "<ISO-8601>",
            "ended_at": "<ISO-8601>",
            "ledger_entry_id": "<operation_id>",
            "implementation_outcome": {
              "success": true,
              "output": "Task completed successfully"
            },
            "implementation_telemetry": {
              "tokens_input": 1500,
              "tokens_output": 800,
              "elapsed_time_ms": 45000,
              "active_time_ms": null,
              "active_time_reason": "Unmeasurable from runtime bridge"
            },
            "verification_outcome": {
              "passed": true,
              "details": "All checks passed"
            },
            "review_outcome": {
              "passed": true,
              "findings": []
            },
            "commit_info": {
              "original_sha": "<git-sha>",
              "integrated_sha": "<git-sha>",
              "commit_timestamp": "<ISO-8601>",
              "commit_message": "feat(FTR-018): implement BE-01\n\nTask: BE-01\nRun: <run_id>\nAttempt: 1"
            },
            "worktree_path": null
          }
        ]
      },
      "BE-02": {
        "task_id": "BE-02",
        "status": "pending",
        "attempts": []
      }
    },
    "task_status_map": {
      "BE-01": "integrated",
      "BE-02": "pending",
      ...
    },
    "integration_sequence": [
      { "task_id": "BE-01", "integrated_at": "<ISO-8601>" },
      ...
    ]
  }
}
```

### 5.3 State Transitions and Checkpoints

**Checkpoint boundaries** (state file written immediately after each, before proceeding):

1. **Pre-dispatch:** Identity, base SHA, plan reference, initial worker_id
2. **Pre-agent dispatch:** Attempt record created, status = `dispatched`, ledger entry opened
3. **Post-implementation:** Implementation outcome and telemetry recorded
4. **Post-verification:** Verification outcome recorded
5. **Post-review:** Review outcome recorded, blocking findings checked
6. **Pre-commit:** Checkpoint-prepared state, intention to commit, staged files list
7. **Post-commit:** Original commit SHA extracted and recorded, commit message stored
8. **Post-SHA-registration:** Integrated SHA recorded (parallel only), ledger closed
9. **Run completion:** Status = `done`, final summary

Each write is atomic (temp file + fsync + rename). A crash leaves either old or new state; resume detects via content digest.

### 5.4 Durability and Recovery

**Power-loss scenario:**
- Crash during run, mid-checkpoint: State file either old or new (never partial)
- Resume reads state, sees incomplete attempt record
- Calls `reconcile` to inspect Git for orphaned commits
- If commit exists on disk: resume integrates (parallel) or marks `committed` (sequential)
- If no commit: resume reruns implementation (respecting retry limits)

**Idempotency:**
- All state reads are defensive (nil coalescing, default values)
- Attempt record is immutable once marked `integrated` (no re-execution)
- Ledger entries are idempotent (open with same operation_id is no-op if metadata matches)

---

## 6. Ledger Mapping (OQ-03 — CLOSED)

### 6.1 Task/Attempt Lifecycle to Ledger Operations

The executor extends the FTR-016/017 ledger without replacing or duplicating it. Each task/attempt lifecycle event maps to a ledger operation.

**Operation ID computation — real signature from `lib/execution-ledger.js`:**
```javascript
// From lib/execution-ledger.js:316
function computeOperationId(prefix, agent, attempt) {
  const input = JSON.stringify([prefix, agent, attempt]);
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 32);
}
```

The executor must use this exact function (imported from `lib/execution-ledger.js`), not any independent hash calculation.

**Ledger agent name convention (distinct identities per activity type):**

| Activity | Ledger `agent` parameter | Purpose |
|----------|--------------------------|---------|
| Implementation attempt N | `{task_id}:implementation:{N}` | One entry per implementation dispatch |
| Rework attempt N | `{task_id}:rework:{N}` | Distinct from implementation; preserves full history |
| Review | `{task_id}:review:{N}` | One entry per review agent invocation |
| No-modification skip | `{task_id}:skip` | Recorded via `ledger skip`; no token cost |

This convention ensures:
- Each activity has a distinct `operation_id` (no collision between implementation and review)
- Re-opening an existing entry is idempotent (same agent + attempt → same operation_id)
- Rework cycles are distinguishable from initial attempts in the ledger history

**One token count per activity, not per run:** Each `close` call records only the tokens from that specific subprocess invocation (from `modelUsage.totalInputTokens + outputTokens`). Global run totals are derived from the ledger; they are NOT stored as a separate entry.

**Lifecycle mapping:**

| Executor event | Ledger operation | `agent` parameter | `attempt` |
|---|---|---|---|
| Implementation dispatch (attempt N) | `open` | `{task_id}:implementation:{N}` | N |
| Implementation complete (commit + SHA) | `close` (with tokens from modelUsage) | `{task_id}:implementation:{N}` | N |
| Implementation interrupted (timeout, crash) | `fail` | `{task_id}:implementation:{N}` | N |
| Rework dispatch (attempt N) | `open` | `{task_id}:rework:{N}` | N |
| Rework complete | `close` | `{task_id}:rework:{N}` | N |
| Review dispatch | `open` | `{task_id}:review:{N}` | N |
| Review complete | `close` | `{task_id}:review:{N}` | N |
| Verification/review fails, no rework | `fail` | current activity agent name | N |
| Task skipped (no-modification) | `skip` | `{task_id}:skip` | 1 |

### 6.2 Ledger Entry Extensions

**No new fields are added to the existing ledger structure.** All executor information is recorded in executor state file; the ledger remains the single source of truth for token telemetry and operation status.

**Metadata fields (optional, on `open`):**
```javascript
metadata = {
  agentId: 'gaia.agent.developer.backend',        // from FTR-017 resolution
  nativeAgentName: 'gaia-developer-backend',       // verified by agents resolve
  platform: 'claude',
  toolkitVersion: '0.13.0+',
  resolutionScope: 'project',
  definitionHash: '<sha256 of agent file>'
}
```

These are validated against the METADATA_WHITELIST in execution-ledger.js; unknown keys are rejected before any write.

### 6.3 Backward Compatibility

**No migration is required** for FTR-016/017 consumers. The ledger schema is unchanged; the executor simply uses the existing `open`/`close`/`fail`/`skip` API to record task lifecycle events.

**Advantage:** Existing tools that read `{PREFIX}-token-ledger.json` continue to work without modification.

**Ledger consumer expectations:**
- Token totals in the ledger come from executor state + ledger records
- Per-task details are in executor state; ledger contains only agent name and token count
- Attempt records with different `operation_id` values (same task, different attempt) represent rework cycles

---

## 7. Plan Parsing and Snapshot (OQ-04 — CLOSED)

### 7.1 Input Format

**Markdown document:** `{PREFIX}-Work-Breakdown.md` (machine-parseable, not informational only)
- Contains: task outcome descriptions, task-level verifications, task-level dependencies (may differ from phase-level CSV)
- **Must be parsed losslessly:** outcome, verifications, and task-level dependencies cannot be discarded
- Parsed sections: `## Phase N — Title`, `### Task {ID}: Title`, outcome bullet, verification checklist, dependency annotations
- If MD and CSV disagree on task-level fields: stop with structured parity error — do not silently prefer either

**CSV document:** `{PREFIX}-Work-Breakdown.csv` (canonical machine-readable source for scheduling)
- Format: pipe-separated (`|`), one task per row
- Columns: `phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type`
- Header row: literal `phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type`
- Blank rows and rows with empty `task_id` are ignored
- Dependencies in `depends_on` are space-separated task IDs (e.g., `"BE-01 BE-02"`), empty string means no dependencies

**Example CSV:**
```
phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type
Phase1|Parser and Scheduler|feat(FTR-018): phase 1|—|BE-01|Implement plan parser|BE|developer-backend
Phase1|Parser and Scheduler|feat(FTR-018): phase 1|BE-01|BE-02|Implement task scheduler|BE|developer-backend
Phase2|State and Commit|feat(FTR-018): phase 2|BE-02|BE-03|Implement state manager|BE|developer-backend
Phase2|State and Commit|feat(FTR-018): phase 2|—|FE-01|Implement UI dashboard|FE|developer-frontend
```

### 7.2 Parsing Algorithm (Deterministic, No LLM)

```javascript
function parsePlan(markdownPath, csvPath, featureId) {
  // 1. Read CSV
  const csvContent = fs.readFileSync(csvPath, 'utf8')
  
  // 2. Parse lines
  const lines = csvContent.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('phase_id'))
  const tasks = lines.map(line => {
    const [phase_id, phase_title, commit_message, depends_on, task_id, task_title, domain, agent_type] = line.split('|')
    return { phase_id, phase_title, commit_message, depends_on: (depends_on || '').split(/\s+/).filter(Boolean), task_id, task_title, domain, agent_type }
  }).filter(t => t.task_id)
  
  // 3. Validate uniqueness
  const taskIds = tasks.map(t => t.task_id)
  if (new Set(taskIds).size !== taskIds.length) {
    throw new Error('DUPLICATE_TASK_ID')
  }
  
  // 4. Validate all agent types are known
  for (const t of tasks) {
    if (!AGENT_TYPES.has(t.agent_type)) {
      throw new Error(`UNKNOWN_AGENT_TYPE: ${t.agent_type}`)
    }
  }
  
  // 5. Build dependency graph
  const taskMap = new Map(tasks.map(t => [t.task_id, t]))
  for (const t of tasks) {
    for (const dep of t.depends_on) {
      if (!taskMap.has(dep)) {
        throw new Error(`UNRESOLVABLE_DEPENDENCY: ${t.task_id} depends on ${dep} which does not exist`)
      }
    }
  }
  
  // 6. Check for cycles (DFS)
  const visited = new Set()
  const stack = new Set()
  
  function hasCycle(taskId) {
    if (visited.has(taskId)) return false
    if (stack.has(taskId)) return true
    stack.add(taskId)
    for (const dep of taskMap.get(taskId).depends_on) {
      if (hasCycle(dep)) return true
    }
    stack.delete(taskId)
    visited.add(taskId)
    return false
  }
  
  for (const t of tasks) {
    if (hasCycle(t.task_id)) throw new Error('CIRCULAR_DEPENDENCY')
  }
  
  // 7. Compute content digest over BOTH sources
  // MD is not informational: it contains outcome, verifications, task-level deps
  const digest = sha256(csvContent + '\n---\n' + markdownContent) // both files
  
  // 8. Topological sort
  const sorted = topologicalSort(tasks)
  
  return {
    featureId,
    planDigest: digest,
    csvSource: csvPath,
    markdownSource: markdownPath,
    tasks,
    readyOrder: sorted,
    taskMap
  }
}

function topologicalSort(tasks) {
  const sorted = []
  const visited = new Set()
  const taskMap = new Map(tasks.map(t => [t.task_id, t]))
  
  function visit(taskId) {
    if (visited.has(taskId)) return
    const task = taskMap.get(taskId)
    for (const dep of task.depends_on) {
      visit(dep)
    }
    visited.add(taskId)
    sorted.push(taskId)
  }
  
  for (const t of tasks) {
    visit(t.task_id)
  }
  
  return sorted
}
```

### 7.3 Plan Snapshot Binding

**Snapshot creation:**
- Computed after validation (cycle check, uniqueness, MD/CSV parity) passes
- Derived from normalized task list, not a separate editable file
- Bound by content digest (SHA-256 of CSV + MD concatenated) to detect changes to either source
- Persisted in executor state for resume (read-only, no direct modification)

**Resume detection:**
- At resume time, recompute digest of current CSV
- If digest differs from stored `plan_reference.plan_digest`: stop and require replan/reapproval
- Do NOT auto-update digest; require user authorization for plan changes

**Snapshot format (in executor state):**
```json
{
  "plan_snapshot": {
    "version": "1.0.0",
    "digest": "<sha256>",
    "tasks": [...],
    "taskMap": {...},
    "readyOrder": [...]
  }
}
```

---

## 8. Lock Protocol and State File Position (OQ-05 — CLOSED)

### 8.1 Lock File Location and Format

**Path:** `.git/executor.lock` (co-located with state file)

**Format:**
```json
{
  "acquired_at": "<ISO-8601>",
  "run_id": "<uuid>",
  "worker_id": "<hostname>:<pid>:<process-start-time-ms>",
  "lock_version": "1.1"
}
```

`worker_id` encodes the coordinator's PID **and** process start-time (from `/proc/[pid]/stat` on Linux or `wmic process` on Windows). The start-time prevents PID recycling attacks: if a new process has reused the old PID but has a different start-time, the lock is stale.

**Acquisition:** `fs.openSync(path, 'wx')` (exclusive create, fail if exists)

**Release:** `fs.unlinkSync(lockPath)`

### 8.2 Stale-Lock Detection

**Detection criteria (liveness check only — no age-based recovery):**

1. **Read lock file:** Extract `worker_id` (format: `hostname:pid:start_time_ms`)
2. **Parse PID and start-time** from `worker_id`
3. **Check process liveness:**
   - `process.kill(pid, 0)`:
     - No error / EPERM → process exists; verify start-time
     - ESRCH → process dead → lock is stale
   - If process exists: compare start-time from OS to stored start-time
     - Start-times match → process is the original owner → lock is live
     - Start-times differ → PID recycled → lock is stale
4. **Hostname check:** If hostname differs from current host, lock cannot be verified locally → stop with structured error; require manual removal

**Age-based recovery is PROHIBITED.** A lock must not be reclaimed based on file modification time alone, regardless of how old the lock file is. If the process cannot be verified (e.g., different host), the operator must manually remove the lock after confirming the previous coordinator is dead.

**Reclaim procedure (ABA-guarded):**
1. Read lock file content and stat → classify: live / stale / unverifiable
2. If stale: re-read and re-stat AGAIN (ABA guard)
3. If content AND stat are identical between reads: safe to unlink
4. If content or stat changed: another process refreshed lock; treat as live and wait
5. If unverifiable (different host): stop with error message identifying the lock owner; do not reclaim

**Wait timeout:** Default 5 seconds (deadlineMs parameter in lock acquisition); report conflict after timeout, do not force-reclaim.

### 8.2.1 Git Path Resolution in Worktrees

In a Git worktree (created via `git worktree add`), `.git` is a **file** (not a directory) containing a pointer to the main repository's `.git` directory:
```
# In a worktree: .git is a regular file
gitdir: /path/to/main/repo/.git/worktrees/attempt-1
```

The executor must resolve the true `.git` directory before writing state or lock files:
```javascript
function resolveGitDir(worktreePath) {
  const gitPath = path.join(worktreePath, '.git');
  const stat = fs.statSync(gitPath);
  if (stat.isFile()) {
    // In a worktree: read the gitdir pointer
    const content = fs.readFileSync(gitPath, 'utf8');
    const match = content.match(/^gitdir:\s*(.+)$/m);
    if (!match) throw new Error('Invalid .git file format');
    return path.resolve(worktreePath, match[1].trim());
  }
  return gitPath; // Normal repo: .git is a directory
}
```

State and lock files are always written to the **main repository's `.git/` directory**, not the worktree's `.git` file path.

### 8.3 State File Position

**Path:** `.git/executor-state-{run_id}.json`

**Relationship to commits:**
- Base SHA is recorded at executor init: `git rev-parse HEAD`
- Each task commit is created on the feature branch: `feature/FTR-NNN-slug`
- After commit, executor reads the new HEAD SHA and records in state
- State file is never committed (its path is in `.gitignore`)
- Resume inspects state file and `.git` commit log to reconcile

**Why .git/ directory:**
- Central location for run metadata
- Not versioned, so state files don't pollute feature branch
- Stable across branch switches (work happens on feature branch; state stays in .git/)
- Convenient for lock + state file co-location

### 8.4 Integration Failure Policy

**Policy:** On integration failure, **stop new starts; preserve all work and branches.**

**Behavior:**
- If merge/integration fails, mark run as `paused` (not `done` or `failed`)
- Do NOT retry automatically
- Do NOT rebase or force-push
- Write diagnostic to state file: which commit failed to integrate, why
- User must manually inspect, resolve, and invoke `reconcile` or `replan`

**Rationale:** Automatic conflict resolution could silently lose work. Manual inspection ensures user awareness.

---

## 9. CLI Commands (OQ-06 — CLOSED)

### 9.1 Command Overview

All commands are invoked as `ai-toolkit executor <command>` and access persisted state in `.git/executor-state-{run_id}.json`.

**Command categories:**
- **Read-only:** `status`, `diagnose`
- **Mutative:** `resume`, `reconcile`, `replan`

### 9.2 `status` (Read-Only)

**Purpose:** Inspect persisted run state without mutation

**Signature:**
```
ai-toolkit executor status [--run-id <uuid>] [--verbose]
```

**Behavior:**
1. Read `.git/executor-state-{run_id}.json`
2. List all tasks and their current status
3. Show integrated vs. pending commits
4. Show lock status and owner
5. Show ledger summary (tokens, agents)

**Output:**
```
Feature: FTR-018
Run ID: <uuid>
Status: running
Phase: implementation

Tasks:
  BE-01: integrated (attempt 1, SHA <sha>)
  BE-02: pending
  BE-03: failed (attempt 1, rework not allowed)
  FE-01: pending

Lock:
  Held by: coordinator-1 (pid <pid>)
  Acquired: 2026-09-10T14:30:00Z
  Age: 15m 42s

Ledger:
  Entries: 3
  Tokens (phase delta): 4200
```

**Exit code:** 0 (success), 1 (read error), 4 (state corrupted)

### 9.3 `resume` (Mutative, Idempotent)

**Purpose:** Resume a stopped or interrupted run

**Signature:**
```
ai-toolkit executor resume [--run-id <uuid>] [--force-continue]
```

**Behavior:**
1. Read persisted state
2. Check for active lock (if held by another process, report conflict)
3. Classify worktree artifacts:
   - Pipeline-permitted: committed, staged, known to executor
   - User modifications: foreign diffs, uncommitted changes outside executor's work
4. If user modifications: stop with reconciliation prompt; require manual decision
5. If plan modified (digest mismatch): stop and require replan authorization
6. For each task: apply resume evidence table (see Section 11)
7. Continue execution from interruption point

**Resume evidence table:**

| State at resume | Required behavior | Code path in reconciler |
|---|---|---|
| Valid checkpoint, integrated | Do not re-implement | Check `attempt.status === 'integrated'`, skip task, move to next |
| Commit created, SHA not in state | Reconcile without new commit or agent invocation | (1) Search Git log for commit matching the persisted `commit_message` template (`feat({fid}): {task_title}` + `Run: {run_id}` + `Attempt: {N}`); (2) verify: correct author identity, plan reference matches stored digest, content matches expected files, reachable on feature branch; (3) if all checks pass: register found SHA in state, close ledger |
| Verifications complete, commit absent | Revalidate evidence; complete checkpoint if verifiably safe | Detect `attempt.status === 'review_complete'` but `commit_info` empty → re-inspect artifact, if none present re-run verification+review |
| Attempt interrupted with partial diff | Preserve diff; verify attribution before resuming | Detect `attempt.status === 'implementation_complete'` but diffs on disk not staged → preserve, show warning, wait for user to stage or restart |
| Commit present in worktree but not integrated | Resume integration path, not implementation | Detect `attempt.status === 'committed'` but not integrated → call `integrate-attempt()` |
| Task concluded but commit missing or unreachable | Stop with structured diagnosis | Attempt marked done but `git show <sha>` fails → diagnostic report, no automatic action |
| Branch/plan changed, foreign diff, or state corrupted | Stop without data loss | Detect at init; abort and report, preserve all files |

**Output:**
```
Resuming run FTR-018 (resumed <N> times previously)

Reconciliation:
  ✓ BE-01 integrated (from prior run)
  ✓ Worktree clean (no foreign modifications)
  ✓ Plan unchanged (digest matches)

Ready tasks:
  → BE-02 (dependencies satisfied)

Resuming execution...
```

**Exit code:** 0 (success, resumed), 1 (error), 2 (user modifications detected), 3 (lock conflict), 4 (state corrupted), 6 (plan changed)

### 9.4 `reconcile` (Mutative, Idempotent)

**Purpose:** Reconcile persisted state with Git repository; resolve missing ledger entries or SHAs

**Signature:**
```
ai-toolkit executor reconcile [--run-id <uuid>] [--force-integrate-pending]
```

**Behavior:**
1. Read persisted state
2. For each task in state:
   - Verify commit exists on feature branch and is reachable
   - Verify ledger entry matches commit
3. Repair missing SHAs:
   - If commit exists but `original_sha` not recorded: extract and register
   - If integrated but ledger not closed: close ledger entry
4. If `--force-integrate-pending`: attempt to merge any pending (non-integrated) commits
   - **Warning:** this is a user-risk operation; conflicts must still be resolved manually

**Output:**
```
Reconciliation report:

Commits verified:
  ✓ BE-01: <sha> reachable on feature/FTR-018

Ledger entries reconciled:
  ✓ operation_id <op1>: closed

Pending repairs:
  → BE-02 commit exists but SHA not registered; registering now...

Unresolved issues:
  ✗ BE-03 commit missing; manual inspection required

Result: 5 tasks reconciled, 1 requires manual action
```

**Exit code:** 0 (all reconciled), 1 (error), 4 (unresolvable conflicts)

### 9.5 `replan` (Mutative)

**Purpose:** Abandon the current run, preserve its history, and prepare for a new approved plan

**Signature:**
```
ai-toolkit executor replan [--run-id <uuid>] --abandon
```

The `--force-abandon` flag from earlier drafts is removed. The flag is `--abandon` (explicit user intent, no "force" implication which was undefined).

**Behavior:**
1. Require `--abandon` flag (no automatic abandonment)
2. Mark current run as `abandoned` in state file (history preserved; no data deleted)
3. Write an `abandonment_record` into the state file:
   ```json
   {
     "abandoned_at": "<ISO-8601>",
     "tasks_completed": N,
     "tasks_pending": M,
     "integrated_commits": ["<sha1>", "<sha2>"]
   }
   ```
4. Preserve ALL worktree commits, branches, and files — nothing is deleted
5. Release lock
6. Present a summary of what was completed before abandonment
7. Require user to: (a) generate a new approved Work Breakdown, (b) get Gate 2 approval, (c) start a new run

**History preservation:** The abandoned state file remains at `.git/executor-state-{run_id}.json`. It can be inspected via `status --run-id {run_id}`. The new run creates a NEW state file with a new `run_id`; it does NOT overwrite the abandoned run's state.

**Output:**
```
Abandoning run FTR-018-run-<id>

Completed before abandonment:
  ✓ BE-01: integrated (SHA abc1234)
  ✓ BE-02: integrated (SHA def5678)
  ✗ BE-03: failed (2 attempts, verification failed)
  — FE-01: pending (not started)

✓ Run marked as abandoned (state preserved)
✓ All branches and commits preserved in .git/
✓ Lock released

Abandoned run state: .git/executor-state-<run_id>.json
To continue: generate and approve a new Work Breakdown (Gate 2), then:
  ai-toolkit executor start --feature-path <path> --max-concurrency 1
```

**Exit code:** 0 (success), 1 (error), 6 (missing --abandon flag)

### 9.6 `diagnose` (Read-Only)

**Purpose:** Produce a diagnostic report of the current executor state, identifying anomalies, inconsistencies between state and Git, and required manual actions

**Signature:**
```
ai-toolkit executor diagnose [--run-id <uuid>] [--verbose]
```

**Behavior (read-only — no state mutations):**
1. Read state file
2. For each task/attempt:
   - Cross-check `commit_info.original_sha` against Git reachability
   - Verify ledger entry status matches state
   - Detect open entries with no corresponding state update
   - Detect `integrated` commits not reachable on feature branch
3. Check lock: is it held? By a live process? (same logic as stale-lock detection, read-only)
4. Report all anomalies with structured descriptions and suggested recovery actions

**Output:**
```
Executor Diagnostic — FTR-018 run <uuid>

State: paused (last update: 2026-09-18T12:00:00Z)

Anomalies detected:
  ⚠ BE-03: state=committed but SHA abc123 not reachable on feature/FTR-018
    → Run: ai-toolkit executor reconcile to attempt SHA re-registration
  ⚠ Ledger entry for BE-02:review:1 is OPEN but state=integrated
    → Run: ai-toolkit executor reconcile to close stale ledger entry

No lock currently held.

Suggested action: ai-toolkit executor reconcile
```

**Exit code:** 0 (no anomalies), 1 (error reading state), 4 (anomalies detected — non-zero to enable scripted checks)

### 9.7 Exit Code Reference

| Code | Meaning | Recovery |
|---|---|---|
| 0 | Success; operation completed as expected | None |
| 1 | General error; details in stderr | Check logs, fix condition, retry |
| 2 | User modifications or plan changes detected; reconciliation required | User must manually resolve, then `resume` |
| 3 | Lock conflict or active process detected | Wait for active process, or use stale-lock recovery procedure |
| 4 | State corrupted or unreadable | Manual inspection of state file required; `reconcile` may help |
| 5 | Agent dispatch or verification failed; recovery required | Inspect agent output, fix issue, `resume` to retry |
| 6 | Configuration error (invalid `maxConcurrency`, missing flag, etc.) | Fix config/flag, retry |

---

## 10. maxConcurrency Contract

### 10.1 Validation and Configuration

**Source:** Explicit parameter to executor initialization (CLI flag, environment variable, or config file).

**Validation rules (applied at startup, before any state mutation or dispatch):**
- Must be a positive integer (> 0)
- Default: 1 (sequential execution)
- Invalid values: 0, negative, non-integer, or absent when required → rejected with exit code 6 before any write

**Persistence:**
- `max_concurrency` (requested value) and `max_concurrency_effective` (system-constrained) are stored in state
- If effective value is less than requested (due to system limits), log warning but allow start
- Never silently reduce effective value below requested without explicit logging and justification

**Example:**
```javascript
// User requests maxConcurrency: 4
// System has 2 CPU cores available
// Executor logs: "Requested 4 concurrent attempts; effective limit is 2 (CPU-constrained)"
// Persists: { max_concurrency: 4, max_concurrency_effective: 2 }
```

### 10.2 Semantics

- **Configured limit:** Maximum number of concurrent task attempts running simultaneously
- **NOT:** Number of workers momentarily busy (some workers may be idle waiting for dependencies)
- **Implementation:** At most N tasks dispatched simultaneously; N-th task waits for one of first N-1 to complete before proceeding

---

## 11. Sequential Execution (maxConcurrency: 1)

### 11.1 Execution Model

Single worktree shared across all tasks. Attainment (git index, working tree) is controlled sequentially with no interleaving.

**Sequence:**
```
FOR each task in topological_order:
  IF task dependencies satisfied OR explicitly verified skipped:
    ACQUIRE lock (already held from init)
    OPEN ledger
    PERSIST attempt identity and initial state
    RESOLVE agent nativeName via agents resolve --require-verified
    DISPATCH implementation agent (single invocation)
    CAPTURE result and telemetry
    PERSIST implementation outcome before verifications
    RUN verifications
    PERSIST verification outcome
    RUN review
    PERSIST review outcome
    IF review has blocking findings:
      IF rework allowed (attempt ≤ 2):
        INCREMENT rework cycle
        GOTO dispatch (retry this task)
      ELSE:
        MARK task STOPPED
        SKIP remaining tasks in wave
    ELSE:
      PERSIST checkpoint-prepared state
      STAGE task-attributable files
      COMMIT with task identity in message
      EXTRACT and REGISTER commit SHA
      CLOSE ledger entry
      MOVE to next task
  ELSE:
    SKIP task (dependencies not ready)
```

**Worktree consistency:** After each task completes, worktree is clean (all changes committed). Next task sees a clean starting state.

### 11.2 Git Operations

**Branching:** All commits are on `feature/FTR-NNN-slug` (passed at init)

**Staging:** Only files changed by the implementation agent for the current task (no `git add .`)

**Commit message format:**
```
feat(FTR-018): <task title>

Task: <task_id>
Domain: <domain>
Agent: <agent_type>
Run: <run_id>
Attempt: <attempt_number>
```

**SHA registration:** After commit, read `git rev-parse HEAD` and record in state

---

## 12. Parallel Execution (maxConcurrency: N > 1)

### 12.1 Execution Model

Isolated worktrees per attempt. Serial integration of completed attempts onto feature branch.

**Initialization:**
```
FOR i = 1 to maxConcurrency_effective:
  CREATE worktree_i at .git/executor-worktrees/attempt-<i>
  CREATE technical_branch_i: executor/attempt-<i> (based on feature branch HEAD)
```

**Concurrent dispatch:**
```
WHILE tasks remain:
  FOR i = 1 to maxConcurrency_effective:
    IF task available AND slot_i idle:
      ASSIGN next_task to worker_i
      DISPATCH worker_i to execute task in worktree_i on technical_branch_i
      (worker runs same sequence as sequential: impl → verification → review → checkpoint-prepared → commit)
```

**Serial integration:**
```
MAINTAIN coordinator (single, shared process):
  WATCH for completed attempts (status = 'committed' but not integrated)
  SERIALIZE integrations:
    FOR each completed_attempt in stable_order:
      LOCK feature branch (prevent concurrent integration)
      MERGE completed_attempt.technical_branch into feature/FTR-NNN-slug
      VERIFY merge succeeded and commit is reachable
      RECORD integrated_sha (distinct from original_sha)
      UPDATE state: status = 'integrated'
      CLOSE ledger entry
      UNLOCK feature branch
      UNBLOCK dependents (if this task was a blocker)
```

**Dependency gating:** A task's dependents are NOT unblocked until:
1. Dependency task is marked `integrated` on feature branch
2. Integration is verified (commit reachable, ancestry correct)

**Build/test resource isolation:**
- Each worktree has its own `build/` and `dist/` directories
- Shared resources (test database, shared cache) must be either:
  - Serialized via a lock (one worker at a time)
  - OR isolated per worktree (preferred)
- Executor logs warnings if worktree isolation cannot be confirmed

### 12.2 Concurrent Token Attribution

With Percorso C (subprocess dispatch), each `claude.exe` invocation returns its own `modelUsage` object directly in the JSON output. No global counter inference is required.

**Per-attempt measurement (Percorso C):**
```javascript
// Worker 1: dispatch subprocess A
const resultA = spawnSync(CLAUDE, [...argsA], { cwd: worktreeA, ... });
const jsonA = JSON.parse(resultA.stdout);
const tokensA = {
  input: jsonA.modelUsage[modelKey].inputTokens,
  output: jsonA.modelUsage[modelKey].outputTokens,
  cacheCreation: jsonA.modelUsage[modelKey].cacheCreationInputTokens,
  thinking: jsonA.modelUsage[modelKey].thinkingTokens,
  costUSD: jsonA.modelUsage[modelKey].costUSD
};

// Worker 2: dispatch subprocess B (concurrently with A if async)
const resultB = spawnSync(CLAUDE, [...argsB], { cwd: worktreeB, ... });
const jsonB = JSON.parse(resultB.stdout);
const tokensB = { /* same structure, independent measurement */ };
```

**NOT permitted:**
- Summing global `budget.spent()` deltas across overlapping concurrent attempts (Percorso A pattern — deprecated)
- Attributing combined session totals to individual attempts

**Recording:** Each attempt record stores its own `tokens_input`, `tokens_output`, `thinking_tokens`, and `cost_usd` from the subprocess JSON. If `resultB.status !== 0` or JSON parse fails, record `null` with reason (`terminal_reason` from JSON if available, or `'subprocess_error'`).

---

## 13. Commit/Ledger Window Reconciliation

### 13.1 The Problem

After `git commit` succeeds, we have a new SHA on disk. But the SHA cannot be embedded in the commit trailer it registers — that would create a recursive dependency.

**Window:** Gap between commit creation and ledger registration:
1. Commit created, SHA obtained
2. State file written with SHA (temp file + fsync + rename)
3. Ledger entry closed (API call)

If a crash occurs between steps 1 and 3, the commit exists but ledger entry is open.

### 13.2 Solution: Post-Commit SHA Registration with Reconciliation

**Durable path:**
1. Persist checkpoint-prepared state before commit (includes planned `commit_message` text)
2. Create commit with deterministic message format: `feat({fid}): {task_title}\n\nTask: {task_id}\nRun: {run_id}\nAttempt: {N}`
3. Read commit SHA: `git rev-parse HEAD` (or from `git log --oneline -1` if HEAD moved)
4. Write executor state with SHA (atomic temp file + rename)
5. Only then close ledger entry

**Reconciliation at resume (gap commit/SHA):**

Case A — State has SHA, ledger open: `reconcile` closes ledger entry via `ledger close --tokens {tokens}`.

Case B — State lacks SHA (crash between commit and state write):
1. Search by persisted commit message: `git log --all --grep="Run: {run_id}" --grep="Attempt: {N}" --all-match`
2. Verify each candidate commit:
   - **Identity:** `commit.author` matches expected coordinator identity
   - **Plan:** commit trailer `Run: {run_id}` matches current run; `Attempt: {N}` matches attempt
   - **Content:** `git diff {expected_base_sha}..{candidate_sha} -- {task_files}` matches expected task scope
   - **Branch:** `git branch --contains {candidate_sha}` includes `feature/FTR-NNN-slug`
3. If exactly one commit passes all checks: register SHA in state; close ledger
4. If zero or multiple candidates: stop with structured diagnostic; require manual resolution

Case C — Integration registered in executor state but SHA not confirmed on feature branch:
1. `git merge-base --is-ancestor {original_sha} {feature_branch_head}` — if fails: commit was not integrated
2. Search for integration commit: `git log {feature_branch} --ancestry-path {original_sha}..HEAD`
3. If integration found: record `integrated_sha`; mark attempt `integrated`
4. If not found: stop with diagnosis; do not auto-merge

**Rationale:** Git is the source of truth for commits; executor state tracks correlation. SHA verification covers identity, plan, content, and branch — not just existence.

**What `reconcile` does NOT do automatically:**
- Auto-merge unintegrated commits (requires `--force-integrate-pending` with explicit user risk warning)
- Delete or overwrite any existing commit or state entry

---

## 14. Bootstrap Problem: Delivering FTR-018

FTR-018 defines the new executor, but the executor is not available during its own delivery (chicken-and-egg problem).

**Solution: FTR-018 is delivered via the existing `pm-phase3` path; the new executor becomes available only after FTR-018 is complete.**

**Gate sequence:**
- **Pre-Gate 1:** Runtime bridge spike (Percorso C) runs in a temporary isolated environment. No production code. Spike COMPLETED 2026-09-18; OQ-01 RESOLVED.
- **Gate 1:** Documentation approval (Requirements + Tech Spec + Validation Report). Production implementation blocked before this gate.
- **Gate 2:** Work Breakdown approval. Implementation blocked before this gate.
- **Post-Gate 2:** Implementation begins via `pm-phase3` (existing); produces executor modules.
- **Post-FTR-018:** New executor replaces `pm-phase3` for subsequent features.

**Delivery sequence:**

1. **Increment 1 (spike — pre-Gate 1):** Percorso C bridge proven in temporary environment. No production files created.

2. **Increments 2–9 (post-Gate 2 implementation):** Invoke feature delivery via `implement-feature` skill → `pm-phase1` / `pm-phase2` / `pm-phase3`.
   - `pm-phase3` dispatches `gaia-developer-backend` and `gaia-developer-frontend` to implement the executor modules
   - Upon completion: `lib/task-executor/*.js`, `bin/executor-cli.js`, and tests are on disk and committed

3. **Integration into pipeline (Increment 8):** As part of FTR-018 completion
   - Update `implement-feature` skill to invoke task-executor instead of pm-phase3
   - Old pm-phase3 is deprecated (kept for backward compatibility, explicit override only)

4. **First real use:** Next feature after FTR-018 completion
   - New executor runs the next feature's implementation phase
   - pm-phase3 is no longer in the main path

**Constraints:**
- The new executor is NOT available during FTR-018 delivery. No self-execution or bootstrapping.
- No automatic push, merge, release, or gate approval is introduced by the executor itself.
- The spike (Increment 1) ran pre-Gate 1 in a temporary environment — not a production deliverable.

**Documentation:** FTR-018-Tech-Spec Section 14 (this section) explicitly addresses bootstrap path.

---

## 15. Testing Strategy

### 15.1 Unit Tests

**Module:** `tests/executor/` (new directory)

**Test files:**
- `plan-parser.test.js`: Parse MD + CSV, validate, detect cycles, compute digest
- `task-scheduler.test.js`: Topological sort, ready-task computation, deterministic ordering
- `lock-manager.test.js`: Exclusive acquisition, stale-lock detection, ABA guard
- `state-manager.test.js`: Atomic writes, crash recovery, idempotency
- `commit-handler.test.js`: Staging validation, commit creation, SHA extraction
- `resume-reconciler.test.js`: Evidence-driven resume, no re-execution, idempotency

**Coverage targets:**
- All error paths (invalid input, file I/O failures, Git conflicts)
- State transitions and idempotency
- Deterministic ordering (same input → same output)
- No LLM invocations in pure modules

**Test isolation:**
- Temporary Git repository per test (via `git init` in temp dir)
- Temporary state files (no real user home directory access)
- Stub subprocess dispatch: intercept `spawnSync(claude.exe, ...)` calls via a test double that returns schema-valid JSON synchronously (same output structure as real subprocess; no LLM invocation)

### 15.2 Integration Tests

**Module:** `tests/executor/integration.test.js`

**Scenarios:**
- Sequential execution: 3 tasks, no dependencies → all complete, all committed
- Sequential with dependencies: task A → B → C → all integrated in order
- Sequential with rework: task fails verification, rework passes
- Parallel execution: 4 tasks, 2 workers, 2 tasks in parallel per wave
- Parallel with dependencies: cross-phase dependency, correctly gates integration
- Resume after interruption: simulate crash mid-checkpoint, verify resume completes without re-execution
- Resume with partial commit: commit exists but SHA not registered, reconcile fixes it

**Real executor code:** Use actual lib/* modules; do NOT re-implement scheduler in tests.

**Fake worker implementation:** Same interface as real agents, but returns deterministic schema-valid JSON instantly (no LLM).

### 15.3 End-to-End with Fault Injection

**Module:** `tests/executor/fault-injection.test.js`

**Real feature:** Use FTR-018's own Work Breakdown (after Increment 2 complete)

**Real runtime:** Use actual Claude workflow runtime (no mocks) for at least one controlled run per fault point

**Fault injection points:**

| Point | Injection | Verification |
|---|---|---|
| Before dispatch | Kill process, simulate timeout | Resume detects pending state, re-dispatches; no duplicate ledger entry |
| After dispatch (mid-implementation) | Simulate agent timeout | Executor records interrupted, no implementation telemetry persisted |
| After implementation (before verification) | Delete implementation telemetry from state | Resume re-runs verification on same agent output (or re-dispatches) |
| After verification (before review) | Corrupt state file | Executor detects corruption, stops non-destructively, report diagnostic |
| After review (before checkpoint-prepared) | Simulate file I/O error on state write | Executor fails-closed, does not proceed to commit |
| After checkpoint-prepared (before commit) | Simulate `git commit` failure | No SHA registered, attempt remains checkpointed, resume can retry commit or re-implement |
| After commit (before SHA registration) | Delete executor state file | Reconcile detects commit on disk, re-creates state from Git evidence |
| After SHA registration (before ledger close) | Simulate ledger close failure | State has SHA, ledger open, reconcile closes ledger |
| After ledger close (before final write) | Simulate second executor instance | Lock contention, second instance stops with conflict diagnostic |

**Expected outcome:** No false completions, no lost work, no duplicate commits, all persisted data recoverable.

### 15.4 Test Environment

- **Git:** Temporary repo initialized with `git init`
- **Node.js:** No special privileges required
- **Home directory:** Isolated temp directory (no real user home access)
- **File system:** Standard POSIX/Windows file operations (no special permissions)
- **Real runtime:** CI must allow `claude.exe` subprocess invocation with `third_party/foundry` auth; budget per test run must be pre-authorized (Percorso C, no agent() calls)

---

## 16. File Inventory

### 16.1 New Files

| Path | Purpose |
|------|---------|
| `src/claude/workflows/task-executor.js` | Main workflow entry point; orchestrates executor phases |
| `lib/task-executor/plan-parser.js` | Parse and validate Work Breakdown; compute plan digest |
| `lib/task-executor/task-scheduler.js` | Topological sort; ready-task computation; deterministic ordering |
| `lib/task-executor/lock-manager.js` | Exclusive lock acquisition and stale-lock recovery |
| `lib/task-executor/state-manager.js` | Durable executor state I/O; atomic writes |
| `lib/task-executor/commit-handler.js` | Staging validation; commit creation; post-commit SHA registration |
| `lib/task-executor/resume-reconciler.js` | Evidence-driven resume logic; idempotency checks |
| `lib/task-executor/attempt-runner.js` | Single task/attempt execution sequence (impl → verification → review → checkpoint) |
| `bin/executor-cli.js` | CLI entry point: `ai-toolkit executor <command>` |
| `tests/executor/plan-parser.test.js` | Unit tests for plan parsing |
| `tests/executor/task-scheduler.test.js` | Unit tests for scheduling |
| `tests/executor/lock-manager.test.js` | Unit tests for lock management |
| `tests/executor/state-manager.test.js` | Unit tests for state I/O |
| `tests/executor/commit-handler.test.js` | Unit tests for commit handling |
| `tests/executor/resume-reconciler.test.js` | Unit tests for resume logic |
| `tests/executor/integration.test.js` | Integration tests (sequential, parallel, resume, rework) |
| `tests/executor/fault-injection.test.js` | End-to-end with real runtime and fault injection |
| `docs/executor-user-guide.md` | Public documentation: CLI commands, configuration, examples |

### 16.2 Modified Files

| Path | Change description |
|------|---|
| `src/claude/workflows/pm-phase3.js` | Deprecated (kept for backward compat, not used in main path after FTR-018) |
| `src/claude/skills/implement-feature/SKILL.md` | Update to invoke task-executor instead of pm-phase3 (Increment 8) |
| `bin/cli.js` | Add executor command routing (if executor CLI is routed via main CLI) |
| `lib/asset-catalog.js` | Register executor workflow and CLI modules for installation |
| `lib/installation.js` | Ensure executor modules are distributed in local and global installs |
| `package.json` | No version bump (FTR-018 completion does not trigger 1.0.0 release) |
| `.gitignore` | Add `.git/executor-*.json` (state and lock files) |

### 16.3 Deleted Files

None. pm-phase3.js is deprecated but retained for backward compatibility.

---

## 17. Implementation Order

Follow the 9 increments from feature.md strictly in sequence. Each increment is verified complete before the next begins.

### Increment 1 — Baseline Verification and Runtime Bridge Spike (COMPLETED pre-Gate 1)

**Prerequisite:** FTR-014, FTR-015, FTR-016, FTR-017 baselines validated

**Status: COMPLETED 2026-09-18 (pre-Gate 1). OQ-01 RESOLVED. See Gate1-Review-Actions.md Point 4 for full evidence.**

**Tasks (all completed):**

1.1 **Record baseline state** ✓
  - Branch: develop, HEAD 5e4e64d
  - pm-phase3.js buildGroups + executePhase signatures confirmed
  - FTR-017 agent catalog (15 gaia-* agents) and resolveAgent contract confirmed
  - FTR-016 ledger.open/close/fail/skip + computeOperationId(prefix, agent, attempt) signatures confirmed

1.2 **Runtime bridge spike — Percorso C** ✓
  - Proven: `spawnSync(claude.exe, ['--print', '--output-format', 'json', '--json-schema', schema, '--agent', nativeName, ...], {cwd: worktreeDir})`
  - Exit 0; structured output with full usage; timeout → SIGTERM (no orphan)
  - `--agent gaia-developer-backend` loads correct definition (distinct cacheCreationInputTokens + thinking activated)
  - Auth: `third_party/foundry` (existing Azure subscription, no new service)
  - Ledger entries: `node-bridge-spike:pre-gate1` (done), `percorso-c-spike:pre-gate1` (done)
  - **Deliverable:** OQ-01 evidence in Gate1-Review-Actions.md and this section

1.3 **Close OQ-01** ✓
  - Bridge mechanism: Node.js coordinator + `claude.exe --print` subprocess (Percorso C)
  - Token measurement: from `modelUsage` in JSON output (no inference from deltas)
  - Cancellation: SIGTERM via `spawnSync` timeout; PID tracking for resume deduplication
  - Limits documented: `--bare` incompatible with foundry auth; sync vs async; path resolution

1.4 **Gate 1 prerequisite:** Spike runs pre-Gate 1 (not deferred). OQ-01 must be RESOLVED before Gate 1 approval. ✓ Completed.

### Increment 2 — Approved-Plan Parser and Pure Scheduler

**Prerequisite:** Increment 1 complete, OQ-01 closed

**Tasks:**

2.1 **Implement plan-parser.js**
  - Read Markdown (informational, parse section headers for phase reference)
  - Read CSV (machine-readable source, pipe-separated columns)
  - Validate: uniqueness, DAG acyclicity, field completeness, CSV/MD parity
  - Normalize: build task list, dependency graph
  - Compute content digest (SHA-256 of CSV)
  - **Test:** Unit tests in `plan-parser.test.js`; edge cases: cycles, duplicates, missing fields, empty CSV
  - **Deliverable:** Module tested, no production code yet

2.2 **Implement task-scheduler.js**
  - Topological sort on normalized task list
  - Compute ready tasks (all dependencies satisfied or explicitly skipped)
  - Deterministic ordering (same input → same output)
  - **Test:** Unit tests; verify topological order on real Work Breakdown CSV
  - **Deliverable:** Module tested

2.3 **Implement plan snapshot binding**
  - Derive snapshot from approved MD + CSV
  - Bind snapshot by content digest
  - Make snapshot read-only in executor state
  - Detect plan changes at resume (digest mismatch) → stop and require replan
  - **Test:** Unit test for digest stability, migration safety
  - **Deliverable:** Snapshot binding logic tested

2.4 **Verify Gate 1 and Gate 2 in place**
  - Before any state mutation: check {PREFIX}-Approvals.md exists
  - Verify Gate 1 section present
  - Verify Gate 2 section present
  - Stop if missing (no bypass)
  - **Deliverable:** Validation logic in executor init

### Increment 3 — Persistent Protocol, Lock, and Ledger Extension

**Prerequisite:** Increment 2 complete

**Tasks:**

3.1 **Implement state-manager.js**
  - Define executor state schema (version 1.0.0)
  - Atomic write: temp file + fsync + rename (matching FTR-016 ledger pattern)
  - Persistence checkpoint: run identity, task identity, attempt identity, base SHA, plan reference, worker identity
  - Re-read after write to verify durability
  - **Test:** Unit tests for atomic writes, crash recovery, idempotency
  - **Deliverable:** Module tested on Windows and Linux

3.2 **Implement lock-manager.js**
  - Exclusive lock acquisition via fs.openSync(path, 'wx')
  - Lock file format: { acquired_at, run_id, worker_id, lock_version }
  - Stale-lock detection: process liveness check (signal 0), mtime age check
  - ABA-guarded recovery (re-read before reclaim)
  - Timeout: default 5s (configurable)
  - **Test:** Unit tests for live lock, stale lock, concurrent acquisition, ABA guard
  - **Deliverable:** Module tested

3.3 **Extend ledger backward-compatibly (OQ-03)**
  - Map task/attempt lifecycle to ledger operations (open/close/fail/skip)
  - Compute operation_id: SHA256([prefix, task_id, attempt]).slice(0, 32)
  - No new ledger schema fields; metadata fields optional on open
  - Verify no migration required for FTR-016/017 consumers
  - **Test:** Unit test for mapping; verify existing ledger readers still work
  - **Deliverable:** Mapping documented in tech spec, backward-compatible

3.4 **Implement read-only status command**
  - `ai-toolkit executor status [--run-id <uuid>] [--verbose]`
  - Inspect state file, report task status, lock status, ledger summary
  - No state mutation
  - **Test:** Unit test with various state files
  - **Deliverable:** Command tested, manual verification

### Increment 4 — Sequential Task Execution with Verifications and Telemetry

**Prerequisite:** Increment 3 complete

**Tasks:**

4.1 **Implement attempt-runner.js**
  - Single task/attempt execution sequence:
    1. Pre-dispatch checks: ledger write/re-read, lock held, agent verification
    2. Resolve agent nativeName via agents resolve --require-verified
    3. Dispatch implementation agent (single subprocess invocation via claude.exe --agent nativeName)
    4. Persist implementation outcome and measurements immediately
    5. Run targeted verifications (deterministic)
    6. Persist verification outcome
    7. Run targeted review agent
    8. Persist review outcome
    9. Return attempt record
  - Token recording: unknown values as `null` with reason, never `0`
  - Time tracking: elapsed vs. active (if measurable)
  - **Test:** Unit test with fake implementation agent, verification, review
  - **Deliverable:** Module tested

4.2 **Implement retry/rework policy**
  - Default: 1 initial attempt + 1 automatic rework = 2 total
  - After 2 attempts: stop, do not proceed to commit, mark for manual reconciliation
  - Preserve all attempt records (immutable)
  - **Test:** Unit test for rework cycle counting, stop after limit
  - **Deliverable:** Logic implemented and tested

4.3 **Implement sequential task executor**
  - Main loop: for each ready task (in topological order)
  - Acquire lock (already held)
  - Invoke attempt-runner
  - If verification/review fails and rework exhausted: stop
  - If successful: move to commit phase (Increment 5)
  - Cooperative stop: accept signal, finish current attempt, do not start new dispatches
  - Immediate stop: preserve files, record attempt as interrupted
  - **Test:** Integration test with multiple tasks, rework scenario
  - **Deliverable:** End-to-end sequential execution tested

### Increment 5 — Controlled Commit and Commit/Ledger Reconciliation

**Prerequisite:** Increment 4 complete

**Tasks:**

5.1 **Implement post-commit SHA registration**
  - Persist checkpoint-prepared state before commit
  - Validate staging: only task-attributable files, no foreign modifications
  - Create commit with task identity in message
  - Extract SHA: `git rev-parse HEAD` (or equivalent)
  - Persist SHA in executor state (atomic write)
  - Only then close ledger entry
  - Reconcile commit/ledger window: gap handled by state persistence
  - **Test:** Unit test; simulate crash between commit and ledger close
  - **Deliverable:** Post-commit registration logic tested

5.2 **Implement no-modification task handling**
  - Detect task with no output (no modifications)
  - Skip staging and commit
  - Record explicit evidence and skip reason
  - Run verifications and review (even with no modifications)
  - Mark task complete without creating empty commit
  - **Test:** Unit test for no-modification detection and skip
  - **Deliverable:** Logic tested

5.3 **Implement startup classification**
  - At executor init: inspect worktree
  - Classify artifacts: pipeline-permitted vs. user modifications
  - Pipeline-permitted: committed, staged, known to executor state
  - User modifications: foreign diffs, uncommitted unknown changes
  - Stop if user modifications detected; require manual decision
  - **Test:** Unit test with various worktree states
  - **Deliverable:** Classification logic tested

### Increment 6 — Stop, Resume, Retry, and Authorized Replan

**Prerequisite:** Increment 5 complete

**Tasks:**

6.1 **Implement resume-reconciler.js**
  - Inspect persisted state and Git repository
  - Apply resume evidence table (Section 11)
  - For each scenario: exact code path documented in reconciler
  - Never re-execute task with valid integrated checkpoint
  - Preserve partial worktrees and unintegrated commits
  - Detect plan changes (digest mismatch) → stop, require replan authorization
  - **Test:** Unit tests for each resume evidence scenario
  - **Deliverable:** Reconciler module tested

6.2 **Implement resume command**
  - `ai-toolkit executor resume [--run-id <uuid>] [--force-continue]`
  - Read persisted state, check lock, classify artifacts
  - If user modifications: stop with prompt
  - If plan changed: stop with replan prompt
  - Apply resume reconciliation
  - Continue execution from interruption point
  - Idempotent across repeated invocations
  - **Test:** Integration test: interrupt mid-run, resume twice, verify idempotency
  - **Deliverable:** Command tested

6.3 **Implement reconcile command**
  - `ai-toolkit executor reconcile [--run-id <uuid>] [--force-integrate-pending]`
  - Verify commits on feature branch
  - Repair missing SHAs
  - Close open ledger entries
  - Optional: attempt to integrate pending commits (user risk)
  - **Test:** Unit test for missing SHA recovery, ledger repair
  - **Deliverable:** Command tested

6.4 **Implement replan command**
  - `ai-toolkit executor replan [--run-id <uuid>] --force-abandon`
  - Require explicit --force-abandon flag
  - Mark run as abandoned
  - Preserve all commits and branches
  - Release lock
  - Provide instructions for new run
  - **Test:** Unit test for state transition to abandoned
  - **Deliverable:** Command tested

### Increment 7 — Isolated Worktrees and Parallel Execution

**Prerequisite:** Increment 6 complete

**Tasks:**

7.1 **Implement parallel worktree management**
  - Create N isolated worktrees: `.git/executor-worktrees/attempt-<i>`
  - Each worktree on its own technical branch: `executor/attempt-<i>`
  - Worktree isolation prevents shared state corruption
  - **Test:** Unit test for worktree creation, branch isolation
  - **Deliverable:** Worktree management tested

7.2 **Implement serial integration coordinator**
  - Watch for completed attempts (status = 'committed')
  - Serialize integrations: one at a time, lock feature branch
  - Merge technical branch onto feature branch
  - Verify merge succeeded, commit reachable on feature branch
  - Record original_sha (from worktree) and integrated_sha (merged)
  - Update state and close ledger
  - Do NOT retry on conflict; stop, preserve branches, require manual resolution
  - **Test:** Integration test with 2 attempts in parallel, serial integration
  - **Deliverable:** Coordinator tested

7.3 **Implement dependency gating**
  - Task's dependents NOT unblocked until dependency is integrated
  - Wait for integration completion before checking ready tasks for dependents
  - **Test:** Integration test: task A blocks task B, verify B waits for A integration
  - **Deliverable:** Gating logic tested

7.4 **Implement concurrent token attribution**
  - Per-attempt measurement via budget delta
  - Do NOT sum global overlapping deltas
  - Record `null` if per-attempt measurement impossible
  - **Test:** Integration test with parallel agents, verify per-attempt token recording
  - **Deliverable:** Token attribution tested

7.5 **Implement parallel execution**
  - Main loop: schedule up to N tasks concurrently
  - Maintain worker pool; assign ready tasks to idle workers
  - Each worker: run attempt in its worktree
  - Coordinator integrates completed attempts serially
  - Dependents unblocked after integration verified
  - **Test:** Integration test: 4 tasks, 2 workers, verify ordering and integration
  - **Deliverable:** Full parallel execution tested

### Increment 8 — Integration into implement-feature, Distribution, and Documentation

**Prerequisite:** Increment 7 complete

**Tasks:**

8.1 **Create task-executor.js workflow**
  - Claude Code Workflow script (entry point for executor)
  - Parse args: feature path, branch, max-concurrency, other config
  - Initialize executor: parse plan, acquire lock, verify gates
  - Invoke incremental phases (parse, schedule, execute per task, integrate, finalize)
  - Return summary (completed tasks, tokens, errors)
  - **Test:** Unit test for phase coordination, return shape
  - **Deliverable:** Workflow script tested

8.2 **Integrate into implement-feature skill**
  - Update `src/claude/skills/implement-feature/SKILL.md`
  - Replace pm-phase3 dispatch with task-executor invocation
  - Maintain approve-gates (Gate 1, Gate 2) in main loop
  - Update return value handling
  - **Test:** Manual smoke test of full pipeline with real feature
  - **Deliverable:** Skill updated and manually tested

8.3 **Update asset catalog and installer**
  - Register executor modules in `lib/asset-catalog.js`
  - Ensure `lib/task-executor/*.js` and `src/claude/workflows/task-executor.js` are included in distribution
  - Test local and global installation
  - **Test:** Verify installer includes executor files
  - **Deliverable:** Installation tested

8.4 **Document bootstrap path** (in tech spec)
  - FTR-018 delivered via old pm-phase3 path
  - Upon completion: executor available for next features
  - Section 14 of tech spec
  - **Deliverable:** Bootstrap documentation (this tech spec)

8.5 **Create user documentation**
  - `docs/executor-user-guide.md`
  - CLI commands: status, resume, reconcile, replan
  - Configuration: maxConcurrency source, environment variables
  - Examples: sequential run, parallel run, resume after interruption
  - Exit codes and error recovery
  - **Deliverable:** User guide ready for publishing

### Increment 9 — End-to-End Testing with Fault Injection and Real Feature

**Prerequisite:** Increment 8 complete

**Tasks:**

9.1 **Set up E2E test infrastructure**
  - Real Git repository (not mocked)
  - Real feature Work Breakdown (FTR-018's own, after Increment 2)
  - Fault injection points at each checkpoint boundary
  - Real Claude runtime for at least one controlled run
  - **Test:** Infrastructure ready for fault injection
  - **Deliverable:** Test harness ready

9.2 **Fault injection: before/after dispatch**
  - Inject: kill process, simulate timeout
  - Verify: resume detects pending, no duplicate ledger
  - **Deliverable:** Fault point tested

9.3 **Fault injection: before/after verification**
  - Inject: corrupt verification outcome, delete state file
  - Verify: resume re-runs or detects corruption, stops non-destructively
  - **Deliverable:** Fault point tested

9.4 **Fault injection: before/after checkpoint-prepared**
  - Inject: file I/O error on state write
  - Verify: executor fails-closed, no incomplete state left
  - **Deliverable:** Fault point tested

9.5 **Fault injection: before/after commit**
  - Inject: simulate git commit failure
  - Verify: no SHA registered, attempt preserved, resume can retry
  - **Deliverable:** Fault point tested

9.6 **Fault injection: before/after final write**
  - Inject: delete state file after commit
  - Verify: reconcile detects commit on disk, recovers SHA
  - **Deliverable:** Fault point tested

9.7 **Document runtime constraints**
  - Token limits encountered (if any)
  - Cancellation behavior (SIGTERM from spawnSync timeout; async spawn requires explicit process group handling)
  - Per-agent concurrency limits
  - Worktree isolation constraints on platform
  - **Deliverable:** Constraints documented; no hidden mocks

9.8 **Manual verification**
  - Run one controlled end-to-end on official implement-feature with real feature
  - Verify: all tasks complete, commits integrated, ledger accurate
  - Document outcome
  - **Deliverable:** E2E run documented; ready for FTR-019 review

---

## 18. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| **Subprocess cancellation and orphans** | On coordinator crash, `spawn`-ed claude.exe subprocess may continue running; child processes spawned by claude.exe may not be killed by SIGTERM alone | Medium | Use `detached: false` (default) and `killSignal: 'SIGKILL'` on Windows; verify process group cleanup; store PID+start-time in state immediately after spawn; check liveness on resume before starting replacement attempt |
| **Atomic write not power-loss safe on all OSes** | On crash, state file might be partially written despite fsync + rename | Low | Test on Windows and Linux; fsync ensures journal commit; rename is atomic (POSIX + ReplaceFileW); if concern remains, add checksum validation on read |
| **Stale lock false positive** | Lock held by process no longer running; false positive delays start | Low | Process liveness check via signal 0 + start-time comparison (anti-recycling); ABA guard; no age-based auto-reclaim; on different host: manual removal required |
| **Commit/ledger non-atomicity** | Commit created but ledger not closed (crash between steps); reconcile must handle | Medium | State file persisted with SHA before ledger close; reconcile detects and repairs; documented in tech spec |
| **Bootstrap sequencing** | FTR-018 delivered via pm-phase3; if pm-phase3 fails mid-feature, executor not available | Medium | FTR-018 scope is bounded (Increments 1–9); each increment gated by tests; if pm-phase3 fails, investigate that failure, not executor delivery |
| **Parallel integration conflict (unresolvable)** | Two attempts modify same file; merge fails; no automatic resolution | Medium | Stop new starts; preserve branches; require manual resolution; documented as out-of-scope (user responsibility) |
| **Plan digest binding insufficient** | Plan changed on disk; digest computed from CSV; if CSV parsing changes, digest might differ on re-read | Low | Use stable digest algorithm (SHA-256); validate CSV format doesn't change; if parsing changes, increment schema version and migrate |
| **Resume re-implements completed task** | Logic flaw in resume reconciler; task marked complete but then re-executed | High | Comprehensive resume evidence table (Section 11); unit tests for each scenario; integration tests with interruption + resume |
| **Duplicate commits on concurrent integration** | Two coordinators both integrate same attempt; creates duplicate commits | High | Exclusive lock on feature branch during integration; check commit already exists before merge; serialize integrations |
| **Worktree isolation breakdown** | Shared resources (build cache, test DB) corrupted by concurrent writes | Medium | Document isolation requirements; test on real multi-core machine; log warnings if isolation cannot be confirmed; prefer serialization for shared resources |
| **No recovery from ledger corruption** | If ledger JSON is corrupted, reconcile cannot repair | Low | FTR-016 ledger includes backup-corrupt sidecar on corruption; reconcile reads executor state (independent source of truth); rebuild ledger from state if needed |

---

## 19. Open Technical Decisions (All Closed)

| OQ | Decision | Evidence | Spec Section |
|---|---|---|---|
| OQ-01 | Bridge mechanism for agent dispatch | Percorso C spike (2026-09-18): spawnSync(claude.exe --print --output-format json --json-schema ...) → exit 0, schema-validated JSON, full modelUsage telemetry; SIGTERM on timeout; --agent flag loads agent definition; auth=foundry (existing). Sub-questions OQ-01a (complete verified-agent test) and OQ-01b (async orphan/dedup) remain OPEN — see Gate1-Review-Actions Point 4 | Section 3 |
| OQ-02 | Executor state protocol and durability | Rename-based atomic writes (temp + fsync + rename) sufficient; crash leaves old or new state; no partial writes | Section 5 |
| OQ-03 | Ledger extension | Task/attempt lifecycle maps to open/close/fail/skip; no new fields; backward-compatible | Section 6 |
| OQ-04 | Plan parsing and snapshot binding | CSV lossless parser, SHA-256 content digest, snapshot read-only, resume detects changes | Section 7 |
| OQ-05 | Lock and state file position | `.git/executor.lock` and `.git/executor-state-{run_id}.json` co-located; stale-lock ABA-guarded; integration conflict stops new starts | Section 8 |
| OQ-06 | CLI commands and configuration | `status` (read-only), `resume`, `reconcile`, `replan` (mutative); maxConcurrency from explicit param; exit codes 0–6 | Section 9 |

---

## 20. Document Approvals and Sign-Off

This Technical Specification is ready for **Gate 1 Review** (feature docs approval).

**Gate 1 Prerequisites Satisfied:**
- Feature definition complete (feature.md)
- Requirements document complete (FTR-018-Requirements.md)
- Technical specification complete (this document)
- All OQ-01 through OQ-06 resolved with concrete answers
- Runtime bridge spike completed and documented
- No blockers to development handoff

**Next Gate:** Gate 2 (Work Breakdown approval) — after generate-work-breakdown produces FTR-018-Work-Breakdown.md/.csv

---

**Specification Generated:** 2026-09-10  
**Feature ID:** FTR-018  
**Status:** Ready for Gate 1 approval
