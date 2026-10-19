<a id="task-INFRA-TASK-BE-01"></a>
### INFRA-TASK-BE-01

- **Task ID:** INFRA-TASK-BE-01
- **Title:** Extract 11 skeleton-answerable checks into wb-graph-checks.js
- **Outcome:** src/claude/scripts/wb-graph-checks.js exists exporting one pure function per check (unique task IDs, ID format, domain whitelist, agentType whitelist, dependency existence, self-dependency, phase ID consistency, task cycle, phase dependency projection + cycle, phase schedulability, AC existence/scope/Must-coverage) plus parseAcTable/splitTableRow relocated from wb-validate.js, each taking a plain {phases, tasks} structure and returning error/warning objects in wb-validate.js's existing report shape
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** All 11 checks share the same module, inputs, and output contract; splitting them into separate tasks would not be independently verifiable since none compiles or is meaningful alone without the others' shared helpers (parseAcTable, splitTableRow, the WHITE/GRAY/BLACK cycle-DFS).
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add wb-graph-checks.js with 11 extracted pure check functions

**Implementation notes:**

This is a **relocation**, not a rewrite: copy each check's existing body out of
`src/claude/scripts/wb-validate.js` almost verbatim, only changing how it reads its input
(parameter instead of module-level `wb`/`phases`/`acMap`) and how it reports results (returned
array instead of pushed into the shared `report` object). Source line ranges in the current
`wb-validate.js` (pre-extraction) to copy from:

| New function | Source lines in `wb-validate.js` | Covers checks |
|---|---|---|
| `checkUniqueTaskIds({ phases })` | 294–323 | 3 |
| `checkTaskIdFormat({ phases })` | 450–473 | 5 |
| `checkDomainWhitelist({ phases })` | 475–492 | 6 |
| `checkAgentTypeWhitelist({ phases })` | 494–511 | 7 |
| `checkDependencyExistence({ phases })` | 513–534 | 8 |
| `checkSelfDependency({ phases })` | 536–553 | 9 |
| `checkPhaseIdConsistency({ phases })` | 555–592 | 10 |
| `checkTaskCycle({ phases })` | 594–664 | 11 (keep the WHITE/GRAY/BLACK DFS and `taskGraph`/`taskCycles` diagnostics in the return value — `wb-validate.js` still reports them in `report.dependencies`) |
| `checkPhaseDependencyAndCycle({ phases })` | 666–759 | 12, 13 (keep `phaseGraph`/`phaseCycles` in the return value) |
| `checkPhaseSchedulability({ phases }, phaseGraph)` | 761–787 | 14 (keep `phaseWaves`/`phaseUnschedulable` in the return value) |
| `checkAcCoverage({ phases }, acMap)` | 905–976 | 19, 20, 21 |
| `parseAcTable(requirementsPath)` | 94–239 | prerequisite for 19–21, relocate unchanged |
| `splitTableRow(line)` | 71–90 | prerequisite for `parseAcTable`, relocate unchanged |

Shape each function returns, matching what `wb-validate.js` already pushes today:
```js
// example: checkUniqueTaskIds
function checkUniqueTaskIds({ phases }) {
  const seenTaskIds = new Map();   // taskId -> first-seen phaseId
  const duplicateTaskIds = new Set();
  const errors = [];
  for (const phase of phases) {
    for (const task of (phase.tasks || [])) {
      if (task.id == null) continue;
      if (seenTaskIds.has(task.id)) duplicateTaskIds.add(task.id);
      else seenTaskIds.set(task.id, phase.id);
    }
  }
  for (const taskId of duplicateTaskIds) {
    errors.push({ category: ERRORS.UNIQUE_ID_VIOLATION, severity: 'error', taskId, field: 'id',
      message: `Duplicate task ID "${taskId}" appears in multiple phases`, details: { taskId } });
  }
  return { errors, seenTaskIds };   // seenTaskIds reused by several of the other 10 functions
}
```
Note `seenTaskIds` (taskId → owner phaseId) and `allTaskIds` (`Set` of all task IDs) are shared
inputs several of these checks need (dependency existence, phase ID consistency, cycle
detection) — compute them once and thread them through, don't recompute per function. Keep the
exact `ERRORS` category-constant object (`UNIQUE_ID_VIOLATION`, `INVALID_ID_FORMAT`, ... — lines
34–60 of the current `wb-validate.js`) exported from this new module so `wb-validate.js` and
`wb-graph-checks.test.js` reference the same strings instead of duplicating them.

Export list: `module.exports = { ERRORS, checkUniqueTaskIds, checkTaskIdFormat, checkDomainWhitelist, checkAgentTypeWhitelist, checkDependencyExistence, checkSelfDependency, checkPhaseIdConsistency, checkTaskCycle, checkPhaseDependencyAndCycle, checkPhaseSchedulability, checkAcCoverage, parseAcTable, splitTableRow }`.

**Verification commands:**

```
node --check src/claude/scripts/wb-graph-checks.js
```
