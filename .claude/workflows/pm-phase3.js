export const meta = {
  name: 'pm-phase3',
  description: 'Feature delivery phase 3: implementation loop (developer agents + review-solution per US, max 2 rework cycles, git commit per US) → remediation → PR → Feature Registry → Token-Estimate actuals → Effort-Estimate actuals.',
  phases: [
    { title: 'Implementation', detail: 'Dispatch developer agents per work breakdown, review per US' },
    { title: 'Remediation',    detail: 'Fix OPEN issues from Issues Register' },
    { title: 'PR',             detail: 'Push branch, create PR, update registry' },
    { title: 'Actuals',        detail: 'Write Token-Estimate and Effort-Estimate actuals' },
  ],
}

// args: "<path-to-feature.md> --branch feature/FTR-NNN-slug"
const argStr      = typeof args === 'string' ? args : ''
const featurePath = argStr.trim().split(/\s+/)[0]
const branchMatch = argStr.match(/--branch\s+(\S+)/)
const branch      = branchMatch ? branchMatch[1] : null

// ── Implementation ────────────────────────────────────────────────────────────
phase('Implementation')

log(`Starting implementation for ${featurePath}${branch ? ` on branch ${branch}` : ''}`)

const tokenLedger  = []
const escalations  = []

// Read the Work Breakdown and execute implementation
// A single orchestration agent handles the full implementation loop:
// parse WB → per-phase dispatch → review per US → rework (max 2 cycles) → commit per US
// It uses sub-tool calls (Read, Bash, etc.) to do git work and reads the WB itself.
// It does NOT spawn further subagents — it reads files and calls Bash for git commands.

const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    prefix:        { type: 'string' },
    phases_done:   { type: 'number' },
    us_passed:     { type: 'array', items: { type: 'string' } },
    us_escalated:  { type: 'array', items: { type: 'string' } },
    issues_path:   { type: 'string' },
    issues_open:   { type: 'number' },
  },
  required: ['prefix', 'phases_done'],
}

const beforeImpl = budget.spent()

const implResult = await agent(
  `You are the implementation orchestrator for the feature delivery pipeline.

Feature path: ${featurePath}
Branch: ${branch || '(already checked out)'}

Your job:

1. Read {PREFIX}-Work-Breakdown.md (same directory as feature.md).
   Extract all phases, tasks, domains, and User Story groupings from Section 4.

2. For each phase in order:
   a. Identify tasks grouped by User Story (US-XX) or INFRA.
   b. For each group, spawn the correct developer agent:
      - DB/BE/INFRA tasks → subagent_type: developer-backend
      - FE tasks          → subagent_type: developer-frontend
      - TEST tasks        → subagent_type: developer-testing
      Prompt: "${featurePath} <comma-separated task IDs>"
      Independent groups within a phase can be dispatched in parallel (multiple Agent calls in same response).
   c. When ALL tasks for a User Story are done → spawn review-solution:
      subagent_type: review-solution, prompt: "${featurePath} --scope <US-ID>"
      - PASS (no CRITICAL): git add -A && git commit -m "feat({PREFIX}): implement {US-ID} — {title}"
        Log WARNING/INFO findings to {PREFIX}-Issues.md.
      - FAIL (CRITICAL): rework — re-dispatch the developer agent with the review findings appended to the prompt.
        Max 2 rework cycles. After 2 failed cycles → escalate (add to escalations list).
      INFRA tasks: reviewed as a group, commit: "feat({PREFIX}): implement shared infrastructure (INFRA)"

3. After all phases complete:
   - Read {PREFIX}-Issues.md if it exists. Count OPEN items.
   - Report: prefix, phases_done, us_passed (list of US IDs that passed), us_escalated (list that escalated), issues_path, issues_open.

IMPORTANT RULES:
- Never use run_in_background: true when spawning agents.
- Track escalations: if a US fails review after 2 rework cycles, add its ID to us_escalated and continue.
- Partial failures are acceptable — continue with remaining phases.
- All git commands via Bash tool.
- Commit message format: feat({PREFIX}): implement {US-ID} — {US title}`,
  {
    label:  'implementation-orchestrator',
    phase:  'Implementation',
    schema: IMPL_SCHEMA,
  }
)

const implTokens = budget.spent() - beforeImpl
tokenLedger.push({ agent: 'implementation-orchestrator', model: 'sonnet', phase_delta_tokens: implTokens })
log(`Implementation done — ${implResult.phases_done} phases, ${(implResult.us_passed || []).length} US passed, ${(implResult.us_escalated || []).length} escalated`)
log(`Phase delta: ${implTokens} tokens`)

