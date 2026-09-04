# Deterministic Execution Ledger Foundation

## Feature ID
FTR-016

## Summary
Replace every duplicated, non-deterministic, LLM-driven implementation of the Execution
Ledger **writer** with a **single canonical JavaScript module** (`lib/execution-ledger.js`)
exposed through a **small, deterministic CLI facade** (`ai-toolkit ledger open|close|fail|skip`).
Today the ledger `{PREFIX}-token-ledger.json` is written in four incompatible ways — a
deterministic-but-unused copy in `bin/cli.js`, and three LLM-delegated copies inside
`pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js` that ask a haiku subagent to read/modify/write
JSON — plus a fifth raw-JSON writer inside the `define-feature` agent prose. This feature
collapses all of them onto one deterministic writer with crash-atomic, concurrency-safe,
**fail-closed** persistence, and migrates the existing writers to it **without changing the set
of activities that are currently tracked**. It builds the reliable foundation only; it
deliberately does not add tracking for activities that are invisible today, and it does not yet
*consolidate* the existing *readers* (recovery / write-actuals / cost calculation) into the
module — though it does apply the **minimal reader changes** needed to interpret the new `null`
(and legacy `0` / `"not_available"`) as "data unavailable".

## Problem Statement

The audit of the current ledger (approved) established a single root cause and its
consequences:

1. **Root cause — no deterministic writer reachable from the workflow runtime.** The Workflow
   sandbox exposes neither `fs` nor `require()`, so each workflow re-implemented the ledger as
   a prompt to a haiku LLM that performs the JSON read-modify-write. The deterministic JS
   helpers `appendLedgerEntry`/`updateLedgerEntry` in `bin/cli.js` are therefore unreachable at
   runtime and exist only as dead code exercised by tests.

2. **Four+ divergent implementations.** `bin/cli.js` (fs, unused), `pm-phase1.js` (LLM),
   `pm-phase2.js` (LLM), `pm-phase3.js` (LLM), and `define-feature.md` (raw-JSON prose) each
   encode the same logic differently. There is no single source of truth.

3. **Writes are non-deterministic and non-atomic.** An LLM performs the JSON edit with a plain
   `writeFileSync` — no temp+rename, no fsync, no locking, no schema validation. The persisted
   `FTR-014` ledger already carries the symptoms: inconsistent JSON formatting, out-of-schema
   type values, and entries that could be corrupted by a crash or by two parallel agents
   writing in the same wave.

4. **`define-feature` is not reliably recorded.** Its ledger write is LLM prose targeting a
   hard-coded `docs/features/` while this project's pipeline reads `internal_docs/features/`,
   its token value is hard-coded `0`, and the entry only exists if the LLM follows the prose
   faithfully.

5. **Unknown token consumption is encoded as `0`.** A missing/cached-agent measurement writes
   a literal `0`, which on resume overwrites a real positive value already on disk (the known
   resume clobber), and makes "unknown" indistinguishable from "genuinely zero".

This feature fixes 1–5 at the foundation. It does **not** widen coverage to activities that do
not currently write to the ledger (that is a follow-up feature).

## Actors

N/A — internal/technical feature

## Core Flow (Happy Path)

The flow describes how a ledger write happens after this feature ships. Every *writer* — the
CLI helpers, all three workflows, and `define-feature` — funnels through the same canonical
module.

### The canonical module and CLI facade

1. `lib/execution-ledger.js` is the **only** module that **creates or modifies** a ledger file
   (append + in-place update). It exposes deterministic operations: `open`, `close`, `fail`,
   `skip` (plus the internal read/merge primitives they use). Pre-existing *readers* used by
   token recovery, write-actuals, and cost calculation may temporarily remain outside the
   module; *consolidating* them is deferred to *Execution Ledger Coverage Completeness*. The
   **minimal** changes to those readers required to treat `null` / legacy `0` /
   `"not_available"` as "data unavailable" are, however, **in scope** for FTR-016 (see MVP).
2. `bin/cli.js` **imports** `lib/execution-ledger.js` and deletes its own duplicated
   `appendLedgerEntry`/`updateLedgerEntry` bodies (thin re-exports may remain for backward
   compatibility of the test surface, but they must delegate to the canonical module).
