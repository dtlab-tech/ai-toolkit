'use strict';

const crypto = require('crypto');

// Plan parser/scheduler module (FTR-018, INFRA-TASK-BE-03 skeleton).
//
// Real implementation: lossless MD task-detail parsing (US-01-TASK-BE-01,
// DONE — see parseMarkdown below), CSV parsing and phase-task mapping
// (US-01-TASK-BE-02, DONE — see parseCSV/mapPhases below), DAG validation
// and cycle detection (US-01-TASK-BE-03, DONE — see validateDAG below),
// content digest and immutable plan snapshot (US-01-TASK-BE-04, DONE — see
// createPlanSnapshot below), and the stable Kahn topological scheduler
// (US-01-TASK-BE-05, DONE — see computeReadyQueue below). See
// FTR-018-Tech-Spec.md section 4.

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

// ── validateDAG (US-01-TASK-BE-03) ───────────────────────────────────────────
//
// Graph-level validation of the task array produced by mapPhases(): duplicate
// task IDs, missing required fields, self-dependencies, dependsOn references
// to unknown task IDs, and dependency cycles. Rejects before any state
// mutation (AC-02).
//
// Scope boundary: MD/CSV parity (every CSV task_id present in the MD and vice
// versa) is already reconciled by mapPhases() before validateDAG ever sees
// the task array — see the mapPhases header comment above. validateDAG does
// NOT repeat that reconciliation; it only validates the shape of the
// dependency graph itself (cycles, missing deps, duplicates, self-deps, and
// the minimal required-field set below). Do not add MD/CSV cross-referencing
// logic here — that belongs to mapPhases.
//
// Fails fast on the first violation found, in the order: required fields,
// duplicate IDs, self-dependency / dangling references, then cycles. This
// mirrors the fail-fast PLAN_PARSE_ERROR convention used by parseCSV/mapPhases
// above, and reuses the three-color DFS (WHITE/GRAY/BLACK) cycle-detection
// strategy from src/claude/scripts/wb-validate.js (check 11) — that script is
// an authoring-time structural validator invoked as a separate CLI process;
// it is not imported here because validateDAG is a runtime library check with
// its own error contract (thrown PLAN_PARSE_ERROR, not a JSON report).

const _REQUIRED_TASK_FIELDS = ['id', 'dependsOn'];

function validateDAG(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];

  // 1. Required fields present on every task.
  for (const task of list) {
    const label = task && task.id != null ? task.id : '(unknown)';
    const missing = _REQUIRED_TASK_FIELDS.filter(function (field) {
      return task == null || task[field] == null;
    });
    if (missing.length > 0) {
      throw _parseError(
        'validateDAG: task "' + label + '" is missing required field(s): ' + missing.join(', ')
      );
    }
  }

  // 2. Duplicate task IDs.
  const seenIds = new Set();
  for (const task of list) {
    if (seenIds.has(task.id)) {
      throw _parseError('validateDAG: duplicate task ID "' + task.id + '"');
    }
    seenIds.add(task.id);
  }

  // 3. dependsOn shape, self-dependency, and dangling references.
  for (const task of list) {
    if (!Array.isArray(task.dependsOn)) {
      throw _parseError(
        'validateDAG: task "' + task.id + '" field "dependsOn" must be an array'
      );
    }
    if (task.dependsOn.includes(task.id)) {
      throw _parseError(
        'validateDAG: task "' + task.id + '" lists itself in dependsOn (self-dependency)'
      );
    }
    for (const depId of task.dependsOn) {
      if (!seenIds.has(depId)) {
        throw _parseError(
          'validateDAG: task "' + task.id + '" depends on unknown task ID "' + depId + '"'
        );
      }
    }
  }

  // 4. Cycle detection — three-color DFS (WHITE = unvisited, GRAY = on the
  // current path, BLACK = fully processed). A back-edge to a GRAY node means
  // the path from that node to the current node (inclusive) forms a cycle.
  const adjMap = new Map();
  for (const task of list) {
    adjMap.set(task.id, task.dependsOn);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const colors = new Map();
  for (const id of adjMap.keys()) colors.set(id, WHITE);

  function dfs(nodeId, pathStack) {
    colors.set(nodeId, GRAY);
    pathStack.push(nodeId);

    for (const depId of adjMap.get(nodeId)) {
      const color = colors.get(depId);
      if (color === GRAY) {
        const cycleStart = pathStack.indexOf(depId);
        const cycle = pathStack.slice(cycleStart);
        throw _parseError(
          'validateDAG: dependency cycle detected: ' + cycle.join(' -> ') + ' -> ' + cycle[0]
        );
      } else if (color === WHITE) {
        dfs(depId, pathStack);
      }
      // BLACK: already fully processed, no cycle through it.
    }

    pathStack.pop();
    colors.set(nodeId, BLACK);
  }

  for (const id of adjMap.keys()) {
    if (colors.get(id) === WHITE) {
      dfs(id, []);
    }
  }

  return true;
}

