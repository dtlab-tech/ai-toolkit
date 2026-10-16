<a id="task-US-04-TASK-BE-02"></a>
### US-04-TASK-BE-02

- **Task ID:** US-04-TASK-BE-02
- **Title:** Implement structural pre-check step in pm-phase2.js
- **Outcome:** pm-phase2.js calls a new runGraphChecks(index, requirementsText) helper that invokes the same wb-graph-checks.js functions wb-validate.js now imports, against the skeleton shape; a non-empty result throws before any per-task call is dispatched
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01, US-04-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add skeleton structural pre-check step to pm-phase2.js

**Implementation notes:**

`index.tasks` is a **map** (see `US-04-TASK-BE-01`), but `wb-graph-checks.js`'s 11 functions all
expect `{ phases }` with each phase carrying an inline `tasks` **array** (the shape
`wb-validate.js` already uses post-assembly). `runGraphChecks` bridges that gap by projecting
the skeleton into the same `{ phases: [{ tasks: [...] }] }` shape, without needing the detail
files at all (every field those 11 checks read — `id`, `domain`, `agentType`, `dependsOn`,
`acceptanceCriteria` — is already present on the skeleton task entries):

```js
function runGraphChecks(index, requirementsText) {
  const projected = {
    phases: index.phases.map(p => ({
      id: p.id, type: p.type,
      tasks: p.taskIds.map(id => ({ id, ...index.tasks[id] })),
    })),
  }
  const requirementsPath = requirementsText != null ? writeTempRequirements(requirementsText) : null
  const acMap = requirementsPath ? graphChecks.parseAcTable(requirementsPath) : null
  const results = [
    graphChecks.checkUniqueTaskIds(projected),
    graphChecks.checkTaskIdFormat(projected),
    graphChecks.checkDomainWhitelist(projected),
    graphChecks.checkAgentTypeWhitelist(projected),
    graphChecks.checkDependencyExistence(projected),
    graphChecks.checkSelfDependency(projected),
    graphChecks.checkPhaseIdConsistency(projected),
    graphChecks.checkTaskCycle(projected),
  ]
  const { phaseGraph } = graphChecks.checkPhaseDependencyAndCycle(projected)
  results.push(graphChecks.checkPhaseDependencyAndCycle(projected))
  results.push(graphChecks.checkPhaseSchedulability(projected, phaseGraph))
  if (acMap) results.push(graphChecks.checkAcCoverage(projected, acMap))
  return results.flatMap(r => r.errors)
}

// In the main flow, right after index is available (from US-04-TASK-BE-01):
const graphErrors = runGraphChecks(index, c.read(file('Requirements.md')))
if (graphErrors.length) {
  throw new Error('Work breakdown skeleton failed structural checks: ' + JSON.stringify(graphErrors))
}
```
`parseAcTable` needs a real file path (per its existing signature, unchanged in
`INFRA-TASK-BE-01`) — if `c.read`/the workflow runtime has no scratch-file helper already, write
the Requirements text to a short-lived temp file for this one call rather than changing
`parseAcTable`'s signature to accept raw text (that would diverge it from the identical function
`wb-validate.js` also calls with a real path).

**Verification commands:**

```
node --check src/claude/workflows/pm-phase2.js
```
