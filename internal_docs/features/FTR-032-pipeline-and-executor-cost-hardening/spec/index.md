# Technical Specification — Pipeline and Executor Cost Hardening

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-032 |
| Version | 1.0 |
| Date | 2026-10-21 |
| Status | Draft |

## 1. Overview

Two independent cost/latency fixes across two subsystems: (1) remove the per-task effort estimate
from `pm-phase2.js`'s WBS skeleton schema entirely, and start reading it back from the per-task
detail call's EXISTING response instead of silently discarding it (that call's own template
already asks the model for a real estimate today — no new prompt text or field is added anywhere),
shrinking the skeleton call's payload weight to match Requirements/Tech-Spec's own index-row-weight
skeletons; (2) in `lib/task-executor/index.js`, persist turn-by-turn dispatch evidence for every
implementation/review attempt (reusing the existing `lib/workflow-worker-evidence.js` primitive,
not a new module), and add a pre-dispatch verification short-circuit so a task whose verification
commands already pass before its first attempt never pays for an implementation or review dispatch
at all.

## 2. Architecture

### 2.1 System Context

No new system boundary, no new script, no new CLI command, no new agent, no new installer catalog
entry. Changes: `src/claude/workflows/pm-phase2.js` (skeleton/detail schema boundary),
`lib/task-executor/index.js` (dispatch evidence capture + pre-dispatch short-circuit). Reuses
`lib/workflow-worker-evidence.js`'s existing `createEvidence`/`save` unchanged — the SAME primitive
`pm-phase1`/`pm-phase2` already use for their own worker calls, now also used by the task executor.

### 2.2 Component Diagram

```
Before (today):
  pm-phase2.js SKELETON_SCHEMA: requires estimate{agentMinutes,tokens} per task, for EVERY task,
                                 in the ONE skeleton call
  pm-phase2.js per-task detail call: ALREADY produces a real estimate (its own template asks for
                                 it) -- but wbs-assembler.js's parseTaskDetailBlock never reads it
                                 back; loadWorkBreakdown takes estimate from the skeleton instead,
                                 so the per-task call's own copy is silently discarded
  lib/task-executor/index.js: dispatchTaskAttempt/runReview persist no turn-by-turn evidence
  lib/task-executor/index.js: _runTaskToResolution always dispatches the first attempt
                               unconditionally, regardless of current verification state

After (this feature):
  pm-phase2.js SKELETON_SCHEMA: estimate removed; every other field unchanged; materializeIndex no
                                 longer copies it into index.tasks[taskId]
  pm-phase2.js per-task detail call: UNCHANGED (no new prompt text, no new required field -- it
                                 already produces a real estimate today)
  wbs-assembler.js: parseTaskDetailBlock now ALSO reads estimate back (alongside the existing
                                 groupingRationale/verification commands); loadWorkBreakdown's
                                 per-task mapping uses THAT value instead of the skeleton's
  lib/task-executor/index.js: dispatchTaskAttempt/runReview each call
                               lib/workflow-worker-evidence.js's createEvidence/save around their
                               own spawn, under the run's own executionRoot (not os.tmpdir())
  lib/task-executor/index.js: _runTaskToResolution, on a task's FIRST attempt only, runs
                               verification once BEFORE dispatch; all-pass -> 'skipped', no
                               dispatch at all; any-fail or zero-commands -> normal dispatch
```

### 2.3 Sequence Diagrams

**UC-01, per WBS generation run:**
```
pm-phase2.js: skeleton dispatch (gaia.agent.planner.work-breakdown, SKELETON_SCHEMA minus estimate)
  -> materializeIndex(skeleton) -> index.json written (no estimate field at all now)
  per task in index.phases/taskIds:
    detail dispatch (gaia.agent.planner.work-breakdown-task, UNCHANGED -- its template already
      asks for estimate) -> detail written, includes estimate (as it always has)
  (end of loop) -> assembled = wbs-assembler.loadWorkBreakdown(wbsDir)
    -> parseTaskDetailBlock(detailFile) now ALSO returns estimate
    -> per-task mapping: estimate: detail.estimate (was: skeletonTask.estimate)
  -> c.estimates(featureDir, prefix, assembled) -- unaffected, same input shape as today
  -> wb-validate.js's check 15 (duration bands) -- unaffected, already reads the assembled
     structure, confirmed by that file's own comment
```

**UC-02, per implementation/review dispatch attempt:**
```
dispatchTaskAttempt(args): evidence = createEvidence({diagnosticsDir: <executionRoot>/<runId>/
  evidence}, runId, identity, invocation) -> spawnClaudeAgent(...) -> evidence.save({outcome,
  result/error, finishedAt}) -- regardless of success/failure/timeout
runReview(args): same pattern, own evidence file, own invocation record
```

**UC-03, per task's first attempt:**
```
_runTaskToResolution(ctx): attemptNumber === 1 AND task.verificationCommands.length > 0 ?
  run verification once (same runVerifications(), cwd=projectDir) -> all passed?
    yes -> state.setTaskStatus(taskId, 'skipped'); return (no dispatch at all)
    no  -> proceed to normal dispatchTaskAttempt, unchanged from today
  attemptNumber > 1 OR zero verification commands -> proceed to normal dispatch, unchanged
```

