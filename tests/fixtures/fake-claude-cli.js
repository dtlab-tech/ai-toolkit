#!/usr/bin/env node
'use strict';

// Fake Claude CLI fixture for FTR-018 lib/task-executor/claude-process.js
// tests (US-03-TASK-BE-01). This is NEVER the real claude.exe — it is a
// deterministic, LLM-free, zero-cost Node script that mimics only the I/O
// contract spawnClaudeAgent depends on: reads stdin (the prompt), writes
// JSON to stdout/stderr, exits with a controllable code. Selected by a
// `--mode=<name>` argv flag. Do not point spawnClaudeAgent at a real Claude
// CLI executable from any automated test — see claude-process.spawn.test.js
// for the explicit no-real-claude.exe guarantee this fixture exists for.

const fs = require('fs');
const { spawn } = require('child_process');

function argValue(flag) {
  const found = process.argv.find((a) => a.startsWith(flag + '='));
  return found ? found.slice(flag.length + 1) : null;
}

const mode = argValue('--mode') || 'echo-json';
const pidFile = argValue('--pid-file');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
  });
}

(async () => {
  const stdin = await readStdin();

  switch (mode) {
    case 'echo-json': {
      process.stdout.write(JSON.stringify({ is_error: false, result: stdin, argv: process.argv.slice(3) }));
      process.exit(0);
      return;
    }
    case 'fail': {
      process.stdout.write(JSON.stringify({ is_error: true, result: 'boom' }));
      process.exit(1);
      return;
    }
    case 'malformed': {
      process.stdout.write('not-json{{{');
      process.exit(0);
      return;
    }
    case 'missing-envelope-field': {
      process.stdout.write(JSON.stringify({ foo: 'bar' }));
      process.exit(0);
      return;
    }
    case 'stderr-and-json': {
      process.stderr.write('warning: something noisy\n');
      process.stdout.write(JSON.stringify({ is_error: false, result: stdin }));
      process.exit(0);
      return;
    }
    case 'big-output': {
      // Comfortably exceeds any small maxBufferBytes test threshold.
      const chunk = 'x'.repeat(1024);
      for (let i = 0; i < 20000; i++) {
        process.stdout.write(chunk);
      }
      process.exit(0);
      return;
    }
    case 'write-file-and-succeed': {
      // Added for US-07-TASK-BE-01's sequential-executor integration test
      // (tests/task-executor/executor.sequential.test.js). Derives a
      // per-task output filename from the trailing "ai-toolkit-task:
      // <runId>:<taskId>:<attempt>" tag lib/task-executor/index.js's
      // dispatchTaskAttempt always appends as the LAST argv element before
      // spawning (see its own "worker-liveness process tagging" file
      // comment) — this lets one static spawnArgs configuration in a test
      // produce a distinctly-named, REAL file per dispatched task/attempt,
      // with no extra flags needed. Falls back to a fixed filename if the
      // last argv element does not look like that tag (e.g. this mode
      // invoked directly, without a real dispatchTaskAttempt call).
      const lastArg = process.argv[process.argv.length - 1];
      const tagParts = typeof lastArg === 'string' ? lastArg.split(':') : [];
      const taskId = tagParts.length === 4 && tagParts[0] === 'ai-toolkit-task' ? tagParts[2] : 'unknown-task';
      fs.writeFileSync(taskId + '.output.txt', 'implemented by fake-claude-cli (write-file-and-succeed)\n');
      process.stdout.write(JSON.stringify({ is_error: false, result: 'implemented' }));
      process.exit(0);
      return;
    }
    case 'review-verdict-pass': {
      // Added for the same US-07-TASK-BE-01 integration test. Fixed PASS
      // verdict, independent of stdin/diff content — this mode exists only
      // to exercise the executor's real wiring (a real subprocess spawn, a
      // real parsed JSON envelope), never to simulate an actual review
      // judgement.
      process.stdout.write(JSON.stringify({
        is_error: false,
        result: 'Verdict: PASS\n\nCRITICAL (blocks merge):\n  none\n\nWARNING (should fix):\n  none\n',
      }));
      process.exit(0);
      return;
    }
    case 'conditional-hang': {
      // Added for US-07-TASK-TEST-01's tests/task-executor/sequential.test.js
      // ("partial results before stop" scenario). A single static
      // implementationSpawnArgs configuration applies uniformly to EVERY
      // task dispatchTaskAttempt makes during one execute() run (see
      // lib/task-executor/index.js's execute() — args.implementationSpawnArgs
      // is one array for the whole run, not per-task), so a test that needs
      // task A to succeed quickly while task B hangs indefinitely (to give a
      // real stop({mode:'immediate'}) call something genuinely alive and
      // "dispatching" to kill) cannot pick different modes per task via
      // separate execute() args. This mode resolves that: it inspects the
      // SAME trailing "ai-toolkit-task:<runId>:<taskId>:<attempt>" tag
      // 'write-file-and-succeed' above already parses, and behaves like
      // 'hang-ignore-sigterm' (never exits on its own, ignores SIGTERM,
      // spawns a grandchild so a real process tree exists to kill) ONLY when
      // the tag's taskId matches --hang-task-id=<taskId>; for every other
      // task it behaves exactly like 'write-file-and-succeed' (writes its
      // real output file and exits 0 immediately).
      const hangTaskId = argValue('--hang-task-id');
      const lastArg = process.argv[process.argv.length - 1];
      const tagParts = typeof lastArg === 'string' ? lastArg.split(':') : [];
      const taskId = tagParts.length === 4 && tagParts[0] === 'ai-toolkit-task' ? tagParts[2] : null;

      if (hangTaskId && taskId === hangTaskId) {
        process.on('SIGTERM', () => {});
        spawn(
          process.execPath,
          ['-e', "process.on('SIGTERM', () => {}); setTimeout(() => {}, 120000);"],
          { stdio: 'ignore' }
        );
        setTimeout(() => {}, 120000);
        return;
      }

      fs.writeFileSync((taskId || 'unknown-task') + '.output.txt', 'implemented by fake-claude-cli (conditional-hang)\n');
      process.stdout.write(JSON.stringify({ is_error: false, result: 'implemented' }));
      process.exit(0);
      return;
    }
    case 'hang-ignore-sigterm': {
      // Refuses graceful termination (SIGTERM) so tests can prove the
      // adapter's timeout path uses a forceful tree-kill (taskkill /F on
      // Windows), not a signal a stuck process could ignore. Spawns a
      // grandchild so tests can prove the WHOLE tree is terminated, not
      // just this direct child.
      process.on('SIGTERM', () => {});
      const gc = spawn(
        process.execPath,
        ['-e', "process.on('SIGTERM', () => {}); setTimeout(() => {}, 120000);"],
        { stdio: 'ignore' }
      );
      if (pidFile) {
        fs.writeFileSync(pidFile, JSON.stringify({ selfPid: process.pid, grandchildPid: gc.pid }));
      }
      setTimeout(() => {}, 120000);
      return;
    }
    default: {
      process.stderr.write('fake-claude-cli: unknown --mode "' + mode + '"\n');
      process.exit(2);
    }
  }
})();
