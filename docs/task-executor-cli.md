# Task Executor CLI

> Documents the **real, currently-implemented** behavior of `ai-toolkit executor <subcommand>`
> (`bin/cli.js`'s `handleExecutorCommand`, wired to `lib/task-executor/index.js`), part of
> FTR-018 (deterministic task execution, checkpoints and resume).
>
> This file describes what the code actually does today, not the aspirational CLI contract in
> `FTR-018-Tech-Spec.md` section 10. Every discrepancy between the two is called out explicitly
> below rather than silently reconciled.

---

## Invocation

```bash
ai-toolkit executor <subcommand> [flags]
# or, inside this repo:
node bin/cli.js executor <subcommand> [flags]
```

`--project <path>` is accepted by every subcommand and defaults to `process.cwd()` when omitted.
All other flags are per-subcommand (see below). Any flag not explicitly recognized for a
subcommand is silently ignored — there is no generic flag-forwarding path, so nothing reaches a
filesystem path or lock primitive except the whitelisted flags read via `getFlag()`/`hasFlag()`.

**Discrepancy vs. Tech-Spec:** section 10 documents `--format json or text (default)` as a
common flag. The real CLI has no `--format` flag at all — `handleExecutorCommand` always emits
JSON (`JSON.stringify(result, null, 2)`) on success and always emits JSON on error. There is no
text-mode output in the current implementation.

---

## Commands

### `start`

```bash
ai-toolkit executor start --project <path> --feature <path> [--max-concurrency N] [--claude-path <path>] [--task-timeout-ms <ms>] [--agent-budget-usd <amount>] [--from-replan-run-id <uuid>]
```

| Flag | Required | Default | Notes |
|---|---|---|---|
| `--project` | no | `process.cwd()` | Repo root; also resolves the common Git directory |
| `--feature` | **yes** | — | Path to the feature's `feature.md`; the CLI usage-errors (exit 2, no JSON) if omitted |
| `--max-concurrency` | no | `1` | Forwarded to `execute()` as a Number; only `1` is currently supported (see below) |
| `--claude-path` | no | — | Absolute path to the qualified Claude CLI executable |
| `--task-timeout-ms` | no | — | Forwarded as a Number |
| `--agent-budget-usd` | no | — | Forwarded as a Number; persisted into run config, not itself enforced |
| `--from-replan-run-id` | no | — | UUID of a prior run `replan` has already superseded; seeds its carry-over-eligible tasks straight to `checkpointed` instead of `pending` (see "Carrying forward a replan" below) |

Backs `lib/task-executor/index.js`'s `execute()`. Validates gates/config, acquires the
repo-wide execution lease for a brand-new run, builds an immutable plan snapshot from the
feature's own `{PREFIX}-Work-Breakdown.md/.csv`, and drives a sequential (slot count 1)
dispatch → verify → review → checkpoint loop to completion or block.

Only `maxConcurrency=1` is implemented — any other requested value is **rejected**
(`UNSUPPORTED_CONCURRENCY`), never silently downgraded. `execute()` also refuses to run at all
on any platform other than `win32` (see "Platform qualification" below), before touching any
other validation.

**Permission bypass.** Every real implementation/review worker this loop dispatches is spawned
with `--permission-mode auto` appended to its CLI args (`EXECUTOR_PERMISSION_BYPASS_ARGS` in
`lib/task-executor/index.js`). A non-interactive `--print` invocation has no TTY to answer a
permission prompt, so without this every Write/Edit/mkdir tool call is denied by default,
regardless of task content — confirmed against a real run where every BE/FE task failed
verification because its expected files/directories were never created. `auto` alone was then
independently confirmed sufficient (a live dispatch created all of its task's expected
directories and files). An earlier version of this fix also appended `--permission-prompts
none`, citing Tech-Spec OQ-01's pre-Gate-1 spike note as having validated that exact pair —
reproduced directly against the real, installed CLI (v2.1.220): `--permission-prompts` is not a
recognized flag at all (`claude --help` lists no such option; passing it exits 1 with `error:
unknown option '--permission-prompts'` before any model/API call), so that spike note is stale or
was never run against the real executable as claimed. The mode is deliberately unscoped within
the task's own `--project` directory — the executor's job is letting a developer agent write
anywhere under that project, so (unlike pm-phase1/2's read-only-text workers) a narrower
allowlist is not an option here.

**Carrying forward a replan.** `replan` (below) computes which of an original run's completed
tasks are eligible to carry forward into a corrected successor plan (`carriesCompletion`,
commit-reachability based) and durably records that decision — but, on its own, never acts on
it: a plain `start` on the successor plan dispatches every task fresh from `pending`, discarding
the eligibility `replan` just computed. `--from-replan-run-id <uuid>` is the explicit way to
actually consume that record: given the UUID of a run `replan` has already superseded, `execute()`
validates that run really is `superseded`, reads its `replan` intent, and confirms that intent's
`successorPlanDigest` matches the plan this `start` call just parsed (`REPLAN_PLAN_DIGEST_MISMATCH`
otherwise, exit 4) — a prior run that was never actually `replan`-ed throws
`REPLAN_SOURCE_NOT_SUPERSEDED` (exit 4). Only then are the mapped `newTaskId`s whose
`carriesCompletion` is `true` seeded straight to `checkpointed`, with a synthetic attempt carrying
the original task's already-reachable `originalSha` (never re-verified, never re-dispatched in the
successor run — `terminalReason` records the exact old run/task/attempt provenance for later
`diagnose`/audit). Never inferred/auto-detected: omitting the flag (the default) carries nothing
forward, exactly like today.

### `status`

```bash
ai-toolkit executor status --project <path> --run-id <uuid>
```

`--run-id` is required (usage error, exit 2, if omitted). Read-only summary of a run: task
status counts, current run status, and total cost from the ledger.

Backs `lib/task-executor/index.js`'s `status()`. Returns:

```json
{
  "protocolVersion": 1,
  "runId": "...",
  "runStatus": "running",
  "taskCounts": { "pending": 0, "active": 0, "checkpointed": 0, "integrated": 0, "skipped": 0, "blocked": 0 },
  "totalTokens": null,
  "totalCostUsd": null
}
```

`taskCounts` is derived straight from the persisted `state.json` (`store.readState`) — never
mutates it. `totalTokens` sums every numeric `phase_delta_tokens` entry in the run's own
`<runId>-token-ledger.json`; `totalCostUsd` additionally requires the target project's own
`docs/token-pricing.json` (same file and 80/20 input/output split `lib/workflow-artifacts.js`
uses for feature Token-Estimate documents) and a non-null `model` on each ledger entry to attach
a rate to. `dispatchTaskAttempt`/`runReview` (`lib/task-executor/index.js`) always open their
`implementation`/`review` ledger activities with `model: null`, so `totalCostUsd` is `null` until
that changes — this is a known gap, not a bug: **null means "unavailable", never a fabricated
zero** (same null-compatibility convention as the Token-Estimate document). `totalTokens` does
not share that gap: `_runTaskToResolution` now closes every `implementation`/`review` activity
(`done` with its measured tokens on a normal return, `failed` with `tokens: null` on a genuine
spawn-level error) immediately after each dispatch, so a completed or still-running real run
reports real summed tokens — previously these activities were opened and never closed at all, so
every run's `totalTokens` was unconditionally `null` regardless of outcome. If `runStatus`
happens to be `'paused'`, the CLI exits 8, same as `execute`/`resume` reporting that status
directly — the exit code reflects the run's actual state, not which subcommand observed it.

If the run is missing or its `state.json` is corrupted, `STATE_NOT_FOUND`/`STATE_CORRUPTED`
propagate unmodified (exit 4 / exit 1 respectively). An unreadable or unparseable ledger or
pricing file throws `LEDGER_READ_FAILED`/`LEDGER_CORRUPTED`/`PRICING_READ_FAILED`/
`PRICING_CORRUPTED` (exit 1) rather than silently reporting a partial or zeroed-out total.

### `diagnose`

```bash
ai-toolkit executor diagnose --project <path> --run-id <uuid>
```

`--run-id` is required. Intended as a read-only detailed evidence dump (per-task/attempt
evidence, ownership/lease state, repair suggestions).

**Not implemented.** Same situation as `status`: `diagnose()` is a stub that always throws
`NOT_IMPLEMENTED` (attributed to US-06-TASK-BE-02). Calling it today always exits 1 with an
error JSON body.

### `stop`

```bash
ai-toolkit executor stop --project <path> --run-id <uuid> [--mode graceful|immediate]
```

| Flag | Required | Default | Notes |
|---|---|---|---|
| `--run-id` | **yes** | — | |
| `--mode` | no | `'graceful'` | Only `'graceful'` or `'immediate'` are accepted; anything else throws `STOP_VALIDATION_ERROR` |

Persists a stop request and acknowledges receipt only — it never itself claims the run has
stopped.

- `graceful` (default): persists the request; the already-running `execute()` loop is the only
  thing that actually enforces the block, at its next natural iteration boundary.
- `immediate`: additionally attempts real termination of every in-flight attempt (stage
  `dispatching`/`running` with a recorded process tag), via the same Windows-only tagged-process
  tree-kill technique used elsewhere in this module, then polls for confirmed termination.

Idempotent: if the run's current status is already `stopping` or settled
(`completed`/`blocked`/`superseded`/`paused`), this call is a pure no-op and reports the
originally-recorded mode.

### `reconcile`

```bash
ai-toolkit executor reconcile --run-id <uuid> [--project <path>]
```

`--run-id` is required. `--project` resolves the execution root and the current-branch task ref
automatically (via `git rev-parse --abbrev-ref HEAD` in the given `--project`, or its default,
the current directory) — there is no separate flag for these; the CLI derives them itself.

Reconciles persisted state and evidence for a run and classifies every task's current attempt.
**Only repairs proven gaps — it never dispatches new work and never creates new integrations.**
The only two repairs it can apply are: registering a commit SHA when a checkpoint-prepared
attempt's tip exactly matches its own persisted checkpoint intent, and finalizing a task
checkpoint when a committed attempt's registered SHA is confirmed reachable but the task's
status was not yet advanced. Refuses to proceed (`COMPETING_COORDINATOR_LIVE` /
`COMPETING_COORDINATOR_LIVENESS_UNKNOWN`) if a different, live-or-unknown-liveness coordinator
holds the repo-wide execution lease.

### `resume`

```bash
ai-toolkit executor resume --run-id <uuid> [--project <path>]
```

Same flags/derivation as `reconcile` (in fact the CLI dispatches both `reconcile` and `resume`
through the identical flag-parsing branch, selecting the target function by subcommand name).
Enforces the same "no live competing coordinator" precondition, then calls `reconcile()` to
apply its repairs, then reports each task's current status plus the next-safe-action
classification `reconcile()` already computed. Does **not** dispatch new work itself — there is
no run loop wired into `resume()` yet (the real dispatch loop lives in `execute()`); its scope
ends at "reconcile, then report what is safe to continue."

### `replan`

```bash
ai-toolkit executor replan --run-id <uuid> --feature <path> [--project <path>] [--task-mapping-json '<json>']
```

| Flag | Required | Default | Notes |
|---|---|---|---|
| `--run-id` | **yes** | — | The original run being replanned |
| `--feature` | **yes** | — | Path to the **successor** feature's `feature.md` (the approved successor plan) |
| `--project` | no | `process.cwd()` | Resolves execution root + current-branch task ref, same as `reconcile`/`resume` |
| `--task-mapping-json` | no | `'[]'` (empty array) | JSON array of `{oldTaskId, newTaskId}` objects |

**Discrepancy vs. Tech-Spec:** the table in section 10 lists only `--run-id`/`--feature` for
`replan`. The real `replan()` in `lib/task-executor/index.js` requires `args.taskMapping` to be
an array (throwing `DISPATCH_VALIDATION_ERROR` otherwise) and never invents one itself. The CLI
therefore added `--task-mapping-json` as a necessary extension beyond the literal table, using
the same `--*-json` structured-input convention the `ledger` subcommand already established
(`--metadata-json`). This is documented here as an intentional, flagged gap — not silently
papered over — per the implementing agent's own note at the flag's parse site in `bin/cli.js`.
Omitting the flag defaults to an empty mapping (a valid "no task carries forward" array), never
a rejection.

Grants **no approval itself** — the successor's Gate 2 approval must already exist on disk
(`## Gate 2` heading in its `Approvals.md`, produced entirely outside the executor by the normal
`implement-feature` gate protocol). Does not dispatch, start, or touch the successor run in any
way. Validates the caller-supplied old→new task mapping against both the original run's recorded
tasks and the successor's plan snapshot, computes carry-completion eligibility per pair
(read-only), refuses if any original-run attempt's worker liveness is not confirmed dead
(`LIVE_WORKER_BLOCKS_REPLAN`), then records the mapping as a durable intent and marks the
original run `superseded`. Never deletes or rewrites any task/attempt evidence. The record this
writes is not write-only forever: `start`'s own `--from-replan-run-id` (above) is the explicit
consumer — pass this run's own `runId` there on the successor's `start` call to actually carry the
eligible tasks forward, instead of the eligibility decision going unused.

---

## Exit codes

| Exit code | Meaning |
|---|---|
| 0 | Successful operation/request |
| 1 | Unexpected I/O (also the default for any unmapped/unknown error code) |
| 2 | Invalid config/input |
| 3 | Ownership/live worker conflict |
| 4 | Evidence/plan/approval mismatch |
| 5 | Worker/verification/review failure |
| 6 | Integration conflict |
| 7 | Runtime not qualified |
| 8 | Paused awaiting human decision |

This table matches `bin/cli.js`'s `EXECUTOR_EXIT_CODE_BY_ERROR_CODE` mapping (plus a
suffix-based catch-all: any error code ending in `_VALIDATION_ERROR` maps to exit 2). A few
notable groupings from that mapping:

