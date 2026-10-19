'use strict'

const path = require('path')
const graphChecks = require('./wb-graph-checks')
const { loadWorkBreakdown } = require('./wbs-assembler')

// Schema v2 constants — used by validation checks below

const SCHEMA_VERSION = 2

const REQUIRED_PHASE_FIELDS = [
  'id',
  'type',
  'title',
  'commit',
  'tasks',
]

// Duration policy thresholds (agentMinutes) — used by check 15, which stays inline here
// (it needs per-task estimate detail, not just the skeleton shape wb-graph-checks.js works with)
const TARGET_MAX = 15   // tasks ≤15 min agent estimate: target band
const ABOVE_MAX = 20    // tasks 16–20 min: above target (no flag)
const WARNING_MAX = 30  // tasks 21–30 min: warning band (non-blocking); >30 = splitRequired (blocking)

// Checks 3, 5-14, 19-21 are extracted into wb-graph-checks.js (FTR-020 OQ-02) and reused
// here via the graphChecks import above; this module keeps only checks 4, 15-18, 22, 23,
// which need per-task detail (required field presence including verification.commands,
// duration bands, content-quality checks) that the skeleton-only shape doesn't carry.
const { ERRORS } = graphChecks

// ── Entry point ──────────────────────────────────────────────────────────────

const jsonPath = process.argv[2]
const requirementsPath = process.argv[3]  // optional; used by AC checks (US-02-T10..T12)

if (!jsonPath) {
  process.stderr.write('Error: missing required argument <path-to-work-breakdown.json>\n')
  process.exit(2)
}

// Read and assemble the work breakdown — accepts either a single legacy JSON file
// (schema v2) or a {PREFIX}-wbs/ split directory (schema v3), returning the same
// in-memory shape either way (FTR-020).
let wb
try {
  wb = loadWorkBreakdown(path.resolve(jsonPath))
} catch (err) {
  process.stderr.write(`Error: ${err.message}\n`)
  process.exit(2)
}

// ── Report structure ─────────────────────────────────────────────────────────

const report = {
  valid: true,
  schemaVersion: wb.schemaVersion,
  taskCount: 0,
  errors: [],
  warnings: [],
  durationBands: {},
  domainDistribution: {},
  dependencies: {},
}

// ── Check 2: Schema version ──────────────────────────────────────────────────

if (wb.schemaVersion !== SCHEMA_VERSION) {
  report.errors.push({
    category: ERRORS.SCHEMA_VERSION_INVALID,
    severity: 'error',
    taskId: null,
    field: 'schemaVersion',
    message: `schemaVersion must be ${SCHEMA_VERSION}, got ${JSON.stringify(wb.schemaVersion)}`,
    details: { expected: SCHEMA_VERSION, actual: wb.schemaVersion },
  })
}

// ── Check 3: Unique task IDs (extracted — wb-graph-checks.js) ───────────────

const phases = Array.isArray(wb.phases) ? wb.phases : []
for (const phase of phases) {
  report.taskCount += Array.isArray(phase.tasks) ? phase.tasks.length : 0
}

const check3 = graphChecks.checkUniqueTaskIds({ phases })
report.errors.push(...check3.errors)
const seenTaskIds = check3.seenTaskIds   // taskId → first-seen phaseId

// ── Check 4: Required phase fields ───────────────────────────────────────────

