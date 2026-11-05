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