if (implResult.us_escalated?.length) {
  for (const usId of implResult.us_escalated) {
    escalations.push({ usId, reason: 'CRITICAL review finding unresolved after 2 rework cycles' })
  }
}

const prefix     = implResult.prefix
const issuesPath = implResult.issues_path || ''

// ── Remediation ───────────────────────────────────────────────────────────────
phase('Remediation')

const REM_SCHEMA = {
  type: 'object',
  properties: {
    issues_fixed:    { type: 'number' },
    issues_deferred: { type: 'number' },
  },
  required: ['issues_fixed', 'issues_deferred'],
}

let issuesFixed    = 0
let issuesDeferred = 0

if (implResult.issues_open > 0 && issuesPath) {
  log(`Remediation: ${implResult.issues_open} OPEN issues`)
  const beforeRem = budget.spent()

  const remResult = await agent(
    `You are a remediation agent for the feature delivery pipeline.

Read the Issues Register at: ${issuesPath}

For each OPEN issue:
- If severity is INFO: mark it DEFERRED immediately (update the Status column to DEFERRED). Do not dispatch a developer agent.
- If severity is WARNING: dispatch the appropriate developer agent (developer-backend for most cases) with the issue description. Then spawn review-solution to verify the fix. Max 1 retry per issue. If unresolved after 1 retry, mark DEFERRED.

After processing all issues, return:
{ "issues_fixed": N, "issues_deferred": N }

Update the Issues Register Status column in place for each resolved/deferred issue.`,
    {
      label:  'remediation',
      phase:  'Remediation',
      schema: REM_SCHEMA,
    }
  )

  const remTokens = budget.spent() - beforeRem
  tokenLedger.push({ agent: 'remediation', model: 'sonnet', phase_delta_tokens: remTokens })
  issuesFixed    = remResult.issues_fixed    || 0
  issuesDeferred = remResult.issues_deferred || 0
  log(`Remediation done — fixed: ${issuesFixed}, deferred: ${issuesDeferred} | phase delta: ${remTokens} tokens`)
} else {
  log('Remediation: no OPEN issues — skipped')
}

// ── PR ────────────────────────────────────────────────────────────────────────
phase('PR')

const PR_SCHEMA = {
  type: 'object',
  properties: {
    pr_url:            { type: 'string' },
    registry_updated:  { type: 'boolean' },
  },
  required: ['pr_url'],
}

const beforePR = budget.spent()

const prResult = await agent(
  `You are the PR and registry agent for the feature delivery pipeline.

Feature path: ${featurePath}
Branch: ${branch || 'current branch'}
Prefix: ${prefix}
Issues fixed: ${issuesFixed}, deferred: ${issuesDeferred}

Your tasks:

1. If there are remediation fixes, commit them:
   git add -A
   git commit -m "fix(${prefix}): remediate review issues"

2. Push the branch:
   git push -u origin ${branch || 'HEAD'}

3. Create a PR targeting develop:
   gh pr create \\
     --title "feat(${prefix}): <Feature Title from feature.md>" \\
     --base develop \\
     --body "## Summary
- Implements <Feature Title> (<N> User Stories, <N> tasks)
- Source docs: ${prefix}-Requirements.md, ${prefix}-Tech-Spec.md

## Implementation
- Architect review: all US passed
- Issues Register: ${issuesFixed} fixed, ${issuesDeferred} deferred → see ${prefix}-Issues.md

## Test plan
- [ ] Build passes
- [ ] Tests pass
- [ ] Manual smoke test of key flows"

4. Update the Feature Registry (internal_docs/features/REGISTRY.md):
   Find or append the entry for ${prefix}. Set Status to "completed".

Return { "pr_url": "<url>", "registry_updated": true/false }.
If the PR creation fails, return { "pr_url": "(PR creation failed)", "registry_updated": false }.`,
  {
    label:  'pr-and-registry',
    phase:  'PR',
    schema: PR_SCHEMA,
  }
)

const prTokens = budget.spent() - beforePR
tokenLedger.push({ agent: 'pr-and-registry', model: 'sonnet', phase_delta_tokens: prTokens })
log(`PR done: ${prResult.pr_url} | phase delta: ${prTokens} tokens`)

// ── Actuals ───────────────────────────────────────────────────────────────────
phase('Actuals')

// Compute proportional distribution of phase tokens across logical agents
// Phase tokens are exact (budget.spent() deltas); per-agent breakdown is proportional.
// This is documented in the Token-Estimate file with a disclaimer.
const totalImplTokens = tokenLedger.reduce((s, e) => s + (e.phase_delta_tokens || 0), 0)

