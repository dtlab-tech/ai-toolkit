/**
 * am-phase1.js — Assessment Pipeline: Assessment Phase
 *
 * Workflow phase 1 of the codebase assessment pipeline.
 * Runs: discover assessment agents → apply scope filter →
 *       invoke all assessment agents in parallel via agentType: →
 *       invoke intervention-documentation-standard →
 *       write Token-Estimate and Effort-Estimate →
 *       return findings_gate_payload.
 *
 * Inputs (from skill prompt):
 *   <target_path> [--scope=area1,area2] [--prefix ASSESS-NNN] [--force]
 *
 * Outputs (files written):
 *   docs/assessments/{PREFIX}/{PREFIX}-*-Assessment.md (one per agent)
 *   docs/assessments/{PREFIX}/{PREFIX}-INT-NNN-*.md (one per intervention)
 *   docs/assessments/{PREFIX}/{PREFIX}-Interventions-Index.md
 *   docs/assessments/{PREFIX}/{PREFIX}-Token-Estimate.md
 *   docs/assessments/{PREFIX}/{PREFIX}-Effort-Estimate.md
 *   docs/assessments/{PREFIX}/{PREFIX}-process-log.txt (appended)
 *
 * Returns (to skill):
 *   findings_gate_payload — summary data for Findings Gate presentation
 */

const fs   = require('fs');
const path = require('path');

// ── helpers ───────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function appendLog(logPath, message) {
  const line = `[${now()}] ${message}\n`;
  fs.appendFileSync(logPath, line, 'utf8');
}

function fileExists(filePath) {
  try { return fs.statSync(filePath).isFile(); } catch { return false; }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function readFileSafe(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
}

// ── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(prompt) {
  const parts    = prompt.trim().split(/\s+/);
  const args     = { target_path: '.', scope: null, prefix: null, force: false };
  const prefixIdx = parts.indexOf('--prefix');
  if (prefixIdx >= 0 && parts[prefixIdx + 1]) {
    args.prefix = parts[prefixIdx + 1];
  }
  for (const part of parts) {
    if (part.startsWith('--scope=')) {
      args.scope = part.slice('--scope='.length).split(',').map(s => s.trim());
    } else if (part === '--force') {
      args.force = true;
    } else if (!part.startsWith('--') && part !== args.prefix) {
      args.target_path = part;
    }
  }
  return args;
}

// ── Determine assessment prefix ───────────────────────────────────────────────

