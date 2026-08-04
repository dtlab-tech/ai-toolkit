# Technical Specification — Ledger as Full Pipeline Activity Tracker

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-013 — Ledger as Full Pipeline Activity Tracker |
| Version | 1.0 |
| Date | 2026-07-31 |
| Status | Draft |

## 1. Overview

This feature evolves the token ledger from a phase-3-only counter (written once at the end of the pipeline) into a persistent, real-time activity tracker that spans all four phases of a feature delivery pipeline: `define-feature`, `pm-phase1.js`, `pm-phase2.js`, and `pm-phase3.js`.

The ledger file (`{PREFIX}-token-ledger.json`) will contain one entry per agent invocation with status (`running | done | failed | skipped`), start/end timestamps, token delta, and agent identity. This enables:

1. **Token attribution from phase 1** — current ledger loses phase 1–2 measurements entirely
2. **Deterministic resume detection** — distinguish cached agents (zero duration) from real work
3. **Cross-session resume** — no dependency on SDK session cache; persistent disk state
4. **Live progress monitoring** — users can inspect the file during a run to see what's executing

### Systems Affected

- `define-feature.md` agent — initializes ledger on feature dir creation
- `pm-phase1.js` workflow — appends entries for requirements, tech-spec, and validation cycles
- `pm-phase2.js` workflow — appends entry for work-breakdown generation
- `pm-phase3.js` workflow — extends write pattern to all agent calls (impl, test, review, commit, remediation, PR, actuals steps)
- Token aggregation in pm-phase3 Actuals phase — must preserve backward compatibility with in-memory ledger

## 2. Architecture

### 2.1 System Context

The ledger is a single source-of-truth JSON file that persists the execution trace of a feature delivery run. It bridges the gap between the in-memory runtime state (which is lost on session restart) and durable records on disk.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Feature Pipeline                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase: define         Phase1        Phase2         Phase3     │
│  ┌──────────────────┬──────────────┬──────────────┬─────────┐ │
│  │ define-feature   │ requirements │ work-        │ impl,   │ │
│  │ agent            │ tech-spec    │ breakdown    │ test,   │ │
│  │                  │ validation   │ effort-est   │ review, │ │
│  │                  │              │              │ commit, │ │
│  │                  │              │              │ remediate,
│  │                  │              │              │ PR,     │ │
│  │                  │              │              │ actuals │ │
│  └──────────────────┴──────────────┴──────────────┴─────────┘ │
│         │                 │              │            │       │
│         │ append          │ append       │ append     │ append│
│         │ "running"       │ "running"    │ "running"  │ "running"
│         │ → update        │ → update     │ → update   │ → update
│         │ "done"/"failed" │ (per agent)  │            │ (per agent)
│         │                 │              │            │        │
│         └─────────────────┴──────────────┴────────────┴───────►│
│                                                        Write to │
│                   {PREFIX}-token-ledger.json           disk    │
│                                                        (atomic) │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

The ledger is written in an append-then-update pattern:
1. Before invoking an agent, write a `status: "running"` entry to disk (new entry appended to the array)
2. After the agent completes or fails, update that entry with final status, timestamps, and token count
3. All writes are atomic: read full array, mutate, write full array back

### 2.2 Component Diagram

```
define-feature.md
    │
    ├─ (Phase 0) Discover feature directory
    │                                    │
    ├─ Write initial ledger entry       │
    │  { status: "running",              │
    │    started_at: <ISO>,              │
    │    completed_at: null }            │
    │                                    │
    ├─ (Phase 1–3) Perform grilling      │
    │                                    │
    └─ Update entry to status: "done",   │
       completed_at: <ISO>               │
                                        │
                                        ▼
                    {PREFIX}-token-ledger.json
                            (JSON array)
                           
                                        ▲
                                        │
pm-phase1.js ───┬─ generate-requirements
                ├─ generate-tech-spec
                └─ validate-feature-docs (per cycle)
                    (each: append + update pattern)
                                        │
                                        │
pm-phase2.js ───┬─ generate-work-breakdown
                └─ (append + update pattern)
                                        │
                                        │
pm-phase3.js ───┬─ read-wb-csv
                ├─ developer-backend/frontend/testing (per US)
                ├─ review-solution (per US)
                ├─ final-test-run
                ├─ remediation
                ├─ pr-and-registry
                ├─ write-actuals
                └─ process-log
                    (each: append + update pattern)
```

### 2.3 Sequence Diagrams

#### Happy Path: Single Agent Call in pm-phase3

```
pm-phase3.js                    Disk ({PREFIX}-token-ledger.json)
    │
    ├─ appendLedgerEntry(...)    Read existing ledger array from disk
    │                             │
    │                             ├─ Append { agent: "X", status: "running",
    │                             │           started_at: T0, completed_at: null }
    │                             │
    │                             Write updated array back to disk (atomic)
    │                             │
    ├─ await agent(...)           Agent executes, costs C tokens
    │                             │
    ├─ updateLedgerEntry(...)     Read ledger from disk (current state)
    │                             │
    │                             ├─ Find entry by agentKey
    │                             │
    │                             ├─ Update: status: "done",
    │                             │           completed_at: T1,
    │                             │           phase_delta_tokens: C
    │                             │
    │                             Write updated array back to disk (atomic)
    │                             │
    └─ Proceed to next agent
```

