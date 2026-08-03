# Ledger as Full Pipeline Activity Tracker

## Feature ID
FTR-013

## Summary
This feature evolves `{PREFIX}-token-ledger.json` from a passive phase-3-only token counter
into a full pipeline activity tracker that covers every agent from `define-feature` through
`pm-phase3`. Each entry records the agent identity, phase, model, status (`running | done |
failed | skipped`), token delta, and start/end timestamps. The result is a single file that
shows what happened, when, how long it took, token cost per agent, and exactly where to
resume after a stop or crash — without relying on the SDK's in-memory cache, which is lost
when Claude Code restarts.

## Problem Statement

Four concrete problems motivate this feature:

1. **No record before phase 3.** The current ledger is only written during `pm-phase3`. There
   is no persistent record of what happened in `define-feature`, `pm-phase1`, or `pm-phase2`.
   Token cost attribution for the first two phases is permanently lost.

2. **Resume is unreliable.** On workflow resume via `resumeFromRunId`, cached agents return
   `phase_delta_tokens=0`. A disk-preference guard (introduced in `83bbaec`) mitigates this,
   but it is fragile: it cannot distinguish a genuinely-zero-token agent from a cached one.
   Status + timestamp fields provide a deterministic signal: `duration = 0ms` is impossible
   for real work, so a running or zero-duration completed entry unambiguously marks a cached
   or interrupted agent.

3. **No cross-session resume.** The SDK cache is session-scoped; it is lost when Claude Code
   restarts. A persistent ledger enables a future bootstrap agent to read `status: "done"`
   entries and skip them, resuming from the first missing or `status: "running"` entry.

4. **No liveness signal.** Users cannot see what the pipeline is doing mid-run. A ledger with
   live `status: "running"` entries lets users open the file and observe pipeline progress in
   real time.

## Actors

N/A — internal/technical feature

## Core Flow (Happy Path)

The flow describes the ledger write pattern as it executes across all four phases of a
complete pipeline run.

### Phase: define

1. `define-feature` agent determines the FTR number and output directory (the point at which
   the ledger path is known).
2. Agent writes the ledger file at `{featureDir}/{PREFIX}-token-ledger.json` with a single
   entry: `{ agent: "define-feature:define", phase: "define", model: "sonnet", status:
   "running", phase_delta_tokens: 0, started_at: <ISO>, completed_at: null }`.
3. Agent completes its work (grilling + feature.md).
4. Agent updates the entry in-place: `status: "done"`, `completed_at: <ISO>`,
   `phase_delta_tokens: <actual>`.

### Phase: phase1 (pm-phase1.js)

5. Before calling `generate-requirements`: append a `status: "running"` entry with
   `started_at`.
6. After `generate-requirements` returns: update entry to `status: "done"`, `completed_at`,
   `phase_delta_tokens`.
7. Repeat for `generate-tech-spec` and for each `validate-feature-docs` cycle (entries keyed
   as e.g. `validate-feature-docs:phase1:cycle1`).
8. If the ledger file does not exist (define-feature was not used), pm-phase1 creates it
   silently from scratch.

### Phase: phase2 (pm-phase2.js)

9. Before calling `generate-work-breakdown`: append a `status: "running"` entry with
   `started_at`.
10. After it returns: update entry to `status: "done"`, `completed_at`, `phase_delta_tokens`.

### Phase: phase3 (pm-phase3.js)

11. Before every `agent()` call in `executePhase` and at the top level (read-wb-csv,
    final-test-run, remediation, pr-and-registry, write-actuals, process-log steps): append
    a `status: "running"` entry via `appendLedgerEntry(featureDir, prefix, entry)`.
12. After each `agent()` call returns: update the entry via
    `updateLedgerEntry(featureDir, prefix, agentKey, { status, completed_at,
    phase_delta_tokens })`.
13. On failure: update `status: "failed"`.
14. The existing per-phase `persist-ledger` step (one full write after each phase completes)
    is replaced by the new write-before/update-after pattern; the in-memory `tokenLedger`
    array continues to accumulate entries for the `Actuals` phase aggregation.

### End state

The ledger file contains one entry per agent invocation across the entire pipeline. Entries
with `status: "done"` have non-null `completed_at` and a positive `phase_delta_tokens`. The
file can be inspected at any point during the run to observe progress. On resume, a bootstrap
agent can skip `status: "done"` entries and restart from the first missing or interrupted
entry.

## Out of Scope

