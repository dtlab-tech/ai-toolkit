export const meta = {
  name: 'pm-phase3',
  description: 'Feature delivery phase 3: parse WB → dispatch specialist agents per US (commit per phase) → single architect review → PR → actuals.',
  phases: [
    { title: 'Parse',          detail: 'Parse Work Breakdown CSV into structured phases' },
    { title: 'Implementation', detail: 'Dispatch developer agents per phase, commit each one' },
    { title: 'Review',         detail: 'Single architect review on full feature diff' },
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

// ── Parse Work Breakdown CSV (deterministic, no AI) ───────────────────────────
phase('Parse')

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
  .filter(l => l && !l.startsWith('phase_id'))
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
      depends_on:     row.depends_on.split(' ').filter(Boolean),
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

// Build execution waves: phases whose dependencies are all satisfied run in parallel
const buildWaves = (phases) => {
  const done   = new Set()
  const waves  = []
  let remaining = [...phases]
  while (remaining.length > 0) {
    const ready = remaining.filter(p => p.depends_on.every(d => done.has(d)))
    if (ready.length === 0) {
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

let phasesDone = 0
const usPassed = []

// ── Implementation ────────────────────────────────────────────────────────────
phase('Implementation')

// executePhase: impl_groups (parallel) → test_groups (parallel) → commit
// No inline review — review runs once after all phases complete.
const executePhase = async (implPhase) => {
  log(`Starting phase ${implPhase.phase_id}: ${implPhase.title}`)

  // Step 1 — impl groups in parallel (INFRA / BE / FE)
  if (implPhase.impl_groups.length > 0) {
    const beforeImpl = budget.spent()
    await parallel(implPhase.impl_groups.map(group => () =>
      agent(
        `${featurePath} ${group.task_ids.join(',')}`,
        {
          agentType: group.agent_type,
          label:     `${group.agent_type}:${implPhase.phase_id}`,
          phase:     'Implementation',
        }
      )
    ))
    const implTokens = budget.spent() - beforeImpl
    tokenLedger.push({
      agent:              `${implPhase.impl_groups.map(g => g.agent_type).join('+')}:${implPhase.phase_id}`,
      model:              'sonnet',
      phase_delta_tokens: implTokens,
    })
    log(`Phase ${implPhase.phase_id} impl done — ${implTokens} tokens`)
  }

  // Step 2 — test groups in parallel (TEST)
  if (implPhase.test_groups.length > 0) {
    const beforeTest = budget.spent()
    await parallel(implPhase.test_groups.map(group => () =>
      agent(
        `${featurePath} ${group.task_ids.join(',')}`,
        {
          agentType: group.agent_type,
          label:     `developer-testing:${implPhase.phase_id}`,
          phase:     'Implementation',
        }
      )
    ))
    const testTokens = budget.spent() - beforeTest
    tokenLedger.push({
      agent:              `developer-testing:${implPhase.phase_id}`,
      model:              'sonnet',
      phase_delta_tokens: testTokens,
    })
    log(`Phase ${implPhase.phase_id} tests done — ${testTokens} tokens`)
  }

  // Step 3 — commit this phase
  const commitMsg = implPhase.commit_message || `feat(${prefix}): implement ${implPhase.phase_id}`
  await agent(
    `Run these git commands in the repository root:\ngit add -A\ngit commit -m "${commitMsg}"\nIf there is nothing to commit, that is fine — just report success.`,
    { label: `commit:${implPhase.phase_id}`, phase: 'Implementation', model: 'haiku' }
  )

  if (implPhase.phase_id !== 'INFRA') usPassed.push(implPhase.phase_id)
  phasesDone++
  log(`Phase ${implPhase.phase_id} committed`)
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

log(`Implementation complete — ${phasesDone} phases, ${usPassed.length} US implemented`)

// ── Review — single pass over the full feature diff ───────────────────────────
phase('Review')

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    has_critical:  { type: 'boolean' },
    findings:      { type: 'string' },
    issues_md:     { type: 'string' },
  },
  required: ['has_critical'],
}

const beforeReview = budget.spent()
const review = await agent(
  `${featurePath} --scope all`,
  {
    agentType: 'review-solution',
    label:     'review-solution:full-feature',
    phase:     'Review',
    schema:    REVIEW_SCHEMA,
  }
)
const reviewTokens = budget.spent() - beforeReview
tokenLedger.push({ agent: 'review-solution:full-feature', model: 'sonnet', phase_delta_tokens: reviewTokens })

let issuesOpen     = 0
let issuesPath     = `${wb.feature_dir}/${prefix}-Issues.md`
let hasCritical    = false

if (review) {
  hasCritical = review.has_critical || false
  if (review.issues_md) {
    await agent(
      `Write the following content to ${issuesPath} (create or overwrite the file):\n\n# Issues Register — ${prefix}\n\n${review.issues_md}`,
      { label: 'write-issues', phase: 'Review', model: 'haiku' }
    )
    // Count OPEN issues from issues_md (rough count of "OPEN" occurrences)
    issuesOpen = (review.issues_md.match(/\bOPEN\b/g) || []).length
    log(`Review complete — has_critical: ${hasCritical}, open issues: ${issuesOpen}`)
  } else {
    log(`Review complete — no issues found`)
  }
} else {
  log(`Review agent returned null — skipping issues register`)
}

if (hasCritical) {
  log(`WARNING: critical issues found — PR will be created but marked as blocked. Inspect ${prefix}-Issues.md before merging.`)
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
Critical issues found: ${hasCritical}
Open issues: ${issuesOpen}

Your tasks:

1. Push the branch:
   git push -u origin ${branch || 'HEAD'}

2. Create a PR targeting develop:
   gh pr create \\
     --title "feat(${prefix}): <Feature Title from feature.md>" \\
     --base develop \\
     --body "## Summary
- Implements <Feature Title from feature.md> (${usPassed.length} User Stories, ${phasesDone} phases)
- Source docs: ${prefix}-Requirements.md, ${prefix}-Tech-Spec.md

## Implementation
- Phases implemented: ${usPassed.join(', ') || 'N/A'}
- Architect review: ${hasCritical ? '⚠️ CRITICAL issues found — see ' + prefix + '-Issues.md before merging' : '✅ No critical issues'}
- Open issues: ${issuesOpen} → see ${prefix}-Issues.md

## Test plan
- [ ] Build passes
- [ ] Tests pass
- [ ] Manual smoke test of key flows"

3. Update the Feature Registry (internal_docs/features/REGISTRY.md):
   Find or append the entry for ${prefix}. Set Status to "${hasCritical ? 'review-required' : 'completed'}".

Return { "pr_url": "<url>", "registry_updated": true/false }.
If the PR already exists, return its URL. If creation fails, return { "pr_url": "(PR creation failed)", "registry_updated": false }.`,
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
| US implemented | ${usPassed.join(', ') || 'N/A'} |
| Critical issues | ${hasCritical} |
| Open issues | ${issuesOpen} |

TASK 2 — Update actuals in ${prefix}-Effort-Estimate.md:
Find the file in the feature directory. Read the existing Per-Phase Breakdown table and update
the "Actual Agent" column for each phase that was implemented:
- Phases implemented (${usPassed.join(', ') || 'none'} + INFRA): write "done (agent)"
- Any phase not in the list: leave "—"

Also append this section at the end of the file:

---

## Implementation Summary

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Implementation phases | ${phasesDone} | ${phasesDone} |
| Critical review issues | — | ${hasCritical ? 'yes' : 'none'} |
| Open issues | — | ${issuesOpen} |

Return { "token_estimate_path": "<path>", "effort_estimate_path": "<path>" }.`,
  {
    label:  'write-actuals',
    phase:  'Actuals',
    schema: { type: 'object', properties: { token_estimate_path: { type: 'string' }, effort_estimate_path: { type: 'string' } }, required: [] },
  }
)

const actualsTokens = budget.spent() - beforeActuals
tokenLedger.push({ agent: 'write-actuals', model: 'sonnet', phase_delta_tokens: actualsTokens })
log(`Actuals written — ${actualsTokens} tokens`)

// ── Append to process-log ─────────────────────────────────────────────────────
const phase3Events = [
  `APPROVAL GRANTED by user — Gate 2`,
  `pm-phase3 START — implementation phase — branch: ${branch || '(current)'}`,
  `WB parsed: ${wb.phases.length} phases`,
  `Implementation DONE — ${phasesDone} phases implemented: ${usPassed.join(', ') || 'none'}`,
  `Review DONE — critical: ${hasCritical}, open issues: ${issuesOpen}`,
  `PR created: ${prResult.pr_url}`,
  `Actuals written: Token-Estimate.md + Effort-Estimate.md`,
  `RUN COMPLETE`,
  `════════════════════════════════════════════════════════`,
].join('\n')

await agent(
  `Append phase 3 events to the process-log for this feature delivery run.

Process-log path: ${featureDir}/${prefix}-process-log.txt

Steps:
1. Get current UTC datetime via Bash: run \`date -u +"%Y-%m-%dT%H:%M:%S"\`
2. Append the following lines to the existing file (create it if it does not exist).
   Format each event line as: [{datetime}] {event text}
   The final separator line (════…) is appended as-is, without a timestamp.

Events to append:
${phase3Events}`,
  { label: 'finalize-process-log', phase: 'Actuals', model: 'haiku' }
)

return {
  pr_url:       prResult.pr_url,
  token_ledger: tokenLedger,
  issues_summary: {
    has_critical: hasCritical,
    open_issues:  issuesOpen,
  },
}
