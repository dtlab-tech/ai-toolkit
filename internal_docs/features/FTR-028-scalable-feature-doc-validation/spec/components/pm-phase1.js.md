# src/claude/workflows/pm-phase1.js — Modified

## Change

Replaces the validation cycle's body (currently `pm-phase1.js:441-468`) with an extended version
that: (1) builds the main validator's Tech-Spec prompt text from the raw skeleton instead of
`assembleTechSpec()`'s full output; (2) extends the worker schema with `needsComponentDetail`;
(3) runs a new deterministic AC↔component traceability check after every cycle's worker call;
(4) validates, dedupes, and batches any `needsComponentDetail` entries, dispatching one drill-down
worker call per batch; (5) merges every finding source before the existing valid/findings
contradiction guard, and appends any new findings to the persisted Validation-Report. `docsDigest`
(`pm-phase1.js:475`, unchanged) still hashes `assembledRequirements`/`assembledTechSpec`'s full,
unreduced output — neither of those two variables' OWN computation changes; only what gets passed
into the validator's own prompt does.

## Algorithm

New helper functions, placed near the existing duplicated table parsers (`parseAcTableRelatedUc`
at line 117, `parseComponentsTable` at line 216) — same "no `require()` in this sandboxed runtime"
precedent every other duplicated primitive in this file already follows:

```js
// UC-02: purely deterministic, zero-LLM-cost AC<->component traceability check. Reuses the two
// table parsers already duplicated in this file — no new parsing contract invented. Both
// directions produce a "Tech-Spec: " finding (Open Question 1): the gap is always closed by a
// Tech-Spec revision (either add missing coverage, or fix a bad AC-ID reference).
function computeAcComponentTraceabilityGaps(reqIndexContent, specIndexContent) {
  const acIds = new Set(parseAcTableRelatedUc(reqIndexContent).map(r => r.id))
  const components = parseComponentsTable(specIndexContent)
  const addressedAcIds = new Set()
  const findings = []
  for (const comp of components) {
    const refs = (comp.addresses || '').split(',').map(s => s.trim()).filter(s => s && s !== '—')
    for (const ref of refs) {
      addressedAcIds.add(ref)
      if (!acIds.has(ref)) findings.push(`Tech-Spec: component ${comp.filePath} references nonexistent ${ref}`)
    }
  }
  for (const id of acIds) {
    if (!addressedAcIds.has(id)) findings.push(`Tech-Spec: ${id} is not addressed by any Tech-Spec component`)
  }
  return findings
}

// UC-03: validates each needsComponentDetail entry's fileSlug against the real component table
// (BR-05 — a hallucinated/mistyped reference is dropped and reported, never dispatched),
// deduplicates by fileSlug (BR-06, two claims against the same file collapse into one batch
// slot), and splits the remaining unique components into groups of at most DRILL_DOWN_BATCH_SIZE.
const DRILL_DOWN_BATCH_SIZE = 8 // Open Question 4: fixed constant, not externally configurable
function prepareDrillDownBatches(needsComponentDetail, specIndexContent) {
  const validSlugs = new Set(parseComponentsTable(specIndexContent).map(c => c.fileSlug))
  const extraFindings = []
  const claimsByFileSlug = new Map()
  for (const entry of needsComponentDetail || []) {
    if (!validSlugs.has(entry.fileSlug)) {
      extraFindings.push(`Tech-Spec: component-detail check referenced a non-existent file "${entry.fileSlug}" for claim "${entry.claim}"`)
      continue
    }
    if (!claimsByFileSlug.has(entry.fileSlug)) claimsByFileSlug.set(entry.fileSlug, [])
    claimsByFileSlug.get(entry.fileSlug).push(entry.claim)
  }
  const fileSlugs = [...claimsByFileSlug.keys()]
  const batches = []
  for (let i = 0; i < fileSlugs.length; i += DRILL_DOWN_BATCH_SIZE) {
    batches.push(fileSlugs.slice(i, i + DRILL_DOWN_BATCH_SIZE)
      .map(slug => ({ fileSlug: slug, claims: claimsByFileSlug.get(slug) })))
  }
  return { batches, extraFindings }
}

// specDir is already absolute (derived from c.feature()'s realpath-resolved featureDir — see
// deriveFeatureDir/c.feature in lib/workflow-control.js), so this needs no extra path.resolve:
// the same reasoning that already lets featurePath be handed to agents directly (BR-07).
function buildDrillDownPrompt(batch) {
  return batch.map(({ fileSlug, claims }) =>
    claims.map(claim => `Claim: ${claim}\nComponent file: ${specDir}/components/${fileSlug}`).join('\n\n')
  ).join('\n\n')
}

const drillDownId = 'gaia.agent.planner.validate-tech-spec-component-detail'
```