const ACTUALS_SCHEMA = {
  type: 'object',
  properties: {
    token_estimate_path: { type: 'string' },
    effort_estimate_path: { type: 'string' },
  },
  required: [],
}

const beforeActuals = budget.spent()

await agent(
  `You are the actuals recorder for the feature delivery pipeline.

Feature path: ${featurePath}
Prefix: ${prefix}

Token ledger (phase-level measurements):
${JSON.stringify(tokenLedger, null, 2)}

Total tokens consumed by pm-phase3 workflow (all phases combined): ${totalImplTokens} (exact, from budget tracking)

TASK 1 — Update Token-Estimate.md:
Find ${prefix}-Token-Estimate.md in the feature directory.
If it doesn't exist, create it with the structure from docs/procedures/token-estimation.md.

Append this section at the end:

---

## Actuals vs Estimate

> ⚠️ Per-agent values are proportional distributions of the phase total.
> Phase totals (pm-phase3 total: ${totalImplTokens} tokens) are exact measurements.
> Individual agent breakdown is estimated proportionally.

| Agent | Task / Scope | Model | Phase delta tokens | Notes |
|-------|-------------|-------|-------------------|-------|
${tokenLedger.map(e => `| ${e.agent} | — | ${e.model} | ${e.phase_delta_tokens} | exact phase delta |`).join('\n')}

## Grand Total (pm-phase3)

| Metric | Value |
|--------|-------|
| Total tokens (pm-phase3) | ${totalImplTokens} (exact) |
| Implementation phases | ${implResult.phases_done} |
| US passed | ${(implResult.us_passed || []).join(', ') || 'N/A'} |
| US escalated | ${(implResult.us_escalated || []).join(', ') || 'none'} |

TASK 2 — Append actuals to Effort-Estimate.md:
Find ${prefix}-Effort-Estimate.md in the feature directory.
Append:

---

## Actuals vs Estimate

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Implementation phases | ${implResult.phases_done} | ${implResult.phases_done} |
| Issues fixed | — | ${issuesFixed} |
| Issues deferred | — | ${issuesDeferred} |

Return { "token_estimate_path": "<path>", "effort_estimate_path": "<path>" }.`,
  {
    label:  'write-actuals',
    phase:  'Actuals',
    schema: ACTUALS_SCHEMA,
  }
)

const actualsTokens = budget.spent() - beforeActuals
tokenLedger.push({ agent: 'write-actuals', model: 'sonnet', phase_delta_tokens: actualsTokens })
log(`Actuals written | phase delta: ${actualsTokens} tokens`)

// ── Append to process-log (phase 3 events + RUN COMPLETE) ────────────────────
const usPassed    = (implResult.us_passed    || []).join(', ') || 'none'
const usEscalated = (implResult.us_escalated || []).join(', ') || 'none'
const phase3Events = [
  `APPROVAL GRANTED by user — Gate 2`,
  `pm-phase3 START — implementation phase — branch: ${branch || '(current)'}`,
  `Implementation DONE — ${implResult.phases_done} phases | US passed: ${usPassed} | US escalated: ${usEscalated}`,
  issuesFixed + issuesDeferred > 0
    ? `Remediation: ${issuesFixed} fixed, ${issuesDeferred} deferred`
    : `Remediation: skipped (no open issues)`,
  `PR created: ${prResult.pr_url}`,
  `Actuals written: Token-Estimate.md + Effort-Estimate.md`,
  `RUN COMPLETE`,
  `════════════════════════════════════════════════════════`,
].join('\n')

// feature_dir is not directly available in pm-phase3; derive from featurePath
const featureDir3 = featurePath.replace(/\/[^/]+$/, '')

await agent(
  `Append phase 3 events to the process-log for this feature delivery run.

Process-log path: ${featureDir3}/${prefix}-process-log.txt

Steps:
1. Get current UTC datetime via Bash: run \`date -u +"%Y-%m-%dT%H:%M:%S"\`
2. Append the following lines to the existing file. Use the datetime from step 1 for ALL event lines.
   Format each event line as: [{datetime}] {event text}
   The final line (════…) is a separator — append it as-is, without a timestamp prefix.

Events to append:
${phase3Events}`,
  { label: 'finalize-process-log', phase: 'Actuals' }
)

return {
  pr_url:       prResult.pr_url,
  token_ledger: tokenLedger,
  issues_summary: {
    escalations: escalations.length,
    escalation_details: escalations,
    issues_fixed:    issuesFixed,
    issues_deferred: issuesDeferred,
  },
}
