'use strict';

// Integration tests for the FULL resume/reconcile/replan cycle (US-06-TASK-
// TEST-01, FTR-018). Completes US-06 ("resume from persisted evidence and
// reconcile without re-execution") by exercising the REAL, already-
// implemented functions end-to-end, exactly as a real caller (the future
// US-07 run-loop / a human operator recovering a crashed coordinator) will:
//   1. lib/task-executor/index.js's dispatchTaskAttempt, reconcile, resume,
//      replan
//   2. store.js / ownership.js / git.js as needed to construct realistic,
//      on-disk run state
//
// This suite deliberately does NOT re-test any of these functions' internals
// — those are already covered in isolation by tests/lib/resume-reconcile.
// test.js, tests/lib/evidence-table.test.js and tests/lib/replan.test.js. Its
// only job is to prove the real, already-implemented pieces compose
// correctly across process boundaries (real dispatched worker, real git
// repo, real successor-feature fixture on disk).
//
// SAFETY (mirrors tests/lib/resume-reconcile.test.js's, tests/lib/evidence-
// table.test.js's and tests/lib/replan.test.js's exact discipline):
//   - Every git command in this suite runs with an explicit `cwd` pointing at
//     a repository created fresh, per test, under fs.mkdtempSync(os.tmpdir()),
//     with a LOCAL (repo-scoped only) user.name/user.email set via `git
//     config` (never --global). No git command in this file ever targets
//     this project's own working tree (c:/ws/Fincantieri.CommonLibraries.
//     AIToolkit). Every tmp repo is removed in afterEach.
//   - Every "worker" this suite spawns/dispatches is a REAL but harmless
//     process: either a plain Node child tagged via a literal argv element
//     (spawnTaggedChild, killed via `taskkill /PID <pid> /T /F`, mirroring
//     tests/lib/evidence-table.test.js's E-02-qualified technique exactly),
//     or tests/fixtures/fake-claude-cli.js dispatched via process.execPath —
//     NEVER the real claude.exe, NEVER a real LLM/API call anywhere in this
//     file. Real process-liveness assertions are gated itWindowsOnly, same
//     as every other file in this suite (E-02 evidence spike qualification).
//   - The successor feature fixture (Approvals.md / Work-Breakdown.md/.csv)
//     for the replan scenario is built only under a per-test tmpDir, never
//     under this repo's own internal_docs/features/ directory.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const store = require('../../lib/task-executor/store');
const ledger = require('../../lib/execution-ledger');
const ownership = require('../../lib/task-executor/ownership');
const claudeProcess = require('../../lib/task-executor/claude-process');
const { reconcile, resume, replan, dispatchTaskAttempt, _buildProcessTag } = require('../../lib/task-executor/index');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-claude-cli.js');
const NODE = process.execPath;
const NODE_EXE_BASENAME = path.basename(process.execPath); // 'node.exe' on Windows
const IS_WINDOWS = process.platform === 'win32';
// Real process-liveness assertions are only qualified on Windows (E-02
// evidence spike) — see tests/lib/ownership.liveness.test.js's own
// itWindowsOnly gating, mirrored here for the same reason.
const itWindowsOnly = IS_WINDOWS ? test : test.skip;

// Real spawns (dispatchTaskAttempt, tagged children, powershell CIM queries)
// can be slow on a loaded CI/parallel test-run machine — mirrors the 15-20s
// allowance tests/lib/evidence-table.test.js and tests/task-executor/
// verification-review.test.js already use for their own real-spawn cases.
jest.setTimeout(20000);

const RUN_ID = 'run-1';

const VERIFIED_IDENTITY = {
  agentId: 'gaia.agent.developer.backend',
  nativeName: 'gaia-developer-backend',
  sha256: 'sha256:' + 'a'.repeat(64),
  path: '/fake/path/gaia-developer-backend.md',
  manifestPath: '/fake/path/.ai-toolkit-manifest.json',
  toolkitVersion: '0.13.0',
  scope: 'project',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

async function killAndWait(pid) {
  if (IS_WINDOWS) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { process.kill(pid, 'SIGKILL'); } catch (_) {}
  }
  for (let i = 0; i < 50 && isAlive(pid); i++) await sleep(100);
}

