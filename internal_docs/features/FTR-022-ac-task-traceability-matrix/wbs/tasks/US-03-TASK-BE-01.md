<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Wire ac-task-matrix.js into pm-phase2.js after wb-render.js
- **Outcome:** pm-phase2.js runs a new c.activity('ac-task-matrix', ...) block immediately after the existing wb-render.js activity block, invoking ac-task-matrix.js via c.command(['run-asset', 'scripts/ac-task-matrix.js', ...]), reading the produced {PREFIX}-AC-Task-Matrix.md back before trusting it, and adding gate2_payload.ac_task_matrix_path to the returned result; gate2_blocked logic is unchanged
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-05
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** wire ac-task-matrix.js into pm-phase2.js's Gate 2 flow

**Implementation notes:**

Insert immediately after the existing `rendered` block (today: `const rendered = await
c.activity('wb-render', ...)`, followed by the `assembled`/`metrics` lines) — from Tech-Spec §6:

```js
const acTaskMatrix = await c.activity('ac-task-matrix', async () => {
  const result = c.command(['run-asset', 'scripts/ac-task-matrix.js', '--project', c.root,
    '--', wbsDir, file('Requirements.md'), prefix])
  const matrixPath = file('AC-Task-Matrix.md')
  if (!c.exists(matrixPath)) throw new Error('AC-Task matrix output missing')
  c.read(matrixPath) // never trust an unread write
  return { ...result, matrixPath }
})
```

Then add exactly one field to the existing `gate2_payload` object literal in the function's final
`return` statement: `ac_task_matrix_path: acTaskMatrix.matrixPath`. Every other field in
`gate2_payload` (`skeleton_check_report`, `js_validator_report`, `semantic_validator_result`,
`renderer_result`, `gate2_blocked`, etc.) is untouched — this is a pure addition, not a
restructuring, matching BR-02/NFR-03: there is no code path in this new block that can set
`gate2_blocked: true` or throw in a way that changes any *other* field's value.

`file('AC-Task-Matrix.md')` relies on the existing `file = suffix => \`${featureDir}/${prefix}-${suffix}.md\``
helper already defined at the top of `pm-phase2.js` — no new path-construction logic is needed.

**Verification commands:**

```
node --check src/claude/workflows/pm-phase2.js
```
