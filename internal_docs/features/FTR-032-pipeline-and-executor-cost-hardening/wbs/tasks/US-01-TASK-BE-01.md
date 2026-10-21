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
- **Commit scope:** wbs-assembler
- **Commit subject:** read the per-task effort estimate back from its own detail response instead of the skeleton

**Implementation notes:**

Per `spec/components/wbs-assembler.js.md`'s Edits 1-3. In `src/claude/scripts/wbs-assembler.js`:

1. Add a new `_numberOrNull(value)` helper (mirrors `lib/task-executor/plan.js`'s own
   identically-named function — same fail-closed convention, a non-numeric value throws rather
   than silently coercing):

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

2. `parseTaskDetailBlock` gains `estimate`, read from the SAME `_parseFieldBlock(text)` call it
   already uses for `groupingRationale` — the field labels are `Estimate — agent minutes`/
   `Estimate — tokens` (exact strings, including the em dash — match `gaia-task-template.md`'s own
   labels verbatim):

```js
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

3. `loadWorkBreakdown`'s per-task mapping (inside the directory-input branch's `tasks = (...).map(
   taskId => {...})`): change the one line `estimate: skeletonTask.estimate,` to
   `estimate: detail.estimate,`. Every other field in that returned object (title, outcome, domain,
   agentType, dependsOn, acceptanceCriteria, outputCount, commit) stays sourced from
   `skeletonTask` — only `estimate` moves to `detail`.

No other function in this file changes. `renderTaskDetailBlock` already takes
`task.estimate.agentMinutes`/`task.estimate.tokens` as plain input values; it has no opinion on
where the caller's `task` object got them from.

**Verification commands:**

```
npx jest tests/wbs-assembler.test.js
```
