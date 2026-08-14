export const meta = {
  name: 'am-phase1',
  description: 'Assessment pipeline phase 1: discover assessment agents → scope filter → parallel assessment → intervention-documentation-standard → Token-Estimate → Effort-Estimate → findings_gate_payload.',
  phases: [
    { title: 'Discovery',      detail: 'Run ai-toolkit list-assets --category agents --format json, apply scope filter' },
    { title: 'Assessment',     detail: 'Dispatch all assessment agents in parallel' },
    { title: 'Interventions',  detail: 'Run intervention-documentation-standard on all findings' },
    { title: 'Estimates',      detail: 'Write Token-Estimate and Effort-Estimate files' },
  ],
}

// args: "<target_path> [--scope=area1,area2] --prefix ASSESS-NNN [--force]"
const argStr    = typeof args === 'string' ? args : '.'
const parts     = argStr.trim().split(/\s+/)

let targetPath  = '.'
let scope       = null
let prefix      = null
let force       = false

for (const part of parts) {
  if (part.startsWith('--scope='))   { scope  = part.slice('--scope='.length).split(',').map(s => s.trim()) }
  else if (part === '--force')        { force  = true }
  else if (part === '--prefix')       { /* next part is value */ }
  else if (prefix === null && parts[parts.indexOf(part) - 1] === '--prefix') { prefix = part }
  else if (!part.startsWith('--'))   { targetPath = part }
}

// Re-parse prefix properly
const prefixMatch = argStr.match(/--prefix\s+(\S+)/)
if (prefixMatch) prefix = prefixMatch[1]

if (!prefix) prefix = 'ASSESS-001'

const outputDir = `docs/assessments/${prefix}`

// ── Discovery ─────────────────────────────────────────────────────────────────
phase('Discovery')

const DISCOVERY_SCHEMA = {
  type: 'object',
  properties: {
    assessment_agents: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name:        { type: 'string' },
          description: { type: 'string' },
        },
        required: ['name'],
      },
    },
  },
  required: ['assessment_agents'],
}

const SCOPE_AGENT_MAP = {
  architecture:   ['layered-architecture-assessment'],
  security:       ['security-hardening'],
  quality:        ['generic-software-assessment'],
  concurrency:    ['concurrency-safety-assessment'],
  devops:         [],
  'domain-model': ['domain-model-refactoring'],
  dependencies:   ['dependency-supply-chain-security'],
}

const discovery = await agent(
  `Run this command and parse its output:\n` +
  `ai-toolkit list-assets --category agents --format json\n\n` +
  `The command outputs a JSON array of installed agent file paths (e.g. [".claude/agents/foo.md", ...]).\n` +
  `For each path in the array, read the file and extract the YAML frontmatter fields: name, description.\n\n` +
  `An assessment agent is one whose file name or description contains one of: "assessment", "audit", "analysis".\n` +
  `Exclude orchestrators (files containing "manager" in their name).\n` +
  `Exclude remediation-only agents (files containing "refactoring", "hardening", "decomposition" in their name UNLESS they also contain "assessment" or "audit").\n\n` +
  `Return { "assessment_agents": [ { "name": "...", "description": "..." }, ... ] }`,
  {
    label:  'discover-assessment-agents',
    phase:  'Discovery',
    schema: DISCOVERY_SCHEMA,
  }
)

let assessmentAgents = discovery.assessment_agents || []

// Apply scope filter
if (scope && scope.length > 0) {
  const allowed = new Set(scope.flatMap(s => SCOPE_AGENT_MAP[s] || []))
  assessmentAgents = assessmentAgents.filter(a => allowed.has(a.name))
  log(`Scope filter applied (${scope.join(', ')}): ${assessmentAgents.length} agents selected`)
} else {
  log(`No scope filter: ${assessmentAgents.length} assessment agents discovered`)
}

if (assessmentAgents.length === 0) {
  log('WARNING: No assessment agents to run — proceeding with empty assessment')
}

// ── Assessment (parallel) ─────────────────────────────────────────────────────
phase('Assessment')

log(`Dispatching ${assessmentAgents.length} assessment agents in parallel`)

const tokenLedger   = []
const beforeAssess  = budget.spent()

const assessmentResults = await parallel(
  assessmentAgents.map(a => () =>
    agent(
      `${targetPath} --prefix ${prefix} --output-dir ${outputDir}`,
      {
        agentType: a.name,
        label:     a.name,
        phase:     'Assessment',
      }
    ).then(result => ({ agent: a.name, success: true,  result }))
     .catch(err   => ({ agent: a.name, success: false, error: String(err) }))
  )
)

const assessTokens = budget.spent() - beforeAssess
log(`Assessment phase complete — ${assessmentResults.filter(r => r?.success).length}/${assessmentAgents.length} succeeded | total phase delta: ${assessTokens} tokens`)

// Proportional token distribution across agents
const perAgentTokens = assessmentAgents.length > 0
  ? Math.round(assessTokens / assessmentAgents.length)
  : 0

for (const r of assessmentResults.filter(Boolean)) {
  tokenLedger.push({
    agent:              r.agent,
    model:              'sonnet',
    phase_delta_tokens: perAgentTokens,
    note:               'proportional distribution of assessment phase total',
    success:            r.success,
    error:              r.error || null,
  })
}

const failedAgents    = assessmentResults.filter(r => r && !r.success)
const completedAgents = assessmentResults.filter(r => r &&  r.success)

// ── Interventions ─────────────────────────────────────────────────────────────
phase('Interventions')

log('Running intervention-documentation-standard')

