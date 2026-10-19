<a id="task-US-01-TASK-BE-02"></a>
### US-01-TASK-BE-02

- **Task ID:** US-01-TASK-BE-02
- **Title:** Repoint wb-skeleton-check.js/wb-validate.js/ac-task-matrix.js at split index paths
- **Outcome:** pm-phase2.js's three c.command() calls to wb-skeleton-check.js, wb-validate.js, and ac-task-matrix.js receive reqIndexPath/specIndexPath instead of file('Requirements.md')/file('Tech-Spec.md'); the ac-task-matrix.js call also passes featureDir as its required 5th argument, and the surrounding activity wrapper/gate2_payload are updated for the new coverage-matrix/index.json+index.md output paths
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01, US-01-TASK-BE-03
- **Acceptance criteria:** AC-03
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** pm-phase2
- **Commit subject:** repoint wb-skeleton-check/wb-validate/ac-task-matrix at split index paths

**Implementation notes:**

Three call-site changes in `src/claude/workflows/pm-phase2.js`, reusing the
`reqIndexPath`/`specIndexPath` consts US-01-TASK-BE-01 introduced, and US-01-TASK-BE-03's new
`featureDir`/coverage-matrix output contract:

```js
// wb-skeleton-check.js call site:
c.command(['run-asset', 'scripts/wb-skeleton-check.js', '--project', c.root,
  '--', indexPath, file('Requirements.md')], [0, 1])
// becomes:
c.command(['run-asset', 'scripts/wb-skeleton-check.js', '--project', c.root,
  '--', indexPath, reqIndexPath], [0, 1])

// wb-validate.js call site:
c.command(['run-asset', 'scripts/wb-validate.js', '--project', c.root,
  '--', wbsDir, file('Requirements.md')], [0, 1])
// becomes:
c.command(['run-asset', 'scripts/wb-validate.js', '--project', c.root,
  '--', wbsDir, reqIndexPath], [0, 1])

// ac-task-matrix.js call site + its activity wrapper:
// before:
const acTaskMatrix = await c.activity('ac-task-matrix', async () => {
  const result = c.command(['run-asset', 'scripts/ac-task-matrix.js', '--project', c.root,
    '--', wbsDir, file('Requirements.md'), file('Tech-Spec.md'), prefix])
  const matrixPath = file('AC-Task-Matrix.md')
  if (!c.exists(matrixPath)) throw new Error('AC-Task matrix output missing')
  c.read(matrixPath)
  return { ...result, matrixPath }
})
// after:
const acTaskMatrix = await c.activity('ac-task-matrix', async () => {
  const result = c.command(['run-asset', 'scripts/ac-task-matrix.js', '--project', c.root,
    '--', wbsDir, reqIndexPath, specIndexPath, prefix, featureDir])
  const matrixJsonPath = `${featureDir}/coverage-matrix/index.json`
  const matrixMdPath = `${featureDir}/coverage-matrix/index.md`
  if (!c.exists(matrixJsonPath)) throw new Error('AC-Task matrix JSON output missing')
  if (!c.exists(matrixMdPath)) throw new Error('AC-Task matrix MD output missing')
  c.read(matrixJsonPath)
  c.read(matrixMdPath)
  return { ...result, matrixJsonPath, matrixMdPath }
})
// gate2_payload: replace ac_task_matrix_path with
//   ac_task_matrix_json_path: acTaskMatrix.matrixJsonPath,
//   ac_task_matrix_md_path: acTaskMatrix.matrixMdPath
```

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "wb-skeleton-check"
```

```
npm test -- tests/integration/workflow-runtime.test.js -t "ac-task-matrix"
```
