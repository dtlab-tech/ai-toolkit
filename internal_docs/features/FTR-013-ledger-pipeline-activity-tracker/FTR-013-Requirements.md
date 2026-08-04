# Functional Requirements — Ledger as Full Pipeline Activity Tracker

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-013: Ledger as Full Pipeline Activity Tracker |
| Version | 1.0 |
| Date | 2026-07-31 |
| Status | Draft |

## 1. Introduction

### 1.1 Purpose

This requirements document specifies the functional behavior of FTR-013, which evolves the feature token ledger from a passive phase-3-only token counter into a full end-to-end pipeline activity tracker. The ledger must record activity for every agent invocation from `define-feature` through `pm-phase3`, enabling liveness visibility, resume reliability, and persistent cross-session activity history.

### 1.2 Scope

**In Scope:**
- Ledger initialization and write patterns in `define-feature` agent
- Ledger append/update operations in `pm-phase1.js` around `generate-requirements`, `generate-tech-spec`, and `validate-feature-docs` invocations
- Ledger append/update operations in `pm-phase2.js` around `generate-work-breakdown` invocation
- Ledger append/update operations in `pm-phase3.js` around all `agent()` calls (read-wb-csv, impl groups, test groups, review-solution, commit, final-test-run, remediation, pr-and-registry, write-actuals, process-log)
- Atomic read-modify-write ledger helpers: `appendLedgerEntry()` and `updateLedgerEntry()`
- In-memory `tokenLedger` array preservation for Actuals aggregation
- Both repo (`.claude/`) and global (`C:/Users/Tomada D/.claude/`) file copies
- JSON structure validation and error handling (malformed ledger file recovery)

**Out of Scope:**
- Ledger UI or dashboard
- Changes to `{PREFIX}-Token-Estimate.md` format (separate feature)
- Assessment pipeline agents (`am-phase1.js`, `am-phase2.js`)
- Resume orchestrator agent (enabled by ledger, but separate feature)
- Global `~/.claude/` copies outside the specified path

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| `define-feature` agent | Initializes ledger on feature creation; records define phase activity |
| `pm-phase1.js` workflow | Appends/updates entries for requirements, tech-spec, and validation cycles |
| `pm-phase2.js` workflow | Appends/updates entries for work-breakdown generation |
| `pm-phase3.js` workflow | Appends/updates entries for all implementation, test, review, and commit agents |
| `tokenLedger` array (pm-phase3) | In-memory accumulator for Actuals phase cost aggregation |

## 2. Use Cases

### UC-01: Initialize Ledger on Feature Creation

| Field | Value |
|-------|-------|
| Actor | `define-feature` agent |
| Preconditions | Feature FTR number determined; feature directory created |
| Trigger | Feature directory is about to be used for first time |
| Priority | Must |

**Main flow:**
1. `define-feature` determines the feature FTR number and output directory path
2. Create the directory `{featureDir}` on disk
3. Write a new ledger file at `{featureDir}/{PREFIX}-token-ledger.json` with an empty array `[]`
4. Append a single entry: `{ agent: "define-feature:define", phase: "define", model: "sonnet", status: "running", phase_delta_tokens: 0, started_at: <ISO-8601-timestamp>, completed_at: null }`
5. Agent performs its work (grilling, feature.md generation)
6. After work completes, read ledger file, locate the `define-feature:define` entry, update it in-place: set `status: "done"`, set `completed_at` to current UTC timestamp, set `phase_delta_tokens` to actual token consumption
7. Write the updated ledger array back to disk atomically

**Alternative flows:**
- None

**Error flows:**
- Write fails due to file permissions → Log error and continue; define-feature completion is not blocked
- Feature directory already contains a ledger file → Append to existing array instead of creating new file

**Postconditions:**
- Ledger file exists at expected path
- File contains exactly one entry with `status: "done"`, non-null `completed_at`, and actual `phase_delta_tokens`

### UC-02: Phase 1 — Track Requirements and Tech Spec Generation

| Field | Value |
|-------|-------|
| Actor | `pm-phase1.js` workflow |
| Preconditions | Feature directory exists; ledger file may or may not exist |
| Trigger | `pm-phase1` begins execution |
| Priority | Must |

**Main flow:**
1. Workflow starts; check if ledger file exists at `{featureDir}/{PREFIX}-token-ledger.json`
2. If file does not exist, initialize it with empty array `[]` silently
3. Before calling `generate-requirements` agent:
   - Append entry: `{ agent: "generate-requirements:phase1", phase: "phase1", model: <model>, status: "running", phase_delta_tokens: 0, started_at: <ISO-8601>, completed_at: null }`
   - Write ledger atomically to disk
