'use strict';

// Measured actuals written next to the feature's documents (lib/task-executor/report.js and
// `ai-toolkit executor report`). Evidence is fabricated in a temp directory: no real claude process runs.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const store = require('../../lib/task-executor/store');
const report = require('../../lib/task-executor/report');

const CLI = path.join(__dirname, '..', '..', 'bin', 'cli.js');
const WF_RUN = '11111111-2222-4333-8444-555555555555';
const RUN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RUN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

let root, executionRoot, featureDir, workflowsDir;

function writeRun(runId, featureId, status, taskIds) {
  let state = new store.State({
    runId, featureId, repo: root, commonDir: path.join(root, '.git'), featureRef: 'main', baseSha: 'a'.repeat(40),
    planDigest: 'b'.repeat(64), config: { maxConcurrency: 1 }, runStatus: status,
  });
  taskIds.forEach(id => { state = state.addTask(id, { dependencies: [] }); });
  store.writeState(executionRoot, runId, state);
}

function evidence(runId, name, invocation, usage, extra = {}) {
  const dir = path.join(executionRoot, 'evidence', runId);
  fs.mkdirSync(dir, { recursive: true });
  const record = {
    version: 1, runId, agentId: 'gaia.agent.developer.backend', startedAt: extra.startedAt || '2026-11-05T10:00:00.000Z',
    invocation: { ...invocation, args: ['--print', 'SECRET-PROMPT-TEXT'] },
    response: { durationMs: extra.durationMs ?? 60000, result: usage ? { result: 'SECRET-OUTPUT-TEXT', modelUsage: usage } : null },
  };
  fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(record));
}

const usage = (cost, input = 1000, output = 500, cacheRead = 2000, cacheWrite = 100) => ({
  'claude-haiku-5-5-x': { inputTokens: input, outputTokens: output, cacheReadInputTokens: cacheRead, cacheCreationInputTokens: cacheWrite, costUSD: cost, canonicalModel: 'claude-haiku-5-5' },
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'actuals-'));
  executionRoot = path.join(root, '.git', 'ai-toolkit', 'execution');
  featureDir = path.join(root, 'features', 'FTR-077-demo');
  workflowsDir = path.join(root, 'workflows');
  fs.mkdirSync(featureDir, { recursive: true });
  fs.writeFileSync(path.join(featureDir, 'feature.md'), '# Demo\n');
  fs.writeFileSync(path.join(featureDir, 'FTR-077-token-ledger.json'), JSON.stringify([
    { operation_id: 'x', agent: `pm-phase2:work-breakdown-task:T-1:${WF_RUN}:1`, phase: 'pm-phase2', status: 'done' },
  ]));
  fs.mkdirSync(path.join(workflowsDir, WF_RUN), { recursive: true });
  fs.writeFileSync(path.join(workflowsDir, WF_RUN, 'w1.json'), JSON.stringify({
    agentId: 'gaia.agent.planner.work-breakdown-task',
    response: { durationMs: 120000, result: { modelUsage: usage(0.25, 4000, 900, 0, 0) } },
  }));

  writeRun(RUN_A, 'FTR-077', 'paused', ['INFRA-TASK-BE-01', 'US-01-TASK-BE-01']);
  evidence(RUN_A, 'e1', { dispatchKind: 'implementation', taskId: 'INFRA-TASK-BE-01', attemptNumber: 1 }, usage(0.01), { startedAt: '2026-11-05T10:00:00.000Z' });
  evidence(RUN_A, 'e2', { dispatchKind: 'implementation', taskId: 'US-01-TASK-BE-01', attemptNumber: 1 }, usage(0.02), { startedAt: '2026-11-05T10:05:00.000Z' });
  evidence(RUN_A, 'e3', { dispatchKind: 'review', taskId: 'US-01-TASK-BE-01', attemptNumber: 1 }, usage(0.5, 200, 100, 0, 0), { startedAt: '2026-11-05T10:10:00.000Z' });
  writeRun(RUN_B, 'FTR-077', 'completed', ['US-01-TASK-BE-01']);
  evidence(RUN_B, 'e4', { dispatchKind: 'implementation', taskId: 'US-01-TASK-BE-01', attemptNumber: 1 }, usage(0.03), { startedAt: '2026-11-06T09:00:00.000Z' });
  // a call that returned nothing usable
  evidence(RUN_B, 'e5', { dispatchKind: 'implementation', taskId: 'US-01-TASK-BE-01', attemptNumber: 2 }, null, { startedAt: '2026-11-06T09:05:00.000Z' });
  // a run of another feature must not count
  writeRun(OTHER, 'FTR-999', 'completed', ['INFRA-TASK-BE-01']);
  evidence(OTHER, 'e6', { dispatchKind: 'implementation', taskId: 'INFRA-TASK-BE-01', attemptNumber: 1 }, usage(9.99));
});

afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

const args = () => ({ executionRoot, featureId: 'FTR-077', featureDir, workflowsDir });

