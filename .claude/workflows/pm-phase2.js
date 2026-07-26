export const meta = {
  name: 'pm-phase2',
  description: 'Feature delivery phase 2: generate-work-breakdown → Effort-Estimate → gate2_payload. Precondition: Gate 1 approved.',
  phases: [
    { title: 'Work Breakdown', detail: 'Run generate-work-breakdown' },
    { title: 'Effort Estimate', detail: 'Parse WB metrics, write Effort-Estimate.md' },
  ],
}

// args: "<path-to-feature.md>"
const featurePath = (typeof args === 'string' ? args : '').trim().split(/\s+/)[0]

// ── generate-work-breakdown ───────────────────────────────────────────────────
phase('Work Breakdown')

const tokenLedger = []

log(`Running generate-work-breakdown for ${featurePath}`)
const beforeWB = budget.spent()
await agent(featurePath, {
  agentType: 'generate-work-breakdown',
  label:     'generate-work-breakdown',
  phase:     'Work Breakdown',
})
const wbTokens = budget.spent() - beforeWB
tokenLedger.push({ agent: 'generate-work-breakdown', model: 'haiku', phase_delta_tokens: wbTokens })
log(`generate-work-breakdown done — phase delta: ${wbTokens} tokens`)

// ── Parse WB + write Effort-Estimate ─────────────────────────────────────────
phase('Effort Estimate')

const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    prefix:                { type: 'string' },
    feature_dir:           { type: 'string' },
    user_stories:          { type: 'number' },
    total_tasks:           { type: 'number' },
    domain_breakdown:      { type: 'string' },
    implementation_phases: { type: 'number' },
    human_estimate:        { type: 'string' },
    agent_estimate:        { type: 'string' },
    work_breakdown_path:   { type: 'string' },
    effort_estimate_path:  { type: 'string' },
  },
  required: ['prefix', 'user_stories', 'total_tasks', 'work_breakdown_path'],
}

const metrics = await agent(
  `You have two tasks:

TASK 1 — Read the Work Breakdown file.
The feature.md is at: ${featurePath}
The directory containing feature.md also contains the Work Breakdown file named {PREFIX}-Work-Breakdown.md,
where PREFIX matches the pattern [A-Z]+-[0-9]+ from the directory name (e.g. FTR-009).
Use Glob or Read to find and read that file.

Extract from the Summary table:
- prefix (e.g. "FTR-009")
- feature_dir (directory containing feature.md)
- user_stories (integer)
- total_tasks (integer)
- domain_breakdown (e.g. "DB:0, BE:11, FE:0, INFRA:4, TEST:0")
- implementation_phases (integer)
- human_estimate (e.g. "~34h")
- agent_estimate (e.g. "~2h 6min")
- work_breakdown_path (full path to the Work Breakdown file)

TASK 2 — Write the Effort-Estimate.md file.
Write {feature_dir}/{PREFIX}-Effort-Estimate.md with the extracted metrics in this format:

# Effort Estimate — {PREFIX} — {Feature Title}

| Metric | Value |
|--------|-------|
| User Stories | {user_stories} |
| Total tasks | {total_tasks} ({domain_breakdown}) |
| Implementation phases | {implementation_phases} |
| Human estimate | {human_estimate} (sequential, no parallelism) |
| Agent estimate | {agent_estimate} (parallel dispatch, critical path only) |

Set effort_estimate_path to the full path of the written file.

Return the extracted metrics as structured output.`,
  {
    label:  'parse-wb-write-effort-estimate',
    phase:  'Effort Estimate',
    schema: PARSE_SCHEMA,
  }
)

log(`WB parsed: ${metrics.user_stories} US, ${metrics.total_tasks} tasks, ${metrics.implementation_phases} phases`)
log(`Effort-Estimate written: ${metrics.effort_estimate_path}`)

return {
  prefix:                metrics.prefix,
  feature_path:          featurePath,
  user_stories:          metrics.user_stories,
  total_tasks:           metrics.total_tasks,
  domain_breakdown:      metrics.domain_breakdown  || 'N/A',
  implementation_phases: metrics.implementation_phases,
  human_estimate:        metrics.human_estimate    || 'N/A',
  agent_estimate:        metrics.agent_estimate    || 'N/A',
  work_breakdown_path:   metrics.work_breakdown_path,
  effort_estimate_path:  metrics.effort_estimate_path || '',
  token_ledger:          tokenLedger,
  errors:                [],
}
