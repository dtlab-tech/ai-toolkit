'use strict';

function cell(value) { return String(value ?? '—').replace(/\|/g, '\\|').replace(/[\r\n]/g, ' '); }
function table(headers, rows) {
  return [headers, headers.map(() => '---'), ...rows].map(row => '| ' + row.map(cell).join(' | ') + ' |').join('\n') + '\n';
}
function pricing(control) {
  if (!control.exists('docs/token-pricing.json')) return null;
  const value = control.json('docs/token-pricing.json');
  if (!value || !value.models || !Number.isFinite(value.usd_to_eur) || value.usd_to_eur <= 0) throw new Error('Invalid token pricing');
  return value;
}
function cost(tokens, model, rates) {
  if (!rates || !Number.isFinite(tokens)) return null;
  const rate = rates.models[model];
  if (!rate || ![rate.input_per_1m_usd, rate.output_per_1m_usd].every(v => Number.isFinite(v) && v >= 0)) throw new Error('Invalid model pricing: ' + model);
  return tokens * (0.8 * rate.input_per_1m_usd + 0.2 * rate.output_per_1m_usd) / 1000000 * rates.usd_to_eur;
}
function tokensDocument(c, prefix) {
  const rates = pricing(c);
  return `# Token Estimate — ${prefix}\n\nActuals for this invocation only; previous phases remain in the ledger. Missing usage is unavailable, not zero. Costs use an estimated 80/20 input/output split.\n\n` +
    table(['Agent', 'Model', 'Tokens Actual', 'Estimated cost EUR'], c.tokenLedger.map(e => [e.agent, e.model, e.phase_delta_tokens, cost(e.phase_delta_tokens, e.model, rates)?.toFixed(4)]));
}
function estimates(c, dir, prefix, wb) {
  if (!wb || !Array.isArray(wb.phases) || !wb.phases.length) throw new Error('Invalid Work Breakdown phases');
  const tasks = wb.phases.flatMap(p => { if (!Array.isArray(p.tasks)) throw new Error('Invalid phase tasks'); return p.tasks; });
  const rates = { BE: 120, TEST: 60, INFRA: 30, FE: 90, DB: 90, DevOps: 30 };
  const domains = {};
  for (const t of tasks) { if (!Object.hasOwn(rates, t.domain)) throw new Error('Unknown task domain'); domains[t.domain] = (domains[t.domain] || 0) + 1; }
  const human = list => list.reduce((n, t) => n + rates[t.domain], 0);
  const minutes = human(tasks);
  const human_estimate = `~${Math.floor(minutes / 60)}h ${minutes % 60}min`;
  const agentMinutes = tasks.every(t => Number.isFinite(t.estimate?.agentMinutes)) ? tasks.reduce((n, t) => n + t.estimate.agentMinutes, 0) : null;
  const agent_estimate = agentMinutes == null ? 'unavailable' : `${agentMinutes}min (sequential estimate)`;
  const base = `${dir}/${prefix}`;
  const metrics = { prefix, feature_dir: dir, feature_title: wb.title || wb.feature || prefix,
    total_tasks: tasks.length, user_stories: wb.phases.filter(p => p.id.startsWith('US-')).length,
    domain_breakdown: Object.entries(domains).map(([d, n]) => `${d}: ${n}`).join(', '),
    implementation_phases: wb.phases.length, human_estimate, agent_estimate,
    work_breakdown_path: `${base}-Work-Breakdown.json`, tasks_csv_path: `${base}-Work-Breakdown.csv`,
    effort_estimate_path: `${base}-Effort-Estimate.md`, token_estimate_path: `${base}-Token-Estimate.md` };
  c.write(metrics.effort_estimate_path, `# Effort Estimate — ${prefix} — ${cell(metrics.feature_title)}\n\n` +
    table(['Metric', 'Value'], [['User Stories', metrics.user_stories], ['Total tasks', tasks.length], ['Human estimate', human_estimate], ['Agent estimate', agent_estimate]]) +
    '\n## Per-Phase Breakdown\n\n' + table(['Phase', 'Title', 'Tasks', 'Est. Human minutes', 'Actual Human', 'Actual Agent'],
      wb.phases.map(p => [p.id, p.title, p.tasks.length, human(p.tasks), '—', '—'])));
  c.write(metrics.token_estimate_path, tokensDocument(c, prefix));
  return metrics;
}
function interventions(c, dir, prefix) {
  const raw = c.read(`${dir}/${prefix}-Interventions-Index.md`);
  const lines = raw.split(/\r?\n/).filter(l => l.trim().startsWith('|'));
  const split = line => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(s => s.trim());
  const headerAt = lines.findIndex(l => split(l).some(v => /^(Criticality|Severity)$/i.test(v)));
  if (headerAt < 0) throw new Error('Interventions index missing Criticality column');
  const headers = split(lines[headerAt]), severityAt = headers.findIndex(v => /^(Criticality|Severity)$/i.test(v));
  const rows = [];
  for (const line of lines.slice(headerAt + 1)) {
    const values = split(line);
    if (values.every(v => /^:?-+:?$/.test(v))) continue;
    const id = line.match(/\bINT-\d+\b/);
    if (!id) continue;
    const severity = values[severityAt]?.replace(/\*/g, '').toUpperCase();
    if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(severity)) throw new Error('Unknown intervention severity: ' + severity);
    if (rows.some(r => r.id === id[0])) throw new Error('Duplicate intervention ID: ' + id[0]);
    rows.push({ id: id[0], severity });
  }
  return rows;
}
function assessmentEstimates(c, dir, prefix) {
  const rows = interventions(c, dir, prefix);
  const severity_counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const rates = { CRITICAL: 8, HIGH: 4, MEDIUM: 2, LOW: 1 };
  rows.forEach(r => severity_counts[r.severity]++);
  const hours = rows.reduce((n, r) => n + rates[r.severity], 0);
  const base = `${dir}/${prefix}`;
  c.write(`${base}-Token-Estimate.md`, tokensDocument(c, prefix));
  c.write(`${base}-Effort-Estimate.md`, `# Effort Estimate — ${prefix}\n\n` +
    table(['Severity', 'Count', 'Hours each', 'Subtotal hours'], Object.entries(severity_counts).map(([s, n]) => [s, n, rates[s], n * rates[s]])) + `\nTotal: ${hours} human hours (estimate).\n`);
  return { severity_counts, total_interventions: rows.length, remediation_hours_est: hours,
    interventions_index_path: `${base}-Interventions-Index.md`, effort_estimate_path: `${base}-Effort-Estimate.md`, token_estimate_path: `${base}-Token-Estimate.md` };
}
function recordAssessmentApproval(c, dir, prefix, ack, flagged) {
  const rows = interventions(c, dir, prefix);
  const selected = flagged === 'none' ? [] : flagged.split(',').map(s => s.trim());
  for (const id of selected) if (!rows.some(r => r.id === id)) throw new Error('Unknown flagged intervention: ' + id);
  const today = new Date().toISOString().slice(0, 10), approvals_path = `${dir}/${prefix}-Approvals.md`;
  const content = `# Assessment Approvals — ${prefix}\n\n## Findings Gate Acknowledgement\n\n` +
    table(['Field', 'Value'], [['Acknowledged by', 'Toolkit user'], ['Date', today], ['Acknowledgement', ack]]) +
    '\n## Interventions Flagged for Feature Delivery\n\n' + table(['Intervention', 'Flagged', 'Date', 'Notes'], rows.map(r => [r.id, selected.includes(r.id) ? 'Yes' : 'No', today, selected.includes(r.id) ? '—' : 'Not selected']));
  c.write(approvals_path, content);
  if (c.read(approvals_path) !== content) throw new Error('Approval readback mismatch');
  const registryPath = 'docs/assessments/registry.md';
  const header = '# Assessment Registry\n\n' + table(['Date', 'Prefix', 'Total', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'Flagged'], []);
  const old = c.exists(registryPath) ? c.read(registryPath) : header;
  const row = `| ${today} | [${prefix}](${prefix}/) | ${rows.length} | ` +
    ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => rows.filter(r => r.severity === s).length).join(' | ') + ` | ${selected.length} |`;
  c.write(registryPath, old.split('\n').filter(l => !l.includes(`[${prefix}](`)).join('\n').trimEnd() + '\n' + row + '\n');
  c.read(registryPath);
  return { approvals_path, registry_updated: registryPath, flagged_count: selected.length, summary: `${prefix}: ${selected.length} interventions selected` };
}

module.exports = { estimates, assessmentEstimates, recordAssessmentApproval, interventions };
