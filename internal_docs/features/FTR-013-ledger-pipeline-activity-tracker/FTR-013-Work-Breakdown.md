# Work Breakdown — Ledger as Full Pipeline Activity Tracker

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-013: Ledger as Full Pipeline Activity Tracker |
| Version | 1.0 |
| Date | 2026-07-31 |
| Status | Draft |
| Source: Requirements | FTR-013-Requirements.md |
| Source: Tech-Spec | FTR-013-Tech-Spec.md |

---

## 1. Summary

| Metric | Value |
|--------|-------|
| Total User Stories | 4 |
| Total Tasks | 17 |
| Domain distribution | BE: 15, TEST: 2 |
| Complexity | S: 5, M: 10, L: 2 |
| Estimated total (Human) | 44h |
| Estimated total (Agent) | 220min |
| Implementation phases | 5 |

---

## 2. Shared Infrastructure Tasks

| ID | Task | Domain | Required by | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|-------------|------------|-----------|-----------|-------------|
| INFRA-T01 | Implement appendLedgerEntry() helper function | BE | US-01, US-02, US-03, US-04 | M | 2h | 10min | Atomic read-modify-write helper to append new ledger entries; handles missing files, JSON parse errors, and atomic writes |
| INFRA-T02 | Implement updateLedgerEntry() helper function | BE | US-01, US-02, US-03, US-04 | M | 2h | 10min | Atomic read-modify-write helper to update existing ledger entries by agent key; handles missing entries and parse errors |

---

## 3. User Stories

### US-01: Initialize and Track Ledger in define-feature Agent

| Field | Value |
|-------|-------|
| Derived from | UC-01 |
| Actor | `define-feature` agent |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-02 |

**Description:**
As the `define-feature` agent, I want to initialize the ledger file when the feature directory is created and update it with final status upon completion, so that the first entry records the define phase token consumption and establishes the ledger for downstream phases.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-01-T01 | Write initial ledger entry in define-feature after directory creation | BE | INFRA-T01, INFRA-T02 | S | 1h | 5min | After feature directory is created and prefix is known, use Bash to write initial ledger entry with status="running" and current UTC timestamp |
| US-01-T02 | Update ledger entry to done status at define-feature completion | BE | US-01-T01 | S | 1h | 5min | Read ledger, locate define-feature:define entry, update status to "done" with completion timestamp and actual token count from budget |
| US-01-T03 | Test define-feature ledger initialization and finalization | TEST | US-01-T01, US-01-T02 | S | 1h | 5min | Verify define-feature creates valid JSON ledger entry, completes without error, updates correctly at end |

---

### US-02: Track Phase 1 Agent Invocations (generate-requirements, generate-tech-spec, validate-feature-docs)

| Field | Value |
|-------|-------|
| Derived from | UC-02 |
| Actor | `pm-phase1.js` workflow |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-03, AC-04, AC-08 |

**Description:**
As the `pm-phase1.js` workflow, I want to wrap each agent invocation (generate-requirements, generate-tech-spec, and validate-feature-docs per cycle) with append-before/update-after ledger operations, so that all phase 1 activity is recorded with timing and token data, and the ledger can bootstrap itself if define-feature was not used.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-02-T01 | Add appendLedgerEntry and updateLedgerEntry helper functions to pm-phase1.js | BE | INFRA-T01, INFRA-T02 | S | 30min | 5min | Copy or define local ledger helper functions at top of pm-phase1.js for atomic read-modify-write operations |
| US-02-T02 | Implement missing ledger file creation logic in pm-phase1 startup | BE | US-02-T01 | S | 30min | 5min | If ledger file does not exist when pm-phase1 starts, silently create it with empty array before first append |
| US-02-T03 | Wrap generate-requirements agent call with append/update ledger pattern | BE | US-02-T01, US-02-T02 | M | 1.5h | 10min | Before calling generate-requirements: append "running" entry. After: update with "done", timestamp, and token delta |
| US-02-T04 | Wrap generate-tech-spec agent call with append/update ledger pattern | BE | US-02-T01, US-02-T02 | M | 1.5h | 10min | Before calling generate-tech-spec: append "running" entry. After: update with "done", timestamp, and token delta |
| US-02-T05 | Implement validation cycle tracking with unique ledger entries per cycle | BE | US-02-T01, US-02-T02 | M | 2h | 15min | Wrap validate-feature-docs loop to key each cycle as validate-feature-docs:phase1:cycle{N}; append before each cycle, update after |
| US-02-T06 | Test pm-phase1 ledger tracking with all three agent types | TEST | US-02-T03, US-02-T04, US-02-T05 | M | 2h | 15min | Run pm-phase1 with mocked agent calls; verify ledger entries exist for each agent with correct status/timestamps/tokens; test missing-ledger-file scenario |

