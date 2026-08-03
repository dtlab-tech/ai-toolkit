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

// ── Ledger helper functions ───────────────────────────────────────────────────

async function appendLedgerEntry(featureDir, prefix, entry) {
  const ledgerPath = `${featureDir}/${prefix}-token-ledger.json`
  const entryJson = JSON.stringify(entry)
  await agent(
    `Append a JSON object to the ledger array at: ${ledgerPath}\n\n1. Read the file. If it does not exist or cannot be parsed as a JSON array, start with [].\n2. Push this object onto the array: ${entryJson}\n3. Write the full array back (JSON, 2-space indent). Return no output.`,
    { label: 'append-ledger', phase: 'Requirements', model: 'haiku' }
  )
}

async function updateLedgerEntry(featureDir, prefix, agentKey, updates) {
  const ledgerPath = `${featureDir}/${prefix}-token-ledger.json`
  const updatesJson = JSON.stringify(updates)
  await agent(
    `Update an entry in the ledger array at: ${ledgerPath}\n\n1. Read the file. If it does not exist or cannot be parsed as a JSON array, do nothing.\n2. Search from the end for the last entry where agent === "${agentKey}".\n3. If found, merge these fields into that entry: ${updatesJson}\n4. Write the full array back (JSON, 2-space indent). Return no output.\n5. If not found, do nothing.`,
    { label: 'update-ledger', phase: 'Requirements', model: 'haiku' }
  )
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

// ── Ensure ledger file exists (US-02-T02) ─────────────────────────────────────
// If define-feature was not used, the ledger file will not exist yet.
// Touch it with an empty array so appendLedgerEntry can always assume a valid base.
const ledgerFilePath = `${feature_dir}/${prefix}-token-ledger.json`
await agent(
  `Check whether the file ${ledgerFilePath} exists.\n\n1. Try to read the file using the Read tool.\n2. If the file does NOT exist: write it now using the Write tool with contents: []\n3. If the file already exists and is a valid JSON array: do nothing.\n4. If the file exists but is not valid JSON: overwrite it with: []\n5. Return no output.`,
  { label: 'ensure-ledger', phase: 'Discovery', model: 'haiku' }
)
log(`Ledger ensured at ${ledgerFilePath}`)

// ── generate-requirements ─────────────────────────────────────────────────────
phase('Requirements')

const tokenLedger = []
const errors      = []

if (discoveryResult.needs_requirements) {
  const reqKey = 'generate-requirements:phase1'
  const reqStartedAt = new Date().toISOString()
  await appendLedgerEntry(feature_dir, prefix, {
    agent: reqKey,
    phase: 'phase1',
    model: 'haiku',
    status: 'running',
    phase_delta_tokens: 0,
    started_at: reqStartedAt,
    completed_at: null,
  })
  const beforeReq = budget.spent()
  const reqResult = await agent(featurePath, { agentType: 'generate-requirements', label: 'generate-requirements', phase: 'Requirements' })
  const reqTokens = budget.spent() - beforeReq
  await updateLedgerEntry(feature_dir, prefix, reqKey, {
    status: 'done',
    completed_at: new Date().toISOString(),
    phase_delta_tokens: reqTokens,
  })
  tokenLedger.push({ agent: 'generate-requirements', model: 'haiku', phase_delta_tokens: reqTokens })
  log(`generate-requirements done — phase delta: ${reqTokens} tokens`)
} else {
  log('generate-requirements: fresh — skipped')
}

// ── generate-tech-spec ────────────────────────────────────────────────────────
phase('Tech-Spec')

if (discoveryResult.needs_tech_spec) {
  const specKey = 'generate-tech-spec:phase1'
  const specStartedAt = new Date().toISOString()
  await appendLedgerEntry(feature_dir, prefix, {
    agent: specKey,
    phase: 'phase1',
    model: 'haiku',
    status: 'running',
    phase_delta_tokens: 0,
    started_at: specStartedAt,
    completed_at: null,
  })
  const beforeSpec = budget.spent()
  const specResult = await agent(featurePath, { agentType: 'generate-tech-spec', label: 'generate-tech-spec', phase: 'Tech-Spec' })
  const specTokens = budget.spent() - beforeSpec
  await updateLedgerEntry(feature_dir, prefix, specKey, {
    status: 'done',
    completed_at: new Date().toISOString(),
    phase_delta_tokens: specTokens,
  })
  tokenLedger.push({ agent: 'generate-tech-spec', model: 'haiku', phase_delta_tokens: specTokens })
  log(`generate-tech-spec done — phase delta: ${specTokens} tokens`)
} else {
  log('generate-tech-spec: fresh — skipped')
}

// ── validate-feature-docs (revision loop, max 3 cycles) ──────────────────────
phase('Validation')

let validationSummary = 'skipped'
let lastValText       = ''
const MAX_CYCLES = 3

for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
  log(`validate-feature-docs cycle ${cycle}`)
  const valKey = `validate-feature-docs:phase1:cycle${cycle}`
  const valStartedAt = new Date().toISOString()
  await appendLedgerEntry(feature_dir, prefix, {
    agent: valKey,
    phase: 'phase1',
    model: 'haiku',
    status: 'running',
    phase_delta_tokens: 0,
    started_at: valStartedAt,
    completed_at: null,
  })
  const beforeVal = budget.spent()
  const valResult = await agent(featurePath, { agentType: 'validate-feature-docs', label: `validate-feature-docs (cycle ${cycle})`, phase: 'Validation' })
  const valTokens = budget.spent() - beforeVal
  await updateLedgerEntry(feature_dir, prefix, valKey, {
    status: 'done',
    completed_at: new Date().toISOString(),
    phase_delta_tokens: valTokens,
  })
  tokenLedger.push({ agent: `validate-feature-docs (cycle ${cycle})`, model: 'haiku', phase_delta_tokens: valTokens })

  // valResult is the agent's text output — check for gap indicators
  // Use only 'MISSING:' as the gap signal: 'gaps found' also matches 'ZERO GAPS FOUND'
  const resultText = typeof valResult === 'string' ? valResult : JSON.stringify(valResult)
  lastValText      = resultText
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

// ── Guarantee the Validation Report exists on disk ───────────────────────────
// The validate-feature-docs agent (haiku) is instructed to write the report in its
// Phase 6, but this is LLM-dependent and unreliable when validation is clean. Downstream
// pm-phase2 (generate-work-breakdown) treats the report as a hard precondition, so its
// absence aborts the whole pipeline. This step deterministically ensures the file exists.
if (validationSummary !== 'skipped') {
  const validationReportPath = `${feature_dir}/${prefix}-Validation-Report.md`
  await agent(
    `Ensure the Validation Report file exists on disk for this feature delivery run.

File path: ${validationReportPath}

Steps:
1. Check whether the file already exists (use Read or Glob).
2. If it ALREADY EXISTS: do nothing, return "exists".
3. If it DOES NOT EXIST: write it now using the Write tool, based on the validation outcome below.
   Get the current date via Bash: run \`date -u +"%Y-%m-%d"\`.

Validation outcome summary: ${validationSummary}

Validation agent output (source of truth for gaps found/resolved):
──────────────────────────────────────────────────
${lastValText.slice(0, 4000)}
──────────────────────────────────────────────────

File format to write (fill from the outcome above; if the run was clean, mark both documents Clean with 0 gaps):

# Validation Report — ${prefix}

## Summary
| Document | Gaps found | Gaps resolved | Status |
|----------|-----------|--------------|--------|
| ${prefix}-Requirements.md | N | N | Clean / Gaps remain |
| ${prefix}-Tech-Spec.md    | N | N | Clean / Gaps remain |

## Gaps found and resolved
(derive from the validation output above; write "(none)" if clean)

## Remaining gaps (if any)
(list any unresolved gaps, or "(none)")

## Validation date
{date from Bash}

Return "written" if you created the file, or "exists" if it was already present.`,
    { label: 'ensure-validation-report', phase: 'Validation' }
  )
  log(`Validation report ensured at ${validationReportPath}`)
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
