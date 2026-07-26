/**
 * pm-phase2.js — Feature Delivery: Work Breakdown Phase
 *
 * Workflow phase 2 of the feature delivery pipeline.
 * Precondition: {PREFIX}-Approvals.md must exist with Gate 1 ✅.
 * Runs: generate-work-breakdown → effort-estimate update.
 *
 * Returns gate2_payload to the invoking skill so it can present Gate 2
 * to the user in the main loop.
 *
 * Inputs (from skill prompt):
 *   <path-to-feature.md>
 *
 * Outputs (files written):
 *   {PREFIX}-Work-Breakdown.md
 *   {PREFIX}-Effort-Estimate.md  (updated with WB estimates)
 *   {PREFIX}-process-log.txt     (appended)
 *
 * Returns (to skill):
 *   gate2_payload — summary data for Gate 2 presentation
 */

const fs   = require('fs');
const path = require('path');

// ── helpers ───────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function extractPrefix(featurePath) {
  const dir  = path.dirname(featurePath);
  const name = path.basename(dir);
  const m    = name.match(/^([A-Z]+-[0-9]+)/);
  if (!m) throw new Error(`Cannot extract prefix from directory name: ${name}`);
  return m[1];
}

function appendLog(logPath, message) {
  const line = `[${now()}] ${message}\n`;
  fs.appendFileSync(logPath, line, 'utf8');
}