Validation cycle body (replaces `pm-phase1.js:441-468`):

```js
if (force || changed || !fresh(file('Validation-Report'), [featurePath, reqIndexPath, specIndexPath])) {
  for (let cycle = 1; cycle <= 3; cycle++) {
    // needsRequirementsFix/needsTechSpecFix: explicit structured routing fields, not inferred by
    // substring-matching `findings` (unchanged reasoning from today). Tech-Spec text is now the
    // raw skeleton (c.read(specIndexPath)), never assembledTechSpec's fully-spliced output — the
    // one change that bounds this prompt's size to component COUNT, not per-component prose
    // length (UC-01, AC-01). Requirements stays assembledRequirements (full UC detail), unchanged.
    const result = await c.worker(valId,
      `${featurePath}\n\nRequirements:\n${assembledRequirements}\n\nTech-Spec:\n${c.read(specIndexPath)}\n\n` +
      'Validate only; the host owns the revision loop. Return valid, a findings array (one string ' +
      'per remaining gap), needsRequirementsFix/needsTechSpecFix (true only if at least one finding ' +
      'implicates that document), needsComponentDetail (claims needing a component\'s own design ' +
      'body to verify — see your own instructions for when to use this instead of a finding), and ' +
      'the full validation report content. Do not dispatch other agents.',
      { label: `validation:${cycle}`, outputs: [output('Validation-Report', [featurePath, reqIndexPath, specIndexPath])],
        schema: { type: 'object', properties: {
          valid: { type: 'boolean' },
          findings: { type: 'array', items: { type: 'string' } },
          needsRequirementsFix: { type: 'boolean' },
          needsTechSpecFix: { type: 'boolean' },
          report: { type: 'string' },
          needsComponentDetail: { type: 'array', items: { type: 'object',
            properties: { claim: { type: 'string' }, fileSlug: { type: 'string' } },
            required: ['claim', 'fileSlug'] } },
        }, required: ['valid', 'findings', 'needsRequirementsFix', 'needsTechSpecFix', 'report'] } })
        // needsComponentDetail is declared in `properties` but deliberately NOT in the schema's
        // top-level `required` array: every pre-existing mocked test response for this agent
        // (across the whole suite, predating this feature) omits the field entirely, and making
        // it hard-required would break every one of them for no real gain — prepareDrillDownBatches
        // already treats an absent/undefined value as "no entries" via `needsComponentDetail || []`.
        // The prompt still instructs the agent to always include it (empty array if none).

    // UC-02 + UC-03: every finding source for this cycle, computed/dispatched AFTER the main
    // call returns (re-reading the index files fresh, since a prior cycle may have regenerated
    // them). Zero added LLM cost when both come back empty (the common case).
    const reqIndexContent = c.read(reqIndexPath)
    const specIndexContent = c.read(specIndexPath)
    const structuralFindings = computeAcComponentTraceabilityGaps(reqIndexContent, specIndexContent)
    const { batches, extraFindings } = prepareDrillDownBatches(result.needsComponentDetail, specIndexContent)

    const drillDownFindings = []
    for (let b = 0; b < batches.length; b++) {
      const batchResult = await c.worker(drillDownId, buildDrillDownPrompt(batches[b]),
        { label: `validation:${cycle}:component-detail:${b + 1}`,
          schema: { type: 'object', properties: { findings: { type: 'array', items: { type: 'string' } } }, required: ['findings'] } })
      drillDownFindings.push(...batchResult.findings)
    }

    // Implementation refinement found while coding (not anticipated at Tech-Spec time): a raw
    // self-consistency guard runs on the MODEL'S OWN response BEFORE any merge — a pending
    // needsComponentDetail entry is itself a form of "not yet resolved", same as a non-empty
    // findings array, so valid:true requires BOTH empty and valid:false requires at least one
    // non-empty. This is deliberately separate from mergedValid below: a valid:false caused ONLY
    // by needsComponentDetail entries that the drill-down subsequently confirms must still resolve
    // to a clean cycle, not get stuck re-asserting the model's now-stale self-report.
    const rawHasOpenItems = result.findings.length > 0 || (result.needsComponentDetail || []).length > 0
    if (result.valid === rawHasOpenItems) {
      throw new Error(`Validation agent returned a contradictory result on cycle ${cycle}: valid=${result.valid} with ${result.findings.length} finding(s) and ${(result.needsComponentDetail || []).length} needsComponentDetail entry(ies)`)
    }

    // BR-04: merge everything. A model returning valid:true while the host's own independent
    // checks found a real gap is not a self-contradiction (it was never shown that gap) — it is
    // simply now-invalid, same as any other unresolved finding.
    const newFindings = [...structuralFindings, ...extraFindings, ...drillDownFindings]
    const mergedFindings = [...result.findings, ...newFindings]
    // Deliberately NOT `result.valid && ...`: result.valid may be false solely because of
    // needsComponentDetail entries the drill-down above has now fully confirmed (zero
    // drillDownFindings) — the only authoritative signal for the final verdict is whether any
    // finding remains, from any source, after every check this cycle has run.
    const mergedValid = mergedFindings.length === 0
    const mergedNeedsTechSpecFix = result.needsTechSpecFix || newFindings.some(f => f.startsWith('Tech-Spec:'))
    const mergedNeedsRequirementsFix = result.needsRequirementsFix || newFindings.some(f => f.startsWith('Requirements:'))

    // c.worker() already wrote result.report verbatim via its own outputs[0] contract; only
    // overwrite it when this cycle actually added findings the LLM's own report text doesn't
    // mention — the common clean case (newFindings.length === 0) never re-writes the file.
    if (newFindings.length) {
      c.write(file('Validation-Report'), result.report +
        '\n\n## Additional findings (deterministic + component-detail drill-down)\n' +
        newFindings.map(f => `- ${f}`).join('\n') + '\n')
    }
    if (mergedValid) {
      if (!fresh(file('Validation-Report'), [featurePath, reqIndexPath, specIndexPath])) throw new Error('Validation agent did not produce its report')
      validationSummary = `0 gaps (clean on cycle ${cycle})`
      break
    }
    if (cycle === 3) throw new Error('Validation gaps remain after 3 cycles')
    if (!mergedNeedsRequirementsFix && !mergedNeedsTechSpecFix) throw new Error(`Validation agent reported gaps on cycle ${cycle} but flagged neither document for revision`)
    if (mergedNeedsRequirementsFix) { await generateRequirements(true); assembledRequirements = assembleRequirements() }
    if (mergedNeedsTechSpecFix) { await generateTechSpec(true); assembledTechSpec = assembleTechSpec() }
  }
}
```

`docsDigest` (`pm-phase1.js:475`, after the loop) is untouched:

```js
const docsDigest = c.hash(assembledRequirements + '\u0000' + assembledTechSpec)
```

Both operands are still the full, unreduced output of `assembleRequirements()`/`assembleTechSpec()`
— computed exactly as today, just no longer the same strings handed to the validator's own prompt.

## Tests

See `components/workflow-runtime.test.js.md` for the full list of new integration tests
(AC-01 through AC-13). This file's own existing unit-level guard tests (none currently assert the
exact validator-prompt-construction line) gain no new assertion beyond what the integration suite
already covers end-to-end — the prior features in this lineage (FTR-025, FTR-027) established that
`pm-phase1.js`'s validation/resume logic is tested via `tests/integration/workflow-runtime.test.js`
exercising the real sandboxed script, not a parallel unit mirror, since the file has no `require()`
boundary to mock around at the unit level for this kind of control-flow change.
