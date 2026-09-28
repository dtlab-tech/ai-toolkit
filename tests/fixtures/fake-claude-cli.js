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
