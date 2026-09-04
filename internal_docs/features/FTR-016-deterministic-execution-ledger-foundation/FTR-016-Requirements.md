# Functional Requirements — Deterministic Execution Ledger Foundation

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-016: Deterministic Execution Ledger Foundation |
| Version | 1.0 |
| Date | 2026-08-27 |
| Status | Draft |

## 1. Introduction

### 1.1 Purpose
This document specifies the functional requirements for consolidating all execution-ledger write paths into a single canonical deterministic JavaScript module, eliminating non-deterministic LLM-driven JSON edits and establishing a reliable, atomic, and fail-closed foundation for tracking pipeline activities.

### 1.2 Scope

**In Scope:**
- A canonical deterministic module (`lib/execution-ledger.js`) with `open`, `close`, `fail`, `skip` operations
- A small CLI facade (`ai-toolkit ledger …`) with explicit cross-platform arguments and structured output
- A deterministic `ai-toolkit resolve-features-root` command (stdout = the resolved absolute path only) so the Markdown `define-feature` agent can obtain `featureDir` without embedding resolution logic in its prompt
- Migration of currently-tracked writes in `pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js`, and `define-feature.md` to use the facade
- Atomic write guarantees via temp-file, fsync, and cross-platform rename
- Cross-process lock mechanism to serialize concurrent updates
- Fail-closed behavior: operations must not proceed if ledger state is not persisted
- Deterministic features-root resolution for `define-feature` entries
- Minimal null-compatibility updates to existing readers (recovery, write-actuals, cost calculation) so that `null`, legacy `0`, and `"not_available"` are all treated as "data unavailable"
- Unknown-token representation as `null` only (not `0` or estimates)
- Preservation of legacy/unknown fields and backward compatibility with existing ledgers
- Full test suite including atomic-write, concurrency, lock-timeout, stale-lock recovery, malformed-file backup, and packaging/installation tests

**Out of Scope:**
- Coverage of activities not tracked today (discovery, ensure-*, read-pricing, parse-wb-write-estimates, process-log, commits, log-issues, count-open-issues, escalation)
- Consolidation of existing ledger readers into the canonical module (readers remain outside for now)
- Per-task granularity of the implementation phase
- Per-finding remediation entries
- Resume orchestrator or full checkpoint model
- Input/output token split
- Any change to the assessment pipeline (`am-phase1.js`, `am-phase2.js`)
- General refactoring of workflow scripts beyond swapping ledger writes
- Automatic migration or repair of historical ledgers during normal update
- Automatic recovery of corrupt ledgers (operator-invoked action required)
- Removing agent-based command dispatch (v1 residual limitation, documented by design)

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| Workflow Runtime | Calls `ai-toolkit ledger …` CLI commands to record activity lifecycle (`open`→`close`/`fail`/`skip`). Must evaluate structured results and fail-closed if a command returns non-zero. |
| Define-Feature Agent | Records the feature definition activity by resolving the features root and invoking the CLI facade; does not create/modify JSON directly. |
| Token Recovery Process | Consumes the ledger to recover unknown token values; must treat `null`, legacy `0`, and `"not_available"` as unavailable data. |
| Write-Actuals Process | Reads the ledger to populate token actuals; must tolerate and correctly interpret `null`, `0`, `"not_available"`. |
| Cost Calculation Step | Reads the ledger to compute costs; must handle `null`, `0`, `"not_available"` as data unavailable. |
| Operator | Explicitly invokes recovery actions to repair a corrupt ledger (not automatic in v1). |

## 2. Use Cases

### UC-01: Record a Tracked Activity Execution

| Field | Value |
|-------|-------|
| Actor | Workflow Runtime |
| Preconditions | A pipeline is executing; an activity (e.g., `generate-requirements:phase1`) is about to be dispatched via `agent()`. The feature directory and PREFIX are known. |
| Trigger | Workflow calls `ai-toolkit ledger open …` before dispatching the activity. |
| Priority | Must |

**Main flow:**
1. Workflow invokes: `ai-toolkit ledger open --dir <featureDir> --prefix <PREFIX> --agent <key> --phase <phase> --model <model> [--attempt <n>]`
2. CLI acquires a cross-process lock on the ledger file.
3. Module reads the existing ledger array (or creates it if the file is genuinely absent).
4. Module appends or updates the entry identified by `operation_id` with:
   - `status: "running"`
   - `started_at`: JS-generated ISO-UTC timestamp
   - `completed_at: null`
   - `phase_delta_tokens: null`
