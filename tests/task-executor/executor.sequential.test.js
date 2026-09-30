'use strict';

// Integration tests for the sequential (maxConcurrency=1) executor main loop
// (US-07-TASK-BE-01, FTR-018): lib/task-executor/index.js's execute(). This
// is the single most important integration point in the whole feature — it
// wires together nearly every module built so far (plan.js, store.js,
// ownership.js, claude-process.js, git.js, execution-ledger.js) into the
// real `start` command's run loop.
//
// This suite deliberately does NOT re-test any of those modules' internals
// in isolation — those are already covered by tests/lib/*.test.js and by
// tests/task-executor/verification-review.test.js /
// tests/task-executor/resume-replan.test.js. Its only job is to prove the
// real, already-implemented pieces compose correctly end-to-end through
// execute() itself, exactly as a real operator's `start` CLI command will:
// dispatch a real (fixture) subprocess -> real Bash verification -> real
// (fixture) review subprocess -> real Git staging/commit -> real ledger
// finalization -> repeat for the next ready task.
//
// SAFETY (mirrors tests/task-executor/resume-replan.test.js's and
// tests/task-executor/verification-review.test.js's exact discipline):
//   - NO test in this file ever spawns real claude.exe or makes a real LLM/
//     API call. Every dispatched "agent" is tests/fixtures/fake-claude-cli.js,
//     invoked via process.execPath (the local Node binary) as the
//     `claudePath` — a deterministic, LLM-free, zero-cost Node script.
//   - claudeProcess.verifyAgentIdentity is stubbed via jest.spyOn (same house
//     style as every other task-executor integration test) — agent identity
//     resolution mechanics are already covered by US-03-TASK-BE-02's own
//     tests; this suite is not exercising that CLI shell-out.
//   - Every Git operation in this suite runs against a repository created
//     fresh, per test, under fs.mkdtempSync(os.tmpdir()), with a LOCAL
//     (repo-scoped only) user.name/user.email set via `git config` (never
//     --global). No git command in this file ever targets this project's own
//     working tree. Every tmp repo is removed in afterEach.
//   - MANDATORY NEGATIVE TEST (Gate-1 binding constraint #2): "scenario 2"
//     below dispatches a fake agent that reports success (is_error:false)
//     but does NOT actually write the file it was supposed to — proving the
//     task is never marked checkpointed/complete on a model's self-report
//     alone; real Bash verification (`test -f ...`) catches the discrepancy
//     and the task ends up 'blocked' after the retry policy is exhausted.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const store = require('../../lib/task-executor/store');
const ownership = require('../../lib/task-executor/ownership');
const claudeProcess = require('../../lib/task-executor/claude-process');
const { execute } = require('../../lib/task-executor/index');

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

// Real subprocess spawns (fixture dispatch + review, per task/attempt) and
// real git operations across several tasks can take a while on a loaded
// CI/parallel test-run machine — mirrors the generous allowances every other
// real-spawn suite in this project already uses.
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

// ── Minimal real Work-Breakdown.md/.csv fixture builder ─────────────────────
// Mirrors tests/task-executor/resume-replan.test.js's own successor-fixture
// builder (renderTaskDetail/buildSuccessorMarkdown/buildSuccessorCsv), byte-
// for-byte structural style, extended with real dependsOn edges and real
// fenced verification commands (this suite needs both — the successor
// fixture in resume-replan.test.js needed neither).

function taskAnchor(id) {
  return 'task-' + id.replace(/[^A-Za-z0-9_-]/g, '-');
}

