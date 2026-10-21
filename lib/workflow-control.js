'use strict';

// Node host for workflow control-plane operations. Never ask an LLM to do I/O.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const registry = require('./agent-registry');
const ledger = require('./execution-ledger');
const { spawnClaudeAgent } = require('./task-executor/claude-process');
const { createEvidence } = require('./workflow-worker-evidence');
const { resolveOutputPath } = require('./workflow-worker-outputs');
const { renameSyncWithRetry } = require('./atomic-rename');
const CLI = path.join(__dirname, '..', 'bin', 'cli.js');


// Runtime payload has no third-party dependencies. Only these two canonical
// scalar fields are needed; reject ambiguous/duplicate declarations.
function definitionFields(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('Agent frontmatter missing');
  const fields = {};
  for (const key of ['name', 'model']) {
    const lines = match[1].split(/\r?\n/).filter(l => l.startsWith(key + ':'));
    if (lines.length !== 1) throw new Error('Ambiguous agent field: ' + key);
    fields[key] = lines[0].slice(key.length + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  if (!/^[a-z][a-z0-9-]*$/.test(fields.name) || !['haiku', 'sonnet', 'opus'].includes(fields.model)) throw new Error('Invalid agent name/model');
  return fields;
}

function validateIdentity(id, record, kind = 'agent') {
  const entry = registry.CATALOG.find(e => e.agentId === id);
  if (!entry || (entry.role === 'orchestrator') !== (kind === 'workflow') ||
      !record || record.agentId !== id || record.status !== 'verified' ||
      record.nativeName !== entry.nativeNames.claude ||
      !record.path || !/^sha256:[a-f0-9]{64}$/.test(record.sha256 || '')) {
    throw new Error('Invalid verified ' + kind + ' identity: ' + id);
  }
  const bytes = fs.readFileSync(record.path);
  if ('sha256:' + crypto.createHash('sha256').update(bytes).digest('hex') !== record.sha256) {
    throw new Error('Definition hash changed: ' + id);
  }
  if (kind === 'agent' && definitionFields(bytes.toString()).name !== record.nativeName) {
    throw new Error('Agent frontmatter/nativeName mismatch: ' + id);
  }
  return record;
}

function parseArgs(input) {
  if (Array.isArray(input)) return input.slice();
  const tokens = [];
  let value = '', quote = null, started = false;
  for (const ch of String(input || '')) {
    if (quote) { if (ch === quote) quote = null; else value += ch; }
    else if (ch === '"' || ch === "'") { quote = ch; started = true; }
    else if (/\s/.test(ch)) { if (started) { tokens.push(value); value = ''; started = false; } }
    else { value += ch; started = true; }
  }
  if (quote) throw new Error('Unterminated argument quote');
  if (started) tokens.push(value);
  return tokens;
}

function deriveFeatureDir(featurePath) {
  return /[/\\]feature\.md$/i.test(featurePath)
    ? featurePath.replace(/[/\\]feature\.md$/i, '')
    : featurePath.replace(/[/\\]+$/, '')
}

function createControl(options) {
  if (options.workerMaxBudgetUsd != null && (!Number.isFinite(options.workerMaxBudgetUsd) || options.workerMaxBudgetUsd <= 0)) throw new Error('Worker budget must be a positive finite number');
  // Windows can alias any long/dotted path segment to an 8.3 short name (e.g. the
  // TEMP env var itself is often short-form: C:\Users\TOMADA~1\...). The spawned
  // CLI resolves a tool call's absolute path in long form regardless, so an
  // --allowedTools pattern built from a short-form root would silently never
  // match — confirmed empirically (tests/manual/workflow-worker-smoke.js) against
  // a real CLI run under a short-form TEMP path. realpath.native (unlike the pure-JS
  // fs.realpathSync) resolves 8.3 aliases on Windows, and is a harmless plain
  // symlink-resolving realpath on every other platform.
  const root = fs.realpathSync.native(path.resolve(options.projectDir));
  const runId = crypto.randomUUID();
  let context, spent = 0, sequence = 0;
  const tokenLedger = [];
  const pending = new Set();
  const full = p => path.resolve(root, p);
  const read = p => fs.readFileSync(full(p), 'utf8');
  const exists = p => { try { return fs.statSync(full(p)).isFile(); } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
  const write = (p, content) => {
    const dest = full(p);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + '.tmp-' + crypto.randomUUID();
    // renameSyncWithRetry (./atomic-rename): absorbs a transient Windows EPERM/EBUSY on rename.
    try { fs.writeFileSync(tmp, content, 'utf8'); renameSyncWithRetry(tmp, dest); }
    finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
  };
  // Validates a worker-declared (or, for a dynamic multi-file deliverable like
  // intervention-documentation-standard, model-declared) output path the same way
  // worker()'s single-output contract does — inside the project, outside any tool-config
  // directory, never through a symlink — then writes it. The one path through which any
  // LLM response ever reaches disk in this workflow runtime; see worker()'s own comment
  // for why that's the host's job and never the agent's.
  const writeOutput = (p, content) => write(resolveOutputPath(root, { path: p }), content);
  async function resolve(id, kind = 'agent') {
    const record = await registry.resolveAgent({ projectDir: root, homeDir: options.home,
      agentId: id, requireVerified: true });
    return validateIdentity(id, record, kind);
  }
  function command(argv, accepted = [0]) {
    if (!Array.isArray(argv) || argv.some(a => typeof a !== 'string')) throw new Error('CLI argv array required');
    if (options.home && (argv[0] === 'run-asset' || argv[0] === 'print-asset')) {
      argv = argv.slice();
      const split = argv.indexOf('--');
      argv.splice(split < 0 ? argv.length : split, 0, '--home', options.home);
    }
    const result = spawnSync(process.execPath, [CLI, ...argv], {
      cwd: root, encoding: 'utf8', shell: false, windowsHide: true,
      timeout: 120000, maxBuffer: 20 * 1024 * 1024,
    });
    if (result.error || !Number.isInteger(result.status) || !accepted.includes(result.status)) {
      throw new Error('Deterministic command failed: ' + (result.error?.message || result.stderr || result.status));
    }
    return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
  }
  async function activity(label, fn, model, usage = () => null, metadata) {
    if (!context) throw new Error('Workflow ownership not established');
    const key = `${context.name}:${label}:${runId}:${++sequence}`;
    ledger.openOwned(context.dir, context.prefix, key, context.name, model, runId, metadata);
    try {
      const result = await fn();
      ledger.finalizeOwned(context.dir, context.prefix, key, runId, 'done', undefined, usage());
      return result;
    } catch (error) {
      try { ledger.finalizeOwned(context.dir, context.prefix, key, runId, 'failed', String(error), usage()); }
      catch (persistError) { throw new AggregateError([error, persistError], 'Activity failed and ledger finalization failed'); }
      throw error;
    }
  }
  async function worker(id, prompt, opts = {}) {
    let measuredTokens = null;
    const identity = await resolve(id);
    const definition = definitionFields(read(identity.path));
    return activity(opts.label || id, async () => {
      // --no-session-persistence: this worker call is a one-shot --print
      // invocation that is never resumed, so a saved session transcript has
      // no purpose — only cost, accumulating as a stray entry in the user's
      // Claude Code session list (see lib/task-executor/index.js's dispatch
      // call sites for the same reasoning).
      const cliArgs = ['--print', '--output-format', 'json', '--agent', identity.nativeName, '--no-session-persistence'];
      if (opts.schema) cliArgs.push('--json-schema', JSON.stringify(opts.schema));
      if (options.workerMaxBudgetUsd != null) cliArgs.push('--max-budget-usd', String(options.workerMaxBudgetUsd));
      const outputs = opts.outputs || [];
      for (const output of outputs) {
        if (!output || typeof output.path !== 'string' || !Array.isArray(output.inputs || [])) throw new Error('Invalid worker output contract');
      }
      // Never ask an LLM to do I/O: a worker with a declared output has no Write tool at
      // all (see its agent frontmatter) and returns the document as plain response text
      // (or, under --json-schema, as a `report` field) instead. The host resolves and
      // validates the real target path up front — fail before dispatch, not after paying
      // for a model turn — and writes the file itself once the response is in hand. This
      // sidesteps the CLI's own permission system for Write entirely, which empirically
      // (tests/manual/workflow-worker-smoke.js) does not support a non-interactive mode
      // that both skips prompting AND honors a scoped, per-file allow pattern: `dontAsk`
      // ignores runtime-supplied allow rules for paths with no pre-existing persisted
      // grant, while `acceptEdits`/`auto` grant Write (and every other tool, unscoped)
      // anywhere in the project regardless of any allowlist passed alongside them.
      if (outputs.length > 1) throw new Error('Worker output contract supports exactly one output today: ' + id);
      const outputTarget = outputs.length ? resolveOutputPath(root, outputs[0]) : null;
      const evidence = createEvidence(options, runId, identity, {
        executable: options.claudePath || null, cwd: root, args: cliArgs, outputs,
      });
      (options.log || (() => {}))('Worker evidence: ' + evidence.file);
      try {
      // Retry a bounded number of times, for either of two recognizable, safe-to-retry
      // conditions: (a) a transient CLI/SDK-level infrastructure failure ("API Error: ..." —
      // stream idle timeout, overload, etc.), or (b) — added by FTR-029 — a schema-required
      // attempt that comes back a clean exit but with no usable structured output even after the
      // existing extractDelimitedStructuredOutput fallback. (b) was, until this feature, treated
      // as a permanent content defect never worth retrying — confirmed EMPIRICALLY WRONG for at
      // least one real, reproducible case: gaia-validate-feature-docs consistently replies with a
      // logically-complete JSON candidate (valid/findings/report present) that simply omits two
      // now-optional boolean fields (needsRequirementsFix/needsTechSpecFix) the schema used to
      // require unconditionally. Neither condition is a permission denial or a present-but-wrong-
      // type schema violation, which would still just fail the same way again. Confirmed safe to
      // retry: every agent dispatched through this path is read-only by design (no Write tool —
      // see this function's own comment on why outputs are host-written, not agent-written; any
      // Bash access granted is explicitly scoped to read-only assessment), so there is no partial
      // side effect from a dead stream to clean up before retrying. Token usage from EVERY attempt
      // is accumulated — a failed attempt still burns real output tokens before the stream dies —
      // and each attempt's outcome is kept in evidence for diagnosing a recurring pattern like
      // this one, rather than only ever seeing the last attempt.
      let result;
      let accumulatedTokens = 0;
      const attempts = [];
      let currentPrompt = prompt;
      for (let attempt = 1; attempt <= WORKER_MAX_ATTEMPTS; attempt++) {
        result = await (options.dispatch || spawnClaudeAgent)({
          claudePath: options.claudePath, cwd: root, args: cliArgs, prompt: currentPrompt,
          taskTimeoutMs: options.taskTimeoutMs || 1800000,
        });
        const usage = result.result?.usage;
        const counts = usage && [usage.input_tokens, usage.output_tokens,
          usage.cache_read_input_tokens ?? 0, usage.cache_creation_input_tokens ?? 0];
        const tokens = counts && counts.every(n => Number.isInteger(n) && n >= 0)
          ? counts.reduce((a, b) => a + b, 0) : null;
        const attemptTokens = Number.isSafeInteger(tokens) && tokens > 0 ? tokens : null;
        if (attemptTokens) accumulatedTokens += attemptTokens;
        attempts.push({ attempt, exitCode: result.exitCode, isError: result.result?.is_error ?? null,
          resultPreview: typeof result.result?.result === 'string' ? result.result.result.slice(0, 300) : null,
          tokens: attemptTokens });
        evidence.save({ attempts });
        const transientApiError = _isTransientWorkerApiError(result);
        const missingStructuredOutput = !!opts.schema && _isMissingStructuredOutput(result, opts.schema);
        if ((!transientApiError && !missingStructuredOutput) || attempt === WORKER_MAX_ATTEMPTS) break;
        if (missingStructuredOutput) {
          currentPrompt = `${prompt}\n\n${STRUCTURED_OUTPUT_RETRY_NUDGE}`;
          await _sleep(STRUCTURED_OUTPUT_RETRY_BACKOFF_MS);
        } else {
          await _sleep(WORKER_RETRY_BACKOFF_MS[attempt - 1]);
        }
      }
      // Count usage before any business/protocol check, including denied tools.
      measuredTokens = accumulatedTokens > 0 ? accumulatedTokens : null;
      spent += measuredTokens || 0;
      tokenLedger.push({ agent: identity.nativeName, model: definition.model,
        phase_delta_tokens: measuredTokens, usage: result.result?.usage || null, evidence_path: evidence.file });
      evidence.save({ response: result, attempts });
      const denials = result.result?.permission_denials;
      if (Array.isArray(denials) && denials.length) {
        const tools = [...new Set(denials.map(d => d.tool_name || 'unknown'))].join(', ');
        throw new Error('Worker permission denied: ' + id + '; tools: ' + tools);
      }
      if (result.exitCode !== 0 || result.parseError || result.timedOut ||
          !result.result || result.result.is_error !== false) {
        throw new Error('Worker failed: ' + id + (attempts.length > 1 ? ' (after ' + attempts.length + ' attempts)' : ''));
      }
      let payload = opts.schema ? result.result.structured_output : result.result.result;
      let usedTextFallback = false;
      // The CLI's structured-output extraction is turn-bound: it only populates
      // `structured_output` when the model's final turn ends in a tool call carrying the
      // schema payload. A long, multi-phase agent response (visible report text, then a
      // closing JSON object) ends that same turn in plain text instead, so `structured_output`
      // comes back empty even though the model faithfully emitted a schema-valid payload in
      // the plain-text result. Observed empirically (not a transient flake) with
      // gaia-validate-feature-docs across multiple toolkit versions and multiple runs: the
      // model never misses or mangles the payload, only the CLI's own field never gets
      // populated — but the model is NOT consistent about how it delimits that payload inside
      // its text (an `<structured_output>` tag one run, a ```json fence the next, same agent,
      // same schema). Falling back to a strictly-delimited, schema-validated extraction that
      // tries each known convention — never a bare "parse the whole result as JSON" guess —
      // keeps the host's parse deterministic rather than asking the LLM to do I/O.
      if (opts.schema && payload == null && typeof result.result.result === 'string') {
        const candidate = extractDelimitedStructuredOutput(result.result.result, opts.schema);
        if (candidate != null) { payload = candidate; usedTextFallback = true; }
      }
      // A non-schema worker's payload IS the document — unwrap a whole-response fence/preamble
      // before anything downstream (the caller's own write, or this function's own outputTarget
      // write below) ever sees it. See extractMarkdownDocument's own comment for the full story.
      if (!opts.schema && typeof payload === 'string') {
        const cleaned = extractMarkdownDocument(payload);
        if (cleaned !== payload) { payload = cleaned; usedTextFallback = true; }
      }
      if (payload == null || (typeof payload === 'string' && !payload.trim())) {
        if (opts.schema) {
          const fields = (opts.schema.required || []).join(', ') || '(see requested schema)';
          throw new Error('Worker returned no structured output: ' + id + '; expected fields: ' + fields + '. The --json-schema response must populate structured_output; a report file or plain-text result is not sufficient.');
        }
        throw new Error('Worker returned no result: ' + id);
      }
      if (opts.schema) validateSchema(payload, opts.schema);
      if (usedTextFallback) evidence.save({ usedTextFallback: true });
      if (outputTarget) {
        const content = opts.schema ? payload.report : payload;
        if (typeof content !== 'string' || !content.trim()) throw new Error('Worker output content missing or empty: ' + id);
        writeOutput(outputTarget, /\.json$/i.test(outputTarget) ? extractJsonDocument(content) : content);
      }
      evidence.save({ outcome: 'done', completedAt: new Date().toISOString() });
      return payload;
      } catch (error) {
        evidence.save({ outcome: 'failed', error: String(error), completedAt: new Date().toISOString() });
        throw new Error(error.message + '; evidence: ' + evidence.file, { cause: error });
      }
    }, definition.model, () => measuredTokens, { agentId: id, nativeAgentName: identity.nativeName, platform: 'claude', definitionHash: identity.sha256, resolutionScope: identity.scope, toolkitVersion: identity.toolkitVersion });
  }
  async function parallel(fns) {
    // Drain every sibling before finalizing the owner, even if one rejects.
    const work = Promise.allSettled(fns.map(fn => Promise.resolve().then(fn)));
    pending.add(work);
    try {
      const results = await work;
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length) throw new AggregateError(failed.map(r => r.reason), 'Parallel workers failed');
      return results.map(r => r.value);
    } finally { pending.delete(work); }
  }
  async function run(name, dir, prefix, fn) {
    if (context) throw new Error('Nested workflow ownership forbidden');
    if (!/^(?:FTR|ASSESS|[A-Z]+)-\d+$/.test(prefix)) throw new Error('Invalid workflow prefix');
    context = { name, dir: full(dir), prefix };
    fs.mkdirSync(context.dir, { recursive: true });
    const key = `${name}:self:${runId}`;
    const runLockPath = path.join(context.dir, prefix + '-workflow.lock');
    const runLock = ledger._acquireLock(runLockPath);
    try {
    ledger.openOwned(context.dir, prefix, key, name, null, runId);
    try {
      const result = await fn();
      await Promise.allSettled([...pending]);
      if (!result || result.error || result.errors?.length || result.gate2_payload?.gate2_blocked) {
        throw new Error('Workflow returned unsuccessful result: ' + JSON.stringify(result));
      }
      // All work, output validation and serialization precede the terminal commit.
      const serialized = JSON.stringify(result);
      const committedResult = JSON.parse(serialized);
      ledger.finalizeOwned(context.dir, prefix, key, runId, 'done');
      return committedResult;
    } catch (error) {
      await Promise.allSettled([...pending]);
      try { ledger.finalizeOwned(context.dir, prefix, key, runId, 'failed', String(error)); }
      catch (persistError) { throw new AggregateError([error, persistError], 'Workflow failed; ledger finalization failed'); }
      throw error;
    }
    } finally { ledger._releaseLock(runLockPath, runLock); }
  }
  function feature(p) {
    if (!p) throw new Error('Feature path required');
    const file = full(p);
    read(file); // confirms existence (with a clear error) before realpath.native requires it
    // Canonicalize once, here, so every output path derived from featureDir downstream
    // (pm-phase1.js/pm-phase2.js's `file()` helpers) shares the same 8.3-alias-free form
    // as `root` — resolveOutputPath() can then do a plain, non-realpath string comparison
    // instead of reconciling mismatched forms (which would have to silently follow
    // symlinks to do so, defeating its own symlink-escape check).
    const canonicalFile = fs.realpathSync.native(file);
    const dir = deriveFeatureDir(canonicalFile);
    const match = path.basename(dir).match(/^([A-Z]+-\d+)(?:-|$)/);
    if (!match) throw new Error('Cannot derive canonical feature prefix');
    return { featurePath: canonicalFile, featureDir: dir, prefix: match[1] };
  }
  const api = { root, runId, read, exists, write, writeOutput, resolve, worker, parallel, run, command, activity,
    feature, parseArgs, tokenLedger, spent: () => spent,
    mtime: p => fs.statSync(full(p)).mtimeMs,
    json: p => JSON.parse(read(p)),
    // Same 'sha256:'-prefixed format validateIdentity already uses for agent
    // definition integrity (line ~40) — reused here to bind a Gate approval
    // to the exact document content it approved, not just "a file exists".
    hash: text => 'sha256:' + crypto.createHash('sha256').update(String(text), 'utf8').digest('hex'),
    log: text => (options.log || (() => {}))(String(text)),
    append: (p, text) => { fs.mkdirSync(path.dirname(full(p)), { recursive: true }); fs.appendFileSync(full(p), text); },
  };
  const artifacts = require('./workflow-artifacts');
  api.estimates = (...args) => artifacts.estimates(api, ...args);
  api.assessmentEstimates = (...args) => artifacts.assessmentEstimates(api, ...args);
  api.recordAssessmentApproval = (...args) => artifacts.recordAssessmentApproval(api, ...args);
  return api;
}

// worker()'s retry policy for transient CLI/SDK-level infrastructure failures (e.g. "API
// Error: Stream idle timeout - no chunks received") — confirmed against a real pipeline run
// that failed 3/3 identically with no automatic recovery, forcing the whole workflow to be
// retried by hand from the CLI. 3 total attempts, waiting 5s then 20s between them: long
// enough for a brief network stall to clear, short enough not to turn a real, deterministic
// failure into a multi-minute stall before it's reported.
const WORKER_MAX_ATTEMPTS = 3;
const WORKER_RETRY_BACKOFF_MS = [5000, 20000];

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Recognizes ONLY the CLI/SDK's own infrastructure-error reporting convention — never a
// blanket "any failure is retryable" rule. A permission denial, a schema violation, or any
// other content-level failure will fail the exact same way on a retry, so retrying those
// would only burn tokens and time for no benefit; this checks specifically for the "API
// Error:" prefix the CLI uses for its own transport/provider-level errors, which (unlike
// those) are plausibly transient.
function _isTransientWorkerApiError(result) {
  return !!(result && result.result && result.result.is_error === true &&
    typeof result.result.result === 'string' && /^API Error:/i.test(result.result.result.trim()));
}

// A clean-exit attempt (never a protocol-level failure — that's handled separately, after the
// loop, by the existing exitCode/parseError/timedOut/is_error check) whose structured_output is
// empty AND whose text contains NO JSON-shaped candidate at all — never a candidate that exists
// but fails schema validation (wrong field names/types), which is a deterministic content defect
// that would just fail the same way again, not worth retrying (hence the extra
// _hasAnyParseableJsonCandidate check, not just "extractDelimitedStructuredOutput returned null").
// Deliberately reuses extractDelimitedStructuredOutput itself for the recoverable case (not a
// cheaper proxy) so this retry decision and the post-loop fallback extraction can never disagree.
function _isMissingStructuredOutput(result, schema) {
  if (result.exitCode !== 0 || result.parseError || result.timedOut ||
      !result.result || result.result.is_error !== false) return false;
  if (result.result.structured_output != null) return false;
  if (typeof result.result.result !== 'string') return true;
  if (extractDelimitedStructuredOutput(result.result.result, schema) != null) return false;
  return !_hasAnyParseableJsonCandidate(result.result.result);
}

const STRUCTURED_OUTPUT_RETRY_NUDGE = 'Your previous response did not populate the required ' +
  'structured JSON output via the --json-schema tool-call channel. You MUST return your final ' +
  'answer ONLY as that structured output — do not narrate it in prose or wrap it in a Markdown ' +
  'code fence in your visible reply.';
// No network condition to wait out here (unlike a transient API error) — an immediate retry is
// both faster and sufficient; reusing WORKER_RETRY_BACKOFF_MS's real multi-second delays would pay
// a wait with no corresponding benefit, for every genuinely unrecoverable response too.
const STRUCTURED_OUTPUT_RETRY_BACKOFF_MS = 0;

// A model asked to emit a JSON blob as part of a chat reply (rather than through a real
// serializer, i.e. whenever structured_output didn't get populated and extraction has to
// recover the payload from free text) is prone to one specific, well-understood defect: a
// long free-text field (a "report") gets its literal line breaks typed as real newlines
// instead of the required `\n` escape. The JSON otherwise reads as entirely correct to a
// human, but JSON.parse rejects it outright ("Bad control character in string literal") —
// confirmed against a real run where the model's JSON was discarded for exactly this reason
// despite carrying the correct ```json fence tag and schema-correct structure. This is a
// narrow, mechanical repair for that one defect, not a lenient parser: it tracks whether
// each character lies inside a double-quoted JSON string literal (honoring \" and \\
// escapes) and re-escapes a raw newline/CR/tab ONLY there, leaving structural whitespace
// between tokens untouched. Applied as a fallback after a plain JSON.parse fails, never in
// place of one, so already-valid JSON is never second-guessed.
function _repairUnescapedControlCharsInStrings(text) {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) { result += ch; escaped = false; }
      else if (ch === '\\') { result += ch; escaped = true; }
      else if (ch === '"') { result += ch; inString = false; }
      else if (ch === '\n') { result += '\\n'; }
      else if (ch === '\r') { result += '\\r'; }
      else if (ch === '\t') { result += '\\t'; }
      else { result += ch; }
    } else {
      if (ch === '"') inString = true;
      result += ch;
    }
  }
  return result;
}

