'use strict';
const fs = require('fs');
const path = require('path');
const { runWorkflow } = require('../../lib/workflow-runner');
const { fixture } = require('../helpers/workflow-fixture');
let f;
beforeEach(() => { f = fixture(); });
afterEach(() => { f.clean(); });
const success = value => ({ exitCode: 0, result: { is_error: false, result: value, usage: { input_tokens: 10, output_tokens: 5 } } });
function phase1Dispatch({ args }) {
  const name = args[args.indexOf('--agent') + 1];
  const suffix = { 'gaia-generate-requirements': 'Requirements', 'gaia-generate-tech-spec': 'Tech-Spec', 'gaia-validate-feature-docs': 'Validation-Report' }[name];
  if (!suffix) throw new Error('Unexpected worker: ' + name);
  fs.writeFileSync(path.join(f.dir, `FTR-099-${suffix}.md`), '# Result\n');
  const response = success('ZERO GAPS FOUND');
  if (name === 'gaia-validate-feature-docs') response.result.structured_output = { valid: true, findings: [] };
  return Promise.resolve(response);
}
test('real installed pm-phase1 executes only semantic workers and persists done after outputs', async () => {
  const dispatch = jest.fn(phase1Dispatch);
  const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  expect(dispatch).toHaveBeenCalledTimes(3);
  expect(result.validation.summary).toContain('0 gaps');
  expect(result.token_ledger).toHaveLength(3);
  expect(f.entries().every(e => e.status === 'done')).toBe(true);
  expect(fs.readFileSync(path.join(f.dir, 'FTR-099-process-log.txt'), 'utf8')).toContain('Gate 1');
});
test('worker exception leaves both activity and workflow failed', async () => {
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: async () => { throw new Error('crash'); } })).rejects.toThrow('crash');
  expect(f.entries().map(e => e.status)).toEqual(['failed', 'failed']);
});

test.each([undefined, null, ''])('a written validation report without structured output fails explicitly: %s', async payload => {
  const dispatch = async options => {
    const response = await phase1Dispatch(options);
    if (options.args.includes('gaia-validate-feature-docs')) {
      response.result.result = JSON.stringify({ valid: true, findings: [] });
      response.result.structured_output = payload;
    }
    return response;
  };
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch }))
    .rejects.toThrow('Worker returned no structured output: gaia.agent.planner.validate-feature-docs; expected fields: valid, findings');
  expect(fs.existsSync(path.join(f.dir, 'FTR-099-Validation-Report.md'))).toBe(true);
  expect(f.entries()[0].status).toBe('failed');
  expect(f.entries().find(e => e.agentId === 'gaia.agent.planner.validate-feature-docs').status).toBe('failed');
  expect(fs.existsSync(path.join(f.dir, 'FTR-099-process-log.txt'))).toBe(false);
});

test('document findings trigger host revision followed by a clean structured verdict', async () => {
  let validations = 0;
  const dispatch = jest.fn(async options => {
    const response = await phase1Dispatch(options);
    if (options.args.includes('gaia-validate-feature-docs')) {
      const schema = JSON.parse(options.args[options.args.indexOf('--json-schema') + 1]);
      expect(schema.required).toEqual(['valid', 'findings']);
      if (++validations === 1) response.result.structured_output = { valid: false, findings: ['Requirements: missing acceptance criterion'] };
    }
    return response;
  });
  const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  expect(result.validation.summary).toContain('clean on cycle 2');
  expect(dispatch.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1])).toEqual([
    'gaia-generate-requirements', 'gaia-generate-tech-spec', 'gaia-validate-feature-docs',
    'gaia-generate-requirements', 'gaia-validate-feature-docs',
  ]);
  expect(f.entries().every(e => e.status === 'done')).toBe(true);
});

test.each([{ valid: true }, { valid: 'true', findings: [] }, { valid: false, findings: [42] }])('malformed validation verdict blocks Gate 1: %j', async payload => {
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: async options => {
    const response = await phase1Dispatch(options);
    if (options.args.includes('gaia-validate-feature-docs')) response.result.structured_output = payload;
    return response;
  } })).rejects.toThrow(/structured/);
  expect(f.entries()[0].status).toBe('failed');
});