#### On Resume (Cached Agent Detected)

```
pm-phase3.js (resumed session)           Disk (ledger already exists)
    │
    ├─ Read ledger from disk
    │   ├─ Find entry: agent="X", status="done",
    │   │              started_at=T0, completed_at=T0 (duration ≈ 0)
    │   │
    │   └─ Indicator: Cached agent or interrupted at exactly the same instant
    │       (impossible for real work)
    │
    ├─ Skip this agent; resume from first non-done entry
```

#### pm-phase1 / pm-phase2 Pattern

```
pm-phase1.js or pm-phase2.js
    │
    ├─ Check if {PREFIX}-token-ledger.json exists
    │   ├─ If yes: open and read existing array
    │   └─ If no: create file with empty array [] on first write
    │
    ├─ Loop: for each agent call (generate-requirements, etc.)
    │   │
    │   ├─ appendLedgerEntry(featureDir, prefix, {
    │   │      agent: "generate-requirements:phase1",
    │   │      phase: "phase1",
    │   │      model: "haiku",
    │   │      status: "running",
    │   │      phase_delta_tokens: 0,
    │   │      started_at: <ISO>,
    │   │      completed_at: null
    │   │  })
    │   │
    │   ├─ await agent(...)
    │   │
    │   ├─ updateLedgerEntry(featureDir, prefix, "generate-requirements:phase1", {
    │   │      status: "done",
    │   │      completed_at: <ISO>,
    │   │      phase_delta_tokens: <actual>
    │   │  })
    │   │
    │   └─ [next agent]
```

## 3. Backend

### 3.1 Data Model

The ledger is a JSON array stored at `{featureDir}/{PREFIX}-token-ledger.json`.

#### LedgerEntry Schema

```json
{
  "agent": "string",                    // e.g. "define-feature:define", 
                                        //      "generate-requirements:phase1",
                                        //      "validate-feature-docs:phase1:cycle1",
                                        //      "developer-backend:US-01"
  
  "phase": "string",                    // "define", "phase1", "phase2", or "phase3"
  
  "model": "string",                    // "haiku", "sonnet", or "opus"
  
  "status": "string",                   // One of: "running" | "done" | "failed" | "skipped"
  
  "phase_delta_tokens": "number",       // Tokens spent by this agent invocation.
                                        // 0 when status="running" (unknown yet).
                                        // Positive when status="done" or "failed".
                                        // Zero is acceptable for lightweight agents.
  
  "started_at": "string|null",          // ISO 8601 UTC timestamp (e.g. "2026-07-31T14:23:45Z")
                                        // Set when entry created or updated to "done"/"failed".
                                        // Always present in a finalized entry.
  
  "completed_at": "string|null"         // ISO 8601 UTC timestamp.
                                        // null while status="running".
                                        // Set when status transitions to "done", "failed", or "skipped".
}
```

#### Full Ledger File Example