## 3. Backend

_Per-component detail — see Section 9's Components table and each component's own design file
(generated separately, one call per component). Do not write any content here._

## 4. Frontend

N/A — internal/technical feature; no UI surface.

## 5. External Integrations

None.

## 6. Security Considerations

None new. UC-02's evidence capture reuses `lib/workflow-worker-evidence.js`'s existing `redact()`
pass unchanged — the same credential-redaction behavior already applied to every `pm-phase1`/
`pm-phase2` worker-evidence file applies identically to the new task-executor dispatch evidence.

## 7. Database Changes

None.

## 8. Configuration

None — UC-03's short-circuit and UC-02's evidence capture are both unconditional (no feature flag,
no environment variable), consistent with FTR-029's own "no real evidence yet justifies external
tuning" precedent for a brand-new behavior with no reported need for an opt-out.

## 9. File Inventory

### New files
None — UC-02 reuses the existing `lib/workflow-worker-evidence.js` module unmodified; this feature
only changes existing schemas, existing dispatch call sites, and adds new tests.

### Modified files
| Path | Change description | Addresses | Domain | Spec |
|------|-------------------|-----------|--------|------|
| src/claude/workflows/pm-phase2.js | `SKELETON_SCHEMA` drops `estimate` from per-task `required`/`properties`; `materializeIndex` no longer copies it into `index.tasks[taskId]`; the per-task detail call itself is UNCHANGED (no new field, no new prompt text) | AC-01, AC-03, AC-04 | BE | [components/pm-phase2.js.md](components/pm-phase2.js.md) |
| src/claude/scripts/wbs-assembler.js | `parseTaskDetailBlock` now also reads `estimate` back from a task detail file's field block; `loadWorkBreakdown`'s per-task mapping uses that value instead of the skeleton-derived one | AC-02, AC-03 | BE | [components/wbs-assembler.js.md](components/wbs-assembler.js.md) |
| lib/task-executor/index.js | `dispatchTaskAttempt`/`runReview` each call `lib/workflow-worker-evidence.js`'s `createEvidence`/`save` around their own spawn, scoped under the run's own `executionRoot`; `_runTaskToResolution` gains a pre-dispatch verification short-circuit on a task's first attempt | AC-05, AC-06, AC-07, AC-08, AC-09, AC-10 | BE | [components/index.js.md](components/index.js.md) |
| lib/task-executor/store.js | `State.setTaskStatus(taskId, status, extra)` gains a third, optional parameter merged into the task entry (e.g. `{ reason }`), distinguishing UC-03's pre-dispatch skip from the existing post-hoc no-op-checkpoint skip; existing single/two-argument call sites are unaffected | AC-06 | BE | [components/store.js.md](components/store.js.md) |
| tests/integration/workflow-runtime.test.js | New tests for AC-01 through AC-04 (skeleton/detail schema boundary move) | AC-01, AC-02, AC-03, AC-04 | TEST | [components/workflow-runtime.test.js.md](components/workflow-runtime.test.js.md) |
| tests/task-executor/dispatch-evidence.test.js | New file: real end-to-end test proving an implementation and a review dispatch each leave behind a readable evidence file (AC-05) | AC-05 | TEST | [components/dispatch-evidence.test.js.md](components/dispatch-evidence.test.js.md) |
| tests/task-executor/skip-already-satisfied.test.js | New file: real end-to-end tests for the pre-dispatch short-circuit (AC-06 through AC-10) | AC-06, AC-07, AC-08, AC-09, AC-10 | TEST | [components/skip-already-satisfied.test.js.md](components/skip-already-satisfied.test.js.md) |
| tests/fixtures/fake-claude-cli.js | New `--mode=fail-if-invoked`: exits non-zero immediately with a distinctive message, used to hard-enforce that a short-circuited task's test never spawns anything | AC-06, AC-10 | TEST | [components/fake-claude-cli.js.md](components/fake-claude-cli.js.md) |

## 10. Testing Strategy

_Per-component detail — see each component's own design file's own Tests section (generated
separately, one call per component). Do not write any content here._

## 11. Implementation Order

1. `src/claude/scripts/wbs-assembler.js` — depends on: nothing (pure parse/mapping addition)
2. `src/claude/workflows/pm-phase2.js` — depends on: 1 (the skeleton can safely stop producing
   `estimate` only once `wbs-assembler.js` reads it from the per-task detail file instead)
3. `lib/task-executor/store.js` — depends on: nothing (`setTaskStatus`'s new optional 3rd
   parameter is backward-compatible with every existing call site)
4. `lib/task-executor/index.js` — depends on: 3 (UC-03's short-circuit calls `setTaskStatus` with
   the new `reason` argument); UC-02 is independent of 1/2/3
