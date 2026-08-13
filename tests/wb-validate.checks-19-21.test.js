'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const VALIDATE = path.resolve(__dirname, '../wb-validate.js');
const FIXTURES = path.resolve(__dirname, 'fixtures');
const AC_FIXTURE = path.join(FIXTURES, 'ac-table-format.md');

function runValidator(wbPath, reqPath) {
  const args = [VALIDATE, wbPath];
  if (reqPath) args.push(reqPath);
  const result = spawnSync('node', args, { encoding: 'utf8' });
  let report = null;
  try { report = JSON.parse(result.stdout); } catch (_) {}
  return { exitCode: result.status, report, stderr: result.stderr };
}

// ── Shared temp-file lifecycle ─────────────────────────────────────────────────

let tmpFile, tmpReqFile;

beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `wb-t20-${Date.now()}.json`);
});

afterEach(() => {
  try { fs.unlinkSync(tmpFile); } catch (_) {}
  if (tmpReqFile) { try { fs.unlinkSync(tmpReqFile); } catch (_) {} tmpReqFile = null; }
});

// ── Domain builders ────────────────────────────────────────────────────────────

function makeTask(id, acIds = [], dependsOn = []) {
  return {
    id,
    title: `Task ${id}`,
    outcome: 'Done',
    domain: 'BE',
    agentType: 'developer-backend',
    dependsOn,
    acceptanceCriteria: acIds,
    verification: { commands: ['node --version'] },
    estimate: { agentMinutes: 10, tokens: 5000 },
    outputCount: 1,
    groupingRationale: 'Single',
    commit: { subject: `feat: ${id}` },
  };
}

function makePhase(id, tasks) {
  return { id, type: 'user-story', title: `Phase ${id}`, commit: `feat(${id}): done`, tasks };
}

function makeWB(phases) { return { schemaVersion: 2, phases }; }

function writeWB(obj) { fs.writeFileSync(tmpFile, JSON.stringify(obj, null, 2)); return tmpFile; }

// ── Requirements fixture builder ───────────────────────────────────────────────
// Generates a minimal requirements Markdown file the AC parser can consume.
//
// ucPriorities  — { 'UC-01': 'Must', 'UC-02': 'Should', ... }
// acRows        — [['AC-01', 'UC-01'], ['AC-02', 'All UCs'], ...]
//
// The resulting string matches the parser's expectations:
//   • ### UC-NN: … heading followed by a | Priority | <value> | row
//   • ## 7. Acceptance Criteria section with a | ID | Criterion | Related UC | table

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

