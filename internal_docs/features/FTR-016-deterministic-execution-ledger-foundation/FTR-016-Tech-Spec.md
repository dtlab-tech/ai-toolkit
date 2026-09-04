# Technical Specification — Deterministic Execution Ledger Foundation

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-016: Deterministic Execution Ledger Foundation |
| Version | 1.0 |
| Date | 2026-08-27 |
| Status | Draft |

---

## 1. Overview

FTR-016 replaces four divergent, non-deterministic, LLM-delegated ledger writers with a single canonical JavaScript module (`lib/execution-ledger.js`) and a small deterministic CLI facade (`ai-toolkit ledger open|close|fail|skip`). Today, the execution ledger is written:

1. **Dead code** in `bin/cli.js` via `appendLedgerEntry`/`updateLedgerEntry` (unused)
2. **Inline LLM prompts** in `pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js` that ask haiku subagents to read/modify/write JSON
3. **Raw-JSON prose** in `define-feature.md`

This feature consolidates all writes onto the canonical module, ensuring:
- **Deterministic**: no LLM in the JSON read-modify-write loop
- **Atomic**: temp-file + fsync + rename (Windows + POSIX), never partial writes
- **Crash-safe**: fail-closed on lock contention, malformed files, or I/O errors
- **Concurrency-safe**: cross-process locks with timeout/retry/stale-lock recovery
- **Resume-safe**: unknown token values recorded as `null` only, never overwriting existing positive values
- **Legacy-compatible**: existing ledgers parse and update without migration or data loss

The set of tracked activities remains unchanged; only the persistence mechanism changes. This feature is the foundation for future ledger enhancements (coverage completeness, resume orchestration, per-task granularity).

---

## 2. Architecture

### 2.1 System Context

The execution ledger exists within the feature delivery pipeline (`implement-feature` skill). This feature **migrates only the ledger writes that exist today** — it does not add coverage of any activity that is not tracked already. The set of tracked activities is unchanged; only the persistence mechanism changes (from LLM-delegated JSON edits to the deterministic CLI facade). Readers (token recovery, write-actuals, cost calculation) consume the ledger to aggregate token usage and estimate costs.

**Who writes (each migrates its current ledger writes, no new activities):**
- `define-feature.md` — records the feature-definition activity it already records
- `pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js` — record exactly the same activities they record today (enumerated in §2.1.1)

> Out of scope for FTR-016: adding ledger entries for activities not tracked today (e.g. `discovery`, `ensure-ledger`, `read-ledger`, `read-pricing`, `process-log`, commits, escalation counters, the assessment pipeline `am-phase1.js`/`am-phase2.js`). The Work Breakdown MUST NOT widen coverage beyond §2.1.1.

**Who reads (minimal updates in scope):**
- `pm-phase3.js` — token recovery (treat `null`/`0`/`"not_available"` as unavailable)
- `implement-feature/SKILL.md` (actuals step) — write-actuals and cost calculation (tolerate `null`/legacy values)

### 2.1.1 Tracked activities migrated (exhaustive)

The following is the **complete, closed set** of ledger writes migrated to the facade. It is derived from the current sources (`src/claude/workflows/pm-phase{1,2,3}.js`, `src/claude/agents/define-feature.md`). No key outside this table may be introduced by FTR-016.

| Source | `agent` key (as written to disk) | `phase` | `model` | Notes |
|--------|----------------------------------|---------|---------|-------|
| `define-feature.md` | `define-feature:define` | `define` | `sonnet` | Opened in step 1c, closed in step 4b. `--tokens` omitted → `null` (was `0`). |
| `pm-phase1.js` | `generate-requirements:phase1` | `phase1` | `haiku` | Conditional on `discoveryResult.needs_requirements`. |
| `pm-phase1.js` | `generate-tech-spec:phase1` | `phase1` | `haiku` | Conditional on `discoveryResult.needs_tech_spec`. |
| `pm-phase1.js` | `validate-feature-docs:phase1:cycle{N}` | `phase1` | `haiku` | One entry per revision cycle, `N = 1..3`. |
| `pm-phase2.js` | `generate-work-breakdown:phase2` | `phase2` | `haiku` | |
| `pm-phase2.js` | `wb-validate:phase2` | `phase2` | `haiku` | |
| `pm-phase2.js` | `validate-work-breakdown-semantic:phase2` | `phase2` | `sonnet` | |
| `pm-phase2.js` | `wb-render:phase2` | `phase2` | `haiku` | |
| `pm-phase3.js` | `read-wb-csv:phase3` | `phase3` | `haiku` | |
| `pm-phase3.js` | `{impl_group_agent_types joined by "+"}:{phase_id}[:rework{N}]` | `phase3` | `sonnet` | One per implementation phase; `:rework{N}` suffix on rework cycles (new `attempt`). |
| `pm-phase3.js` | `developer-testing:{phase_id}[:rework{N}]` | `phase3` | `sonnet` | Per implementation phase; rework variant as above. |
| `pm-phase3.js` | `review-solution:{phase_id}` | `phase3` | `sonnet` | Per implementation phase. |
| `pm-phase3.js` | `final-test-run` | `phase3` | `haiku` | |
| `pm-phase3.js` | `remediation` | `phase3` | `sonnet` | Conditional (only when remediation runs). |
| `pm-phase3.js` | `pr-and-registry` | `phase3` | `sonnet` | |
| `pm-phase3.js` | `write-actuals` | `phase3` | `sonnet` | |

Activities that run today **without** a ledger entry (e.g. pm-phase1 `ensure-ledger` and discovery, pm-phase3 `read-ledger` disk-merge reader) remain untracked — the migration does not open entries for them.

### 2.2 Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Feature Delivery Pipeline                    │
│  (implement-feature skill → pm-phase1 → pm-phase2 → pm-phase3)  │
└──────────┬──────────────────────────────────────────────────────┘
           │
           │ invokes
           ▼
┌─────────────────────────────────────────────────────────────────┐
│              ai-toolkit ledger open|close|fail|skip              │
│        (CLI facade in bin/cli.js / node command dispatcher)      │
└──────────┬──────────────────────────────────────────────────────┘
           │
           │ delegates to
           ▼
┌─────────────────────────────────────────────────────────────────┐
│          lib/execution-ledger.js (canonical module)              │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ open(dir, prefix, agent, phase, model, attempt)       │     │
│  │  → acquires lock                                       │     │
│  │  → reads ledger array (or creates empty)             │     │
│  │  → appends or updates entry by operation_id           │     │
│  │  → writes via temp+fsync+rename                       │     │
│  │  → releases lock, returns structured result           │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ close(dir, prefix, agent, tokens, attempt)            │     │
│  │  → finds entry by operation_id or agent fallback      │     │
│  │  → sets status=done, completed_at, tokens             │     │
│  │  → protects positive tokens from null overwrite       │     │
│  │  → atomic write, fail on nonexistent operation_id     │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ fail(dir, prefix, agent, error, attempt)              │     │
│  │  → finds entry, sets status=failed, completed_at      │     │
│  │  → optional error field                               │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ skip(dir, prefix, agent, phase, model, attempt)       │     │
│  │  → updates matching entry, else creates terminal one  │     │
│  │  → on create: started_at == completed_at              │     │
│  │  → atomic write                                        │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ Internal helpers:                                      │     │
│  │  - _readLedger(path): JSON parse + fail-closed        │     │
│  │  - _writeLedger(path, data): temp+fsync+rename        │     │
│  │  - _acquireLock(path): cross-process lock             │     │
│  │  - _releaseLock(path)                                 │     │
│  │  - _computeOperationId(prefix, agent, attempt)        │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
           │
           │ persists to
           ▼
┌─────────────────────────────────────────────────────────────────┐
│      {featureDir}/{PREFIX}-token-ledger.json                    │
│                                                                   │
│  [                                                               │
│    {                                                             │
│      "operation_id": "FTR-009-generate-requirements-phase1-1-3f9a1c07b2e4d5a6c8b0d1e2f3a4b5c6", │
│      "agent": "generate-requirements:phase1",                   │
│      "phase": "phase1",                                         │
│      "model": "haiku",                                          │
│      "status": "done",                                          │
│      "started_at": "2026-08-27T10:30:45.123Z",                │
│      "completed_at": "2026-08-27T10:35:22.456Z",              │
│      "phase_delta_tokens": 4250,                                │
│      "...": "unknown/legacy fields preserved verbatim"         │
│    },                                                            │
│    ...                                                           │
│  ]                                                               │
└─────────────────────────────────────────────────────────────────┘
           │
           │ reads (minimal updates in scope)
           ▼
┌─────────────────────────────────────────────────────────────────┐
│    Readers: token recovery, write-actuals, cost calculation     │
│    (treat null/0/"not_available" as "data unavailable")         │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Sequence Diagrams

**Sequence: Opening an activity (before agent dispatch)**

