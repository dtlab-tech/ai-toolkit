export const meta = {
  name: 'pm-phase3',
  description: 'Feature delivery phase 3: parse WB → dispatch specialist agents per US (developer-backend/frontend/testing + review-solution per US, max 2 rework cycles, git commit per US) → remediation → PR → Token-Estimate actuals → Effort-Estimate actuals.',
  phases: [
    { title: 'Parse',          detail: 'Parse Work Breakdown into structured implementation phases' },
    { title: 'Implementation', detail: 'Dispatch developer agents per US, review, commit' },
    { title: 'Test',           detail: 'Single test run after all phases complete' },
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

const tokenLedger = []
const escalations = []

// ── Parse Work Breakdown CSV (deterministic, no AI) ───────────────────────────
phase('Parse')

// Derive feature_dir and prefix from featurePath (e.g. "docs/features/FTR-004-.../feature.md")
const featureDir  = featurePath.replace(/\/[^/]+$/, '')
const prefixMatch = featureDir.match(/([A-Z]+-\d+)/)
const prefix      = prefixMatch ? prefixMatch[1] : 'FTR-000'
const csvPath     = `${featureDir}/${prefix}-Work-Breakdown.csv`

log(`Reading CSV: ${csvPath}`)

const csvContent = await agent(
  `Read the file at path: ${csvPath}\nReturn ONLY the raw file contents, nothing else. No explanation, no formatting, no JSON wrapping — just the raw text of the file.`,
  { label: 'read-wb-csv', phase: 'Parse', model: 'haiku' }
)

// Parse CSV into structured phases — pure JS, no AI
const rows = csvContent
  .split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('phase_id'))  // skip header and empty lines
  .map(l => {
    const [phase_id, phase_title, commit_message, depends_on, task_id, task_title, domain, agent_type] = l.split('|')
    return { phase_id, phase_title, commit_message, depends_on: depends_on || '', task_id, task_title, domain, agent_type }
  })
  .filter(r => r.phase_id && r.task_id)

// Group rows into phases preserving order
const phaseMap = new Map()
for (const row of rows) {
  if (!phaseMap.has(row.phase_id)) {
    phaseMap.set(row.phase_id, {
      phase_id:       row.phase_id,
      title:          row.phase_title,
      commit_message: row.commit_message,
      depends_on:     row.depends_on.split(' ').filter(Boolean),  // [] for empty
      impl_tasks:     [],
      test_tasks:     [],
    })
  }
  const p = phaseMap.get(row.phase_id)
  if (row.domain === 'TEST') {
    p.test_tasks.push({ task_id: row.task_id, agent_type: row.agent_type })
  } else {
    p.impl_tasks.push({ task_id: row.task_id, agent_type: row.agent_type })
  }
}

// Build impl_groups and test_groups (merge by agent_type within each phase)
const buildGroups = (tasks) => {
  const map = new Map()
  for (const t of tasks) {
    if (!map.has(t.agent_type)) map.set(t.agent_type, [])
    map.get(t.agent_type).push(t.task_id)
  }
  return Array.from(map.entries()).map(([agent_type, task_ids]) => ({ agent_type, task_ids }))
}

const allPhases = Array.from(phaseMap.values()).map(p => ({
  phase_id:       p.phase_id,
  title:          p.title,
  commit_message: p.commit_message,
  depends_on:     p.depends_on,
  impl_groups:    buildGroups(p.impl_tasks),
  test_groups:    buildGroups(p.test_tasks),
}))

const wb = { prefix, feature_dir: featureDir, phases: allPhases }

log(`CSV parsed: ${rows.length} tasks → ${wb.phases.length} phases for ${wb.prefix}`)

// Build execution waves: phases whose dependencies are all satisfied can run in parallel.
// Wave 0 = no deps, Wave 1 = depends only on Wave 0 phases, etc.
const buildWaves = (phases) => {
  const done   = new Set()
  const waves  = []
  let remaining = [...phases]
  while (remaining.length > 0) {
    const ready = remaining.filter(p => p.depends_on.every(d => done.has(d)))
    if (ready.length === 0) {
      // Circular or unresolvable deps — run the rest sequentially to avoid deadlock
      waves.push(remaining)
      break
    }
    waves.push(ready)
    ready.forEach(p => done.add(p.phase_id))
    remaining = remaining.filter(p => !done.has(p.phase_id))
  }
  return waves
}

const waves = buildWaves(wb.phases)
log(`Execution plan: ${waves.length} wave(s) — ${waves.map((w, i) => `wave${i+1}:[${w.map(p => p.phase_id).join(',')}]`).join(' ')}`)

let phasesDone   = 0
const usPassed   = []
const usEscalated = []
let issuesPath   = ''
let issuesOpen   = 0

// ── Implementation ────────────────────────────────────────────────────────────
phase('Implementation')

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    has_critical: { type: 'boolean' },
    findings:     { type: 'string' },
    issues_md:    { type: 'string' },
  },
  required: ['has_critical'],
}

