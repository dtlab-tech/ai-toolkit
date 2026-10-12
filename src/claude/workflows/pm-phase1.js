export const meta = {
  controlPlaneVersion: 1,
  name: 'pm-phase1',
  description: 'Deterministic documentation workflow; returns Gate 1 evidence.',
  phases: [{ title: 'Discovery' }, { title: 'Requirements' }, { title: 'Tech-Spec' }, { title: 'Validation' }],
}

const c = control
const { featurePath, featureDir, prefix } = c.feature(args[0])
const force = args.includes('--force')
return c.run(meta.name, featureDir, prefix, async () => {
  const file = suffix => `${featureDir}/${prefix}-${suffix}.md`
  const fresh = (output, inputs = [featurePath]) => c.exists(output) && c.read(output).trim().length > 0 && inputs.every(input => c.exists(input) && c.mtime(output) >= c.mtime(input))
  const reqId = 'gaia.agent.planner.requirements'
  const specId = 'gaia.agent.planner.tech-spec'
  const valId = 'gaia.agent.planner.validate-feature-docs'
  const output = (suffix, inputs = [featurePath]) => ({ path: file(suffix), inputs })
  const requirements = () => c.worker(reqId, featurePath, { outputs: [output('Requirements')] })
  const techSpec = () => c.worker(specId, featurePath, { outputs: [output('Tech-Spec', [featurePath, file('Requirements')])] })
  let changed = false
  if (force || !fresh(file('Requirements'))) {
    await requirements()
    if (!c.exists(file('Requirements'))) throw new Error('Requirements output missing')
    changed = true
  }
  if (force || changed || !fresh(file('Tech-Spec'), [featurePath, file('Requirements')])) {
    await techSpec()
    if (!c.exists(file('Tech-Spec'))) throw new Error('Tech-Spec output missing')
    changed = true
  }
  let validationSummary = 'skipped (fresh)'
  if (force || changed || !fresh(file('Validation-Report'), [featurePath, file('Requirements'), file('Tech-Spec')])) {
    for (let cycle = 1; cycle <= 3; cycle++) {
      // needsRequirementsFix/needsTechSpecFix: explicit structured routing fields,
      // not inferred by substring-matching the free-text `findings` array (which a
      // finding mentioning both document names, or neither, would mis-route or
      // silently skip). The validator agent itself decides which document(s) its
      // own findings implicate.
      const result = await c.worker(valId, featurePath + '\nValidate only; the host owns the revision loop. Return valid, a findings array (one string per remaining gap), needsRequirementsFix/needsTechSpecFix (true only if at least one finding implicates that document), and the full validation report content. Do not dispatch other agents.', { label: `validation:${cycle}`, outputs: [output('Validation-Report', [featurePath, file('Requirements'), file('Tech-Spec')])], schema: { type: 'object', properties: { valid: { type: 'boolean' }, findings: { type: 'array', items: { type: 'string' } }, needsRequirementsFix: { type: 'boolean' }, needsTechSpecFix: { type: 'boolean' }, report: { type: 'string' } }, required: ['valid', 'findings', 'needsRequirementsFix', 'needsTechSpecFix', 'report'] } })
      // A model returning valid:true alongside non-empty findings (or valid:false
      // with none) contradicts its own schema's intent — never silently treated as
      // "not clean yet" and spent on another cycle without surfacing the
      // inconsistency; fail closed instead of masking a confused response.
      if (result.valid === (result.findings.length > 0)) {
        throw new Error(`Validation agent returned a contradictory result on cycle ${cycle}: valid=${result.valid} with ${result.findings.length} finding(s)`)
      }
      if (result.valid) {
        if (!fresh(file('Validation-Report'), [featurePath, file('Requirements'), file('Tech-Spec')])) throw new Error('Validation agent did not produce its report')
        validationSummary = `0 gaps (clean on cycle ${cycle})`
        break
      }
      if (cycle === 3) throw new Error('Validation gaps remain after 3 cycles')
      if (!result.needsRequirementsFix && !result.needsTechSpecFix) throw new Error(`Validation agent reported gaps on cycle ${cycle} but flagged neither document for revision`)
      if (result.needsRequirementsFix) await requirements()
      if (result.needsTechSpecFix) await techSpec()
    }
  }
  // Binds Gate 1's eventual approval to the EXACT Requirements/Tech-Spec bytes
  // produced here, not just "a file named *-Requirements.md exists" — SKILL.md's
  // Step 2 embeds this verbatim into Approvals.md, and pm-phase2.js's Gate 1 check
  // fails closed if the current file content no longer matches it (content
  // regenerated after approval, e.g. via a later --force run, must re-approve).
  const docsDigest = c.hash(c.read(file('Requirements')) + '\u0000' + c.read(file('Tech-Spec')))
  c.append(`${featureDir}/${prefix}-process-log.txt`, `[${new Date().toISOString()}] pm-phase1: ${validationSummary}; Gate 1 approval requested\n`)
  return {
    prefix, feature_dir: featureDir, feature_path: featurePath,
    requirements: { path: file('Requirements'), summary: 'Requirements ready' },
    tech_spec: { path: file('Tech-Spec'), summary: 'Tech-Spec ready' },
    validation: { path: file('Validation-Report'), summary: validationSummary },
    docs_digest: docsDigest,
    token_ledger: c.tokenLedger, errors: [],
  }
})