```json
[
  {
    "agent": "define-feature:define",
    "phase": "define",
    "model": "sonnet",
    "status": "done",
    "phase_delta_tokens": 12345,
    "started_at": "2026-07-31T10:00:00Z",
    "completed_at": "2026-07-31T10:02:15Z"
  },
  {
    "agent": "generate-requirements:phase1",
    "phase": "phase1",
    "model": "haiku",
    "status": "done",
    "phase_delta_tokens": 5678,
    "started_at": "2026-07-31T10:02:16Z",
    "completed_at": "2026-07-31T10:05:30Z"
  },
  {
    "agent": "generate-tech-spec:phase1",
    "phase": "phase1",
    "model": "haiku",
    "status": "done",
    "phase_delta_tokens": 8901,
    "started_at": "2026-07-31T10:05:31Z",
    "completed_at": "2026-07-31T10:12:45Z"
  },
  {
    "agent": "validate-feature-docs:phase1:cycle1",
    "phase": "phase1",
    "model": "haiku",
    "status": "done",
    "phase_delta_tokens": 2345,
    "started_at": "2026-07-31T10:12:46Z",
    "completed_at": "2026-07-31T10:14:00Z"
  },
  {
    "agent": "generate-work-breakdown:phase2",
    "phase": "phase2",
    "model": "haiku",
    "status": "done",
    "phase_delta_tokens": 6789,
    "started_at": "2026-07-31T10:14:01Z",
    "completed_at": "2026-07-31T10:22:30Z"
  },
  {
    "agent": "read-wb-csv:phase3",
    "phase": "phase3",
    "model": "haiku",
    "status": "done",
    "phase_delta_tokens": 123,
    "started_at": "2026-07-31T10:22:31Z",
    "completed_at": "2026-07-31T10:22:45Z"
  },
  {
    "agent": "developer-backend:US-01",
    "phase": "phase3",
    "model": "sonnet",
    "status": "done",
    "phase_delta_tokens": 15000,
    "started_at": "2026-07-31T10:22:46Z",
    "completed_at": "2026-07-31T10:35:20Z"
  },
  {
    "agent": "developer-testing:US-01",
    "phase": "phase3",
    "model": "sonnet",
    "status": "done",
    "phase_delta_tokens": 8000,
    "started_at": "2026-07-31T10:35:21Z",
    "completed_at": "2026-07-31T10:42:10Z"
  },
  {
    "agent": "review-solution:US-01",
    "phase": "phase3",
    "model": "sonnet",
    "status": "done",
    "phase_delta_tokens": 12000,
    "started_at": "2026-07-31T10:42:11Z",
    "completed_at": "2026-07-31T10:55:05Z"
  },
  {
    "agent": "final-test-run",
    "phase": "phase3",
    "model": "haiku",
    "status": "done",
    "phase_delta_tokens": 3456,
    "started_at": "2026-07-31T10:55:06Z",
    "completed_at": "2026-07-31T10:58:20Z"
  },
  {
    "agent": "remediation",
    "phase": "phase3",
    "model": "sonnet",
    "status": "done",
    "phase_delta_tokens": 4000,
    "started_at": "2026-07-31T10:58:21Z",
    "completed_at": "2026-07-31T11:05:10Z"
  },
  {
    "agent": "pr-and-registry",
    "phase": "phase3",
    "model": "sonnet",
    "status": "done",
    "phase_delta_tokens": 2000,
    "started_at": "2026-07-31T11:05:11Z",
    "completed_at": "2026-07-31T11:07:30Z"
  },
  {
    "agent": "write-actuals",
    "phase": "phase3",
    "model": "haiku",
    "status": "done",
    "phase_delta_tokens": 5000,
    "started_at": "2026-07-31T11:07:31Z",
    "completed_at": "2026-07-31T11:12:45Z"
  },
  {
    "agent": "process-log",
    "phase": "phase3",
    "model": "haiku",
    "status": "done",
    "phase_delta_tokens": 1000,
    "started_at": "2026-07-31T11:12:46Z",
    "completed_at": "2026-07-31T11:13:00Z"
  }
]
```

### 3.2 DTOs / Response Models

No new DTOs are introduced. The ledger entry object is the sole data structure.

### 3.3 Validation

**Writing ledger entries:**

- `agent` field must be a non-empty string
- `phase` must be one of: `"define"`, `"phase1"`, `"phase2"`, `"phase3"`
- `model` must be one of: `"haiku"`, `"sonnet"`, `"opus"`
- `status` must be one of: `"running"`, `"done"`, `"failed"`, `"skipped"`
- `phase_delta_tokens` must be a non-negative integer
- `started_at` must be an ISO 8601 UTC timestamp or null
- `completed_at` must be an ISO 8601 UTC timestamp or null
- If `status` is `"done"` or `"failed"`, both `started_at` and `completed_at` must be non-null
- If `status` is `"running"`, `completed_at` must be null

**Reading/resuming from ledger:**

- On parse error: log warning, treat as empty array, continue (non-fatal)
- Entries with `status` = `"running"` and `completed_at` = `null` identify interrupted work
- Duration ≈ 0 (within milliseconds) indicates a cached or phantom entry on resume

### 3.4 Helper Functions (in workflow scripts)

#### appendLedgerEntry(featureDir, prefix, entry)

**Purpose:** Append a new `status: "running"` entry to the ledger file, atomically.

**Signature (JavaScript):**
```javascript
async function appendLedgerEntry(featureDir, prefix, entry) {
  // entry = { agent, phase, model, status: "running", phase_delta_tokens: 0, started_at, completed_at: null }
  // Writes to {featureDir}/{prefix}-token-ledger.json
}
```

**Algorithm:**
1. Read the file at `{featureDir}/{prefix}-token-ledger.json` (or return `[]` if not found)
2. Parse JSON (on error, log and treat as `[]`)
3. Append the new entry to the array
4. Write the full array back to the file (atomic write)
5. Return (no return value needed; side effect is the file write)

**Error handling:**
- If the file does not exist, create it with the single entry
- If JSON parse fails, log warning and overwrite with `[entry]`
- File I/O errors are fatal and should propagate to the caller (workflow crashes)

#### updateLedgerEntry(featureDir, prefix, agentKey, updates)

**Purpose:** Find and update an existing ledger entry by agent key, atomically.

**Signature (JavaScript):**
```javascript
async function updateLedgerEntry(featureDir, prefix, agentKey, updates) {
  // agentKey = e.g., "generate-requirements:phase1", "developer-backend:US-01", "remediation"
  // updates = { status: "done"|"failed", completed_at: <ISO>, phase_delta_tokens: <N> }
  // Writes to {featureDir}/{prefix}-token-ledger.json
}
```

