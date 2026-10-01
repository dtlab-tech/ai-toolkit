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
      const result = await c.worker(valId, featurePath + '\nValidate only; the host owns the revision loop. Return valid, a findings array (one string per remaining gap), and the full validation report content. Do not dispatch other agents.', { label: `validation:${cycle}`, outputs: [output('Validation-Report', [featurePath, file('Requirements'), file('Tech-Spec')])], schema: { type: 'object', properties: { valid: { type: 'boolean' }, findings: { type: 'array', items: { type: 'string' } }, report: { type: 'string' } }, required: ['valid', 'findings', 'report'] } })
      const text = result.findings.join('\n')
      if (result.valid && result.findings.length === 0) {
        if (!fresh(file('Validation-Report'), [featurePath, file('Requirements'), file('Tech-Spec')])) throw new Error('Validation agent did not produce its report')
        validationSummary = `0 gaps (clean on cycle ${cycle})`
        break
      }
      if (cycle === 3) throw new Error('Validation gaps remain after 3 cycles')
      if (!text.includes('Tech-Spec') || text.includes('Requirements')) await requirements()
      if (!text.includes('Requirements') || text.includes('Tech-Spec')) await techSpec()
    }
  }
  c.append(`${featureDir}/${prefix}-process-log.txt`, `[${new Date().toISOString()}] pm-phase1: ${validationSummary}; Gate 1 approval requested\n`)
  return {
    prefix, feature_dir: featureDir, feature_path: featurePath,
    requirements: { path: file('Requirements'), summary: 'Requirements ready' },
    tech_spec: { path: file('Tech-Spec'), summary: 'Tech-Spec ready' },
    validation: { path: file('Validation-Report'), summary: validationSummary },
    token_ledger: c.tokenLedger, errors: [],
  }
})
