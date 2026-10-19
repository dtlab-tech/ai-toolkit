<a id="task-US-04-TASK-BE-03"></a>
### US-04-TASK-BE-03

- **Task ID:** US-04-TASK-BE-03
- **Title:** Implement per-UC generation loop with resume-by-existence in pm-phase1.js
- **Outcome:** pm-phase1.js parses req/index.md's use-case index table, and for each row whose req/use-cases/{UC-ID}.md does not already exist, dispatches gaia.agent.planner.requirements-use-case via buildUcPrompt() and writes the response via c.writeOutput; rows whose file already exists are skipped without dispatch
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-INFRA-01, US-04-TASK-BE-02
- **Acceptance criteria:** AC-02, AC-03
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add per-UC generation loop with resume-by-existence to pm-phase1.js

**Implementation notes:**

Appends to `generateRequirements()` (BE-01/BE-02), after the structural pre-check:

```js
const reqUcId = 'gaia.agent.planner.requirements-use-case'

function buildUcPrompt(row, ucTable, featurePathArg) {
  const compactIndex = ucTable.map(r => `${r.id}: ${r.title} (${r.actor})`).join('\n')
  return `${featurePathArg}\n\nGenerate the full detail for this use case:\n` +
    `UC ID: ${row.id}\nTitle: ${row.title}\nActor: ${row.actor}\nPriority: ${row.priority}\n\n` +
    `Full use-case index (for cross-UC awareness, do not restate):\n${compactIndex}`
}

async function generateRequirements() {
  if (!c.exists(reqIndexPath)) {
    const skeleton = await c.worker(reqId, featurePath)
    c.writeOutput(reqIndexPath, skeleton)
  }

  const checkResult = c.command(['run-asset', 'scripts/req-skeleton-check.js',
    '--project', c.root, '--', reqIndexPath], [0, 1])
  if (checkResult.exitCode !== 0) {
    throw new Error('Requirements skeleton failed structural checks: ' + checkResult.stdout)
  }

  const ucTable = parseUseCaseIndexTable(c.read(reqIndexPath))
  for (const row of ucTable) {
    const ucPath = `${reqDir}/${row.file}`
    if (c.exists(ucPath)) continue                        // UC-04: resume-by-existence
    const detail = await c.worker(reqUcId, buildUcPrompt(row, ucTable, featurePath),
      { label: `requirements-use-case:${row.id}` })
    c.writeOutput(ucPath, detail)
  }

  // ... assembly (BE-04) ...
}
```

`parseUseCaseIndexTable` is a small pure helper local to `pm-phase1.js` with the exact same
parsing logic as `req-assembler.js`'s own export of the same name (Tech-Spec §3 explicitly
accepts this duplication rather than requiring `pm-phase1.js` to `require()` a script module
cross-process — the workflow-runner sandbox constraint from §1 means `pm-phase1.js` could only
get this data via another `c.command` round-trip, which is unnecessary overhead for a
few-line table parse already needed in-process to drive the loop itself).

`c.exists(ucPath)` alone is the complete resume check — no `status` field exists to also check
(OQ-1's resolution, Tech-Spec §2).

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```
