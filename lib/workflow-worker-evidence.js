'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Do not capture the parent environment or stdin prompt. Diagnostic responses
// can contain document text; redact common credential forms before persistence.
function redact(value) {
  const secretKey = /^(?:authorization|proxy.authorization|.*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential))$/i;
  const secrets = Object.entries(process.env)
    .filter(([key, val]) => secretKey.test(key) && val && val.length >= 8)
    .map(([, val]) => val);
  function cleanString(text) {
    for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
    return text
      .replace(/\b(Bearer\s+)[^\s"'<>]+/gi, '$1[REDACTED]')
      .replace(/\b((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,"'<>]+/gi, '$1[REDACTED]')
      .replace(/\bsk-[A-Za-z0-9_-]+/g, '[REDACTED]');
  }
  function walk(item) {
    if (typeof item === 'string') {
      // stdout is often a JSON string: redact credential keys there too.
      try { return JSON.stringify(walk(JSON.parse(item))); } catch (_) { return cleanString(item); }
    }
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item)
      .map(([key, val]) => [key, secretKey.test(key) ? '[REDACTED]' : walk(val)]));
    return item;
  }
  return walk(value);
}

function createEvidence(options, runId, identity, invocation) {
  const dir = path.join(path.resolve(options.diagnosticsDir || path.join(os.tmpdir(), 'ai-toolkit-workflows')), runId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, crypto.randomUUID() + '.json');
  const record = { version: 1, runId, agentId: identity.agentId, definitionPath: identity.path,
    definitionHash: identity.sha256, invocation, startedAt: new Date().toISOString(), outcome: 'running' };
  function save(patch) {
    Object.assign(record, patch);
    const temp = file + '.tmp';
    try {
      fs.writeFileSync(temp, JSON.stringify(redact(record), null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(temp, file);
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  }
  save({});
  return { file, save };
}

module.exports = { createEvidence, redact };