3. The CLI exposes a **small** facade with **explicit, cross-platform arguments** (no JSON
   interpolated into a shell string, no generic payload channel):
   - `ai-toolkit ledger open  --dir <featureDir> --prefix <PREFIX> --agent <key> --phase <phase> --model <model> [--attempt <n>]`
   - `ai-toolkit ledger close --dir <featureDir> --prefix <PREFIX> --agent <key> [--attempt <n>] [--tokens <int>]`
   - `ai-toolkit ledger fail  --dir <featureDir> --prefix <PREFIX> --agent <key> [--attempt <n>] [--error <text>]`
   - `ai-toolkit ledger skip  --dir <featureDir> --prefix <PREFIX> --agent <key> [--attempt <n>]`
   - When `--tokens` is **omitted**, `phase_delta_tokens` is recorded as `null` (unknown) —
     there is no need to pass a literal `null` through the shell.
   - Each subcommand prints a **structured result** (machine-readable status) so the caller can
     verify the outcome; a non-zero exit code always means the state was **not** persisted.

### A tracked activity (workflow)

4. Before dispatching a tracked `agent()` call, the workflow runs the facade command
   `ai-toolkit ledger open …` for that activity's operation. The workflow no longer contains
   any prompt asking an LLM to read/modify/write JSON — the LLM only issues a fixed command
   string and inspects its structured result.
5. `open` acquires a cross-process lock, reads the existing array (creating it only when the
   file is genuinely absent — see corruption handling below), appends **or updates in place**
   the entry identified by its `operation_id` with `status: "running"`, a JS-generated ISO-UTC
   `started_at`, `completed_at: null`, and `phase_delta_tokens: null`, then writes via
   temp-file (fsync) + atomic rename, then releases the lock. An idempotent re-`open` of an
   already-`running` operation preserves the original `started_at` and any existing positive
   token value.
6. **Fail-closed gate:** if `open` fails (lock timeout, corruption, I/O error), the workflow
   does **not** start the activity — it hard-stops and reports that the ledger state was not
   persisted.
7. After the `agent()` call returns, the workflow runs `ai-toolkit ledger close …` with the
   measured token delta (or omits `--tokens` when no telemetry is available). `close` locks,
   finds the entry by `operation_id` (or, for a legacy entry lacking one, by an unambiguous
   `agent` fallback), sets `status: "done"`, JS ISO-UTC `completed_at`, and the
   token value — but **never overwrites an existing positive token value with an unknown/null
   one**. On error the workflow runs `ai-toolkit ledger fail …`; on a deterministic skip
   decision it runs `ai-toolkit ledger skip …`.
8. **Fail-closed gate:** if `close`, `fail`, or `skip` returns a non-zero result, the workflow
   hard-stops and reports that the terminal state was not persisted. No facade error is
   swallowed or downgraded to a best-effort write.

### The `define-feature` phase

9. `define-feature` resolves the features root through a **deterministic precedence** (see
   *Features root resolution* below), locates `{PREFIX}-{slug}/` under it, and calls
   `ai-toolkit ledger open …` for `define-feature:define` in **exactly the directory the
   pipeline will later read**, then `ai-toolkit ledger close …` on completion.
10. Because the define-feature process cannot observe its own token consumption, its close
    **omits `--tokens`** so `phase_delta_tokens` is recorded as `null` — it does **not** invent
    `0` and does **not** estimate.

### End state

The ledger file for a run contains exactly the same set of entries it contains today (same
activity keys, same phases), but every one of them was written by the single deterministic
module: uniform JSON formatting, atomic + fsync + lock-guarded, unknown tokens represented
solely as `null`, each execution identified by a stable `operation_id`, unknown/legacy fields
preserved, and `define-feature` present in the correct directory.

## Out of Scope

Explicitly excluded from this feature (each forms a later feature):

- **Coverage of activities not tracked today** (discovery, ensure-*, read-pricing,
  parse-wb-write-estimates, process-log, commits, log-issues, count-open-issues, escalation,
  etc.). → future feature *Execution Ledger Coverage Completeness*.