4. Call `generate-requirements` agent; wait for completion and capture `phase_delta_tokens`
5. Read ledger file; locate entry with key `generate-requirements:phase1`; update in-place: set `status: "done"`, set `completed_at`, set `phase_delta_tokens` to actual value
6. Write ledger atomically to disk
7. Before calling `generate-tech-spec` agent:
   - Append entry: `{ agent: "generate-tech-spec:phase1", phase: "phase1", model: <model>, status: "running", phase_delta_tokens: 0, started_at: <ISO-8601>, completed_at: null }`
   - Write ledger atomically
8. Call `generate-tech-spec` agent; wait for completion and capture tokens
9. Read ledger; locate `generate-tech-spec:phase1` entry; update: `status: "done"`, `completed_at`, `phase_delta_tokens`
10. Write ledger atomically
11. For each validation cycle (e.g., cycle 1, 2, 3, ...):
    - Append entry: `{ agent: "validate-feature-docs:phase1:cycle{N}", phase: "phase1", model: <model>, status: "running", phase_delta_tokens: 0, started_at: <ISO-8601>, completed_at: null }`
    - Write ledger atomically
    - Call `validate-feature-docs` agent; wait for completion and capture tokens
    - Read ledger; locate cycle-specific entry; update: `status: "done"`, `completed_at`, `phase_delta_tokens`
    - Write ledger atomically

**Alternative flows:**
- Ledger file missing on workflow start → Create it from scratch; continue without user warning
- Validation completes without needing additional cycles → No cycle entries beyond the one completed cycle

**Error flows:**
- Ledger file is malformed JSON → Log parse error; treat as empty array `[]` and continue
- Write operation fails → Log error; do not block workflow; continue with next step
- Agent call throws exception → Update ledger entry with `status: "failed"`, `completed_at`, `phase_delta_tokens: 0`; propagate exception

**Postconditions:**
- Ledger contains entries for `generate-requirements:phase1`, `generate-tech-spec:phase1`, and one entry per validation cycle
- All entries have `status: "done"` (or `"failed"` if agent threw) with non-null `completed_at`
- Each completed entry has positive `phase_delta_tokens`

### UC-03: Phase 2 — Track Work Breakdown Generation

| Field | Value |
|-------|-------|
| Actor | `pm-phase2.js` workflow |
| Preconditions | Feature directory exists; ledger file exists and is valid |
| Trigger | `pm-phase2` begins execution |
| Priority | Must |

**Main flow:**
1. Before calling `generate-work-breakdown` agent:
   - Append entry: `{ agent: "generate-work-breakdown:phase2", phase: "phase2", model: <model>, status: "running", phase_delta_tokens: 0, started_at: <ISO-8601>, completed_at: null }`
   - Write ledger atomically to disk
2. Call `generate-work-breakdown` agent; wait for completion and capture `phase_delta_tokens`
3. Read ledger file; locate entry with key `generate-work-breakdown:phase2`
4. Update entry in-place: set `status: "done"`, set `completed_at`, set `phase_delta_tokens` to actual value
5. Write ledger atomically to disk

**Alternative flows:**
- None

**Error flows:**
- Ledger file missing or malformed → Create from scratch and continue
- Write operation fails → Log error; do not block workflow
- Agent call throws → Update entry with `status: "failed"`; propagate exception

**Postconditions:**
- Ledger contains entry `generate-work-breakdown:phase2` with `status: "done"`, non-null `completed_at`, and positive `phase_delta_tokens`

### UC-04: Phase 3 — Track All Agent Invocations with Write-Before/Update-After Pattern

| Field | Value |
|-------|-------|
| Actor | `pm-phase3.js` workflow |
| Preconditions | Feature directory and ledger file exist |
| Trigger | `pm-phase3` begins execution |
| Priority | Must |

**Main flow:**
1. For each `agent()` call in the workflow (read-wb-csv, executePhase subagents, final-test-run, remediation, pr-and-registry, write-actuals, process-log):
   - **Before** calling agent:
     - Call helper function `appendLedgerEntry(featureDir, prefix, entry)` where entry is `{ agent: "<agent-name>:<phase>", phase: "phase3", model: <model>, status: "running", phase_delta_tokens: 0, started_at: <ISO-8601>, completed_at: null }`
     - Helper atomically reads ledger, appends entry, and writes back
   - Call `agent()` and wait for completion; capture result and `phase_delta_tokens`
   - **After** call returns:
     - Call helper function `updateLedgerEntry(featureDir, prefix, agentKey, { status: "done", completed_at: <ISO-8601>, phase_delta_tokens: <actual> })`
     - Helper atomically reads ledger, locates entry by `agentKey`, updates fields, and writes back
   - Accumulate entry in in-memory `tokenLedger` array for later Actuals aggregation (unchanged from current behavior)