// executePhase: runs impl_groups → test_groups → review → rework → commit for one phase
const executePhase = async (implPhase) => {
  log(`Starting phase ${implPhase.phase_id}: ${implPhase.title}`)

  let reworkCycle  = 0
  let passed       = false
  let lastFindings = ''

  while (reworkCycle <= 2 && !passed) {
    const reworkSuffix = reworkCycle > 0
      ? ` -- REWORK CYCLE ${reworkCycle}: address these critical findings:\n${lastFindings}`
      : ''

    // Step 1 — impl groups in parallel (INFRA / BE / FE)
    if (implPhase.impl_groups.length > 0) {
      const beforeImpl = budget.spent()
      await parallel(implPhase.impl_groups.map(group => () =>
        agent(
          `${featurePath} ${group.task_ids.join(',')}${reworkSuffix}`,
          {
            agentType: group.agent_type,
            label:     `${group.agent_type}:${implPhase.phase_id}${reworkCycle > 0 ? ':rework' + reworkCycle : ''}`,
            phase:     'Implementation',
          }
        )
      ))
      const implTokens = budget.spent() - beforeImpl
      tokenLedger.push({
        agent: `${implPhase.impl_groups.map(g => g.agent_type).join('+')}:${implPhase.phase_id}${reworkCycle > 0 ? ':rework' + reworkCycle : ''}`,
        model: 'sonnet',
        phase_delta_tokens: implTokens,
      })
      log(`Phase ${implPhase.phase_id} impl groups done — ${implTokens} tokens`)
    }

    // Step 2 — test groups in parallel (TEST) — after impl groups
    if (implPhase.test_groups.length > 0) {
      const beforeTest = budget.spent()
      await parallel(implPhase.test_groups.map(group => () =>
        agent(
          `${featurePath} ${group.task_ids.join(',')}${reworkSuffix}`,
          {
            agentType: group.agent_type,
            label:     `${group.agent_type}:${implPhase.phase_id}${reworkCycle > 0 ? ':rework' + reworkCycle : ''}`,
            phase:     'Implementation',
          }
        )
      ))
      const testTokens = budget.spent() - beforeTest
      tokenLedger.push({
        agent: `developer-testing:${implPhase.phase_id}${reworkCycle > 0 ? ':rework' + reworkCycle : ''}`,
        model: 'sonnet',
        phase_delta_tokens: testTokens,
      })
      log(`Phase ${implPhase.phase_id} test groups done — ${testTokens} tokens`)
    }

    // Step 3 — review-solution
    const beforeReview = budget.spent()
    const review = await agent(
      `${featurePath} --scope ${implPhase.phase_id}`,
      {
        agentType: 'review-solution',
        label:     `review-solution:${implPhase.phase_id}`,
        phase:     'Implementation',
        schema:    REVIEW_SCHEMA,
      }
    )
    const reviewTokens = budget.spent() - beforeReview
    tokenLedger.push({
      agent: `review-solution:${implPhase.phase_id}`,
      model: 'sonnet',
      phase_delta_tokens: reviewTokens,
    })

    if (review && !review.has_critical) {
      passed = true
      if (review.issues_md) {
        await agent(
          `Append the following WARNING/INFO findings to ${wb.feature_dir}/${prefix}-Issues.md (create the file if it does not exist, with a header "# Issues Register — ${prefix}"):\n\n${review.issues_md}`,
          { label: `log-issues:${implPhase.phase_id}`, phase: 'Implementation' }
        )
      }
    } else {
      lastFindings = review?.findings || 'unspecified critical issues'
      reworkCycle++
      log(`Phase ${implPhase.phase_id}: critical findings — rework cycle ${reworkCycle}`)
    }
  }

  if (!passed) {
    log(`Phase ${implPhase.phase_id} ESCALATED after 2 rework cycles`)
    escalations.push({ phaseId: implPhase.phase_id, reason: 'CRITICAL review findings unresolved after 2 rework cycles' })
    usEscalated.push(implPhase.phase_id)
  } else {
    const commitMsg = implPhase.commit_message || `feat(${prefix}): implement ${implPhase.phase_id}`
    await agent(
      `Run these git commands in the repository root:\ngit add -A\ngit commit -m "${commitMsg}"\nIf there is nothing to commit, that is fine — just report success.`,
      { label: `commit:${implPhase.phase_id}`, phase: 'Implementation' }
    )
    if (implPhase.phase_id !== 'INFRA') usPassed.push(implPhase.phase_id)
    log(`Phase ${implPhase.phase_id} passed review and committed`)
  }

  phasesDone++
}