**Algorithm:**
1. Read the file at `{featureDir}/{prefix}-token-ledger.json` (or return silently if not found)
2. Parse JSON (on error, log warning and return silently)
3. Find the entry where `entry.agent === agentKey` (search from end to find the last match, in case of duplicates)
4. If found: update the entry with the provided fields
5. If not found: log a warning and return silently (entry was not yet written; may indicate a logic error in the workflow)
6. Write the full array back to the file (atomic write)
7. Return (no return value)

**Error handling:**
- If the file does not exist: silent return (entry not yet written)
- If JSON parse fails: log warning and return silently
- File I/O errors propagate to the caller

### 3.5 Timestamp Format

All timestamps use ISO 8601 UTC format: `YYYY-MM-DDTHH:MM:SSZ` (e.g., `2026-07-31T14:23:45Z`).

**In Node.js workflows (pm-phase1/2/3.js):**
```javascript
const started_at = new Date().toISOString()  // Always UTC
```

**In Bash (define-feature agent):**
```bash
started_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")  # UTC timestamp
```

### 3.6 Atomic Writes

All writes to the ledger file must be atomic:
1. Read the entire file into memory
2. Parse JSON
3. Mutate the in-memory array
4. Write the entire array back in a single write operation

This prevents partial-write corruption when multiple workflows or phases access the file simultaneously (e.g., pm-phase3 parallel waves).

**JavaScript implementation (pseudo-code):**
```javascript
function writeLedgerAtomically(filePath, ledgerArray) {
  const jsonString = JSON.stringify(ledgerArray, null, 2)
  fs.writeFileSync(filePath, jsonString, 'utf8')
}
```

## 4. Workflow Script Changes

### 4.1 define-feature.md Agent

**New behavior:**

1. **Phase 0 → 0a.** After the feature directory is created (and the FTR number is known), immediately write an initial ledger entry with `status: "running"`, `started_at`, and `completed_at: null`.

2. **Phase 2 → completion.** Update the entry in place: `status: "done"`, `completed_at`, and `phase_delta_tokens` (computed from the budget).

**Code location:** Insert ledger writes after line where `featureDir` is first determined and created.

**Pseudo-code:**
```bash
# After featureDir is known and created (Phase 0a)
featureDir="..."
prefix="FTR-NNN"
ledgerPath="${featureDir}/${prefix}-token-ledger.json"
started_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Initialize ledger with running entry (Bash Write tool)
echo '[
  {
    "agent": "define-feature:define",
    "phase": "define",
    "model": "sonnet",
    "status": "running",
    "phase_delta_tokens": 0,
    "started_at": "'${started_at}'",
    "completed_at": null
  }
]' > "${ledgerPath}"

# ... perform grilling ...

# After grilling completes
completed_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
tokens=<compute from budget>

# Update entry (Bash Read → modify → Write)
# (Read ledger, parse, update status/timestamp/tokens, write back)
```

### 4.2 pm-phase1.js Workflow

**New behavior:**

1. **Before each agent call** (generate-requirements, generate-tech-spec, validate-feature-docs per cycle):
   - Append a `status: "running"` entry via `appendLedgerEntry()`.

2. **After each agent call:**
   - Update the entry via `updateLedgerEntry()` with final status, timestamp, and token delta.

3. **On startup:**
   - If the ledger file does not exist (define-feature was not used), create it silently with an empty array on the first write.

**Key changes:**

- Add helper functions `appendLedgerEntry()` and `updateLedgerEntry()` at the top of the file (local functions, not imported).
- Wrap the existing token tracking (`beforeReq = budget.spent()`, etc.) with ledger writes.
- Update validation cycle tracking to key entries as `validate-feature-docs:phase1:cycle{N}`.

**Pseudo-code:**
```javascript
export const meta = {
  name: 'pm-phase1',
  // ... existing ...
}

// ── Ledger helper functions ────────────────────────────────────
async function appendLedgerEntry(featureDir, prefix, entry) {
  // Read or create ledger
  // Append entry
  // Write back
}

async function updateLedgerEntry(featureDir, prefix, agentKey, updates) {
  // Read ledger
  // Find and update entry
  // Write back
}

// ── Main workflow ──────────────────────────────────────────────
const featurePath = args.split(/\s+/)[0]
const tokenLedger = []

phase('Discovery')
// ... existing discovery code ...

phase('Requirements')
if (discoveryResult.needs_requirements) {
  const started_at = new Date().toISOString()
  await appendLedgerEntry(feature_dir, prefix, {
    agent: 'generate-requirements:phase1',
    phase: 'phase1',
    model: 'haiku',
    status: 'running',
    phase_delta_tokens: 0,
    started_at,
    completed_at: null
  })

  const beforeReq = budget.spent()
  const reqResult = await agent(...)
  const reqTokens = budget.spent() - beforeReq

  await updateLedgerEntry(feature_dir, prefix, 'generate-requirements:phase1', {
    status: 'done',
    completed_at: new Date().toISOString(),
    phase_delta_tokens: reqTokens
  })

  tokenLedger.push({ agent: 'generate-requirements', model: 'haiku', phase_delta_tokens: reqTokens })
}

// ... similar pattern for generate-tech-spec ...

// ... for validation cycles: ...
let validationCycle = 0
while (revisionNeeded) {
  validationCycle++
  const started_at = new Date().toISOString()
  const agentKey = `validate-feature-docs:phase1:cycle${validationCycle}`
  
  await appendLedgerEntry(feature_dir, prefix, {
    agent: agentKey,
    phase: 'phase1',
    model: 'haiku',
    status: 'running',
    phase_delta_tokens: 0,
    started_at,
    completed_at: null
  })
  
  const beforeVal = budget.spent()
  const valResult = await agent(...)
  const valTokens = budget.spent() - beforeVal
  
  await updateLedgerEntry(feature_dir, prefix, agentKey, {
    status: 'done',
    completed_at: new Date().toISOString(),
    phase_delta_tokens: valTokens
  })
  
  tokenLedger.push({ agent: 'validate-feature-docs', model: 'haiku', phase_delta_tokens: valTokens })
  // ... check if done ...
}
```