for (const phase of phases) {
  const phaseId = phase.id || '(unknown)'

  for (const field of REQUIRED_PHASE_FIELDS) {
    if (phase[field] == null) {
      report.errors.push({
        category: ERRORS.MISSING_FIELD,
        severity: 'error',
        phaseId,
        taskId: null,
        field,
        message: `Phase "${phaseId}" is missing required field "${field}"`,
        details: { phaseId, field },
      })
    } else if (field === 'tasks' && !Array.isArray(phase[field])) {
      report.errors.push({
        category: ERRORS.MISSING_FIELD,
        severity: 'error',
        phaseId,
        taskId: null,
        field,
        message: `Phase "${phaseId}" field "tasks" must be an array`,
        details: { phaseId, field },
      })
    }
  }

  // ── Check 4: Required task fields ─────────────────────────────────────────

  const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
  for (const task of tasks) {
    const taskId = task.id || '(unknown)'

    const topLevelFields = [
      'id', 'title', 'outcome', 'domain', 'agentType', 'dependsOn',
      'acceptanceCriteria', 'outputCount', 'commit',
    ]
    for (const field of topLevelFields) {
      if (task[field] == null) {
        report.errors.push({
          category: ERRORS.MISSING_FIELD,
          severity: 'error',
          taskId,
          field,
          message: `Task "${taskId}" is missing required field "${field}"`,
          details: { taskId, field },
        })
      }
    }

    // groupingRationale is required only when outputCount > 1 (the generator agent's own
    // contract: a single-output task has nothing to justify grouping, so it emits null) —
    // null is the documented, correct value there, not a missing field.
    if (task.outputCount > 1 && task.groupingRationale == null) {
      report.errors.push({
        category: ERRORS.MISSING_FIELD,
        severity: 'error',
        taskId,
        field: 'groupingRationale',
        message: `Task "${taskId}" has outputCount > 1 but is missing required field "groupingRationale"`,
        details: { taskId, field: 'groupingRationale' },
      })
    }

    // Nested: verification.commands — existence and array type only; emptiness checked later
    if (task.verification == null || task.verification.commands == null) {
      report.errors.push({
        category: ERRORS.MISSING_FIELD,
        severity: 'error',
        taskId,
        field: 'verification.commands',
        message: `Task "${taskId}" is missing required field "verification.commands"`,
        details: { taskId, field: 'verification.commands' },
      })
    } else if (!Array.isArray(task.verification.commands)) {
      report.errors.push({
        category: ERRORS.MISSING_FIELD,
        severity: 'error',
        taskId,
        field: 'verification.commands',
        message: `Task "${taskId}" field "verification.commands" must be an array`,
        details: { taskId, field: 'verification.commands' },
      })
    }

    // Nested: estimate.agentMinutes
    if (task.estimate == null || task.estimate.agentMinutes == null) {
      report.errors.push({
        category: ERRORS.MISSING_FIELD,
        severity: 'error',
        taskId,
        field: 'estimate.agentMinutes',
        message: `Task "${taskId}" is missing required field "estimate.agentMinutes"`,
        details: { taskId, field: 'estimate.agentMinutes' },
      })
    }

    // Nested: estimate.tokens
    if (task.estimate == null || task.estimate.tokens == null) {
      report.errors.push({
        category: ERRORS.MISSING_FIELD,
        severity: 'error',
        taskId,
        field: 'estimate.tokens',
        message: `Task "${taskId}" is missing required field "estimate.tokens"`,
        details: { taskId, field: 'estimate.tokens' },
      })
    }

    // commit.subject — commit itself is checked above as a top-level field
    if (task.commit != null && task.commit.subject == null) {
      report.errors.push({
        category: ERRORS.MISSING_FIELD,
        severity: 'error',
        taskId,
        field: 'commit.subject',
        message: `Task "${taskId}" is missing required field "commit.subject"`,
        details: { taskId, field: 'commit.subject' },
      })
    }
  }
}

// ── Check 5: Task ID format (extracted — wb-graph-checks.js) ────────────────
report.errors.push(...graphChecks.checkTaskIdFormat({ phases }).errors)

// ── Check 6: Domain whitelist (extracted — wb-graph-checks.js) ──────────────
report.errors.push(...graphChecks.checkDomainWhitelist({ phases }).errors)

// ── Check 7: AgentType whitelist (extracted — wb-graph-checks.js) ───────────
report.errors.push(...graphChecks.checkAgentTypeWhitelist({ phases }).errors)

// ── Check 8: Dependency reference existence (extracted) ─────────────────────
const allTaskIds = new Set(seenTaskIds.keys())
report.errors.push(...graphChecks.checkDependencyExistence({ phases }, allTaskIds).errors)

