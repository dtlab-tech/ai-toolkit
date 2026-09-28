'use strict';

// Tests for lib/task-executor/claude-process.js spawnClaudeAgent
// (US-03-TASK-BE-01, FTR-018).
//
// SAFETY: every test below spawns tests/fixtures/fake-claude-cli.js via
// `process.execPath` (the local Node binary) — NEVER a real claude.exe and
// NEVER any real LLM/API call. This suite must remain a zero-cost,
// deterministic, offline exercise of the subprocess-spawn mechanics only.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return { ...actual, spawn: jest.fn(actual.spawn) };
});

const { spawnClaudeAgent } = require('../../lib/task-executor/claude-process');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-claude-cli.js');
const NODE = process.execPath;
const IS_WINDOWS = process.platform === 'win32';
const itWindowsOnly = IS_WINDOWS ? test : test.skip;

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

async function waitUntilDead(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await sleep(100);
  }
  return !isAlive(pid);
}

describe('spawnClaudeAgent: executable/argument validation (fails closed, never spawns)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-process-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    spawn.mockClear();
  });

  test('throws CLAUDE_EXECUTABLE_NOT_FOUND when claudePath does not exist', async () => {
    const missing = path.join(tmpDir, 'does-not-exist.exe');
    await expect(spawnClaudeAgent({ claudePath: missing, prompt: 'hi' })).rejects.toMatchObject({
      code: 'CLAUDE_EXECUTABLE_NOT_FOUND',
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  test('throws CLAUDE_EXECUTABLE_NOT_FOUND when claudePath is a directory, not a file', async () => {
    await expect(spawnClaudeAgent({ claudePath: tmpDir, prompt: 'hi' })).rejects.toMatchObject({
      code: 'CLAUDE_EXECUTABLE_NOT_FOUND',
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  test('throws CLAUDE_PROCESS_VALIDATION_ERROR when prompt is missing/not a string', async () => {
    await expect(spawnClaudeAgent({ claudePath: NODE })).rejects.toMatchObject({
      code: 'CLAUDE_PROCESS_VALIDATION_ERROR',
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  test('throws CLAUDE_PROCESS_VALIDATION_ERROR when options.args is not an array of strings', async () => {
    await expect(
      spawnClaudeAgent({ claudePath: NODE, prompt: 'hi', args: ['ok', 42] })
    ).rejects.toMatchObject({ code: 'CLAUDE_PROCESS_VALIDATION_ERROR' });
    expect(spawn).not.toHaveBeenCalled();
  });

  test('throws CLAUDE_PROCESS_VALIDATION_ERROR when options.cwd does not exist', async () => {
    await expect(
      spawnClaudeAgent({ claudePath: NODE, prompt: 'hi', cwd: path.join(tmpDir, 'nope') })
    ).rejects.toMatchObject({ code: 'CLAUDE_PROCESS_VALIDATION_ERROR' });
    expect(spawn).not.toHaveBeenCalled();
  });

  test('throws CLAUDE_PROCESS_VALIDATION_ERROR when taskTimeoutMs is not a positive number', async () => {
    await expect(
      spawnClaudeAgent({ claudePath: NODE, prompt: 'hi', taskTimeoutMs: -1 })
    ).rejects.toMatchObject({ code: 'CLAUDE_PROCESS_VALIDATION_ERROR' });
    expect(spawn).not.toHaveBeenCalled();
  });

  test('throws CLAUDE_PROCESS_VALIDATION_ERROR when maxBufferBytes is not a positive integer', async () => {
    await expect(
      spawnClaudeAgent({ claudePath: NODE, prompt: 'hi', maxBufferBytes: 0 })
    ).rejects.toMatchObject({ code: 'CLAUDE_PROCESS_VALIDATION_ERROR' });
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe('spawnClaudeAgent: spawn mechanics against the fake CLI fixture', () => {
  afterEach(() => {
    spawn.mockClear();
  });

  test('spawns with shell:false explicitly (no shell-injection surface)', async () => {
    await spawnClaudeAgent({ claudePath: NODE, args: [FIXTURE, '--mode=echo-json'], prompt: 'hi' });

    expect(spawn).toHaveBeenCalledTimes(1);
    const [, , spawnOpts] = spawn.mock.calls[0];
    expect(spawnOpts.shell).toBe(false);
  });

  test('feeds the prompt via stdin, not argv, and round-trips it through the result', async () => {
    const prompt = 'implement task US-03-TASK-BE-01';
    const result = await spawnClaudeAgent({
      claudePath: NODE,
      args: [FIXTURE, '--mode=echo-json'],
      prompt,
    });

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.parseError).toBeNull();
    expect(result.result).toEqual({ is_error: false, result: prompt, argv: [] });

    // The prompt must never appear in the spawned argv.
    const [, spawnArgs] = spawn.mock.calls[0];
    expect(spawnArgs.join(' ')).not.toContain(prompt);
  });

  test('shell metacharacters in the prompt/args are passed through literally (no injection)', async () => {
    const dangerousPrompt = '$(whoami) && rm -rf / ; echo pwned `id`';
    const result = await spawnClaudeAgent({
      claudePath: NODE,
      args: [FIXTURE, '--mode=echo-json', '--tag=a;b`c`'],
      prompt: dangerousPrompt,
    });

    expect(result.exitCode).toBe(0);
    expect(result.result.result).toBe(dangerousPrompt);
    expect(result.result.argv).toContain('--tag=a;b`c`');
  });

  test('captures a non-zero exit code together with a schema-valid error envelope', async () => {
    const result = await spawnClaudeAgent({
      claudePath: NODE,
      args: [FIXTURE, '--mode=fail'],
      prompt: 'hi',
    });

    expect(result.exitCode).toBe(1);
    expect(result.parseError).toBeNull();
    expect(result.result).toEqual({ is_error: true, result: 'boom' });
  });

  test('malformed JSON stdout yields result:null and a descriptive parseError', async () => {
    const result = await spawnClaudeAgent({
      claudePath: NODE,
      args: [FIXTURE, '--mode=malformed'],
      prompt: 'hi',
    });

    expect(result.exitCode).toBe(0);
    expect(result.result).toBeNull();
    expect(result.parseError).toMatch(/not valid JSON/);
  });

  test('valid JSON missing the required is_error envelope field fails result validation', async () => {
    const result = await spawnClaudeAgent({
      claudePath: NODE,
      args: [FIXTURE, '--mode=missing-envelope-field'],
      prompt: 'hi',
    });

    expect(result.exitCode).toBe(0);
    expect(result.result).toBeNull();
    expect(result.parseError).toMatch(/is_error/);
  });

  test('stdout and stderr are captured on separate streams', async () => {
    const result = await spawnClaudeAgent({
      claudePath: NODE,
      args: [FIXTURE, '--mode=stderr-and-json'],
      prompt: 'hi',
    });

    expect(result.stderr).toContain('warning: something noisy');
    expect(result.result).toEqual({ is_error: false, result: 'hi' });
  });

  test('bounded buffering: exceeding maxBufferBytes stops accumulation and reports overflow', async () => {
    const result = await spawnClaudeAgent({
      claudePath: NODE,
      args: [FIXTURE, '--mode=big-output'],
      prompt: 'hi',
      maxBufferBytes: 4096,
    });

    expect(result.stdout.length).toBeLessThanOrEqual(4096);
    expect(result.parseError).toMatch(/exceeded maxBufferBytes/);
    expect(result.result).toBeNull();
  }, 15000);

  test('reports timing fields (start/end ISO timestamps and a non-negative duration)', async () => {
    const result = await spawnClaudeAgent({
      claudePath: NODE,
      args: [FIXTURE, '--mode=echo-json'],
      prompt: 'hi',
    });

    expect(new Date(result.startedAt).toString()).not.toBe('Invalid Date');
    expect(new Date(result.endedAt).toString()).not.toBe('Invalid Date');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('spawnClaudeAgent: taskTimeoutMs kills the process tree', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-process-timeout-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    spawn.mockClear();
  });

  itWindowsOnly(
    'kills a process that ignores SIGTERM, including its grandchild (confirmed tree-kill)',
    async () => {
      const pidFile = path.join(tmpDir, 'pids.json');

      const result = await spawnClaudeAgent({
        claudePath: NODE,
        args: [FIXTURE, '--mode=hang-ignore-sigterm', '--pid-file=' + pidFile],
        prompt: 'hi',
        taskTimeoutMs: 800,
      });

      expect(result.timedOut).toBe(true);
      expect(result.terminationConfirmed).toBe(true);

      // Prove the WHOLE tree died, not just the direct child: the fixture
      // persisted both its own pid and its grandchild's pid before hanging.
      const pids = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
      expect(await waitUntilDead(pids.selfPid, 5000)).toBe(true);
      expect(await waitUntilDead(pids.grandchildPid, 5000)).toBe(true);
    },
    20000
  );

  test('a process that exits quickly is not affected by a generous timeout', async () => {
    const result = await spawnClaudeAgent({
      claudePath: NODE,
      args: [FIXTURE, '--mode=echo-json'],
      prompt: 'hi',
      taskTimeoutMs: 30000,
    });

    expect(result.timedOut).toBe(false);
    expect(result.terminationConfirmed).toBeNull();
    expect(result.exitCode).toBe(0);
  });
});
