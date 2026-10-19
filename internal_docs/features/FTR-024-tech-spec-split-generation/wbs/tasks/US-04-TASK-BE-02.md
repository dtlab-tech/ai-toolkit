<a id="task-US-04-TASK-BE-02"></a>
### US-04-TASK-BE-02

- **Task ID:** US-04-TASK-BE-02
- **Title:** Move and repoint the structural pre-check at the Tech-Spec skeleton
- **Outcome:** generateTechSpec() runs tech-spec-graph-checks.js (unmodified) via c.command(['run-asset', ...]) against spec/index.md immediately after the skeleton-call step and before any per-component dispatch; the existing tech-spec-ac-check activity block (FTR-023) is moved from its old post-generation position into this earlier, pre-dispatch position
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-04-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** repoint tech-spec-ac-check at the Tech-Spec skeleton, before per-component dispatch

**Implementation notes:**

**Remove** the existing `tech-spec-ac-check` `c.activity(...)` block from its current location
(current lines 148-160, inside the `if (force || changed || !fresh(file('Validation-Report'), ...))`
block, before the `for (let cycle ...)` loop) — that block today points at the **assembled**
`file('Tech-Spec')`; after this feature, Tech-Spec is no longer generated in one piece, so by the
time execution reaches that old location, nothing has stopped a broken skeleton from already
having been dispatched to every per-component call.

**Add** the same check, pointed at `specIndexPath` instead, inside `generateTechSpec()`
(continuing from `US-04-TASK-BE-01`), immediately after the skeleton-call block and before the
per-component loop:

```js
async function generateTechSpec(forceAll) {
  const skeletonStale = c.exists(specIndexPath) && !fresh(specIndexPath)
  const regenSkeleton = forceAll || skeletonStale || !c.exists(specIndexPath)

  if (regenSkeleton) {
    const skeleton = await c.worker(specId, featurePath)
    c.writeOutput(specIndexPath, disambiguateFileSlugs(skeleton))
  }

  await c.activity('tech-spec-ac-check', async () => {
    const res = c.command(['run-asset', 'scripts/tech-spec-graph-checks.js', '--project', c.root,
      '--', specIndexPath, file('Requirements')], [0, 1])
    const parsed = JSON.parse(res.stdout)
    if (typeof parsed.valid !== 'boolean' || !Array.isArray(parsed.errors) ||
        (res.exitCode === 0) !== parsed.valid) throw new Error('Invalid tech-spec-ac-check result')
    if (!parsed.valid) throw new Error('Tech-Spec skeleton failed structural checks: ' + res.stdout)
    return parsed
  })

  // ... per-component loop (BE-03), assembly (BE-04) ...
}
```

Note the only change to the inner body versus the block being removed is the first `c.command`
argument: `specIndexPath` instead of `file('Tech-Spec')` — `tech-spec-graph-checks.js` itself is
untouched (Tech-Spec OQ-2, empirically verified), so this is purely a relocation, not a rewrite.
`file('Requirements')` stays as the second argument unchanged — the check still needs the real
AC ID list to validate against, same as before.

Note on the empty **Acceptance criteria** field above: `AC-02` is scoped to `US-02`/`US-03`
(via `UC-02`/`UC-03`), not `US-04` — same already-documented `wb-validate.js` check-20 vs.
`sourceUC` tension explained in `US-04-TASK-BE-01`'s own note; not re-litigated per task.

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```