- **Consolidating the existing ledger *readers*** (token recovery, write-actuals, cost
  calculation) into the canonical module. → *Execution Ledger Coverage Completeness*.
  *(In scope for FTR-016: only the **minimal** changes to those readers needed to interpret
  `null` / legacy `0` / `"not_available"` as "data unavailable" — type-compatibility, not
  consolidation or refactoring. See MVP.)*
- **Per-task granularity of the implementation phase** (impl is left coarse, per-phase). →
  *Execution Ledger Coverage Completeness*.
- **Per-finding remediation entries.** → *Execution Ledger Coverage Completeness*.
- **A resume orchestrator** that consumes the ledger to choose a restart point. → future
  feature *Task Checkpoints and Resume*.
- **The full checkpoint model.** → *Task Checkpoints and Resume*.
- **Input/output token split** (the ledger keeps a single scalar/`null`).
- **Any change to the assessment pipeline (`am-phase1.js`, `am-phase2.js`).**
- **General refactoring of the workflow scripts** beyond swapping ledger writes for the facade.
- **Automatic migration or "repair" of historical ledgers** during a normal update.
- **Automatic recovery of a corrupt ledger** — a corrupt file requires an explicit,
  operator-invoked recovery action; the normal path fails closed.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| Ledger file does not exist when `open` runs | The module creates it and appends the first entry — the only case where a fresh file is created |
| Ledger file is malformed JSON | The module **backs up** the corrupt file to a recoverable sidecar, **does not overwrite** the original, and **fails closed** with clear diagnostics (hard stop). It **never** silently continues on a fresh `[]`; creating a new ledger requires an explicit operator recovery action |
| Two agents in the same `pm-phase3` wave write concurrently | A cross-process lock serialises the read-modify-write; both updates are applied with **no lost update**. `temp+rename` alone is insufficient and is combined with locking |
| Lock is held by a live process | Callers retry with backoff up to a timeout, then fail loudly (fail-closed) rather than corrupting the file |
| Lock is stale (owner crashed) | Stale-lock detection (age/PID/heartbeat) reclaims the lock safely and proceeds; a stale lock never blocks the pipeline indefinitely |
| `close`/`fail` for an `operation_id` that was never `open`ed | **Fails clearly** (non-zero, structured error); it does **not** silently append-then-close |
| `close`/`fail` on a **legacy entry without `operation_id`** | Addressed by a **fallback on `agent`**, permitted only when it matches exactly one entry; zero or multiple matches → **fails for ambiguity**; the fallback does not add `operation_id` or migrate the entry |
| `skip` for an operation | Atomically **creates** a terminal `skipped` entry, **or** updates an existing entry for that `operation_id` to `skipped`, per a single deterministic rule — never a partial write |
| `close` with omitted `--tokens` (unknown) on an entry that already has a positive value | The positive value is **preserved**; the unknown value never clobbers it (resume-safety) |
| Re-`open` of an already-`running` operation (resume) | Idempotent: same `operation_id`, no duplicate entry; original `started_at` and any positive token value preserved |
| New attempt / rework of the same activity | A **new** `operation_id` → a distinct, correlatable entry; the previous attempt's entry is untouched |
| An entry carries legacy or unknown fields (`notes`, `attemptN` keys, `phase: "review"`, no `operation_id`) | The fields are **preserved** verbatim across updates; the writer touches only the fields it owns; legacy entries without `operation_id` stay readable and are not auto-migrated |
| A historical `FTR-014`-style ledger is opened for an update | It parses and updates without crashing and **without rewriting/repairing** unrelated legacy values |
| Interrupted between `open` and `close` | The entry remains `status: "running"` with `completed_at: null` — the correct "interrupted here" signal (consumed by a future resume feature, not this one) |
| Machine loses power mid-write | temp-file is fsync'd before the atomic rename, and the directory is flushed where the platform supports it, so the ledger is never left partially written; the residual durability guarantee per platform is documented (see Atomicity vs Durability) |
| Feature directory path contains spaces | All CLI invocations quote/escape correctly on Windows and POSIX; no path splitting |
| Features root is ambiguous (two valid roots resolve) | `define-feature` **hard-stops** rather than guessing which directory to write into |

## Data Model

