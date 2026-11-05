'use strict';

const fs = require('fs');

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
