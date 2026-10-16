<a id="task-US-04-TASK-BE-01"></a>
### US-04-TASK-BE-01

- **Task ID:** US-04-TASK-BE-01
- **Title:** Implement skeleton-call step in pm-phase1.js
- **Outcome:** pm-phase1.js dispatches gaia.agent.planner.requirements (no declared worker() output) only when req/index.md does not already exist, and the coordinator writes the response to req/index.md itself via c.writeOutput; an existing req/index.md is reused as-is (resume)
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-INFRA-01
- **Acceptance criteria:** AC-01
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add skeleton-call step with resume detection to pm-phase1.js

**Implementation notes:**

Replaces today's line 36 (`const requirements = () => c.worker(reqId, featurePath, { outputs:
[output('Requirements')] })`) with the first part of a new `generateRequirements()` function
(the remaining parts are US-04-TASK-BE-02 through BE-04 — this task only covers the skeleton
step, the rest throw a placeholder for now so the file still parses):

```js
// Deliberately NOT file('req') — same reasoning as FTR-020's wbsDir: this directory is nested
// inside the feature's own already-prefixed folder, so a second prefix would be redundant.
const reqDir = `${featureDir}/req`
const reqIndexPath = `${reqDir}/index.md`

async function generateRequirements() {
  if (!c.exists(reqIndexPath)) {
    const skeleton = await c.worker(reqId, featurePath)       // no declared output
    c.writeOutput(reqIndexPath, skeleton)
  }
  // ... structural pre-check (US-04-TASK-BE-02), per-UC loop (BE-03), assembly (BE-04) ...
}
```

Note `c.worker(reqId, featurePath)` here has **no** `outputs` option, unlike the current call it
replaces — the response is consumed directly as the returned string (same convention FTR-020's
`US-04-TASK-BE-01` used for its own skeleton call) because the host, not `worker()`, decides where
the content lands. `reqId` stays `'gaia.agent.planner.requirements'` — only the agent's own prompt
content changed (US-01-TASK-INFRA-01), not its registered identity.

`generateRequirements` is not yet called from anywhere in this task — wiring it into the existing
`if (force || !fresh(...))` call sites is US-04-TASK-BE-04's job, once the whole function body
exists. This task's own verification only needs the file to still parse as valid JS with the new
function defined and unused (a temporary `// eslint-disable-next-line no-unused-vars`-style state
is expected until BE-04 lands — the existing `requirements` binding stays in place and still gets
called until BE-04 switches the call sites over).

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```
