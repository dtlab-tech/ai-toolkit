<a id="task-US-04-TASK-BE-02"></a>
### US-04-TASK-BE-02

- **Task ID:** US-04-TASK-BE-02
- **Title:** Implement structural pre-check step in pm-phase1.js
- **Outcome:** pm-phase1.js calls req-skeleton-check.js via c.command(['run-asset', 'scripts/req-skeleton-check.js', ...]) against req/index.md; a non-zero exit code throws before any per-UC call is dispatched
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-05-TASK-BE-01, US-04-TASK-BE-01
- **Acceptance criteria:** AC-02
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add skeleton structural pre-check step to pm-phase1.js

**Implementation notes:**

Appends to `generateRequirements()` (BE-01), immediately after the skeleton-call block:

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

  // ... per-UC loop (BE-03), assembly (BE-04) ...
}
```

`[0, 1]` as `c.command`'s second argument declares both exit codes as non-throwing at the
`c.command` layer (mirrors every existing `wb-validate.js`/`wb-render.js` call in `pm-phase2.js`)
— the explicit `if (checkResult.exitCode !== 0)` check immediately after is what actually enforces
the gate; exit code 2 (parse failure) is deliberately *not* in the allowed list, so `c.command`
itself throws for that case without this function needing special-case handling for it.

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```
