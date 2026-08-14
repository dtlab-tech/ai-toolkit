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

// ── Ledger helper functions ───────────────────────────────────────────────────
// Route all ledger I/O through agent() — fs and require() are not available in
// the Workflow runtime. Mirrors the pattern used by pm-phase2.js.

async function appendLedgerEntry(featureDir, prefix, entry) {
  const ledgerPath = `${featureDir}/${prefix}-token-ledger.json`
  const entryWithoutTs = JSON.stringify({ ...entry, started_at: '__TS__', completed_at: null })
  await agent(
    `Append a JSON object to the ledger array at: ${ledgerPath}\n\n` +
    `1. Run: date -u +"%Y-%m-%dT%H:%M:%SZ" and capture the output as NOW.\n` +
    `2. Read the file. If it does not exist or cannot be parsed as a JSON array, start with [].\n` +
    `3. Push this object onto the array, replacing "__TS__" in started_at with NOW: ${entryWithoutTs}\n` +
    `4. Write the full array back (JSON, 2-space indent). Return no output.`,
    { label: 'append-ledger', phase: 'Implementation', model: 'haiku' }
  )
}

async function updateLedgerEntry(featureDir, prefix, agentKey, updates) {
  const ledgerPath = `${featureDir}/${prefix}-token-ledger.json`
  const updatesWithoutTs = JSON.stringify({ ...updates, completed_at: '__TS__' })
  await agent(
    `Update an entry in the ledger array at: ${ledgerPath}\n\n` +
    `1. Run: date -u +"%Y-%m-%dT%H:%M:%SZ" and capture the output as NOW.\n` +
    `2. Read the file. If it does not exist or cannot be parsed as a JSON array, do nothing.\n` +
    `3. Search from the end for the last entry where agent === "${agentKey}".\n` +
    `4. If found, merge these fields into that entry, replacing "__TS__" in completed_at with NOW: ${updatesWithoutTs}\n` +
    `5. Write the full array back (JSON, 2-space indent). Return no output.\n` +
    `6. If not found, do nothing.`,
    { label: 'update-ledger', phase: 'Implementation', model: 'haiku' }
  )
}

// ── Parse args ────────────────────────────────────────────────────────────────

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

