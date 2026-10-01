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
    try { fs.writeFileSync(tmp, content, 'utf8'); fs.renameSync(tmp, dest); }
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
    if (options.home && argv[0] === 'run-asset') {
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
      const cliArgs = ['--print', '--output-format', 'json', '--agent', identity.nativeName];
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
      const result = await (options.dispatch || spawnClaudeAgent)({
        claudePath: options.claudePath, cwd: root, args: cliArgs, prompt,
        taskTimeoutMs: options.taskTimeoutMs || 1800000,
      });
      // Count usage before any business/protocol check, including denied tools.
      const usage = result.result?.usage;
      const counts = usage && [usage.input_tokens, usage.output_tokens,
        usage.cache_read_input_tokens ?? 0, usage.cache_creation_input_tokens ?? 0];
      const tokens = counts && counts.every(n => Number.isInteger(n) && n >= 0)
        ? counts.reduce((a, b) => a + b, 0) : null;
      measuredTokens = Number.isSafeInteger(tokens) && tokens > 0 ? tokens : null;
      spent += measuredTokens || 0;
      tokenLedger.push({ agent: identity.nativeName, model: definition.model,
        phase_delta_tokens: measuredTokens, usage: usage || null, evidence_path: evidence.file });
      evidence.save({ response: result });
      const denials = result.result?.permission_denials;
      if (Array.isArray(denials) && denials.length) {
        const tools = [...new Set(denials.map(d => d.tool_name || 'unknown'))].join(', ');
        throw new Error('Worker permission denied: ' + id + '; tools: ' + tools);
      }
      if (result.exitCode !== 0 || result.parseError || result.timedOut ||
          !result.result || result.result.is_error !== false) throw new Error('Worker failed: ' + id);
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
    log: text => (options.log || (() => {}))(String(text)),
    append: (p, text) => { fs.mkdirSync(path.dirname(full(p)), { recursive: true }); fs.appendFileSync(full(p), text); },
  };
  const artifacts = require('./workflow-artifacts');
  api.estimates = (...args) => artifacts.estimates(api, ...args);
  api.assessmentEstimates = (...args) => artifacts.assessmentEstimates(api, ...args);
  api.recordAssessmentApproval = (...args) => artifacts.recordAssessmentApproval(api, ...args);
  return api;
}

// Tries each known convention a model has been observed using to delimit its final
// structured answer inside otherwise-free text, in order of explicitness, and returns the
// first candidate that is both valid JSON and schema-conformant. Returns null (never throws)
// if no candidate qualifies, so the caller's original "no structured output" error still fires
// unchanged when the text holds nothing usable.
function extractDelimitedStructuredOutput(text, schema) {
  const candidates = [];
  const tagMatch = text.match(/<structured_output>([\s\S]*?)<\/structured_output>/);
  if (tagMatch) candidates.push(tagMatch[1]);
  const fenceMatches = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)];
  if (fenceMatches.length) candidates.push(fenceMatches[fenceMatches.length - 1][1]);
  // The non-greedy fence match above stops at the FIRST ``` following ```json, which is
  // wrong when a schema string field (e.g. a "report") legitimately embeds its own
  // untagged ``` ... ``` example (a markdown table, say) before the real closing fence —
  // observed empirically with gaia-validate-feature-docs. Recover with a brace-balance
  // span instead of a fence-delimiter match, anchored after the last ```json marker so it
  // is immune to backtick nesting inside string values.
  const lastJsonFence = text.lastIndexOf('```json');
  if (lastJsonFence !== -1) {
    const tail = text.slice(lastJsonFence + '```json'.length);
    const first = tail.indexOf('{');
    const last = tail.lastIndexOf('}');
    if (first !== -1 && last > first) candidates.push(tail.slice(first, last + 1));
  }
  for (const raw of candidates) {
    try {
      const parsed = JSON.parse(raw.trim());
      validateSchema(parsed, schema);
      return parsed;
    } catch (e) { /* try the next candidate, or fall through to null */ }
  }
  return null;
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
  const tryParse = candidate => { try { JSON.parse(candidate); return candidate; } catch (e) { return null; } };
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
