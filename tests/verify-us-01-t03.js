'use strict';

/**
 * US-01-T03: Schema v2 Compliance Verification
 *
 * Reads TEST-001-Work-Breakdown.json and performs 9 structural checks
 * derived from the INFRA-T02 constants in wb-validate.js — with no
 * dependency on wb-validate.js itself (runs in parallel with US-02).
 *
 * Uses only Node.js built-ins: fs, path.
 * Exit 0 = all checks pass; Exit 1 = one or more checks fail.
 */

const fs   = require('fs');
const path = require('path');

// ─── Schema v2 constants (sourced from wb-validate.js — not imported) ────────

const REQUIRED_PHASE_FIELDS = ['id', 'type', 'title', 'commit', 'tasks'];

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
];

const VALID_DOMAINS = ['BE', 'FE', 'DB', 'DevOps', 'INFRA', 'TEST'];

const VALID_AGENT_TYPES = [
  'developer-backend',
  'developer-frontend',
  'developer-testing',
  'developer-database',
  'review-solution',
];

// ─── Fixture path (resolved relative to this script file) ────────────────────

const FIXTURE_PATH = path.join(
  __dirname,
  'fixtures',
  'test-feature',
  'TEST-001-Work-Breakdown.json'
);

// ─── Report accumulators ─────────────────────────────────────────────────────

const passes   = [];
const failures = [];

function pass(label) {
  passes.push(label);
}

function fail(label, detail) {
  failures.push({ label, detail });
}

// ─── Load and parse fixture ───────────────────────────────────────────────────

let wb;
try {
  const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
  wb = JSON.parse(raw);
} catch (err) {
  console.error(`FATAL: Cannot read or parse fixture at ${FIXTURE_PATH}`);
  console.error(`       ${err.message}`);
  process.exit(2);
}

// ─── Build full task-ID index (used by checks 3, 4, 8) ───────────────────────

const allTaskIds = new Set();
for (const phase of (wb.phases || [])) {
  for (const task of (phase.tasks || [])) {
    if (task.id != null) allTaskIds.add(task.id);
  }
}

// ─── Check 1: schemaVersion === 2 ────────────────────────────────────────────

if (wb.schemaVersion === 2) {
  pass('Check 1 — schemaVersion === 2');
} else {
  fail(
    'Check 1 — schemaVersion === 2',
    `Expected 2, got: ${JSON.stringify(wb.schemaVersion)}`
  );
}

// ─── Check 2: every phase has all REQUIRED_PHASE_FIELDS ──────────────────────

{
  let ok = true;
  for (const phase of (wb.phases || [])) {
    const phaseId = phase.id ?? '(no id)';
    for (const field of REQUIRED_PHASE_FIELDS) {
      if (!(field in phase)) {
        fail(
          'Check 2 — every phase has all REQUIRED_PHASE_FIELDS',
          `Phase "${phaseId}" is missing field "${field}"`
        );
        ok = false;
      }
    }
  }
  if (ok) pass('Check 2 — every phase has all REQUIRED_PHASE_FIELDS');
}

// ─── Check 3: every task has all REQUIRED_TASK_FIELDS ────────────────────────

{
  let ok = true;
  for (const phase of (wb.phases || [])) {
    for (const task of (phase.tasks || [])) {
      const taskId = task.id ?? '(no id)';
      for (const field of REQUIRED_TASK_FIELDS) {
        if (!(field in task)) {
          fail(
            'Check 3 — every task has all REQUIRED_TASK_FIELDS',
            `Task "${taskId}" is missing field "${field}"`
          );
          ok = false;
        }
      }
    }
  }
  if (ok) pass('Check 3 — every task has all REQUIRED_TASK_FIELDS');
}

// ─── Check 4: every task.domain is in VALID_DOMAINS ──────────────────────────

{
  let ok = true;
  for (const phase of (wb.phases || [])) {
    for (const task of (phase.tasks || [])) {
      if (!VALID_DOMAINS.includes(task.domain)) {
        fail(
          'Check 4 — every task.domain is in VALID_DOMAINS',
          `Task "${task.id}" has domain "${task.domain}"; allowed: ${VALID_DOMAINS.join(', ')}`
        );
        ok = false;
      }
    }
  }
  if (ok) pass('Check 4 — every task.domain is in VALID_DOMAINS');
}

// ─── Check 5: every task.agentType is in VALID_AGENT_TYPES ───────────────────