// A REAL, short-lived, tagged child process — mirrors tests/lib/evidence-
// table.test.js's own spawnTaggedChild exactly: the tag is a literal trailing
// argv element, never a mock of the OS query.
function spawnTaggedChild(tag) {
  return spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 120000);', tag], { stdio: 'ignore' });
}

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

function makeTask(taskId, overrides) {
  return Object.assign(
    {
      id: taskId,
      title: 'Integration resume/replan task',
      outcome: 'The task resumes/reconciles correctly',
      domain: 'BE',
      dependsOn: [],
      acceptanceCriteria: ['AC-09'],
      verificationCommands: [],
    },
    overrides || {}
  );
}

// ── Successor feature fixture builder (replan scenario) ─────────────────────
// Mirrors tests/lib/replan.test.js's own fixture builder byte-for-byte (kept
// deliberately minimal — only the fields plan.js's parseMarkdown requires).
function taskAnchor(id) {
  return 'task-' + id.replace(/[^A-Za-z0-9_-]/g, '-');
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
  L.push('- **Dependencies:** —');
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
  L.push('_No verification commands._');
  L.push('');
  return L.join('\n');
}

function buildSuccessorMarkdown(prefix, tasks) {
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
  for (const task of tasks) {
    L.push(renderTaskDetail(task));
  }
  L.push('## Statistics');
  L.push('');
  return L.join('\n');
}

function buildSuccessorCsv(tasks) {
  const HEADER = 'phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type';
  const L = [HEADER];
  for (const task of tasks) {
    L.push(['PHASE-1', 'Successor phase', 'feat: successor', '', task.id, task.title, task.domain, task.agentType].join('|'));
  }
  return L.join('\n') + '\n';
}

function writeSuccessorFixture(featureDir, prefix, opts) {
  const options = opts || {};
  const tasks = options.tasks || [
    { id: 'US-01-TASK-BE-01', title: 'Successor task one', outcome: 'Outcome one', domain: 'BE', agentType: 'developer-backend' },
  ];

  fs.mkdirSync(featureDir, { recursive: true });
  writeFile(featureDir, 'feature.md', '# Successor Feature\n\nFixture feature for resume-replan.test.js.\n');

  if (options.approvalsContent !== undefined) {
    if (options.approvalsContent !== null) {
      writeFile(featureDir, prefix + '-Approvals.md', options.approvalsContent);
    }
    // null => deliberately do not write an Approvals.md at all.
  } else {
    writeFile(
      featureDir,
      prefix + '-Approvals.md',
      '# Approval Record — ' + prefix + '\n\n' +
        '## Gate 1 — Document Approvals\n\n| Document | Status |\n|---|---|\n\n' +
        '## Gate 2 — Work Breakdown Approval\n\n| Document | Status |\n|---|---|\n' +
        '| ' + prefix + '-Work-Breakdown.md | ✅ Approved |\n'
    );
  }

  if (options.skipPlanFiles !== true) {
    writeFile(featureDir, prefix + '-Work-Breakdown.md', buildSuccessorMarkdown(prefix, tasks));
    writeFile(featureDir, prefix + '-Work-Breakdown.csv', buildSuccessorCsv(tasks));
  }

  return { tasks: tasks };
}

