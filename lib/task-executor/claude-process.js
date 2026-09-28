'use strict';

// Claude subprocess adapter (FTR-018).
//
// spawnClaudeAgent (US-03-TASK-BE-01) implements the SPAWN MECHANICS ONLY,
// per FTR-018-Tech-Spec.md section 7:
//   - asynchronous child_process.spawn, shell:false explicitly, argv array
//     (never a string-built shell command);
//   - the executable path is validated (exists, is a file) BEFORE spawning,
//     so a bad path fails closed with a clear error instead of a confusing
//     bare ENOENT from spawn() itself;
//   - the task prompt is fed through stdin (write + end), never appended to
//     argv or a shell command — argv/logs must never carry the prompt or
//     credentials;
//   - stdout/stderr are drained with bounded buffering (maxBufferBytes per
//     stream) and only assembled into a result AFTER the process has fully
//     exited — this function never attempts to parse partial/streaming
//     output;
//   - exit 0 is necessary but not sufficient: once the process has exited,
//     stdout is parsed as JSON and checked for the minimal stable envelope
//     shape (`is_error` boolean) the CLI's --output-format json contract
//     guarantees; malformed or schema-shaped-wrong output is reported via
//     `parseError`, never silently coerced into a truthy result;
//   - an optional taskTimeoutMs kills the process tree if exceeded, using
//     the technique proven in the E-02 evidence spike (Windows-qualified):
//     `taskkill /PID <pid> /T /F` (see
//     internal_docs/features/FTR-018-deterministic-task-execution-checkpoints-and-resume/evidence/E-02-process-supervision/).
//     Non-Windows platforms are not yet E-02-qualified (Gate-1 binding
//     constraint #3: "no implicit cross-platform guarantee"), so the
//     fallback there kills only the direct child best-effort and reports
//     `terminationConfirmed: 'unknown'` rather than claiming a proof it does
//     not have.
//
// Explicitly OUT of scope for this task (later Work Breakdown tasks own
// these):
//   - agent provenance verification / `agents resolve --require-verified`
//     (US-03-TASK-BE-02, verifyAgentIdentity);
//   - task dispatch orchestration, ownership/lease coordination, and ledger
//     activity persistence (US-03-TASK-BE-03, dispatchTask);
//   - full validation of the CLI's structured output against a caller
//     --json-schema, and any business-level "did the task actually
//     succeed" judgment (verification/review stages, later tasks).
// spawnClaudeAgent returns raw ingredients (exit code, parsed/raw
// stdout+stderr, timing, termination evidence) for those later stages to
// build on — it does not itself decide whether a run "passed".
//
// dispatchTask is kept here as a thin NOT_IMPLEMENTED alias still pointing
// at US-03-TASK-BE-03 (the task that implements real dispatch
// orchestration) rather than being renamed/removed — index.js already
// requires this module surface, and dispatchTask's real body is a
// deliberately separate concern from spawnClaudeAgent's subprocess
// mechanics.

const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

const IS_WINDOWS = process.platform === 'win32';
const DEFAULT_MAX_BUFFER_BYTES = 20 * 1024 * 1024; // 20 MiB per stream

function _err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function _requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw _err('CLAUDE_PROCESS_VALIDATION_ERROR', label + ' must be a non-empty string');
  }
}

// Validates that `claudePath` exists and is a regular file before spawning,
// so a bad path fails closed here with a clear, attributable error rather
// than surfacing as spawn()'s own easily-confused-with-other-causes ENOENT.
function _validateExecutableSync(claudePath) {
  _requireNonEmptyString(claudePath, 'spawnClaudeAgent: options.claudePath');

  let stat;
  try {
    stat = fs.statSync(claudePath);
  } catch (err) {
    throw _err(
      'CLAUDE_EXECUTABLE_NOT_FOUND',
      'spawnClaudeAgent: executable not found at "' + claudePath + '" (' + err.code + ')'
    );
  }
  if (!stat.isFile()) {
    throw _err(
      'CLAUDE_EXECUTABLE_NOT_FOUND',
      'spawnClaudeAgent: path "' + claudePath + '" exists but is not a file'
    );
  }
}

function _validateCwdSync(cwd) {
  _requireNonEmptyString(cwd, 'spawnClaudeAgent: options.cwd');
  let stat;
  try {
    stat = fs.statSync(cwd);
  } catch (err) {
    throw _err('CLAUDE_PROCESS_VALIDATION_ERROR', 'spawnClaudeAgent: options.cwd "' + cwd + '" does not exist (' + err.code + ')');
  }
  if (!stat.isDirectory()) {
    throw _err('CLAUDE_PROCESS_VALIDATION_ERROR', 'spawnClaudeAgent: options.cwd "' + cwd + '" is not a directory');
  }
}