{
  let ok = true;
  for (const phase of (wb.phases || [])) {
    for (const task of (phase.tasks || [])) {
      if (!VALID_AGENT_TYPES.includes(task.agentType)) {
        fail(
          'Check 5 — every task.agentType is in VALID_AGENT_TYPES',
          `Task "${task.id}" has agentType "${task.agentType}"; allowed: ${VALID_AGENT_TYPES.join(', ')}`
        );
        ok = false;
      }
    }
  }
  if (ok) pass('Check 5 — every task.agentType is in VALID_AGENT_TYPES');
}

// ─── Check 6: every task.estimate.agentMinutes exists and is ≤ 15 ────────────

{
  let ok = true;
  for (const phase of (wb.phases || [])) {
    for (const task of (phase.tasks || [])) {
      const minutes = task.estimate?.agentMinutes;
      if (minutes == null) {
        fail(
          'Check 6 — task.estimate.agentMinutes exists and is <= 15',
          `Task "${task.id}" is missing estimate.agentMinutes`
        );
        ok = false;
      } else if (typeof minutes !== 'number') {
        fail(
          'Check 6 — task.estimate.agentMinutes exists and is <= 15',
          `Task "${task.id}" has non-numeric estimate.agentMinutes: ${JSON.stringify(minutes)}`
        );
        ok = false;
      } else if (minutes > 15) {
        fail(
          'Check 6 — task.estimate.agentMinutes exists and is <= 15',
          `Task "${task.id}" has agentMinutes=${minutes} which exceeds the 15-minute target`
        );
        ok = false;
      }
    }
  }
  if (ok) pass('Check 6 — every task.estimate.agentMinutes exists and is <= 15');
}

// ─── Check 7: every task.verification.commands is a non-empty array ──────────

{
  let ok = true;
  for (const phase of (wb.phases || [])) {
    for (const task of (phase.tasks || [])) {
      const cmds = task.verification?.commands;
      if (!Array.isArray(cmds)) {
        fail(
          'Check 7 — task.verification.commands is a non-empty array',
          `Task "${task.id}" has verification.commands that is not an array: ${JSON.stringify(cmds)}`
        );
        ok = false;
      } else if (cmds.length === 0) {
        fail(
          'Check 7 — task.verification.commands is a non-empty array',
          `Task "${task.id}" has an empty verification.commands array`
        );
        ok = false;
      }
    }
  }
  if (ok) pass('Check 7 — every task.verification.commands is a non-empty array');
}

// ─── Check 8: no task depends on an ID not present in the JSON ───────────────

{
  let ok = true;
  for (const phase of (wb.phases || [])) {
    for (const task of (phase.tasks || [])) {
      for (const dep of (task.dependsOn || [])) {
        if (!allTaskIds.has(dep)) {
          fail(
            'Check 8 — no dangling dependsOn references',
            `Task "${task.id}" depends on "${dep}" which does not exist in the JSON`
          );
          ok = false;
        }
      }
    }
  }
  if (ok) pass('Check 8 — no dangling dependsOn references');
}

// ─── Check 9: fixture has at least one phase and one task ────────────────────
//  (sanity guard: catches a structurally empty fixture that would silently pass)

{
  const phaseCount = (wb.phases || []).length;
  const taskCount  = allTaskIds.size;
  if (phaseCount >= 1 && taskCount >= 1) {
    pass(`Check 9 — fixture is non-trivial (${phaseCount} phases, ${taskCount} tasks)`);
  } else {
    fail(
      'Check 9 — fixture is non-trivial',
      `Expected at least 1 phase and 1 task; found ${phaseCount} phase(s) and ${taskCount} task(s)`
    );
  }
}

// ─── Print report ─────────────────────────────────────────────────────────────

console.log('\n=== Schema v2 Compliance Report — TEST-001-Work-Breakdown.json ===\n');
console.log(`Fixture: ${FIXTURE_PATH}\n`);

for (const p of passes) {
  console.log(`  PASS  ${p}`);
}

if (failures.length > 0) {
  console.log('');
  for (const f of failures) {
    console.log(`  FAIL  ${f.label}`);
    console.log(`          ${f.detail}`);
  }
  console.log(`\nResult: FAIL — ${failures.length} failure(s), ${passes.length} check(s) passed\n`);
  process.exit(1);
} else {
  console.log(`\nResult: PASS — all ${passes.length} checks passed\n`);
  process.exit(0);
}
