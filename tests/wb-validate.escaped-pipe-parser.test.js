'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Regression: Markdown AC-table parser must treat a backslash-escaped pipe (\|)
// inside a cell as a literal pipe, NOT a column separator.
//
// Root cause (FTR-016 Gate-2 failures): wb-validate split each table row on the
// raw '|' character. A criterion such as
//     `ai-toolkit ledger open\|close\|fail\|skip`
// created phantom columns and shifted the "Related UC" cell, so the validator
// read "close\" as a UC token and exited 2 with
//     malformed UC reference "close\" in AC "AC-03"
//
// Fix: splitTableRow() splits on unescaped pipes only and unescapes \| in-cell.
// These tests pin that behaviour and confirm normal pipe separators still work.
// ─────────────────────────────────────────────────────────────────────────────

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const VALIDATE = path.resolve(__dirname, '../src/claude/scripts/wb-validate.js');

function runValidator(wbPath, reqPath) {
  const args = [VALIDATE, wbPath];
  if (reqPath) args.push(reqPath);
  const result = spawnSync('node', args, { encoding: 'utf8' });
  let report = null;
  try { report = JSON.parse(result.stdout); } catch (_) {}
  return { exitCode: result.status, report, stderr: result.stderr };
}

let tmpFile, tmpReqFile;

beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `wb-pipe-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
});

afterEach(() => {
  try { fs.unlinkSync(tmpFile); } catch (_) {}
  if (tmpReqFile) { try { fs.unlinkSync(tmpReqFile); } catch (_) {} tmpReqFile = null; }
});

// ── Builders ────────────────────────────────────────────────────────────────

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

// acRows entries are 3-tuples [id, criterion, relatedUc] so the criterion text
// can carry escaped pipes inside a code span.
function writeReqMd(ucPriorities, acRows) {
  const ucSections = Object.entries(ucPriorities)
    .map(([ucId, pri]) =>
      `### ${ucId}: Description\n| Field | Value |\n|-------|-------|\n| Priority | ${pri} |\n`
    )
    .join('\n');
  const acTable =
    '| ID | Criterion | Related UC |\n|----|-----------|------------|\n' +
    acRows.map(([id, criterion, relUc]) => `| ${id} | ${criterion} | ${relUc} |`).join('\n');
  const md = `## 5. Use Cases\n\n${ucSections}\n## 7. Acceptance Criteria\n\n${acTable}\n`;
  tmpReqFile = path.join(os.tmpdir(), `req-pipe-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  fs.writeFileSync(tmpReqFile, md);
  return tmpReqFile;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('wb-validate.js — Markdown AC-table parser honours escaped pipes (\\|)', () => {

  test('an escaped pipe inside a code span in the Criterion cell is kept in-cell, so the Related UC column is read correctly and the row does not report a malformed UC reference', () => {
    // Arrange — AC-03's real shape: escaped pipes in a code span, Related UC = UC-01.
    const reqPath = writeReqMd(
      { 'UC-01': 'Must' },
      [['AC-03', 'The command `ai-toolkit ledger open\\|close\\|fail\\|skip` runs', 'UC-01']],
    );
    const wb = makeWB([makePhase('US-01', [makeTask('US-01-TASK-BE-01', ['AC-03'])])]);
    writeWB(wb);

    // Act
    const { exitCode, report, stderr } = runValidator(tmpFile, reqPath);

    // Assert — the embedded pipes must not corrupt the Related UC column.
    expect(stderr).not.toMatch(/malformed UC reference/i);
    expect(exitCode).toBe(0);
    expect(report).not.toBeNull();
    const acErrors = report.errors.filter(e =>
      e.category === 'ac_invalid_uc_ref' ||
      e.category === 'ac_wrong_us' ||
      e.category === 'ac_not_found' ||
      e.category === 'must_ac_uncovered'
    );
    expect(acErrors).toHaveLength(0);
  });

  test('the Related UC scope stays UC-01 despite embedded escaped pipes — referencing the AC from the wrong phase reports ac_wrong_us (not a parse error)', () => {
    // Arrange — same escaped-pipe criterion, but the task lives in US-02.
    // If the parser mis-read the column, it would exit 2 (malformed "close\").
    // With the fix it reads UC-01 → US-01, so US-02 is a scope violation.
    const reqPath = writeReqMd(
      { 'UC-01': 'Must', 'UC-02': 'Should' },
      [['AC-03', 'Run `ai-toolkit ledger open\\|close\\|fail\\|skip` now', 'UC-01']],
    );
    const wb = makeWB([makePhase('US-02', [makeTask('US-02-TASK-BE-01', ['AC-03'])])]);
    writeWB(wb);

    // Act
    const { exitCode, report, stderr } = runValidator(tmpFile, reqPath);

    // Assert
    expect(stderr).not.toMatch(/malformed UC reference/i);
    expect(exitCode).toBe(1);
    const error = report.errors.find(e => e.category === 'ac_wrong_us' && e.details.acId === 'AC-03');
    expect(error).toBeDefined();
  });

  test('a multi-UC Related UC cell still comma-splits correctly when the Criterion cell contains escaped pipes', () => {
    // Arrange — escaped-pipe criterion, Related UC = "UC-01, UC-02"; task in US-02 (allowed).
    const reqPath = writeReqMd(
      { 'UC-01': 'Must', 'UC-02': 'Should' },
      [['AC-03', '`open\\|close\\|fail\\|skip` are the verbs', 'UC-01, UC-02']],
    );
    const wb = makeWB([makePhase('US-02', [makeTask('US-02-TASK-BE-01', ['AC-03'])])]);
    writeWB(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile, reqPath);

    // Assert — no scope error: US-02 is one of the allowed stories.
    expect(exitCode).toBe(0);
    expect(report.errors.filter(e => e.category === 'ac_wrong_us')).toHaveLength(0);
  });

  test('normal pipes used purely as column separators still split into exactly three cells (no escapes present)', () => {
    // Arrange — a plain, unescaped AC table with two Must ACs.
    const reqPath = writeReqMd(
      { 'UC-01': 'Must', 'UC-02': 'Must' },
      [
        ['AC-01', 'A plain criterion with no pipes', 'UC-01'],
        ['AC-02', 'Another plain criterion', 'UC-02'],
      ],
    );
    const wb = makeWB([
      makePhase('US-01', [makeTask('US-01-TASK-BE-01', ['AC-01'])]),
      makePhase('US-02', [makeTask('US-02-TASK-BE-01', ['AC-02'])]),
    ]);
    writeWB(wb);

    // Act
    const { exitCode, report } = runValidator(tmpFile, reqPath);

    // Assert — header and both rows parse into the expected 3 columns; all ACs covered.
    expect(exitCode).toBe(0);
    expect(report).not.toBeNull();
    const acErrors = report.errors.filter(e =>
      e.category === 'ac_invalid_uc_ref' ||
      e.category === 'ac_wrong_us' ||
      e.category === 'ac_not_found' ||
      e.category === 'must_ac_uncovered'
    );
    expect(acErrors).toHaveLength(0);
  });
});
