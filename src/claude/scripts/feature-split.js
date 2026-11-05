'use strict';

const fs = require('fs');
const path = require('path');

class FeatureSplitError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'FeatureSplitError';
    this.code = code;
    this.key = details.key ?? null;
    this.file = details.file ?? null;
  }
}

const UNEXPECTED_CODE = 'UNEXPECTED_ERROR';

const RESERVED_DEVICE_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

function invalidName(message) {
  return new FeatureSplitError('INVALID_NAME', message, { key: null, file: null });
}

function slug(name) {
  const raw = typeof name === 'string' ? name.trim() : '';
  if (raw === '') throw invalidName('child name is empty');
  if (/[\/\\]/.test(raw)) throw invalidName('child name contains a path separator');
  if (raw.includes('..')) throw invalidName('child name contains ".."');
  const stem = raw.split('.')[0].toUpperCase();
  if (RESERVED_DEVICE_NAMES.has(stem)) {
    throw invalidName(`child name "${raw}" is a reserved Windows device name`);
  }
  const s = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s === '') throw invalidName('child name has no ASCII letters or digits');
  return s;
}

const REGISTRY_NAME = 'REGISTRY.md';
const ENTRY_HEADING = /^## (FTR-\d+) — (.+)$/;
const ENTRY_SEPARATOR = /^---\s*$/;
const FIELD_LINE = /^\*\*([A-Za-z ]+):\*\*\s*(.*)$/;
const DETAIL_LINK = /^→\s*\[Detail\]\((.*)\)\s*$/;

function splitList(value) {
  if (!value || value.toLowerCase() === 'none') return [];
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

function parseEntry(id, title, lines) {
  const fields = new Map();
  let detail = null;
  for (const raw of lines) {
    const line = raw.trim();
    const link = line.match(DETAIL_LINK);
    if (link) {
      detail = link[1];
      continue;
    }
    const field = line.match(FIELD_LINE);
    if (field && !fields.has(field[1])) fields.set(field[1], field[2].trim());
  }
  return {
    id,
    title,
    keywords: splitList(fields.get('Keywords')),
    status: fields.get('Status') || null,
    summary: fields.get('Summary') || '',
    detail: detail ?? fields.get('Detail') ?? null,
    parent: fields.get('Parent') || null,
    dependsOn: splitList(fields.get('Depends on')),
  };
}

function parseRegistry(text) {
  const entries = [];
  let current = null;
  const flush = () => {
    if (current) entries.push(parseEntry(current.id, current.title, current.lines));
    current = null;
  };
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(ENTRY_HEADING);
    if (heading) {
      flush();
      current = { id: heading[1], title: heading[2].trim(), lines: [] };
    } else if (ENTRY_SEPARATOR.test(line)) {
      flush();
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();
  return entries;
}

function readRegistry(featuresRoot) {
  const file = path.join(featuresRoot, REGISTRY_NAME);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { exists: false, file, entries: [] };
    throw new FeatureSplitError('REGISTRY_IO', `cannot read ${file} (${err.code || err.message})`, { file });
  }
  return { exists: true, file, entries: parseRegistry(text) };
}

function writeRegistryAtomic(featuresRoot, runId, content) {
  const registryPath = path.join(featuresRoot, REGISTRY_NAME);
  if (!/^[0-9a-f]+$/i.test(String(runId))) {
    throw new FeatureSplitError('REGISTRY_IO', `invalid run id for registry temp file: ${runId}`, { file: registryPath });
  }
  const tempPath = path.join(featuresRoot, `${REGISTRY_NAME}.tmp-${runId}`);
  let created = false;
  try {
    fs.writeFileSync(tempPath, content, { encoding: 'utf8', flag: 'wx' });
    created = true;
    fs.renameSync(tempPath, registryPath);
  } catch (err) {
    if (created) {
      try {
        fs.rmSync(tempPath, { force: true });
      } catch (_) {
        // left for the staging leftover scan; this helper removes only the file it created
      }
    }
    throw new FeatureSplitError(
      'REGISTRY_IO',
      `cannot write ${registryPath} (previous registry left unchanged): ${err.code || err.message}`,
      { file: registryPath },
    );
  }
}

function runApply(args, readStdin) {
  throw new Error('apply is not implemented yet');
}

function runRegister(args) {
  throw new Error('register is not implemented yet');
}

const COMMANDS = { apply: runApply, register: runRegister };

function errorPayload(err) {
  if (err instanceof FeatureSplitError) {
    return { error: { code: err.code, key: err.key ?? null, file: err.file ?? null, message: err.message } };
  }
  return { error: { code: UNEXPECTED_CODE, key: null, file: null, message: String((err && err.message) || err) } };
}

function main(argv, readStdin) {
  const [command, ...rest] = argv;
  try {
    if (!command || !Object.prototype.hasOwnProperty.call(COMMANDS, command)) {
      throw new Error(`unknown or missing command: ${command || '(none)'}; expected apply or register`);
    }
    return { exitCode: 0, payload: COMMANDS[command](rest, readStdin) };
  } catch (err) {
    return { exitCode: 1, payload: errorPayload(err) };
  }
}

function run(argv = process.argv.slice(2)) {
  const readStdin = () => fs.readFileSync(0, 'utf8');
  const { exitCode, payload } = main(argv, readStdin);
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exitCode = exitCode;
}

if (require.main === module) run();

module.exports.FeatureSplitError = FeatureSplitError;
module.exports.main = main;
module.exports.run = run;
module.exports.slug = slug;
module.exports.parseRegistry = parseRegistry;
module.exports.readRegistry = readRegistry;
module.exports.writeRegistryAtomic = writeRegistryAtomic;