### 4.3 pm-phase2.js Workflow

**New behavior:**

1. **Before generate-work-breakdown agent call:**
   - Append a `status: "running"` entry via `appendLedgerEntry()`.

2. **After the agent call:**
   - Update the entry via `updateLedgerEntry()` with final status, timestamp, and token delta.

3. **On startup:**
   - If the ledger file does not exist, create it silently on first write.

**Pseudo-code:**
```javascript
export const meta = {
  name: 'pm-phase2',
  // ... existing ...
}

// ── Ledger helper functions ────────────────────────────────────
async function appendLedgerEntry(featureDir, prefix, entry) {
  // ...
}

async function updateLedgerEntry(featureDir, prefix, agentKey, updates) {
  // ...
}

// ── Main workflow ──────────────────────────────────────────────
const featurePath = (typeof args === 'string' ? args : '').trim().split(/\s+/)[0]
const tokenLedger = []

phase('Work Breakdown')

log(`Running generate-work-breakdown for ${featurePath}`)

const started_at = new Date().toISOString()
await appendLedgerEntry(feature_dir, prefix, {
  agent: 'generate-work-breakdown:phase2',
  phase: 'phase2',
  model: 'haiku',
  status: 'running',
  phase_delta_tokens: 0,
  started_at,
  completed_at: null
})

const beforeWB = budget.spent()
await agent(featurePath, {
  agentType: 'generate-work-breakdown',
  label:     'generate-work-breakdown',
  phase:     'Work Breakdown',
})
const wbTokens = budget.spent() - beforeWB

await updateLedgerEntry(feature_dir, prefix, 'generate-work-breakdown:phase2', {
  status: 'done',
  completed_at: new Date().toISOString(),
  phase_delta_tokens: wbTokens
})

tokenLedger.push({ agent: 'generate-work-breakdown', model: 'haiku', phase_delta_tokens: wbTokens })
// ... rest of workflow ...
```

### 4.4 pm-phase3.js Workflow

**New behavior:**

1. **Before every `agent()` call** (read-wb-csv, each impl/test group in executePhase, review-solution, final-test-run, remediation, pr-and-registry, write-actuals, process-log):
   - Append a `status: "running"` entry via `appendLedgerEntry()`.

2. **After each `agent()` call:**
   - Update the entry via `updateLedgerEntry()` with final status (`"done"` or `"failed"`), timestamp, and token delta.

3. **Replace the existing per-phase `persist-ledger` step:**
   - Remove or simplify the single ledger write that happens once per phase.
   - The new write-before/update-after pattern makes it redundant (every entry is written immediately).

4. **Preserve the in-memory `tokenLedger` array:**
   - Continue accumulating entries in the in-memory array for backward compatibility with the Actuals phase aggregation (roleTotals, roleRows).
   - The Actuals phase uses this in-memory array to compute per-role token sums and write the Token-Estimate table.

5. **On failure (agent throws or is interrupted):**
   - Update the entry with `status: "failed"` and the current timestamp.
   - Propagate the error so the workflow can handle it (rework cycle, escalation, etc.).

6. **Address the `83bbaec` disk-preference guard:**
   - The guard (lines ~437–441 in pm-phase3.js) checks if an in-memory entry has `phase_delta_tokens === 0` and prefers the disk value.
   - With the new pattern, in-memory entries are updated immediately after each agent call, so this guard becomes mostly redundant.
   - **Decision: Keep the guard in place but harmless** — it will not overwrite a `status: "done"` entry with a zero-delta cached entry because the existing disk entry already has all fields populated. The guard only replaces the entire entry object if in-memory delta is 0, so a real done entry on disk will survive.

**Code changes:**

