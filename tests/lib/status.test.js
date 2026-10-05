'use strict';

// Tests for lib/task-executor/index.js's `status` command. This was
// previously a NOT_IMPLEMENTED stub whose doc comment incorrectly attributed
// its "real implementation" to US-06-TASK-BE-01 (that task is actually
// resume/reconcile, see tests/lib/resume-reconcile.test.js) — the Work
// Breakdown never actually allocated a task for status's own body. It is
// built entirely from three already-implemented, already-tested primitives:
// store.readState, the run's own token-ledger.json
// (lib/execution-ledger.js's write format), and the target project's
// docs/token-pricing.json (same file/shape lib/workflow-artifacts.js reads).
//
// SAFETY: mirrors tests/lib/resume-reconcile.test.js's exact discipline —
// every git command in this suite runs with an explicit `cwd` pointing at a
// repository created fresh, per test, under `fs.mkdtempSync(os.tmpdir())`,
// with a LOCAL (repo-scoped only) `user.name`/`user.email`. No git command
// in this file ever targets this project's own working tree. Every tmp repo
// is removed in `afterEach`.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const store = require('../../lib/task-executor/store');
const { status } = require('../../lib/task-executor/index');

const RUN_ID = 'run-status-1';

function gitCmd(dir, args) {
  const res = spawnSync('git', args, { cwd: dir, shell: false, encoding: 'utf8', windowsHide: true });
  if (res.status !== 0) {
    throw new Error('test setup: "git ' + args.join(' ') + '" in ' + dir + ' failed: ' + (res.stderr || res.error));
  }
  return res.stdout;
}

function initRepo(dir) {
  gitCmd(dir, ['init', '-q']);
  gitCmd(dir, ['config', 'user.name', 'AI Toolkit Test']);
  gitCmd(dir, ['config', 'user.email', 'ai-toolkit-test@example.invalid']);
}

function baseStateFields(overrides) {
  return Object.assign(
    {
      runId: RUN_ID,
      featureId: 'FTR-099',
      repo: '/repo',
      commonDir: '/repo/.git',
      featureRef: 'refs/heads/feature/x',
      baseSha: 'a'.repeat(40),
      planDigest: 'b'.repeat(64),
      contextHashes: {},
      config: { maxConcurrency: 1 },
      runStatus: 'running',
    },
    overrides || {}
  );
}

