'use strict';

/**
 * CLI routing tests for `ai-toolkit executor <subcommand>` (US-09-TASK-INFRA-01, FTR-018).
 *
 * Scope: this suite proves the CLI ROUTING layer only — that each of the 7
 * subcommands (start/status/diagnose/stop/reconcile/resume/replan) calls the
 * correct lib/task-executor/index.js function with the expected argument
 * shape, that a successful call prints JSON to stdout and exits 0, and that
 * the CLI's documented error-code -> exit-code mapping
 * (bin/cli.js's EXECUTOR_EXIT_CODE_BY_ERROR_CODE / mapExecutorErrorToExitCode)
 * is applied correctly for a representative sample of error codes (at least
 * one per bucket). lib/task-executor/index.js's own execute()/stop()/
 * reconcile()/resume()/replan() internals are already exhaustively
 * unit/integration tested elsewhere (tests/lib/*.test.js) — that module is
 * mocked out entirely here so this file never re-tests their bodies.
 */

jest.mock('../../lib/task-executor');

const path = require('path');
const taskExecutor = require('../../lib/task-executor');
const {
  handleExecutorCommand,
  mapExecutorErrorToExitCode,
} = require('../../bin/cli');

// A real git repo (this toolkit's own checkout) — reconcile/resume/replan
// derive executionRoot/taskRef via real `git` calls (see bin/cli.js's
// _executorExecutionRoot/_executorCurrentBranchRef); using the real repo root
// here exercises that real derivation rather than re-mocking child_process.
const REPO_ROOT = path.join(__dirname, '..', '..');