describe('collectActuals', () => {
  test('sums development, review and documentation separately and ignores other features', () => {
    const d = report.collectActuals(args());
    expect(d.dev.calls).toBe(4);
    expect(d.dev.usd).toBeCloseTo(0.06, 6);
    expect(d.review.calls).toBe(1);
    expect(d.review.usd).toBeCloseTo(0.5, 6);
    expect(d.docs.total.usd).toBeCloseTo(0.25, 6);
    expect(d.docs.runs).toBe(1);
    expect(d.docs.byPhase['pm-phase2'].calls).toBe(1);
    expect(d.runs.map(r => r.runId)).toEqual([RUN_A, RUN_B]);
  });

  test('a call without a usable result is counted and adds no cost', () => {
    const d = report.collectActuals(args());
    expect(d.dev.noResult).toBe(1);
    const row = d.rows.find(r => r.attempt === 2);
    expect(row.measured).toBe(false);
    expect(row.costUsd).toBe(0);
  });

  test('counts developer calls per task over every run and groups cost by phase', () => {
    const d = report.collectActuals(args());
    expect(d.tasksWithCalls).toBe(2);
    expect(d.attempts).toEqual({ 1: 1, 3: 1 });
    expect(d.byPhase['INFRA'].dev.usd).toBeCloseTo(0.01, 6);
    expect(d.byPhase['US-01'].dev.usd).toBeCloseTo(0.05, 6);
    expect(d.byPhase['US-01'].review.usd).toBeCloseTo(0.5, 6);
  });

  test('a missing workflow evidence directory is reported, not an error', () => {
    fs.rmSync(path.join(workflowsDir, WF_RUN), { recursive: true });
    const d = report.collectActuals(args());
    expect(d.docs.missingRuns).toBe(1);
    expect(report.renderTokenEstimate(d, { date: 'D' })).toMatch(/no longer available/);
  });

  test('a feature with no run at all gives empty totals', () => {
    const d = report.collectActuals({ ...args(), featureId: 'FTR-500', featureDir: path.join(root, 'features') });
    expect(d.runs).toEqual([]);
    expect(d.dev.usd).toBe(0);
  });
});

describe('written files', () => {
  test('writes the estimate and the ledger into the feature folder, with totals', () => {
    const out = report.writeActualsReports({ ...args(), date: '2026-11-09' });
    expect(out.written.map(f => path.basename(f))).toEqual(['FTR-077-Token-Estimate.md', 'FTR-077-executor-ledger.json']);
    expect(out.totals.costUsd).toBeCloseTo(0.81, 6);
    expect(out.totals.developmentUsd).toBeCloseTo(0.06, 6);
    const md = fs.readFileSync(out.written[0], 'utf8');
    expect(md).toMatch(/# Token Estimate — FTR-077 \(measured actuals\)/);
    expect(md).toMatch(/\*\*Total measured\*\*/);
    expect(md).toMatch(/\$0\.810/);
    expect(md).toMatch(/2026-11-09/);
  });

  test('the ledger has one compact row per call and never holds a prompt or an output', () => {
    const out = report.writeActualsReports(args());
    const ledgerText = fs.readFileSync(out.written[1], 'utf8');
    const ledger = JSON.parse(ledgerText);
    expect(ledger.calls).toHaveLength(6 - 1);                  // the other feature's call is not there
    expect(ledger.calls.map(c => c.kind)).toContain('review');
    expect(ledger.calls[0]).toEqual(expect.objectContaining({ task: 'INFRA-TASK-BE-01', model: 'claude-haiku-5-5', measured: true }));
    expect(ledgerText).not.toMatch(/SECRET-/);
    expect(fs.readFileSync(out.written[0], 'utf8')).not.toMatch(/SECRET-/);
  });

  test('the same evidence renders the same text', () => {
    const a = report.renderTokenEstimate(report.collectActuals(args()), { date: 'D' });
    const b = report.renderTokenEstimate(report.collectActuals(args()), { date: 'D' });
    expect(a).toBe(b);
  });
});

describe('ai-toolkit executor report', () => {
  function gitRepoWithEvidence() {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'actuals-cli-'));
    spawnSync('git', ['init', '-q'], { cwd: repo });
    fs.cpSync(path.join(root, '.git', 'ai-toolkit'), path.join(repo, '.git', 'ai-toolkit'), { recursive: true });
    const dir = path.join(repo, 'features', 'FTR-077-demo');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'feature.md'), '# Demo\n');
    return { repo, dir };
  }

  test('writes both files and prints the totals as JSON', () => {
    const { repo, dir } = gitRepoWithEvidence();
    try {
      const r = spawnSync(process.execPath, [CLI, 'executor', 'report', '--project', repo, '--feature', path.join('features', 'FTR-077-demo', 'feature.md')], { encoding: 'utf8' });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.totals.developmentUsd).toBeCloseTo(0.06, 6);
      expect(fs.existsSync(path.join(dir, 'FTR-077-Token-Estimate.md'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'FTR-077-executor-ledger.json'))).toBe(true);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test('without --feature it is a usage error', () => {
    const r = spawnSync(process.execPath, [CLI, 'executor', 'report', '--project', root], { encoding: 'utf8' });
    expect(r.status).toBe(2);
  });
});