5. If the entry was already running (resume), original `started_at` and any existing positive token value are preserved.
6. Module writes via temp-file (fsync'd) + atomic rename; releases lock.
7. CLI prints a structured JSON result and exits zero.
8. Workflow evaluates the result; if non-zero, hard-stops and reports ledger state was not persisted.

**Alternative flows:**
- If the entry already has `status: "running"` (resume scenario), `started_at` and positive token values are idempotently preserved.

**Error flows:**
- Lock timeout or stale lock: CLI retries with backoff; if all retries fail, exits non-zero with clear diagnostics.
- Malformed ledger file: Module backs up the corrupt file to a recoverable sidecar, exits non-zero, does not overwrite the original.
- I/O error: CLI exits non-zero with diagnostics; caller must fail-closed.

**Postconditions:**
- The ledger file contains an entry with `operation_id`, `status: "running"`, ISO-UTC `started_at`, and `completed_at: null`.
- Lock has been released.
- Workflow may now safely dispatch the activity.

---

### UC-02: Complete a Tracked Activity Successfully

| Field | Value |
|-------|-------|
| Actor | Workflow Runtime |
| Preconditions | An activity has been opened (UC-01) and the `agent()` call has returned with a token measurement (or no telemetry). |
| Trigger | Workflow calls `ai-toolkit ledger close …` with the measured token delta or omits `--tokens` if unavailable. |
| Priority | Must |

**Main flow:**
1. Workflow invokes: `ai-toolkit ledger close --dir <featureDir> --prefix <PREFIX> --agent <key> [--attempt <n>] [--tokens <int>]`
2. CLI acquires a cross-process lock on the ledger file.
3. Module reads the ledger array.
4. Module finds the entry by `operation_id` (or by unambiguous `agent` fallback for legacy entries lacking `operation_id`).
5. Module sets:
   - `status: "done"`
   - `completed_at`: JS-generated ISO-UTC timestamp
   - `phase_delta_tokens`: the provided `<int>` or `null` if `--tokens` omitted
6. **Resume-safe:** If the entry already has a positive `phase_delta_tokens` value and `--tokens` is omitted (unknown), the existing positive value is **preserved**; unknown does not clobber it.
7. Module writes via temp-file (fsync'd) + atomic rename; releases lock.
8. CLI prints a structured JSON result and exits zero.
9. Workflow evaluates the result; if non-zero, hard-stops and reports ledger state was not persisted.

**Alternative flows:**
- Legacy entry without `operation_id`: Module uses `agent` as fallback, permitted only if it matches exactly one entry. Zero or multiple matches → fails for ambiguity.
- `--tokens` omitted: `phase_delta_tokens` is recorded as `null` (unknown).

**Error flows:**
- `operation_id` never opened: CLI fails clearly (non-zero, structured error); does not silently create/close an entry.
- Ambiguous fallback (zero or multiple `agent` matches): CLI exits non-zero with diagnostics.
- Lock timeout / I/O error: CLI exits non-zero; caller must fail-closed.

**Postconditions:**
- The entry has `status: "done"`, ISO-UTC `completed_at`, and `phase_delta_tokens` (either the provided value or `null`).
- Positive token values are never overwritten by unknown/null.
- Lock has been released.

---

### UC-03: Record Activity Failure

| Field | Value |
|-------|-------|
| Actor | Workflow Runtime |
| Preconditions | An activity has been opened (UC-01) and an error occurred during execution. |
| Trigger | Workflow calls `ai-toolkit ledger fail …` with optional error details. |
| Priority | Must |

**Main flow:**
1. Workflow invokes: `ai-toolkit ledger fail --dir <featureDir> --prefix <PREFIX> --agent <key> [--attempt <n>] [--error <text>]`
2. CLI acquires a cross-process lock.
3. Module reads the ledger array.
4. Module finds the entry by `operation_id` or unambiguous `agent` fallback.
5. Module sets:
   - `status: "failed"`
   - `completed_at`: JS-generated ISO-UTC timestamp
   - Optional `error` field (if `--error` provided)
6. Module writes via temp-file (fsync'd) + atomic rename; releases lock.
7. CLI prints a structured JSON result and exits zero.
8. Workflow evaluates the result; if non-zero, hard-stops and reports terminal state was not persisted.

**Alternative flows:**
- `--error` omitted: Only `status` and `completed_at` are set; no error details recorded.

**Error flows:**
- Same as UC-02 (lock timeout, ambiguous fallback, etc.).

**Postconditions:**
- The entry has `status: "failed"` and ISO-UTC `completed_at`.

---

### UC-04: Record Activity Skip

| Field | Value |
|-------|-------|
| Actor | Workflow Runtime |
| Preconditions | An activity has been opened (UC-01) or a deterministic skip decision is made before opening. |
| Trigger | Workflow calls `ai-toolkit ledger skip …`. |
| Priority | Must |

**Main flow:**
1. Workflow invokes: `ai-toolkit ledger skip --dir <featureDir> --prefix <PREFIX> --agent <key> --phase <phase> --model <model> [--attempt <n>]` (`--phase` and `--model` are required — they populate a newly-created entry).
2. CLI acquires a cross-process lock.
3. Module reads the ledger array and locates the entry by `operation_id`, else by unambiguous `agent` fallback.
4. **If exactly one entry matches:** update it to `status: "skipped"` and set ISO-UTC `completed_at`.
5. **If no entry matches:** atomically create a new terminal entry with `status: "skipped"`, `started_at == completed_at` (same JS-generated instant), the supplied `phase`/`model`, and `phase_delta_tokens: null` (never a partial write).
6. Module writes via temp-file (fsync'd) + atomic rename; releases lock.
7. CLI prints a structured JSON result and exits zero.
8. Workflow evaluates the result; if non-zero, hard-stops and reports state was not persisted.

**Alternative flows:**
- Skipped before opening (no match): a new terminal entry is created with `started_at == completed_at`.
- Skipped after opening (one match): the existing entry is updated in place; its original `started_at` is preserved.

**Error flows:**
- `agent` fallback matches multiple entries: CLI exits non-zero (ambiguous); nothing is written.
- Lock timeout / I/O error: CLI exits non-zero; caller must fail-closed.

**Postconditions:**
- The entry has `status: "skipped"` and ISO-UTC `completed_at`.
- A created entry has `started_at == completed_at`; an updated entry keeps its original `started_at`.

---

### UC-05: Record Feature Definition Activity

| Field | Value |
|-------|-------|
| Actor | Define-Feature Agent |
| Preconditions | The `define-feature` process is running; it must record its own execution in the ledger. |
| Trigger | Define-feature resolves the features root and invokes the CLI facade. |
| Priority | Must |

**Main flow:**
1. Define-feature resolves the features root **once** by invoking the deterministic CLI command `ai-toolkit resolve-features-root [--project <dir>] [--features-root <dir>]`, capturing the single absolute path it prints on stdout and appending `/{PREFIX}-{slug}` to form `featureDir`. (Define-feature is a Markdown agent and **cannot call the exported `resolveFeaturesRoot` function directly** — the command is the invocable facade; the resolver logic and BR-14 precedence live in `bin/cli.js`, outside `lib/execution-ledger.js`, which only ever receives an already-resolved `--dir`.)
2. The **same** captured `featureDir` value is reused for writing `feature.md` and for the ledger `--dir` — no second, divergent resolution in the prompt.
3. Before producing the feature document, calls: `ai-toolkit ledger open --dir <featureDir> --prefix <PREFIX> --agent define-feature:define --phase define --model sonnet`
4. Produces the feature document.
5. After completion, calls: `ai-toolkit ledger close --dir <featureDir> --prefix <PREFIX> --agent define-feature:define` (omits `--tokens` because token consumption is not observable → `phase_delta_tokens: null`).
6. The entry is written in the **same directory the pipeline will later read**.

**Alternative flows:**
- Token measurement unavailable: `--tokens` is omitted; `phase_delta_tokens` recorded as `null` (not `0`, not an estimate).

**Error flows:**
- Features root is ambiguous (two valid roots resolve): Define-feature hard-stops rather than guessing.
- Ledger I/O fails: Define-feature hard-stops; process is not recorded.

**Postconditions:**
- The `define-feature:define` entry is in the ledger at the correct features-root directory.
- `phase_delta_tokens` is `null` (token consumption not observable).

---

### UC-06: Handle Corrupt Ledger File

| Field | Value |
|-------|-------|
| Actor | CLI Facade |
| Preconditions | A ledger file exists but contains malformed JSON. |
| Trigger | Any `open`/`close`/`fail`/`skip` command attempts to read the file. |
| Priority | Must |

**Main flow:**
1. Module attempts to parse the ledger file as JSON.
2. Parsing fails (malformed JSON detected).
3. Module backs up the corrupt content to a recoverable sidecar file (e.g., `{PREFIX}-token-ledger.json.backup-{timestamp}`).
4. **Does not** overwrite the original file.
5. **Does not** create a fresh `[]` and continue silently.
6. Exits non-zero with clear diagnostics indicating the file is corrupt and where the backup is located.
7. Caller hard-stops and reports ledger state was not persisted.

**Alternative flows:**
- None; corrupt files are never automatically repaired.

**Error flows:**
- Backup write fails: Exits non-zero; original corrupt file remains untouched.

**Postconditions:**
- The corrupt file is preserved with a backup copy.
- The operation is not persisted.
- Operator must explicitly invoke a recovery action to repair the ledger.

---

### UC-07: Resume Execution After Interruption

| Field | Value |
|-------|-------|
| Actor | Workflow Runtime |
| Preconditions | An activity was previously `open`ed but not closed; the workflow is now retrying the same operation. |
| Trigger | Workflow calls `ai-toolkit ledger open …` again with the same `operation_id` (same `agent`, `attempt`). |
| Priority | Must |

**Main flow:**
1. Workflow invokes: `ai-toolkit ledger open --dir <featureDir> --prefix <PREFIX> --agent <key> --attempt <n> …` (same parameters as before).
2. CLI acquires lock and reads ledger.
3. Module finds the existing entry by `operation_id`.
4. Module **idempotently preserves** the original `started_at` and any existing positive `phase_delta_tokens` value.
5. **No duplicate entry** is created.
6. Module writes via temp-file + fsync + rename; releases lock.
7. CLI exits zero with the preserved entry state.
8. Workflow proceeds to execute the activity.

**Alternative flows:**
- None; resume uses the same `operation_id` inputs.

**Error flows:**
- Lock timeout: CLI retries and eventually fails closed.

**Postconditions:**
- The entry remains with its original `started_at` and positive token values.
- The entry is still marked `status: "running"`.
- No duplicate entry exists.

---

### UC-08: Execute a Rework of an Activity

| Field | Value |
|-------|-------|
| Actor | Workflow Runtime |
| Preconditions | An activity failed or was skipped and is being retried/reworked. The caller explicitly increments the `attempt` number. |
| Trigger | Workflow calls `ai-toolkit ledger open …` with a new `attempt` value. |
| Priority | Must |

**Main flow:**
1. Workflow invokes: `ai-toolkit ledger open --dir <featureDir> --prefix <PREFIX> --agent <key> --attempt <n+1> …` (new attempt number).
2. CLI computes a new `operation_id` (derived from feature/prefix + agent + new attempt).
3. Module reads the ledger and appends a **new, distinct entry** (previous attempt's entry remains unchanged).
4. New entry is initialized with `status: "running"`, ISO-UTC `started_at`, and `phase_delta_tokens: null`.
5. Module writes and releases lock.
6. CLI exits zero.
7. Workflow executes the activity again.

**Alternative flows:**
- None; rework always uses a new `attempt` and yields a distinct `operation_id`.

**Error flows:**
- Same as UC-01.

**Postconditions:**
- The ledger contains both the original attempt and the new rework attempt.
- Both entries are correlatable via the same `agent` key; the new one has a new `operation_id`.

---

### UC-09: Concurrently Update Ledger from Multiple Agents

| Field | Value |
|-------|-------|
| Actor | Workflow Runtime (multiple parallel processes, e.g., pm-phase3 wave) |
| Preconditions | Two or more agents in the same wave attempt to write the ledger simultaneously. |
| Trigger | Both agents call ledger commands (e.g., `close`) at the same time. |
| Priority | Must |

**Main flow:**
1. Agent A acquires the cross-process lock first.
2. Agent A reads the ledger, updates its entry, writes the file.
3. Agent A releases the lock.
4. Agent B acquires the lock (queued behind A).
5. Agent B reads the ledger (which now includes A's update).
6. Agent B updates its own entry.
7. Agent B writes and releases the lock.
8. Both updates are persisted; no lost update.

**Alternative flows:**
- Retries and backoff if lock timeout occurs.

**Error flows:**
- Both agents hit lock timeout: Both fail closed; one or both operations not persisted.

**Postconditions:**
- Both entries are persisted with their respective updates.
- No lost update or data corruption.

---

### UC-10: Recover from Stale Lock

| Field | Value |
|-------|-------|
| Actor | CLI Facade |
| Preconditions | A lock file exists, held by a process that has crashed or is no longer running — **or** left empty/malformed by a process that crashed in the create-then-write window (no readable PID). |
| Trigger | A new writer attempts to acquire the lock and detects staleness (well-formed: age + owner-not-alive) or an orphan (empty/malformed/incomplete lock older than the orphan threshold). |
| Priority | Must |

**Main flow:**
1. Every writer, on winning the O_EXCL create, **immediately writes its full owner token and fsyncs it before any other work** — narrowing (not eliminating) the create-then-write window.
2. A new writer attempts an O_EXCL create of the lock file and gets `EEXIST`.
3. It reads the existing lock's raw bytes **and its `fs.stat`**, then classifies it.
4. **Well-formed owner token** (`pid`, `startedAt`, `nonce`): judged **stale only if BOTH**: age (`now − startedAt`) > 30 s threshold **and** owner certainly not alive (`process.kill(pid, 0)` for a same-host pid).
5. Guarded reclaim: re-read the lock, confirm its **identity is unchanged** since detection (the `nonce` for a well-formed lock; the **raw bytes + `stat` tuple** for an orphan), then unlink and immediately retry the O_EXCL create (ABA-safe — never force-delete a lock whose identity changed).
6. New writer proceeds; lock is released normally after the write (only if the on-disk nonce still matches the owner token).

**Alternative flows:**
- Live lock: caller retries every 100 ms until the 5 s total deadline, then fails loud (fail-closed).
- **Liveness undeterminable** (pid on another host, or permission error on `process.kill`): the lock is treated as **not** stale — it is **not** deleted; the writer waits out the deadline and fails closed.
- **Empty / malformed / incomplete (orphan) lock** (owner crashed in the create-then-write window; no `pid` to check): staleness cannot use owner liveness, so it is judged **purely by the lock file's mtime age**. Older than the orphan threshold (30 s) → reclaimable via guarded reclaim (content + `stat` ABA check); younger → **wait** (a peer may be mid-write) — not force-deleted. This guarantees a malformed lock is always eventually reclaimable.

**Error flows:**
- Guarded reclaim finds the identity changed (nonce, or bytes/`stat`): abandon reclaim, resume normal acquisition.
- Deadline reached without acquisition: fail closed.

**Postconditions:**
- A genuinely stale lock is reclaimed; the pipeline resumes.
- A live or undeterminable lock eventually times out and fails closed.
- An empty/malformed/orphan lock is eventually reclaimable by mtime age and **never blocks the ledger permanently**.
- The lock is never force-deleted under ABA; the ledger is never corrupted or left partially written.

---

### UC-11: Verify CLI Facade Success

| Field | Value |
|-------|-------|
| Actor | Workflow Runtime |
| Preconditions | A ledger command has been invoked (open/close/fail/skip). |
| Trigger | Workflow evaluates the CLI result (exit code + stdout JSON). |
| Priority | Must |

**Main flow:**
1. CLI command exits with exit code 0 (success) or non-zero (failure).
2. CLI prints a structured JSON result on stdout.
3. Workflow parses the JSON result.
4. If exit code is 0, the ledger state was successfully persisted; workflow may proceed.
5. If exit code is non-zero, the ledger state was **not** persisted; workflow hard-stops and reports failure.

**Alternative flows:**
- Partial failures during concurrent writes: Lock serialization ensures atomicity; each writer either succeeds or fails cleanly.

**Error flows:**
- Exit code non-zero: Workflow hard-stops; activity does not proceed or terminal state is not persisted.
- Malformed JSON in stdout: Workflow treats as a failure.

**Postconditions:**
- Workflow behavior is fail-closed: if ledger command fails, the workflow hard-stops.

---

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | A single canonical module (`lib/execution-ledger.js`) is the **only** place that creates or modifies a ledger file. No other code path shall perform JSON read-modify-write on the ledger. | All writers (bin/cli.js, pm-phase1.js, pm-phase2.js, pm-phase3.js, define-feature.md) |
| BR-02 | `close` and `fail` **require an existing entry**: locate it by `operation_id`, else by `agent` fallback only if it matches exactly one entry. **Zero matches → fail (not found); multiple matches → fail (ambiguous).** `close`/`fail` never create an entry. | UC-02, UC-03 |
| BR-17 | `skip` locates the entry the same way (`operation_id`, else unambiguous `agent` fallback). If **exactly one** matches, it is updated to `skipped`. If **none** matches, `skip` atomically **creates** a terminal `skipped` entry with `started_at == completed_at`, using the supplied `--phase`/`--model` and `phase_delta_tokens: null`. If the `agent` fallback matches **multiple** entries → fail (ambiguous). `skip` is the only terminal command that may create an entry. | UC-04 |
| BR-03 | A positive `phase_delta_tokens` value already on disk must **never** be overwritten by an unknown/null value. This protects against resume clobber where a cached agent returns zero measurement. | UC-02, UC-07 |
| BR-04 | Unknown token consumption is represented as `null` only; the writer emits only a strictly positive integer or `null` going forward. **The CLI rejects `--tokens 0` (and negative/non-integer) as a validation error** so no new ambiguous zero is ever written. Legacy `0` and `"not_available"` on disk are tolerated and read as "data unavailable". | UC-02, readers (token recovery, write-actuals, cost calculation) |
| BR-05 | All timestamps (`started_at`, `completed_at`) are generated exclusively by JavaScript as ISO-8601 UTC. No Bash `date` command; no LLM substitution. | UC-01, UC-02, UC-03, UC-04, UC-05 |
| BR-06 | A file write is atomic: temp-file (fsync'd) + atomic rename (Windows + POSIX). A killed write must never leave a corrupted or truncated ledger. | All writers |
| BR-07 | Concurrent updates are serialized via a **single** cross-process lock algorithm (O_EXCL lockfile with an owner token **written and fsync'd immediately on creation**; 100 ms retry to a 5 s total deadline; guarded, ABA-safe stale reclaim of a *well-formed* lock only when age > 30 s AND owner certainly not alive; if liveness is undeterminable the lock is left and the writer fails closed). An **empty/malformed/incomplete lock** (create-then-write crash residue with no recoverable PID) is reclaimable by lock-file **mtime age alone** once older than the orphan threshold (30 s), guarded by a re-read **content + `stat` ABA check** before removal, so a malformed lock **never blocks the ledger permanently**. No update is lost; no file is corrupted. | UC-09, UC-10 |
| BR-08 | A malformed ledger file is backed up to a recoverable sidecar; the operation fails closed. A fresh ledger is created **only** by explicit operator recovery, never silently. | UC-06 |
| BR-09 | An idempotent re-`open` of an already-running operation preserves the original `started_at` and any existing positive token value. No duplicate entry is created. | UC-07 |
| BR-10 | A new attempt (rework) uses a new `attempt` number, which generates a new distinct `operation_id` and a correlatable but separate ledger entry. | UC-08 |
| BR-11 | Legacy entries **not touched by the current operation** are preserved verbatim, and on the target entry the writer touches **only the fields it owns**; unknown/legacy non-owned fields are never auto-migrated or renamed. The one nuance: `phase_delta_tokens` **is** an owned field on the `close` target, so a legacy `0`/`"not_available"` there follows the §4.2 close rule (omitted `--tokens` ⇒ normalise to `null`; positive ⇒ preserved) — this is not a violation of "preserve legacy", which applies to untouched entries and non-owned fields. | UC-02, all updates |
| BR-12 | The facade is invoked through the agent's Bash tool, which is a POSIX-compatible shell on every platform (Git Bash on Windows). A single POSIX single-quote escaping rule (`shellQuotePosix`) is applied to every dynamic argument; `JSON.stringify()` is not used for shell quoting. Paths containing spaces are mandatory-supported and never split; arguments with NUL/newline are rejected; `--error` is sanitised before transport. | All UC |
| BR-13 | A ledger file exists **only** when genuinely absent. If the file is corrupted, it is backed up; a fresh `[]` is never silently created. | UC-01, UC-06 |
| BR-14 | Features root is resolved via ordered, ambiguity-aware precedence: explicit CLI path → project convention (`AGENTS.md` `features_root` key, parsed by a **deterministic grammar**) → else the **single existing** default among `internal_docs/features` (toolkit) and `docs/features` (consumer). Candidates are gathered before deciding; if no explicit path/convention **and both defaults exist**, it is a **hard stop** (no guessing). The resolver lives in `bin/cli.js` (exported, tested under `tests/cli/`), never inside `lib/execution-ledger.js`, and is exposed to Markdown agents through the **`ai-toolkit resolve-features-root`** command (stdout = absolute path only; non-zero + empty stdout on failure). **`features_root` grammar:** one top-level `features_root:` value at column 0 (quotes stripped, inline `#` comment stripped); commented/blank lines ignored; **multiple uncommented declarations → error**; empty/NUL/newline value or non-existent path → error; absent key → fall through. | UC-05 |
| BR-15 | Define-feature does not observe its own token consumption; its entry closes with `phase_delta_tokens: null` (not `0`, not an estimate). | UC-05 |
| BR-16 | Workflows must fail-closed if any ledger command returns non-zero. The activity is not started (UC-01 failure), the activity is not executed (UC-01 success but UC-02/03/04 failure assumption), or the terminal state is not persisted (UC-02/03/04 failure). | All UC with workflows |

---

## 4. Data Requirements

### 4.1 Entities

#### Execution Entry (JSON object in ledger array)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `operation_id` | string | No* | Stable identity derived deterministically from feature/prefix + agent + attempt. Legacy entries may lack it; fallback on `agent` only if unambiguous. New entries always have `operation_id`. |
| `agent` | string | Yes | Activity key (e.g., `generate-requirements:phase1`, `define-feature:define`). Used as fallback identifier for legacy entries. |
| `phase` | string | Yes | Pipeline phase label (e.g., `phase1`, `phase2`, `phase3`, `define-feature`). Existing values preserved; no migration. |
| `model` | string | Yes | Model tier declared for the activity (e.g., `haiku`, `sonnet`). |
| `status` | string | Yes | `running` \| `done` \| `failed` \| `skipped`. Readers must tolerate unknown status strings. |
| `phase_delta_tokens` | integer(≥1) \| null | Yes | Token consumption. Values written by this module are a **strictly positive integer or `null`**. The writer never emits `0`; the CLI rejects `--tokens 0`. Existing legacy `0` and `"not_available"` on disk must be tolerated by readers as "data unavailable". |
| `started_at` | string (ISO-8601 UTC) | Yes | Set on `open`. Generated by JavaScript only. Format: `YYYY-MM-DDTHH:mm:ss.sssZ`. |
| `completed_at` | string (ISO-8601 UTC) \| null | Yes | `null` while running. Set on `close`/`fail`/`skip`. Generated by JavaScript only. |
| **Additional fields** | — | No | Unknown/legacy fields (e.g., `notes`, `attemptN` keys, extra properties) are preserved verbatim across updates; the writer does not migrate or delete them. |

\* `operation_id` is required for new entries created by the canonical module; legacy entries may lack it and will be handled via `agent` fallback.

#### Ledger File

| Aspect | Specification |
|--------|---------------|
| Location | `{featureDir}/{PREFIX}-token-ledger.json` |
| Format | JSON array of execution entries |
| Initial state | File does not exist; created on first `open`. |
| Atomicity | Temp-file (fsync'd) + atomic rename (Windows + POSIX). |
| Locking | Cross-process lock (timeout, retry, stale-lock detection) serializes concurrent updates. |
| Durability | fsync on temp file; directory fsync where platform supports it. Residual platform-specific behavior documented. |
| Backward compatibility | Existing ledgers (FTR-014, legacy `0`/`"not_available"`, extra fields) parse and update without error or data loss. |

### 4.2 Validation Rules

| Field | Validation Rule |
|-------|-----------------|
| `operation_id` | Non-empty string; deterministically derived from `[prefix, agent, attempt]`; must be stable across retries (UC-07). **Collision-resistant (128-bit), not guaranteed-unique**: identity derives from a 128-bit truncated sha256 of the exact tuple (`slice(0,32)` or the full digest — 64-bit `slice(0,16)` is insufficient), **not** from lossy character replacement — agent keys that collide under naive `:`/`/`→`-` substitution still yield distinct ids (see Tech-Spec §3.3). A truncated-hash collision is astronomically unlikely but not mathematically impossible; the property is stated as collision-resistance, not absolute uniqueness. |
| `agent` | Non-empty string; matches activity key in workflows or define-feature. |
| `phase` | Non-empty string; matches known pipeline phase labels or is preserved if legacy/unknown. |
| `model` | Non-empty string; matches known model tier or is preserved if unknown. |
| `status` | Must be one of: `running`, `done`, `failed`, `skipped`. Readers must tolerate unknown statuses. |
| `phase_delta_tokens` | For values this module writes: **integer ≥ 1** or `null` only (not the string `"null"`, never `0`). The CLI rejects `--tokens 0`/negative/non-integer. Legacy `0` and `"not_available"` on disk are tolerated on **read** as "data unavailable". On update: a positive on-disk value is never overwritten by `null`; an unavailable on-disk value (`0`/`"not_available"`/`null`) plus omitted `--tokens` normalises to `null`. |
| `started_at` | Valid ISO-8601 UTC string; must be set on `open` and remain unchanged on resume/update. |
| `completed_at` | Valid ISO-8601 UTC string on `done`/`failed`/`skipped`, or `null` while running. |
| Ledger array | Valid JSON array containing zero or more entry objects; does not accept a non-array root. |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Atomicity | All writes must use temp-file + fsync + atomic rename. A write interrupted by process kill must never leave a corrupted or truncated ledger. A reader must never see a partial file. |
| NFR-02 | Durability | Module fsync's the temp file before rename; flushes the directory where the platform supports it. Residual platform-specific durability level (e.g., Windows directory fsync support) is documented. |
| NFR-03 | Concurrency | Cross-process locks serialize concurrent updates. No lost update; no data corruption. Timeout + retry apply for live locks; stale locks are safely reclaimed. |
| NFR-04 | Lock Timeout | Fixed (not configurable in v1): retry every 100 ms until a 5 s total acquisition deadline, then fail closed. Stale-lock age threshold 30 s. Values documented in Tech-Spec §8. |
| NFR-05 | Determinism | All logic is deterministic JavaScript. No LLM invocation for JSON read-modify-write. Timestamps are JS-generated ISO-8601 UTC. Output is reproducible. |
| NFR-06 | Backward Compatibility | Existing ledgers (FTR-014, legacy fields, no `operation_id`, legacy token values) parse and update without error, data loss, or unwanted migration. |
| NFR-07 | Fail-Closed Behavior | Workflows must hard-stop if any ledger command returns non-zero. The activity is not started, executed, or terminal state is not persisted. No error is swallowed or downgraded. |
| NFR-08 | CLI Platform Support | The CLI facade works identically on Windows and POSIX. Paths containing spaces are correctly quoted/escaped. Exit codes and structured output are consistent across platforms. |
| NFR-09 | Performance | Ledger writes are fast enough to not block the workflow for more than a few hundred milliseconds in normal operation. Lock contention does not cause cascading timeouts. |
| NFR-10 | Observability | CLI exits with zero/non-zero; prints structured JSON result so the caller can verify outcome and diagnose failures. |
| NFR-11 | Correctness of Readers | Token recovery, write-actuals, and cost calculation must treat `null`, legacy `0`, and `"not_available"` as "data unavailable" and never turn them into an observable real consumption of zero. |
| NFR-12 | Test Coverage | Module-interface suite (`tests/lib/execution-ledger.test.js`): atomic-write, concurrency, lock-timeout, stale-lock recovery + ABA guard, **empty/malformed-lock (create-then-write crash) recovery via file-mtime + content/`stat` ABA**, malformed-ledger backup, resume idempotency, rework separation, legacy-field preservation (incl. the close-target token normalisation vs untouched-entry preservation distinction), FTR-014 fixture compatibility, `--tokens 0` rejection, operation_id collision-resistance (128-bit; `a:b`/`a/b`/`a-b`). **Per AGENTS.md, new pure functions in `bin/cli.js` (argument parser/dispatcher, `shellQuotePosix`, `resolveFeaturesRoot`, `readFeaturesRootConvention`, and the `resolve-features-root` command handler) are exported and tested under `tests/cli/`** — including features-root precedence + ambiguity hard stop and the `AGENTS.md` `features_root` grammar (multiple declarations, commented lines, invalid values). Plus fail-closed workflow behaviour and packaging/installation tests. |

---

## 6. UI Requirements

### 6.1 CLI Interface

The CLI facade exposes a small set of subcommands with explicit, cross-platform arguments. No UI/visual components; all interaction is command-line and structured output.

#### Subcommand: `ai-toolkit ledger open`

| Aspect | Specification |
|--------|---------------|
| Purpose | Open/create a ledger entry and mark it as running. |
| Arguments | `--dir <featureDir>` (absolute or relative path to the feature directory), `--prefix <PREFIX>` (feature ID prefix), `--agent <key>` (activity key), `--phase <phase>` (pipeline phase), `--model <model>` (model tier), `[--attempt <n>]` (optional attempt number; default 1 if omitted) |
| Output | Structured JSON on stdout: `{ "status": "ok" | "error", "operation_id": "...", "entry": {...} }` or error details. |
| Exit Code | 0 = success (entry is running); non-zero = failure (state not persisted). |
| Quoting | All paths are quoted/escaped correctly on Windows and POSIX. |

#### Subcommand: `ai-toolkit ledger close`

| Aspect | Specification |
|--------|---------------|
| Purpose | Mark a ledger entry as done and record token consumption (if available). |
| Arguments | `--dir <featureDir>`, `--prefix <PREFIX>`, `--agent <key>`, `[--attempt <n>]`, `[--tokens <int≥1>]` — **strictly positive integer**. `--tokens 0` (or negative / non-integer) is rejected as a validation error. Omit the flag entirely to record "unavailable" as `null`. |
| Output | Structured JSON on stdout. |
| Exit Code | 0 = entry closed successfully; non-zero = failure (incl. `--tokens 0`). |
| Resume-Safe | If the entry already has a positive token value and `--tokens` is omitted, the existing value is preserved. A legacy `0`/`"not_available"` (treated as unavailable) plus omitted `--tokens` normalises to `null`. |

#### Subcommand: `ai-toolkit ledger fail`

| Aspect | Specification |
|--------|---------------|
| Purpose | Mark a ledger entry as failed. |
| Arguments | `--dir <featureDir>`, `--prefix <PREFIX>`, `--agent <key>`, `[--attempt <n>]`, `[--error <text>]` (optional error message) |
| Output | Structured JSON on stdout. |
| Exit Code | 0 = entry marked failed; non-zero = failure. |

#### Subcommand: `ai-toolkit ledger skip`

| Aspect | Specification |
|--------|---------------|
| Purpose | Mark an activity as skipped — update the matching entry if present, else atomically create a terminal skipped entry. |
| Arguments | `--dir <featureDir>`, `--prefix <PREFIX>`, `--agent <key>`, `--phase <phase>` (required), `--model <model>` (required), `[--attempt <n>]` |
| Output | Structured JSON on stdout. |
| Exit Code | 0 = entry marked skipped; non-zero = failure (incl. ambiguous `agent` fallback). |
| Create semantics | When no entry matches, a new entry is created with `started_at == completed_at` and `phase_delta_tokens: null`. |

#### Command: `ai-toolkit resolve-features-root`

| Aspect | Specification |
|--------|---------------|
| Purpose | Deterministically resolve the features root so the Markdown `define-feature` agent can obtain `featureDir` without embedding resolution logic (it cannot call the exported JS function directly). |
| Arguments | `[--project <dir>]` (project root; default CWD), `[--features-root <dir>]` (explicit path; highest precedence) |
| Output | **stdout: exclusively the resolved absolute path** (single line). **stderr: diagnostics only** (never the path). |
| Exit Code | 0 = resolved (path on stdout); non-zero = root absent, invalid `features_root` declaration, or ambiguous (both defaults present) — **nothing on stdout**. |
| Purity | Read-only; does **not** create directories. |
| Contract | `define-feature` invokes it **once** and reuses the exact stdout value for both `feature.md` and the ledger `--dir`; no duplicate resolution. |

### 6.2 Structured Output Format

All CLI subcommands print a JSON object on stdout with at least:

```json
{
  "status": "ok" | "error",
  "operation_id": "string or null",
  "entry": { /* the ledger entry object */ },
  "message": "string (on error)"
}
```

The workflow/agent must check `exit_code` and `status` field; if non-zero or error, hard-stop and report the failure.

---

## 7. Acceptance Criteria

| ID | Criterion | Related UC | Priority |
|----|-----------|-----------|----------|
| AC-01 | Given the repository after this feature ships, when the source tree is inspected, then a single canonical module exists at `lib/execution-ledger.js` and is the only place that **creates or modifies** a ledger file. | UC-01, UC-02, UC-03, UC-04 | Must |
| AC-02 | Given `bin/cli.js` after this feature, when code review is performed, then it imports `lib/execution-ledger.js` and no longer contains its own duplicated ledger read-modify-write bodies. | All UCs | Must |
| AC-03 | Given the CLI facade, when `ai-toolkit ledger open\|close\|fail\|skip` is invoked with explicit flags, then each subcommand performs its operation deterministically, prints a structured JSON result, and exits non-zero **iff** the state was not persisted. | UC-01, UC-02, UC-03, UC-04 | Must |
| AC-04 | Given `pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js`, when static analysis of the workflow sources is performed, then none of them contains a prompt asking an LLM to read, modify, or rewrite ledger JSON; every ledger write goes through the CLI facade. | All UCs | Must |
| AC-05 | Given a tracked activity that is recorded today, when the migrated pipeline runs, then an equivalent entry (same key, same phase) is produced by the canonical module — the tracked-activity set is unchanged from today. | UC-01 | Must |
| AC-06 | Given a ledger write, when it is performed, then the write uses a temp file in the same directory, fsync'd, followed by an atomic rename (Windows + POSIX); a killed write never leaves a corrupted or truncated ledger. | All UCs | Must |
| AC-07 | Given two processes updating the same ledger concurrently, when both run to completion, then both updates are present with no lost update; access was serialised by a cross-process lock. | UC-09 | Must |
| AC-08 | Given a lock held past the timeout or a stale lock from a crashed owner, when a new writer attempts to write, then timeout+retry applies for a live lock; a stale lock is safely reclaimed; the writer never corrupts the file and never blocks forever. | UC-10 | Must |
| AC-09 | Given a malformed ledger file, when the module opens it for a write, then the corrupt content is backed up to a recoverable sidecar, the original is **not** overwritten, and the operation **fails closed** with diagnostics; a fresh ledger is created only by an explicit recovery action. | UC-06 | Must |
| AC-10 | Given an entry that already has a positive `phase_delta_tokens`, when `close` is called with `--tokens` omitted (unknown/`null`), then the existing positive value is preserved; `null` does not overwrite it. | UC-02 | Must |
| AC-11 | Given an `open`/`close` targeting an existing `operation_id`, when the operation runs twice (resume), then the update is idempotent — no duplicate entry for the same `operation_id`; a new attempt uses a new `operation_id` and yields a distinct entry. | UC-07, UC-08 | Must |
| AC-12 | Given an entry carrying unknown/legacy fields (incl. no `operation_id`), when `close`/`fail` updates it (addressed by the unambiguous `agent` fallback when it lacks `operation_id`), then the unknown fields are preserved verbatim; only owned fields change; the entry is updated in place **without** adding `operation_id` or migrating it; an ambiguous fallback fails. | All UCs | Must |
| AC-13 | Given a timestamp is written, when any `open`/`close`/`fail`/`skip` occurs, then `started_at`/`completed_at` are ISO-8601 UTC generated exclusively by JavaScript (no Bash `date`, no LLM). | All UCs | Must |
| AC-14 | Given a project with a resolvable features root, when `define-feature` records its ledger entry, then it obtains `featureDir` by invoking `ai-toolkit resolve-features-root` **once** (stdout = the absolute path) and reuses that exact value so the `define-feature:define` entry is written in the **same feature directory the pipeline later uses**, resolved by the deterministic features-root precedence; ambiguous roots hard-stop (non-zero, empty stdout). | UC-05 | Must |
| AC-15 | Given `define-feature` cannot observe its own token consumption, when its entry is closed, then `phase_delta_tokens` is `null` — not `0`, not an estimate. | UC-05 | Must |
| AC-16 | Given a real `FTR-014` ledger fixture (entries lacking `operation_id`), when it is opened and updated by the module, then it parses and updates without error via the unambiguous `agent` fallback, without data loss, and without auto-migrating/repairing unrelated legacy values. | All UCs | Must |
| AC-17 | Given a feature directory whose path contains spaces, when every `ai-toolkit ledger …` subcommand runs on Windows and POSIX, then the command succeeds; the path is never split. | All UCs | Must |
| AC-18 | Given legacy `0` or `"not_available"` token values, or a `null` written by this module, when recovery, actuals, and cost calculation consume them, then they are treated as "data unavailable" and are **never** turned into an observable real consumption of zero. | All UCs | Must |
| AC-19 | Given `ledger open` fails (lock/corruption/I/O), when the workflow evaluates the structured result, then the activity is **not** started; the workflow hard-stops reporting the state was not persisted. | UC-01 | Must |
| AC-20 | Given `ledger close`/`fail`/`skip` fails, when the workflow evaluates the structured result, then the workflow hard-stops reporting the terminal state was not persisted; no facade error is swallowed or downgraded to best-effort. | UC-02, UC-03, UC-04 | Must |
| AC-21 | Given `close`/`fail` invoked for an `operation_id` that was never `open`ed, when the command runs, then it fails clearly (non-zero, structured error) rather than silently creating/closing an entry. | All UCs | Must |
| AC-22 | Given the installer runs against a destination project, when local/global installations are produced, then the migrated files (`pm-phase*.js`, `define-feature.md`) are propagated **only** by the catalog-driven installer; no manually synced dual copies are required, and packaging/installation tests prove correct propagation. | All UCs | Must |
| AC-23 | Given `ledger skip` for an `agent`/`operation_id` with **no** existing entry, when it runs, then it atomically creates a terminal `skipped` entry with `started_at == completed_at`, the supplied `--phase`/`--model`, and `phase_delta_tokens: null`; given **exactly one** existing match it is updated in place (original `started_at` preserved); given an `agent` fallback matching **multiple** entries it fails (ambiguous, non-zero). `close`/`fail` with zero matches still fail (never create). | UC-04 | Must |
| AC-24 | Given `ledger close --tokens 0` (or a negative / non-integer value), when the command runs, then it exits non-zero with a validation error and writes nothing; the module never persists `phase_delta_tokens: 0`. Omitting `--tokens` records `null`. | UC-02 | Must |
| AC-25 | Given agent keys that collapse to the same string under naive `:`/`/`→`-` replacement (`a:b`, `a/b`, `a-b`), when their `operation_id`s are computed, then all three ids are **distinct** (distinction/collision-resistance provided by the 128-bit tuple hash, not the slug); and given the same `[prefix, agent, attempt]` tuple, the id is identical across calls (deterministic). | UC-07, UC-08 | Must |
| AC-26 | Given a lock file left empty/malformed/incomplete by an owner that crashed in the create-then-write window (no recoverable PID), when a new writer attempts acquisition, then the lock is reclaimed once its file-mtime age exceeds the orphan threshold — via a guarded content + `stat` ABA check — so the ledger is **never blocked permanently**; a younger malformed lock is waited on, **not** force-deleted. | UC-10 | Must |
| AC-27 | Given `ai-toolkit resolve-features-root`, when it succeeds it prints **only** the resolved absolute path to stdout (exit 0); when it fails (missing / invalid / ambiguous root, or **multiple** uncommented `features_root:` declarations in `AGENTS.md`) it exits non-zero with diagnostics on stderr and **nothing on stdout**; a commented-out or inline-commented `features_root:` line is parsed per the deterministic grammar (ignored / value-stripped respectively). | UC-05 | Must |

---

## 8. Dependencies & Assumptions

### External Dependencies
- **No external npm lock library**: locking is implemented with Node.js built-ins only — a single O_EXCL lockfile algorithm (owner token = pid + startedAt + `crypto` nonce). Open question Q-1 is **resolved** (see Tech-Spec §3.5 / Appendix).
- **fs / Node.js built-ins**: The module uses `fs` (readFileSync, writeFileSync, renameSync, fsyncSync, openSync, unlinkSync, mkdirSync), `crypto` (nonce + operation_id hash), `path`, and `os`. Timestamps are generated with `new Date().toISOString()`.
- **Node.js version**: Must support the APIs used (fs, crypto, path, os). Minimum version pinned in Tech-Spec.

### Platform-Specific Behavior
- **Windows atomicity**: `fs.renameSync()` on Windows is atomic for same-volume moves.
- **POSIX atomicity**: `fs.renameSync()` on POSIX is atomic (POSIX rename semantics).
- **Directory fsync**: Windows does not support directory fsync; POSIX behavior documented.
- **Lock cleanup**: Stale-lock detection uses age + `process.kill(pid, 0)` liveness (no heartbeat). If liveness is undeterminable, the lock is not deleted and the writer fails closed.

### Assumptions
- **Module location**: The canonical module lives at `lib/execution-ledger.js` and is a capability of the `ai-toolkit` npm CLI.
- **Canonical sources**: `src/claude/workflows/pm-phase1.js`, `src/claude/workflows/pm-phase2.js`, `src/claude/workflows/pm-phase3.js`, and `src/claude/agents/define-feature.md` are the canonical runtime sources; installed copies (`.claude/` and global home) are generated **exclusively by the catalog-driven installer**.
- **Ledger path unchanged**: File remains `{featureDir}/{PREFIX}-token-ledger.json`.
- **Workflow invocation (v1 residual)**: Workflows invoke the facade **directly** as `ai-toolkit ledger …` (not via `run-asset`); the LLM only runs the fixed command and verifies the structured JSON result; no JSON read-modify-write logic.
- **Backward compatibility**: Existing ledgers (FTR-014, legacy fields, no `operation_id`) parse and update without error or data loss.
- **Timestamps exclusively JS**: No Bash `date`; no LLM timestamp substitution.
- **Test coverage**: Full suite must include atomic-write, concurrency, lock-timeout, stale-lock recovery, malformed-file backup, idempotency, legacy-field preservation, FTR-014 fixture compatibility, features-root precedence, fail-closed behavior, and packaging/installation tests.

### Known Limitations (Documented by Design)
- **v1 residual**: Workflows still use an agent to invoke the CLI command. Removing dispatch dependency is out of scope for v1.
- **Readers not consolidated**: Token recovery, write-actuals, and cost calculation remain outside the module for now; only **minimal null-compatibility** changes are in scope for FTR-016.
- **No automatic recovery**: A corrupt ledger requires explicit operator action; no automatic "repair" during normal update.

---

## 9. Open Questions

All open questions are **resolved for FTR-016** in the Tech-Spec; none are deferred.

| # | Question | Resolution (final for FTR-016) |
|---|----------|--------------------------------|
| 1 | **Cross-process lock mechanism** | **Resolved — single algorithm.** O_EXCL lockfile with owner token (pid + startedAt + `crypto` nonce); 100 ms retry to a 5 s total deadline; guarded ABA-safe stale reclaim only when age > 30 s AND owner certainly not alive; undeterminable liveness ⇒ leave lock, fail closed. No npm lock library. See Tech-Spec §3.5. |
| 2 | **Cross-platform shell quoting** | **Resolved.** Single POSIX transport shell (Git Bash on Windows); one `shellQuotePosix` rule; reject NUL/newline; sanitise `--error`; no `JSON.stringify()`-as-quoting. See Tech-Spec §3.6. |
| 3 | **Concrete `operation_id` format** | **Resolved — collision-resistant (128-bit).** `${prefix}-${slug(agent)}-${attempt}-${sha256_128([prefix,agent,attempt])}` (32 hex chars; 64-bit `slice(0,16)` rejected); collision-resistance from the truncated tuple hash, not the slug — stated as collision-resistant, **not** absolute uniqueness. `--attempt` maps to rework (increment) vs retry (same). See Tech-Spec §3.3. |
| 4 | **Directory-fsync durability on Windows** | **Resolved (documented residual).** Temp-file fsync always precedes the atomic rename; directory fsync on POSIX only; Windows directory-entry durability is best-effort — atomicity unaffected. See Tech-Spec §3.1 / Appendix Q-4. |
| 5 | **Features-root precedence & convention parsing** | **Resolved now (not v1.1).** explicit → `AGENTS.md` `features_root` (deterministic grammar) → single existing default of `internal_docs/features`/`docs/features`; both defaults present ⇒ hard stop. Resolver in `bin/cli.js` (tested under `tests/cli/`), not in the ledger module, and **exposed to the Markdown agent via the `ai-toolkit resolve-features-root` command** (stdout = absolute path only); `define-feature` invokes it once and reuses the result. See Tech-Spec §3.7. |

---

## Summary

This functional requirements document specifies the foundation for a deterministic, atomic, and fail-closed execution-ledger system. The canonical module (`lib/execution-ledger.js`) replaces four divergent, non-deterministic LLM-driven implementations with a single source of truth. All writers (workflow phases, define-feature) funnel through an explicit CLI facade (`ai-toolkit ledger open|close|fail|skip`) that ensures atomicity via temp+fsync+rename, concurrency safety via cross-process locks, and fail-closed semantics. The set of tracked activities remains unchanged; only the writer changes. Minimal null-compatibility updates to existing readers ensure legacy and unknown token values are treated as "data unavailable". The feature deliberately excludes coverage of untracked activities, reader consolidation, resume orchestration, and automatic ledger repair — each a follow-up feature.