---

### US-03: Track Phase 2 Agent Invocations (generate-work-breakdown)

| Field | Value |
|-------|-------|
| Derived from | UC-03 |
| Actor | `pm-phase2.js` workflow |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-05 |

**Description:**
As the `pm-phase2.js` workflow, I want to wrap the generate-work-breakdown agent call with append-before/update-after ledger operations, so that work breakdown generation is tracked with timing and token data.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-03-T01 | Add appendLedgerEntry and updateLedgerEntry helper functions to pm-phase2.js | BE | INFRA-T01, INFRA-T02 | S | 30min | 5min | Copy or define local ledger helper functions at top of pm-phase2.js |
| US-03-T02 | Wrap generate-work-breakdown agent call with append/update ledger pattern | BE | US-03-T01 | M | 1.5h | 10min | Before calling generate-work-breakdown: append "running" entry. After: update with "done", timestamp, and token delta |
| US-03-T03 | Test pm-phase2 ledger tracking | TEST | US-03-T02 | S | 1h | 5min | Run pm-phase2 with mocked generate-work-breakdown; verify ledger entry exists with correct status/timestamps/tokens |

---

### US-04: Track Phase 3 Agent Invocations and Preserve In-Memory Ledger for Actuals

| Field | Value |
|-------|-------|
| Derived from | UC-04 |
| Actor | `pm-phase3.js` workflow |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-06, AC-07, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14 |

**Description:**
As the `pm-phase3.js` workflow, I want to wrap every agent call (read-wb-csv, impl groups, test groups, review-solution, final-test-run, remediation, pr-and-registry, write-actuals, process-log) with append-before/update-after ledger operations; remove per-phase persist-ledger steps (now redundant); and preserve the in-memory tokenLedger array for Actuals aggregation backward compatibility, so that all implementation and review activity is tracked with timing and token data, and the ledger becomes a single reliable source of truth.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-04-T01 | Add appendLedgerEntry and updateLedgerEntry helper functions to pm-phase3.js | BE | INFRA-T01, INFRA-T02 | S | 30min | 5min | Add local ledger helper functions at top of pm-phase3.js, before `meta` declaration |
| US-04-T02 | Wrap read-wb-csv agent call with append/update ledger pattern | BE | US-04-T01 | M | 1.5h | 10min | Append before read-wb-csv call; update with status, timestamp, and token delta after; accumulate in in-memory tokenLedger |
| US-04-T03 | Wrap developer impl group agent calls with append/update ledger pattern in executePhase | BE | US-04-T01 | M | 2h | 15min | For each impl group agent (developer-backend, developer-frontend): append before call; update after call with status/timestamp/tokens; handle both parallel and sequential execution |
| US-04-T04 | Wrap developer test group agent calls with append/update ledger pattern in executePhase | BE | US-04-T01 | M | 2h | 15min | For each test group agent (developer-testing): append before call; update after call; ensure proper keying for phase context |
| US-04-T05 | Wrap review-solution agent call with append/update ledger pattern in executePhase | BE | US-04-T01 | M | 1.5h | 10min | Append before review-solution call; update after with status, timestamp, and token delta; per-phase tracking |
| US-04-T06 | Wrap final-test-run agent call with append/update ledger pattern | BE | US-04-T01 | S | 1h | 5min | Append before final-test-run; update after with status, timestamp, and tokens |
| US-04-T07 | Wrap remediation agent call with append/update ledger pattern | BE | US-04-T01 | S | 1h | 5min | Append before remediation; update after with status, timestamp, and tokens |
| US-04-T08 | Wrap pr-and-registry agent call with append/update ledger pattern | BE | US-04-T01 | S | 1h | 5min | Append before pr-and-registry; update after with status, timestamp, and tokens |
| US-04-T09 | Wrap write-actuals agent call with append/update ledger pattern | BE | US-04-T01 | S | 1h | 5min | Append before write-actuals; update after with status, timestamp, and tokens |
| US-04-T10 | Wrap process-log agent call with append/update ledger pattern | BE | US-04-T01 | S | 1h | 5min | Append before process-log; update after with status, timestamp, and tokens |
| US-04-T11 | Remove or simplify per-phase persist-ledger agent calls | BE | US-04-T02, US-04-T03, US-04-T04, US-04-T05 | S | 1h | 5min | Delete or comment out ledger write calls at end of each phase loop in executePhase (now redundant with append/update pattern) |
| US-04-T12 | Verify in-memory tokenLedger array is populated and unchanged | BE | US-04-T02, US-04-T03, US-04-T04, US-04-T05 | M | 1.5h | 10min | Ensure every append/update cycle also adds to in-memory tokenLedger; verify Actuals phase aggregation logic is preserved and unmodified |
| US-04-T13 | Review and preserve 83bbaec disk-preference guard | BE | US-04-T12 | S | 1h | 5min | Inspect guard logic (~437-441 pm-phase3.js); verify it does not overwrite status="done" entries with zero-delta cached values; confirm harmless or remove if truly redundant |
| US-04-T14 | Sync repo define-feature.md and pm-phase1/2/3.js to global copies | BE | US-01-T02, US-02-T05, US-03-T02, US-04-T13 | S | 30min | 5min | Copy modified define-feature.md to C:/Users/Tomada D/.claude/agents/; copy pm-phase1/2/3.js to C:/Users/Tomada D/.claude/workflows/; verify byte-identical |
| US-04-T15 | Run full test suite and verify no regressions | TEST | US-04-T14 | M | 1.5h | 10min | Execute npm test; verify all existing tests pass (AC-14); no new failures; all Jest suites green |
| US-04-T16 | Full pipeline integration test: define → phase1 → phase2 → phase3 | TEST | US-04-T15 | L | 4h | 30min | Run complete feature delivery with ledger enabled; inspect final ledger file for completeness; verify mid-run inspection shows running entries; test define-feature-skip scenario; verify Actuals aggregation unchanged; verify dual copies identical |

