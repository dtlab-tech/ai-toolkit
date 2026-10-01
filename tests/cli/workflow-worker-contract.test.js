'use strict';
const fs = require('fs');
const path = require('path');
const { createControl } = require('../../lib/workflow-control');
const { runWorkflow } = require('../../lib/workflow-runner');
const { fixture } = require('../helpers/workflow-fixture');
const id = 'gaia.agent.planner.requirements';
let f;
beforeEach(() => { f = fixture(); });
afterEach(() => { f.clean(); });
const response = extra => ({ exitCode: 0, result: { is_error: false, result: 'Done',
  usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 20, cache_creation_input_tokens: 7 }, ...extra } });
function evidence() {
  const run = fs.readdirSync(f.options.diagnosticsDir)[0];
  const dir = path.join(f.options.diagnosticsDir, run);
  return JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), 'utf8'));
}

test('pm-phase1 never marks a requirements worker done when its response is empty', async () => {
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: async () => response({ result: '' }) }))
    .rejects.toThrow(/no result/i);
  const worker = f.entries().find(e => e.agentId === id);
  expect(worker.status).toBe('failed');
  expect(worker.phase_delta_tokens).toBe(42);
  expect(evidence().outcome).toBe('failed');
});

test('permission denial is explicit even when the CLI claims success and keeps usage evidence', async () => {
  const c = createControl({ ...f.options, dispatch: async () => response({ permission_denials: [
    { tool_name: 'Write', tool_input: { file_path: path.join(f.dir, 'report.md'), content: 'private document' } },
  ] }) });
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'))).rejects.toThrow('Worker permission denied');
  expect(f.entries().find(e => e.agentId).status).toBe('failed');
  expect(f.entries().find(e => e.agentId).phase_delta_tokens).toBe(42);
  expect(evidence().response.result.usage.cache_read_input_tokens).toBe(20);
  expect(evidence().response.result.permission_denials[0].tool_name).toBe('Write');
});

test('a schema worker cannot complete with an empty report field', async () => {
  const dest = path.join(f.dir, 'report.md');
  const c = createControl({ ...f.options, dispatch: async () => response({
    structured_output: { valid: true, findings: [], report: '   ' },
  }) });
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', {
    outputs: [{ path: dest }], schema: { type: 'object', required: ['valid', 'findings', 'report'] },
  }))).rejects.toThrow(/content missing or empty/i);
  expect(f.entries().find(e => e.agentId).status).toBe('failed');
  expect(fs.existsSync(dest)).toBe(false);
});

test('the host — never the agent — writes a declared output; evidence omits prompt and redacts credentials', async () => {
  const dest = path.join(f.dir, 'report.md');
  const c = createControl({ ...f.options, workerMaxBudgetUsd: 0.1, dispatch: async ({ args }) => {
    expect(args).toContain('--max-budget-usd');
    expect(args).not.toContain('--permission-mode');
    expect(args).not.toContain('--allowedTools');
    expect(args).not.toContain('--dangerously-skip-permissions');
    expect(f.entries().find(e => e.agentId).status).toBe('running');
    expect(fs.existsSync(dest)).toBe(false); // the agent has no Write tool and cannot have created it
    return { ...response({ api_key: 'secret-example', result: 'Authorization: Bearer secret-bearer' }), stderr: 'token=secret-token' };
  } });
  await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'PRIVATE PROMPT', {
    outputs: [{ path: dest }],
  }));
  expect(f.entries().find(e => e.agentId).status).toBe('done');
  expect(fs.readFileSync(dest, 'utf8')).toBe('Authorization: Bearer secret-bearer');
  const captured = evidence();
  expect(captured.outcome).toBe('done');
  expect(captured.invocation.cwd).toBe(f.root);
  expect(JSON.stringify(captured)).not.toMatch(/secret-example|secret-bearer|secret-token|PRIVATE PROMPT/);
});

test('a JSON output wrapped in conversational prose and a code fence is recovered verbatim as parseable JSON', async () => {
  const dest = path.join(f.dir, 'FTR-099-Work-Breakdown.json');
  const wrapped = 'Perfect. I have all the necessary information. Let me now generate the work breakdown JSON.\n\n'
    + 'Based on my analysis:\n\n```json\n{\n  "schemaVersion": 2,\n  "feature": "FTR-099",\n  "phases": []\n}\n```';
  const c = createControl({ ...f.options, dispatch: async () => response({ result: wrapped }) });
  await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', { outputs: [{ path: dest }] }));
  expect(f.entries().find(e => e.agentId).status).toBe('done');
  expect(JSON.parse(fs.readFileSync(dest, 'utf8'))).toEqual({ schemaVersion: 2, feature: 'FTR-099', phases: [] });
});

