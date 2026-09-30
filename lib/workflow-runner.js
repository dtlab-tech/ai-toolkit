'use strict';

const fs = require('fs');
const { createControl, parseArgs } = require('./workflow-control');
const IDS = {
  'pm-phase1': 'gaia.orchestrator.feature.phase1',
  'pm-phase2': 'gaia.orchestrator.feature.phase2',
  'am-phase1': 'gaia.orchestrator.assessment.phase1',
  'am-phase2': 'gaia.orchestrator.assessment.phase2',
};

async function runWorkflow(name, args, options) {
  if (!IDS[name]) throw new Error('Unsupported workflow: ' + name + '. For implementation use ai-toolkit tasks start/run (FTR-018).');
  const control = createControl(options);
  const identity = await control.resolve(IDS[name], 'workflow');
  const source = fs.readFileSync(identity.path, 'utf8');
  if (!/controlPlaneVersion:\s*1\b/.test(source)) throw new Error('Installed workflow does not support deterministic control-plane v1; reinstall toolkit assets.');
  // Only verified toolkit scripts are evaluated. This host is not a security sandbox.
  const body = source.replace(/^export const meta\s*=/m, 'const meta =');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  return new AsyncFunction('control', 'args', body)(control, parseArgs(args));
}

async function main(argv) {
  if (argv[0] !== 'run') throw new Error('Usage: ai-toolkit workflow run NAME --project DIR --claude-path EXE -- ARGS');
  const split = argv.indexOf('--');
  if (split < 0) throw new Error('Workflow arguments must follow --');
  const options = { projectDir: process.cwd(), log: s => process.stderr.write(s + '\n') };
  const keys = { '--project': 'projectDir', '--home': 'home', '--claude-path': 'claudePath' };
  for (let i = 2; i < split; i += 2) {
    if (!keys[argv[i]] || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Invalid workflow option: ' + argv[i]);
    options[keys[argv[i]]] = argv[i + 1];
  }
  if (!options.claudePath && argv[1] !== 'am-phase2') throw new Error('--claude-path is required');
  const result = await runWorkflow(argv[1], argv.slice(split + 1), options);
  process.stdout.write(JSON.stringify(result) + '\n');
}

module.exports = { runWorkflow, main };