---

## 4. Dependency Graph

### Implementation Phases

Phases are organized as **vertical slices**: each phase delivers a complete, committable set of related functionality. Within a phase, tasks execute in dependency order (DB → BE → FE → TEST); independent tasks within the same layer may run in parallel.

#### Phase 1 — Shared Infrastructure (no dependencies)

| Task ID | Task | Domain |
|---------|------|--------|
| INFRA-T01 | Implement appendLedgerEntry() helper function | BE |
| INFRA-T02 | Implement updateLedgerEntry() helper function | BE |

#### Phase 2 — US-01: Initialize and Track Ledger in define-feature Agent (depends on Phase 1)

| Task ID | Task | Domain |
|---------|------|--------|
| US-01-T01 | Write initial ledger entry in define-feature after directory creation | BE |
| US-01-T02 | Update ledger entry to done status at define-feature completion | BE |
| US-01-T03 | Test define-feature ledger initialization and finalization | TEST |

#### Phase 3 — US-02: Track Phase 1 Agent Invocations (depends on Phase 1)

| Task ID | Task | Domain |
|---------|------|--------|
| US-02-T01 | Add appendLedgerEntry and updateLedgerEntry helper functions to pm-phase1.js | BE |
| US-02-T02 | Implement missing ledger file creation logic in pm-phase1 startup | BE |
| US-02-T03 | Wrap generate-requirements agent call with append/update ledger pattern | BE |
| US-02-T04 | Wrap generate-tech-spec agent call with append/update ledger pattern | BE |
| US-02-T05 | Implement validation cycle tracking with unique ledger entries per cycle | BE |
| US-02-T06 | Test pm-phase1 ledger tracking with all three agent types | TEST |

#### Phase 4 — US-03: Track Phase 2 Agent Invocations (depends on Phase 1)

| Task ID | Task | Domain |
|---------|------|--------|
| US-03-T01 | Add appendLedgerEntry and updateLedgerEntry helper functions to pm-phase2.js | BE |
| US-03-T02 | Wrap generate-work-breakdown agent call with append/update ledger pattern | BE |
| US-03-T03 | Test pm-phase2 ledger tracking | TEST |