// ── createPlanSnapshot (US-01-TASK-BE-04) ────────────────────────────────────
//
// Builds the read-only, run-lifetime plan snapshot described in
// FTR-018-Tech-Spec.md section 4: "Digest: SHA256 over length-prefixed UTF-8
// raw MD bytes followed by length-prefixed raw CSV bytes and parser format
// version. Also persist independent file hashes. [...] Read-only snapshot =
// normalized validated task objects + raw-input hashes; immutable for the
// run."
//
// Byte layout fed to the digest hash (all lengths are 8-byte big-endian
// unsigned integers, so the boundary between fields is unambiguous
// regardless of content — this is what makes the order stable and prevents
// e.g. an MD/CSV byte-boundary shift from colliding with a different-length
// split that happens to hash the same concatenated bytes):
//   [8-byte len(mdBytes)]  [mdBytes]
//   [8-byte len(csvBytes)] [csvBytes]
//   [8-byte len(versionBytes)] [versionBytes]
// where versionBytes is the UTF-8 encoding of String(formatVersion).
//
// PARSER_FORMAT_VERSION identifies the parser/normalization rules
// (parseMarkdown/parseCSV/mapPhases/validateDAG above) that produced the
// snapshot's tasks/phases. A caller may pass an explicit formatVersion (e.g.
// to reproduce a prior run's digest); it defaults to the module's current
// version otherwise. Bumping PARSER_FORMAT_VERSION is a deliberate migration
// (see Tech-Spec section 4: "parser version changes require explicit
// migration") — do not bump it silently.
const PARSER_FORMAT_VERSION = 1;

function _lengthPrefixed(buffer) {
  const len = Buffer.alloc(8);
  len.writeBigUInt64BE(BigInt(buffer.length));
  return Buffer.concat([len, buffer]);
}

function _computePlanDigest(mdBuffer, csvBuffer, formatVersion) {
  const versionBuffer = Buffer.from(String(formatVersion), 'utf8');
  const material = Buffer.concat([
    _lengthPrefixed(mdBuffer),
    _lengthPrefixed(csvBuffer),
    _lengthPrefixed(versionBuffer),
  ]);
  return crypto.createHash('sha256').update(material).digest('hex');
}

// Independent per-file hash (Tech-Spec: "Also persist independent file
// hashes"), distinct from the combined planDigest above so a tampered input
// can be attributed to the MD or the CSV specifically. Uses the same
// 'sha256:'-prefixed format as bin/cli.js's computeFileSha256.
function _independentFileHash(buffer) {
  return 'sha256:' + crypto.createHash('sha256').update(buffer).digest('hex');
}

// Recursively freezes plain objects/arrays so the snapshot's normalized
// tasks/phases (and everything they contain — e.g. each task's `commit`
// object and `dependsOn`/`acceptanceCriteria`/`verificationCommands` arrays)
// are read-only for the run's lifetime, per the Work Breakdown outcome. This
// module runs under 'use strict' (top of file), so assigning to or mutating
// a frozen property/array throws a TypeError rather than silently failing.
function _deepFreeze(value) {
  if (Array.isArray(value)) {
    value.forEach(_deepFreeze);
    return Object.freeze(value);
  }
  if (value !== null && typeof value === 'object') {
    Object.keys(value).forEach(function (key) { _deepFreeze(value[key]); });
    return Object.freeze(value);
  }
  return value;
}