test('a clean structured verdict without its report cannot complete pm-phase1', async () => {
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: async options => {
    if (options.args.includes('gaia-validate-feature-docs')) {
      return { exitCode: 0, result: { is_error: false, structured_output: { valid: true, findings: [] } } };
    }
    return phase1Dispatch(options);
  } })).rejects.toThrow('Validation agent did not produce its report');
  expect(f.entries()[0].status).toBe('failed');
  expect(fs.existsSync(path.join(f.dir, 'FTR-099-process-log.txt'))).toBe(false);
});

test('successful worker without required report fails the workflow', async () => {
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: async () => success('ok') })).rejects.toThrow('output missing');
  expect(f.entries()[0].status).toBe('failed');
});
test('fresh outputs skip workers; force requests them again', async () => {
  await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: phase1Dispatch });
  const dispatch = jest.fn(phase1Dispatch);
  await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  expect(dispatch).not.toHaveBeenCalled();
  await runWorkflow('pm-phase1', [f.feature, '--force'], { ...f.options, dispatch });
  expect(dispatch).toHaveBeenCalledTimes(3);
});
test('pm-phase2 stops before dispatch without Gate 1', async () => {
  const dispatch = jest.fn();
  await expect(runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch })).rejects.toThrow();
  expect(dispatch).not.toHaveBeenCalled(); expect(f.entries()[0].status).toBe('failed');
});
test('retired pm-phase3 never dispatches implementation or creates a done ledger', async () => {
  const dispatch = jest.fn();
  await expect(runWorkflow('pm-phase3', [f.feature], { ...f.options, dispatch })).rejects.toThrow('tasks start/run');
  expect(dispatch).not.toHaveBeenCalled();
});
test('unsupported assessment scopes fail closed rather than silently run zero assessors', async () => {
  const dispatch = jest.fn();
  await expect(runWorkflow('am-phase1', ['.', '--prefix', 'ASSESS-001', '--scope=unknown'], { ...f.options, dispatch })).rejects.toThrow('Unknown');
  expect(dispatch).not.toHaveBeenCalled();
});
test('security/domain/dependencies/devops use one generic assessor, never remediation workers', async () => {
  const calls = [];
  const dispatch = async options => {
    calls.push(options);
    if (options.args.includes('gaia-generic-software-assessment')) fs.writeFileSync(path.join(f.root, 'docs/assessments/ASSESS-001/ASSESS-001-Generic-Assessment.md'), '# Assessment');
    if (options.args.includes('gaia-intervention-documentation-standard')) {
      const output = path.join(f.root, 'docs/assessments/ASSESS-001');
      fs.writeFileSync(path.join(output, 'ASSESS-001-Interventions-Index.md'), '| ID | Title | Criticality |\n|---|---|---|\n| INT-001 | Risk | HIGH |\n');
    }
    return success('Assessment report');
  };
  const result = await runWorkflow('am-phase1', ['.', '--prefix', 'ASSESS-001', '--scope=security,domain-model,dependencies,devops'], { ...f.options, dispatch });
  expect(calls.map(o => o.args[o.args.indexOf('--agent') + 1])).toEqual(['gaia-generic-software-assessment', 'gaia-intervention-documentation-standard']);
  expect(calls[0].prompt).toContain('Explicit scope: security, domain-model, dependencies, devops');
  expect(result.severity_counts.HIGH).toBe(1); expect(result.remediation_hours_est).toBe(4);
  const approved = await runWorkflow('am-phase2', ['--prefix', 'ASSESS-001', '--ack', 'Reviewed', '--flagged', 'INT-001'], f.options);
  expect(approved.flagged_count).toBe(1);
  expect(fs.readFileSync(path.join(f.root, approved.approvals_path), 'utf8')).toContain('| INT-001 | Yes |');
});