test('a JSON output with no recoverable JSON document fails closed instead of writing garbage', async () => {
  const dest = path.join(f.dir, 'FTR-099-Work-Breakdown.json');
  const c = createControl({ ...f.options, dispatch: async () => response({ result: 'I need more information before I can proceed.' }) });
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', { outputs: [{ path: dest }] })))
    .rejects.toThrow(/could not be recovered/i);
  expect(fs.existsSync(dest)).toBe(false);
});

test('a declared output cannot authorize a file outside the project', async () => {
  const dispatch = jest.fn();
  const c = createControl({ ...f.options, dispatch });
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', {
    outputs: [{ path: path.join(f.root, '..', 'outside.md') }],
  }))).rejects.toThrow('inside the project');
  expect(dispatch).not.toHaveBeenCalled();
});

test('spawn and parse failures still have durable diagnostic records', async () => {
  const c = createControl({ ...f.options, dispatch: async () => { throw new Error('spawn unavailable'); } });
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'))).rejects.toThrow('spawn unavailable');
  expect(evidence().outcome).toBe('failed');
  expect(evidence().error).toContain('spawn unavailable');
});

test('structured-output failure retains token usage and raw-response diagnostics', async () => {
  const c = createControl({ ...f.options, dispatch: async () => response() });
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', {
    schema: { type: 'object', required: ['valid'] },
  }))).rejects.toThrow('no structured output');
  expect(f.entries().find(e => e.agentId).phase_delta_tokens).toBe(42);
  expect(evidence().response.result.result).toBe('Done');
});

test('a schema-valid <structured_output> tag in plain text is accepted when the CLI field is empty', async () => {
  const taggedText = 'Phase 1...\nPhase 2...\n'
    + '<structured_output>{"valid":true,"findings":[]}</structured_output>';
  const c = createControl({ ...f.options, dispatch: async () => response({ result: taggedText }) });
  const payload = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', {
    schema: { type: 'object', required: ['valid', 'findings'] },
  }));
  expect(payload).toEqual({ valid: true, findings: [] });
  expect(f.entries().find(e => e.agentId).status).toBe('done');
  expect(evidence().usedTextFallback).toBe(true);
});

test('a schema-valid ```json fence in plain text is accepted when the CLI field is empty (same agent, different model-chosen delimiter)', async () => {
  const fencedText = '## Phase 6 — report\n...\n## Phase 7 — Structured Completion\n\n'
    + '```json\n{\n  "valid": true,\n  "findings": [],\n  "report": "# Validation Report"\n}\n```';
  const c = createControl({ ...f.options, dispatch: async () => response({ result: fencedText }) });
  const payload = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', {
    schema: { type: 'object', required: ['valid', 'findings', 'report'] },
  }));
  expect(payload).toEqual({ valid: true, findings: [], report: '# Validation Report' });
  expect(f.entries().find(e => e.agentId).status).toBe('done');
  expect(evidence().usedTextFallback).toBe(true);
});

test('the last ```json fence wins when the report text itself contains an earlier json example block', async () => {
  const fencedText = 'Example of the target shape:\n```json\n{"not": "the real payload"}\n```\n'
    + 'Phase 7 — Structured Completion\n```json\n{"valid": false, "findings": ["gap"]}\n```';
  const c = createControl({ ...f.options, dispatch: async () => response({ result: fencedText }) });
  const payload = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', {
    schema: { type: 'object', required: ['valid', 'findings'] },
  }));
  expect(payload).toEqual({ valid: false, findings: ['gap'] });
});

test('a <structured_output> tag that fails schema validation still fails closed', async () => {
  const taggedText = '<structured_output>{"wrongField":true}</structured_output>';
  const c = createControl({ ...f.options, dispatch: async () => response({ result: taggedText }) });
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', {
    schema: { type: 'object', required: ['valid', 'findings'] },
  }))).rejects.toThrow('no structured output');
  expect(f.entries().find(e => e.agentId).status).toBe('failed');
});
