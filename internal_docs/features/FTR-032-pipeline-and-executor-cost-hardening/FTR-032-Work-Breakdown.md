# Work Breakdown — FTR-032

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-032 |
| Schema | v2 |
| Generated | 2026-10-21T21:39:05.395Z |

## Summary
| Metric | Value |
|--------|-------|
| Total tasks | 9 |
| Total phases | 4 |
| Within target (≤15 min) | 8 |
| Above target (16–20 min) | 1 |
| Warning (21–30 min) | 0 |
| Split required (>30 min) | 0 |
| Domain distribution | BE: 5, FE: 0, DB: 0, DevOps: 0, INFRA: 0, TEST: 4 |

## User Story Phases

### US-01: Shrink the WBS Skeleton Call to Index-Row Weight

### Commit
fix(FTR-032): stop asking the WBS skeleton call for an effort estimate it already gets from the per-task detail call

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-01-TASK-BE-01 | Read the per-task effort estimate back from its own detail response | wbs-assembler.js's parseTaskDetailBlock also returns estimate{agentMinutes,tokens} parsed from the task detail field block; loadWorkBreakdown's per-task mapping uses it instead of the skeleton-derived value | BE | 15 | — | 1 cmd — [details](#task-US-01-TASK-BE-01) |
| US-01-TASK-BE-02 | Remove the per-task effort estimate from the WBS skeleton schema | pm-phase2.js's SKELETON_SCHEMA no longer requires or declares estimate per task; materializeIndex no longer copies it | BE | 8 | US-01-TASK-BE-01 | 1 cmd — [details](#task-US-01-TASK-BE-02) |
| US-01-TASK-TEST-01 | Cover the skeleton/detail estimate boundary move end to end | New describe block in workflow-runtime.test.js proving AC-01 through AC-04: a skeleton without estimate is accepted, the assembled task's estimate comes from the per-task detail response, c.estimates() and the structural checks are unaffected | TEST | 15 | US-01-TASK-BE-01, US-01-TASK-BE-02 | 1 cmd — [details](#task-US-01-TASK-TEST-01) |

### US-02: Persist Turn-by-Turn Dispatch Evidence for Implementation/Review

### Commit
feat(FTR-032): persist turn-by-turn evidence for every implementation and review dispatch

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-02-TASK-BE-01 | Persist evidence for implementation and review dispatches | dispatchTaskAttempt and runReview each wrap their own claudeProcess.spawnClaudeAgent call with lib/workflow-worker-evidence.js's createEvidence/save, scoped under executionRoot/evidence/<runId>/ | BE | 15 | — | 1 cmd — [details](#task-US-02-TASK-BE-01) |
| US-02-TASK-TEST-01 | Cover dispatch evidence capture end to end | New tests/task-executor/dispatch-evidence.test.js proves a real implementation dispatch and a real review dispatch each leave an independently-readable evidence file, including on a failed attempt | TEST | 15 | US-02-TASK-BE-01 | 1 cmd — [details](#task-US-02-TASK-TEST-01) |

### US-03: Short-Circuit Dispatch for an Already-Satisfied Task

### Commit
feat(FTR-032): skip implementation/review dispatch entirely for a task already satisfied before its first attempt

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-03-TASK-BE-01 | Let setTaskStatus record an optional reason alongside a task's status | store.js's State.setTaskStatus gains a third, optional extra parameter merged into the task entry, backward-compatible with every existing 2-argument call site | BE | 8 | — | 1 cmd — [details](#task-US-03-TASK-BE-01) |
| US-03-TASK-BE-02 | Short-circuit dispatch for a task already satisfied before its first attempt | _runTaskToResolution runs a task's verification commands once before its first attempt only; an all-pass result marks it 'skipped' with reason 'already-satisfied-pre-dispatch', without ever calling dispatchTaskAttempt | BE | 15 | US-03-TASK-BE-01 | 1 cmd — [details](#task-US-03-TASK-BE-02) |
| US-03-TASK-TEST-01 | Cover the pre-dispatch short-circuit end to end | New tests/task-executor/skip-already-satisfied.test.js proves AC-06 through AC-10 against a real execute() run, backed by a new fake-claude-cli.js --mode=fail-if-invoked that hard-fails if ever spawned | TEST | 20 | US-03-TASK-BE-01, US-03-TASK-BE-02 | 1 cmd — [details](#task-US-03-TASK-TEST-01) |

### US-04: Full Regression Confirmation

### Commit
test(FTR-032): confirm the full regression suite passes with both cost-hardening fixes in place

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-04-TASK-TEST-01 | Run the full regression suite and confirm no behavior regressed | Full npm test suite passes with every new AC-01 through AC-10 test green alongside the full pre-existing suite; AC-11 satisfied | TEST | 14 | US-01-TASK-BE-01, US-01-TASK-BE-02, US-02-TASK-BE-01, US-03-TASK-BE-01, US-03-TASK-BE-02 | 1 cmd — [details](#task-US-04-TASK-TEST-01) |

## Task Details

> Authoritative per-task detail. Every field is rendered integrally so this document, together with the dispatch CSV, is a complete deliverable requiring no separate JSON. Verification commands are preserved **verbatim** in fenced code blocks — operators such as `||`, shell pipes `|`, and regex alternations (`grep -E 'a|b|c'`) survive byte-for-byte. Each command is an independent fenced block.

<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Read the per-task effort estimate back from its own detail response
- **Outcome:** wbs-assembler.js's parseTaskDetailBlock also returns estimate{agentMinutes,tokens} parsed from the task detail field block; loadWorkBreakdown's per-task mapping uses it instead of the skeleton-derived value
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-02, AC-03
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** fix
- **Commit scope:** —
- **Commit subject:** read the per-task effort estimate back from its own detail response instead of the skeleton

**Verification commands:**

```
npx jest tests/wbs-assembler.test.js
```

<a id="task-US-01-TASK-BE-02"></a>
### US-01-TASK-BE-02

- **Task ID:** US-01-TASK-BE-02
- **Title:** Remove the per-task effort estimate from the WBS skeleton schema
- **Outcome:** pm-phase2.js's SKELETON_SCHEMA no longer requires or declares estimate per task; materializeIndex no longer copies it
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-01, AC-03, AC-04
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 8000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** fix
- **Commit scope:** —
- **Commit subject:** drop the per-task effort estimate from the WBS skeleton schema

**Verification commands:**

```
npx jest tests/cli/pm-phase2-source.test.js
```

<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Cover the skeleton/detail estimate boundary move end to end
- **Outcome:** New describe block in workflow-runtime.test.js proving AC-01 through AC-04: a skeleton without estimate is accepted, the assembled task's estimate comes from the per-task detail response, c.estimates() and the structural checks are unaffected
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01, US-01-TASK-BE-02
- **Acceptance criteria:** AC-01, AC-02, AC-03, AC-04
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** cover the WBS skeleton/detail estimate boundary move end to end

**Verification commands:**

```
npx jest tests/integration/workflow-runtime.test.js -t "FTR-032"
```

<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Persist evidence for implementation and review dispatches
- **Outcome:** dispatchTaskAttempt and runReview each wrap their own claudeProcess.spawnClaudeAgent call with lib/workflow-worker-evidence.js's createEvidence/save, scoped under executionRoot/evidence/<runId>/
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-05
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** persist turn-by-turn evidence for implementation and review dispatches

**Verification commands:**

```
node -e "const i = require('./lib/task-executor/index'); console.log(typeof i.dispatchTaskAttempt, typeof i.runReview)"
```

<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Cover dispatch evidence capture end to end
- **Outcome:** New tests/task-executor/dispatch-evidence.test.js proves a real implementation dispatch and a real review dispatch each leave an independently-readable evidence file, including on a failed attempt
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-05
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** cover implementation/review dispatch evidence capture end to end

**Verification commands:**

```
npx jest tests/task-executor/dispatch-evidence.test.js
```

<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Let setTaskStatus record an optional reason alongside a task's status
- **Outcome:** store.js's State.setTaskStatus gains a third, optional extra parameter merged into the task entry, backward-compatible with every existing 2-argument call site
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-06
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 6000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** let setTaskStatus record an optional reason alongside a task's status

**Verification commands:**

```
npx jest tests/task-executor/executor.sequential.test.js tests/task-executor/checkpoint-noop.test.js
```

<a id="task-US-03-TASK-BE-02"></a>
### US-03-TASK-BE-02

- **Task ID:** US-03-TASK-BE-02
- **Title:** Short-circuit dispatch for a task already satisfied before its first attempt
- **Outcome:** _runTaskToResolution runs a task's verification commands once before its first attempt only; an all-pass result marks it 'skipped' with reason 'already-satisfied-pre-dispatch', without ever calling dispatchTaskAttempt
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-06, AC-07, AC-08, AC-09, AC-10
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 16000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** short-circuit dispatch for a task already satisfied before its first attempt

**Verification commands:**

```
node -e "const fs = require('fs'); const src = fs.readFileSync('lib/task-executor/index.js', 'utf8'); if (!src.includes(\"reason: 'already-satisfied-pre-dispatch'\")) { throw new Error('short-circuit wiring not found') }"
```

<a id="task-US-03-TASK-TEST-01"></a>
### US-03-TASK-TEST-01

- **Task ID:** US-03-TASK-TEST-01
- **Title:** Cover the pre-dispatch short-circuit end to end
- **Outcome:** New tests/task-executor/skip-already-satisfied.test.js proves AC-06 through AC-10 against a real execute() run, backed by a new fake-claude-cli.js --mode=fail-if-invoked that hard-fails if ever spawned
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-01, US-03-TASK-BE-02
- **Acceptance criteria:** AC-06, AC-07, AC-08, AC-09, AC-10
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 28000
- **Output count:** 2
- **Grouping rationale:** The new fake-claude-cli.js fixture mode has no purpose without the test file that exercises it, and the test file cannot assert its strongest guarantee (never dispatched) without that mode — generating them separately would leave one half meaningless on its own.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** cover the pre-dispatch verification short-circuit end to end

**Verification commands:**

```
npx jest tests/task-executor/skip-already-satisfied.test.js
```

<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Run the full regression suite and confirm no behavior regressed
- **Outcome:** Full npm test suite passes with every new AC-01 through AC-10 test green alongside the full pre-existing suite; AC-11 satisfied
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01, US-01-TASK-BE-02, US-02-TASK-BE-01, US-03-TASK-BE-01, US-03-TASK-BE-02
- **Acceptance criteria:** AC-11
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 16000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** confirm the full regression suite passes with both cost-hardening fixes in place

**Verification commands:**

```
npm test
```

## Statistics

| Domain | Count | Target | Above | Warning | Split |
|--------|-------|--------|-------|---------|-------|
| BE | 5 | 5 | 0 | 0 | 0 |
| FE | 0 | 0 | 0 | 0 | 0 |
| DB | 0 | 0 | 0 | 0 | 0 |
| DevOps | 0 | 0 | 0 | 0 | 0 |
| INFRA | 0 | 0 | 0 | 0 | 0 |
| TEST | 4 | 3 | 1 | 0 | 0 |
| **Total** | **9** | **8** | **1** | **0** | **0** |