2. In `executePhase` (wave execution):
   - Apply write-before/update-after pattern to each subagent call (impl groups, test groups, review-solution, commit)
3. Replace the existing per-phase `persist-ledger` step:
   - Remove individual writes after each phase
   - OR simplify to a single verification write at end of workflow (optional; disk writes already happen via helpers)
4. At completion, the in-memory `tokenLedger` array is passed to Actuals aggregation as before

**Alternative flows:**
- Parallel wave execution (multiple agents from `executePhase` running concurrently):
  - Each branch reads current ledger, appends/updates independently
  - Workflow runtime serializes file I/O at subagent boundary; no explicit locking required
  - Last write wins; all entries eventually appear in final ledger

**Error flows:**
- Agent call throws or times out → Update ledger entry with `status: "failed"`, set `completed_at`, set `phase_delta_tokens: 0`
- Write operation fails → Log error; do not block workflow
- Ledger file is missing or malformed → Create from scratch and continue
- In-memory `tokenLedger` entry has `phase_delta_tokens: 0` but disk entry has positive value (cached agent on resume) → Disk value is preferred by existing guard; status field provides secondary confirmation that entry is complete

**Postconditions:**
- Ledger contains one entry per agent invocation (one per subagent in executePhase, one per validate cycle, one per top-level call)
- All completed entries have `status: "done"`, non-null `started_at` and `completed_at`, and positive `phase_delta_tokens`
- Failed or interrupted entries have `status: "failed"` or `status: "running"` respectively, with `completed_at: null`
- In-memory `tokenLedger` array has all correct token values for Actuals aggregation

### UC-05: Resume After Interruption

| Field | Value |
|-------|-------|
| Actor | Future bootstrap agent (enabled by this feature) |
| Preconditions | Workflow was interrupted; ledger file persists with mixed `status` values |
| Trigger | Workflow resume requested by user |
| Priority | Should |

**Main flow:**
1. Bootstrap agent reads ledger file from disk
2. Iterate through ledger entries:
   - For each entry with `status: "done"`: skip agent; continue to next entry
   - For each entry with `status: "running"`: this marks the interruption point; resume from this agent
   - For each entry with `status: "failed"`: user decision (retry or skip); TBD by resume feature
3. Resume workflow from the identified agent

**Alternative flows:**
- All entries have `status: "done"` → Workflow already complete; no resume needed

**Error flows:**
- None in this use case (error handling is external to ledger)

**Postconditions:**
- Bootstrap agent has identified the exact resume point without relying on in-memory cache

---

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | Every ledger entry must have a unique `agent` key (combination of agent name, phase, and optional cycle/index) | UC-02, UC-03, UC-04 |
| BR-02 | A `status: "done"` entry must have a non-null `completed_at` and positive `phase_delta_tokens` | UC-02, UC-03, UC-04 |
| BR-03 | A `status: "running"` entry must have a non-null `started_at` and null `completed_at` | UC-02, UC-03, UC-04 |
| BR-04 | A `status: "failed"` entry must have a non-null `completed_at` and `phase_delta_tokens >= 0` | UC-04 (error flow) |
| BR-05 | Duration of a real agent invocation cannot be zero (started_at ≠ completed_at) | UC-04 (cached agent detection) |
| BR-06 | All ledger writes must be atomic: read entire array, modify in memory, write entire array in one operation | UC-02, UC-03, UC-04 |
| BR-07 | If ledger file is missing when a phase starts, the phase creates it silently with an empty array before appending the first entry | UC-02, UC-03 |
| BR-08 | If ledger file is malformed JSON, the phase logs the parse error, treats it as an empty array, and continues without crashing | UC-02, UC-03, UC-04 |
| BR-09 | The in-memory `tokenLedger` array in pm-phase3 is preserved unchanged for backward compatibility with Actuals aggregation | UC-04 |
| BR-10 | Both repo (`.claude/`) and global (`C:/Users/Tomada D/.claude/`) copies of workflow files are updated identically | UC-01, UC-02, UC-03, UC-04 |

---

## 4. Data Requirements

### 4.1 Ledger Entry Entity

