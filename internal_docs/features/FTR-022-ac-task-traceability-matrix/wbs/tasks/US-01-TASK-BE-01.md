<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Extend parseAcTable to capture the Criterion text column
- **Outcome:** src/claude/scripts/wb-graph-checks.js's parseAcTable additionally sets criterion: cells[1] on every acMap entry; checkAcCoverage and its three checks (19-21) are untouched and read exactly the fields they already read
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-05
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** capture AC criterion text in parseAcTable's acMap entries

**Implementation notes:**

One-line, additive change at `src/claude/scripts/wb-graph-checks.js:228` (current, pre-this-task
line number):

```js
// before
acMap.set(acId, { id: acId, priority: acPriority, allowedUserStories, unscoped })

// after
acMap.set(acId, { id: acId, criterion: cells[1], priority: acPriority, allowedUserStories, unscoped })
```

`cells[1]` is already in scope at that point in the function — it's the `Criterion` column,
already destructured a few lines earlier (`const acId = cells[0]`, `const relatedUcRaw = cells[2]`)
but never retained past that point today. No other line in `parseAcTable` changes.

Do not touch `checkAcCoverage` (same file, the function below `parseAcTable`) — it never reads
`criterion`, so it has nothing to update. This is the entire diff for this task.

**Verification commands:**

```
node --check src/claude/scripts/wb-graph-checks.js
```
