'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ERRORS,
  parseAcTable,
  checkUniqueTaskIds,
  checkTaskIdFormat,
  checkDomainWhitelist,
  checkAgentTypeWhitelist,
  checkDependencyExistence,
  checkSelfDependency,
  checkPhaseIdConsistency,
  checkTaskCycle,
  checkPhaseDependencyAndCycle,
  checkPhaseSchedulability,
  checkAcCoverage,
} = require('../src/claude/scripts/wb-graph-checks');

// ── Domain builders (same convention as tests/wb-validate.checks-*.test.js) ───

function makeTask(id, overrides = {}) {
  return {
    id,
    title: `Task ${id}`,
    outcome: 'Done',
    domain: 'BE',
    agentType: 'developer-backend',
    dependsOn: [],
    acceptanceCriteria: [],
    verification: { commands: ['node --version'] },
    estimate: { agentMinutes: 10, tokens: 5000 },
    outputCount: 1,
    groupingRationale: 'Single',
    commit: { subject: `feat: ${id}` },
    ...overrides,
  };
}

function makePhase(id, tasks, type = 'user-story') {
  return { id, type, title: `Phase ${id}`, commit: { subject: `${id} done` }, tasks };
}

function makeReqMd(ucPriorities, acRows) {
  const ucSections = Object.entries(ucPriorities)
    .map(([ucId, pri]) =>
      `### ${ucId}: Description\n| Field | Value |\n|-------|-------|\n| Priority | ${pri} |\n`
    )
    .join('\n');
  const acTable =
    '| ID | Criterion | Related UC |\n|----|-----------|------------|\n' +
    acRows.map(([id, relUc]) => `| ${id} | A criterion | ${relUc} |`).join('\n');
  return `## 5. Use Cases\n\n${ucSections}\n## 7. Acceptance Criteria\n\n${acTable}\n`;
}

let tmpReqFile;
afterEach(() => {
  if (tmpReqFile) { try { fs.unlinkSync(tmpReqFile); } catch (_) {} tmpReqFile = null; }
});