- A UI or dashboard for the ledger — the file itself is the output.
- Changes to `{PREFIX}-Token-Estimate.md` format — handled separately.
- Changes to any agent other than `define-feature`, `pm-phase1.js`, `pm-phase2.js`,
  `pm-phase3.js`.
- A resume orchestrator agent — the ledger enables it; building it is a separate feature.
- Global `~/.claude/` copies of workflow files that are NOT modified by this feature.
- Changes to `am-phase1.js` or `am-phase2.js` (assessment pipeline) — out of scope.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| Ledger file does not exist when pm-phase1 starts (define-feature was not used) | pm-phase1 creates the file silently from scratch with an empty array, then appends the first entry |
| Ledger file is missing or malformed JSON when any phase reads it | Phase logs the parse error, treats the ledger as an empty array, and continues; no crash |
| An agent() call throws or is interrupted before the update step | The entry remains with `status: "running"` and `completed_at: null` — this is the correct signal for "interrupted here" on resume |
| Two phases run in parallel (pm-phase3 wave execution) | Each parallel branch reads, mutates, and writes the full ledger array atomically; because `parallel()` dispatches subagents (not threads), writes are effectively serialised by the workflow runtime |
| define-feature is skipped; user writes feature.md manually | pm-phase1 creates the ledger on first write; no define-feature entry will appear — this is acceptable and expected |
| A cached agent on resume returns `phase_delta_tokens = 0` | The existing entry has `status: "done"` and non-null `completed_at`; the `83bbaec` disk-preference guard check is superseded by status: the cached response is detected because duration ≈ 0ms and status is already "done" on disk |
| `completed_at` equals `started_at` (duration = 0ms) | Impossible for a real agent invocation; treated as a cached/phantom agent on resume |
| The ledger is written concurrently by two waves in pm-phase3 | Atomic read-modify-write in each helper prevents partial-write corruption; the workflow runtime serialises file I/O at the subagent level |

## Data Model

N/A — internal/technical feature

## Roles and Permissions

N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A complete pipeline run (define → phase1 → phase2 → phase3) completes | The ledger file is inspected | It contains one entry per agent invocation across all four phases, with `status: "done"`, non-null `started_at` and `completed_at`, and positive `phase_delta_tokens` for each | Must |
| AC-02 | define-feature completes normally | The ledger file is read | The first entry has `agent: "define-feature:define"`, `phase: "define"`, `status: "done"`, and `completed_at` is not null | Must |
| AC-03 | pm-phase1 runs generate-requirements | The ledger file is read after pm-phase1 completes | An entry exists with `agent: "generate-requirements:phase1"` (or equivalent key), `status: "done"`, and positive `phase_delta_tokens` | Must |
| AC-04 | pm-phase1 runs validate-feature-docs in multiple revision cycles | The ledger file is read | One entry per cycle exists (e.g. `validate-feature-docs:phase1:cycle1`, `cycle2`) each with `status: "done"` | Must |
| AC-05 | pm-phase2 completes generate-work-breakdown | The ledger file is read | An entry exists with `agent: "generate-work-breakdown:phase2"` (or equivalent), `status: "done"`, and positive `phase_delta_tokens` | Must |
| AC-06 | pm-phase3 dispatches impl groups, test groups, review-solution, and commit for one phase | The ledger file is read after that phase | One entry per agent call exists, each with `status: "done"`, non-null timestamps, and positive `phase_delta_tokens` | Must |
| AC-07 | pm-phase3 is stopped mid-run (simulated by inspecting the file during a run) | The ledger file is read while a phase is executing | At least one entry has `status: "running"` and `completed_at: null`, identifying the interrupted agent | Must |
| AC-08 | define-feature was not used; user wrote feature.md manually | pm-phase1 runs | The ledger file is created without error; pm-phase1 entries are written correctly; no crash or warning surfaced to the user | Must |
| AC-09 | pm-phase3 runs with the new pattern | The in-memory `tokenLedger` array inspected before the Actuals phase | It still contains all entries with correct `phase_delta_tokens`; the Actuals aggregation (roleTotals) produces the same result as before | Must |
| AC-10 | The `83bbaec` disk-preference guard is reviewed | Code inspection | The guard is either removed (its function is now served by status+timestamp) or left intact but harmless; it does not overwrite a `status: "done"` entry with a zero-delta cached entry | Must |
| AC-11 | Both repo copy (`.claude/`) and global copy (`C:/Users/Tomada D/.claude/`) of each modified file are inspected | After implementation | Both copies are identical for each of: `define-feature.md`, `pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js` | Must |
| AC-12 | pm-phase3.js is inspected | Code review | Two helper functions `appendLedgerEntry(featureDir, prefix, entry)` and `updateLedgerEntry(featureDir, prefix, agentKey, updates)` exist at the top of the file; every agent() call site uses them | Must |
| AC-13 | A ledger entry is written mid-phase (before the agent call completes) | The file is read at that moment | The entry is valid JSON with `status: "running"`, a non-null `started_at`, and `completed_at: null` — no partial or corrupted JSON | Must |
| AC-14 | `npm test` is run after implementation | Jest runs | All existing tests pass; no new failures introduced | Must |