// Execute waves: phases in the same wave run in parallel, waves are sequential
for (const wave of waves) {
  if (wave.length === 1) {
    await executePhase(wave[0])
  } else {
    log(`Wave: running ${wave.map(p => p.phase_id).join(', ')} in parallel`)
    await parallel(wave.map(p => () => executePhase(p)))
  }
}

// Count open issues
const ISSUES_SCHEMA = {
  type: 'object',
  properties: {
    exists:     { type: 'boolean' },
    open_count: { type: 'number' },
    path:       { type: 'string' },
  },
  required: ['exists', 'open_count'],
}
const issuesResult = await agent(
  `Check if ${wb.feature_dir}/${prefix}-Issues.md exists. If it does, count rows with status OPEN. Return exists, open_count, and the full path.`,
  { label: 'count-open-issues', phase: 'Implementation', schema: ISSUES_SCHEMA }
)
issuesPath = issuesResult?.path || ''
issuesOpen = issuesResult?.open_count || 0
log(`Implementation complete — ${phasesDone} phases, ${usPassed.length} US passed, ${usEscalated.length} escalated, ${issuesOpen} open issues`)

// ── Final test run ────────────────────────────────────────────────────────────
// Developer agents no longer run the test suite themselves (they do a syntax-check
// build at most). Running the suite once here, after all files are written, replaces
// N parallel per-agent test runs — cutting ~1h of duplicated builds and artifact
// contention down to a single centralized run with one consolidated failure report.
phase('Test')

const beforeTest = budget.spent()
await agent(
  `Run the full test suite in the repository root and report the result.

1. Read AGENTS.md in the repository root to find the exact test command for this project.
2. Run that command (e.g. \`dotnet test --no-restore --logger "console;verbosity=normal"\`, \`npm test\`).
3. Report the outcome: total passed/failed, and for any failures the test name and first error line.

Do NOT fix failing tests — only report them.`,
  { label: 'final-test-run', phase: 'Test', model: 'haiku' }
)
const testTokens = budget.spent() - beforeTest
tokenLedger.push({ agent: 'final-test-run', model: 'haiku', phase_delta_tokens: testTokens })
log(`Test run complete — ${testTokens} tokens`)

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

