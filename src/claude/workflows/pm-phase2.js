export const meta = {
  controlPlaneVersion: 1,
  name: 'pm-phase2',
  description: 'Generate, validate and render a work breakdown with deterministic control-plane operations.',
  phases: [{ title: 'Work Breakdown' }, { title: 'Effort Estimate' }],
}



const c = control
const { featurePath, featureDir, prefix } = c.feature(args[0])
return c.run(meta.name, featureDir, prefix, async () => {
  const file = suffix => `${featureDir}/${prefix}-${suffix}`
  const approvals = c.read(file('Approvals.md'))
  const gate = approvals.match(/^## Gate 1\b[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)
  if (!gate || !/✅\s*Approved/.test(gate[1])) throw new Error('Gate 1 approval evidence missing')
  // Binds this approval to the EXACT Requirements/Tech-Spec content pm-phase1
  // produced when it was approved (docs_digest, written into Approvals.md by
  // SKILL.md's Step 2) — never just "a Gate 1 row says Approved". A missing
  // digest (an approval recorded before this check existed) is not enforced,
  // same null-compatible "unavailable, never fabricated" convention used
  // throughout this toolkit; a PRESENT digest that no longer matches the
  // current files fails closed — the approved documents changed since
  // approval (e.g. a later --force re-run of pm-phase1) and must be
  // re-approved, not silently carried forward on stale consent.
  const digestMatch = gate[1].match(/\*\*Docs Digest:\*\*\s*`([^`]+)`/)
  if (digestMatch) {
    const currentDigest = c.hash(c.read(file('Requirements.md')) + '\u0000' + c.read(file('Tech-Spec.md')))
    if (digestMatch[1] !== currentDigest) {
      throw new Error('Gate 1 approval is stale: Requirements/Tech-Spec content no longer matches what was approved (docs digest mismatch) — re-approve Gate 1 before proceeding')
    }
  }
  const jsonPath = file('Work-Breakdown.json')
  await c.worker('gaia.agent.planner.work-breakdown', featurePath, {
    outputs: [{ path: jsonPath, inputs: [featurePath, file('Requirements.md'), file('Tech-Spec.md')] }],
  })
  const report = await c.activity('wb-validate', async () => {
    const res = c.command(['run-asset', 'scripts/wb-validate.js', '--project', c.root,
      '--', jsonPath, file('Requirements.md')], [0, 1])
    const parsed = JSON.parse(res.stdout)
    if (typeof parsed.valid !== 'boolean' || !Array.isArray(parsed.errors) ||
        !Array.isArray(parsed.warnings) || (res.exitCode === 0) !== parsed.valid) throw new Error('Invalid validator result')
    if (!parsed.valid || parsed.errors.length) throw new Error('Work breakdown structural validation failed: ' + res.stdout)
    return parsed
  })
  const semantic = await c.worker('gaia.agent.planner.validate-work-breakdown',
    `${jsonPath}\n${file('Requirements.md')}`, { schema: {
      type: 'object', properties: { valid: { type: 'boolean' }, findings: { type: 'array' } }, required: ['valid', 'findings'],
    } })
  if (!semantic.valid || semantic.findings.some(f => f.blocking)) throw new Error('Work breakdown semantic validation failed')
  const rendered = await c.activity('wb-render', async () => {
    const result = c.command(['run-asset', 'scripts/wb-render.js', '--project', c.root, '--', jsonPath, prefix])
    const markdownPath = file('Work-Breakdown.md'), csvPath = file('Work-Breakdown.csv')
    if (!c.exists(markdownPath) || !c.exists(csvPath)) throw new Error('Renderer outputs missing')
    // Read the actual bytes now: unreadable output must never produce an approved gate.
    c.read(markdownPath); c.read(csvPath)
    return { ...result, markdownPath, csvPath, markdownExists: true, csvExists: true }
  })
  const metrics = await c.estimates(featureDir, prefix, c.json(jsonPath))
  c.append(file('process-log.txt'), `[${new Date().toISOString()}] pm-phase2 complete; Gate 2 approval requested\n`)
  return {
    ...metrics, feature_path: featurePath, token_ledger: c.tokenLedger, errors: [],
    gate2_payload: {
      js_validator_report: report, js_validator_failed: false,
      semantic_validator_result: semantic, semantic_validator_failed: false,
      renderer_result: rendered, renderer_failed: false, gate2_blocked: false,
      duration_bands: report.durationBands, domain_distribution: report.domainDistribution,
      warning_band_tasks: report.warnings.filter(w => w.category === 'duration_warning').map(w => ({ taskId: w.taskId, agentMinutes: w.details?.agentMinutes })),
      split_required_tasks: [], must_ac_uncovered: [], phase_unschedulable: [],
    },
  }
})
