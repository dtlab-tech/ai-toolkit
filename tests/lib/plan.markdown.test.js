'use strict';

const fs = require('fs');
const path = require('path');
const { parseMarkdown } = require('../../lib/task-executor/plan');

const REAL_WB_PATH = path.join(
  __dirname, '..', '..', 'internal_docs', 'features',
  'FTR-018-deterministic-task-execution-checkpoints-and-resume',
  'FTR-018-Work-Breakdown.md'
);

// ── Fixture builder ──────────────────────────────────────────────────────────
//
// Mirrors the pure helpers in scripts/wb-render.js (fencedCommandBlock,
// taskAnchor, and the "## Task Details" per-task rendering loop) so fixtures
// here are byte-faithful to what the real renderer produces, without
// executing that script directly (it is a CLI entry point that reads
// process.argv and calls process.exit on load).
function fencedCommandBlock(cmd) {
  const runs = cmd.match(/`+/g) || [];
  const maxRun = runs.reduce((m, r) => Math.max(m, r.length), 0);
  const fence = '`'.repeat(Math.max(3, maxRun + 1));
  return `${fence}\n${cmd}\n${fence}`;
}

function taskAnchor(id) {
  return 'task-' + id.replace(/[^A-Za-z0-9_-]/g, '-');
}

function renderTaskDetail(task) {
  const L = [];
  L.push(`<a id="${taskAnchor(task.id)}"></a>`);
  L.push(`### ${task.id}`);
  L.push('');
  L.push(`- **Task ID:** ${task.id}`);
  L.push(`- **Title:** ${task.title}`);
  L.push(`- **Outcome:** ${task.outcome}`);
  L.push(`- **Domain:** ${task.domain}`);
  L.push(`- **Agent type:** ${task.agentType}`);
  L.push(`- **Dependencies:** ${task.dependsOn.length ? task.dependsOn.join(', ') : '—'}`);
  L.push(`- **Acceptance criteria:** ${task.acceptanceCriteria.length ? task.acceptanceCriteria.join(', ') : '—'}`);
  L.push(`- **Estimate — agent minutes:** ${task.agentMinutes == null ? '—' : task.agentMinutes}`);
  L.push(`- **Estimate — tokens:** ${task.tokens == null ? '—' : task.tokens}`);
  L.push(`- **Output count:** ${task.outputCount == null ? '—' : task.outputCount}`);
  L.push(`- **Grouping rationale:** ${task.groupingRationale == null ? '—' : task.groupingRationale}`);
  L.push(`- **Commit type:** ${task.commit.type == null ? '—' : task.commit.type}`);
  L.push(`- **Commit scope:** ${task.commit.scope == null ? '—' : task.commit.scope}`);
  L.push(`- **Commit subject:** ${task.commit.subject == null ? '—' : task.commit.subject}`);
  L.push('');
  L.push('**Verification commands:**');
  L.push('');
  if (task.verificationCommands.length === 0) {
    L.push('_No verification commands._');
    L.push('');
  } else {
    for (const cmd of task.verificationCommands) {
      L.push(fencedCommandBlock(cmd));
      L.push('');
    }
  }
  return L.join('\n');
}

function buildFixture(tasks, opts) {
  const options = opts || {};
  const L = [];
  L.push('# Work Breakdown — FTR-999');
  L.push('');
  L.push('## Summary');
  L.push('| Metric | Value |');
  L.push('|--------|-------|');
  L.push(`| Total tasks | ${tasks.length} |`);
  L.push('');
  if (options.includeDetailsHeading !== false) {
    L.push('## Task Details');
    L.push('');
    L.push('> Authoritative per-task detail.');
    L.push('');
    for (const task of tasks) {
      L.push(renderTaskDetail(task));
    }
  }
  L.push('## Statistics');
  L.push('');
  L.push('| Domain | Count |');
  L.push('|--------|-------|');
  L.push('| BE | ' + tasks.length + ' |');
  L.push('');
  return L.join('\n');
}

const TASK_A = {
  id: 'US-99-TASK-BE-01',
  title: 'Fixture task A',
  outcome: 'Fixture outcome A',
  domain: 'BE',
  agentType: 'developer-backend',
  dependsOn: ['US-98-TASK-BE-01', 'US-98-TASK-BE-02'],
  acceptanceCriteria: ['AC-01', 'AC-02'],
  agentMinutes: 13,
  tokens: 31000,
  outputCount: 1,
  groupingRationale: 'A single cohesive fixture unit for parser testing',
  commit: { type: 'feat', scope: 'plan', subject: 'add fixture task A' },
  verificationCommands: ['npm test -- --testPathPattern=fixture.a'],
};

const TASK_B_ALL_DASHES = {
  id: 'US-99-TASK-BE-02',
  title: 'Fixture task B',
  outcome: 'Fixture outcome B',
  domain: 'INFRA',
  agentType: 'developer-backend',
  dependsOn: [],
  acceptanceCriteria: [],
  agentMinutes: null,
  tokens: null,
  outputCount: null,
  groupingRationale: null,
  commit: { type: null, scope: null, subject: null },
  verificationCommands: [],
};

const TASK_C_LOSSLESS = {
  id: 'US-99-TASK-BE-03',
  title: 'Fixture task C',
  outcome: 'Fixture outcome C',
  domain: 'BE',
  agentType: 'developer-backend',
  dependsOn: ['US-99-TASK-BE-02'],
  acceptanceCriteria: ['AC-03'],
  agentMinutes: 10,
  tokens: 20000,
  outputCount: 1,
  groupingRationale: 'Exercises lossless fence preservation',
  commit: { type: 'feat', scope: null, subject: 'add fixture task C' },
  verificationCommands: [
    "command -x | grep -E 'a|b|c' || echo fail",
    'wrapped ```inner``` text stays intact',
    'line1\nline2 with | pipe\nline3',
    'test -z "$(npm pack --dry-run 2>/dev/null | grep -E \'x/y/\')"',
  ],
};

describe('parseMarkdown() — synthetic fixtures', () => {
  test('extracts all 14 fields for a fully-populated task', () => {
    const md = buildFixture([TASK_A]);
    const tasks = parseMarkdown(md);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toEqual({
      id: 'US-99-TASK-BE-01',
      title: 'Fixture task A',
      outcome: 'Fixture outcome A',
      domain: 'BE',
      agentType: 'developer-backend',
      dependsOn: ['US-98-TASK-BE-01', 'US-98-TASK-BE-02'],
      acceptanceCriteria: ['AC-01', 'AC-02'],
      agentMinutes: 13,
      tokens: 31000,
      outputCount: 1,
      groupingRationale: 'A single cohesive fixture unit for parser testing',
      commit: { type: 'feat', scope: 'plan', subject: 'add fixture task A' },
      verificationCommands: ['npm test -- --testPathPattern=fixture.a'],
    });
  });

  test('maps dash placeholders to empty arrays / null, and no-commands marker to []', () => {
    const md = buildFixture([TASK_B_ALL_DASHES]);
    const [task] = parseMarkdown(md);
    expect(task.dependsOn).toEqual([]);
    expect(task.acceptanceCriteria).toEqual([]);
    expect(task.agentMinutes).toBeNull();
    expect(task.tokens).toBeNull();
    expect(task.outputCount).toBeNull();
    expect(task.groupingRationale).toBeNull();
    expect(task.commit).toEqual({ type: null, scope: null, subject: null });
    expect(task.verificationCommands).toEqual([]);
  });

  test('preserves verification commands losslessly: shell pipes, ||, regex alternation, embedded backtick fences, and embedded newlines', () => {
    const md = buildFixture([TASK_C_LOSSLESS]);
    const [task] = parseMarkdown(md);
    expect(task.verificationCommands).toEqual(TASK_C_LOSSLESS.verificationCommands);
  });

  test('parses multiple tasks in document order', () => {
    const md = buildFixture([TASK_A, TASK_B_ALL_DASHES, TASK_C_LOSSLESS]);
    const tasks = parseMarkdown(md);
    expect(tasks.map(t => t.id)).toEqual([
      'US-99-TASK-BE-01',
      'US-99-TASK-BE-02',
      'US-99-TASK-BE-03',
    ]);
  });

  test('stops at the following "## " heading and ignores content after "## Task Details"', () => {
    const md = buildFixture([TASK_A]);
    expect(md).toEqual(expect.stringContaining('## Statistics'));
    const tasks = parseMarkdown(md);
    expect(tasks).toHaveLength(1);
  });

  test('throws PLAN_PARSE_ERROR when "## Task Details" section is absent', () => {
    const md = buildFixture([TASK_A], { includeDetailsHeading: false });
    expect(() => parseMarkdown(md)).toThrow(/Task Details/);
    try {
      parseMarkdown(md);
      throw new Error('expected parseMarkdown to throw');
    } catch (err) {
      expect(err.code).toBe('PLAN_PARSE_ERROR');
    }
  });

  test('throws PLAN_PARSE_ERROR when a required field bullet is missing', () => {
    let md = buildFixture([TASK_A]);
    md = md.replace('- **Domain:** BE\n', '');
    expect(() => parseMarkdown(md)).toThrow(/missing required field/);
    try {
      parseMarkdown(md);
      throw new Error('expected parseMarkdown to throw');
    } catch (err) {
      expect(err.code).toBe('PLAN_PARSE_ERROR');
      expect(err.message).toMatch(/Domain/);
    }
  });

  test('throws PLAN_PARSE_ERROR when the anchor id does not match the "Task ID" field', () => {
    let md = buildFixture([TASK_A]);
    md = md.replace('- **Task ID:** US-99-TASK-BE-01', '- **Task ID:** US-99-TASK-BE-99');
    expect(() => parseMarkdown(md)).toThrow(/does not match/);
  });

  test('throws PLAN_PARSE_ERROR when the "## Task Details" section has no task entries', () => {
    const md = [
      '## Task Details',
      '',
      '> Authoritative per-task detail.',
      '',
      '## Statistics',
      '',
    ].join('\n');
    expect(() => parseMarkdown(md)).toThrow(/no task entries/);
  });
});

describe('parseMarkdown() — real FTR-018-Work-Breakdown.md', () => {
  let markdown;
  let tasks;

  beforeAll(() => {
    markdown = fs.readFileSync(REAL_WB_PATH, 'utf8');
    tasks = parseMarkdown(markdown);
  });

  test('parses every task declared in the document (Summary: Total tasks = 46)', () => {
    expect(tasks).toHaveLength(46);
    const ids = tasks.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids in this fixture
  });

  test('extracts the 14 fields correctly for US-01-TASK-BE-01 (this task\'s own WB entry)', () => {
    const task = tasks.find(t => t.id === 'US-01-TASK-BE-01');
    expect(task).toBeDefined();
    expect(task).toMatchObject({
      id: 'US-01-TASK-BE-01',
      title: 'Implement MD task detail parser',
      domain: 'BE',
      agentType: 'developer-backend',
      dependsOn: [],
      acceptanceCriteria: ['AC-02'],
      agentMinutes: 13,
      tokens: 31000,
      outputCount: 1,
      commit: { type: 'feat', scope: null, subject: 'add Work Breakdown Markdown parser (plan.js)' },
      verificationCommands: ['npm test -- --testPathPattern=plan.*.markdown'],
    });
    expect(task.groupingRationale).toMatch(/single-concern parser module/);
  });

  test('extracts multi-value dependencies for INFRA-TASK-BE-03', () => {
    const task = tasks.find(t => t.id === 'INFRA-TASK-BE-03');
    expect(task.dependsOn).toEqual(['INFRA-TASK-BE-01', 'INFRA-TASK-BE-02']);
    expect(task.verificationCommands).toEqual([
      "node -e \"const e = require('./lib/task-executor'); console.log(typeof e.execute, typeof e.resume)\"",
    ]);
  });

  test('preserves multiple verification commands with shell pipes and command substitution verbatim (US-08-TASK-INFRA-01)', () => {
    const task = tasks.find(t => t.id === 'US-08-TASK-INFRA-01');
    expect(task.verificationCommands).toEqual([
      "npm pack --dry-run 2>/dev/null | grep -E 'lib/task-executor/'",
      "npm pack --dry-run 2>/dev/null | grep -E 'bin/cli.js'",
      "test -z \"$(npm pack --dry-run 2>/dev/null | grep -E 'tests/task-executor/')\"",
    ]);
  });

  test('preserves a negated shell verification command verbatim (US-09-TASK-BE-01)', () => {
    const task = tasks.find(t => t.id === 'US-09-TASK-BE-01');
    expect(task.verificationCommands).toEqual([
      "grep -q 'task-executor' src/claude/skills/implement-feature/SKILL.md",
      "! grep -q 'Invoke pm-phase3 (Implementation Phase)' src/claude/skills/implement-feature/SKILL.md",
    ]);
  });
});