- **3** — every lease/ownership code: `LEASE_HELD`, `LEASE_NOT_OWNER`, `LEASE_STILL_LIVE`,
  `LEASE_LIVENESS_UNKNOWN`, `LEASE_NOT_FOUND`, `GUARD_HELD`, `NO_LOCK_HELD`,
  `COMPETING_COORDINATOR_LIVE`, `COMPETING_COORDINATOR_LIVENESS_UNKNOWN`,
  `LIVE_WORKER_BLOCKS_REPLAN`.
- **4** — every "plan/evidence/approval doesn't match" code, including
  `SUCCESSOR_NOT_APPROVED`, `PLAN_NOT_FOUND`, `PLAN_PARSE_ERROR`, `REPLAN_UNKNOWN_TASK_MAPPING`,
  `STATE_NOT_FOUND`/`STATE_TASK_NOT_FOUND`/`STATE_ATTEMPT_NOT_FOUND`, `TREE_MISMATCH`,
  `RECEIPT_CONFLICT`, `INTENT_CONFLICT`, and many more (see the source comment for the full
  list).
- **5** — `CLAUDE_SPAWN_FAILED`, `AGENT_NOT_VERIFIED`, `RESOLUTION_FAILED`.
- **6** — `INTEGRATION_CONFLICT`.
- **7** — `PLATFORM_NOT_QUALIFIED` (see "Platform qualification" below).
- **1 (default)** — includes `NOT_IMPLEMENTED` explicitly, so `status`/`diagnose` calls exit 1
  today, not some special code.