- Add helper functions `appendLedgerEntry()` and `updateLedgerEntry()` at the top of the file (before `meta`).
- Wrap every `await agent(...)` call with append + update.
- Remove or comment out the existing `persist-ledger` agent call(s) at the end of each phase loop (they were single haiku calls that wrote the accumulated `tokenLedger` to disk; this is now done entry-by-entry).
- In the Actuals phase: the existing fallback merge logic (lines ~421–446) remains unchanged, reading the disk ledger as a fallback. The guard at lines ~437–441 is left intact.

**Pseudo-code (excerpt from executePhase):**
```javascript
// ── Helper functions at top of pm-phase3.js ────────────────────
async function appendLedgerEntry(featureDir, prefix, entry) {
  // Read {featureDir}/{prefix}-token-ledger.json (or create if absent)
  // Append entry
  // Write atomically
}

async function updateLedgerEntry(featureDir, prefix, agentKey, updates) {
  // Read {featureDir}/{prefix}-token-ledger.json
  // Find and update entry by agentKey
  // Write atomically
}

// ── In executePhase (loop over impl_groups) ────────────────────
for (const group of implPhase.impl_groups) {
  const started_at = new Date().toISOString()
  const agentKey = `${group.agent_type}:${implPhase.phase_id}`
  
  await appendLedgerEntry(featureDir, prefix, {
    agent: agentKey,
    phase: 'phase3',
    model: 'sonnet',  // or 'haiku' depending on agent type
    status: 'running',
    phase_delta_tokens: 0,
    started_at,
    completed_at: null
  })
  
  const beforeAgent = budget.spent()
  const result = await agent(
    `...prompt for ${group.agent_type}...`,
    { label: `${group.agent_type}-${implPhase.phase_id}`, phase: 'Implementation', model: 'sonnet' }
  )
  const deltaTokens = budget.spent() - beforeAgent
  
  await updateLedgerEntry(featureDir, prefix, agentKey, {
    status: result.success ? 'done' : 'failed',
    completed_at: new Date().toISOString(),
    phase_delta_tokens: deltaTokens
  })
  
  tokenLedger.push({ agent: agentKey, model: 'sonnet', phase_delta_tokens: deltaTokens })
  // ... rest of loop ...
}

// ── Similarly for review-solution, test groups, etc. ────────────

// ── Remove or simplify per-phase persist-ledger ────────────────
// OLD:
//   await agent(`Write ledger...`, { label: 'persist-ledger', ... })
// NEW: (no explicit persist; entries are written entry-by-entry)

// ── Actuals phase: leave existing merge logic intact ────────────
// The fallback at lines ~421–446 remains unchanged.
// In-memory ledger is still populated, guard is still present.
```

### 4.5 Parallel Execution (pm-phase3 waves)

**Concurrency handling:**

In pm-phase3, multiple agents run in parallel within a wave (e.g., impl_groups for different domains running concurrently). Each parallel branch calls `appendLedgerEntry()` and `updateLedgerEntry()`, which read-modify-write the ledger file.

**Assumption:** The Claude Code Workflow runtime serializes file I/O at the subagent boundary. Each subagent runs sequentially (not in true OS threads), so file writes are effectively serialized even though the orchestrator `parallel()` dispatch is conceptually concurrent.

**If writes cause corruption:** Add a retry mechanism or unique per-branch temp key that merges at wave end. This is noted in the Risks section; implementation is deferred pending stress testing.

## 5. External Integrations

N/A — this feature is purely internal and does not integrate with external services.

## 6. Security Considerations

- **Sensitive data in ledger:** The ledger contains only agent names, phase names, models, timestamps, and token counts. No user data, credentials, or business logic is exposed.
- **File permissions:** The ledger file is stored in the feature directory alongside other build artifacts (feature.md, Requirements.md, Tech-Spec.md, etc.). It should inherit the same read/write permissions as the feature directory.
- **No authentication:** Ledger access is local filesystem only; no API or network exposure.

## 7. Database Changes

N/A — the ledger is a single JSON file, not a database.

## 8. Configuration

**Environment variables:** None required.

**App settings:** No new settings are needed. The ledger file path is deterministic: `{featureDir}/{PREFIX}-token-ledger.json`.

**Feature flags:** None.

## 9. File Inventory

### New files
| Path | Purpose |
|------|---------|
| (none — no new files; all changes are to existing workflow scripts) | — |

### Modified files
| Path | Change description |
|------|-------------------|
| `.claude/agents/define-feature.md` | Add ledger initialization and finalization (write initial running entry after featureDir creation, update to done on completion) |
| `.claude/workflows/pm-phase1.js` | Add `appendLedgerEntry()` and `updateLedgerEntry()` helpers; wrap each agent call (generate-requirements, generate-tech-spec, validate-feature-docs per cycle) with append + update pattern |
| `.claude/workflows/pm-phase2.js` | Add helper functions; wrap generate-work-breakdown agent call with append + update pattern |
| `.claude/workflows/pm-phase3.js` | Add helper functions; wrap all agent calls (read-wb-csv, impl groups, test groups, review-solution, final-test-run, remediation, pr-and-registry, write-actuals, process-log) with append + update pattern; remove or simplify per-phase persist-ledger steps; preserve in-memory tokenLedger for Actuals phase backward compatibility |
| `C:/Users/Tomada D/.claude/agents/define-feature.md` | (Global copy — identical to repo copy) |
| `C:/Users/Tomada D/.claude/workflows/pm-phase1.js` | (Global copy — identical to repo copy) |
| `C:/Users/Tomada D/.claude/workflows/pm-phase2.js` | (Global copy — identical to repo copy) |
| `C:/Users/Tomada D/.claude/workflows/pm-phase3.js` | (Global copy — identical to repo copy) |