**Structure:**
```json
{
  "agent": "string",           // e.g. "define-feature:define", "generate-requirements:phase1", "validate-feature-docs:phase1:cycle2"
  "phase": "string",           // one of: "define", "phase1", "phase2", "phase3"
  "model": "string",           // e.g. "sonnet", "haiku"
  "status": "string",          // one of: "running", "done", "failed", "skipped"
  "phase_delta_tokens": "number", // non-negative integer; 0 while "running"
  "started_at": "string",      // ISO-8601 UTC timestamp, e.g. "2026-07-31T14:32:45Z"
  "completed_at": "string|null" // ISO-8601 UTC timestamp or null if status is "running"
}
```

**Ledger File:**
```json
[
  { agent: "define-feature:define", phase: "define", ... },
  { agent: "generate-requirements:phase1", phase: "phase1", ... },
  ...
]
```

**Location:** `{featureDir}/{PREFIX}-token-ledger.json`

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| `agent` | Non-empty string; must be unique within the ledger for a single workflow run |
| `phase` | Must be one of: "define", "phase1", "phase2", "phase3" |
| `model` | Non-empty string; typical values: "sonnet", "haiku" |
| `status` | Must be one of: "running", "done", "failed", "skipped" |
| `phase_delta_tokens` | Non-negative integer; must be > 0 if status is "done" |
| `started_at` | Non-null ISO-8601 UTC timestamp when entry is created |
| `completed_at` | Non-null ISO-8601 UTC timestamp if status is "done" or "failed"; must be null if status is "running"; must be >= `started_at` |
| Entry-level | If status is "done", then `phase_delta_tokens > 0` and `completed_at` is not null |
| Entry-level | If status is "running", then `completed_at` is null and `phase_delta_tokens` is 0 |
| File-level | Ledger file is a valid JSON array with zero or more entries |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Performance | Ledger read-modify-write for each agent call must complete in < 100ms (typical file I/O latency) |
| NFR-02 | Reliability | All ledger writes must be atomic; no partial or corrupted JSON on disk, even if write is interrupted |
| NFR-03 | Usability | Ledger file can be inspected by user at any time during workflow execution; format is human-readable JSON |
| NFR-04 | Concurrency | Parallel agent calls in `executePhase` wave must not cause ledger file corruption; workflow runtime serializes file I/O |
| NFR-05 | Backward Compatibility | In-memory `tokenLedger` array is unchanged; Actuals aggregation produces identical results pre- and post-feature |
| NFR-06 | Error Handling | Malformed ledger file does not crash workflow; error is logged and ledger treated as empty array |
| NFR-07 | Deployment | Both repo (`.claude/`) and global (`C:/Users/Tomada D/.claude/`) copies of all modified files must be identical |
| NFR-08 | Testing | All existing Jest tests pass after implementation; no new test failures introduced |

---

## 6. UI Requirements

### 6.1 Pages / Screens

Not applicable — this is an internal/technical feature. The ledger file itself is the output and is inspected directly by users and bootstrap agents.

### 6.2 Navigation Flow

Not applicable.

---

