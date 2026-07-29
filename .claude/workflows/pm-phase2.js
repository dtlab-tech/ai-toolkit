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

// ── Parse WB + write Effort-Estimate + Token-Estimate ────────────────────────
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
    token_estimate_path:   { type: 'string' },
    tasks_csv_path:        { type: 'string' },
  },
  required: ['prefix', 'user_stories', 'total_tasks', 'work_breakdown_path'],
}

const phase1Tokens = wbTokens  // tokens consumed by this phase so far

const metrics = await agent(
  `You have four tasks:

TASK 1 — Read the Work Breakdown file.
The feature.md is at: ${featurePath}
The directory containing feature.md also contains the Work Breakdown file named {PREFIX}-Work-Breakdown.md,
where PREFIX matches the pattern [A-Z]+-[0-9]+ from the directory name (e.g. FTR-009).
Use Glob or Read to find and read that file.

Extract from the Summary table:
- prefix (e.g. "FTR-009")
- feature_dir (directory containing feature.md)
- feature_title (full feature title from the Work Breakdown header)
- user_stories (integer)
- total_tasks (integer)
- domain_breakdown (e.g. "DB:0, BE:11, FE:0, INFRA:4, TEST:0")
- implementation_phases (integer)
- human_estimate (e.g. "~34h")
- agent_estimate (e.g. "~2h 6min")
- work_breakdown_path (full path to the Work Breakdown file)

Also read Section 4 of the Work Breakdown to extract per-User-Story details:
- US ID (e.g. US-01)
- US title
- task count
- domains involved
- estimated hours (from the Work Breakdown if present, otherwise estimate based on task count: ~2h per BE task, ~1h per TEST task, ~30min per INFRA task)

TASK 2 — Write the Effort-Estimate.md file.
Write {feature_dir}/{PREFIX}-Effort-Estimate.md with this format:

# Effort Estimate — {PREFIX} — {feature_title}

## Summary

| Metric | Value |
|--------|-------|
| User Stories | {user_stories} |
| Total tasks | {total_tasks} ({domain_breakdown}) |
| Implementation phases | {implementation_phases} |
| Human estimate | {human_estimate} (sequential, no parallelism) |
| Agent estimate | {agent_estimate} (parallel dispatch, critical path only) |

## Per-Phase Breakdown

| Phase | Title | Tasks | Domains | Est. Human | Est. Agent | Actual Human | Actual Agent |
|-------|-------|-------|---------|-----------|-----------|-------------|-------------|
{one row per phase (INFRA + each US) extracted from Section 4 of the Work Breakdown — use ~2h per BE task, ~1h per TEST task, ~30min per INFRA task for human estimate; agent estimate = human / 6 as baseline}
| **Total** | | **{total_tasks}** | | **{human_estimate}** | **{agent_estimate}** | **—** | **—** |

## Notes
- Human estimate assumes sequential execution with no parallelism.
- Agent estimate assumes parallel dispatch of independent tasks within each phase (critical path only).
- Actual Human: filled in if a human developer performed or reviewed the implementation.
- Actual Agent: filled in by pm-phase3 after implementation completes.

TASK 3 — Write the Token-Estimate.md file.
Write {feature_dir}/{PREFIX}-Token-Estimate.md with this format:

# Token Estimate — {PREFIX} — {feature_title}

## Phase 1 — Documentation (Actuals)

| Agent | Task | Model | Tokens Est. | Tokens Actual |
|-------|------|-------|------------|--------------|
| generate-requirements | Generate requirements from feature.md | haiku | — | {phase1_req_tokens} |
| generate-tech-spec | Generate tech spec from feature.md | haiku | — | {phase1_spec_tokens} |
| validate-feature-docs | Validate requirements + tech spec | haiku | — | {phase1_val_tokens} |
| **Phase 1 total** | | | **—** | **${phase1Tokens}** |

## Phase 2 — Work Breakdown (Actuals)

| Agent | Task | Model | Tokens Est. | Tokens Actual |
|-------|------|-------|------------|--------------|
| generate-work-breakdown | Generate work breakdown from docs | haiku | — | {wbTokens from above} |
| **Phase 2 total** | | | **—** | **{wbTokens from above}** |

## Phase 3 — Implementation (Estimates)

Estimates based on {total_tasks} tasks ({domain_breakdown}), {user_stories} User Stories.
Baseline: ~15,000 tokens/BE task, ~8,000/TEST task, ~5,000/INFRA task.

| Agent | Task | Model | Tokens Est. | Tokens Actual |
|-------|------|-------|------------|--------------|
| developer-backend | Implement BE/INFRA tasks | sonnet | {estimated: be_tasks * 15000 + infra_tasks * 5000} | — |
| developer-testing | Implement TEST tasks | sonnet | {estimated: test_tasks * 8000} | — |
| review-solution (×{user_stories}) | Architect review per US | sonnet | {estimated: user_stories * 8000} | — |
| remediation | Fix review issues | sonnet | ~10,000 | — |
| pr-and-registry | Push branch, create PR | sonnet | ~5,000 | — |
| write-actuals | Update Token/Effort Estimate | sonnet | ~3,000 | — |
| **Phase 3 total** | | | **{sum of phase 3 estimates}** | **—** |

## Grand Total

| Phase | Tokens Est. | Tokens Actual |
|-------|------------|--------------|
| Phase 1 — Documentation | — | ${phase1Tokens} |
| Phase 2 — Work Breakdown | — | {wbTokens from above} |
| Phase 3 — Implementation | {sum of phase 3 estimates} | — |
| **Total** | **{sum of phase 3 estimates}** | **{phase1Tokens + wbTokens} (partial)** |

---
*Actuals will be appended by pm-phase3 after implementation completes.*

TASK 4 — Set return values.
Set effort_estimate_path to the full path of the written Effort-Estimate.md.
Set token_estimate_path to the full path of the written Token-Estimate.md.
Set tasks_csv_path to the full path of the {PREFIX}-Work-Breakdown.csv file (written by generate-work-breakdown in the same directory as feature.md).

Return the extracted metrics as structured output.`,
  {
    label:  'parse-wb-write-estimates',
    phase:  'Effort Estimate',
    schema: PARSE_SCHEMA,
  }
)

