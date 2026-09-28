'use strict';

// Plan parser/scheduler module (FTR-018, INFRA-TASK-BE-03 skeleton).
//
// Real implementation: lossless MD task-detail parsing (US-01-TASK-BE-01,
// DONE — see parseMarkdown below), CSV parsing and phase-task mapping
// (US-01-TASK-BE-02, DONE — see parseCSV/mapPhases below), DAG validation
// and cycle detection (US-01-TASK-BE-03), content digest and immutable plan
// snapshot (US-01-TASK-BE-04), and the stable Kahn topological scheduler
// (US-01-TASK-BE-05). See FTR-018-Tech-Spec.md section 4.
//
// Remaining exports below (parsePlan, computeDigest, buildReadyQueue) are
// placeholders so lib/task-executor/index.js can require() a stable module
// surface before those tasks land. They throw NOT_IMPLEMENTED — do not add
// real parsing/scheduling logic to them here; that belongs to their own Work
// Breakdown tasks.

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

// ── parseCSV / mapPhases (US-01-TASK-BE-02) ──────────────────────────────────
//
// parseCSV validates and parses the eight-column pipe-separated dispatch CSV
// rendered by scripts/wb-render.js (renderCsv): one row per task, carrying
// the phase-level projection (phase_id, phase_title, commit_message,
// depends_on) redundantly alongside the task-level fields (task_id,
// task_title, domain, agent_type). depends_on is a space-separated list of
// external phase IDs (see computePhaseDependsOn in wb-render.js).
//
// mapPhases aggregates the per-row phase projection into one entry per phase
// (validating that every row belonging to the same phase agrees on
// phase_title / commit_message / depends_on), then reconciles task IDs
// against the per-task view produced by parseMarkdown: every task_id in the
// CSV must appear in the MD, and every MD task id must appear in the CSV.
// Mismatches fail with a structured PLAN_PARSE_ERROR before any state
// mutation, per AC-02. The MD task objects are the source of truth for task
// detail; mapPhases only adds phaseId membership to them.

const _CSV_HEADER = 'phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type';
const _CSV_COLUMNS = _CSV_HEADER.split('|');

function parseCSV(csv) {
  const source = typeof csv === 'string' ? csv : String(csv == null ? '' : csv);
  const lines = source.split(/\r\n|\r|\n/);
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  if (lines.length === 0) {
    throw _parseError('parseCSV: input is empty');
  }

  const header = lines[0];
  if (header !== _CSV_HEADER) {
    throw _parseError(
      'parseCSV: expected header "' + _CSV_HEADER + '", got ' + JSON.stringify(header)
    );
  }

  const dataLines = lines.slice(1);
  if (dataLines.length === 0) {
    throw _parseError('parseCSV: no data rows found after header');
  }

  return dataLines.map(function (line, idx) {
    const lineNumber = idx + 2; // 1-based; header occupies line 1
    if (line === '') {
      throw _parseError('parseCSV: line ' + lineNumber + ' is blank');
    }
    const fields = line.split('|');
    if (fields.length !== _CSV_COLUMNS.length) {
      throw _parseError(
        'parseCSV: line ' + lineNumber + ' has ' + fields.length +
        ' field(s), expected ' + _CSV_COLUMNS.length
      );
    }

    const row = {
      phaseId: fields[0],
      phaseTitle: fields[1],
      commitMessage: fields[2],
      dependsOn: fields[3].split(/\s+/).filter(Boolean),
      taskId: fields[4],
      taskTitle: fields[5],
      domain: fields[6],
      agentType: fields[7],
    };

    if (!row.phaseId) {
      throw _parseError('parseCSV: line ' + lineNumber + ' is missing phase_id');
    }
    if (!row.taskId) {
      throw _parseError('parseCSV: line ' + lineNumber + ' is missing task_id');
    }

    return row;
  });
}

function mapPhases(csvRows, mdTasks) {
  const phasesById = new Map();
  const phaseOrder = [];
  const seenTaskIds = new Set();
  const taskOrder = [];

  for (const row of csvRows) {
    if (seenTaskIds.has(row.taskId)) {
      throw _parseError('mapPhases: duplicate task_id "' + row.taskId + '" in CSV');
    }
    seenTaskIds.add(row.taskId);
    taskOrder.push(row.taskId);

    let phase = phasesById.get(row.phaseId);
    if (!phase) {
      phase = {
        id: row.phaseId,
        title: row.phaseTitle,
        commitMessage: row.commitMessage,
        dependsOn: row.dependsOn,
        taskIds: [],
      };
      phasesById.set(row.phaseId, phase);
      phaseOrder.push(row.phaseId);
    } else {
      if (phase.title !== row.phaseTitle) {
        throw _parseError(
          'mapPhases: phase "' + row.phaseId + '" has inconsistent phase_title across rows: ' +
          JSON.stringify(phase.title) + ' vs ' + JSON.stringify(row.phaseTitle)
        );
      }
      if (phase.commitMessage !== row.commitMessage) {
        throw _parseError(
          'mapPhases: phase "' + row.phaseId + '" has inconsistent commit_message across rows: ' +
          JSON.stringify(phase.commitMessage) + ' vs ' + JSON.stringify(row.commitMessage)
        );
      }
      if (phase.dependsOn.join(' ') !== row.dependsOn.join(' ')) {
        throw _parseError(
          'mapPhases: phase "' + row.phaseId + '" has inconsistent depends_on across rows: ' +
          JSON.stringify(phase.dependsOn) + ' vs ' + JSON.stringify(row.dependsOn)
        );
      }
    }
    phase.taskIds.push(row.taskId);
  }

  const mdIds = new Set(mdTasks.map(function (t) { return t.id; }));
  const csvOnly = taskOrder.filter(function (id) { return !mdIds.has(id); });
  if (csvOnly.length > 0) {
    throw _parseError(
      'mapPhases: task ID(s) present in CSV but missing from MD: ' + csvOnly.join(', ')
    );
  }

  const csvIds = new Set(taskOrder);
  const mdOnly = mdTasks
    .map(function (t) { return t.id; })
    .filter(function (id) { return !csvIds.has(id); });
  if (mdOnly.length > 0) {
    throw _parseError(
      'mapPhases: task ID(s) present in MD but missing from CSV: ' + mdOnly.join(', ')
    );
  }

  const taskIdToPhaseId = new Map();
  for (const phase of phasesById.values()) {
    for (const taskId of phase.taskIds) {
      taskIdToPhaseId.set(taskId, phase.id);
    }
  }

  const tasks = mdTasks.map(function (task) {
    return Object.assign({}, task, { phaseId: taskIdToPhaseId.get(task.id) });
  });

  const phases = phaseOrder.map(function (id) { return phasesById.get(id); });

  return { phases: phases, tasks: tasks };
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
  parseCSV,
  mapPhases,
  parsePlan,
  computeDigest,
  buildReadyQueue,
};