// ── Check 9: Self-dependency (extracted — wb-graph-checks.js) ───────────────
report.errors.push(...graphChecks.checkSelfDependency({ phases }).errors)

// ── Check 10: Phase ID consistency (extracted — wb-graph-checks.js) ─────────
report.errors.push(...graphChecks.checkPhaseIdConsistency({ phases }).errors)

// ── Check 11: Task cycle detection (extracted — wb-graph-checks.js) ─────────
const check11 = graphChecks.checkTaskCycle({ phases }, allTaskIds)
report.errors.push(...check11.errors)
report.dependencies.taskGraph = check11.taskGraph
report.dependencies.taskCycles = check11.taskCycles

// ── Check 12 & 13: Phase dependency projection and cycle (extracted) ─────────
const check1213 = graphChecks.checkPhaseDependencyAndCycle({ phases }, seenTaskIds)
report.errors.push(...check1213.errors)
report.dependencies.phaseGraph = check1213.phaseGraph
report.dependencies.phaseCycles = check1213.phaseCycles

// ── Check 14: Phase schedulability (extracted — wb-graph-checks.js) ─────────
const check14 = graphChecks.checkPhaseSchedulability({ phases }, check1213.phaseDepsMap)
report.errors.push(...check14.errors)
report.dependencies.phaseWaves = check14.phaseWaves
report.dependencies.phaseUnschedulable = check14.phaseUnschedulable

// ── Check 15: Duration policy ────────────────────────────────────────────────

const durationBands = { target: 0, above_target: 0, warning: 0, split_required: 0 }

for (const phase of phases) {
  const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
  for (const task of tasks) {
    const minutes = task.estimate?.agentMinutes
    if (minutes == null) continue  // already caught by check 4; skip here

    let band
    if (minutes <= TARGET_MAX) {
      band = 'target'
    } else if (minutes <= ABOVE_MAX) {
      band = 'above_target'
    } else if (minutes <= WARNING_MAX) {
      band = 'warning'
      report.warnings.push({
        category: ERRORS.DURATION_WARNING,
        severity: 'warning',
        taskId: task.id,
        field: 'estimate.agentMinutes',
        message: `Task "${task.id}" estimate ${minutes}min exceeds target (${TARGET_MAX}min); consider splitting`,
        details: { taskId: task.id, agentMinutes: minutes, targetMax: TARGET_MAX, warningMax: WARNING_MAX },
      })
    } else {
      band = 'split_required'
      report.errors.push({
        category: ERRORS.SPLIT_REQUIRED,
        severity: 'error',
        taskId: task.id,
        field: 'estimate.agentMinutes',
        message: `Task "${task.id}" estimate ${minutes}min exceeds maximum (${WARNING_MAX}min); must be split`,
        details: { taskId: task.id, agentMinutes: minutes, warningMax: WARNING_MAX },
      })
    }

    durationBands[band]++
  }
}

report.durationBands = durationBands

// ── Check 16 / 17 / 18: Content-quality checks ───────────────────────────────
// Check 16: Empty verification.commands array
// Check 17: Empty or whitespace-only commit.subject
// Check 18: Empty or whitespace-only groupingRationale

