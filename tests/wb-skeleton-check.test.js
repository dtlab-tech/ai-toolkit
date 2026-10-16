'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SKELETON_CHECK = path.resolve(__dirname, '../src/claude/scripts/wb-skeleton-check.js');
const FIXTURES = path.resolve(__dirname, 'fixtures');
const VALID_INDEX = path.join(FIXTURES, 'ftr-020-wbs', 'index.json');

function run(indexPath) {
  const result = spawnSync('node', [SKELETON_CHECK, indexPath], { encoding: 'utf8' });
  let report = null;
  try { report = JSON.parse(result.stdout); } catch (_) {}
  return { exitCode: result.status, report, stderr: result.stderr };
}

function writeTmpIndex(index) {
  const tmpFile = path.join(os.tmpdir(), `wb-skeleton-check-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(index));
  return tmpFile;
}

describe('wb-skeleton-check.js', () => {
  test('exits 0 and valid:true for the real FTR-020 skeleton fixture', () => {
    const { exitCode, report } = run(VALID_INDEX);
    expect(exitCode).toBe(0);
    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  test('exits 2 when schemaVersion is not 3', () => {
    const index = JSON.parse(fs.readFileSync(VALID_INDEX, 'utf8'));
    index.schemaVersion = 2;
    const tmpFile = writeTmpIndex(index);
    try {
      const result = spawnSync('node', [SKELETON_CHECK, tmpFile], { encoding: 'utf8' });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/schemaVersion/);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('flags a dependency cycle between two skeleton tasks', () => {
    const index = {
      schemaVersion: 3,
      feature: 'X',
      phases: [{ id: 'US-01', type: 'user-story', sourceUC: ['UC-01'], detailFile: 'user-stories/US-01.md', taskIds: ['US-01-TASK-BE-01', 'US-01-TASK-BE-02'] }],
      tasks: {
        'US-01-TASK-BE-01': { title: 't1', outcome: 'o1', domain: 'BE', agentType: 'developer-backend', dependsOn: ['US-01-TASK-BE-02'], acceptanceCriteria: [], estimate: { agentMinutes: 5, tokens: 1000 }, outputCount: 1, commit: { type: 'feat', subject: 's1' } },
        'US-01-TASK-BE-02': { title: 't2', outcome: 'o2', domain: 'BE', agentType: 'developer-backend', dependsOn: ['US-01-TASK-BE-01'], acceptanceCriteria: [], estimate: { agentMinutes: 5, tokens: 1000 }, outputCount: 1, commit: { type: 'feat', subject: 's2' } },
      },
    };
    const tmpFile = writeTmpIndex(index);
    try {
      const { exitCode, report } = run(tmpFile);
      expect(exitCode).toBe(1);
      expect(report.errors.some(e => e.category === 'task_cycle_detected')).toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('flags a phase with an empty taskIds array', () => {
    const index = {
      schemaVersion: 3,
      feature: 'X',
      phases: [{ id: 'US-01', type: 'user-story', sourceUC: ['UC-01'], detailFile: 'user-stories/US-01.md', taskIds: [] }],
      tasks: {},
    };
    const tmpFile = writeTmpIndex(index);
    try {
      const { exitCode, report } = run(tmpFile);
      expect(exitCode).toBe(1);
      expect(report.errors.some(e => e.category === 'empty_phase')).toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  test('flags an invalid domain value in a skeleton task', () => {
    const index = {
      schemaVersion: 3,
      feature: 'X',
      phases: [{ id: 'US-01', type: 'user-story', sourceUC: ['UC-01'], detailFile: 'user-stories/US-01.md', taskIds: ['US-01-TASK-BE-01'] }],
      tasks: {
        'US-01-TASK-BE-01': { title: 't1', outcome: 'o1', domain: 'BACKEND', agentType: 'developer-backend', dependsOn: [], acceptanceCriteria: [], estimate: { agentMinutes: 5, tokens: 1000 }, outputCount: 1, commit: { type: 'feat', subject: 's1' } },
      },
    };
    const tmpFile = writeTmpIndex(index);
    try {
      const { exitCode, report } = run(tmpFile);
      expect(exitCode).toBe(1);
      expect(report.errors.some(e => e.category === 'invalid_domain')).toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
