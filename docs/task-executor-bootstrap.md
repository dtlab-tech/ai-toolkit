# Task Executor Bootstrap

> Companion to [`docs/task-executor-cli.md`](task-executor-cli.md), which documents the CLI
> contract (commands, flags, exit codes, JSON schema) in detail and is not repeated here. This
> document covers the **operational** side: how a real operator/coordinator starts a run after
> Gates 1/2, the Windows-only qualification that gates whether `start` will run at all, and the
> persistence caveats an operator must know about before trusting a run's state — all pulled
> from FTR-018's own approved artifacts and test findings, not restated from memory.

---

## 1. The supervised delivery procedure after Gates 1/2

Once a feature's Requirements, Tech-Spec and Work Breakdown are approved (Gate 1 and Gate 2 both
recorded in `{PREFIX}-Approvals.md`), the `implement-feature` skill's **Step 6 — Launch the task
executor (Implementation Phase)** (`src/claude/skills/implement-feature/SKILL.md`) takes over.

The key behavioral change from the retired `pm-phase3` model, as stated in Step 6 itself:

- Implementation is **no longer dispatched as a subagent**. There is no `pm-phase3` workflow, no
  Tier-1 dispatch guard, and no `pm-phase3:dispatch` ledger entry for this step.
- Once Gate 2 is approved, the skill's job is limited to **presenting or launching one explicit
  `task-executor` start command** — the executor process itself then owns the repo, plans,
  executes, checkpoints and resumes tasks deterministically, independent of the chat.
- **No subagent orchestrates the run, and no assistant or agent involvement is required for each
  task transition once the run has started.** A single durable command launch is enough, and the
  run may keep going, checkpointing and resuming, even after the launching conversation ends.

Concretely (Step 6a), the skill builds:

```bash
ai-toolkit executor start \
  --project . \
  --feature <path-to-feature.md> \
  --max-concurrency 1 \
  --claude-path <resolved-claude-cli-path> \
  --task-timeout-ms <task-timeout-ms, e.g. 900000> \
  --agent-budget-usd <per-agent budget in USD, e.g. 5.00>
```

If the host's ordinary terminal capability can launch a durable external command, the skill
launches it directly so the process persists independently of the chat. If not, it shows the
exact command for the user to run themselves in a terminal — it does **not** fake a durable
launch by running it as a blocking in-chat command.

In both cases, the `run-id` printed by `start` must be captured — it is required for every
subsequent `status`, `diagnose`, `stop`, `reconcile`, `resume`, and `replan` call; there is no
implicit last-run selection.

**The run may outlive the launching conversation.** The skill explicitly does not block on the
run reaching a terminal state; it proceeds to its own Step 7 with whatever the latest status
reports at that point. To check on a run later — from the same conversation, a new one, or no
conversation at all — the operator uses the read-only `status` subcommand documented in
`docs/task-executor-cli.md`:

```bash
ai-toolkit executor status --project <path> --run-id <uuid>
```

Note, per the CLI reference, that `status` (like `diagnose`) is currently a stub that always
throws `NOT_IMPLEMENTED` (exit 1) — the command surface and its intended read-only summary shape
(task status counts, run status, total cost from the ledger) are defined, but the real body has
not been built yet (attributed there to `US-06-TASK-BE-01`). Until it lands, checking on a
running or finished executor run means reading the ledger and per-run state directly, or using
`reconcile`/`resume`, both of which are fully implemented and report each task's classification.

For the full flag reference, exit-code table, and JSON result schemas of every subcommand
(`start`, `status`, `diagnose`, `stop`, `reconcile`, `resume`, `replan`), see
`docs/task-executor-cli.md` — this document intentionally does not restate that contract.

---

## 2. Windows-only E-02 qualification

The executor's process-supervision guarantees — tree-kill of in-flight attempts, tag-based
worker-liveness scanning, and immediate-stop confirmation — are proven for **Windows only**. This
is FTR-018's Gate-1 binding constraint #3 (`FTR-018-Approvals.md`):

> **E-02 is Windows-only qualified.** Other platforms require dedicated proofs before their
> execution is enabled; no implicit cross-platform guarantee.

This is not a paper constraint: `execute()` in `lib/task-executor/index.js` checks
`process.platform !== 'win32'` as its **very first validation step** — before any other argument
validation, before deriving the execution root, before touching the plan snapshot, and before
acquiring the ownership lease — and throws `PLATFORM_NOT_QUALIFIED` (CLI exit code 7) on any
non-Windows platform (US-08-TASK-BE-05, behaviorally tested by US-08-TASK-TEST-02's
`platform-guard.test.js`, which asserts no agent dispatch and no worktree creation occur on a
simulated non-win32 platform).

In other words: there is **no implicit cross-platform guarantee, and no partial or best-effort
execution on other platforms**. On any platform other than Windows, `start` refuses to run at
all rather than degrading silently.

---

## 3. Persistence caveats

These are the real, already-confirmed caveats and limitations discovered during this feature's
own delivery. Each one is cited to its source rather than paraphrased from memory.

### a. E-01 residual: worktree persistence not re-reproduced in the isolated proof run

Per `FTR-018-Approvals.md`, Gate 1 section (OQ-01a / E-01 sub-point), the 2026-09-28 binding
closure of the agent-provenance proof carries an explicit residual:

> **Residual:** persistence not re-reproduced in this run (Write permission-denied); proven
> separately by the original Test B.

