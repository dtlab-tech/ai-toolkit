'use strict';

const fs = require('fs');
const path = require('path');
const { parseCSV, mapPhases, parseMarkdown } = require('../../lib/task-executor/plan');

const REAL_CSV_PATH = path.join(
  __dirname, '..', '..', 'internal_docs', 'features',
  'FTR-018-deterministic-task-execution-checkpoints-and-resume',
  'FTR-018-Work-Breakdown.csv'
);

const REAL_MD_PATH = path.join(
  __dirname, '..', '..', 'internal_docs', 'features',
  'FTR-018-deterministic-task-execution-checkpoints-and-resume',
  'FTR-018-Work-Breakdown.md'
);

const HEADER = 'phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type';

function buildCsv(rows) {
  return [HEADER].concat(rows).join('\n') + '\n';
}

function mdTask(overrides) {
  return Object.assign({
    id: 'US-99-TASK-BE-01',
    title: 'Fixture task',
    outcome: 'Fixture outcome',
    domain: 'BE',
    agentType: 'developer-backend',
    dependsOn: [],
    acceptanceCriteria: ['AC-01'],
    agentMinutes: 10,
    tokens: 20000,
    outputCount: 1,
    groupingRationale: 'Fixture rationale',
    commit: { type: 'feat', scope: null, subject: 'fixture' },
    verificationCommands: [],
  }, overrides);
}

describe('parseCSV() — synthetic fixtures', () => {
  test('parses a well-formed multi-row, multi-phase CSV into row objects', () => {
    const csv = buildCsv([
      'INFRA|Shared infra|chore(FTR-999): setup||INFRA-TASK-BE-01|Task one|BE|developer-backend',
      'INFRA|Shared infra|chore(FTR-999): setup||INFRA-TASK-BE-02|Task two|BE|developer-backend',
      'US-01|Story one|feat(FTR-999): story one|INFRA|US-01-TASK-BE-01|Task three|BE|developer-backend',
    ]);
    const rows = parseCSV(csv);
    expect(rows).toEqual([
      {
        phaseId: 'INFRA', phaseTitle: 'Shared infra', commitMessage: 'chore(FTR-999): setup',
        dependsOn: [], taskId: 'INFRA-TASK-BE-01', taskTitle: 'Task one', domain: 'BE', agentType: 'developer-backend',
      },
      {
        phaseId: 'INFRA', phaseTitle: 'Shared infra', commitMessage: 'chore(FTR-999): setup',
        dependsOn: [], taskId: 'INFRA-TASK-BE-02', taskTitle: 'Task two', domain: 'BE', agentType: 'developer-backend',
      },
      {
        phaseId: 'US-01', phaseTitle: 'Story one', commitMessage: 'feat(FTR-999): story one',
        dependsOn: ['INFRA'], taskId: 'US-01-TASK-BE-01', taskTitle: 'Task three', domain: 'BE', agentType: 'developer-backend',
      },
    ]);
  });

  test('splits a multi-phase depends_on field on whitespace', () => {
    const csv = buildCsv([
      'US-06|Resume|feat(FTR-999): resume|INFRA US-01 US-05|US-06-TASK-BE-01|Task|BE|developer-backend',
    ]);
    const [row] = parseCSV(csv);
    expect(row.dependsOn).toEqual(['INFRA', 'US-01', 'US-05']);
  });

  test('throws PLAN_PARSE_ERROR when the header does not match the eight-column format', () => {
    const csv = 'phase_id|phase_title|task_id\nINFRA|x|INFRA-TASK-BE-01\n';
    expect(() => parseCSV(csv)).toThrow(/expected header/);
    try {
      parseCSV(csv);
      throw new Error('expected parseCSV to throw');
    } catch (err) {
      expect(err.code).toBe('PLAN_PARSE_ERROR');
    }
  });

  test('throws PLAN_PARSE_ERROR when input is empty', () => {
    expect(() => parseCSV('')).toThrow(/empty/);
  });

  test('throws PLAN_PARSE_ERROR when there are no data rows after the header', () => {
    expect(() => parseCSV(HEADER + '\n')).toThrow(/no data rows/);
  });

  test('throws PLAN_PARSE_ERROR when a row has the wrong number of fields', () => {
    const csv = buildCsv(['INFRA|Shared infra|chore(FTR-999): setup||INFRA-TASK-BE-01|Task one|BE']);
    expect(() => parseCSV(csv)).toThrow(/line 2 has 7 field\(s\), expected 8/);
  });

  test('throws PLAN_PARSE_ERROR when a row is blank', () => {
    const csv = HEADER +
      '\nINFRA|Shared infra|chore(FTR-999): setup||INFRA-TASK-BE-01|Task one|BE|developer-backend' +
      '\n\n' +
      'INFRA|Shared infra|chore(FTR-999): setup||INFRA-TASK-BE-02|Task two|BE|developer-backend\n';
    expect(() => parseCSV(csv)).toThrow(/line 3 is blank/);
  });

  test('throws PLAN_PARSE_ERROR when phase_id is missing', () => {
    const csv = buildCsv(['|Shared infra|chore(FTR-999): setup||INFRA-TASK-BE-01|Task one|BE|developer-backend']);
    expect(() => parseCSV(csv)).toThrow(/missing phase_id/);
  });

  test('throws PLAN_PARSE_ERROR when task_id is missing', () => {
    const csv = buildCsv(['INFRA|Shared infra|chore(FTR-999): setup|||Task one|BE|developer-backend']);
    expect(() => parseCSV(csv)).toThrow(/missing task_id/);
  });
});