**Exit code 8 is a success-path outcome, never a thrown error** — unlike every other code
above, which is assigned only on the error path via `mapExecutorErrorToExitCode`. Per the
Tech-Spec, 8 means "paused awaiting human decision": `execute()`'s and `resume()`'s result
objects can both legitimately carry `runStatus: 'paused'` (set when a `stop()` request — either
mode — was observed at a loop boundary; `resume()` simply passes through whatever `runStatus`
was last persisted, including `'paused'`). `handleExecutorCommand`'s shared `emitSuccess()`
inspects `result.runStatus` and sets exit code **8** when it is `'paused'`, else **0** — this is
a no-op check for `reconcile`/`stop`/`replan` (their result shapes never carry a `runStatus`
field at all) and never applies to `status`/`diagnose` (still `NOT_IMPLEMENTED`, so they never
reach the success path).

---

## JSON result schema

### Success (stdout, exit matches the table above)

Every command that has a real implementation returns a **versioned result object** —
`{ protocolVersion, ... }` — written to stdout as pretty-printed JSON. Per
`lib/task-executor/index.js`'s own JSDoc/return statements:

**`start` (`execute()`) and `resume`:**
```json
{
  "protocolVersion": 1,
  "runId": "<uuid>",
  "runStatus": "completed | blocked | paused",
  "tasks": [ { "taskId": "US-01-T01", "status": "checkpointed" } ]
}
```
`resume`'s object additionally carries `tasks[].nextAction` (the next-safe-action classification
from `reconcile()`) and a top-level `repairsApplied` array — both additive beyond the minimum
shape above.