// createPlanSnapshot(markdownText, csvText, [formatVersion]) parses and
// validates the raw MD/CSV documents (parseMarkdown -> parseCSV -> mapPhases
// -> validateDAG, in that order — any PLAN_PARSE_ERROR from those calls
// propagates unmodified, per AC-02's fail-before-mutation contract) and
// binds the computed digest to the resulting normalized tasks/phases in a
// single immutable snapshot object. formatVersion defaults to
// PARSER_FORMAT_VERSION.
function createPlanSnapshot(markdownText, csvText, formatVersion) {
  const version = formatVersion == null ? PARSER_FORMAT_VERSION : formatVersion;
  const mdSource = typeof markdownText === 'string' ? markdownText : String(markdownText == null ? '' : markdownText);
  const csvSource = typeof csvText === 'string' ? csvText : String(csvText == null ? '' : csvText);
  const mdBuffer = Buffer.from(mdSource, 'utf8');
  const csvBuffer = Buffer.from(csvSource, 'utf8');

  const mdTasks = parseMarkdown(mdSource);
  const csvRows = parseCSV(csvSource);
  const { phases, tasks } = mapPhases(csvRows, mdTasks);
  validateDAG(tasks);

  const snapshot = {
    planDigest: _computePlanDigest(mdBuffer, csvBuffer, version),
    formatVersion: version,
    mdHash: _independentFileHash(mdBuffer),
    csvHash: _independentFileHash(csvBuffer),
    phases: phases,
    tasks: tasks,
  };

  return _deepFreeze(snapshot);
}

// ── computeReadyQueue (US-01-TASK-BE-05) ─────────────────────────────────────
//
// Tech-Spec section 4: "Ready queue: stable Kahn topological ordering, ties
// by source phase index then source task index then ID." This function
// computes that full stable ordering up front, over the complete dependency
// graph, in one pass. It intentionally does NOT model "one ready batch at a
// time" / re-queueing as tasks complete — the Tech-Spec's dynamic dispatch
// loop ("Dispatch from ready tasks only... Independent tasks may finish out
// of order but do not overtake earlier dispatched tasks in integration") is
// the concern of the executor loop (US-07/US-08), which walks this
// precomputed order and defers a task only if a real (asynchronous) run
// hasn't finished a prerequisite yet. Because the graph and its edges are
// fixed for a run (the plan snapshot is immutable, per US-01-TASK-BE-04),
// the full stable Kahn order computed here is exactly the order the executor
// loop will dispatch in when nothing is actually blocked — one full,
// deterministic pass is sufficient and simplest for this module's job:
// parsing/scheduling, not live execution state.
//
// Accepts either:
//   - a plan snapshot as returned by createPlanSnapshot() (an object with
//     .tasks and .phases) — the expected caller shape once index.js wires
//     up execution; snapshot.phases[i].taskIds gives the authoritative
//     "source task index within phase" ordering (that array is itself built
//     from CSV row order in mapPhases, i.e. original document order), and
//     the phase's position in snapshot.phases is the "source phase index".
//     The snapshot is deep-frozen by createPlanSnapshot — this function only
//     reads it, never mutates it.
//   - a plain array of task objects (each with at least `id` and
//     `dependsOn`, and optionally `phaseId`) — for callers/tests that have
//     not gone through createPlanSnapshot. Tasks are grouped into pseudo-
//     phases by first-seen order of `phaseId` (mirroring mapPhases' own
//     phaseOrder construction); tasks sharing no `phaseId` field all fall
//     into one implicit phase, so the tie-break degrades cleanly to plain
//     source-array order then ID.
//
// Returns the full array of task objects in stable ready order (not batches
// — see rationale above).
//
// Defense in depth: validateDAG() should already have rejected any cycle
// earlier in the pipeline (createPlanSnapshot calls it before ever building
// a snapshot), but this function does not assume that happened — a plain
// array can be handed in without ever going through validateDAG. If Kahn's
// algorithm cannot fully order the graph (in-degree never reaches zero for
// some task — a cycle, or a dependsOn reference that never resolves), this
// throws a PLAN_PARSE_ERROR rather than silently returning a partial order.

function _orderIndexFromSnapshot(snapshot) {
  const orderIndex = new Map();
  snapshot.phases.forEach(function (phase, phaseIndex) {
    phase.taskIds.forEach(function (taskId, taskIndexInPhase) {
      orderIndex.set(taskId, { phaseIndex: phaseIndex, taskIndexInPhase: taskIndexInPhase });
    });
  });
  // Defensive: any task not referenced by any phase.taskIds (should not
  // happen for a snapshot that passed mapPhases/validateDAG) sorts after all
  // phased tasks, in source array order.
  snapshot.tasks.forEach(function (task, sourceIndex) {
    if (!orderIndex.has(task.id)) {
      orderIndex.set(task.id, { phaseIndex: Number.MAX_SAFE_INTEGER, taskIndexInPhase: sourceIndex });
    }
  });
  return orderIndex;
}