This is an internal/technical feature with no domain entities, but it standardises the
**ledger record schema** written by the canonical module. Each entry is an object in a JSON
array:

| Field | Type | Notes |
|-------|------|-------|
| `operation_id` | string | **Stable identity of a single execution**, derived deterministically from feature/prefix + `agent` + `attempt` (see Entry identity). Legacy entries may lack it |
| `agent` | string | activity key, e.g. `generate-requirements:phase1`, `define-feature:define` |
| `phase` | string | pipeline phase label (existing values preserved) |
| `model` | string | model tier declared for the activity |
| `status` | string | `running` \| `done` \| `failed` \| `skipped` (the current vocabulary — see below) |
| `phase_delta_tokens` | integer \| `null` | token consumption; **`null` (only)** when telemetry is unavailable |
| `started_at` | string (ISO-8601 UTC) | set on `open`, JS-generated only |
| `completed_at` | string (ISO-8601 UTC) \| null | `null` while running; set on `close`/`fail`/`skip` |

**Unknown-token representation — decided:** the writer records `phase_delta_tokens: null`
(and nothing else) when consumption is not observable. Readers must **tolerate** the legacy
values `0` and the string `"not_available"` already present on disk, treating **both as "data
unavailable"** — they must **not** be converted into an observable real consumption of zero in
recovery, actuals, or cost calculations. Going forward the writer emits exactly `null`.

**Entry identity (`operation_id`):** idempotency must not key on `agent` alone, because a real
ledger can contain several entries with the same activity key across reworks/attempts. A single
execution has a stable `operation_id` derived deterministically from the **feature/prefix, the
`agent` key, and the `attempt`** — i.e. exactly the inputs the CLI exposes (`--agent`,
`--attempt`, plus the `--dir`/`--prefix` that identify the ledger). No other, un-exposed "run
context" participates in the identity. Invariants:

- **Retry / resume of the same operation** → same `attempt` → same `operation_id`, no duplicate
  entry.
- **New execution or rework** → the caller **explicitly increments `attempt`** → a new
  `operation_id`, a distinct correlatable entry.
- `close`/`fail` address **exactly one** entry: by `operation_id` for entries this module wrote,
  or — for a **legacy entry lacking `operation_id`** — by a **fallback on `agent`** that is
  permitted **only** when it matches exactly one entry. Zero or multiple matches → the operation
  **fails for ambiguity**. The fallback neither adds `operation_id` nor otherwise migrates the
  entry.
- **Legacy entries without `operation_id`** remain readable and are **not** auto-migrated.
- An idempotent `open` on an entry already `running` preserves the original `started_at` and any
  existing positive token value.

The concrete `operation_id` format is specified in the Tech-Spec; the inputs that determine the
identity must coincide with those the CLI exposes, and the invariants above are binding at the
feature level.

**Status vocabulary compatibility:** the current/legacy vocabulary `running/done` (plus
`failed/skipped` already used by pm-phase2) is retained unchanged. `open → running`,
`close → done`, `fail → failed`, `skip → skipped`. No legacy status is renamed. The schema
does not preclude a richer future vocabulary: readers must not reject unknown status strings.

## Atomicity vs Durability

`temp + rename` guarantees a reader never sees a partially written file (atomicity), but does
**not** by itself guarantee the data survives a machine power loss (durability). The module
must therefore:

- **fsync the temp file** before the rename;
- perform a **rename that is atomic on both Windows and POSIX**;
- **flush the containing directory** where the platform supports it;
- **document the residual behavior** on platforms where a guarantee (e.g. directory fsync) is
  unavailable, rather than silently assuming it.

Tests cover **atomicity** (no partial/corrupt file on an interrupted write). The Tech-Spec must
state clearly the level of **durability** actually achievable per platform.

## Features root resolution

`define-feature` (and any caller that must locate the feature directory) resolves the features
root by a **deterministic precedence** — no hard-coded global default:

1. an **explicit path** received on the command line;
2. an **existing root** indicated by the project's conventions (e.g. declared in `AGENTS.md`);
3. **`internal_docs/features`** for this toolkit repository;
4. **`docs/features`** as the default for consumer projects;
5. **hard stop** if two valid roots are ambiguous (never guess).

