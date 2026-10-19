<a id="task-US-04-TASK-BE-03"></a>
### US-04-TASK-BE-03

- **Task ID:** US-04-TASK-BE-03
- **Title:** Implement per-component generation loop with resume-by-existence in pm-phase1.js
- **Outcome:** generateTechSpec() parses spec/index.md's Components table, and for each row whose spec/components/{fileSlug} does not already exist (or unconditionally if the skeleton was just regenerated), dispatches gaia.agent.planner.tech-spec-component via buildComponentPrompt() and writes the response via c.writeOutput; rows whose file already exists (and the skeleton was not regenerated) are skipped without dispatch
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-INFRA-01, US-04-TASK-BE-02
- **Acceptance criteria:** AC-03
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add per-component generation loop with resume-by-existence to pm-phase1.js

**Implementation notes:**

Add a `specComponentId` constant near the existing `reqUcId`/`specId` constants (current lines
32-34): `const specComponentId = 'gaia.agent.planner.tech-spec-component'`.

Add `parseComponentsTable`/`buildComponentPrompt` as local pure helpers, mirroring
`parseUseCaseIndexTable`/`buildUcPrompt`'s exact existing shape (current lines 49-76) — reusing
the **same** table-parsing logic `tech-spec-assembler.js` (`US-05-TASK-BE-01`) exports under the
same name, duplicated here for the same reason `parseUseCaseIndexTable` is duplicated rather than
imported (this runtime has no `require()`):

```js
function parseComponentsTable(indexContent) {
  // same body as tech-spec-assembler.js's own parseComponentsTable — see that task's
  // Implementation notes for the exact logic (findSectionRange(9) + two findSubsectionRange
  // calls + parseTableRows, extracting filePath/change/domain/addresses/fileSlug per row)
}

function buildComponentPrompt(row, components, featurePathArg) {
  const compactIndex = components.map(c => `${c.filePath} (${c.domain})`).join('\n')
  return `${featurePathArg}\n\nGenerate the full technical design for this component:\n` +
    `Path: ${row.filePath}\nChange: ${row.change}\nDomain: ${row.domain}\nAddresses: ${row.addresses}\n\n` +
    `Full component index (for cross-component awareness, do not restate):\n${compactIndex}`
}
```

Continuing `generateTechSpec()` (from `US-04-TASK-BE-02`), after the `tech-spec-ac-check`
activity:

```js
  const components = parseComponentsTable(c.read(specIndexPath))
  for (const comp of components) {
    const compPath = `${specDir}/components/${comp.fileSlug}`
    if (!regenSkeleton && c.exists(compPath)) continue // resume: skip, no dispatch
    const detail = await c.worker(specComponentId, buildComponentPrompt(comp, components, featurePath),
      { label: `tech-spec-component:${comp.fileSlug}` })
    c.writeOutput(compPath, detail)
  }

  // ... assembly (BE-04) ...
```

Note the resume condition is `!regenSkeleton && c.exists(compPath)`, the exact same shape
`generateRequirements`'s per-use-case loop already uses (current line 121) — if the skeleton was
just (re)generated, every component regenerates too, since an existing component file would have
been written against the OLD skeleton's row and cannot be trusted as-is (same reasoning as
Requirements' own per-UC loop).

`AC-02` ("exactly one call per component is dispatched") is NOT cited here even though this task
directly implements it — it's scoped to `US-02`/`US-03`, not `US-04` (see `US-04-TASK-BE-01`'s
note on the same `wb-validate.js` check-20 vs. `sourceUC` tension). `AC-03` (resume) IS legitimately
citable here: its `Related UC` is `UC-04`, which — unlike `UC-01`/`UC-02`/`UC-03` — maps directly
to phase `US-04` itself, no tension to route around.

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```