That is: the isolated 2026-09-28 proof run that closed the *definition-binding* question (verified
agent-hash → loaded definition) did **not** itself re-demonstrate worktree persistence, because
the Write tool was permission-denied in that isolated cwd. Persistence is proven by a separate,
earlier proof (the original Test B referenced in the same evidence record), not by this run. An
operator relying only on the E-01 dossier for "the whole chain is proven end-to-end in one run"
should know that persistence and definition-binding were proven in two separate runs, not one.

### b. Windows filesystem-race flake on atomic write (operational, not a code defect)

`store.js`'s state persistence uses a temp-write-then-rename atomic-write protocol
(`_atomicWriteFileSync` in `lib/task-executor/store.js`: open a same-directory exclusive temp
file, write, `fsyncSync`, close, then `fs.renameSync(tmpPath, filePath)`). This is the same
atomic-write discipline the executor's own production state persistence (`writeState`) relies on.

**Operational note:** under heavy concurrent I/O load on Windows (e.g. many parallel Jest workers
writing state files simultaneously), this rename step can occasionally hit a transient
filesystem error (EPERM / rename race) that is environment-load-dependent rather than
deterministic — it has not reproduced when run in isolation, and is not a defect in the
atomic-write logic itself. Anyone operating or testing the executor under high Windows I/O
contention should expect this as a known environmental characteristic, not treat an occasional
transient failure of this shape as evidence of a code bug.

### c. `resume()`/`reconcile()` only inspect and report — no automatic continuation

Confirmed by US-07-TASK-TEST-01 (`tests/task-executor/sequential.test.js`, commit `25b2663`):

> Finding, confirmed and NOT worked around: resume()/reconcile() only inspect and report - there
> is currently no way to actually continue/finish an interrupted run (execute() always mints a
> fresh runId and resets all tasks to pending). This is a known, explicit architecture gap, not a
> bug - documented in the test file for any future work that wants to add real continuation.

**Operator implication:** "resuming" a run today means safely inspecting what has already been
durably completed and getting an evidence-based classification per task — it does **not** mean
the interrupted run will automatically finish its remaining tasks. `execute()` always starts a
brand-new run (a fresh `runId`, all tasks reset to pending); there is no run loop wired into
`resume()`.

### d. Dormant concurrency gap in `dispatchTaskAttempt` (must be resolved before N>1 wiring)

Confirmed by US-08-TASK-TEST-01 (`tests/task-executor/parallel.test.js`, commit `2f06883`),
Finding B:

> a real, currently-dormant concurrency gap: two concurrent dispatchTaskAttempt calls requesting
> the IDENTICAL, not-yet-existing attemptNumber for the same task both dispatch real subprocesses
> - neither is rejected, only one attempt record persists, and its processIdentity is
> byte-identical for both calls (derived only from runId/taskId/attemptNumber), so persisted state
> cannot even reveal two real processes ran. Currently unreachable via any real production entry
> point (execute()'s only caller dispatches one attempt at a time sequentially, and no N>1
> orchestrator exists), but flagged prominently for whoever eventually wires real N>1 dispatch.

**Operator implication:** this race cannot fire today because `execute()` is strictly
sequential (`maxConcurrency=1` only; see docs/task-executor-cli.md — any other value is
rejected as `UNSUPPORTED_CONCURRENCY`, never silently downgraded) and no orchestrator calls
`dispatchTaskAttempt` concurrently. It is a **constraint that must be resolved before any future
N>1 wiring work** lands, not something safe to rely on or ignore once that work begins.

### e. Verification receipts already on disk are not consulted on resume (efficiency gap)

Confirmed by US-09-TASK-TEST-01 (`tests/task-executor/fault-injection.test.js`, commit `e601e3d`),
Finding 1:

> there is no distinct durable state for "verification passed, review not yet dispatched" - a
> crash in that exact window leaves reconcile() unable to tell it apart from "verification never
> ran", so a resume may safely but redundantly re-run verification commands whose receipts are
> already sitting on disk. Not an AC-10 violation (nothing is ever wrongly marked complete) - a
> design/efficiency observation for a future decision, not fixed here.

**Operator implication:** a resume after a crash in that narrow window is always *safe* (nothing
is ever falsely marked complete), but may be redundant — it can re-run verification commands,
including potentially expensive ones, that already passed and whose receipts already exist on
disk.

### f. N>1 parallel-execution primitives exist and are tested, but are not wired into `execute()`

`createTaskWorktree`, `createSlotPool` (US-08-TASK-BE-01/02), `integrateAttempt`
(`lib/task-executor/git.js`, US-08-TASK-BE-03) and `registerIntegratedSHA`
(`lib/task-executor/store.js`, US-08-TASK-BE-04) are all real, already-implemented functions, and
US-08-TASK-TEST-01's `parallel.test.js` exercises them together end-to-end for N=2/3 scenarios.
But as that same commit's message states plainly:

> there is no real "execute() with maxConcurrency=N" path yet (execute() still rejects anything
> but N=1), so this proves the standalone primitives compose correctly rather than exercising a
> not-yet-existing orchestrator.

**Operator implication:** these primitives are proven to compose correctly in isolation, but
`execute()` remains N=1 / sequential only. Do not expect `--max-concurrency` values other than
`1` to do anything but fail fast with `UNSUPPORTED_CONCURRENCY` today.