`internal_docs/features` is **not** hard-coded as global behavior; it is only this repo's
resolved value under the precedence above.

## Residual limitation of v1 (documented, by design)

The workflow runtime does not expose the filesystem or process execution directly, so the
workflows **still use an agent to invoke the CLI command**. What changes is that **all ledger
logic is deterministic JavaScript inside the module** — the agent only dispatches a fixed
command string and **must verify the facade's structured result** before proceeding (fail-closed
per AC-19/AC-20). The residual dependency is limited to command *dispatch*, not to any JSON
read-modify-write logic. Removing even the dispatch dependency is out of scope for v1.

## Roles and Permissions

N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | The repository after this feature ships | The source tree is inspected | A single canonical module exists at `lib/execution-ledger.js` and is the only place that **creates or modifies** a ledger file (readers used by recovery/actuals may remain outside for now) | Must |
| AC-02 | `bin/cli.js` after this feature | Code review | It imports `lib/execution-ledger.js` and no longer contains its own duplicated ledger read-modify-write bodies | Must |
| AC-03 | The CLI | `ai-toolkit ledger open\|close\|fail\|skip` is invoked with explicit flags | Each subcommand performs its operation deterministically, prints a structured result, and exits non-zero **iff** the state was not persisted | Must |
| AC-04 | `pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js` | Static analysis of the workflow sources | None of them contains a prompt asking an LLM to read, modify, or rewrite ledger JSON; every ledger write goes through the CLI facade | Must |
| AC-05 | A tracked activity that is recorded today | The migrated pipeline runs | An equivalent entry (same key, same phase) is produced by the canonical module — the tracked-activity set is unchanged from today | Must |
| AC-06 | A ledger write | It is performed | The write uses a temp file in the same directory, fsync'd, followed by an atomic rename (Windows + POSIX); a killed write never leaves a corrupted or truncated ledger | Must |
| AC-07 | Two processes updating the same ledger concurrently | Both run to completion | Both updates are present with no lost update; access was serialised by a cross-process lock | Must |
| AC-08 | A lock held past the timeout / a stale lock from a crashed owner | A new writer attempts to write | Timeout+retry applies for a live lock; a stale lock is safely reclaimed; the writer never corrupts the file and never blocks forever | Must |
| AC-09 | A malformed ledger file | The module opens it for a write | The corrupt content is backed up to a recoverable sidecar, the original is **not** overwritten, and the operation **fails closed** with diagnostics; a fresh ledger is created only by an explicit recovery action | Must |
| AC-10 | An entry already has a positive `phase_delta_tokens` | `close` is called with `--tokens` omitted (unknown/`null`) | The existing positive value is preserved; `null` does not overwrite it | Must |
| AC-11 | An `open`/`close` targeting an existing `operation_id` | The operation runs twice (resume) | The update is idempotent — no duplicate entry for the same `operation_id`; a new attempt uses a new `operation_id` and yields a distinct entry | Must |
| AC-12 | An entry carrying unknown/legacy fields (incl. no `operation_id`) | `close`/`fail` updates it (addressed by the unambiguous `agent` fallback when it lacks `operation_id`) | The unknown fields are preserved verbatim; only owned fields change; the entry is updated in place **without** adding `operation_id` or migrating it; an ambiguous fallback fails | Must |
| AC-13 | A timestamp is written | Any `open`/`close`/`fail`/`skip` | `started_at`/`completed_at` are ISO-8601 UTC generated exclusively by JavaScript (no Bash `date`, no LLM) | Must |
| AC-14 | A project with a resolvable features root | `define-feature` records its ledger entry | The `define-feature:define` entry is written in the **same feature directory the pipeline later uses**, resolved by the deterministic features-root precedence; ambiguous roots hard-stop | Must |
| AC-15 | `define-feature` cannot observe its own token consumption | Its entry is closed | `phase_delta_tokens` is `null` — not `0`, not an estimate | Must |
| AC-16 | A real `FTR-014` ledger fixture (entries lacking `operation_id`) | It is opened and updated by the module | It parses and updates without error via the unambiguous `agent` fallback, without data loss, and without auto-migrating/repairing unrelated legacy values | Must |
| AC-17 | A feature directory whose path contains spaces | Every `ai-toolkit ledger …` subcommand runs on Windows and POSIX | The command succeeds; the path is never split | Must |
| AC-18 | Legacy `0` or `"not_available"` token values, or a `null` written by this module | Recovery, actuals, and cost calculation consume them | They are treated as "data unavailable" and are **never** turned into an observable real consumption of zero | Must |
| AC-19 | `ledger open` fails (lock/corruption/I/O) | The workflow evaluates the structured result | The activity is **not** started; the workflow hard-stops reporting the state was not persisted | Must |
| AC-20 | `ledger close`/`fail`/`skip` fails | The workflow evaluates the structured result | The workflow hard-stops reporting the terminal state was not persisted; no facade error is swallowed or downgraded to best-effort | Must |
| AC-21 | `close`/`fail` invoked for an `operation_id` that was never `open`ed | The command runs | It fails clearly (non-zero, structured error) rather than silently creating/closing an entry | Must |
| AC-22 | The installer runs against a destination project | Local/global installations are produced | The migrated files (`pm-phase*.js`, `define-feature.md`) are propagated **only** by the catalog-driven installer; no manually synced dual copies are required, and packaging/installation tests prove correct propagation | Must |

