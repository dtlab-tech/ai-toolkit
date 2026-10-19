<a id="task-US-04-TASK-BE-04"></a>
### US-04-TASK-BE-04

- **Task ID:** US-04-TASK-BE-04
- **Title:** Wire pm-phase1.js's Requirements step to assemble via req-assembler.js
- **Outcome:** pm-phase1.js's generateRequirements() calls req-assembler.js via c.command(['run-asset', 'scripts/req-assembler.js', ...]) against the req/ directory and writes the assembled document to file('Requirements') via c.writeOutput; the surrounding assertCompleteSections/docsDigest/Tech-Spec/validation-loop logic is unchanged and now reads this assembled file
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01, US-04-TASK-BE-03
- **Acceptance criteria:** AC-04, AC-06
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** wire pm-phase1.js Requirements generation to assemble via req-assembler.js

**Implementation notes:**

Completes `generateRequirements()` (BE-01/BE-02/BE-03) and switches the two existing call sites
over to it:

```js
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
    if (c.exists(ucPath)) continue
    const detail = await c.worker(reqUcId, buildUcPrompt(row, ucTable, featurePath),
      { label: `requirements-use-case:${row.id}` })
    c.writeOutput(ucPath, detail)
  }

  const assembled = c.command(['run-asset', 'scripts/req-assembler.js',
    '--project', c.root, '--', reqDir]).stdout
  c.writeOutput(file('Requirements'), assembled)
}
```

Two call-site changes in the surrounding, otherwise-unchanged `pm-phase1.js` body:
- The `const requirements = () => c.worker(reqId, featurePath, { outputs: [output('Requirements')] })`
  binding (today's line 36) is **removed**; every place that called `requirements()` now calls
  `generateRequirements()` instead — both the initial-generation branch (today's lines 39–44) and
  the `needsRequirementsFix` branch inside the validation cycle (today's line 74).
- `assertCompleteSections('Requirements', c.read(file('Requirements')), 9)` and the `docsDigest`
  computation are **untouched** — they already read `file('Requirements')` by path, and that path
  now simply contains assembled rather than directly-generated content.

A feature with no `req/` directory yet (first run after this feature ships, or a feature created
before it) takes the `!c.exists(reqIndexPath)` branch and gets one, exactly as described in
Tech-Spec §6 (Legacy Compatibility) — there is no separate "first-time setup" code path beyond
this.

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```