function fileExists(filePath) {
  try { return fs.statSync(filePath).isFile(); } catch { return false; }
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// ── Parse Work Breakdown for summary metrics ──────────────────────────────────

function parseWorkBreakdownSummary(wbContent) {
  const summary = {
    user_stories:          0,
    total_tasks:           0,
    domain_breakdown:      {},
    implementation_phases: 0,
    human_estimate:        'N/A',
    agent_estimate:        'N/A',
  };

  // Extract from Summary table
  const usMatch    = wbContent.match(/Total User Stories\s*\|\s*(\d+)/);
  const taskMatch  = wbContent.match(/Total Tasks\s*\|\s*(\d+)/);
  const phaseMatch = wbContent.match(/Implementation phases\s*\|\s*(\d+)/);
  const humanMatch = wbContent.match(/Estimated total \(Human\)\s*\|\s*([^\n|]+)/);
  const agentMatch = wbContent.match(/Estimated total \(Agent\)\s*\|\s*([^\n|]+)/);

  if (usMatch)    summary.user_stories          = parseInt(usMatch[1], 10);
  if (taskMatch)  summary.total_tasks            = parseInt(taskMatch[1], 10);
  if (phaseMatch) summary.implementation_phases  = parseInt(phaseMatch[1], 10);
  if (humanMatch) summary.human_estimate         = humanMatch[1].trim();
  if (agentMatch) summary.agent_estimate         = agentMatch[1].trim();

  // Extract domain breakdown
  const domainMatch = wbContent.match(/Domain distribution\s*\|\s*([^\n|]+)/);
  if (domainMatch) {
    const raw = domainMatch[1].trim();
    // Format: "DB: 0, BE: 11, FE: 0, INFRA: 4, TEST: 0"
    for (const part of raw.split(',')) {
      const [k, v] = part.trim().split(':').map(s => s.trim());
      if (k && v) summary.domain_breakdown[k] = parseInt(v, 10) || 0;
    }
  }

  return summary;
}

// ── Build Effort Estimate content ─────────────────────────────────────────────

function buildEffortEstimate(prefix, summary) {
  const domainRows = Object.entries(summary.domain_breakdown)
    .map(([d, n]) => `| ${d} | ${n} | — |`)
    .join('\n');

  return `# Effort Estimate — ${prefix} — Rewrite Orchestrators as Workflow Scripts

| Metric | Value |
|--------|-------|
| User Stories | ${summary.user_stories} (US-01 ÷ US-0${summary.user_stories}) |
| Total tasks | ${summary.total_tasks} (${Object.entries(summary.domain_breakdown).map(([k, v]) => `${k}:${v}`).join(', ')}) |
| Implementation phases | ${summary.implementation_phases} |
| Human estimate | ${summary.human_estimate} (sequential, no parallelism) |
| Agent estimate | ${summary.agent_estimate} (parallel dispatch, critical path only) |

## Domain breakdown

| Domain | Tasks | Notes |
|--------|-------|-------|
${domainRows}

## Implementation phases

| Phase | Tasks | Parallelism |
|-------|-------|-------------|
| Phase 1 — Shared Infrastructure | 1 task | 1 agent |
| Phase 2 — Workflow Scripts (pm-phase1/2, am-phase1/2) | 4 tasks | 4 agents in parallel |
| Phase 3 — pm-phase3.js | 1 task | 1 agent |
| Phase 4 — Skills and Install Files | 4 tasks | 4 agents in parallel |
| Phase 5 — Delete Orchestrator Files | 2 tasks | 1 agent |

## Notes

Estimation assumptions: S=30min avg, M=3h avg, L=10h avg for human; agent critical path only.
No DB, FE, or TEST tasks — pure tooling/configuration change.
`;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(args) {
  const featurePath = args.trim();
  if (!fileExists(featurePath)) {
    return { error: `feature.md not found: ${featurePath}` };
  }

  const prefix       = extractPrefix(featurePath);
  const dir          = path.dirname(featurePath);
  const logPath      = path.join(dir, `${prefix}-process-log.txt`);
  const approvalsPath = path.join(dir, `${prefix}-Approvals.md`);
  const wbPath        = path.join(dir, `${prefix}-Work-Breakdown.md`);
  const effortPath    = path.join(dir, `${prefix}-Effort-Estimate.md`);

  appendLog(logPath, `pm-phase2 START — prefix: ${prefix}`);

  // ── Precondition: Gate 1 must be approved ────────────────────────────────
  if (!fileExists(approvalsPath)) {
    const msg = `HARD STOP — ${prefix}-Approvals.md not found. Gate 1 must be completed before pm-phase2 runs.`;
    appendLog(logPath, msg);
    return { error: msg };
  }
  const approvalsContent = readFile(approvalsPath);
  if (!approvalsContent.includes('Gate 1') || !approvalsContent.includes('✅ Approved')) {
    const msg = `HARD STOP — Gate 1 approval not found in ${prefix}-Approvals.md.`;
    appendLog(logPath, msg);
    return { error: msg };
  }
  appendLog(logPath, `Precondition check: Gate 1 ✅ confirmed`);

  const tokenLedger = [];

  // ── generate-work-breakdown ───────────────────────────────────────────────
  appendLog(logPath, `Agent START: generate-work-breakdown (${prefix})`);
  const t0 = Date.now();
  const result = await workflow.agent({
    agentType: 'generate-work-breakdown',
    prompt:    featurePath,
  });
  const dur = Date.now() - t0;
  const tokens = result.usage
    ? result.usage.input_tokens + result.usage.output_tokens
    : 'N/A';
  appendLog(logPath, `Agent DONE:  generate-work-breakdown (${prefix}) — tokens: ${tokens}, duration: ${Math.round(dur / 1000)}s`);
  tokenLedger.push({
    agent: 'generate-work-breakdown',
    model: 'haiku',
    actual_tokens: tokens,
    duration_ms: dur,
  });

  if (!fileExists(wbPath)) {
    appendLog(logPath, `ERROR: generate-work-breakdown produced no output`);
    return { error: 'generate-work-breakdown produced no output', logPath };
  }

  // ── Parse WB for summary ──────────────────────────────────────────────────
  const wbContent = readFile(wbPath);
  const summary   = parseWorkBreakdownSummary(wbContent);
  appendLog(logPath, `Work Breakdown parsed: ${summary.user_stories} US, ${summary.total_tasks} tasks, ${summary.implementation_phases} phases`);

  // ── Update Effort Estimate ────────────────────────────────────────────────
  const effortContent = buildEffortEstimate(prefix, summary);
  fs.writeFileSync(effortPath, effortContent, 'utf8');
  appendLog(logPath, `Updated: ${prefix}-Effort-Estimate.md`);

  // ── Build gate2_payload ───────────────────────────────────────────────────
  const gate2Payload = {
    prefix,
    feature_dir:           path.dirname(featurePath),
    user_stories:          summary.user_stories,
    total_tasks:           summary.total_tasks,
    domain_breakdown:      summary.domain_breakdown,
    implementation_phases: summary.implementation_phases,
    human_estimate:        summary.human_estimate,
    agent_estimate:        summary.agent_estimate,
    work_breakdown_path:   wbPath,
    effort_estimate_path:  effortPath,
    token_ledger:          tokenLedger,
    errors:                [],
  };

  appendLog(logPath, `pm-phase2 COMPLETE — gate2_payload ready`);
  return gate2Payload;
}

module.exports = { main };
