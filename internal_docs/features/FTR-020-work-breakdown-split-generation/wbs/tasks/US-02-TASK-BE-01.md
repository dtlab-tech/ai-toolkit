<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Wire wb-validate.js to use wb-graph-checks.js for checks 3, 5-14, 19-21
- **Outcome:** wb-validate.js requires wb-graph-checks.js and calls its functions for checks 3, 5-14, 19-21 instead of the previous inline code; checks 4, 15-18, 22, 23 remain inline unchanged
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** above target (16 min): the 10 checks are wired as one mechanical, same-shaped substitution across one file; splitting per-check would produce 10 non-independently-verifiable partial edits to the same function.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** wire wb-validate.js to reuse wb-graph-checks.js for 11 extracted checks

**Implementation notes:**

Mechanical substitution — delete the inline bodies for checks 3, 5–14, 19–21 (the same line
ranges listed in `INFRA-TASK-BE-01`'s notes) and replace each with a call into the new module,
pushing its returned `errors`/`warnings` into the existing shared `report` object so the rest of
`wb-validate.js` (the `report` construction, `durationBands`, `domainDistribution`, exit-code
routing) is untouched:

```js
const graphChecks = require('./wb-graph-checks');

// Check 3 (was lines 294-323):
const { errors: uniqueIdErrors, seenTaskIds } = graphChecks.checkUniqueTaskIds({ phases });
report.errors.push(...uniqueIdErrors);

// Check 5 (was lines 450-473):
report.errors.push(...graphChecks.checkTaskIdFormat({ phases }).errors);

// ...checks 6, 7, 8, 9, 10 the same pattern...

// Check 11 (was lines 594-664) — keep taskGraph/taskCycles for report.dependencies:
const { errors: cycleErrors, taskGraph, taskCycles } = graphChecks.checkTaskCycle({ phases });
report.errors.push(...cycleErrors);
report.dependencies.taskGraph = taskGraph;
report.dependencies.taskCycles = taskCycles;

// Checks 12+13 (was lines 666-759) — keep phaseGraph/phaseCycles:
const { errors: phaseDepErrors, phaseGraph, phaseCycles } = graphChecks.checkPhaseDependencyAndCycle({ phases });
report.errors.push(...phaseDepErrors);
report.dependencies.phaseGraph = phaseGraph;
report.dependencies.phaseCycles = phaseCycles;

// Check 14 (was lines 761-787) — keep phaseWaves/phaseUnschedulable:
const { errors: schedErrors, phaseWaves, phaseUnschedulable } = graphChecks.checkPhaseSchedulability({ phases }, phaseGraph);
report.errors.push(...schedErrors);
report.dependencies.phaseWaves = phaseWaves;
report.dependencies.phaseUnschedulable = phaseUnschedulable;

// Checks 19-21 (was lines 905-976) — acMap still built from parseAcTable(requirementsPath),
// now imported from wb-graph-checks.js instead of defined inline:
const acMap = graphChecks.parseAcTable(requirementsPath);
if (acMap !== null) {
  report.errors.push(...graphChecks.checkAcCoverage({ phases }, acMap).errors);
}
```
`allTaskIds` (used by checks 8/9/11 today) can be derived from `seenTaskIds.keys()` exactly as
`wb-validate.js` already does at its line 515 — keep that one line in `wb-validate.js` itself,
it's just a `Set` built from the map `checkUniqueTaskIds` returns, not worth extracting.
Verify there is no remaining dead code where the 10 old inline check bodies used to live.

**Verification commands:**

```
node --check src/claude/scripts/wb-validate.js
```
