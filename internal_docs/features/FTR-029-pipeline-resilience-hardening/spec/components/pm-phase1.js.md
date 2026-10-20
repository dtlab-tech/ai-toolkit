# src/claude/workflows/pm-phase1.js — Modified

## Change

Two independent edits:

1. **UC-01's schema relaxation.** The `gaia-validate-feature-docs` worker call's schema drops
   `needsRequirementsFix`/`needsTechSpecFix` from `required` (both remain in `properties`).
2. **UC-04's immediate per-item validation.** Both the per-component loop (`generateTechSpec`) and
   the per-UC loop (`generateRequirements`) validate their worker's response immediately, with one
   bounded retry, before writing to disk.

## Algorithm

**Edit 1 — validator schema** (the `required` array only; everything else about this call, already
established by FTR-028, is unchanged):

```js
// before:
required: ['valid', 'findings', 'needsRequirementsFix', 'needsTechSpecFix', 'report']
// after:
required: ['valid', 'findings', 'report']
```

```js
// needsRequirementsFix/needsTechSpecFix stay declared in `properties` (still type-checked when
// present) but are no longer hard-required — confirmed against three real evidence files that the
// model reasonably omits both when there is nothing to fix; the host's own merge logic already
// treats an absent value as falsy (`result.needsRequirementsFix || ...`, `result.needsTechSpecFix
// || ...`, both already present from FTR-028), so no further change is needed here.
```

**Edit 2 — per-component loop** (replaces `pm-phase1.js:439-445`):

```js
const COMPONENT_RETRY_ATTEMPTS = 2 // fixed, not externally configurable (feature.md precedent)
for (const comp of components) {
  const compPath = `${specDir}/components/${comp.fileSlug}`
  if (!regenSkeleton && c.exists(compPath) && isValidComponentDetail(c.read(compPath))) continue // resume: skip, no dispatch
  let detail, valid = false
  for (let attempt = 1; attempt <= COMPONENT_RETRY_ATTEMPTS && !valid; attempt++) {
    detail = await c.worker(specComponentId, buildComponentPrompt(comp, components, featurePath, componentTemplate),
      { label: `tech-spec-component:${comp.fileSlug}:${attempt}` })
    valid = isValidComponentDetail(detail)
  }
  if (!valid) throw new Error(`Tech-Spec component "${comp.filePath}" (${comp.fileSlug}) failed structural validation after ${COMPONENT_RETRY_ATTEMPTS} attempts — missing a real "## Change"/"## Tests" heading`)
  c.writeOutput(compPath, detail)
}
```

**Edit 3 — per-UC loop** (replaces `pm-phase1.js:193-202`), same shape, reusing
`isValidUseCaseFile`:

```js
const USE_CASE_RETRY_ATTEMPTS = 2 // fixed, not externally configurable
for (const row of ucTable) {
  const ucPath = `${reqDir}/${row.file}`
  if (!regenSkeleton && c.exists(ucPath) && isValidUseCaseFile(c.read(ucPath), row.id)) continue // resume: skip, no dispatch
  let detail, valid = false
  for (let attempt = 1; attempt <= USE_CASE_RETRY_ATTEMPTS && !valid; attempt++) {
    detail = await c.worker(reqUcId, buildUcPrompt(row, ucTable, featurePath, ucTemplate),
      { label: `requirements-use-case:${row.id}:${attempt}` })
    valid = isValidUseCaseFile(detail, row.id)
  }
  if (!valid) throw new Error(`Requirements use case "${row.id}" failed structural validation after ${USE_CASE_RETRY_ATTEMPTS} attempts — missing the required "### ${row.id}: " heading`)
  c.writeOutput(ucPath, detail.trimEnd() + ucCrossReferences(c.read(reqIndexPath), row.id))
}
```

Both retry loops re-send the IDENTICAL prompt on retry (Open Question 2, resolved: no corrective
nudge for this failure shape — matches the existing transient-API-error retry's own convention; no
evidence yet that a nudge helps here specifically). `COMPONENT_RETRY_ATTEMPTS`/
`USE_CASE_RETRY_ATTEMPTS` are placed as top-level constants near the top of the file (alongside
`valId`/`output`), not inline, consistent with this file's own organization.

**Pre-existing tests updated (found while implementing, not anticipated at Tech-Spec time):** 4
tests in `tests/integration/workflow-runtime.test.js` asserted the OLD 5-field `required` array
(`['valid', 'findings', 'needsRequirementsFix', 'needsTechSpecFix', 'report']`) either directly
(`expect(schema.required).toEqual([...])`) or via the exact `"expected fields: ..."` substring in
the thrown error message — all 4 updated to the new 3-field array
(`['valid', 'findings', 'report']`), consistent with Edit 1 above. No other existing test asserted
the schema's exact shape.

## Tests

See `components/workflow-runtime.test.js.md` for the full list of new integration tests
(AC-01, AC-02, AC-10, AC-11, AC-12).
