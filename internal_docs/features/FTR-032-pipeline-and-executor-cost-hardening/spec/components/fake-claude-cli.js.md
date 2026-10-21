# tests/fixtures/fake-claude-cli.js — Modified

## Change

New `--mode=fail-if-invoked`: immediately exits non-zero with a distinctive stderr message. Used
by `skip-already-satisfied.test.js` as a hard, test-enforced guarantee — if UC-03's short-circuit
ever regresses and dispatches an implementation/review subprocess for an already-satisfied task
anyway, the real subprocess spawn itself fails loudly (causing `execute()` to reject/the task to
end up `'blocked'` instead of the expected `'skipped'`), rather than relying only on an
absence-of-assertion in the test.

## Algorithm

```js
// added as a new case in the existing switch (mode) block, process.exitCode convention
// matching the existing 'fail' case's shape:
case 'fail-if-invoked': {
  process.stderr.write('fake-claude-cli: fail-if-invoked mode was spawned — this subprocess should never have been dispatched\n');
  process.exit(1);
  return;
}
```

## Tests

This fixture is exercised by `tests/task-executor/skip-already-satisfied.test.js`'s own tests
(AC-06, AC-10) — no dedicated test file covers the fixture itself, consistent with every other
mode already in this file.