function phase2Setup() {
  fs.writeFileSync(path.join(f.dir, 'FTR-099-Approvals.md'), '## Gate 1 — Document Approvals\n\n| Status |\n|---|\n| ✅ Approved |\n');
  fs.writeFileSync(path.join(f.dir, 'FTR-099-Requirements.md'), '## 7. Acceptance Criteria\n\n| ID | Criterion | Related UC |\n|---|---|---|\n');
  const wb = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/wb-valid.json'), 'utf8'));
  wb.phases.forEach(p => p.tasks.forEach(t => { t.acceptanceCriteria = []; }));
  return wb;
}
test.each([true, false])('pm-phase2 runs real validator/renderer and blocks a negative semantic verdict: %s', async valid => {
  const wb = phase2Setup();
  const dispatch = jest.fn(async options => {
    if (options.args.includes('gaia-generate-work-breakdown')) {
      fs.writeFileSync(path.join(f.dir, 'FTR-099-Work-Breakdown.json'), JSON.stringify(wb));
      return success('Generated');
    }
    return { exitCode: 0, result: { is_error: false, structured_output: { valid, findings: [] } } };
  });
  const promise = runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
  if (valid) {
    const result = await promise;
    expect(result.gate2_payload.gate2_blocked).toBe(false);
    expect(result.total_tasks).toBe(wb.phases.flatMap(p => p.tasks).length);
    expect(fs.readFileSync(result.tasks_csv_path, 'utf8')).toContain('phase_id|');
    expect(f.entries()[0].status).toBe('done');
  } else {
    await expect(promise).rejects.toThrow('semantic validation');
    expect(f.entries()[0].status).toBe('failed');
    expect(fs.existsSync(path.join(f.dir, 'FTR-099-Work-Breakdown.csv'))).toBe(false);
  }
});
test('malformed WB fails deterministic validation before semantic dispatch', async () => {
  phase2Setup();
  const dispatch = jest.fn(async () => {
    fs.writeFileSync(path.join(f.dir, 'FTR-099-Work-Breakdown.json'), '{invalid');
    return success('Generated');
  });
  await expect(runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch })).rejects.toThrow();
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(f.entries()[0].status).toBe('failed');
  expect(f.entries().find(e => e.agent.includes(':wb-validate:')).status).toBe('failed');
});
test('workflow CLI executes am-phase2 with real files and no LLM process', () => {
  const { spawnSync } = require('child_process');
  const dir = path.join(f.root, 'docs/assessments/ASSESS-099'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ASSESS-099-Interventions-Index.md'), '| ID | Criticality |\n|---|---|\n| INT-001 | LOW |\n');
  const result = spawnSync(process.execPath, [path.join(__dirname, '../../bin/cli.js'), 'workflow', 'run', 'am-phase2', '--project', f.root, '--home', f.home,
    '--', '--prefix', 'ASSESS-099', '--ack', 'I reviewed these findings', '--flagged', 'INT-001'], { encoding: 'utf8', shell: false });
  expect(result.stderr).toBe(''); expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).flagged_count).toBe(1);
});

test.each([
  { exitCode: 0, result: { is_error: true, result: 'failure' } },
  { exitCode: 0, parseError: 'malformed stdout' },
  { exitCode: null, timedOut: true },
])('worker protocol failure cannot create a done owner: %j', async response => {
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: async () => response })).rejects.toThrow('Worker failed');
  expect(f.entries()[0].status).toBe('failed');
});
test('a missing Claude executable fails the real subprocess adapter and the owner', async () => {
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, claudePath: path.join(f.root, 'missing-claude.exe') })).rejects.toThrow('executable not found');
  expect(f.entries()[0].status).toBe('failed');
});
test('repeated negative document validation never reports Gate 1 ready', async () => {
  const dispatch = async options => {
    const response = await phase1Dispatch(options);
    if (options.args.includes('gaia-validate-feature-docs')) response.result.structured_output = { valid: false, findings: ['Requirements incomplete'] };
    return response;
  };
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch })).rejects.toThrow('gaps remain');
  expect(f.entries()[0].status).toBe('failed');
});