describe('mapPhases() — synthetic fixtures', () => {
  test('aggregates rows into one phase per phase_id, preserving first-seen order, and attaches phaseId to tasks', () => {
    const rows = parseCSV(buildCsv([
      'INFRA|Shared infra|chore(FTR-999): setup||INFRA-TASK-BE-01|Task one|BE|developer-backend',
      'US-01|Story one|feat(FTR-999): story one|INFRA|US-01-TASK-BE-01|Task two|BE|developer-backend',
      'INFRA|Shared infra|chore(FTR-999): setup||INFRA-TASK-BE-02|Task three|BE|developer-backend',
    ]));
    const mdTasks = [
      mdTask({ id: 'INFRA-TASK-BE-01' }),
      mdTask({ id: 'US-01-TASK-BE-01' }),
      mdTask({ id: 'INFRA-TASK-BE-02' }),
    ];
    const result = mapPhases(rows, mdTasks);

    expect(result.phases).toEqual([
      { id: 'INFRA', title: 'Shared infra', commitMessage: 'chore(FTR-999): setup', dependsOn: [], taskIds: ['INFRA-TASK-BE-01', 'INFRA-TASK-BE-02'] },
      { id: 'US-01', title: 'Story one', commitMessage: 'feat(FTR-999): story one', dependsOn: ['INFRA'], taskIds: ['US-01-TASK-BE-01'] },
    ]);

    expect(result.tasks.map(t => ({ id: t.id, phaseId: t.phaseId }))).toEqual([
      { id: 'INFRA-TASK-BE-01', phaseId: 'INFRA' },
      { id: 'US-01-TASK-BE-01', phaseId: 'US-01' },
      { id: 'INFRA-TASK-BE-02', phaseId: 'INFRA' },
    ]);
  });

  test('preserves every MD task field on the returned tasks, adding only phaseId', () => {
    const rows = parseCSV(buildCsv([
      'INFRA|Shared infra|chore(FTR-999): setup||INFRA-TASK-BE-01|Task one|BE|developer-backend',
    ]));
    const mdTasks = [mdTask({ id: 'INFRA-TASK-BE-01' })];
    const result = mapPhases(rows, mdTasks);
    expect(result.tasks[0]).toEqual(Object.assign({}, mdTasks[0], { phaseId: 'INFRA' }));
  });

  test('throws PLAN_PARSE_ERROR on a duplicate task_id within the CSV', () => {
    const rows = parseCSV(buildCsv([
      'INFRA|Shared infra|chore(FTR-999): setup||INFRA-TASK-BE-01|Task one|BE|developer-backend',
      'INFRA|Shared infra|chore(FTR-999): setup||INFRA-TASK-BE-01|Task one dup|BE|developer-backend',
    ]));
    const mdTasks = [mdTask({ id: 'INFRA-TASK-BE-01' })];
    expect(() => mapPhases(rows, mdTasks)).toThrow(/duplicate task_id/);
  });

  test('throws PLAN_PARSE_ERROR when the same phase_id has inconsistent phase_title across rows', () => {
    const rows = parseCSV(buildCsv([
      'INFRA|Shared infra|chore(FTR-999): setup||INFRA-TASK-BE-01|Task one|BE|developer-backend',
      'INFRA|Different title|chore(FTR-999): setup||INFRA-TASK-BE-02|Task two|BE|developer-backend',
    ]));
    const mdTasks = [mdTask({ id: 'INFRA-TASK-BE-01' }), mdTask({ id: 'INFRA-TASK-BE-02' })];
    expect(() => mapPhases(rows, mdTasks)).toThrow(/inconsistent phase_title/);
  });

  test('throws PLAN_PARSE_ERROR when the same phase_id has inconsistent depends_on across rows', () => {
    const rows = parseCSV(buildCsv([
      'US-06|Resume|feat(FTR-999): resume|INFRA|US-06-TASK-BE-01|Task one|BE|developer-backend',
      'US-06|Resume|feat(FTR-999): resume|INFRA US-01|US-06-TASK-BE-02|Task two|BE|developer-backend',
    ]));
    const mdTasks = [mdTask({ id: 'US-06-TASK-BE-01' }), mdTask({ id: 'US-06-TASK-BE-02' })];
    expect(() => mapPhases(rows, mdTasks)).toThrow(/inconsistent depends_on/);
  });

  test('throws PLAN_PARSE_ERROR listing task IDs present in CSV but missing from MD', () => {
    const rows = parseCSV(buildCsv([
      'INFRA|Shared infra|chore(FTR-999): setup||INFRA-TASK-BE-01|Task one|BE|developer-backend',
      'INFRA|Shared infra|chore(FTR-999): setup||INFRA-TASK-BE-02|Task two|BE|developer-backend',
    ]));
    const mdTasks = [mdTask({ id: 'INFRA-TASK-BE-01' })];
    expect(() => mapPhases(rows, mdTasks)).toThrow(/present in CSV but missing from MD: INFRA-TASK-BE-02/);
  });

  test('throws PLAN_PARSE_ERROR listing task IDs present in MD but missing from CSV', () => {
    const rows = parseCSV(buildCsv([
      'INFRA|Shared infra|chore(FTR-999): setup||INFRA-TASK-BE-01|Task one|BE|developer-backend',
    ]));
    const mdTasks = [mdTask({ id: 'INFRA-TASK-BE-01' }), mdTask({ id: 'INFRA-TASK-BE-02' })];
    expect(() => mapPhases(rows, mdTasks)).toThrow(/present in MD but missing from CSV: INFRA-TASK-BE-02/);
    try {
      mapPhases(rows, mdTasks);
      throw new Error('expected mapPhases to throw');
    } catch (err) {
      expect(err.code).toBe('PLAN_PARSE_ERROR');
    }
  });
});