describe('resume / reconcile / replan: full cycle integration (US-06-TASK-TEST-01)', () => {
  let tmpDir;
  let executionRoot;
  let repoDir;
  let featureRef;
  let baseSha;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-replan-integ-test-'));
    executionRoot = path.join(tmpDir, 'execution');
    repoDir = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoDir);

    initRepo(repoDir);
    writeFile(repoDir, 'base.txt', 'base\n');
    baseSha = commitAll(repoDir, 'init');

    const branchName = gitCmd(repoDir, ['symbolic-ref', '--short', 'HEAD']).trim();
    featureRef = 'refs/heads/' + branchName;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function baseArgs(overrides) {
    return Object.assign(
      { executionRoot: executionRoot, runId: RUN_ID, projectDir: repoDir, taskRef: featureRef, exeBasename: NODE_EXE_BASENAME },
      overrides || {}
    );
  }

  // ── Scenario 1 ──────────────────────────────────────────────────────────
  describe('scenario 1: resume dedup — no re-dispatch while worker live', () => {
    let verifyIdentitySpy;
    const spawnedByFixture = [];

    beforeEach(() => {
      verifyIdentitySpy = jest.spyOn(claudeProcess, 'verifyAgentIdentity').mockReturnValue(VERIFIED_IDENTITY);
    });

    afterEach(() => {
      verifyIdentitySpy.mockRestore();
    });

    itWindowsOnly(
      'a real dispatched worker is confirmed genuinely live, resume()/reconcile() refuse to touch it, then once it truly dies, reconcile() reports it recoverable',
      async () => {
        const taskId = 'US-06-TASK-INTEG-01';
        let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
        store.writeState(executionRoot, RUN_ID, state);
        ownership.acquireLease(executionRoot, RUN_ID);

        const task = makeTask(taskId);

        // Fire the REAL dispatch (never awaited immediately) — the fixture's
        // 'hang-ignore-sigterm' mode refuses graceful termination, so the
        // spawned worker stays genuinely alive until dispatchTaskAttempt's
        // own taskTimeoutMs forcefully tree-kills it. This is a real spawned
        // process, a real tag, a real _findLiveTaggedProcess check — nothing
        // here is mocked.
        const dispatchPromise = dispatchTaskAttempt({
          executionRoot: executionRoot,
          runId: RUN_ID,
          task: task,
          attemptNumber: 1,
          claudePath: NODE,
          agentId: VERIFIED_IDENTITY.agentId,
          projectDir: repoDir,
          spawnArgs: [FIXTURE, '--mode=hang-ignore-sigterm'],
          taskTimeoutMs: 4000,
        });

        // Let the OS finish registering the spawned process before querying it
        // (mirrors the 500ms allowance every other real-liveness test in this
        // suite already uses).
        await sleep(700);

        const midState = store.readState(executionRoot, RUN_ID);
        const midAttempt = midState.tasks[taskId].attempts[0];
        expect(midAttempt.stage).toBe('dispatching');
        expect(typeof midAttempt.processIdentity).toBe('string');
        expect(midAttempt.processIdentity).toBe(_buildProcessTag(RUN_ID, taskId, 1));

        // reconcile() while the worker is still genuinely running.
        const reconcileWhileLive = await reconcile(baseArgs());
        expect(reconcileWhileLive.repairsApplied).toEqual([]);
        expect(reconcileWhileLive.classifications).toContainEqual({
          taskId: taskId, classification: 'worker-live', action: 'no-replacement-diagnose-or-pause',
        });

        // resume() while the worker is still genuinely running — same
        // conclusion, and confirms NO new attempt was dispatched/added.
        const resumeWhileLive = await resume(baseArgs());
        expect(resumeWhileLive.repairsApplied).toEqual([]);
        expect(resumeWhileLive.tasks).toContainEqual({
          taskId: taskId, status: 'pending', nextAction: 'no-replacement-diagnose-or-pause',
        });

        const afterProbeState = store.readState(executionRoot, RUN_ID);
        expect(afterProbeState.tasks[taskId].attempts).toHaveLength(1);
        expect(afterProbeState.tasks[taskId].attempts[0]).toEqual(midAttempt);
        expect(afterProbeState.generation).toBe(midState.generation); // resume/reconcile wrote nothing

        // Let the worker actually finish: dispatchTaskAttempt's own
        // taskTimeoutMs forcefully tree-kills the hung process; awaiting the
        // promise blocks until that real termination completes.
        const dispatchResult = await dispatchPromise;
        expect(dispatchResult.spawnResult.timedOut).toBe(true);

        // Let the OS finish deregistering the now-dead process.
        await sleep(500);

        // Normal flow resumes: the worker is now positively confirmed dead
        // (not merely assumed), within retry policy (this is the task's only
        // attempt so far) — reconcile now reports it recoverable rather than
        // still "live".
        const reconcileAfterDeath = await reconcile(baseArgs());
        expect(reconcileAfterDeath.repairsApplied).toEqual([]);
        expect(reconcileAfterDeath.classifications).toContainEqual({
          taskId: taskId, classification: 'dead-worker', action: 'preserve-and-attribute-new-attempt-within-retry-policy',
        });
      }
    );
  });

  // ── Scenario 2 ──────────────────────────────────────────────────────────
  describe('scenario 2: evidence classification across a realistic multi-task state', () => {
    const TASK_CHECKPOINTED = 'US-06-TASK-INTEG-CHECKPOINTED';
    const TASK_REVIEWED = 'US-06-TASK-INTEG-REVIEWED';
    const TASK_IMPL_RECORDED = 'US-06-TASK-INTEG-IMPL';
    const TASK_FAILED_WITHIN = 'US-06-TASK-INTEG-FAILED-WITHIN';
    const TASK_FAILED_BEYOND = 'US-06-TASK-INTEG-FAILED-BEYOND';

    test(
      'checkpointed-but-not-integrated, review-passed-no-commit, implementation-recorded, and both sides of the ' +
        'failed-attempt retry policy all classify correctly, reading evidence back from disk',
      async () => {
        writeFile(repoDir, 'task.txt', 'v1\n');
        const taskCommitSha = commitAll(repoDir, 'feat(' + TASK_CHECKPOINTED + '): task commit');

        let state = new store.State(baseStateFields({ featureRef: featureRef }))
          .addTask(TASK_CHECKPOINTED, { dependencies: [] })
          .addTask(TASK_REVIEWED, { dependencies: [] })
          .addTask(TASK_IMPL_RECORDED, { dependencies: [] })
          .addTask(TASK_FAILED_WITHIN, { dependencies: [] })
          .addTask(TASK_FAILED_BEYOND, { dependencies: [] });

        // "Checkpointed-but-not-integrated": valid evidence, reachable commit.
        state = state.addAttempt(TASK_CHECKPOINTED, {
          stage: 'committed', originalSha: taskCommitSha, integratedSha: taskCommitSha,
          intentIds: [TASK_CHECKPOINTED + '-attempt1-checkpoint'],
        });
        state = state.setTaskStatus(TASK_CHECKPOINTED, 'checkpointed');

        // "Review passed, no commit yet".
        state = state.addAttempt(TASK_REVIEWED, { stage: 'reviewed' });

        // "Implementation result persisted" -> continue verification.
        state = state.addAttempt(TASK_IMPL_RECORDED, { stage: 'implementation-recorded' });

        // "Failed verification/review", within retry policy (only 1 attempt
        // consumed so far).
        state = state.addAttempt(TASK_FAILED_WITHIN, { stage: 'failed', terminalReason: 'verification-failed' });

        // "Failed verification/review", beyond retry policy (both the
        // initial implementation and its one automatic rework already
        // consumed).
        state = state.addAttempt(TASK_FAILED_BEYOND, { stage: 'failed', terminalReason: 'verification-failed' });
        state = state.addAttempt(TASK_FAILED_BEYOND, { stage: 'failed', terminalReason: 'review-failed' });

        store.writeState(executionRoot, RUN_ID, state);
        store.writeIntent(executionRoot, RUN_ID, TASK_CHECKPOINTED + '-attempt1-checkpoint', { taskId: TASK_CHECKPOINTED });
        store.writeReceipt(executionRoot, RUN_ID, TASK_CHECKPOINTED + '-attempt1-outcome', { taskId: TASK_CHECKPOINTED });

        const result = await reconcile(baseArgs());

        expect(result.repairsApplied).toEqual([]);
        expect(result.classifications).toContainEqual({
          taskId: TASK_CHECKPOINTED, classification: 'up-to-date', action: 'keep-completion',
        });
        expect(result.classifications).toContainEqual({
          taskId: TASK_REVIEWED, classification: 'reviewed-no-checkpoint', action: 'needs-checkpoint-completion',
        });
        expect(result.classifications).toContainEqual({
          taskId: TASK_IMPL_RECORDED, classification: 'implementation-recorded', action: 'needs-verification',
        });
        expect(result.classifications).toContainEqual({
          taskId: TASK_FAILED_WITHIN, classification: 'failed', action: 'needs-new-attempt-subject-to-retry-policy',
        });
        expect(result.classifications).toContainEqual({
          taskId: TASK_FAILED_BEYOND, classification: 'blocked', action: 'replan-required',
        });

        // Read back from disk (not just the in-memory return value): nothing
        // was touched, and the checkpointed task's evidence is exactly what
        // was written.
        const finalState = store.readState(executionRoot, RUN_ID);
        expect(finalState.tasks[TASK_CHECKPOINTED].status).toBe('checkpointed');
        expect(finalState.tasks[TASK_REVIEWED].attempts[0].stage).toBe('reviewed');
        expect(finalState.tasks[TASK_IMPL_RECORDED].attempts[0].stage).toBe('implementation-recorded');
        expect(finalState.tasks[TASK_FAILED_WITHIN].status).toBe('pending'); // reconcile never advances task.status itself
        expect(finalState.tasks[TASK_FAILED_BEYOND].attempts).toHaveLength(2);

        const rereadIntent = store.readIntent(executionRoot, RUN_ID, TASK_CHECKPOINTED + '-attempt1-checkpoint');
        expect(rereadIntent.taskId).toBe(TASK_CHECKPOINTED);
        const rereadReceipt = store.readReceipt(executionRoot, RUN_ID, TASK_CHECKPOINTED + '-attempt1-outcome');
        expect(rereadReceipt.taskId).toBe(TASK_CHECKPOINTED);
      }
    );

    describe('a genuinely dead tagged worker (real spawn + real kill, not merely "never spawned")', () => {
      const spawnedPids = [];

      afterEach(async () => {
        while (spawnedPids.length) {
          const pid = spawnedPids.pop();
          if (isAlive(pid)) await killAndWait(pid);
        }
      });

      itWindowsOnly(
        'a tagged worker that is spawned then really killed is classified dead-worker only after the kill, never before',
        async () => {
          const taskId = 'US-06-TASK-INTEG-DEAD-WORKER';
          const tag = _buildProcessTag(RUN_ID, taskId, 1);

          const child = spawnTaggedChild(tag);
          spawnedPids.push(child.pid);
          await sleep(500); // let the OS finish registering the process before querying it

          let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
          state = state.addAttempt(taskId, { stage: 'interrupted', processIdentity: tag });
          store.writeState(executionRoot, RUN_ID, state);

          // While genuinely alive: worker-live, not dead-worker.
          const whileAlive = await reconcile(baseArgs());
          expect(whileAlive.classifications).toContainEqual({
            taskId: taskId, classification: 'worker-live', action: 'no-replacement-diagnose-or-pause',
          });

          // Really kill it (not "never spawned") — positive absence evidence,
          // matching the E-02 discipline of never assuming death.
          await killAndWait(child.pid);
          await sleep(300);

          const afterKill = await reconcile(baseArgs());
          expect(afterKill.repairsApplied).toEqual([]);
          expect(afterKill.classifications).toContainEqual({
            taskId: taskId, classification: 'dead-worker', action: 'preserve-and-attribute-new-attempt-within-retry-policy',
          });

          const finalState = store.readState(executionRoot, RUN_ID);
          expect(finalState.tasks[taskId].attempts[0].stage).toBe('interrupted'); // reconcile never rewrites this
        },
        20000
      );
    });
  });

  // ── Scenario 3 ──────────────────────────────────────────────────────────
  describe('scenario 3: replan approval flow', () => {
    let successorFeatureDir;
    const SUCCESSOR_PREFIX = 'FTR-878';

    beforeEach(() => {
      successorFeatureDir = path.join(tmpDir, SUCCESSOR_PREFIX + '-successor-slug');
    });

    function replanArgs(overrides) {
      return Object.assign(
        {
          executionRoot: executionRoot,
          runId: RUN_ID,
          projectDir: repoDir,
          taskRef: featureRef,
          feature: path.join(successorFeatureDir, 'feature.md'),
          taskMapping: [],
        },
        overrides || {}
      );
    }

    function seedOriginalRun(taskId) {
      const state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
      store.writeState(executionRoot, RUN_ID, state);
    }

    test(
      'a real approved successor (Gate 2 present) validates, records a durable readable-back old->new mapping, and marks the original run superseded',
      async () => {
        const taskId = 'US-06-TASK-INTEG-REPLAN-01';
        writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX);
        seedOriginalRun(taskId);

        const result = await replan(
          replanArgs({ taskMapping: [{ oldTaskId: taskId, newTaskId: 'US-01-TASK-BE-01' }] })
        );

        expect(result.originalRunId).toBe(RUN_ID);
        expect(result.taskMapping).toEqual([
          { oldTaskId: taskId, newTaskId: 'US-01-TASK-BE-01', carriesCompletion: false },
        ]);
        expect(result.successorPlanDigest).toMatch(/^[0-9a-f]{64}$/);

        // Durably recorded and readable back — not just the in-memory return
        // value.
        const record = store.readIntent(executionRoot, RUN_ID, 'replan');
        expect(record.originalRunId).toBe(RUN_ID);
        expect(record.successorPlanDigest).toBe(result.successorPlanDigest);
        expect(record.taskMapping).toEqual(result.taskMapping);

        // Original run marked superseded.
        const finalState = store.readState(executionRoot, RUN_ID);
        expect(finalState.runStatus).toBe('superseded');
      }
    );

    test(
      'a MISSING successor Approvals.md is refused with SUCCESSOR_NOT_APPROVED without touching anything',
      async () => {
        const taskId = 'US-06-TASK-INTEG-REPLAN-02';
        writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX, { approvalsContent: null });
        seedOriginalRun(taskId);
        const stateBefore = store.readState(executionRoot, RUN_ID);

        await expect(replan(replanArgs())).rejects.toMatchObject({ code: 'SUCCESSOR_NOT_APPROVED' });

        const stateAfter = store.readState(executionRoot, RUN_ID);
        expect(stateAfter.runStatus).toBe('running');
        expect(stateAfter.generation).toBe(stateBefore.generation);
        try {
          store.readIntent(executionRoot, RUN_ID, 'replan');
          throw new Error('expected readIntent to throw INTENT_NOT_FOUND');
        } catch (err) {
          expect(err.code).toBe('INTENT_NOT_FOUND');
        }
      }
    );

    test(
      'an UNAPPROVED successor Approvals.md (no "## Gate 2" section) is refused with SUCCESSOR_NOT_APPROVED without touching anything',
      async () => {
        const taskId = 'US-06-TASK-INTEG-REPLAN-03';
        writeSuccessorFixture(successorFeatureDir, SUCCESSOR_PREFIX, {
          approvalsContent: '# Approval Record — ' + SUCCESSOR_PREFIX + '\n\n## Gate 1 — Document Approvals\n\nApproved.\n',
        });
        seedOriginalRun(taskId);

        await expect(replan(replanArgs())).rejects.toMatchObject({ code: 'SUCCESSOR_NOT_APPROVED' });

        const stateAfter = store.readState(executionRoot, RUN_ID);
        expect(stateAfter.runStatus).toBe('running');
        try {
          store.readIntent(executionRoot, RUN_ID, 'replan');
          throw new Error('expected readIntent to throw INTENT_NOT_FOUND');
        } catch (err) {
          expect(err.code).toBe('INTENT_NOT_FOUND');
        }
      }
    );
  });

  // ── Scenario 4 ──────────────────────────────────────────────────────────
  describe('scenario 4: repeated resume idempotency', () => {
    test(
      'calling resume() twice in a row against the same unchanged state applies no duplicate repair, never throws, and settles into a stable classification',
      async () => {
        const taskId = 'US-06-TASK-INTEG-RESUME-IDEMPOTENT';
        writeFile(repoDir, 'task.txt', 'v1\n');
        const taskCommitSha = commitAll(repoDir, 'feat(' + taskId + '): task commit');

        let state = new store.State(baseStateFields({ featureRef: featureRef })).addTask(taskId, { dependencies: [] });
        state = state.addAttempt(taskId, {
          stage: 'committed', originalSha: taskCommitSha, integratedSha: taskCommitSha,
          intentIds: [taskId + '-attempt1-checkpoint'],
        });
        store.writeState(executionRoot, RUN_ID, state);
        store.writeIntent(executionRoot, RUN_ID, taskId + '-attempt1-checkpoint', { taskId: taskId });
        store.writeReceipt(executionRoot, RUN_ID, taskId + '-attempt1-outcome', { taskId: taskId });

        const ledgerPaths = store._executionPaths(executionRoot, RUN_ID);
        ledger.open(ledgerPaths.runDir, RUN_ID, 'executor:' + RUN_ID + ':' + taskId + ':task', 'task', null, 1);

        // First call: a real repair (finalize-checkpoint) is applied.
        const first = await resume(baseArgs());
        expect(first.repairsApplied).toEqual([{ taskId: taskId, action: 'finalize-checkpoint' }]);
        expect(first.tasks).toContainEqual({ taskId: taskId, status: 'checkpointed', nextAction: 'checkpoint-finalized' });

        // Second call against the now-settled state: no duplicate repair,
        // no throw, and a stable ("up-to-date") classification.
        await expect(resume(baseArgs())).resolves.toBeTruthy();
        const second = await resume(baseArgs());
        expect(second.repairsApplied).toEqual([]);
        expect(second.tasks).toContainEqual({ taskId: taskId, status: 'checkpointed', nextAction: 'keep-completion' });

        // A third call produces byte-for-byte the same result as the second —
        // resume() has reached a stable fixed point, consistent with its own
        // documented idempotency guarantees.
        const third = await resume(baseArgs());
        expect(third).toEqual(second);

        // The ledger reflects exactly one finalization, never duplicated.
        const ledgerFile = path.join(ledgerPaths.runDir, RUN_ID + '-token-ledger.json');
        const entries = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
        expect(entries).toHaveLength(1);
        expect(entries[0].status).toBe('done');
      }
    );
  });
});

// ── Test-isolation discipline note ──────────────────────────────────────────
// Grep verification performed manually before reporting this task done: every
// call to spawnSync('git', ...) in this file (both the local gitCmd() helper
// and its callers) passes an explicit `cwd` bound to `repoDir`, itself nested
// under `tmpDir` (a fresh fs.mkdtempSync(os.tmpdir()) directory created in
// beforeEach and removed in afterEach). The successor feature fixture
// (Approvals.md / Work-Breakdown.md / .csv) is likewise written only under
// `tmpDir`. No test in this file calls process.chdir(), no test omits `cwd`,
// and no test path resolves into c:/ws/Fincantieri.CommonLibraries.AIToolkit
// (this project's own working tree). user.name/user.email are set locally
// per repo, never --global. Every spawned "worker" process is either
// tests/fixtures/fake-claude-cli.js (via process.execPath) or a plain Node
// child (`node -e ...`) — never real claude.exe, never a real LLM/API call.