## MVP vs Deferred

### MVP (must ship)

- `define-feature.md`: write initial `status: "running"` entry once featureDir is known;
  update to `status: "done"` on completion using Bash UTC timestamp and Write tool
- `pm-phase1.js`: `appendLedgerEntry` / `updateLedgerEntry` helper pattern (inline or as
  local functions); ledger written before/after each agent call; ledger created from scratch
  if absent
- `pm-phase2.js`: same helper pattern around the `generate-work-breakdown` agent call
- `pm-phase3.js`: `appendLedgerEntry(featureDir, prefix, entry)` and
  `updateLedgerEntry(featureDir, prefix, agentKey, updates)` helper functions at the top of
  the file; every `agent()` call wrapped with write-before/update-after; existing per-phase
  persist-ledger step removed or simplified
- In-memory `tokenLedger` array preserved in pm-phase3 for backward compatibility with the
  Actuals aggregation
- Both repo (`.claude/`) and global (`C:/Users/Tomada D/.claude/`) copies of all four files
  updated

### Deferred (next iteration)

- Resume orchestrator agent that reads the ledger and skips done entries (ledger enables it;
  building it is a separate feature)
- `appendLedgerEntry` / `updateLedgerEntry` extracted as shared utilities imported by all
  three workflow scripts (currently duplicated per-file; acceptable for MVP given the small
  size)
- Progress percentage display (`done/total` entry count surfaced to the user mid-run)
- Ledger entries for the `persist-ledger` haiku agent calls themselves (meta-tracking)

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Should the `parallel()` wave execution in pm-phase3 be guarded with a file lock or retry on write conflict? The workflow runtime is believed to serialise file I/O at the subagent boundary, but this has not been stress-tested with two agents writing the ledger in the same wave. | Medium — if concurrent writes cause corruption, the ledger becomes unreadable; mitigation: each parallel branch could use a unique per-agent temp key and merge at wave end |

## Dependencies and Assumptions

- The ledger file path is `{featureDir}/{PREFIX}-token-ledger.json` — consistent with the
  current location written by pm-phase3. No path change is introduced.
- `define-feature` determines the featureDir (and therefore the ledger path) as part of its
  Phase 1 — Setup step (discovering the next FTR number and creating the output directory).
  The initial `status: "running"` entry is written immediately after the directory is created,
  before grilling begins.
- The UTC timestamp command `date -u +"%Y-%m-%dT%H:%M:%S"` (already used in pm-phase3
  process-log step) is the Bash command for timestamps in `define-feature`. Workflow scripts
  use `new Date().toISOString()` (available natively in Node.js).
- All ledger writes are atomic: the full JSON array is read, mutated in memory, and written
  back in one operation. No partial writes.
- The `83bbaec` disk-preference guard in pm-phase3's Actuals phase checks
  `phase_delta_tokens === 0` on in-memory entries and prefers the disk value. With the new
  pattern, in-memory entries are updated immediately after each agent call, so the guard
  becomes redundant. It may be left in place (harmless) or removed — implementation
  decision.
- Both the repo copy (`.claude/`) and the global copy (`C:/Users/Tomada D/.claude/`) of
  each modified file must be updated. This is a hard constraint from the project's dual-copy
  requirement.
- `npm test` is the verification command after any change to workflow scripts or agent files.
- The in-memory `tokenLedger` array in pm-phase3 is preserved so that the Actuals phase
  aggregation (`roleTotals`, `roleRows`, per-agent detail table) continues to work unchanged.
  The new disk writes are additive, not a replacement for the in-memory accumulator.
- FTR-012 is already shipped (`83bbaec` + `d45653a`). This feature starts from the current
  develop branch state.
