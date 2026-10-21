'use strict';

// Regression test for a real bug (reported against Fincantieri.ISDM.JobScheduler, FTR-012):
// replan() calls _loadPlanDocs() (lib/task-executor/index.js) to compute the successor's
// planDigest. When the successor feature only has a split wbs/ directory (no legacy
// {PREFIX}-Work-Breakdown.md/.csv), _loadPlanDocs() re-renders it in memory on EVERY call via
// wb-render.js's renderMarkdown/renderCsv — and renderMarkdown used to embed a live
// `new Date().toISOString()` "Generated" line, so two calls against the EXACT SAME unchanged
// wbs/ directory produced different bytes, hence different planDigest. Since replan()'s own
// "replan" intent record is immutable per run (a second call with different content throws
// INTENT_CONFLICT — see tests/lib/replan.test.js's own "a conflicting second call" test), this
// made replan() itself non-idempotent for a split-source successor: a second, otherwise-identical
// replan() call against the same run would spuriously throw INTENT_CONFLICT, and a later
// execute() --from-replan-run-id would spuriously throw REPLAN_PLAN_DIGEST_MISMATCH even on the
// very FIRST successor run, since execute()'s own _loadPlanDocs() call re-renders yet again.
//
// Fixed by renderMarkdown() accepting an optional, stable `generatedAt` override (defaulting to
// live wall-clock time for the CLI/human-facing path, unchanged) — _loadPlanDocs() passes
// wbs/index.json's own mtime, which is stable across repeated calls against an unchanged plan but
// still correctly changes if the plan is genuinely edited on disk between calls.
//
// SAFETY: mirrors tests/lib/replan.test.js's exact discipline — a repo created fresh per test
// under fs.mkdtempSync(os.tmpdir()), LOCAL-only git config, removed in afterEach. No real
// claude.exe/LLM call anywhere in this file (replan() itself never dispatches a worker).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const store = require('../../lib/task-executor/store');
const { replan } = require('../../lib/task-executor/index');
const { renderTaskDetailBlock, renderPhaseDetailBlock } = require('../../src/claude/scripts/wbs-assembler');

const RUN_ID = 'run-1';
const SUCCESSOR_PREFIX = 'FTR-902';

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
  gitCmd(dir, ['config', 'core.autocrlf', 'false']);
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function commitAll(dir, message) {
  gitCmd(dir, ['add', '-A']);
  gitCmd(dir, ['commit', '-q', '-m', message]);
  return gitCmd(dir, ['rev-parse', 'HEAD']).trim();
}

function baseStateFields(overrides) {
  return Object.assign(
    {
      runId: RUN_ID,
      featureId: 'FTR-900',
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

// A single-task, single-phase split wbs/ directory (schema v3) — mirrors
// tests/task-executor/plan-split-source.test.js's own fixture builder.
function writeSplitSuccessorFixture(featureDir, prefix) {
  fs.mkdirSync(featureDir, { recursive: true });
  writeFile(featureDir, 'feature.md', '# Split-Source Successor Feature\n\nFixture feature for replan.split-source-digest.test.js.\n');
  writeFile(
    featureDir,
    prefix + '-Approvals.md',
    '# Approval Record — ' + prefix + '\n\n' +
      '## Gate 1 — Document Approvals\n\n| Document | Status |\n|---|---|\n\n' +
      '## Gate 2 — Work Breakdown Approval\n\n| Document | Status |\n|---|---|\n' +
      '| ' + prefix + '-Work-Breakdown.md | ✅ Approved |\n'
  );

  const taskId = 'US-01-TASK-BE-01';
  const wbsDir = path.join(featureDir, 'wbs');
  const taskDetail = {
    id: taskId,
    title: 'Split-source successor task',
    outcome: 'Outcome one',
    domain: 'BE',
    agentType: 'developer-backend',
    dependsOn: [],
    acceptanceCriteria: [],
    estimate: { agentMinutes: 10, tokens: 1000 },
    outputCount: 1,
    groupingRationale: null,
    commit: { type: 'feat', scope: null, subject: 'successor test' },
    verification: { commands: [] },
  };
  writeFile(wbsDir, 'tasks/' + taskId + '.md', renderTaskDetailBlock(taskDetail, 'No implementation notes.'));

  const phase = { id: 'US-01', type: 'user-story', title: 'Split source successor phase', commit: { type: 'feat', scope: null, subject: 'successor phase' } };
  writeFile(wbsDir, 'user-stories/US-01.md', renderPhaseDetailBlock(phase, [{ id: taskId, title: taskDetail.title }], []));

  const index = {
    schemaVersion: 3,
    feature: prefix,
    phases: [{ id: 'US-01', type: 'user-story', sourceUC: [], detailFile: 'user-stories/US-01.md', taskIds: [taskId] }],
    tasks: {
      [taskId]: {
        title: taskDetail.title,
        outcome: taskDetail.outcome,
        domain: taskDetail.domain,
        agentType: taskDetail.agentType,
        dependsOn: [],
        acceptanceCriteria: [],
        estimate: { agentMinutes: 10, tokens: 1000 },
        outputCount: 1,
        commit: { type: 'feat', scope: null, subject: 'successor test' },
        detailFile: 'tasks/' + taskId + '.md',
        status: 'generated',
      },
    },
  };
  writeFile(wbsDir, 'index.json', JSON.stringify(index, null, 2));

  return { taskId };
}

describe('replan() against a split wbs/ successor (no legacy .md/.csv) — planDigest determinism', () => {
  let tmpDir;
  let executionRoot;
  let repoDir;
  let successorFeatureDir;
  let featureRef;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replan-split-source-digest-test-'));
    executionRoot = path.join(tmpDir, 'execution');
    repoDir = path.join(tmpDir, 'repo');
    successorFeatureDir = path.join(tmpDir, SUCCESSOR_PREFIX + '-successor-slug');
    fs.mkdirSync(repoDir);

    initRepo(repoDir);
    writeFile(repoDir, 'base.txt', 'base\n');
    commitAll(repoDir, 'init');

    const branchName = gitCmd(repoDir, ['symbolic-ref', '--short', 'HEAD']).trim();
    featureRef = 'refs/heads/' + branchName;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('two back-to-back replan() calls against the SAME unchanged split wbs/ successor agree on planDigest (idempotent, no INTENT_CONFLICT)', async () => {
    const { taskId: successorTaskId } = writeSplitSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
    const oldTaskId = 'US-99-TASK-BE-01';
    const state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(oldTaskId, { dependencies: [] });
    store.writeState(executionRoot, RUN_ID, state);

    const args = {
      executionRoot: executionRoot,
      runId: RUN_ID,
      projectDir: repoDir,
      taskRef: featureRef,
      feature: path.join(successorFeatureDir, 'feature.md'),
      taskMapping: [{ oldTaskId: oldTaskId, newTaskId: successorTaskId }],
    };

    const first = await replan(args);
    const second = await replan(args);

    expect(second).toEqual(first);
    expect(typeof first.successorPlanDigest).toBe('string');
    expect(first.successorPlanDigest).toHaveLength(64);

    const finalState = store.readState(executionRoot, RUN_ID);
    expect(finalState.runStatus).toBe('superseded');
  });
});
