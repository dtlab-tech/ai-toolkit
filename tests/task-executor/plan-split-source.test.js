'use strict';

// Regression test for a real bug (reported against Fincantieri.ISDM.JobScheduler, FTR-012):
// execute() hardcoded reading {PREFIX}-Work-Breakdown.md/.csv and threw PLAN_NOT_FOUND for
// every feature using the current split wbs/ directory format (schema v3) — the DEFAULT
// output of pm-phase2.js since FTR-025 stopped auto-rendering the legacy .md/.csv view ("no
// downstream consumer ever read it" — except this executor, which nobody updated to match).
// The fix (_loadPlanDocs in lib/task-executor/index.js) falls back to an in-process render
// of wbs/ via wbs-assembler.js's loadWorkBreakdown + wb-render.js's (now-exported)
// renderMarkdown/renderCsv when the legacy files are absent.
//
// Mirrors tests/task-executor/executor.sequential.test.js's exact real-dispatch harness
// (fake-claude-cli.js fixture, real git repo, real Bash verification) — this suite's only
// job is to prove execute() completes a real run end-to-end from a split wbs/ directory with
// NO legacy .md/.csv present at all, and that PLAN_NOT_FOUND still fires correctly (naming
// both candidate shapes) when NEITHER is present.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ownership = require('../../lib/task-executor/ownership');
const claudeProcess = require('../../lib/task-executor/claude-process');
const { execute } = require('../../lib/task-executor/index');
const { renderTaskDetailBlock, renderPhaseDetailBlock } = require('../../src/claude/scripts/wbs-assembler');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-claude-cli.js');
const NODE = process.execPath;

const VERIFIED_IDENTITY = {
  agentId: 'gaia.agent.developer.backend',
  nativeName: 'gaia-developer-backend',
  sha256: 'sha256:' + 'd'.repeat(64),
  path: '/fake/path/gaia-developer-backend.md',
  manifestPath: '/fake/path/.ai-toolkit-manifest.json',
  toolkitVersion: '0.13.0',
  scope: 'project',
};

jest.setTimeout(30000);

function gitCmd(dir, args, opts) {
  const res = spawnSync('git', args, Object.assign({ cwd: dir, shell: false, encoding: 'utf8', windowsHide: true }, opts || {}));
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

// A single-task, single-phase split wbs/ directory (schema v3) — the minimal shape
// loadWorkBreakdown()/wb-render.js's renderers need, built via the real codec functions
// (renderTaskDetailBlock/renderPhaseDetailBlock) so the fixture is byte-faithful, not
// hand-approximated.
function writeSplitWorkBreakdownFixture(featureDir, task) {
  fs.mkdirSync(featureDir, { recursive: true });
  writeFile(featureDir, 'feature.md', '# Split-Source Executor Test Feature\n\nFixture feature for plan-split-source.test.js.\n');

  const wbsDir = path.join(featureDir, 'wbs');
  const taskDetail = {
    id: task.id,
    title: task.title,
    outcome: task.outcome,
    domain: task.domain,
    agentType: task.agentType,
    dependsOn: [],
    acceptanceCriteria: [],
    estimate: { agentMinutes: 10, tokens: 1000 },
    outputCount: 1,
    groupingRationale: null,
    commit: { type: 'feat', scope: null, subject: 'split source test' },
    verification: { commands: task.verificationCommands },
  };
  writeFile(wbsDir, 'tasks/' + task.id + '.md', renderTaskDetailBlock(taskDetail, 'No implementation notes.'));

  const phase = { id: 'US-01', type: 'user-story', title: 'Split source phase', commit: { type: 'feat', scope: null, subject: 'split source phase' } };
  writeFile(wbsDir, 'user-stories/US-01.md', renderPhaseDetailBlock(phase, [{ id: task.id, title: task.title }], []));

  const index = {
    schemaVersion: 3,
    feature: 'FTR-888',
    phases: [{ id: 'US-01', type: 'user-story', sourceUC: [], detailFile: 'user-stories/US-01.md', taskIds: [task.id] }],
    tasks: {
      [task.id]: {
        title: task.title,
        outcome: task.outcome,
        domain: task.domain,
        agentType: task.agentType,
        dependsOn: [],
        acceptanceCriteria: [],
        estimate: { agentMinutes: 10, tokens: 1000 },
        outputCount: 1,
        commit: { type: 'feat', scope: null, subject: 'split source test' },
        detailFile: 'tasks/' + task.id + '.md',
        status: 'generated',
      },
    },
  };
  writeFile(wbsDir, 'index.json', JSON.stringify(index, null, 2));
}

describe('execute(): split wbs/ directory fallback (no legacy {PREFIX}-Work-Breakdown.md/.csv)', () => {
  let tmpDir;
  let repoDir;
  let featureDir;
  let executionRoot;
  let verifyIdentitySpy;
  let originalPlatform;

  beforeEach(() => {
    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'executor-split-source-test-'));
    repoDir = path.join(tmpDir, 'repo');
    featureDir = path.join(tmpDir, 'FTR-888-split-source-test');
    fs.mkdirSync(repoDir);

    initRepo(repoDir);
    writeFile(repoDir, 'base.txt', 'base\n');
    commitAll(repoDir, 'init');

    const commonDirOut = gitCmd(repoDir, ['rev-parse', '--git-common-dir']).trim();
    executionRoot = path.join(path.resolve(repoDir, commonDirOut), 'ai-toolkit', 'execution');

    verifyIdentitySpy = jest.spyOn(claudeProcess, 'verifyAgentIdentity').mockReturnValue(VERIFIED_IDENTITY);
  });

  afterEach(() => {
    verifyIdentitySpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  test('a feature with ONLY a split wbs/ directory (no legacy .md/.csv) runs to completion, not PLAN_NOT_FOUND', async () => {
    const task = {
      id: 'US-01-TASK-BE-SPLIT-01',
      title: 'Split-source task',
      outcome: 'Split-source wbs fixture task completes',
      domain: 'BE',
      agentType: 'developer-backend',
      verificationCommands: ['test -f US-01-TASK-BE-SPLIT-01.output.txt'],
    };
    writeSplitWorkBreakdownFixture(featureDir, task);

    expect(fs.existsSync(path.join(featureDir, 'FTR-888-Work-Breakdown.md'))).toBe(false);
    expect(fs.existsSync(path.join(featureDir, 'FTR-888-Work-Breakdown.csv'))).toBe(false);

    const result = await execute({
      project: repoDir,
      feature: path.join(featureDir, 'feature.md'),
      claudePath: NODE,
      taskTimeoutMs: 15000,
      agentBudgetUsd: 5,
      implementationSpawnArgs: [FIXTURE, '--mode=write-file-and-succeed'],
      reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
    });

    expect(result.runStatus).toBe('completed');
    expect(result.tasks).toEqual([{ taskId: task.id, status: 'checkpointed' }]);
    expect(fs.existsSync(path.join(repoDir, task.id + '.output.txt'))).toBe(true);
    expect(ownership.readLease(executionRoot)).toBeNull();
  });

  test('a feature with NEITHER legacy .md/.csv NOR a wbs/ directory fails closed with PLAN_NOT_FOUND naming both candidate shapes', async () => {
    fs.mkdirSync(featureDir, { recursive: true });
    writeFile(featureDir, 'feature.md', '# No Plan At All\n');

    await expect(execute({
      project: repoDir,
      feature: path.join(featureDir, 'feature.md'),
      claudePath: NODE,
    })).rejects.toMatchObject({
      code: 'PLAN_NOT_FOUND',
      message: expect.stringContaining('wbs'),
    });
  });
});