```
Workflow                 CLI Facade              lib/execution-ledger.js      Disk
   │                        │                           │                     │
   │ ai-toolkit ledger      │                           │                     │
   │ open --dir --prefix    │                           │                     │
   │ --agent --phase        │                           │                     │
   ├─────────────────────→  │                           │                     │
   │                        │ _acquireLock(path)        │                     │
   │                        ├──────────────────────────→ │                     │
   │                        │                           │ (await lock)         │
   │                        │                           │◄────────────────────│
   │                        │ _readLedger(path)         │                     │
   │                        ├──────────────────────────→ │ (parse JSON or [])  │
   │                        │                           │◄────────────────────│
   │                        │ _computeOperationId()     │                     │
   │                        │ append/update by op_id    │                     │
   │                        │ _writeLedger(temp+fsync)  │                     │
   │                        ├──────────────────────────→ │ temp file, fsync    │
   │                        │                           │◄────────────────────│
   │                        │                           │ atomic rename       │
   │                        │                           │ ─────────────────→  │
   │                        │ _releaseLock(path)        │                     │
   │                        ├──────────────────────────→ │ release lock        │
   │                        │                           │◄────────────────────│
   │ { status: ok,          │                           │                     │
   │   operation_id: "...", │◄─────────────────────────│                     │
   │   entry: {...} }       │                           │                     │
   │◄────────────────────── │                           │                     │
   │                        │                           │                     │
```

**Sequence: Concurrent close from two agents (pm-phase3 wave)**

```
Agent A                  Agent B              lib/execution-ledger.js         Disk
  │                        │                        │                       │
  │ ai-toolkit ledger      │                        │                       │
  │ close --agent A        │                        │                       │
  ├───────────────────────→│                        │                       │
  │                        │ _acquireLock()         │                       │
  │                        ├───────────────────────→ │                       │
  │                        │  (acquired)            │                       │
  │                        │◄───────────────────────│                       │
  │                        │                        │ (locked)               │
  │                        │ _readLedger()          │                       │
  │                        ├───────────────────────→ │ parse array          │
  │                        │◄───────────────────────│ (includes B's entry?  │
  │                        │                        │  NO — B is waiting)   │
  │                        │ update A's entry       │                       │
  │                        │ _writeLedger()         │                       │
  │                        ├───────────────────────→ │ temp+fsync+rename    │
  │                        │                        │ ─────────────────→   │
  │                        │ _releaseLock()         │                       │
  │                        ├───────────────────────→ │ lock released         │
  │ { status: ok }         │◄───────────────────────│                       │
  │◄───────────────────────┤                        │                       │
  │                        │ ai-toolkit ledger      │                       │
  │                        │ close --agent B        │                       │
  │                        ├───────────────────────→ │                       │
  │                        │                        │ _acquireLock()        │
  │                        │                        │ ─ (now available)     │
  │                        │                        │◄───────────────────→ │
  │                        │ _readLedger()          │                       │
  │                        ├───────────────────────→ │ (includes A's update)│
  │                        │◄───────────────────────│ parse fresh array    │
  │                        │ update B's entry       │                       │
  │                        │ _writeLedger()         │                       │
  │                        ├───────────────────────→ │ temp+fsync+rename    │
  │                        │                        │ ─────────────────→   │
  │                        │ _releaseLock()         │                       │
  │                        ├───────────────────────→ │                       │
  │ { status: ok }         │◄───────────────────────│ (both updates present)│
  │◄───────────────────────┤                        │                       │
```

**Sequence: Malformed ledger (fail-closed)**

```
Workflow                 CLI Facade              lib/execution-ledger.js      Disk
   │                        │                           │                     │
   │ ai-toolkit ledger      │                           │                     │
   │ open ...               │                           │                     │
   ├─────────────────────→  │                           │                     │
   │                        │ _acquireLock()            │                     │
   │                        ├──────────────────────────→ │ (acquired)          │
   │                        │◄──────────────────────────│                     │
   │                        │ _readLedger()             │                     │
   │                        ├──────────────────────────→ │ parse JSON          │
   │                        │                           │ (SyntaxError)       │
   │                        │ (corrupted, emit error)   │                     │
   │                        │ _backupCorruptFile()      │                     │
   │                        ├──────────────────────────→ │                     │
   │                        │                           │ copy to .backup-TS  │
   │                        │                           │ ─────────────────→  │
   │                        │ _releaseLock()            │                     │
   │                        ├──────────────────────────→ │                     │
   │ { status: error,       │                           │                     │
   │   message: "Ledger ... │◄─────────────────────────│                     │
   │   backed up to ..." }  │                           │                     │
   │◄────────────────────── │                           │                     │
   │ (exit code 1)          │                           │                     │
   │                        │                           │                     │
```

---

## 3. Backend

### 3.1 Data Model

#### Execution Ledger Entry (JSON object in array)

Each entry in the ledger JSON array is a JavaScript object with the following schema:

```javascript
{
  // Stable identity across retries/resume
  operation_id: string,  // e.g., "FTR-009-generate-requirements-phase1-1-3f9a1c07b2e4d5a6c8b0d1e2f3a4b5c6"
                         // Format: ${prefix}-${slug(agent)}-${attempt}-${sha256_128(tuple)}
                         // Collision-resistance from the 128-bit hash of
                         // [prefix, agent, attempt], NOT from the readable slug.
                         // Required for new entries.

  // Activity identification
  agent: string,         // e.g., "generate-requirements:phase1", "define-feature:define"
                         // Used as fallback for legacy entries lacking operation_id

  phase: string,         // e.g., "phase1", "phase2", "phase3", "define-feature"
                         // Existing values preserved; no migration

  model: string,         // e.g., "haiku", "sonnet", "opus"
                         // Model tier declared for the activity

  status: string,        // "running" | "done" | "failed" | "skipped"
                         // Readers must tolerate unknown status strings

  // Timestamps (ISO-8601 UTC, generated exclusively by JavaScript)
  started_at: string,    // e.g., "2026-08-27T10:30:45.123Z"
                         // Set on open, preserved on resume
                         // Format: new Date().toISOString()

  completed_at: string | null,  // ISO-8601 UTC string when done/failed/skipped
                                 // null while running

  // Token consumption (null when unavailable; the writer NEVER emits 0)
  phase_delta_tokens: integer | null,  // e.g., 4250 (≥ 1) or null
                                        // null exclusively when measurement unavailable
                                        // `--tokens 0` is rejected at the CLI (validation error)
                                        // Legacy 0 / "not_available" on disk: treated as unavailable by readers

  // Optional error details (set on fail)
  error?: string,        // Optional error message or diagnostics

  // Legacy/unknown fields
  // Any field not listed above is preserved verbatim across updates.
  // The writer does not migrate, rename, or delete unknown fields.
}
```

#### Ledger File