describe('parseCSV() + mapPhases() — real FTR-018-Work-Breakdown.csv and .md', () => {
  let rows;
  let mdTasks;

  beforeAll(() => {
    const csv = fs.readFileSync(REAL_CSV_PATH, 'utf8');
    const markdown = fs.readFileSync(REAL_MD_PATH, 'utf8');
    rows = parseCSV(csv);
    mdTasks = parseMarkdown(markdown);
  });

  test('parses every row of the real CSV with no field-count errors', () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row)).toEqual([
        'phaseId', 'phaseTitle', 'commitMessage', 'dependsOn',
        'taskId', 'taskTitle', 'domain', 'agentType',
      ]);
    }
  });

  test('maps the real CSV phases and reconciles cleanly against the real MD (46 tasks)', () => {
    const result = mapPhases(rows, mdTasks);
    expect(result.tasks).toHaveLength(46);
    expect(rows.length).toBe(46);

    const infraPhase = result.phases.find(p => p.id === 'INFRA');
    expect(infraPhase.dependsOn).toEqual([]);
    expect(infraPhase.taskIds).toEqual(['INFRA-TASK-BE-01', 'INFRA-TASK-BE-02', 'INFRA-TASK-BE-03']);

    const us06Phase = result.phases.find(p => p.id === 'US-06');
    expect(us06Phase.dependsOn).toEqual(['INFRA', 'US-01', 'US-05']);

    const task = result.tasks.find(t => t.id === 'US-01-TASK-BE-02');
    expect(task.phaseId).toBe('US-01');
    expect(task.title).toBe('Implement CSV parser and phase-task mapping');
  });

  test('every task in mapPhases() output carries a phaseId resolved from the CSV', () => {
    const result = mapPhases(rows, mdTasks);
    for (const task of result.tasks) {
      expect(typeof task.phaseId).toBe('string');
      expect(task.phaseId.length).toBeGreaterThan(0);
    }
  });
});