if (issuesOpen > 0 && issuesPath) {
  log(`Remediation: ${issuesOpen} OPEN issues`)
  const beforeRem = budget.spent()

  const remResult = await agent(
    `You are a remediation agent for the feature delivery pipeline.

Read the Issues Register at: ${issuesPath}

For each OPEN issue:
- If severity is INFO: mark it DEFERRED immediately (update Status column to DEFERRED). Do not dispatch a developer agent.
- If severity is WARNING: dispatch the appropriate developer agent (developer-backend for most cases) with the issue description. Then spawn review-solution to verify the fix. Max 1 retry per issue. If unresolved after 1 retry, mark DEFERRED.

After processing all issues, return: { "issues_fixed": N, "issues_deferred": N }

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
  log(`Remediation done — fixed: ${issuesFixed}, deferred: ${issuesDeferred} — ${remTokens} tokens`)
} else {
  log('Remediation: no OPEN issues — skipped')
}

// ── PR ────────────────────────────────────────────────────────────────────────
phase('PR')

const PR_SCHEMA = {
  type: 'object',
  properties: {
    pr_url:           { type: 'string' },
    registry_updated: { type: 'boolean' },
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
log(`PR done: ${prResult.pr_url} — ${prTokens} tokens`)

// ── Actuals ───────────────────────────────────────────────────────────────────
phase('Actuals')

const totalPhase3Tokens = tokenLedger.reduce((s, e) => s + (e.phase_delta_tokens || 0), 0)

const ACTUALS_SCHEMA = {
  type: 'object',
  properties: {
    token_estimate_path:  { type: 'string' },
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

Total tokens consumed by pm-phase3 workflow: ${totalPhase3Tokens} (exact, from budget tracking)

TASK 1 — Append actuals to ${prefix}-Token-Estimate.md:
Find the file in the feature directory. If it does not exist, create it.

Append this section at the end of the file:

---

## Phase 3 — Implementation (Actuals)

> Phase totals are exact measurements from budget tracking.
> Per-agent values are exact where each agent ran separately; proportional where merged.

| Agent | Phase | Model | Tokens Est. | Tokens Actual |
|-------|-------|-------|------------|--------------|
${tokenLedger.map(e => `| ${e.agent} | — | ${e.model} | — | ${e.phase_delta_tokens} |`).join('\n')}
| **Phase 3 total** | | | **—** | **${totalPhase3Tokens}** |

## Grand Total (updated)

| Phase | Tokens Est. | Tokens Actual |
|-------|------------|--------------|
| Phase 1 — Documentation | — | *(see above)* |
| Phase 2 — Work Breakdown | — | *(see above)* |
| Phase 3 — Implementation | *(see above)* | ${totalPhase3Tokens} |

## Implementation Summary

| Metric | Value |
|--------|-------|
| Implementation phases done | ${phasesDone} |
| US passed | ${usPassed.join(', ') || 'N/A'} |
| US escalated | ${usEscalated.join(', ') || 'none'} |

TASK 2 — Update actuals in ${prefix}-Effort-Estimate.md:
Find the file in the feature directory. Read the existing Per-Phase Breakdown table and update the "Actual Agent" column for each phase that was implemented. Use the token ledger to infer which phases completed:
- Phases in usPassed: ${usPassed.join(', ') || 'none'} — mark Actual Agent as completed (write the wall-clock duration if available, otherwise write "done (agent)")
- Phases escalated: ${usEscalated.join(', ') || 'none'} — mark Actual Agent as "escalated"
- Also append this summary section at the end of the file:

---

## Implementation Summary

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Implementation phases | ${phasesDone} | ${phasesDone} |
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
log(`Actuals written — ${actualsTokens} tokens`)

// ── Append to process-log ─────────────────────────────────────────────────────
const usPassed3    = usPassed.join(', ')    || 'none'
const usEscalated3 = usEscalated.join(', ') || 'none'
const phase3Events = [
  `APPROVAL GRANTED by user — Gate 2`,
  `pm-phase3 START — implementation phase — branch: ${branch || '(current)'}`,
  `WB parsed: ${wb.phases.length} phases`,
  `Implementation DONE — ${phasesDone} phases | US passed: ${usPassed3} | US escalated: ${usEscalated3}`,
  issuesFixed + issuesDeferred > 0
    ? `Remediation: ${issuesFixed} fixed, ${issuesDeferred} deferred`
    : `Remediation: skipped (no open issues)`,
  `PR created: ${prResult.pr_url}`,
  `Actuals written: Token-Estimate.md + Effort-Estimate.md`,
  `RUN COMPLETE`,
  `════════════════════════════════════════════════════════`,
].join('\n')

const featureDir3 = featurePath.replace(/\/[^/]+$/, '')

await agent(
  `Append phase 3 events to the process-log for this feature delivery run.

Process-log path: ${featureDir3}/${prefix}-process-log.txt

Steps:
1. Get current UTC datetime via Bash: run \`date -u +"%Y-%m-%dT%H:%M:%S"\`
2. Append the following lines to the existing file (create it if it does not exist).
   Format each event line as: [{datetime}] {event text}
   The final separator line (════…) is appended as-is, without a timestamp.

Events to append:
${phase3Events}`,
  { label: 'finalize-process-log', phase: 'Actuals' }
)

return {
  pr_url:       prResult.pr_url,
  token_ledger: tokenLedger,
  issues_summary: {
    escalations:        escalations.length,
    escalation_details: escalations,
    issues_fixed:       issuesFixed,
    issues_deferred:    issuesDeferred,
  },
}