**Dual-copy requirement:** Both the repo (`.claude/`) and global (`C:/Users/Tomada D/.claude/`) copies must be updated identically. This is a hard project constraint.

## 10. Testing Strategy

### Unit Tests

- **Ledger helper functions:** Test `appendLedgerEntry()` and `updateLedgerEntry()` in isolation.
  - Test appending a new entry to an empty ledger
  - Test appending to an existing ledger
  - Test updating an entry
  - Test handling of missing files (create on first write)
  - Test handling of malformed JSON (overwrite or recover)

### Integration Tests

- **Phase 1 workflows:** Mock agent calls and verify ledger entries are written correctly before and after each call.
- **Phase 2 workflows:** Same.
- **Phase 3 workflows:** Verify ledger entries for all agent types (impl, test, review, remediation, PR, actuals).

### Manual Verification

1. **Full pipeline run:** Run a complete feature delivery (define → phase1 → phase2 → phase3) and inspect the resulting ledger file:
   - Verify it contains one entry per agent call
   - Verify all entries have `status: "done"`, non-null timestamps, and positive token counts
   - Verify phase1 entries are present (previously lost)

2. **Mid-run inspection:** Interrupt a running phase (Ctrl+C or kill the process) and inspect the ledger:
   - Verify at least one entry has `status: "running"` and `completed_at: null`
   - Verify other entries are `"done"` or `"failed"`