**`stop`:**
```json
{
  "protocolVersion": 1,
  "runId": "<uuid>",
  "requestAccepted": true,
  "mode": "graceful | immediate",
  "idempotent": true,
  "terminationConfirmed": true,
  "killAttempts": [
    { "taskId": "US-01-T01", "attemptNumber": 1, "processIdentity": "ai-toolkit-task:...", "confirmed": true }
  ]
}
```
`idempotent` is present only on an idempotent replay. `terminationConfirmed`/`killAttempts` are
present only for a newly-accepted `immediate` request — never for `graceful`, never for an
idempotent replay.

**`reconcile`:**
```json
{
  "protocolVersion": 1,
  "runId": "<uuid>",
  "repairsApplied": [ { "taskId": "US-01-T01", "action": "registerCommitSHA" } ],
  "classifications": [ { "taskId": "US-01-T01", "classification": "...", "action": "..." } ]
}
```

**`replan`:**
```json
{
  "protocolVersion": 1,
  "originalRunId": "<uuid>",
  "successorPlanDigest": "<digest>",
  "taskMapping": [
    { "oldTaskId": "US-01-T01", "newTaskId": "US-01-T01", "carriesCompletion": true }
  ]
}
```

**`status`/`diagnose`:** no success shape exists yet — both are `NOT_IMPLEMENTED` stubs (see
above); every call surfaces the error shape below with `code: "NOT_IMPLEMENTED"`.

