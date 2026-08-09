'use strict'

const fs = require('fs')
const path = require('path')

// Schema v2 constants — used by validation checks below

const SCHEMA_VERSION = 2

const REQUIRED_PHASE_FIELDS = [
  'id',
  'type',
  'title',
  'commit',
  'tasks',
]

const REQUIRED_TASK_FIELDS = [
  'id',
  'title',
  'outcome',
  'domain',
  'agentType',
  'dependsOn',
  'acceptanceCriteria',
  'verification',
  'estimate',
  'outputCount',
  'groupingRationale',
  'commit',
]

const VALID_DOMAINS = ['BE', 'FE', 'DB', 'DevOps', 'INFRA', 'TEST']

const VALID_AGENT_TYPES = [
  'developer-backend',
  'developer-frontend',
  'developer-testing',
  'developer-database',
  'review-solution',
]

// Duration policy thresholds (agentMinutes) — used by check 15
const TARGET_MAX = 15   // tasks ≤15 min agent estimate: target band
const ABOVE_MAX = 20    // tasks 16–20 min: above target (no flag)
const WARNING_MAX = 30  // tasks 21–30 min: warning band (non-blocking); >30 = splitRequired (blocking)

// Error catalog — eliminates magic strings across validation checks
const ERRORS = {
  SCHEMA_VERSION_INVALID:       'schema_version_invalid',        // check 2
  UNIQUE_ID_VIOLATION:          'unique_id_violation',           // check 3
  MISSING_FIELD:                'missing_field',                 // check 4
  INVALID_ID_FORMAT:            'invalid_id_format',             // check 5
  INVALID_DOMAIN:               'invalid_domain',                // check 6
  INVALID_AGENT_TYPE:           'invalid_agent_type',            // check 7
  DEPENDENCY_NOT_FOUND:         'dependency_not_found',          // check 8
  SELF_DEPENDENCY:              'self_dependency',               // check 9
  PHASE_ID_MISMATCH:            'phase_id_mismatch',             // check 10
  TASK_CYCLE_DETECTED:          'task_cycle_detected',           // check 11
  PHASE_DEPENDENCY_NOT_FOUND:   'phase_dependency_not_found',    // check 12
  PHASE_CYCLE_DETECTED:         'phase_cycle_detected',          // check 13
  PHASE_UNSCHEDULABLE:          'phase_unschedulable',           // check 14
  DURATION_WARNING:             'duration_warning',              // check 15 — non-blocking warning
  SPLIT_REQUIRED:               'split_required',                // check 15 — blocking error (>30 min)
  EMPTY_VERIFICATION_COMMANDS:  'empty_verification_commands',   // check 16
  EMPTY_COMMIT_SUBJECT:         'empty_commit_subject',          // check 17
  MISSING_GROUPING_RATIONALE:   'missing_grouping_rationale',    // check 18
  AC_NOT_FOUND:                 'ac_not_found',                  // check 19
  AC_WRONG_US:                  'ac_wrong_us',                   // check 20
  AC_INVALID_UC_REF:            'ac_invalid_uc_ref',             // check 20
  UC_MISSING_PRIORITY:          'uc_missing_priority',           // check 20
  MUST_AC_UNCOVERED:            'must_ac_uncovered',             // check 21
  INVALID_TEXT_FIELD_CHARS:     'invalid_text_field_chars',      // check 22
  EMPTY_PHASE:                  'empty_phase',                   // check 23
}

// ── Entry point ──────────────────────────────────────────────────────────────

const jsonPath = process.argv[2]
const requirementsPath = process.argv[3]  // optional; used by AC checks (US-02-T10..T12)

if (!jsonPath) {
  process.stderr.write('Error: missing required argument <path-to-work-breakdown.json>\n')
  process.exit(2)
}

// Read and parse the work breakdown JSON
let raw
try {
  raw = fs.readFileSync(path.resolve(jsonPath), 'utf8')
} catch (err) {
  process.stderr.write(`Error: cannot read file "${jsonPath}": ${err.message}\n`)
  process.exit(2)
}

