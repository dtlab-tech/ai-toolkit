export const meta = {
  name: 'pm-phase1',
  description: 'Feature delivery phase 1: discovery → generate-requirements → generate-tech-spec → validate-feature-docs (revision loop) → Effort-Estimate stub. Returns gate1_payload.',
  phases: [
    { title: 'Discovery', detail: 'Read feature.md, check existing outputs' },
    { title: 'Requirements', detail: 'Run generate-requirements' },
    { title: 'Tech-Spec', detail: 'Run generate-tech-spec' },
    { title: 'Validation', detail: 'Run validate-feature-docs (revision loop, max 3×)' },
  ],
}

// ── Parse args ────────────────────────────────────────────────────────────────
// args is the raw prompt string: "<path-to-feature.md> [--force]"
const featurePath = args.split(/\s+/)[0]
const force       = typeof args === 'string' && args.includes('--force')

// ── Discovery ─────────────────────────────────────────────────────────────────
phase('Discovery')

const discoveryResult = await agent(
  `You are a discovery agent for the feature delivery pipeline.

Read the feature.md file at: ${featurePath}

Extract:
1. The feature PREFIX from the directory name (pattern [A-Z]+-[0-9]+, e.g. FTR-009)
2. The feature directory path (parent of feature.md)
3. Whether these files exist and are NOT stale vs feature.md (stale = older mtime):
   - {PREFIX}-Requirements.md
   - {PREFIX}-Tech-Spec.md
   - {PREFIX}-Validation-Report.md

Return a JSON object:
{
  "prefix": "FTR-009",
  "feature_dir": "internal_docs/features/FTR-009-workflow-orchestrators",
  "needs_requirements": true,
  "needs_tech_spec": true,
  "needs_validation": true,
  "force": ${force}
}

If force=true, set all needs_* to true regardless of file state.
If feature.md does not exist, return { "error": "feature.md not found: ${featurePath}" }.`,
  {
    label: 'discovery',
    phase: 'Discovery',
    schema: {
      type: 'object',
      properties: {
        prefix:             { type: 'string' },
        feature_dir:        { type: 'string' },
        needs_requirements: { type: 'boolean' },
        needs_tech_spec:    { type: 'boolean' },
        needs_validation:   { type: 'boolean' },
        force:              { type: 'boolean' },
        error:              { type: 'string' },
      },
      required: ['prefix', 'feature_dir'],
    },
  }
)

if (discoveryResult.error) {
  return { error: discoveryResult.error }
}

const { prefix, feature_dir } = discoveryResult

log(`Prefix: ${prefix} | Dir: ${feature_dir}`)
log(`needs_requirements=${discoveryResult.needs_requirements} needs_tech_spec=${discoveryResult.needs_tech_spec}`)

// ── generate-requirements ─────────────────────────────────────────────────────
phase('Requirements')

const tokenLedger = []
const errors      = []

if (discoveryResult.needs_requirements) {
  const beforeReq = budget.spent()
  const reqResult = await agent(featurePath, { agentType: 'generate-requirements', label: 'generate-requirements', phase: 'Requirements' })
  const reqTokens = budget.spent() - beforeReq
  tokenLedger.push({ agent: 'generate-requirements', model: 'haiku', phase_delta_tokens: reqTokens })
  log(`generate-requirements done — phase delta: ${reqTokens} tokens`)
} else {
  log('generate-requirements: fresh — skipped')
}

// ── generate-tech-spec ────────────────────────────────────────────────────────
phase('Tech-Spec')

if (discoveryResult.needs_tech_spec) {
  const beforeSpec = budget.spent()
  const specResult = await agent(featurePath, { agentType: 'generate-tech-spec', label: 'generate-tech-spec', phase: 'Tech-Spec' })
  const specTokens = budget.spent() - beforeSpec
  tokenLedger.push({ agent: 'generate-tech-spec', model: 'haiku', phase_delta_tokens: specTokens })
  log(`generate-tech-spec done — phase delta: ${specTokens} tokens`)
} else {
  log('generate-tech-spec: fresh — skipped')
}

// ── validate-feature-docs (revision loop, max 3 cycles) ──────────────────────
phase('Validation')

let validationSummary = 'skipped'
const MAX_CYCLES = 3

for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
  log(`validate-feature-docs cycle ${cycle}`)
  const beforeVal = budget.spent()
  const valResult = await agent(featurePath, { agentType: 'validate-feature-docs', label: `validate-feature-docs (cycle ${cycle})`, phase: 'Validation' })
  const valTokens = budget.spent() - beforeVal
  tokenLedger.push({ agent: `validate-feature-docs (cycle ${cycle})`, model: 'haiku', phase_delta_tokens: valTokens })

  // valResult is the agent's text output — check for gap indicators
  const resultText = typeof valResult === 'string' ? valResult : JSON.stringify(valResult)
  const hasGaps    = resultText.includes('MISSING:') || resultText.toLowerCase().includes('gaps found')

  if (!hasGaps) {
    validationSummary = `0 gaps (clean on cycle ${cycle})`
    log(`Validation clean on cycle ${cycle}`)
    break
  }

  log(`Validation cycle ${cycle}: gaps found`)

  if (cycle < MAX_CYCLES) {
    // Re-run failing docs before next validation cycle
    if (resultText.includes('Requirements')) {
      await agent(featurePath, { agentType: 'generate-requirements', label: `generate-requirements (revision ${cycle})`, phase: 'Validation' })
    }
    if (resultText.includes('Tech-Spec')) {
      await agent(featurePath, { agentType: 'generate-tech-spec', label: `generate-tech-spec (revision ${cycle})`, phase: 'Validation' })
    }
  } else {
    validationSummary = 'gaps remain after 3 cycles'
    errors.push('validate-feature-docs: gaps remain after 3 revision cycles')
  }
}

// ── Build gate1_payload ───────────────────────────────────────────────────────
const gate1Payload = {
  prefix,
  feature_dir,
  feature_path: featurePath,
  requirements: {
    path:    `${feature_dir}/${prefix}-Requirements.md`,
    summary: `${prefix}-Requirements.md — generated`,
  },
  tech_spec: {
    path:    `${feature_dir}/${prefix}-Tech-Spec.md`,
    summary: `${prefix}-Tech-Spec.md — generated`,
  },
  validation: {
    path:    `${feature_dir}/${prefix}-Validation-Report.md`,
    summary: validationSummary,
  },
  token_ledger: tokenLedger,
  errors,
}

log(`pm-phase1 complete — gate1_payload ready`)
return gate1Payload