const beforeInt = budget.spent()
await agent(
  `--prefix ${prefix} --output-dir ${outputDir} --target ${targetPath}`,
  {
    agentType: 'intervention-documentation-standard',
    label:     'intervention-documentation-standard',
    phase:     'Interventions',
  }
)
const intTokens = budget.spent() - beforeInt
tokenLedger.push({
  agent:              'intervention-documentation-standard',
  model:              'sonnet',
  phase_delta_tokens: intTokens,
  note:               'exact phase delta',
})
log(`intervention-documentation-standard done — phase delta: ${intTokens} tokens`)

// ── Estimates ─────────────────────────────────────────────────────────────────
phase('Estimates')

const ESTIMATES_SCHEMA = {
  type: 'object',
  properties: {
    severity_counts: {
      type: 'object',
      properties: {
        CRITICAL: { type: 'number' },
        HIGH:     { type: 'number' },
        MEDIUM:   { type: 'number' },
        LOW:      { type: 'number' },
      },
    },
    total_interventions:      { type: 'number' },
    interventions_index_path: { type: 'string' },
    token_estimate_path:      { type: 'string' },
    effort_estimate_path:     { type: 'string' },
    remediation_hours_est:    { type: 'number' },
  },
  required: ['severity_counts', 'total_interventions'],
}

const totalPhaseTokens = tokenLedger.reduce((s, e) => s + (e.phase_delta_tokens || 0), 0)

const estimatesResult = await agent(
  `You are the estimates recorder for the assessment pipeline.

Prefix: ${prefix}
Output directory: ${outputDir}
Assessment agents that ran: ${assessmentAgents.map(a => a.name).join(', ') || 'none'}
Failed agents: ${failedAgents.map(r => r.agent).join(', ') || 'none'}

Token ledger (phase-level measurements):
${JSON.stringify(tokenLedger, null, 2)}

TASK 1 — Read ${prefix}-Interventions-Index.md from ${outputDir}.
Count rows by Criticality column: CRITICAL, HIGH, MEDIUM, LOW.
Compute remediation_hours_est = CRITICAL×8 + HIGH×4 + MEDIUM×2 + LOW×1.

TASK 2 — Write Token-Estimate file at ${outputDir}/${prefix}-Token-Estimate.md.

Use this template (fill in all values):

# Token Estimate — ${prefix} — Assessment Pipeline

> Phase totals are exact measurements from budget tracking.
> Per-agent values within the assessment phase are proportional distributions of the phase total.
> Pricing model: docs/pricing.md (80% input / 20% output split).
> ⚠️ Per-agent values marked (proportional) are estimated distributions, not exact measurements.

## Estimation model

| Parameter | Value |
|-----------|-------|
| Avg chars per token | 4 |
| Sonnet system prompt | ~3,000 tokens |
| Base overhead per call | ~5,000 tokens |
| Input/output split | 80% / 20% |

## Assessment agents (Phase 1)

| Agent | Model | Phase delta tokens | Note | Status |
|-------|-------|--------------------|------|--------|
{one row per agent from token ledger — use phase_delta_tokens and note fields}

## Phase subtotals

| Phase | Tokens (exact) |
|-------|---------------|
| Assessment agents (parallel) | {sum of assessment agent phase_delta_tokens} |
| intervention-documentation-standard | {its phase_delta_tokens} |
| Total am-phase1 | ${totalPhaseTokens} |

## Grand total

> Updated at pipeline end by assess-codebase skill.

| Metric | Value |
|--------|-------|
| Total tokens (am-phase1) | ${totalPhaseTokens} (exact) |

TASK 3 — Write Effort-Estimate file at ${outputDir}/${prefix}-Effort-Estimate.md.

Use this template:

# Effort Estimate — ${prefix} — Assessment Pipeline

> Wall-clock effort tracking for the assessment pipeline.
> Remediation effort: CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h (human hours, sequential).

## Assessment phase

| Agent | Status |
|-------|--------|
{one row per assessment agent}
| intervention-documentation-standard | complete |

## Remediation effort estimate

| Severity | Count | Rate | Subtotal |
|----------|-------|------|---------|
| CRITICAL | {count} | 8h | {subtotal}h |
| HIGH | {count} | 4h | {subtotal}h |
| MEDIUM | {count} | 2h | {subtotal}h |
| LOW | {count} | 1h | {subtotal}h |
| **Total** | **{total}** | — | **{total_hours}h** |

Human sequential total: {total_hours}h

Return the structured metrics.`,
  {
    label:  'write-estimates',
    phase:  'Estimates',
    schema: ESTIMATES_SCHEMA,
  }
)

log(`Estimates written — ${estimatesResult.total_interventions} interventions: CRITICAL=${estimatesResult.severity_counts?.CRITICAL} HIGH=${estimatesResult.severity_counts?.HIGH} MEDIUM=${estimatesResult.severity_counts?.MEDIUM} LOW=${estimatesResult.severity_counts?.LOW}`)
log(`Remediation estimate: ${estimatesResult.remediation_hours_est}h human sequential`)

return {
  prefix,
  output_dir:              outputDir,
  target_path:             targetPath,
  assessment_summaries:    completedAgents.map(r => ({ agent: r.agent })),
  interventions_index_path: estimatesResult.interventions_index_path || `${outputDir}/${prefix}-Interventions-Index.md`,
  severity_counts:         estimatesResult.severity_counts  || { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
  total_interventions:     estimatesResult.total_interventions || 0,
  remediation_hours_est:   estimatesResult.remediation_hours_est || 0,
  effort_estimate_path:    estimatesResult.effort_estimate_path || `${outputDir}/${prefix}-Effort-Estimate.md`,
  token_estimate_path:     estimatesResult.token_estimate_path  || `${outputDir}/${prefix}-Token-Estimate.md`,
  token_ledger:            tokenLedger,
  errors:                  failedAgents.map(r => ({ agent: r.agent, error: r.error })),
}
