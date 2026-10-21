# lib/task-executor/store.js — Modified

## Change

`State.setTaskStatus(taskId, status)` gains a third, optional `extra` parameter, mirroring the
existing `addAttempt(taskId, attemptFields)`'s own optional-fields-object convention — needed so
UC-03's pre-dispatch short-circuit can record WHY a task was marked `'skipped'` (never dispatched
at all) distinctly from the existing post-hoc no-op-checkpoint `'skipped'` path (dispatched,
reviewed, found nothing to stage).

## Algorithm

```js
// before:
setTaskStatus(taskId, status) {
  const task = this._requireTask(taskId, 'setTaskStatus');
  if (TASK_STATUSES.indexOf(status) === -1) {
    throw _err('STATE_VALIDATION_ERROR', 'setTaskStatus: invalid status "' + status + '"; allowed: ' + TASK_STATUSES.join(', '));
  }
  const tasks = Object.assign({}, this.tasks);
  tasks[taskId] = Object.assign({}, task, { status: status });
  return this._clone({ tasks: tasks });
}

// after:
setTaskStatus(taskId, status, extra) {
  const task = this._requireTask(taskId, 'setTaskStatus');
  if (TASK_STATUSES.indexOf(status) === -1) {
    throw _err('STATE_VALIDATION_ERROR', 'setTaskStatus: invalid status "' + status + '"; allowed: ' + TASK_STATUSES.join(', '));
  }
  const tasks = Object.assign({}, this.tasks);
  tasks[taskId] = Object.assign({}, task, { status: status }, extra || {});
  return this._clone({ tasks: tasks });
}
```

Every existing call site in this codebase passes exactly 2 arguments (`taskId`, `status`); `extra`
defaults to `undefined` there, and `extra || {}` makes the `Object.assign` a no-op in that case —
no existing call site's resulting task entry shape changes. Only UC-03's new call
(`lib/task-executor/index.js`'s `_runTaskToResolution`) passes a 3rd argument,
`{ reason: 'already-satisfied-pre-dispatch' }`, which becomes a new `reason` field on that task's
own state entry — readable from `status`/`diagnose`'s existing state dump without either of those
commands needing any change (they already pass through the full task object).

## Tests

See `components/skip-already-satisfied.test.js.md` (AC-06).