5. `tests/integration/workflow-runtime.test.js` — depends on: 1, 2
6. `tests/task-executor/dispatch-evidence.test.js` — depends on: 4
7. `tests/fixtures/fake-claude-cli.js` — depends on: nothing (a new, independent mode)
8. `tests/task-executor/skip-already-satisfied.test.js` — depends on: 3, 4, 7

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| A future change to `gaia-task-template.md` or `buildTaskPrompt` could drop/rename the "Estimate — agent minutes"/"Estimate — tokens" fields, silently breaking the read-back `parseTaskDetailBlock` now depends on, with no skeleton fallback left to fall back to | A task's `estimate` would read as missing/null with no error surfaced at generation time | Mitigated: `wb-validate.js`'s existing checks (the same ones already enforcing `estimate.agentMinutes`/`estimate.tokens` are present and in range today) still run after every per-task detail call completes — a missing estimate is caught there, same as it would be for any other missing required field, just one step later than a skeleton-time check would be |
| The per-task detail call's own cost profile is unchanged by this feature (it already produced `estimate` before) — only the SKELETON call's burden shrinks | No net reduction in total LLM work across the whole run, only in how it is distributed | Accepted and still a net win for the reported failure mode: the skeleton call's total work no longer requires reasoning about EVERY task's effort in one all-or-nothing turn — each per-task timeout now only costs/retries that ONE task's detail call, not the entire feature's skeleton (the specific failure mode reported: 6/6 consecutive whole-skeleton failures) |
| UC-03's pre-dispatch verification run adds real wall-clock cost to EVERY task's first attempt, even ones that were never going to be already-satisfied | A feature with mostly non-trivial tasks pays a small extra verification cost up front for no benefit | Accepted: the reported verification commands cost ~5-10 seconds — negligible next to the ~20 minutes saved on an already-satisfied task, and the executor already runs this exact verification step unconditionally post-dispatch today, so this is only ever an ADDITIONAL early run of work already paid for later in the non-short-circuited case |
| A verification command that is not safely idempotent/side-effect-free could behave differently run twice (once pre-dispatch, once post-dispatch on the normal path) | A command with a real side effect (e.g. consuming a queue message) could be double-run for a non-short-circuited task | Accepted, consistent with this project's own existing convention: verification commands are already documented and expected to be read-only checks (build/test/grep), never mutating — the SAME assumption the existing post-dispatch verification step already depends on; this feature does not change or weaken that expectation |
| Reusing `lib/workflow-worker-evidence.js`'s `createEvidence` under the executor's own `executionRoot` (rather than `os.tmpdir()`) could grow that directory unbounded over many runs | Disk usage grows with every task attempt, indefinitely | Accepted for this feature's scope: no retention/cleanup policy is introduced here, consistent with the executor's own existing state/ledger files under `executionRoot` already having no automatic cleanup either — a future feature can address retention for all of them together if it becomes a real problem |
| UC-03's pre-dispatch verification check could reuse `runVerifications` (which persists an immutable receipt per command) for simplicity | A receipt written under attemptNumber=1 by the pre-check collides with the REAL post-dispatch verification receipt for the same attempt whenever the check does NOT short-circuit (same receipt ID, different timestamps, `RECEIPT_CONFLICT`) — confirmed via a real pre-existing test failure during implementation | Mitigated: the pre-check calls `_runVerificationCommand` directly instead, the lower-level primitive with no receipt-writing side effect — there is nothing to attribute a receipt to yet anyway (no attempt has been persisted) |

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Exact on-disk path/filename convention for UC-02's new per-dispatch evidence files | **Resolved** | Reuses `lib/workflow-worker-evidence.js`'s existing `createEvidence` unmodified, with `diagnosticsDir` set to `<executionRoot>/<runId>/evidence` — one UUID-named JSON file per dispatch attempt, exactly as that module already produces for `pm-phase1`/`pm-phase2`'s own worker calls |
| 2 | Whether UC-03's short-circuit should record a distinct reason/activity-log entry from the EXISTING post-hoc no-op `'skipped'` path | **Resolved** | Yes — `setTaskStatus` call for this path passes a `reason: 'already-satisfied-pre-dispatch'` note alongside the status, readable from the run's own state file, distinguishing it from the existing post-hoc skip path's own implicit reason |
| 3 | Whether cross-task context reuse or a tighter review context should become a future feature once UC-02's evidence makes root-causing tractable | **Not resolved in this feature** | Explicitly deferred; revisit once real evidence from UC-02 exists |

## Dependencies and Assumptions

- FTR-018, FTR-020, FTR-026, FTR-028 (available): reused unmodified as described in `req/index.md`'s
  own Dependencies section.
- `pm-phase2.js` remains a sandboxed workflow script with no `require()`; its own schema/prompt
  changes are inline, no new duplicated helper needed.
- `lib/task-executor/index.js` and `lib/workflow-worker-evidence.js` are both normal Node modules
  (real `require()` available) — UC-02 is a direct `require('../workflow-worker-evidence')` from
  `lib/task-executor/index.js`, not a reimplementation.
- `npm test` is the only verification command; no separate build step exists.
- Both concerns are grounded in real, independently-verified reports from two different consumer
  projects the same day, as described in `feature.md`'s own Problem Statement.