describe('status', () => {
  let tmpDir;
  let repoDir;
  let executionRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-test-'));
    repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir);
    initRepo(repoDir);
    // status() derives executionRoot itself via `git rev-parse --git-common-dir`
    // resolved against repoDir — for a plain (non-worktree) repo that is
    // always "<repoDir>/.git".
    executionRoot = path.join(repoDir, '.git', 'ai-toolkit', 'execution');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeLedger(entries) {
    const runDir = path.join(executionRoot, 'runs', RUN_ID);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, RUN_ID + '-token-ledger.json'), JSON.stringify(entries));
  }

  function writePricing(pricing) {
    const docsDir = path.join(repoDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'token-pricing.json'), JSON.stringify(pricing));
  }

  describe('input validation', () => {
    test('throws on missing args.project', () => {
      return expect(status({ runId: RUN_ID })).rejects.toThrow();
    });

    test('throws on missing args.runId', () => {
      return expect(status({ project: repoDir })).rejects.toThrow();
    });
  });

  test('propagates STATE_NOT_FOUND unmodified for an unknown run', async () => {
    await expect(status({ project: repoDir, runId: 'does-not-exist' })).rejects.toMatchObject({
      code: 'STATE_NOT_FOUND',
    });
  });

  test('counts tasks per status and reports runStatus, with no ledger written yet', async () => {
    let state = new store.State(baseStateFields({ runStatus: 'blocked' }))
      .addTask('T-01', { dependencies: [] })
      .addTask('T-02', { dependencies: [] })
      .addTask('T-03', { dependencies: [] });
    state = state.setTaskStatus('T-01', 'checkpointed');
    state = state.setTaskStatus('T-02', 'blocked');
    store.writeState(executionRoot, RUN_ID, state);

    const result = await status({ project: repoDir, runId: RUN_ID });

    expect(result.runId).toBe(RUN_ID);
    expect(result.runStatus).toBe('blocked');
    expect(result.taskCounts).toEqual({
      pending: 1, active: 0, checkpointed: 1, integrated: 0, skipped: 0, blocked: 1,
    });
    // Null-compatibility: no ledger activity yet is "unavailable", never a
    // real, observable zero.
    expect(result.totalTokens).toBeNull();
    expect(result.totalCostUsd).toBeNull();
  });

  test('sums measured tokens across ledger entries, excluding unmeasured ones', async () => {
    const state = new store.State(baseStateFields()).addTask('T-01', { dependencies: [] });
    store.writeState(executionRoot, RUN_ID, state);
    writeLedger([
      { agent: 'executor:' + RUN_ID + ':T-01:implementation', phase: 'implementation', model: null, phase_delta_tokens: null },
      { agent: 'executor:' + RUN_ID + ':T-01:task', phase: 'task', model: null, phase_delta_tokens: 1000 },
      { agent: 'executor:' + RUN_ID + ':T-02:implementation', phase: 'implementation', model: null, phase_delta_tokens: 500 },
    ]);

    const result = await status({ project: repoDir, runId: RUN_ID });

    expect(result.totalTokens).toBe(1500);
    // No docs/token-pricing.json in this project and every entry's model is
    // null — cost stays unavailable, never a fabricated zero.
    expect(result.totalCostUsd).toBeNull();
  });

  test('computes totalCostUsd from docs/token-pricing.json using an 80/20 split, in USD (not EUR)', async () => {
    const state = new store.State(baseStateFields()).addTask('T-01', { dependencies: [] });
    store.writeState(executionRoot, RUN_ID, state);
    writeLedger([
      { agent: 'a', phase: 'implementation', model: 'sonnet', phase_delta_tokens: 1000000 },
      { agent: 'b', phase: 'task', model: 'unknown-model', phase_delta_tokens: 2000 },
    ]);
    writePricing({
      usd_to_eur: 0.92,
      models: { sonnet: { input_per_1m_usd: 3.00, output_per_1m_usd: 15.00 } },
    });

    const result = await status({ project: repoDir, runId: RUN_ID });

    // 1,000,000 tokens * (0.8*3 + 0.2*15) / 1,000,000 = 0.8*3 + 0.2*15 = 5.4 USD.
    // The second entry's model has no pricing row, so it contributes tokens
    // (totalTokens includes it) but no cost.
    expect(result.totalTokens).toBe(1002000);
    expect(result.totalCostUsd).toBeCloseTo(5.4, 10);
  });

  test('throws LEDGER_CORRUPTED for an unparseable ledger file', async () => {
    const state = new store.State(baseStateFields()).addTask('T-01', { dependencies: [] });
    store.writeState(executionRoot, RUN_ID, state);
    const runDir = path.join(executionRoot, 'runs', RUN_ID);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, RUN_ID + '-token-ledger.json'), 'not json');

    await expect(status({ project: repoDir, runId: RUN_ID })).rejects.toMatchObject({
      code: 'LEDGER_CORRUPTED',
    });
  });

  test('throws PRICING_CORRUPTED for an unparseable pricing file', async () => {
    const state = new store.State(baseStateFields()).addTask('T-01', { dependencies: [] });
    store.writeState(executionRoot, RUN_ID, state);
    writeLedger([{ agent: 'a', phase: 'implementation', model: 'sonnet', phase_delta_tokens: 100 }]);
    const docsDir = path.join(repoDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'token-pricing.json'), 'not json');

    await expect(status({ project: repoDir, runId: RUN_ID })).rejects.toMatchObject({
      code: 'PRICING_CORRUPTED',
    });
  });
});
