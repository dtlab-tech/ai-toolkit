'use strict';

// Plan parser/scheduler module (FTR-018, INFRA-TASK-BE-03 skeleton).
//
// Real implementation: lossless MD task-detail parsing (US-01-TASK-BE-01,
// DONE — see parseMarkdown below), CSV parsing and phase-task mapping
// (US-01-TASK-BE-02), DAG validation and cycle detection (US-01-TASK-BE-03),
// content digest and immutable plan snapshot (US-01-TASK-BE-04), and the
// stable Kahn topological scheduler (US-01-TASK-BE-05). See
// FTR-018-Tech-Spec.md section 4.
//
// Remaining exports below are placeholders so lib/task-executor/index.js can
// require() a stable module surface before those tasks land. They throw
// NOT_IMPLEMENTED — do not add real parsing/scheduling logic to them here;
// that belongs to their own Work Breakdown tasks.

function _notImplemented(fnName, task) {
  const err = new Error(
    'plan.' + fnName + ' is NOT_IMPLEMENTED — see Work Breakdown task ' + task
  );
  err.code = 'NOT_IMPLEMENTED';
  err.task = task;
  throw err;
}

function _parseError(message) {
  const err = new Error(message);
  err.code = 'PLAN_PARSE_ERROR';
  return err;
}

// ── parseMarkdown (US-01-TASK-BE-01) ─────────────────────────────────────────
//
// Extracts the authoritative "## Task Details" section rendered by
// scripts/wb-render.js (see renderMarkdown / taskAnchor / fencedCommandBlock
// there) into an ordered array of plain task-detail objects. Every one of the
// 14 rendered fields is preserved: id, title, outcome, domain, agentType,
// dependsOn, acceptanceCriteria, agentMinutes, tokens, outputCount,
// groupingRationale, and commit.{type,scope,subject}. Verification commands
// are preserved losslessly (byte-for-byte, including embedded pipes/`||`/
// backticks) by locating fenced blocks via their own opening delimiter
// length rather than splitting on a fixed ``` token — this mirrors
// fencedCommandBlock's dynamic fence-length strategy on the render side.
//
// This function performs no cross-document (CSV) reconciliation and no DAG
// validation — those are US-01-TASK-BE-02 and US-01-TASK-BE-03. It only
// fails on malformed/incomplete Markdown (missing section, missing task
// anchor body, missing one of the 14 fields, task-id/anchor mismatch).

const _FIELD_LABELS = [
  'Task ID',
  'Title',
  'Outcome',
  'Domain',
  'Agent type',
  'Dependencies',
  'Acceptance criteria',
  'Estimate — agent minutes',
  'Estimate — tokens',
  'Output count',
  'Grouping rationale',
  'Commit type',
  'Commit scope',
  'Commit subject',
];

const _DASH = '—'; // '—' — the placeholder wb-render.js emits for absent values