3. **Resume test:** Resume a workflow run and verify:
   - Ledger entries with `status: "done"` are not re-run
   - First missing or `"running"` entry is the resume point
   - (This requires a separate resume orchestrator agent; the ledger enables it but doesn't implement it)

4. **Dual-copy verification:** After implementation, compare repo and global copies byte-by-byte:
   - `.claude/agents/define-feature.md` vs `C:/Users/Tomada D/.claude/agents/define-feature.md`
   - `.claude/workflows/pm-phase1.js` vs `C:/Users/Tomada D/.claude/workflows/pm-phase1.js`
   - Etc. for all four modified files

### Test Execution

Run `npm test` after implementation:
```bash
cd c:\ws\Fincantieri.CommonLibraries.AIToolkit
npm test
```

Verify all existing tests pass (no regressions) and no new failures are introduced.

## 11. Implementation Order

Numbered, dependency-aware sequence of tasks:

1. **Define helper functions** — depends on: nothing
   - Write `appendLedgerEntry()` function (read-modify-write pattern)
   - Write `updateLedgerEntry()` function (read-modify-write pattern)
   - Test in isolation with simple JSON file operations

2. **Update define-feature.md agent** — depends on: 1
   - Add ledger initialization after featureDir creation (write initial running entry with start time)
   - Add ledger finalization at completion (update entry to done with end time and token count)
   - Test with a simple feature definition run

3. **Update pm-phase1.js workflow** — depends on: 1
   - Add helper functions at top of file
   - Wrap generate-requirements with append + update
   - Wrap generate-tech-spec with append + update
   - Wrap validate-feature-docs loop with append + update (keying each cycle separately)
   - Test with phase1 run

4. **Update pm-phase2.js workflow** — depends on: 1
   - Add helper functions at top of file
   - Wrap generate-work-breakdown with append + update
   - Test with phase2 run

5. **Update pm-phase3.js workflow** — depends on: 1
   - Add helper functions at top of file
   - Wrap read-wb-csv with append + update
   - Wrap each impl group agent call with append + update
   - Wrap each test group agent call with append + update
   - Wrap review-solution with append + update (per rework cycle)
   - Wrap final-test-run with append + update
   - Wrap remediation with append + update
   - Wrap pr-and-registry with append + update
   - Wrap write-actuals with append + update
   - Wrap process-log with append + update
   - Remove or simplify per-phase persist-ledger agent calls
   - Verify in-memory tokenLedger is still populated (backward compatibility)
   - Verify Actuals phase fallback merge logic is preserved (and 83bbaec guard remains intact)
   - Test with full phase3 run

6. **Sync global copies** — depends on: 2, 3, 4, 5
   - Copy modified define-feature.md to `C:/Users/Tomada D/.claude/agents/`
   - Copy modified pm-phase1/2/3.js to `C:/Users/Tomada D/.claude/workflows/`
   - Verify copies are byte-identical to repo versions

7. **Run full test suite** — depends on: 6
   - Execute `npm test`
   - Verify no regressions
   - Verify AC-14 passes (all existing tests pass)

8. **Full pipeline test** — depends on: 7
   - Run a complete feature delivery from define to phase3
   - Inspect resulting ledger file (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06)
   - Inspect mid-run (AC-07)
   - Test skip-define-feature scenario (AC-08)
   - Verify Actuals aggregation is unchanged (AC-09)
   - Code review of guard logic (AC-10)
   - Verify copies are identical (AC-11)
   - Verify helper functions exist and are used everywhere (AC-12)
   - Verify JSON is valid mid-phase (AC-13)

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Concurrent writes in pm-phase3 parallel waves cause file corruption** | High — ledger becomes unreadable, resume is impossible | Each parallel branch already serialized by workflow runtime; if stress testing reveals corruption, add unique per-branch temp keys and merge at wave end |
| **Ledger file does not exist when pm-phase1 runs (define-feature was skipped)** | Low — phase1 crashes on first append attempt | `appendLedgerEntry()` creates file with empty array `[]` on first write; pm-phase1 gracefully initializes ledger from scratch |
| **JSON parse error when reading ledger** | Low — workflow crashes on invalid JSON | Helper functions treat parse errors as recoverable: log warning, treat as `[]`, continue with fresh ledger (non-fatal) |
| **Ledger entry not written before agent call completes or crashes** | Medium — entry remains with `status: "running"` forever | This is the correct signal for "interrupted here" on resume; future resume orchestrator detects it and restarts from this point |
| **83bbaec disk-preference guard is superseded or conflicts with new pattern** | Low — in-memory and disk ledgers diverge | Guard is preserved and harmless; it only replaces entire entry objects if in-memory delta is 0, so real done entries on disk survive; new pattern makes it mostly redundant but non-breaking |
| **Timestamps collide (two agents start at exact same millisecond)** | Very low — almost impossible in practice | Timestamps only serve as human-readable markers and liveness signals; exact uniqueness is not required; duration calculation uses started/completed pair, not individual entries |
| **Phase 1–2 phases run in different sessions and produce duplicate entries** | Low — unlikely given sequential workflow dispatch | Each phase is a separate workflow invocation; if orchestrator (implement-feature skill) reruns a phase, the resume logic (status-based, not entry count) will detect and skip already-done entries |
| **`model` field is missing or wrong in an entry** | Low — aggregation in Actuals phase uses a fallback model | Helper functions require `model` to be specified when appending; if missing, default to `"sonnet"` in `updateLedgerEntry()` |

## 13. Backward Compatibility

- **In-memory `tokenLedger` array:** Preserved exactly as-is. Existing Actuals phase aggregation (roleTotals, roleRows, per-agent detail table) continues unchanged.
- **Token-Estimate.md format:** Not modified by this feature. Per-role aggregations are written identically to the current output.
- **Existing `{PREFIX}-token-ledger.json` files (phase-3-only):** Will be overwritten on the next run. Old files contain no phase 1–2 entries, so no data loss of incompatible format.
- **Workflow script return contracts:** No changes to `meta`, `phases`, or returned objects. Orchestrators consume workflows unchanged.

## 14. Acceptance Criteria Mapping

| AC ID | Acceptance Criterion | Verification |
|-------|---------------------|--------------|
| AC-01 | Full pipeline ledger contains one entry per agent, all done with timestamps and positive tokens | Manual: inspect ledger after complete run |
| AC-02 | define-feature entry has agent="define-feature:define", phase="define", status="done", non-null completed_at | Manual: inspect first entry |
| AC-03 | generate-requirements entry exists with status="done" and positive tokens | Manual: find entry by agent key |
| AC-04 | Multiple validate-feature-docs cycles keyed separately (cycle1, cycle2, etc.) | Manual: count entries with "validate-feature-docs:phase1:cycle*" |
| AC-05 | generate-work-breakdown entry exists with status="done" and positive tokens | Manual: find entry |
| AC-06 | pm-phase3 entries all have status="done", timestamps, positive tokens | Manual: verify all phase3 entries |
| AC-07 | Mid-run inspection shows at least one running entry with completed_at=null | Manual: interrupt workflow and inspect |
| AC-08 | pm-phase1 creates ledger silently if define-feature was skipped | Manual: run phase1 without define-feature |
| AC-09 | In-memory tokenLedger unchanged; Actuals aggregation produces same result as before | Code review + manual: compare old and new Actuals sections |
| AC-10 | 83bbaec guard reviewed and either removed or confirmed harmless | Code review |
| AC-11 | Repo copy (.claude/) and global copy identical | Byte comparison: `diff` or `md5sum` |
| AC-12 | Helper functions exist at top of pm-phase3.js; all agent() calls use them | Code review + grep |
| AC-13 | Entry written mid-phase is valid JSON with status="running", non-null started_at, null completed_at | Manual: inspect file during run |
| AC-14 | `npm test` passes; no new failures | Test run output |
