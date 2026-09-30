export const meta = {
  controlPlaneVersion: 1,
  name: 'am-phase2',
  description: 'Record explicit Findings Gate acknowledgement and registry deterministically.',
  phases: [{ title: 'Approvals' }, { title: 'Registry' }],
}
const c = control
const option = key => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1] }
const prefix = option('--prefix'), ack = option('--ack'), flagged = option('--flagged')
if (!/^ASSESS-\d+$/.test(prefix || '') || !ack?.trim() || flagged == null) throw new Error('Explicit prefix, acknowledgement and flagged selection required')
const outputDir = option('--output-dir') || `docs/assessments/${prefix}`
return c.run(meta.name, outputDir, prefix, async () => c.recordAssessmentApproval(outputDir, prefix, ack, flagged))
