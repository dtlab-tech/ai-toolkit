<a id="task-US-02-TASK-BE-02"></a>
### US-02-TASK-BE-02

- **Task ID:** US-02-TASK-BE-02
- **Title:** Wire tech-spec-graph-checks.js into pm-phase1.js before the validation loop
- **Outcome:** pm-phase1.js runs a new c.activity('tech-spec-ac-check', ...) block immediately before the existing 3-cycle validation loop, invoking tech-spec-graph-checks.js via c.command(['run-asset', ...]) against file('Tech-Spec') and file('Requirements'); a non-zero exit throws before gaia.agent.planner.validate-feature-docs is ever dispatched
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-02, AC-03, AC-06
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** wire tech-spec-graph-checks.js into pm-phase1.js's validation flow

**Implementation notes:**

Current (pre-this-task) `pm-phase1.js`:

```js
  let validationSummary = 'skipped (fresh)'
  if (force || changed || !fresh(file('Validation-Report'), [featurePath, file('Requirements'), file('Tech-Spec')])) {
    for (let cycle = 1; cycle <= 3; cycle++) {
      ...
```

Insert the new check as the first statement **inside** the `if` block, before the `for` loop —
not unconditionally at the top of the workflow — so it only runs when the validation flow is
actually about to execute (first run, or after a change), the same freshness-gating the rest of
this block already applies, never wastefully re-checked on an already-validated, untouched
document:

```js
  let validationSummary = 'skipped (fresh)'
  if (force || changed || !fresh(file('Validation-Report'), [featurePath, file('Requirements'), file('Tech-Spec')])) {
    await c.activity('tech-spec-ac-check', async () => {
      const res = c.command(['run-asset', 'scripts/tech-spec-graph-checks.js', '--project', c.root,
        '--', file('Tech-Spec'), file('Requirements')], [0, 1])
      const parsed = JSON.parse(res.stdout)
      if (typeof parsed.valid !== 'boolean' || !Array.isArray(parsed.errors) ||
          (res.exitCode === 0) !== parsed.valid) throw new Error('Invalid tech-spec-ac-check result')
      if (!parsed.valid) throw new Error('Tech-Spec has dangling AC references: ' + res.stdout)
      return parsed
    })
    for (let cycle = 1; cycle <= 3; cycle++) {
      ...
```

`file('Tech-Spec')`/`file('Requirements')` are the same existing helper calls already used
throughout this function (e.g. the `assertCompleteSections` calls just above) — no new path
construction. Nothing after the `for` loop's own body changes.

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```
