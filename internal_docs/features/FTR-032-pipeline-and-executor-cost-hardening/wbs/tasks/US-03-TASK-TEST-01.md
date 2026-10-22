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
- **Commit scope:** task-executor
- **Commit subject:** cover the pre-dispatch verification short-circuit end to end

**Implementation notes:**

Two tightly-coupled changes, per `spec/components/fake-claude-cli.js.md` and
`spec/components/skip-already-satisfied.test.js.md`:

1. **`tests/fixtures/fake-claude-cli.js`** — add one new `case` to the existing `switch (mode)`
   block, same shape as the existing `'fail'` case:

```js
case 'fail-if-invoked': {
  process.stderr.write('fake-claude-cli: fail-if-invoked mode was spawned — this subprocess should never have been dispatched\n');
  process.exit(1);
  return;
}
```

2. **`tests/task-executor/skip-already-satisfied.test.js`** — new file, mirroring
   `tests/task-executor/executor.sequential.test.js`'s real-dispatch harness. Five tests (full code
   in `spec/components/skip-already-satisfied.test.js.md`'s own Algorithm section — copy verbatim,
   adjusting only fixture file paths if needed):
   - a task whose verification already passes is `'skipped'` with `reason ===
     'already-satisfied-pre-dispatch'` and ZERO attempts recorded, using
     `implementationSpawnArgs`/`reviewSpawnArgs` both set to `--mode=fail-if-invoked` (AC-06, AC-10)
   - a task whose verification fails proceeds to a normal dispatch and reaches `'checkpointed'`
     (AC-07)
   - a task with zero verification commands is never short-circuited (AC-08) — found during
     implementation: this scenario can never occur via the real pipeline
     (`wb-validate.js` check 16 requires ≥1 command) and reaching `'checkpointed'` with zero
     commands hits an unrelated, pre-existing crash in `persistCheckpointIntent` (empty
     `verificationReceiptIds`); the test uses `--mode=echo-json` instead so the EXISTING post-hoc
     no-op skip path completes it as `'skipped'` without that crash, while still proving a real
     dispatch happened (`attempts` length 1, never 0)
   - a task's retry (second attempt, after `--mode=echo-json`'s false-success is caught by real
     verification) is never short-circuited — ends `'blocked'` with 2 real attempts recorded, not
     a spurious `'skipped'` (AC-09)
   - a two-task run (one already-satisfied, one not) shows the short-circuited task with 0
     attempts and the normally-dispatched task with 1 (AC-10, the "measured cost" comparison)

**Verification commands:**

```
npx jest tests/task-executor/skip-already-satisfied.test.js
```
