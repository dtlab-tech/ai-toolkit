'use strict';

// Measured actuals of a feature (cost, tokens, attempts), written next to the feature's other documents.
//
// Why: the executor keeps its per-call evidence under <git common dir>/ai-toolkit/execution/evidence/<runId>/
// and its run ledgers under .../runs/<runId>/. Both live inside .git, so they are never committed, never reach
// a pull request and exist on one clone only. The feature's own <PREFIX>-token-ledger.json holds the
// documentation workflows only. This module aggregates every run of a feature and writes two files into the
// feature folder:
//
//   <PREFIX>-Token-Estimate.md       the totals, by scope, run, phase and attempts per task
//   <PREFIX>-executor-ledger.json    one compact row per executor call (no prompt, no output)
//
// Costs are the costUSD the Claude CLI reported for each call. A call without a usable result is counted in
// `calls` and `noResult` and adds no cost: an unmeasured call is never coerced into a measured zero.

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_EUR_RATE = 0.92;

function _readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

function _empty() {
  return { calls: 0, noResult: 0, usd: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ms: 0 };
}

function _usageOf(record) {
  const result = record && record.response && record.response.result;
  return result && result.modelUsage && typeof result.modelUsage === 'object' ? result.modelUsage : null;
}

function _addCall(acc, record) {
  acc.calls++;
  acc.ms += (record && record.response && Number(record.response.durationMs)) || 0;
  const usage = _usageOf(record);
  if (!usage) { acc.noResult++; return; }
  Object.keys(usage).forEach(function (model) {
    const u = usage[model] || {};
    acc.usd += u.costUSD || 0;
    acc.input += u.inputTokens || 0;
    acc.output += u.outputTokens || 0;
    acc.cacheRead += u.cacheReadInputTokens || 0;
    acc.cacheWrite += u.cacheCreationInputTokens || 0;
  });
}

function _sum(list) {
  return list.reduce(function (total, item) {
    Object.keys(total).forEach(function (k) { total[k] += item[k]; });
    return total;
  }, _empty());
}

function _phaseOf(taskId) {
  const m = String(taskId).match(/^(INFRA|US-\d+)/);
  return m ? m[1] : '?';
}