function writeReq(content) {
  tmpReqFile = path.join(os.tmpdir(), `wb-graph-checks-req-${Date.now()}-${Math.random()}.md`);
  fs.writeFileSync(tmpReqFile, content);
  return tmpReqFile;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('checkUniqueTaskIds()', () => {
  test('passes when all task IDs are unique across phases', () => {
    const { errors } = checkUniqueTaskIds({ phases: [
      makePhase('INFRA', [makeTask('INFRA-TASK-BE-01')], 'infrastructure'),
      makePhase('US-01', [makeTask('US-01-TASK-BE-01')]),
    ] });
    expect(errors).toHaveLength(0);
  });

  test('flags a task ID that appears in two phases', () => {
    const { errors, seenTaskIds } = checkUniqueTaskIds({ phases: [
      makePhase('INFRA', [makeTask('DUP-ID')], 'infrastructure'),
      makePhase('US-01', [makeTask('DUP-ID')]),
    ] });
    expect(errors).toHaveLength(1);
    expect(errors[0].category).toBe(ERRORS.UNIQUE_ID_VIOLATION);
    expect(seenTaskIds.get('DUP-ID')).toBe('INFRA');
  });
});

describe('checkTaskIdFormat()', () => {
  test('passes for a well-formed US-prefixed task ID in a user-story phase', () => {
    const { errors } = checkTaskIdFormat({ phases: [makePhase('US-01', [makeTask('US-01-TASK-BE-01')])] });
    expect(errors).toHaveLength(0);
  });

  test('flags a task ID that does not match the expected pattern', () => {
    const { errors } = checkTaskIdFormat({ phases: [makePhase('US-01', [makeTask('BAD-FORMAT')])] });
    expect(errors).toHaveLength(1);
    expect(errors[0].category).toBe(ERRORS.INVALID_ID_FORMAT);
  });

  test('requires the INFRA-prefixed pattern for an infrastructure phase', () => {
    const { errors } = checkTaskIdFormat({ phases: [
      makePhase('INFRA', [makeTask('INFRA-TASK-BE-01')], 'infrastructure'),
    ] });
    expect(errors).toHaveLength(0);
  });
});

describe('checkDomainWhitelist()', () => {
  test('passes for a valid domain', () => {
    const { errors } = checkDomainWhitelist({ phases: [makePhase('US-01', [makeTask('US-01-TASK-BE-01', { domain: 'BE' })])] });
    expect(errors).toHaveLength(0);
  });

  test('flags an unrecognised domain value', () => {
    const { errors } = checkDomainWhitelist({ phases: [makePhase('US-01', [makeTask('US-01-TASK-BE-01', { domain: 'BACKEND' })])] });
    expect(errors).toHaveLength(1);
    expect(errors[0].category).toBe(ERRORS.INVALID_DOMAIN);
  });
});

describe('checkAgentTypeWhitelist()', () => {
  test('passes for a valid agentType', () => {
    const { errors } = checkAgentTypeWhitelist({ phases: [makePhase('US-01', [makeTask('US-01-TASK-BE-01')])] });
    expect(errors).toHaveLength(0);
  });

  test('flags an unrecognised agentType value', () => {
    const { errors } = checkAgentTypeWhitelist({ phases: [makePhase('US-01', [makeTask('US-01-TASK-BE-01', { agentType: 'unknown-agent' })])] });
    expect(errors).toHaveLength(1);
    expect(errors[0].category).toBe(ERRORS.INVALID_AGENT_TYPE);
  });
});

describe('checkDependencyExistence()', () => {
  test('passes when dependsOn references an existing task ID', () => {
    const phases = [makePhase('US-01', [
      makeTask('US-01-TASK-BE-01'),
      makeTask('US-01-TASK-BE-02', { dependsOn: ['US-01-TASK-BE-01'] }),
    ])];
    const { errors } = checkDependencyExistence({ phases }, new Set(['US-01-TASK-BE-01', 'US-01-TASK-BE-02']));
    expect(errors).toHaveLength(0);
  });

  test('flags a dependsOn reference to a non-existent task ID', () => {
    const phases = [makePhase('US-01', [makeTask('US-01-TASK-BE-01', { dependsOn: ['GHOST-TASK'] })])];
    const { errors } = checkDependencyExistence({ phases }, new Set(['US-01-TASK-BE-01']));
    expect(errors).toHaveLength(1);
    expect(errors[0].category).toBe(ERRORS.DEPENDENCY_NOT_FOUND);
    expect(errors[0].details.missingRef).toBe('GHOST-TASK');
  });
});

describe('checkSelfDependency()', () => {
  test('passes when a task does not depend on itself', () => {
    const { errors } = checkSelfDependency({ phases: [makePhase('US-01', [makeTask('US-01-TASK-BE-01')])] });
    expect(errors).toHaveLength(0);
  });

  test('flags a task that lists itself in dependsOn', () => {
    const { errors } = checkSelfDependency({ phases: [
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', { dependsOn: ['US-01-TASK-BE-01'] })]),
    ] });
    expect(errors).toHaveLength(1);
    expect(errors[0].category).toBe(ERRORS.SELF_DEPENDENCY);
  });
});

describe('checkPhaseIdConsistency()', () => {
  test('passes when an INFRA-prefixed task lives in the INFRA phase', () => {
    const { errors } = checkPhaseIdConsistency({ phases: [
      makePhase('INFRA', [makeTask('INFRA-TASK-BE-01')], 'infrastructure'),
    ] });
    expect(errors).toHaveLength(0);
  });

  test('flags an INFRA-prefixed task placed outside the INFRA phase', () => {
    const { errors } = checkPhaseIdConsistency({ phases: [
      makePhase('US-01', [makeTask('INFRA-TASK-BE-01')]),
    ] });
    expect(errors).toHaveLength(1);
    expect(errors[0].category).toBe(ERRORS.PHASE_ID_MISMATCH);
  });

  test('flags a task whose US-prefix does not match its containing phase', () => {
    const { errors } = checkPhaseIdConsistency({ phases: [
      makePhase('US-02', [makeTask('US-01-TASK-BE-01')]),
    ] });
    expect(errors).toHaveLength(1);
    expect(errors[0].category).toBe(ERRORS.PHASE_ID_MISMATCH);
  });
});

describe('checkTaskCycle()', () => {
  test('passes for an acyclic dependency graph and returns taskGraph', () => {
    const phases = [makePhase('US-01', [
      makeTask('US-01-TASK-BE-01'),
      makeTask('US-01-TASK-BE-02', { dependsOn: ['US-01-TASK-BE-01'] }),
    ])];
    const allTaskIds = new Set(['US-01-TASK-BE-01', 'US-01-TASK-BE-02']);
    const { errors, taskGraph, taskCycles } = checkTaskCycle({ phases }, allTaskIds);
    expect(errors).toHaveLength(0);
    expect(taskCycles).toHaveLength(0);
    expect(taskGraph['US-01-TASK-BE-02']).toEqual(['US-01-TASK-BE-01']);
  });

  test('detects a dependency cycle between two tasks', () => {
    const phases = [makePhase('US-01', [
      makeTask('US-01-TASK-BE-01', { dependsOn: ['US-01-TASK-BE-02'] }),
      makeTask('US-01-TASK-BE-02', { dependsOn: ['US-01-TASK-BE-01'] }),
    ])];
    const allTaskIds = new Set(['US-01-TASK-BE-01', 'US-01-TASK-BE-02']);
    const { errors, taskCycles } = checkTaskCycle({ phases }, allTaskIds);
    expect(errors).toHaveLength(1);
    expect(errors[0].category).toBe(ERRORS.TASK_CYCLE_DETECTED);
    expect(taskCycles).toHaveLength(1);
  });
});

describe('checkPhaseDependencyAndCycle()', () => {
  test('projects a cross-phase task dependency into phaseGraph with no cycle', () => {
    const phases = [
      makePhase('INFRA', [makeTask('INFRA-TASK-BE-01')], 'infrastructure'),
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', { dependsOn: ['INFRA-TASK-BE-01'] })]),
    ];
    const taskToPhase = new Map([['INFRA-TASK-BE-01', 'INFRA'], ['US-01-TASK-BE-01', 'US-01']]);
    const { errors, phaseGraph, phaseCycles, phaseDepsMap } = checkPhaseDependencyAndCycle({ phases }, taskToPhase);
    expect(errors).toHaveLength(0);
    expect(phaseCycles).toHaveLength(0);
    expect(phaseGraph['US-01']).toEqual(['INFRA']);
    expect(phaseGraph['INFRA']).toEqual([]);
    expect(phaseDepsMap.get('US-01').has('INFRA')).toBe(true);
  });

  test('detects a phase-level dependency cycle', () => {
    const phases = [
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', { dependsOn: ['US-02-TASK-BE-01'] })]),
      makePhase('US-02', [makeTask('US-02-TASK-BE-01', { dependsOn: ['US-01-TASK-BE-01'] })]),
    ];
    const taskToPhase = new Map([['US-01-TASK-BE-01', 'US-01'], ['US-02-TASK-BE-01', 'US-02']]);
    const { errors, phaseCycles } = checkPhaseDependencyAndCycle({ phases }, taskToPhase);
    expect(errors).toHaveLength(1);
    expect(errors[0].category).toBe(ERRORS.PHASE_CYCLE_DETECTED);
    expect(phaseCycles).toHaveLength(1);
  });
});

describe('checkPhaseSchedulability()', () => {
  test('schedules independent phases into the same wave', () => {
    const phases = [makePhase('INFRA', [], 'infrastructure'), makePhase('US-01', [])];
    const phaseDepsMap = new Map([['INFRA', new Set()], ['US-01', new Set()]]);
    const { errors, phaseWaves, phaseUnschedulable } = checkPhaseSchedulability({ phases }, phaseDepsMap);
    expect(errors).toHaveLength(0);
    expect(phaseUnschedulable).toHaveLength(0);
    expect(phaseWaves[0].sort()).toEqual(['INFRA', 'US-01']);
  });

  test('flags phases that form a deadlock as unschedulable', () => {
    const phases = [makePhase('US-01', []), makePhase('US-02', [])];
    const phaseDepsMap = new Map([['US-01', new Set(['US-02'])], ['US-02', new Set(['US-01'])]]);
    const { errors, phaseUnschedulable } = checkPhaseSchedulability({ phases }, phaseDepsMap);
    expect(errors).toHaveLength(2);
    expect(errors.every(e => e.category === ERRORS.PHASE_UNSCHEDULABLE)).toBe(true);
    expect(phaseUnschedulable.sort()).toEqual(['US-01', 'US-02']);
  });
});

describe('checkAcCoverage()', () => {
  test('returns no errors when acMap is null (no requirements path given)', () => {
    const phases = [makePhase('US-01', [makeTask('US-01-TASK-BE-01', { acceptanceCriteria: ['AC-99'] })])];
    const { errors } = checkAcCoverage({ phases }, null, new Map());
    expect(errors).toHaveLength(0);
  });

  test('flags a referenced AC that does not exist in the requirements table (check 19)', () => {
    const reqPath = writeReq(makeReqMd({ 'UC-01': 'Must' }, [['AC-01', 'UC-01']]));
    const acMap = parseAcTable(reqPath);
    const phases = [makePhase('US-01', [makeTask('US-01-TASK-BE-01', { acceptanceCriteria: ['AC-99'] })])];
    const seenTaskIds = new Map([['US-01-TASK-BE-01', 'US-01']]);
    const { errors } = checkAcCoverage({ phases }, acMap, seenTaskIds);
    expect(errors.some(e => e.category === ERRORS.AC_NOT_FOUND)).toBe(true);
  });

  test('flags an AC referenced by a task outside its allowed phase (check 20)', () => {
    const reqPath = writeReq(makeReqMd({ 'UC-01': 'Must', 'UC-02': 'Should' }, [['AC-01', 'UC-01']]));
    const acMap = parseAcTable(reqPath);
    const phases = [makePhase('US-02', [makeTask('US-02-TASK-BE-01', { acceptanceCriteria: ['AC-01'] })])];
    const seenTaskIds = new Map([['US-02-TASK-BE-01', 'US-02']]);
    const { errors } = checkAcCoverage({ phases }, acMap, seenTaskIds);
    expect(errors.some(e => e.category === ERRORS.AC_WRONG_US)).toBe(true);
  });

  test('flags a Must-priority AC that no task covers (check 21)', () => {
    const reqPath = writeReq(makeReqMd({ 'UC-01': 'Must' }, [['AC-01', 'UC-01']]));
    const acMap = parseAcTable(reqPath);
    const phases = [makePhase('US-01', [makeTask('US-01-TASK-BE-01', { acceptanceCriteria: [] })])];
    const seenTaskIds = new Map([['US-01-TASK-BE-01', 'US-01']]);
    const { errors } = checkAcCoverage({ phases }, acMap, seenTaskIds);
    const err = errors.find(e => e.category === ERRORS.MUST_AC_UNCOVERED);
    expect(err).toBeDefined();
    expect(err.details.acId).toBe('AC-01');
  });

  test('passes for a correctly-scoped, fully-covered Must AC', () => {
    const reqPath = writeReq(makeReqMd({ 'UC-01': 'Must' }, [['AC-01', 'UC-01']]));
    const acMap = parseAcTable(reqPath);
    const phases = [makePhase('US-01', [makeTask('US-01-TASK-BE-01', { acceptanceCriteria: ['AC-01'] })])];
    const seenTaskIds = new Map([['US-01-TASK-BE-01', 'US-01']]);
    const { errors } = checkAcCoverage({ phases }, acMap, seenTaskIds);
    expect(errors).toHaveLength(0);
  });
});