// Tree-kill via the exact E-02-qualified technique: `taskkill /PID <pid> /T
// /F` (Windows only). Runs synchronously so the caller knows the
// confirmed-terminated/not result before the timeout handler returns —
// there is no async race between "did the kill land" and the child's
// eventual 'close' event.
//
// Returns:
//   true      — Windows, taskkill exited 0 (subtree confirmed terminated,
//               per the E-02 evidence spike).
//   false      — Windows, taskkill ran but did not report success.
//   'unknown' — non-Windows: this platform has no qualified tree-kill proof
//               yet (Gate-1 binding constraint: "no implicit cross-platform
//               guarantee"); a best-effort direct-child kill is attempted,
//               but termination of the whole tree is never claimed.
function _killProcessTreeSync(child) {
  if (IS_WINDOWS) {
    const res = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return !res.error && res.status === 0;
  }
  try {
    child.kill('SIGKILL');
  } catch (_) {
    // best-effort only
  }
  return 'unknown';
}

// Validates the minimal, stable envelope the Claude CLI's
// `--output-format json` contract guarantees (per the E-01 evidence dossier
// real-run captures: `is_error` is always present as a boolean). This is
// NOT full schema validation against a caller-supplied --json-schema —
// that belongs to a later verification stage. Only ever called on fully
// buffered, post-exit stdout — never on partial output.
function _validateEnvelope(stdoutStr) {
  let parsed;
  try {
    parsed = JSON.parse(stdoutStr);
  } catch (err) {
    return { result: null, parseError: 'stdout is not valid JSON: ' + err.message };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { result: null, parseError: 'parsed stdout is not a JSON object' };
  }
  if (typeof parsed.is_error !== 'boolean') {
    return { result: null, parseError: 'parsed stdout is missing the required "is_error" boolean field' };
  }
  return { result: parsed, parseError: null };
}

/**
 * Spawns the Claude CLI executable as an asynchronous, non-shell subprocess
 * and resolves once it has fully exited (or been killed after
 * `taskTimeoutMs`). See the file-level comment for the full design and its
 * explicit scope boundary.
 *
 * @param {object} options
 * @param {string} options.claudePath - Absolute path to the qualified Claude
 *   CLI executable. Validated to exist and be a file before spawning.
 * @param {string[]} [options.args] - CLI flags only (e.g. `--print
 *   --output-format json --agent <name>`). NEVER include the prompt here —
 *   it is fed via stdin.
 * @param {string} options.prompt - Task prompt content, written to the
 *   child's stdin and then stdin is ended. Never placed in argv.
 * @param {string} [options.cwd] - Explicit working directory for the child
 *   process. Defaults to `process.cwd()` if omitted, but is always passed
 *   explicitly to `spawn()`. Validated to exist and be a directory.
 * @param {object} [options.env] - Explicit environment for the child.
 *   Defaults to `process.env`.
 * @param {number} [options.taskTimeoutMs] - Optional per-task timeout
 *   budget. If exceeded before the process exits, the process tree is
 *   killed (see `_killProcessTreeSync`) and the result reports
 *   `timedOut: true` / `terminationConfirmed`.
 * @param {number} [options.maxBufferBytes] - Bounded buffering ceiling per
 *   stream (default 20 MiB). If exceeded, further chunks on that stream are
 *   discarded, the process tree is killed to bound resource usage, and the
 *   result reports a `parseError` describing the overflow.
 * @returns {Promise<{
 *   exitCode: ?number,
 *   signal: ?string,
 *   stdout: string,
 *   stderr: string,
 *   result: ?object,
 *   parseError: ?string,
 *   startedAt: string,
 *   endedAt: string,
 *   durationMs: number,
 *   timedOut: boolean,
 *   terminationConfirmed: (true|false|'unknown'|null)
 * }>}
 */
