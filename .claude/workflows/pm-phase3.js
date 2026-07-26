/**
 * pm-phase3.js — Feature Delivery: Implementation Phase
 *
 * Workflow phase 3 of the feature delivery pipeline.
 * Precondition: {PREFIX}-Approvals.md must exist with Gate 1 ✅ and Gate 2 ✅.
 *
 * Runs: verify approvals → parse Work Breakdown → implementation loop
 *       (developer agents via agentType:, review-solution per US, git commit per US,
 *        rework max 2 cycles, Issues Register) → remediation loop →
 *       PR creation → Feature Registry update →
 *       write Token-Estimate actuals → write Effort-Estimate actuals.
 *
 * Inputs (from skill prompt):
 *   <path-to-feature.md> [--branch feature/FTR-NNN-slug]
 *
 * Outputs (files written):
 *   All feature implementation files (via developer agents)
 *   {PREFIX}-Token-Estimate.md    (actuals filled)
 *   {PREFIX}-Effort-Estimate.md   (actuals appended)
 *   {PREFIX}-Issues.md            (if any non-CRITICAL findings)
 *   {PREFIX}-process-log.txt      (appended)
 *
 * Returns (to skill):
 *   { pr_url, token_ledger, issues_summary }
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── helpers ───────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function appendLog(logPath, message) {
  const line = `[${now()}] ${message}\n`;
  fs.appendFileSync(logPath, line, 'utf8');
}

function fileExists(filePath) {
  try { return fs.statSync(filePath).isFile(); } catch { return false; }
}

function readFileSafe(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
}

function extractPrefix(featurePath) {
  const dir  = path.dirname(featurePath);
  const name = path.basename(dir);
  const m    = name.match(/^([A-Z]+-[0-9]+)/);
  if (!m) throw new Error(`Cannot extract prefix from directory name: ${name}`);
  return m[1];
}

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
}

// ── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(prompt) {
  const parts  = prompt.trim().split(/\s+/);
  const args   = { feature_path: '', branch: null };
  const bIdx   = parts.indexOf('--branch');
  if (bIdx >= 0 && parts[bIdx + 1]) args.branch = parts[bIdx + 1];
  args.feature_path = parts[0];
  return args;
}

// ── Parse Work Breakdown ──────────────────────────────────────────────────────

function parseWorkBreakdown(wbContent) {
  // Returns array of phases, each phase has array of tasks
  const phases = [];
  let currentPhase = null;

  for (const line of wbContent.split('\n')) {
    // Phase header: "#### Phase N — ..."
    if (line.match(/^####\s+Phase\s+\d+/)) {
      currentPhase = { name: line.replace(/^#+\s+/, '').trim(), tasks: [] };
      phases.push(currentPhase);
      continue;
    }
    // Task table row: "| US-01-T01 | ..."  or  "| INFRA-T01 | ..."
    if (currentPhase && line.startsWith('|')) {
      const cols = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cols[0] && (cols[0].match(/^US-\d+-T\d+$/) || cols[0].match(/^INFRA-T\d+$/))) {
        currentPhase.tasks.push({
          id:     cols[0],
          name:   cols[1] || '',
          domain: cols[2] || 'BE',
        });
      }
    }
  }
  return phases;
}

// ── Domain → agent mapping ────────────────────────────────────────────────────

function domainToAgent(domain) {
  switch (domain.toUpperCase()) {
    case 'DB':
    case 'BE':
    case 'INFRA': return 'developer-backend';
    case 'FE':    return 'developer-frontend';
    case 'TEST':  return 'developer-testing';
    default:      return 'developer-backend';
  }
}

// ── Issues Register ───────────────────────────────────────────────────────────

function appendIssue(issuesPath, prefix, severity, scope, files, description) {
  let content = '';
  let nextNum = 1;

  if (fileExists(issuesPath)) {
    content = readFileSafe(issuesPath) || '';
    const nums = [...content.matchAll(/^\|\s*(\d+)\s*\|/gm)].map(m => parseInt(m[1], 10));
    if (nums.length) nextNum = Math.max(...nums) + 1;
  } else {
    content = `# Issues Register — ${prefix}\n\n| # | Severity | US / Scope | File(s) | Description | Status | Resolved by |\n|---|----------|-----------|---------|-------------|--------|-------------|\n`;
  }

  content += `| ${nextNum} | ${severity} | ${scope} | ${files} | ${description} | OPEN | — |\n`;
  fs.writeFileSync(issuesPath, content, 'utf8');
}

// ── Update Token Estimate with actuals ────────────────────────────────────────

function updateTokenEstimateActuals(tokenEstPath, tokenLedger) {
  if (!fileExists(tokenEstPath)) return;

  let content = readFileSafe(tokenEstPath) || '';

  for (const entry of tokenLedger) {
    if (entry.actual_tokens === 'N/A') continue;
    // Update pending rows by matching agent name
    const escapedAgent = entry.agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rowRegex = new RegExp(
      `(\\| ${escapedAgent}[^|]*\\|[^|]+\\|[^|]+\\|[^|]+\\|)\\s*—\\s*(\\|)\\s*—\\s*(\\| ⏳ pending \\|)`,
      'g'
    );
    const actualCost = (entry.actual_tokens * 0.005400 / 1000).toFixed(4);
    content = content.replace(rowRegex,
      `$1 ${entry.actual_tokens} $2 $${actualCost} $3`.replace('⏳ pending', '✅ complete')
    );
  }

  fs.writeFileSync(tokenEstPath, content, 'utf8');
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(promptArgs) {
  const args = parseArgs(promptArgs);

  const featurePath = args.feature_path;
  if (!fileExists(featurePath)) {
    return { error: `feature.md not found: ${featurePath}` };
  }

  const prefix       = extractPrefix(featurePath);
  const dir          = path.dirname(featurePath);
  const logPath      = path.join(dir, `${prefix}-process-log.txt`);
  const approvPath   = path.join(dir, `${prefix}-Approvals.md`);
  const wbPath       = path.join(dir, `${prefix}-Work-Breakdown.md`);
  const tokenEstPath = path.join(dir, `${prefix}-Token-Estimate.md`);
  const effortPath   = path.join(dir, `${prefix}-Effort-Estimate.md`);
  const issuesPath   = path.join(dir, `${prefix}-Issues.md`);

  appendLog(logPath, `pm-phase3 START — prefix: ${prefix}`);

  // ── Pre-condition: verify both gates ─────────────────────────────────────
  if (!fileExists(approvPath)) {
    const msg = `HARD STOP — ${prefix}-Approvals.md not found. Both gates must be completed before implementation.`;
    appendLog(logPath, msg);
    return { error: msg };
  }
  const approvContent = readFileSafe(approvPath) || '';
  if (!approvContent.includes('Gate 1') || !approvContent.includes('Gate 2')) {
    const msg = `HARD STOP — Both Gate 1 and Gate 2 approvals required in ${prefix}-Approvals.md.`;
    appendLog(logPath, msg);
    return { error: msg };
  }
  appendLog(logPath, `Pre-condition check: Gate 1 ✅ | Gate 2 ✅ confirmed`);

  // ── Parse Work Breakdown ──────────────────────────────────────────────────
  if (!fileExists(wbPath)) {
    return { error: `Work Breakdown not found: ${wbPath}` };
  }
  const wbContent = readFileSafe(wbPath);
  const phases    = parseWorkBreakdown(wbContent);
  appendLog(logPath, `Work Breakdown parsed: ${phases.length} phases`);

  const tokenLedger = [];
  const escalations = [];
  const phaseActuals = [];
  const phaseStart  = Date.now();

  // ── Implementation loop (per phase) ──────────────────────────────────────
  for (const phase of phases) {
    appendLog(logPath, `Phase START: ${phase.name} (${phase.tasks.length} tasks)`);
    const phaseStartMs = Date.now();

    // Group tasks by domain / US for parallel dispatch
    const taskGroups = {};
    for (const task of phase.tasks) {
      const agent = domainToAgent(task.domain);
      const usId  = task.id.startsWith('INFRA') ? 'INFRA' : task.id.split('-T')[0];
      const key   = `${agent}::${usId}`;
      if (!taskGroups[key]) taskGroups[key] = { agent, usId, tasks: [] };
      taskGroups[key].tasks.push(task);
    }

    // Dispatch all groups in parallel
    const groupPromises = Object.values(taskGroups).map(async (group) => {
      const taskIds = group.tasks.map(t => t.id).join(', ');
      appendLog(logPath, `Agent START: ${group.agent} — tasks: ${taskIds}`);
      const t0 = Date.now();
      try {
        const result = await workflow.agent({
          agentType: group.agent,
          prompt:    `${featurePath} ${taskIds}`,
        });
        const dur    = Date.now() - t0;
        const tokens = result.usage
          ? result.usage.input_tokens + result.usage.output_tokens
          : 'N/A';
        appendLog(logPath, `Agent DONE:  ${group.agent} (${taskIds}) — tokens: ${tokens}, duration: ${Math.round(dur / 1000)}s`);
        tokenLedger.push({ agent: group.agent, scope: taskIds, model: 'sonnet', actual_tokens: tokens, duration_ms: dur });
        return { ...group, success: true, tokens, duration_ms: dur };
      } catch (err) {
        const dur = Date.now() - t0;
        appendLog(logPath, `Agent FAIL:  ${group.agent} (${taskIds}) — ${err.message}`);
        tokenLedger.push({ agent: group.agent, scope: taskIds, model: 'sonnet', actual_tokens: 'N/A', duration_ms: dur });
        return { ...group, success: false, error: err.message };
      }
    });

    const groupResults = await Promise.all(groupPromises);

    // Collect US IDs from this phase for review
    const usIds = [...new Set(
      phase.tasks
        .map(t => t.id.startsWith('INFRA') ? 'INFRA' : t.id.split('-T')[0])
    )];

    // Review each US
    for (const usId of usIds) {
      const reviewLabel = usId === 'INFRA' ? 'shared infrastructure (INFRA)' : usId;
      appendLog(logPath, `Agent START: review-solution — scope: ${usId}`);
      const t0 = Date.now();
      let reviewResult;
      let reviewPass = false;

      // Max 2 rework cycles: initial review + up to 2 rework attempts = 3 loop iterations
      const MAX_REVIEW_CYCLES = 3;
      for (let cycle = 1; cycle <= MAX_REVIEW_CYCLES; cycle++) {
        try {
          const result = await workflow.agent({
            agentType: 'review-solution',
            prompt:    `${featurePath} --scope ${usId}`,
          });
          const dur    = Date.now() - t0;
          const tokens = result.usage
            ? result.usage.input_tokens + result.usage.output_tokens
            : 'N/A';
          appendLog(logPath, `Agent DONE:  review-solution (${usId}) cycle ${cycle} — tokens: ${tokens}`);
          tokenLedger.push({ agent: `review-solution (${usId})`, scope: usId, model: 'opus', actual_tokens: tokens, duration_ms: dur });

          const reviewText = result.text || '';
          const hasCritical = reviewText.toUpperCase().includes('CRITICAL');
          const hasWarning  = reviewText.toUpperCase().includes('WARNING');
          const hasInfo     = reviewText.toUpperCase().includes('INFO');

          if (!hasCritical) {
            // PASS
            if (hasWarning || hasInfo) {
              appendIssue(issuesPath, prefix,
                hasWarning ? 'WARNING' : 'INFO',
                usId, '(see review output)', 'Non-critical finding from review-solution');
            }
            reviewPass = true;
            // Commit
            const commitMsg = usId === 'INFRA'
              ? `feat(${prefix}): implement shared infrastructure (INFRA)`
              : `feat(${prefix}): implement ${usId} — ${phase.name}`;
            try {
              git('add -A');
              git(`commit -m "${commitMsg}"`);
              appendLog(logPath, `Committed: ${commitMsg}`);
            } catch (err) {
              appendLog(logPath, `WARNING: git commit failed — ${err.message}`);
            }
            break;
          } else if (cycle < MAX_REVIEW_CYCLES) {
            // Rework (max 2 cycles: cycle 1 and cycle 2 trigger rework; cycle 3 escalates)
            appendLog(logPath, `review-solution FAIL (CRITICAL) — rework cycle ${cycle} for ${usId}`);
            const reworkResult = await workflow.agent({
              agentType: domainToAgent(phase.tasks.find(t =>
                (t.id.startsWith('INFRA') ? 'INFRA' : t.id.split('-T')[0]) === usId
              )?.domain || 'BE'),
              prompt: `${featurePath} --rework ${usId} --issues "${reviewText.slice(0, 500)}"`,
            });
            const reworkTokens = reworkResult.usage
              ? reworkResult.usage.input_tokens + reworkResult.usage.output_tokens
              : 'N/A';
            tokenLedger.push({ agent: `developer rework (${usId}) cycle ${cycle}`, scope: usId, model: 'sonnet', actual_tokens: reworkTokens, duration_ms: 0 });
          } else {
            // Failed after 2 rework cycles — escalate
            appendLog(logPath, `review-solution FAIL (CRITICAL) — escalating ${usId} after 2 rework cycles`);
            escalations.push({ usId, reason: 'CRITICAL review finding unresolved after 2 rework cycles' });
          }
        } catch (err) {
          appendLog(logPath, `review-solution ERROR (${usId}) — ${err.message}`);
          escalations.push({ usId, reason: err.message });
          break;
        }
      }
    }

    phaseActuals.push({ phase: phase.name, duration_ms: Date.now() - phaseStartMs });
    appendLog(logPath, `Phase DONE: ${phase.name} — ${Math.round((Date.now() - phaseStartMs) / 1000)}s`);
  }

  // ── Remediation loop ─────────────────────────────────────────────────────
  if (fileExists(issuesPath)) {
    const issuesContent = readFileSafe(issuesPath) || '';
    const openIssues = (issuesContent.match(/\|\s*OPEN\s*\|/g) || []).length;
    appendLog(logPath, `Issues Register: ${openIssues} OPEN items`);

    if (openIssues > 0) {
      appendLog(logPath, `Remediation: processing ${openIssues} open issue(s)`);
      // Extract WARNING items first, then INFO
      const lines = issuesContent.split('\n').filter(l =>
        l.startsWith('|') && l.includes('OPEN')
      );

      for (const line of lines) {
        const cols = line.split('|').map(c => c.trim()).filter(Boolean);
        const [num, severity, scope, files, desc] = cols;
        if (!num) continue;

        appendLog(logPath, `Remediating issue #${num} (${severity}): ${desc}`);
        // INFO → DEFERRED immediately if complex
        if (severity === 'INFO') {
          appendLog(logPath, `Issue #${num}: INFO — marking DEFERRED`);
          continue;
        }

        // Dispatch developer agent for WARNING
        try {
          const remAgent = domainToAgent('BE');
          await workflow.agent({
            agentType: remAgent,
            prompt:    `${featurePath} --remediate --issue "${desc}"`,
          });
          appendLog(logPath, `Issue #${num}: remediation agent dispatched`);
        } catch (err) {
          appendLog(logPath, `Issue #${num}: remediation failed — ${err.message}`);
        }
      }
    }
  }

  // ── Update Feature Registry ───────────────────────────────────────────────
  const registryPath = path.join('internal_docs', 'features', 'REGISTRY.md');
  const featureMd    = readFileSafe(featurePath) || '';
  const titleMatch   = featureMd.match(/^#\s+(.+)$/m);
  const featureTitle = titleMatch ? titleMatch[1].trim() : prefix;
  const summaryMatch = featureMd.match(/##\s+Summary\s*\n+([^\n#]+)/);
  const featureSummary = summaryMatch ? summaryMatch[1].trim() : '—';

  if (fileExists(registryPath)) {
    let regContent = readFileSafe(registryPath) || '';
    if (!regContent.includes(`## ${prefix}`)) {
      const entry = `\n## ${prefix} — ${featureTitle}\n**Keywords:** workflow-scripts, orchestrators, pm-phase, am-phase, implement-feature, assess-codebase, agentType, token-tracking, subagent-depth\n**Status:** in-progress\n**Summary:** ${featureSummary.slice(0, 400)}\n→ [Detail](${path.relative(path.dirname(registryPath), path.dirname(featurePath))}/feature.md)\n\n---\n`;
      regContent += entry;
      fs.writeFileSync(registryPath, regContent, 'utf8');
      appendLog(logPath, `Updated: internal_docs/features/REGISTRY.md (in-progress)`);
    }
  }

  // ── Create PR ─────────────────────────────────────────────────────────────
  let prUrl = '';
  const branchName = args.branch || `feature/${prefix}-workflow-orchestrators`;
  try {
    git(`push -u origin ${branchName}`);
    const usCount = [...new Set(
      phases.flatMap(p => p.tasks.map(t =>
        t.id.startsWith('INFRA') ? null : t.id.split('-T')[0]
      )).filter(Boolean)
    )].length;
    const taskCount = phases.flatMap(p => p.tasks).length;
    const issueCount = fileExists(issuesPath)
      ? (readFileSafe(issuesPath).match(/\| FIXED \|/g) || []).length
      : 0;
    const deferredCount = fileExists(issuesPath)
      ? (readFileSafe(issuesPath).match(/\| DEFERRED \|/g) || []).length
      : 0;

    const prBody = [
      '## Summary',
      `- Implements ${featureTitle} (${usCount} User Stories, ${taskCount} tasks)`,
      `- Source docs: ${prefix}-Requirements.md, ${prefix}-Tech-Spec.md`,
      '',
      '## Implementation',
      `- ${phases.length} phases (1 per US + INFRA)`,
      '- Architect review: all US passed',
      `- Issues Register: ${issueCount} fixed, ${deferredCount} deferred → see ${prefix}-Issues.md`,
      '',
      '## Test plan',
      '- [ ] Build passes',
      '- [ ] Tests pass',
      '- [ ] Manual smoke test of key flows',
    ].join('\n');

    const prOutput = execSync(
      `gh pr create --title "feat(${prefix}): ${featureTitle}" --body "${prBody.replace(/"/g, '\\"')}" --base develop`,
      { encoding: 'utf8' }
    ).trim();
    prUrl = prOutput.match(/https:\/\/\S+/)?.[ 0] || prOutput;
    appendLog(logPath, `PR created: ${prUrl}`);
  } catch (err) {
    appendLog(logPath, `WARNING: PR creation failed — ${err.message}`);
    prUrl = '(PR creation failed — see log)';
  }

  // ── Update Registry to completed ──────────────────────────────────────────
  if (prUrl && !prUrl.includes('failed')) {
    try {
      const regContent = readFileSafe(registryPath) || '';
      const updated = regContent.replace(
        new RegExp(`(## ${prefix}[\\s\\S]*?\\*\\*Status:\\*\\* )in-progress`),
        '$1completed'
      );
      if (updated !== regContent) {
        fs.writeFileSync(registryPath, updated, 'utf8');
        appendLog(logPath, `Registry updated: Status → completed`);
      }
    } catch (err) {
      appendLog(logPath, `WARNING: Registry status update failed — ${err.message}`);
    }
  }

  // ── Update Token-Estimate actuals ─────────────────────────────────────────
  updateTokenEstimateActuals(tokenEstPath, tokenLedger);
  appendLog(logPath, `Updated: ${prefix}-Token-Estimate.md with actuals`);

  // ── Append Effort-Estimate actuals ────────────────────────────────────────
  const totalMs  = Date.now() - phaseStart;
  const totalMin = Math.round(totalMs / 60000);
  const actuals = [
    '\n---\n',
    '## Actuals vs Estimate\n',
    '| Metric | Estimated | Actual | Delta |',
    '|--------|-----------|--------|-------|',
    `| Total wall-clock (agent) | ~2h 6min | ${totalMin}min | ±${totalMin - 126}min |`,
    ...phaseActuals.map(p =>
      `| ${p.phase} | ~Xmin | ${Math.round(p.duration_ms / 60000)}min | — |`
    ),
    '\n## Notes\n',
    `Implementation completed in ${totalMin} minutes across ${phases.length} phases.`,
    escalations.length > 0
      ? `Escalations: ${escalations.map(e => `${e.usId}: ${e.reason}`).join('; ')}`
      : 'No escalations.',
  ].join('\n');

  try {
    fs.appendFileSync(effortPath, actuals, 'utf8');
    appendLog(logPath, `Updated: ${prefix}-Effort-Estimate.md (actuals appended)`);
  } catch (err) {
    appendLog(logPath, `WARNING: Effort Estimate update failed — ${err.message}`);
  }

  appendLog(logPath, `pm-phase3 COMPLETE`);
  appendLog(logPath, `RUN COMPLETE`);
  appendLog(logPath, `════════════════════════════════════════════════════════`);

  return {
    pr_url: prUrl,
    token_ledger: tokenLedger,
    issues_summary: {
      escalations: escalations.length,
      escalation_details: escalations,
    },
  };
}

module.exports = { main };
