'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SKELETON_CHECK = path.resolve(__dirname, '../src/claude/scripts/wb-skeleton-check.js');
const FIXTURES = path.resolve(__dirname, 'fixtures');
const VALID_INDEX = path.join(FIXTURES, 'ftr-020-wbs', 'index.json');

function run(indexPath, requirementsPath) {
  const args = [SKELETON_CHECK, indexPath];
  if (requirementsPath) args.push(requirementsPath);
  const result = spawnSync('node', args, { encoding: 'utf8' });
  let report = null;
  try { report = JSON.parse(result.stdout); } catch (_) {}
  return { exitCode: result.status, report, stderr: result.stderr };
}

function writeTmpIndex(index) {
  const tmpFile = path.join(os.tmpdir(), `wb-skeleton-check-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(index));
  return tmpFile;
}

// Minimal Requirements fixture the real parseAcTable() can consume — same convention as
// tests/wb-graph-checks.test.js's makeReqMd/writeReq.
function writeTmpRequirements(ucPriorities, acRows) {
  const ucSections = Object.entries(ucPriorities)
    .map(([ucId, pri]) => `### ${ucId}: Description\n| Field | Value |\n|-------|-------|\n| Priority | ${pri} |\n`)
    .join('\n');
  const acTable = '| ID | Criterion | Related UC |\n|----|-----------|------------|\n' +
    acRows.map(([id, relUc]) => `| ${id} | A criterion | ${relUc} |`).join('\n');
  const content = `## 5. Use Cases\n\n${ucSections}\n## 7. Acceptance Criteria\n\n${acTable}\n`;
  const tmpFile = path.join(os.tmpdir(), `wb-skeleton-check-req-${Date.now()}-${Math.random()}.md`);
  fs.writeFileSync(tmpFile, content);
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

  // FTR-025: wb-skeleton-check.js's own phase projection (built independently from
  // wbs-assembler.js's, since this script runs pre-assembly against the raw skeleton) was
  // silently dropping sourceUC — the exact bug wbs-assembler.js had (fixed fab14cb), just never
  // caught here because no prior test exercised a phase whose sourceUC genuinely diverges from
  // its own ID, and no prior test here even passed a requirementsPath (so checkAcCoverage's
  // checks were never reached at all).
  test('passes when a phase\'s sourceUC includes an AC\'s related UC, even though the phase ID does not numerically match it', () => {
    const reqPath = writeTmpRequirements({ 'UC-02': 'Must', 'UC-03': 'Should' }, [['AC-01', 'UC-03']]);
    const index = {
      schemaVersion: 3,
      feature: 'X',
      // Phase "US-04" legitimately realizes UC-02 and UC-03 (its own sourceUC says so) — the
      // naive id-matching rule would have required a phase literally named "US-03" instead.
      phases: [{ id: 'US-04', type: 'user-story', sourceUC: ['UC-02', 'UC-03'], detailFile: 'user-stories/US-04.md', taskIds: ['US-04-TASK-BE-01'] }],
      tasks: {
        'US-04-TASK-BE-01': { title: 't1', outcome: 'o1', domain: 'BE', agentType: 'developer-backend', dependsOn: [], acceptanceCriteria: ['AC-01'], estimate: { agentMinutes: 5, tokens: 1000 }, outputCount: 1, commit: { type: 'feat', subject: 's1' } },
      },
    };
    const tmpFile = writeTmpIndex(index);
    try {
      const { exitCode, report } = run(tmpFile, reqPath);
      expect(exitCode).toBe(0);
      expect(report.errors.some(e => e.category === 'ac_wrong_us')).toBe(false);
    } finally {
      fs.unlinkSync(tmpFile);
      fs.unlinkSync(reqPath);
    }
  });
});
