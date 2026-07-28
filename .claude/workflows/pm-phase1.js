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
  // Use only 'MISSING:' as the gap signal: 'gaps found' also matches 'ZERO GAPS FOUND'
  const resultText = typeof valResult === 'string' ? valResult : JSON.stringify(valResult)
  const hasGaps    = resultText.includes('MISSING:')

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

// ── Write process-log (phase 1 snapshot) ─────────────────────────────────────
const reqEntry   = tokenLedger.find(e => e.agent === 'generate-requirements')
const specEntry  = tokenLedger.find(e => e.agent === 'generate-tech-spec')
const valEntries = tokenLedger.filter(e => e.agent.startsWith('validate-feature-docs'))
const phase1Events = [
  `pm-phase1 START — documentation phase`,
  reqEntry
    ? `Agent DONE: generate-requirements — tokens: ${reqEntry.phase_delta_tokens}`
    : `generate-requirements: skipped (fresh)`,
  specEntry
    ? `Agent DONE: generate-tech-spec — tokens: ${specEntry.phase_delta_tokens}`
    : `generate-tech-spec: skipped (fresh)`,
  ...valEntries.map(e => `Agent DONE: ${e.agent} — tokens: ${e.phase_delta_tokens}`),
  `Validation result: ${validationSummary}`,
  `APPROVAL REQUESTED — Gate 1`,
].join('\n')

await agent(
  `Create the process-log file for this feature delivery run.

File path: ${feature_dir}/${prefix}-process-log.txt

Steps:
1. Get current UTC datetime via Bash: run \`date -u +"%Y-%m-%dT%H:%M:%S"\`
2. Read feature.md at: ${featurePath} — extract the feature title (first H1 heading after the frontmatter).
3. Write the file using the Write tool. Use the datetime from step 1 for ALL timestamps.
   Format each event line as: [{datetime}] {event text}

File structure:
════════════════════════════════════════════════════════
RUN STARTED — {datetime}
Feature: ${prefix} — {title from step 2}
════════════════════════════════════════════════════════
{one line per event below, each prefixed with [{datetime}]}

Events to log:
${phase1Events}`,
  { label: 'write-process-log', phase: 'Validation' }
)

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
