# Work Breakdown — FTR-018

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-018 |
| Schema | v2 |
| Generated | 2026-09-28T14:47:20.272Z |

## Summary
| Metric | Value |
|--------|-------|
| Total tasks | 46 |
| Total phases | 10 |
| Within target (≤15 min) | 43 |
| Above target (16–20 min) | 3 |
| Warning (21–30 min) | 0 |
| Split required (>30 min) | 0 |
| Domain distribution | BE: 34, FE: 0, DB: 0, DevOps: 0, INFRA: 5, TEST: 7 |

## Infrastructure Phase (INFRA)

### Commit
feat(FTR-018): setup executor infrastructure: state protocol, ledger extension, module skeleton

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| INFRA-TASK-BE-01 | Define and implement executor state protocol schema | lib/task-executor/store.js exports versioned State class with schema validation, atomic write, readback, and recovery methods for runs, tasks, attempts, receipts, and intents | BE | 18 | — | 1 cmd — [details](#task-INFRA-TASK-BE-01) |
| INFRA-TASK-BE-02 | Implement backward-compatible ledger extension | lib/execution-ledger.js exports finalizeActivity function with status/tokens/reason/completedAt; preserves all existing open/close/fail/skip behavior; adds no duplicate counter | BE | 14 | — | 1 cmd — [details](#task-INFRA-TASK-BE-02) |
| INFRA-TASK-BE-03 | Create task-executor module skeleton with public interface | lib/task-executor/index.js exports execute, status, diagnose, stop, reconcile, resume, replan functions with documented signatures; module loads store, ownership, plan, claude-process, git, ledger modules | BE | 12 | INFRA-TASK-BE-01, INFRA-TASK-BE-02 | 1 cmd — [details](#task-INFRA-TASK-BE-03) |

## User Story Phases

### US-01: As a coordinator, I want to parse and validate the approved Work Breakdown, so that I can schedule tasks deterministically

### Commit
feat(FTR-018): implement US-01 approved-plan parsing and validation

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-01-TASK-BE-01 | Implement MD task detail parser | lib/task-executor/plan.js exports parseMarkdown function that extracts all 14 task fields from rendered Work Breakdown Markdown with lossless command fence preservation | BE | 13 | — | 1 cmd — [details](#task-US-01-TASK-BE-01) |
| US-01-TASK-BE-02 | Implement CSV parser and phase-task mapping | lib/task-executor/plan.js exports parseCSV and mapPhases functions; validates eight-column pipe-separated format, aggregates phase dependencies, reconciles task IDs with MD | BE | 11 | US-01-TASK-BE-01 | 1 cmd — [details](#task-US-01-TASK-BE-02) |
| US-01-TASK-BE-03 | Implement DAG validation and cycle detection | lib/task-executor/plan.js exports validateDAG function; rejects non-DAG graphs, duplicate task IDs, missing fields, and MD/CSV parity mismatches before any state mutation | BE | 12 | US-01-TASK-BE-02 | 1 cmd — [details](#task-US-01-TASK-BE-03) |
| US-01-TASK-BE-04 | Implement content digest and immutable plan snapshot | lib/task-executor/plan.js exports createPlanSnapshot; computes SHA256 over MD/CSV bytes and format version; binds digest to normalized task objects; snapshot is read-only for run lifetime | BE | 11 | US-01-TASK-BE-03 | 1 cmd — [details](#task-US-01-TASK-BE-04) |
| US-01-TASK-BE-05 | Implement stable topological scheduler (Kahn's algorithm) | lib/task-executor/plan.js exports computeReadyQueue; returns stable, deterministic task ordering by phase then source index then ID; two identical inputs produce identical schedules | BE | 14 | US-01-TASK-BE-04 | 1 cmd — [details](#task-US-01-TASK-BE-05) |

### US-02: As a coordinator, I want to acquire an exclusive lock and prevent duplicate coordinators, so that I own the execution

### Commit
feat(FTR-018): implement US-02 exclusive lock and ownership protocol

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-02-TASK-BE-01 | Implement repo-wide execution lease protocol | lib/task-executor/ownership.js exports acquireLease, releaseLease, readLease; enforces one repo-wide coordinator; persists lease with nonce, host, PID, runId, generation | BE | 15 | INFRA-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-BE-01) |
| US-02-TASK-BE-02 | Implement stale lock detection with process liveness checks | lib/task-executor/ownership.js exports checkOwnerLiveness; checks OS process identity and start time; permits recovery only with confirmed dead evidence; never by age alone | BE | 13 | US-02-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-BE-02) |
| US-02-TASK-BE-03 | Implement ownership guard for atomic lease transitions | lib/task-executor/ownership.js exports createOwnershipGuard; atomic compare-and-swap for lease acquisition/release/reclaim; exclusive mkdir guard prevents concurrent transitions | BE | 12 | US-02-TASK-BE-02 | 1 cmd — [details](#task-US-02-TASK-BE-03) |

### US-03: As a coordinator, I want to dispatch one implementation agent per task per attempt, so that I can track execution precisely

### Commit
feat(FTR-018): implement US-03 single-task agent dispatch

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-03-TASK-BE-01 | Implement Claude subprocess adapter | lib/task-executor/claude-process.js exports spawnClaudeAgent; async spawn with shell:false, validated executable, stdin prompt feed, stdout/stderr buffering with result validation before verification | BE | 14 | INFRA-TASK-BE-03 | 1 cmd — [details](#task-US-03-TASK-BE-01) |
| US-03-TASK-BE-02 | Implement agent provenance verification (FTR-017 contract) | lib/task-executor/claude-process.js exports verifyAgentIdentity; calls agents resolve --require-verified, caches nativeName/sha256/path, compares loaded definition with registry result | BE | 11 | US-03-TASK-BE-01 | 1 cmd — [details](#task-US-03-TASK-BE-02) |
| US-03-TASK-BE-03 | Implement task dispatch orchestration with ownership coordination | lib/task-executor/index.js dispatches single task per attempt; persists run/task/attempt identity and ledger activity before invocation; blocks dispatch on missing lock, failed pre-dispatch checks, or identity verification failure | BE | 13 | US-03-TASK-BE-02, US-02-TASK-BE-03 | 1 cmd — [details](#task-US-03-TASK-BE-03) |
| US-03-TASK-BE-04 | Implement result capture and immediate telemetry persistence | lib/task-executor/store.js persists implementation result receipt before verification; records tokens (or null with reason), elapsed/active time, exit code, outcome; does not overwrite existing attempts | BE | 12 | US-03-TASK-BE-03, INFRA-TASK-BE-01 | 1 cmd — [details](#task-US-03-TASK-BE-04) |

### US-04: As a coordinator, I want to run verifications and review, so that I can validate task outcomes before commit

### Commit
feat(FTR-018): implement US-04 verifications and review

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-04-TASK-BE-01 | Implement verification command executor | lib/task-executor/index.js runVerifications executes approved fenced command blocks from Work Breakdown; requires each command exit 0; persists each result before proceeding to review | BE | 13 | INFRA-TASK-BE-03 | 1 cmd — [details](#task-US-04-TASK-BE-01) |
| US-04-TASK-BE-02 | Implement review agent dispatch with diff context | lib/task-executor/index.js runReview dispatches review-solution agent with task context, exact diff, and review criteria; reads review result and validation rules | BE | 12 | US-04-TASK-BE-01, US-03-TASK-BE-02 | 1 cmd — [details](#task-US-04-TASK-BE-02) |
| US-04-TASK-BE-03 | Implement verification and review outcome persistence | lib/task-executor/store.js persists verification exit codes and review receipt with passed/failed status and blocking findings before proceeding to checkpoint | BE | 11 | US-04-TASK-BE-02 | 1 cmd — [details](#task-US-04-TASK-BE-03) |
| US-04-TASK-TEST-01 | Write verification and review integration tests | tests/task-executor/verification-review.test.js covers full verification+review+outcome cycle with multiple command blocks, review pass/fail scenarios, and outcome persistence validation | TEST | 15 | US-04-TASK-BE-03 | 1 cmd — [details](#task-US-04-TASK-TEST-01) |

### US-05: As a coordinator, I want to checkpoint, stage, commit, and register SHA, so that I can persist verified work to the repository

### Commit
feat(FTR-018): implement US-05 checkpoint and commit protocol

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-05-TASK-BE-01 | Implement checkpoint intent persistence | lib/task-executor/git.js exports persistCheckpointIntent; records feature/run/task/attempt/baseline SHA/expected tree/review/diff inventory/commit message before any commit attempt | BE | 12 | INFRA-TASK-BE-01 | 1 cmd — [details](#task-US-05-TASK-BE-01) |
| US-05-TASK-BE-02 | Implement controlled staging with path enumeration | lib/task-executor/git.js exports stageTaskFiles; stages only task-attributable paths via argv, validates resulting tree equals intent, detects hook mutations or external changes | BE | 13 | US-05-TASK-BE-01 | 1 cmd — [details](#task-US-05-TASK-BE-02) |
| US-05-TASK-BE-03 | Implement commit creation with task trailers | lib/task-executor/git.js exports createTaskCommit; commits with AI-Toolkit-Run/Task/Attempt/Plan trailers; validates parent/tree/ancestry on correct branch; detects hook failures | BE | 12 | US-05-TASK-BE-02 | 1 cmd — [details](#task-US-05-TASK-BE-03) |
| US-05-TASK-BE-04 | Implement SHA registration outside worktree | lib/task-executor/store.js exports registerCommitSHA; persists SHA in executor state after commit confirmation; does not embed SHA in commit itself (no recursive commits) | BE | 11 | US-05-TASK-BE-03 | 1 cmd — [details](#task-US-05-TASK-BE-04) |
| US-05-TASK-BE-05 | Implement commit/ledger reconciliation and task completion | lib/task-executor/index.js finalizes ledger entry only after SHA registered and verified on feature branch; marks task checkpointed; closes task activity in ledger | BE | 13 | US-05-TASK-BE-04, INFRA-TASK-BE-02 | 1 cmd — [details](#task-US-05-TASK-BE-05) |

### US-06: As a coordinator, I want to resume from persisted evidence and reconcile without re-execution, so that I can recover from interruptions safely

### Commit
feat(FTR-018): implement US-06 resume and replan

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-06-TASK-BE-01 | Implement resume and reconcile command logic | lib/task-executor/index.js exports resume and reconcile commands; loads persisted state and evidence; classifies task status per edge-cases table; returns next safe action | BE | 14 | INFRA-TASK-BE-03, US-05-TASK-BE-05 | 1 cmd — [details](#task-US-06-TASK-BE-01) |
| US-06-TASK-BE-02 | Implement evidence evaluation per edge-cases table | lib/task-executor/index.js evaluates persisted evidence (checkpoint, commit, review, diff, worker liveness) and determines: no-reimplementation, reconcile-SHA, recheck-verification, preserve-diff, or block | BE | 13 | US-06-TASK-BE-01 | 1 cmd — [details](#task-US-06-TASK-BE-02) |
| US-06-TASK-BE-03 | Implement replan command with approval validation | lib/task-executor/index.js exports replan command; validates successor plan Gate 2 approval; records old->new plan digest mapping; preserves original run and attempts; does not auto-start successor | BE | 12 | US-06-TASK-BE-02, US-01-TASK-BE-05 | 1 cmd — [details](#task-US-06-TASK-BE-03) |
| US-06-TASK-TEST-01 | Write resume and replan integration tests | tests/task-executor/resume-replan.test.js covers resume dedup (no re-dispatch while worker live), evidence classification, replan approval flow, repeated resume idempotency | TEST | 15 | US-06-TASK-BE-03 | 1 cmd — [details](#task-US-06-TASK-TEST-01) |

### US-07: As a coordinator, I want to run sequential execution with one active task, so that I can execute safely in a single worktree

### Commit
feat(FTR-018): implement US-07 sequential execution

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-07-TASK-BE-01 | Implement sequential executor main loop with ready-queue dispatch | lib/task-executor/index.js execute with maxConcurrency=1 reserves one task slot; dispatches from ready queue; reserves slot through dispatch/verify/review/checkpoint/commit; releases after integration or safe stop | BE | 15 | US-03-TASK-BE-03, US-01-TASK-BE-05 | 1 cmd — [details](#task-US-07-TASK-BE-01) |
| US-07-TASK-BE-02 | Implement cooperative and immediate stop modes | lib/task-executor/index.js stop command with mode graceful (complete running verification, block new dispatch) or immediate (request termination, await confirmed stop); persists stop request; status confirms stop | BE | 12 | US-07-TASK-BE-01 | 1 cmd — [details](#task-US-07-TASK-BE-02) |
| US-07-TASK-TEST-01 | Write sequential execution end-to-end tests | tests/task-executor/sequential.test.js covers task ordering, one-at-a-time capacity invariant, stop modes, partial results before stop, recovery on resume | TEST | 14 | US-07-TASK-BE-02 | 1 cmd — [details](#task-US-07-TASK-TEST-01) |

### US-08: As a coordinator, I want to run parallel execution with N isolated worktrees, so that I can execute independent tasks concurrently

### Commit
feat(FTR-018): implement US-08 parallel execution with isolated worktrees

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-08-TASK-BE-01 | Implement isolated worktree creation and management | lib/task-executor/index.js creates worktree under run-owned root; unique path per attempt/task; returns worktree path and cleanup callback; validates worktree independence | BE | 13 | US-07-TASK-BE-01 | 1 cmd — [details](#task-US-08-TASK-BE-01) |
| US-08-TASK-BE-02 | Implement N-limit concurrency control and slot reservation | lib/task-executor/index.js with maxConcurrency=N reserves N task slots; increments active slot counter at dispatch; decrements only after integration verified; enforces N limit | BE | 13 | US-08-TASK-BE-01 | 1 cmd — [details](#task-US-08-TASK-BE-02) |
| US-08-TASK-BE-03 | Implement serial integration with dispatch-order sequencing | lib/task-executor/git.js exports integrateAttempt; cherry-picks from attempt branch to integration worktree; advances feature ref via compare-and-swap at expected HEAD; integrations serial by dispatch sequence | BE | 15 | US-08-TASK-BE-02, US-05-TASK-BE-05 | 1 cmd — [details](#task-US-08-TASK-BE-03) |
| US-08-TASK-BE-04 | Implement original and integrated SHA tracking | lib/task-executor/store.js tracks originalSha (from attempt technical branch) and integratedSha (on feature branch after cherry-pick) separately; updates integration attempt record | BE | 11 | US-08-TASK-BE-03 | 1 cmd — [details](#task-US-08-TASK-BE-04) |
| US-08-TASK-INFRA-01 | Configure and verify npm distribution payload | package.json "files" includes lib/task-executor/ and the bin CLI entry; tests/task-executor/ and fixtures are excluded; npm pack --dry-run confirms the executor module and CLI are present in the tarball and that test/fixture paths are absent | INFRA | 12 | INFRA-TASK-BE-03 | 3 cmd — [details](#task-US-08-TASK-INFRA-01) |
| US-08-TASK-BE-05 | Implement platform qualification guard (refuse non-Windows execution) | lib/task-executor/index.js execute() aborts with a non-zero platform-unsupported error when process.platform is not win32 — before any agent dispatch or worktree creation — enforcing the E-02 process-supervision qualification which is proven for Windows only | BE | 10 | US-07-TASK-BE-01 | 1 cmd — [details](#task-US-08-TASK-BE-05) |
| US-08-TASK-TEST-01 | Write parallel execution end-to-end tests | tests/task-executor/parallel.test.js covers N slot reservation, concurrent dispatch, serial integration, dedup prevention, integration conflict handling, N=2/3 scenarios | TEST | 15 | US-08-TASK-BE-04 | 1 cmd — [details](#task-US-08-TASK-TEST-01) |
| US-08-TASK-TEST-02 | Test platform qualification guard prevents non-Windows execution | tests/task-executor/platform-guard.test.js asserts that with process.platform simulated as non-win32, execute() aborts with the platform-unsupported error and dispatches no agent and creates no worktree; and asserts win32 passes the guard | TEST | 10 | US-08-TASK-BE-05 | 1 cmd — [details](#task-US-08-TASK-TEST-02) |

### US-09: As a project manager, I want to integrate the executor into implement-feature and test it with real features, so that the toolkit is production-ready

### Commit
feat(FTR-018): implement US-09 executor integration and end-to-end testing

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-09-TASK-BE-01 | Integrate new executor into implement-feature skill | src/claude/skills/implement-feature/SKILL.md dispatches executor start command after Gate 2; removes old pm-phase3 grouping path; presents run command to user | BE | 11 | INFRA-TASK-BE-03 | 2 cmd — [details](#task-US-09-TASK-BE-01) |
| US-09-TASK-INFRA-01 | Add executor CLI commands to bin/cli.js | bin/cli.js exports executor command dispatcher; routes start/status/diagnose/stop/reconcile/resume/replan to lib/task-executor/index.js; implements CLI contract with exit codes and JSON output | INFRA | 12 | INFRA-TASK-BE-03 | 1 cmd — [details](#task-US-09-TASK-INFRA-01) |
| US-09-TASK-INFRA-02 | Register executor module and CLI in asset catalog | lib/asset-catalog.js registers the task-executor module and its CLI commands so the toolkit resolver and preflight recognise them | INFRA | 8 | US-09-TASK-INFRA-01 | 1 cmd — [details](#task-US-09-TASK-INFRA-02) |
| US-09-TASK-TEST-01 | Write fault injection and recovery tests | tests/task-executor/fault-injection.test.js covers crash windows: before/after dispatch, verification, checkpoint-prepared, commit, state-write, ledger-finalization; verifies no false completions and artifact preservation | TEST | 20 | US-08-TASK-TEST-01 | 1 cmd — [details](#task-US-09-TASK-TEST-01) |
| US-09-TASK-INFRA-03 | Document executor CLI contract | docs/task-executor-cli.md documents the seven commands, their flags, exit codes, and the JSON result schema | INFRA | 8 | US-09-TASK-INFRA-02 | 2 cmd — [details](#task-US-09-TASK-INFRA-03) |
| US-09-TASK-INFRA-04 | Document bootstrap procedure and runtime constraints | docs/task-executor-bootstrap.md documents the supervised task-by-task delivery procedure after Gates 1/2 and declares the Windows-only E-02 qualification and the persistence caveats | INFRA | 8 | US-09-TASK-INFRA-03 | 2 cmd — [details](#task-US-09-TASK-INFRA-04) |
| US-09-TASK-TEST-02 | Execute authorized end-to-end test with real feature and Claude runtime | tests/task-executor/real-feature.test.js runs executor against approved real feature with actual Claude implementation agents; documents observed token usage, cancellation behavior, runtime bridge constraints; stores evidence under evidence/FTR-018-e2e/ | TEST | 18 | US-09-TASK-INFRA-04 | 2 cmd — [details](#task-US-09-TASK-TEST-02) |

## Task Details

> Authoritative per-task detail. Every field is rendered integrally so this document, together with the dispatch CSV, is a complete deliverable requiring no separate JSON. Verification commands are preserved **verbatim** in fenced code blocks — operators such as `||`, shell pipes `|`, and regex alternations (`grep -E 'a|b|c'`) survive byte-for-byte. Each command is an independent fenced block.

<a id="task-INFRA-TASK-BE-01"></a>
### INFRA-TASK-BE-01

- **Task ID:** INFRA-TASK-BE-01
- **Title:** Define and implement executor state protocol schema
- **Outcome:** lib/task-executor/store.js exports versioned State class with schema validation, atomic write, readback, and recovery methods for runs, tasks, attempts, receipts, and intents
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 42000
- **Output count:** 1
- **Grouping rationale:** State schema is foundational for all executor operations; its versioning, atomicity model, and recovery protocol must be defined as a single cohesive unit before dependent modules are implemented
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add executor state protocol (store.js) with versioned schema and atomic writes

**Verification commands:**

```
npm test -- --testPathPattern=store.test
```

<a id="task-INFRA-TASK-BE-02"></a>
### INFRA-TASK-BE-02

- **Task ID:** INFRA-TASK-BE-02
- **Title:** Implement backward-compatible ledger extension
- **Outcome:** lib/execution-ledger.js exports finalizeActivity function with status/tokens/reason/completedAt; preserves all existing open/close/fail/skip behavior; adds no duplicate counter
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** Ledger extension maintains backward-compatible interface while adding executor-specific fields; single interface change requires unified testing and verification
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add ledger finalizeActivity for executor task completion

**Verification commands:**

```
npm test -- --testPathPattern=execution-ledger.test
```

<a id="task-INFRA-TASK-BE-03"></a>
### INFRA-TASK-BE-03

- **Task ID:** INFRA-TASK-BE-03
- **Title:** Create task-executor module skeleton with public interface
- **Outcome:** lib/task-executor/index.js exports execute, status, diagnose, stop, reconcile, resume, replan functions with documented signatures; module loads store, ownership, plan, claude-process, git, ledger modules
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01, INFRA-TASK-BE-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Module skeleton establishes the single public API boundary; defining all seven command signatures and module dependencies is an atomic structural decision required before any US implementation begins
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add task-executor module skeleton (index.js)

**Verification commands:**

```
node -e "const e = require('./lib/task-executor'); console.log(typeof e.execute, typeof e.resume)"
```

<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Implement MD task detail parser
- **Outcome:** lib/task-executor/plan.js exports parseMarkdown function that extracts all 14 task fields from rendered Work Breakdown Markdown with lossless command fence preservation
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-02
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 31000
- **Output count:** 1
- **Grouping rationale:** MD parsing is a single-concern parser module; it extracts lossless task details from a specific document format without validation logic, making it an atomic independently-testable unit
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add Work Breakdown Markdown parser (plan.js)

**Verification commands:**

```
npm test -- --testPathPattern=plan.*.markdown
```

<a id="task-US-01-TASK-BE-02"></a>
### US-01-TASK-BE-02

- **Task ID:** US-01-TASK-BE-02
- **Title:** Implement CSV parser and phase-task mapping
- **Outcome:** lib/task-executor/plan.js exports parseCSV and mapPhases functions; validates eight-column pipe-separated format, aggregates phase dependencies, reconciles task IDs with MD
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-02
- **Estimate — agent minutes:** 11
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** CSV parsing and phase-task mapping are closely coupled (CSV is the phase-level projection, MD is task detail); together they form a single cross-reference verification step that cannot be meaningfully split
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add Work Breakdown CSV parser and phase mapping

**Verification commands:**

```
npm test -- --testPathPattern=plan.*.csv
```

<a id="task-US-01-TASK-BE-03"></a>
### US-01-TASK-BE-03

- **Task ID:** US-01-TASK-BE-03
- **Title:** Implement DAG validation and cycle detection
- **Outcome:** lib/task-executor/plan.js exports validateDAG function; rejects non-DAG graphs, duplicate task IDs, missing fields, and MD/CSV parity mismatches before any state mutation
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-02
- **Acceptance criteria:** AC-02
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** DAG validation and cycle detection are a single pre-dispatch check; both use the full graph state and must run atomically before execution can proceed
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add DAG validation and cycle detection

**Verification commands:**

```
npm test -- --testPathPattern=plan.*.validation
```

<a id="task-US-01-TASK-BE-04"></a>
### US-01-TASK-BE-04

- **Task ID:** US-01-TASK-BE-04
- **Title:** Implement content digest and immutable plan snapshot
- **Outcome:** lib/task-executor/plan.js exports createPlanSnapshot; computes SHA256 over MD/CSV bytes and format version; binds digest to normalized task objects; snapshot is read-only for run lifetime
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-03
- **Acceptance criteria:** AC-02
- **Estimate — agent minutes:** 11
- **Estimate — tokens:** 25000
- **Output count:** 1
- **Grouping rationale:** Content digest and plan snapshot are atomic: the digest must bind to the normalized snapshot in a single operation to prevent detect-then-act races where plan changes between validation and binding
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add plan snapshot with content digest

**Verification commands:**

```
npm test -- --testPathPattern=plan.*.digest
```

<a id="task-US-01-TASK-BE-05"></a>
### US-01-TASK-BE-05

- **Task ID:** US-01-TASK-BE-05
- **Title:** Implement stable topological scheduler (Kahn's algorithm)
- **Outcome:** lib/task-executor/plan.js exports computeReadyQueue; returns stable, deterministic task ordering by phase then source index then ID; two identical inputs produce identical schedules
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-04
- **Acceptance criteria:** AC-02
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** Stable topological scheduler is a single deterministic algorithm with specific tie-breaking rules (phase order, source index, ID); changing any rule requires changing the entire scheduler, making it an atomic implementation unit
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add stable topological scheduler for task ordering

**Verification commands:**

```
npm test -- --testPathPattern=plan.*.scheduler
```

<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Implement repo-wide execution lease protocol
- **Outcome:** lib/task-executor/ownership.js exports acquireLease, releaseLease, readLease; enforces one repo-wide coordinator; persists lease with nonce, host, PID, runId, generation
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** AC-08
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 35000
- **Output count:** 1
- **Grouping rationale:** Execution lease protocol is a cohesive ownership model with acquire/release/read operations; all three must share the same state schema and nonce/identity structures, making it an atomic unit
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add exclusive lease protocol

**Verification commands:**

```
npm test -- --testPathPattern=ownership.*.lease
```

<a id="task-US-02-TASK-BE-02"></a>
### US-02-TASK-BE-02

- **Task ID:** US-02-TASK-BE-02
- **Title:** Implement stale lock detection with process liveness checks
- **Outcome:** lib/task-executor/ownership.js exports checkOwnerLiveness; checks OS process identity and start time; permits recovery only with confirmed dead evidence; never by age alone
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-08
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** Stale lock detection requires process identity and start-time verification as an atomic check; both signals are necessary and must be evaluated together before recovery is permitted
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add stale lock detection with process liveness

**Verification commands:**

```
npm test -- --testPathPattern=ownership.*.liveness
```

<a id="task-US-02-TASK-BE-03"></a>
### US-02-TASK-BE-03

- **Task ID:** US-02-TASK-BE-03
- **Title:** Implement ownership guard for atomic lease transitions
- **Outcome:** lib/task-executor/ownership.js exports createOwnershipGuard; atomic compare-and-swap for lease acquisition/release/reclaim; exclusive mkdir guard prevents concurrent transitions
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-02
- **Acceptance criteria:** AC-08
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Ownership guard implements a single atomic synchronization primitive (compare-and-swap with exclusive mkdir); the guard mechanism itself cannot be split without introducing race windows
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add ownership guard for atomic lease transitions

**Verification commands:**

```
npm test -- --testPathPattern=ownership.*.guard
```

<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Implement Claude subprocess adapter
- **Outcome:** lib/task-executor/claude-process.js exports spawnClaudeAgent; async spawn with shell:false, validated executable, stdin prompt feed, stdout/stderr buffering with result validation before verification
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-03
- **Acceptance criteria:** AC-01, AC-03
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 33000
- **Output count:** 1
- **Grouping rationale:** Claude subprocess adapter is a single executable-spawning interface; all the details (shell:false, buffering, validation) are part of a coherent, independently-verifiable child-process abstraction
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add Claude subprocess adapter with result validation

**Verification commands:**

```
npm test -- --testPathPattern=claude-process.*.spawn
```

<a id="task-US-03-TASK-BE-02"></a>
### US-03-TASK-BE-02

- **Task ID:** US-03-TASK-BE-02
- **Title:** Implement agent provenance verification (FTR-017 contract)
- **Outcome:** lib/task-executor/claude-process.js exports verifyAgentIdentity; calls agents resolve --require-verified, caches nativeName/sha256/path, compares loaded definition with registry result
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-03
- **Estimate — agent minutes:** 11
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** Agent provenance verification is a single FTR-017 contract check; the resolve call, caching, and comparison form an atomic pre-dispatch guard that cannot be split without losing verification integrity
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add agent provenance verification via agents resolve

**Verification commands:**

```
npm test -- --testPathPattern=claude-process.*.identity
```

<a id="task-US-03-TASK-BE-03"></a>
### US-03-TASK-BE-03

- **Task ID:** US-03-TASK-BE-03
- **Title:** Implement task dispatch orchestration with ownership coordination
- **Outcome:** lib/task-executor/index.js dispatches single task per attempt; persists run/task/attempt identity and ledger activity before invocation; blocks dispatch on missing lock, failed pre-dispatch checks, or identity verification failure
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-02, US-02-TASK-BE-03
- **Acceptance criteria:** AC-01, AC-03
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** Task dispatch orchestration coordinates lock validation, pre-dispatch checks, persistence, and subprocess invocation; these are all prerequisites for a single observable outcome (one task dispatched exactly once) and must be atomic
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add task dispatch orchestration

**Verification commands:**

```
npm test -- --testPathPattern=executor.*.dispatch
```

<a id="task-US-03-TASK-BE-04"></a>
### US-03-TASK-BE-04

- **Task ID:** US-03-TASK-BE-04
- **Title:** Implement result capture and immediate telemetry persistence
- **Outcome:** lib/task-executor/store.js persists implementation result receipt before verification; records tokens (or null with reason), elapsed/active time, exit code, outcome; does not overwrite existing attempts
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-03, INFRA-TASK-BE-01
- **Acceptance criteria:** AC-01
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Result receipt persistence is a single durable record; all fields (tokens, time, exit code, outcome) must be written atomically before verification runs, enforcing the BR-06 precondition
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add result receipt persistence

**Verification commands:**

```
npm test -- --testPathPattern=store.*.receipt
```

<a id="task-US-04-TASK-BE-01"></a>
### US-04-TASK-BE-01

- **Task ID:** US-04-TASK-BE-01
- **Title:** Implement verification command executor
- **Outcome:** lib/task-executor/index.js runVerifications executes approved fenced command blocks from Work Breakdown; requires each command exit 0; persists each result before proceeding to review
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-03
- **Acceptance criteria:** AC-04
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** Verification command executor is a single execution engine for approved fenced blocks; command extraction, execution, exit-code validation, and result persistence form a cohesive pre-review pipeline
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add verification command executor

**Verification commands:**

```
npm test -- --testPathPattern=verification.test
```

<a id="task-US-04-TASK-BE-02"></a>
### US-04-TASK-BE-02

- **Task ID:** US-04-TASK-BE-02
- **Title:** Implement review agent dispatch with diff context
- **Outcome:** lib/task-executor/index.js runReview dispatches review-solution agent with task context, exact diff, and review criteria; reads review result and validation rules
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-04-TASK-BE-01, US-03-TASK-BE-02
- **Acceptance criteria:** AC-04
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Review agent dispatch is a single orchestration step that packages task context, diff, and criteria for the review-solution agent; context assembly and dispatch are inseparable
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add review agent dispatch

**Verification commands:**

```
npm test -- --testPathPattern=review.test
```

<a id="task-US-04-TASK-BE-03"></a>
### US-04-TASK-BE-03

- **Task ID:** US-04-TASK-BE-03
- **Title:** Implement verification and review outcome persistence
- **Outcome:** lib/task-executor/store.js persists verification exit codes and review receipt with passed/failed status and blocking findings before proceeding to checkpoint
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-04-TASK-BE-02
- **Acceptance criteria:** AC-04
- **Estimate — agent minutes:** 11
- **Estimate — tokens:** 25000
- **Output count:** 1
- **Grouping rationale:** Verification and review outcome persistence is a single durable record that enforces BR-09 (verification before review before checkpoint); all outcomes must be persisted atomically
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add verification and review outcome persistence

**Verification commands:**

```
npm test -- --testPathPattern=store.*.verification
```

<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Write verification and review integration tests
- **Outcome:** tests/task-executor/verification-review.test.js covers full verification+review+outcome cycle with multiple command blocks, review pass/fail scenarios, and outcome persistence validation
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-03
- **Acceptance criteria:** AC-04
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 35000
- **Output count:** 1
- **Grouping rationale:** Integration test for the full verification+review cycle requires testing with fake agents, command blocks, and persistence together; the cycle is indivisible and requires a single test suite to verify end-to-end behavior
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add verification and review integration tests

**Verification commands:**

```
npm test -- --testPathPattern=task-executor.*verification-review
```

<a id="task-US-05-TASK-BE-01"></a>
### US-05-TASK-BE-01

- **Task ID:** US-05-TASK-BE-01
- **Title:** Implement checkpoint intent persistence
- **Outcome:** lib/task-executor/git.js exports persistCheckpointIntent; records feature/run/task/attempt/baseline SHA/expected tree/review/diff inventory/commit message before any commit attempt
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** AC-05
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Checkpoint intent is a single pre-commit record capturing all required metadata (baseline SHA, expected tree, inventory); this must be persisted atomically before any staging occurs to enable safe recovery
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add checkpoint intent persistence

**Verification commands:**

```
npm test -- --testPathPattern=git.*.checkpoint-intent
```

<a id="task-US-05-TASK-BE-02"></a>
### US-05-TASK-BE-02

- **Task ID:** US-05-TASK-BE-02
- **Title:** Implement controlled staging with path enumeration
- **Outcome:** lib/task-executor/git.js exports stageTaskFiles; stages only task-attributable paths via argv, validates resulting tree equals intent, detects hook mutations or external changes
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-05-TASK-BE-01
- **Acceptance criteria:** AC-05
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** Controlled staging with path enumeration, validation, and mutation detection is a single atomic step; all three checks (path match, tree validation, hook detection) must run together before commit is attempted
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add controlled staging with path enumeration

**Verification commands:**

```
npm test -- --testPathPattern=git.*.staging
```

<a id="task-US-05-TASK-BE-03"></a>
### US-05-TASK-BE-03

- **Task ID:** US-05-TASK-BE-03
- **Title:** Implement commit creation with task trailers
- **Outcome:** lib/task-executor/git.js exports createTaskCommit; commits with AI-Toolkit-Run/Task/Attempt/Plan trailers; validates parent/tree/ancestry on correct branch; detects hook failures
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-05-TASK-BE-02
- **Acceptance criteria:** AC-05
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Commit creation with trailers is a single atomic operation; all validations (parent, tree, ancestry, branch, hooks) must complete before the commit is recorded, enforcing BR-15 (no external modifications)
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add commit creation with task trailers

**Verification commands:**

```
npm test -- --testPathPattern=git.*.commit
```

<a id="task-US-05-TASK-BE-04"></a>
### US-05-TASK-BE-04

- **Task ID:** US-05-TASK-BE-04
- **Title:** Implement SHA registration outside worktree
- **Outcome:** lib/task-executor/store.js exports registerCommitSHA; persists SHA in executor state after commit confirmation; does not embed SHA in commit itself (no recursive commits)
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-05-TASK-BE-03
- **Acceptance criteria:** AC-05
- **Estimate — agent minutes:** 11
- **Estimate — tokens:** 25000
- **Output count:** 1
- **Grouping rationale:** SHA registration is a single state update that occurs after commit confirmation; separating the commit from SHA recording prevents recursive commits while maintaining atomicity of the registration step
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add SHA registration outside worktree

**Verification commands:**

```
npm test -- --testPathPattern=store.*.sha-registration
```

<a id="task-US-05-TASK-BE-05"></a>
### US-05-TASK-BE-05

- **Task ID:** US-05-TASK-BE-05
- **Title:** Implement commit/ledger reconciliation and task completion
- **Outcome:** lib/task-executor/index.js finalizes ledger entry only after SHA registered and verified on feature branch; marks task checkpointed; closes task activity in ledger
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-05-TASK-BE-04, INFRA-TASK-BE-02
- **Acceptance criteria:** AC-05
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** Commit/ledger reconciliation is the final task completion step; SHA verification, ledger finalization, and task marking must occur atomically to enforce BR-10 (completion requires all three)
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add commit/ledger reconciliation and task completion

**Verification commands:**

```
npm test -- --testPathPattern=reconciliation.test
```

<a id="task-US-06-TASK-BE-01"></a>
### US-06-TASK-BE-01

- **Task ID:** US-06-TASK-BE-01
- **Title:** Implement resume and reconcile command logic
- **Outcome:** lib/task-executor/index.js exports resume and reconcile commands; loads persisted state and evidence; classifies task status per edge-cases table; returns next safe action
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-03, US-05-TASK-BE-05
- **Acceptance criteria:** AC-09
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** Resume and reconcile command logic is a single decision point that loads state, classifies task status, and returns the next safe action; all three steps are interdependent and must be atomic
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add resume and reconcile command logic

**Verification commands:**

```
npm test -- --testPathPattern=resume-reconcile.test
```

<a id="task-US-06-TASK-BE-02"></a>
### US-06-TASK-BE-02

- **Task ID:** US-06-TASK-BE-02
- **Title:** Implement evidence evaluation per edge-cases table
- **Outcome:** lib/task-executor/index.js evaluates persisted evidence (checkpoint, commit, review, diff, worker liveness) and determines: no-reimplementation, reconcile-SHA, recheck-verification, preserve-diff, or block
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-06-TASK-BE-01
- **Acceptance criteria:** AC-09, AC-11, AC-12
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** Evidence evaluation implements the deterministic edge-cases table; all evidence signals (checkpoint, commit, review, diff, liveness) must be evaluated together to classify task status and detect corrupted/modified state (AC-12)
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add evidence evaluation per edge-cases table

**Verification commands:**

```
npm test -- --testPathPattern=evidence-table.test
```

<a id="task-US-06-TASK-BE-03"></a>
### US-06-TASK-BE-03

- **Task ID:** US-06-TASK-BE-03
- **Title:** Implement replan command with approval validation
- **Outcome:** lib/task-executor/index.js exports replan command; validates successor plan Gate 2 approval; records old->new plan digest mapping; preserves original run and attempts; does not auto-start successor
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-06-TASK-BE-02, US-01-TASK-BE-05
- **Acceptance criteria:** AC-09
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Replan command is a single orchestration step that validates approval, maps plan digests, and preserves history; all steps are prerequisites for a valid replan transition and cannot be meaningfully split
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add replan command with approval validation

**Verification commands:**

```
npm test -- --testPathPattern=replan.test
```

<a id="task-US-06-TASK-TEST-01"></a>
### US-06-TASK-TEST-01

- **Task ID:** US-06-TASK-TEST-01
- **Title:** Write resume and replan integration tests
- **Outcome:** tests/task-executor/resume-replan.test.js covers resume dedup (no re-dispatch while worker live), evidence classification, replan approval flow, repeated resume idempotency
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-06-TASK-BE-03
- **Acceptance criteria:** AC-09, AC-11
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 35000
- **Output count:** 1
- **Grouping rationale:** Integration test for resume and replan requires testing dedup, evidence classification, approval flow, and idempotency together; these behaviors are interdependent and require a single comprehensive test suite
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add resume and replan integration tests

**Verification commands:**

```
npm test -- --testPathPattern=task-executor.*resume-replan
```

<a id="task-US-07-TASK-BE-01"></a>
### US-07-TASK-BE-01

- **Task ID:** US-07-TASK-BE-01
- **Title:** Implement sequential executor main loop with ready-queue dispatch
- **Outcome:** lib/task-executor/index.js execute with maxConcurrency=1 reserves one task slot; dispatches from ready queue; reserves slot through dispatch/verify/review/checkpoint/commit; releases after integration or safe stop
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-03, US-01-TASK-BE-05
- **Acceptance criteria:** AC-06
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 35000
- **Output count:** 1
- **Grouping rationale:** Sequential executor main loop enforces the one-active-task invariant (AC-06) through a single slot-reservation mechanism; the loop, dispatcher, and slot lifecycle must be implemented atomically to prevent interleaving
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add sequential executor main loop

**Verification commands:**

```
npm test -- --testPathPattern=executor.*.sequential
```

<a id="task-US-07-TASK-BE-02"></a>
### US-07-TASK-BE-02

- **Task ID:** US-07-TASK-BE-02
- **Title:** Implement cooperative and immediate stop modes
- **Outcome:** lib/task-executor/index.js stop command with mode graceful (complete running verification, block new dispatch) or immediate (request termination, await confirmed stop); persists stop request; status confirms stop
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-07-TASK-BE-01
- **Acceptance criteria:** AC-06
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Stop modes (graceful and immediate) are dual-path implementations of a single coordinated shutdown mechanism; both require stop-request persistence and status confirmation, making them an atomic implementation unit
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add cooperative and immediate stop modes

**Verification commands:**

```
npm test -- --testPathPattern=stop.test
```

<a id="task-US-07-TASK-TEST-01"></a>
### US-07-TASK-TEST-01

- **Task ID:** US-07-TASK-TEST-01
- **Title:** Write sequential execution end-to-end tests
- **Outcome:** tests/task-executor/sequential.test.js covers task ordering, one-at-a-time capacity invariant, stop modes, partial results before stop, recovery on resume
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-07-TASK-BE-02
- **Acceptance criteria:** AC-06
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** End-to-end tests for sequential execution must verify task ordering, capacity invariant, stop modes, and recovery together; these behaviors are interdependent and require a single test suite
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add sequential execution E2E tests

**Verification commands:**

```
npm test -- --testPathPattern=task-executor.*sequential
```

<a id="task-US-08-TASK-BE-01"></a>
### US-08-TASK-BE-01

- **Task ID:** US-08-TASK-BE-01
- **Title:** Implement isolated worktree creation and management
- **Outcome:** lib/task-executor/index.js creates worktree under run-owned root; unique path per attempt/task; returns worktree path and cleanup callback; validates worktree independence
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-07-TASK-BE-01
- **Acceptance criteria:** AC-07
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** Isolated worktree creation and management is a single lifecycle module; path uniqueness, independence validation, and cleanup callback must all be coordinated atomically to prevent worktree collisions
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add isolated worktree creation and management

**Verification commands:**

```
npm test -- --testPathPattern=worktree.*.creation
```

<a id="task-US-08-TASK-BE-02"></a>
### US-08-TASK-BE-02

- **Task ID:** US-08-TASK-BE-02
- **Title:** Implement N-limit concurrency control and slot reservation
- **Outcome:** lib/task-executor/index.js with maxConcurrency=N reserves N task slots; increments active slot counter at dispatch; decrements only after integration verified; enforces N limit
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-08-TASK-BE-01
- **Acceptance criteria:** AC-07
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** N-limit concurrency control is a single slot-management mechanism; the increment/decrement lifecycle and enforcement of the N limit must be implemented atomically to prevent over-subscription
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add N-limit concurrency control

**Verification commands:**

```
npm test -- --testPathPattern=concurrency.test
```

<a id="task-US-08-TASK-BE-03"></a>
### US-08-TASK-BE-03

- **Task ID:** US-08-TASK-BE-03
- **Title:** Implement serial integration with dispatch-order sequencing
- **Outcome:** lib/task-executor/git.js exports integrateAttempt; cherry-picks from attempt branch to integration worktree; advances feature ref via compare-and-swap at expected HEAD; integrations serial by dispatch sequence
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-08-TASK-BE-02, US-05-TASK-BE-05
- **Acceptance criteria:** AC-07
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 35000
- **Output count:** 1
- **Grouping rationale:** Serial integration with dispatch-order sequencing is a single atomic operation; cherry-pick, ref advancement via compare-and-swap, and sequence enforcement must be coordinated together to prevent integration conflicts
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add serial integration with dispatch-order sequencing

**Verification commands:**

```
npm test -- --testPathPattern=git.*.integration
```

<a id="task-US-08-TASK-BE-04"></a>
### US-08-TASK-BE-04

- **Task ID:** US-08-TASK-BE-04
- **Title:** Implement original and integrated SHA tracking
- **Outcome:** lib/task-executor/store.js tracks originalSha (from attempt technical branch) and integratedSha (on feature branch after cherry-pick) separately; updates integration attempt record
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-08-TASK-BE-03
- **Acceptance criteria:** AC-07
- **Estimate — agent minutes:** 11
- **Estimate — tokens:** 25000
- **Output count:** 1
- **Grouping rationale:** Original and integrated SHA tracking is a single state-update operation; both SHAs must be recorded together in the integration record to preserve the complete audit trail of the cherry-pick
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add original and integrated SHA tracking

**Verification commands:**

```
npm test -- --testPathPattern=store.*.sha-tracking
```

<a id="task-US-08-TASK-INFRA-01"></a>
### US-08-TASK-INFRA-01

- **Task ID:** US-08-TASK-INFRA-01
- **Title:** Configure and verify npm distribution payload
- **Outcome:** package.json "files" includes lib/task-executor/ and the bin CLI entry; tests/task-executor/ and fixtures are excluded; npm pack --dry-run confirms the executor module and CLI are present in the tarball and that test/fixture paths are absent
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-03
- **Acceptance criteria:** AC-14
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Distribution payload composition — including the executor module and bin CLI in the npm package and excluding tests/fixtures, verified by npm pack — is a single packaging concern owned by US-08 (AC-14). It is kept separate from US-09 asset-catalog registration to remove the prior duplication and avoid a US-08→US-09 dependency inversion; it depends only on the module skeleton (INFRA-TASK-BE-03).
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** configure and verify npm distribution payload

**Verification commands:**

```
npm pack --dry-run 2>/dev/null | grep -E 'lib/task-executor/'
```

```
npm pack --dry-run 2>/dev/null | grep -E 'bin/cli.js'
```

```
test -z "$(npm pack --dry-run 2>/dev/null | grep -E 'tests/task-executor/')"
```

<a id="task-US-08-TASK-BE-05"></a>
### US-08-TASK-BE-05

- **Task ID:** US-08-TASK-BE-05
- **Title:** Implement platform qualification guard (refuse non-Windows execution)
- **Outcome:** lib/task-executor/index.js execute() aborts with a non-zero platform-unsupported error when process.platform is not win32 — before any agent dispatch or worktree creation — enforcing the E-02 process-supervision qualification which is proven for Windows only
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-07-TASK-BE-01
- **Acceptance criteria:** AC-07
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 23000
- **Output count:** 1
- **Grouping rationale:** The platform qualification guard is a single fail-closed precondition enforcing the E-02 Windows-only qualification. It must abort execute() before dispatch or worktree creation on unqualified platforms and is implemented as one cohesive check.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add platform qualification guard (Windows-only)

**Verification commands:**

```
npm test -- --testPathPattern=platform-guard.test
```

<a id="task-US-08-TASK-TEST-01"></a>
### US-08-TASK-TEST-01

- **Task ID:** US-08-TASK-TEST-01
- **Title:** Write parallel execution end-to-end tests
- **Outcome:** tests/task-executor/parallel.test.js covers N slot reservation, concurrent dispatch, serial integration, dedup prevention, integration conflict handling, N=2/3 scenarios
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-08-TASK-BE-04
- **Acceptance criteria:** AC-07, AC-08
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 35000
- **Output count:** 1
- **Grouping rationale:** Comprehensive parallel scenarios (N slot control, concurrent dispatch, serial integration, dedup, conflicts) with N=2/3 variations require integration testing at this granularity; the scenarios are interdependent and require a single test suite to verify concurrent behaviour.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add parallel execution E2E tests

**Verification commands:**

```
npm test -- --testPathPattern=task-executor.*parallel
```

<a id="task-US-08-TASK-TEST-02"></a>
### US-08-TASK-TEST-02

- **Task ID:** US-08-TASK-TEST-02
- **Title:** Test platform qualification guard prevents non-Windows execution
- **Outcome:** tests/task-executor/platform-guard.test.js asserts that with process.platform simulated as non-win32, execute() aborts with the platform-unsupported error and dispatches no agent and creates no worktree; and asserts win32 passes the guard
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-08-TASK-BE-05
- **Acceptance criteria:** AC-07
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 23000
- **Output count:** 1
- **Grouping rationale:** This is a behavioural test that the platform guard actually prevents execution on unqualified platforms — not merely a documentation grep. It asserts abort, no dispatch, and no worktree on non-win32 and pass on win32 as one cohesive guard-behaviour suite.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add platform qualification guard tests

**Verification commands:**

```
npm test -- --testPathPattern=task-executor.*platform-guard
```

<a id="task-US-09-TASK-BE-01"></a>
### US-09-TASK-BE-01

- **Task ID:** US-09-TASK-BE-01
- **Title:** Integrate new executor into implement-feature skill
- **Outcome:** src/claude/skills/implement-feature/SKILL.md dispatches executor start command after Gate 2; removes old pm-phase3 grouping path; presents run command to user
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-03
- **Acceptance criteria:** AC-16
- **Estimate — agent minutes:** 11
- **Estimate — tokens:** 25000
- **Output count:** 1
- **Grouping rationale:** Integration of the executor into implement-feature is a single skill modification; dispatcher routing, old-path removal, and user-facing command presentation form a cohesive feature-delivery integration point
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** integrate executor into implement-feature skill

**Verification commands:**

```
grep -q 'task-executor' src/claude/skills/implement-feature/SKILL.md
```

```
! grep -q 'Invoke pm-phase3 (Implementation Phase)' src/claude/skills/implement-feature/SKILL.md
```

<a id="task-US-09-TASK-INFRA-01"></a>
### US-09-TASK-INFRA-01

- **Task ID:** US-09-TASK-INFRA-01
- **Title:** Add executor CLI commands to bin/cli.js
- **Outcome:** bin/cli.js exports executor command dispatcher; routes start/status/diagnose/stop/reconcile/resume/replan to lib/task-executor/index.js; implements CLI contract with exit codes and JSON output
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-03
- **Acceptance criteria:** AC-16
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Executor CLI dispatcher is a single command-routing layer; all seven commands (start/status/diagnose/stop/reconcile/resume/replan) route through a unified exit-code and JSON-output contract that must be implemented atomically
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add executor CLI commands to bin/cli.js

**Verification commands:**

```
npm test -- --testPathPattern=cli.*.executor
```

<a id="task-US-09-TASK-INFRA-02"></a>
### US-09-TASK-INFRA-02

- **Task ID:** US-09-TASK-INFRA-02
- **Title:** Register executor module and CLI in asset catalog
- **Outcome:** lib/asset-catalog.js registers the task-executor module and its CLI commands so the toolkit resolver and preflight recognise them
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** US-09-TASK-INFRA-01
- **Acceptance criteria:** AC-16
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** Asset-catalog registration of the executor module and CLI is a single resolver-facing concern. Distribution payload configuration (package.json files / npm pack) is owned separately by US-08-TASK-INFRA-01 to avoid duplication.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** register executor module and CLI in asset catalog

**Verification commands:**

```
npm test -- --testPathPattern=catalog.test
```

<a id="task-US-09-TASK-TEST-01"></a>
### US-09-TASK-TEST-01

- **Task ID:** US-09-TASK-TEST-01
- **Title:** Write fault injection and recovery tests
- **Outcome:** tests/task-executor/fault-injection.test.js covers crash windows: before/after dispatch, verification, checkpoint-prepared, commit, state-write, ledger-finalization; verifies no false completions and artifact preservation
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-08-TASK-TEST-01
- **Acceptance criteria:** AC-10, AC-13
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 45000
- **Output count:** 1
- **Grouping rationale:** Fault injection and recovery tests cover the mandatory negative test (AC-10) — no task completion on model self-report alone — plus 10+ checkpoint boundaries with different failure modes; this requires comprehensive coverage at a single test granularity to verify artifact preservation and prevent false completions
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add fault injection and recovery tests

**Verification commands:**

```
npm test -- --testPathPattern=task-executor.*fault
```

<a id="task-US-09-TASK-INFRA-03"></a>
### US-09-TASK-INFRA-03

- **Task ID:** US-09-TASK-INFRA-03
- **Title:** Document executor CLI contract
- **Outcome:** docs/task-executor-cli.md documents the seven commands, their flags, exit codes, and the JSON result schema
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** US-09-TASK-INFRA-02
- **Acceptance criteria:** AC-16
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** CLI reference documentation is a single self-contained knowledge artifact covering the command contract (commands, flags, exit codes, JSON schema). It is separated from the bootstrap/runtime-constraints guide so each document has its own result, verification, estimate, and commit.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add executor CLI reference documentation

**Verification commands:**

```
test -f docs/task-executor-cli.md
```

```
grep -q 'exit code' docs/task-executor-cli.md
```

<a id="task-US-09-TASK-INFRA-04"></a>
### US-09-TASK-INFRA-04

- **Task ID:** US-09-TASK-INFRA-04
- **Title:** Document bootstrap procedure and runtime constraints
- **Outcome:** docs/task-executor-bootstrap.md documents the supervised task-by-task delivery procedure after Gates 1/2 and declares the Windows-only E-02 qualification and the persistence caveats
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** US-09-TASK-INFRA-03
- **Acceptance criteria:** AC-15, AC-16
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** The bootstrap and runtime-constraints guide is a single knowledge artifact declaring the supervised delivery procedure and the Windows-only E-02 qualification with persistence caveats. It is separated from the CLI reference so each document has its own result, verification, estimate, and commit.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add executor bootstrap and runtime-constraints guide

**Verification commands:**

```
test -f docs/task-executor-bootstrap.md
```

```
grep -q 'Windows-only' docs/task-executor-bootstrap.md
```

<a id="task-US-09-TASK-TEST-02"></a>
### US-09-TASK-TEST-02

- **Task ID:** US-09-TASK-TEST-02
- **Title:** Execute authorized end-to-end test with real feature and Claude runtime
- **Outcome:** tests/task-executor/real-feature.test.js runs executor against approved real feature with actual Claude implementation agents; documents observed token usage, cancellation behavior, runtime bridge constraints; stores evidence under evidence/FTR-018-e2e/
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-09-TASK-INFRA-04
- **Acceptance criteria:** AC-15
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 0
- **Output count:** 1
- **Grouping rationale:** Real-feature end-to-end execution with authorized paid model invocation and full runtime observation (AC-15) cannot be compressed; estimate excludes token cost (depends on feature size and model invocations); this is the mandatory qualification proof that mocks cannot provide
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add real-feature E2E test with runtime observation

**Verification commands:**

```
test -f evidence/FTR-018-e2e/run-manifest.json
```

```
grep -q '"feature"' evidence/FTR-018-e2e/run-manifest.json
```

## Statistics

| Domain | Count | Target | Above | Warning | Split |
|--------|-------|--------|-------|---------|-------|
| BE | 34 | 33 | 1 | 0 | 0 |
| FE | 0 | 0 | 0 | 0 | 0 |
| DB | 0 | 0 | 0 | 0 | 0 |
| DevOps | 0 | 0 | 0 | 0 | 0 |
| INFRA | 5 | 5 | 0 | 0 | 0 |
| TEST | 7 | 5 | 2 | 0 | 0 |
| **Total** | **46** | **43** | **3** | **0** | **0** |