## 7. Acceptance Criteria

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-01 | Given a complete pipeline run (define → phase1 → phase2 → phase3) completes, when the ledger file is inspected, then it contains one entry per agent invocation across all four phases, each with `status: "done"`, non-null `started_at` and `completed_at`, and positive `phase_delta_tokens` | UC-01, UC-02, UC-03, UC-04 |
| AC-02 | Given `define-feature` completes normally, when the ledger file is read, then the first entry has `agent: "define-feature:define"`, `phase: "define"`, `status: "done"`, and `completed_at` is not null | UC-01 |
| AC-03 | Given pm-phase1 runs `generate-requirements`, when the ledger file is read after pm-phase1 completes, then an entry exists with `agent: "generate-requirements:phase1"`, `status: "done"`, and positive `phase_delta_tokens` | UC-02 |
| AC-04 | Given pm-phase1 runs `validate-feature-docs` in multiple revision cycles, when the ledger file is read, then one entry per cycle exists (e.g. `validate-feature-docs:phase1:cycle1`, `validate-feature-docs:phase1:cycle2`) each with `status: "done"` | UC-02 |
| AC-05 | Given pm-phase2 completes `generate-work-breakdown`, when the ledger file is read, then an entry exists with `agent: "generate-work-breakdown:phase2"`, `status: "done"`, and positive `phase_delta_tokens` | UC-03 |
| AC-06 | Given pm-phase3 dispatches impl groups, test groups, review-solution, and commit for one phase, when the ledger file is read after that phase, then one entry per agent call exists, each with `status: "done"`, non-null timestamps, and positive `phase_delta_tokens` | UC-04 |
| AC-07 | Given pm-phase3 is stopped mid-run (simulated by inspecting the file during a run), when the ledger file is read while a phase is executing, then at least one entry has `status: "running"` and `completed_at: null`, identifying the interrupted agent | UC-04 |
| AC-08 | Given `define-feature` was not used; user wrote `feature.md` manually, when pm-phase1 runs, then the ledger file is created without error; pm-phase1 entries are written correctly; no crash or user-facing warning | UC-02 |
| AC-09 | Given pm-phase3 runs with the new ledger pattern, when the in-memory `tokenLedger` array is inspected before the Actuals phase, then it contains all entries with correct `phase_delta_tokens`; the Actuals aggregation (roleTotals) produces the same result as before the feature | UC-04 |
| AC-10 | Given the `83bbaec` disk-preference guard is reviewed, when code inspection occurs, then the guard either is removed (its function now served by status+timestamp) or left intact but harmless; it does not overwrite a `status: "done"` entry with a zero-delta cached entry | UC-04 |
| AC-11 | Given both repo copy (`.claude/`) and global copy (`C:/Users/Tomada D/.claude/`) of each modified file are inspected, when comparing after implementation, then both copies are identical for each of: `define-feature.md`, `pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js` | UC-01, UC-02, UC-03, UC-04 |
| AC-12 | Given pm-phase3.js is inspected, when code review occurs, then two helper functions `appendLedgerEntry(featureDir, prefix, entry)` and `updateLedgerEntry(featureDir, prefix, agentKey, updates)` exist at the top of the file; every `agent()` call site uses them consistently | UC-04 |
| AC-13 | Given a ledger entry is written mid-phase (before the agent call completes), when the file is read at that moment, then the entry is valid JSON with `status: "running"`, a non-null `started_at`, and `completed_at: null` — no partial or corrupted JSON | UC-02, UC-03, UC-04 |
| AC-14 | Given `npm test` is run after implementation, when Jest runs, then all existing tests pass; no new failures are introduced | UC-01, UC-02, UC-03, UC-04 |

---

## 8. Dependencies & Assumptions

### Dependencies
- **File system:** ledger file must be readable and writable at `{featureDir}/{PREFIX}-token-ledger.json`
- **Timestamp generation:**
  - `define-feature` uses Bash UTC command: `date -u +"%Y-%m-%dT%H:%M:%S"` (already used in pm-phase3 process-log step)
  - Workflow scripts (pm-phase1.js, pm-phase2.js, pm-phase3.js) use Node.js `new Date().toISOString()`
- **Workflow runtime:** Serializes file I/O at subagent boundary; parallel wave execution does not require explicit locking
- **Existing PM-Phase 3 behavior:** In-memory `tokenLedger` array, Actuals aggregation, and `83bbaec` disk-preference guard all remain unchanged

### Assumptions
- The ledger file path is `{featureDir}/{PREFIX}-token-ledger.json` (consistent with current location written by pm-phase3; no path change)
- `define-feature` determines the featureDir in its Phase 1 — Setup step (discovering next FTR number and creating directory); initial ledger entry is written immediately after directory creation, before grilling begins
- All ledger writes are atomic: full JSON array is read, mutated in memory, and written back in one operation (no partial writes)
- The `83bbaec` disk-preference guard in pm-phase3's Actuals phase becomes redundant with the new pattern (in-memory entries updated immediately after each agent call); may be left in place (harmless) or removed — implementation decision
- Both repo copy (`.claude/`) and global copy (`C:/Users/Tomada D/.claude/`) of each modified file must be updated; this is a hard project constraint
- `npm test` is the verification command after any change to workflow scripts
- FTR-012 is already shipped; this feature starts from the current develop branch state

### Related Features
- **FTR-012 (Installer Bash Allowlist)** — shipped; this feature builds on top of current pm-phase3 with the `83bbaec` disk-preference guard in place
- **Resume Orchestrator (future)** — enabled by this feature; ledger provides persistent resume point detection
- **Token-Estimate cost columns (follow-up)** — separate from ledger; scheduled after FTR-012

---

## 9. Open Questions

| # | Question | Impact | Suggested Resolution |
|---|----------|--------|---------------------|
| 1 | Should the `parallel()` wave execution in pm-phase3 be guarded with a file lock or retry on write conflict? The workflow runtime is believed to serialize file I/O at the subagent boundary, but this has not been stress-tested with two agents writing the ledger in the same wave. | Medium — if concurrent writes cause corruption, the ledger becomes unreadable; mitigation: each parallel branch could use a unique per-agent temp key and merge at wave end | Implement as MVP without explicit locking; add file lock guard in follow-up iteration if stress testing reveals corruption |
