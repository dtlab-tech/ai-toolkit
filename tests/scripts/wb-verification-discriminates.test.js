'use strict';

// Check 24 of the Work Breakdown validator: every task needs a verification command that can fail
// before its deliverable exists, otherwise the executor skips it as "already satisfied".

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const graph = require('../../src/claude/scripts/wb-graph-checks');
const { isNonDiscriminatingCommand: weak, checkVerificationDiscriminates, ERRORS } = graph;

const SCRIPTS = path.join(__dirname, '..', '..', 'src', 'claude', 'scripts');
const VALID_FIXTURE = path.join(__dirname, '..', 'fixtures', 'wb-valid.json');

describe('isNonDiscriminatingCommand', () => {
  test.each([
    'npm test', 'npm run test', 'npm test --silent', 'pnpm build', 'yarn lint', 'npm run typecheck',
    'npx tsc --noEmit', 'tsc -p tsconfig.json --noEmit', 'dotnet build', 'dotnet test --no-restore',
    'npx jest', 'npx vitest run', 'pytest -q', 'go test ./...', 'mvn test', 'cargo test', 'make',
    'true', ':', 'exit 0', 'echo ok', 'echo "all good"',
    'npm test || true', 'npx jest || exit 0', 'test -f a.js || true',
    'npm test && npx tsc --noEmit', 'npm run build\nnpm test', 'npm test && echo done',
    '', '   ',
  ])('%j can pass or fail without regard to the deliverable', (command) => {
    expect(weak(command)).toBe(true);
  });

  test.each([
    'test -f src/new.js', 'node --check src/new.js', 'grep -q parseThing src/parser.js',
    'npx jest tests/new.test.js', 'npm test -- --testPathPattern=new', 'dotnet test --filter NewTests',
    'git ls-files src/new | grep -q .', 'npx eslint src/new.js', 'pytest tests/test_new.py',
    'npm test && test -f src/new.js', 'echo start; test -f src/new.js',
  ])('%j names something the task creates or changes', (command) => {
    expect(weak(command)).toBe(false);
  });

  test('a non-string is treated as non-discriminating', () => {
    expect(weak(undefined)).toBe(true);
    expect(weak(null)).toBe(true);
  });
});

describe('checkVerificationDiscriminates', () => {
  const phase = (...tasks) => [{ id: 'US-01', tasks }];
  const task = (id, commands) => ({ id, verification: { commands } });

  test('a task with one discriminating command among generic ones passes', () => {
    expect(checkVerificationDiscriminates(phase(task('T-1', ['npm test', 'test -f src/a.js'])))).toEqual([]);
  });

  test('a task whose commands are all generic is one error naming the task and the commands', () => {
    const errors = checkVerificationDiscriminates(phase(task('T-1', ['npm test', 'npx tsc --noEmit']), task('T-2', ['test -f x'])));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      category: ERRORS.NON_DISCRIMINATING_VERIFICATION, severity: 'error', taskId: 'T-1', field: 'verification.commands',
    });
    expect(errors[0].details.commands).toEqual(['npm test', 'npx tsc --noEmit']);
    expect(errors[0].message).toMatch(/already satisfied/);
  });

  test('missing or empty commands are left to checks 4 and 16, not reported twice', () => {
    expect(checkVerificationDiscriminates(phase({ id: 'T-1' }, task('T-2', [])))).toEqual([]);
  });
});