async function spawnClaudeAgent(options) {
  options = options || {};

  _validateExecutableSync(options.claudePath);

  const args = options.args === undefined ? [] : options.args;
  if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
    throw _err('CLAUDE_PROCESS_VALIDATION_ERROR', 'spawnClaudeAgent: options.args must be an array of strings when provided');
  }

  if (typeof options.prompt !== 'string') {
    throw _err('CLAUDE_PROCESS_VALIDATION_ERROR', 'spawnClaudeAgent: options.prompt must be a string (fed via stdin)');
  }
  const prompt = options.prompt;

  const cwd = options.cwd === undefined ? process.cwd() : options.cwd;
  _validateCwdSync(cwd);

  const env = options.env === undefined ? process.env : options.env;

  let taskTimeoutMs = null;
  if (options.taskTimeoutMs !== undefined && options.taskTimeoutMs !== null) {
    if (typeof options.taskTimeoutMs !== 'number' || !Number.isFinite(options.taskTimeoutMs) || options.taskTimeoutMs <= 0) {
      throw _err('CLAUDE_PROCESS_VALIDATION_ERROR', 'spawnClaudeAgent: options.taskTimeoutMs must be a positive finite number when provided');
    }
    taskTimeoutMs = options.taskTimeoutMs;
  }

  let maxBufferBytes = DEFAULT_MAX_BUFFER_BYTES;
  if (options.maxBufferBytes !== undefined && options.maxBufferBytes !== null) {
    if (!Number.isInteger(options.maxBufferBytes) || options.maxBufferBytes <= 0) {
      throw _err('CLAUDE_PROCESS_VALIDATION_ERROR', 'spawnClaudeAgent: options.maxBufferBytes must be a positive integer when provided');
    }
    maxBufferBytes = options.maxBufferBytes;
  }

  const startedAt = new Date();
  const startedHr = process.hrtime.bigint();

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(options.claudePath, args, {
        cwd,
        env,
        shell: false, // never true: shell:true would risk command injection via args/prompt
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      reject(_err('CLAUDE_SPAWN_FAILED', 'spawnClaudeAgent: failed to spawn executable: ' + err.message));
      return;
    }

    let stdoutChunks = [];
    let stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutOverflowed = false;
    let stderrOverflowed = false;
    let overflowKillTriggered = false;

    let settled = false;
    let timedOut = false;
    let terminationConfirmed = null;
    let timeoutHandle = null;

    function clearTimer() {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    }

    function killForOverflow() {
      if (overflowKillTriggered) return;
      overflowKillTriggered = true;
      _killProcessTreeSync(child);
    }

    function finalize(exitCode, signal) {
      if (settled) return;
      settled = true;
      clearTimer();

      const endedAt = new Date();
      const durationMs = Number(process.hrtime.bigint() - startedHr) / 1e6;

      const stdoutStr = Buffer.concat(stdoutChunks).toString('utf8');
      const stderrStr = Buffer.concat(stderrChunks).toString('utf8');

      let result = null;
      let parseError = null;
      if (stdoutOverflowed || stderrOverflowed) {
        parseError =
          (stdoutOverflowed ? 'stdout' : 'stderr') +
          ' exceeded maxBufferBytes (' + maxBufferBytes + ') before the process exited';
      } else {
        const validated = _validateEnvelope(stdoutStr);
        result = validated.result;
        parseError = validated.parseError;
      }

      resolve({
        exitCode: exitCode === undefined ? null : exitCode,
        signal: signal === undefined ? null : signal,
        stdout: stdoutStr,
        stderr: stderrStr,
        result,
        parseError,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs,
        timedOut,
        terminationConfirmed,
      });
    }

    child.stdout.on('data', (chunk) => {
      if (stdoutOverflowed) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxBufferBytes) {
        stdoutOverflowed = true;
        killForOverflow();
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr.on('data', (chunk) => {
      if (stderrOverflowed) return;
      stderrBytes += chunk.length;
      if (stderrBytes > maxBufferBytes) {
        stderrOverflowed = true;
        killForOverflow();
        return;
      }
      stderrChunks.push(chunk);
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimer();
      reject(_err('CLAUDE_SPAWN_FAILED', 'spawnClaudeAgent: child process error: ' + err.message));
    });

    child.on('close', (code, signal) => {
      finalize(code, signal);
    });

    if (taskTimeoutMs !== null) {
      timeoutHandle = setTimeout(() => {
        if (settled) return;
        timedOut = true;
        terminationConfirmed = _killProcessTreeSync(child);
      }, taskTimeoutMs);
    }

    // Feed the prompt via stdin, then end the stream — never as a CLI arg
    // or shell-interpolated string (per Tech-Spec section 7).
    child.stdin.on('error', () => {
      // Swallow EPIPE/EOF races when the child exits before stdin is fully
      // drained; 'close' is the source of truth for the result, not
      // whether this write succeeded.
    });
    child.stdin.write(prompt, 'utf8');
    child.stdin.end();
  });
}

function _notImplemented(fnName, task) {
  const err = new Error(
    'claude-process.' + fnName + ' is NOT_IMPLEMENTED — see Work Breakdown task ' + task
  );
  err.code = 'NOT_IMPLEMENTED';
  err.task = task;
  throw err;
}

function dispatchTask() {
  _notImplemented('dispatchTask', 'US-03-TASK-BE-03');
}

function verifyAgentProvenance() {
  _notImplemented('verifyAgentProvenance', 'US-03-TASK-BE-02');
}

module.exports = {
  spawnClaudeAgent,
  dispatchTask,
  verifyAgentProvenance,
};
