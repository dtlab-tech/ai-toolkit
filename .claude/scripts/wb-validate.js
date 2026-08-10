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

// ── AC table parser (prerequisite for checks 19–21) ─────────────────────────

function parseAcTable(requirementsPath) {
  if (!requirementsPath) return null

  let text
  try {
    text = fs.readFileSync(path.resolve(requirementsPath), 'utf8')
  } catch (err) {
    process.stderr.write(`Error: cannot read requirements file "${requirementsPath}": ${err.message}\n`)
    process.exit(2)
  }

  const lines = text.split(/\r?\n/)

  // ── Parse UC priorities ────────────────────────────────────────────────────
  // Scan for ### UC-NN: headings, then look for | Priority | <value> | in the
  // following metadata table (stop at the next same-or-higher-level heading).
  const ucPriorityMap = new Map()
  const UC_HEADING_RE = /^###\s+(UC-\d+):/

  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i].match(UC_HEADING_RE)
    if (!headingMatch) continue
    const ucId = headingMatch[1]
    for (let j = i + 1; j < lines.length; j++) {
      if (/^#{1,3}\s/.test(lines[j])) break
      const priorityMatch = lines[j].match(/^\|\s*Priority\s*\|\s*(\S+)\s*\|/)
      if (priorityMatch) {
        ucPriorityMap.set(ucId, priorityMatch[1])
        break
      }
    }
  }

  // ── Locate ## 7. Acceptance Criteria section ──────────────────────────────
  let acSectionIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^## 7\. Acceptance Criteria\s*$/.test(lines[i])) {
      acSectionIdx = i
      break
    }
  }
  if (acSectionIdx === -1) {
    process.stderr.write('Error: requirements file is missing the "## 7. Acceptance Criteria" section\n')
    process.exit(2)
  }

  // ── Find the first Markdown table (header row containing | ID |) ──────────
  let tableHeaderIdx = -1
  for (let i = acSectionIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break
    if (/\|\s*ID\s*\|/.test(lines[i])) {
      tableHeaderIdx = i
      break
    }
  }
  if (tableHeaderIdx === -1) {
    process.stderr.write('Error: no AC table found after "## 7. Acceptance Criteria" (expected a header row containing "| ID |")\n')
    process.exit(2)
  }

  // ── Validate column headers ────────────────────────────────────────────────
  const headerCells = lines[tableHeaderIdx].split('|').slice(1, -1).map(c => c.trim())
  if (headerCells.length < 3) {
    process.stderr.write('Error: AC table header has fewer than 3 columns\n')
    process.exit(2)
  }
  if (headerCells[0] !== 'ID' || headerCells[1] !== 'Criterion' || headerCells[2] !== 'Related UC') {
    process.stderr.write(`Error: AC table columns must be "ID", "Criterion", "Related UC" in order; got "${headerCells[0]}", "${headerCells[1]}", "${headerCells[2]}"\n`)
    process.exit(2)
  }

  // ── Parse data rows ────────────────────────────────────────────────────────
  const PRIORITY_ORDER = ['Must', 'Should', 'Could']
  const UC_REF_RE = /^UC-\d+$/
  const acMap = new Map()

  for (let i = tableHeaderIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^##\s/.test(line)) break
    if (!line.trim().startsWith('|')) break

    // Skip separator rows: every cell is only dashes, colons, or spaces
    const rawCells = line.split('|').slice(1, -1)
    if (rawCells.every(c => /^[\s\-:]+$/.test(c))) continue

    const cells = rawCells.map(c => c.trim())
    if (cells.length < 3) continue

    const acId = cells[0]
    const relatedUcRaw = cells[2]

    if (!acId) continue

    if (acMap.has(acId)) {
      process.stderr.write(`Error: duplicate AC ID "${acId}" in AC table\n`)
      process.exit(2)
    }

    let unscoped = false
    let allowedUserStories = []
    let acPriority

    if (relatedUcRaw.trim().toLowerCase() === 'all ucs') {
      unscoped = true
      allowedUserStories = []
      // Derive strongest priority from all known UCs
      acPriority = [...ucPriorityMap.values()].reduce((best, p) => {
        const bestIdx = PRIORITY_ORDER.indexOf(best)
        const pIdx = PRIORITY_ORDER.indexOf(p)
        return pIdx !== -1 && pIdx < bestIdx ? p : best
      }, 'Could')
    } else {
      const ucTokens = relatedUcRaw.split(',').map(t => t.trim())

      for (const token of ucTokens) {
        if (!UC_REF_RE.test(token)) {
          process.stderr.write(`Error: malformed UC reference "${token}" in AC "${acId}" Related UC field\n`)
          process.exit(2)
        }
      }

      for (const ucRef of ucTokens) {
        if (!ucPriorityMap.has(ucRef)) {
          process.stderr.write(`Error: AC "${acId}" references UC "${ucRef}" which does not exist in the requirements\n`)
          process.exit(1)
        }
        if (!ucPriorityMap.get(ucRef)) {
          process.stderr.write(`Error: ${ucRef} has no declared priority\n`)
          process.exit(1)
        }
        allowedUserStories.push(ucRef.replace('UC-', 'US-'))
      }

      acPriority = ucTokens.reduce((best, ucRef) => {
        const p = ucPriorityMap.get(ucRef)
        const bestIdx = PRIORITY_ORDER.indexOf(best)
        const pIdx = PRIORITY_ORDER.indexOf(p)
        return pIdx !== -1 && pIdx < bestIdx ? p : best
      }, 'Could')
    }

    acMap.set(acId, { id: acId, priority: acPriority, allowedUserStories, unscoped })
  }

  return acMap
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