// ─────────────────────────────────────────────────────────────────────────────
// The AC fixture (ac-table-format.md) defines:
//   UC-01 (Must), UC-02 (Should)
//   AC-01: UC-01   → priority Must,  allowedUserStories: ['US-01']
//   AC-02: UC-01   → priority Must,  allowedUserStories: ['US-01']
//   AC-03: UC-01, UC-02 → priority Must (strongest), allowedUserStories: ['US-01','US-02']
//   AC-04: UC-02   → priority Should, allowedUserStories: ['US-02']
//   AC-05: All UCs → priority Must (strongest overall), unscoped: true
// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — check 19 — AC existence (ac_not_found)', () => {

  // ── Test A: all referenced AC IDs exist in the fixture ───────────────────────

  test('exits 0 and report contains no ac_not_found errors when all referenced ACs exist in the requirements table', () => {
    // Arrange — cover all four Must-priority ACs from the fixture so check 21 also passes:
    //   AC-01 (Must, US-01), AC-02 (Must, US-01), AC-03 (Must, US-01+US-02), AC-05 (Must, unscoped)
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', ['AC-01', 'AC-02', 'AC-03', 'AC-05'])]),
    ]);
    writeWB(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile, AC_FIXTURE);

    // Assert
    expect(exitCode).toBe(0);
    expect(report.errors.filter(e => e.category === 'ac_not_found')).toHaveLength(0);
  });

  // ── Test B: referenced AC ID is absent from the requirements table ─────────────

  test('exits 1 and report.errors contains ac_not_found with details.acId "AC-99" when task references an AC that does not exist in the requirements table', () => {
    // Arrange — AC-99 does not appear in the fixture
    const wb = makeWB([makePhase('US-01', [makeTask('US-01-TASK-BE-01', ['AC-99'])])]);
    writeWB(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile, AC_FIXTURE);

    // Assert
    expect(exitCode).toBe(1);
    const error = report.errors.find(
      e => e.category === 'ac_not_found' && e.details.acId === 'AC-99'
    );
    expect(error).toBeDefined();
    expect(error.details.acId).toBe('AC-99');
  });

  // ── Test C: empty acceptanceCriteria — no ac_not_found is raised ──────────────

  test('exits 0 and report contains no ac_not_found errors when acceptanceCriteria is an empty array and requirements has no Must-priority ACs', () => {
    // Arrange — custom req with a single Should-priority AC so check 21 does not block
    tmpReqFile = path.join(os.tmpdir(), `req-t20-${Date.now()}.md`);
    fs.writeFileSync(tmpReqFile, makeReqMd({ 'UC-01': 'Should' }, [['AC-01', 'UC-01']]));
    const wb = makeWB([makePhase('US-01', [makeTask('US-01-TASK-BE-01', [])])]);
    writeWB(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile, tmpReqFile);

    // Assert
    expect(exitCode).toBe(0);
    expect(report.errors.filter(e => e.category === 'ac_not_found')).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — check 20 — AC scope validation (ac_wrong_us)', () => {

  // ── Test A: AC referenced by the correct phase ────────────────────────────────

  test('exits 0 and report contains no ac_wrong_us errors when AC scoped to UC-01 is referenced by a task in the US-01 phase', () => {
    // Arrange — custom req: one Must AC scoped to UC-01; task is in the matching US-01 phase
    tmpReqFile = path.join(os.tmpdir(), `req-t20-${Date.now()}.md`);
    fs.writeFileSync(tmpReqFile, makeReqMd({ 'UC-01': 'Must' }, [['AC-01', 'UC-01']]));
    const wb = makeWB([makePhase('US-01', [makeTask('US-01-TASK-BE-01', ['AC-01'])])]);
    writeWB(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile, tmpReqFile);

    // Assert
    expect(exitCode).toBe(0);
    expect(report.errors.filter(e => e.category === 'ac_wrong_us')).toHaveLength(0);
  });

  // ── Test B: AC referenced by the wrong phase ──────────────────────────────────

  test('exits 1 and report.errors contains ac_wrong_us when AC scoped to UC-01 is referenced by a task in the US-02 phase', () => {
    // Arrange — custom req: UC-01 (Must), UC-02 (Should), AC-01 scoped to UC-01 → allowedUserStories: ['US-01']
    // The task is in US-02; AC-01 IS referenced so check 21 (must_ac_uncovered) does not fire,
    // but the scope check (check 20) reports ac_wrong_us
    tmpReqFile = path.join(os.tmpdir(), `req-t20-${Date.now()}.md`);
    fs.writeFileSync(tmpReqFile, makeReqMd({ 'UC-01': 'Must', 'UC-02': 'Should' }, [['AC-01', 'UC-01']]));
    const wb = makeWB([makePhase('US-02', [makeTask('US-02-TASK-BE-01', ['AC-01'])])]);
    writeWB(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile, tmpReqFile);

    // Assert
    expect(exitCode).toBe(1);
    const error = report.errors.find(e => e.category === 'ac_wrong_us');
    expect(error).toBeDefined();
  });

  // ── Test C: unscoped AC (All UCs) — no ac_wrong_us regardless of phase ────────

  test('exits 0 and report contains no ac_wrong_us errors when an unscoped AC (All UCs) is referenced by a task in any phase', () => {
    // Arrange — custom req: UC-01 (Must), UC-02 (Should), AC-01 scoped to "All UCs"
    // (unscoped = true, priority Must as strongest of Must+Should).
    // Task is in US-02; unscoped ACs are never flagged for wrong phase.
    // AC-01 is referenced → check 21 passes.
    tmpReqFile = path.join(os.tmpdir(), `req-t20-${Date.now()}.md`);
    fs.writeFileSync(tmpReqFile, makeReqMd({ 'UC-01': 'Must', 'UC-02': 'Should' }, [['AC-01', 'All UCs']]));
    const wb = makeWB([makePhase('US-02', [makeTask('US-02-TASK-BE-01', ['AC-01'])])]);
    writeWB(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile, tmpReqFile);

    // Assert
    expect(exitCode).toBe(0);
    expect(report.errors.filter(e => e.category === 'ac_wrong_us')).toHaveLength(0);
  });

  // ── Test D: multi-UC AC referenced by one of its allowed phases ───────────────

  test('exits 0 and report contains no ac_wrong_us errors when a multi-UC AC scoped to UC-01 and UC-02 is referenced by a task in the US-02 phase', () => {
    // Arrange — custom req: UC-01 (Must), UC-02 (Should), AC-01 scoped to "UC-01, UC-02"
    // → allowedUserStories: ['US-01', 'US-02'], priority Must (strongest of Must+Should).
    // Task is in US-02, which is in allowedUserStories → scope is valid.
    // AC-01 is referenced → check 21 passes.
    tmpReqFile = path.join(os.tmpdir(), `req-t20-${Date.now()}.md`);
    fs.writeFileSync(tmpReqFile, makeReqMd({ 'UC-01': 'Must', 'UC-02': 'Should' }, [['AC-01', 'UC-01, UC-02']]));
    const wb = makeWB([makePhase('US-02', [makeTask('US-02-TASK-BE-01', ['AC-01'])])]);
    writeWB(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile, tmpReqFile);

    // Assert
    expect(exitCode).toBe(0);
    expect(report.errors.filter(e => e.category === 'ac_wrong_us')).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — check 21 — Must AC coverage (must_ac_uncovered)', () => {

  // ── Test A: Must AC is covered by a task ──────────────────────────────────────

  test('exits 0 and report contains no must_ac_uncovered errors when every Must-priority AC is referenced by at least one task', () => {
    // Arrange — custom req: UC-01 (Must), AC-01 (Must). Task references AC-01.
    tmpReqFile = path.join(os.tmpdir(), `req-t20-${Date.now()}.md`);
    fs.writeFileSync(tmpReqFile, makeReqMd({ 'UC-01': 'Must' }, [['AC-01', 'UC-01']]));
    const wb = makeWB([makePhase('US-01', [makeTask('US-01-TASK-BE-01', ['AC-01'])])]);
    writeWB(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile, tmpReqFile);

    // Assert
    expect(exitCode).toBe(0);
    expect(report.errors.filter(e => e.category === 'must_ac_uncovered')).toHaveLength(0);
  });

  // ── Test B: Must AC is not covered by any task ────────────────────────────────

  test('exits 1 and report.errors contains must_ac_uncovered with details.acId "AC-01" when a Must-priority AC is not referenced by any task', () => {
    // Arrange — custom req: UC-01 (Must), AC-01 (Must). Task has empty acceptanceCriteria.
    tmpReqFile = path.join(os.tmpdir(), `req-t20-${Date.now()}.md`);
    fs.writeFileSync(tmpReqFile, makeReqMd({ 'UC-01': 'Must' }, [['AC-01', 'UC-01']]));
    const wb = makeWB([makePhase('US-01', [makeTask('US-01-TASK-BE-01', [])])]);
    writeWB(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile, tmpReqFile);

    // Assert
    expect(exitCode).toBe(1);
    const error = report.errors.find(e => e.category === 'must_ac_uncovered');
    expect(error).toBeDefined();
    expect(error.details.acId).toBe('AC-01');
  });

  // ── Test C: AC checks skipped entirely when no requirements path is given ──────

  test('exits 0 and report contains no AC-related errors when validator is invoked without a requirements path argument', () => {
    // Arrange — WB with a task referencing a fake AC ID (AC-99).
    // Without a requirements path, all three AC checks (19, 20, 21) are skipped.
    const wb = makeWB([makePhase('US-01', [makeTask('US-01-TASK-BE-01', ['AC-99'])])]);
    writeWB(wb);

    // Act — no second argument; requirementsPath is undefined → acMap is null → checks skipped
    const { exitCode, report } = runValidator(tmpFile);

    // Assert
    expect(exitCode).toBe(0);
    const acErrors = report.errors.filter(e =>
      e.category === 'ac_not_found' ||
      e.category === 'ac_wrong_us' ||
      e.category === 'must_ac_uncovered'
    );
    expect(acErrors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I5 contract-pinning — parseAcTable fatal errors must use exit 2 (not exit 1)
//
// Exit 1 means "validation completed, JSON report on stdout".
// Exit 2 means "fatal/parse error, no JSON on stdout (stderr only)".
//
// Before fix: two parseAcTable paths used exit(1) without emitting a JSON
// report — pm-phase2 would see empty stdout and throw "wb-validate returned
// empty stdout" masking the real cause. Fixed to exit(2).
// ─────────────────────────────────────────────────────────────────────────────

describe('wb-validate.js — parseAcTable fatal errors exit with code 2 and no JSON on stdout (I5)', () => {

  function writeTmpReq(content) {
    tmpReqFile = path.join(os.tmpdir(), `req-i5-${Date.now()}.md`);
    fs.writeFileSync(tmpReqFile, content);
    return tmpReqFile;
  }

  test('exits 2 and emits only stderr (no JSON on stdout) when AC row references a UC that does not exist in the requirements', () => {
    // Arrange: requirements declares UC-01 but AC-01 references UC-02 (missing)
    const reqContent = makeReqMd(
      { 'UC-01': 'Must' },
      [['AC-01', 'UC-02']],   // UC-02 not declared → parseAcTable exit(1) before fix, exit(2) after
    );
    writeTmpReq(reqContent);
    const wb = makeWB([makePhase('US-01', [makeTask('US-01-TASK-BE-01', ['AC-01'])])]);
    writeWB(wb);

    // Act
    const result = spawnSync('node', [VALIDATE, tmpFile, tmpReqFile], { encoding: 'utf8' });

    // Assert: exit 2 = fatal/parse error; stdout must NOT be parseable JSON
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/does not exist/i);
    let parsed = null;
    try { parsed = JSON.parse(result.stdout); } catch (_) {}
    expect(parsed).toBeNull();
  });

  test('exits 2 and emits only stderr (no JSON on stdout) when a UC heading exists but has no Priority row (parser never adds it to the map, so the "does not exist" guard fires)', () => {
    // Arrange: UC-01 heading exists but no "| Priority | ... |" metadata row.
    // ucPriorityMap never adds UC-01 → !has(ucRef) → exit 2, "does not exist".
    // Note: the !get(ucRef) ("no declared priority") guard is structurally unreachable
    // by construction — the parser only adds a UC to the map when it finds a non-empty
    // priority value via \S+ regex, so has(ucRef) being true implies get(ucRef) is truthy.
    // Both exit(1)→exit(2) fixes are correctness guards; this test verifies that the
    // "missing priority" scenario always resolves through exit 2 in practice.
    const reqContent =
      '## 5. Use Cases\n\n' +
      '### UC-01: Description\n| Field | Value |\n|-------|-------|\n| Other | x |\n\n' +
      '## 7. Acceptance Criteria\n\n' +
      '| ID | Criterion | Related UC |\n|----|-----------|------------|\n' +
      '| AC-01 | A criterion | UC-01 |\n';
    writeTmpReq(reqContent);
    const wb = makeWB([makePhase('US-01', [makeTask('US-01-TASK-BE-01', ['AC-01'])])]);
    writeWB(wb);

    // Act
    const result = spawnSync('node', [VALIDATE, tmpFile, tmpReqFile], { encoding: 'utf8' });

    // Assert: exit 2 = fatal/parse error; stdout must NOT be parseable JSON
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/does not exist/i);
    let parsed = null;
    try { parsed = JSON.parse(result.stdout); } catch (_) {}
    expect(parsed).toBeNull();
  });
});