describe('wb-validate.js', () => {
  function validate(wb) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-check24-'));
    try {
      const file = path.join(dir, 'wb.json');
      fs.writeFileSync(file, JSON.stringify(wb));
      const res = spawnSync(process.execPath, [path.join(SCRIPTS, 'wb-validate.js'), file], { encoding: 'utf8' });
      return { code: res.status, report: JSON.parse(res.stdout) };
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  const base = () => JSON.parse(fs.readFileSync(VALID_FIXTURE, 'utf8'));

  test('the valid fixture still validates', () => {
    expect(validate(base())).toMatchObject({ code: 0, report: { valid: true } });
  });

  test('a task with only generic commands makes the work breakdown invalid', () => {
    const wb = base();
    wb.phases[0].tasks[0].verification.commands = ['npm test'];
    const { code, report } = validate(wb);
    expect(code).toBe(1);
    expect(report.errors.map((e) => e.category)).toContain('non_discriminating_verification');
  });
});

describe('wb-task-check.js (the early, per-task form)', () => {
  function check(detail) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-task-check-'));
    try {
      const file = path.join(dir, 'US-01-TASK-BE-01.md');
      fs.writeFileSync(file, detail);
      const res = spawnSync(process.execPath, [path.join(SCRIPTS, 'wb-task-check.js'), file, 'US-01-TASK-BE-01'], { encoding: 'utf8' });
      return { code: res.status, out: JSON.parse(res.stdout) };
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  const detail = (...commands) => '### T\n\n- **Task ID:** T\n- **Estimate — agent minutes:** 8\n- **Estimate — tokens:** 100\n\n**Verification commands:**\n\n' +
    commands.map((c) => '```\n' + c + '\n```\n').join('\n');

  test('exit 0 and the commands when one of them discriminates', () => {
    const { code, out } = check(detail('npm test', 'test -f src/a.js'));
    expect(code).toBe(0);
    expect(out).toMatchObject({ valid: true, commands: ['npm test', 'test -f src/a.js'] });
  });

  test('exit 1 and the error when they are all generic', () => {
    const { code, out } = check(detail('npm test'));
    expect(code).toBe(1);
    expect(out.valid).toBe(false);
    expect(out.errors[0].category).toBe('non_discriminating_verification');
  });

  test('a detail with no commands is not this check\'s concern (exit 0)', () => {
    expect(check('### T\n\nno commands here\n').code).toBe(0);
  });
});

describe('the writer is told the rule', () => {
  const agent = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'claude', 'agents', 'gaia-generate-work-breakdown-task.md'), 'utf8');
  test('the task agent must produce a command that fails until the deliverable exists', () => {
    expect(agent).toMatch(/At least one verification command must fail until the task's deliverable exists/);
    expect(agent).toMatch(/non_discriminating_verification/);
    expect(agent).toMatch(/verification_may_be_satisfied_earlier/);
  });
});

describe('check 25 (warning): the verification may already pass when the task starts', () => {
  const { checkVerificationMaySatisfyEarly, ERRORS: E } = graph;
  const task = (id, outcome, commands) => ({ id, title: id, outcome, verification: { commands } });
  const run = (...tasks) => checkVerificationMaySatisfyEarly([{ id: 'US-01', tasks }]);

  const parser = task('A', 'Creates src/parser.js and tests/parser.test.js', ['test -f src/parser.js']);

  test('a command that checks a path an earlier task\'s outcome names is flagged, with both task ids', () => {
    const warnings = run(parser, task('B', 'Adds the parser unit tests', ['npx jest tests/parser.test.js']));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ category: E.VERIFICATION_MAY_BE_SATISFIED_EARLIER, severity: 'warning', taskId: 'B' });
    expect(warnings[0].details.overlaps).toEqual([
      { command: 'npx jest tests/parser.test.js', path: 'tests/parser.test.js', earlierTaskId: 'A' },
    ]);
    expect(warnings[0].message).toMatch(/earlier task/);
  });

  test('one command that points at the task\'s own deliverable is enough: no warning', () => {
    expect(run(parser, task('C', 'Creates src/other.js', ['test -f src/parser.js', 'test -f src/other.js']))).toEqual([]);
  });

  test('generic commands do not count as discriminating, so they are never the overlap', () => {
    expect(run(parser, task('C', 'Creates src/other.js', ['npm test', 'test -f src/other.js']))).toEqual([]);
  });

  test('a path named only by the task itself, or by a LATER task, is not flagged', () => {
    expect(run(task('A', 'Creates src/a.js', ['test -f src/a.js']), task('B', 'Creates src/b.js', ['test -f src/b.js']))).toEqual([]);
    expect(run(task('A', 'Early', ['test -f src/later.js']), task('B', 'Creates src/later.js', ['test -f src/later.js']))).toEqual([]);
  });

  test('path forms are compared loosely: backslashes, ./ prefix, case and a shorter suffix', () => {
    const w = run(task('A', 'Creates src\\Parser.js', ['test -f src/Parser.js']), task('B', 'More', ['test -f ./src/parser.js']));
    expect(w).toHaveLength(1);
    expect(run(task('A', 'Creates lib/core/util.js', ['test -f lib/core/util.js']), task('B', 'More', ['test -f core/util.js']))).toHaveLength(1);
  });

  test('wb-validate.js reports it as a warning and the work breakdown stays valid', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-check25-'));
    try {
      const wb = JSON.parse(fs.readFileSync(VALID_FIXTURE, 'utf8'));
      const tasks = wb.phases[0].tasks;
      tasks[0].outcome = 'Creates scripts/shared.js';
      tasks[0].verification.commands = ['test -f scripts/shared.js'];
      tasks[1].verification.commands = ['test -f scripts/shared.js'];
      const file = path.join(dir, 'wb.json');
      fs.writeFileSync(file, JSON.stringify(wb));
      const res = spawnSync(process.execPath, [path.join(SCRIPTS, 'wb-validate.js'), file], { encoding: 'utf8' });
      const report = JSON.parse(res.stdout);
      expect(report.errors.map((e) => e.category)).not.toContain('verification_may_be_satisfied_earlier');
      expect(report.warnings.map((e) => e.category)).toContain('verification_may_be_satisfied_earlier');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