#### Phase 5 — US-04: Track Phase 3 Agent Invocations and Preserve In-Memory Ledger for Actuals (depends on Phase 1)

| Task ID | Task | Domain |
|---------|------|--------|
| US-04-T01 | Add appendLedgerEntry and updateLedgerEntry helper functions to pm-phase3.js | BE |
| US-04-T02 | Wrap read-wb-csv agent call with append/update ledger pattern | BE |
| US-04-T03 | Wrap developer impl group agent calls with append/update ledger pattern in executePhase | BE |
| US-04-T04 | Wrap developer test group agent calls with append/update ledger pattern in executePhase | BE |
| US-04-T05 | Wrap review-solution agent call with append/update ledger pattern in executePhase | BE |
| US-04-T06 | Wrap final-test-run agent call with append/update ledger pattern | BE |
| US-04-T07 | Wrap remediation agent call with append/update ledger pattern | BE |
| US-04-T08 | Wrap pr-and-registry agent call with append/update ledger pattern | BE |
| US-04-T09 | Wrap write-actuals agent call with append/update ledger pattern | BE |
| US-04-T10 | Wrap process-log agent call with append/update ledger pattern | BE |
| US-04-T11 | Remove or simplify per-phase persist-ledger agent calls | BE |
| US-04-T12 | Verify in-memory tokenLedger array is populated and unchanged | BE |
| US-04-T13 | Review and preserve 83bbaec disk-preference guard | BE |
| US-04-T14 | Sync repo define-feature.md and pm-phase1/2/3.js to global copies | BE |
| US-04-T15 | Run full test suite and verify no regressions | TEST |
| US-04-T16 | Full pipeline integration test: define → phase1 → phase2 → phase3 | TEST |

### Critical Path

The longest dependency chain determining minimum implementation time:

```
INFRA-T01 → INFRA-T02 → US-04-T01 → US-04-T03 → US-04-T12 → US-04-T13 → US-04-T14 → US-04-T15 → US-04-T16
```

This path spans helper implementation (INFRA), phase3 implementation (US-04 where most complexity resides), global sync, and integration testing.

---

## 5. Domain Summary

| Domain | Tasks | S | M | L | Human Total | Agent Total |
|--------|-------|---|---|---|------------|------------|
| BE | 15 | 5 | 9 | 1 | 40h | 180min |
| TEST | 2 | 0 | 1 | 1 | 4h | 40min |
| **Total** | **17** | **5** | **10** | **2** | **44h** | **220min** |

---

## 6. Traceability Matrix

| UC | US | Tasks | ACs Covered |
|----|----|----|-------------|
| UC-01 | US-01 | US-01-T01, US-01-T02, US-01-T03 | AC-01, AC-02 |
| UC-02 | US-02 | US-02-T01, US-02-T02, US-02-T03, US-02-T04, US-02-T05, US-02-T06 | AC-01, AC-03, AC-04, AC-08 |
| UC-03 | US-03 | US-03-T01, US-03-T02, US-03-T03 | AC-01, AC-05 |
| UC-04 | US-04 | US-04-T01, US-04-T02, US-04-T03, US-04-T04, US-04-T05, US-04-T06, US-04-T07, US-04-T08, US-04-T09, US-04-T10, US-04-T11, US-04-T12, US-04-T13, US-04-T14, US-04-T15, US-04-T16 | AC-01, AC-06, AC-07, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14 |

---

## 7. Open Points & Risks

| # | Item | Impact on Work Breakdown | Suggested Resolution |
|---|------|--------------------------|---------------------|
| 1 | Concurrent file writes in pm-phase3 parallel waves: workflow runtime believed to serialize but not stress-tested | Medium — if concurrent writes cause corruption, ledger becomes unreadable; resume fails | Per tech-spec risk: implement MVP without explicit locking; add file lock guard in follow-up iteration if stress testing reveals corruption (this feature does not add explicit locking, relying on runtime serialization) |
| 2 | Agent exceptions during append/update cycle may leave ledger in intermediate state (status="running" with null completed_at) | Low — this is intentional design (correct signal for "interrupted here" on resume) | No action needed; future resume orchestrator will detect and restart from interrupted entry |