const _FIELD_LINE_RE = /^- \*\*(.+?):\*\*[ \t]?(.*)$/gm;
const _FENCE_RE = /^(`{3,})\r?\n([\s\S]*?)\r?\n\1[ \t]*$/gm;
const _NO_VERIF_RE = /_No verification commands\._/;
const _TASK_ANCHOR_RE = /<a id="task-[^"]*"><\/a>\n### ([^\n]+)\n([\s\S]*?)(?=\n<a id="task-|$)/g;

function _listOrEmpty(value) {
  if (value === _DASH) return [];
  return value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function _numberOrNull(value) {
  if (value === _DASH) return null;
  const n = Number(value);
  if (Number.isNaN(n)) {
    throw _parseError('parseMarkdown: expected a numeric value, got ' + JSON.stringify(value));
  }
  return n;
}

function _stringOrNull(value) {
  return value === _DASH ? null : value;
}

function _extractTaskDetailsSection(markdown) {
  const headingRe = /^## .*$/gm;
  const headings = [];
  let hm;
  while ((hm = headingRe.exec(markdown))) {
    headings.push({ index: hm.index, text: hm[0].trim() });
  }
  const start = headings.find(function (h) { return h.text === '## Task Details'; });
  if (!start) {
    throw _parseError('parseMarkdown: "## Task Details" section not found');
  }
  const startIdx = start.index + start.text.length;
  const after = headings.filter(function (h) { return h.index > start.index; });
  const endIdx = after.length > 0 ? after[0].index : markdown.length;
  return markdown.slice(startIdx, endIdx);
}

function _parseVerificationCommands(text) {
  if (_NO_VERIF_RE.test(text)) return [];
  const cmds = [];
  let m;
  _FENCE_RE.lastIndex = 0;
  while ((m = _FENCE_RE.exec(text))) {
    cmds.push(m[2]);
  }
  return cmds;
}

function _parseTaskFields(anchorId, body) {
  const verifMarker = '**Verification commands:**';
  const verifIdx = body.indexOf(verifMarker);
  const fieldsPart = verifIdx === -1 ? body : body.slice(0, verifIdx);
  const verifPart = verifIdx === -1 ? '' : body.slice(verifIdx + verifMarker.length);

  const fields = {};
  let fm;
  _FIELD_LINE_RE.lastIndex = 0;
  while ((fm = _FIELD_LINE_RE.exec(fieldsPart))) {
    fields[fm[1].trim()] = fm[2].trim();
  }

  const missing = _FIELD_LABELS.filter(function (label) {
    return !Object.prototype.hasOwnProperty.call(fields, label);
  });
  if (missing.length > 0) {
    throw _parseError(
      'parseMarkdown: task "' + anchorId + '" is missing required field(s): ' + missing.join(', ')
    );
  }

  const id = fields['Task ID'];
  if (id !== anchorId) {
    throw _parseError(
      'parseMarkdown: task anchor id "' + anchorId + '" does not match "Task ID" field "' + id + '"'
    );
  }

  return {
    id: id,
    title: fields['Title'],
    outcome: fields['Outcome'],
    domain: fields['Domain'],
    agentType: fields['Agent type'],
    dependsOn: _listOrEmpty(fields['Dependencies']),
    acceptanceCriteria: _listOrEmpty(fields['Acceptance criteria']),
    agentMinutes: _numberOrNull(fields['Estimate — agent minutes']),
    tokens: _numberOrNull(fields['Estimate — tokens']),
    outputCount: _numberOrNull(fields['Output count']),
    groupingRationale: _stringOrNull(fields['Grouping rationale']),
    commit: {
      type: _stringOrNull(fields['Commit type']),
      scope: _stringOrNull(fields['Commit scope']),
      subject: _stringOrNull(fields['Commit subject']),
    },
    verificationCommands: _parseVerificationCommands(verifPart),
  };
}

function parseMarkdown(markdown) {
  const source = typeof markdown === 'string' ? markdown : String(markdown == null ? '' : markdown);
  const section = _extractTaskDetailsSection(source);

  const tasks = [];
  _TASK_ANCHOR_RE.lastIndex = 0;
  let m;
  while ((m = _TASK_ANCHOR_RE.exec(section))) {
    const anchorId = m[1].trim();
    const body = m[2];
    tasks.push(_parseTaskFields(anchorId, body));
  }

  if (tasks.length === 0) {
    throw _parseError('parseMarkdown: "## Task Details" section contained no task entries');
  }

  return tasks;
}

function parsePlan() {
  _notImplemented('parsePlan', 'US-01-TASK-BE-01');
}

function computeDigest() {
  _notImplemented('computeDigest', 'US-01-TASK-BE-04');
}

function buildReadyQueue() {
  _notImplemented('buildReadyQueue', 'US-01-TASK-BE-05');
}

module.exports = {
  parseMarkdown,
  parsePlan,
  computeDigest,
  buildReadyQueue,
};
