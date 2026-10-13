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
  // A long single-turn response (a feature complex enough to need many Use
  // Cases/sections) can exceed the model's configured output-token ceiling
  // mid-reply — confirmed against a real run where the CLI reported a clean
  // exit (exitCode 0, is_error false, stop_reason "end_turn") with nothing in
  // the response envelope signaling that anything was cut off. Only the
  // document's own expected structure can catch this. Both Requirements (9
  // top-level sections) and Tech-Spec (12) have a fixed, numbered skeleton
  // (see their own agent definitions' "Output Structure"), so a missing
  // "## N. " heading is a reliable, deterministic sign of truncation.
  // Checked both right after generation (fail fast with an attributable
  // error, not a silently-accepted half-document) and as part of the
  // freshness test (so a previously truncated file left on disk from an
  // earlier failed run is never mistaken for "fresh enough" on a later resume).
  const missingSections = (content, count) => Array.from({ length: count }, (_, i) => i + 1).filter(n => !new RegExp(`^## ${n}\\.\\s`, 'm').test(content))
  const assertCompleteSections = (label, content, count) => {
    const missing = missingSections(content, count)
    if (missing.length) throw new Error(`${label} output is incomplete: missing section(s) ${missing.join(', ')} of ${count} — likely truncated mid-generation (a model output-length ceiling was probably exceeded)`)
  }
  const reqId = 'gaia.agent.planner.requirements'
  const specId = 'gaia.agent.planner.tech-spec'
  const valId = 'gaia.agent.planner.validate-feature-docs'
  const output = (suffix, inputs = [featurePath]) => ({ path: file(suffix), inputs })
  const requirements = () => c.worker(reqId, featurePath, { outputs: [output('Requirements')] })
  const techSpec = () => c.worker(specId, featurePath, { outputs: [output('Tech-Spec', [featurePath, file('Requirements')])] })
  let changed = false
  if (force || !fresh(file('Requirements')) || missingSections(c.read(file('Requirements')), 9).length) {
    await requirements()
    if (!c.exists(file('Requirements'))) throw new Error('Requirements output missing')
    assertCompleteSections('Requirements', c.read(file('Requirements')), 9)
    changed = true
  }
  if (force || changed || !fresh(file('Tech-Spec'), [featurePath, file('Requirements')]) || missingSections(c.read(file('Tech-Spec')), 12).length) {
    await techSpec()
    if (!c.exists(file('Tech-Spec'))) throw new Error('Tech-Spec output missing')
    assertCompleteSections('Tech-Spec', c.read(file('Tech-Spec')), 12)
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
