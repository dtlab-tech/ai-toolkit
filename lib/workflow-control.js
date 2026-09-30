'use strict';

// Node host for workflow control-plane operations. Never ask an LLM to do I/O.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const registry = require('./agent-registry');
const ledger = require('./execution-ledger');
const { spawnClaudeAgent } = require('./task-executor/claude-process');
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
  const root = path.resolve(options.projectDir);
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
      const result = await (options.dispatch || spawnClaudeAgent)({
        claudePath: options.claudePath, cwd: root, args: cliArgs, prompt,
        taskTimeoutMs: options.taskTimeoutMs || 1800000,
      });
      if (result.exitCode !== 0 || result.parseError || result.timedOut ||
          !result.result || result.result.is_error !== false) throw new Error('Worker failed: ' + id);
      const payload = opts.schema ? result.result.structured_output : result.result.result;
      if (payload == null || (typeof payload === 'string' && !payload.trim())) throw new Error('Worker returned no result: ' + id);
      if (opts.schema) validateSchema(payload, opts.schema);
      const usage = result.result.usage;
      const tokens = usage && [usage.input_tokens, usage.output_tokens].every(Number.isFinite)
        ? usage.input_tokens + usage.output_tokens + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0) : null;
      measuredTokens = Number.isInteger(tokens) && tokens > 0 ? tokens : null;
      spent += measuredTokens || 0;
      tokenLedger.push({ agent: identity.nativeName, model: definition.model, phase_delta_tokens: measuredTokens });
      return payload;
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
    const file = full(p), dir = deriveFeatureDir(file);
    const match = path.basename(dir).match(/^([A-Z]+-\d+)(?:-|$)/);
    if (!match) throw new Error('Cannot derive canonical feature prefix');
    read(file);
    return { featurePath: file, featureDir: dir, prefix: match[1] };
  }
  const api = { root, runId, read, exists, write, resolve, worker, parallel, run, command, activity,
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