// The model is not consistent about which delimiter it uses to mark its final structured
// answer inside otherwise-free text — observed empirically, same agent and schema, run to
// run: an <structured_output> tag, a ```json fence, and an unprompted <json> tag. Growing
// one hardcoded pattern per newly observed convention doesn't converge, so matching is
// delimiter-agnostic: any <tag>...</tag> pair and any fenced code block are tried as
// candidates, most-recent-first (the real answer conventionally comes after any earlier
// in-text example), each independently re-validated as schema-conformant JSON before being
// accepted — an unmatched or malformed text never silently satisfies the contract. A
// non-greedy delimiter match is itself unsafe when the schema has a free-text field (e.g. a
// "report") that legitimately embeds its own nested, identically-delimited example before
// the real closing delimiter, so brace-balance recovery anchored after the last ```json or
// <json> marker is tried next — immune to that nesting because it tracks braces, not
// delimiters — followed by an unanchored whole-text brace span as the last resort.
function _collectJsonCandidates(text) {
  const candidates = [];
  for (const m of [...text.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)].reverse()) candidates.push(m[2]);
  for (const m of [...text.matchAll(/```[a-zA-Z]*\s*\n?([\s\S]*?)```/g)].reverse()) candidates.push(m[1]);
  for (const start of [...text.matchAll(/```json|<json>/gi)].map(m => m.index + m[0].length).reverse()) {
    const tail = text.slice(start);
    const first = tail.indexOf('{');
    const last = tail.lastIndexOf('}');
    if (first !== -1 && last > first) candidates.push(tail.slice(first, last + 1));
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  return candidates;
}

function extractDelimitedStructuredOutput(text, schema) {
  for (const raw of _collectJsonCandidates(text)) {
    const trimmed = raw.trim();
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      try { parsed = JSON.parse(_repairUnescapedControlCharsInStrings(trimmed)); }
      catch (e2) { continue; }
    }
    try {
      validateSchema(parsed, schema);
      return parsed;
    } catch (e) { /* try the next candidate, or fall through to null */ }
  }
  return null;
}

// FTR-029: distinguishes "no JSON-shaped candidate anywhere in the text" (genuinely missing
// structured output — worth a retry, see _isMissingStructuredOutput) from "a candidate exists but
// doesn't match this schema" (a deterministic content defect — e.g. wrong field names — that would
// just fail the same way again, never worth retrying). Deliberately ignores the schema entirely;
// only asks "did the model attempt to produce SOME JSON object at all".
function _hasAnyParseableJsonCandidate(text) {
  for (const raw of _collectJsonCandidates(text)) {
    const trimmed = raw.trim();
    try { JSON.parse(trimmed); return true; } catch (e) { /* try repaired form below */ }
    try { JSON.parse(_repairUnescapedControlCharsInStrings(trimmed)); return true; } catch (e2) { /* try next candidate */ }
  }
  return false;
}

// A worker with a declared JSON output has no Write tool (see worker()'s own comment on why):
// its entire response text becomes the file verbatim. Some models still wrap that deliverable
// in conversational prose and/or a Markdown code fence despite being told not to (observed
// empirically with gaia-generate-work-breakdown on haiku: "Perfect. I have all the necessary
// information..." before the JSON), which is a hard JSON.parse failure for every downstream
// consumer of this file. Recover the document with the same "try each known convention, always
// re-validate as parseable JSON, never a blind substring guess" discipline as
// extractDelimitedStructuredOutput: the content as-is first, then the last fenced code block,
// then the outermost brace/bracket span. Never throws — genuinely malformed JSON (not merely
// wrapped) is passed through unchanged so the downstream deterministic validator (wb-validate.js)
// remains the one thing that fails closed on it; this function only undoes wrapping, it is not
// itself a validation gate.
function extractJsonDocument(text) {
  // Same "try the candidate as-is, then try it with raw control characters inside
  // string literals re-escaped" fallback as extractDelimitedStructuredOutput, and
  // for the identical reason: a long free-text field (e.g. a task description)
  // typed with literal line breaks instead of `\n` is otherwise indistinguishable
  // from genuinely malformed JSON, even though it's one mechanical fix away from
  // valid. Returns the (possibly repaired) STRING to write to disk, never the
  // parsed object — this function's contract is text recovery, not parsing.
  const tryParse = candidate => {
    try { JSON.parse(candidate); return candidate; } catch (e) {}
    const repaired = _repairUnescapedControlCharsInStrings(candidate);
    try { JSON.parse(repaired); return repaired; } catch (e) { return null; }
  };
  const whole = tryParse(text.trim());
  if (whole != null) return whole;
  const fenceMatches = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (let i = fenceMatches.length - 1; i >= 0; i--) {
    const candidate = tryParse(fenceMatches[i][1].trim());
    if (candidate != null) return candidate;
  }
  const first = text.search(/[[{]/);
  const last = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (first >= 0 && last > first) {
    const candidate = tryParse(text.slice(first, last + 1).trim());
    if (candidate != null) return candidate;
  }
  return text;
}

// Same problem extractJsonDocument fixes, for a Markdown document deliverable (a component/
// use-case/task detail file, or a Requirements/Tech-Spec skeleton) instead of a JSON one: a
// worker's entire response becomes the file verbatim (these agents have no Write tool, see
// worker()'s own comment on why — the host writes whatever text they return), and a model that
// wraps its deliverable in conversational prose and/or an outer code fence silently corrupts the
// saved file. Found empirically in a real spec/components/*.md file: the agent's own real
// "## Change"/"## Tests" headings ended up INSIDE an outer ```markdown fence and were (correctly)
// treated as fenced, non-heading content by tech-spec-assembler.js's own fence-aware parser
// (FTR-025) — the file wrote to disk with its real content unreachable, surfacing only much later
// as an opaque "component file is missing its ## Change section" error during final assembly, with
// no filename attached to say which one (see loadTechSpec's own fix for that half of the bug).
//
// Same "try as-is first, re-validate the candidate, never a blind substring guess, never throws"
// discipline as extractJsonDocument: "valid" here means "has at least one unfenced Markdown
// heading" — the same fence-length-aware scan tech-spec-assembler.js's own
// _nonFencedHeadingIndexes uses, reimplemented here as a presence check rather than a line-index
// list, for the identical "sandboxed runtime has no require()"-shaped reason these two files are
// already siblings, not shared, elsewhere in this codebase. A document that legitimately ends in
// its own small fenced code example (a real Tests section's last line) is never mistaken for a
// whole-response wrap: its real headings already appear BEFORE that trailing fence, unfenced, so
// the as-is candidate already satisfies this check and no unwrapping is even attempted.
function _hasUnfencedHeading(text) {
  let fenceLen = 0;
  for (const line of text.split('\n')) {
    const m = line.match(/^(`{3,})/);
    if (m) { const n = m[1].length; fenceLen = fenceLen === 0 ? n : (n >= fenceLen ? 0 : fenceLen); continue; }
    if (fenceLen === 0 && /^#{1,6}\s/.test(line)) return true;
  }
  return false;
}
// Line-range based, not regex-based: a regex scan for the "first ``` ... last ```" span would
// wrongly stop at the first NESTED closing fence instead of the real outer one (exactly the shape
// a Markdown document's own "## Data Model" section legitimately needs — a fenced JSON example
// nested inside the model's outer ```markdown wrap). Only the LAST non-blank line being a bare
// fence-close, matched back to the first fence-open of the SAME backtick-run length, correctly
// identifies the true outer boundary regardless of what's nested between them.
function _unwrapWholeResponseFence(text) {
  const lines = text.split('\n');
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end--;
  if (end === 0) return null;
  const closeMatch = lines[end - 1].match(/^(`{3,})\s*$/);
  if (!closeMatch) return null;
  const fenceLen = closeMatch[1].length;
  let start = -1;
  for (let i = 0; i < end - 1; i++) {
    const openMatch = lines[i].match(/^(`{3,})\S*\s*$/);
    if (openMatch && openMatch[1].length === fenceLen) { start = i; break; }
  }
  if (start === -1) return null;
  return lines.slice(start + 1, end - 1).join('\n').trim() + '\n';
}
// UC-03: an unclosed whole-response fence wrap (the model opens a ```fence — possibly after some
// conversational preamble, same as the existing closed-fence case already tolerates — but the
// response simply ends without a matching close) defeats _unwrapWholeResponseFence entirely (no
// closing line to match against) AND _hasUnfencedHeading (fence depth never returns to zero,
// hiding every real heading after the opener). Scans for the FIRST fence-open marker anywhere in
// the text (mirroring _unwrapWholeResponseFence's own tolerance for preamble before the fence);
// if NO line anywhere after it closes a fence of that same backtick length, the opener itself is
// the only defect — strip everything up to and including that one line. Same "always re-validate
// the candidate" discipline as the existing unwrap: the caller only uses this if the stripped
// result reveals a real heading.
function _stripUnclosedLeadingFence(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const openMatch = lines[i].match(/^(`{3,})\S*\s*$/);
    if (!openMatch) continue;
    const fenceLen = openMatch[1].length;
    let closesSomewhere = false;
    for (let j = i + 1; j < lines.length; j++) {
      const closeMatch = lines[j].match(/^(`{3,})\s*$/);
      if (closeMatch && closeMatch[1].length === fenceLen) { closesSomewhere = true; break; }
    }
    if (!closesSomewhere) return lines.slice(i + 1).join('\n').trim() + '\n';
    return null; // the first fence-opener found DOES close somewhere — not this case
  }
  return null;
}
function extractMarkdownDocument(text) {
  if (_hasUnfencedHeading(text)) return text;
  const unwrapped = _unwrapWholeResponseFence(text);
  if (unwrapped != null && _hasUnfencedHeading(unwrapped)) return unwrapped;
  const stripped = _stripUnclosedLeadingFence(text);
  if (stripped != null && _hasUnfencedHeading(stripped)) return stripped;
  return text;
}

function validateSchema(value, schema) {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid structured object');
    for (const key of schema.required || []) if (!(key in value)) throw new Error('Missing structured field: ' + key);
    for (const [key, sub] of Object.entries(schema.properties || {})) if (key in value) validateSchema(value[key], sub);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new Error('Invalid structured array');
    if (schema.items) value.forEach(v => validateSchema(v, schema.items));
  } else if (schema.type && (typeof value !== schema.type || (schema.type === 'number' && !Number.isFinite(value)))) {
    throw new Error('Invalid structured ' + schema.type);
  }
}

module.exports = { createControl, validateIdentity, validateSchema, parseArgs, deriveFeatureDir };