## MVP vs Deferred

### MVP (must ship in FTR-016)

- `lib/execution-ledger.js` canonical module: `open`/`close`/`fail`/`skip` + internal
  read/merge, atomic temp+**fsync**+rename write, cross-process lock (timeout, retry,
  stale-lock recovery), malformed-file **fail-closed** backup, `operation_id`-keyed idempotent
  update, unknown-field/legacy preservation, `null`-only unknown-token type, JS ISO-UTC
  timestamps, resume-safe token protection.
- A **small** `ai-toolkit ledger …` CLI facade with explicit cross-platform args and a
  structured result (no generic stdin/`--input-file` payload channel).
- `bin/cli.js` refactored to import the canonical module (duplicate bodies removed).
- Migration of the **currently-tracked** writes only, to the facade, in `pm-phase1.js`,
  `pm-phase2.js`, `pm-phase3.js`, and `define-feature.md`, with **fail-closed** result checks.
- `define-feature` features-root resolution fix + `null` unknown-token representation.
- **Minimal `null`-compatibility updates to the existing readers** — the token-recovery guard
  and the write-actuals reader in `pm-phase3.js`, and the actuals/cost-calculation step in
  `src/claude/skills/implement-feature/SKILL.md` — so that `null`, legacy `0`, and
  `"not_available"` are all read as "data unavailable" and never rendered as an observable real
  consumption of zero. This is **strictly type-compatibility**, not reader consolidation or
  refactoring (which is deferred).
- Full test suite (see Test Requirements list in Dependencies/Assumptions and the ACs),
  including packaging/installation tests for catalog-driven propagation.

### Deferred (explicitly later features)

- Consolidating the ledger *readers* (recovery/write-actuals) into the module → *Execution
  Ledger Coverage Completeness*.
- Wrapping the currently-untracked activities → *Execution Ledger Coverage Completeness*.
- Per-task implementation granularity and per-finding remediation entries → *Execution Ledger
  Coverage Completeness*.
- Resume orchestrator and full checkpoint model → *Task Checkpoints and Resume*.
- Input/output token split; richer status vocabulary; assessment-pipeline (AM) ledger.
- Removing the agent-based command *dispatch* (the documented v1 residual limitation).

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Cross-process lock mechanism: `proper-lockfile`-style directory/lockfile with mtime heartbeat, vs an O_EXCL sentinel with PID+timestamp? Must be dependency-light and cross-platform. | High — determines correctness of the no-lost-update and stale-lock guarantees |
| 2 | Invocation is **decided**: the agent runs `ai-toolkit ledger …` **directly** (never via `run-asset`) and reads the structured JSON on stdout + the exit code. Open point: the exact cross-platform shell-quoting/escaping helper for argument passing. | Medium — the mechanism is fixed; only the quoting helper remains |
| 3 | Concrete `operation_id` format from feature/prefix + `agent` + `attempt`, and how `--attempt` maps to reworks in each phase. | Medium — the identity inputs are fixed to the CLI-exposed args; only the format is Tech-Spec |
| 4 | Directory-fsync durability on Windows: what guarantee is actually achievable, and how is the residual behavior documented? | Medium — affects the durability statement, not atomicity |
| 5 | Where the features-root precedence reads the "project conventions" root (parse `AGENTS.md`, a dedicated config key, or only the explicit CLI path)? | Medium — determines the AC-14 fix and cross-project portability |

