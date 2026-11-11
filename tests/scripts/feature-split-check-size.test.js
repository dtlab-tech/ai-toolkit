'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'src', 'claude', 'scripts', 'feature-split.js');
const PREFIX = 'FTR-900';
const FEATURE_NAME = 'FTR-900-fixture';
const tempRoots = [];

function makeProject(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-size-'));
  tempRoots.push(root);
  // Override file at the project root. Values are test-only, not defaults.
  fs.writeFileSync(path.join(root, 'feature-split.config.json'),
    JSON.stringify({ thresholds: { useCases: 10, acceptanceCriteria: 20, components: 10, estimatedPhases: 5 } }));
  const feature = path.join(root, 'internal_docs', 'features', FEATURE_NAME);
  fs.mkdirSync(feature, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(feature, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return { root, feature };
}

function runCheck(root, feature) {
  try {
    const stdout = execFileSync(process.execPath,
      [SCRIPT, '--project', root, 'check-size', '--feature-dir', feature, '--prefix', PREFIX],
      { encoding: 'utf8' });
    return { result: JSON.parse(stdout), code: 0 };
  } catch (err) {
    return { result: JSON.parse(err.stdout), code: err.status };
  }
}

afterEach(() => {
  for (const dir of tempRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('check-size: a feature that is not new is skipped', () => {
  test.each([
    ['FTR-900-Approvals.md exists', { 'FTR-900-Approvals.md': '# approvals' }],
    ['wbs/ directory exists', { 'wbs/.gitkeep': '' }],
    ['epic.md exists', { 'epic.md': '# epic' }],
  ])('reports status skipped with exit code 0 when %s', (_label, files) => {
    const { root, feature } = makeProject(files);
    const { result, code } = runCheck(root, feature);
    expect(code).toBe(0);
    expect(result.status).toBe('skipped');
    expect(result.counts).toEqual({});
  });
});

describe('check-size: a feature folder that does not exist is new', () => {
  test('measures counts instead of reporting skipped', () => {
    const { root } = makeProject({});
    const missing = path.join(root, 'internal_docs', 'features', 'FTR-900-missing');
    const { result } = runCheck(root, missing);
    expect(result.status).not.toBe('skipped');
    expect(result.unavailable.map(u => u.count)).toContain('useCases');
  });
});

describe('check-size: useCases counts distinct UC-NN identifiers', () => {
  test('counts a UC listed in two files once and ignores text that is not UC-NN', () => {
    const { root, feature } = makeProject({
      'req/use-cases/UC-01-login.md': '# UC-01 Login\nSee UC-02 for logout.\n',
      'req/use-cases/UC-02-logout.md': '# UC-02 Logout\nRelated: UC-03. Ignore UC-1 and ABC-07.\n',
      'req/use-cases/UC-03-reset.md': '# UC-03 Reset\n',
    });
    const { result } = runCheck(root, feature);
    expect(result.counts.useCases).toBe(3);
  });
});

describe('check-size: acceptanceCriteria counts distinct AC-NN identifiers in req/index.md', () => {
  test('counts a repeated AC row once', () => {
    const { root, feature } = makeProject({
      'req/index.md': [
        '| ID | Criterion |',
        '| --- | --- |',
        '| AC-01 | First |',
        '| AC-02 | Second |',
        '| AC-01 | First, repeated |',
        '',
      ].join('\n'),
    });
    const { result } = runCheck(root, feature);
    expect(result.counts.acceptanceCriteria).toBe(2);
  });
});