### Error (stderr, exit per the table above)

```json
{
  "status": "error",
  "code": "NO_LOCK_HELD",
  "message": "dispatchTaskAttempt: no repo-wide execution lease held by runId \"...\" at ..."
}
```

This is `bin/cli.js`'s real `emitError()` shape: `code` falls back to `'UNKNOWN'` if the thrown
error carries no `.code`; `message` falls back to `String(err)` if the error carries no
`.message`.

A malformed CLI invocation (e.g. missing a required flag) is a **usage error**, not one of the
JSON error shapes above: it writes a plain `Error: <message>` line to stderr and sets exit code 2
directly, without going through `mapExecutorErrorToExitCode`.

---

## Platform qualification

`execute()` checks `process.platform !== 'win32'` as its very first validation step — before any
other argument validation, before deriving the execution root, before touching the plan
snapshot, and before acquiring the ownership lease — and throws `PLATFORM_NOT_QUALIFIED` (exit
7) on any non-Windows platform. This reflects FTR-018's Gate-1 binding constraint: the E-02
process-supervision evidence (tree-kill via `taskkill`, tag-based liveness scanning via
`Win32_Process` CIM queries) that the executor's crash-recovery/stop/worker-liveness machinery
depends on is qualified for Windows only (US-08-TASK-BE-05). There is no implicit
cross-platform guarantee — other platforms require their own dedicated qualification proof
before `start` will run on them at all.