function makeErr(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

describe('executor CLI routing', () => {
  let stdoutSpy;
  let stderrSpy;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.exitCode = undefined;
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    process.exitCode = undefined;
    jest.clearAllMocks();
  });

  function stdoutJSON() {
    return JSON.parse(stdoutSpy.mock.calls.map((c) => c[0]).join(''));
  }

  function stderrJSON() {
    return JSON.parse(stderrSpy.mock.calls.map((c) => c[0]).join(''));
  }

  // ── routing: each subcommand calls the right index.js function ──────────
  describe('subcommand routing', () => {
    test('start routes to execute() with the parsed flags and prints JSON on success', async () => {
      taskExecutor.execute.mockResolvedValue({
        protocolVersion: 1, runId: 'r1', runStatus: 'completed', tasks: [],
      });

      await handleExecutorCommand([
        'start',
        '--project', REPO_ROOT,
        '--feature', 'internal_docs/features/FTR-999/feature.md',
        '--max-concurrency', '1',
        '--claude-path', 'C:\\claude.exe',
        '--task-timeout-ms', '5000',
        '--agent-budget-usd', '2.5',
      ]);

      expect(taskExecutor.execute).toHaveBeenCalledTimes(1);
      const callArgs = taskExecutor.execute.mock.calls[0][0];
      expect(callArgs.project).toBe(REPO_ROOT);
      expect(callArgs.feature).toBe('internal_docs/features/FTR-999/feature.md');
      expect(callArgs.maxConcurrency).toBe(1);
      expect(callArgs.claudePath).toBe('C:\\claude.exe');
      expect(callArgs.taskTimeoutMs).toBe(5000);
      expect(callArgs.agentBudgetUsd).toBe(2.5);
      expect(process.exitCode).toBe(0);
      expect(stdoutJSON()).toEqual({ protocolVersion: 1, runId: 'r1', runStatus: 'completed', tasks: [] });
    });

    test('start ignores an unrecognized --force flag (never special-cased, never forwarded)', async () => {
      taskExecutor.execute.mockResolvedValue({ protocolVersion: 1, runId: 'r1', runStatus: 'completed', tasks: [] });
      await handleExecutorCommand([
        'start', '--project', REPO_ROOT, '--feature', 'x/feature.md', '--force',
      ]);
      expect(process.exitCode).toBe(0);
      const callArgs = taskExecutor.execute.mock.calls[0][0];
      expect(callArgs.force).toBeUndefined();
    });

    test('status routes to status() with project/runId', async () => {
      taskExecutor.status.mockResolvedValue({ protocolVersion: 1, runId: 'r1' });
      await handleExecutorCommand(['status', '--project', REPO_ROOT, '--run-id', 'r1']);
      expect(taskExecutor.status).toHaveBeenCalledWith({ project: REPO_ROOT, runId: 'r1' });
      expect(process.exitCode).toBe(0);
      expect(stdoutJSON()).toEqual({ protocolVersion: 1, runId: 'r1' });
    });

    test('diagnose routes to diagnose() with project/runId', async () => {
      taskExecutor.diagnose.mockResolvedValue({ protocolVersion: 1, runId: 'r1' });
      await handleExecutorCommand(['diagnose', '--project', REPO_ROOT, '--run-id', 'r1']);
      expect(taskExecutor.diagnose).toHaveBeenCalledWith({ project: REPO_ROOT, runId: 'r1' });
      expect(process.exitCode).toBe(0);
    });

    test('stop routes to stop() with project/runId/mode defaulting to graceful', async () => {
      taskExecutor.stop.mockResolvedValue({ protocolVersion: 1, runId: 'r1', requestAccepted: true, mode: 'graceful' });
      await handleExecutorCommand(['stop', '--project', REPO_ROOT, '--run-id', 'r1']);
      expect(taskExecutor.stop).toHaveBeenCalledWith({ project: REPO_ROOT, runId: 'r1', mode: 'graceful' });
      expect(process.exitCode).toBe(0);
    });

    test('stop forwards --mode immediate', async () => {
      taskExecutor.stop.mockResolvedValue({ protocolVersion: 1, runId: 'r1', requestAccepted: true, mode: 'immediate' });
      await handleExecutorCommand(['stop', '--project', REPO_ROOT, '--run-id', 'r1', '--mode', 'immediate']);
      expect(taskExecutor.stop).toHaveBeenCalledWith({ project: REPO_ROOT, runId: 'r1', mode: 'immediate' });
    });

    test('reconcile routes to reconcile() with executionRoot/runId/projectDir/taskRef', async () => {
      taskExecutor.reconcile.mockResolvedValue({ protocolVersion: 1, runId: 'r1', repairsApplied: [], classifications: [] });
      await handleExecutorCommand(['reconcile', '--project', REPO_ROOT, '--run-id', 'r1']);
      expect(taskExecutor.reconcile).toHaveBeenCalledTimes(1);
      const callArgs = taskExecutor.reconcile.mock.calls[0][0];
      expect(callArgs.runId).toBe('r1');
      expect(callArgs.projectDir).toBe(REPO_ROOT);
      expect(typeof callArgs.executionRoot).toBe('string');
      expect(callArgs.executionRoot.length).toBeGreaterThan(0);
      expect(typeof callArgs.taskRef).toBe('string');
      expect(callArgs.taskRef.length).toBeGreaterThan(0);
      expect(process.exitCode).toBe(0);
    });

    test('resume routes to resume() with executionRoot/runId/projectDir/taskRef', async () => {
      taskExecutor.resume.mockResolvedValue({ protocolVersion: 1, runId: 'r1', runStatus: 'blocked', tasks: [] });
      await handleExecutorCommand(['resume', '--project', REPO_ROOT, '--run-id', 'r1']);
      expect(taskExecutor.resume).toHaveBeenCalledTimes(1);
      const callArgs = taskExecutor.resume.mock.calls[0][0];
      expect(callArgs.runId).toBe('r1');
      expect(callArgs.projectDir).toBe(REPO_ROOT);
      expect(typeof callArgs.executionRoot).toBe('string');
      expect(typeof callArgs.taskRef).toBe('string');
      expect(process.exitCode).toBe(0);
    });

    test('replan routes to replan() with executionRoot/runId/projectDir/taskRef/feature/taskMapping', async () => {
      taskExecutor.replan.mockResolvedValue({
        protocolVersion: 1, originalRunId: 'r1', successorPlanDigest: 'd', taskMapping: [],
      });
      await handleExecutorCommand([
        'replan',
        '--project', REPO_ROOT,
        '--run-id', 'r1',
        '--feature', 'internal_docs/features/FTR-998/feature.md',
        '--task-mapping-json', JSON.stringify([{ oldTaskId: 'A', newTaskId: 'B' }]),
      ]);
      expect(taskExecutor.replan).toHaveBeenCalledTimes(1);
      const callArgs = taskExecutor.replan.mock.calls[0][0];
      expect(callArgs.runId).toBe('r1');
      expect(callArgs.projectDir).toBe(REPO_ROOT);
      expect(callArgs.feature).toBe('internal_docs/features/FTR-998/feature.md');
      expect(callArgs.taskMapping).toEqual([{ oldTaskId: 'A', newTaskId: 'B' }]);
      expect(typeof callArgs.executionRoot).toBe('string');
      expect(typeof callArgs.taskRef).toBe('string');
      expect(process.exitCode).toBe(0);
    });

    test('replan defaults taskMapping to an empty array when --task-mapping-json is omitted', async () => {
      taskExecutor.replan.mockResolvedValue({
        protocolVersion: 1, originalRunId: 'r1', successorPlanDigest: 'd', taskMapping: [],
      });
      await handleExecutorCommand(['replan', '--project', REPO_ROOT, '--run-id', 'r1', '--feature', 'x/feature.md']);
      expect(taskExecutor.replan.mock.calls[0][0].taskMapping).toEqual([]);
    });

    test('replan exits 2 for invalid --task-mapping-json and never calls replan()', async () => {
      await handleExecutorCommand([
        'replan', '--project', REPO_ROOT, '--run-id', 'r1', '--feature', 'x/feature.md',
        '--task-mapping-json', '{not json',
      ]);
      expect(process.exitCode).toBe(2);
      expect(taskExecutor.replan).not.toHaveBeenCalled();
    });
  });

  // ── honest NOT_IMPLEMENTED surfacing for status/diagnose ─────────────────
  describe('status/diagnose NOT_IMPLEMENTED gap surfaces honestly (not hidden)', () => {
    test('status rejecting with NOT_IMPLEMENTED exits 1 with the real code/message on stderr', async () => {
      taskExecutor.status.mockRejectedValue(makeErr('NOT_IMPLEMENTED', 'status is NOT_IMPLEMENTED — see US-06-TASK-BE-01'));
      await handleExecutorCommand(['status', '--project', REPO_ROOT, '--run-id', 'r1']);
      expect(process.exitCode).toBe(1);
      const errJson = stderrJSON();
      expect(errJson.code).toBe('NOT_IMPLEMENTED');
      expect(errJson.message).toMatch(/NOT_IMPLEMENTED/);
    });

    test('diagnose rejecting with NOT_IMPLEMENTED exits 1 with the real code/message on stderr', async () => {
      taskExecutor.diagnose.mockRejectedValue(makeErr('NOT_IMPLEMENTED', 'diagnose is NOT_IMPLEMENTED — see US-06-TASK-BE-02'));
      await handleExecutorCommand(['diagnose', '--project', REPO_ROOT, '--run-id', 'r1']);
      expect(process.exitCode).toBe(1);
      expect(stderrJSON().code).toBe('NOT_IMPLEMENTED');
    });
  });

  // ── exit-code mapping: at least one representative code per bucket ───────
  describe('exit-code mapping (representative sample per bucket)', () => {
    const cases = [
      { code: 'LEASE_HELD', expectedExit: 3 },
      { code: 'NO_LOCK_HELD', expectedExit: 3 },
      { code: 'COMPETING_COORDINATOR_LIVE', expectedExit: 3 },
      { code: 'PLAN_NOT_FOUND', expectedExit: 4 },
      { code: 'SUCCESSOR_NOT_APPROVED', expectedExit: 4 },
      { code: 'STATE_NOT_FOUND', expectedExit: 4 },
      { code: 'CLAUDE_SPAWN_FAILED', expectedExit: 5 },
      { code: 'AGENT_NOT_VERIFIED', expectedExit: 5 },
      { code: 'INTEGRATION_CONFLICT', expectedExit: 6 },
      { code: 'PLATFORM_NOT_QUALIFIED', expectedExit: 7 },
      { code: 'DISPATCH_VALIDATION_ERROR', expectedExit: 2 },
      { code: 'EXECUTE_VALIDATION_ERROR', expectedExit: 2 }, // suffix-matched, not table-listed
      { code: 'UNSUPPORTED_CONCURRENCY', expectedExit: 2 },
      { code: 'NOT_IMPLEMENTED', expectedExit: 1 },
      { code: 'STATE_CORRUPTED', expectedExit: 1 },
      { code: 'GIT_SPAWN_FAILED', expectedExit: 1 },
      { code: 'SOME_TOTALLY_UNKNOWN_CODE', expectedExit: 1 }, // unmapped default
      { code: undefined, expectedExit: 1 }, // missing .code entirely
    ];

    test.each(cases)('code $code maps to exit $expectedExit', ({ code, expectedExit }) => {
      expect(mapExecutorErrorToExitCode(code)).toBe(expectedExit);
    });

    test('a rejected start() call surfaces its mapped exit code end-to-end (PLATFORM_NOT_QUALIFIED -> 7)', async () => {
      taskExecutor.execute.mockRejectedValue(makeErr('PLATFORM_NOT_QUALIFIED', 'not windows'));
      await handleExecutorCommand(['start', '--project', REPO_ROOT, '--feature', 'x/feature.md']);
      expect(process.exitCode).toBe(7);
      expect(stderrJSON().code).toBe('PLATFORM_NOT_QUALIFIED');
    });

    test('a rejected stop() call surfaces its mapped exit code end-to-end (LEASE_HELD -> 3)', async () => {
      taskExecutor.stop.mockRejectedValue(makeErr('LEASE_HELD', 'lease held by another run'));
      await handleExecutorCommand(['stop', '--project', REPO_ROOT, '--run-id', 'r1']);
      expect(process.exitCode).toBe(3);
      expect(stderrJSON().code).toBe('LEASE_HELD');
    });

    test('a rejected replan() call surfaces its mapped exit code end-to-end (INTEGRATION_CONFLICT -> 6)', async () => {
      taskExecutor.replan.mockRejectedValue(makeErr('INTEGRATION_CONFLICT', 'cherry-pick conflict'));
      await handleExecutorCommand(['replan', '--project', REPO_ROOT, '--run-id', 'r1', '--feature', 'x/feature.md']);
      expect(process.exitCode).toBe(6);
      expect(stderrJSON().code).toBe('INTEGRATION_CONFLICT');
    });
  });

  // ── usage errors (missing required flags) exit 2, never call index.js ────
  describe('usage errors never reach lib/task-executor', () => {
    test('start without --feature exits 2 and never calls execute()', async () => {
      await handleExecutorCommand(['start', '--project', REPO_ROOT]);
      expect(process.exitCode).toBe(2);
      expect(taskExecutor.execute).not.toHaveBeenCalled();
    });

    test('status without --run-id exits 2 and never calls status()', async () => {
      await handleExecutorCommand(['status', '--project', REPO_ROOT]);
      expect(process.exitCode).toBe(2);
      expect(taskExecutor.status).not.toHaveBeenCalled();
    });

    test('replan without --feature exits 2 and never calls replan()', async () => {
      await handleExecutorCommand(['replan', '--project', REPO_ROOT, '--run-id', 'r1']);
      expect(process.exitCode).toBe(2);
      expect(taskExecutor.replan).not.toHaveBeenCalled();
    });

    test('unknown subcommand exits 2', async () => {
      await handleExecutorCommand(['bogus', '--project', REPO_ROOT]);
      expect(process.exitCode).toBe(2);
    });
  });
});