function fencedCommandBlock(cmd) {
  const runs = cmd.match(/`+/g) || [];
  const maxRun = runs.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
  const fence = '`'.repeat(Math.max(3, maxRun + 1));
  return fence + '\n' + cmd + '\n' + fence;
}

function renderTaskDetail(task) {
  const L = [];
  L.push('<a id="' + taskAnchor(task.id) + '"></a>');
  L.push('### ' + task.id);
  L.push('');
  L.push('- **Task ID:** ' + task.id);
  L.push('- **Title:** ' + task.title);
  L.push('- **Outcome:** ' + task.outcome);
  L.push('- **Domain:** ' + task.domain);
  L.push('- **Agent type:** ' + task.agentType);
  L.push('- **Dependencies:** ' + (task.dependsOn && task.dependsOn.length > 0 ? task.dependsOn.join(', ') : '—'));
  L.push('- **Acceptance criteria:** —');
  L.push('- **Estimate — agent minutes:** —');
  L.push('- **Estimate — tokens:** —');
  L.push('- **Output count:** —');
  L.push('- **Grouping rationale:** —');
  L.push('- **Commit type:** —');
  L.push('- **Commit scope:** —');
  L.push('- **Commit subject:** —');
  L.push('');
  L.push('**Verification commands:**');
  L.push('');
  if (task.verificationCommands && task.verificationCommands.length > 0) {
    task.verificationCommands.forEach(function (cmd) {
      L.push(fencedCommandBlock(cmd));
      L.push('');
    });
  } else {
    L.push('_No verification commands._');
    L.push('');
  }
  return L.join('\n');
}

function buildMarkdown(prefix, tasks) {
  const L = [];
  L.push('# Work Breakdown — ' + prefix);
  L.push('');
  L.push('## Summary');
  L.push('| Metric | Value |');
  L.push('|--------|-------|');
  L.push('| Total tasks | ' + tasks.length + ' |');
  L.push('');
  L.push('## Task Details');
  L.push('');
  tasks.forEach(function (task) { L.push(renderTaskDetail(task)); });
  L.push('## Statistics');
  L.push('');
  return L.join('\n');
}

function buildCsv(tasks) {
  const HEADER = 'phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type';
  const L = [HEADER];
  tasks.forEach(function (task) {
    L.push(['PHASE-1', 'Sequential test phase', 'feat: sequential test', '', task.id, task.title, task.domain, task.agentType].join('|'));
  });
  return L.join('\n') + '\n';
}

function writeWorkBreakdownFixture(featureDir, prefix, tasks) {
  fs.mkdirSync(featureDir, { recursive: true });
  writeFile(featureDir, 'feature.md', '# Sequential Executor Test Feature\n\nFixture feature for executor.sequential.test.js.\n');
  writeFile(featureDir, prefix + '-Work-Breakdown.md', buildMarkdown(prefix, tasks));
  writeFile(featureDir, prefix + '-Work-Breakdown.csv', buildCsv(tasks));
}

describe('execute(): sequential (maxConcurrency=1) main loop (US-07-TASK-BE-01)', () => {
  let tmpDir;
  let repoDir;
  let featureDir;
  let executionRoot;
  let verifyIdentitySpy;
  let originalPlatform;

  beforeEach(() => {
    // US-08-TASK-BE-05's platform qualification guard is the very first
    // statement in execute() — it refuses to run at all on non-win32. None
    // of this file's tests exercise real Windows-only behavior (they use the
    // fake CLI fixture and real-but-portable git/Bash operations only), so
    // this override just lets execute() past that guard on any host OS
    // (this project's own CI runs ubuntu-latest) to reach the real logic
    // these tests actually verify.
    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'executor-sequential-test-'));
    repoDir = path.join(tmpDir, 'repo');
    featureDir = path.join(tmpDir, 'FTR-777-sequential-test');
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

  test(
    'a real 3-task dependency chain dispatches/verifies/reviews/checkpoints one task at a time, strictly in order, and completes',
    async () => {
      const tasks = [
        {
          id: 'US-01-TASK-BE-CHAIN-01',
          title: 'Chain task one',
          outcome: 'First task in the chain completes',
          domain: 'BE',
          agentType: 'developer-backend',
          dependsOn: [],
          verificationCommands: ['test -f US-01-TASK-BE-CHAIN-01.output.txt'],
        },
        {
          id: 'US-01-TASK-BE-CHAIN-02',
          title: 'Chain task two',
          outcome: 'Second task in the chain completes after the first',
          domain: 'BE',
          agentType: 'developer-backend',
          dependsOn: ['US-01-TASK-BE-CHAIN-01'],
          verificationCommands: [
            'test -f US-01-TASK-BE-CHAIN-02.output.txt',
            'test -f US-01-TASK-BE-CHAIN-01.output.txt',
          ],
        },
        {
          id: 'US-01-TASK-BE-CHAIN-03',
          title: 'Chain task three',
          outcome: 'Third task in the chain completes last',
          domain: 'BE',
          agentType: 'developer-backend',
          dependsOn: ['US-01-TASK-BE-CHAIN-02'],
          verificationCommands: ['test -f US-01-TASK-BE-CHAIN-03.output.txt'],
        },
      ];
      writeWorkBreakdownFixture(featureDir, 'FTR-777', tasks);

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
      expect(result.tasks.sort((a, b) => a.taskId.localeCompare(b.taskId))).toEqual([
        { taskId: 'US-01-TASK-BE-CHAIN-01', status: 'checkpointed' },
        { taskId: 'US-01-TASK-BE-CHAIN-02', status: 'checkpointed' },
        { taskId: 'US-01-TASK-BE-CHAIN-03', status: 'checkpointed' },
      ]);

      // Real files really landed in the real worktree.
      tasks.forEach((task) => {
        expect(fs.existsSync(path.join(repoDir, task.id + '.output.txt'))).toBe(true);
      });

      // The repo-wide execution lease was released — a second run could
      // start cleanly.
      expect(ownership.readLease(executionRoot)).toBeNull();

      // Real, durable state: exactly one attempt per task, each reaching
      // 'committed' (registerCommitSHA's terminal stage — finalizeTaskCheckpoint
      // does not advance attempt.stage past it, only task.status).
      const state = store.readState(executionRoot, result.runId);
      tasks.forEach((task) => {
        const t = state.tasks[task.id];
        expect(t.status).toBe('checkpointed');
        expect(t.attempts).toHaveLength(1);
        expect(t.attempts[0].stage).toBe('committed');
        expect(t.attempts[0].originalSha).toMatch(/^[0-9a-f]{40}$/);
        expect(t.attempts[0].integratedSha).toBe(t.attempts[0].originalSha); // sequential: N=1
      });

      // Real git history proves STRICT sequential ordering: task 2's commit
      // parent is task 1's commit, task 3's commit parent is task 2's commit
      // — a linear chain, never interleaved/parallel, exactly the "one slot
      // reserved through the whole chain" invariant (AC-06).
      const sha1 = state.tasks['US-01-TASK-BE-CHAIN-01'].attempts[0].originalSha;
      const sha2 = state.tasks['US-01-TASK-BE-CHAIN-02'].attempts[0].originalSha;
      const sha3 = state.tasks['US-01-TASK-BE-CHAIN-03'].attempts[0].originalSha;

      const parentOf = (sha) => gitCmd(repoDir, ['rev-parse', sha + '^']).trim();
      expect(parentOf(sha2)).toBe(sha1);
      expect(parentOf(sha3)).toBe(sha2);

      // Trailers really landed on each commit.
      const trailersOf = (sha) => gitCmd(repoDir, ['show', '-s', '--format=%B', sha]);
      expect(trailersOf(sha1)).toContain('AI-Toolkit-Run: ' + result.runId);
      expect(trailersOf(sha1)).toContain('AI-Toolkit-Task: US-01-TASK-BE-CHAIN-01');
      expect(trailersOf(sha2)).toContain('AI-Toolkit-Task: US-01-TASK-BE-CHAIN-02');
      expect(trailersOf(sha3)).toContain('AI-Toolkit-Task: US-01-TASK-BE-CHAIN-03');

      // The branch actually advanced to the last task's commit.
      expect(gitCmd(repoDir, ['rev-parse', 'HEAD']).trim()).toBe(sha3);

      // The real per-run ledger recorded a finalized (status "done", null
      // tokens, reason "control-only") 'task' activity for every task.
      const ledgerPaths = store._executionPaths(executionRoot, result.runId);
      const ledgerFile = path.join(ledgerPaths.runDir, result.runId + '-token-ledger.json');
      const ledgerEntries = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
      tasks.forEach((task) => {
        const taskActivity = ledgerEntries.find(
          (e) => e.agent === 'executor:' + result.runId + ':' + task.id + ':task'
        );
        expect(taskActivity).toBeDefined();
        expect(taskActivity.status).toBe('done');
        expect(taskActivity.phase_delta_tokens).toBeNull();
      });
    }
  );

  // ── MANDATORY NEGATIVE TEST (Gate-1 binding constraint #2) ────────────────
  test(
    'a fake agent that reports success but writes NOTHING real is never checkpointed — verification catches the discrepancy and the task is blocked after the retry policy is exhausted',
    async () => {
      const tasks = [
        {
          id: 'US-01-TASK-BE-FALSE-SUCCESS',
          title: 'False-success task',
          outcome: 'This task must never be marked complete on self-report alone',
          domain: 'BE',
          agentType: 'developer-backend',
          dependsOn: [],
          // The agent (echo-json mode below) never writes this file — real
          // Bash verification must catch that, not the agent's own claim.
          verificationCommands: ['test -f US-01-TASK-BE-FALSE-SUCCESS.output.txt'],
        },
      ];
      writeWorkBreakdownFixture(featureDir, 'FTR-777', tasks);

      const result = await execute({
        project: repoDir,
        feature: path.join(featureDir, 'feature.md'),
        claudePath: NODE,
        taskTimeoutMs: 15000,
        agentBudgetUsd: 5,
        // echo-json: is_error:false ("success"), but writes no file at all —
        // the exact false-completion scenario Gate-1 binding constraint #2
        // requires a test for.
        implementationSpawnArgs: [FIXTURE, '--mode=echo-json'],
        reviewSpawnArgs: [FIXTURE, '--mode=review-verdict-pass'],
      });

      expect(result.runStatus).toBe('blocked');
      expect(result.tasks).toEqual([{ taskId: 'US-01-TASK-BE-FALSE-SUCCESS', status: 'blocked' }]);

      // Never checkpointed, never committed — the false "success" bought it
      // nothing.
      expect(fs.existsSync(path.join(repoDir, 'US-01-TASK-BE-FALSE-SUCCESS.output.txt'))).toBe(false);
      expect(gitCmd(repoDir, ['log', '--oneline']).trim().split('\n')).toHaveLength(1); // only the "init" commit

      const state = store.readState(executionRoot, result.runId);
      const task = state.tasks['US-01-TASK-BE-FALSE-SUCCESS'];
      expect(task.status).toBe('blocked');
      // Retry policy exhausted: initial implementation + one automatic
      // rework, both consumed by the same real verification failure — never
      // silently retried beyond policy, never silently marked done.
      expect(task.attempts).toHaveLength(2);
      task.attempts.forEach((attempt) => {
        expect(attempt.stage).toBe('failed');
        expect(attempt.terminalReason).toBe('verification-failed');
        expect(attempt.originalSha).toBeNull();
      });

      // The lease was still released even though the run ended blocked.
      expect(ownership.readLease(executionRoot)).toBeNull();
    }
  );

  test('a requested maxConcurrency other than 1 is rejected with UNSUPPORTED_CONCURRENCY, never silently downgraded', async () => {
    await expect(
      execute({
        project: repoDir,
        feature: path.join(featureDir, 'feature.md'),
        maxConcurrency: 2,
      })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_CONCURRENCY' });

    // Nothing was touched: no lease, no run state, since validation fails
    // before any of that is ever created.
    expect(ownership.readLease(executionRoot)).toBeNull();
  });
});
