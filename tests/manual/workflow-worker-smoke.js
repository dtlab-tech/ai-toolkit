'use strict';

// Opt-in paid smoke test. No real feature or user settings are modified.
// node tests/manual/workflow-worker-smoke.js <absolute-path-to-claude.exe>
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { fixture } = require('../helpers/workflow-fixture');
const { runWorkflow } = require('../../lib/workflow-runner');
const { spawnClaudeAgent } = require('../../lib/task-executor/claude-process');
const { redact } = require('../../lib/workflow-worker-evidence');

async function main() {
  const claudePath = process.argv[2];
  if (!claudePath || !path.isAbsolute(claudePath)) throw new Error('Provide the absolute path to the authenticated Claude CLI.');
  const diagnosticsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-toolkit-smoke-evidence-'));
  const summaryPath = path.join(diagnosticsDir, 'summary.json');
  const summary = { startedAt: new Date().toISOString(), claudePath, maxReportedCostUsd: 0.75, outcome: 'running' };
  let f;
  try {
    const version = spawnSync(claudePath, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    summary.cliVersion = (version.stdout || '').trim();
    const auth = spawnSync(claudePath, ['auth', 'status'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    let status;
    try { status = JSON.parse(auth.stdout); } catch (_) { throw new Error('Cannot determine CLI authentication; no model call made.'); }
    summary.authenticated = status.loggedIn === true;
    summary.authMethod = status.authMethod;
    if (!summary.authenticated) throw new Error('CLI is not authenticated; no model call made. Run this test from the environment that authenticates Claude.');
    f = fixture();
    summary.projectDir = f.root;
    fs.writeFileSync(f.feature, '# Add two numbers\n\nCreate a pure JavaScript function add(a, b) that returns the sum of two finite numbers. Example: add(2, 3) returns 5. The caller is another JavaScript function. No UI, API, database, external integrations, authentication or invalid-input handling. New files: src/add.js and tests/add.test.js.\n');
    let reportedCost = 0;
    const result = await runWorkflow('pm-phase1', [f.feature], {
      ...f.options, claudePath, diagnosticsDir, workerMaxBudgetUsd: 0.2, taskTimeoutMs: 120000,
      log: line => process.stderr.write(line + '\n'),
      dispatch: async options => {
        const remaining = summary.maxReportedCostUsd - reportedCost;
        if (remaining < 0.01) throw new Error('Smoke-test budget exhausted; no retry.');
        const args = options.args.slice();
        args[args.indexOf('--max-budget-usd') + 1] = String(Math.min(0.2, remaining));
        const response = await spawnClaudeAgent({ ...options, args });
        const cost = response.result?.total_cost_usd;
        if (Number.isFinite(cost) && cost >= 0) reportedCost += cost;
        else throw new Error('Smoke-test cost unavailable; refusing further model calls.');
        summary.reportedCostUsd = reportedCost;
        return response;
      },
    });
    summary.validation = result.validation;
    summary.workerCount = result.token_ledger.length;
    summary.reports = ['Requirements', 'Tech-Spec', 'Validation-Report'].map(suffix => {
      const file = path.join(f.dir, `FTR-099-${suffix}.md`);
      const content = fs.readFileSync(file, 'utf8');
      fs.writeFileSync(path.join(diagnosticsDir, path.basename(file)), content);
      return { name: path.basename(file), nonempty: content.trim().length > 0 };
    });
    summary.ledger = f.entries();
    if (!summary.reports.every(r => r.nonempty) || !summary.ledger.every(e => e.status === 'done')) throw new Error('Smoke-test output verification failed.');
    summary.outcome = 'passed';
  } catch (error) {
    summary.outcome = 'blocked-or-failed';
    summary.error = error.message;
    if (f) { try { summary.ledger = f.entries(); } catch (_) { /* Pre-dispatch failure. */ } }
    process.exitCode = 1;
  } finally {
    summary.completedAt = new Date().toISOString();
    fs.writeFileSync(summaryPath, JSON.stringify(redact(summary), null, 2) + '\n', { mode: 0o600 });
    if (f) f.clean();
    console.log(JSON.stringify({ outcome: summary.outcome, error: summary.error, evidence: summaryPath }));
  }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