| Aspect | Specification |
|--------|---------------|
| **Location** | `{featureDir}/{PREFIX}-token-ledger.json` |
| **Format** | JSON array of execution entries (root must be an array, not object) |
| **Initial state** | Does not exist; created on first `open` |
| **Encoding** | UTF-8, 2-space indent |
| **Atomicity** | Temp-file (fsync'd) + atomic rename (Windows + POSIX) |
| **Concurrency** | Single O_EXCL lockfile algorithm; retry every 100 ms up to a 5 s total deadline (≈50 attempts), then fail closed (see §3.5) |
| **Durability** | fsync on temp file; directory fsync on POSIX (not Windows) |
| **Backward compatibility** | Parses and updates legacy entries (no `operation_id`, legacy `0` / `"not_available"`, extra fields) |

### 3.2 DTOs / Response Models

#### CLI Facade Response (Structured Output)

All `ai-toolkit ledger` subcommands print a JSON object to stdout:

```javascript
// On success
{
  status: "ok",
  operation_id: "FTR-009-generate-requirements-phase1-1-3f9a1c07b2e4d5a6c8b0d1e2f3a4b5c6",
  entry: {
    operation_id: "...",
    agent: "...",
    phase: "...",
    model: "...",
    status: "running" | "done" | "failed" | "skipped",
    started_at: "...",
    completed_at: "..." | null,
    phase_delta_tokens: integer | null
  }
}

// On error
{
  status: "error",
  operation_id: null,
  entry: null,
  message: "Lock timeout after 3 retries" | "Ledger corrupted; backed up to ..." | etc.
}
```

The workflow inspects:
- Exit code: 0 = persisted, non-zero = not persisted
- `status` field: "ok" or "error"
- If error, hard-stop immediately (fail-closed)

### 3.3 Validation

#### Operation ID Generation

```javascript
const crypto = require('crypto');

function computeOperationId(prefix, agent, attempt) {
  // Identity comes from a collision-resistant hash of the EXACT tuple.
  // A readable slug is prepended for human diagnosis ONLY — it never carries
  // identity, so lossy sanitization there is harmless.
  const canonical = JSON.stringify([String(prefix), String(agent), Number(attempt)]);
  // 128-bit truncation (32 hex chars). Collision-resistant, NOT a mathematical
  // guarantee of uniqueness. (Using the full-length digest is equally acceptable;
  // 64-bit / slice(0,16) is NOT — the birthday bound is too weak to claim
  // "distinct tuples always yield distinct ids".)
  const hash = crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 32);
  const slug = agent.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  // Format: {prefix}-{slug}-{attempt}-{hash32}
  // Example: "FTR-009-generate-requirements-phase1-1-3f9a1c07b2e4d5a6c8b0d1e2f3a4b5c6"
  return `${prefix}-${slug}-${attempt}-${hash}`;
}
```

Invariants:
- **Deterministic**: same `(prefix, agent, attempt)` always yields the same `operation_id`.
- **Collision-resistant (not guaranteed-unique)**: distinct tuples yield distinct ids **with overwhelming probability**. Identity derives from a 128-bit truncated sha256 of the JSON-encoded tuple, **not** from character replacement — a truncated-hash collision is astronomically unlikely but not mathematically impossible, so the property is stated as *collision-resistance*, not absolute uniqueness. Agent keys that would collide under naive `:`/`/`→`-` replacement (e.g. `a:b`, `a/b`, `a-b`) produce different hashes and therefore different ids.
- **Distinct per attempt**: different `attempt` → different `operation_id`.
- **Stable across retries**: same parameters → same `operation_id` (idempotent resume).

> The readable slug is derived by collapsing non-alphanumeric runs to `-`; because it precedes the 128-bit hash and the hash is computed from the raw tuple, two different agent keys that collapse to the same slug still receive different `operation_id`s. A test asserts this explicitly for `a:b`, `a/b`, `a-b` (§10, category 1).

#### Input Validation (CLI Arguments)

| Field | Validation |
|-------|-----------|
| `--dir` | Non-empty path (absolute or relative); resolves to a valid directory or is created |
| `--prefix` | Non-empty string; matches pattern `[A-Z]+-[0-9]+` (e.g., `FTR-009`) |
| `--agent` | Non-empty string; no quotes or shell metacharacters |
| `--phase` | Non-empty string; no quotes |
| `--model` | Non-empty string; matches known model tiers or is preserved |
| `--attempt` | Integer ≥ 1; defaults to 1 if omitted |
| `--tokens` | **Strictly positive integer (≥ 1).** `--tokens 0`, a negative value, or a non-integer is a **validation error** (non-zero exit; nothing written). Omit the flag entirely to record "unavailable" as `null`. The writer never emits `0`. |
| `--error` | Optional string (error message); sanitized before transport — see §3.6 quoting |

#### Ledger Array Validation

| Rule | Validation |
|------|-----------|
| Root must be array | `Array.isArray(ledger)` |
| Each entry must be object | `typeof entry === 'object' && !Array.isArray(entry)` |
| Required fields present | `agent`, `phase`, `model`, `status`, `started_at`, `completed_at` |
| Status enum | Must be one of: `running`, `done`, `failed`, `skipped` (readers tolerate unknown) |
| Token field type (writes) | Values written by this module are `integer ≥ 1` **or** `null`. The module never writes `0` or `"not_available"`. Legacy `0` / `"not_available"` are tolerated on **read** and treated as "data unavailable". |
| Timestamp format | ISO-8601 UTC string (regex: `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$`) or `null` |

#### Entry Identity Fallback (for legacy entries without `operation_id`)

When closing/failing an entry that lacks `operation_id`:
1. Search for entries where `entry.agent === agentKey`
2. Count matches: 0 → error "operation not found", multiple → error "ambiguous", exactly 1 → use it
3. Do **not** add `operation_id` to the legacy entry (preserve as-is)

### 3.4 API Endpoints

#### `ai-toolkit ledger open`

| Field | Value |
|-------|-------|
| **Purpose** | Open/create a ledger entry and mark it as running |
| **Invocation** | `ai-toolkit ledger open --dir <path> --prefix <PREFIX> --agent <key> --phase <phase> --model <model> [--attempt <n>]` |
| **Lock** | Acquires the cross-process lock (single O_EXCL algorithm — see §3.5); retries every 100 ms until a **5 s total** deadline, then fails closed |
| **Read** | Reads existing ledger array (or creates empty if file absent) |
| **Logic** | Computes `operation_id`; appends new entry OR updates existing entry by `operation_id` (if already running, preserves original `started_at` and positive tokens) |
| **Write** | Temp-file (fsync'd) + atomic rename |
| **Output** | `{ status: "ok", operation_id: "...", entry: {...} }` or `{ status: "error", message: "..." }` |
| **Exit code** | 0 on success, non-zero on failure |
| **Idempotency** | Re-opening same `operation_id` (same prefix/agent/attempt) returns success with preserved original `started_at` |
| **Error cases** | Lock timeout (retried), malformed ledger (backed up, hard-stop), I/O error (hard-stop) |

#### `ai-toolkit ledger close`

| Field | Value |
|-------|-------|
| **Purpose** | Mark an entry as done and record token consumption |
| **Invocation** | `ai-toolkit ledger close --dir <path> --prefix <PREFIX> --agent <key> [--attempt <n>] [--tokens <int>]` |
| **Lock** | Acquires lock with same retry policy as `open` |
| **Read** | Reads existing ledger array |
| **Logic** | Finds entry by `operation_id` (or unambiguous `agent` fallback for legacy); sets `status: "done"`, ISO-UTC `completed_at`. Token update rule (single coherent behaviour, tested): (a) `--tokens <n≥1>` provided → set `phase_delta_tokens = n`; (b) `--tokens` omitted **and** existing value is a **positive integer** → preserve the existing positive value (BR-03, resume-safe); (c) `--tokens` omitted **and** existing value is "unavailable" (`null`, legacy `0`, or `"not_available"`) → normalise to `null`. The writer never persists `0`. |
| **Write** | Temp-file (fsync'd) + atomic rename |
| **Output** | `{ status: "ok", operation_id: "...", entry: {...} }` or error |
| **Exit code** | 0 on success, non-zero on failure |
| **Resume-safe** | If entry already has positive `phase_delta_tokens` and `--tokens` is omitted, the positive value is preserved |
| **Error cases** | `operation_id` never opened (non-zero, clear error), ambiguous `agent` fallback (non-zero), lock timeout, malformed ledger |

#### `ai-toolkit ledger fail`

| Field | Value |
|-------|-------|
| **Purpose** | Mark an entry as failed |
| **Invocation** | `ai-toolkit ledger fail --dir <path> --prefix <PREFIX> --agent <key> [--attempt <n>] [--error <text>]` |
| **Lock** | Acquires lock with retry policy |
| **Read** | Reads existing ledger array |
| **Logic** | Finds entry by `operation_id` or unambiguous `agent` fallback; sets `status: "failed"`, ISO-UTC `completed_at`; if `--error` provided, sets optional `error` field |
| **Write** | Temp-file (fsync'd) + atomic rename |
| **Output** | `{ status: "ok", operation_id: "...", entry: {...} }` or error |
| **Exit code** | 0 on success, non-zero on failure |
| **Error cases** | Same as `close` |

#### `ai-toolkit ledger skip`

| Field | Value |
|-------|-------|
| **Purpose** | Mark an activity as skipped — update the matching entry if present, otherwise atomically create a terminal skipped entry |
| **Invocation** | `ai-toolkit ledger skip --dir <path> --prefix <PREFIX> --agent <key> --phase <phase> --model <model> [--attempt <n>]` |
| **Lock** | Acquires lock with retry policy |
| **Read** | Reads existing ledger array |
| **Logic** | Computes `operation_id`. **If exactly one matching entry exists** (by `operation_id`, else unambiguous `agent` fallback): update it to `status: "skipped"` and set ISO-UTC `completed_at`. **If no matching entry exists**: append a new terminal entry with `status: "skipped"`, `started_at == completed_at` (same JS-generated ISO-UTC instant), `phase`, `model`, and `phase_delta_tokens: null`. **If the `agent` fallback matches multiple entries**: fail for ambiguity (non-zero). |
| **Required args** | `--phase` and `--model` are **required** (needed to populate a newly-created entry); reused harmlessly on the update path. |
| **Write** | Temp-file (fsync'd) + atomic rename (atomic — never partial) |
| **Output** | `{ status: "ok", operation_id: "...", entry: {...} }` or error |
| **Exit code** | 0 on success, non-zero on failure |
| **Error cases** | Ambiguous `agent` fallback (non-zero), lock timeout, malformed ledger |

> **Contract distinction (skip vs close/fail):** `close` and `fail` **require** an existing entry — zero matches is an error (AC-21). `skip` is the only terminal command that may **create** an entry when none exists (a skip decision can be taken before any `open`).

### 3.5 Services

#### Module: `lib/execution-ledger.js`

Exports the following functions (CommonJS):

```javascript
/**
 * Open/create a ledger entry and mark it as running.
 * @param {string} featureDir - absolute or relative path to feature directory
 * @param {string} prefix - feature ID prefix (e.g., "FTR-009")
 * @param {string} agent - activity key (e.g., "generate-requirements:phase1")
 * @param {string} phase - pipeline phase (e.g., "phase1", "define-feature")
 * @param {string} model - model tier (e.g., "haiku", "sonnet")
 * @param {number} attempt - attempt number (default 1)
 * @returns {Promise<{status, operation_id, entry, message?}>}
 *   status: "ok" | "error"
 *   operation_id: string or null
 *   entry: ledger entry object or null
 *   message: error details (only on error)
 */
async function open(featureDir, prefix, agent, phase, model, attempt = 1) { ... }

/**
 * Mark a ledger entry as done and record token consumption.
 * @param {string} featureDir
 * @param {string} prefix
 * @param {string} agent
 * @param {number} tokens - token delta (or null if omitted)
 * @param {number} attempt
 * @returns {Promise<{status, operation_id, entry, message?}>}
 */
async function close(featureDir, prefix, agent, tokens = null, attempt = 1) { ... }

/**
 * Mark a ledger entry as failed.
 * @param {string} featureDir
 * @param {string} prefix
 * @param {string} agent
 * @param {string} error - optional error message
 * @param {number} attempt
 * @returns {Promise<{status, operation_id, entry, message?}>}
 */
async function fail(featureDir, prefix, agent, error = null, attempt = 1) { ... }

/**
 * Mark an activity as skipped. Updates the matching entry if exactly one exists
 * (by operation_id, else unambiguous agent fallback); otherwise atomically
 * creates a new terminal skipped entry with started_at == completed_at.
 * @param {string} featureDir
 * @param {string} prefix
 * @param {string} agent
 * @param {string} phase   - required; populates a newly-created entry
 * @param {string} model   - required; populates a newly-created entry
 * @param {number} attempt
 * @returns {Promise<{status, operation_id, entry, message?}>}
 */
async function skip(featureDir, prefix, agent, phase, model, attempt = 1) { ... }

// Exported for testing / manual recovery (not part of CLI facade)
function computeOperationId(prefix, agent, attempt) { ... }
// NOTE: features-root resolution is NOT part of this module — the writer receives
// an already-resolved --dir. See §3.7 (helper lives in bin/cli.js).
```

#### Internal Helpers (not exported)

```javascript
// Acquire a cross-process lock on the ledger file (single O_EXCL algorithm).
// Lock file: `${ledgerPath}.lock`. Owner token = { pid, startedAt (ISO-UTC),
// nonce (crypto.randomBytes hex) } written as JSON.
// Algorithm:
//   1. Try fs.openSync(lockPath, 'wx') (O_EXCL). On success, IMMEDIATELY write
//      the FULL owner-token JSON to the fd and fsync it, THEN close — so the
//      on-disk lock is complete before any other work runs. This narrows (but
//      cannot fully close) the create-then-write crash window; step 2 handles
//      the residue.
//   2. On EEXIST, read the existing lock AND its fs.stat, then classify it via
//      _isLockStale (see below):
//        - 'live'        → sleep retryIntervalMs and retry
//        - 'reclaimable' → guarded reclaim (see below), then retry O_EXCL create
//        - 'wait'        → sleep retryIntervalMs and retry (never delete)
//      A lock that is EMPTY, malformed JSON, or has an INCOMPLETE owner token
//      (missing pid/startedAt/nonce) is the create-then-write crash residue:
//      it has no recoverable PID, so it is classified purely by the lock FILE's
//      mtime age (see _isLockStale) and is ALWAYS eventually 'reclaimable'.
//   3. Repeat until the timeoutMs deadline; then throw (fail-closed).
// Returns the owner token so _releaseLock can prove ownership.
async function _acquireLock(lockPath, timeoutMs = 5000, retryIntervalMs = 100) { ... }

// Release the lock ONLY if we still own it: re-read the lock file and compare
// the nonce to our owner token before unlinking (guards against ABA — never
// delete a lock some other owner acquired after ours).
async function _releaseLock(lockPath, ownerToken) { ... }

// Read and parse the ledger JSON file.
// Returns: { entries: [...], error?: "..." }
// On malformed JSON: backs up corrupt file, returns error (fail-closed)
function _readLedger(ledgerPath) { ... }

// Write ledger array to temp file, fsync, atomic rename.
// Returns: { success: true } or { success: false, error: "..." }
function _writeLedger(ledgerPath, entries) { ... }

// Find or create ledger directory.
function _ensureLedgerDir(ledgerPath) { ... }

// Backup corrupt ledger to {PREFIX}-token-ledger.json.backup-{timestamp}.
function _backupCorruptFile(ledgerPath) { ... }

// Generate ISO-UTC timestamp (only used internally, never Bash date).
function _nowUtcIso() { ... }

// Lock classification for reclaim decisions. Inputs: the raw lock file bytes
// AND its fs.stat. Returns one of: 'live' | 'reclaimable' | 'wait'.
//
// WELL-FORMED owner token { pid, startedAt, nonce }:
//   → 'reclaimable' only when BOTH hold: age (now - startedAt) > staleThresholdMs
//     AND the owner is CERTAINLY not alive (process.kill(pid, 0) for a same-host
//     pid). If liveness cannot be determined (pid on another host / permission
//     error) → 'wait' (never delete; wait out the timeout and fail closed).
//   → otherwise 'live'.
//
// EMPTY file, malformed JSON, or INCOMPLETE token (missing pid/startedAt/nonce):
//   This is the create-then-write crash residue. NO pid is recoverable, so owner
//   liveness is unverifiable; staleness is judged PURELY by the lock FILE's mtime
//   age so the ledger can never be blocked permanently by a malformed lock:
//     → 'reclaimable' when (now - stat.mtimeMs) > orphanThresholdMs
//     → 'wait' otherwise (young orphan — a peer may be mid-write between the
//        O_EXCL create and the fsync of its token; do NOT delete yet).
function _isLockStale(lockContent, lockStat, staleThresholdMs = 30000, orphanThresholdMs = 30000) { ... }
```

**Guarded reclaim (avoids ABA):** to reclaim a lock, re-read it and confirm its **identity is unchanged since detection**, THEN `unlink` and immediately retry the O_EXCL create. Identity is:
- the **`nonce`** for a well-formed owner token; or
- the **re-read raw bytes + `fs.stat` tuple (`ino`, `mtimeMs`, `size`)** for an empty/malformed/incomplete (orphan) lock — since it has no nonce.

If the identity changed (another writer replaced the lock, or a crashed owner's successor wrote its token) or the file vanished, do **not** force-delete — loop back into normal acquisition. Reclaim is only attempted when `_isLockStale` returns `'reclaimable'`. Because the orphan branch keys reclaim on file-mtime age alone, a malformed lock is **always** eventually reclaimable and can never block the ledger permanently.

### 3.6 Mapping / Transformations

#### From CLI Arguments to Module Call

Workflow script calls:
```bash
ai-toolkit ledger open \
  --dir /path/to/feature \
  --prefix FTR-009 \
  --agent "generate-requirements:phase1" \
  --phase "phase1" \
  --model "haiku" \
  --attempt 1
```

CLI facade (in `bin/cli.js`) parses and delegates:
```javascript
const result = await executionLedger.open(
  "/path/to/feature",
  "FTR-009",
  "generate-requirements:phase1",
  "phase1",
  "haiku",
  1
);
console.log(JSON.stringify(result));
process.exit(result.status === "ok" ? 0 : 1);
```

#### Cross-platform argument quoting (`shellQuotePosix`)

The facade is invoked by a workflow **agent** through its Bash tool. In this
environment that tool is a **POSIX-compatible shell (Git Bash on Windows,
`/bin/sh` on POSIX)** — declared here as the one and only transport shell. There
is therefore a single escaping rule, not a per-platform matrix:

```javascript
// Wrap an argument for a POSIX shell: single-quote it and escape embedded
// single quotes as '\'' . This makes spaces, $, *, backticks, etc. literal.
function shellQuotePosix(arg) {
  if (/[\0\n]/.test(arg)) {
    throw new Error('argument contains NUL or newline; cannot be transported safely');
  }
  return `'` + String(arg).replace(/'/g, `'\\''`) + `'`;
}
```

Rules:
- Every dynamic value (`--dir`, `--agent`, `--phase`, `--model`, `--error`, …) is passed through `shellQuotePosix`. **Paths containing spaces are mandatory-supported** and are never split.
- Arguments containing NUL or newline are **rejected** (validation error) rather than forwarded — they cannot be safely single-quoted across the agent→shell boundary.
- `--error` text is **sanitised before transport**: collapsed to a single line, control characters stripped, length-capped. Arbitrary/unsafe `--error` text is never forwarded verbatim; if the sanitised value is empty the field is simply omitted (a `fail` never aborts merely because the diagnostic string was messy).
- `JSON.stringify()` is **not** used as a shell-quoting mechanism (it is JSON quoting, not shell quoting).

> The workflow runtime cannot `require()` (`fs`/`require` are unavailable there), so `pm-phase{1,2,3}.js` inline this identical single-quote rule as a tiny local helper. The canonical copy exported from `bin/cli.js` is the tested reference; a test asserts the inline behaviour matches for representative inputs (space, single quote, `$`).

#### From Ledger Entry to Token Recovery

Readers (`pm-phase3.js` token-recovery step, `implement-feature/SKILL.md` actuals step):
```javascript
// BEFORE: assume all token values are real integers
const tokens = entry.phase_delta_tokens;
const realConsumption = tokens || 0;  // WRONG: treats null/0 as real zero

// AFTER: treat null/0/"not_available" as unavailable
const tokens = entry.phase_delta_tokens;
const isAvailable = tokens !== null && tokens !== 0 && tokens !== "not_available";
const realConsumption = isAvailable ? tokens : undefined;  // or omit from calculation
```

### 3.7 Dependency Registration

#### Module Exports (CommonJS)

File: `lib/execution-ledger.js`

```javascript
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
// No external npm dependencies (dependency-light)

module.exports = {
  open,
  close,
  fail,
  skip,
  computeOperationId,  // exported for testing
  // resolveFeaturesRoot is intentionally NOT here — the module receives an
  // already-resolved --dir. Root resolution lives in bin/cli.js (see §3.7).
};
```

#### CLI Facade Integration

File: `bin/cli.js` adds a new subcommand dispatcher (after existing commands):

```javascript
async function main() {
  const args = process.argv.slice(2);
  const command = args[0]; // "ledger", "install", etc.

  if (command === 'ledger') {
    const subcommand = args[1];  // "open", "close", "fail", "skip"
    const ledger = require('../lib/execution-ledger');
    await handleLedgerCommand(subcommand, args.slice(2), ledger);
  }
  // ... other commands
}

async function handleLedgerCommand(subcommand, args, ledger) {
  // Parse --dir, --prefix, --agent, etc. from args array
  // Validate required/optional fields
  // Call appropriate ledger function
  // Print JSON result
  // Exit with appropriate code
}
```

#### Workflow Integration

File: `src/claude/workflows/pm-phase1.js` (and phase2, phase3):

```javascript
// BEFORE: LLM-based JSON edit
async function appendLedgerEntry(featureDir, prefix, entry) {
  await agent(`... Bash date ... JSON edit ... `, { label: 'append-ledger', ... })
}

// AFTER: CLI facade. Every dynamic value is POSIX-single-quote escaped so paths
// with spaces and shell metacharacters are transported literally (§3.6).
function executeLedgerOpen(featureDir, prefix, agent, phase, model, attempt) {
  const cmd = [
    'ai-toolkit ledger open',
    `--dir ${shellQuotePosix(featureDir)}`,
    `--prefix ${shellQuotePosix(prefix)}`,
    `--agent ${shellQuotePosix(agent)}`,
    `--phase ${shellQuotePosix(phase)}`,
    `--model ${shellQuotePosix(model)}`,
    `--attempt ${Number(attempt)}`,
  ].join(' ');
  const result = await agent(
    `Run exactly: ${cmd}\n\nInspect the structured JSON result and the exit code. If the exit code is non-zero, hard-stop.`,
    { label: 'ledger-open', phase: 'phase1', model: 'haiku' }
  );
  // Workflow checks structured result and exit code (fail-closed)
}
```

#### Features Root Resolution

**Location:** this helper lives in **`bin/cli.js`** (exported for unit tests under
`tests/cli/`) — **not** in `lib/execution-ledger.js`. The ledger module already
receives a fully-resolved `--dir` and never resolves roots itself.

**Invocation point:** `define-feature` is a **Markdown agent and cannot call the
exported JS function directly**. It invokes the deterministic CLI command
**`ai-toolkit resolve-features-root`** (defined below) **exactly once**, captures
the single absolute path it prints on stdout, and reuses that literal value for
both (a) writing `feature.md` and (b) the ledger `--dir`. It performs **no**
second resolution in the prompt. The rest of the pipeline receives that
`featureDir` directly and does not re-resolve.

**Precedence (ordered, ambiguity-aware — candidates gathered before deciding):**

```javascript
// bin/cli.js — pure, exported, tested under tests/cli/
function resolveFeaturesRoot({ explicitPath, cwd = process.cwd() }) {
  // 1. Explicit path always wins.
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      throw new Error(`features root does not exist: ${explicitPath}`);
    }
    return explicitPath;
  }

  // 2. Project convention: AGENTS.md `features_root:` key, if declared.
  const conv = readFeaturesRootConvention(cwd); // parses AGENTS.md; null if absent
  if (conv) {
    const convAbs = path.resolve(cwd, conv);
    if (!fs.existsSync(convAbs)) {
      throw new Error(`AGENTS.md features_root does not exist: ${conv}`);
    }
    return convAbs; // convention wins over the built-in defaults
  }

  // 3. No explicit path and no convention: gather ALL existing default roots
  //    FIRST, then decide — so ambiguity is detected, not masked.
  const candidates = [
    path.join(cwd, 'internal_docs', 'features'), // toolkit
    path.join(cwd, 'docs', 'features'),          // consumer
  ].filter(p => fs.existsSync(p));

  if (candidates.length === 0) {
    throw new Error('Cannot resolve features root: none of AGENTS.md features_root, '
      + 'internal_docs/features, docs/features exist. Pass --features-root.');
  }
  if (candidates.length > 1) {
    // Both defaults exist and nothing disambiguates → HARD STOP (no guessing).
    throw new Error('Ambiguous features root: both internal_docs/features and '
      + 'docs/features exist. Pass --features-root to disambiguate.');
  }
  return candidates[0]; // toolkit → internal_docs/features; consumer → docs/features
}
```

#### CLI command: `ai-toolkit resolve-features-root`

`resolveFeaturesRoot()` is exported for unit tests, but a Markdown agent cannot
call JS. A thin, deterministic command exposes it as the **invocable facade**:

| Aspect | Specification |
|--------|---------------|
| **Invocation** | `ai-toolkit resolve-features-root [--project <dir>] [--features-root <dir>]` |
| **`--project`** | Optional project root to resolve within (defaults to CWD) → maps to `cwd`. |
| **`--features-root`** | Optional explicit path → maps to `explicitPath` (highest precedence). |
| **stdout** | **Exclusively the resolved absolute path** — a single line + newline, no prose, no JSON. |
| **stderr** | Human-readable diagnostics only (never the path). |
| **Exit 0** | Root resolved; stdout holds the path. |
| **Exit non-zero** | Root absent, explicit/convention path missing, invalid `features_root` declaration, or **ambiguous** (both defaults present) — **nothing on stdout**. |
| **Purity** | Read-only: resolves and prints; does **not** create directories. |

`define-feature` calls it once and reuses the captured value verbatim:

```bash
# resolve ONCE; reuse for BOTH feature.md and the ledger --dir
ROOT="$(ai-toolkit resolve-features-root --project "$PWD")" || exit 1
FEATURE_DIR="$ROOT/FTR-XXX-slug"
# ... write $FEATURE_DIR/feature.md ...
ai-toolkit ledger open --dir "$FEATURE_DIR" --prefix FTR-XXX --agent define-feature:define --phase define --model sonnet
```

Because stdout is exactly the path, the agent captures it directly; there is no
second, divergent resolution in the prompt.

#### `AGENTS.md` `features_root` grammar (deterministic)

`readFeaturesRootConvention(cwd)` parses `AGENTS.md` with a fixed grammar so the
result is deterministic across projects (no free-form interpretation by an agent):

- **Accepted declaration:** a single top-level line `features_root: <path>` (key at
  column 0). Surrounding whitespace is trimmed. The value may be quoted
  (`"…"` / `'…'`); quotes are stripped. A relative value resolves against `cwd`.
- **Commented / blank lines:** a line whose first non-space character is `#` is
  ignored; blank lines are ignored. An inline `#` after the value begins a comment
  and is stripped from the value.
- **Multiple declarations:** more than one *uncommented* `features_root:` line is a
  **hard error** (ambiguous configuration) → non-zero exit, no guessing. (Exactly
  one wins; zero uncommented lines means "no convention" → fall through to the
  defaults.)
- **Invalid value:** an empty value, a value containing NUL/newline, or a declared
  path that **does not exist** → **hard error** (non-zero). An absent key → `null`
  (fall through to defaults).
- **Scope:** only a `features_root:` key at column 0 is honoured; keys nested under
  other sections/indentation are ignored, keeping the grammar unambiguous.

Tests for this grammar (accepted, quoted, inline-comment, fully commented-out,
multiple-declarations error, empty-value error, non-existent-path error) live in
`tests/cli/ledger-cli.test.js` (§10, category 12).

This resolves Open Question 5 in-scope: convention parsing is implemented with a
**deterministic grammar** (no v1.1 deferral), the immediate `internal_docs/features`
early-return is gone, the two defaults are gathered before deciding so the
`docs/features` ambiguity is caught rather than silently skipped, and the resolver
is **actually invocable** by the Markdown agent through the
`ai-toolkit resolve-features-root` command.

---

## 4. Frontend

N/A — this is an internal/technical feature with no user-facing UI components.

---

## 5. External Integrations

N/A — the module does not call external APIs. Cross-process locking uses only Node.js built-ins (`fs`, `os`, `path`).

---

## 6. Security Considerations

| Aspect | Mitigation |
|--------|-----------|
| **Malformed JSON injection** | Strict JSON parsing with error handling; corrupted files are backed up and never overwritten |
| **Path traversal** | Paths are validated; feature directories must exist or be created in a known location |
| **Shell injection via arguments** | All dynamic arguments are POSIX single-quote escaped (`shellQuotePosix`, §3.6); NUL/newline are rejected; `--error` is sanitised (single line, control chars stripped, length-capped) before transport. `JSON.stringify()` is not used for shell quoting. |
| **Race conditions** | Cross-process locking (with timeout) serializes concurrent updates; temp+rename ensures atomicity |
| **Token tampering** | Tokens are recorded as integers or null; legacy `0` and `"not_available"` on disk are tolerated by readers as "unavailable" (not treated as real zero). Readers must never infer from silence. |
| **Lock bypass** | Stale-lock detection (age/PID-based) reclaims locks safely after timeout; a live lock eventually times out and fails closed (hard stop) |

---

## 7. Database Changes

No database changes. The ledger is a flat JSON file; no schema migration is needed (backward compatibility is preserved via unknown-field retention).

---

## 8. Configuration

### New Environment Variables

None. The module uses the current working directory to resolve the features root.

### New CLI Arguments

All passed explicitly via command-line flags (no config file changes required):
- `--dir`, `--prefix`, `--agent`, `--phase`, `--model`, `--attempt`, `--tokens`, `--error`

### Lock Configuration

Single O_EXCL lockfile algorithm (§3.5). Hardcoded defaults:
- **Total acquisition deadline:** 5000 ms (5 seconds). Retries continue until this deadline, then the command fails closed. (This is a *total* deadline, not a retry count — the earlier "5 retries" wording is removed.)
- **Retry interval:** 100 ms between attempts (≈50 attempts within the deadline).
- **Immediate token write:** on O_EXCL create the full owner token is written to the fd and **fsync'd before any other work**, narrowing the create-then-write crash window.
- **Stale-lock age threshold:** 30000 ms (30 seconds). A **well-formed** lock is reclaimed only when it is older than this threshold **and** its owner is certainly not alive (`process.kill(pid, 0)`); if liveness is undeterminable the lock is left in place and the writer fails closed at the deadline.
- **Orphan (empty / malformed / incomplete) lock threshold:** 30000 ms. A lock that is empty, has malformed JSON, or an incomplete owner token — the create-then-write crash residue — carries **no recoverable PID**; it is reclaimed by lock-file **mtime age alone** once older than this threshold, with a re-read **content + `stat` ABA check** before removal. This guarantees a malformed lock cannot block the ledger permanently.

These are not configurable in v1.

---

## 9. File Inventory

### New Files

| Path | Purpose |
|------|---------|
| `lib/execution-ledger.js` | Canonical ledger module; exports `open`, `close`, `fail`, `skip`, `computeOperationId`. Does **not** export/contain features-root resolution. |
| `tests/lib/execution-ledger.test.js` | Module-interface suite: create/open/close/fail/skip, atomic write, concurrency, lock timeout, stale-lock recovery + ABA guard, malformed-file backup, resume idempotency, rework separation, legacy-field preservation, FTR-014 fixture compatibility, `--tokens 0` rejection, operation_id collision-resistance |
| `tests/cli/ledger-cli.test.js` | CLI-layer suite (per AGENTS.md — new pure functions in `bin/cli.js` are exported and tested under `tests/cli/`): argument parser/dispatcher for `ledger open|close|fail|skip`, `shellQuotePosix`, and `resolveFeaturesRoot` (precedence + ambiguity hard stop) |

### Modified Files

**Only `src/claude/**` sources are edited.** Per FTR-015, the installed copies under `.claude/**` (and the global home) are **generated exclusively by the catalog-driven installer** — they are never hand-edited or committed as sources. They appear in this feature only as **installer-test outputs** (see §10 Installer/Packaging tests), not as modified source files.

| Path | Change Description |
|------|-------------------|
| `bin/cli.js` | Add `handleLedgerCommand` dispatcher for `ai-toolkit ledger open|close|fail|skip`; add the **`ai-toolkit resolve-features-root [--project] [--features-root]`** command (thin facade over `resolveFeaturesRoot` — stdout = absolute path only, stderr = diagnostics, non-zero on missing/invalid/ambiguous); add exported pure helpers `resolveFeaturesRoot`, `readFeaturesRootConvention` (deterministic `AGENTS.md` `features_root` grammar), `shellQuotePosix`, and the argument parser (all tested under `tests/cli/`); remove dead `appendLedgerEntry`/`updateLedgerEntry` bodies; delegate to `lib/execution-ledger.js`; print structured JSON; exit non-zero on failure |
| `src/claude/workflows/pm-phase1.js` | Replace the `appendLedgerEntry`/`updateLedgerEntry` LLM prompts with `ai-toolkit ledger open`/`close`/`fail` invocations for **exactly the activities already tracked** (`generate-requirements:phase1`, `generate-tech-spec:phase1`, `validate-feature-docs:phase1:cycle{N}` — see §2.1.1); verify structured result (fail-closed). **No new activities** (discovery and `ensure-ledger` remain untracked). |
| `src/claude/workflows/pm-phase2.js` | Replace LLM-based ledger writes with CLI-facade invocations for the current keys (`generate-work-breakdown:phase2`, `wb-validate:phase2`, `validate-work-breakdown-semantic:phase2`, `wb-render:phase2`); fail-closed result checking. No new activities. |
| `src/claude/workflows/pm-phase3.js` | Replace inline LLM prompts with facade invocations for the current keys (§2.1.1); add minimal null-compatibility updates to the token-recovery/disk-merge step (treat `null`/`0`/`"not_available"` as "data unavailable"). The `read-ledger` reader stays untracked. No new activities. |
| `src/claude/agents/define-feature.md` | Remove raw-JSON ledger prose; resolve `featureDir` **once** by invoking `ai-toolkit resolve-features-root` (capture the single stdout absolute path — the precedence explicit → AGENTS.md `features_root` → single existing default of `internal_docs/features`/`docs/features`, hard stop if both exist, lives in the command) and reuse that exact value for both `feature.md` and the ledger `--dir` (no second resolution in the prompt); call `ai-toolkit ledger open`/`close` for the existing `define-feature:define` entry (`--phase define --model sonnet`); omit `--tokens` so `phase_delta_tokens` is `null` |
| `src/claude/skills/implement-feature/SKILL.md` | Minimal null-compatibility updates to the actuals/cost-calculation step so readers treat `null`/`0`/`"not_available"` as "data unavailable", never real zero |
| `package.json` | No changes (no new npm dependencies) |

---

## 10. Testing Strategy

### Unit Tests — module (`tests/lib/execution-ledger.test.js`)

Test categories (Jest, `npm test`):

1. **Create and Open**
   - Open a non-existent ledger → file created with first entry
   - Idempotent re-open (resume) → same `operation_id`, no duplicate, original `started_at` preserved
   - Different attempt → new `operation_id`, new entry
   - **operation_id collision-resistance:** agent keys that collapse to the same simple-replacement string (`a:b`, `a/b`, `a-b`) → **distinct** `operation_id`s; same tuple → identical id (deterministic)

2. **Close and Token Handling**
   - Close with `--tokens <n≥1>` → token value recorded
   - Close without `--tokens` → `phase_delta_tokens: null`
   - Existing positive token + close without `--tokens` → positive value preserved (resume-safe)
   - **Close `--tokens 0` (and negative / non-integer) → validation error, non-zero, nothing written**
   - **Legacy entry (`0` or `"not_available"`) + close without `--tokens` → normalised to `null`** (single coherent rule)
   - Close nonexistent `operation_id` → error, non-zero

3. **Fail**
   - Fail with `--error` → sanitised error field set
   - Fail without `--error` → no error field
   - Fail nonexistent `operation_id` → error

4. **Skip (contract)**
   - Skip before open (no matching entry) → **new terminal entry created**, `status: "skipped"`, `started_at == completed_at`, `phase`/`model` populated, `phase_delta_tokens: null`
   - Skip after open (exactly one match) → existing entry updated to `status: "skipped"`, `completed_at` set
   - Skip with `agent` fallback matching multiple legacy entries → **error (ambiguous)**, non-zero
   - Skip missing `--phase`/`--model` → validation error

5. **Atomicity**
   - Kill a write mid-way (simulate via temp-file check) → original ledger unchanged, no partial/corrupt file
   - Verify temp file is fsync'd before rename

6. **Concurrency**
   - Two simultaneous `close` operations (simulated via concurrent test) → both updates present, no lost update
   - Lock serializes access

7. **Lock Management (single O_EXCL algorithm)**
   - Contention → retry every 100 ms until the 5 s total deadline, then fail closed
   - Stale lock (age > 30 s **and** owner not alive via `process.kill(pid,0)`) → reclaimed safely, writer proceeds
   - Stale age but liveness **undeterminable** → lock left in place, writer fails closed at deadline (no force-delete)
   - **Crash immediately after O_EXCL create** (empty / truncated / no-PID lock — the create-then-write window): younger than the orphan threshold → writer **waits** (not force-deleted); older than the orphan threshold → **reclaimed** via the file-mtime criterion; assert the ledger is **never blocked permanently** by a malformed lock
   - **ABA guard (well-formed):** a lock replaced by a new owner between detection and reclaim is **not** deleted (nonce mismatch)
   - **ABA guard (orphan/malformed):** reclaim re-reads raw bytes + `stat` (`ino`/`mtimeMs`/`size`); any change between detection and unlink aborts the removal
   - `_releaseLock` unlinks only when the on-disk nonce matches the owner token
   - Live lock → timeout at deadline, fail closed

8. **Malformed Ledger**
   - Invalid JSON → backed up to `.backup-{timestamp}`, operation fails (non-zero)
   - Non-array root → error (reject)
   - Missing required fields → tolerated (legacy entries preserved)

9. **Timestamp Generation**
   - Timestamps are ISO-8601 UTC, generated by JavaScript (not Bash `date`)
   - Format regex passes for `started_at` and `completed_at`

10. **Legacy Entries**
    - Entry without `operation_id` → fallback on `agent` if unambiguous
    - Multiple entries with same `agent` → error "ambiguous"
    - Unknown fields (`notes`, `attemptN`) → preserved verbatim, not migrated

11. **FTR-014 Fixture Compatibility** (single coherent legacy-token rule — no conflict with category 2)
    - Real `FTR-014` ledger file → parses and updates without error
    - Legacy `0` / `"not_available"` on **entries NOT touched by the current operation** → left byte-for-byte unchanged (never converted)
    - Legacy/unknown **non-owned fields** on the updated target (e.g. `notes`, `attemptN`) → preserved verbatim
    - Legacy `0` / `"not_available"` in the **`phase_delta_tokens` of the `close` target**, with `--tokens` omitted → normalised to `null` (this is the *same* rule as category 2, applied to the one field the writer owns on the target); a **positive** target value is preserved
    - Net: "preserved, not converted" applies to untouched entries and non-owned fields; the target's own token field follows the §3.4 close normalisation rule. The two categories are consistent, not contradictory.

### Unit Tests — CLI layer (`tests/cli/ledger-cli.test.js`)

Per AGENTS.md, new pure functions in `bin/cli.js` are exported and tested here.

12. **`resolveFeaturesRoot` precedence + `resolve-features-root` command (in `bin/cli.js`)**
    - Explicit path that exists → used; explicit path missing → error
    - AGENTS.md `features_root` declared and exists → used (wins over defaults)
    - Only `internal_docs/features` exists → toolkit default used
    - Only `docs/features` exists → consumer default used
    - **Both defaults exist, no explicit/convention → hard-stop "ambiguous"**
    - No candidate exists → error "not found; pass --features-root"
    - **`AGENTS.md` `features_root` grammar:** accepted `features_root: docs/features`; quoted value → quotes stripped; inline `# comment` → stripped; fully commented-out line → ignored (fall through); **multiple uncommented declarations → error (ambiguous)**; empty value → error; declared-but-nonexistent path → error; absent key → `null` (fall through)
    - **`resolve-features-root` command contract:** exit 0 prints **only** the absolute path to stdout (nothing else); ambiguous/missing/invalid → non-zero, **empty stdout**, diagnostic on stderr

13. **Argument parser / dispatcher (in `bin/cli.js`)**
    - Malformed prefix (`xyz`, not `[A-Z]+-[0-9]+`) → error
    - Empty `--agent` → error; non-integer `--attempt` → error
    - `--tokens 0` / negative / non-integer → validation error
    - `open`/`skip` missing `--phase` or `--model` → validation error
    - `shellQuotePosix`: paths with spaces round-trip intact; embedded single quotes escaped; NUL/newline → rejected
    - `--error` sanitisation: multi-line/control-char input reduced to a safe single line

### Integration Tests (with workflows)

1. **Static Analysis**
   - `pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js` → no prompts asking LLM to read/modify ledger JSON
   - All ledger writes go through CLI facade

2. **Workflow Fail-Closed Behavior**
   - `ledger open` fails → activity not started, workflow hard-stops
   - `ledger close` fails → workflow hard-stops, reports terminal state not persisted
   - Structured result checked (exit code + `status` field)

3. **Installer/Packaging Tests**
   - Catalog-driven installer propagates migrated files (`pm-phase*.js`, `define-feature.md`) correctly
   - Local and global installations produce byte-identical files
   - No manual dual-copy sync required

### Manual Verification

1. Run a feature through the full pipeline; inspect the ledger for:
   - Correct entries (same activities as before)
   - Proper timestamps and token values
   - No duplicate entries

2. Interrupt a phase mid-execution; resume; verify:
   - Same `operation_id` on re-open
   - No duplicate entry
   - Original `started_at` preserved

3. Test on both Windows and POSIX with feature directory paths containing spaces

---

## 11. Implementation Order

1. **Implement canonical module** (`lib/execution-ledger.js`)
   - Core logic: `open`, `close`, `fail`, `skip`
   - Internal helpers: `_readLedger`, `_writeLedger`, `_acquireLock`, `_releaseLock`, `computeOperationId`, `_isLockStale`, `_backupCorruptFile`, `_nowUtcIso`
   - Lock mechanism: **single O_EXCL lockfile** with owner token (pid + startedAt + nonce) **written and fsync'd immediately on create**, 100 ms retry to a 5 s total deadline, guarded stale reclaim — **two branches, one algorithm**: (a) *well-formed* lock → age + `process.kill(pid,0)` liveness, undeterminable ⇒ do not delete; (b) *empty/malformed/incomplete (orphan)* lock → reclaim after 30 s by **mtime age** alone, ABA-guarded by a **raw-bytes + `stat` (ino/mtime/size)** re-check before unlink. Include a **crash-immediately-after-O_EXCL** test so the orphan-recovery path is exercised. No alternative algorithm is implemented.
   - Malformed-file backup on corrupt JSON
   - Fail-closed error handling
   - Dependencies: none (Node.js built-ins only: `fs`, `path`, `os`, `crypto`)
   - NOTE: features-root resolution is **not** in this module (see step 2).

2. **Implement CLI facade + helpers** (`bin/cli.js`)
   - Add `handleLedgerCommand` dispatcher and an **exported** argument parser
   - Parse `--dir`, `--prefix`, `--agent`, `--phase`, `--model`, `--attempt`, `--tokens`, `--error`; enforce `--tokens ≥ 1` (reject `0`/negative/non-integer); require `--phase`/`--model` for `open` and `skip`
   - Add exported pure helpers `shellQuotePosix`, `resolveFeaturesRoot` (precedence + ambiguity hard stop), and `readFeaturesRootConvention` (deterministic `AGENTS.md` `features_root` grammar: single column-0 key, quotes/inline-`#` stripped, multiple uncommented → error, empty/nonexistent → error) — these live here, **not** in `lib/execution-ledger.js`
   - Add the **`ai-toolkit resolve-features-root [--project] [--features-root]`** command: stdout = the resolved absolute path only, stderr = diagnostics, exit non-zero on missing/invalid/ambiguous — the invocable facade `define-feature` calls once
   - Invoke canonical module functions; print structured JSON; exit with the right code
   - Delete dead `appendLedgerEntry`/`updateLedgerEntry` bodies
   - All new pure functions are exported and covered by `tests/cli/` (per AGENTS.md)
   - Depends on: 1

3. **Implement test suites**
   - `tests/lib/execution-ledger.test.js` — module interface (categories in §10), incl. `--tokens 0` rejection, operation_id collision-resistance, ABA-safe stale reclaim, malformed-file backup fixture, real FTR-014 fixture, concurrency simulation
   - `tests/cli/ledger-cli.test.js` — argument parser/dispatcher, `shellQuotePosix`, `resolveFeaturesRoot` precedence + ambiguity hard stop
   - Depends on: 1, 2

4. **Migrate `pm-phase1.js`**
   - Remove the `appendLedgerEntry`/`updateLedgerEntry` prompts
   - Replace with `ai-toolkit ledger open`/`close`/`fail` for **exactly the tracked activities** — `generate-requirements:phase1`, `generate-tech-spec:phase1`, `validate-feature-docs:phase1:cycle{N}` (§2.1.1). Do **not** add entries for discovery or `ensure-ledger`.
   - Add fail-closed checks (exit code + `status` field)
   - Depends on: 1, 2

5. **Migrate `pm-phase2.js`**
   - Similar to pm-phase1: replace LLM prompts with CLI facade
   - Depends on: 1, 2

6. **Migrate `pm-phase3.js`**
   - Replace inline LLM ledger writes with CLI facade
   - Add fail-closed result checks for all ledger commands
   - **Add minimal null-compatibility updates:** token-recovery step must treat `null`, `0`, `"not_available"` as "data unavailable"
   - Depends on: 1, 2

7. **Migrate `define-feature.md`**
   - Remove raw-JSON ledger write prose (steps 1c and 4b)
   - Resolve `featureDir` **once** by invoking `ai-toolkit resolve-features-root` (capture the single stdout absolute path); reuse that exact value for both `feature.md` and the ledger `--dir` — no second resolution in the prompt
   - Call `ai-toolkit ledger open`/`close` for the existing `define-feature:define` entry (`--phase define --model sonnet`); omit `--tokens` (⇒ `null`)
   - Depends on: 1, 2

8. **Update `implement-feature/SKILL.md`** (actuals/cost-calculation step)
   - Add minimal null-compatibility updates
   - Treat `null`, `0`, `"not_available"` as "data unavailable"
   - Never render as real zero consumption
   - Depends on: 1

9. **Verify installer** (`bin/cli.js` installer logic)
   - Ensure migrated runtime files (`pm-phase*.js`, `define-feature.md`) are installed correctly
   - No manual dual-sync required
   - Depends on: 4, 5, 6, 7

10. **Run full test suite** (`npm test`)
    - All unit tests pass
    - All integration tests pass
    - CI green
    - Depends on: 3, 9

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Lock algorithm correctness** (single O_EXCL lockfile) | High — concurrency safety depends on lock correctness | One algorithm only (O_EXCL lockfile + owner token + guarded stale reclaim, §3.5); test on Windows + POSIX; unit tests for concurrent access, ABA guard, and stale-lock recovery |
| **Durability guarantee mismatch** (Windows directory fsync) | Medium — platform-specific durability may be less than expected | Document achievable durability level per platform in Tech-Spec; note that `fsync` on file is always done; directory fsync is platform-conditional |
| **Features-root ambiguity in existing projects** | Medium — AGENTS.md may not declare a `features_root` key; two valid roots may exist | Hard-stop on ambiguity (per design); require explicit `--features-root` or AGENTS.md declaration; document precedence clearly |
| **Regression in existing ledgers** | High — FTR-014 and earlier ledgers must continue to work | Include full FTR-014 fixture test; verify unknown-field preservation; tolerate legacy `0` and `"not_available"` by readers (minimal reader changes in scope) |
| **Workflow LLM still dispatches CLI** (v1 residual) | Low — agent-based command dispatch introduces small window for LLM error | Documented by design; workflow verifies structured JSON result and exit code before proceeding; fail-closed semantics ensure no silent failures |
| **Lock held indefinitely after crash** | Medium — stale lock may block retries until timeout | Implement stale-lock detection (age + PID check); document timeout threshold; ensure test coverage for stale-lock recovery |
| **Cross-platform path quoting** | Medium — paths with spaces may break on Windows or POSIX | Single POSIX-shell transport (Git Bash on Windows); one `shellQuotePosix` helper (§3.6); reject NUL/newline; sanitise `--error`; test on both platforms with real paths containing spaces |
| **Token value misinterpretation post-migration** | High — readers may confuse `null` with `0` or `"not_available"` | Minimal reader updates explicitly treat all three as "data unavailable"; add type-compatibility checks in tests; review cost-calculation and recovery logic |
| **Installer propagation gaps** | Medium — migrated files may not reach all destinations (local + global) | Verify catalog-driven installer includes new/modified files; add packaging/installation tests; ensure manifest includes runtime assets |

---

## Appendix: Open Questions Resolution

All five open questions are **resolved for FTR-016** (no deferral to v1.1).

| # | Question | Decision (final for FTR-016) |
|---|----------|----------|
| Q-1 | **Cross-process lock mechanism** | **RESOLVED — single algorithm.** O_EXCL lockfile (`${ledgerPath}.lock`) holding an owner token `{ pid, startedAt, nonce }`, written and **fsync'd immediately on create** (narrows the create-then-write window). Retry every 100 ms to a **5 s total deadline**, then fail closed. Release only when the on-disk nonce matches ours. Reclaim a *well-formed* stale lock only when age > 30 s **and** owner certainly not alive (`process.kill(pid,0)`); if undeterminable, do not delete — wait out the deadline and fail. An **empty/malformed/incomplete (orphan) lock** — the crash-in-create-window residue with no recoverable PID — is reclaimed by **lock-file mtime age** alone once older than the orphan threshold (30 s), guarded by a re-read **content + `stat` ABA check**; this guarantees a malformed lock never blocks the ledger permanently. Guarded reclaim re-checks nonce (well-formed) or content+`stat` (orphan) before unlink (ABA-safe). See §3.5. |
| Q-2 | **Cross-platform shell-quoting** | **RESOLVED.** The facade is always invoked through the agent's Bash tool, which is a POSIX-compatible shell (Git Bash on Windows). Use one escaping rule — POSIX single-quote escaping (`shellQuotePosix`, §3.6): wrap each argument in single quotes, escaping embedded `'` as `'\''`. Reject arguments containing NUL or newline (validation error). Paths with spaces are supported (mandatory). `--error` is sanitised (single line, control chars stripped, length-capped) before transport. No `JSON.stringify()`-as-quoting. |
| Q-3 | **Concrete `operation_id` format** | **RESOLVED — collision-resistant (128-bit).** `${prefix}-${slug(agent)}-${attempt}-${sha256_128([prefix,agent,attempt])}` (32 hex chars; 64-bit `slice(0,16)` rejected). Collision-resistance comes from the truncated sha256 of the exact tuple, not from the readable slug; keys that collide under naive `:`/`/`→`-` replacement still get distinct ids. Stated as collision-resistant, **not** absolute uniqueness. See §3.3. |
| Q-4 | **Directory-fsync durability on Windows** | **RESOLVED (documented residual).** File-level fsync of the temp file is always performed before the atomic rename. Directory fsync is performed on POSIX; Windows does not support directory fsync, so directory-entry durability there is best-effort — documented as the residual guarantee (atomicity is unaffected; only crash-durability of the rename metadata differs). |
| Q-5 | **Features-root precedence & convention parsing** | **RESOLVED now (not v1.1).** Ordered precedence, ambiguity-aware: explicit path → project convention (parse `AGENTS.md` for a `features_root` key) → else the single existing default among `internal_docs/features` (toolkit) and `docs/features` (consumer). If **no** explicit path/convention and **both** defaults exist → **hard stop** (ambiguous). The resolver lives in `bin/cli.js` (exported, tested under `tests/cli/`), **not** in `lib/execution-ledger.js`, and `resolveFeaturesRoot()` is exposed through the invocable command **`ai-toolkit resolve-features-root`** (stdout = resolved absolute path only); `define-feature` **invokes that command once** and reuses the captured path for both `feature.md` and the ledger `--dir`. See §3.7. |

---

## Summary

The Deterministic Execution Ledger Foundation (FTR-016) establishes a single canonical JavaScript module (`lib/execution-ledger.js`) and CLI facade (`ai-toolkit ledger open|close|fail|skip`) for all ledger writes across the feature delivery pipeline. The implementation prioritizes:

1. **Determinism:** no LLM in JSON edits
2. **Atomicity:** temp+fsync+rename, no partial writes
3. **Concurrency:** cross-process locks with timeout/retry
4. **Fail-closed:** hard-stop on lock/corruption/I/O errors
5. **Backward compatibility:** legacy entries preserved verbatim
6. **Resume safety:** unknown tokens as `null`, positive tokens never overwritten
7. **Type compatibility:** minimal reader updates for null-handling

The set of tracked activities is unchanged; coverage of untracked activities, reader consolidation, and resume orchestration are deferred to future features.