let wb
try {
  wb = JSON.parse(raw)
} catch (err) {
  process.stderr.write(`Error: "${jsonPath}" is not valid JSON: ${err.message}\n`)
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

// ── Check 3: Unique task IDs ─────────────────────────────────────────────────

const phases = Array.isArray(wb.phases) ? wb.phases : []
const seenTaskIds = new Map()   // taskId → first-seen phaseId
const duplicateTaskIds = new Set()

for (const phase of phases) {
  const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
  report.taskCount += tasks.length
  for (const task of tasks) {
    if (task.id != null) {
      if (seenTaskIds.has(task.id)) {
        duplicateTaskIds.add(task.id)
      } else {
        seenTaskIds.set(task.id, phase.id)
      }
    }
  }
}

for (const taskId of duplicateTaskIds) {
  report.errors.push({
    category: ERRORS.UNIQUE_ID_VIOLATION,
    severity: 'error',
    taskId,
    field: 'id',
    message: `Duplicate task ID "${taskId}" appears in multiple phases`,
    details: { taskId },
  })
}

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

// ── Check 5: Task ID format ──────────────────────────────────────────────────

const INFRA_TASK_ID_RE = /^INFRA-TASK-(BE|FE|DB|DevOps|INFRA|TEST)-\d+$/
const US_TASK_ID_RE    = /^[A-Z0-9-]+-TASK-(BE|FE|DB|DevOps|INFRA|TEST)-\d+$/

for (const phase of phases) {
  const isInfraPhase = phase.id === 'INFRA' || phase.type === 'infra'
  const re = isInfraPhase ? INFRA_TASK_ID_RE : US_TASK_ID_RE
  const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
  for (const task of tasks) {
    if (task.id == null) continue
    if (!re.test(task.id)) {
      report.errors.push({
        category: ERRORS.INVALID_ID_FORMAT,
        severity: 'error',
        taskId: task.id,
        phaseId: phase.id,
        field: 'id',
        message: `Task "${task.id}" in phase "${phase.id}" has an invalid ID format`,
        details: { taskId: task.id, phaseId: phase.id, expectedPattern: re.toString() },
      })
    }
  }
}

// ── Check 6: Domain whitelist ────────────────────────────────────────────────

for (const phase of phases) {
  const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
  for (const task of tasks) {
    if (task.domain == null) continue
    if (!VALID_DOMAINS.includes(task.domain)) {
      report.errors.push({
        category: ERRORS.INVALID_DOMAIN,
        severity: 'error',
        taskId: task.id,
        field: 'domain',
        message: `Task "${task.id}" has invalid domain "${task.domain}"; must be one of ${VALID_DOMAINS.join(', ')}`,
        details: { taskId: task.id, domain: task.domain, validDomains: VALID_DOMAINS },
      })
    }
  }
}

// ── Check 7: AgentType whitelist ─────────────────────────────────────────────

for (const phase of phases) {
  const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
  for (const task of tasks) {
    if (task.agentType == null) continue
    if (!VALID_AGENT_TYPES.includes(task.agentType)) {
      report.errors.push({
        category: ERRORS.INVALID_AGENT_TYPE,
        severity: 'error',
        taskId: task.id,
        field: 'agentType',
        message: `Task "${task.id}" has invalid agentType "${task.agentType}"; must be one of ${VALID_AGENT_TYPES.join(', ')}`,
        details: { taskId: task.id, agentType: task.agentType, validAgentTypes: VALID_AGENT_TYPES },
      })
    }
  }
}

// ── Check 8: Dependency reference existence ──────────────────────────────────

const allTaskIds = new Set(seenTaskIds.keys())

for (const phase of phases) {
  const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
  for (const task of tasks) {
    if (!Array.isArray(task.dependsOn)) continue
    for (const refId of task.dependsOn) {
      if (!allTaskIds.has(refId)) {
        report.errors.push({
          category: ERRORS.DEPENDENCY_NOT_FOUND,
          severity: 'error',
          taskId: task.id,
          field: 'dependsOn',
          message: `Task "${task.id}" references non-existent task ID "${refId}" in dependsOn`,
          details: { taskId: task.id, missingRef: refId },
        })
      }
    }
  }
}

// ── Check 9: Self-dependency ─────────────────────────────────────────────────

for (const phase of phases) {
  const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
  for (const task of tasks) {
    if (!Array.isArray(task.dependsOn)) continue
    if (task.dependsOn.includes(task.id)) {
      report.errors.push({
        category: ERRORS.SELF_DEPENDENCY,
        severity: 'error',
        taskId: task.id,
        field: 'dependsOn',
        message: `Task "${task.id}" lists itself in dependsOn (self-dependency)`,
        details: { taskId: task.id },
      })
    }
  }
}

// ── Check 10: Phase ID consistency ───────────────────────────────────────────

const INFRA_PREFIX = 'INFRA-TASK-'
const TASK_SEP     = '-TASK-'

for (const phase of phases) {
  const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
  for (const task of tasks) {
    if (task.id == null) continue
    if (task.id.startsWith(INFRA_PREFIX)) {
      if (phase.id !== 'INFRA') {
        report.errors.push({
          category: ERRORS.PHASE_ID_MISMATCH,
          severity: 'error',
          taskId: task.id,
          field: 'id',
          message: `Task "${task.id}" has INFRA prefix but is in phase "${phase.id}"; INFRA tasks must be in the INFRA phase`,
          details: { taskId: task.id, phaseId: phase.id, expectedPhase: 'INFRA' },
        })
      }
    } else {
      const sepIdx = task.id.indexOf(TASK_SEP)
      if (sepIdx !== -1) {
        const extractedPrefix = task.id.substring(0, sepIdx)
        if (extractedPrefix !== phase.id) {
          report.errors.push({
            category: ERRORS.PHASE_ID_MISMATCH,
            severity: 'error',
            taskId: task.id,
            field: 'id',
            message: `Task "${task.id}" has prefix "${extractedPrefix}" but is in phase "${phase.id}"`,
            details: { taskId: task.id, phaseId: phase.id, extractedPrefix },
          })
        }
      }
    }
  }
}

// ── Check 11: Task cycle detection (DFS gray/black coloring) ─────────────────

// Build adjacency map; skip tasks with null IDs; skip refs not in graph and self-deps
const adjMap = new Map()  // taskId → valid dependsOn[]
for (const phase of phases) {
  const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
  for (const task of tasks) {
    if (task.id == null) continue
    const validDeps = Array.isArray(task.dependsOn)
      ? task.dependsOn.filter(dep => allTaskIds.has(dep) && dep !== task.id)
      : []
    adjMap.set(task.id, validDeps)
  }
}

// Three-color DFS: WHITE = unvisited, GRAY = in progress (on current path), BLACK = done
const WHITE = 0
const GRAY  = 1
const BLACK = 2

const colors = new Map()
for (const taskId of adjMap.keys()) {
  colors.set(taskId, WHITE)
}

const detectedCycles = []

function dfsCycle(nodeId, pathStack) {
  colors.set(nodeId, GRAY)
  pathStack.push(nodeId)

  for (const dep of adjMap.get(nodeId)) {
    const color = colors.get(dep)
    if (color === GRAY) {
      // Back edge — collect all members of this cycle from the current path stack
      const cycleStart = pathStack.indexOf(dep)
      detectedCycles.push(pathStack.slice(cycleStart))
    } else if (color === WHITE) {
      dfsCycle(dep, pathStack)
    }
    // BLACK: node fully processed — no cycle through it
  }

  pathStack.pop()
  colors.set(nodeId, BLACK)
}

for (const taskId of adjMap.keys()) {
  if (colors.get(taskId) === WHITE) {
    dfsCycle(taskId, [])
  }
}

// Populate dependencies with task-level graph data
report.dependencies.taskGraph = {}
for (const [taskId, deps] of adjMap) {
  report.dependencies.taskGraph[taskId] = deps
}
report.dependencies.taskCycles = detectedCycles

// Report each detected cycle as one error entry
for (const cycleMembers of detectedCycles) {
  report.errors.push({
    category: ERRORS.TASK_CYCLE_DETECTED,
    severity: 'error',
    taskId: null,
    field: null,
    message: `Dependency cycle detected among tasks: ${cycleMembers.join(' → ')} → ${cycleMembers[0]}`,
    details: { cycleMembers },
  })
}

// ── Check 12 & 13: Phase dependency projection and cycle detection ────────────

// seenTaskIds already maps taskId → ownerPhaseId; alias for clarity
const taskToPhase = seenTaskIds  // Map<taskId, phaseId>

// All known phase IDs for existence checks (Check 12)
const phaseIdSet = new Set(phases.map(p => p.id).filter(id => id != null))

// Step 2: Compute phase-level dependsOn projection (same algorithm as wb-render.js)
// For each phase: union all task dependsOn IDs → map to owner phase → remove self → deduplicate
const phaseDeps = new Map()  // Map<phaseId, Set<phaseId>>

for (const phase of phases) {
  if (phase.id == null) continue
  const deps = new Set()
  const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
  for (const task of tasks) {
    if (!Array.isArray(task.dependsOn)) continue
    for (const refId of task.dependsOn) {
      const ownerPhase = taskToPhase.get(refId)
      if (ownerPhase == null) continue  // unresolved task dep — already reported in check 8
      if (ownerPhase === phase.id) continue  // remove self-loops (intra-phase)
      deps.add(ownerPhase)
    }
  }
  phaseDeps.set(phase.id, deps)
}

// Check 12: Phase dependency existence (defensive — should not fire if check 8 passed)
for (const [phaseId, deps] of phaseDeps) {
  for (const depPhaseId of deps) {
    if (!phaseIdSet.has(depPhaseId)) {
      report.errors.push({
        category: ERRORS.PHASE_DEPENDENCY_NOT_FOUND,
        severity: 'error',
        taskId: null,
        field: 'dependsOn',
        message: `Phase "${phaseId}" has a projected dependency on phase "${depPhaseId}" which does not exist`,
        details: { phaseId, missingPhase: depPhaseId },
      })
    }
  }
}

// Check 13: Phase cycle detection (same DFS gray/black algorithm as check 11)
const phaseColors = new Map()
for (const phaseId of phaseDeps.keys()) {
  phaseColors.set(phaseId, WHITE)
}

const detectedPhaseCycles = []

function dfsPhaseCycle(nodeId, pathStack) {
  phaseColors.set(nodeId, GRAY)
  pathStack.push(nodeId)

  for (const dep of phaseDeps.get(nodeId)) {
    const color = phaseColors.get(dep)
    if (color === GRAY) {
      const cycleStart = pathStack.indexOf(dep)
      detectedPhaseCycles.push(pathStack.slice(cycleStart))
    } else if (color === WHITE) {
      dfsPhaseCycle(dep, pathStack)
    }
  }

  pathStack.pop()
  phaseColors.set(nodeId, BLACK)
}

for (const phaseId of phaseDeps.keys()) {
  if (phaseColors.get(phaseId) === WHITE) {
    dfsPhaseCycle(phaseId, [])
  }
}

// Store phase graph in report as plain object for JSON serialization
report.dependencies.phaseGraph = {}
for (const [phaseId, deps] of phaseDeps) {
  report.dependencies.phaseGraph[phaseId] = [...deps].sort()
}
report.dependencies.phaseCycles = detectedPhaseCycles

// Report each detected phase cycle as one error entry
for (const cycleMembers of detectedPhaseCycles) {
  report.errors.push({
    category: ERRORS.PHASE_CYCLE_DETECTED,
    severity: 'error',
    taskId: null,
    field: null,
    message: `Phase dependency cycle detected: ${cycleMembers.join(' → ')} → ${cycleMembers[0]}`,
    details: { cycleMembers },
  })
}

// ── Exit code routing ────────────────────────────────────────────────────────

if (report.errors.length > 0) {
  report.valid = false
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  process.exit(1)
}

process.stdout.write(JSON.stringify(report, null, 2) + '\n')
process.exit(0)