for (const phase of phases) {
  const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
  for (const task of tasks) {
    // Check 16: Empty verification commands
    if (
      task.verification != null &&
      task.verification.commands != null &&
      Array.isArray(task.verification.commands) &&
      task.verification.commands.length === 0
    ) {
      report.errors.push({
        category: ERRORS.EMPTY_VERIFICATION_COMMANDS,
        severity: 'error',
        taskId: task.id,
        field: 'verification.commands',
        message: `Task "${task.id}" has an empty verification.commands array; at least one command is required`,
        details: { taskId: task.id },
      })
    }

    // Check 17: Empty commit subject
    if (
      task.commit != null &&
      task.commit.subject != null &&
      typeof task.commit.subject === 'string' &&
      task.commit.subject.trim() === ''
    ) {
      report.errors.push({
        category: ERRORS.EMPTY_COMMIT_SUBJECT,
        severity: 'error',
        taskId: task.id,
        field: 'commit.subject',
        message: `Task "${task.id}" has an empty commit.subject; a non-empty commit subject is required`,
        details: { taskId: task.id },
      })
    }

    // Check 18: Missing grouping rationale
    if (
      task.groupingRationale != null &&
      typeof task.groupingRationale === 'string' &&
      task.groupingRationale.trim() === ''
    ) {
      report.errors.push({
        category: ERRORS.MISSING_GROUPING_RATIONALE,
        severity: 'error',
        taskId: task.id,
        field: 'groupingRationale',
        message: `Task "${task.id}" has an empty groupingRationale; a non-empty rationale is required`,
        details: { taskId: task.id },
      })
    }
  }
}

// ── Domain distribution ───────────────────────────────────────────────────────

const domainDist = { BE: 0, FE: 0, DB: 0, DevOps: 0, INFRA: 0, TEST: 0 }
for (const phase of phases) {
  const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
  for (const task of tasks) {
    if (task.domain != null && domainDist[task.domain] !== undefined) {
      domainDist[task.domain]++
    }
  }
}
report.domainDistribution = domainDist

// ── Checks 19, 20 & 21: AC existence, scope, Must coverage (extracted) ──────

const acMap = graphChecks.parseAcTable(requirementsPath)
report.errors.push(...graphChecks.checkAcCoverage({ phases }, acMap, seenTaskIds).errors)

// ── Check 22: Text field character validation ─────────────────────────────────

{
  const INVALID_CHARS_RE = /[|\r\n]/

  for (const phase of phases) {
    if (typeof phase.title === 'string' && INVALID_CHARS_RE.test(phase.title)) {
      report.errors.push({
        category: ERRORS.INVALID_TEXT_FIELD_CHARS,
        severity: 'error',
        taskId: null,
        phaseId: phase.id,
        field: 'title',
        message: `Phase "${phase.id}" field "title" contains invalid characters (pipe, CR, or LF)`,
        details: { phaseId: phase.id, field: 'title' },
      })
    }

    if (!Array.isArray(phase.tasks)) continue

    for (const task of phase.tasks) {
      if (typeof task.title === 'string' && INVALID_CHARS_RE.test(task.title)) {
        report.errors.push({
          category: ERRORS.INVALID_TEXT_FIELD_CHARS,
          severity: 'error',
          taskId: task.id,
          field: 'title',
          message: `Task "${task.id}" field "title" contains invalid characters (pipe, CR, or LF)`,
          details: { taskId: task.id, field: 'title' },
        })
      }

      if (task.commit && typeof task.commit.subject === 'string' && INVALID_CHARS_RE.test(task.commit.subject)) {
        report.errors.push({
          category: ERRORS.INVALID_TEXT_FIELD_CHARS,
          severity: 'error',
          taskId: task.id,
          field: 'commit.subject',
          message: `Task "${task.id}" field "commit.subject" contains invalid characters (pipe, CR, or LF)`,
          details: { taskId: task.id, field: 'commit.subject' },
        })
      }
    }
  }
}

// ── Check 23: Empty phase detection ──────────────────────────────────────────

{
  for (const phase of phases) {
    if (Array.isArray(phase.tasks) && phase.tasks.length === 0) {
      report.errors.push({
        category: ERRORS.EMPTY_PHASE,
        severity: 'error',
        taskId: null,
        phaseId: phase.id,
        field: 'tasks',
        message: `Phase "${phase.id}" has no tasks; each phase must contain at least one task`,
        details: { phaseId: phase.id },
      })
    }
  }
}

// ── Exit code routing ────────────────────────────────────────────────────────

if (report.errors.length > 0) {
  report.valid = false
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  process.exit(1)
}

process.stdout.write(JSON.stringify(report, null, 2) + '\n')
process.exit(0)