## Dependencies and Assumptions

- **Module location:** the canonical module lives at `lib/execution-ledger.js` and is a
  capability of the `ai-toolkit` npm CLI — it is **not** created as
  `src/claude/scripts/ledger.js` and is **not** distributed as an installed Claude runtime
  asset.
- **Canonical sources & catalog-driven install:** the canonical runtime sources are
  `src/claude/workflows/pm-phase1.js`, `src/claude/workflows/pm-phase2.js`,
  `src/claude/workflows/pm-phase3.js`, and `src/claude/agents/define-feature.md`. Local and
  global installations under `.claude/` (and the global home) are generated **exclusively by
  the catalog-driven installer** — installed copies are never edited or hand-synced. This
  supersedes the obsolete FTR-013 "dual-copy" convention (aligned with FTR-015).
- **Ledger path unchanged:** the file remains `{featureDir}/{PREFIX}-token-ledger.json`; only
  the writer changes. `featureDir` is resolved via the deterministic features-root precedence
  (see *Features root resolution*), matching what the pipeline reads.
- **Workflow invocation (v1 residual limit):** workflows invoke the facade **directly** as
  `ai-toolkit ledger open|close|fail|skip …` — **not** via `ai-toolkit run-asset`, which is
  reserved for catalogued JavaScript assets under `scripts/`; the ledger is a capability of the
  npm CLI, not a runtime asset. The LLM only runs the fixed command, then **verifies the
  structured JSON printed on stdout and the exit code** before proceeding; it performs no JSON
  read-modify-write logic. Command dispatch remains agent-mediated by design (documented above).
- **Backward compatibility is mandatory:** existing ledgers (e.g. `FTR-014`) with legacy `0`,
  `"not_available"`, extra fields, entries lacking `operation_id`, and out-of-enum phases must
  keep parsing and updating; the writer must not migrate or repair them during a normal update.
- **`temp + rename` is not sufficient alone** — parallel agents (pm-phase3 waves) can issue
  concurrent read-modify-write (a cross-process lock is required in addition), and it does not
  provide durability (fsync is required; see *Atomicity vs Durability*).
- **Timestamps** are generated exclusively in JavaScript as ISO-8601 UTC — no Bash `date`, no
  LLM substitution.
- **Test requirements (must be included):** create/open/close/fail/skip; ISO-UTC timestamps;
  `operation_id` idempotency (retry = same id, rework = new id); resume re-`open` preserves
  `started_at` + positive tokens; `close` with omitted `--tokens` records `null`; protection of
  a positive token from an unavailable-value update; recovery/actuals/cost never turn
  `null`/`0`/`"not_available"` into an observable zero; malformed JSON → backup + no overwrite +
  fail-closed (no silent `[]`); atomic write (temp+fsync+rename, no partial file on kill); two
  concurrent processes with no lost update; lock timeout and stale-lock recovery; preservation
  of legacy and unknown fields (incl. entries without `operation_id`); compatibility with a real
  `FTR-014` fixture; features-root precedence resolution (incl. ambiguity hard-stop); fail-closed
  workflow behavior on `open`/`close`/`fail`/`skip` failure; `close`/`fail` on a nonexistent
  `operation_id` fails clearly; static tests forbidding JSON read-modify-write logic in the
  workflows; tests that all production writers go through the canonical module; cross-platform
  CLI tests with directories containing spaces; **packaging/installation tests** proving the
  catalog-driven installer propagates the migrated files correctly.
- **`npm test`** is the verification command after any change.
- **Sequencing:** this is the first of three features — *Deterministic Execution Ledger
  Foundation* (FTR-016) → *Execution Ledger Coverage Completeness* → *Task Checkpoints and
  Resume*. FTR-016 must not depend on the latter two.
