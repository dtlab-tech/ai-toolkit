export const meta = {
  controlPlaneVersion: 1,
  name: 'am-phase1',
  description: 'Read-only assessment using verified assessors and deterministic artifact recording.',
  phases: [{ title: 'Discovery' }, { title: 'Assessment' }, { title: 'Interventions' }, { title: 'Estimates' }],
}

const c = control
const option = key => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1] }
const prefix = option('--prefix')
if (!/^ASSESS-\d+$/.test(prefix || '')) throw new Error('Explicit ASSESS-NNN prefix required')
const targetPath = args[0] && !args[0].startsWith('--') ? args[0] : '.'
const scopeArg = args.find(a => a.startsWith('--scope='))
const scope = scopeArg ? scopeArg.slice(8).split(',') : ['quality', 'architecture', 'concurrency']
const SCOPE_AGENT_MAP = {
  architecture: 'gaia.agent.assessment.layered-architecture',
  concurrency: 'gaia.agent.assessment.concurrency',
  quality: 'gaia.agent.assessment.generic',
  security: 'gaia.agent.assessment.generic',
  devops: 'gaia.agent.assessment.generic',
  'domain-model': 'gaia.agent.assessment.generic',
  dependencies: 'gaia.agent.assessment.generic',
}
for (const area of scope) if (!Object.hasOwn(SCOPE_AGENT_MAP, area)) throw new Error('Unknown assessment scope: ' + area)
const outputDir = `docs/assessments/${prefix}`
return c.run(meta.name, outputDir, prefix, async () => {
  const groups = new Map()
  for (const area of scope) {
    const id = SCOPE_AGENT_MAP[area]
    groups.set(id, [...(groups.get(id) || []), area])
  }
  // Neither assessor below has a Write tool: each returns its report as plain response
  // text, which the host persists to its declared `outputs` path (see worker()'s own
  // comment in lib/workflow-control.js for why — "Never ask an LLM to do I/O").
  const assessmentResults = await c.parallel([...groups].map(([id, areas]) => async () => {
    const suffix = { 'gaia.agent.assessment.generic': 'Generic', 'gaia.agent.assessment.layered-architecture': 'Layer', 'gaia.agent.assessment.concurrency': 'Concurrency' }[id]
    const output_file = `${outputDir}/${prefix}-${suffix}-Assessment.md`
    const result = await c.worker(id,
      `${targetPath} --prefix ${prefix} --output-dir ${outputDir}\n` +
      `Read-only assessment. Explicit scope: ${areas.join(', ')}. Inspect risks, evidence, severity and recommendations for EACH listed scope. ` +
      'For security inspect trust boundaries and authorization; devops: build/deploy/observability; domain-model: invariants and ownership; dependencies: versions, provenance and supply-chain risks. ' +
      'Do not remediate code or dispatch remediation agents. Return your assessment report as your final response.',
      { outputs: [{ path: output_file }] })
    return { agent: id, scopes: areas, result, output_file }
  }))
  // intervention-documentation-standard writes a variable number of files (one per
  // intervention plus an index) whose names it decides itself, so it cannot use the
  // single static `outputs` contract above — it declares each {path, content} pair in
  // its own structured_output, and the host validates and persists every one of them.
  const docs = await c.worker('gaia.agent.assessment.intervention-documentation',
    `--prefix ${prefix} --output-dir ${outputDir} --target ${targetPath}\nUse only the reports from these assessors: ${[...groups.keys()].join(', ')}.\n` +
    assessmentResults.map(r => `${r.agent}: ${typeof r.result === 'string' ? r.result : JSON.stringify(r.result)}`).join('\n'),
    { schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } }, required: ['files'] } })
  if (!docs.files.length) throw new Error('Intervention documentation produced no files')
  for (const f of docs.files) {
    if (!f.path || /[\\/]/.test(f.path) || f.path.includes('..')) throw new Error('Invalid intervention document path: ' + f.path)
    if (!f.content || !f.content.trim()) throw new Error('Empty intervention document: ' + f.path)
    c.writeOutput(`${outputDir}/${f.path}`, f.content)
  }
  const metrics = c.assessmentEstimates(outputDir, prefix)
  return { prefix, output_dir: outputDir, target_path: targetPath,
    assessment_summaries: assessmentResults.map(({ agent, scopes, output_file }) => ({ agent, scopes, output_file })),
    ...metrics, token_ledger: c.tokenLedger, errors: [] }
})