log(`WB parsed: ${metrics.user_stories} US, ${metrics.total_tasks} tasks, ${metrics.implementation_phases} phases`)
log(`Effort-Estimate written: ${metrics.effort_estimate_path}`)
log(`Token-Estimate written: ${metrics.token_estimate_path}`)

// ── Append to process-log (phase 2 events) ───────────────────────────────────
const wbEntry = tokenLedger.find(e => e.agent === 'generate-work-breakdown')
const phase2Events = [
  `APPROVAL GRANTED by user — Gate 1`,
  `pm-phase2 START — work breakdown phase`,
  `Agent DONE: generate-work-breakdown — tokens: ${wbEntry ? wbEntry.phase_delta_tokens : 'N/A'}`,
  `Written: ${metrics.prefix}-Work-Breakdown.md (${metrics.user_stories} US, ${metrics.total_tasks} tasks, ${metrics.implementation_phases} phases)`,
  `Written: ${metrics.prefix}-Effort-Estimate.md`,
  `pm-phase2 COMPLETE`,
  `APPROVAL REQUESTED — Gate 2`,
].join('\n')

await agent(
  `Append phase 2 events to the process-log for this feature delivery run.

Process-log path: ${metrics.feature_dir}/${metrics.prefix}-process-log.txt

Steps:
1. Get current UTC datetime via Bash: run \`date -u +"%Y-%m-%dT%H:%M:%S"\`
2. Append the following lines to the existing file. Use the datetime from step 1 for ALL event lines.
   Format each event line as: [{datetime}] {event text}

Events to append:
${phase2Events}`,
  { label: 'append-process-log', phase: 'Effort Estimate' }
)

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
  token_estimate_path:   metrics.token_estimate_path  || '',
  tasks_csv_path:        metrics.tasks_csv_path        || '',
  token_ledger:          tokenLedger,
  errors:                [],
}