function determinePrefix(explicitPrefix) {
  if (explicitPrefix) return explicitPrefix;
  const registryDir = path.join('docs', 'assessments');
  ensureDir(registryDir);
  let maxNum = 0;
  try {
    for (const entry of fs.readdirSync(registryDir)) {
      const m = entry.match(/^ASSESS-(\d+)/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
  } catch { /* no registry dir yet */ }
  const num = String(maxNum + 1).padStart(3, '0');
  return `ASSESS-${num}`;
}

// ── Discover assessment agents ────────────────────────────────────────────────

function discoverAssessmentAgents(agentsDir) {
  const ASSESSMENT_KEYWORDS = ['assessment', 'audit', 'analysis'];
  const agents = [];
  try {
    for (const file of fs.readdirSync(agentsDir)) {
      if (!file.endsWith('.md')) continue;
      const content = readFileSafe(path.join(agentsDir, file)) || '';
      const isAssessment = ASSESSMENT_KEYWORDS.some(kw =>
        content.toLowerCase().includes(kw)
      );
      const isOrchestrator = file.includes('manager') || file.includes('project-manager');
      if (isAssessment && !isOrchestrator) {
        // Extract name from frontmatter
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        agents.push({
          file,
          name: nameMatch ? nameMatch[1].trim() : file.replace('.md', ''),
        });
      }
    }
  } catch (err) {
    // agents dir not found — return empty
  }
  return agents;
}

// ── Scope filtering ───────────────────────────────────────────────────────────

const SCOPE_AGENT_MAP = {
  architecture:  ['layered-architecture-assessment'],
  security:      ['security-hardening'],
  quality:       ['generic-software-assessment'],
  concurrency:   ['concurrency-safety-assessment'],
  devops:        [],
  'domain-model': ['domain-model-refactoring'],
  dependencies:  ['dependency-supply-chain-security'],
};

function filterByScope(agents, scope) {
  if (!scope || scope.length === 0) return agents;
  const allowed = new Set(scope.flatMap(s => SCOPE_AGENT_MAP[s] || []));
  return agents.filter(a => allowed.has(a.name));
}

// ── Token estimation (sonnet blended rate) ────────────────────────────────────

const SONNET_BLENDED_RATE = 0.005400; // $/1k tokens

const AGENT_INPUT_SIZE_ESTIMATES = {
  'generic-software-assessment':        28000,
  'layered-architecture-assessment':    20500,
  'concurrency-safety-assessment':      18000,
  'intervention-documentation-standard': 15500,
};

function estimateTokens(agentName) {
  return AGENT_INPUT_SIZE_ESTIMATES[agentName] || 15500;
}

function estimateCost(tokens) {
  return (tokens * SONNET_BLENDED_RATE / 1000).toFixed(4);
}

function actualCost(tokens) {
  if (tokens === 'N/A') return 'N/A';
  return (tokens * SONNET_BLENDED_RATE / 1000).toFixed(4);
}

// ── Severity count from Interventions Index ───────────────────────────────────

function extractSeverityCounts(indexPath) {
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const content = readFileSafe(indexPath);
  if (!content) return counts;
  const lines = content.split('\n');
  for (const line of lines) {
    if (!line.startsWith('|') || line.includes('Criticality')) continue;
    for (const sev of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
      if (line.includes(sev)) counts[sev]++;
    }
  }
  return counts;
}

// ── Build Token Estimate file ─────────────────────────────────────────────────

function buildTokenEstimate(prefix, agentResults, interventionResult) {
  const agentRows = agentResults.map(r => {
    const estTokens   = estimateTokens(r.agent);
    const estCost     = estimateCost(estTokens);
    const actTokens   = r.actual_tokens;
    const actCost     = actualCost(actTokens);
    return `| ${r.agent} | sonnet | ${estTokens.toLocaleString()} | $${estCost} | ${actTokens} | ${actTokens !== 'N/A' ? '$' + actCost : 'N/A'} | complete |`;
  }).join('\n');

  const intEstTokens = estimateTokens('intervention-documentation-standard');
  const intEstCost   = estimateCost(intEstTokens);
  const intActTokens = interventionResult ? interventionResult.actual_tokens : 'N/A';
  const intActCost   = interventionResult ? actualCost(intActTokens) : 'N/A';
  const intRow = `| intervention-documentation-standard | sonnet | ${intEstTokens.toLocaleString()} | $${intEstCost} | ${intActTokens} | ${intActTokens !== 'N/A' ? '$' + intActCost : 'N/A'} | complete |`;

  const totalEstTokens = agentResults.reduce((s, r) => s + estimateTokens(r.agent), 0) + intEstTokens;
  const totalActTokens = [...agentResults, interventionResult || {}]
    .map(r => r.actual_tokens)
    .filter(t => t !== 'N/A' && t !== undefined)
    .reduce((s, t) => s + t, 0);

  return `# Token Estimate — ${prefix} — Assessment Pipeline

> Estimates computed before execution. Actuals accumulated as agents complete.
> Assessment agents (Phase 3) actuals: filled at end of phase.
> Intervention documentation (Phase 4) actuals: filled on completion.
> Orchestrator row added by assess-codebase skill at pipeline end.
> Pricing model: docs/pricing.md (80% input / 20% output split).

## Estimation model

| Parameter | Value |
|-----------|-------|
| Avg chars per token | 4 |
| Haiku system prompt | ~2,000 tokens |
| Sonnet system prompt | ~3,000 tokens |
| Base overhead per call | ~5,000 tokens |
| Input/output split | 80% / 20% |

## Assessment agents (Phase 3)

| Agent | Model | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) | Status |
|-------|-------|-------------|---------------|---------------|-----------------|--------|
${agentRows}

## Intervention documentation (Phase 4)

| Agent | Model | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) | Status |
|-------|-------|-------------|---------------|---------------|-----------------|--------|
${intRow}

## Remediation

Remediation effort is tracked separately via the feature delivery pipeline (not part of this assessment).

## Phase subtotals

| Phase | Est. tokens | Est. cost ($) | Actual tokens | Actual cost ($) |
|-------|-------------|---------------|---------------|-----------------|
| Assessment (Phase 3) | ${agentResults.reduce((s, r) => s + estimateTokens(r.agent), 0).toLocaleString()} | $${estimateCost(agentResults.reduce((s, r) => s + estimateTokens(r.agent), 0))} | ${totalActTokens || 'N/A'} | ${totalActTokens ? '$' + actualCost(totalActTokens) : 'N/A'} |
| Intervention documentation (Phase 4) | ${intEstTokens.toLocaleString()} | $${intEstCost} | ${intActTokens} | ${intActTokens !== 'N/A' ? '$' + intActCost : 'N/A'} |

## Grand total

> Partial — updated at pipeline end.

| Metric | Estimated | Actual |
|--------|-----------|--------|
| Total tokens | ${totalEstTokens.toLocaleString()} | partial — updated at pipeline end |
| Total cost ($) | $${estimateCost(totalEstTokens)} | partial — updated at pipeline end |
`;
}

// ── Build Effort Estimate file ────────────────────────────────────────────────

function buildEffortEstimate(prefix, agentResults, interventionResult, scope) {
  const agentRows = agentResults.map(r => {
    const dur = r.duration_ms != null ? `${Math.round(r.duration_ms / 60000)}min` : 'N/A';
    return `| ${r.agent} | N/A | ${dur} | N/A | complete |`;
  }).join('\n');

  const batchStart = Math.min(...agentResults.map(r => r.start_ms || Date.now()));
  const batchEnd   = Math.max(...agentResults.map(r => (r.start_ms || Date.now()) + (r.duration_ms || 0)));
  const batchDur   = Math.round((batchEnd - batchStart) / 60000);

  const intDur = interventionResult
    ? `${Math.round((interventionResult.duration_ms || 0) / 60000)}min`
    : 'N/A';

  const scopeNote = scope && scope.length
    ? `\n> Note: Scope filter applied (${scope.join(', ')}). This estimate reflects only ${scope.join(', ')} assessment areas.`
    : '';

  return `# Effort Estimate — ${prefix} — Assessment Pipeline
${scopeNote}
> Wall-clock effort tracking for the assessment pipeline.
> Assessment agent durations: filled at end of Phase 3.
> Intervention documentation duration: filled at end of Phase 4.
> Remediation effort: estimated from Interventions Index at end of Phase 4 using fixed rates.
> Actual remediation effort tracked by feature delivery pipeline per intervention.
> Effort rates: CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h (human hours, sequential).

## Assessment phase

| Agent | Est. duration | Actual duration | Delta | Status |
|-------|--------------|-----------------|-------|--------|
${agentRows}
| intervention-documentation-standard | N/A | ${intDur} | N/A | complete |

## Assessment phase subtotal

| Metric | Estimated | Actual | Delta |
|--------|-----------|--------|-------|
| Phase 3 assessment batch | N/A | ${batchDur}min | N/A |
| intervention-documentation-standard | N/A | ${intDur} | N/A |
| Total | N/A | N/A | N/A |

> Note: Phase 3 "Actual" row uses batch wall-clock (max end − min start), not sum of individual durations.

## Remediation effort estimate

> Pending intervention documentation completion.
`;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(promptArgs) {
  const args = parseArgs(promptArgs);

  const targetPath = args.target_path;
  const prefix     = determinePrefix(args.prefix);
  const outputDir  = path.join('docs', 'assessments', prefix);

  ensureDir(outputDir);

  const logPath = path.join(outputDir, `${prefix}-process-log.txt`);

  appendLog(logPath, `════════════════════════════════════════════════════════`);
  appendLog(logPath, `RUN STARTED — ${now()}`);
  appendLog(logPath, `Assessment: ${prefix} — target: ${targetPath}${args.scope ? ' — scope: ' + args.scope.join(',') : ''}`);
  appendLog(logPath, `════════════════════════════════════════════════════════`);
  appendLog(logPath, `am-phase1 START — prefix: ${prefix}`);

  // ── Discover assessment agents ────────────────────────────────────────────
  const agentsDir    = path.join('.claude', 'agents');
  let allAgents      = discoverAssessmentAgents(agentsDir);
  const scopedAgents = filterByScope(allAgents, args.scope);

  appendLog(logPath, `Discovery: ${allAgents.length} assessment agents found, ${scopedAgents.length} after scope filter`);

  if (scopedAgents.length === 0) {
    appendLog(logPath, `WARNING: No assessment agents match the scope filter — proceeding with no assessment agents`);
  }

  // ── Invoke assessment agents in parallel ──────────────────────────────────
  const agentPromises = scopedAgents.map(async (agent) => {
    const startMs = Date.now();
    appendLog(logPath, `Agent START: ${agent.name}`);
    try {
      const result = await workflow.agent({
        agentType: agent.name,
        prompt:    `${targetPath} --prefix ${prefix} --output-dir ${outputDir}`,
      });
      const dur = Date.now() - startMs;
      const tokens = result.usage
        ? result.usage.input_tokens + result.usage.output_tokens
        : 'N/A';
      appendLog(logPath, `Agent DONE:  ${agent.name} — tokens: ${tokens}, duration: ${Math.round(dur / 1000)}s`);
      return { agent: agent.name, actual_tokens: tokens, duration_ms: dur, start_ms: startMs, error: null };
    } catch (err) {
      const dur = Date.now() - startMs;
      appendLog(logPath, `Agent FAIL:  ${agent.name} — ${err.message}`);
      return { agent: agent.name, actual_tokens: 'N/A', duration_ms: dur, start_ms: startMs, error: err.message };
    }
  });

  const agentResults = await Promise.all(agentPromises);
  const completedAgents = agentResults.filter(r => !r.error);
  const failedAgents    = agentResults.filter(r => r.error);

  appendLog(logPath, `Assessment phase complete: ${completedAgents.length} succeeded, ${failedAgents.length} failed`);

  // ── Invoke intervention-documentation-standard ────────────────────────────
  const assessmentFiles = completedAgents
    .map(r => path.join(outputDir, `${prefix}-${r.agent}.md`))
    .join(',');

  appendLog(logPath, `Agent START: intervention-documentation-standard`);
  const intStart = Date.now();
  let interventionResult = null;
  try {
    const intResult = await workflow.agent({
      agentType: 'intervention-documentation-standard',
      prompt:    `--prefix ${prefix} --output-dir ${outputDir} --assessment-files "${assessmentFiles}"`,
    });
    const dur = Date.now() - intStart;
    const tokens = intResult.usage
      ? intResult.usage.input_tokens + intResult.usage.output_tokens
      : 'N/A';
    appendLog(logPath, `Agent DONE:  intervention-documentation-standard — tokens: ${tokens}, duration: ${Math.round(dur / 1000)}s`);
    interventionResult = { actual_tokens: tokens, duration_ms: dur };
  } catch (err) {
    const dur = Date.now() - intStart;
    appendLog(logPath, `Agent FAIL:  intervention-documentation-standard — ${err.message}`);
    interventionResult = { actual_tokens: 'N/A', duration_ms: dur, error: err.message };
  }

  // ── Read Interventions Index ──────────────────────────────────────────────
  const indexPath    = path.join(outputDir, `${prefix}-Interventions-Index.md`);
  const severityCounts = extractSeverityCounts(indexPath);
  const totalInterventions = Object.values(severityCounts).reduce((s, v) => s + v, 0);
  appendLog(logPath, `Interventions: total=${totalInterventions} CRITICAL=${severityCounts.CRITICAL} HIGH=${severityCounts.HIGH} MEDIUM=${severityCounts.MEDIUM} LOW=${severityCounts.LOW}`);

  // ── Write Token Estimate ──────────────────────────────────────────────────
  const tokenEstPath = path.join(outputDir, `${prefix}-Token-Estimate.md`);
  const tokenEstContent = buildTokenEstimate(prefix, agentResults, interventionResult);
  fs.writeFileSync(tokenEstPath, tokenEstContent, 'utf8');
  appendLog(logPath, `Written: ${prefix}-Token-Estimate.md`);

  // ── Write Effort Estimate ─────────────────────────────────────────────────
  const effortPath    = path.join(outputDir, `${prefix}-Effort-Estimate.md`);
  const effortContent = buildEffortEstimate(prefix, agentResults, interventionResult, args.scope);
  fs.writeFileSync(effortPath, effortContent, 'utf8');
  appendLog(logPath, `Written: ${prefix}-Effort-Estimate.md`);

  // ── Build findings_gate_payload ───────────────────────────────────────────
  const remediationHours =
    severityCounts.CRITICAL * 8 +
    severityCounts.HIGH     * 4 +
    severityCounts.MEDIUM   * 2 +
    severityCounts.LOW      * 1;

  const findingsGatePayload = {
    prefix,
    output_dir:           outputDir,
    target_path:          targetPath,
    assessment_summaries: completedAgents.map(r => ({
      agent:       r.agent,
      output_file: path.join(outputDir, `${prefix}-${r.agent}.md`),
    })),
    interventions_index_path: indexPath,
    severity_counts:          severityCounts,
    total_interventions:      totalInterventions,
    remediation_hours_est:    remediationHours,
    effort_estimate_path:     effortPath,
    token_estimate_path:      tokenEstPath,
    log_path:                 logPath,
    errors: [
      ...failedAgents.map(r => ({ agent: r.agent, error: r.error })),
      ...(interventionResult?.error ? [{ agent: 'intervention-documentation-standard', error: interventionResult.error }] : []),
    ],
  };

  appendLog(logPath, `am-phase1 COMPLETE — findings_gate_payload ready`);
  return findingsGatePayload;
}

module.exports = { main };