// The documentation workflow runs of a feature are the run ids recorded in its own token ledger.
function _workflowRuns(featureDir, prefix) {
  const ledger = _readJson(path.join(featureDir, prefix + '-token-ledger.json'));
  const runs = new Map();
  (Array.isArray(ledger) ? ledger : []).forEach(function (entry) {
    const m = String((entry && entry.agent) || '').match(
      /^(pm-phase\d):.*?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
    if (m) runs.set(m[2], m[1]);
  });
  return runs;
}

/**
 * Reads every run of the feature and the documentation workflows' evidence.
 * @param {object} args
 * @param {string} args.executionRoot  <git common dir>/ai-toolkit/execution
 * @param {string} args.featureId      e.g. FTR-035
 * @param {string} args.featureDir     folder holding feature.md and <PREFIX>-token-ledger.json
 * @param {string} [args.workflowsDir] where the workflow workers' evidence is (default: <tmp>/ai-toolkit-workflows)
 */
function collectActuals(args) {
  const executionRoot = args.executionRoot;
  const featureId = args.featureId;
  const workflowsDir = args.workflowsDir || path.join(os.tmpdir(), 'ai-toolkit-workflows');

  const docs = { total: _empty(), byPhase: {}, byAgent: {}, runs: 0, missingRuns: 0 };
  const wfRuns = _workflowRuns(args.featureDir, featureId);
  docs.runs = wfRuns.size;
  wfRuns.forEach(function (phase, runId) {
    const dir = path.join(workflowsDir, runId);
    if (!fs.existsSync(dir)) { docs.missingRuns++; return; }
    fs.readdirSync(dir).filter(function (f) { return f.endsWith('.json'); }).forEach(function (f) {
      const record = _readJson(path.join(dir, f));
      if (!record || !record.response) return;
      const agent = String(record.agentId || '?').replace('gaia.agent.', '');
      _addCall(docs.byPhase[phase] = docs.byPhase[phase] || _empty(), record);
      _addCall(docs.byAgent[agent] = docs.byAgent[agent] || _empty(), record);
      _addCall(docs.total, record);
    });
  });

  const runs = [];
  const rows = [];
  const byPhase = {};
  const callsPerTask = {};
  const runsDir = path.join(executionRoot, 'runs');
  const runIds = fs.existsSync(runsDir) ? fs.readdirSync(runsDir) : [];
  runIds.forEach(function (runId) {
    const stateFile = _readJson(path.join(runsDir, runId, 'state.json'));
    const state = stateFile && stateFile.state;
    if (!state || state.featureId !== featureId) return;
    const run = { runId: runId, status: state.runStatus, dev: _empty(), review: _empty(), first: null, last: null, receipts: [] };
    const evDir = path.join(executionRoot, 'evidence', runId);
    if (fs.existsSync(evDir)) {
      fs.readdirSync(evDir).filter(function (f) { return f.endsWith('.json'); }).forEach(function (f) {
        const record = _readJson(path.join(evDir, f));
        if (!record || !record.invocation) return;
        const kind = record.invocation.dispatchKind === 'review' ? 'review' : 'dev';
        const taskId = record.invocation.taskId;
        const phase = _phaseOf(taskId);
        _addCall(run[kind], record);
        _addCall((byPhase[phase] = byPhase[phase] || { dev: _empty(), review: _empty() })[kind], record);
        const per = callsPerTask[taskId] = callsPerTask[taskId] || { dev: 0, review: 0 };
        per[kind]++;
        if (record.startedAt && (!run.first || record.startedAt < run.first)) run.first = record.startedAt;
        const end = record.completedAt || record.startedAt;
        if (end && (!run.last || end > run.last)) run.last = end;
        const usage = _usageOf(record) || {};
        const models = Object.keys(usage);
        const row = {
          run: runId, task: taskId, attempt: record.invocation.attemptNumber, kind: kind === 'dev' ? 'implementation' : 'review',
          agent: record.agentId || null,
          model: models.length ? (usage[models[0]].canonicalModel || models[0]) : null,
          inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0,
          durationMs: (record.response && Number(record.response.durationMs)) || 0,
          startedAt: record.startedAt || null,
          measured: models.length > 0,
        };
        models.forEach(function (m) {
          const u = usage[m] || {};
          row.inputTokens += u.inputTokens || 0; row.outputTokens += u.outputTokens || 0;
          row.cacheReadTokens += u.cacheReadInputTokens || 0; row.cacheWriteTokens += u.cacheCreationInputTokens || 0;
          row.costUsd += u.costUSD || 0;
        });
        rows.push(row);
      });
    }
    // Verdicts of the reviews that really ran (a deferred receipt claims no review).
    const receiptDir = path.join(runsDir, runId, 'receipts');
    if (fs.existsSync(receiptDir)) {
      fs.readdirSync(receiptDir).filter(function (f) { return f.endsWith('-review.json'); }).sort().forEach(function (f) {
        const receipt = _readJson(path.join(receiptDir, f));
        const rec = receipt && (receipt.record || receipt);
        if (!rec || rec.deferred) return;
        run.receipts.push({ task: rec.taskId, attempt: rec.attemptNumber, pass: rec.reviewPassed === true });
      });
    }
    runs.push(run);
  });
  runs.sort(function (a, b) { return String(a.first).localeCompare(String(b.first)); });
  rows.sort(function (a, b) { return String(a.startedAt).localeCompare(String(b.startedAt)); });

  const attempts = {};
  Object.keys(callsPerTask).forEach(function (t) {
    const n = callsPerTask[t].dev;
    if (n > 0) attempts[n] = (attempts[n] || 0) + 1;
  });

  return {
    featureId: featureId,
    docs: docs,
    runs: runs,
    rows: rows,
    byPhase: byPhase,
    dev: _sum(runs.map(function (r) { return r.dev; })),
    review: _sum(runs.map(function (r) { return r.review; })),
    tasksWithCalls: Object.keys(callsPerTask).filter(function (t) { return callsPerTask[t].dev > 0; }).length,
    attempts: attempts,
    reviews: runs.reduce(function (all, r) {
      return all.concat(r.receipts.map(function (x) { return Object.assign({ run: r.runId.slice(0, 8) }, x); }));
    }, []),
  };
}

function _usd(n) { return '$' + n.toFixed(3); }
function _num(n) { return Math.round(n).toLocaleString('en-US'); }
function _dur(ms) {
  const m = Math.round(ms / 60000);
  return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min';
}

/** Markdown of the totals. `date` is written as given so the same input renders the same text. */
function renderTokenEstimate(data, opts) {
  opts = opts || {};
  const eurRate = Number.isFinite(opts.eurRate) ? opts.eurRate : DEFAULT_EUR_RATE;
  const eur = function (n) { return '€' + (n * eurRate).toFixed(3); };
  const row = function (label, a) {
    return '| ' + label + ' | ' + a.calls + ' | ' + _num(a.input) + ' | ' + _num(a.output) + ' | ' + _num(a.cacheRead) +
      ' | ' + _num(a.cacheWrite) + ' | ' + _usd(a.usd) + ' | ' + eur(a.usd) + ' | ' + _dur(a.ms) + ' |';
  };
  const HEAD = '| Scope | Calls | Input tokens | Output tokens | Cache read | Cache write | Cost USD | Cost EUR | Agent time |\n' +
    '|---|---|---|---|---|---|---|---|---|';
  const all = _sum([data.docs.total, data.dev, data.review]);
  const L = [];
  L.push('# Token Estimate — ' + data.featureId + ' (measured actuals)', '');
  L.push('Generated by `ai-toolkit executor report` on ' + (opts.date || '') + ' from the measured evidence: the worker evidence of the ' +
    'documentation workflows (' + data.docs.runs + ' runs recorded in `' + data.featureId + '-token-ledger.json`) and the evidence of the ' +
    'task executor runs. Costs are the `costUSD` the Claude CLI reported for each call (list price); EUR uses the rate ' + eurRate +
    '. One row per executor call is in `' + data.featureId + '-executor-ledger.json`.', '');
  if (data.docs.missingRuns) {
    L.push('Note: the evidence of ' + data.docs.missingRuns + ' documentation run(s) was no longer available, so their cost is not in these totals.', '');
  }
  L.push('## Totals', '', HEAD);
  L.push(row('Documentation (pm-phase1 + pm-phase2)', data.docs.total));
  L.push(row('Implementation: developer agents (executor)', data.dev));
  L.push(row('Implementation: phase reviews (executor)', data.review));
  L.push(row('**Total measured**', all), '');
  const unmeasured = data.dev.noResult + data.review.noResult + data.docs.total.noResult;
  if (unmeasured) L.push(unmeasured + ' call(s) have no usable result and add no cost.', '');
  L.push('## Documentation', '', HEAD);
  Object.keys(data.docs.byPhase).forEach(function (k) { L.push(row(k, data.docs.byPhase[k])); });
  L.push('', 'By agent:', '', HEAD);
  Object.keys(data.docs.byAgent).sort(function (a, b) { return data.docs.byAgent[b].usd - data.docs.byAgent[a].usd; })
    .forEach(function (k) { L.push(row(k, data.docs.byAgent[k])); });
  L.push('', '## Implementation by executor run', '',
    '| Run | Status | Dev calls | Dev USD | Review calls | Review USD | From | To |', '|---|---|---|---|---|---|---|---|');
  const idle = [];
  data.runs.forEach(function (r) {
    if (!r.dev.calls && !r.review.calls) { idle.push(r); return; }
    L.push('| ' + r.runId.slice(0, 8) + ' | ' + r.status + ' | ' + r.dev.calls + ' | ' + _usd(r.dev.usd) + ' | ' + r.review.calls +
      ' | ' + _usd(r.review.usd) + ' | ' + String(r.first).slice(0, 16) + ' | ' + String(r.last).slice(0, 16) + ' |');
  });
  if (idle.length) L.push('', idle.length + ' further run(s) made no agent call (restarts that only carried tasks forward or re-ran verifications).');
  L.push('', '## Implementation by phase', '', '| Phase | Dev calls | Dev USD | Review calls | Review USD |', '|---|---|---|---|---|');
  Object.keys(data.byPhase).sort().forEach(function (k) {
    const v = data.byPhase[k];
    L.push('| ' + k + ' | ' + v.dev.calls + ' | ' + _usd(v.dev.usd) + ' | ' + v.review.calls + ' | ' + _usd(v.review.usd) + ' |');
  });
  const a = data.attempts;
  L.push('', '## Attempts per task', '',
    data.tasksWithCalls + ' tasks received at least one developer call, counted over every run: ' +
    Object.keys(a).sort().map(function (n) { return a[n] + ' with ' + n + ' call' + (n === '1' ? '' : 's'); }).join(', ') + '.', '');
  L.push('## Phase reviews', '', '| Run | Closing task | Attempt | Verdict |', '|---|---|---|---|');
  data.reviews.forEach(function (r) { L.push('| ' + r.run + ' | ' + r.task + ' | ' + r.attempt + ' | ' + (r.pass ? 'PASS' : 'FAIL') + ' |'); });
  L.push('', '## Not included', '',
    '- Hand work and the usage of the chat session that drove the run: the executor sees only the calls it made.',
    '- Anything run outside the executor and the documentation workflows (model comparisons, ad hoc reviews).', '');
  return L.join('\n');
}

/** The compact per-call ledger: no prompt, no output, no paths. */
function renderExecutorLedger(data) {
  return JSON.stringify({
    featureId: data.featureId,
    note: 'One row per executor call. costUsd is the costUSD reported by the Claude CLI; measured=false means the call returned no usage.',
    calls: data.rows,
  }, null, 1) + '\n';
}

function _eurRate(projectDir) {
  const pricing = projectDir ? _readJson(path.join(projectDir, 'docs', 'token-pricing.json')) : null;
  return pricing && Number.isFinite(pricing.usd_to_eur) ? pricing.usd_to_eur : DEFAULT_EUR_RATE;
}

/**
 * Collects and writes the two files into featureDir. Returns what was written and the totals.
 * @param {object} args  collectActuals args plus { projectDir?, date? }
 */
function writeActualsReports(args) {
  const data = collectActuals(args);
  const estimatePath = path.join(args.featureDir, args.featureId + '-Token-Estimate.md');
  const ledgerPath = path.join(args.featureDir, args.featureId + '-executor-ledger.json');
  const date = args.date || new Date().toISOString().slice(0, 10);
  fs.writeFileSync(estimatePath, renderTokenEstimate(data, { date: date, eurRate: _eurRate(args.projectDir) }));
  fs.writeFileSync(ledgerPath, renderExecutorLedger(data));
  const all = _sum([data.docs.total, data.dev, data.review]);
  return {
    written: [estimatePath, ledgerPath],
    totals: { calls: all.calls, costUsd: Number(all.usd.toFixed(6)), documentationUsd: Number(data.docs.total.usd.toFixed(6)),
      developmentUsd: Number(data.dev.usd.toFixed(6)), reviewUsd: Number(data.review.usd.toFixed(6)) },
  };
}

module.exports = { collectActuals, renderTokenEstimate, renderExecutorLedger, writeActualsReports };
