# src/claude/scripts/wbs-assembler.js — Modified

## Change

UC-01's read-back half: `parseTaskDetailBlock` now also extracts `estimate` (agentMinutes/tokens)
from a task detail file's own field block — the SAME contiguous run it already reads
`groupingRationale` from, via `_parseFieldBlock`, which already captures every field in that block
including `Estimate — agent minutes`/`Estimate — tokens`. `loadWorkBreakdown`'s per-task mapping
switches its `estimate` source from the skeleton-derived `skeletonTask.estimate` to this newly
read-back `detail.estimate`.

## Algorithm

**Edit 1 — a new `_numberOrNull` helper**, mirroring `lib/task-executor/plan.js`'s own identically-
named function (same fail-closed convention: a non-numeric value is a parse error, not silently
coerced):

```js
function _numberOrNull(value) {
  if (value == null) return null
  const n = Number(value)
  if (Number.isNaN(n)) {
    throw new Error(`wbs-assembler: expected a numeric value, got ${JSON.stringify(value)}`)
  }
  return n
}
```

**Edit 2 — `parseTaskDetailBlock`** (adds `estimate` to the returned object):

```js
// before:
function parseTaskDetailBlock(text) {
  const fields = _parseFieldBlock(text)
  return {
    groupingRationale: _stringOrNull(fields['Grouping rationale']),
    verificationCommands: _parseVerificationCommands(text),
  }
}

// after:
function parseTaskDetailBlock(text) {
  const fields = _parseFieldBlock(text)
  return {
    estimate: {
      agentMinutes: _numberOrNull(fields['Estimate — agent minutes']),
      tokens: _numberOrNull(fields['Estimate — tokens']),
    },
    groupingRationale: _stringOrNull(fields['Grouping rationale']),
    verificationCommands: _parseVerificationCommands(text),
  }
}
```

**Edit 3 — `loadWorkBreakdown`'s per-task mapping** (one line, inside the `tasks = (phaseSkeleton.
taskIds || []).map(taskId => {...})` block):

```js
// before:
return {
  id: taskId,
  title: skeletonTask.title,
  outcome: skeletonTask.outcome,
  domain: skeletonTask.domain,
  agentType: skeletonTask.agentType,
  dependsOn: skeletonTask.dependsOn,
  acceptanceCriteria: skeletonTask.acceptanceCriteria,
  estimate: skeletonTask.estimate,
  outputCount: skeletonTask.outputCount,
  groupingRationale: detail.groupingRationale,
  commit: skeletonTask.commit,
  verification: { commands: detail.verificationCommands },
}

// after:
return {
  id: taskId,
  title: skeletonTask.title,
  outcome: skeletonTask.outcome,
  domain: skeletonTask.domain,
  agentType: skeletonTask.agentType,
  dependsOn: skeletonTask.dependsOn,
  acceptanceCriteria: skeletonTask.acceptanceCriteria,
  estimate: detail.estimate,
  outputCount: skeletonTask.outputCount,
  groupingRationale: detail.groupingRationale,
  commit: skeletonTask.commit,
  verification: { commands: detail.verificationCommands },
}
```

No other function in this file changes. `renderTaskDetailBlock` (the inverse codec, used by tests
and any future re-render) already takes `task.estimate.agentMinutes`/`task.estimate.tokens` as
plain input values — it has no opinion on WHERE the caller's `task` object got `estimate` from, so
it needs no change at all.

## Tests

See `components/workflow-runtime.test.js.md` for the full list of new integration tests
(AC-02, AC-03).