await appendLedgerEntry(featureDir, prefix, { agent: 'read-wb-csv:phase3', phase: 'phase3', model: 'haiku', status: 'running', phase_delta_tokens: 0, started_at: '__TS__', completed_at: null })
const beforeCsv = budget.spent()
const csvContent = await agent(
  `Read the file at path: ${csvPath}\nReturn ONLY the raw file contents, nothing else. No explanation, no formatting, no JSON wrapping — just the raw text of the file.`,
  { label: 'read-wb-csv', phase: 'Parse', model: 'haiku' }
)
await updateLedgerEntry(featureDir, prefix, 'read-wb-csv:phase3', { status: 'done', completed_at: '__TS__', phase_delta_tokens: budget.spent() - beforeCsv })

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
      const implKey = `${implPhase.impl_groups.map(g => g.agent_type).join('+')}:${implPhase.phase_id}${reworkCycle > 0 ? ':rework' + reworkCycle : ''}`
      await appendLedgerEntry(featureDir, prefix, { agent: implKey, phase: 'phase3', model: 'sonnet', status: 'running', phase_delta_tokens: 0, started_at: '__TS__', completed_at: null })
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
      await updateLedgerEntry(featureDir, prefix, implKey, { status: 'done', completed_at: '__TS__', phase_delta_tokens: implTokens })
      tokenLedger.push({ agent: implKey, model: 'sonnet', phase_delta_tokens: implTokens })
      log(`Phase ${implPhase.phase_id} impl groups done — ${implTokens} tokens`)
    }

    // Step 2 — test groups in parallel (TEST) — after impl groups
    if (implPhase.test_groups.length > 0) {
      const testKey = `developer-testing:${implPhase.phase_id}${reworkCycle > 0 ? ':rework' + reworkCycle : ''}`
      await appendLedgerEntry(featureDir, prefix, { agent: testKey, phase: 'phase3', model: 'sonnet', status: 'running', phase_delta_tokens: 0, started_at: '__TS__', completed_at: null })
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
      await updateLedgerEntry(featureDir, prefix, testKey, { status: 'done', completed_at: '__TS__', phase_delta_tokens: testTokens })
      tokenLedger.push({ agent: testKey, model: 'sonnet', phase_delta_tokens: testTokens })
      log(`Phase ${implPhase.phase_id} test groups done — ${testTokens} tokens`)
    }

    // Step 3 — review-solution
    const reviewKey = `review-solution:${implPhase.phase_id}`
    await appendLedgerEntry(featureDir, prefix, { agent: reviewKey, phase: 'phase3', model: 'sonnet', status: 'running', phase_delta_tokens: 0, started_at: '__TS__', completed_at: null })
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
    await updateLedgerEntry(featureDir, prefix, reviewKey, { status: 'done', completed_at: '__TS__', phase_delta_tokens: reviewTokens })
    tokenLedger.push({
      agent: reviewKey,
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

await appendLedgerEntry(featureDir, prefix, { agent: 'final-test-run', phase: 'phase3', model: 'haiku', status: 'running', phase_delta_tokens: 0, started_at: '__TS__', completed_at: null })
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
await updateLedgerEntry(featureDir, prefix, 'final-test-run', { status: 'done', completed_at: '__TS__', phase_delta_tokens: testTokens })
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
  await appendLedgerEntry(featureDir, prefix, { agent: 'remediation', phase: 'phase3', model: 'sonnet', status: 'running', phase_delta_tokens: 0, started_at: '__TS__', completed_at: null })
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
  await updateLedgerEntry(featureDir, prefix, 'remediation', { status: 'done', completed_at: '__TS__', phase_delta_tokens: remTokens })
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

await appendLedgerEntry(featureDir, prefix, { agent: 'pr-and-registry', phase: 'phase3', model: 'sonnet', status: 'running', phase_delta_tokens: 0, started_at: '__TS__', completed_at: null })
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
await updateLedgerEntry(featureDir, prefix, 'pr-and-registry', { status: 'done', completed_at: '__TS__', phase_delta_tokens: prTokens })
tokenLedger.push({ agent: 'pr-and-registry', model: 'sonnet', phase_delta_tokens: prTokens })
log(`PR done: ${prResult.pr_url} — ${prTokens} tokens`)

// ── Actuals ───────────────────────────────────────────────────────────────────
phase('Actuals')

// Fallback: merge in any ledger entries that were persisted to disk but are missing
// from the in-memory ledger (e.g. this is a resumed run and earlier phases ran in a
// previous, interrupted invocation). The in-memory ledger has priority for entries
// present in both — it reflects the most recent measurements.
const persistedLedgerRaw = await agent(
  `Read ${featureDir}/${prefix}-token-ledger.json and return its contents as a raw JSON string, nothing else. If the file does not exist, return exactly "[]".`,
  { label: 'read-ledger', phase: 'Actuals', model: 'haiku' }
)
try {
  const persisted = JSON.parse(typeof persistedLedgerRaw === 'string' ? persistedLedgerRaw.trim() : '[]')
  if (Array.isArray(persisted)) {
    const inMemoryByAgent = new Map(tokenLedger.map((e, i) => [e.agent, i]))
    for (const entry of persisted) {
      if (!entry || !entry.agent) continue
      const idx = inMemoryByAgent.get(entry.agent)
      if (idx === undefined) {
        // entry exists on disk but not in memory — recover it (e.g. from a prior interrupted run)
        tokenLedger.push(entry)
        inMemoryByAgent.set(entry.agent, tokenLedger.length - 1)
        log(`Recovered ledger entry from disk: ${entry.agent} (${entry.phase_delta_tokens} tokens)`)
      } else if (tokenLedger[idx].phase_delta_tokens === 0 && (entry.phase_delta_tokens || 0) > 0) {
        // in-memory entry has delta=0 (cached agent on resume) but disk has real data — prefer disk
        tokenLedger[idx] = entry
        log(`Restored real token count from disk: ${entry.agent} (${entry.phase_delta_tokens} tokens)`)
      }
    }
  }
} catch (e) {
  log(`Could not parse persisted token ledger — using in-memory ledger only`)
}

const totalPhase3Tokens = tokenLedger.reduce((s, e) => s + (e.phase_delta_tokens || 0), 0)

// ── Load token pricing for cost columns ──────────────────────────────────────
const pricingRaw3 = await agent(
  `Read the file docs/token-pricing.json and return its raw JSON contents as a string, nothing else.`,
  { label: 'read-pricing', phase: 'Actuals', model: 'haiku' }
)
let pricing3 = null
try { pricing3 = JSON.parse(typeof pricingRaw3 === 'string' ? pricingRaw3.trim() : '{}') } catch (_) {}

function tokenCostEur3(tokens, model) {
  if (!pricing3 || !pricing3.models) return null
  const m = pricing3.models[model] || pricing3.models['sonnet']
  const usdPer1M = 0.8 * m.input_per_1m_usd + 0.2 * m.output_per_1m_usd
  return (tokens * usdPer1M / 1_000_000) * (pricing3.usd_to_eur || 1)
}

function formatEur3(val) {
  if (val === null || val === undefined) return '—'
  return '€' + val.toFixed(4)
}

// Aggregate the per-agent ledger into per-role totals so the actuals line up with the
// per-role estimate rows pm-phase2 wrote (developer-backend, developer-testing,
// review-solution, pr-and-registry, write-actuals, plus final-test-run). Precomputing
// here keeps the write-actuals agent from having to reason about grouping.
const roleTotals = {}
const roleModels = {}
for (const e of tokenLedger) {
  const role = String(e.agent).split(':')[0]
  roleTotals[role] = (roleTotals[role] || 0) + (e.phase_delta_tokens || 0)
  roleModels[role] = e.model || 'sonnet'
}
const roleRows = Object.entries(roleTotals)
  .map(([role, tok]) => `| ${role} | ${tok} | ${formatEur3(tokenCostEur3(tok, roleModels[role]))} |`)
  .join('\n')
const totalPhase3CostEur = formatEur3(
  Object.entries(roleTotals).reduce((s, [role, tok]) => s + (tokenCostEur3(tok, roleModels[role]) || 0), 0)
)

const ACTUALS_SCHEMA = {
  type: 'object',
  properties: {
    token_estimate_path:  { type: 'string' },
    effort_estimate_path: { type: 'string' },
  },
  required: [],
}

await appendLedgerEntry(featureDir, prefix, { agent: 'write-actuals', phase: 'phase3', model: 'sonnet', status: 'running', phase_delta_tokens: 0, started_at: '__TS__', completed_at: null })
const beforeActuals = budget.spent()

await agent(
  `You are the actuals recorder for the feature delivery pipeline.

Feature path: ${featurePath}
Prefix: ${prefix}

Token ledger (phase-level measurements):
${JSON.stringify(tokenLedger, null, 2)}

Total tokens consumed by pm-phase3 workflow: ${totalPhase3Tokens} (exact, from budget tracking)

TASK 1 — Fill in the Phase 3 actuals in ${prefix}-Token-Estimate.md IN PLACE.
Read the file in the feature directory first (it was written by pm-phase2 and already contains
Phase 1/Phase 2 actuals and the Phase 3 estimate table). If it does not exist, create it.

Do NOT append a second Phase 3 table. Instead:

1. Locate the existing "## Phase 3 — Implementation (Estimates)" section. Replace its heading
   with "## Phase 3 — Implementation (Est. vs Actual, by role)" and REPLACE its table with the
   per-role reconciliation below — filling the "Tokens Actual" and "Actual cost €" columns of the
   existing per-role estimate rows (keep the existing Tokens Est. and Est. cost € values; add a Delta column):

| Role | Model | Tokens Actual | Actual cost € |
|------|-------|--------------|--------------|
${roleRows}
| **Phase 3 total** | | **${totalPhase3Tokens}** | **${totalPhase3CostEur}** |

   Match each existing estimate row (developer-backend, developer-testing, review-solution,
   remediation, pr-and-registry, write-actuals) to the actual role total above by name, write the
   actual into its "Tokens Actual" and "Actual cost €" cells, and compute Delta = Actual − Est (tokens).
   Roles present in the actuals but absent from the estimate rows (e.g. final-test-run) get a new row with Est. = —.

2. Immediately after that table, add the per-agent detail as a sub-table (source of truth):

### Phase 3 — per-agent detail (actuals)

| Agent | Model | Tokens Actual | Actual cost € |
|-------|-------|--------------|--------------|
${tokenLedger.map(e => `| ${e.agent} | ${e.model} | ${e.phase_delta_tokens} | ${formatEur3(tokenCostEur3(e.phase_delta_tokens, e.model))} |`).join('\n')}
| **Detail total** | | **${totalPhase3Tokens}** | **${totalPhase3CostEur}** |

3. Update the existing "## Grand Total" table. Read the Phase 1 and Phase 2 actual totals from
   the top of THIS SAME file (the "Phase 1 total" and "Phase 2 total" rows already present) and
   copy them verbatim — never the literal text "(see above)". If a value there is "—" (Phase 1 is
   written as a placeholder by pm-phase2 and filled later by the orchestrator), keep it as "—";
   do NOT invent a number. The table must read:

| Phase | Tokens Est. | Est. cost € | Tokens Actual | Actual cost € | Delta (tokens) |
|-------|------------|------------|--------------|--------------|---------------|
| Phase 1 — Documentation | — | — | {Phase 1 total from this file, or — if placeholder} | — | — |
| Phase 2 — Work Breakdown | — | — | {Phase 2 total from this file} | {Phase 2 cost from this file} | — |
| Phase 3 — Implementation | {existing Phase 3 estimate total} | {existing Phase 3 est. cost} | ${totalPhase3Tokens} | ${totalPhase3CostEur} | {Actual − Est} |
| **Total** | **{sum of numeric Est}** | **{sum of numeric Est. cost}** | **{sum of numeric Actual}** | **{sum of numeric Actual cost}** | **{Actual − Est}** |

4. Append (or update if present) the Implementation Summary section:

## Implementation Summary

| Metric | Value |
|--------|-------|
| Implementation phases done | ${phasesDone} |
| US passed | ${usPassed.join(', ') || 'N/A'} |
| US escalated | ${usEscalated.join(', ') || 'none'} |

Remove the stale "*Actuals will be appended by pm-phase3...*" footer line if it is still present.

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
await updateLedgerEntry(featureDir, prefix, 'write-actuals', { status: 'done', completed_at: '__TS__', phase_delta_tokens: actualsTokens })
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

await agent(
  `Commit the actuals files for this feature delivery run.

Run these exact git commands in the repository root:
  git add "${featureDir3}/${prefix}-Token-Estimate.md" "${featureDir3}/${prefix}-Effort-Estimate.md" "${featureDir3}/${prefix}-process-log.txt"
  git commit -m "docs(${prefix}): add token/effort actuals and process log"

If there is nothing to commit (all files already committed), that is fine — report success.`,
  { label: 'commit-actuals', phase: 'Actuals' }
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