// ── Check 14: Phase schedulability (buildWaves) ──────────────────────────────

const buildWavesDone = new Set()
const phaseWaves = []
let phaseRemaining = phases.map(p => p.id).filter(id => id != null)
while (phaseRemaining.length > 0) {
  const ready = phaseRemaining.filter(id => [...(phaseDeps.get(id) || [])].every(d => buildWavesDone.has(d)))
  if (ready.length === 0) break  // deadlock — unschedulable phases remain
  ready.forEach(id => buildWavesDone.add(id))
  phaseWaves.push(ready)
  phaseRemaining = phaseRemaining.filter(id => !buildWavesDone.has(id))
}

report.dependencies.phaseWaves = phaseWaves
report.dependencies.phaseUnschedulable = phaseRemaining

for (const phaseId of phaseRemaining) {
  report.errors.push({
    category: ERRORS.PHASE_UNSCHEDULABLE,
    severity: 'error',
    taskId: null,
    phaseId,
    field: null,
    message: `Phase "${phaseId}" cannot be scheduled: all predecessor phases are unschedulable or form a deadlock`,
    details: { phaseId },
  })
}

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

// ── AC table parsing (prerequisite for checks 19–21) ─────────────────────────

const acMap = parseAcTable(requirementsPath)

// ── Checks 19 & 20: AC existence and scope validation ────────────────────────

if (acMap !== null) {
  for (const phase of phases) {
    const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
    for (const task of tasks) {
      if (!Array.isArray(task.acceptanceCriteria)) continue
      for (const acId of task.acceptanceCriteria) {
        const acEntry = acMap.get(acId)

        // ── Check 19: AC existence ───────────────────────────────────────────
        if (acEntry === undefined) {
          report.errors.push({
            category: ERRORS.AC_NOT_FOUND,
            severity: 'error',
            taskId: task.id,
            field: 'acceptanceCriteria',
            message: `Task "${task.id}" references AC "${acId}" which does not exist in the Requirements AC table`,
            details: { taskId: task.id, acId },
          })
          continue
        }

        // ── Check 20: AC scope validation ────────────────────────────────────
        if (acEntry.unscoped === true) continue
        const phaseId = seenTaskIds.get(task.id)
        if (!acEntry.allowedUserStories.includes(phaseId)) {
          report.errors.push({
            category: ERRORS.AC_WRONG_US,
            severity: 'error',
            taskId: task.id,
            field: 'acceptanceCriteria',
            message: `Task "${task.id}" (in phase "${phaseId}") references AC "${acId}" which is scoped to ${JSON.stringify(acEntry.allowedUserStories)}, not this phase`,
            details: { taskId: task.id, phaseId, acId, allowedUserStories: acEntry.allowedUserStories },
          })
        }
      }
    }
  }
}

// ── Check 21: Must AC coverage ───────────────────────────────────────────────

if (acMap !== null) {
  const coveredAcIds = new Set()
  for (const phase of phases) {
    const tasks = Array.isArray(phase.tasks) ? phase.tasks : []
    for (const task of tasks) {
      if (!Array.isArray(task.acceptanceCriteria)) continue
      for (const acId of task.acceptanceCriteria) {
        coveredAcIds.add(acId)
      }
    }
  }

  for (const [acId, acEntry] of acMap) {
    if (acEntry.priority === 'Must' && !coveredAcIds.has(acId)) {
      report.errors.push({
        category: ERRORS.MUST_AC_UNCOVERED,
        severity: 'error',
        taskId: null,
        field: null,
        message: `AC "${acId}" has Must priority but is not covered by any task's acceptanceCriteria`,
        details: { acId, priority: 'Must' },
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