function _orderIndexFromPlainTasks(tasks) {
  const orderIndex = new Map();
  const phaseIndexByKey = new Map();
  const nextTaskIndexByKey = new Map();
  let nextPhaseIndex = 0;

  tasks.forEach(function (task) {
    const phaseKey = task.phaseId == null ? '__no_phase__' : task.phaseId;
    if (!phaseIndexByKey.has(phaseKey)) {
      phaseIndexByKey.set(phaseKey, nextPhaseIndex++);
      nextTaskIndexByKey.set(phaseKey, 0);
    }
    const phaseIndex = phaseIndexByKey.get(phaseKey);
    const taskIndexInPhase = nextTaskIndexByKey.get(phaseKey);
    nextTaskIndexByKey.set(phaseKey, taskIndexInPhase + 1);
    orderIndex.set(task.id, { phaseIndex: phaseIndex, taskIndexInPhase: taskIndexInPhase });
  });

  return orderIndex;
}

function _normalizeSchedulerInput(input) {
  if (input != null && Array.isArray(input.tasks) && Array.isArray(input.phases)) {
    return { tasks: input.tasks, orderIndex: _orderIndexFromSnapshot(input) };
  }
  if (Array.isArray(input)) {
    return { tasks: input, orderIndex: _orderIndexFromPlainTasks(input) };
  }
  throw _parseError(
    'computeReadyQueue: expected a plan snapshot (with .tasks/.phases) or a plain array of tasks'
  );
}

function computeReadyQueue(input) {
  const normalized = _normalizeSchedulerInput(input);
  const tasks = normalized.tasks;
  const orderIndex = normalized.orderIndex;

  const byId = new Map(tasks.map(function (task) { return [task.id, task]; }));
  const inDegree = new Map();
  const dependents = new Map();
  tasks.forEach(function (task) {
    inDegree.set(task.id, task.dependsOn.length);
    if (!dependents.has(task.id)) dependents.set(task.id, []);
  });
  tasks.forEach(function (task) {
    task.dependsOn.forEach(function (depId) {
      if (!dependents.has(depId)) dependents.set(depId, []);
      dependents.get(depId).push(task.id);
    });
  });

  function compareIds(aId, bId) {
    const a = orderIndex.get(aId);
    const b = orderIndex.get(bId);
    if (a.phaseIndex !== b.phaseIndex) return a.phaseIndex - b.phaseIndex;
    if (a.taskIndexInPhase !== b.taskIndexInPhase) return a.taskIndexInPhase - b.taskIndexInPhase;
    if (aId < bId) return -1;
    if (aId > bId) return 1;
    return 0;
  }

  let ready = tasks
    .filter(function (task) { return inDegree.get(task.id) === 0; })
    .map(function (task) { return task.id; });
  ready.sort(compareIds);

  const orderedIds = [];
  while (ready.length > 0) {
    const nextId = ready.shift();
    orderedIds.push(nextId);
    dependents.get(nextId).forEach(function (dependentId) {
      const remaining = inDegree.get(dependentId) - 1;
      inDegree.set(dependentId, remaining);
      if (remaining === 0) {
        ready.push(dependentId);
      }
    });
    ready.sort(compareIds);
  }

  if (orderedIds.length !== tasks.length) {
    const orderedSet = new Set(orderedIds);
    const unresolved = tasks
      .map(function (task) { return task.id; })
      .filter(function (id) { return !orderedSet.has(id); });
    throw _parseError(
      'computeReadyQueue: unable to fully order the task graph — dependency cycle or ' +
      'unresolved dependency reference among task(s): ' + unresolved.join(', ') +
      ' (validateDAG should be run before computeReadyQueue to catch this earlier; this is a ' +
      'defense-in-depth check, not a substitute for it)'
    );
  }

  return orderedIds.map(function (id) { return byId.get(id); });
}

module.exports = {
  parseMarkdown,
  parseCSV,
  mapPhases,
  validateDAG,
  PARSER_FORMAT_VERSION,
  createPlanSnapshot,
  computeReadyQueue,
};
